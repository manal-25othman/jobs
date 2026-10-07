/**
 * Phase 5 — rule types in code, values as data; no result without an active validated set.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateReadiness, assertReadinessRuleSetSane, readinessRuleFromRow, skillReadinessContribution, READINESS_PENDING_HEADLINE_AR, READINESS_RULE_TYPES,
  DomainError, type ReadinessRuleSet, type ReadinessRule, type SkillReadinessFacts, type TrackSkillConfig,
} from './index.js';

const cfg = (over: Partial<TrackSkillConfig> & { skillId: string }): TrackSkillConfig => ({ roleRequirementId: `rr-${over.skillId}`, isCore: false, importance: null, category: null, displayOrder: null, expectedLevel: null, readinessContribution: null, enabled: true, classificationStatus: 'pending_expert_validation', minimumEvidenceCount: null, reviewStatus: 'draft', version: 1, ...over });
const fact = (skillId: string, level: SkillReadinessFacts['verificationLevel'], evidence = 0, c: Partial<TrackSkillConfig> = {}): SkillReadinessFacts =>
  ({ skillId, labelAr: skillId, labelEn: skillId, verificationLevel: level, standingEvidenceCount: evidence, progressState: null, config: cfg({ skillId, ...c }) });
let n = 0;
const rule = (type: ReadinessRule['type'], params: Record<string, unknown>, skillId: string | null = null): ReadinessRule => ({ id: `r${++n}`, type, params, skillId, labelAr: type, labelEn: type, enabled: true, position: n });
const set = (rules: ReadinessRule[], over: Partial<ReadinessRuleSet> = {}): ReadinessRuleSet => ({ id: 's', key: 'test', version: 1, reviewStatus: 'draft', activation: 'development_only', baselineOf: null, approvedBy: null, targetRoleId: null, labelAr: 'x', labelEn: 'x', rules, ...over });

const FACTS = [fact('js', 'demonstrated', 1, { isCore: true }), fact('css', 'practiced', 0, { isCore: true }), fact('html', 'demonstrated', 2), fact('debug', 'gap', 0)];

describe('no active validated set ⇒ no result, only an explicit state', () => {
  test('null set ⇒ not_yet_configured with the neutral headline; draft dev-only set ⇒ pending_validation with facts but no overall', () => {
    const none = evaluateReadiness({ ruleSet: null, resolution: 'none', facts: FACTS });
    assert.equal(none.status, 'not_yet_configured'); assert.equal(none.headlineAr, READINESS_PENDING_HEADLINE_AR); assert.equal(none.overall, null); assert.equal(none.verificationEffect, 'none');
    const dev = evaluateReadiness({ ruleSet: set([rule('min_skills_at_level', { min_count: 2, min_level: 'demonstrated' })]), resolution: 'development_only', facts: FACTS });
    assert.equal(dev.status, 'pending_validation'); assert.equal(dev.headlineAr, READINESS_PENDING_HEADLINE_AR); assert.equal(dev.overall, null);
    assert.equal(dev.rules[0]!.outcome, 'satisfied'); assert.equal(dev.summary.total, 1);
    const approvedButNotProd = evaluateReadiness({ ruleSet: set([rule('min_skills_at_level', { min_count: 2, min_level: 'demonstrated' })], { reviewStatus: 'approved', approvedBy: 'sme' }), resolution: 'development_only', facts: FACTS });
    assert.equal(approvedButNotProd.status, 'pending_validation', 'approved but not production-active is still not an evaluated result');
  });
  test('validated production-active set ⇒ evaluated with an overall that is a rule-set verdict, never a level or a percentage', () => {
    const prod = { reviewStatus: 'approved', approvedBy: 'sme', activation: 'production_active' as const };
    const ok = evaluateReadiness({ ruleSet: set([rule('min_skills_at_level', { min_count: 2, min_level: 'demonstrated' })], prod), resolution: 'production_active', facts: FACTS });
    assert.equal(ok.status, 'evaluated'); assert.equal(ok.overall, 'meets_rule_set');
    const no = evaluateReadiness({ ruleSet: set([rule('min_skills_at_level', { min_count: 3, min_level: 'demonstrated' })], prod), resolution: 'production_active', facts: FACTS });
    assert.equal(no.overall, 'does_not_meet_rule_set'); assert.match(no.rules[0]!.detailEn, /2 of 4/);
    assert.ok(!JSON.stringify(no).includes('%'));
  });
});

describe('rule types read facts; values come from the rule', () => {
  test('required / non-compensable skill at level', () => {
    const r = evaluateReadiness({ ruleSet: set([rule('required_skill_at_level', { min_level: 'demonstrated' }, 'js'), rule('non_compensable_skill', { min_level: 'demonstrated' }, 'css'), rule('required_skill_at_level', { min_level: 'practiced' }, 'nope')]), resolution: 'development_only', facts: FACTS });
    assert.deepEqual(r.rules.map((x) => x.outcome), ['satisfied', 'not_satisfied', 'indeterminate']);
    assert.equal(r.rules[1]!.nonCompensable, true);
  });
  test('all core skills: indeterminate while classification is pending; judged once approved', () => {
    const pending = evaluateReadiness({ ruleSet: set([rule('all_core_skills_at_level', { min_level: 'demonstrated' })]), resolution: 'development_only', facts: FACTS });
    assert.equal(pending.rules[0]!.outcome, 'indeterminate'); assert.match(pending.rules[0]!.detailEn, /pending expert validation/);
    const approved = FACTS.map((f) => ({ ...f, config: cfg({ ...f.config!, classificationStatus: 'approved' }) }));
    const judged = evaluateReadiness({ ruleSet: set([rule('all_core_skills_at_level', { min_level: 'demonstrated' })]), resolution: 'development_only', facts: approved });
    assert.equal(judged.rules[0]!.outcome, 'not_satisfied', 'css is core and only practiced');
    const scopeCore = evaluateReadiness({ ruleSet: set([rule('min_skills_at_level', { min_count: 1, min_level: 'demonstrated', scope: 'core' })]), resolution: 'development_only', facts: approved });
    assert.equal(scopeCore.rules[0]!.outcome, 'satisfied');
  });
  test('expected levels and evidence counts; disabled skills are out of scope', () => {
    const undecided = evaluateReadiness({ ruleSet: set([rule('all_skills_at_expected_level', {})]), resolution: 'development_only', facts: FACTS });
    assert.equal(undecided.rules[0]!.outcome, 'indeterminate');
    const withLevels = FACTS.map((f) => ({ ...f, config: cfg({ ...f.config!, expectedLevel: f.skillId === 'debug' ? 'practiced' : 'demonstrated' }) }));
    const judged = evaluateReadiness({ ruleSet: set([rule('all_skills_at_expected_level', {})]), resolution: 'development_only', facts: withLevels });
    assert.equal(judged.rules[0]!.outcome, 'not_satisfied'); assert.match(judged.rules[0]!.detailEn, /2 of 4/);
    const disabled = withLevels.map((f) => (f.skillId === 'debug' || f.skillId === 'css' ? { ...f, config: cfg({ ...f.config!, enabled: false }) } : f));
    assert.equal(evaluateReadiness({ ruleSet: set([rule('all_skills_at_expected_level', {})]), resolution: 'development_only', facts: disabled }).rules[0]!.outcome, 'satisfied');
    const ev = evaluateReadiness({ ruleSet: set([rule('min_evidence_per_skill', { min_count: 1 }, 'html'), rule('min_evidence_per_skill', { min_count: 1 })]), resolution: 'development_only', facts: FACTS });
    assert.deepEqual(ev.rules.map((x) => x.outcome), ['satisfied', 'not_satisfied']);
  });
  test('NEGATIVE: malformed values, unknown types, and a readiness "baseline" are refused', () => {
    assert.throws(() => assertReadinessRuleSetSane(set([rule('min_skills_at_level', { min_count: 0, min_level: 'demonstrated' })])), DomainError);
    assert.throws(() => assertReadinessRuleSetSane(set([rule('min_skills_at_level', { min_count: 2, min_level: 'expert' })])), DomainError);
    assert.throws(() => assertReadinessRuleSetSane(set([rule('required_skill_at_level', { min_level: 'practiced' }, null)])), DomainError);
    assert.throws(() => assertReadinessRuleSetSane(set([rule('min_skills_at_level', { min_count: 2, min_level: 'demonstrated', scope: 'mandatory' })])), DomainError);
    assert.throws(() => assertReadinessRuleSetSane(set([], { baselineOf: 'x' })), /never be a legacy baseline/);
    assert.throws(() => readinessRuleFromRow({ id: 'r', rule_type: 'percentage_of_skills', params: {}, skill_id: null, label_ar: 'x', label_en: 'x', enabled: true, position: 0 }), DomainError);
    assert.equal(READINESS_RULE_TYPES.length, 6);
  });
  test('a skill\'s contribution states configuration, never a verdict', () => {
    const rep = evaluateReadiness({ ruleSet: set([rule('required_skill_at_level', { min_level: 'demonstrated' }, 'js')]), resolution: 'development_only', facts: FACTS });
    const c = skillReadinessContribution('js', rep, FACTS[0]!.config);
    assert.equal(c.configured, true); assert.equal(c.rulesNamingSkill.length, 1); assert.equal(c.expectedLevelStatus, 'undecided'); assert.equal(c.readinessContribution, 'undecided');
    const none = skillReadinessContribution('js', evaluateReadiness({ ruleSet: null, resolution: 'none', facts: FACTS }), cfg({ skillId: 'js', expectedLevel: 'demonstrated' }));
    assert.equal(none.configured, false); assert.equal(none.expectedLevelStatus, 'pending_expert_validation');
  });
});
