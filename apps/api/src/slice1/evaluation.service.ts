import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import {
  runDeterministicEvaluation, assertRubricProposalSane, assertTransitionAllowed,
  assertEvaluationResultValid, decideVerification, verificationApplies,
  type PublishedRubric, type SubmissionArtifact, type IntegrityCheckSpec,
  type EvidenceState, type EvaluationRun,
} from '@naqla/domain';

/**
 * Evaluation.
 *
 * Everything below happens in ONE transaction, which is what makes these
 * states unrepresentable rather than merely unlikely:
 *   - evaluation says passed, but the evidence was not transitioned
 *   - evidence transitioned, but the evaluation history is missing
 *   - an asset exists without its source evidence
 *
 * No model is called. The rules come from @naqla/domain; this service loads
 * rows, calls them, and writes what they return.
 */
@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(private readonly db: DbService) {}

  async evaluateSubmission(userId: string, submissionId: string) {
    return this.db.asService(async (c) => {
      /* ── 1. load, and check ownership: the service role bypasses RLS ── */
      const sub = await c.query(
        `select s.id, s.user_id, s.project_id, s.state,
                p.activity_spec_id, p.activity_spec_version, p.title as project_title, p.kind as project_kind
           from submission s
           join project p on p.id = s.project_id
          where s.id = $1`,
        [submissionId],
      );
      if (sub.rowCount === 0) throw new NotFoundException('submission not found');
      const s = sub.rows[0];
      if (s.user_id !== userId) throw new NotFoundException('submission not found');
      if (!s.activity_spec_id) {
        throw new BadRequestException(
          'only a platform activity has a rubric; a personal project cannot be evaluated in this slice',
        );
      }

      const already = await c.query(
        `select id from evaluation where submission_id = $1 and state = 'completed'`,
        [submissionId],
      );
      if (already.rowCount && already.rowCount > 0) {
        throw new BadRequestException(
          'this submission already has a completed evaluation; a correction creates a new submission',
        );
      }

      const rubric = await this.loadPublishedRubric(c, s.activity_spec_id, s.activity_spec_version);
      assertRubricProposalSane(rubric);

      const artifacts = await this.loadArtifacts(c, submissionId);
      const integritySpecs = await this.loadIntegritySpecs(c, s.activity_spec_id);
      const claimedSkills = await c.query(
        `select skill_id from submission_claimed_skill where submission_id = $1`, [submissionId],
      );
      const skillIds: string[] = claimedSkills.rows.map((r) => r.skill_id);
      if (skillIds.length === 0) throw new BadRequestException('the submission claims no skill');

      /* ── 2. the evaluation attempt itself ── */
      const evalRow = await c.query(
        `insert into evaluation (submission_id, user_id, state, queued_at)
         values ($1,$2,'running', now()) returning id`,
        [submissionId, userId],
      );
      const evaluationId: string = evalRow.rows[0].id;

      // The state before this run decides whether a promotion is even earned.
      const primarySkillId = skillIds[0]!;
      const currentState = await this.currentClaimState(c, userId, primarySkillId);

      /* ── 3. the domain decides; this service does not ── */
      const run: EvaluationRun = runDeterministicEvaluation({
        rubric, artifacts, integritySpecs, currentState,
      });

      assertEvaluationResultValid({
        outcome: run.outcome,
        rubricVersion: run.rubricVersion,
        activitySpecVersion: run.activitySpecVersion,
        criteria: run.criteria,
      });

      /* ── 4. immutable result ── */
      const resultRow = await c.query(
        `insert into evaluation_result
           (evaluation_id, submission_id, user_id, outcome, rubric_version_id,
            activity_spec_id, activity_spec_version, evaluated_at)
         values ($1,$2,$3,$4,$5,$6,$7, now())
         returning id, evaluated_at`,
        [evaluationId, submissionId, userId, run.outcome,
         run.outcome === 'blocked_by_checks' ? null : rubric.rubricVersionId,
         run.outcome === 'blocked_by_checks' ? null : s.activity_spec_id,
         run.outcome === 'blocked_by_checks' ? null : s.activity_spec_version],
      );
      const resultId: string = resultRow.rows[0].id;

      for (const cr of run.criteria) {
        await c.query(
          `insert into evaluation_criterion_score
             (evaluation_result_id, criterion_key, score, max_score, rationale,
              supporting_excerpt, skill_id, confidence)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [resultId, cr.criterionId, cr.score, cr.maxScore, cr.rationale,
           cr.supportingExcerpt, cr.skillId, cr.confidence],
        );
      }

      for (const ic of run.integrityChecks) {
        await c.query(
          `insert into integrity_check
             (evaluation_result_id, check_key, classification, passed, signal)
           values ($1,$2,$3,$4,$5)`,
          // The signal is stored for assessment; it is never projected outward.
          [resultId, ic.key, ic.classification, ic.passed, ic.passed ? null : 'unmet'],
        );
      }

      await c.query(
        `update evaluation set state = 'completed', completed_at = now() where id = $1`,
        [evaluationId],
      );

      await emitAuditEvent(c, {
        eventType: 'evaluation.completed',
        userId, actorKind: 'system', subjectTable: 'evaluation_result', subjectId: resultId,
        reason: run.reason,
        payload: { outcome: run.outcome, score: run.totalScore, maxScore: run.maxScore },
      });

      /* ── 5. verification, then the transition — same transaction ── */
      let transition: { from: EvidenceState; to: EvidenceState; evidenceId: string } | null = null;

      if (run.proposedState && verificationApplies(run.outcome)) {
        const decision = decideVerification({
          evaluationOutcome: run.outcome,
          proposedState: run.proposedState,
          currentState,
          // The deterministic path accepts what the rubric supports. A human
          // reviewer can still downgrade later through the verification table.
          outcome: 'accepted',
          reason: `deterministic evaluation met every mandatory criterion (${run.totalScore}/${run.maxScore})`,
        });

        await c.query(
          `insert into verification
             (evaluation_result_id, user_id, outcome, proposed_state, resulting_state, reason)
           values ($1,$2,$3,$4,$5,$6)`,
          [resultId, userId, decision.outcome, run.proposedState, decision.resultingState, decision.reason],
        );

        if (decision.resultingState !== currentState) {
          transition = await this.promote(c, {
            userId,
            skillId: primarySkillId,
            from: currentState,
            to: decision.resultingState,
            evaluationResultId: resultId,
            rubricVersion: run.rubricVersion,
            projectId: s.project_id,
            reason: decision.reason,
          });
        }
      }

      return {
        evaluationId,
        resultId,
        outcome: run.outcome,
        totalScore: run.totalScore,
        maxScore: run.maxScore,
        reason: run.reason,
        criteria: run.criteria,
        // Only user-facing integrity results leave this method.
        integrityChecks: run.integrityChecks
          .filter((i) => i.classification === 'user_facing')
          .map((i) => ({ key: i.key, passed: i.passed, message: i.message })),
        transition,
        evaluatedAt: resultRow.rows[0].evaluated_at,
      };
    });
  }

  /**
   * The only place an evidence state changes.
   *
   * The domain guard runs first and throws on anything it does not allow, so a
   * bug here cannot write a transition the ladder forbids — and the database
   * constraints would refuse it even if this code tried.
   */
  private async promote(c: PoolClient, p: {
    userId: string; skillId: string; from: EvidenceState; to: EvidenceState;
    evaluationResultId: string; rubricVersion: string; projectId: string; reason: string;
  }) {
    const rule = assertTransitionAllowed({
      from: p.from,
      to: p.to,
      evaluationId: p.evaluationResultId,
      rubricVersion: p.rubricVersion,
      sourceStrength: 'platform_controlled',
      actor: 'system',
    });

    const evidence = await c.query(
      `insert into evidence
         (user_id, skill_id, source_strength, evaluation_result_id, project_id,
          provenance_class, provenance_source, confidence)
       values ($1,$2,'platform_controlled',$3,$4,'system_derived',$5,1.0)
       returning id`,
      [p.userId, p.skillId, p.evaluationResultId, p.projectId,
       `evaluation_result:${p.evaluationResultId}`],
    );
    const evidenceId: string = evidence.rows[0].id;

    const claim = await c.query(
      `update skill_claim
          set state = $1, primary_evidence_id = $2, state_reason = $3
        where user_id = $4 and skill_id = $5
        returning id`,
      [p.to, evidenceId, p.reason, p.userId, p.skillId],
    );
    if (claim.rowCount === 0) throw new BadRequestException('no claim to promote');

    await c.query(
      `insert into evidence_transition
         (skill_claim_id, user_id, from_state, to_state, transition_rule_id,
          evaluation_result_id, actor_kind, reason)
       values ($1,$2,$3,$4,$5,$6,'system',$7)`,
      [claim.rows[0].id, p.userId, p.from, p.to, rule.id, p.evaluationResultId, p.reason],
    );

    await emitAuditEvent(c, {
      eventType: 'claim.promoted',
      userId: p.userId, actorKind: 'system',
      subjectTable: 'skill_claim', subjectId: claim.rows[0].id,
      reason: p.reason,
      payload: { from: p.from, to: p.to, rule: rule.id, evidenceId },
    });

    return { from: p.from, to: p.to, evidenceId };
  }

  private async currentClaimState(
    c: PoolClient, userId: string, skillId: string,
  ): Promise<EvidenceState> {
    const { rows } = await c.query(
      'select state from skill_claim where user_id = $1 and skill_id = $2',
      [userId, skillId],
    );
    // No stored claim means the user has never touched this skill: `gap` is
    // the absence of a claim, not a row.
    return (rows[0]?.state as EvidenceState) ?? 'gap';
  }

  private async loadPublishedRubric(
    c: PoolClient, activitySpecId: string, activitySpecVersion: string,
  ): Promise<PublishedRubric> {
    const { rows } = await c.query(
      `select id, version, status, criteria
         from rubric_version
        where activity_spec_id = $1 and status = 'published'
        order by created_at desc limit 1`,
      [activitySpecId],
    );
    if (rows.length === 0) {
      // INV-2: without a published rubric there is no evaluation to run.
      throw new BadRequestException('no published rubric for this activity');
    }
    const body = rows[0].criteria as {
      passThreshold: number; proposesState: EvidenceState; criteria: unknown[];
    };
    return {
      rubricVersionId: rows[0].id,
      version: rows[0].version,
      activitySpecId,
      activitySpecVersion,
      status: 'published',
      passThreshold: body.passThreshold,
      proposesState: body.proposesState,
      criteria: body.criteria as PublishedRubric['criteria'],
    };
  }

  private async loadArtifacts(c: PoolClient, submissionId: string): Promise<SubmissionArtifact[]> {
    const { rows } = await c.query(
      `select key, kind, value_bool, value_number, value_text, locator
         from submission_artifact where submission_id = $1`,
      [submissionId],
    );
    return rows.map((r) => ({
      key: r.key,
      kind: r.kind,
      ...(r.value_bool !== null ? { valueBool: r.value_bool } : {}),
      ...(r.value_number !== null ? { valueNumber: Number(r.value_number) } : {}),
      ...(r.value_text !== null ? { valueText: r.value_text } : {}),
      ...(r.locator !== null ? { locator: r.locator } : {}),
    }));
  }

  private async loadIntegritySpecs(c: PoolClient, activitySpecId: string): Promise<IntegrityCheckSpec[]> {
    const { rows } = await c.query(
      `select key, classification, blocking, check_definition, user_facing_message
         from integrity_check_spec where activity_spec_id = $1 order by key`,
      [activitySpecId],
    );
    return rows.map((r) => ({
      key: r.key,
      classification: r.classification,
      blocking: r.blocking,
      check: r.check_definition,
      userFacingMessage: r.user_facing_message,
    }));
  }

  async getEvaluationForSubmission(userId: string, submissionId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select e.id, e.state, e.queued_at, e.completed_at,
                r.id as result_id, r.outcome, r.activity_spec_version, r.evaluated_at,
                rv.version as rubric_version
           from evaluation e
           left join evaluation_result r on r.evaluation_id = e.id
           left join rubric_version rv on rv.id = r.rubric_version_id
          where e.submission_id = $1
          order by e.queued_at desc limit 1`,
        [submissionId],
      );
      if (rows.length === 0) throw new NotFoundException('no evaluation for this submission');
      const r = rows[0];

      const criteria = r.result_id ? await c.query(
        `select criterion_key, score, max_score, rationale, supporting_excerpt
           from evaluation_criterion_score where evaluation_result_id = $1
          order by criterion_key`,
        [r.result_id],
      ) : { rows: [] };

      // Only user-facing checks cross this boundary.
      const integrity = r.result_id ? await c.query(
        `select check_key, passed from integrity_check
          where evaluation_result_id = $1 and classification = 'user_facing'
          order by check_key`,
        [r.result_id],
      ) : { rows: [] };

      const verification = r.result_id ? await c.query(
        `select outcome, proposed_state, resulting_state, reason, decided_at
           from verification where evaluation_result_id = $1`,
        [r.result_id],
      ) : { rows: [] };

      return {
        evaluationId: r.id,
        state: r.state,
        resultId: r.result_id,
        outcome: r.outcome,
        rubricVersion: r.rubric_version,
        activitySpecVersion: r.activity_spec_version,
        evaluatedAt: r.evaluated_at,
        criteria: criteria.rows,
        integrityChecks: integrity.rows,
        verification: verification.rows[0] ?? null,
      };
    });
  }
}
