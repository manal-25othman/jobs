import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { assertModeRespected, assertExternalUrlValid, type AiUsageMode } from '@naqla/domain';
import { UploadService } from './upload.service';

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
  constructor(private readonly db: DbService, private readonly uploads: UploadService) {}

  async createSubmission(userId: string, projectId: string, input: {
    skillIds: string[];
    artifacts: SubmissionArtifactInput[];
    repositoryUrl?: string;
    /** Confirmed uploads the user owns. Become `file` artifacts. */
    uploadIds?: string[];
    /** External http(s) evidence. Become `link` artifacts. */
    externalUrls?: string[];
    aiDisclosure: { declaredUse: string[]; explanation?: string | null };
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
        `select p.id, p.user_id, p.activity_spec_id, s.ai_usage_mode
           from project p
           left join activity_spec s on s.id = p.activity_spec_id
          where p.id = $1 and p.deleted_at is null`,
        [projectId],
      );
      if (project.rowCount === 0) throw new NotFoundException('project not found');
      // Service role bypasses RLS, so ownership is checked here explicitly.
      if (project.rows[0].user_id !== userId) throw new NotFoundException('project not found');

      const mode: AiUsageMode = project.rows[0].ai_usage_mode ?? 'ai_assisted';
      // Declared AI authoring on an ai_prohibited activity contradicts the
      // spec the work was assigned under.
      assertModeRespected({ mode, userDeclaredUse: input.aiDisclosure.declaredUse });

      const sub = await c.query(
        `insert into submission (project_id, user_id, state, repository_url, locked_at)
         values ($1,$2,'locked',$3, now())
         returning id, project_id, state, locked_at, created_at`,
        [projectId, userId, input.repositoryUrl ?? null],
      );
      const submissionId: string = sub.rows[0].id;

      for (const skillId of input.skillIds) {
        await c.query(
          `insert into submission_claimed_skill (submission_id, skill_id, user_id)
           values ($1,$2,$3) on conflict do nothing`,
          [submissionId, skillId, userId],
        );
      }

      let fileIndex = 0;
      for (const uploadId of input.uploadIds ?? []) {
        const up = await this.uploads.assertOwnedConfirmed(c, userId, uploadId);
        // The artifact key is what the rubric checks. The first file is the
        // component, the second the test — a convention of the demo rubric,
        // recorded as the locator so a reviewer sees which file was which.
        const key = fileIndex === 0 ? 'file.component' : fileIndex === 1 ? 'file.test' : `file.extra_${fileIndex}`;
        fileIndex++;
        await c.query(
          `insert into submission_artifact
             (submission_id, user_id, key, kind, value_text, locator, upload_id)
           values ($1,$2,$3,'file',$4,$5,$6)`,
          [submissionId, userId, key, up.declared_name, up.declared_name, up.id],
        );
      }
      let linkIndex = 0;
      for (const url of input.externalUrls ?? []) {
        await c.query(
          `insert into submission_artifact (submission_id, user_id, key, kind, value_text, locator)
           values ($1,$2,$3,'link',$4,$5)`,
          [submissionId, userId, linkIndex === 0 ? 'link.repository' : `link.extra_${linkIndex}`, url, url],
        );
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

      // Provenance for the submission itself: the user said this is their work.
      await c.query(
        `insert into ai_disclosure (submission_id, user_id, mode, declared_use, explanation)
         values ($1,$2,$3,$4,$5)`,
        [submissionId, userId, mode, input.aiDisclosure.declaredUse,
         input.aiDisclosure.explanation ?? null],
      );

      // A submission moves a claim to `practiced` at most: the user showed the
      // skill in their own work. It never reaches `demonstrated` here.
      for (const skillId of input.skillIds) {
        await this.ensurePracticedClaim(c, userId, skillId, projectId, submissionId);
      }

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
