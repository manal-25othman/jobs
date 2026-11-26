import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  DomainError, GITHUB_ALLOWED_PERMISSIONS, GIT_COUNTS_NOT_PROOF_AR, asUntrustedRepoText, assertPinMatchesPullRequest, assertReadOnlyPermissions,
  assertRepositoryUsable, assertSourcePin, assertSubmittedFiles, observeGitWorkflow, snapshotHash, DEFAULT_R2_LIMITS,
  type GitHubLinkState, type SubmittedFile,
} from '@naqla/domain';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { GITHUB_PORT, type GitHubPort } from './github.port';
import { TestRunService } from './test-run.service';
import { SubmissionService, type SubmissionArtifactInput } from '../slice1/submission.service';
import { UploadService } from '../slice1/upload.service';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';

const UUID = /^[0-9a-f-]{36}$/i;
const SHA = /^[0-9a-f]{40}$/;

export function githubMode(): 'off' | 'simulated' {
  const m = process.env['GITHUB_MODE'];
  return m === 'simulated' && process.env['NODE_ENV'] !== 'production' ? 'simulated' : 'off';
}

/**
 * GitHub as the source of submitted code (Phase C round 2, item 1). The graduate links GitHub by installing the
 * platform's App on the repositories THEY select; only those are read, only with read permissions, and nothing is
 * stored but the link, the selection and the pinned commit. Tokens are short-lived and never persisted (port contract).
 * Today only the simulated TEST double exists (GITHUB_MODE=simulated, refused in production).
 */
