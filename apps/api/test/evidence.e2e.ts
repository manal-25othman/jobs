/**
 * Phase 1 — Evidence System (Configurable Track Architecture).
 *
 * Proves: the ledger records a submission as typed items with keys from the
 * activity's deliverables; an item never moves a claim and never counts as
 * evidence before an evaluation; an evaluation records a check-result item and
 * bridges the evaluated fact to the material; the user can add, link and
 * withdraw their own material; the registry is data and is DRAFT; RLS keeps
 * items private and immutable.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import {
  bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, expectRejected, asAuthenticatedUser,
  COMPONENT_BYTES, TEST_BYTES, type TestUser, filesFor } from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

async function bootstrapped(): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  return u;
}

async function submit(user: TestUser, projectId?: string) {
  const pid = projectId ?? (await http.post('/v1/projects').set(auth(user))
    .send({ title: 'متتبّع عادات', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id as string;
  const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES);
  const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
  const sub = await http.post(`/v1/projects/${pid}/submissions`).set(auth(user))
    .send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, files: filesFor([u1, u2]),
            externalUrls: ['https://github.com/manal/habits'], aiDisclosure: { declaredUse: ['explanation'] } }).expect(201);
  return { projectId: pid, submissionId: sub.body.data.id as string };
}

type Item = { id: string; typeCode: string; channel: string; source: string; status: string; artifactKey: string | null; parentItemId: string | null;
  attemptNumber: number; supersedesItemId: string | null; skills: { skillId: string; linkedBy: string }[]; derivations: { evidenceId: string; kind: string }[];
  claimEffect: string; metadata: Record<string, unknown>; title: string; url: string | null };

async function items(user: TestUser, q = ''): Promise<Item[]> {
  const r = await http.get(`/v1/me/evidence${q}`).set(auth(user)).expect(200);
  return r.body.data.items as Item[];
}

/* ─────────────────────────── registry ─────────────────────────── */

describe('evidence type registry — data, DRAFT / NOT VALIDATED', () => {
  test('the registry is served with its validation state; nothing seeded is approved', async () => {
    const user = await bootstrapped();
    const r = await http.get('/v1/evidence-types').set(auth(user)).expect(200);
    const types = r.body.data.items as { code: string; channel: string; userAddable: boolean; validated: boolean; reviewStatus: string; validationNote: string }[];
    assert.ok(types.length >= 16, 'the owner\'s evidence types are all registered');
    for (const t of types) {
      assert.equal(t.validated, false, `${t.code} must not be validated`);
      assert.equal(t.reviewStatus, 'draft');
      assert.match(t.validationNote, /DRAFT \/ NOT VALIDATED/);
    }
    assert.equal(types.find((t) => t.code === 'automated_check_result')?.userAddable, false);
    assert.equal(types.find((t) => t.code === 'live_demo_url')?.userAddable, true);
  });

  test('NEGATIVE: a type cannot be marked approved without a recorded approver (DB constraint)', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await expectRejected(c, `update evidence_item_type set review_status = 'approved' where code = 'live_demo_url'`, [], /approved_is_recorded|check constraint/);
      await c.query('rollback');
    } finally { c.release(); }
  });
});

/* ─────────────────────────── submission → ledger ─────────────────────────── */

