import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { ConfigurationService, governedFromRow, isProduction } from '../configuration/configuration.service';
import {
  DOMAIN_RULESET_VERSION, evaluateReadiness, readinessRuleFromRow, resolveActiveConfig, skillReadinessContribution, trackSkillBadge, configIsValidated,
  type ReadinessRuleSet, type SkillReadinessFacts, type ReadinessReport, type TrackSkillConfig, type ConfigResolution, type EvidenceState,
} from '@naqla/domain';

/**
 * Readiness Engine (Phase 5). Reads facts, applies the ACTIVE rule set through
 * the pure domain evaluator, and records immutable snapshots on request.
 * It never writes a claim, an evidence row or a progress row.
 */
@Injectable()
export class ReadinessService {
  constructor(private readonly db: DbService, private readonly config: ConfigurationService) {}

  /** The rule set in effect for a track: a track-specific active set wins over a global one. Nothing seeded ⇒ none. */
  async resolveRuleSet(c: PoolClient, targetRoleId: string): Promise<{ set: ReadinessRuleSet | null; resolution: ConfigResolution | 'none' }> {
    const { rows } = await c.query(
      `select id, key, version, target_role_id, label_ar, label_en, review_status, activation, baseline_of, approved_by
         from readiness_rule_set where target_role_id = $1 or target_role_id is null order by target_role_id nulls last`, [targetRoleId]);
    const groups: Record<string, typeof rows> = {};
    for (const r of rows) (groups[`${r.target_role_id ?? 'global'}:${r.key}`] ??= []).push(r);
    const candidates: { row: typeof rows[number]; resolution: ConfigResolution; specific: boolean }[] = [];
    for (const g of Object.values(groups)) {
      const res = resolveActiveConfig(g.map(governedFromRow), { production: isProduction() });
      if (res.row) candidates.push({ row: g.find((x) => x.id === res.row!.id)!, resolution: res.resolution, specific: g[0]!.target_role_id !== null });
    }
    const specific = candidates.filter((x) => x.specific); const global = candidates.filter((x) => !x.specific);
    const pick = specific[0] ?? global[0];
    if ((specific.length > 1) || (!specific.length && global.length > 1)) throw new BadRequestException('ambiguous readiness configuration: more than one active rule set applies to this track');
    if (!pick) return { set: null, resolution: 'none' };
    const rules = await c.query('select id, rule_type, params, skill_id, label_ar, label_en, enabled, position from readiness_rule where rule_set_id = $1 order by position', [pick.row.id]);
    const g = governedFromRow(pick.row);
    return { set: { ...g, targetRoleId: pick.row.target_role_id, labelAr: pick.row.label_ar, labelEn: pick.row.label_en, rules: rules.rows.map(readinessRuleFromRow) }, resolution: pick.resolution };
  }

  /** One fact row per TrackSkill of the role, for this user. Read-only. */
  async facts(c: PoolClient, userId: string, targetRoleId: string): Promise<SkillReadinessFacts[]> {
    const { rows } = await c.query(
      `select rr.id as rr_id, rr.skill_id, s.slug, s.label_ar, s.label_en, rr.is_core, rr.importance, rr.category, rr.display_order, rr.expected_level, rr.readiness_contribution, rr.enabled, rr.classification_status,
              rr.minimum_evidence_count, rr.review_status, rr.version, sc.state as claim_state, sp.state_code as progress_state,
              (select count(*)::int from evidence e where e.user_id = $1 and e.skill_id = rr.skill_id and e.withdrawn_at is null) as standing_evidence
         from role_requirement rr join skill s on s.id = rr.skill_id
         left join skill_claim sc on sc.user_id = $1 and sc.skill_id = rr.skill_id
         left join skill_progress sp on sp.user_id = $1 and sp.skill_id = rr.skill_id
        where rr.target_role_id = $2 and s.status = 'active'
          -- A4 (0024): only role-skill mappings a graduate may see — visible requirement on a visible skill.
          and graduate_content_visible(rr.review_status, rr.is_demo_fixture) and graduate_content_visible(s.review_status, s.is_demo_fixture)
        order by rr.display_order nulls last, s.label_en`, [userId, targetRoleId]);
    return rows.map((r) => ({
      skillId: r.skill_id, labelAr: r.label_ar, labelEn: r.label_en, verificationLevel: (r.claim_state as EvidenceState | null) ?? 'gap',
      standingEvidenceCount: Number(r.standing_evidence), progressState: r.progress_state,
      config: { roleRequirementId: r.rr_id, skillId: r.skill_id, isCore: r.is_core, importance: r.importance, category: r.category, displayOrder: r.display_order, expectedLevel: r.expected_level,
        readinessContribution: r.readiness_contribution, enabled: r.enabled, classificationStatus: r.classification_status, minimumEvidenceCount: r.minimum_evidence_count, reviewStatus: r.review_status, version: Number(r.version) },
    }));
  }

