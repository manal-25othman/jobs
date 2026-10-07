/**
 * Readiness Engine (Configurable Track Architecture, Phase 5).
 *
 * Rule TYPES are code: each type says what facts it reads and how a rule of
 * that type is satisfied. Rule VALUES are data: a versioned, governed rule set.
 * No value lives here — not "3 of 7", not "70%", not "all core".
 *
 * What is fixed here (invariants):
 *   - readiness never changes a verification level; the engine only READS
 *     claim states, evidence counts and TrackSkill configuration.
 *   - a verification level never implies readiness: the result is a report
 *     over configured rules, never a derived level.
 *   - no active rule set ⇒ `not_yet_configured`; an active but unvalidated
 *     set (development only) ⇒ `pending_validation`; only a validated,
 *     production-active set ⇒ `evaluated`. No percentage anywhere.
 *   - a rule that depends on an unapproved classification (e.g. "all core
 *     skills" while `is_core` is pending expert validation) is
 *     `indeterminate`, never silently satisfied or failed.
 */

import { DomainError, MissingPrerequisite } from './errors.js';
import { EVIDENCE_STATES, evidenceOrdinal, type EvidenceState } from './evidence-state.js';
import { configIsValidated, type ConfigResolution, type GovernedConfig, type TrackSkillConfig } from './configuration.js';

export const READINESS_RULE_TYPES = [
  'required_skill_at_level',      // params: { min_level }            skill_id required — e.g. "JavaScript at demonstrated"
  'non_compensable_skill',        // params: { min_level }            skill_id required — like required, and no other skill can compensate (reported as such)
  'min_skills_at_level',          // params: { min_count, min_level, scope: 'all' | 'enabled' | 'core' }
  'all_core_skills_at_level',     // params: { min_level }            core = is_core AND classification approved; pending ⇒ indeterminate
  'all_skills_at_expected_level', // params: {}                       uses TrackSkill.expected_level; null ⇒ indeterminate for that skill
  'min_evidence_per_skill',       // params: { min_count }            skill_id optional (null = every enabled skill)
] as const;
export type ReadinessRuleType = (typeof READINESS_RULE_TYPES)[number];

export interface ReadinessRule {
  id: string;
  type: ReadinessRuleType;
  params: Readonly<Record<string, unknown>>;
  skillId: string | null;
  labelAr: string;
  labelEn: string;
  enabled: boolean;
  position: number;
}

export interface ReadinessRuleSet extends GovernedConfig {
  targetRoleId: string | null;
  labelAr: string;
  labelEn: string;
  rules: readonly ReadinessRule[];
}

/** The facts the engine reads for one TrackSkill. Nothing here is written by the engine. */
export interface SkillReadinessFacts {
  skillId: string;
  labelAr: string;
  labelEn: string;
  /** `gap` when the user has no claim. */
  verificationLevel: EvidenceState;
  standingEvidenceCount: number;
  progressState: string | null;
  config: TrackSkillConfig | null;
}

export type RuleOutcome = 'satisfied' | 'not_satisfied' | 'indeterminate';
export interface RuleResult {
  ruleId: string;
  type: ReadinessRuleType;
  labelAr: string;
  labelEn: string;
  outcome: RuleOutcome;
  /** Human-readable facts behind the outcome; never a percentage. */
  detailEn: string;
  nonCompensable: boolean;
  skillIds: string[];
}

export type ReadinessStatus = 'not_yet_configured' | 'pending_validation' | 'evaluated';

export interface ReadinessReport {
  status: ReadinessStatus;
  /** Neutral user-facing headline when no approved rule applies (owner wording). */
  headlineAr: string;
  ruleSet: { id: string; key: string; version: number; reviewStatus: string; validated: boolean; resolution: ConfigResolution } | null;
  rules: RuleResult[];
  summary: { satisfied: number; notSatisfied: number; indeterminate: number; total: number };
  /** Only when status = evaluated. Never a level, never a percentage. */
  overall: 'meets_rule_set' | 'does_not_meet_rule_set' | null;
  verificationEffect: 'none';
}

export const READINESS_PENDING_HEADLINE_AR = 'معيار الجاهزية لهذا المسار قيد الاعتماد';
export const READINESS_VERIFICATION_EFFECT = 'none' as const;

