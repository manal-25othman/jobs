/**
 * ENG-1 P0 — integrity of the legacy single-skill evaluation path.
 *
 * Runs under the test-only legacy-compatibility policy (legacy_any_pass), i.e. the policy under which a passing
 * run WOULD promote. That is what makes these proofs meaningful: when P0 refuses to attribute a result, nothing
 * else stands between the run and a level, and still no level moves.
 *
 *   F-9   a claimed skill no rubric criterion measures is never promoted
 *   F-1/2 the promoted skill is chosen by an explicit mapping, never by claim / row / uuid order
 *   —     several qualifying skills ⇒ fail closed (initial evaluation AND human-review finalisation)
 *   F-8   evaluation is pinned to the rubric bound to the submission's activity version; ambiguity ⇒ refused
 *   —     a legacy (pre-0025) unbound rubric is accepted only when nothing is ambiguous
 *   —     the binding is immutable; legacy rows are never re-bound by an ordinary update
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, filesFor, type TestUser } from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const SEED_ACT = FIXTURE.activitySpecId; const SEED_RUBRIC = 'd0000000-0000-4000-8000-000000000001';
const SKILL = FIXTURE.skillUiTesting; const SECONDARY = 'a0000000-0000-4000-8000-000000000003';
const tag = () => Math.random().toString(16).slice(2, 10);

before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });

async function bootstrapped(): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  return u;
}
async function project(user: TestUser, activityId: string): Promise<string> {
  return (await http.post('/v1/projects').set(auth(user)).send({ title: 'ENG-1 P0', kind: 'platform_activity', activitySpecId: activityId }).expect(201)).body.data.id as string;
}
async function submit(user: TestUser, pid: string, skillIds: string[]): Promise<string> {
  const uploads = [await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES), await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES)];
  return (await http.post(`/v1/projects/${pid}/submissions`).set(auth(user))
    .send({ skillIds, artifacts: COMPLETE_ARTIFACTS, files: filesFor(uploads), aiDisclosure: { declaredUse: [] } }).expect(201)).body.data.id as string;
}
async function levelFacts(userId: string, resultId: string) {
  const ev = (await pool.query('select skill_id from evidence where evaluation_result_id = $1', [resultId])).rows.map((r) => r.skill_id as string);
  const tr = (await pool.query('select count(*)::int n from evidence_transition where evaluation_result_id = $1', [resultId])).rows[0].n as number;
  const ver = (await pool.query('select count(*)::int n from verification where evaluation_result_id = $1', [resultId])).rows[0].n as number;
  const dec = (await pool.query('select skill_id, decision, reason from verification_decision where evaluation_result_id = $1 order by skill_id', [resultId])).rows as { skill_id: string; decision: string; reason: string }[];
  const claims = (await pool.query('select skill_id, state::text from skill_claim where user_id = $1 order by skill_id', [userId])).rows as { skill_id: string; state: string }[];
  return { evidenceSkills: ev, transitions: tr, verifications: ver, decisions: dec, claims };
}

/**
 * A fresh DEMO copy of the seed activity (same deliverables, checks and criteria), with a chosen skill mapping.
 * `legacyUnbound` publishes the rubric with the 0025 binding trigger disabled, reproducing a pre-0025 row.
 */
