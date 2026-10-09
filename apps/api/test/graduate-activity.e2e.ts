/**
 * Graduate activity journey — Phase 1 (backend and access safety), against a real database.
 *
 *  A1/A2  activity discovery: only the current role's catalogue; learner projection; assessment mode derived
 *  A4     role and skill visibility: drafts, test roles, empty shells and hidden demo content stay hidden,
 *         through the API AND directly at the database (RLS), even when an id is known
 *  §4     assessment-private data: planted-issue flags, planted-input descriptions, the raw spec document,
 *         rubric internals and readiness internals never reach a graduate or anon; admins still see them
 *  A3     explicit deliverable mapping: order-independent; missing / duplicate / unexpected / mismatched /
 *         malformed / forged mappings refused with named reasons, nothing stored
 *  A5     work status from authoritative records; evaluation revisit is read-only and idempotent
 *  D-118  the safety baseline still decides: nothing here grants a level
 *  hist   records written before these runs are byte-for-byte unchanged; legacy work keeps working
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, asAuthenticatedUser,
  useSafetyBaseline, useLegacyVerificationCompat, filesFor, asHistoricalWithoutFile, type TestUser } from './helpers';
import { promoteDemo } from '../src/career-data/promotion';
import { reviewTransition, approveRubricValues } from '../src/career-data/review';
import { demoVisibilityProductionOffenders } from '../src/career-data/career-data.service';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
const n = async (sql: string, p: unknown[] = []) => Number((await one(sql, p)).n);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ok<T extends { status: number; body: any }>(r: T, code = 200): T { assert.equal(r.status, code, JSON.stringify(r.body)); return r; }
const SME = '44444444-4444-4444-8444-444444444444';
const B = ['file.index_html', 'file.styles_css', 'file.app_js'];

/** Words that would reveal assessment design or rubric internals to a graduate. */
const PRIVATE = /planted|contains_planted_issue|containsPlantedIssue|is_platform_private|isPlatformPrivate|pass_threshold|passThreshold|"weight"|threshold_for_skill|check_definition|evaluator_type|evaluatorType|rubric_criterion|minimum_evidence_count|reviewed_by|"spec"|four planted|symptom, not a cause/i;

/** Snapshot of records written before this suite (hash), to prove nothing is rewritten. */
const HISTORY_SQL = `select md5(coalesce(string_agg(x, '|' order by x), '')) as h from (
  select ('a:' || submission_id || ':' || key || ':' || coalesce(upload_id::text, '')) as x from submission_artifact where created_at < $1
  union all select 'r:' || id || ':' || outcome from evaluation_result where evaluated_at < $1
  union all select 'd:' || id || ':' || decision || ':' || coalesce(resulting_state::text, '') from verification_decision where decided_at < $1
  union all select 'g:' || id || ':' || target_role_id || ':' || is_current from career_goal where created_at < $1) q`;
let cutoff: Date; let historyBefore = '';

let packRoleId = ''; let reviewedActivityId = ''; let reviewedSkillId = '';
let draftRoleId = ''; let emptyRoleId = ''; let publishedRoleId = ''; let draftSkillId = ''; let publishedSkillId = ''; let draftRequirementOnVisibleRole = '';

async function walkToPublished(table: 'target_role' | 'skill' | 'role_requirement', id: string) {
  await pool.query(`update ${table} set review_status = 'curated' where id = $1 and review_status = 'draft'`, [id]);
  await pool.query(`update ${table} set review_status = 'sme_reviewed', reviewed_by = $2, reviewed_at = now() where id = $1`, [id, SME]);
  await pool.query(`update ${table} set review_status = 'approved' where id = $1`, [id]);
  await pool.query(`update ${table} set review_status = 'published' where id = $1`, [id]);
}
async function setDemoVisible(on: boolean) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('naqla.config_actor', 'e2e graduate-activity', true), set_config('naqla.config_reason', 'e2e: production-like demo visibility', true)");
    await c.query('update platform_deployment set demo_content_visible = $1 where singleton', [on]);
    await c.query('commit');
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}

