/**
 * The REAL GitHub App adapter for GitHubPort (mode 'app'). Read-only by construction:
 *  - every repository call mints an installation token scoped to ONE repository and to read-only permissions
 *    (contents, metadata, pull_requests); tokens live in memory only, until `expires_at` minus 60 s, and are never
 *    logged, persisted or put into an error message;
 *  - the user OAuth token from the install callback is used only to prove that the installation belongs to the user,
 *    then dropped;
 *  - errors carry an operation label and an HTTP status, never a URL query, response body, token or secret.
 *
 * Facts come from docs/ops/research/GITHUB-APP-INTEGRATION-RESEARCH.md. Anything not quoted there is marked
 * UNVERIFIED below and kept configurable or defensive. Tested only against a local mock server
 * (github-app.adapter.spec.ts); it has never called api.github.com.
 */
import { createSign } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import type { CommitShape, SubmittedFile } from '@naqla/domain';
import type { GitHubPort, GitHubRepoInfo, InstallationGrant, PullRequestInfo } from './github.port';

/* ───────────────────────────── configuration ───────────────────────────── */

export interface SnapshotLimits {
  /** Kept files (after filtering). Over → the snapshot is refused. */
  readonly maxFiles: number;
  /** Sum of kept file sizes. */
  readonly maxTotalBytes: number;
  /** One kept file. */
  readonly maxFileBytes: number;
  /** The gzip archive as downloaded (it also holds files that are filtered out, e.g. images). */
  readonly maxArchiveBytes: number;
  /** The archive after gunzip. */
  readonly maxUnpackedBytes: number;
}

export const DEFAULT_SNAPSHOT_LIMITS: SnapshotLimits = {
  maxFiles: 200, maxTotalBytes: 2 * 1024 * 1024, maxFileBytes: 512 * 1024,
  maxArchiveBytes: 25 * 1024 * 1024, maxUnpackedBytes: 100 * 1024 * 1024,
};

export interface GitHubAppAdapterConfig {
  /** The App ID (numeric, shown on the App's settings page). Used as the JWT `iss`. */
  readonly appId: string | number;
  /** The App private key, PEM (PKCS#1 "BEGIN RSA PRIVATE KEY" as GitHub issues it, or PKCS#8). */
  readonly privateKeyPem: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly apiBase?: string;
  readonly webBase?: string;
  readonly fetch?: typeof fetch;
  /** Per-request timeout. Default 15 s. */
  readonly timeoutMs?: number;
  /** Clock in ms (tests). Default Date.now. */
  readonly now?: () => number;
  readonly snapshotLimits?: Partial<SnapshotLimits>;
  /** UNVERIFIED (not in the research): GitHub's REST API version header value. */
  readonly apiVersion?: string;
  readonly userAgent?: string;
}

/** The only permissions an installation token is ever requested with (mirrors GITHUB_ALLOWED_PERMISSIONS). */
export const INSTALLATION_TOKEN_PERMISSIONS = Object.freeze({ contents: 'read', metadata: 'read', pull_requests: 'read' } as const);
/**
 * Listing the installation's repositories cannot be scoped to one repository, so that token gets metadata:read only.
 * UNVERIFIED: that metadata:read is sufficient for GET /installation/repositories (the research does not quote it).
 */
export const LIST_REPOS_TOKEN_PERMISSIONS = Object.freeze({ metadata: 'read' } as const);

const FULL_NAME_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const REPO_CAP = 100;

/* ───────────────────────────── errors ───────────────────────────── */

/** An HTTP failure from GitHub. The message holds the operation and status only (redacted by construction). */
export class GitHubHttpError extends Error {
  constructor(readonly operation: string, readonly status: number) {
    super(`[github_http] GitHub answered ${status} for ${operation}.`);
    this.name = 'GitHubHttpError';
  }
}

