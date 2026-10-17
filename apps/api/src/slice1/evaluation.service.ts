import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { EvidenceLedgerService } from '../evidence/evidence-ledger.service';
import { SkillProgressEngine } from '../skill-progress/skill-progress-engine.service';
import { AssessmentRecorderService } from '../assessment/assessment-recorder.service';
import { IntegritySignalService } from '../integrity/integrity-signal.service';
import {
  runDeterministicEvaluation, assertRubricProposalSane, assertTransitionAllowed,
  assertEvaluationResultValid, assertStateAvailableInProduction, skillsEvidencedByRun, evidenceOrdinal, DOMAIN_RULESET_VERSION,
  type VerificationPolicy, type PolicyDecision, type ConfigResolution,
  type PublishedRubric, type SubmissionArtifact, type IntegrityCheckSpec,
  type EvidenceState, type EvaluationRun,
  reestablishmentAllowed,
  type RubricCriterion,
  aggregateWithHumanDecisions,
  finalizationAllowed,
  type ReviewQueueState,
  MissingPrerequisite,
  assessmentBasis, type AssessmentBasis, type ArtifactProvenance,
  workStatus, type WorkStatus,
  attributeLegacyPrimarySkill, skillsCoveredByRubric, isValidSkillEvidenceCriterion, withheldPromotion, resolveRubricVersion, unattributedDecision,
  type LegacyAttribution, type RubricResolution,
  assessSkills, decideSkillAssessment, assertSkillAssessmentInvariants, standingEvidenceForSkill, assessmentScopeOf, type AssessmentScope, type SkillAssessment,
  decideCorroboration,
} from '@naqla/domain';
import { isProduction } from '../configuration/configuration.service';

/** ENG-1 P3: under the per-skill scope the whole-activity result never moves a level by itself. */
const PER_SKILL_WITHHELD = 'per-skill scope (ENG-1 P3, development pathway): the whole-activity result moves no level; each claimed skill is assessed from its own criteria';

/** What the result's audit event records about attribution (read back by the evaluation view, O-1). */
function auditAttribution(a: LegacyAttribution | null, claimedSkillIds: readonly string[]): Record<string, unknown> {
  if (a === null) return { perSkill: true, skills: [...new Set(claimedSkillIds)].sort() };
  return a.kind === 'attributed' ? { skillId: a.skillId } : { unattributed: a.cause, candidates: a.candidates };
}

/** ENG-1 P3: one assessed skill, as the evaluate/finalise responses and the evaluation view report it (additive). */
export interface PerSkillResult {
  skillId: string; skillAssessmentId: string; claimed: boolean;
  outcome: SkillAssessment['outcome']; currentState: EvidenceState; proposedState: EvidenceState | null; reason: string;
  basisIndependentlyVerified: boolean; basisReasons: readonly string[];
  criteria: readonly { key: string; status: string; score: number | null; maxScore: number; threshold: number | null; thresholdStatus: string | null; evaluatorKind: string }[];
  decision: { decision: string; previousState: EvidenceState; resultingState: EvidenceState; reason: string };
  evidenceId: string | null; transition: { from: EvidenceState; to: EvidenceState; evidenceId: string } | null;
}

