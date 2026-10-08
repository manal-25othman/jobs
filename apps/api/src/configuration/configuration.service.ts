import { Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DbService } from '../infra/db.service';
import { resolveActiveConfig, configIsValidated, trackSkillBadge, trackSkillConfigFromSnapshot, type GovernedConfig, type ConfigActivation } from '@naqla/domain';

export const GOVERNED_TABLES = ['verification_policy', 'assessment_context_policy', 'claim_policy', 'challenge_policy', 'track_config_version', 'readiness_rule_set', 'grounding_lexicon'] as const;
export type GovernedTable = (typeof GOVERNED_TABLES)[number];

export function isProduction(): boolean { return process.env['NODE_ENV'] === 'production'; }

/** Governance columns every governed table shares. */
export function governedFromRow(r: Record<string, unknown>): GovernedConfig {
  return { id: String(r['id']), key: String(r['key'] ?? r['target_role_id']), version: Number(r['version']), reviewStatus: String(r['review_status']),
    activation: r['activation'] as ConfigActivation, baselineOf: (r['baseline_of'] as string | null) ?? null, approvedBy: (r['approved_by'] as string | null) ?? null };
}

export function presentGoverned(r: Record<string, unknown>) {
  const g = governedFromRow(r);
  return { id: g.id, key: g.key, version: g.version, reviewStatus: g.reviewStatus, validated: configIsValidated(g), activation: g.activation,
    isLegacyBaseline: g.activation === 'legacy_baseline', baselineOf: g.baselineOf, approvedBy: g.approvedBy, approvedAt: r['approved_at'] ?? null,
    activatedAt: r['activated_at'] ?? null, deactivatedAt: r['deactivated_at'] ?? null, validationNote: r['validation_note_en'] };
}

/** Read side of the configuration layer (Phase 4). */
@Injectable()
export class ConfigurationService {
  constructor(private readonly db: DbService) {}

  /** The configuration version in effect for a track in this environment, with how it was resolved. */
  async resolveTrackConfig(c: PoolClient, targetRoleId: string): Promise<{ id: string | null; resolution: 'production_active' | 'legacy_baseline' | 'development_only' | 'no_active_track_config' }> {
    const { rows } = await c.query('select id, target_role_id, version, review_status, activation, baseline_of, approved_by from track_config_version where target_role_id = $1', [targetRoleId]);
    const r = resolveActiveConfig(rows.map(governedFromRow), { production: isProduction() });
    return r.row ? { id: r.row.id, resolution: r.resolution } : { id: null, resolution: 'no_active_track_config' };
  }

  async policies() {
    const production = isProduction();
    return this.db.asService(async (c) => {
      const load = async (table: GovernedTable, extra: string) => (await c.query(`select *, ${extra} from ${table} order by key, version`)).rows;
      const vp = await load('verification_policy', 'applies_outcomes::text[] as applies_outcomes_text');
      const cx = await load('assessment_context_policy', 'inputs as inputs_json');
      const cl = await load('claim_policy', 'claim_kind as kind');
      const ch = await load('challenge_policy', 'trigger_rule as trigger_json');
      const active = (rows: Record<string, unknown>[], keyOf: (r: Record<string, unknown>) => string) => {
        const byKey = new Map<string, Record<string, unknown>[]>();
        for (const r of rows) byKey.set(keyOf(r), [...(byKey.get(keyOf(r)) ?? []), r]);
        return [...byKey.entries()].map(([key, group]) => { const res = resolveActiveConfig(group.map(governedFromRow), { production }); return { key, resolution: res.resolution, id: res.row?.id ?? null }; });
      };
      return {
        production,
        activationModel: {
          inactive: 'never consulted', development_only: 'runs outside production only', legacy_baseline: 'the pre-existing behaviour; runs in production for that reason only — NOT validated',
          production_active: 'explicit, audited promotion of a validated row',
        },
        verificationPolicies: { items: vp.map((r) => ({ ...presentGoverned(r), appliesOutcomes: r['applies_outcomes_text'], acceptRubricProposal: r['accept_rubric_proposal'], maxResultingState: r['max_resulting_state'],
          minAssessmentConfidence: r['min_assessment_confidence'] === null ? null : Number(r['min_assessment_confidence']), minIndependentEvidence: r['min_independent_evidence'] === null ? null : Number(r['min_independent_evidence']),
          escalateOn: r['escalate_on'], blockingRule: r['blocking_rule'], perSkillEvidenceDerivation: r['per_skill_evidence_derivation'], decisionActors: r['decision_actors'], descriptionEn: r['description_en'] })), active: active(vp, (r) => String(r['key'])) },
        assessmentContextPolicies: { items: cx.map((r) => ({ ...presentGoverned(r), inputs: r['inputs_json'], descriptionEn: r['description_en'] })), active: active(cx, (r) => String(r['key'])) },
        claimPolicies: { consumed: true, note: 'Phase 7: claim drafts are judged by the claim policy active for their kind. legacy_presentation@1 is the migration-created baseline that reproduces presentationFor(); default@1 rows are DRAFT / NOT VALIDATED and inactive (development-only where a seed says so).',
          items: cl.map((r) => ({ ...presentGoverned(r), claimKind: r['kind'], minEvidenceLevel: r['min_evidence_level'], minEvidenceCount: r['min_evidence_count'], minSourceStrength: r['min_source_strength'],
            requiresVerificationDecision: r['requires_verification_decision'], requiresUserApproval: r['requires_user_approval'], lockUntilGrounded: r['lock_until_grounded'], descriptionEn: r['description_en'] })),
          active: active(cl, (r) => `${r['key']}:${r['kind']}`) },
        challengePolicies: { runnerExists: false, items: ch.map((r) => ({ ...presentGoverned(r), appliesScope: r['applies_scope'], scopeRef: r['scope_ref'], triggerRule: r['trigger_json'], challengeTypes: r['challenge_types'], maxChallenges: r['max_challenges'], descriptionEn: r['description_en'] })), active: active(ch, (r) => String(r['key'])) },
        challengeTypes: (await c.query('select code, label_ar, label_en, description_en, delivery, enabled, review_status, validation_note_en from verification_challenge_type order by code')).rows
          .map((t) => ({ code: t.code, labelAr: t.label_ar, labelEn: t.label_en, descriptionEn: t.description_en, delivery: t.delivery, enabled: t.enabled, reviewStatus: t.review_status, validated: configIsValidated({ reviewStatus: t.review_status }), validationNote: t.validation_note_en })),
      };
    });
  }

