import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  DOMAIN_RULESET_VERSION, verificationPolicyFromRow, decideWithPolicy, criterionResultStatus, assessmentConfidence, artifactKeysOf,
  MissingPrerequisite, type VerificationPolicy, type PolicyDecision, type PolicyDecisionInput, type EvaluationRun, type PublishedRubric,
  type SubmissionArtifact, type AssessmentEvaluatorKind, type EvidenceState,
} from '@naqla/domain';
import { emitAuditEvent } from '../infra/audit';

/**
 * Writes the structured assessment and the verification decision (Phase 3)
 * INSIDE the evaluation transaction. The evaluation_result and the legacy
 * verification row are still written by EvaluationService exactly as before;
 * this service adds the structured records beside them and never moves a claim.
 */
@Injectable()
export class AssessmentRecorderService {
  private readonly logger = new Logger(AssessmentRecorderService.name);

  /** The one enabled policy for a key. Draft outside production applies; in production a draft policy still applies (it IS the legacy behaviour) and is recorded as draft on every decision. */
  async loadPolicy(c: PoolClient, key = 'default'): Promise<VerificationPolicy> {
    const { rows } = await c.query(
      `select id, key, version, review_status, applies_outcomes::text[] as applies_outcomes, accept_rubric_proposal, max_resulting_state, min_assessment_confidence,
              min_independent_evidence, escalate_on, blocking_rule, per_skill_evidence_derivation, decision_actors
         from verification_policy where key = $1 and enabled`, [key]);
    if (rows.length === 0) throw new MissingPrerequisite('verification_policy', `no enabled verification policy '${key}'`);
    const policy = verificationPolicyFromRow(rows[0]);
    if (process.env['NODE_ENV'] === 'production' && policy.reviewStatus !== 'approved' && policy.reviewStatus !== 'published') {
      this.logger.warn(`verification policy ${policy.key}@${policy.version} is ${policy.reviewStatus} (DRAFT / NOT VALIDATED); it reproduces legacy behaviour and is recorded as such on every decision`);
    }
    return policy;
  }