before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  await useSafetyBaseline(); // the policy every real environment resolves to (D-118)
  cutoff = new Date(); historyBefore = (await pool.query(HISTORY_SQL, [cutoff])).rows[0].h;

  // A reviewed, SME-approved, NON-demo published copy of a pack activity (human-reviewed criteria), as D-118 does.
  const demoAct = (await one(`select id, target_role_id from activity_spec where slug = 'act_fe_build_interface' and is_demo_fixture`));
  packRoleId = demoAct.target_role_id;
  const existing = await one(`select canonical_entity_id from content_promotion where entity_kind = 'activity_spec' and demo_entity_id = $1 order by created_at desc limit 1`, [demoAct.id]);
  reviewedActivityId = existing?.canonical_entity_id ?? (await promoteDemo(pool, 'activity_spec', demoAct.id, 'content author', 'graduate journey Phase 1')).canonicalId;
  const rubricId = (await one(`select id from rubric_version where activity_spec_id = $1 and not is_demo_fixture order by created_at desc limit 1`, [reviewedActivityId])).id;
  const walk = async (kind: 'activity_spec' | 'rubric_version', id: string) => {
    const st = async () => (await one(`select status::text as s from ${kind} where id = $1`, [id])).s as string;
    if ((await st()) === 'draft') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'curated', decidedBy: null, decidedByLabel: 'author', rolePerformed: 'content_author', reason: 'submitted', production: false });
    if ((await st()) === 'curated') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'sme_reviewed', decidedBy: SME, decidedByLabel: 'Named SME', rolePerformed: 'sme', reason: 'reviewed', production: false });
    if ((await st()) === 'sme_reviewed') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'approved', decidedBy: SME, decidedByLabel: 'Named SME', rolePerformed: 'sme', reason: 'approved', production: false });
    if ((await st()) === 'approved') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'published', decidedBy: null, decidedByLabel: 'Product Owner', rolePerformed: 'product_owner', reason: 'publish', production: false });
  };
  if (!(await one('select values_approved_at from rubric_version where id = $1', [rubricId])).values_approved_at) {
    await approveRubricValues(pool, { rubricVersionId: rubricId, decidedBy: SME, decidedByLabel: 'Named SME', reason: 'graduate journey Phase 1: values reviewed' });
  }
  await walk('activity_spec', reviewedActivityId); await walk('rubric_version', rubricId);
  reviewedSkillId = (await one(`select linked_skill_id from rubric_criterion where rubric_version_id = $1 and criterion_kind = 'skill_evidence' limit 1`, [rubricId])).linked_skill_id;

  // Non-demo content in every state a graduate must or must not see.
  const tag = () => Math.random().toString(16).slice(2, 10);
  const role = async (published: boolean) => {
    const id = (await one(`insert into target_role (slug, label_ar, label_en, track_id, review_status, source_label, provenance_class, provenance_source)
      values ('e2e-ga-role-' || $1, 'دور', 'E2E role', 'e2e', 'draft', 'E2E', 'curated', 'e2e') returning id`, [tag()])).id;
    if (published) await walkToPublished('target_role', id);
    return id as string;
  };
  const skill = async (published: boolean) => {
    const id = (await one(`insert into skill (slug, label_ar, label_en, family, provenance_class, provenance_source) values ('e2e-ga-skill-' || $1, 'مهارة', 'E2E skill', 'frontend', 'curated', 'e2e') returning id`, [tag()])).id;
    if (published) await walkToPublished('skill', id);
    return id as string;
  };
  const requirement = async (roleId: string, skillId: string, published: boolean) => {
    const id = (await one(`insert into role_requirement (target_role_id, skill_id, is_core, importance, target_proficiency, why_required_ar, why_required_en, review_status, weight, minimum_evidence_count)
      values ($1,$2,true,'high','working','سبب','reason','draft', 0.5, 2) returning id`, [roleId, skillId])).id;
    if (published) await walkToPublished('role_requirement', id);
    return id as string;
  };
  draftRoleId = await role(false);                 // a Track Builder draft / an e2e "test role"
  emptyRoleId = await role(true);                  // published, but nothing to do in it
  publishedRoleId = await role(true);              // published, with a published requirement on a published skill
  draftSkillId = await skill(false); publishedSkillId = await skill(true);
  await requirement(draftRoleId, publishedSkillId, false);
  await requirement(publishedRoleId, publishedSkillId, true);
  // An unreviewed mapping on a VISIBLE role (this suite's own role: shared fixtures are never altered).
  draftRequirementOnVisibleRole = await requirement(publishedRoleId, draftSkillId, false);
});
after(async () => { await setDemoVisible(true).catch(() => undefined); await useLegacyVerificationCompat(); await pool?.end(); await app?.close(); });

async function graduate(roleId: string | null = FIXTURE.roleId): Promise<TestUser> {
  const u = await newUser();
  ok(await http.post('/v1/me/bootstrap').set(auth(u)).send({}), 201);
  if (roleId) ok(await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: roleId, confirmed: true }));
  return u;
}
async function demoProject(u: TestUser) {
  return ok(await http.post('/v1/projects').set(auth(u)).send({ title: 'متتبّع عادات', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }), 201).body.data.id as string;
}
async function demoUploads(u: TestUser) {
  return { component: await uploadFile(app, http, u, 'HabitList.jsx', COMPONENT_BYTES), test: await uploadFile(app, http, u, 'HabitList.test.jsx', TEST_BYTES) };
}
const submissionCount = (userId: string) => n('select count(*)::int n from submission where user_id = $1', [userId]);

/* ───────────────────────────── A4 · roles and skills ───────────────────────────── */