  private async goalRole(c: PoolClient, userId: string): Promise<{ id: string; labelAr: string; labelEn: string } | null> {
    const { rows } = await c.query('select tr.id, tr.label_ar, tr.label_en from career_goal g join target_role tr on tr.id = g.target_role_id where g.user_id = $1 and g.is_current', [userId]);
    return rows[0] ? { id: rows[0].id, labelAr: rows[0].label_ar, labelEn: rows[0].label_en } : null;
  }

  /** Live report for the user's current goal. Never persisted here. */
  async report(userId: string) {
    return this.db.asService(async (c) => {
      const role = await this.goalRole(c, userId);
      if (!role) return { role: null, report: evaluateReadiness({ ruleSet: null, resolution: 'none', facts: [] }), trackConfig: null, note: 'no current career goal' };
      const { set, resolution } = await this.resolveRuleSet(c, role.id);
      const facts = await this.facts(c, userId, role.id);
      const report = evaluateReadiness({ ruleSet: set, resolution, facts });
      const track = await this.config.resolveTrackConfig(c, role.id);
      return { role, report, trackConfig: track, production: isProduction(),
        note: 'Readiness is a report over configured rules. It never changes a verification level, and no verification level implies readiness.' };
    });
  }

  /** Records an immutable snapshot tied to the rule set and track configuration versions in effect. */
  async record(userId: string) {
    return this.db.asService(async (c) => {
      const role = await this.goalRole(c, userId);
      if (!role) throw new BadRequestException('no current career goal to evaluate readiness for');
      const { set, resolution } = await this.resolveRuleSet(c, role.id);
      const facts = await this.facts(c, userId, role.id);
      const report = evaluateReadiness({ ruleSet: set, resolution, facts });
      const track = await this.config.resolveTrackConfig(c, role.id);
      const { rows } = await c.query(
        `insert into readiness_evaluation (user_id, target_role_id, track_config_version_id, readiness_rule_set_id, rule_set_key, rule_set_version, rule_set_status, rule_set_resolution, status, result, domain_ruleset_version)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id, evaluated_at`,
        [userId, role.id, track.id, set?.id ?? null, set?.key ?? null, set?.version ?? null, set?.reviewStatus ?? null, set ? resolution : 'not_yet_configured', report.status,
         JSON.stringify({ report, facts: facts.map((f) => ({ skillId: f.skillId, verificationLevel: f.verificationLevel, standingEvidenceCount: f.standingEvidenceCount, progressState: f.progressState })) }), DOMAIN_RULESET_VERSION]);
      await emitAuditEvent(c, { eventType: 'readiness.recorded', userId, actorKind: 'user', actorId: userId, subjectTable: 'readiness_evaluation', subjectId: rows[0].id,
        reason: `readiness snapshot: ${report.status}`, payload: { ruleSet: set ? `${set.key}@${set.version}` : null, resolution, trackConfigVersionId: track.id, verificationEffect: 'none' } });
      return { id: rows[0].id, evaluatedAt: rows[0].evaluated_at, report, role };
    });
  }