/** The installation cannot mint a token for this repository (removed from the installation, or never in it). */
class RepoNotAccessible extends Error {
  constructor() { super('[github_repo_not_accessible] The repository is not accessible to this installation.'); }
}

/* ───────────────────────────── helpers ───────────────────────────── */

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function splitFullName(fullName: string): { owner: string; repo: string } {
  if (!FULL_NAME_RE.test(fullName)) throw new Error('[github_repo] Unexpected repository name.');
  const [owner, repo] = fullName.split('/') as [string, string];
  return { owner, repo };
}

function requirePositiveInt(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`[github_input] Invalid ${what}.`);
}

/* ───────────────────────────── the adapter ───────────────────────────── */

export class GitHubAppAdapter implements GitHubPort {
  readonly mode = 'app' as const;
  private readonly apiBase: string;
  private readonly webBase: string;
  private readonly http: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly limits: SnapshotLimits;
  /** In-memory only. Key: `${installationId}:${repoName}` or `${installationId}:*list*`. */
  private readonly tokens = new Map<string, { token: string; reuseUntilMs: number }>();
  // Secrets are held in private fields and never rendered (see toJSON / inspect below).
  readonly #privateKeyPem: string;
  readonly #clientSecret: string;
  private readonly appId: string;
  private readonly clientId: string;
  private readonly apiVersion: string;
  private readonly userAgent: string;

  constructor(cfg: GitHubAppAdapterConfig) {
    const appId = String(cfg.appId ?? '').trim();
    if (!/^\d{1,12}$/.test(appId)) throw new Error('[github_app_config] GITHUB_APP_ID must be the numeric App ID.');
    if (typeof cfg.privateKeyPem !== 'string' || !/-----BEGIN (RSA )?PRIVATE KEY-----/.test(cfg.privateKeyPem)) throw new Error('[github_app_config] GITHUB_APP_PRIVATE_KEY must be a PEM private key.');
    if (!cfg.clientId || !cfg.clientSecret) throw new Error('[github_app_config] GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET are required.');
    this.appId = appId;
    this.#privateKeyPem = cfg.privateKeyPem;
    this.clientId = cfg.clientId;
    this.#clientSecret = cfg.clientSecret;
    this.apiBase = (cfg.apiBase ?? 'https://api.github.com').replace(/\/+$/, '');
    this.webBase = (cfg.webBase ?? 'https://github.com').replace(/\/+$/, '');
    this.http = cfg.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = cfg.now ?? Date.now;
    this.timeoutMs = cfg.timeoutMs ?? 15_000;
    this.limits = { ...DEFAULT_SNAPSHOT_LIMITS, ...(cfg.snapshotLimits ?? {}) };
    this.apiVersion = cfg.apiVersion ?? '2022-11-28';
    this.userAgent = cfg.userAgent ?? 'naqla-github-app';
    // Fail fast on an unusable key, without echoing it.
    try { this.appJwt(); } catch { throw new Error('[github_app_config] GITHUB_APP_PRIVATE_KEY could not sign a JWT.'); }
  }

  toJSON() { return { mode: this.mode, appId: this.appId, apiBase: this.apiBase }; }
  [Symbol.for('nodejs.util.inspect.custom')]() { return `GitHubAppAdapter(${this.appId})`; }

