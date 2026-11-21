/**
 * D-135 — development-only graduate pilot loader for the Junior Frontend v2 candidate.
 *
 *  - refused in production; the normal format-2 import stays refused
 *  - writes one pilot role, 12 requirements (no class shown), 3 activities and 3 rubrics as DEMO, DRAFT rows; every
 *    undecided expert value stays empty + TBD (weights, skill thresholds, pass thresholds, durations) — no number invented
 *  - idempotent (a second load rewrites nothing); the v1 demo rows are byte-identical before and after
 *  - creates no classification, readiness rule set, pack constraint, policy or published content; nothing is graduate-usable
 *  - the per-skill pilot policy is development-only and the D-118 safety baseline is restored afterwards
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { join } from 'node:path';
import { bootApp, newUser, type TestUser } from './helpers';
import { loadCandidate } from '../src/career-data/candidate';
import { importPack } from '../src/career-data/pipeline';
import { loadPilotCandidate, usePilotPerSkillPolicy, restoreSafetyBaseline, PILOT_POLICY_DESCRIPTION, type PilotLoadReport } from '../src/career-data/pilot-loader';

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