async function cloneActivity(opts: { bothPrimary: boolean; secondaryCovered: boolean; humanKeys?: string[]; legacyUnbound?: boolean }): Promise<{ activityId: string; rubricId: string }> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const t = tag();
    const activityId = (await c.query(`insert into activity_spec select (jsonb_populate_record(null::activity_spec, to_jsonb(a) || jsonb_build_object(
        'id', gen_random_uuid(), 'slug', 'e2e-eng1-' || $2::text, 'version', '1.0.0', 'published_at', now(), 'created_at', now(), 'updated_at', now()))).*
      from activity_spec a where a.id = $1 returning id`, [SEED_ACT, t])).rows[0].id as string;
    await c.query(`insert into activity_deliverable select (jsonb_populate_record(null::activity_deliverable, to_jsonb(d) || jsonb_build_object('id', gen_random_uuid(), 'activity_spec_id', $2::uuid))).*
      from activity_deliverable d where d.activity_spec_id = $1`, [SEED_ACT, activityId]);
    await c.query(`insert into integrity_check_spec select (jsonb_populate_record(null::integrity_check_spec, to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(), 'activity_spec_id', $2::uuid))).*
      from integrity_check_spec i where i.activity_spec_id = $1`, [SEED_ACT, activityId]);
    await c.query(`insert into activity_skill (activity_spec_id, skill_id, depth) values ($1, $2, 'primary'), ($1, $3, $4::skill_involvement)`,
      [activityId, SKILL, SECONDARY, opts.bothPrimary ? 'primary' : 'secondary']);
    const rubricId = await addRubric(c, activityId, `rub_e2e_${t}@1`, opts);
    await c.query('commit');
    return { activityId, rubricId };
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

/** A copy of the seed rubric for `activityId`, published (binding as the trigger decides, or unbound when legacyUnbound). */
async function addRubric(c: { query: Pool['query'] }, activityId: string, version: string, opts: { secondaryCovered: boolean; humanKeys?: string[]; legacyUnbound?: boolean }): Promise<string> {
  const rubricId = (await c.query(`insert into rubric_version select (jsonb_populate_record(null::rubric_version, to_jsonb(r) || jsonb_build_object(
      'id', gen_random_uuid(), 'activity_spec_id', $2::uuid, 'version', $3::text, 'status', 'curated', 'created_at', now(), 'activity_spec_version', null))).*
    from rubric_version r where r.id = $1 returning id`, [SEED_RUBRIC, activityId, version])).rows[0].id as string;
  await c.query(`insert into rubric_criterion select (jsonb_populate_record(null::rubric_criterion, to_jsonb(rc) || jsonb_build_object('id', gen_random_uuid(), 'rubric_version_id', $2::uuid))).*
    from rubric_criterion rc where rc.rubric_version_id = $1`, [SEED_RUBRIC, rubricId]);
  if (opts.secondaryCovered) {
    await c.query(`insert into rubric_criterion select (jsonb_populate_record(null::rubric_criterion, to_jsonb(rc) || jsonb_build_object(
        'id', gen_random_uuid(), 'rubric_version_id', $2::uuid, 'key', 'secondary_note', 'position', 10, 'linked_skill_id', $3::uuid))).*
      from rubric_criterion rc where rc.rubric_version_id = $1 and rc.key = 'coverage_note'`, [SEED_RUBRIC, rubricId, SECONDARY]);
  }
  for (const k of opts.humanKeys ?? []) await c.query(`update rubric_criterion set evaluator_type = 'human', human_review_required = true, check_type = 'none', check_artifact_key = null, check_min_length = null where rubric_version_id = $1 and key = $2`, [rubricId, k]);
  await c.query(`insert into rubric_criterion_level (criterion_id, level_key, score, descriptor_ar, descriptor_en, observable_evidence_en)
    select nc.id, l.level_key, l.score, l.descriptor_ar, l.descriptor_en, l.observable_evidence_en
      from rubric_criterion_level l join rubric_criterion oc on oc.id = l.criterion_id
      join rubric_criterion nc on nc.rubric_version_id = $2 and (nc.key = oc.key or (nc.key = 'secondary_note' and oc.key = 'coverage_note'))
     where oc.rubric_version_id = $1`, [SEED_RUBRIC, rubricId]);
  if (opts.legacyUnbound) await c.query('alter table rubric_version disable trigger rubric_version_bind_activity_version_trg');
  await c.query(`update rubric_version set status = 'published' where id = $1`, [rubricId]);
  if (opts.legacyUnbound) await c.query('alter table rubric_version enable trigger rubric_version_bind_activity_version_trg');
  return rubricId;
}

async function evaluate(user: TestUser, sid: string) {
  return (await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201)).body.data as { resultId: string; outcome: string; evaluationId: string; transition: unknown };
}