describe('A4 — graduate-visible roles, skills and role-skill mappings', () => {
  test('GET /target-roles lists only visible roles with content: demo labelled (outside production); drafts, test roles and empty shells absent', async () => {
    const u = await graduate(null);
    const roles = ok(await http.get('/v1/target-roles').set(auth(u))).body.data as { id: string; isDemo: boolean; label: string | null }[];
    const ids = roles.map((r) => r.id);
    assert.ok(ids.includes(publishedRoleId), 'a published role with a published requirement is listed');
    assert.ok(ids.includes(FIXTURE.roleId), 'the demo role is listed outside production');
    assert.ok(roles.filter((r) => r.isDemo).every((r) => r.label === 'DEMO — not reviewed'), 'demo is always labelled');
    assert.ok(!ids.includes(draftRoleId), 'a draft / test role is never listed');
    assert.ok(!ids.includes(emptyRoleId), 'an empty published shell is not offered');
    const drafts = (await pool.query(`select id from target_role where not is_demo_fixture and review_status <> 'published'`)).rows.map((r) => r.id);
    assert.ok(drafts.length > 0 && drafts.every((d) => !ids.includes(d)), 'no non-demo unpublished role at all');
  });

  test('a goal can only name a visible role: a draft role id is unknown (404), nothing is stored', async () => {
    const u = await graduate(null);
    ok(await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: draftRoleId, confirmed: true }), 404);
    assert.equal(await n('select count(*)::int n from career_goal where user_id = $1', [u.id]), 0);
    ok(await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: publishedRoleId, confirmed: true }));
  });

  test('track skills show only visible mappings: an unreviewed requirement added to a visible role does not appear', async () => {
    const u = await graduate(publishedRoleId);
    const items = ok(await http.get('/v1/me/track-skills').set(auth(u))).body.data.items as { skillId: string }[];
    assert.ok(items.length > 0);
    assert.ok(items.some((i) => i.skillId === publishedSkillId), 'the published mapping is shown');
    assert.ok(!items.some((i) => i.skillId === draftSkillId), 'the draft mapping on the same role is hidden');
    ok(await http.get(`/v1/me/track-skills/${draftSkillId}`).set(auth(u)), 404);
  });

  test('a draft skill cannot be claimed (unknown), and a claimed skill must be one of the activity\'s skills', async () => {
    const u = await graduate(); const pid = await demoProject(u); const f = await demoUploads(u);
    const body = (skillIds: string[]) => ({ skillIds, artifacts: COMPLETE_ARTIFACTS, files: filesFor([f.component, f.test]), aiDisclosure: { declaredUse: [] } });
    assert.match(JSON.stringify(ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send(body([draftSkillId])), 400).body), /unknown skill/);
    assert.match(JSON.stringify(ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send(body([publishedSkillId])), 400).body), /skill_not_mapped_to_activity/);
    assert.equal(await submissionCount(u.id), 0);
  });
});

/* ───────────────────────────── A1 / A2 · activities ───────────────────────────── */