  async trackConfig(targetRoleId: string) {
    const production = isProduction();
    return this.db.asService(async (c) => {
      const role = await c.query('select id, slug, label_ar, label_en, review_status from target_role where id = $1', [targetRoleId]);
      if (role.rowCount === 0) throw new NotFoundException('track not found');
      const { rows } = await c.query(
        `select v.*, vp.key as vp_key, vp.version as vp_version, vp.activation as vp_activation, cx.key as cx_key, cx.version as cx_version
           from track_config_version v join verification_policy vp on vp.id = v.verification_policy_id join assessment_context_policy cx on cx.id = v.assessment_context_policy_id
          where v.target_role_id = $1 order by v.version`, [targetRoleId]);
      const res = resolveActiveConfig(rows.map(governedFromRow), { production });
      const skills = await c.query(
        `select rr.id, rr.skill_id, s.slug, s.label_ar, s.label_en, rr.is_core, rr.importance, rr.category, rr.display_order, rr.expected_level, rr.readiness_contribution, rr.enabled, rr.classification_status, rr.minimum_evidence_count, rr.review_status, rr.version
           from role_requirement rr join skill s on s.id = rr.skill_id where rr.target_role_id = $1 order by rr.display_order nulls last, s.label_en`, [targetRoleId]);
      return {
        track: { id: role.rows[0].id, slug: role.rows[0].slug, labelAr: role.rows[0].label_ar, labelEn: role.rows[0].label_en, reviewStatus: role.rows[0].review_status },
        production,
        active: res.row ? { id: res.row.id, version: res.row.version, resolution: res.resolution } : { id: null, version: null, resolution: 'no_active_track_config', reason: res.resolution === 'none' ? res.reason : null },
        versions: rows.map((r) => ({ ...presentGoverned(r), label: r['label'], packVersion: r['pack_version'], verificationPolicy: `${r['vp_key']}@${r['vp_version']}`, assessmentContextPolicy: `${r['cx_key']}@${r['cx_version']}`,
          claimPolicyRef: r['claim_policy_ref'], progressRulesVersion: Number(r['progress_rules_version']), readinessRuleSetId: r['readiness_rule_set_id'], notesEn: r['notes_en'], createdBy: r['created_by'], createdAt: r['created_at'],
          skillConfigSnapshot: (r['skill_config_snapshot'] as Record<string, unknown>[]).map(trackSkillConfigFromSnapshot) })),
        // The live TrackSkill rows with the badge the UI may show (never "core" before approval).
        trackSkills: skills.rows.map((r) => ({ roleRequirementId: r.id, skillId: r.skill_id, slug: r.slug, labelAr: r.label_ar, labelEn: r.label_en, isCore: r.is_core, importance: r.importance, category: r.category,
          displayOrder: r.display_order, expectedLevel: r.expected_level, readinessContribution: r.readiness_contribution, enabled: r.enabled, classificationStatus: r.classification_status,
          badge: trackSkillBadge({ isCore: r.is_core, classificationStatus: r.classification_status, enabled: r.enabled }), minimumEvidenceCount: r.minimum_evidence_count, reviewStatus: r.review_status, version: Number(r.version) })),
        readinessRules: { exist: false, note: 'No readiness threshold exists (Phase 5).' },
      };
    });
  }
}