  /* ── App JWT (RS256) ──
   * UNVERIFIED (not quoted in the research): the claim set iat/exp/iss, the 10-minute maximum lifetime and the
   * advice to back-date iat by 60 s for clock drift. iat = now-60, exp = now+540 keeps the total at exactly 10 min. */
  appJwt(): string {
    const nowSec = Math.floor(this.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ iat: nowSec - 60, exp: nowSec + 540, iss: this.appId }));
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    return `${header}.${payload}.${b64url(signer.sign(this.#privateKeyPem))}`;
  }

  /* ── HTTP ── */

  private headers(auth: string | null, extra: Record<string, string> = {}): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json', 'User-Agent': this.userAgent, 'X-GitHub-Api-Version': this.apiVersion,
      ...(auth ? { Authorization: auth } : {}), ...extra,
    };
  }

  private async send(operation: string, url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.http(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      // The underlying error may echo the URL or headers; drop it.
      throw new Error(`[github_unreachable] GitHub could not be reached for ${operation}.`);
    }
  }

  private async json<T>(operation: string, res: Response): Promise<T> {
    try { return (await res.json()) as T; } catch { throw new Error(`[github_http] Unexpected response body for ${operation}.`); }
  }

  /** GET with an installation token for one repository. 404 → null (the caller decides what "absent" means). */
  private async repoGet<T>(operation: string, installationId: number, fullName: string, path: string): Promise<T | null> {
    const { repo } = splitFullName(fullName);
    const token = await this.installationToken(installationId, repo);
    const res = await this.send(operation, `${this.apiBase}${path}`, { method: 'GET', headers: this.headers(`Bearer ${token}`), redirect: 'manual' });
    if (res.status === 404) { await res.body?.cancel(); return null; }
    if (!res.ok) { await res.body?.cancel(); throw new GitHubHttpError(operation, res.status); }
    return this.json<T>(operation, res);
  }

  /* ── installation tokens ── */

  /**
   * POST /app/installations/{id}/access_tokens with the App JWT, body { repositories: [name], permissions } (research
   * Q4: tokens can be narrowed to listed repositories and a subset of permissions; they expire after 1 hour).
   * `repoName === null` is the listing token (all repositories of the installation, metadata:read only).
   */
  private async installationToken(installationId: number, repoName: string | null): Promise<string> {
    requirePositiveInt(installationId, 'installation id');
    const key = `${installationId}:${repoName ?? '*list*'}`;
    const cached = this.tokens.get(key);
    if (cached && this.now() < cached.reuseUntilMs) return cached.token;
    this.tokens.delete(key);
    const body = repoName === null
      ? { permissions: LIST_REPOS_TOKEN_PERMISSIONS }
      : { repositories: [repoName], permissions: INSTALLATION_TOKEN_PERMISSIONS };
    const res = await this.send('create_installation_token', `${this.apiBase}/app/installations/${installationId}/access_tokens`, {
      method: 'POST', headers: this.headers(`Bearer ${this.appJwt()}`, { 'Content-Type': 'application/json' }), body: JSON.stringify(body), redirect: 'manual',
    });
    // UNVERIFIED: GitHub's exact status when a listed repository is not in the installation (422 expected; 404 also
    // treated as "not accessible").
    if (repoName !== null && (res.status === 422 || res.status === 404)) { await res.body?.cancel(); throw new RepoNotAccessible(); }
    if (!res.ok) { await res.body?.cancel(); throw new GitHubHttpError('create_installation_token', res.status); }
    const j = await this.json<{ token?: unknown; expires_at?: unknown }>('create_installation_token', res);
    if (typeof j.token !== 'string' || j.token.length === 0) throw new Error('[github_http] Unexpected response body for create_installation_token.');
    const expiresMs = typeof j.expires_at === 'string' ? Date.parse(j.expires_at) : NaN;
    // Without a parsable expiry the token is used for this call only.
    if (Number.isFinite(expiresMs)) this.tokens.set(key, { token: j.token, reuseUntilMs: expiresMs - 60_000 });
    return j.token;
  }

  /* ── install callback ── */

  async completeInstallation(p: { code: string; installationId: number; requestedLogin?: string; selectRepositories?: readonly string[] }): Promise<InstallationGrant> {
    // p.selectRepositories is ignored in app mode: the selection is what the user chose on GitHub.
    requirePositiveInt(p.installationId, 'installation id');
    if (typeof p.code !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(p.code)) throw new Error('[github_code] Invalid authorization code.');

    // 1. Exchange the user's OAuth code. UNVERIFIED (research does not quote the endpoint): POST
    //    {webBase}/login/oauth/access_token with Accept: application/json; a bad code answers 200 with `error`.
    const ex = await this.send('oauth_code_exchange', `${this.webBase}/login/oauth/access_token`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': this.userAgent },
      body: JSON.stringify({ client_id: this.clientId, client_secret: this.#clientSecret, code: p.code }), redirect: 'manual',
    });
    if (!ex.ok) { await ex.body?.cancel(); throw new GitHubHttpError('oauth_code_exchange', ex.status); }
    const exj = await this.json<{ access_token?: unknown; error?: unknown }>('oauth_code_exchange', ex);
    if (typeof exj.access_token !== 'string' || exj.access_token.length === 0) {
      const code = typeof exj.error === 'string' && /^[a-z_]{1,64}$/.test(exj.error) ? ` (${exj.error})` : '';
      throw new Error(`[github_code] GitHub refused the authorization code${code}.`);
    }
    let userToken: string | null = exj.access_token;

    let user: { id: number; login: string };
    let installation: { id: number; account?: { id?: unknown; login?: unknown } } | undefined;
    try {
      // 2. Who is the user.
      const ures = await this.send('get_user', `${this.apiBase}/user`, { method: 'GET', headers: this.headers(`Bearer ${userToken}`), redirect: 'manual' });
      if (!ures.ok) { await ures.body?.cancel(); throw new GitHubHttpError('get_user', ures.status); }
      const u = await this.json<{ id?: unknown; login?: unknown }>('get_user', ures);
      if (typeof u.id !== 'number' || typeof u.login !== 'string') throw new Error('[github_http] Unexpected response body for get_user.');
      user = { id: u.id, login: u.login };
      if (p.requestedLogin && p.requestedLogin.toLowerCase() !== user.login.toLowerCase()) {
        throw new Error('[github_login_mismatch] The GitHub account that authorized is not the one requested.');
      }

      // 3. Is this installation the user's? UNVERIFIED (not quoted in the research): GET /user/installations lists the
      //    installations the user can access with this App's user token, paginated with per_page/page.
      for (let page = 1; page <= 10 && !installation; page++) {
        const ires = await this.send('list_user_installations', `${this.apiBase}/user/installations?per_page=100&page=${page}`, { method: 'GET', headers: this.headers(`Bearer ${userToken}`), redirect: 'manual' });
        if (!ires.ok) { await ires.body?.cancel(); throw new GitHubHttpError('list_user_installations', ires.status); }
        const ij = await this.json<{ installations?: { id: number; account?: { id?: unknown; login?: unknown } }[] }>('list_user_installations', ires);
        const list = Array.isArray(ij.installations) ? ij.installations : [];
        installation = list.find((i) => i && i.id === p.installationId);
        if (list.length < 100) break;
      }
    } finally {
      userToken = null; // discarded: never stored, never returned
    }
    if (!installation) throw new Error('[github_installation_not_yours] This installation does not belong to the GitHub account that authorized.');
    // NAQLA reads only repositories the graduate owns on their personal account (assertRepositoryUsable), so an
    // installation on another account (e.g. an organization the user administers) is refused here.
    if (installation.account && typeof installation.account.id === 'number' && installation.account.id !== user.id) {
      throw new Error('[github_installation_not_personal] Install the app on your own personal account, not on an organization.');
    }

    // 4. The permissions GitHub actually granted, read with the App JWT (UNVERIFIED path: GET /app/installations/{id}).
    //    Returned as-is so the service's assertReadOnlyPermissions can refuse anything beyond read-only.
    const ar = await this.send('get_installation', `${this.apiBase}/app/installations/${p.installationId}`, { method: 'GET', headers: this.headers(`Bearer ${this.appJwt()}`), redirect: 'manual' });
    if (!ar.ok) { await ar.body?.cancel(); throw new GitHubHttpError('get_installation', ar.status); }
    const aj = await this.json<{ permissions?: unknown }>('get_installation', ar);
    const permissions: Record<string, string> = {};
    if (aj.permissions && typeof aj.permissions === 'object') {
      for (const [k, v] of Object.entries(aj.permissions as Record<string, unknown>)) permissions[k] = String(v);
    }

    // 5. The repositories the user selected on GitHub.
    const repositories = await this.listInstallationRepos(p.installationId);
    return { githubUserId: user.id, login: user.login, installationId: p.installationId, permissions, repositories };
  }

  /* ── reads ── */

  /** GET /installation/repositories (UNVERIFIED path; paginated with per_page/page), capped at 100 repositories. */
  async listInstallationRepos(installationId: number): Promise<readonly GitHubRepoInfo[]> {
    const token = await this.installationToken(installationId, null);
    const out: GitHubRepoInfo[] = [];
    for (let page = 1; out.length < REPO_CAP; page++) {
      const res = await this.send('list_installation_repositories', `${this.apiBase}/installation/repositories?per_page=100&page=${page}`, { method: 'GET', headers: this.headers(`Bearer ${token}`), redirect: 'manual' });
      if (!res.ok) { await res.body?.cancel(); throw new GitHubHttpError('list_installation_repositories', res.status); }
      const j = await this.json<{ repositories?: unknown[] }>('list_installation_repositories', res);
      const list = Array.isArray(j.repositories) ? j.repositories : [];
      for (const r of list as { id?: unknown; full_name?: unknown; owner?: { login?: unknown }; private?: unknown; default_branch?: unknown }[]) {
        if (out.length >= REPO_CAP) break;
        if (typeof r?.id !== 'number' || typeof r.full_name !== 'string' || !FULL_NAME_RE.test(r.full_name)) continue;
        out.push({
          repoId: r.id, fullName: r.full_name, ownerLogin: typeof r.owner?.login === 'string' ? r.owner.login : r.full_name.split('/')[0]!,
          private: r.private === true, defaultBranch: typeof r.default_branch === 'string' ? r.default_branch : 'main',
        });
      }
      if (list.length < 100) break;
    }
    return out;
  }

  async getCommit(installationId: number, fullName: string, sha: string): Promise<CommitShape | null> {
    const { owner, repo } = splitFullName(fullName);
    if (!SHA_RE.test(sha)) return null;
    let j: { sha?: unknown; commit?: { message?: unknown }; parents?: unknown[] } | null;
    try { j = await this.repoGet('get_commit', installationId, fullName, `/repos/${owner}/${repo}/commits/${sha}`); }
    catch (e) { if (e instanceof RepoNotAccessible) return null; throw e; }
    if (!j || typeof j.sha !== 'string') return null;
    return { sha: j.sha, message: typeof j.commit?.message === 'string' ? j.commit.message : '', parents: Array.isArray(j.parents) ? j.parents.length : 0 };
  }

  async listCommits(installationId: number, fullName: string, headSha: string, max: number): Promise<readonly CommitShape[]> {
    const { owner, repo } = splitFullName(fullName);
    if (!SHA_RE.test(headSha)) return [];
    const perPage = Math.max(1, Math.min(100, Math.floor(max)));
    let j: unknown;
    try { j = await this.repoGet('list_commits', installationId, fullName, `/repos/${owner}/${repo}/commits?sha=${headSha}&per_page=${perPage}`); }
    catch (e) { if (e instanceof RepoNotAccessible) return []; throw e; }
    if (!Array.isArray(j)) return [];
    return (j as { sha?: unknown; commit?: { message?: unknown }; parents?: unknown[] }[])
      .filter((c) => typeof c?.sha === 'string')
      .slice(0, perPage)
      .map((c) => ({ sha: c.sha as string, message: typeof c.commit?.message === 'string' ? c.commit.message : '', parents: Array.isArray(c.parents) ? c.parents.length : 0 }));
  }

  async listPullRequests(installationId: number, fullName: string): Promise<readonly PullRequestInfo[]> {
    const { owner, repo } = splitFullName(fullName);
    let j: unknown;
    try { j = await this.repoGet('list_pull_requests', installationId, fullName, `/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=10`); }
    catch (e) { if (e instanceof RepoNotAccessible) return []; throw e; }
    if (!Array.isArray(j)) return [];
    const out: PullRequestInfo[] = [];
    for (const p of (j as { number?: unknown }[]).slice(0, 10)) {
      if (typeof p?.number === 'number') { const full = await this.getPullRequest(installationId, fullName, p.number); if (full) out.push(full); }
    }
    return out;
  }

  async defaultBranchHead(installationId: number, fullName: string): Promise<string | null> {
    const { owner, repo } = splitFullName(fullName);
    try {
      const r = await this.repoGet<{ default_branch?: unknown }>('get_repo', installationId, fullName, `/repos/${owner}/${repo}`);
      const branch = typeof r?.default_branch === 'string' ? r.default_branch : null;
      if (!branch || !/^[A-Za-z0-9._\-/]{1,200}$/.test(branch)) return null;
      const b = await this.repoGet<{ commit?: { sha?: unknown } }>('get_branch', installationId, fullName, `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`);
      return typeof b?.commit?.sha === 'string' && SHA_RE.test(b.commit.sha) ? b.commit.sha : null;
    } catch (e) { if (e instanceof RepoNotAccessible) return null; throw e; }
  }

  async getPullRequest(installationId: number, fullName: string, n: number): Promise<PullRequestInfo | null> {
    const { owner, repo } = splitFullName(fullName);
    if (!Number.isSafeInteger(n) || n < 1) return null;
    type Pr = { number?: unknown; title?: unknown; body?: unknown; head?: { ref?: unknown; sha?: unknown }; base?: { ref?: unknown }; commits?: unknown; state?: unknown; merged?: unknown; merged_at?: unknown };
    let j: Pr | null;
    try { j = await this.repoGet<Pr>('get_pull_request', installationId, fullName, `/repos/${owner}/${repo}/pulls/${n}`); }
    catch (e) { if (e instanceof RepoNotAccessible) return null; throw e; }
    if (!j || typeof j.number !== 'number' || typeof j.head?.sha !== 'string') return null;
    const merged = j.merged === true || (typeof j.merged_at === 'string' && j.merged_at.length > 0);
    return {
      number: j.number, title: typeof j.title === 'string' ? j.title : '', body: typeof j.body === 'string' ? j.body : '',
      headRef: typeof j.head.ref === 'string' ? j.head.ref : '', baseRef: typeof j.base?.ref === 'string' ? j.base.ref : '',
      commits: typeof j.commits === 'number' ? j.commits : 0, headSha: j.head.sha,
      state: merged ? 'merged' : j.state === 'open' ? 'open' : 'closed',
    };
  }

  /**
   * GET /repos/{o}/{r}/tarball/{sha} answers 302 with a temporary download URL (research Q7: "these links are
   * temporary and expire after five minutes"). The redirect is followed manually and WITHOUT the Authorization
   * header, so the token never goes to the download host. The archive is unpacked in memory by parseRepositoryTarball.
   */
  async snapshot(installationId: number, fullName: string, sha: string): Promise<readonly SubmittedFile[]> {
    const { owner, repo } = splitFullName(fullName);
    if (!SHA_RE.test(sha)) throw new Error('[github_commit_not_found] commit not found in the selected repository');
    let token: string;
    try { token = await this.installationToken(installationId, repo); }
    catch (e) { if (e instanceof RepoNotAccessible) throw new Error('[github_commit_not_found] commit not found in the selected repository'); throw e; }
    let res = await this.send('download_archive', `${this.apiBase}/repos/${owner}/${repo}/tarball/${sha}`, { method: 'GET', headers: this.headers(`Bearer ${token}`), redirect: 'manual' });
    if (res.status === 404) { await res.body?.cancel(); throw new Error('[github_commit_not_found] commit not found in the selected repository'); }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      await res.body?.cancel();
      const target = this.safeRedirect(loc);
      res = await this.send('download_archive', target, { method: 'GET', headers: { 'User-Agent': this.userAgent }, redirect: 'follow' });
    }
    if (!res.ok) { await res.body?.cancel(); throw new GitHubHttpError('download_archive', res.status); }
    const gz = await readCapped(res, this.limits.maxArchiveBytes);
    let tar: Buffer;
    try { tar = gunzipSync(gz, { maxOutputLength: this.limits.maxUnpackedBytes }); }
    catch (e) {
      if (e instanceof RangeError || /maxOutputLength|buffer/i.test(String((e as Error).message))) throw new Error('[github_archive_too_large] The repository archive is too large.');
      throw new Error('[github_archive_malformed] The repository archive could not be decompressed.');
    }
    return parseRepositoryTarball(tar, this.limits);
  }

  private safeRedirect(loc: string | null): string {
    if (!loc) throw new Error('[github_http] The archive redirect had no location.');
    let u: URL;
    try { u = new URL(loc, this.apiBase); } catch { throw new Error('[github_http] The archive redirect location is invalid.'); }
    // https only, except when the adapter itself points at a local http mock (tests).
    const allowHttp = this.apiBase.startsWith('http://');
    if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) throw new Error('[github_http] The archive redirect is not https.');
    return u.toString();
  }
}