/** P5: what an evaluate/finalise response carries per skill — the same learner-safe fields as the evaluation view. */
function learnerSafeSkill(x: PerSkillResult) {
  return {
    skillId: x.skillId, skillAssessmentId: x.skillAssessmentId, claimed: x.claimed, outcome: x.outcome, currentState: x.currentState, proposedState: x.proposedState,
    basisIndependentlyVerified: x.basisIndependentlyVerified,
    criteria: x.criteria.map((c) => ({ key: c.key, status: c.status, score: c.score, maxScore: c.maxScore, evaluatorKind: c.evaluatorKind })),
    decision: { decision: x.decision.decision, previousState: x.decision.previousState, resultingState: x.decision.resultingState },
    evidenceId: x.evidenceId, transition: x.transition,
  };
}

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

  constructor(private readonly db: DbService, private readonly ledger: EvidenceLedgerService, private readonly progress: SkillProgressEngine, private readonly assessments: AssessmentRecorderService,
    private readonly signals: IntegritySignalService) {}

  async evaluateSubmission(userId: string, submissionId: string) {
    return this.db.asService(async (c) => {
      /* ── 1. load, and check ownership: the service role bypasses RLS ── */
      const sub = await c.query(
        `select s.id, s.user_id, s.project_id, s.state,
                p.activity_spec_id, p.activity_spec_version, p.title as project_title, p.kind as project_kind
           from submission s
           join project p on p.id = s.project_id
          where s.id = $1
            for update of s`,
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
        `select id, state from evaluation where submission_id = $1 and state in ('completed','queued_for_human')`,
        [submissionId],
      );
      if (already.rowCount && already.rowCount > 0) {
        // Graduate journey Phase 1: the controller answers a repeated request with the existing evaluation; this
        // is reached only by a concurrent duplicate, which is refused — a submission is evaluated once.
        throw new ConflictException(already.rows[0].state === 'queued_for_human'
          ? 'this submission is awaiting human review; a correction creates a new submission'
          : 'this submission already has a completed evaluation; a correction creates a new submission');
      }

      // ENG-1 P0 (F-8): the rubric bound to the submission's activity version — never "the latest published".
      const pin = await this.resolveRubricVersionId(c, s.activity_spec_id, s.activity_spec_version);
      const rubric = await this.loadPublishedRubric(c, s.activity_spec_id, s.activity_spec_version, pin.rubricVersionId);
      assertRubricProposalSane(rubric);

      const artifacts = await this.loadArtifacts(c, submissionId);
      const integritySpecs = await this.loadIntegritySpecs(c, s.activity_spec_id);
      const claimedSkills = await c.query(
        `select canonical_skill_id(skill_id) as skill_id from submission_claimed_skill where submission_id = $1`, [submissionId],
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

      // ENG-1 P3: the scope of the verification policy in effect. `per_skill` is the development-only pathway
      // (never resolvable in production; refused here too if it ever were).
      const scope = await this.policyScope(c);
      // ENG-1 P0 (F-1/F-2/F-9): the ONE skill a whole-activity result may move is chosen by an explicit mapping
      // (claimed ∩ activity-primary ∩ measured by the rubric), never by row order. Otherwise nothing is promoted.
      const attribution: LegacyAttribution | null = scope === 'per_skill' ? null : await this.attributeLegacyResult(c, s.activity_spec_id, skillIds, rubric);
      const primarySkillId: string | null = attribution?.kind === 'attributed' ? attribution.skillId : null;
      // The state before this run decides whether a promotion is even earned.
      const currentState: EvidenceState = primarySkillId ? await this.currentClaimState(c, userId, primarySkillId) : 'gap';

      /* ── 3. the domain decides; this service does not ── */
      let run: EvaluationRun = runDeterministicEvaluation({
        rubric, artifacts, integritySpecs, currentState,
      });
      if (attribution?.kind === 'unattributed') run = withheldPromotion(run, attribution.reason);
      if (scope === 'per_skill') run = withheldPromotion(run, PER_SKILL_WITHHELD);

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

      // Phase 6: each deterministic check that did not pass is recorded as an observable signal (no outcome attached).
      await this.signals.emitForEvaluation(c, { userId, submissionId, evaluationResultId: resultId,
        checks: run.integrityChecks.map((i) => ({ key: i.key, passed: i.passed, classification: i.classification })) });

      // Phase 3: the structured assessment — what the evaluator observed — beside the result.
      const assessment = await this.assessments.recordAssessment(c, {
        evaluationResultId: resultId, evaluationId, submissionId, userId, evaluatorKind: 'rule',
        evaluatorRef: `deterministic-evaluator@${DOMAIN_RULESET_VERSION}`, rubric, run, artifacts,
      });

      const awaitingHuman = run.outcome === 'needs_human_review';
      await c.query(
        awaitingHuman
          ? `update evaluation set state = 'queued_for_human' where id = $1`
          : `update evaluation set state = 'completed', completed_at = now() where id = $1`,
        [evaluationId],
      );

      if (awaitingHuman) {
        // One queue item per human criterion. Deterministic criteria never enter.
        for (const key of run.pendingHumanCriteria) {
          const crit = await c.query('select id from rubric_criterion where rubric_version_id = $1 and key = $2', [rubric.rubricVersionId, key]);
          await c.query(
            `insert into review_queue_item (evaluation_id, submission_id, activity_spec_id, rubric_version_id, criterion_id, criterion_key)
             values ($1,$2,$3,$4,$5,$6)`,
            [evaluationId, submissionId, s.activity_spec_id, rubric.rubricVersionId, crit.rows[0].id, key]);
        }
      }

      await emitAuditEvent(c, {
        eventType: awaitingHuman ? 'evaluation.queued_for_human' : 'evaluation.completed',
        userId, actorKind: 'system', subjectTable: 'evaluation_result', subjectId: resultId,
        reason: run.reason,
        payload: { outcome: run.outcome, score: run.totalScore, maxScore: run.maxScore, pendingHumanCriteria: run.pendingHumanCriteria,
          rubricResolution: pin.resolution, attribution: auditAttribution(attribution, skillIds) },
      });

      /* ── 5. verification, then the transition — same transaction ── */
      let transition: { from: EvidenceState; to: EvidenceState; evidenceId: string } | null = null;
      let reestablishedEvidenceId: string | null = null;

      // Phase 3: the decision comes from the named verification policy (the seeded
      // draft equals the pre-Phase-3 rule exactly). The legacy `verification` row
      // and the promotion are written exactly as before; the structured decision
      // is recorded beside them with the policy and ruleset versions it used.
      let perSkill: PerSkillResult[] = [];
      const outcome = scope === 'per_skill'
        ? await this.applyPerSkill(c, {
          assessmentId: assessment.assessmentId, trackConfigVersionId: assessment.trackConfigVersionId, evaluatorKind: 'rule', resultId, userId, projectId: s.project_id,
          claimedSkillIds: skillIds, run, rubric, rubricResolution: pin.resolution, artifacts, humanDecidedCriteria: [],
        }).then((r) => { perSkill = r.skills; return r; })
        : primarySkillId
        ? await this.decideAndApply(c, {
          policyKey: 'default', assessmentId: assessment.assessmentId, assessmentConfidence: assessment.confidence, trackConfigVersionId: assessment.trackConfigVersionId, evaluatorKind: 'rule',
          basis: await this.basisFor(c, rubric, artifacts, []),
          resultId, userId, skillId: primarySkillId, claimedSkillIds: skillIds, currentState, run, rubric, projectId: s.project_id,
          acceptedReason: `deterministic evaluation met every mandatory criterion (${run.totalScore}/${run.maxScore})`,
        })
        : await this.recordUnattributed(c, { assessmentId: assessment.assessmentId, resultId, userId, claimedSkillIds: skillIds, trackConfigVersionId: assessment.trackConfigVersionId,
          confidence: assessment.confidence, reason: (attribution as Extract<LegacyAttribution, { kind: 'unattributed' }>).reason });
      transition = outcome.transition; reestablishedEvidenceId = outcome.reestablishedEvidenceId;

      // Phase 1: the run is recorded in the evidence ledger and, when it produced an
      // evaluated fact, bridged to the material it was derived from. Additive only.
      await this.ledger.recordEvaluation(c, {
        userId, submissionId, projectId: s.project_id, activitySpecId: s.activity_spec_id, evaluationResultId: resultId,
        outcome: run.outcome, totalScore: run.totalScore, maxScore: run.maxScore,
        evidenceId: scope === 'per_skill' ? null : transition?.evidenceId ?? reestablishedEvidenceId, skillId: primarySkillId,
        ...(scope === 'per_skill' ? { perSkill: perSkill.map((x) => ({ skillId: x.skillId, evidenceId: x.evidenceId })) } : {}),
      });

      // Phase 2: the journey records the run; produced_evidence is a fact, not a verdict.
      // ENG-1 P0: an unattributed run is recorded on every claimed skill's journey and produces evidence for none.
      // ENG-1 P3: per skill, each journey records whether THAT skill produced evidence.
      if (scope === 'per_skill') {
        for (const x of perSkill) {
          await this.progress.apply(c, { userId, skillId: x.skillId, trigger: awaitingHuman ? 'evaluation.queued_for_human' : 'evaluation.completed',
            facts: { outcome: run.outcome, produced_evidence: x.evidenceId !== null }, eventRef: { table: 'evaluation_result', id: resultId }, reason: x.reason, actorKind: 'system' });
        }
      } else {
        await this.progress.applyAll(c, primarySkillId ? [primarySkillId] : skillIds, { userId,
          trigger: awaitingHuman ? 'evaluation.queued_for_human' : 'evaluation.completed',
          facts: { outcome: run.outcome, produced_evidence: (transition?.evidenceId ?? reestablishedEvidenceId) !== null },
          eventRef: { table: 'evaluation_result', id: resultId }, reason: run.reason, actorKind: 'system' });
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
        reestablishedEvidenceId,
        // D-118: what the policy concluded. `assessment_pending_validation` = recorded, formative, level unchanged.
        verification: { decision: outcome.decision, reason: outcome.decisionReason },
        evaluatedAt: resultRow.rows[0].evaluated_at,
        humanReview: awaitingHuman ? { pendingCriteria: run.pendingHumanCriteria, completedCriteria: [] as string[] } : null,
        // ENG-1 P3 (additive): one entry per assessed skill on the development pathway; empty on the legacy path.
        skills: perSkill.map(learnerSafeSkill),
      };
    });
  }

  /**
   * Finalises an evaluation whose human criteria have all been decided.
   *
   * Deterministic scores and integrity results are copied from the interim
   * result; human decisions come from the latest criterion_review per queue
   * item; the DOMAIN aggregates (pure function); the ordinary verification and
   * transition path runs. The interim result stays; the final one supersedes it.
   */
  async finalizeHumanReview(evaluationId: string) {
    return this.db.asService(async (c) => {
      const ev = await c.query(
        `select e.id, e.state, e.submission_id, e.user_id, p.activity_spec_id, p.activity_spec_version, p.id as project_id
           from evaluation e join submission s on s.id = e.submission_id join project p on p.id = s.project_id where e.id = $1 for update`, [evaluationId]);
      if (ev.rowCount === 0) throw new NotFoundException('evaluation not found');
      const e = ev.rows[0];
      if (e.state !== 'queued_for_human') throw new BadRequestException(`evaluation is ${e.state}, not awaiting human review`);

      const queue = await c.query('select id, criterion_key, state from review_queue_item where evaluation_id = $1', [evaluationId]);
      const fin = finalizationAllowed(queue.rows.map((q) => ({ state: q.state as ReviewQueueState })));
      if (!fin.allowed) throw new MissingPrerequisite('reviews', `evaluation cannot finalise: ${fin.pending} criterion review(s) still pending`);

      const interim = await c.query(`select id, rubric_version_id from evaluation_result where evaluation_id = $1 and outcome = 'needs_human_review' order by evaluated_at desc limit 1`, [evaluationId]);
      if (interim.rowCount === 0) throw new BadRequestException('no interim result to finalise');
      const rubric = await this.loadPublishedRubric(c, e.activity_spec_id, e.activity_spec_version, interim.rows[0].rubric_version_id);
      const detScores = await c.query('select criterion_key, score, max_score, rationale, supporting_excerpt, skill_id, confidence from evaluation_criterion_score where evaluation_result_id = $1', [interim.rows[0].id]);
      const detChecks = await c.query('select check_key, classification, passed from integrity_check where evaluation_result_id = $1', [interim.rows[0].id]);
      const specs = await this.loadIntegritySpecs(c, e.activity_spec_id);
      const deterministic: EvaluationRun = {
        outcome: 'needs_human_review', rubricVersion: rubric.version, activitySpecVersion: rubric.activitySpecVersion,
        criteria: detScores.rows.map((r) => ({ criterionId: r.criterion_key, score: Number(r.score), maxScore: Number(r.max_score), rationale: r.rationale, supportingExcerpt: r.supporting_excerpt, skillId: r.skill_id, confidence: Number(r.confidence ?? 1) })),
        integrityChecks: detChecks.rows.map((r) => { const spec = specs.find((x) => x.key === r.check_key); return { key: r.check_key, classification: r.classification, passed: r.passed, blocking: spec?.blocking ?? false, message: r.classification === 'user_facing' ? spec?.userFacingMessage ?? null : null }; }),
        totalScore: detScores.rows.reduce((a, r) => a + Number(r.score), 0), maxScore: rubric.criteria.reduce((a, r) => a + r.maxScore, 0), proposedState: null, reason: 'interim',
        pendingHumanCriteria: rubric.criteria.filter((r) => (r.evaluatorType ?? 'rule') !== 'rule').map((r) => r.key),
        // OPEN-045: registered checks the deterministic stage left to people or to a future producer.
        deferredChecks: specs.filter((x) => (x.mode ?? 'deterministic') !== 'deterministic' || x.active === false)
          .map((x) => ({ key: x.key, reason: (x.mode ?? 'deterministic') === 'human_observable' ? 'human_review' as const : 'inactive_no_producer' as const })),
      };
      // The latest decision per queue item is the one that counts; earlier ones stay as history.
      const decisions = await c.query(
        `select distinct on (queue_item_id) queue_item_id, criterion_key, score, rationale from criterion_review where queue_item_id = any($1::uuid[]) order by queue_item_id, created_at desc`,
        [queue.rows.map((q) => q.id)]);
      // OPEN-039: a claim on an alias skill is honoured on its canonical skill.
      // ENG-1 P0 (F-2): the same explicit attribution as the initial run, on the same pinned rubric — never `limit 1`.
      const claimedRows = await c.query('select distinct canonical_skill_id(skill_id) as skill_id from submission_claimed_skill where submission_id = $1', [e.submission_id]);
      const claimedSkillIds: string[] = claimedRows.rows.map((r) => r.skill_id as string);
      const scope = await this.policyScope(c);
      const attribution: LegacyAttribution | null = scope === 'per_skill' ? null : await this.attributeLegacyResult(c, e.activity_spec_id, claimedSkillIds, rubric);
      const primarySkillId: string | null = attribution?.kind === 'attributed' ? attribution.skillId : null;
      const currentState: EvidenceState = primarySkillId ? await this.currentClaimState(c, e.user_id, primarySkillId) : 'gap';

      let run = aggregateWithHumanDecisions({ rubric, deterministic, decisions: decisions.rows.map((d) => ({ criterionKey: d.criterion_key, score: Number(d.score), rationale: d.rationale })), currentState });
      if (attribution?.kind === 'unattributed') run = withheldPromotion(run, attribution.reason);
      if (scope === 'per_skill') run = withheldPromotion(run, PER_SKILL_WITHHELD);
      assertEvaluationResultValid({ outcome: run.outcome, rubricVersion: run.rubricVersion, activitySpecVersion: run.activitySpecVersion, criteria: run.criteria });

      const resultRow = await c.query(
        `insert into evaluation_result (evaluation_id, submission_id, user_id, outcome, rubric_version_id, activity_spec_id, activity_spec_version, supersedes_result_id, evaluated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8, now()) returning id, evaluated_at`,
        [evaluationId, e.submission_id, e.user_id, run.outcome, rubric.rubricVersionId, e.activity_spec_id, e.activity_spec_version, interim.rows[0].id]);
      const resultId: string = resultRow.rows[0].id;
      for (const cr of run.criteria) {
        await c.query(`insert into evaluation_criterion_score (evaluation_result_id, criterion_key, score, max_score, rationale, supporting_excerpt, skill_id, confidence) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [resultId, cr.criterionId, cr.score, cr.maxScore, cr.rationale, cr.supportingExcerpt, cr.skillId, cr.confidence]);
      }
      for (const ic of run.integrityChecks) {
        await c.query(`insert into integrity_check (evaluation_result_id, check_key, classification, passed, signal) values ($1,$2,$3,$4,$5)`, [resultId, ic.key, ic.classification, ic.passed, ic.passed ? null : 'unmet']);
      }
      await c.query(`update evaluation set state = 'completed', completed_at = now() where id = $1`, [evaluationId]);
      await emitAuditEvent(c, { eventType: 'evaluation.completed', userId: e.user_id, actorKind: 'system', subjectTable: 'evaluation_result', subjectId: resultId,
        reason: `${run.reason} (aggregated from deterministic results and ${decisions.rowCount} human decision(s))`, payload: { outcome: run.outcome, score: run.totalScore, maxScore: run.maxScore, supersedes: interim.rows[0].id,
          attribution: auditAttribution(attribution, claimedSkillIds) } });
      // Phase 3: the aggregate assessment (rule facts + human criterion decisions) beside the final result.
      const assessment = await this.assessments.recordAssessment(c, {
        evaluationResultId: resultId, evaluationId, submissionId: e.submission_id, userId: e.user_id, evaluatorKind: 'human',
        evaluatorRef: `human-review:${evaluationId}`, rubric, run, artifacts: await this.loadArtifacts(c, e.submission_id),
        humanDecisions: decisions.rows.map((d) => ({ criterionKey: d.criterion_key as string, score: Number(d.score), rationale: d.rationale as string })),
      });

      const humanDecided = decisions.rows.map((d) => String(d.criterion_key));
      const finalArtifacts = await this.loadArtifacts(c, e.submission_id);
      let perSkill: PerSkillResult[] = [];
      const outcome = scope === 'per_skill'
        ? await this.applyPerSkill(c, {
          assessmentId: assessment.assessmentId, trackConfigVersionId: assessment.trackConfigVersionId, evaluatorKind: 'human', resultId, userId: e.user_id, projectId: e.project_id,
          claimedSkillIds, run, rubric, rubricResolution: await this.rubricResolutionOf(c, rubric.rubricVersionId), artifacts: finalArtifacts, humanDecidedCriteria: humanDecided,
        }).then((r) => { perSkill = r.skills; return r; })
        : primarySkillId
        ? await this.decideAndApply(c, {
          policyKey: 'default', assessmentId: assessment.assessmentId, assessmentConfidence: assessment.confidence, trackConfigVersionId: assessment.trackConfigVersionId, evaluatorKind: 'human',
          basis: await this.basisFor(c, rubric, finalArtifacts, humanDecided),
          resultId, userId: e.user_id, skillId: primarySkillId, claimedSkillIds, currentState, run, rubric, projectId: e.project_id,
          acceptedReason: `deterministic checks and human review met every mandatory criterion (${run.totalScore}/${run.maxScore})`,
        })
        : await this.recordUnattributed(c, { assessmentId: assessment.assessmentId, resultId, userId: e.user_id, claimedSkillIds, trackConfigVersionId: assessment.trackConfigVersionId,
          confidence: assessment.confidence, reason: (attribution as Extract<LegacyAttribution, { kind: 'unattributed' }>).reason });
      const transition = outcome.transition; const reestablishedEvidenceId = outcome.reestablishedEvidenceId;
      await this.ledger.recordEvaluation(c, {
        userId: e.user_id, submissionId: e.submission_id, projectId: e.project_id, activitySpecId: e.activity_spec_id, evaluationResultId: resultId,
        outcome: run.outcome, totalScore: run.totalScore, maxScore: run.maxScore,
        evidenceId: scope === 'per_skill' ? null : transition?.evidenceId ?? reestablishedEvidenceId, skillId: primarySkillId,
        ...(scope === 'per_skill' ? { perSkill: perSkill.map((x) => ({ skillId: x.skillId, evidenceId: x.evidenceId })) } : {}),
      });
      if (scope === 'per_skill') {
        for (const x of perSkill) {
          await this.progress.apply(c, { userId: e.user_id, skillId: x.skillId, trigger: 'evaluation.completed', facts: { outcome: run.outcome, produced_evidence: x.evidenceId !== null },
            eventRef: { table: 'evaluation_result', id: resultId }, reason: x.reason, actorKind: 'system' });
        }
      } else {
        await this.progress.applyAll(c, primarySkillId ? [primarySkillId] : claimedSkillIds, { userId: e.user_id, trigger: 'evaluation.completed',
          facts: { outcome: run.outcome, produced_evidence: (transition?.evidenceId ?? reestablishedEvidenceId) !== null },
          eventRef: { table: 'evaluation_result', id: resultId }, reason: run.reason, actorKind: 'system' });
      }
      return { evaluationId, resultId, userId: e.user_id as string, outcome: run.outcome, totalScore: run.totalScore, maxScore: run.maxScore, reason: run.reason, criteria: run.criteria,
        integrityChecks: run.integrityChecks.filter((i) => i.classification === 'user_facing').map((i) => ({ key: i.key, passed: i.passed, message: i.message })), transition, reestablishedEvidenceId,
        verification: { decision: outcome.decision, reason: outcome.decisionReason }, evaluatedAt: resultRow.rows[0].evaluated_at, skills: perSkill.map(learnerSafeSkill) };
    });
  }

  /**
   * Phase 3 — verification through the named policy, then the legacy writes
   * exactly as before (verification row, promotion or re-establishment), then
   * the structured decision. Per-skill derivation (H6) runs only when the
   * policy enables it; the seeded draft does not.
   */
  private async decideAndApply(c: PoolClient, p: {
    policyKey: string; assessmentId: string; assessmentConfidence: number | null; trackConfigVersionId: string | null; evaluatorKind: 'rule' | 'human'; basis: AssessmentBasis;
    resultId: string; userId: string; skillId: string; claimedSkillIds: string[]; currentState: EvidenceState;
    run: EvaluationRun; rubric: PublishedRubric; projectId: string; acceptedReason: string;
  }): Promise<{ transition: { from: EvidenceState; to: EvidenceState; evidenceId: string } | null; reestablishedEvidenceId: string | null; policy: VerificationPolicy; decision: string; decisionReason: string }> {
    const { policy, resolution } = await this.assessments.loadPolicy(c, p.policyKey);
    const standing = await c.query('select count(*)::int as n from evidence where user_id = $1 and skill_id = $2 and withdrawn_at is null', [p.userId, p.skillId]);
    const pd = this.assessments.decide(policy, {
      evaluationOutcome: p.run.outcome, proposedState: p.run.proposedState, currentState: p.currentState, assessmentEvaluatorKind: p.evaluatorKind,
      assessmentConfidence: p.assessmentConfidence, independentEvidenceCount: Number(standing.rows[0].n), reason: p.acceptedReason,
      basis: p.basis, production: isProduction(),
    });
    // D-118: may this assessment support a level at all? (the same test the policy applied)
    const levelSupported = policy.promotionBasis === 'legacy_any_pass' ? !isProduction() : p.basis.independentlyVerified;
    let transition: { from: EvidenceState; to: EvidenceState; evidenceId: string } | null = null;
    let reestablishedEvidenceId: string | null = null;
    let verificationId: string | null = null;
    let record: Parameters<AssessmentRecorderService['recordDecision']>[1]['decision'] = pd;

    if (pd.legacyOutcome) {
      // Unchanged legacy write: at most one verification per result.
      const v = await c.query(
        `insert into verification (evaluation_result_id, user_id, outcome, proposed_state, resulting_state, reason)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [p.resultId, p.userId, pd.legacyOutcome, p.run.proposedState, pd.resultingState, pd.reason]);
      verificationId = v.rows[0].id;
      if (pd.resultingState !== p.currentState) {
        transition = await this.promote(c, { userId: p.userId, skillId: p.skillId, from: p.currentState, to: pd.resultingState,
          evaluationResultId: p.resultId, rubricVersion: p.run.rubricVersion, projectId: p.projectId, reason: pd.reason });
      }
    } else if (p.run.outcome === 'passed' && !p.run.proposedState && levelSupported
               && reestablishmentAllowed({ currentState: p.currentState, proposedState: p.rubric.proposesState,
                    primaryEvidenceStanding: await this.primaryEvidenceStanding(c, p.userId, p.skillId) })) {
      // D-077: the claim is already at this state but its evidence was withdrawn;
      // this pass earns the same state again. New evidence, no transition.
      reestablishedEvidenceId = await this.reestablish(c, { userId: p.userId, skillId: p.skillId, state: p.currentState,
        evaluationResultId: p.resultId, projectId: p.projectId, reason: p.run.reason });
      record = { decision: 'evidence_reestablished', previousState: p.currentState, proposedState: null, resultingState: p.currentState, reason: p.run.reason };
    }
    await this.assessments.recordDecision(c, { assessmentId: p.assessmentId, evaluationResultId: p.resultId, userId: p.userId, skillId: p.skillId, policy, policyResolution: resolution, trackConfigVersionId: p.trackConfigVersionId,
      decision: record, confidence: p.assessmentConfidence, verificationId, evidenceId: transition?.evidenceId ?? reestablishedEvidenceId });

    // H6 — per-skill evidence derivation from criteria. Behind the policy flag; the draft default keeps it off.
    if (policy.perSkillEvidenceDerivation && pd.legacyOutcome === 'accepted' && p.run.proposedState) {
      await this.deriveEvidencePerSkill(c, { ...p, policy, policyResolution: resolution, proposedState: p.run.proposedState });
    }
    return { transition, reestablishedEvidenceId, policy, decision: record.decision, decisionReason: record.reason };
  }

  /** D-118: whether this assessment rests on independently verified criteria with SME-approved, non-demo rubric values. */
  private async basisFor(c: PoolClient, rubric: PublishedRubric, artifacts: readonly SubmissionArtifact[], humanDecidedCriteria: readonly string[]): Promise<AssessmentBasis> {
    const rv = (await c.query('select is_demo_fixture, values_approved_at from rubric_version where id = $1', [rubric.rubricVersionId])).rows[0];
    return assessmentBasis({ rubric, artifacts, humanDecidedCriteria, rubricValuesApproved: !!rv?.values_approved_at, rubricIsDemo: rv ? rv.is_demo_fixture === true : true });
  }

  /** H6 (policy-gated): every OTHER claimed skill whose skill_evidence criteria were all met earns the same decision. */
  private async deriveEvidencePerSkill(c: PoolClient, p: {
    policy: VerificationPolicy; policyResolution: ConfigResolution; trackConfigVersionId: string | null; assessmentId: string; assessmentConfidence: number | null; evaluatorKind: 'rule' | 'human'; basis: AssessmentBasis;
    resultId: string; userId: string; skillId: string; claimedSkillIds: string[]; run: EvaluationRun; rubric: PublishedRubric; projectId: string; acceptedReason: string; proposedState: EvidenceState;
  }): Promise<void> {
    const evidenced = skillsEvidencedByRun(p.rubric, p.run);
    for (const skillId of new Set(p.claimedSkillIds)) {
      if (skillId === p.skillId || !evidenced.includes(skillId)) continue;
      const current = await this.currentClaimState(c, p.userId, skillId);
      if (evidenceOrdinal(p.proposedState) <= evidenceOrdinal(current)) continue;
      const standing = await c.query('select count(*)::int as n from evidence where user_id = $1 and skill_id = $2 and withdrawn_at is null', [p.userId, skillId]);
      const pd: PolicyDecision = this.assessments.decide(p.policy, {
        evaluationOutcome: p.run.outcome, proposedState: p.proposedState, currentState: current, assessmentEvaluatorKind: p.evaluatorKind,
        assessmentConfidence: p.assessmentConfidence, independentEvidenceCount: Number(standing.rows[0].n), basis: p.basis, production: isProduction(),
        reason: `${p.acceptedReason}; per-skill derivation (policy ${p.policy.key}@${p.policy.version}): every skill_evidence criterion of this skill was met`,
      });
      let evidenceId: string | null = null;
      if (pd.legacyOutcome === 'accepted' && pd.resultingState !== current) {
        evidenceId = (await this.promote(c, { userId: p.userId, skillId, from: current, to: pd.resultingState, evaluationResultId: p.resultId,
          rubricVersion: p.run.rubricVersion, projectId: p.projectId, reason: pd.reason })).evidenceId;
      }
      await this.assessments.recordDecision(c, { assessmentId: p.assessmentId, evaluationResultId: p.resultId, userId: p.userId, skillId, policy: p.policy, policyResolution: p.policyResolution, trackConfigVersionId: p.trackConfigVersionId,
        decision: pd, confidence: p.assessmentConfidence, verificationId: null, evidenceId });
    }
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
    evaluationResultId: string; rubricVersion: string; projectId: string; reason: string; skillAssessmentId?: string | null;
  }) {
    assertStateAvailableInProduction(p.to);
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
          provenance_class, provenance_source, confidence, skill_assessment_id)
       values ($1,$2,'platform_controlled',$3,$4,'system_derived',$5,1.0,$6)
       returning id`,
      [p.userId, p.skillId, p.evaluationResultId, p.projectId,
       `evaluation_result:${p.evaluationResultId}`, p.skillAssessmentId ?? null],
    );
    const evidenceId: string = evidence.rows[0].id;

    let claim = await c.query(
      `update skill_claim
          set state = $1, primary_evidence_id = $2, state_reason = $3
        where user_id = $4 and skill_id = $5
        returning id`,
      [p.to, evidenceId, p.reason, p.userId, p.skillId],
    );
    // D-118: under the safety basis a submission records no claim, so the first earned level creates it (from `gap`).
    if (claim.rowCount === 0 && p.from === 'gap') {
      claim = await c.query(`insert into skill_claim (user_id, skill_id, state, state_reason, primary_evidence_id) values ($1,$2,$3,$4,$5) returning id`,
        [p.userId, p.skillId, p.to, p.reason, evidenceId]);
    }
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
      payload: { from: p.from, to: p.to, rule: rule.id, evidenceId, ...(p.skillAssessmentId ? { skillAssessmentId: p.skillAssessmentId } : {}) },
    });

    return { from: p.from, to: p.to, evidenceId };
  }

  /** True while the claim's primary evidence exists and is not withdrawn. */
  private async primaryEvidenceStanding(c: PoolClient, userId: string, skillId: string): Promise<boolean> {
    const { rows } = await c.query(
      `select e.id from skill_claim sc join evidence e on e.id = sc.primary_evidence_id
        where sc.user_id = $1 and sc.skill_id = $2 and e.withdrawn_at is null`, [userId, skillId]);
    return rows.length > 0;
  }

  /** D-077 re-establishment: evidence only. The state and the ladder are untouched. */
  private async reestablish(c: PoolClient, p: {
    userId: string; skillId: string; state: EvidenceState; evaluationResultId: string; projectId: string; reason: string; skillAssessmentId?: string | null;
  }): Promise<string> {
    const evidence = await c.query(
      `insert into evidence
         (user_id, skill_id, source_strength, evaluation_result_id, project_id,
          provenance_class, provenance_source, confidence, skill_assessment_id)
       values ($1,$2,'platform_controlled',$3,$4,'system_derived',$5,1.0,$6)
       returning id`,
      [p.userId, p.skillId, p.evaluationResultId, p.projectId, `evaluation_result:${p.evaluationResultId}`, p.skillAssessmentId ?? null]);
    const evidenceId: string = evidence.rows[0].id;
    const claim = await c.query(
      `update skill_claim set primary_evidence_id = $1, state_reason = $2
        where user_id = $3 and skill_id = $4 and state = $5 returning id`,
      [evidenceId, `evidence re-established after withdrawal: ${p.reason}`, p.userId, p.skillId, p.state]);
    if (claim.rowCount === 0) throw new BadRequestException('no claim to re-establish evidence for');
    await emitAuditEvent(c, {
      eventType: 'evidence.reestablished', userId: p.userId, actorKind: 'system',
      subjectTable: 'skill_claim', subjectId: claim.rows[0].id, reason: p.reason,
      payload: { state: p.state, evidenceId, evaluationResultId: p.evaluationResultId },
    });
    return evidenceId;
  }

  /**
   * ENG-1 P3: the scope of the verification policy in effect. The per-skill scope is a development-only pathway: a
   * development_only row never resolves in production, and this refuses it again if it ever did (fail closed).
   */
  private async policyScope(c: PoolClient): Promise<AssessmentScope> {
    const scope = assessmentScopeOf((await this.assessments.loadPolicy(c, 'default')).policy);
    if (scope === 'per_skill' && isProduction()) {
      throw new BadRequestException('[per_skill_unavailable] the per-skill assessment pathway (ENG-1 P3) is a development pathway and never runs in production');
    }
    return scope;
  }

  /** How the pinned rubric version was resolved, read from its immutable binding (ENG-1 P0). */
  private async rubricResolutionOf(c: PoolClient, rubricVersionId: string): Promise<'bound' | 'legacy_unbound_single'> {
    const r = await c.query('select activity_spec_version from rubric_version where id = $1', [rubricVersionId]);
    return r.rows[0]?.activity_spec_version ? 'bound' : 'legacy_unbound_single';
  }

  /**
   * ENG-1 P3 — the per-skill writer (development pathway only). For every claimed (canonical) skill, independently:
   *   assess from that skill's OWN criteria (P1 domain) → record skill_assessment + the exact criterion results it rests on
   *   → decide from that assessment only → promote / re-establish that skill alone, with the evidence citing its assessment
   *   → record the decision against the assessment.
   * Nothing is written to the legacy single-skill `verification` table. The run-level proposal is withheld by the caller.
   */
  private async applyPerSkill(c: PoolClient, p: {
    assessmentId: string; trackConfigVersionId: string | null; evaluatorKind: 'rule' | 'human'; resultId: string; userId: string; projectId: string;
    claimedSkillIds: readonly string[]; run: EvaluationRun; rubric: PublishedRubric; rubricResolution: 'bound' | 'legacy_unbound_single';
    artifacts: readonly SubmissionArtifact[]; humanDecidedCriteria: readonly string[];
  }): Promise<{ transition: { from: EvidenceState; to: EvidenceState; evidenceId: string } | null; reestablishedEvidenceId: string | null; decision: string; decisionReason: string; skills: PerSkillResult[] }> {
    if (isProduction()) throw new BadRequestException('[per_skill_unavailable] the per-skill assessment pathway never runs in production');
    const { policy, resolution } = await this.assessments.loadPolicy(c, 'default');
    const rv = (await c.query('select is_demo_fixture, values_approved_at from rubric_version where id = $1', [p.rubric.rubricVersionId])).rows[0];
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const linked = [...new Set(p.rubric.criteria.filter(isValidSkillEvidenceCriterion).map((x) => x.skillId!))].filter((id) => UUID.test(id));
    const canonRows = linked.length ? (await c.query('select x::text as id, canonical_skill_id(x)::text as canonical from unnest($1::uuid[]) as x', [linked])).rows : [];
    const canonMap = new Map(canonRows.map((r) => [r.id as string, r.canonical as string]));
    const canonicalOf = (id: string) => canonMap.get(id) ?? id;
    const skillIds = [...new Set(p.claimedSkillIds)].sort();
    const currentStates: Record<string, EvidenceState> = {};
    for (const sk of skillIds) currentStates[sk] = await this.currentClaimState(c, p.userId, sk);

    const assessed = assessSkills({
      rubric: p.rubric, run: p.run, skillIds, claimedSkillIds: skillIds, currentStates, canonicalOf, artifacts: p.artifacts,
      humanDecidedCriteria: p.humanDecidedCriteria, rubricValuesApproved: !!rv?.values_approved_at, rubricIsDemo: rv ? rv.is_demo_fixture === true : true,
    });
    const skills: PerSkillResult[] = [];
    for (const a of assessed) {
      assertSkillAssessmentInvariants(a, p.rubric, canonicalOf);
      const sa = (await c.query(
        `insert into skill_assessment (assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version,
                                       activity_spec_id, activity_spec_version, rubric_resolution, track_config_version_id, claimed, outcome, basis_independently_verified,
                                       basis_reasons, confidence, current_state, proposed_state, reason)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning id`,
        [p.assessmentId, p.resultId, p.userId, a.skillId, a.context.modelVersion, DOMAIN_RULESET_VERSION, a.context.rubricVersionId, a.context.rubricVersion,
         a.context.activitySpecId, a.context.activitySpecVersion, p.rubricResolution, p.trackConfigVersionId, a.claimed, a.outcome, a.basis.independentlyVerified,
         a.basis.independentlyVerified ? [] : a.basis.reasons, a.confidence, a.currentState, a.proposedState, a.reason])).rows[0].id as string;
      for (const cr of a.criteria) {
        const acr = await c.query('select id from assessment_criterion_result where assessment_id = $1 and criterion_key = $2', [p.assessmentId, cr.key]);
        if (acr.rowCount === 0) throw new MissingPrerequisite('assessment_criterion_result', `criterion '${cr.key}' has no recorded result in assessment ${p.assessmentId}`);
        await c.query(
          `insert into skill_assessment_criterion (skill_assessment_id, assessment_criterion_result_id, user_id, criterion_key, status, score, max_score, threshold, threshold_status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [sa, acr.rows[0].id, p.userId, cr.key, cr.status, cr.score, cr.maxScore, cr.threshold, cr.thresholdStatus]);
      }
      // The skill's OWN standing evidence (distinct results, withdrawn never counts) — never another skill's.
      const own = (await c.query(`select canonical_skill_id(skill_id)::text as skill_id, evaluation_result_id::text, withdrawn_at::text from evidence where user_id = $1 and canonical_skill_id(skill_id) = $2`,
        [p.userId, a.skillId])).rows.map((r) => ({ skillId: r.skill_id as string, evaluationResultId: r.evaluation_result_id as string | null, withdrawnAt: r.withdrawn_at as string | null }));
      const pd = decideSkillAssessment(policy, a, { independentEvidenceCount: standingEvidenceForSkill(own, a.skillId), production: isProduction(), evaluatorKind: p.evaluatorKind });
      let transition: { from: EvidenceState; to: EvidenceState; evidenceId: string } | null = null;
      let reestablished: string | null = null;
      let record: Parameters<AssessmentRecorderService['recordDecision']>[1]['decision'] = pd;
      if (pd.decision === 'accepted' && pd.resultingState !== a.currentState) {
        transition = await this.promote(c, { userId: p.userId, skillId: a.skillId, from: a.currentState, to: pd.resultingState, evaluationResultId: p.resultId,
          rubricVersion: p.rubric.version, projectId: p.projectId, reason: pd.reason, skillAssessmentId: sa });
      } else if (a.claimed && a.outcome === 'met' && a.proposedState === null && a.basis.independentlyVerified
                 && reestablishmentAllowed({ currentState: a.currentState, proposedState: p.rubric.proposesState, primaryEvidenceStanding: await this.primaryEvidenceStanding(c, p.userId, a.skillId) })) {
        // D-077 for this skill alone: its own evidence was withdrawn; its own criteria earn the same state again.
        reestablished = await this.reestablish(c, { userId: p.userId, skillId: a.skillId, state: a.currentState, evaluationResultId: p.resultId, projectId: p.projectId, reason: a.reason, skillAssessmentId: sa });
        record = { decision: 'evidence_reestablished', previousState: a.currentState, proposedState: null, resultingState: a.currentState, reason: `skill ${a.skillId}: ${a.reason}; evidence re-established` };
      } else {
        // ENG-1 P4 (policy flag, development only): an independent task on a skill already at this rubric's level leaves
        // corroborating evidence — the only way a second task can count for EXT-2. No level change, no claim change.
        const corr = decideCorroboration(policy, a, { rubricProposesState: p.rubric.proposesState, production: isProduction(), evaluatorKind: p.evaluatorKind });
        if (corr) {
          reestablished = await this.corroborate(c, { userId: p.userId, skillId: a.skillId, state: a.currentState, evaluationResultId: p.resultId, projectId: p.projectId, reason: corr.reason, skillAssessmentId: sa });
          record = corr;
        }
      }
      await this.assessments.recordDecision(c, { assessmentId: p.assessmentId, evaluationResultId: p.resultId, userId: p.userId, skillId: a.skillId, policy, policyResolution: resolution,
        trackConfigVersionId: p.trackConfigVersionId, decision: record, confidence: a.confidence, verificationId: null, evidenceId: transition?.evidenceId ?? reestablished, skillAssessmentId: sa });
      skills.push({
        skillId: a.skillId, skillAssessmentId: sa, claimed: a.claimed, outcome: a.outcome, currentState: a.currentState, proposedState: a.proposedState, reason: a.reason,
        basisIndependentlyVerified: a.basis.independentlyVerified, basisReasons: a.basis.reasons,
        criteria: a.criteria.map((x) => ({ key: x.key, status: x.status, score: x.score, maxScore: x.maxScore, threshold: x.threshold, thresholdStatus: x.thresholdStatus, evaluatorKind: x.evaluatorKind })),
        decision: { decision: record.decision, previousState: record.previousState, resultingState: record.resultingState, reason: record.reason },
        evidenceId: transition?.evidenceId ?? reestablished, transition,
      });
    }
    // Backward-compatible summary fields: the first level change (if any) and one representative decision.
    const moved = skills.find((x) => x.transition !== null);
    const summary = moved ?? skills.find((x) => x.decision.decision === 'evidence_reestablished') ?? skills.find((x) => x.decision.decision === 'assessment_pending_validation') ?? skills[0];
    return {
      transition: moved?.transition ?? null,
      reestablishedEvidenceId: moved ? null : skills.find((x) => x.decision.decision === 'evidence_reestablished')?.evidenceId ?? null,
      decision: summary?.decision.decision ?? 'not_applicable',
      decisionReason: summary ? `per-skill assessment (${skills.length} skill(s)): ${summary.decision.reason}` : 'per-skill assessment: no claimed skill',
      skills,
    };
  }

  /** ENG-1 P4 corroborating evidence: a new standing evidence row citing its skill assessment. The claim, its level and its primary evidence are untouched. */
  private async corroborate(c: PoolClient, p: {
    userId: string; skillId: string; state: EvidenceState; evaluationResultId: string; projectId: string; reason: string; skillAssessmentId: string;
  }): Promise<string> {
    const evidence = await c.query(
      `insert into evidence
         (user_id, skill_id, source_strength, evaluation_result_id, project_id,
          provenance_class, provenance_source, confidence, skill_assessment_id)
       values ($1,$2,'platform_controlled',$3,$4,'system_derived',$5,1.0,$6)
       returning id`,
      [p.userId, p.skillId, p.evaluationResultId, p.projectId, `evaluation_result:${p.evaluationResultId}`, p.skillAssessmentId]);
    const evidenceId: string = evidence.rows[0].id;
    await emitAuditEvent(c, {
      eventType: 'evidence.corroborated', userId: p.userId, actorKind: 'system', subjectTable: 'evidence', subjectId: evidenceId, reason: p.reason,
      payload: { state: p.state, evidenceId, evaluationResultId: p.evaluationResultId, skillAssessmentId: p.skillAssessmentId, levelChange: false },
    });
    return evidenceId;
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

  /**
   * Graduate journey Phase 1: the rubric an evaluation of this activity would use, or null when none could
   * run (none published, or not runnable). The same resolution as the evaluation itself, so the activity
   * catalogue's assessment mode describes exactly what an evaluation would do.
   */
  async publishedRubricOrNull(c: PoolClient, activitySpecId: string, activitySpecVersion: string): Promise<PublishedRubric | null> {
    try { return await this.loadPublishedRubric(c, activitySpecId, activitySpecVersion); } catch (e) { if (e instanceof BadRequestException) return null; throw e; }
  }

  /**
   * ENG-1 P0 (F-8): the rubric version bound to the submission's activity version (domain `resolveRubricVersion`).
   * Refused — before anything is written — when it cannot be resolved without guessing.
   */
  private async resolveRubricVersionId(c: PoolClient, activitySpecId: string, submissionActivityVersion: string | null): Promise<{ rubricVersionId: string; resolution: Exclude<RubricResolution['kind'], 'unresolved'> }> {
    const cands = await c.query(`select id, status::text as status, activity_spec_version from rubric_version where activity_spec_id = $1`, [activitySpecId]);
    const act = await c.query('select version from activity_spec where id = $1', [activitySpecId]);
    const r = resolveRubricVersion({
      candidates: cands.rows.map((x) => ({ id: x.id as string, status: x.status as string, activitySpecVersion: (x.activity_spec_version as string | null) ?? null })),
      submissionActivityVersion, currentActivityVersion: act.rows[0]?.version as string,
    });
    if (r.kind === 'unresolved') throw new BadRequestException(`[rubric_version_unresolved] ${r.reason}`);
    return { rubricVersionId: r.rubricVersionId, resolution: r.kind };
  }

  /**
   * ENG-1 P0 (F-1/F-2/F-9): which ONE claimed skill a whole-activity result may move — or none.
   * Inputs are canonical ids from governed content: the activity's `primary` mapping and the rubric's valid criteria.
   */
  private async attributeLegacyResult(c: PoolClient, activitySpecId: string, claimedCanonicalSkillIds: readonly string[], rubric: PublishedRubric): Promise<LegacyAttribution> {
    const primaries = await c.query(`select distinct canonical_skill_id(skill_id) as id from activity_skill where activity_spec_id = $1 and depth = 'primary'`, [activitySpecId]);
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const linked = [...new Set(rubric.criteria.filter(isValidSkillEvidenceCriterion).map((x) => x.skillId!))].filter((id) => UUID.test(id));
    const canon = linked.length ? (await c.query('select x::text as id, canonical_skill_id(x)::text as canonical from unnest($1::uuid[]) as x', [linked])).rows : [];
    const map = new Map(canon.map((r) => [r.id as string, r.canonical as string]));
    return attributeLegacyPrimarySkill({
      claimedSkillIds: claimedCanonicalSkillIds,
      activityPrimarySkillIds: primaries.rows.map((r) => r.id as string),
      coveredSkillIds: skillsCoveredByRubric(rubric, (id) => map.get(id) ?? id),
    });
  }

  /**
   * ENG-1 P0: the result could not be attributed to one skill. A `not_applicable` decision is recorded for each
   * claimed skill (so the record is complete); no verification row, no evidence, no transition.
   */
  private async recordUnattributed(c: PoolClient, p: {
    assessmentId: string; resultId: string; userId: string; claimedSkillIds: readonly string[]; trackConfigVersionId: string | null; confidence: number | null; reason: string;
  }): Promise<{ transition: null; reestablishedEvidenceId: null; policy: VerificationPolicy; decision: string; decisionReason: string }> {
    const { policy, resolution } = await this.assessments.loadPolicy(c, 'default');
    let last = '';
    for (const skillId of [...new Set(p.claimedSkillIds)].sort()) {
      const d = unattributedDecision(policy, { currentState: await this.currentClaimState(c, p.userId, skillId), reason: p.reason });
      last = d.reason;
      await this.assessments.recordDecision(c, { assessmentId: p.assessmentId, evaluationResultId: p.resultId, userId: p.userId, skillId, policy, policyResolution: resolution,
        trackConfigVersionId: p.trackConfigVersionId, decision: d, confidence: p.confidence, verificationId: null, evidenceId: null });
    }
    return { transition: null, reestablishedEvidenceId: null, policy, decision: 'not_applicable', decisionReason: last };
  }

  private async loadPublishedRubric(
    c: PoolClient, activitySpecId: string, activitySpecVersion: string, rubricVersionId: string | null = null,
  ): Promise<PublishedRubric> {
    const { rows } = await c.query(
      `select id, version, status, criteria, pass_threshold, proposes_state
         from rubric_version
        where activity_spec_id = $1 and status = 'published' and ($2::uuid is null or id = $2::uuid)
        order by created_at desc limit 1`,
      [activitySpecId, rubricVersionId],
    );
    if (rows.length === 0) {
      // INV-2: without a published rubric there is no evaluation to run.
      throw new BadRequestException('no published rubric for this activity');
    }
    const rv = rows[0];

    // Career Data Foundation: rubric_criterion rows are authoritative. The JSONB
    // column is a legacy snapshot used only when no rows exist.
    const crit = await c.query(
      `select key, name_ar, linked_skill_id, criterion_kind, max_score, mandatory, evaluator_type, check_type,
              check_artifact_key, check_min_value, check_min_length, check_artifact_keys,
              rationale_when_met_ar, rationale_when_unmet_ar, threshold_for_skill, threshold_status::text as threshold_status,
              (select array_agg(l.score order by l.score) from rubric_criterion_level l where l.criterion_id = rubric_criterion.id) as level_scores
         from rubric_criterion where rubric_version_id = $1 order by position, key`,
      [rv.id],
    );
    if (crit.rows.length > 0) {
      // Human/llm criteria are not run here: the evaluator lists them as pending
      // and the human review flow decides them (OPEN-041).
      const toCheck = (r: typeof crit.rows[number]): RubricCriterion['check'] => {
        switch (r.check_type) {
          case 'artifact_present': return { type: 'artifact_present', artifactKey: r.check_artifact_key };
          case 'artifact_at_least': return { type: 'artifact_at_least', artifactKey: r.check_artifact_key, min: Number(r.check_min_value) };
          case 'artifact_text': return { type: 'artifact_text', artifactKey: r.check_artifact_key, minLength: Number(r.check_min_length) };
          case 'all_of': return { type: 'all_of', artifactKeys: r.check_artifact_keys };
          default: return null;
        }
      };
      if (rv.pass_threshold === null || rv.proposes_state === null) {
        throw new BadRequestException('a normalized rubric must state pass_threshold and proposes_state');
      }
      return {
        rubricVersionId: rv.id, version: rv.version, activitySpecId, activitySpecVersion, status: 'published',
        passThreshold: Number(rv.pass_threshold), proposesState: rv.proposes_state as EvidenceState,
        criteria: crit.rows.map((r) => ({
          // OPEN-044: a gate/quality criterion carries no skill; it can never feed skill evidence.
          key: r.key, label: r.name_ar, maxScore: Number(r.max_score), kind: r.criterion_kind, skillId: r.linked_skill_id, mandatory: r.mandatory,
          evaluatorType: r.evaluator_type, check: r.evaluator_type === 'rule' ? toCheck(r) : null,
          rationaleWhenMet: r.rationale_when_met_ar, rationaleWhenUnmet: r.rationale_when_unmet_ar,
          // ENG-1 P0 audit: carried, never read by the legacy evaluator (grading unchanged).
          thresholdForSkill: r.threshold_for_skill === null ? null : Number(r.threshold_for_skill), thresholdStatus: r.threshold_status ?? null,
          // ENG-1 P3: the scoring scale an approved threshold must be representable on (read only by the per-skill pathway).
          levelScores: Array.isArray(r.level_scores) ? (r.level_scores as unknown[]).map(Number) : null,
        })),
      };
    }

    const body = rv.criteria as { passThreshold: number; proposesState: EvidenceState; criteria: unknown[] } | null;
    if (!body) throw new BadRequestException('published rubric has neither criterion rows nor a legacy snapshot');
    return {
      rubricVersionId: rv.id,
      version: rv.version,
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
      `select key, kind, value_bool, value_number, value_text, locator, upload_id
         from submission_artifact where submission_id = $1`,
      [submissionId],
    );
    // D-118: where each fact came from. A confirmed upload proves a file was submitted; a link that a link was
    // given; everything else the submitter sent is a declaration. Nothing here is platform-verified: no producer
    // of verified facts exists yet (that namespace is reserved and refused from clients).
    return rows.map((r) => ({
      key: r.key,
      kind: r.kind,
      provenance: (r.kind === 'file' && r.upload_id ? 'uploaded_file' : r.kind === 'link' ? 'submitted_link' : 'declared') as ArtifactProvenance,
      ...(r.value_bool !== null ? { valueBool: r.value_bool } : {}),
      ...(r.value_number !== null ? { valueNumber: Number(r.value_number) } : {}),
      ...(r.value_text !== null ? { valueText: r.value_text } : {}),
      ...(r.locator !== null ? { locator: r.locator } : {}),
    }));
  }

  private async loadIntegritySpecs(c: PoolClient, activitySpecId: string): Promise<IntegrityCheckSpec[]> {
    const { rows } = await c.query(
      `select key, classification, blocking, check_definition, user_facing_message, evaluation_mode, active
         from integrity_check_spec where activity_spec_id = $1 order by key`,
      [activitySpecId],
    );
    // OPEN-045: the evaluator runs only active deterministic checks; human-observable
    // ones reach the reviewer of their criterion; inactive ones are neither run nor blocking.
    return rows.map((r) => ({
      key: r.key,
      classification: r.classification,
      blocking: r.blocking,
      check: r.check_definition,
      userFacingMessage: r.user_facing_message,
      mode: r.evaluation_mode,
      active: r.active,
    }));
  }

  /**
   * Graduate journey Phase 1 — the read path for an evaluation, in every state. It never creates or reruns
   * anything. Fields:
   *   - the legacy GET fields (`evaluationId`, `state`, `resultId`, `outcome`, `criteria` rows, `integrityChecks`,
   *     `humanReview.{pending,completed,awaiting}`, `verification` = the legacy verification row);
   *   - the fields the evaluate response carries, so a reopened evaluation renders like a fresh one
   *     (`totalScore`, `maxScore`, `reason`, `transition`, `verification.decision`, `humanReview.pendingCriteria`);
   *   - `workStatus`, from authoritative records, and `verificationDecision` (D-118, including
   *     `assessment_pending_validation`).
   * A submission with no evaluation yet answers `state: 'not_evaluated'` — an explicit evaluate action is
   * available — instead of an error.
   */
  async getEvaluationForSubmission(userId: string, submissionId: string) {
    const view = await this.db.asUser(userId, async (c) => {
      const owned = await c.query('select id from submission where id = $1', [submissionId]);
      // RLS already filtered by owner: "not yours" and "does not exist" are the same answer.
      if (owned.rowCount === 0) throw new NotFoundException('submission not found');
      const { rows } = await c.query(
        `select e.id, e.state, e.queued_at, e.completed_at,
                r.id as result_id, r.outcome, r.activity_spec_id, r.activity_spec_version, r.rubric_version_id, r.evaluated_at,
                -- a blocked result records no activity; the project still names it (for user-facing check messages)
                (select p.activity_spec_id from submission s join project p on p.id = s.project_id where s.id = e.submission_id) as project_activity_id
           from evaluation e
           left join evaluation_result r on r.evaluation_id = e.id
             and not exists (select 1 from evaluation_result n where n.supersedes_result_id = r.id)
          where e.submission_id = $1
          order by e.queued_at desc, r.evaluated_at desc nulls last limit 1`,
        [submissionId],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      const criteria = r.result_id ? (await c.query(
        `select criterion_key, criterion_key as "criterionId", score, max_score, max_score as "maxScore", rationale, supporting_excerpt
           from evaluation_criterion_score where evaluation_result_id = $1 order by criterion_key`, [r.result_id])).rows : [];
      const legacy = r.result_id ? (await c.query(
        `select outcome, proposed_state, resulting_state, reason, decided_at from verification where evaluation_result_id = $1`, [r.result_id])).rows[0] ?? null : null;
      const decisions = r.result_id ? (await c.query(
        `select decision, previous_state, resulting_state, reason, evidence_id, skill_id, skill_assessment_id from verification_decision where evaluation_result_id = $1 order by decided_at`, [r.result_id])).rows : [];
      // ENG-1 P3 read model (owner-only under RLS): the per-skill assessments of this result, with the criteria each rests on.
      const assessed = r.result_id ? (await c.query(
        `select id, skill_id, claimed, outcome, current_state, proposed_state, basis_independently_verified, rubric_version_id, rubric_version, rubric_resolution
           from skill_assessment where evaluation_result_id = $1 order by skill_id`, [r.result_id])).rows : [];
      const assessedCriteria = assessed.length ? (await c.query(
        `select sc.skill_assessment_id, sc.criterion_key, sc.status, sc.score, sc.max_score, sc.threshold, sc.threshold_status, acr.evaluator_kind
           from skill_assessment_criterion sc join assessment_criterion_result acr on acr.id = sc.assessment_criterion_result_id
          where sc.skill_assessment_id = any($1::uuid[]) order by sc.criterion_key`, [assessed.map((x) => x.id)])).rows : [];
      const evidenceIds = decisions.map((d) => d.evidence_id).filter((x): x is string => !!x);
      const evidence = evidenceIds.length ? (await c.query('select id, withdrawn_at from evidence where id = any($1::uuid[])', [evidenceIds])).rows : [];
      return { r, criteria, legacy, decisions, assessed, assessedCriteria, evidence };
    });

    if (!view) {
      return { submissionId, evaluationId: null, state: 'not_evaluated' as const, workStatus: 'submitted' as WorkStatus, resultId: null, outcome: null,
        totalScore: null, maxScore: null, reason: null, criteria: [], integrityChecks: [], transition: null, verification: null, verificationDecision: null,
        humanReview: null, evaluatedAt: null, activitySpecVersion: null, rubricVersion: null, levelAttribution: null, skills: [], actions: { evaluate: true } };
    }
    const { r, criteria, legacy, decisions, assessed, assessedCriteria, evidence } = view;

    // Facts the user may know that live in service-only tables (queue, check messages, the run's reason, rubric size),
    // read for THIS user's own evaluation only (ownership was established above under RLS).
    const svc = await this.db.asService(async (sc) => {
      const queue = r.state === 'queued_for_human' ? (await sc.query(
        `select q.criterion_key, q.state, rc.name_ar from review_queue_item q join rubric_criterion rc on rc.id = q.criterion_id where q.evaluation_id = $1 order by q.criterion_key`, [r.id])).rows : [];
      // Only user-facing checks cross this boundary. integrity_check has no client policy (assessment-only rows
      // live beside them), so the user's own result is read here, filtered to user-facing.
      const integrity = r.result_id ? (await sc.query(
        `select check_key, passed from integrity_check where evaluation_result_id = $1 and classification = 'user_facing' order by check_key`, [r.result_id])).rows : [];
      const messages = r.project_activity_id ? (await sc.query(
        `select key, user_facing_message from integrity_check_spec where activity_spec_id = $1 and classification = 'user_facing'`, [r.project_activity_id])).rows : [];
      const event = r.result_id ? (await sc.query(
        `select reason, payload->'attribution' as attribution from audit_event where subject_table = 'evaluation_result' and subject_id = $1 order by occurred_at desc limit 1`, [r.result_id])).rows[0] ?? null : null;
      const reason = event?.reason ?? null;
      const rubric = r.rubric_version_id ? (await sc.query(
        `select rv.version, (select sum(max_score) from rubric_criterion c where c.rubric_version_id = rv.id) as max_total from rubric_version rv where rv.id = $1`, [r.rubric_version_id])).rows[0] ?? null : null;
      // ENG-1 P0 / O-1: how the legacy path attributed this result (recorded on the result's audit event). Null for history before P0.
      const a = event?.attribution as { skillId?: string; unattributed?: string; perSkill?: boolean } | null | undefined;
      const levelAttribution: 'attributed' | 'ambiguous' | 'no_candidate' | 'per_skill' | null =
        !a ? null : a.perSkill ? 'per_skill' : a.skillId ? 'attributed' : a.unattributed === 'ambiguous' ? 'ambiguous' : a.unattributed === 'no_candidate' ? 'no_candidate' : null;
      // Skill names for the per-skill read model (labels are catalogue data; ids come from this user's own rows).
      const labels = assessed.length ? (await sc.query('select id, slug, label_ar, label_en from skill where id = any($1::uuid[])', [assessed.map((x) => x.skill_id)])).rows : [];
      // P5: the learner-facing NAME of each criterion (already shown in the human-review awaiting list) — never its levels,
      // descriptors, observations, threshold or checks, which stay reviewer-only.
      const criterionNames = assessed.length ? (await sc.query('select key, name_ar from rubric_criterion where rubric_version_id = $1', [assessed[0]!.rubric_version_id])).rows : [];
      return { queue, integrity, messages, reason, rubric, levelAttribution, labels, criterionNames };
    });

    const humanReview = r.state === 'queued_for_human' ? {
      pending: svc.queue.filter((x) => x.state !== 'completed').length, completed: svc.queue.filter((x) => x.state === 'completed').length,
      awaiting: svc.queue.filter((x) => x.state !== 'completed').map((x) => ({ criterionKey: x.criterion_key, nameAr: x.name_ar })),
      pendingCriteria: svc.queue.filter((x) => x.state !== 'completed').map((x) => x.criterion_key as string),
      completedCriteria: svc.queue.filter((x) => x.state === 'completed').map((x) => x.criterion_key as string),
    } : null;
    const pending = decisions.find((d) => d.decision === 'assessment_pending_validation');
    const moved = decisions.find((d) => d.evidence_id && d.resulting_state && d.resulting_state !== d.previous_state && d.decision !== 'assessment_pending_validation');
    // ENG-1 P3: on a per-skill result the representative decision is the one that moved a level, if any (each skill's own is in `skills`).
    const decision = (assessed.length > 0 ? moved ?? decisions.find((d) => d.decision === 'evidence_reestablished') ?? pending : pending) ?? decisions[0] ?? null;
    const skills = assessed.map((x) => {
      const d = decisions.find((y) => y.skill_assessment_id === x.id) ?? null;
      const ev = d?.evidence_id ? evidence.find((e) => e.id === d.evidence_id) ?? null : null;
      const label = svc.labels.find((l) => l.id === x.skill_id);
      // P5 learner-safe projection: outcomes, own criteria (name, status, score) and the decision — no threshold values,
      // no rubric levels or descriptors, no internal reason strings or verification-basis details.
      return {
        skillId: x.skill_id as string, skillSlug: (label?.slug as string | undefined) ?? null, skillLabelAr: (label?.label_ar as string | undefined) ?? null,
        skillAssessmentId: x.id as string, claimed: x.claimed as boolean, outcome: x.outcome as string,
        currentState: x.current_state as EvidenceState, proposedState: (x.proposed_state as EvidenceState | null) ?? null,
        basisIndependentlyVerified: x.basis_independently_verified as boolean,
        rubricVersion: x.rubric_version as string, rubricResolution: x.rubric_resolution as string,
        criteria: assessedCriteria.filter((c) => c.skill_assessment_id === x.id).map((c) => ({ key: c.criterion_key as string,
          nameAr: (svc.criterionNames.find((n) => n.key === c.criterion_key)?.name_ar as string | undefined) ?? null, status: c.status as string,
          score: c.score === null ? null : Number(c.score), maxScore: Number(c.max_score), evaluatorKind: c.evaluator_kind as string })),
        decision: d ? { decision: d.decision as string, previousState: d.previous_state as EvidenceState, resultingState: d.resulting_state as EvidenceState } : null,
        evidence: ev ? { id: ev.id as string, withdrawn: ev.withdrawn_at !== null } : null,
      };
    });
    const verificationDecision = decision ? { decision: decision.decision as string, reason: decision.reason as string } : null;
    const totalFromRows = criteria.reduce((a, x) => a + Number(x.score), 0);
    return {
      submissionId,
      evaluationId: r.id,
      state: r.state as string,
      workStatus: workStatus({ hasSubmission: true, evaluationState: r.state, outcome: r.outcome, decision: decision?.decision ?? null, levelChanged: !!moved }),
      humanReview,
      resultId: r.result_id,
      outcome: r.outcome,
      totalScore: r.result_id ? totalFromRows : null,
      maxScore: r.result_id ? (svc.rubric?.max_total !== null && svc.rubric?.max_total !== undefined ? Number(svc.rubric.max_total) : criteria.reduce((a, x) => a + Number(x.max_score), 0)) : null,
      reason: svc.reason,
      rubricVersion: svc.rubric?.version ?? null,
      activitySpecVersion: r.activity_spec_version,
      evaluatedAt: r.evaluated_at,
      criteria,
      integrityChecks: svc.integrity.map((i) => ({ check_key: i.check_key, key: i.check_key, passed: i.passed, message: svc.messages.find((m) => m.key === i.check_key)?.user_facing_message ?? null })),
      // A level change, read from the decision that made it (never inferred from the outcome).
      transition: moved ? { from: moved.previous_state as EvidenceState, to: moved.resulting_state as EvidenceState, evidenceId: moved.evidence_id as string } : null,
      // The legacy verification row (unchanged fields) plus the D-118 decision; a pending decision has no legacy row.
      verification: legacy ? { ...legacy, decision: decision?.decision ?? null } : verificationDecision,
      verificationDecision,
      // O-1: whether a whole-activity result could be attributed to one claimed skill (ENG-1 P0). Additive, read-only.
      levelAttribution: svc.levelAttribution,
      // ENG-1 P3 (additive, development pathway): one entry per assessed skill; empty for every legacy result.
      skills,
      actions: { evaluate: false },
    };
  }
}
