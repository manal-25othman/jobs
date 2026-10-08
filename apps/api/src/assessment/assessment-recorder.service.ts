import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  DOMAIN_RULESET_VERSION, verificationPolicyFromRow, decideWithPolicy, criterionResultStatus, assessmentConfidence, artifactKeysOf,
  resolveActiveConfig, buildAssessmentContext, assertContextPolicySane,
  MissingPrerequisite, type VerificationPolicy, type PolicyDecision, type PolicyDecisionInput, type EvaluationRun, type PublishedRubric,
  type SubmissionArtifact, type AssessmentEvaluatorKind, type EvidenceState, type AssessmentContextPolicy, type ConfigResolution,
} from '@naqla/domain';
import { emitAuditEvent } from '../infra/audit';
import { ConfigurationService, governedFromRow, isProduction } from '../configuration/configuration.service';

export interface ResolvedVerificationPolicy { policy: VerificationPolicy; resolution: ConfigResolution }

/**
 * Writes the structured assessment and the verification decision (Phase 3)
 * INSIDE the evaluation transaction. The evaluation_result and the legacy
 * verification row are still written by EvaluationService exactly as before;
 * this service adds the structured records beside them and never moves a claim.
 */
@Injectable()
export class AssessmentRecorderService {
  private readonly logger = new Logger(AssessmentRecorderService.name);
  constructor(private readonly config: ConfigurationService) {}

  /**
   * The verification policy in effect for a key, by ACTIVATION (Phase 4):
   * production consults a validated production_active row, else the
   * migration-created legacy baseline — never an ordinary draft. Outside
   * production a development_only draft may run. The resolution is recorded
   * on every decision so the baseline's lack of validation stays visible.
   */
  async loadPolicy(c: PoolClient, key = 'default'): Promise<ResolvedVerificationPolicy> {
    const { rows } = await c.query(
      `select id, key, version, review_status, applies_outcomes::text[] as applies_outcomes, accept_rubric_proposal, max_resulting_state, min_assessment_confidence,
              min_independent_evidence, escalate_on, blocking_rule, per_skill_evidence_derivation, decision_actors, activation, baseline_of, approved_by
         from verification_policy where key = $1`, [key]);
    const r = resolveActiveConfig(rows.map(governedFromRow), { production: isProduction() });
    if (!r.row) throw new MissingPrerequisite('verification_policy', `no usable verification policy '${key}': ${r.reason}`);
    const row = rows.find((x) => x.id === r.row!.id)!;
    const policy = verificationPolicyFromRow(row);
    if (r.resolution === 'legacy_baseline') this.logger.warn(`verification policy ${policy.key}@${policy.version} is the LEGACY BASELINE (not expert-validated); it runs only because it is the pre-existing behaviour`);
    return { policy, resolution: r.resolution };
  }

  async loadContextPolicy(c: PoolClient, key = 'default'): Promise<{ policy: AssessmentContextPolicy; resolution: ConfigResolution }> {
    const { rows } = await c.query('select id, key, version, review_status, inputs, activation, baseline_of, approved_by from assessment_context_policy where key = $1', [key]);
    const r = resolveActiveConfig(rows.map(governedFromRow), { production: isProduction() });
    if (!r.row) throw new MissingPrerequisite('assessment_context_policy', `no usable assessment-context policy '${key}': ${r.reason}`);
    const row = rows.find((x) => x.id === r.row!.id)!;
    assertContextPolicySane(row.inputs);
    return { policy: { ...r.row, inputs: row.inputs }, resolution: r.resolution };
  }

