/**
 * Career Data Foundation — pipeline, review workflow, RLS, production guard and
 * agent integration, against a real database with the Frontend pack imported.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { join } from 'node:path';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, INCOMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, asAuthenticatedUser, expectRejected, type TestUser } from './helpers';
import { loadPack } from '../src/career-data/pack-loader';
import { importPack } from '../src/career-data/pipeline';
import { runQualityChecks, coreSkillEvidencePaths } from '../src/career-data/quality-rules';
import { reviewTransition } from '../src/career-data/review';
import { CareerDataService } from '../src/career-data/career-data.service';
import { validatePack, PackValidationError } from '../src/career-data/pack-schema';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const ROOT = join(__dirname, '..', '..', '..', '..');
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const counts = async () => (await pool.query(`select (select count(*) from skill) s, (select count(*) from task) t, (select count(*) from activity_spec) a, (select count(*) from rubric_criterion) c, (select count(*) from source_ref) r, (select count(*) from raw_snapshot) raw`)).rows[0];

describe('import pipeline — Source → Raw → Normalize → Deduplicate → Map → draft', () => {
  test('the Frontend pack validates, imports as DRAFT/DEMO, and a second import changes nothing', async () => {
    const { pack, files } = loadPack(join(ROOT, 'data', 'career'), 'trk_frontend_junior');
    assert.doesNotThrow(() => validatePack(pack));
    const r1 = await importPack(pool, pack, files); const c1 = await counts();
    const r2 = await importPack(pool, pack, files); const c2 = await counts();
    assert.deepEqual(c1, c2, 'idempotent');
    assert.equal(r2.snapshots.every((s) => s.stored === 'existing'), true, 'L0 snapshots are content-addressed and immutable');
    assert.equal(r1.isDemoFixture, true);
    const st = await pool.query(`select review_status, count(*)::int n from skill where is_demo_fixture and slug like 'skl_%' group by review_status`);
    assert.deepEqual(st.rows, [{ review_status: 'draft', n: 12 }], 'every imported skill is draft');
    const role = await pool.query(`select review_status, level, family from target_role where slug = 'frontend-developer-junior'`);
    assert.equal(role.rows[0].review_status, 'draft'); assert.equal(role.rows[0].level, 'junior');
    const core = await pool.query(`select count(*)::int n from role_requirement rr join target_role tr on tr.id = rr.target_role_id where tr.slug = 'frontend-developer-junior' and rr.is_core`);
    assert.equal(core.rows[0].n, 5, 'core skills are 4–5');
    assert.equal((await pool.query(`select count(*)::int n from task where target_role_id = (select id from target_role where slug = 'frontend-developer-junior')`)).rows[0].n, 11);
    assert.equal((await pool.query(`select count(*)::int n from activity_spec where target_role_id = (select id from target_role where slug = 'frontend-developer-junior')`)).rows[0].n, 3);
    assert.equal((await pool.query(`select count(*)::int n from activity_spec where can_yield_verified`)).rows[0].n, 0, 'nothing can yield Verified');
    assert.equal((await pool.query(`select count(*)::int n from learning_resource where url is not null`)).rows[0].n, 0, 'no invented URLs');
    assert.equal((await pool.query(`select count(*)::int n from learning_resource where quality_status <> 'unverified'`)).rows[0].n, 0);
    assert.ok(r1.nearDuplicates.some((d) => [d.aCode, d.bCode].includes('ui-state-management') && [d.aCode, d.bCode].includes('skl_ui_state_interaction')), 'the near-duplicate report proposes the overlap; nothing merged');
    assert.equal((await pool.query(`select count(*)::int n from skill where status <> 'active'`)).rows[0].n, 0, 'no automatic merge happened');
  });
  test('NEGATIVE: a pack that names a framework as a role skill, or invents a URL, is refused before anything is written', async () => {
    const { pack } = loadPack(join(ROOT, 'data', 'career'), 'trk_frontend_junior');
    const bad = JSON.parse(JSON.stringify(pack)) as typeof pack;
    (bad.track.role as { common_tools: { name: string; criticality: string }[] }).common_tools.push({ name: 'React', criticality: 'essential' });
    bad.global.resources[0]!.url = 'https://example.invalid/made-up'; bad.global.resources[0]!.quality_status = 'approved';
    (bad.track.activities[0] as { can_yield_verified: boolean }).can_yield_verified = true;
    assert.throws(() => validatePack(bad), (e: unknown) => e instanceof PackValidationError && e.problems.some((p) => /framework/.test(p)) && e.problems.some((p) => /can_yield_verified/.test(p)));
  });
  test('quality rules pass (fail rules), and every core skill has two evidence paths', async () => {
    const q = await runQualityChecks(pool);
    const failures = q.results.filter((r) => r.severity === 'fail' && !r.passed);
    assert.deepEqual(failures.map((f) => `${f.id}: ${f.offenders.join('; ')}`), []);
    const paths = await coreSkillEvidencePaths(pool, 'frontend-developer-junior');
    assert.equal(paths.length, 5);
    for (const p of paths) { assert.equal(p.status, 'verified_possible', p.skill); assert.equal(p.canYieldVerified, false); assert.equal(p.activities.length, 2); }
  });
});

describe('review workflow — nothing is SME-approved automatically', () => {
  test('a DEMO fixture: draft → curated works; sme_reviewed/approved are refused with or without a reviewer', async () => {
    const id = (await pool.query(`select id from skill where slug = 'skl_css_responsive'`)).rows[0].id;
    await reviewTransition(pool, { entityKind: 'skill', entityId: id, to: 'curated', decidedBy: null, decidedByLabel: 'author', rolePerformed: 'content_author', reason: 'fields complete', production: false });
    await assert.rejects(() => reviewTransition(pool, { entityKind: 'skill', entityId: id, to: 'sme_reviewed', decidedBy: '22222222-2222-4222-8222-222222222222', decidedByLabel: 'sme', rolePerformed: 'sme', reason: 'ok', production: false }), /DEMO/);
    const c = await pool.connect();
    try { await c.query('begin'); await expectRejected(c, `update skill set review_status = 'approved', reviewed_by = gen_random_uuid(), reviewed_at = now() where id = $1`, [id], /DEMO|not a permitted/); await c.query('rollback'); } finally { c.release(); }
    const log = await pool.query(`select to_status, role_performed from review_log where entity_id = $1 order by decided_at`, [id]);
    assert.deepEqual(log.rows, [{ to_status: 'curated', role_performed: 'content_author' }]);
  });
  test('real content: full path with named SME and product owner; every shortcut is refused; nothing is deleted', async () => {
    const fam = (await pool.query(`select id from skill_family where code = 'web_foundations'`)).rows[0].id;
    const rp = (await pool.query(`select id from recency_policy where code = 'rp_practice'`)).rows[0].id;
    const sc = (await pool.query(`select id from proficiency_scale where code = 'scale_default'`)).rows[0].id;
    const ins = await pool.query(`insert into skill (slug, label_ar, label_en, provenance_class, provenance_source, skill_family_id, skill_type, ai_substitutability, recency_policy_id, proficiency_scale_id, drafting_aid, is_demo_fixture)
      values ('e2e-real-skill-' || substr(gen_random_uuid()::text, 1, 8), 'مهارة اختبار', 'E2E real skill', 'curated', 'e2e', $1, 'supporting', 'low', $2, $3, 'ai_assisted', false) returning id`, [fam, rp, sc]);
    const id = ins.rows[0].id; const sme = '22222222-2222-4222-8222-222222222222';
    const go = (to: string, role: string, by: string | null, prod = false) => reviewTransition(pool, { entityKind: 'skill', entityId: id, to: to as never, decidedBy: by, decidedByLabel: by ?? 'author', rolePerformed: role as never, reason: `to ${to}`, production: prod });
    await assert.rejects(() => go('approved', 'sme', sme), /not permitted/);
    await go('curated', 'content_author', null);
    await assert.rejects(() => go('published', 'product_owner', null), /not permitted/);
    await assert.rejects(() => go('sme_reviewed', 'sme', null), /named SME/);
    await assert.rejects(() => go('sme_reviewed', 'content_author', sme), /only be granted by sme/);
    await go('sme_reviewed', 'sme', sme);
    await go('approved', 'sme', sme);
    await assert.rejects(() => go('published', 'sme', sme), /product_owner/);
    await go('published', 'product_owner', null);
    const row = await pool.query('select review_status, reviewed_by from skill where id = $1', [id]);
    assert.equal(row.rows[0].review_status, 'published'); assert.equal(row.rows[0].reviewed_by, sme);
    const log = await pool.query('select to_status, role_performed, decided_by from review_log where entity_id = $1 order by decided_at', [id]);
    assert.deepEqual(log.rows.map((r) => `${r.to_status}:${r.role_performed}`), ['curated:content_author', 'sme_reviewed:sme', 'approved:sme', 'published:product_owner']);
    await assert.rejects(() => pool.query('delete from skill where id = $1', [id]), /never deleted/);
    // The database refuses the same shortcuts without the service in front of it.
    const c = await pool.connect();
    try {
      await c.query('begin');
      await expectRejected(c, `update skill set review_status = 'draft' where id = $1`, [id], /not a permitted/);
      await c.query('rollback');
    } finally { c.release(); }
  });
  test('a rubric published through review freezes its criteria', async () => {
    const rv = (await pool.query(`select rv.id from rubric_version rv join activity_spec a on a.id = rv.activity_spec_id where a.slug = 'act_fe_build_interface'`)).rows[0].id;
    const c = await pool.connect();
    try {
      await c.query('begin');
      // DEMO shortcut (non-production): curated → published without approval, then the criteria are frozen.
      await c.query(`update rubric_version set status = 'curated' where id = $1`, [rv]);
      await c.query(`update rubric_version set status = 'published' where id = $1`, [rv]);
      await expectRejected(c, `delete from rubric_criterion where rubric_version_id = $1`, [rv], /frozen/);
      await c.query('rollback');
    } finally { c.release(); }
  });
});

describe('access model — drafts are invisible to users; assessment material is never readable', () => {
  test('authenticated: published reference data readable, draft tasks/activities hidden, rubric criteria hidden, no writes', async () => {
    const u = await newUser();
    await asAuthenticatedUser(pool, u.id, async (c) => {
      assert.ok((await c.query('select 1 from skill_family')).rowCount! > 0, 'families are readable reference data');
      assert.equal((await c.query('select 1 from task')).rowCount, 0, 'draft tasks are not content a user sees');
      assert.equal((await c.query(`select 1 from activity_deliverable ad join activity_spec a on a.id = ad.activity_spec_id where a.slug = 'act_fe_build_interface'`)).rowCount, 0, 'draft activity structure hidden');
      assert.ok((await c.query(`select 1 from activity_deliverable ad join activity_spec a on a.id = ad.activity_spec_id where a.id = $1`, [FIXTURE.activitySpecId])).rowCount! > 0, 'published activity structure readable');
      await expectRejected(c, 'select 1 from rubric_criterion', [], /permission denied/); // assessment material: not even a grant
      assert.equal((await c.query('select 1 from career_presentation_rule')).rowCount, 0, 'draft rules hidden');
      await expectRejected(c, `insert into task (code, target_role_id, title_ar, title_en, description_ar, description_en, frequency, complexity, expected_output_ar, expected_output_en, expected_output_kind)
        values ('tsk_hack', $1, 'x', 'x', 'x', 'x', 'daily', 'low', 'x', 'x', 'x')`, [FIXTURE.roleId], /permission denied|row-level security/);
      await expectRejected(c, `select 1 from review_log`, [], /permission denied/);
      await expectRejected(c, `select 1 from raw_snapshot`, [], /permission denied/);
    });
  });
});

describe('production guard — DEMO content never serves production', () => {
  test('with a published demo fixture in the database, the API refuses to start under NODE_ENV=production', async () => {
    const svc = app.get(CareerDataService, { strict: false });
    const prev = process.env['NODE_ENV']; process.env['NODE_ENV'] = 'production';
    try { await assert.rejects(() => svc.onModuleInit(), /DEMO career data is published in a production database/); }
    finally { process.env['NODE_ENV'] = prev; }
  });
});

describe('agent integration — agents read structured career data or state a limitation', () => {
  async function evaluated(user: TestUser, roleId: string, artifacts = COMPLETE_ARTIFACTS) {
    await http.post('/v1/me/bootstrap').set(auth(user)).send({}).expect(201);
    await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: roleId, confirmed: true }).expect(200);
    const project = await http.post('/v1/projects').set(auth(user)).send({ title: 'p', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
    const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES); const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
    const sub = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts, uploadIds: [u1, u2], aiDisclosure: { declaredUse: [] } }).expect(201);
    await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(user)).expect(201);
    return (await http.get('/v1/me/proposals').set(auth(user)).expect(200)).body.data.items as Array<Record<string, unknown> & { structuredPayload: Record<string, unknown>; warnings: string[] }>;
  }
  test('unpublished role → Recruitment Agent states the limitation and proposes no role gap', async () => {
    const user = await newUser();
    const ps = await evaluated(user, FIXTURE.roleId);
    const inv = await pool.query(`select allowed_context from agent_invocation where user_id = $1 and agent_type = 'recruitment'`, [user.id]);
    assert.ok(inv.rows[0].allowed_context.includes('roleRequirements'), 'role requirements were passed as structured context');
    const next = ps.find((p) => p.proposalType === 'recruiter_next_action')!;
    assert.ok(next.warnings.some((w) => /role requirements unpublished/.test(w)), 'limitation stated, not invented');
    assert.equal(ps.filter((p) => p.proposalType === 'profile_gap').length, 0);
  });
  test('published role requirements → a profile_gap for each core skill without qualifying evidence; nothing copied into evidence', async () => {
    // A DEMO role published in a non-production database, with two core requirements.
    const role = await pool.query(`insert into target_role (slug, label_ar, label_en, track_id, review_status, source_label, provenance_class, provenance_source, is_demo_fixture)
      values ('e2e-demo-role-' || substr(gen_random_uuid()::text,1,8), 'دور تجريبي', 'E2E demo role', 'e2e', 'curated', 'DEMO', 'curated', 'e2e', true) returning id`);
    const roleId = role.rows[0].id;
    await pool.query(`update target_role set review_status = 'published' where id = $1`, [roleId]);
    for (const skill of [FIXTURE.skillUiTesting, 'a0000000-0000-4000-8000-000000000001']) {
      const rr = await pool.query(`insert into role_requirement (target_role_id, skill_id, is_core, importance, target_proficiency, why_required_ar, why_required_en, review_status, is_demo_fixture) values ($1,$2,true,'high','working','سبب','reason','curated',true) returning id`, [roleId, skill]);
      await pool.query(`update role_requirement set review_status = 'published' where id = $1`, [rr.rows[0].id]);
    }
    const user = await newUser();
    const ps = await evaluated(user, roleId);
    const gaps = ps.filter((p) => p.proposalType === 'profile_gap');
    assert.equal(gaps.length, 1, 'one core skill (UI state management) has no qualifying evidence; UI testing was just demonstrated');
    assert.equal(gaps[0]!.structuredPayload['skillId'], 'a0000000-0000-4000-8000-000000000001');
    assert.equal(gaps[0]!.structuredPayload['currentState'], 'gap');
    assert.equal((await pool.query('select count(*)::int n from evidence where user_id = $1', [user.id])).rows[0].n, 1, 'role requirements created no evidence');
    assert.equal((await pool.query(`select count(*)::int n from skill_claim where user_id = $1 and skill_id = 'a0000000-0000-4000-8000-000000000001'`, [user.id])).rows[0].n, 0, 'no claim was written for the required skill');
    assert.ok(ps.find((p) => p.proposalType === 'recruiter_next_action')!.warnings.length === 0);
  });
  test('Technical Agent reads the structured activity: missing_evidence names the activity and its mandatory deliverables', async () => {
    const user = await newUser();
    const ps = await evaluated(user, FIXTURE.roleId, INCOMPLETE_ARTIFACTS);
    const inv = await pool.query(`select allowed_context from agent_invocation where user_id = $1 and agent_type = 'technical'`, [user.id]);
    assert.ok(inv.rows[0].allowed_context.includes('activityContext'));
    const me = ps.find((p) => p.proposalType === 'missing_evidence')!;
    assert.match(String(me.structuredPayload['howToProvide']), /act_fe_003/); assert.match(String(me.structuredPayload['howToProvide']), /file\.component/);
    const ex = ps.find((p) => p.proposalType === 'rubric_explanation')!;
    const crit = ex.structuredPayload['criteria'] as { criterion: string; linkedSkillId?: string }[];
    assert.ok(crit.every((c) => c.linkedSkillId === FIXTURE.skillUiTesting), 'each explained criterion carries the skill it is linked to');
    assert.equal(ex.warnings.length, 0);
  });
});