describe('ENG-1 P0 — a skill the rubric does not measure is never promoted (F-9)', () => {
  test('claiming only a skill no criterion measures: the run passes, nothing is promoted, a not_applicable decision says why', async () => {
    const u = await bootstrapped();
    const sid = await submit(u, await project(u, SEED_ACT), [SECONDARY]);
    const ev = await evaluate(u, sid);
    assert.equal(ev.outcome, 'passed', 'the work itself met every criterion');
    assert.equal(ev.transition, null);
    const f = await levelFacts(u.id, ev.resultId);
    assert.deepEqual(f.evidenceSkills, []); assert.equal(f.transitions, 0); assert.equal(f.verifications, 0);
    assert.deepEqual(f.decisions.map((d) => [d.skill_id, d.decision]), [[SECONDARY, 'not_applicable']]);
    assert.match(f.decisions[0]!.reason, /no claimed skill is both declared primary by the activity and measured/);
    assert.ok(!f.claims.some((x) => x.state === 'demonstrated'), 'no Demonstrated anywhere');
    const audit = (await pool.query(`select payload from audit_event where subject_table = 'evaluation_result' and subject_id = $1`, [ev.resultId])).rows[0].payload;
    assert.deepEqual(audit.attribution, { unattributed: 'no_candidate', candidates: [] });
  });
});

describe('ENG-1 P0 — the promoted skill comes from the explicit mapping, never from claim order (F-1/F-2)', () => {
  test('[secondary, primary] and [primary, secondary] promote the same skill, the measured primary one, and only it', async () => {
    for (const order of [[SECONDARY, SKILL], [SKILL, SECONDARY]]) {
      const u = await bootstrapped();
      const ev = await evaluate(u, await submit(u, await project(u, SEED_ACT), order));
      const f = await levelFacts(u.id, ev.resultId);
      assert.deepEqual(f.decisions.map((d) => [d.skill_id, d.decision]), [[SKILL, 'accepted']], `order ${order.join(',')}`);
      assert.deepEqual(f.evidenceSkills, [SKILL]); assert.equal(f.transitions, 1); assert.equal(f.verifications, 1);
      assert.equal(f.claims.find((x) => x.skill_id === SKILL)?.state, 'demonstrated');
      assert.notEqual(f.claims.find((x) => x.skill_id === SECONDARY)?.state, 'demonstrated');
    }
  });
});

describe('ENG-1 P0 — several qualifying skills ⇒ fail closed', () => {
  let act: { activityId: string; rubricId: string };
  before(async () => { act = await cloneActivity({ bothPrimary: true, secondaryCovered: true }); });
  test('two claimed skills that are both primary and measured: the run passes, no level moves, each gets a not_applicable decision', async () => {
    const u = await bootstrapped();
    const ev = await evaluate(u, await submit(u, await project(u, act.activityId), [SKILL, SECONDARY]));
    assert.equal(ev.outcome, 'passed'); assert.equal(ev.transition, null);
    const f = await levelFacts(u.id, ev.resultId);
    assert.deepEqual(f.evidenceSkills, []); assert.equal(f.transitions, 0); assert.equal(f.verifications, 0);
    assert.deepEqual(f.decisions.map((d) => [d.skill_id, d.decision]).sort(), [[SKILL, 'not_applicable'], [SECONDARY, 'not_applicable']].sort());
    for (const d of f.decisions) assert.match(d.reason, /cannot be attributed/);
    assert.ok(!f.claims.some((x) => x.state === 'demonstrated'));
  });
  test('control: the same activity with ONE qualifying claimed skill promotes it', async () => {
    const u = await bootstrapped();
    const ev = await evaluate(u, await submit(u, await project(u, act.activityId), [SECONDARY]));
    const f = await levelFacts(u.id, ev.resultId);
    assert.deepEqual(f.evidenceSkills, [SECONDARY]); assert.deepEqual(f.decisions.map((d) => d.decision), ['accepted']);
  });
});

