import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { assertModeRespected, assertExternalUrlValid, type AiUsageMode } from '@naqla/domain';
import { UploadService } from './upload.service';
import { EvidenceLedgerService } from '../evidence/evidence-ledger.service';
import { SkillProgressEngine } from '../skill-progress/skill-progress-engine.service';
import { DisclosureService, type AiDisclosureInput } from '../integrity/disclosure.service';
import { IntegritySignalService } from '../integrity/integrity-signal.service';

export interface SubmissionArtifactInput {
  key: string;
  kind: 'boolean' | 'number' | 'text' | 'file' | 'link';
  valueBool?: boolean;
  valueNumber?: number;
  valueText?: string;
  locator?: string;
}

/**
 * Evidence submission.
 *
 * The important property is what this does NOT do: it creates no evidence, no
 * claim and no transition. A submission is material for an evaluation, and
 * until one runs it proves nothing.
 */
@Injectable()
export class SubmissionService {
  constructor(private readonly db: DbService, private readonly uploads: UploadService, private readonly ledger: EvidenceLedgerService, private readonly progress: SkillProgressEngine,
    private readonly disclosures: DisclosureService, private readonly signals: IntegritySignalService) {}

  async createSubmission(userId: string, projectId: string, input: {
    skillIds: string[];
    artifacts: SubmissionArtifactInput[];
    repositoryUrl?: string;
    /** Confirmed uploads the user owns. Become `file` artifacts. */
    uploadIds?: string[];
    /** External http(s) evidence. Become `link` artifacts. */
    externalUrls?: string[];
    /** Legacy { declaredUse, explanation } or Phase 6 { questionnaireId, answers }. Answering "no AI" is a valid answer. */
    aiDisclosure: AiDisclosureInput;
  }) {
    if (!input.skillIds?.length) {
      throw new BadRequestException('a submission must name at least one skill it claims');
    }
    const hasAny = (input.artifacts?.length ?? 0) + (input.uploadIds?.length ?? 0) + (input.externalUrls?.length ?? 0);
    if (hasAny === 0) {
      throw new BadRequestException('a submission with no evidence artifacts cannot be evaluated');
    }
    for (const a of input.artifacts ?? []) {
      // A file artifact is a confirmed upload, never a free-text filename.
      if (a.kind === 'file') throw new BadRequestException('file artifacts come from uploadIds, not free text');
      if (a.kind === 'link') assertExternalUrlValid(a.valueText ?? '');
    }
    for (const url of input.externalUrls ?? []) assertExternalUrlValid(url);

    return this.db.asService(async (c) => {
      const project = await c.query(
        `select p.id, p.user_id, p.activity_spec_id, p.title, s.ai_usage_mode
           from project p
           left join activity_spec s on s.id = p.activity_spec_id
          where p.id = $1 and p.deleted_at is null`,
        [projectId],
      );
      if (project.rowCount === 0) throw new NotFoundException('project not found');
      // Service role bypasses RLS, so ownership is checked here explicitly.
      if (project.rows[0].user_id !== userId) throw new NotFoundException('project not found');

      const mode: AiUsageMode = project.rows[0].ai_usage_mode ?? 'ai_assisted';
      // Phase 6: the disclosure is validated against the exact questionnaire version (or the legacy
      // fields, recorded against the baseline). AI use is allowed; this is context, never a penalty.
      const disclosure = await this.disclosures.prepare(c, input.aiDisclosure);
      // Declared AI authoring on an ai_prohibited activity contradicts the
      // spec the work was assigned under.
      assertModeRespected({ mode, userDeclaredUse: disclosure.validated.declaredUse });

      const sub = await c.query(
        `insert into submission (project_id, user_id, state, repository_url, locked_at)
         values ($1,$2,'locked',$3, now())
         returning id, project_id, state, locked_at, created_at`,
        [projectId, userId, input.repositoryUrl ?? null],
      );
      const submissionId: string = sub.rows[0].id;

      for (const skillId of input.skillIds) {
        // OPEN-039: an alias (merged) skill is not claimable; the canonical one is. Nothing is guessed:
        // the caller is told which skill replaced it.
        const sk = await c.query(`select status, merged_into_id, (select slug from skill k where k.id = s.merged_into_id) as canonical_slug from skill s where s.id = $1`, [skillId]);
        if (sk.rowCount === 0) throw new BadRequestException(`unknown skill ${skillId}`);
        if (sk.rows[0].status !== 'active') throw new BadRequestException(`skill ${skillId} is ${sk.rows[0].status}${sk.rows[0].canonical_slug ? `; claim its canonical skill '${sk.rows[0].canonical_slug}' (${sk.rows[0].merged_into_id})` : ''}`);
        await c.query(
          `insert into submission_claimed_skill (submission_id, skill_id, user_id)
           values ($1,$2,$3) on conflict do nothing`,
          [submissionId, skillId, userId],
        );
      }

      // The artifact key is what the rubric checks. It comes from the activity's
      // declared deliverables (format 'source file', by position). The demo
      // convention (file 0 = component, file 1 = test) remains the named fallback
      // for an activity that declares none, so existing behaviour is unchanged.
      const deliverables = await this.ledger.loadDeliverables(c, project.rows[0].activity_spec_id);
      const fileKeys = this.ledger.fileArtifactKeys(deliverables, input.uploadIds?.length ?? 0, (input.artifacts ?? []).map((a) => a.key));
      const ledgerFiles: { uploadId: string; key: string; declaredName: string; contentType: string | null }[] = [];
      let fileIndex = 0;
      for (const uploadId of input.uploadIds ?? []) {
        const up = await this.uploads.assertOwnedConfirmed(c, userId, uploadId);
        const { key } = fileKeys[fileIndex]!;
        fileIndex++;
        await c.query(
          `insert into submission_artifact
             (submission_id, user_id, key, kind, value_text, locator, upload_id)
           values ($1,$2,$3,'file',$4,$5,$6)`,
          [submissionId, userId, key, up.declared_name, up.declared_name, up.id],
        );
        const ct = await c.query('select content_type from upload where id = $1', [up.id]);
        ledgerFiles.push({ uploadId: up.id, key, declaredName: up.declared_name, contentType: ct.rows[0]?.content_type ?? null });
      }
      const ledgerLinks: { key: string; url: string }[] = [];
      let linkIndex = 0;
      for (const url of input.externalUrls ?? []) {
        const key = linkIndex === 0 ? 'link.repository' : `link.extra_${linkIndex}`;
        await c.query(
          `insert into submission_artifact (submission_id, user_id, key, kind, value_text, locator)
           values ($1,$2,$3,'link',$4,$5)`,
          [submissionId, userId, key, url, url],
        );
        ledgerLinks.push({ key, url });
        linkIndex++;
      }

      for (const a of input.artifacts ?? []) {
        await c.query(
          `insert into submission_artifact
             (submission_id, user_id, key, kind, value_bool, value_number, value_text, locator)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [submissionId, userId, a.key, a.kind,
           a.valueBool ?? null, a.valueNumber ?? null, a.valueText ?? null, a.locator ?? null],
        );
      }

      // Provenance for the submission itself: the user said this is their work, and how they worked.
      const disclosureId = await this.disclosures.record(c, { submissionId, userId, mode, prepared: disclosure });

      // A submission moves a claim to `practiced` at most: the user showed the
      // skill in their own work. It never reaches `demonstrated` here.
      for (const skillId of input.skillIds) {
        await this.ensurePracticedClaim(c, userId, skillId, projectId, submissionId);
      }

      // Phase 1: the submission is also recorded in the evidence ledger (typed
      // items, skill links, attempt number). The ledger moves no claim.
      const ledgerResult = await this.ledger.recordSubmission(c, {
        userId, submissionId, projectId, projectTitle: project.rows[0].title, activitySpecId: project.rows[0].activity_spec_id,
        skillIds: input.skillIds, files: ledgerFiles, links: ledgerLinks,
        texts: (input.artifacts ?? []).filter((a) => a.kind === 'text' && (a.valueText ?? '').trim().length > 0)
          .map((a) => ({ key: a.key, text: a.valueText as string, locator: a.locator ?? null })),
        disclosure: { mode, declaredUse: disclosure.validated.declaredUse },
      });

      // Phase 6: observable facts only — the disclosure (neutral context) and, from attempt 2, the resubmission.
      await this.signals.emitForSubmission(c, { userId, submissionId, disclosureId, questionnaireRef: `${disclosure.questionnaire.key}@${disclosure.questionnaire.version}`,
        aiUseDeclared: disclosure.validated.aiUseDeclared, answeredCount: disclosure.validated.answers.length, submissionItemId: ledgerResult.submissionItemId, attemptNumber: ledgerResult.attemptNumber });

      // Phase 2: the journey of each claimed skill records the submission. The claim ceiling above is untouched.
      await this.progress.applyAll(c, input.skillIds, { userId, trigger: 'submission.created', facts: { project_id: projectId },
        eventRef: { table: 'submission', id: submissionId }, reason: 'work was submitted for evaluation', actorKind: 'user' });

      await emitAuditEvent(c, {
        eventType: 'submission.created',
        userId, actorKind: 'user', actorId: userId,
        subjectTable: 'submission', subjectId: submissionId,
        reason: 'the user submitted work for evaluation; the submission is locked and cannot be edited',
        payload: { projectId, artifactCount: hasAny, uploads: input.uploadIds?.length ?? 0, links: input.externalUrls?.length ?? 0 },
      });

      return { ...sub.rows[0], claimedSkillIds: input.skillIds };
    });
  }

  /**
   * A submission demonstrates the user WORKED on a skill, not that they proved
   * it. `practiced` is the ceiling, and it is reached only via the ladder:
   * gap → self_reported → practiced, or directly gap → practiced when the work
   * itself is the first signal.
   */
  private async ensurePracticedClaim(
    c: import('pg').PoolClient,
    userId: string, skillId: string, projectId: string, submissionId: string,
  ): Promise<void> {
    const existing = await c.query(
      'select id, state from skill_claim where user_id = $1 and skill_id = $2',
      [userId, skillId],
    );

    if (existing.rowCount === 0) {
      const claim = await c.query(
        `insert into skill_claim (user_id, skill_id, state, state_reason)
         values ($1,$2,'practiced',$3)
         returning id`,
        [userId, skillId, 'appears in the user’s own project; not evaluated yet'],
      );
      await c.query(
        `insert into evidence_transition
           (skill_claim_id, user_id, from_state, to_state, transition_rule_id,
            actor_kind, reason)
         values ($1,$2,'self_reported','practiced','T-LINK','user',$3)`,
        [claim.rows[0].id, userId,
         `linked to project ${projectId} via submission ${submissionId}`],
      );
      return;
    }

    // Already at practiced or above: a submission never moves it further.
    // Only an evaluation can, and that happens in EvaluationService.
  }

  async getSubmission(userId: string, submissionId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select id, project_id, state, repository_url, locked_at, created_at
           from submission where id = $1`,
        [submissionId],
      );
      if (rows.length === 0) throw new NotFoundException('submission not found');
      const artifacts = await c.query(
        `select key, kind, value_bool, value_number, value_text, locator
           from submission_artifact where submission_id = $1 order by key`,
        [submissionId],
      );
      const skills = await c.query(
        `select s.id, s.label_ar, s.label_en
           from submission_claimed_skill scs
           join skill s on s.id = scs.skill_id
          where scs.submission_id = $1`,
        [submissionId],
      );
      return { ...rows[0], artifacts: artifacts.rows, claimedSkills: skills.rows };
    });
  }
}