  async recordAssessment(c: PoolClient, p: {
    evaluationResultId: string; evaluationId: string; submissionId: string; userId: string;
    evaluatorKind: AssessmentEvaluatorKind; evaluatorRef: string; rubric: PublishedRubric; run: EvaluationRun;
    artifacts: readonly SubmissionArtifact[]; humanDecisions?: readonly { criterionKey: string; score: number; rationale: string }[] | undefined;
  }): Promise<{ assessmentId: string; confidence: number | null; trackConfigVersionId: string | null }> {
    const confidence = assessmentConfidence(p.run.criteria.map((cr) => cr.confidence));
    const present = new Set(p.artifacts.map((a) => a.key));
    // Phase 4: the context policy decides which inputs the evaluator may see; identity never passes (code invariant).
    const ctx = await this.loadContextPolicy(c);
    const disclosure = await c.query('select mode, declared_use from ai_disclosure where submission_id = $1', [p.submissionId]);
    const items = (await c.query('select id from evidence_item where submission_id = $1 order by created_at', [p.submissionId])).rows.map((r) => r.id as string);
    const previous = (await c.query('select supersedes_item_id from evidence_item where submission_id = $1 and supersedes_item_id is not null', [p.submissionId])).rows.map((r) => r.supersedes_item_id as string);
    const context = buildAssessmentContext(ctx.policy, {
      submission_artifacts: [...present].sort(),
      evidence_items: items.length ? items : null,
      ai_disclosure: disclosure.rows[0] ? { mode: disclosure.rows[0].mode, declared_use: disclosure.rows[0].declared_use } : null,
      previous_attempts: previous.length ? previous : null,
      human_review_decisions: p.humanDecisions?.length ? p.humanDecisions.map((d) => d.criterionKey) : null,
      // Phase 6: offered, never forced — a context policy decides; the legacy baseline excludes it.
      integrity_signals: await (async () => { const ids = (await c.query('select id from integrity_signal where submission_id = $1 order by created_at', [p.submissionId])).rows.map((r) => r.id as string); return ids.length ? ids : null; })(),
    });
    const inputs = { ...context.included, excluded: context.excluded, omitted_optional: context.omittedOptional, identity_excluded: true, context_policy: context.policyRef, context_policy_resolution: ctx.resolution };
    const role = await c.query('select target_role_id from activity_spec where id = $1', [p.rubric.activitySpecId]);
    const track = role.rows[0]?.target_role_id ? await this.config.resolveTrackConfig(c, role.rows[0].target_role_id) : { id: null, resolution: 'no_active_track_config' as const };
    const raw = {
      outcome: p.run.outcome, rubricVersion: p.run.rubricVersion, activitySpecVersion: p.run.activitySpecVersion,
      criteria: p.run.criteria, integrityChecks: p.run.integrityChecks, totalScore: p.run.totalScore, maxScore: p.run.maxScore,
      proposedState: p.run.proposedState, reason: p.run.reason, pendingHumanCriteria: p.run.pendingHumanCriteria, deferredChecks: p.run.deferredChecks,
      humanDecisions: p.humanDecisions ?? [],
    };
    const a = await c.query(
      `insert into assessment (evaluation_result_id, evaluation_id, submission_id, user_id, evaluator_kind, evaluator_ref, rubric_version_id, rubric_version,
                               activity_spec_id, activity_spec_version, domain_ruleset_version, context_policy_version, inputs_used, raw_result, outcome, total_score, max_score, confidence,
                               track_config_version_id, context_policy_id, config_resolution)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) returning id`,
      [p.evaluationResultId, p.evaluationId, p.submissionId, p.userId, p.evaluatorKind, p.evaluatorRef, p.rubric.rubricVersionId, p.rubric.version,
       p.rubric.activitySpecId, p.rubric.activitySpecVersion, DOMAIN_RULESET_VERSION, context.policyRef, JSON.stringify(inputs), JSON.stringify(raw), p.run.outcome, p.run.totalScore, p.run.maxScore, confidence,
       track.id, ctx.policy.id, track.resolution]);
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
    return { assessmentId, confidence, trackConfigVersionId: track.id };
  }

  decide(policy: VerificationPolicy, input: PolicyDecisionInput): PolicyDecision { return decideWithPolicy(policy, input); }

  async recordDecision(c: PoolClient, p: {
    assessmentId: string; evaluationResultId: string; userId: string; skillId: string; policy: VerificationPolicy; policyResolution: ConfigResolution; trackConfigVersionId: string | null;
    decision: PolicyDecision | { decision: 'evidence_reestablished'; previousState: EvidenceState; proposedState: EvidenceState | null; resultingState: EvidenceState; reason: string };
    confidence: number | null; verificationId: string | null; evidenceId: string | null;
  }): Promise<string> {
    const d = p.decision;
    const { rows } = await c.query(
      `insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version,
                                          decided_by_kind, decided_by_ref, decision, previous_state, proposed_state, resulting_state, confidence, reason, verification_id, evidence_id, track_config_version_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'policy',$18,$10,$11,$12,$13,$14,$15,$16,$17,$19) returning id`,
      [p.assessmentId, p.evaluationResultId, p.userId, p.skillId, p.policy.id, p.policy.key, p.policy.version, p.policy.reviewStatus, DOMAIN_RULESET_VERSION,
       d.decision, d.previousState, d.proposedState, d.resultingState, p.confidence, d.reason, p.verificationId, p.evidenceId, `policy:${p.policyResolution}`, p.trackConfigVersionId]);
    await emitAuditEvent(c, {
      eventType: 'verification.decided', userId: p.userId, actorKind: 'system', subjectTable: 'verification_decision', subjectId: rows[0].id,
      reason: d.reason, payload: { decision: d.decision, policy: `${p.policy.key}@${p.policy.version}`, policyStatus: p.policy.reviewStatus, policyResolution: p.policyResolution, trackConfigVersionId: p.trackConfigVersionId, skillId: p.skillId, from: d.previousState, to: d.resultingState },
    });
    return rows[0].id as string;
  }
}
