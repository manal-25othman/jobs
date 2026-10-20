import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertClassificationSane, classificationApprovalProblems, classificationInEffect, professionalLabel, requiredForRole, classificationReadinessProblems,
  evaluateReadiness, assertPackConstraintsSaneV2, checkPackCountsV2, resolvePackConstraints, LEGACY_PACK_CONSTRAINTS, PACK_CONSTRAINT_TYPES_V2, DomainError,
  type SkillClassificationEntry, type SkillClassificationSet, type ReadinessRuleSet, type ReadinessRule, type PackConstraintSet, type PackConstraintV2, type PackCountsV2,
} from './index.js';

/* Junior Frontend v2 — the SME classification (decision pack §B) with provenance (D-4). */
const E = (skillId: string, cls: SkillClassificationEntry['cls'], source: SkillClassificationEntry['source'] = 'sme', sourceRef = 'decision pack §B'): SkillClassificationEntry => ({ skillId, cls, source, sourceRef });
const JFE: SkillClassificationEntry[] = [
  E('html', 'must'), E('css', 'must'), E('js', 'must'), E('debug', 'must'), E('read', 'must'), E('git', 'must'),
  E('ui', 'core'), E('api', 'core'), E('a11y', 'core'),
  E('forms', 'supporting', 'po_default', 'decision pack §B: SME silent; PO default'), E('explain', 'supporting', 'sme', 'SME-25'), E('reqs', 'supporting', 'po_default', 'decision pack §B: SME silent; PO default'),
];
const set = (o: Partial<SkillClassificationSet> = {}): SkillClassificationSet => ({ id: 's', key: 'jfe', version: 1, targetRoleId: 'role', taxonomy: 'must_core_supporting@1', reviewStatus: 'approved', activation: 'development_only',
  smeApprovedBy: 'Named SME', poApprovedBy: 'Product Owner', entries: JFE, ...o });

describe('P-3 classification — shape, provenance and approval', () => {
  test('the Junior Frontend v2 classification is sane: 6 Must, 3 Core, 3 Supporting, each with its source', () => {
    assert.doesNotThrow(() => assertClassificationSane(set()));
    assert.deepEqual(['must', 'core', 'supporting'].map((c) => JFE.filter((e) => e.cls === c).length), [6, 3, 3]);
  });
  test('unknown class, unknown source, a missing source reference, a skill twice, an unknown taxonomy or nothing at all is refused', () => {
    for (const bad of [[E('x', 'mandatory' as never)], [E('x', 'must', 'guess' as never)], [E('x', 'must', 'sme', ' ')], [E('x', 'must'), E('x', 'core')], []]) {
      assert.throws(() => assertClassificationSane({ taxonomy: 'must_core_supporting@1', entries: bad }), DomainError, JSON.stringify(bad));
    }
    assert.throws(() => assertClassificationSane({ taxonomy: 'tiers@1', entries: JFE }), /unknown taxonomy/);
  });
  test('D-4: a set with PO defaults needs the PO\'s named approval as well as the SME\'s; an SME-only set needs the SME', () => {
    assert.deepEqual(classificationApprovalProblems(set()), []);
    assert.match(classificationApprovalProblems(set({ poApprovedBy: null })).join(), /Product Owner defaults/);
    assert.deepEqual(classificationApprovalProblems(set({ poApprovedBy: null, entries: JFE.filter((e) => e.source === 'sme') })), []);
    assert.match(classificationApprovalProblems(set({ smeApprovedBy: null })).join(), /no named SME/);
    assert.match(classificationApprovalProblems(set({ reviewStatus: 'draft' })).join(), /not approved/);
  });
  test('in effect only when approved, development_only and outside production — never in production', () => {
    assert.equal(classificationInEffect([set()], 'role', { production: false })?.id, 's');
    assert.equal(classificationInEffect([set()], 'role', { production: true }), null);
    assert.equal(classificationInEffect([set({ activation: 'inactive' })], 'role', { production: false }), null);
    assert.equal(classificationInEffect([set({ reviewStatus: 'draft' })], 'role', { production: false }), null);
    assert.equal(classificationInEffect([set({ poApprovedBy: null })], 'role', { production: false }), null, 'PO defaults without PO approval never take effect');
    assert.equal(classificationInEffect([set()], 'other-role', { production: false }), null);
    assert.throws(() => classificationInEffect([set(), set({ id: 't' })], 'role', { production: false }), DomainError);
  });
  test('labels: a class with its source; a PO default is never presented as expert-approved; no classification ⇒ the legacy badge stays', () => {
    assert.deepEqual(professionalLabel(E('debug', 'must')), { badge: 'must', source: 'sme', expertApproved: true });
    assert.deepEqual(professionalLabel(JFE.find((e) => e.skillId === 'forms')!), { badge: 'supporting', source: 'po_default', expertApproved: false });
    assert.equal(professionalLabel(null), null);
  });
  test('version-aware "required for the role": the class when in effect (Must ∪ Core), else legacy is_core unchanged', () => {
    assert.equal(requiredForRole(E('debug', 'must'), false), true, 'Debugging is required although the legacy flag says supporting');
    assert.equal(requiredForRole(E('a11y', 'core'), false), true);
    assert.equal(requiredForRole(E('forms', 'supporting', 'po_default', 'x'), true), false);
    assert.equal(requiredForRole(null, true), true); assert.equal(requiredForRole(undefined, false), false);
  });
});