async function readCapped(res: Response, max: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > max) { await res.body?.cancel(); throw new Error('[github_archive_too_large] The repository archive is too large.'); }
  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); throw new Error('[github_archive_too_large] The repository archive is too large.'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

/* ───────────────────────────── tar parsing ───────────────────────────── */

const ALLOWED_EXT = /\.(html|css|js|mjs|json|md|txt|svg)$/i;
/** Same character set as the domain's SAFE_PATH (assertSubmittedFiles); other names are skipped, not refused. */
const SAFE_CHARS = /^[A-Za-z0-9_\-./]{1,160}$/;

function cstr(buf: Buffer, start: number, len: number): string {
  const slice = buf.subarray(start, start + len);
  const nul = slice.indexOf(0);
  return (nul === -1 ? slice : slice.subarray(0, nul)).toString('utf8');
}

function parseOctal(buf: Buffer, start: number, len: number): number {
  if ((buf[start]! & 0x80) !== 0) return Number.POSITIVE_INFINITY; // base-256: only used for > 8 GiB → over every cap
  const s = cstr(buf, start, len).trim();
  if (s === '') return 0;
  if (!/^[0-7]+$/.test(s)) return NaN;
  return parseInt(s, 8);
}

function parsePax(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < data.length) {
    const sp = data.indexOf(0x20, i);
    if (sp === -1) break;
    const len = parseInt(data.subarray(i, sp).toString('ascii'), 10);
    if (!Number.isInteger(len) || len <= 0 || i + len > data.length) throw new Error('[github_archive_malformed] Invalid pax header.');
    const rec = data.subarray(sp + 1, i + len - 1).toString('utf8'); // drop trailing \n
    const eq = rec.indexOf('=');
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}

/** Checks one raw entry path; throws (refusing the whole archive) on traversal or an absolute path. */
function assertNoTraversal(raw: string): void {
  if (raw.includes('\0') || raw.includes('\\')) throw new Error('[github_archive_unsafe_path] The repository archive contains an unsafe path.');
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) throw new Error('[github_archive_unsafe_path] The repository archive contains an absolute path.');
  if (raw.split('/').some((seg) => seg === '..')) throw new Error('[github_archive_unsafe_path] The repository archive contains a path that leaves the repository.');
}

