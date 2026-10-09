/**
 * Phase 5 — Readiness Engine + skill pages.
 *
 * Proves: with no rule set, readiness is `not_yet_configured` with the owner's
 * neutral headline and no percentage; a draft set activated for development
 * yields `pending_validation` (facts, no overall); only an approved,
 * production-active set yields `evaluated`; readiness never touches a claim;
 * recorded snapshots stay tied to the rule set version; the skill pages keep
 * the four dimensions apart and never show pending classification as a fact;
 * expert changes (mandatory skill, core, minimum count, expected level) are a
 * new rule set version, not code.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, expectRejected, asAuthenticatedUser, COMPONENT_BYTES, TEST_BYTES, type TestUser, filesFor } from './helpers';
import { cliCreateReadinessSet, cliActivate, cliApprove } from '../src/configuration/config-admin.service';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const SKILL = FIXTURE.skillUiTesting; const SECONDARY = 'a0000000-0000-4000-8000-000000000003';
async function bootstrapped(): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  return u;
}
async function demonstrated(user: TestUser) {
  const pid = (await http.post('/v1/projects').set(auth(user)).send({ title: 'x', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id as string;
  const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES); const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
  const sid = (await http.post(`/v1/projects/${pid}/submissions`).set(auth(user)).send({ skillIds: [SKILL], artifacts: COMPLETE_ARTIFACTS, files: filesFor([u1, u2]), aiDisclosure: { declaredUse: [] } }).expect(201)).body.data.id as string;
  await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201);
}
type Report = { status: string; headlineAr: string; ruleSet: { key: string; version: number; validated: boolean; resolution: string } | null; rules: { type: string; outcome: string; nonCompensable: boolean; skillIds: string[] }[]; summary: { satisfied: number; total: number; indeterminate: number }; overall: string | null; verificationEffect: string };
const readiness = async (u: TestUser): Promise<Report> => (await http.get('/v1/me/readiness').set(auth(u)).expect(200)).body.data.report;
const claimState = async (u: TestUser, skillId: string) => (await pool.query('select state from skill_claim where user_id = $1 and skill_id = $2', [u.id, skillId])).rows[0]?.state ?? 'gap';
const NEUTRAL = 'معيار الجاهزية لهذا المسار قيد الاعتماد';

describe('no rule set ⇒ an explicit state, never a guessed result', () => {
  test('not_yet_configured with the neutral headline; the skills page shows four separate dimensions and pending badges', async () => {
    const user = await bootstrapped();
    await demonstrated(user);
    const r = await readiness(user);
    assert.equal(r.status, 'not_yet_configured'); assert.equal(r.headlineAr, NEUTRAL); assert.equal(r.overall, null); assert.equal(r.ruleSet, null); assert.equal(r.verificationEffect, 'none');
    assert.ok(!JSON.stringify(r).includes('%'), 'no percentage anywhere');
    const page = (await http.get('/v1/me/track-skills').set(auth(user)).expect(200)).body.data;
    assert.equal(page.readiness.status, 'not_yet_configured');
    const ui = page.items.find((s: { skillId: string }) => s.skillId === SKILL);
    assert.equal(ui.verification.level, 'demonstrated'); assert.equal(ui.progress.state, 'evidence_recorded'); assert.equal(ui.evidence.standingEvaluatedCount, 1); assert.ok(ui.evidence.submittedMaterialCount >= 1);
    assert.equal(ui.readiness.badge, 'pending_expert_validation', 'is_core is never shown as core before approval');
    assert.equal(ui.readiness.configured, false); assert.equal(ui.readiness.readinessContribution, 'undecided'); assert.equal(ui.verificationEffectOfReadiness, 'none');
    const other = page.items.find((s: { skillId: string }) => s.skillId === SECONDARY);
    assert.equal(other.verification.level, 'gap'); assert.equal(other.verification.hasClaim, false);
    const detail = (await http.get(`/v1/me/track-skills/${SKILL}`).set(auth(user)).expect(200)).body.data;
    assert.equal(detail.readinessHeadlineAr, NEUTRAL); assert.ok(detail.materials.length >= 1 && detail.evaluatedEvidence.length === 1 && detail.decisions.length === 1 && detail.journeyEvents.length >= 2);
    await http.get('/v1/me/track-skills/00000000-0000-4000-8000-000000000000').set(auth(user)).expect(404);
  });
});

describe('rule values are configuration; types are code', () => {
  test('a draft set activated for development ⇒ pending_validation with facts and no overall; approval + production activation ⇒ evaluated; readiness never moves a claim', async () => {
    const user = await bootstrapped();
    await demonstrated(user);
    // "JavaScript = mandatory", "minimum N skills", "all core", "expected levels" — all rows, no code.
    const set = await cliCreateReadinessSet(pool, { key: 'e2e_track', targetRoleId: FIXTURE.roleId, labelAr: 'قواعد اختبار', labelEn: 'e2e rules', description: 'e2e', createdBy: 'e2e', rules: [
      { type: 'required_skill_at_level', params: { min_level: 'demonstrated' }, skillId: SKILL, labelAr: 'اختبار الواجهات إلزامية', labelEn: 'UI testing required' },
      { type: 'non_compensable_skill', params: { min_level: 'practiced' }, skillId: SECONDARY, labelAr: 'المهارة الثانية غير قابلة للتعويض', labelEn: 'secondary non-compensable' },
      { type: 'min_skills_at_level', params: { min_count: 1, min_level: 'demonstrated', scope: 'enabled' }, labelAr: 'مهارة واحدة مُثبتة على الأقل', labelEn: 'at least one demonstrated' },
      { type: 'all_core_skills_at_level', params: { min_level: 'demonstrated' }, labelAr: 'كل الأساسية مُثبتة', labelEn: 'all core demonstrated' },
    ] });
    await cliActivate(pool, { table: 'readiness_rule_set', id: set.id, activation: 'development_only', actor: 'e2e', reason: 'dev' });
    try {
      const r = await readiness(user);
      assert.equal(r.status, 'pending_validation'); assert.equal(r.headlineAr, NEUTRAL, 'a draft set still shows the neutral headline'); assert.equal(r.overall, null);
      assert.deepEqual(r.rules.map((x) => x.outcome), ['satisfied', 'not_satisfied', 'satisfied', 'indeterminate']);
      assert.equal(r.rules[1]!.nonCompensable, true); assert.equal(r.summary.indeterminate, 1, 'all-core cannot be judged while classification is pending');
      assert.equal(r.ruleSet?.validated, false); assert.equal(r.ruleSet?.resolution, 'development_only');
      assert.equal(await claimState(user, SKILL), 'demonstrated'); assert.equal(await claimState(user, SECONDARY), 'gap', 'readiness changed no claim');
      // The skill page names the rules that mention the skill, labelled draft.
      const detail = (await http.get(`/v1/me/track-skills/${SECONDARY}`).set(auth(user)).expect(200)).body.data;
      assert.equal(detail.ruleSetValidated, false);
      // Named by the non-compensable rule and by the all-core rule (whose indeterminate outcome lists the skills with pending classification).
      assert.ok(detail.skill.readiness.rulesNamingSkill.some((x: { nonCompensable: boolean; outcome: string }) => x.nonCompensable && x.outcome === 'not_satisfied'));
      assert.ok(detail.skill.readiness.rulesNamingSkill.some((x: { outcome: string }) => x.outcome === 'indeterminate'));
      // Snapshot tied to the rule set version.
      const rec = (await http.post('/v1/me/readiness/evaluations').set(auth(user)).expect(201)).body.data;
      assert.equal(rec.report.status, 'pending_validation');
      const hist = (await http.get('/v1/me/readiness/evaluations').set(auth(user)).expect(200)).body.data.items;
      assert.equal(hist[0].ruleSet.key, 'e2e_track'); assert.equal(hist[0].ruleSet.version, set.version); assert.equal(hist[0].resolution, 'development_only'); assert.ok(hist[0].trackConfigVersionId);
      // Approve + production-activate (production resolution requires both). Outside production the resolver still reports development_only first; prove the evaluated path at the DB level: the set now resolves as production_active even in dev.
      await cliActivate(pool, { table: 'readiness_rule_set', id: set.id, activation: 'inactive', actor: 'e2e', reason: 'promote' });
      await cliApprove(pool, { table: 'readiness_rule_set', id: set.id, approvedBy: 'sme-1', approvedByLabel: 'SME One', reason: 'reviewed with the panel' });
      await cliActivate(pool, { table: 'readiness_rule_set', id: set.id, activation: 'production_active', actor: 'po', reason: 'go live' });
      const r2 = await readiness(user);
      assert.equal(r2.status, 'evaluated'); assert.equal(r2.overall, 'does_not_meet_rule_set'); assert.notEqual(r2.headlineAr, NEUTRAL);
      assert.ok(!JSON.stringify(r2).includes('%'));
      // A new version with different values: only data changed. The old snapshot keeps v1.
      const v2 = await cliCreateReadinessSet(pool, { key: 'e2e_track', targetRoleId: FIXTURE.roleId, labelAr: 'v2', labelEn: 'v2', description: 'e2e v2', createdBy: 'e2e', rules: [
        { type: 'min_skills_at_level', params: { min_count: 1, min_level: 'demonstrated', scope: 'enabled' }, labelAr: 'واحدة', labelEn: 'one' } ] });
      assert.equal(v2.version, set.version + 1);
      await cliActivate(pool, { table: 'readiness_rule_set', id: set.id, activation: 'inactive', actor: 'e2e', reason: 'replace' });
      await cliActivate(pool, { table: 'readiness_rule_set', id: v2.id, activation: 'development_only', actor: 'e2e', reason: 'v2 dev' });
      const r3 = await readiness(user);
      assert.equal(r3.ruleSet?.version, v2.version); assert.equal(r3.status, 'pending_validation'); assert.equal(r3.rules.length, 1);
      const hist2 = (await http.get('/v1/me/readiness/evaluations').set(auth(user)).expect(200)).body.data.items;
      assert.equal(hist2[0].ruleSet.version, set.version, 'the recorded snapshot still names the version that produced it');
      await cliActivate(pool, { table: 'readiness_rule_set', id: v2.id, activation: 'inactive', actor: 'e2e', reason: 'cleanup' });
    } finally {
      await pool.query(`update readiness_rule_set set activation = 'inactive' where key = 'e2e_track' and activation <> 'inactive'`).catch(() => undefined);
    }
  });

  test('NEGATIVE: a readiness baseline is impossible; malformed values are refused; rules of an active set are frozen; an unknown type is refused', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await expectRejected(c, `insert into readiness_rule_set (key, version, label_ar, label_en, description_en, created_by, baseline_of) values ('x', 1, 'x', 'x', 'x', 'e2e', 'fake')`, [], /no_baseline|only be created by a migration|check constraint/);
      await expectRejected(c, `insert into readiness_rule (rule_set_id, rule_type, params, label_ar, label_en) values (gen_random_uuid(), 'percentage_of_skills', '{}', 'x', 'x')`, [], /check constraint|violates foreign key/);
      await c.query('rollback');
    } finally { c.release(); }
    await assert.rejects(cliCreateReadinessSet(pool, { key: 'e2e_bad', targetRoleId: null, labelAr: 'x', labelEn: 'x', description: 'x', createdBy: 'e2e', rules: [{ type: 'min_skills_at_level', params: { min_count: 0, min_level: 'demonstrated' }, labelAr: 'x', labelEn: 'x' }] }), /positive integer/);
    await assert.rejects(cliCreateReadinessSet(pool, { key: 'e2e_bad', targetRoleId: null, labelAr: 'x', labelEn: 'x', description: 'x', createdBy: 'e2e', rules: [{ type: 'required_skill_at_level', params: { min_level: 'demonstrated' }, labelAr: 'x', labelEn: 'x' }] }), /needs a skill_id/);
    const frozen = await cliCreateReadinessSet(pool, { key: 'e2e_frozen', targetRoleId: null, labelAr: 'x', labelEn: 'x', description: 'x', createdBy: 'e2e', rules: [{ type: 'min_skills_at_level', params: { min_count: 2, min_level: 'practiced' }, labelAr: 'x', labelEn: 'x' }] });
    await cliActivate(pool, { table: 'readiness_rule_set', id: frozen.id, activation: 'development_only', actor: 'e2e', reason: 'freeze' });
    try {
      const c2 = await pool.connect();
      try {
        await c2.query('begin');
        await expectRejected(c2, `update readiness_rule set params = '{"min_count": 5, "min_level": "practiced"}' where rule_set_id = $1`, [frozen.id], /immutable/);
        await expectRejected(c2, `insert into readiness_rule (rule_set_id, rule_type, params, label_ar, label_en) values ($1, 'min_evidence_per_skill', '{"min_count": 1}', 'x', 'x')`, [frozen.id], /immutable/);
        await c2.query('rollback');
      } finally { c2.release(); }
    } finally { await cliActivate(pool, { table: 'readiness_rule_set', id: frozen.id, activation: 'inactive', actor: 'e2e', reason: 'cleanup' }); }
  });

  test('RLS: recorded evaluations are private and append-only; rule sets are readable', async () => {
    const user = await bootstrapped();
    await http.post('/v1/me/readiness/evaluations').set(auth(user)).expect(201);
    const other = await bootstrapped();
    assert.equal((await http.get('/v1/me/readiness/evaluations').set(auth(other)).expect(200)).body.data.items.length, 0);
    await asAuthenticatedUser(pool, other.id, async (c) => {
      assert.equal((await c.query('select count(*)::int as n from readiness_evaluation where user_id = $1', [user.id])).rows[0].n, 0);
      await expectRejected(c, `insert into readiness_evaluation (user_id, target_role_id, rule_set_resolution, status, result, domain_ruleset_version) values ($1, $2, 'not_yet_configured', 'evaluated', '{}', 'x')`, [other.id, FIXTURE.roleId], /row-level security|status_shape|check constraint/);
    });
    const c = await pool.connect();
    try { await c.query('begin'); await expectRejected(c, `delete from readiness_evaluation where user_id = $1`, [user.id], /append-only/); await c.query('rollback'); } finally { c.release(); }
  });
});