@Injectable()
export class GitHubService {
  constructor(private readonly db: DbService, @Inject(GITHUB_PORT) private readonly gh: GitHubPort, private readonly runs: TestRunService,
    private readonly submissions: SubmissionService, private readonly uploads: UploadService, @Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  private requireOn(): void {
    if (githubMode() === 'off') throw new ServiceUnavailableException('[github_off] ربط GitHub غير مفعَّل في هذه البيئة.');
  }

  private async liveLink(c: PoolClient, userId: string) {
    const l = (await c.query(`select id, github_login, installation_id from github_link where user_id = $1 and status = 'connected'`, [userId])).rows[0];
    if (!l) return null;
    const repos = (await c.query(`select repo_id, full_name, owner_login, is_private from github_link_repo where link_id = $1 and removed_at is null order by full_name`, [l.id])).rows;
    const state: GitHubLinkState = { status: 'connected', githubLogin: String(l.github_login), selected: repos.map((r) => ({ repoId: Number(r.repo_id), fullName: String(r.full_name), ownerLogin: String(r.owner_login), private: r.is_private === true })) };
    return { id: String(l.id), installationId: Number(l.installation_id), state };
  }

  async status(userId: string) {
    const mode = githubMode();
    if (mode === 'off') return { mode, linked: false, permissions: GITHUB_ALLOWED_PERMISSIONS };
    return this.db.asService(async (c) => {
      const l = await this.liveLink(c, userId);
      return {
        mode, simulatedNoticeAr: 'وضع محاكاة للتجربة الداخلية: مستودعات اصطناعية، ولا اتصال بـGitHub.',
        linked: l !== null, login: l?.state.githubLogin ?? null, permissions: GITHUB_ALLOWED_PERMISSIONS,
        permissionsAr: ['قراءة محتوى المستودعات التي تختارينها', 'قراءة البيانات الوصفية', 'قراءة طلبات الدمج'],
        neverAr: ['لا كتابة ولا حذف ولا دمج', 'لا وصول لمستودعات لم تختاريها', 'لا حفظ لرموز الوصول'],
        repositories: l?.state.selected.map((r) => ({ repoId: r.repoId, fullName: r.fullName, private: r.private })) ?? [],
      };
    });
  }

  /** Simulated install-and-select flow: the graduate picks repositories on "GitHub", the platform records the grant. */
  async connectSimulated(userId: string, body: { login?: unknown; repositories?: unknown }) {
    this.requireOn();
    const login = String(body?.login ?? '');
    const picked = Array.isArray(body?.repositories) ? body.repositories.map(String).slice(0, 20) : [];
    if (picked.length === 0) throw new BadRequestException('[github_select] اختاري مستودعًا واحدًا على الأقل.');
    let grant;
    try { grant = await this.gh.completeInstallation({ code: 'simulated', installationId: randomInt(1, 2 ** 31), requestedLogin: login, selectRepositories: picked }); }
    catch (e) { throw new BadRequestException(String((e as Error).message)); }
    assertReadOnlyPermissions(grant.permissions);
    return this.db.asService(async (c) => {
      if (await this.liveLink(c, userId)) throw new ConflictException('[github_already_linked] حسابك مرتبط بالفعل. ألغي الربط أولًا لربط حساب آخر.');
      const link = (await c.query(`insert into github_link (user_id, github_user_id, github_login, installation_id) values ($1,$2,$3,$4) returning id`,
        [userId, grant.githubUserId, grant.login, grant.installationId])).rows[0];
      for (const r of grant.repositories) {
        await c.query(`insert into github_link_repo (link_id, repo_id, full_name, owner_login, is_private) values ($1,$2,$3,$4,$5)`, [link.id, r.repoId, r.fullName, r.ownerLogin, r.private]);
      }
      await emitAuditEvent(c, { eventType: 'github.linked', userId, actorKind: 'user', actorId: userId, subjectTable: 'github_link', subjectId: link.id,
        reason: 'graduate installed the platform GitHub App on selected repositories (simulated); read-only permissions verified',
        payload: { mode: 'simulated', repositories: grant.repositories.map((r) => r.fullName), permissions: grant.permissions } });
      return { linked: true, repositories: grant.repositories.map((r) => ({ repoId: r.repoId, fullName: r.fullName, private: r.private })) };
    });
  }

  private async revoke(c: PoolClient, linkId: string, userId: string, reason: 'user_unlinked' | 'app_uninstalled' | 'authorization_revoked' | 'suspended') {
    await c.query(`update github_link_repo set removed_at = now() where link_id = $1 and removed_at is null`, [linkId]);
    await c.query(`update github_link set status = 'revoked', revoked_at = now(), revoke_reason = $2 where id = $1`, [linkId, reason]);
    await emitAuditEvent(c, { eventType: 'github.revoked', userId, actorKind: reason === 'user_unlinked' ? 'user' : 'system', actorId: reason === 'user_unlinked' ? userId : null,
      subjectTable: 'github_link', subjectId: linkId, reason: `GitHub access withdrawn (${reason}); pinned evidence and test runs stay as history, no further reads`, payload: { reason } });
  }

  async unlink(userId: string) {
    this.requireOn();
    return this.db.asService(async (c) => {
      const l = await this.liveLink(c, userId);
      if (!l) throw new NotFoundException('[github_not_linked] لا يوجد ربط قائم.');
      await this.revoke(c, l.id, userId, 'user_unlinked');
      return { linked: false, noticeAr: 'أُلغي الربط. لإزالة التطبيق من GitHub نفسه افتحي إعدادات التطبيقات المثبّتة في حسابك على GitHub.' };
    });
  }

  /** Commits of a selected repository (for choosing what to submit). Repository text is returned as untrusted data. */
  async commits(userId: string, repoId: number, head: string | undefined) {
    this.requireOn();
    const l = await this.db.asService((c) => this.liveLink(c, userId));
    const repo = assertRepositoryUsable(l?.state ?? null, repoId);
    const pr = await this.gh.getPullRequest(l!.installationId, repo.fullName, 1);
    const headSha = head && SHA.test(head) ? head : pr?.headSha;
    if (!headSha) return { repository: repo.fullName, commits: [], pullRequests: [] };
    const commits = await this.gh.listCommits(l!.installationId, repo.fullName, headSha, 50);
    return {
      repository: repo.fullName,
      commits: commits.map((c) => ({ sha: c.sha, message: asUntrustedRepoText('commit.message', c.message, 200).text })),
      pullRequests: pr ? [{ number: pr.number, title: asUntrustedRepoText('pr.title', pr.title, 200).text, headSha: pr.headSha, headRef: pr.headRef, state: pr.state }] : [],
    };
  }

  /**
   * Pins a submission to one commit of a selected repository (and its PR, when given): checks the selection and
   * ownership, that the commit exists there, that the PR head IS that commit; fetches the snapshot, hashes it and
   * records the pin (immutable). Then the R2 shadow run, when enabled.
   */
  /** Checks selection, ownership, commit and PR head, then fetches and hashes the snapshot. Records nothing. */
  private async resolveSource(userId: string, body: { repoId?: unknown; commitSha?: unknown; pullRequestNumber?: unknown }) {
    const link = await this.db.asService((c) => this.liveLink(c, userId));
    const repo = assertRepositoryUsable(link?.state ?? null, Number(body?.repoId));
    const pin = assertSourcePin({ repoId: repo.repoId, fullName: repo.fullName, commitSha: String(body?.commitSha ?? ''),
      pullRequestNumber: body?.pullRequestNumber == null ? null : Number(body.pullRequestNumber), branch: null });
    const inst = link!.installationId;
    const commit = await this.gh.getCommit(inst, repo.fullName, pin.commitSha);
    if (!commit) throw new DomainError('[github_commit_not_found] هذا الإيداع غير موجود في المستودع المختار.');
    let branch: string | null = null;
    let pr = null;
    if (pin.pullRequestNumber !== null) {
      pr = await this.gh.getPullRequest(inst, repo.fullName, pin.pullRequestNumber);
      if (!pr) throw new DomainError('[github_pr_not_found] طلب الدمج غير موجود في المستودع المختار.');
      assertPinMatchesPullRequest(pin, pr);
      branch = pr.headRef;
    }
    const raw = await this.gh.snapshot(inst, repo.fullName, pin.commitSha);
    const files: SubmittedFile[] = raw.filter((f) => /^(?!.*(^|\/)\.)[A-Za-z0-9_\-./]{1,160}\.(html|css|js|mjs|json|md|txt|svg)$/i.test(f.path));
    assertSubmittedFiles(files, DEFAULT_R2_LIMITS);
    const hash = snapshotHash(files);
    const history = await this.gh.listCommits(inst, repo.fullName, pin.commitSha, 100);
    const git = observeGitWorkflow(history, pr, 'main');
    const injection = [pr ? asUntrustedRepoText('pr.body', pr.body) : null, ...history.map((h) => asUntrustedRepoText('commit.message', h.message))].some((t) => t?.injectionSuspected);
    return { repo, pin, branch, files, hash, git, injection };
  }

  private async record(userId: string, submissionId: string, slug: string | null, src: Awaited<ReturnType<GitHubService['resolveSource']>>) {
    const { repo, pin, branch, files, hash, git, injection } = src;
    const source = await this.db.asService(async (c) => {
      const r = (await c.query(`insert into submission_source (submission_id, user_id, repo_id, full_name, commit_sha, pull_request_number, branch, snapshot_hash) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [submissionId, userId, repo.repoId, repo.fullName, pin.commitSha, pin.pullRequestNumber, branch, hash])).rows[0];
      await emitAuditEvent(c, { eventType: 'submission.source_pinned', userId, actorKind: 'user', actorId: userId, subjectTable: 'submission_source', subjectId: r.id,
        reason: 'submission pinned to one commit of a selected repository; snapshot hashed', payload: { repo: repo.fullName, commitSha: pin.commitSha, pullRequest: pin.pullRequestNumber, snapshotHash: hash, files: files.length, injectionSuspected: injection } });
      return { id: String(r.id) };
    });
    const run = slug ? await this.runs.runForSubmission(userId, submissionId, slug, files, pin.commitSha) : null;
    return {
      submissionId, sourceId: source.id, repository: repo.fullName, commitSha: pin.commitSha, pullRequestNumber: pin.pullRequestNumber, branch, snapshotHash: hash, files: files.length,
      git: { ...git, noticeAr: GIT_COUNTS_NOT_PROOF_AR }, injectionSuspected: injection, testRun: run,
    };
  }

  /**
   * Pins an existing submission to one commit of a selected repository (and its PR, when given): checks the selection
   * and ownership, that the commit exists there, that the PR head IS that commit; fetches the snapshot, hashes it and
   * records the pin (immutable). Then the R2 shadow run, when enabled.
   */
  async pin(userId: string, submissionId: string, body: { repoId?: unknown; commitSha?: unknown; pullRequestNumber?: unknown }) {
    this.requireOn();
    if (!UUID.test(submissionId)) throw new NotFoundException('submission not found');
    const slug = await this.db.asService(async (c) => {
      const s = (await c.query(`select s.id, s.user_id, a.slug from submission s join project p on p.id = s.project_id left join activity_spec a on a.id = p.activity_spec_id where s.id = $1`, [submissionId])).rows[0];
      if (!s || s.user_id !== userId) throw new NotFoundException('submission not found');
      if ((await c.query(`select 1 from submission_source where submission_id = $1`, [submissionId])).rowCount) throw new ConflictException('[github_pin_exists] هذا التسليم مثبَّت على إيداع بالفعل. أعيدي التسليم لتثبيت إيداع آخر.');
      return s.slug ? String(s.slug) : null;
    });
    return this.record(userId, submissionId, slug, await this.resolveSource(userId, body));
  }

  /**
   * Submits DIRECTLY from the repository: the files of the pinned commit become the activity's file deliverables
   * (matched by name: `index.html` → `file.index_html`), the PR link and head SHA are added, the normal submission
   * rules apply unchanged, and the submission is pinned to that commit.
   */
  async submitFromGitHub(userId: string, projectId: string, body: { repoId?: unknown; commitSha?: unknown; pullRequestNumber?: unknown; skillIds?: unknown; artifacts?: unknown; aiDisclosure?: unknown }) {
    this.requireOn();
    if (!UUID.test(projectId)) throw new NotFoundException('project not found');
    const meta = await this.db.asService(async (c) => {
      const p = (await c.query(`select p.user_id, p.activity_spec_id, a.slug from project p left join activity_spec a on a.id = p.activity_spec_id where p.id = $1 and p.deleted_at is null`, [projectId])).rows[0];
      if (!p || p.user_id !== userId) throw new NotFoundException('project not found');
      const deliverables = (await c.query(`select key, format from activity_deliverable where activity_spec_id = $1 order by position`, [p.activity_spec_id])).rows as { key: string; format: string }[];
      return { slug: p.slug ? String(p.slug) : null, deliverables };
    });
    const src = await this.resolveSource(userId, body);
    const fileKeys = meta.deliverables.filter((d) => d.key.startsWith('file.') && /file/.test(d.format)).map((d) => d.key);
    const mapped: { uploadId: string; deliverableKey: string }[] = [];
    for (const key of fileKeys) {
      const name = key.replace(/^file\./, '').replace(/_(?=[a-z0-9]+$)/, '.');
      const f = src.files.find((x) => x.path === name);
      if (!f) continue;
      const bytes = new TextEncoder().encode(f.content);
      const type = name.endsWith('.js') ? 'text/javascript' : 'text/plain'; // the evidence upload allowlist (uploads.ts) is unchanged
      const intent = await this.uploads.createIntent(userId, { declaredName: name, contentType: type, declaredSize: bytes.byteLength });
      const obj = await this.db.asService(async (c) => (await c.query(`select bucket, object_path from upload where id = $1`, [intent.uploadId])).rows[0]);
      await this.storage.putObject(String(obj.bucket), String(obj.object_path), bytes, type);
      await this.uploads.confirm(userId, intent.uploadId);
      mapped.push({ uploadId: intent.uploadId, deliverableKey: key });
    }
    const artifacts = [...(Array.isArray(body?.artifacts) ? body.artifacts as SubmissionArtifactInput[] : []), { key: 'text.head_sha', kind: 'text' as const, valueText: src.pin.commitSha, locator: `${src.repo.fullName}@${src.pin.commitSha.slice(0, 12)}` }];
    const prUrl = src.pin.pullRequestNumber !== null ? `https://github.com/${src.repo.fullName}/pull/${src.pin.pullRequestNumber}` : null;
    const created = await this.submissions.createSubmission(userId, projectId, {
      skillIds: Array.isArray(body?.skillIds) ? body.skillIds.map(String) : [], artifacts, files: mapped,
      ...(prUrl ? { externalUrls: [prUrl] } : {}), repositoryUrl: `https://github.com/${src.repo.fullName}`,
      aiDisclosure: (body?.aiDisclosure ?? { declaredUse: [] }) as Parameters<SubmissionService['createSubmission']>[2]['aiDisclosure'],
    });
    return this.record(userId, String((created as { id: string }).id), meta.slug, src);
  }

  /** GitHub webhook: verified signature, de-duplicated delivery, then revocations only (the platform never writes). */
  async webhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer | undefined, body: Record<string, unknown>) {
    this.requireOn();
    const secret = process.env['GITHUB_WEBHOOK_SECRET'] ?? '';
    const sig = String(headers['x-hub-signature-256'] ?? '');
    if (!rawBody || secret.length < 32 || !verifySignature(secret, rawBody, sig)) throw new UnauthorizedException('[github_webhook_signature] invalid signature');
    const delivery = String(headers['x-github-delivery'] ?? '');
    const event = String(headers['x-github-event'] ?? '');
    if (!/^[A-Za-z0-9-]{8,80}$/.test(delivery)) throw new BadRequestException('[github_webhook_delivery] missing delivery id');
    return this.db.asService(async (c) => {
      const fresh = await c.query(`insert into github_webhook_delivery (delivery_id, event) values ($1, $2) on conflict do nothing returning delivery_id`, [delivery, event.slice(0, 60) || 'unknown']);
      if (!fresh.rowCount) return { handled: false, reason: 'duplicate delivery' };
      const action = String(body?.['action'] ?? '');
      const installationId = Number((body?.['installation'] as { id?: unknown } | undefined)?.id ?? 0);
      const links = installationId > 0 ? (await c.query(`select id, user_id from github_link where installation_id = $1 and status = 'connected'`, [installationId])).rows : [];
      if (event === 'installation' && (action === 'deleted' || action === 'suspend')) {
        for (const l of links) await this.revoke(c, String(l.id), String(l.user_id), action === 'deleted' ? 'app_uninstalled' : 'suspended');
        return { handled: true, revoked: links.length };
      }
      if (event === 'installation_repositories' && action === 'removed') {
        const removed = ((body?.['repositories_removed'] as { id?: unknown }[] | undefined) ?? []).map((r) => Number(r.id)).filter((n) => n > 0);
        let n = 0;
        for (const l of links) n += (await c.query(`update github_link_repo set removed_at = now() where link_id = $1 and repo_id = any($2::bigint[]) and removed_at is null`, [l.id, removed])).rowCount ?? 0;
        for (const l of links) await emitAuditEvent(c, { eventType: 'github.repositories_removed', userId: String(l.user_id), actorKind: 'system', subjectTable: 'github_link', subjectId: String(l.id), reason: 'repositories removed from the installation on GitHub; they are no longer read', payload: { removed } });
        return { handled: true, removed: n };
      }
      if (event === 'github_app_authorization' && action === 'revoked') {
        const ghUser = Number((body?.['sender'] as { id?: unknown } | undefined)?.id ?? 0);
        const byUser = ghUser > 0 ? (await c.query(`select id, user_id from github_link where github_user_id = $1 and status = 'connected'`, [ghUser])).rows : [];
        for (const l of byUser) await this.revoke(c, String(l.id), String(l.user_id), 'authorization_revoked');
        return { handled: true, revoked: byUser.length };
      }
      return { handled: false, reason: 'event not used' };
    });
  }

  /** Attempts of one project, with their pin and test summary — the graduate's own history. */
  async attempts(userId: string, projectId: string) {
    if (!UUID.test(projectId)) throw new NotFoundException('project not found');
    return this.db.asService(async (c) => {
      const p = (await c.query(`select user_id from project where id = $1`, [projectId])).rows[0];
      if (!p || p.user_id !== userId) throw new NotFoundException('project not found');
      const rows = (await c.query(`select s.id, s.state, s.created_at, ss.full_name, ss.commit_sha, ss.pull_request_number,
          (select json_build_object('status', t.status, 'result', t.result, 'packStatus', t.pack_status) from test_run t where t.submission_id = s.id order by t.created_at desc limit 1) as run
        from submission s left join submission_source ss on ss.submission_id = s.id where s.project_id = $1 order by s.created_at`, [projectId])).rows;
      return rows.map((r, i) => {
        const tests = (r.run?.result?.tests ?? []) as { outcome: string; mode: string }[];
        const auto = tests.filter((t) => t.mode === 'automated');
        return { attempt: i + 1, submissionId: String(r.id), state: String(r.state), createdAt: new Date(r.created_at).toISOString(),
          source: r.commit_sha ? { repository: String(r.full_name), commitSha: String(r.commit_sha), pullRequestNumber: r.pull_request_number } : null,
          tests: r.run ? { status: String(r.run.status), automatedPassed: auto.filter((t) => t.outcome === 'pass').length, automatedTotal: auto.length } : null };
      });
    });
  }
}

export function verifySignature(secret: string, rawBody: Buffer, header: string): boolean {
  const m = /^sha256=([0-9a-f]{64})$/.exec(header);
  if (!m) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const got = Buffer.from(m[1]!, 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