describe('A1 / A2 — activity discovery', () => {
  test('no goal: an empty catalogue that says why', async () => {
    const u = await graduate(null);
    const d = ok(await http.get('/v1/me/activities').set(auth(u))).body.data;
    assert.equal(d.unavailableReason, 'no_career_goal'); assert.deepEqual(d.items, []);
  });

  test('the demo role\'s catalogue: the demo activity, labelled, formative only (it cannot support a level); learner fields only', async () => {
    const u = await graduate();
    const d = ok(await http.get('/v1/me/activities').set(auth(u))).body.data;
    const a = d.items.find((i: { id: string }) => i.id === FIXTURE.activitySpecId);
    assert.ok(a, 'the demo activity is listed outside production');
    assert.deepEqual([a.isDemo, a.label], [true, 'DEMO — not reviewed']);
    assert.deepEqual([a.assessment.mode, a.assessment.evaluable, a.assessment.canSupportLevel], ['formative_only', true, false]);
    assert.ok(a.assessment.reasons.some((r: string) => /DEMO/.test(r)));
    assert.deepEqual([a.deliverableCount, a.fileDeliverableCount], [3, 2]);
    assert.ok(a.skills.length >= 1 && a.skills.every((s: { id: string }) => s.id !== draftSkillId));
    for (const item of d.items) assert.equal(item.assessment.mode === 'automated_verified', false, 'automated_verified is never returned');
    const listed = (await pool.query(`select status::text as s, target_role_id from activity_spec where id = any($1::uuid[])`, [d.items.map((i: { id: string }) => i.id)])).rows;
    assert.ok(listed.every((r) => r.s === 'published' && r.target_role_id === FIXTURE.roleId), 'only published activities bound to this role');
    assert.ok(!PRIVATE.test(JSON.stringify(d)), JSON.stringify(d).match(PRIVATE)?.[0]);
  });

  test('the pack role\'s catalogue: the SME-approved, non-demo copy is human_reviewed; drafts are absent', async () => {
    const u = await graduate(packRoleId);
    const d = ok(await http.get('/v1/me/activities').set(auth(u))).body.data;
    const a = d.items.find((i: { id: string }) => i.id === reviewedActivityId);
    assert.ok(a, 'the reviewed copy is listed');
    assert.deepEqual([a.isDemo, a.assessment.mode, a.assessment.canSupportLevel, a.assessment.reasons], [false, 'human_reviewed', true, []]);
    const drafts = (await pool.query(`select id from activity_spec where target_role_id = $1 and status <> 'published'`, [packRoleId])).rows.map((r) => r.id);
    assert.ok(drafts.every((x) => !d.items.some((i: { id: string }) => i.id === x)), 'no draft activity is listed');
    assert.ok(!d.items.some((i: { id: string }) => i.id === FIXTURE.activitySpecId), 'another role\'s activity is not listed');
  });

  test('detail: brief, deliverables (file/text), inputs with planted-issue descriptions withheld; no assessment design, rubric or reviewer data', async () => {
    const u = await graduate(packRoleId);
    const d = ok(await http.get(`/v1/me/activities/${reviewedActivityId}`).set(auth(u))).body.data;
    assert.ok(d.objectiveAr && d.businessContextAr && d.available === true);
    assert.deepEqual(d.deliverables.map((x: { key: string; kind: string }) => `${x.key}:${x.kind}`),
      ['file.index_html:file', 'file.styles_css:file', 'file.app_js:file', 'note.data_flow:text', 'answer.clarification:text']);
    const planted = (await pool.query('select key from activity_input where activity_spec_id = $1 and contains_planted_issue', [reviewedActivityId])).rows.map((r) => r.key);
    assert.ok(planted.length > 0, 'the fixture has a planted-issue input');
    for (const i of d.inputs) {
      if (planted.includes(i.key)) assert.deepEqual([i.descriptionAr, i.descriptionEn, i.descriptionWithheld], [null, null, true], i.key);
      else assert.ok(i.descriptionEn && i.descriptionWithheld === false, i.key);
    }
    assert.equal(d.materialsAvailable, false, 'no starter materials exist yet (Phase 3); said plainly');
    assert.equal(d.assessment.mode, 'human_reviewed');
    assert.ok(!PRIVATE.test(JSON.stringify(d)), JSON.stringify(d).match(PRIVATE)?.[0]);
    assert.deepEqual(d.myProjects, []);
  });

  test('direct-id access: draft, another role\'s, unknown and malformed ids are all "not found" — and work cannot start on them', async () => {
    const u = await graduate(packRoleId);
    const draft = (await one(`select id from activity_spec where status <> 'published' limit 1`)).id;
    for (const id of [draft, FIXTURE.activitySpecId, '00000000-0000-4000-8000-00000000abcd', 'not-a-uuid']) {
      ok(await http.get(`/v1/me/activities/${id}`).set(auth(u)), 404);
      ok(await http.post('/v1/projects').set(auth(u)).send({ title: 'x', kind: 'platform_activity', activitySpecId: id }), 404);
    }
    assert.equal(await n('select count(*)::int n from project where user_id = $1', [u.id]), 0);
  });

  test('own history stays readable after the goal changes, but cannot be restarted', async () => {
    const u = await graduate(); const pid = await demoProject(u);
    ok(await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: packRoleId, confirmed: true }));
    const d = ok(await http.get(`/v1/me/activities/${FIXTURE.activitySpecId}`).set(auth(u))).body.data;
    assert.equal(d.available, false); assert.deepEqual(d.myProjects.map((p: { id: string }) => p.id), [pid]);
    ok(await http.post('/v1/projects').set(auth(u)).send({ title: 'again', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }), 404);
  });

  test('where demo content is hidden (production-like), demo roles, activities and goals are unavailable; history stays the user\'s own', async () => {
    const u = await graduate(); const pid = await demoProject(u);
    await setDemoVisible(false);
    try {
      const v = await graduate(null);
      const roles = ok(await http.get('/v1/target-roles').set(auth(v))).body.data as { isDemo: boolean; id: string }[];
      assert.ok(roles.every((r) => !r.isDemo), 'no demo role is offered');
      assert.ok(roles.some((r) => r.id === publishedRoleId), 'published content still is');
      ok(await http.put('/v1/me/career-goal').set(auth(v)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }), 404);
      const list = ok(await http.get('/v1/me/activities').set(auth(u))).body.data;
      assert.deepEqual([list.unavailableReason, list.items.length], ['role_unavailable', 0]);
      ok(await http.post('/v1/projects').set(auth(u)).send({ title: 'x', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }), 404);
      const goal = ok(await http.get('/v1/me/career-goal').set(auth(u))).body.data;
      assert.deepEqual([goal.targetRoleId, goal.roleAvailable], [FIXTURE.roleId, false], 'the goal is still the user\'s, marked unavailable');
      assert.ok(ok(await http.get('/v1/projects').set(auth(u))).body.data.items.some((p: { id: string }) => p.id === pid), 'their project is still theirs');
      const c = await pool.connect();
      try { assert.deepEqual(await demoVisibilityProductionOffenders(c), []); } finally { c.release(); }
    } finally { await setDemoVisible(true); }
    const c = await pool.connect();
    try { assert.equal((await demoVisibilityProductionOffenders(c)).length, 1, 'production refuses to start with demo content visible'); } finally { c.release(); }
    assert.ok(await n(`select count(*)::int n from config_change where entity_table = 'platform_deployment' and actor = 'e2e graduate-activity'`) >= 2, 'every change of the flag is audited');
  });
});