describe('ENG-1 P0 — human-review finalisation uses the same explicit attribution (no `limit 1`)', () => {
  test('ambiguous claims, every human criterion met by a named reviewer: finalised as passed, still no level moves', async () => {
    const act = await cloneActivity({ bothPrimary: true, secondaryCovered: true, humanKeys: ['empty_state_test'] });
    const u = await bootstrapped();
    const sid = await submit(u, await project(u, act.activityId), [SECONDARY, SKILL]);
    const ev = await evaluate(u, sid);
    assert.equal(ev.outcome, 'needs_human_review');
    const reviewer = await newUser(); await http.post('/v1/me/bootstrap').set(auth(reviewer)).send({}).expect(201);
    await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'human_reviewer', 'e2e operator')`, [reviewer.id]);
    const items = (await pool.query('select id from review_queue_item where evaluation_id = $1', [ev.evaluationId])).rows;
    assert.equal(items.length, 1);
    await http.post(`/v1/review/queue/${items[0].id}/assign`).set(auth(reviewer)).send({}).expect(201);
    await http.get(`/v1/review/items/${items[0].id}`).set(auth(reviewer)).expect(200);
    await http.post(`/v1/review/items/${items[0].id}/decision`).set(auth(reviewer)).send({ levelKey: 'met', rationale: 'The empty-state test asserts the empty message.' }).expect(201);
    const final = (await pool.query(`select id, outcome from evaluation_result where evaluation_id = $1 and supersedes_result_id is not null`, [ev.evaluationId])).rows[0];
    assert.equal(final.outcome, 'passed');
    const f = await levelFacts(u.id, final.id);
    assert.deepEqual(f.evidenceSkills, []); assert.equal(f.transitions, 0); assert.equal(f.verifications, 0);
    assert.deepEqual(f.decisions.map((d) => d.decision), ['not_applicable', 'not_applicable']);
    assert.ok(!f.claims.some((x) => x.state === 'demonstrated'));
  });
});

describe('ENG-1 P0 — evaluation is pinned to the rubric bound to the submission\'s activity version (F-8)', () => {
  test('publication binds the rubric to the activity version; an older submission keeps its rubric after the activity moves on', async () => {
    const act = await cloneActivity({ bothPrimary: false, secondaryCovered: false });
    assert.equal((await pool.query('select activity_spec_version from rubric_version where id = $1', [act.rubricId])).rows[0].activity_spec_version, '1.0.0');
    const u1 = await bootstrapped();
    const s1 = await submit(u1, await project(u1, act.activityId), [SKILL]);
    // The activity moves to 1.1.0 and a new rubric version is published for it.
    await pool.query(`update activity_spec set version = '1.1.0' where id = $1`, [act.activityId]);
    const c = await pool.connect();
    let r2 = '';
    try { await c.query('begin'); r2 = await addRubric(c, act.activityId, `rub_e2e_${tag()}@2`, { secondaryCovered: false }); await c.query('commit'); }
    catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
    assert.equal((await pool.query('select activity_spec_version from rubric_version where id = $1', [r2])).rows[0].activity_spec_version, '1.1.0');
    const ev1 = await evaluate(u1, s1);
    assert.equal((await pool.query('select rubric_version_id from evaluation_result where id = $1', [ev1.resultId])).rows[0].rubric_version_id, act.rubricId, 'the 1.0.0 submission is assessed by the 1.0.0 rubric, not the latest');
    const u2 = await bootstrapped();
    const ev2 = await evaluate(u2, await submit(u2, await project(u2, act.activityId), [SKILL]));
    assert.equal((await pool.query('select rubric_version_id from evaluation_result where id = $1', [ev2.resultId])).rows[0].rubric_version_id, r2);
  });
  test('two published rubrics bound to the same activity version ⇒ refused before anything is written', async () => {
    const act = await cloneActivity({ bothPrimary: false, secondaryCovered: false });
    const c = await pool.connect();
    try { await c.query('begin'); await addRubric(c, act.activityId, `rub_e2e_${tag()}@1b`, { secondaryCovered: false }); await c.query('commit'); }
    catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
    const u = await bootstrapped();
    const sid = await submit(u, await project(u, act.activityId), [SKILL]);
    const res = await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u));
    assert.equal(res.status, 400); assert.match(JSON.stringify(res.body), /rubric_version_unresolved/);
    assert.equal((await pool.query('select count(*)::int n from evaluation where submission_id = $1', [sid])).rows[0].n, 0, 'no evaluation row');
    assert.equal((await pool.query('select count(*)::int n from evidence where user_id = $1', [u.id])).rows[0].n, 0);
  });
});

describe('ENG-1 P0 — a legacy (pre-0025) unbound rubric', () => {
  test('accepted while unambiguous (one published, submission on the current activity version); refused once the activity moved on', async () => {
    const act = await cloneActivity({ bothPrimary: false, secondaryCovered: false, legacyUnbound: true });
    assert.equal((await pool.query('select activity_spec_version from rubric_version where id = $1', [act.rubricId])).rows[0].activity_spec_version, null);
    const u = await bootstrapped();
    const ev = await evaluate(u, await submit(u, await project(u, act.activityId), [SKILL]));
    const audit = (await pool.query(`select payload from audit_event where subject_table = 'evaluation_result' and subject_id = $1`, [ev.resultId])).rows[0].payload;
    assert.equal(audit.rubricResolution, 'legacy_unbound_single');
    const u2 = await bootstrapped();
    const old = await submit(u2, await project(u2, act.activityId), [SKILL]);
    await pool.query(`update activity_spec set version = '2.0.0' where id = $1`, [act.activityId]);
    const res = await http.post(`/v1/submissions/${old}/evaluate`).set(auth(u2));
    assert.equal(res.status, 400); assert.match(JSON.stringify(res.body), /rubric_version_unresolved/);
  });
  test('the binding is immutable, and an ordinary update never binds a legacy row', async () => {
    const bound = await cloneActivity({ bothPrimary: false, secondaryCovered: false });
    await assert.rejects(() => pool.query(`update rubric_version set activity_spec_version = '9.9.9' where id = $1`, [bound.rubricId]), /immutable/);
    const legacy = await cloneActivity({ bothPrimary: false, secondaryCovered: false, legacyUnbound: true });
    await pool.query(`update rubric_version set scoring_policy_version = coalesce(scoring_policy_version, 'x') where id = $1`, [legacy.rubricId]);
    assert.equal((await pool.query('select activity_spec_version from rubric_version where id = $1', [legacy.rubricId])).rows[0].activity_spec_version, null);
  });
});

describe('O-1 — the read view tells the graduate how the result was attributed (no level is inferred)', () => {
  const view = async (u: TestUser, sid: string) => (await http.get(`/v1/submissions/${sid}/evaluation`).set(auth(u)).expect(200)).body.data as { levelAttribution: string | null; workStatus: string; transition: unknown };
  test('attributed / ambiguous / no_candidate are reported exactly; only the attributed one records a level', async () => {
    const act = await cloneActivity({ bothPrimary: true, secondaryCovered: true });
    const cases: [string, string, string[], string][] = [
      ['attributed', SEED_ACT, [SKILL], 'level_recorded'],
      ['ambiguous', act.activityId, [SKILL, SECONDARY], 'feedback_ready'],
      ['no_candidate', SEED_ACT, [SECONDARY], 'feedback_ready'],
    ];
    for (const [expected, activity, skills, status] of cases) {
      const u = await bootstrapped();
      const sid = await submit(u, await project(u, activity), skills);
      await evaluate(u, sid);
      const v = await view(u, sid);
      assert.equal(v.levelAttribution, expected); assert.equal(v.workStatus, status, expected);
      assert.equal(v.transition === null, expected !== 'attributed');
    }
  });
  test('a submission not yet evaluated reports no attribution', async () => {
    const u = await bootstrapped();
    const sid = await submit(u, await project(u, SEED_ACT), [SKILL]);
    assert.equal((await view(u, sid)).levelAttribution, null);
  });
});