describe('a submission is recorded as typed evidence items', () => {
  test('one activity item, children per file / link / text, a disclosure item; keys from the activity deliverables', async () => {
    const user = await bootstrapped();
    const { submissionId } = await submit(user);
    const all = await items(user);
    const sub = all.find((i) => i.channel === 'activity');
    assert.ok(sub, 'the submission itself is an activity item');
    assert.equal(sub.typeCode, 'code_submission');
    assert.equal(sub.source, 'user_submission');
    assert.equal(sub.status, 'submitted');
    assert.equal(sub.attemptNumber, 1);
    assert.deepEqual(sub.skills.map((s) => s.skillId), [FIXTURE.skillUiTesting]);
    const children = all.filter((i) => i.parentItemId === sub.id);
    const byType = Object.fromEntries(children.map((i) => [i.typeCode, (children.filter((x) => x.typeCode === i.typeCode)).length]));
    assert.equal(byType['file_upload'], 2);
    assert.equal(byType['github_repository'], 1, 'a github.com/<owner>/<repo> link is classified by the registry match rule');
    assert.equal(byType['text_explanation'], 1, 'note.coverage becomes a text item');
    assert.equal(byType['ai_usage_disclosure'], 1);
    assert.deepEqual(children.filter((i) => i.typeCode === 'file_upload').map((i) => i.artifactKey).sort(), ['file.component', 'file.test'],
      'the file keys are the declared deliverables (the demo declares file.component / file.test at positions 0 / 1)');
    const art = await pool.query('select key from submission_artifact where submission_id = $1 and kind = $2 order by key', [submissionId, 'file']);
    assert.deepEqual(art.rows.map((r) => r.key), ['file.component', 'file.test'], 'the rubric keys are unchanged');
    for (const i of all) assert.equal(i.claimEffect, 'none');
  });

  test('INV-1 for the ledger: items exist, yet the claim is practiced and evidence count is 0 before evaluation', async () => {
    const user = await bootstrapped();
    await submit(user);
    assert.ok((await items(user)).length >= 5);
    const skills = await http.get('/v1/me/skills').set(auth(user)).expect(200);
    const claim = skills.body.data.items.find((s: { skillId: string }) => s.skillId === FIXTURE.skillUiTesting);
    assert.equal(claim.state, 'practiced');
    assert.equal(claim.evidenceCount, 0, 'ledger items are material, not evaluated evidence');
    const ev = await pool.query('select count(*)::int as n from evidence where user_id = $1', [user.id]);
    assert.equal(ev.rows[0].n, 0);
  });

  test('a second submission on the same project is attempt 2; the first is superseded and a previous_attempt item is recorded', async () => {
    const user = await bootstrapped();
    const first = await submit(user);
    await submit(user, first.projectId);
    const subs = (await items(user)).filter((i) => i.channel === 'activity').sort((a, b) => a.attemptNumber - b.attemptNumber);
    assert.equal(subs.length, 2);
    const [first_, second] = [subs[0]!, subs[1]!];
    assert.equal(first_.status, 'superseded');
    assert.equal(second.status, 'submitted');
    assert.equal(second.attemptNumber, 2);
    assert.equal(second.supersedesItemId, first_.id);
    const prev = (await items(user)).find((i) => i.typeCode === 'previous_attempt');
    assert.ok(prev && prev.parentItemId === second.id);
    assert.equal(prev.metadata['previous_item_id'], first_.id);
    assert.equal(prev.source, 'system');
  });

  test('an unclassifiable link falls back to the registry\'s declared fallback, never to a guess', async () => {
    const user = await bootstrapped();
    const pid = (await http.post('/v1/projects').set(auth(user)).send({ title: 'x', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id;
    const u1 = await uploadFile(app, http, user, 'a.jsx', COMPONENT_BYTES); const u2 = await uploadFile(app, http, user, 'a.test.jsx', TEST_BYTES);
    await http.post(`/v1/projects/${pid}/submissions`).set(auth(user))
      .send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, files: filesFor([u1, u2]),
              externalUrls: ['https://example.com/anything', 'https://github.com/manal/habits/commit/abc'], aiDisclosure: { declaredUse: [] } }).expect(201);
    const links = (await items(user)).filter((i) => i.channel === 'url');
    assert.deepEqual(links.map((l) => l.typeCode).sort(), ['external_url', 'github_commit_diff']);
  });
});

/* ─────────────────────────── evaluation → ledger ─────────────────────────── */

describe('an evaluation records a check-result item and bridges the evaluated fact to the material', () => {
  test('automated_check_result + derivations; the evidence row itself is written by the evaluation as before', async () => {
    const user = await bootstrapped();
    const { submissionId } = await submit(user);
    const ev = await http.post(`/v1/submissions/${submissionId}/evaluate`).set(auth(user)).expect(201);
    assert.equal(ev.body.data.outcome, 'passed');
    const evidenceId: string = ev.body.data.transition.evidenceId;
    const all = await items(user);
    const check = all.find((i) => i.typeCode === 'automated_check_result');
    assert.ok(check, 'the run is recorded');
    assert.equal(check.source, 'system');
    assert.equal(check.metadata['outcome'], 'passed');
    assert.deepEqual(check.derivations, [{ evidenceId, kind: 'recorded_as' }]);
    assert.deepEqual(check.skills.map((s) => [s.skillId, s.linkedBy]), [[FIXTURE.skillUiTesting, 'system']]);
    const sub = all.find((i) => i.channel === 'activity')!;
    assert.deepEqual(sub.derivations, [{ evidenceId, kind: 'evaluated_from' }]);
    const skills = await http.get('/v1/me/skills').set(auth(user)).expect(200);
    const claim = skills.body.data.items.find((s: { skillId: string }) => s.skillId === FIXTURE.skillUiTesting);
    assert.equal(claim.state, 'demonstrated');
    assert.equal(claim.evidenceCount, 1, 'exactly one evaluated fact, as before Phase 1');
  });

  test('a failed evaluation still records the check result, with no derivation (no fact was produced)', async () => {
    const user = await bootstrapped();
    const pid = (await http.post('/v1/projects').set(auth(user)).send({ title: 'x', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id;
    const u1 = await uploadFile(app, http, user, 'a.jsx', COMPONENT_BYTES);
    const u2 = await uploadFile(app, http, user, 'a.test.jsx', TEST_BYTES);
    const sub = await http.post(`/v1/projects/${pid}/submissions`).set(auth(user))
      .send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS.filter((a) => a.key !== 'test.error_message'), files: filesFor([u1, u2]), aiDisclosure: { declaredUse: [] } }).expect(201);
    const ev = await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(user)).expect(201);
    assert.notEqual(ev.body.data.outcome, 'passed');
    const check = (await items(user)).find((i) => i.typeCode === 'automated_check_result')!;
    assert.equal(check.metadata['produced_evidence'], false);
    assert.deepEqual(check.derivations, []);
  });
});

/* ─────────────────────────── user-added material ─────────────────────────── */

describe('the user adds, links and withdraws their own material', () => {
  test('add a link with a skill; it never creates or moves a claim', async () => {
    const user = await bootstrapped();
    const r = await http.post('/v1/me/evidence').set(auth(user))
      .send({ typeCode: 'live_demo_url', title: 'عرض حي', url: 'https://demo.example/habits', skillIds: [FIXTURE.skillUiTesting] }).expect(201);
    assert.equal(r.body.data.typeCode, 'live_demo_url');
    assert.equal(r.body.data.source, 'user_direct');
    assert.equal(r.body.data.claimEffect, 'none');
    const skills = await http.get('/v1/me/skills').set(auth(user)).expect(200);
    assert.equal(skills.body.data.items.length, 0, 'no claim was created by adding material');
    const claims = await pool.query('select count(*)::int as n from skill_claim where user_id = $1', [user.id]);
    assert.equal(claims.rows[0].n, 0);
    const link = await http.post(`/v1/me/evidence/${r.body.data.id}/skills`).set(auth(user)).send({ skillIds: ['a0000000-0000-4000-8000-000000000003'] }).expect(201);
    assert.equal(link.body.data.skills.length, 2);
    const filtered = await items(user, `?skillId=${FIXTURE.skillUiTesting}`);
    assert.equal(filtered.length, 1);
  });

  test('a file item needs a confirmed upload the user owns; a text item needs text', async () => {
    const user = await bootstrapped();
    const up = await uploadFile(app, http, user, 'shot.png', new Uint8Array([137, 80, 78, 71]), 'image/png');
    const ok = await http.post('/v1/me/evidence').set(auth(user)).send({ typeCode: 'screenshot', title: 'لقطة', uploadId: up }).expect(201);
    assert.equal(ok.body.data.uploadId, up);
    await http.post('/v1/me/evidence').set(auth(user)).send({ typeCode: 'screenshot', title: 'لقطة' }).expect(422);
    await http.post('/v1/me/evidence').set(auth(user)).send({ typeCode: 'text_explanation', title: 'شرح', description: '   ' }).expect(422);
    const other = await bootstrapped();
    await http.post('/v1/me/evidence').set(auth(other)).send({ typeCode: 'screenshot', title: 'لقطة', uploadId: up }).expect(404);
  });

  test('NEGATIVE: system and activity types cannot be added by a user; an unknown type is named', async () => {
    const user = await bootstrapped();
    await http.post('/v1/me/evidence').set(auth(user)).send({ typeCode: 'automated_check_result', title: 'x' }).expect(422);
    await http.post('/v1/me/evidence').set(auth(user)).send({ typeCode: 'code_submission', title: 'x' }).expect(422);
    const r = await http.post('/v1/me/evidence').set(auth(user)).send({ typeCode: 'telepathy', title: 'x' }).expect(422);
    assert.match(r.body.error.message, /not in the registry/);
  });

  test('withdraw own material (reason required); a submission\'s items cannot be withdrawn here; terminal is terminal', async () => {
    const user = await bootstrapped();
    const r = await http.post('/v1/me/evidence').set(auth(user)).send({ typeCode: 'user_reflection', title: 'تأمّل', description: 'تعلمت أن الاختبار قبل الوصف.' }).expect(201);
    await http.post(`/v1/me/evidence/${r.body.data.id}/withdraw`).set(auth(user)).send({ reason: '' }).expect(400);
    const w = await http.post(`/v1/me/evidence/${r.body.data.id}/withdraw`).set(auth(user)).send({ reason: 'أضفته بالخطأ' }).expect(201);
    assert.equal(w.body.data.status, 'withdrawn');
    await http.post(`/v1/me/evidence/${r.body.data.id}/withdraw`).set(auth(user)).send({ reason: 'again' }).expect(409);
    await http.post(`/v1/me/evidence/${r.body.data.id}/skills`).set(auth(user)).send({ skillIds: [FIXTURE.skillUiTesting] }).expect(422);
    await submit(user);
    const sub = (await items(user)).find((i) => i.channel === 'activity')!;
    await http.post(`/v1/me/evidence/${sub.id}/withdraw`).set(auth(user)).send({ reason: 'x' }).expect(422);
  });
});

/* ─────────────────────────── RLS / immutability ─────────────────────────── */

describe('RLS and immutability (proved as the authenticated role, never as postgres)', () => {
  test('another user sees nothing; the owner cannot update an item, add a system item or write a derivation', async () => {
    const user = await bootstrapped();
    const { submissionId } = await submit(user);
    const sub = (await items(user)).find((i) => i.channel === 'activity')!;
    const other = await bootstrapped();
    assert.equal((await items(other)).length, 0);
    await http.get(`/v1/me/evidence/${sub.id}`).set(auth(other)).expect(404);
    await asAuthenticatedUser(pool, other.id, async (c) => {
      const { rows } = await c.query('select count(*)::int as n from evidence_item where user_id = $1', [user.id]);
      assert.equal(rows[0].n, 0, 'RLS hides another user\'s items');
    });
    await asAuthenticatedUser(pool, user.id, async (c) => {
      const upd = await c.query(`update evidence_item set title = 'edited' where id = $1`, [sub.id]);
      assert.equal(upd.rowCount, 0, 'no update policy: the statement touches no row');
      await expectRejected(c, `insert into evidence_item (user_id, item_type_code, source, title, submission_id, status, submitted_at) values ($1,'ai_usage_disclosure','system','fake',$2,'submitted',now())`,
        [user.id, submissionId], /row-level security/);
      await expectRejected(c, `insert into evidence_derivation (evidence_id, evidence_item_id, user_id, derivation_kind) values (gen_random_uuid(), $1, $2, 'recorded_as')`,
        [sub.id, user.id], /row-level security|violates foreign key/);
    });
    // Even the service role cannot rewrite a submitted item's content or delete it.
    const c = await pool.connect();
    try {
      await c.query('begin');
      await expectRejected(c, `update evidence_item set title = 'edited' where id = $1`, [sub.id], /immutable after submission/);
      await expectRejected(c, `delete from evidence_item where id = $1`, [sub.id], /never deleted/);
      await expectRejected(c, `insert into evidence_item (user_id, item_type_code, source, title, status, submitted_at) values ($1,'live_demo_url','user_direct','no url','submitted',now())`, [user.id], /needs a url/);
      await expectRejected(c, `insert into evidence_item_skill (evidence_item_id, skill_id, user_id, linked_by, weight) values ($1,$2,$3,'user',0.5)`, [sub.id, FIXTURE.skillUiTesting, user.id], /weight|check constraint/);
      await c.query('rollback');
    } finally { c.release(); }
  });
});