describe('P-3 readiness consistency (D-3) — categories from the classification, levels from the rule set', () => {
  const R = (id: string, type: ReadinessRule['type'], skillId: string | null, params: Record<string, unknown> = { min_level: 'demonstrated' }, enabled = true): ReadinessRule => ({ id, type, params, skillId, labelAr: id, labelEn: id, enabled, position: 0 });
  const full = (): ReadinessRule[] => [...JFE.filter((e) => e.cls === 'must').map((e) => R(`m-${e.skillId}`, 'non_compensable_skill', e.skillId)), ...JFE.filter((e) => e.cls === 'core').map((e) => R(`c-${e.skillId}`, 'required_skill_at_level', e.skillId))];
  const rs = (rules: ReadinessRule[]): ReadinessRuleSet => ({ id: 'rs', key: 'k', version: 1, reviewStatus: 'approved', activation: 'production_active', baselineOf: null, approvedBy: 'x', targetRoleId: 'role', labelAr: 'x', labelEn: 'x', rules } as ReadinessRuleSet);
  test('a rule set with a non-compensable rule per Must and a required rule per Core is consistent', () => {
    assert.deepEqual(classificationReadinessProblems(JFE, rs(full())), []);
  });
  test('a Must or Core skill without its rule, or with its rule disabled, is a problem (no silent bypass)', () => {
    assert.match(classificationReadinessProblems(JFE, rs(full().filter((r) => r.id !== 'm-git'))).join(), /Must skill git/);
    assert.match(classificationReadinessProblems(JFE, rs(full().map((r) => r.id === 'c-a11y' ? { ...r, enabled: false } : r))).join(), /Core skill a11y/);
    assert.match(classificationReadinessProblems(JFE, rs(full().map((r) => r.id === 'm-debug' ? { ...r, type: 'required_skill_at_level' as const } : r))).join(), /Must skill debug has no non_compensable/);
  });
  test('a Supporting skill can never become a blocker; is_core aggregates are refused in a classified role', () => {
    assert.match(classificationReadinessProblems(JFE, rs([...full(), R('x', 'required_skill_at_level', 'forms')])).join(), /Supporting skill forms a blocker/);
    assert.match(classificationReadinessProblems(JFE, rs([...full(), R('y', 'skill_evidence_path', 'explain', { min_distinct_tasks: 1 })])).join(), /Supporting skill explain/);
    assert.match(classificationReadinessProblems(JFE, rs([...full(), R('z', 'all_core_skills_at_level', null)])).join(), /legacy is_core/);
    assert.match(classificationReadinessProblems(JFE, rs([...full(), R('w', 'min_skills_at_level', null, { min_count: 3, min_level: 'demonstrated', scope: 'core' })])).join(), /legacy is_core/);
  });
  test('an inconsistent set never yields a verdict, even approved and production-active; a classification alone never grants readiness', () => {
    const facts = JFE.map((e) => ({ skillId: e.skillId, slug: e.skillId, labelAr: e.skillId, labelEn: e.skillId, verificationLevel: 'demonstrated' as const, progressState: null, standingEvidenceCount: 1, config: null }));
    const bad = evaluateReadiness({ ruleSet: rs(full().slice(1)), resolution: 'production_active', facts, classification: JFE });
    assert.equal(bad.status, 'pending_validation'); assert.equal(bad.overall, null); assert.ok(bad.classificationProblems!.length >= 1);
    const ok = evaluateReadiness({ ruleSet: rs(full()), resolution: 'production_active', facts, classification: JFE });
    assert.deepEqual(ok.classificationProblems, []); assert.equal(ok.status, 'evaluated', 'the rule set decides; the classification only checks consistency');
    const none = evaluateReadiness({ ruleSet: null, resolution: 'none', facts, classification: JFE });
    assert.equal(none.status, 'not_yet_configured', 'a classification without a rule set grants nothing');
    assert.equal(evaluateReadiness({ ruleSet: rs(full()), resolution: 'production_active', facts }).classificationProblems, undefined, 'no classification ⇒ unchanged report shape');
  });
});

