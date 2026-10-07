import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { verificationPolicyIsValidated } from '@naqla/domain';

/** Read side (Phase 3): the structured assessment and the decision about it, for the owner. */
@Injectable()
export class AssessmentService {
  constructor(private readonly db: DbService) {}

  async listPolicies() {
    return this.db.asService(async (c) => {
      const { rows } = await c.query(
        `select id, key, version, description_en, applies_outcomes::text[] as applies_outcomes, accept_rubric_proposal, max_resulting_state, min_assessment_confidence, min_independent_evidence,
                escalate_on, blocking_rule, per_skill_evidence_derivation, decision_actors, activation, baseline_of, review_status, validation_note_en
           from verification_policy order by key, version`);
      return rows.map((r) => ({
        id: r.id, key: r.key, version: Number(r.version), descriptionEn: r.description_en, appliesOutcomes: r.applies_outcomes, acceptRubricProposal: r.accept_rubric_proposal,
        maxResultingState: r.max_resulting_state, minAssessmentConfidence: r.min_assessment_confidence === null ? null : Number(r.min_assessment_confidence),
        minIndependentEvidence: r.min_independent_evidence === null ? null : Number(r.min_independent_evidence), escalateOn: r.escalate_on, blockingRule: r.blocking_rule,
        perSkillEvidenceDerivation: r.per_skill_evidence_derivation, decisionActors: r.decision_actors, activation: r.activation, isLegacyBaseline: r.activation === 'legacy_baseline', baselineOf: r.baseline_of, reviewStatus: r.review_status,
        validated: verificationPolicyIsValidated({ reviewStatus: r.review_status }), validationNote: r.validation_note_en,
      }));
    });
  }

  /** Latest assessment(s) of the latest result for a submission, with criterion structure and the decision. */
  async forSubmission(userId: string, submissionId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select a.id, a.evaluation_result_id, a.evaluator_kind, a.evaluator_ref, a.rubric_version, a.activity_spec_version, a.domain_ruleset_version, a.context_policy_version,
                a.inputs_used, a.outcome, a.total_score, a.max_score, a.confidence, a.created_at, a.track_config_version_id, a.context_policy_id, a.config_resolution,
                (select version from track_config_version t where t.id = a.track_config_version_id) as track_config_version
           from assessment a
          where a.submission_id = $1
            and not exists (select 1 from evaluation_result n where n.supersedes_result_id = a.evaluation_result_id)
          order by a.created_at`, [submissionId]);
      if (rows.length === 0) throw new NotFoundException('no assessment for this submission');
      const out = [];
      for (const a of rows) {
        const crit = await c.query(
          `select criterion_key, criterion_kind, skill_id, status, score, max_score, evidence_used, evidence_missing, observations, strengths, gaps, confidence, evaluator_kind, reason, recommended_next_action_en
             from assessment_criterion_result where assessment_id = $1 order by position, criterion_key`, [a.id]);
        const dec = await c.query(
          `select id, skill_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decided_by_ref, decision, previous_state, proposed_state, resulting_state, confidence, reason, verification_id, evidence_id, human_override_of, decided_at, track_config_version_id
             from verification_decision where assessment_id = $1 order by decided_at`, [a.id]);
        out.push({
          id: a.id, evaluationResultId: a.evaluation_result_id, evaluatorKind: a.evaluator_kind, evaluatorRef: a.evaluator_ref,
          versions: { rubric: a.rubric_version, activitySpec: a.activity_spec_version, domainRuleset: a.domain_ruleset_version, contextPolicy: a.context_policy_version,
            trackConfigVersionId: a.track_config_version_id, trackConfigVersion: a.track_config_version === null ? null : Number(a.track_config_version), configResolution: a.config_resolution ?? 'pre_0014' },
          inputsUsed: a.inputs_used, outcome: a.outcome, totalScore: Number(a.total_score), maxScore: Number(a.max_score), confidence: a.confidence === null ? null : Number(a.confidence), createdAt: a.created_at,
          criteria: crit.rows.map((r) => ({ key: r.criterion_key, kind: r.criterion_kind, skillId: r.skill_id, status: r.status, score: Number(r.score), maxScore: Number(r.max_score),
            evidenceUsed: r.evidence_used, evidenceMissing: r.evidence_missing, observations: r.observations, strengths: r.strengths, gaps: r.gaps,
            confidence: r.confidence === null ? null : Number(r.confidence), evaluatorKind: r.evaluator_kind, reason: r.reason, recommendedNextAction: r.recommended_next_action_en })),
          decisions: dec.rows.map((d) => ({ id: d.id, skillId: d.skill_id, policy: { key: d.policy_key, version: Number(d.policy_version), status: d.policy_status, validated: verificationPolicyIsValidated({ reviewStatus: d.policy_status }), resolution: d.decided_by_ref?.startsWith('policy:') ? d.decided_by_ref.slice(7) : null }, trackConfigVersionId: d.track_config_version_id,
            domainRulesetVersion: d.domain_ruleset_version, decidedByKind: d.decided_by_kind, decidedByRef: d.decided_by_ref, decision: d.decision, previousState: d.previous_state, proposedState: d.proposed_state,
            resultingState: d.resulting_state, confidence: d.confidence === null ? null : Number(d.confidence), reason: d.reason, verificationId: d.verification_id, evidenceId: d.evidence_id, humanOverrideOf: d.human_override_of, decidedAt: d.decided_at })),
        });
      }
      return { items: out, note: 'An assessment is what was observed; a decision is what the named policy concluded. Neither is a CV/LinkedIn eligibility.' };
    });
  }
}
