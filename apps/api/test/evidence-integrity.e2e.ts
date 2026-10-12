/**
 * O-2 — evidence history integrity at the database boundary (migration 0027), through the real API and
 * through direct client-role access (what a PostgREST-style client could attempt with the user's own token).
 *
 *   owner           may withdraw through the API (unchanged); may not rewrite any attribute, un-withdraw,
 *                   insert or delete — not even in the same UPDATE that withdraws
 *   other tenant    changes nothing (RLS)
 *   anonymous       denied
 *   trusted server  the API withdrawal still works; history stays immutable
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, filesFor, asAuthenticatedUser, type TestUser } from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });

async function earnedEvidence(): Promise<{ user: TestUser; evidenceId: string }> {
  const user = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(user)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  const pid = (await http.post('/v1/projects').set(auth(user)).send({ title: 'O-2', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id;
  const uploads = [await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES), await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES)];
  const sid = (await http.post(`/v1/projects/${pid}/submissions`).set(auth(user)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, files: filesFor(uploads), aiDisclosure: { declaredUse: [] } }).expect(201)).body.data.id;
  const ev = (await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201)).body.data;
  assert.ok(ev.transition?.evidenceId, 'fixture: the run earned evidence');
  return { user, evidenceId: ev.transition.evidenceId as string };
}
const row = async (id: string) => (await pool.query('select skill_id, confidence, provenance_source, source_strength, evaluation_result_id, withdrawn_at, withdrawn_reason from evidence where id = $1', [id])).rows[0];
const asClient = <T>(userId: string, sql: string, params: unknown[] = []) => asAuthenticatedUser(pool, userId, async (c) => (await c.query(sql, params)) as unknown as T);

describe('O-2 — evidence history is immutable at the database boundary; withdrawal still works', () => {
  test('owner: the reproduced attack (rewrite skill / confidence / provenance while withdrawing) is refused; nothing changes', async () => {
    const { user, evidenceId } = await earnedEvidence();
    const before = await row(evidenceId);
    for (const set of [
      `skill_id = '${FIXTURE.skillUiTesting === 'a0000000-0000-4000-8000-000000000002' ? 'a0000000-0000-4000-8000-000000000003' : FIXTURE.skillUiTesting}', withdrawn_at = now(), withdrawn_reason = 'x'`,
      `confidence = 0.1, withdrawn_at = now(), withdrawn_reason = 'x'`,
      `provenance_source = 'edited by user', withdrawn_at = now(), withdrawn_reason = 'x'`,
      `source_strength = 'self_reported', withdrawn_at = now(), withdrawn_reason = 'x'`,
      `evaluation_result_id = null, withdrawn_at = now(), withdrawn_reason = 'x'`,
    ]) {
      await assert.rejects(() => asClient(user.id, `update evidence set ${set} where id = $1`, [evidenceId]), /permission denied/, set);
    }
    await assert.rejects(() => asClient(user.id, 'delete from evidence where id = $1', [evidenceId]), /permission denied/);
    await assert.rejects(() => asClient(user.id, `insert into evidence (user_id, skill_id, source_strength, provenance_class, provenance_source) values ($1, $2, 'platform_controlled', 'user_generated', 'me')`, [user.id, FIXTURE.skillUiTesting]), /permission denied/);
    assert.deepEqual(await row(evidenceId), before, 'the evidence row is exactly as recorded');
  });

  test('owner: the API withdrawal still works, is final, and keeps every other attribute', async () => {
    const { user, evidenceId } = await earnedEvidence();
    const before = await row(evidenceId);
    await http.post(`/v1/evidence/${evidenceId}/withdraw`).set(auth(user)).send({ reason: 'لم يكن العمل عملي بالكامل' }).expect(201);
    const after = await row(evidenceId);
    assert.ok(after.withdrawn_at); assert.equal(after.withdrawn_reason, 'لم يكن العمل عملي بالكامل');
    assert.deepEqual({ ...after, withdrawn_at: null, withdrawn_reason: null }, { ...before, withdrawn_at: null, withdrawn_reason: null });
    await assert.rejects(() => asClient(user.id, `update evidence set withdrawn_reason = 'rewritten' where id = $1`, [evidenceId]), /already withdrawn/);
    await assert.rejects(() => asClient(user.id, `update evidence set withdrawn_at = null, withdrawn_reason = null where id = $1`, [evidenceId]), /row-level security|already withdrawn/);
    await http.post(`/v1/evidence/${evidenceId}/withdraw`).set(auth(user)).send({ reason: 'again' }).expect(400);
  });

  test('owner: a direct client withdrawal (withdrawal fields only) is still permitted, exactly as the policy intended', async () => {
    const { user, evidenceId } = await earnedEvidence();
    const n = await asAuthenticatedUser(pool, user.id, async (c) => {
      const r = await c.query(`update evidence set withdrawn_at = now(), withdrawn_reason = 'mine' where id = $1`, [evidenceId]);
      return r.rowCount;
    });
    assert.equal(n, 1, 'permitted (rolled back by the helper)');
  });

  test('other tenant changes nothing; anonymous is denied; the server cannot rewrite history either', async () => {
    const { evidenceId } = await earnedEvidence();
    const before = await row(evidenceId);
    const other = await newUser(); await http.post('/v1/me/bootstrap').set(auth(other)).send({}).expect(201);
    const n = await asAuthenticatedUser(pool, other.id, async (c) => (await c.query(`update evidence set withdrawn_at = now(), withdrawn_reason = 'not yours' where id = $1`, [evidenceId])).rowCount);
    assert.equal(n, 0, 'RLS: another tenant touches no row');
    await http.post(`/v1/evidence/${evidenceId}/withdraw`).set(auth(other)).send({ reason: 'not yours' }).expect(404);
    const c = await pool.connect();
    try {
      await c.query('begin'); await c.query('set local role anon');
      await assert.rejects(() => c.query(`update evidence set withdrawn_at = now(), withdrawn_reason = 'x' where id = $1`, [evidenceId]), /permission denied/);
    } finally { await c.query('rollback').catch(() => undefined); await c.query('reset role').catch(() => undefined); c.release(); }
    await assert.rejects(() => pool.query(`update evidence set confidence = 0.2 where id = $1`, [evidenceId]), /is history/, 'the trusted owner role cannot rewrite history');
    assert.deepEqual(await row(evidenceId), before);
  });

  test('AP-1: a client cannot re-point its project to another activity or version; renaming still works', async () => {
    const { user } = await earnedEvidence();
    const pid = (await pool.query('select id from project where user_id = $1 limit 1', [user.id])).rows[0].id;
    await assert.rejects(() => asClient(user.id, `update project set activity_spec_version = '9.9.9' where id = $1`, [pid]), /cannot be changed by a client/);
    const n = await asAuthenticatedUser(pool, user.id, async (c) => (await c.query(`update project set title = 'جديد' where id = $1`, [pid])).rowCount);
    assert.equal(n, 1);
  });
});
