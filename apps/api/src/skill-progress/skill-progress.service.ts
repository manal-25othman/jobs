import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { SkillProgressEngine } from './skill-progress-engine.service';
import { progressRuleIsValidated, verificationEffectOfProgress } from '@naqla/domain';

/** Read side of the journey (Phase 2). Both dimensions are returned side by side, never merged. */
@Injectable()
export class SkillProgressService {
  constructor(private readonly db: DbService, private readonly engine: SkillProgressEngine) {}

  async engineStatus() {
    return this.db.asService(async (c) => {
      const set = await this.engine.loadRuleSet(c);
      const validated = set.rules.filter((r) => r.enabled && progressRuleIsValidated(r)).length;
      return {
        active: set.usable.usable, reason: set.usable.usable ? null : set.usable.reason,
        production: this.engine.isProduction(), enabledRules: set.rules.filter((r) => r.enabled).length, validatedRules: validated,
        verificationEffect: verificationEffectOfProgress(),
      };
    });
  }

  /** The registry and rules with their validation state. Read-only; for transparency and later admin UI. */
  async listRules() {
    return this.db.asService(async (c) => {
      const states = (await c.query('select code, label_ar, label_en, description_en, display_order, is_initial, enabled, review_status, validation_note_en from skill_progress_state order by display_order')).rows;
      const triggers = (await c.query('select code, label_en, description_en, producer_en, active from skill_progress_trigger order by code')).rows;
      const rules = (await c.query('select id, from_state, to_state, trigger_code, guard, rationale_en, enabled, version, review_status, validation_note_en from skill_progress_transition order by from_state, trigger_code, version')).rows;
      return {
        states: states.map((s) => ({ code: s.code, labelAr: s.label_ar, labelEn: s.label_en, descriptionEn: s.description_en, displayOrder: Number(s.display_order), isInitial: s.is_initial, enabled: s.enabled, reviewStatus: s.review_status, validated: s.review_status === 'approved' || s.review_status === 'published', validationNote: s.validation_note_en })),
        triggers: triggers.map((t) => ({ code: t.code, labelEn: t.label_en, descriptionEn: t.description_en, producerEn: t.producer_en, active: t.active })),
        rules: rules.map((r) => ({ id: r.id, from: r.from_state, to: r.to_state, trigger: r.trigger_code, guard: r.guard, rationaleEn: r.rationale_en, enabled: r.enabled, version: Number(r.version), reviewStatus: r.review_status, validated: progressRuleIsValidated({ reviewStatus: r.review_status }), validationNote: r.validation_note_en })),
        engine: await this.engineStatus(),
      };
    });
  }

  async listMine(userId: string) {
    const engine = await this.engineStatus();
    const items = await this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select sp.id, sp.skill_id, sk.label_ar, sk.label_en, sp.state_code, st.label_ar as state_label_ar, st.label_en as state_label_en, st.review_status as state_review_status,
                sp.reason, sp.last_trigger_code, sp.last_event_at, sp.updated_at, sp.target_role_id,
                sc.state as claim_state, sc.state_reason as claim_reason
           from skill_progress sp
           join skill sk on sk.id = sp.skill_id
           join skill_progress_state st on st.code = sp.state_code
           left join skill_claim sc on sc.user_id = sp.user_id and sc.skill_id = sp.skill_id
          where sp.user_id = $1
          order by st.display_order desc, sk.label_en`, [userId]);
      return rows.map(mapProgress);
    });
    return { items, engine };
  }

  async eventsFor(userId: string, skillId: string) {
    return this.db.asUser(userId, async (c) => {
      const sp = await c.query('select id from skill_progress where user_id = $1 and skill_id = $2', [userId, skillId]);
      if (sp.rowCount === 0) throw new NotFoundException('no journey recorded for this skill');
      const { rows } = await c.query(
        `select id, trigger_code, from_state, to_state, applied, outcome, transition_rule_id, rule_version, facts, event_ref_table, event_ref_id, reason, actor_kind, created_at
           from skill_progress_event where skill_progress_id = $1 order by created_at, id`, [sp.rows[0].id]);
      return rows.map((e) => ({ id: e.id, trigger: e.trigger_code, from: e.from_state, to: e.to_state, applied: e.applied, outcome: e.outcome, ruleId: e.transition_rule_id, ruleVersion: e.rule_version === null ? null : Number(e.rule_version), facts: e.facts, eventRef: e.event_ref_table ? { table: e.event_ref_table, id: e.event_ref_id } : null, reason: e.reason, actorKind: e.actor_kind, createdAt: e.created_at }));
    });
  }
}

export function mapProgress(r: Record<string, unknown>) {
  return {
    skillId: r['skill_id'], skillNameAr: r['label_ar'], skillName: r['label_en'],
    // Dimension 1: the journey.
    progress: { state: r['state_code'], stateLabelAr: r['state_label_ar'], stateLabelEn: r['state_label_en'], stateReviewStatus: r['state_review_status'],
      reason: r['reason'], lastTrigger: r['last_trigger_code'], lastEventAt: r['last_event_at'], updatedAt: r['updated_at'], targetRoleId: r['target_role_id'] },
    // Dimension 2: the verification level (absent = gap; never derived from the journey).
    verification: r['claim_state'] ? { state: r['claim_state'], stateReason: r['claim_reason'] } : null,
    verificationEffectOfProgress: verificationEffectOfProgress(),
  };
}
