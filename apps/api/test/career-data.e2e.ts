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
import { validatePack as validatePackWith, PackValidationError, type Pack } from '../src/career-data/pack-schema';
import { resolvePackConstraintsFor } from '../src/career-data/pack-constraints';
import type { ResolvedPackConstraints } from '@naqla/domain';

let C: ResolvedPackConstraints;
let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const ROOT = join(__dirname, '..', '..', '..', '..');
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); C = await resolvePackConstraintsFor(pool, 'trk_frontend_junior'); });
after(async () => { await pool?.end(); await app?.close(); });
// Phase 9: the validator takes the constraint set resolved from governed configuration (here: the legacy baseline).
const validatePack = (p: Pack) => validatePackWith(p, C);
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
    // OPEN-039 (D-097): the owner resolved the pair as `equivalent`; the pipeline applies it non-destructively.
    assert.ok(!r1.nearDuplicates.some((d) => [d.aCode, d.bCode].includes('ui-state-management')), '2 — the resolved pair is no longer an unresolved near-duplicate');
    assert.deepEqual(r1.resolutions.map((x) => [x.alias, x.canonical]), [['ui-state-management', 'skl_ui_state_interaction']]);
    assert.equal(r2.resolutions[0]!.applied, false, 'idempotent: a later import finds the resolution already applied and changes nothing');
    assert.equal((await pool.query(`select count(*)::int n from skill where status <> 'active'`)).rows[0].n, 1, 'exactly the alias is merged; nothing else changed status');
  });
  test('OPEN-039 — 1: the alias keeps its id; the canonical skill is one; mappings and provenance updated; nothing deleted', async () => {
    const alias = await pool.query(`select id, slug, status, merged_into_id, review_status, label_ar from skill where slug = 'ui-state-management'`);
    const canon = await pool.query(`select id from skill where slug = 'skl_ui_state_interaction' and is_demo_fixture`);
    assert.equal(alias.rowCount, 1, 'the alias row still exists'); assert.equal(alias.rows[0].id, 'a0000000-0000-4000-8000-000000000001', 'under its original id');
    assert.equal(alias.rows[0].status, 'merged_into'); assert.equal(alias.rows[0].merged_into_id, canon.rows[0].id); assert.equal(alias.rows[0].review_status, 'superseded');
    assert.equal(alias.rows[0].label_ar, 'إدارة حالة الواجهة', 'never renamed');
    assert.equal((await pool.query(`select canonical_skill_id($1) = $2 as ok`, [alias.rows[0].id, canon.rows[0].id])).rows[0].ok, true, 'lookups resolve alias → canonical');
    const syn = await pool.query(`select surface_form, language from skill_synonym where skill_id = $1 and relation = 'equivalent' and surface_form in ('إدارة حالة الواجهة', 'UI state management') order by language`, [canon.rows[0].id]);
    assert.equal(syn.rowCount, 2, 'the alias names live on as equivalent surface forms of the canonical skill');
    const rr = await pool.query(`select s.slug from role_requirement rr join skill s on s.id = rr.skill_id join target_role tr on tr.id = rr.target_role_id where tr.slug = 'frontend-developer' order by s.slug`);
    assert.deepEqual(rr.rows.map((r) => r.slug), ['component-building', 'skl_ui_state_interaction', 'ui-testing'], 'the Slice-1 role requirement was repointed to the canonical skill');
    const dedup = await pool.query(`select decision, decided_by, decision_reason from dedup_candidate where a_code = 'ui-state-management' and b_code = 'skl_ui_state_interaction'`);
    assert.equal(dedup.rows[0].decision, 'merge'); assert.match(dedup.rows[0].decision_reason, /D-097/);
    const log = await pool.query(`select role_performed, to_status, reason from review_log where entity_kind = 'skill' and entity_id = $1`, [alias.rows[0].id]);
    assert.equal(log.rowCount, 1); assert.equal(log.rows[0].role_performed, 'product_owner'); assert.equal(log.rows[0].to_status, 'superseded');
    const { renderNearDuplicateReport } = await import('../src/career-data/pipeline');
    const md = renderNearDuplicateReport([], 'trk_frontend_junior', '0.2.0', (await pool.query('select a_code, b_code, decision, decision_reason from dedup_candidate')).rows);
    assert.match(md, /## Resolved/); assert.match(md, /ui-state-management.*skl_ui_state_interaction.*merge/);
    assert.ok(!/\| proposed \|/.test(md), 'no unresolved candidate remains in the report');
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
    // OPEN-039: the second core requirement names the CANONICAL skill (the Slice-1 alias is merged into it).
    const canonicalUiState = (await pool.query(`select id from skill where slug = 'skl_ui_state_interaction' and is_demo_fixture`)).rows[0].id;
    for (const skill of [FIXTURE.skillUiTesting, canonicalUiState]) {
      const rr = await pool.query(`insert into role_requirement (target_role_id, skill_id, is_core, importance, target_proficiency, why_required_ar, why_required_en, review_status, is_demo_fixture) values ($1,$2,true,'high','working','سبب','reason','curated',true) returning id`, [roleId, skill]);
      await pool.query(`update role_requirement set review_status = 'published' where id = $1`, [rr.rows[0].id]);
    }
    const user = await newUser();
    const ps = await evaluated(user, roleId);
    const gaps = ps.filter((p) => p.proposalType === 'profile_gap');
    assert.equal(gaps.length, 1, 'one core skill (UI state management) has no qualifying evidence; UI testing was just demonstrated');
    assert.equal(gaps[0]!.structuredPayload['skillId'], canonicalUiState, 'the gap names the canonical skill, never the alias');
    assert.equal(gaps[0]!.structuredPayload['currentState'], 'gap');
    assert.equal((await pool.query('select count(*)::int n from evidence where user_id = $1', [user.id])).rows[0].n, 1, 'role requirements created no evidence');
    assert.equal((await pool.query(`select count(*)::int n from skill_claim where user_id = $1 and skill_id in ($2, 'a0000000-0000-4000-8000-000000000001')`, [user.id, canonicalUiState])).rows[0].n, 0, 'no claim was written for the required skill');
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

describe('OPEN-040 — demo → canonical promotion never mutates the demo row', () => {
  test('promote creates a non-demo review copy; the copy walks the review workflow; publishing supersedes the demo and closes the record', async () => {
    const { promoteDemo, completePromotion, recordCorrection } = await import('../src/career-data/promotion');
    const demo = (await pool.query(`select id from skill where slug = 'skl_forms_validation' and is_demo_fixture`)).rows[0].id;
    const r = await promoteDemo(pool, 'skill', demo, 'content author', 'first promotion');
    const copy = await pool.query('select slug, is_demo_fixture, review_status, promoted_from_id from skill where id = $1', [r.canonicalId]);
    assert.deepEqual(copy.rows[0], { slug: 'skl_forms_validation', is_demo_fixture: false, review_status: 'curated', promoted_from_id: demo });
    const demoRow = await pool.query('select is_demo_fixture, review_status from skill where id = $1', [demo]);
    assert.deepEqual(demoRow.rows[0], { is_demo_fixture: true, review_status: 'draft' }, 'the demo row is untouched and still identifiable as demo');
    await assert.rejects(() => promoteDemo(pool, 'skill', demo, 'x', null), /already has an open review copy/);
    await assert.rejects(() => promoteDemo(pool, 'skill', r.canonicalId, 'x', null), /only a DEMO record/);
    await recordCorrection(pool, r.promotionId, { field: 'label_en', from: 'Forms & input validation', to: 'Forms and input validation', by: 'sme', reason: 'house style' });
    await assert.rejects(() => completePromotion(pool, r.promotionId), /publish it through the review workflow first/);
    const sme = '22222222-2222-4222-8222-222222222222';
    const go = (to: string, role: string, by: string | null) => reviewTransition(pool, { entityKind: 'skill', entityId: r.canonicalId, to: to as never, decidedBy: by, decidedByLabel: by ?? 'R-1', rolePerformed: role as never, reason: `promotion: ${to}`, production: false });
    await go('sme_reviewed', 'sme', sme); await go('approved', 'sme', sme); await go('published', 'product_owner', null);
    const done = await completePromotion(pool, r.promotionId);
    assert.equal(done.reviewLogIds.length, 3);
    const promo = await pool.query('select step, reviewer_id, approved_at, published_at, canonical_version, corrections from content_promotion where id = $1', [r.promotionId]);
    assert.equal(promo.rows[0].step, 'published'); assert.equal(promo.rows[0].reviewer_id, sme); assert.ok(promo.rows[0].approved_at); assert.ok(promo.rows[0].published_at); assert.equal(promo.rows[0].corrections.length, 1);
    assert.equal((await pool.query('select review_status, is_demo_fixture from skill where id = $1', [demo])).rows[0].review_status, 'superseded');
    assert.equal((await pool.query('select is_demo_fixture from skill where id = $1', [demo])).rows[0].is_demo_fixture, true, 'still demo after supersession');
    // Q01 does not treat the demo/canonical pair as a duplicate; Q19 flags canonical rows that still point at demo skills.
    const q = await runQualityChecks(pool);
    assert.equal(q.results.find((x) => x.id === 'Q01')!.passed, true);
  });
});

describe('final content review preparation — OPEN-044, OPEN-045, pack facts, value approval', () => {
  const pack = () => loadPack(join(ROOT, 'data', 'career'), 'trk_frontend_junior');
  const mutated = (f: (p: ReturnType<typeof loadPack>['pack']) => void) => { const { pack: p } = pack(); const c = JSON.parse(JSON.stringify(p)) as typeof p; f(c); return c; };
  test('3 — the completeness criterion is a gate: no skill, no skill threshold, and the schema refuses a gate mapped to a skill', async () => {
    const gates = await pool.query(`select rc.key, rc.linked_skill_id, rc.threshold_for_skill, rc.threshold_status, rc.mandatory from rubric_criterion rc join rubric_version rv on rv.id = rc.rubric_version_id where rc.criterion_kind = 'gate' and rv.is_demo_fixture and rv.version like 'rub_fe_%@0.1.0'`);
    assert.equal(gates.rowCount, 3);
    for (const g of gates.rows) { assert.equal(g.key, 'deliverables_complete'); assert.equal(g.linked_skill_id, null); assert.equal(g.threshold_for_skill, null); assert.equal(g.threshold_status, null); assert.equal(g.mandatory, true, 'still mandatory: it gates'); }
    const anySkill = (await pool.query(`select id from skill where status = 'active' limit 1`)).rows[0].id;
    await assert.rejects(() => pool.query(`update rubric_criterion set linked_skill_id = $1 where criterion_kind = 'gate' and key = 'deliverables_complete'`, [anySkill]), /rubric_criterion_kind_shape/);
    assert.throws(() => validatePack(mutated((p) => { const c = p.track.rubrics[0]!.criteria.find((x) => x.key === 'deliverables_complete')!; c.linked_skill = 'skl_html_semantic'; })), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /must not be mapped to a skill/.test(x)));
    assert.equal((await pool.query(`select count(*)::int n from rubric_criterion where dimension = 'completeness' and criterion_kind = 'skill_evidence'`)).rows[0].n, 0, 'no completeness criterion can yield skill evidence');
  });
  test('5, 7, 8 — no active check depends on a producer-less signal; future checks are inactive; the removed check is gone', async () => {
    const specs = await pool.query(`select a.slug, i.key, i.evaluation_mode, i.active, i.blocking, i.check_definition->>'type' as t from integrity_check_spec i join activity_spec a on a.id = i.activity_spec_id where a.slug like 'act_fe_%' and a.is_demo_fixture order by a.slug, i.key`);
    const byMode = (m: string) => specs.rows.filter((r) => r.evaluation_mode === m);
    assert.equal(specs.rowCount, 17 + 2, '17 pack checks + 2 Slice-1 checks');
    assert.equal(byMode('human_observable').length, 7); assert.equal(byMode('future_deterministic').length, 4);
    for (const r of byMode('future_deterministic')) { assert.equal(r.active, false); assert.equal(r.blocking, false); }
    for (const r of byMode('human_observable')) { assert.equal(r.t, 'human_observation'); assert.equal(r.blocking, false); }
    for (const r of byMode('deterministic')) assert.equal(r.active, true);
    assert.ok(!specs.rows.some((r) => r.key === 'planted_field_count'), '8 — the removed check no longer exists in the spec');
    assert.equal((await pool.query(`select count(*)::int n from integrity_check_spec where key = 'files_present' and check_type = 'mandatory_deliverables'`)).rows[0].n, 4, 'the gate is typed as what it is');
    assert.throws(() => validatePack(mutated((p) => { p.track.activities[0]!.integrity_checks.push({ key: 'bogus', check_type: 'deterministic_signal', evaluation_mode: 'deterministic', blocking: false, location_en: 'x', expected_user_behavior_en: 'x', check_definition: { type: 'artifact_present', artifactKey: 'signal.nothing_produces_me' } }); })),
      (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /no producer creates/.test(x)));
    assert.throws(() => validatePack(mutated((p) => { const c = p.track.activities[1]!.integrity_checks.find((x) => x.evaluation_mode === 'future_deterministic')!; c.active = true; })), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /inactive until its producer exists/.test(x)));
  });
  test('9, 10, 11 — exactly 3 activities, each measuring 2–3 CORE skills deeply, and no framework anywhere', async () => {
    const { pack: p } = pack();
    assert.equal(p.track.activities.length, 3);
    const core = new Set(p.track.roleSkills.filter((x) => x.is_core_for_role).map((x) => x.skill)); assert.equal(core.size, 5);
    for (const a of p.track.activities) { const n = a.related_skills.filter((s) => s.depth === 'primary' && core.has(s.skill)).length; assert.ok(n >= 2 && n <= 3, `${a.code}: ${n} core primaries`); }
    assert.throws(() => validatePack(mutated((p2) => { (p2.track.activities[0] as { title_en: string }).title_en = 'Build a React component'; })), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /framework/.test(x)));
    assert.throws(() => validatePack(mutated((p2) => { p2.track.tasks[0]!.common_failure_modes_en.push('forgetting Vue reactivity'); })), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /framework/.test(x)));
    assert.throws(() => validatePack(mutated((p2) => { p2.track.activities.pop(); })), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /exactly 3/.test(x)));
    assert.throws(() => validatePack(mutated((p2) => { p2.track.activities[0]!.related_skills = p2.track.activities[0]!.related_skills.map((s) => ({ ...s, depth: 'secondary' as const })); })), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /2–3 CORE skills/.test(x)));
    const terms = await pool.query(`select count(*)::int n from career_presentation_rule where template_pattern_en ~* '\\m(react|vue|angular)\\M' or array_to_string(allowed_claim_verbs_en, ' ') ~* '\\m(react|vue|angular)\\M'`);
    assert.equal(terms.rows[0].n, 0, 'no presentation rule inserts a framework');
  });
  test('12 — a proposed/TBD value cannot silently become approved: not by the pack, not by a direct update, never on a demo rubric', async () => {
    assert.throws(() => validatePack(mutated((p2) => { p2.track.rubrics[0]!.criteria[0]!.weight_status = 'approved'; })), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /cannot declare its own values approved/.test(x)));
    const demoRubric = (await pool.query(`select id from rubric_version where version = 'rub_fe_change_request@0.1.0' and is_demo_fixture`)).rows[0].id;
    await assert.rejects(() => pool.query(`update rubric_criterion set weight_status = 'approved' where rubric_version_id = $1 and key = 'js_correctness'`, [demoRubric]), /DEMO fixture never carries an approved/);
    await assert.rejects(() => pool.query(`update rubric_version set pass_threshold_status = 'approved' where id = $1`, [demoRubric]), /DEMO fixture never carries an approved/);
    const { approveRubricValues } = await import('../src/career-data/review');
    await assert.rejects(() => approveRubricValues(pool, { rubricVersionId: demoRubric, decidedBy: '22222222-2222-4222-8222-222222222222', decidedByLabel: 'SME', reason: 'x' }), /DEMO fixture/);
    // A non-demo copy (the activity is promoted; its rubric, criteria, levels and checks come with it): a direct
    // update is still refused until the ONE recorded SME act exists. A rubric alone cannot be promoted before its activity.
    const { promoteDemo } = await import('../src/career-data/promotion');
    await assert.rejects(() => promoteDemo(pool, 'rubric_version', demoRubric, 'content author', 'values test'), /promote the activity first/);
    const demoAct = (await pool.query(`select id from activity_spec where slug = 'act_fe_change_request' and is_demo_fixture`)).rows[0].id;
    const r = await promoteDemo(pool, 'activity_spec', demoAct, 'content author', 'values test');
    assert.equal(r.copied['rubric_criterion'], 7); assert.ok((r.copied['integrity_check_spec'] ?? 0) >= 5, 'checks come with the activity');
    const copy = (await pool.query(`select id from rubric_version where promoted_from_id = $1`, [demoRubric])).rows[0].id;
    assert.equal((await pool.query(`select count(*)::int n from rubric_criterion where rubric_version_id = $1 and (weight_status = 'approved' or threshold_status = 'approved')`, [copy])).rows[0].n, 0, 'copying never approves a value');
    await assert.rejects(() => pool.query(`update rubric_criterion set weight_status = 'approved' where rubric_version_id = $1 and key = 'js_correctness'`, [copy]), /recorded SME approval/);
    const ok = await approveRubricValues(pool, { rubricVersionId: copy, decidedBy: '22222222-2222-4222-8222-222222222222', decidedByLabel: 'SME Person', reason: 'calibration sample of 12 submissions reviewed' });
    assert.equal(ok.criteria, 7);
    const after = await pool.query(`select criterion_kind, weight_status, threshold_status from rubric_criterion where rubric_version_id = $1`, [copy]);
    for (const c of after.rows) { assert.equal(c.weight_status, 'approved'); assert.equal(c.threshold_status, c.criterion_kind === 'skill_evidence' ? 'approved' : null); }
    assert.equal((await pool.query(`select count(*)::int n from review_log where entity_kind = 'rubric_version' and entity_id = $1 and reason like 'values approved%'`, [copy])).rows[0].n, 1, 'recorded by name');
  });
  test('13 — no pack row is SME-approved, and the database would refuse it', async () => {
    for (const [t, col] of [['skill', 'review_status'], ['target_role', 'review_status'], ['task', 'review_status'], ['activity_spec', 'status'], ['rubric_version', 'status'], ['learning_resource', 'review_status']] as const) {
      const n = (await pool.query(`select count(*)::int n from ${t} where is_demo_fixture and (${col} in ('sme_reviewed','approved') or reviewed_by is not null)`)).rows[0].n;
      assert.equal(n, 0, `${t}: a demo row is neither SME-reviewed nor approved`);
    }
    const act = (await pool.query(`select id from activity_spec where slug = 'act_fe_change_request' and is_demo_fixture`)).rows[0].id;
    await assert.rejects(() => pool.query(`update activity_spec set status = 'curated' where id = $1 and status = 'draft'`, [act]).then(() => pool.query(`update activity_spec set status = 'sme_reviewed', reviewed_by = '22222222-2222-4222-8222-222222222222', reviewed_at = now() where id = $1`, [act])), /DEMO fixture is never SME reviewed or approved/);
  });
});