/* ─────────────────────── direct database access (RLS, column grants) ─────────────────────── */

describe('direct database access: RLS and column grants, as a graduate and as anon', () => {
  test('a graduate cannot read assessment-private columns or rows, even knowing ids', async () => {
    const u = await graduate();
    await asAuthenticatedUser(pool, u.id, async (c) => {
      const denied = async (sql: string, label: string) => {
        await c.query('savepoint s');
        await assert.rejects(() => c.query(sql), /permission denied/, label);
        await c.query('rollback to savepoint s');
      };
      await denied('select * from activity_input', 'activity_input is service-only');
      await denied('select contains_planted_issue from activity_input', 'the planted-issue flag');
      await denied('select spec from activity_spec', 'the raw spec document');
      await denied('select reviewed_by, sme_approved_by from activity_spec', 'reviewer identities');
      await denied('select * from activity_spec', 'no select * on activity_spec');
      await denied('select weight, minimum_evidence_count, human_review_required, demand_ratio from role_requirement', 'readiness / assessment internals');
      await denied('select * from platform_deployment', 'deployment flag');
      await denied('select * from rubric_criterion', 'rubric criteria (unchanged)');
      assert.equal((await c.query('select 1 from integrity_check_spec')).rowCount, 0, 'integrity checks: no client policy, no rows (unchanged)');
      const rows = async (sql: string, p: unknown[] = []) => (await c.query(sql, p)).rowCount;
      assert.equal(await rows('select id from target_role where id = $1', [draftRoleId]), 0, 'a draft role is invisible by id');
      assert.equal(await rows('select id from skill where id = $1', [draftSkillId]), 0, 'a draft skill is invisible by id');
      assert.equal(await rows('select id from role_requirement where target_role_id = $1', [draftRoleId]), 0, 'mappings of a draft role are invisible');
      assert.equal(await rows('select id from role_requirement where id = $1', [draftRequirementOnVisibleRole]), 0, 'an unreviewed mapping is invisible');
      assert.equal(await rows(`select id from activity_spec where status <> 'published'`), 0, 'no draft activity');
      assert.equal(await rows('select id from target_role where id = $1', [publishedRoleId]), 1, 'published content is readable');
      assert.equal(await rows('select id, title_ar, objective_ar from activity_spec where id = $1', [FIXTURE.activitySpecId]), 1, 'learner columns are readable');
      assert.equal(await rows('select key from activity_deliverable where activity_spec_id = $1', [FIXTURE.activitySpecId]), 3);
      await c.query('savepoint s');
      await assert.rejects(() => c.query(`update target_role set review_status = 'published' where id = $1`, [draftRoleId]), /permission denied/);
      await c.query('rollback to savepoint s');
      assert.equal((await c.query('select graduate_role_visible($1) as v', [draftRoleId])).rows[0].v, false, 'the shared rule answers false for a draft role');
    });
  });

  test('anon reads no role, skill, mapping or activity content at all', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin'); await c.query('set local role anon');
      for (const t of ['target_role', 'skill', 'role_requirement', 'learning_resource', 'activity_spec', 'activity_input', 'activity_deliverable', 'activity_skill', 'activity_task']) {
        await c.query('savepoint s');
        await assert.rejects(() => c.query(`select 1 from ${t} limit 1`), /permission denied/, t);
        await c.query('rollback to savepoint s');
      }
    } finally { await c.query('rollback'); await c.query('reset role'); c.release(); }
  });

  test('own history: a user still reads the role of their own goal after demo content is hidden; others\' demo roles are hidden', async () => {
    const u = await graduate();
    await setDemoVisible(false);
    try {
      await asAuthenticatedUser(pool, u.id, async (c) => {
        assert.equal((await c.query('select id from target_role where id = $1', [FIXTURE.roleId])).rowCount, 1, 'their own goal\'s role');
        assert.equal((await c.query('select id from target_role where id = $1', [packRoleId])).rowCount, 0, 'another demo role');
      });
    } finally { await setDemoVisible(true); }
  });

  test('administrators still see the private assessment design, through the admin role model; a graduate cannot', async () => {
    const admin = await graduate(null);
    await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'track_admin', 'e2e operator')`, [admin.id]);
    const content = ok(await http.get('/v1/admin/content').set(auth(admin))).body.data;
    const act = content.activities.find((a: { id: string }) => a.id === reviewedActivityId);
    assert.ok(act.inputs.some((i: { containsPlantedIssue: boolean }) => i.containsPlantedIssue === true));
    const grad = await graduate();
    ok(await http.get('/v1/admin/content').set(auth(grad)), 403);
  });
});

/* ───────────────────────────── A3 · explicit deliverable mapping ───────────────────────────── */

describe('A3 — every file bound to a server-declared deliverable', () => {
  test('the mapping, not the order, decides: files sent in reverse order land on the deliverables they name', async () => {
    const u = await graduate(); const pid = await demoProject(u); const f = await demoUploads(u);
    const sid = ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS,
      files: [{ uploadId: f.test, deliverableKey: 'file.test' }, { uploadId: f.component, deliverableKey: 'file.component' }], aiDisclosure: { declaredUse: [] } }), 201).body.data.id;
    const rows = (await pool.query(`select key, upload_id from submission_artifact where submission_id = $1 and kind = 'file' order by key`, [sid])).rows;
    assert.deepEqual(rows, [{ key: 'file.component', upload_id: f.component }, { key: 'file.test', upload_id: f.test }]);
    const ledger = (await pool.query(`select artifact_key, upload_id from evidence_item where submission_id = $1 and upload_id is not null order by artifact_key`, [sid])).rows;
    assert.deepEqual(ledger, [{ artifact_key: 'file.component', upload_id: f.component }, { artifact_key: 'file.test', upload_id: f.test }], 'the ledger records the same binding');
    assert.equal((await one(`select payload->>'fileMapping' as m from audit_event where subject_id = $1 and event_type = 'submission.created'`, [sid])).m, 'explicit');
  });

  test('refusals are named and store nothing: missing, duplicate, unexpected, mismatched, malformed, positional, ambiguous', async () => {
    const u = await graduate(); const pid = await demoProject(u); const f = await demoUploads(u);
    const send = async (extra: Record<string, unknown>) => ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u))
      .send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, aiDisclosure: { declaredUse: [] }, ...extra }), 400).body.error.message as string;
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ files: [{ uploadId: f.component, deliverableKey: 'file.component' }] }, /\[missing_mandatory_deliverable\].*file\.test/],
      [{ files: [{ uploadId: f.component, deliverableKey: 'file.component' }, { uploadId: f.test, deliverableKey: 'file.component' }] }, /\[duplicate_deliverable\]/],
      [{ files: [{ uploadId: f.component, deliverableKey: 'file.component' }, { uploadId: f.component, deliverableKey: 'file.test' }] }, /\[duplicate_upload\]/],
      [{ files: [{ uploadId: f.component, deliverableKey: 'file.component' }, { uploadId: f.test, deliverableKey: 'file.made_up' }] }, /\[unexpected_deliverable\]/],
      [{ files: [{ uploadId: f.component, deliverableKey: 'file.component' }, { uploadId: f.test, deliverableKey: 'note.coverage' }] }, /\[deliverable_format_mismatch\]/],
      [{ files: [{ uploadId: f.component, deliverableKey: 'file.component' }, { uploadId: f.test, deliverableKey: 'file.index_html' }] }, /\[unexpected_deliverable\]/], // another activity's deliverable
      [{ files: [{ uploadId: f.component }, { deliverableKey: 'file.test' }] }, /\[malformed_file_mapping\]/],
      [{ files: 'file.component' }, /\[malformed_file_mapping\]/],
      [{ uploadIds: [f.component, f.test] }, /\[deliverable_mapping_required\]/],
      [{ uploadIds: [f.component], files: [{ uploadId: f.test, deliverableKey: 'file.test' }] }, /\[ambiguous_file_mapping\]/],
      [{ files: [], artifacts: [] }, /no evidence artifacts/],
    ];
    for (const [extra, re] of cases) assert.match(await send(extra), re, JSON.stringify(extra));
    assert.equal(await submissionCount(u.id), 0, 'nothing was stored by any refusal');
  });

  test('forged mappings: another user\'s upload, an unconfirmed upload, a client file.* value — refused, nothing stored', async () => {
    const owner = await graduate(); const theirs = await uploadFile(app, http, owner, 'HabitList.jsx', COMPONENT_BYTES);
    const u = await graduate(); const pid = await demoProject(u); const f = await demoUploads(u);
    const base = { skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, aiDisclosure: { declaredUse: [] } };
    ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ ...base, files: filesFor([theirs, f.test]) }), 404);
    const pending = ok(await http.post('/v1/uploads').set(auth(u)).send({ declaredName: 'x.jsx', contentType: 'text/plain', declaredSize: 10 }), 201).body.data.uploadId;
    assert.match(JSON.stringify(ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ ...base, files: filesFor([pending, f.test]) }), 400).body), /not confirmed/);
    ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ ...base, artifacts: [...COMPLETE_ARTIFACTS, { key: 'file.component', kind: 'boolean', valueBool: true }], files: filesFor([f.component, f.test]) }), 400);
    assert.equal(await submissionCount(u.id), 0);
  });

  test('a personal project (no declared file deliverable) keeps the legacy form; an explicit mapping there names nothing', async () => {
    const u = await graduate();
    const pid = ok(await http.post('/v1/projects').set(auth(u)).send({ title: 'مشروعي', kind: 'personal_project' }), 201).body.data.id;
    const f = await demoUploads(u);
    assert.match(JSON.stringify(ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: [], files: filesFor([f.component]), aiDisclosure: { declaredUse: [] } }), 400).body), /no_file_deliverables/);
    const sid = ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: [], uploadIds: [f.component], aiDisclosure: { declaredUse: [] } }), 201).body.data.id;
    assert.equal((await one(`select key from submission_artifact where submission_id = $1 and kind = 'file'`, [sid])).key, 'file.component');
  });
});

/* ───────────────────────────── A5 · work status and evaluation revisit ───────────────────────────── */

describe('A5 — work status from records; evaluation revisit is a read', () => {
  test('a submission\'s life: in_progress → submitted → pending_validation; revisits never rerun; D-118 grants nothing', async () => {
    const u = await graduate(); const pid = await demoProject(u);
    const status = async () => ok(await http.get('/v1/projects').set(auth(u))).body.data.items.find((p: { id: string }) => p.id === pid);
    let p = await status();
    assert.deepEqual([p.workStatus, p.attempts, p.latestSubmission], ['in_progress', 0, null]);
    assert.ok(p.activity_spec_version && p.created_at, 'the pre-Phase-1 fields are still there');
    assert.equal(p.activity.titleAr, (await one('select title_ar from activity_spec where id = $1', [FIXTURE.activitySpecId])).title_ar);
    const f = await demoUploads(u);
    const sid = ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, files: filesFor([f.component, f.test]), aiDisclosure: { declaredUse: [] } }), 201).body.data.id;
    p = await status(); assert.deepEqual([p.workStatus, p.attempts], ['submitted', 1]);

    const before = ok(await http.get(`/v1/submissions/${sid}/evaluation`).set(auth(u))).body.data;
    assert.deepEqual([before.state, before.workStatus, before.actions.evaluate, before.evaluationId], ['not_evaluated', 'submitted', true, null]);
    assert.equal(await n('select count(*)::int n from evaluation where submission_id = $1', [sid]), 0, 'reading created nothing');

    const run = ok(await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u)), 201).body.data;
    assert.deepEqual([run.alreadyEvaluated, run.workStatus, run.verification.decision], [false, 'pending_validation', 'assessment_pending_validation']);
    const agentsAfterFirst = await n('select count(*)::int n from agent_invocation where user_id = $1', [u.id]);
    const auditAfterFirst = await n(`select count(*)::int n from audit_event where user_id = $1 and event_type like 'evaluation.%'`, [u.id]);

    for (let i = 0; i < 3; i++) {
      const g = ok(await http.get(`/v1/submissions/${sid}/evaluation`).set(auth(u))).body.data;
      assert.deepEqual([g.resultId, g.workStatus, g.verification.decision, g.verificationDecision.decision, g.transition], [run.resultId, 'pending_validation', 'assessment_pending_validation', 'assessment_pending_validation', null]);
      assert.deepEqual([g.totalScore, g.maxScore], [run.totalScore, run.maxScore], 'a reopened evaluation renders like the fresh one');
      assert.equal(g.reason, run.reason);
      const again = ok(await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u))).body.data;
      assert.deepEqual([again.alreadyEvaluated, again.resultId], [true, run.resultId]);
    }
    assert.equal(await n('select count(*)::int n from evaluation where submission_id = $1', [sid]), 1, 'one run, ever');
    assert.equal(await n('select count(*)::int n from evaluation_result where submission_id = $1', [sid]), 1);
    assert.equal(await n('select count(*)::int n from agent_invocation where user_id = $1', [u.id]), agentsAfterFirst, 'no agent ran again');
    assert.equal(await n(`select count(*)::int n from audit_event where user_id = $1 and event_type like 'evaluation.%'`, [u.id]), auditAfterFirst);
    p = await status(); assert.deepEqual([p.workStatus, p.latestSubmission.decision, p.latestSubmission.levelChanged], ['pending_validation', 'assessment_pending_validation', false]);
    assert.deepEqual((await pool.query('select state from skill_claim where user_id = $1', [u.id])).rows, [], 'D-118: no level');
  });

  test('a pending human review reads as pending — never an error — and a repeat request changes nothing', async () => {
    const u = await graduate(packRoleId);
    const pid = ok(await http.post('/v1/projects').set(auth(u)).send({ title: 'طلب إجازة', kind: 'platform_activity', activitySpecId: reviewedActivityId }), 201).body.data.id;
    const ups = [await uploadFile(app, http, u, 'index.html', COMPONENT_BYTES, 'text/plain'), await uploadFile(app, http, u, 'styles.css', TEST_BYTES, 'text/plain'), await uploadFile(app, http, u, 'app.js', TEST_BYTES)];
    // Sent in an arbitrary order: the keys decide.
    const sid = ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [reviewedSkillId], aiDisclosure: { declaredUse: [] },
      files: [{ uploadId: ups[2], deliverableKey: B[2] }, { uploadId: ups[0], deliverableKey: B[0] }, { uploadId: ups[1], deliverableKey: B[1] }],
      artifacts: [{ key: 'note.data_flow', kind: 'text', valueText: 'State lives in one object; the list re-renders from it; loading, error and empty are explicit.', locator: 'notes.md' },
        { key: 'answer.clarification', kind: 'text', valueText: 'The brief and the spec disagree on the field count; I followed the brief and flagged it.', locator: 'notes.md' }] }), 201).body.data.id;
    const ev = ok(await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u)), 201).body.data;
    assert.deepEqual([ev.outcome, ev.workStatus], ['needs_human_review', 'under_human_review']);
    const g = ok(await http.get(`/v1/submissions/${sid}/evaluation`).set(auth(u))).body.data;
    assert.deepEqual([g.state, g.workStatus, g.humanReview.pending, g.humanReview.pendingCriteria.length], ['queued_for_human', 'under_human_review', 7, 7]);
    assert.ok(!JSON.stringify(g).match(/minutes|دقائق|فشل/), 'no invented time, no "failed"');
    const again = ok(await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u))).body.data;
    assert.deepEqual([again.alreadyEvaluated, again.state, again.workStatus], [true, 'queued_for_human', 'under_human_review']);
    assert.equal(await n('select count(*)::int n from evaluation where submission_id = $1', [sid]), 1);
    assert.equal(await n('select count(*)::int n from review_queue_item where submission_id = $1', [sid]), 7, 'no duplicate review work');
    const p = ok(await http.get('/v1/projects').set(auth(u))).body.data.items.find((x: { id: string }) => x.id === pid);
    assert.equal(p.workStatus, 'under_human_review');
    assert.deepEqual((await pool.query('select state from skill_claim where user_id = $1', [u.id])).rows, [], 'nothing before a reviewer decides');
  });

  test('concurrent evaluate requests create exactly one run', async () => {
    const u = await graduate(); const pid = await demoProject(u); const f = await demoUploads(u);
    const sid = ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, files: filesFor([f.component, f.test]), aiDisclosure: { declaredUse: [] } }), 201).body.data.id;
    const codes = (await Promise.all([1, 2, 3].map(() => http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u))))).map((r) => r.status);
    assert.equal(codes.filter((c) => c === 201).length, 1, JSON.stringify(codes));
    assert.ok(codes.every((c) => [200, 201, 409].includes(c)), JSON.stringify(codes));
    assert.equal(await n('select count(*)::int n from evaluation where submission_id = $1', [sid]), 1);
  });

  test('another user can neither read nor trigger an evaluation', async () => {
    const u = await graduate(); const pid = await demoProject(u); const f = await demoUploads(u);
    const sid = ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, files: filesFor([f.component, f.test]), aiDisclosure: { declaredUse: [] } }), 201).body.data.id;
    const other = await graduate();
    ok(await http.get(`/v1/submissions/${sid}/evaluation`).set(auth(other)), 404);
    ok(await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(other)), 404);
    assert.equal(await n('select count(*)::int n from evaluation where submission_id = $1', [sid]), 0);
    assert.ok(!ok(await http.get('/v1/projects').set(auth(other))).body.data.items.some((p: { id: string }) => p.id === pid));
  });
});

/* ───────────────────────────── historical compatibility ───────────────────────────── */

describe('historical compatibility', () => {
  test('a submission stored before Phase 1 without a file still evaluates (blocked by checks) and reads back as such', async () => {
    const u = await graduate(); const pid = await demoProject(u); const f = await demoUploads(u);
    const sid = ok(await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, files: filesFor([f.component, f.test]), aiDisclosure: { declaredUse: [] } }), 201).body.data.id;
    await asHistoricalWithoutFile(pool, sid, 'file.test');
    const ev = ok(await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u)), 201).body.data;
    assert.equal(ev.outcome, 'blocked_by_checks');
    const g = ok(await http.get(`/v1/submissions/${sid}/evaluation`).set(auth(u))).body.data;
    assert.deepEqual([g.outcome, g.workStatus], ['blocked_by_checks', 'blocked_by_checks']);
    assert.ok(g.integrityChecks.some((i: { key: string; passed: boolean; message: string | null }) => i.key === 'files_present' && !i.passed && i.message), 'the user-facing message names what is missing');
  });

  test('records written before this suite are byte-for-byte unchanged', async () => {
    assert.equal((await pool.query(HISTORY_SQL, [cutoff])).rows[0].h, historyBefore);
  });
});