  async recordAssessment(c: PoolClient, p: {
    evaluationResultId: string; evaluationId: string; submissionId: string; userId: string;
    evaluatorKind: AssessmentEvaluatorKind; evaluatorRef: string; rubric: PublishedRubric; run: EvaluationRun;
    artifacts: readonly SubmissionArtifact[]; humanDecisions?: readonly { criterionKey: string; score: number; rationale: string }[] | undefined;
  }): Promise<{ assessmentId: string; confidence: number | null }> {
    const confidence = assessmentConfidence(p.run.criteria.map((cr) => cr.confidence));
    const present = new Set(p.artifacts.map((a) => a.key));
    const inputs = {
      artifact_keys: [...present].sort(),
      evidence_item_ids: (await c.query('select id from evidence_item where submission_id = $1 order by created_at', [p.submissionId])).rows.map((r) => r.id),
      identity_excluded: true,
      human_decisions: p.humanDecisions?.length ?? 0,
    };
    const raw = {
      outcome: p.run.outcome, rubricVersion: p.run.rubricVersion, activitySpecVersion: p.run.activitySpecVersion,
      criteria: p.run.criteria, integrityChecks: p.run.integrityChecks, totalScore: p.run.totalScore, maxScore: p.run.maxScore,
      proposedState: p.run.proposedState, reason: p.run.reason, pendingHumanCriteria: p.run.pendingHumanCriteria, deferredChecks: p.run.deferredChecks,
      humanDecisions: p.humanDecisions ?? [],
    };
    const a = await c.query(
      `insert into assessment (evaluation_result_id, evaluation_id, submission_id, user_id, evaluator_kind, evaluator_ref, rubric_version_id, rubric_version,
                               activity_spec_id, activity_spec_version, domain_ruleset_version, context_policy_version, inputs_used, raw_result, outcome, total_score, max_score, confidence)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null,$12,$13,$14,$15,$16,$17) returning id`,
      [p.evaluationResultId, p.evaluationId, p.submissionId, p.userId, p.evaluatorKind, p.evaluatorRef, p.rubric.rubricVersionId, p.rubric.version,
       p.rubric.activitySpecId, p.rubric.activitySpecVersion, DOMAIN_RULESET_VERSION, JSON.stringify(inputs), JSON.stringify(raw), p.run.outcome, p.run.totalScore, p.run.maxScore, confidence]);
    const assessmentId: string = a.rows[0].id;

    let position = 0;
    for (const crit of p.rubric.criteria) {
      const scored = p.run.criteria.find((s) => s.criterionId === crit.key);
      const pendingHuman = p.run.pendingHumanCriteria.includes(crit.key) || (scored === undefined && (crit.evaluatorType ?? 'rule') !== 'rule');
      const keys = crit.check ? artifactKeysOf(crit.check) : [];
      const used = keys.filter((k) => present.has(k));
      const missing = keys.filter((k) => !present.has(k));
      const score = scored?.score ?? 0;
      const status = criterionResultStatus({ score, maxScore: crit.maxScore, pendingHuman });
      const human = p.humanDecisions?.find((d) => d.criterionKey === crit.key);
      const evaluatorKind: AssessmentEvaluatorKind = human ? 'human' : (crit.evaluatorType ?? 'rule') === 'rule' ? 'rule' : 'human';
      const gaps = status === 'met' || status === 'pending_human' ? [] : missing.length ? missing.map((k) => `missing: ${k}`) : [`criterion '${crit.key}' not fully met`];
      await c.query(
        `insert into assessment_criterion_result (assessment_id, user_id, criterion_key, criterion_kind, skill_id, status, score, max_score, evidence_used, evidence_missing,
                                                  observations, strengths, gaps, confidence, evaluator_kind, reason, recommended_next_action_en, position)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [assessmentId, p.userId, crit.key, crit.kind ?? 'skill_evidence', crit.skillId, status, score, crit.maxScore, used, missing,
         scored?.rationale ?? human?.rationale ?? (pendingHuman ? 'awaiting a human decision' : 'not scored'),
         status === 'met' ? used : [], gaps, scored?.confidence ?? null, evaluatorKind,
         human ? 'human criterion decision aggregated' : pendingHuman ? 'human criterion; not decided by a rule' : 'deterministic rule over submission artifacts',
         missing.length && status !== 'pending_human' ? `Provide: ${missing.join(', ')}` : null, position++]);
    }
    return { assessmentId, confidence };
  }

  decide(policy: VerificationPolicy, input: PolicyDecisionInput): PolicyDecision { return decideWithPolicy(policy, input); }

  async recordDecision(c: PoolClient, p: {
    assessmentId: string; evaluationResultId: string; userId: string; skillId: string; policy: VerificationPolicy;
    decision: PolicyDecision | { decision: 'evidence_reestablished'; previousState: EvidenceState; proposedState: EvidenceState | null; resultingState: EvidenceState; reason: string };
    confidence: number | null; verificationId: string | null; evidenceId: string | null;
  }): Promise<string> {
    const d = p.decision;
    const { rows } = await c.query(
      `insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version,
                                          decided_by_kind, decided_by_ref, decision, previous_state, proposed_state, resulting_state, confidence, reason, verification_id, evidence_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'policy',null,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
      [p.assessmentId, p.evaluationResultId, p.userId, p.skillId, p.policy.id, p.policy.key, p.policy.version, p.policy.reviewStatus, DOMAIN_RULESET_VERSION,
       d.decision, d.previousState, d.proposedState, d.resultingState, p.confidence, d.reason, p.verificationId, p.evidenceId]);
    await emitAuditEvent(c, {
      eventType: 'verification.decided', userId: p.userId, actorKind: 'system', subjectTable: 'verification_decision', subjectId: rows[0].id,
      reason: d.reason, payload: { decision: d.decision, policy: `${p.policy.key}@${p.policy.version}`, policyStatus: p.policy.reviewStatus, skillId: p.skillId, from: d.previousState, to: d.resultingState },
    });
    return rows[0].id as string;
  }
}