/**
 * Parses an uncompressed tar (ustar, pax `path`/`size`, GNU long names `L`). Strips the single top-level directory
 * GitHub puts in tarballs, keeps regular files with safe relative paths and allowed extensions, skips hidden files and
 * directories, ignores symlinks, hard links, devices, FIFOs and directories. Refuses the whole archive on traversal,
 * absolute paths, a second top-level directory, duplicates, malformed headers or any cap.
 */
export function parseRepositoryTarball(tar: Buffer, limits: SnapshotLimits = DEFAULT_SNAPSHOT_LIMITS): SubmittedFile[] {
  const files: SubmittedFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  let top: string | null = null;
  let pax: Record<string, string> = {};
  let longName: string | null = null;
  let off = 0;
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break; // end-of-archive
    // header checksum: sum of all bytes with the checksum field as spaces
    const want = parseOctal(h, 148, 8);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i]!;
    if (!Number.isFinite(want) || want !== sum) throw new Error('[github_archive_malformed] Invalid tar header checksum.');
    const type = String.fromCharCode(h[156] || 0x30); // NUL → '0'
    let size = parseOctal(h, 124, 12);
    if (pax['size'] !== undefined && type !== 'x' && type !== 'g') size = Number(pax['size']);
    if (!Number.isFinite(size) && size !== Number.POSITIVE_INFINITY) throw new Error('[github_archive_malformed] Invalid tar entry size.');
    if (size === Number.POSITIVE_INFINITY || size > limits.maxUnpackedBytes) throw new Error('[github_archive_too_large] The repository archive is too large.');
    const dataStart = off + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new Error('[github_archive_malformed] Truncated tar entry.');
    const data = tar.subarray(dataStart, dataEnd);
    off = dataStart + Math.ceil(size / 512) * 512;

    if (type === 'g') continue; // pax global header (GitHub stores the commit id there); never a path
    if (type === 'x') { pax = parsePax(data); continue; }
    if (type === 'L') { longName = cstr(data, 0, data.length); continue; }
    if (type === 'K') continue; // GNU long link name: links are ignored anyway

    const magic = h.subarray(257, 262).toString('ascii');
    const prefix = magic === 'ustar' ? cstr(h, 345, 155) : '';
    const name = cstr(h, 0, 100);
    const raw = pax['path'] ?? longName ?? (prefix ? `${prefix}/${name}` : name);
    pax = {};
    longName = null;

    assertNoTraversal(raw);
    const segs = raw.split('/').filter((s) => s !== '' && s !== '.');
    if (segs.length === 0) continue;
    if (top === null) top = segs[0]!;
    else if (segs[0] !== top) throw new Error('[github_archive_malformed] The repository archive has an unexpected layout.');
    const rel = segs.slice(1);
    if (rel.length === 0) continue; // the top-level directory itself

    if (type !== '0' && type !== '7') continue; // directories, symlinks (2), hard links (1), devices, FIFOs: ignored
    if (rel.some((s) => s.startsWith('.'))) continue; // hidden files and directories
    const path = rel.join('/');
    if (!SAFE_CHARS.test(path) || !ALLOWED_EXT.test(path)) continue;
    if (seen.has(path)) throw new Error('[github_archive_malformed] The repository archive repeats a path.');
    if (size > limits.maxFileBytes) throw new Error(`[github_archive_file_too_large] A file is larger than ${limits.maxFileBytes} bytes.`);
    total += size;
    if (total > limits.maxTotalBytes) throw new Error(`[github_archive_too_large] The selected files exceed ${limits.maxTotalBytes} bytes.`);
    if (files.length + 1 > limits.maxFiles) throw new Error(`[github_archive_too_many_files] More than ${limits.maxFiles} files.`);
    seen.add(path);
    files.push({ path, content: data.toString('utf8') });
  }
  return files;
}
