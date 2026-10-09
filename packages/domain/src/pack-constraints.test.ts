/**
 * Phase 9 (H5) — configurable pack constraints.
 * The equivalence proof: with the legacy baseline values, the configured checker
 * returns exactly the verdicts of the pre-Phase-9 hard-coded checks, on an
 * exhaustive grid of the boundary region plus 20 000 seeded random packs.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PACK_CONSTRAINT_TYPES, LEGACY_PACK_CONSTRAINTS, checkPackCounts, legacyPackCountViolations, assertPackConstraintsSane, resolvePackConstraints,
  UnsupportedRuleType, PackConstraintsUnavailable, DomainError, type PackCounts, type PackConstraintSet, type PackConstraint,
} from './index.js';

const LEGACY = { ref: 'legacy_pack_constraints@1', constraints: LEGACY_PACK_CONSTRAINTS };
const key = (v: { type: string; subject: string }) => `${v.type}|${v.subject}`;
const same = (counts: PackCounts) => {
  const now = checkPackCounts(counts, LEGACY).map(key).sort();
  const before = legacyPackCountViolations(counts).map(key).sort();
  assert.deepEqual(now, before, JSON.stringify(counts));
};
const counts = (o: Partial<PackCounts> = {}): PackCounts => ({
  coreSkills: 5, tasks: 11, activities: 3,
  activityPrimaries: [{ code: 'a1', primaries: 3, corePrimaries: 2 }, { code: 'a2', primaries: 2, corePrimaries: 2 }, { code: 'a3', primaries: 3, corePrimaries: 3 }],
  rubricCriteria: [{ code: 'r1', criteria: 7 }, { code: 'r2', criteria: 5 }], resourcesPerSkill: [{ skill: 's1', resources: 3 }, { skill: 's2', resources: 1 }], ...o,
});

describe('equivalence with the pre-Phase-9 validator (legacy baseline)', () => {
  test('the baseline holds exactly the numbers the old code hard-coded', () => {
    assert.deepEqual(LEGACY_PACK_CONSTRAINTS.map((c) => [c.type, c.min, c.max]), [
      ['core_skill_count', 4, 5], ['task_count', 10, 12], ['activity_count', 3, 3], ['activity_primary_skill_count', 2, 3],
      ['activity_core_primary_skill_count', 2, 3], ['rubric_min_criteria', 5, null], ['resources_per_skill_max', null, 3]]);
    assert.doesNotThrow(() => assertPackConstraintsSane(LEGACY_PACK_CONSTRAINTS));
  });
  test('exhaustive boundary grid: every scalar count 0..15, every per-activity pair 0..6, every rubric 0..9, every resource count 0..7', () => {
    for (let n = 0; n <= 15; n++) { same(counts({ coreSkills: n })); same(counts({ tasks: n })); same(counts({ activities: n })); }
    for (let p = 0; p <= 6; p++) for (let cp = 0; cp <= p; cp++) same(counts({ activityPrimaries: [{ code: 'x', primaries: p, corePrimaries: cp }] }));
    for (let r = 0; r <= 9; r++) same(counts({ rubricCriteria: [{ code: 'x', criteria: r }] }));
    for (let r = 0; r <= 7; r++) same(counts({ resourcesPerSkill: [{ skill: 'x', resources: r }] }));
    same(counts()); assert.equal(checkPackCounts(counts(), LEGACY).length, 0, 'the shipped shape passes');
  });
  test('20 000 seeded random packs: identical verdicts', () => {
    let seed = 0x9e3779b9;
    const rnd = (n: number) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return Math.abs(seed) % n; };
    for (let i = 0; i < 20_000; i++) {
      const acts = rnd(6);
      same({
        coreSkills: rnd(9), tasks: rnd(16), activities: acts,
        activityPrimaries: Array.from({ length: acts }, (_, k) => { const p = rnd(6); return { code: `a${k}`, primaries: p, corePrimaries: rnd(p + 1) }; }),
        rubricCriteria: Array.from({ length: rnd(5) }, (_, k) => ({ code: `r${k}`, criteria: rnd(10) })),
        resourcesPerSkill: Array.from({ length: rnd(6) }, (_, k) => ({ skill: `s${k}`, resources: 1 + rnd(6) })),
      });
    }
  });
  test('messages keep the old wording where tests and operators rely on it, and name the set', () => {
    const v = checkPackCounts(counts({ activities: 2, coreSkills: 3, activityPrimaries: [{ code: 'a1', primaries: 2, corePrimaries: 1 }] }), LEGACY).map((x) => x.message);
    assert.ok(v.some((m) => /activities: exactly 3 expected, found 2/.test(m)));
    assert.ok(v.some((m) => /role: core skills must be 4–5, found 3/.test(m)));
    assert.ok(v.some((m) => /2–3 CORE skills deeply, found 1/.test(m)));
    assert.ok(v.every((m) => m.endsWith('[legacy_pack_constraints@1]')));
  });
});

describe('expert values are actionable through configuration', () => {
  test('a different profession\'s numbers change the verdict without code', () => {
    const other = { ref: 'design_track@1', constraints: LEGACY_PACK_CONSTRAINTS.map((c): PackConstraint => c.type === 'activity_count' ? { ...c, min: 4, max: 6 } : c.type === 'core_skill_count' ? { ...c, min: 6, max: 8 } : c) };
    const p = counts({ activities: 5, coreSkills: 7 });
    assert.ok(checkPackCounts(p, LEGACY).length > 0);
    assert.equal(checkPackCounts(p, other).length, 0);
  });
});

describe('invariants stay in code: shape, floors, completeness, closed vocabulary', () => {
  const withC = (t: string, min: number | null, max: number | null) => LEGACY_PACK_CONSTRAINTS.map((c) => (c.type === t ? { type: t, min, max } : c));
  test('an unknown kind of rule is refused, never interpreted — it needs an explicit extension', () => {
    assert.throws(() => assertPackConstraintsSane([...LEGACY_PACK_CONSTRAINTS, { type: 'portfolio_must_be_public', min: 1, max: null }]),
      (e: unknown) => e instanceof UnsupportedRuleType && /EXPERT-RULE-EXTENSION-REGISTER/.test((e as Error).message));
  });
  test('missing, duplicated, misshaped, below-floor or inverted constraints are refused', () => {
    assert.throws(() => assertPackConstraintsSane(LEGACY_PACK_CONSTRAINTS.filter((c) => c.type !== 'task_count')), /task_count: missing/);
    assert.throws(() => assertPackConstraintsSane([...LEGACY_PACK_CONSTRAINTS, LEGACY_PACK_CONSTRAINTS[0]!]), /stated twice/);
    assert.throws(() => assertPackConstraintsSane(withC('activity_count', 0, 3)), /structural floor/);
    assert.throws(() => assertPackConstraintsSane(withC('task_count', 12, 10)), /above maximum/);
    assert.throws(() => assertPackConstraintsSane(withC('rubric_min_criteria', 5, 9)), /minimum only/);
    assert.throws(() => assertPackConstraintsSane(withC('resources_per_skill_max', 1, 3)), /maximum only/);
    assert.throws(() => assertPackConstraintsSane(withC('core_skill_count', 4, null)), /both a minimum and a maximum/);
    assert.throws(() => assertPackConstraintsSane(withC('core_skill_count', 4.5, 5)), /integer/);
    assert.equal(PACK_CONSTRAINT_TYPES.length, 7);
  });
});

describe('resolution: track-specific over global; production never uses an unvalidated row; missing and conflicting fail explicitly', () => {
  const set = (o: Partial<PackConstraintSet>): PackConstraintSet => ({ id: o.key ?? 'x', key: 'x', version: 1, reviewStatus: 'draft', activation: 'inactive', baselineOf: null, approvedBy: null, trackId: null, constraints: LEGACY_PACK_CONSTRAINTS, ...o });
  const baseline = set({ id: 'b', key: 'legacy_pack_constraints', activation: 'legacy_baseline', baselineOf: 'pre-Phase 9' });
  test('the baseline is used everywhere when nothing else is in effect — production included', () => {
    for (const production of [false, true]) {
      const r = resolvePackConstraints([baseline], 'trk_x', { production });
      assert.deepEqual([r.ref, r.scope, r.resolution], ['legacy_pack_constraints@1', 'global', 'legacy_baseline']);
    }
  });
  test('an unvalidated draft is never used in production; a development-only one is used only outside production', () => {
    const dev = set({ id: 'd', key: 'trk_x_draft', trackId: 'trk_x', activation: 'development_only' });
    assert.equal(resolvePackConstraints([baseline, dev], 'trk_x', { production: false }).ref, 'trk_x_draft@1');
    assert.equal(resolvePackConstraints([baseline, dev], 'trk_x', { production: true }).ref, 'legacy_pack_constraints@1');
    assert.equal(resolvePackConstraints([baseline, set({ id: 'i', key: 'idle', trackId: 'trk_x' })], 'trk_x', { production: false }).ref, 'legacy_pack_constraints@1', 'an inactive draft is never used');
  });
  test('a validated, production-active track set wins for its track only', () => {
    const prod = set({ id: 'p', key: 'trk_x_v2', trackId: 'trk_x', activation: 'production_active', reviewStatus: 'approved', approvedBy: 'sme-1' });
    assert.equal(resolvePackConstraints([baseline, prod], 'trk_x', { production: true }).ref, 'trk_x_v2@1');
    assert.equal(resolvePackConstraints([baseline, prod], 'trk_y', { production: true }).ref, 'legacy_pack_constraints@1');
  });
  test('nothing in effect ⇒ explicit failure; two in effect at one level ⇒ explicit conflict; a broken set in effect ⇒ refused', () => {
    assert.throws(() => resolvePackConstraints([], 'trk_x', { production: true }), (e: unknown) => e instanceof PackConstraintsUnavailable && /no pack constraint set is in effect/.test((e as Error).message));
    const a = set({ id: 'a', key: 'one', trackId: 'trk_x', activation: 'development_only' }); const b = set({ id: 'bb', key: 'two', trackId: 'trk_x', activation: 'development_only' });
    assert.throws(() => resolvePackConstraints([baseline, a, b], 'trk_x', { production: false }), (e: unknown) => e instanceof PackConstraintsUnavailable && /conflicting/.test((e as Error).message));
    const broken = set({ id: 'k', key: 'broken', trackId: 'trk_x', activation: 'development_only', constraints: LEGACY_PACK_CONSTRAINTS.slice(1) });
    assert.throws(() => resolvePackConstraints([baseline, broken], 'trk_x', { production: false }), DomainError);
  });
});
