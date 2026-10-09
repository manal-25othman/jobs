/**
 * Phase 2 — Skill Status Model.
 *
 * Proves: the journey and the verification level are two dimensions that
 * move independently; events move the journey through DATA rules (all DRAFT);
 * no journey event ever touches skill_claim; the event log is append-only and
 * explains non-moves; RLS keeps the journey private and read-only for users.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import {
  bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, INCOMPLETE_ARTIFACTS, uploadFile, expectRejected, asAuthenticatedUser,
  COMPONENT_BYTES, TEST_BYTES, type TestUser, filesFor } from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const SKILL = FIXTURE.skillUiTesting;
const SECONDARY = 'a0000000-0000-4000-8000-000000000003';

async function bootstrapped(): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  return u;
}
async function project(user: TestUser) {
  return (await http.post('/v1/projects').set(auth(user)).send({ title: 'متتبّع عادات', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id as string;
}
async function submit(user: TestUser, projectId: string, artifacts = COMPLETE_ARTIFACTS) {
  const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES);
  const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
  return (await http.post(`/v1/projects/${projectId}/submissions`).set(auth(user))
    .send({ skillIds: [SKILL], artifacts, files: filesFor([u1, u2]), aiDisclosure: { declaredUse: [] } }).expect(201)).body.data.id as string;
}
type Row = { skillId: string; progress: { state: string; stateReviewStatus: string }; verification: { state: string } | null; verificationEffectOfProgress: string };
async function journey(user: TestUser): Promise<{ items: Row[]; engine: { active: boolean; reason: string | null } }> {
  const r = await http.get('/v1/me/skill-progress').set(auth(user)).expect(200);
  return r.body.data;
}
const of = (j: { items: Row[] }, skillId: string) => j.items.find((i) => i.skillId === skillId);
async function claimOf(user: TestUser, skillId: string) {
  const r = await http.get('/v1/me/skills').set(auth(user)).expect(200);
  return r.body.data.items.find((s: { skillId: string }) => s.skillId === skillId) as { state: string; evidenceCount: number; progress: { state: string } | null } | undefined;
}

describe('registry — states, triggers and rules are data and DRAFT / NOT VALIDATED', () => {
  test('nothing seeded is validated; the engine runs the draft set outside production and says so', async () => {
    const user = await bootstrapped();
    const r = (await http.get('/v1/skill-progress-rules').set(auth(user)).expect(200)).body.data;
    assert.ok(r.states.length >= 6 && r.rules.length >= 10);
    for (const s of r.states) { assert.equal(s.validated, false); assert.match(s.validationNote, /DRAFT \/ NOT VALIDATED/); }
    for (const t of r.rules) { assert.equal(t.validated, false); assert.equal(t.reviewStatus, 'draft'); }
    assert.ok(r.triggers.some((t: { code: string; active: boolean }) => t.code === 'more_evidence.requested' && t.active === false), 'a trigger without a producer is registered inactive');
    assert.equal(r.engine.active, true); assert.equal(r.engine.production, false); assert.equal(r.engine.validatedRules, 0);
    assert.equal(r.engine.verificationEffect, 'none');
  });

  test('NEGATIVE: a journey state can never carry an evidence-level code; a rule cannot be approved without an approver; the ladder ordering is not reused', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await expectRejected(c, `insert into skill_progress_state (code, label_ar, label_en, description_en) values ('demonstrated','x','x','x')`, [], /not_an_evidence_level|check constraint/);
      await expectRejected(c, `update skill_progress_transition set review_status = 'approved' where enabled limit 1`, [], /syntax|approved_is_recorded|check constraint/);
      await expectRejected(c, `update skill_progress_transition set review_status = 'approved' where id = (select id from skill_progress_transition limit 1)`, [], /approved_is_recorded|check constraint/);
      await expectRejected(c, `insert into skill_progress_state (code, label_ar, label_en, description_en, is_initial) values ('second_start','x','x','x', true)`, [], /one_initial|duplicate key/);
      await c.query('rollback');
    } finally { c.release(); }
  });
});

describe('two dimensions move independently', () => {
  test('project → in_progress with NO claim; submission → submitted with claim practiced; evaluation → evidence_recorded with claim demonstrated', async () => {
    const user = await bootstrapped();
    const pid = await project(user);
    let j = await journey(user);
    assert.equal(of(j, SKILL)?.progress.state, 'in_progress');
    assert.equal(of(j, SECONDARY)?.progress.state, 'in_progress', 'every skill the activity declares starts its journey');
    assert.equal(of(j, SKILL)?.verification, null, 'a journey step creates no claim (activity work ≠ verification)');
    assert.equal((await pool.query('select count(*)::int as n from skill_claim where user_id = $1', [user.id])).rows[0].n, 0);
    assert.equal(await claimOf(user, SKILL), undefined, 'me/skills lists claims only, as before');

    const sid = await submit(user, pid);
    j = await journey(user);
    assert.equal(of(j, SKILL)?.progress.state, 'submitted');
    assert.equal(of(j, SKILL)?.verification?.state, 'practiced');
    assert.equal(of(j, SECONDARY)?.progress.state, 'in_progress', 'the unclaimed secondary skill did not move');
    const claim = await claimOf(user, SKILL);
    assert.equal(claim?.state, 'practiced'); assert.equal(claim?.evidenceCount, 0);
    assert.equal(claim?.progress?.state, 'submitted', 'me/skills carries the journey beside the level (additive)');

    const ev = await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201);
    assert.equal(ev.body.data.outcome, 'passed');
    j = await journey(user);
    assert.equal(of(j, SKILL)?.progress.state, 'evidence_recorded');
    assert.equal(of(j, SKILL)?.verification?.state, 'demonstrated');
    for (const i of j.items) assert.equal(i.verificationEffectOfProgress, 'none');
  });

  test('a failed evaluation → needs_more_evidence while the level stays practiced; a new attempt → submitted again', async () => {
    const user = await bootstrapped();
    const pid = await project(user);
    const sid = await submit(user, pid, INCOMPLETE_ARTIFACTS);
    const ev = await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201);
    assert.notEqual(ev.body.data.outcome, 'passed');
    let j = await journey(user);
    assert.equal(of(j, SKILL)?.progress.state, 'needs_more_evidence');
    assert.equal(of(j, SKILL)?.verification?.state, 'practiced', 'the level never drops and never rises from a journey step');
    await submit(user, pid);
    j = await journey(user);
    assert.equal(of(j, SKILL)?.progress.state, 'submitted');
    assert.equal(of(j, SKILL)?.verification?.state, 'practiced');
  });

  test('withdrawing the last standing evidence → needs_more_evidence; the claim state is untouched (D-077)', async () => {
    const user = await bootstrapped();
    const pid = await project(user);
    const sid = await submit(user, pid);
    const ev = await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201);
    const evidenceId: string = ev.body.data.transition.evidenceId;
    await http.post(`/v1/evidence/${evidenceId}/withdraw`).set(auth(user)).send({ reason: 'wrong file' }).expect(201);
    const j = await journey(user);
    assert.equal(of(j, SKILL)?.progress.state, 'needs_more_evidence');
    assert.equal(of(j, SKILL)?.verification?.state, 'demonstrated', 'withdrawal semantics (D-077) are unchanged by Phase 2');
  });

  test('adding material starts a journey (not_started → in_progress) and creates no claim', async () => {
    const user = await bootstrapped();
    await http.post('/v1/me/evidence').set(auth(user)).send({ typeCode: 'live_demo_url', title: 'demo', url: 'https://demo.example/x', skillIds: [SKILL] }).expect(201);
    const j = await journey(user);
    assert.equal(of(j, SKILL)?.progress.state, 'in_progress');
    assert.equal(of(j, SKILL)?.verification, null);
  });
});

describe('the event log explains every emission', () => {
  test('transitioned and no_matching_rule events are both recorded, with the rule version used; the log is append-only', async () => {
    const user = await bootstrapped();
    const pid = await project(user);
    await project(user); // second project on the same activity: in_progress → in_progress has no rule
    const sid = await submit(user, pid);
    await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201);
    const events = (await http.get(`/v1/me/skill-progress/${SKILL}/events`).set(auth(user)).expect(200)).body.data.items as
      { trigger: string; from: string; to: string | null; applied: boolean; outcome: string; ruleVersion: number | null; eventRef: { table: string } | null }[];
    assert.deepEqual(events.map((e) => [e.trigger, e.from, e.to, e.outcome]), [
      ['project.created', 'not_started', 'in_progress', 'transitioned'],
      ['project.created', 'in_progress', null, 'no_matching_rule'],
      ['submission.created', 'in_progress', 'submitted', 'transitioned'],
      ['evaluation.completed', 'submitted', 'evidence_recorded', 'transitioned'],
    ]);
    assert.equal(events[0]?.ruleVersion, 1);
    assert.equal(events[3]?.eventRef?.table, 'evaluation_result');
    const c = await pool.connect();
    try {
      await c.query('begin');
      await expectRejected(c, `delete from skill_progress_event where user_id = $1`, [user.id], /append-only/);
      await expectRejected(c, `update skill_progress_event set applied = false where user_id = $1`, [user.id], /append-only/);
      await c.query('rollback');
    } finally { c.release(); }
  });
});

describe('RLS — the journey is private and read-only for users', () => {
  test('another user sees nothing; the owner cannot write progress, events or rules', async () => {
    const user = await bootstrapped();
    await project(user);
    const other = await bootstrapped();
    assert.equal((await journey(other)).items.length, 0);
    await http.get(`/v1/me/skill-progress/${SKILL}/events`).set(auth(other)).expect(404);
    await asAuthenticatedUser(pool, other.id, async (c) => {
      assert.equal((await c.query('select count(*)::int as n from skill_progress where user_id = $1', [user.id])).rows[0].n, 0);
    });
    await asAuthenticatedUser(pool, user.id, async (c) => {
      assert.equal((await c.query(`update skill_progress set state_code = 'evidence_recorded' where user_id = $1`, [user.id])).rowCount, 0, 'no update policy');
      await expectRejected(c, `insert into skill_progress (user_id, skill_id, state_code, reason) values ($1,$2,'evidence_recorded','me')`, [user.id, SECONDARY], /row-level security/);
      await expectRejected(c, `insert into skill_progress_event (skill_progress_id, user_id, skill_id, trigger_code, from_state, to_state, applied, outcome, reason, actor_kind)
        select id, user_id, skill_id, 'submission.created', state_code, 'submitted', true, 'transitioned', 'me', 'user' from skill_progress where user_id = $1 limit 1`, [user.id], /row-level security/);
      await expectRejected(c, `update skill_progress_transition set enabled = false`, [], /permission denied|row-level security/);
    });
  });
});