describe('P-3 pack constraints schema 2 — Task B and backward compatibility', () => {
  const V2 = (o: Partial<Record<PackConstraintV2['type'], [number | null, number | null]>> = {}): PackConstraintV2[] => {
    const d: Record<PackConstraintV2['type'], [number | null, number | null]> = { must_skill_count: [6, 6], core_class_skill_count: [3, 3], supporting_skill_count: [3, 3], task_count: [10, 12],
      activity_count: [3, 3], activity_primary_skill_count: [2, 3], activity_required_primary_skill_count: [2, 3], rubric_min_criteria: [5, null], resources_per_skill_max: [null, 3], ...o };
    return PACK_CONSTRAINT_TYPES_V2.map((t) => ({ type: t, min: d[t][0], max: d[t][1] }));
  };
  const counts = (o: Partial<PackCountsV2> = {}): PackCountsV2 => ({ mustSkills: 6, coreClassSkills: 3, supportingSkills: 3, tasks: 12, activities: 3,
    activityPrimaries: [{ code: 'INT', primaries: 3, requiredPrimaries: 3 }, { code: 'A', primaries: 3, requiredPrimaries: 3 }, { code: 'B', primaries: 3, requiredPrimaries: 3 }],
    rubricCriteria: [{ code: 'INT', criteria: 12 }, { code: 'A', criteria: 7 }, { code: 'B', criteria: 8 }], resourcesPerSkill: [], ...o });
  test('schema 2 completeness: every v2 type exactly once; the legacy is_core types are not part of it', () => {
    assert.doesNotThrow(() => assertPackConstraintsSaneV2(V2()));
    assert.throws(() => assertPackConstraintsSaneV2(V2().filter((c) => c.type !== 'must_skill_count')), /missing/);
    assert.throws(() => assertPackConstraintsSaneV2([...V2(), { type: 'core_skill_count', min: 4, max: 5 } as never]), /unsupported pack constraint type 'core_skill_count'/);
    assert.throws(() => assertPackConstraintsSaneV2(V2({ must_skill_count: [0, 6] })), /≥ 1/);
  });
  test('Task B (primaries code reading, debugging, JS — all Must) is valid under schema 2: 3 required primaries', () => {
    assert.deepEqual(checkPackCountsV2(counts(), { ref: 'jfe_v2@1', constraintsV2: V2() }), []);
  });
  test('the Junior Frontend 6 / 3 / 3 distribution is a track-specific value: another distribution fails this set and passes another track\'s set', () => {
    const v = checkPackCountsV2(counts({ mustSkills: 5, supportingSkills: 4 }), { ref: 'jfe_v2@1', constraintsV2: V2() });
    assert.deepEqual(v.map((x) => x.subject + ':' + x.found).sort(), ['role:4', 'role:5']);
    assert.deepEqual(checkPackCountsV2(counts({ mustSkills: 5, supportingSkills: 4 }), { ref: 'data_bi_v2@1', constraintsV2: V2({ must_skill_count: [4, 8], supporting_skill_count: [0, 6] }) }), []);
  });
  test('an activity with fewer Must/Core primaries than the set requires is refused (activity design still checked)', () => {
    const v = checkPackCountsV2(counts({ activityPrimaries: [{ code: 'B', primaries: 3, requiredPrimaries: 1 }] }), { ref: 'jfe_v2@1', constraintsV2: V2() });
    assert.equal(v.length, 1); assert.match(v[0]!.message, /activity 'B'.*Must\/Core skills deeply, found 1/);
  });
  test('resolution is schema-aware: a development v2 track set never displaces the v1 baseline for v1 packs; a v2 pack never falls back to v1', () => {
    const legacy: PackConstraintSet = { id: 'l', key: 'legacy_pack_constraints', version: 1, reviewStatus: 'draft', activation: 'legacy_baseline', baselineOf: 'x', approvedBy: null, trackId: null, constraints: LEGACY_PACK_CONSTRAINTS };
    const v2: PackConstraintSet = { id: 'v', key: 'jfe_v2', version: 1, reviewStatus: 'draft', activation: 'development_only', baselineOf: null, approvedBy: null, trackId: 'trk_frontend_junior', constraints: [], schemaVersion: 2, constraintsV2: V2() };
    const r1 = resolvePackConstraints([legacy, v2], 'trk_frontend_junior', { production: false });
    assert.equal(r1.ref, 'legacy_pack_constraints@1'); assert.equal(r1.schemaVersion, undefined);
    const r2 = resolvePackConstraints([legacy, v2], 'trk_frontend_junior', { production: false }, 2);
    assert.equal(r2.ref, 'jfe_v2@1'); assert.equal(r2.schemaVersion, 2);
    assert.throws(() => resolvePackConstraints([legacy], 'trk_frontend_junior', { production: false }, 2), /no schema-2/);
    assert.throws(() => resolvePackConstraints([legacy, v2], 'trk_frontend_junior', { production: true }, 2), /no schema-2/, 'a development v2 set never resolves in production');
  });
});
