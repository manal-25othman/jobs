import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  nextProgress, initialProgressState, assertProgressRuleSetSane, progressRulesUsable, progressStateFromRow, progressRuleFromRow,
  verificationEffectOfProgress, MissingPrerequisite,
  type ProgressFacts, type ProgressStateSpec, type ProgressTransitionRule,
} from '@naqla/domain';
import { emitAuditEvent } from '../infra/audit';

export interface ProgressRuleSet {
  states: ProgressStateSpec[];
  rules: ProgressTransitionRule[];
  triggers: { code: string; active: boolean }[];
  usable: { usable: true } | { usable: false; reason: string };
}

/**
 * The journey engine (Phase 2). Runs INSIDE the caller's transaction.
 *
 * It reads states, triggers and rules as data, asks the domain for the one
 * matching rule, and writes the progress row and an append-only event.
 * It never touches skill_claim, evidence or evidence_transition: a journey
 * step is not a verification (verificationEffectOfProgress() === 'none').
 */
@Injectable()
export class SkillProgressEngine {
  private readonly logger = new Logger(SkillProgressEngine.name);

  isProduction(): boolean { return process.env['NODE_ENV'] === 'production'; }

  async loadRuleSet(c: PoolClient): Promise<ProgressRuleSet> {
    const states = (await c.query('select code, is_initial, enabled, review_status from skill_progress_state order by display_order')).rows.map(progressStateFromRow);
    const rules = (await c.query('select id, from_state, to_state, trigger_code, guard, enabled, version, review_status from skill_progress_transition order by from_state, trigger_code, version')).rows.map(progressRuleFromRow);
    const triggers = (await c.query('select code, active from skill_progress_trigger')).rows as { code: string; active: boolean }[];
    assertProgressRuleSetSane(states, rules);
    return { states, rules, triggers, usable: progressRulesUsable(rules, { production: this.isProduction() }) };
  }

  /**
   * Emits one journey event for (user, skill). The progress row is created at
   * the initial state on first contact. Every emission is logged, applied or
   * not, so a reader can see why a state did or did not move.
   */
  async apply(c: PoolClient, p: {
    userId: string; skillId: string; trigger: string; facts: ProgressFacts;
    eventRef?: { table: string; id: string } | undefined; reason: string; actorKind: 'user' | 'human_reviewer' | 'system';
  }): Promise<{ progressId: string; from: string; to: string; applied: boolean; outcome: 'transitioned' | 'no_matching_rule' | 'rules_inactive' }> {
    const set = await this.loadRuleSet(c);
    const trig = set.triggers.find((t) => t.code === p.trigger);
    if (!trig) throw new MissingPrerequisite('skill_progress_trigger', `journey trigger '${p.trigger}' is not registered`);
    if (!trig.active) throw new MissingPrerequisite('skill_progress_trigger.active', `journey trigger '${p.trigger}' is registered without a producer; it cannot be emitted`);

    const initial = initialProgressState(set.states);
    const goal = await c.query('select target_role_id from career_goal where user_id = $1 and is_current', [p.userId]);
    const row = await c.query(
      `insert into skill_progress (user_id, skill_id, target_role_id, state_code, reason)
       values ($1,$2,$3,$4,$5)
       on conflict (user_id, skill_id) do update set user_id = excluded.user_id
       returning id, state_code`,
      [p.userId, p.skillId, goal.rows[0]?.target_role_id ?? null, initial.code, 'journey started; no verification implied']);
    const progressId: string = row.rows[0].id;
    const from: string = row.rows[0].state_code;

    let to = from; let applied = false; let outcome: 'transitioned' | 'no_matching_rule' | 'rules_inactive';
    let rule: ProgressTransitionRule | null = null;
    if (!set.usable.usable) {
      outcome = 'rules_inactive';
      this.logger.warn(`journey rules not applied: ${set.usable.reason}`);
    } else {
      const decision = nextProgress({ rules: set.rules, currentState: from, trigger: p.trigger, facts: p.facts });
      if (decision.kind === 'transition') {
        rule = decision.rule; to = decision.to; applied = true; outcome = 'transitioned';
        await c.query(
          `update skill_progress set state_code = $2, reason = $3, last_trigger_code = $4, last_event_at = now(), transition_rule_id = $5 where id = $1`,
          [progressId, to, p.reason, p.trigger, rule.id]);
      } else {
        outcome = 'no_matching_rule';
      }
    }
    await c.query(
      `insert into skill_progress_event
         (skill_progress_id, user_id, skill_id, trigger_code, from_state, to_state, applied, outcome, transition_rule_id, rule_version, facts, event_ref_table, event_ref_id, reason, actor_kind)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [progressId, p.userId, p.skillId, p.trigger, from, applied ? to : null, applied, outcome, rule?.id ?? null, rule?.version ?? null,
       JSON.stringify(p.facts), p.eventRef?.table ?? null, p.eventRef?.id ?? null, p.reason, p.actorKind]);
    if (applied) {
      await emitAuditEvent(c, {
        eventType: 'skill_progress.transitioned', userId: p.userId, actorKind: 'system',
        subjectTable: 'skill_progress', subjectId: progressId,
        reason: `${p.reason}; verification effect: ${verificationEffectOfProgress()}`,
        payload: { skillId: p.skillId, from, to, trigger: p.trigger, ruleId: rule?.id, ruleVersion: rule?.version, ruleStatus: rule?.reviewStatus },
      });
    }
    return { progressId, from, to, applied, outcome };
  }

  /** Emits the same event for several skills. */
  async applyAll(c: PoolClient, skillIds: Iterable<string>, p: Omit<Parameters<SkillProgressEngine['apply']>[1], 'skillId'>): Promise<void> {
    for (const skillId of new Set(skillIds)) await this.apply(c, { ...p, skillId });
  }
}