  async history(userId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select e.id, e.target_role_id, e.track_config_version_id, (select version from track_config_version t where t.id = e.track_config_version_id) as track_config_version,
                e.readiness_rule_set_id, e.rule_set_key, e.rule_set_version, e.rule_set_status, e.rule_set_resolution, e.status, e.result, e.domain_ruleset_version, e.evaluated_at
           from readiness_evaluation e where e.user_id = $1 order by e.evaluated_at desc limit 50`, [userId]);
      return rows.map((r) => ({ id: r.id, targetRoleId: r.target_role_id, trackConfigVersionId: r.track_config_version_id, trackConfigVersion: r.track_config_version === null ? null : Number(r.track_config_version),
        ruleSet: r.readiness_rule_set_id ? { id: r.readiness_rule_set_id, key: r.rule_set_key, version: Number(r.rule_set_version), status: r.rule_set_status } : null,
        resolution: r.rule_set_resolution, status: r.status, result: r.result, domainRulesetVersion: r.domain_ruleset_version, evaluatedAt: r.evaluated_at }));
    });
  }

  /** Skill pages (Phase 5): the four dimensions side by side for every TrackSkill of the goal role. */
  async trackSkills(userId: string) {
    return this.db.asService(async (c) => {
      const role = await this.goalRole(c, userId);
      if (!role) return { role: null, items: [], readiness: evaluateReadiness({ ruleSet: null, resolution: 'none', facts: [] }) };
      const { set, resolution } = await this.resolveRuleSet(c, role.id);
      const facts = await this.facts(c, userId, role.id);
      const report = evaluateReadiness({ ruleSet: set, resolution, facts });
      const states = (await c.query('select code, label_ar, label_en from skill_progress_state')).rows as { code: string; label_ar: string; label_en: string }[];
      const claims = (await c.query('select skill_id, state, state_reason from skill_claim where user_id = $1', [userId])).rows as { skill_id: string; state: string; state_reason: string }[];
      const items = await Promise.all(facts.map(async (f) => {
        const materials = await c.query(`select count(*)::int as n from evidence_item_skill l join evidence_item i on i.id = l.evidence_item_id where l.user_id = $1 and l.skill_id = $2 and i.status = 'submitted'`, [userId, f.skillId]);
        const st = states.find((s) => s.code === f.progressState);
        return this.present(f, report, claims.find((x) => x.skill_id === f.skillId) ?? null, st ?? null, Number(materials.rows[0].n));
      }));
      return { role, items, readiness: report };
    });
  }

  private present(f: SkillReadinessFacts, report: ReadinessReport, claim: { state: string; state_reason: string } | null, progressState: { code: string; label_ar: string; label_en: string } | null, materials: number) {
    const config = f.config as TrackSkillConfig;
    return {
      skillId: f.skillId, labelAr: f.labelAr, labelEn: f.labelEn,
      // 1. journey
      progress: progressState ? { state: progressState.code, labelAr: progressState.label_ar, labelEn: progressState.label_en } : null,
      // 2. verification level (never derived from anything else)
      verification: { level: f.verificationLevel, stateReason: claim?.state_reason ?? null, hasClaim: claim !== null },
      // 3. evidence
      evidence: { standingEvaluatedCount: f.standingEvidenceCount, submittedMaterialCount: materials },
      // 4. readiness contribution — configuration only; badges never show pending classification as fact
      readiness: { ...skillReadinessContribution(f.skillId, report, config), badge: trackSkillBadge({ isCore: config.isCore, classificationStatus: config.classificationStatus, enabled: config.enabled }),
        classificationStatus: config.classificationStatus, category: config.category, displayOrder: config.displayOrder, enabled: config.enabled },
      verificationEffectOfReadiness: 'none' as const,
    };
  }

  async trackSkill(userId: string, skillId: string) {
    const list = await this.trackSkills(userId);
    const item = list.items.find((i) => i.skillId === skillId);
    if (!item) throw new NotFoundException('skill is not part of the current track');
    const detail = await this.db.asUser(userId, async (c) => {
      const items = await c.query(
        `select i.id, i.item_type_code, t.label_ar as type_label_ar, i.title, i.status, i.attempt_number, i.submitted_at, i.source
           from evidence_item i join evidence_item_type t on t.code = i.item_type_code join evidence_item_skill l on l.evidence_item_id = i.id
          where l.user_id = $1 and l.skill_id = $2 order by i.created_at desc limit 50`, [userId, skillId]);
      const evidence = await c.query(`select id, source_strength, evaluation_result_id, project_id, created_at, withdrawn_at from evidence where user_id = $1 and skill_id = $2 order by created_at desc`, [userId, skillId]);
      const decisions = await c.query(`select id, decision, previous_state, proposed_state, resulting_state, policy_key, policy_version, policy_status, decided_by_ref, track_config_version_id, decided_at from verification_decision where user_id = $1 and skill_id = $2 order by decided_at desc limit 20`, [userId, skillId]);
      const events = await c.query(`select trigger_code, from_state, to_state, applied, outcome, reason, created_at from skill_progress_event where user_id = $1 and skill_id = $2 order by created_at desc limit 20`, [userId, skillId]);
      // A1: the related activities are those of the current role's catalogue (one rule, in the database).
      const activities = await c.query(`select a.id, a.slug, a.title_ar, a.version, k.depth from activity_skill k join activity_spec a on a.id = k.activity_spec_id
         where k.skill_id = $1 and graduate_activity_in_catalogue(a.id, $2) order by a.title_ar`, [skillId, list.role?.id ?? null]);
      return {
        materials: items.rows.map((r) => ({ id: r.id, typeCode: r.item_type_code, typeLabelAr: r.type_label_ar, title: r.title, status: r.status, attemptNumber: Number(r.attempt_number), submittedAt: r.submitted_at, source: r.source })),
        evaluatedEvidence: evidence.rows.map((r) => ({ id: r.id, sourceStrength: r.source_strength, evaluationResultId: r.evaluation_result_id, projectId: r.project_id, createdAt: r.created_at, withdrawnAt: r.withdrawn_at })),
        decisions: decisions.rows.map((r) => ({ id: r.id, decision: r.decision, previousState: r.previous_state, proposedState: r.proposed_state, resultingState: r.resulting_state, policy: `${r.policy_key}@${r.policy_version}`, policyStatus: r.policy_status, policyResolution: r.decided_by_ref?.startsWith('policy:') ? r.decided_by_ref.slice(7) : null, trackConfigVersionId: r.track_config_version_id, decidedAt: r.decided_at })),
        journeyEvents: events.rows.map((r) => ({ trigger: r.trigger_code, from: r.from_state, to: r.to_state, applied: r.applied, outcome: r.outcome, reason: r.reason, at: r.created_at })),
        activities: activities.rows.map((r) => ({ id: r.id, slug: r.slug, titleAr: r.title_ar, version: r.version, depth: r.depth })),
      };
    });
    return { role: list.role, skill: item, ...detail, readinessStatus: list.readiness.status, readinessHeadlineAr: list.readiness.headlineAr, ruleSetValidated: list.readiness.ruleSet ? configIsValidated(list.readiness.ruleSet) : false };
  }
}