function levelParam(params: Readonly<Record<string, unknown>>, ruleId: string): EvidenceState {
  const v = params['min_level'];
  if (typeof v !== 'string' || !(EVIDENCE_STATES as readonly string[]).includes(v)) throw new DomainError(`rule ${ruleId}: min_level must be an evidence state`);
  return v as EvidenceState;
}
function intParam(params: Readonly<Record<string, unknown>>, key: string, ruleId: string): number {
  const v = params[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new DomainError(`rule ${ruleId}: ${key} must be a positive integer`);
  return v;
}

/** Structural sanity of a rule set. Values are not judged here — only their shape. */
export function assertReadinessRuleSetSane(set: ReadinessRuleSet): void {
  if (set.baselineOf !== null || set.activation === 'legacy_baseline') throw new DomainError('a readiness rule set can never be a legacy baseline: no readiness rule existed before Phase 5');
  const seen = new Set<string>();
  for (const r of set.rules) {
    if (!(READINESS_RULE_TYPES as readonly string[]).includes(r.type)) throw new DomainError(`rule ${r.id}: unknown rule type '${r.type}'`);
    if (seen.has(r.id)) throw new DomainError(`rule ${r.id}: duplicate id`); seen.add(r.id);
    switch (r.type) {
      case 'required_skill_at_level': case 'non_compensable_skill':
        if (!r.skillId) throw new DomainError(`rule ${r.id}: ${r.type} needs a skill_id`); levelParam(r.params, r.id); break;
      case 'min_skills_at_level': {
        intParam(r.params, 'min_count', r.id); levelParam(r.params, r.id);
        const scope = r.params['scope'] ?? 'enabled';
        if (!['all', 'enabled', 'core'].includes(scope as string)) throw new DomainError(`rule ${r.id}: scope must be all | enabled | core`); break;
      }
      case 'all_core_skills_at_level': levelParam(r.params, r.id); break;
      case 'all_skills_at_expected_level': break;
      case 'min_evidence_per_skill': intParam(r.params, 'min_count', r.id); break;
    }
  }
}

const atLeast = (level: EvidenceState, min: EvidenceState) => evidenceOrdinal(level) >= evidenceOrdinal(min);

function evaluateRule(rule: ReadinessRule, facts: readonly SkillReadinessFacts[]): RuleResult {
  const base = { ruleId: rule.id, type: rule.type, labelAr: rule.labelAr, labelEn: rule.labelEn, nonCompensable: rule.type === 'non_compensable_skill' };
  const enabled = facts.filter((f) => f.config?.enabled !== false);
  switch (rule.type) {
    case 'required_skill_at_level': case 'non_compensable_skill': {
      const min = levelParam(rule.params, rule.id);
      const f = facts.find((x) => x.skillId === rule.skillId);
      if (!f) return { ...base, outcome: 'indeterminate', detailEn: `skill ${rule.skillId} is not part of this track`, skillIds: [rule.skillId!] };
      const ok = atLeast(f.verificationLevel, min);
      return { ...base, outcome: ok ? 'satisfied' : 'not_satisfied', detailEn: `${f.labelEn}: ${f.verificationLevel} (needs ${min})`, skillIds: [f.skillId] };
    }
    case 'min_skills_at_level': {
      const min = levelParam(rule.params, rule.id); const n = intParam(rule.params, 'min_count', rule.id); const scope = (rule.params['scope'] as string | undefined) ?? 'enabled';
      let pool = scope === 'all' ? facts : enabled;
      if (scope === 'core') {
        const pending = enabled.filter((f) => !f.config || f.config.classificationStatus !== 'approved');
        if (pending.length) return { ...base, outcome: 'indeterminate', detailEn: `core classification pending expert validation for ${pending.length} skill(s)`, skillIds: pending.map((f) => f.skillId) };
        pool = enabled.filter((f) => f.config?.isCore);
      }
      const met = pool.filter((f) => atLeast(f.verificationLevel, min));
      return { ...base, outcome: met.length >= n ? 'satisfied' : 'not_satisfied', detailEn: `${met.length} of ${pool.length} ${scope} skill(s) at ${min} or above (needs ${n})`, skillIds: met.map((f) => f.skillId) };
    }
    case 'all_core_skills_at_level': {
      const min = levelParam(rule.params, rule.id);
      const pending = enabled.filter((f) => !f.config || f.config.classificationStatus !== 'approved');
      if (pending.length) return { ...base, outcome: 'indeterminate', detailEn: `core classification pending expert validation for ${pending.length} skill(s); the rule cannot be judged`, skillIds: pending.map((f) => f.skillId) };
      const core = enabled.filter((f) => f.config?.isCore);
      const missing = core.filter((f) => !atLeast(f.verificationLevel, min));
      return { ...base, outcome: missing.length === 0 ? 'satisfied' : 'not_satisfied', detailEn: `${core.length - missing.length} of ${core.length} approved core skill(s) at ${min} or above`, skillIds: core.map((f) => f.skillId) };
    }
    case 'all_skills_at_expected_level': {
      const undecided = enabled.filter((f) => !f.config?.expectedLevel);
      if (undecided.length) return { ...base, outcome: 'indeterminate', detailEn: `expected level undecided for ${undecided.length} skill(s)`, skillIds: undecided.map((f) => f.skillId) };
      const missing = enabled.filter((f) => !atLeast(f.verificationLevel, f.config!.expectedLevel!));
      return { ...base, outcome: missing.length === 0 ? 'satisfied' : 'not_satisfied', detailEn: `${enabled.length - missing.length} of ${enabled.length} skill(s) at their expected level`, skillIds: enabled.map((f) => f.skillId) };
    }
    case 'min_evidence_per_skill': {
      const n = intParam(rule.params, 'min_count', rule.id);
      const pool = rule.skillId ? facts.filter((f) => f.skillId === rule.skillId) : enabled;
      if (rule.skillId && pool.length === 0) return { ...base, outcome: 'indeterminate', detailEn: `skill ${rule.skillId} is not part of this track`, skillIds: [rule.skillId] };
      const short = pool.filter((f) => f.standingEvidenceCount < n);
      return { ...base, outcome: short.length === 0 ? 'satisfied' : 'not_satisfied', detailEn: `${pool.length - short.length} of ${pool.length} skill(s) with at least ${n} standing evidence`, skillIds: pool.map((f) => f.skillId) };
    }
  }
}

/**
 * Pure: f(rule set, facts) → report. Never writes, never derives a level, never a percentage.
 */
export function evaluateReadiness(p: { ruleSet: ReadinessRuleSet | null; resolution: ConfigResolution | 'none'; facts: readonly SkillReadinessFacts[] }): ReadinessReport {
  if (!p.ruleSet || p.resolution === 'none') {
    return { status: 'not_yet_configured', headlineAr: READINESS_PENDING_HEADLINE_AR, ruleSet: null, rules: [], summary: { satisfied: 0, notSatisfied: 0, indeterminate: 0, total: 0 }, overall: null, verificationEffect: READINESS_VERIFICATION_EFFECT };
  }
  assertReadinessRuleSetSane(p.ruleSet);
  const rules = [...p.ruleSet.rules].filter((r) => r.enabled).sort((a, b) => a.position - b.position).map((r) => evaluateRule(r, p.facts));
  const summary = { satisfied: rules.filter((r) => r.outcome === 'satisfied').length, notSatisfied: rules.filter((r) => r.outcome === 'not_satisfied').length, indeterminate: rules.filter((r) => r.outcome === 'indeterminate').length, total: rules.length };
  const validated = configIsValidated(p.ruleSet) && p.resolution === 'production_active';
  const status: ReadinessStatus = validated ? 'evaluated' : 'pending_validation';
  return {
    status,
    headlineAr: status === 'evaluated' ? (summary.notSatisfied === 0 && summary.indeterminate === 0 ? 'يستوفي معيار الجاهزية المعتمد لهذا المسار' : 'لا يستوفي معيار الجاهزية المعتمد لهذا المسار بعد') : READINESS_PENDING_HEADLINE_AR,
    ruleSet: { id: p.ruleSet.id, key: p.ruleSet.key, version: p.ruleSet.version, reviewStatus: p.ruleSet.reviewStatus, validated: configIsValidated(p.ruleSet), resolution: p.resolution },
    rules, summary,
    overall: status === 'evaluated' ? (summary.notSatisfied === 0 && summary.indeterminate === 0 ? 'meets_rule_set' : 'does_not_meet_rule_set') : null,
    verificationEffect: READINESS_VERIFICATION_EFFECT,
  };
}

/** Reads a rule row (snake_case) into the typed rule; unknown types are refused, never defaulted. */
export function readinessRuleFromRow(r: { id: string; rule_type: string; params: unknown; skill_id: string | null; label_ar: string; label_en: string; enabled: boolean; position: number | string }): ReadinessRule {
  if (!(READINESS_RULE_TYPES as readonly string[]).includes(r.rule_type)) throw new DomainError(`unknown readiness rule type '${r.rule_type}'`);
  if (!r.params || typeof r.params !== 'object' || Array.isArray(r.params)) throw new DomainError(`rule ${r.id}: params must be an object`);
  return { id: r.id, type: r.rule_type as ReadinessRuleType, params: r.params as Record<string, unknown>, skillId: r.skill_id, labelAr: r.label_ar, labelEn: r.label_en, enabled: r.enabled, position: Number(r.position) };
}

/** A skill's readiness CONTRIBUTION as the UI may state it: which rules name it, and only what the configuration already says. Never a verdict. */
export function skillReadinessContribution(skillId: string, report: ReadinessReport, config: TrackSkillConfig | null): {
  configured: boolean; rulesNamingSkill: { ruleId: string; labelAr: string; outcome: RuleOutcome; nonCompensable: boolean }[];
  expectedLevel: EvidenceState | null; expectedLevelStatus: 'pending_expert_validation' | 'approved' | 'undecided'; readinessContribution: 'counts' | 'informational' | 'undecided';
} {
  const naming = report.rules.filter((r) => r.skillIds.includes(skillId)).map((r) => ({ ruleId: r.ruleId, labelAr: r.labelAr, outcome: r.outcome, nonCompensable: r.nonCompensable }));
  return {
    configured: report.status !== 'not_yet_configured',
    rulesNamingSkill: naming,
    expectedLevel: config?.expectedLevel ?? null,
    expectedLevelStatus: !config?.expectedLevel ? 'undecided' : config.classificationStatus === 'approved' ? 'approved' : 'pending_expert_validation',
    readinessContribution: config?.readinessContribution ?? 'undecided',
  };
}

export function assertReadinessRuleSetUsable(set: ReadinessRuleSet | null, resolution: ConfigResolution | 'none'): void {
  if (set && resolution === 'production_active' && !configIsValidated(set)) throw new MissingPrerequisite('readiness_rule_set', `rule set ${set.key}@${set.version} is production_active but not validated`);
}
