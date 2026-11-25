/**
 * D-135 — development-only graduate pilot loader for the Junior Frontend v2 candidate.
 *
 *  - refused in production; the normal format-2 import stays refused
 *  - writes one pilot role, 12 requirements (no class shown), 3 activities and 3 rubrics as DEMO, DRAFT rows; every
 *    undecided expert value stays empty + TBD (weights, skill thresholds, pass thresholds, durations) — no number invented
 *  - idempotent (a second load rewrites nothing); the v1 demo rows are byte-identical before and after
 *  - creates no classification, readiness rule set, pack constraint, policy or published content; nothing is graduate-usable
 *  - the per-skill pilot policy is development-only and the D-118 safety baseline is restored afterwards
 *  - D-136: the authorized Product Owner publishes the pilot (local development only; never SME approval); an internal
 *    graduate then reaches all three activities and completes Task B: submit → human review → an UNDETERMINED result
 *    with per-skill feedback; no evidence, no level, no claim, no readiness; another user sees none of it
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { join } from 'node:path';
import { bootApp, newUser, uploadFile, filesFor, COMPONENT_BYTES, TEST_BYTES, type TestUser } from './helpers';
import { loadCandidate } from '../src/career-data/candidate';
import { importPack } from '../src/career-data/pipeline';
import { loadPilotCandidate, usePilotPerSkillPolicy, restoreSafetyBaseline, publishPilotDemo, PILOT_POLICY_DESCRIPTION, type PilotLoadReport } from '../src/career-data/pilot-loader';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const ROOT = join(__dirname, '..', '..', '..', '..');
const DIR = join(ROOT, 'data', 'candidates', 'trk_frontend_junior_v2');
const CANON = join(ROOT, 'data', 'career');
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
const OPTS = { candidateDir: DIR, canonicalRoot: CANON, byLabel: 'e2e (D-135 pilot loader test)', reason: 'D-135 loader regression test', production: false };
// Every non-pilot content row the loader could conceivably touch, fingerprinted.
const NON_PILOT = `select md5(string_agg(t, '|' order by t)) as h from (
    select concat_ws(',', a.id, a.slug, a.version, a.status, a.title_ar, a.target_role_id, a.estimated_minutes) t from activity_spec a where not exists (select 1 from pilot_content_load l where l.target_role_id = a.target_role_id)
    union all select concat_ws(',', id, slug, review_status, label_ar, version) from target_role r where not exists (select 1 from pilot_content_load l where l.target_role_id = r.id)
    union all select concat_ws(',', rr.id, rr.is_core, rr.review_status, rr.classification_status, rr.version) from role_requirement rr where not exists (select 1 from pilot_content_load l where l.target_role_id = rr.target_role_id)
    union all select concat_ws(',', rv.id, rv.status, rv.pass_threshold, rv.pass_threshold_status) from rubric_version rv join activity_spec a on a.id = rv.activity_spec_id where not exists (select 1 from pilot_content_load l where l.target_role_id = a.target_role_id)
    union all select concat_ws(',', id, slug, review_status, status, version) from skill
    union all select concat_ws(',', id, code, practice_activity_spec_id) from learning_resource) x`;

let before0: string; let report: PilotLoadReport;
before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  before0 = (await one(NON_PILOT)).h;
  report = await loadPilotCandidate(pool, OPTS);
});
after(async () => { await pool?.end(); await app?.close(); });

describe('refusals', () => {
  test('the pilot is never loaded in production, and needs a name and a reason', async () => {
    await assert.rejects(() => loadPilotCandidate(pool, { ...OPTS, production: true }), /never loaded in production/);
    await assert.rejects(() => loadPilotCandidate(pool, { ...OPTS, reason: ' ' }), /names who loads it and why/);
    await assert.rejects(() => usePilotPerSkillPolicy(pool, { byLabel: 'x', production: true }), /never used in production/);
  });
  test('the normal format-2 import is still refused (unchanged)', async () => {
    const b = loadCandidate(DIR, CANON);
    await assert.rejects(() => importPack(pool, b.pack, b.files), /pack constraint|importing it is not enabled/);
  });
});

describe('what the loader writes', () => {
  test('one demo, draft pilot role labelled as an unapproved internal pilot; 12 requirements with no class shown', async () => {
    const r = await one('select slug, label_ar, is_demo_fixture, review_status::text as s, provenance_source from target_role where id = $1', [report.role.id]);
    assert.equal(r.slug, 'frontend-developer-junior-v2-pilot'); assert.equal(r.is_demo_fixture, true); assert.equal(r.s, 'draft');
    assert.match(r.label_ar, /تجربة داخلية.*غير معتمدة/); assert.match(r.provenance_source, /^pilot:trk_frontend_junior@0\.3\.0-candidate\.1$/);
    const rr = (await pool.query('select is_core, classification_status, is_demo_fixture, weight from role_requirement where target_role_id = $1', [report.role.id])).rows;
    assert.equal(rr.length, 12);
    assert.ok(rr.every((x) => x.is_core === false && x.classification_status === 'pending_expert_validation' && x.is_demo_fixture && x.weight === null), 'no class written or shown (CR-12)');
  });
  test('three draft demo activities and rubrics; every undecided expert value is EMPTY + TBD — no number invented', async () => {
    assert.deepEqual(report.activities.map((a) => `${a.code}@${a.version}`), ['act_fe_integrated_leave_requests@0.1.0', 'act_fe_debug_improve@0.2.0', 'act_fe_change_request@0.2.0']);
    for (const a of report.activities) {
      const act = await one('select status::text as s, is_demo_fixture, estimated_minutes, can_yield_verified from activity_spec where id = $1', [a.activityId]);
      assert.deepEqual([act.s, act.is_demo_fixture, act.estimated_minutes, act.can_yield_verified], ['draft', true, null, false], `${a.code}: draft demo, duration undecided`);
      const rv = await one('select status::text as s, pass_threshold, pass_threshold_status::text as ps, is_demo_fixture, values_approved_at from rubric_version where id = $1', [a.rubricId]);
      assert.deepEqual([rv.s, rv.pass_threshold, rv.ps, rv.is_demo_fixture, rv.values_approved_at], ['draft', null, 'TBD', true, null], `${a.code}: pass threshold undecided`);
      const decided = Number((await one(`select count(*)::int n from rubric_criterion where rubric_version_id = $1 and (weight is not null or weight_status::text <> 'TBD'
        or threshold_for_skill is not null or coalesce(threshold_status::text, 'TBD') <> 'TBD')`, [a.rubricId])).n);
      assert.equal(decided, 0, `${a.code}: no weight or threshold is stated`);
    }
    assert.equal(Number((await one('select count(*)::int n from rubric_criterion where rubric_version_id = any($1)', [report.activities.map((a) => a.rubricId)])).n), 28);
  });
  test('the ledger records the load (file hashes, who, why); a second load rewrites nothing', async () => {
    const l = await one('select loaded_by_label, reason, jsonb_array_length(files) as files from pilot_content_load where target_role_id = $1', [report.role.id]);
    assert.equal(l.loaded_by_label, OPTS.byLabel); assert.ok(Number(l.files) > 5);
    const again = await loadPilotCandidate(pool, { ...OPTS, reason: 'second run' });
    assert.equal(again.alreadyLoaded, true); assert.deepEqual(again.activities, report.activities);
    assert.equal(Number((await one(`select count(*)::int n from target_role where slug = 'frontend-developer-junior-v2-pilot'`)).n), 1);
  });
});

describe('what the loader never touches', () => {
  test('every non-pilot content row (v1 demo role, activities, rubrics, requirements, skills, resources) is byte-identical', async () => {
    assert.equal((await one(NON_PILOT)).h, before0);
  });
  test('no classification, schema-2 constraint set, readiness rule set or published row is created for the pilot', async () => {
    assert.equal(Number((await one('select count(*)::int n from skill_classification_set where target_role_id = $1', [report.role.id])).n), 0);
    assert.equal(Number((await one(`select count(*)::int n from readiness_rule_set where target_role_id = $1`, [report.role.id])).n), 0);
    assert.equal(Number((await one(`select count(*)::int n from activity_spec where target_role_id = $1 and status <> 'draft'`, [report.role.id])).n), 0);
    assert.equal(Number((await one(`select count(*)::int n from review_log where entity_id = any($1)`, [[report.role.id, ...report.activities.flatMap((a) => [a.activityId, a.rubricId])]])).n), 0,
      'no review decision is recorded or bypassed');
  });
  test('a graduate who picks the pilot role sees an EMPTY catalogue (draft activities are not usable) and cannot start one', async () => {
    const u = await newUser();
    await http.post('/v1/me/bootstrap').set(auth(u)).expect((r) => assert.ok(r.status < 300));
    await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: report.role.id, confirmed: true }).expect((r) => assert.ok(r.status < 300, `goal: ${r.status} ${JSON.stringify(r.body)}`));
    const cat = await http.get('/v1/me/activities').set(auth(u)).expect(200);
    assert.equal(cat.body.data.items.length, 0, 'no pilot activity is in the catalogue');
    const start = await http.post('/v1/projects').set(auth(u)).send({ activitySpecId: report.activities[0]!.activityId, title: 'x', kind: 'platform_activity' });
    assert.ok(start.status >= 400, `starting a draft pilot activity is refused (${start.status})`);
  });
});

describe('per-skill pilot policy (development only)', () => {
  test('it is an unapproved development_only draft with the independently_verified basis; the safety baseline is restored afterwards', async () => {
    const id = await usePilotPerSkillPolicy(pool, { byLabel: 'e2e', production: false });
    try {
      const p = await one(`select activation::text as a, review_status::text as r, assessment_scope, promotion_basis, practiced_on_submission, description_en from verification_policy where id = $1`, [id]);
      assert.deepEqual([p.a, p.r, p.assessment_scope, p.promotion_basis, p.practiced_on_submission, p.description_en], ['development_only', 'draft', 'per_skill', 'independently_verified', false, PILOT_POLICY_DESCRIPTION]);
      assert.equal(Number((await one(`select count(*)::int n from verification_policy where key = 'default' and activation <> 'inactive'`)).n), 1);
    } finally { await restoreSafetyBaseline(pool, { byLabel: 'e2e' }); }
    const inEffect = await one(`select activation::text as a, version, baseline_of is not null as baseline from verification_policy where key = 'default' and activation <> 'inactive'`);
    assert.deepEqual([inEffect.a, inEffect.version, inEffect.baseline], ['legacy_baseline', 2, true]);
  });
});

const PILOT_PUBLICATION = 'D-136 pilot publication e2e (TEST FIXTURE Product Owner — not a governance decision)';
const pilotRows = async () => (await pool.query(`select 'activity_spec' as kind, a.id from activity_spec a join pilot_content_load l on l.target_role_id = a.target_role_id
  union all select 'rubric_version', rv.id from rubric_version rv join activity_spec a on a.id = rv.activity_spec_id join pilot_content_load l on l.target_role_id = a.target_role_id`)).rows as { kind: string; id: string }[];

describe('D-136 — development-only DEMO publication of the pilot (an authorized Product Owner operation)', () => {
  let po: TestUser;
  before(async () => {
    po = await newUser(); await http.post('/v1/me/bootstrap').set(auth(po)).send({}).expect(201);
    await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'product_owner', $2)`, [po.id, PILOT_PUBLICATION]);
  });
  const url = () => process.env['DATABASE_URL']!;
  test('refused in production, against a non-local (staging) database, and for an operator without a product_owner grant — nothing changes', async () => {
    const before = (await one(`select string_agg(status::text, ',' order by id) as s from (select id, status from activity_spec where target_role_id = $1) x`, [report.role.id])).s;
    await assert.rejects(() => publishPilotDemo(pool, { operatorId: po.id, reason: 'x', nodeEnv: 'production', databaseUrl: url() }), /outside local development/);
    await assert.rejects(() => publishPilotDemo(pool, { operatorId: po.id, reason: 'x', nodeEnv: undefined, databaseUrl: url() }), /outside local development/);
    await assert.rejects(() => publishPilotDemo(pool, { operatorId: po.id, reason: 'x', nodeEnv: 'development', databaseUrl: 'postgresql://u@db.staging-project.supabase.co:5432/postgres' }), /not a local development database/);
    const nobody = await newUser(); await http.post('/v1/me/bootstrap').set(auth(nobody)).send({}).expect(201);
    await assert.rejects(() => publishPilotDemo(pool, { operatorId: nobody.id, reason: 'x', nodeEnv: 'test', databaseUrl: url() }), /no active product_owner grant/);
    assert.equal((await one(`select string_agg(status::text, ',' order by id) as s from (select id, status from activity_spec where target_role_id = $1) x`, [report.role.id])).s, before);
  });
  test('the database refuses the shortcut itself: no opt-in, production, or an operator without a grant; and never an SME approval on a pilot row', async () => {
    const id = report.activities[0]!.activityId;
    const c = await pool.connect();
    try {
      const attempt = async (setup: string, sql = `update activity_spec set status = 'published' where id = '${id}'`) => {
        await c.query('begin');
        try { await c.query(`update activity_spec set status = 'curated' where id = '${id}' and status = 'draft'`); if (setup) await c.query(setup); await c.query(sql); return 'accepted'; }
        catch (e) { return (e as Error).message; } finally { await c.query('rollback'); }
      };
      assert.match(await attempt(''), /published only by the authorized Product Owner pilot operation/);
      assert.match(await attempt(`select set_config('naqla.pilot_demo_publication', 'on', true), set_config('naqla.pilot_publication_operator', '${po.id}', true), set_config('naqla.production', 'on', true)`), /never published in production/);
      assert.match(await attempt(`select set_config('naqla.pilot_demo_publication', 'on', true), set_config('naqla.pilot_publication_operator', gen_random_uuid()::text, true)`), /active product_owner grant/);
      assert.match(await attempt('', `update activity_spec set sme_approved_by = gen_random_uuid(), sme_approved_at = now() where id = '${id}'`), /never carries an SME approval/);
    } finally { c.release(); }
  });
  test('the authorized operation publishes the 3 activities and 3 rubrics, logs each as product_owner (D-136), writes no SME approval; a rerun publishes nothing', async () => {
    const r = await publishPilotDemo(pool, { operatorId: po.id, reason: 'D-136 e2e: internal graduate journey', nodeEnv: 'test', databaseUrl: url() });
    assert.equal(r.published.length, 6);
    const rows = await pilotRows();
    for (const x of rows) {
      const st = await one(`select status::text as s, is_demo_fixture from ${x.kind} where id = $1`, [x.id]);
      assert.deepEqual([st.s, st.is_demo_fixture], ['published', true], `${x.kind} ${x.id}`);
      const log = (await pool.query(`select role_performed::text as role, to_status::text as t, decided_by, reason from review_log where entity_id = $1 order by decided_at`, [x.id])).rows;
      assert.deepEqual(log.map((l) => `${l.role}:${l.t}`), ['content_author:curated', 'product_owner:published']);
      assert.equal(log[1].decided_by, po.id); assert.match(log[1].reason, /D-136 DEVELOPMENT PILOT DEMO PUBLICATION.*not an SME approval/);
    }
    assert.equal(Number((await one(`select count(*)::int n from review_log where entity_id = any($1) and role_performed = 'sme'`, [rows.map((x) => x.id)])).n), 0, 'no SME record');
    assert.equal(Number((await one(`select count(*)::int n from activity_spec where target_role_id = $1 and (sme_approved_by is not null or reviewed_by is not null)`, [report.role.id])).n), 0);
    assert.equal(Number((await one(`select count(*)::int n from rubric_version rv join activity_spec a on a.id = rv.activity_spec_id where a.target_role_id = $1
      and (rv.values_approved_at is not null or rv.pass_threshold is not null or rv.activity_spec_version is distinct from a.version)`, [report.role.id])).n), 0, 'undecided values unchanged; each rubric bound to its activity version');
    assert.equal(Number((await one(`select count(*)::int n from audit_event where event_type = 'pilot.demo_published' and actor_id = $1`, [po.id])).n), 6);
    assert.equal((await publishPilotDemo(pool, { operatorId: po.id, reason: 'again', nodeEnv: 'test', databaseUrl: url() })).published.length, 0);
    assert.equal((await one(NON_PILOT)).h, before0, 'every non-pilot content row is still byte-identical');
  });

  test('an internal graduate who picks the pilot role reaches all three activities, each marked as DEMO (experimental)', async () => {
    const u = await newUser(); await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
    await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: report.role.id, confirmed: true }).expect(200);
    const items = (await http.get('/v1/me/activities').set(auth(u)).expect(200)).body.data.items as { id: string; isDemo: boolean }[];
    assert.deepEqual(items.map((i) => i.id).sort(), report.activities.map((a) => a.activityId).sort());
    assert.ok(items.every((i) => i.isDemo));
    for (const a of report.activities) assert.equal((await http.get(`/v1/me/activities/${a.activityId}`).set(auth(u)).expect(200)).body.data.isDemo, true);
  });

  test('complete journey on Task B: submit → human review → overall result UNDETERMINED, per-skill feedback only; no evidence, level, claim or readiness; private to the graduate', async () => {
    const taskB = report.activities.find((a) => a.code === 'act_fe_change_request')!;
    await usePilotPerSkillPolicy(pool, { byLabel: 'e2e (D-136)', production: false });
    try {
      const u = await newUser(); await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
      await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: report.role.id, confirmed: true }).expect(200);
      const pid = (await http.post('/v1/projects').set(auth(u)).send({ title: 'تعديل قائمة المهام', kind: 'platform_activity', activitySpecId: taskB.activityId }).expect(201)).body.data.id as string;
      const primaries = (await pool.query(`select skill_id from activity_skill where activity_spec_id = $1 and depth = 'primary' order by skill_id`, [taskB.activityId])).rows.map((r) => r.skill_id as string);
      const f1 = await uploadFile(app, http, u, 'app.js', TEST_BYTES); const f2 = await uploadFile(app, http, u, 'index.html', COMPONENT_BYTES, 'text/plain');
      const sid = (await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: primaries, files: filesFor([f1, f2], ['file.app_js', 'file.index_html']),
        aiDisclosure: { declaredUse: [] }, artifacts: [
          { key: 'note.decision', kind: 'text', valueText: 'اخترتُ إضافة الفلتر الثاني إلى الحالة نفسها بدل نسخ القائمة، لأن ذلك يبقي مصدرًا واحدًا للبيانات.', locator: 'notes.md' },
          { key: 'answer.explanation', kind: 'text', valueText: 'التغيير يقرأ الفلترين معًا ثم يعرض القائمة الفارغة رسالةً لا خطأً.', locator: 'notes.md' },
          { key: 'answer.component_explained', kind: 'text', valueText: 'المكوّن يستقبل القائمة المفلترة ويعرض العناصر أو حالة الفراغ.', locator: 'notes.md' },
        ] }).expect(201)).body.data.id as string;
      const ev = (await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u)).expect(201)).body.data;
      assert.equal(ev.outcome, 'needs_human_review', `the activity is human-reviewed (${ev.outcome})`);
      const reviewer = await newUser(); await http.post('/v1/me/bootstrap').set(auth(reviewer)).send({}).expect(201);
      await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'human_reviewer', 'e2e operator (D-136 pilot)')`, [reviewer.id]);
      const items = (await pool.query(`select q.id, q.criterion_key, (select l.level_key from rubric_criterion_level l where l.criterion_id = q.criterion_id order by l.score desc limit 1) as top
        from review_queue_item q where q.evaluation_id = $1 order by q.criterion_key`, [ev.evaluationId])).rows;
      assert.ok(items.length > 0);
      for (const it of items) {
        await http.post(`/v1/review/queue/${it.id}/assign`).set(auth(reviewer)).send({}).expect(201);
        await http.get(`/v1/review/items/${it.id}`).set(auth(reviewer)).expect(200);
        await http.post(`/v1/review/items/${it.id}/decision`).set(auth(reviewer)).send({ levelKey: it.top, rationale: `لاحظتُ في الملفات المسلّمة: ${it.criterion_key}.` }).expect(201);
      }
      const view = (await http.get(`/v1/submissions/${sid}/evaluation`).set(auth(u)).expect(200)).body.data;
      // Even with every criterion at its TOP level, nothing is passed: the pass threshold and rule are undecided.
      assert.equal(view.outcome, 'undetermined'); assert.equal(view.isDemo, true); assert.equal(view.transition, null);
      assert.ok(view.criteria.length > 0 && view.criteria.every((c: { rationale: string }) => c.rationale.trim().length > 0), 'criterion feedback is shown');
      assert.ok(view.skills.length > 0, 'per-skill feedback is shown');
      assert.ok(view.skills.every((s: { outcome: string }) => s.outcome === 'incomplete'), `every skill reads "not yet decided": ${view.skills.map((s: { outcome: string }) => s.outcome)}`);
      assert.ok(view.skills.every((s: { criteria: { status: string }[] }) => s.criteria.every((c) => c.status === 'threshold_unapproved')), 'no threshold was invented');
      assert.equal(Number((await one('select count(*)::int n from evidence where user_id = $1', [u.id])).n), 0, 'no evidence');
      assert.equal(Number((await one(`select count(*)::int n from skill_claim where user_id = $1 and state::text in ('practiced','demonstrated','verified')`, [u.id])).n), 0, 'no level');
      assert.equal(Number((await one(`select count(*)::int n from verification_decision where user_id = $1 and evidence_id is not null`, [u.id])).n), 0, 'no promotion decision');
      assert.equal(Number((await one(`select count(*)::int n from readiness_evaluation where user_id = $1`, [u.id])).n), 0, 'no readiness');
      assert.equal(Number((await one(`select count(*)::int n from claim_draft_event where user_id = $1`, [u.id])).n), 0, 'no career claim');
      assert.equal(Number((await one(`select count(*)::int n from skill_classification_set where activation <> 'inactive'`)).n), 0, 'no classification active');
      // Tenant isolation: another graduate cannot read the submission, its evaluation, or start its evaluation.
      const other = await newUser(); await http.post('/v1/me/bootstrap').set(auth(other)).send({}).expect(201);
      await http.get(`/v1/submissions/${sid}/evaluation`).set(auth(other)).expect(404);
      await http.get(`/v1/submissions/${sid}`).set(auth(other)).expect(404);
      await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(other)).expect(404);
      assert.equal(((await http.get('/v1/projects').set(auth(other)).expect(200)).body.data.items as unknown[]).length, 0);
      const mine = (await http.get('/v1/projects').set(auth(u)).expect(200)).body.data.items as { id: string; activity: { isDemo: boolean } }[];
      assert.ok(mine.some((p) => p.id === pid && p.activity.isDemo === true), 'My Work marks the work as DEMO');
    } finally { await restoreSafetyBaseline(pool, { byLabel: 'e2e (D-136)' }); }
  });
});

describe('Phase B package 1 — occupational discovery and skill explanation (PO decisions 1 and 8)', () => {
  type Role = { id: string; slug: string; offered: boolean; isPilot: boolean; isDemo: boolean; label: string | null;
    profile: { descriptionAr: string | null; missionAr: string | null; responsibilitiesAr: string[]; expectedFromJuniorAr: string[]; skillAreasAr: string[]; sources: unknown[]; reviewed: boolean } };
  const trackOf = async (id: string) => (await one('select track_id from target_role where id = $1', [id])).track_id as string;

  test('a new graduate is offered the pilot, not the older DEMO roles of the same track; the pilot carries its recorded profile', async () => {
    const u = await newUser(); await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
    const roles = (await http.get('/v1/target-roles').set(auth(u)).expect(200)).body.data as Role[];
    const pilot = roles.find((r) => r.id === report.role.id)!;
    assert.ok(pilot && pilot.offered && pilot.isPilot && pilot.isDemo && pilot.label === 'DEMO — not reviewed');
    const track = await trackOf(report.role.id);
    const sameTrack = (await pool.query(`select id from target_role where track_id = $1 and is_demo_fixture and id <> $2`, [track, report.role.id])).rows.map((r) => r.id as string);
    assert.ok(sameTrack.length > 0, 'fixture has legacy roles on the pilot track');
    assert.ok(roles.every((r) => !sameTrack.includes(r.id)), 'no legacy DEMO role of the pilot track is offered to a new choice');
    assert.ok(pilot.profile.descriptionAr && pilot.profile.missionAr, 'the existing description and mission are exposed');
    assert.ok(pilot.profile.responsibilitiesAr.length > 0 && pilot.profile.expectedFromJuniorAr.length > 0);
    assert.equal(pilot.profile.skillAreasAr.length, 12, 'the 12 candidate skills are named as skill areas (no class implied)');
    assert.equal(pilot.profile.reviewed, false, 'a DEMO draft is never presented as reviewed');
    assert.deepEqual(pilot.profile.sources, [], 'no source is invented: none is recorded for the pilot role');
  });

  test('a graduate whose goal is a legacy role keeps it: listed to them as theirs (not offered), still readable, goal intact', async () => {
    const legacy = (await one(`select id from target_role where track_id = $1 and is_demo_fixture and id <> $2 order by slug limit 1`, [await trackOf(report.role.id), report.role.id])).id as string;
    const u = await newUser(); await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
    await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: legacy, confirmed: true }).expect(200);
    const roles = (await http.get('/v1/target-roles').set(auth(u)).expect(200)).body.data as Role[];
    const mine = roles.find((r) => r.id === legacy);
    assert.ok(mine && mine.offered === false, 'their own legacy goal is shown, marked as no longer offered');
    assert.equal((await http.get('/v1/me/career-goal').set(auth(u)).expect(200)).body.data.targetRoleId, legacy);
    const other = await newUser(); await http.post('/v1/me/bootstrap').set(auth(other)).send({}).expect(201);
    assert.ok(!((await http.get('/v1/target-roles').set(auth(other)).expect(200)).body.data as Role[]).some((r) => r.id === legacy), 'another graduate is not offered it');
  });

  test('skills carry their existing explanation; the explanation changes no level, class or readiness', async () => {
    const u = await newUser(); await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
    await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: report.role.id, confirmed: true }).expect(200);
    const page = (await http.get('/v1/me/track-skills').set(auth(u)).expect(200)).body.data as { items: { skillId: string; verification: { level: string }; readiness: { badge: string };
      explanation: { descriptionAr: string | null; whyRequiredAr: string | null; indicatorsAr: string[]; commonMistakesAr: string[]; activityCount: number } }[] };
    assert.equal(page.items.length, 12);
    assert.ok(page.items.every((s) => s.explanation.descriptionAr && s.explanation.whyRequiredAr), 'every skill has its description and why the role needs it');
    assert.ok(page.items.every((s) => s.explanation.indicatorsAr.length > 0 && s.explanation.commonMistakesAr.length > 0));
    assert.ok(page.items.every((s) => s.verification.level === 'gap' && s.readiness.badge === 'pending_expert_validation'), 'no level and no class is implied');
    assert.ok(page.items.some((s) => s.explanation.activityCount > 0), 'activity counts come from the catalogue rule');
    const first = page.items[0]!;
    const detail = (await http.get(`/v1/me/track-skills/${first.skillId}`).set(auth(u)).expect(200)).body.data;
    assert.deepEqual(detail.skill.explanation, first.explanation);
    assert.equal(detail.activities.length, first.explanation.activityCount, 'the count matches the related activities shown');
  });
});
