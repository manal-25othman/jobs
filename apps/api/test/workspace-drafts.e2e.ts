/**
 * Phase B, package 4 — workspace drafts (SRS FR-U-025).
 *
 *  - the graduate's written answers, file references, selected skills and work-method answers are saved and come
 *    back after a reload (a new request), with the uploaded file's name and size
 *  - a draft is private: another graduate cannot read, save or clear it (404, no existence leak)
 *  - a draft only names the activity's deliverables and skills, and only the owner's own confirmed uploads
 *  - a save from a stale window is refused (409) instead of overwriting newer work
 *  - a draft is NEVER evidence: saving creates no submission, artifact, evidence item, evidence, claim or progress event
 *  - submitting removes the draft in the same transaction; historical submissions are untouched
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, uploadFile, filesFor, FIXTURE, COMPLETE_ARTIFACTS, COMPONENT_BYTES, TEST_BYTES, type TestUser } from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const n = async (sql: string, p: unknown[]) => Number((await pool.query(sql, p)).rows[0].n);
const SKILL = FIXTURE.skillUiTesting;

before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });

async function graduateWithProject(): Promise<{ u: TestUser; pid: string }> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  const pid = (await http.post('/v1/projects').set(auth(u)).send({ title: 'مسودة', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id as string;
  return { u, pid };
}
const footprint = async (userId: string) => ({
  submissions: await n('select count(*)::int n from submission where user_id = $1', [userId]),
  artifacts: await n('select count(*)::int n from submission_artifact where user_id = $1', [userId]),
  items: await n('select count(*)::int n from evidence_item where user_id = $1', [userId]),
  evidence: await n('select count(*)::int n from evidence where user_id = $1', [userId]),
  claims: await n('select count(*)::int n from skill_claim where user_id = $1', [userId]),
  progress: await n('select count(*)::int n from skill_progress_event where user_id = $1', [userId]),
});

describe('FR-U-025 — workspace drafts', () => {
  test('saved work comes back after a reload, with the file name and size; the revision advances', async () => {
    const { u, pid } = await graduateWithProject();
    assert.equal((await http.get(`/v1/projects/${pid}/draft`).set(auth(u)).expect(200)).body.data, null, 'no draft yet');
    const up = await uploadFile(app, http, u, 'HabitList.jsx', COMPONENT_BYTES);
    const first = (await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({
      texts: { 'note.coverage': 'يغطي حالة الفراغ والتحميل' }, files: { 'file.component': up }, skillIds: [SKILL], disclosure: { used_ai: 'no' }, revision: null,
    }).expect(200)).body.data;
    assert.equal(first.revision, 1);
    const again = (await http.get(`/v1/projects/${pid}/draft`).set(auth(u)).expect(200)).body.data;
    assert.deepEqual(again.texts, { 'note.coverage': 'يغطي حالة الفراغ والتحميل' });
    assert.deepEqual(again.files['file.component'], { uploadId: up, name: 'HabitList.jsx', size: COMPONENT_BYTES.byteLength });
    assert.deepEqual(again.skillIds, [SKILL]); assert.deepEqual(again.disclosure, { used_ai: 'no' });
    const second = (await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ texts: { 'note.coverage': 'نسخة ثانية' }, files: { 'file.component': up }, skillIds: [SKILL], revision: 1 }).expect(200)).body.data;
    assert.equal(second.revision, 2); assert.equal(second.texts['note.coverage'], 'نسخة ثانية');
  });

  test('a stale window cannot overwrite newer work (409); the newer draft is kept', async () => {
    const { u, pid } = await graduateWithProject();
    await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ texts: { 'note.coverage': 'أ' }, revision: null }).expect(200);
    await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ texts: { 'note.coverage': 'ب' }, revision: 1 }).expect(200);
    const stale = await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ texts: { 'note.coverage': 'قديم' }, revision: 1 }).expect(409);
    assert.match(stale.body.error.message, /draft_conflict/);
    assert.equal((await http.get(`/v1/projects/${pid}/draft`).set(auth(u)).expect(200)).body.data.texts['note.coverage'], 'ب');
  });

  test('a draft is private: another graduate cannot read, save or clear it, and learns nothing (404)', async () => {
    const { u, pid } = await graduateWithProject();
    await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ texts: { 'note.coverage': 'خاص' }, revision: null }).expect(200);
    const other = (await graduateWithProject()).u;
    await http.get(`/v1/projects/${pid}/draft`).set(auth(other)).expect(404);
    await http.put(`/v1/projects/${pid}/draft`).set(auth(other)).send({ texts: { 'note.coverage': 'x' } }).expect(404);
    await http.delete(`/v1/projects/${pid}/draft`).set(auth(other)).expect(404);
    await http.get(`/v1/projects/${pid}/draft`).set({}).expect(401);
    assert.equal((await http.get(`/v1/projects/${pid}/draft`).set(auth(u)).expect(200)).body.data.texts['note.coverage'], 'خاص');
  });

  test('only the activity deliverables and skills, and only the owner\'s own confirmed uploads', async () => {
    const { u, pid } = await graduateWithProject();
    const r1 = await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ texts: { 'note.unknown': 'x' } }).expect(422);
    assert.match(r1.body.error.message, /draft_unknown_deliverable/);
    assert.match((await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ texts: { 'file.component': 'x' } }).expect(422)).body.error.message, /draft_unknown_deliverable/);
    assert.match((await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ skillIds: ['00000000-0000-4000-8000-000000000000'] }).expect(422)).body.error.message, /draft_skill_not_mapped/);
    const other = (await graduateWithProject()).u;
    const theirs = await uploadFile(app, http, other, 'x.jsx', COMPONENT_BYTES);
    const r2 = await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ files: { 'file.component': theirs } }).expect(409);
    assert.match(r2.body.error.message, /draft_file_not_usable/);
    const pending = (await http.post('/v1/uploads').set(auth(u)).send({ declaredName: 'p.jsx', contentType: 'text/javascript', declaredSize: 5 }).expect(201)).body.data.uploadId as string;
    await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ files: { 'file.component': pending } }).expect(409);
    assert.equal((await http.get(`/v1/projects/${pid}/draft`).set(auth(u)).expect(200)).body.data, null, 'nothing was stored');
  });

  test('a draft is never evidence: saving creates no submission, artifact, evidence item, evidence, claim or progress event', async () => {
    const { u, pid } = await graduateWithProject();
    const before0 = await footprint(u.id);
    const up = await uploadFile(app, http, u, 'HabitList.jsx', COMPONENT_BYTES);
    for (let i = 0; i < 3; i++) {
      await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ texts: { 'note.coverage': `مسودة ${i}` }, files: { 'file.component': up }, skillIds: [SKILL], revision: i === 0 ? null : i }).expect(200);
    }
    assert.deepEqual(await footprint(u.id), before0);
  });

  test('submitting removes the draft in the same transaction; the submission is built from what was sent', async () => {
    const { u, pid } = await graduateWithProject();
    const comp = await uploadFile(app, http, u, 'HabitList.jsx', COMPONENT_BYTES);
    const tst = await uploadFile(app, http, u, 'HabitList.test.jsx', TEST_BYTES);
    await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ texts: { 'note.coverage': 'مسودة' }, files: { 'file.component': comp, 'file.test': tst }, skillIds: [SKILL], revision: null }).expect(200);
    const sub = (await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({
      skillIds: [SKILL], artifacts: COMPLETE_ARTIFACTS, files: filesFor([comp, tst]), aiDisclosure: { declaredUse: [], explanation: null },
    }).expect(201)).body.data;
    assert.ok(sub.id);
    assert.equal((await http.get(`/v1/projects/${pid}/draft`).set(auth(u)).expect(200)).body.data, null, 'the draft is gone');
    assert.equal(await n('select count(*)::int n from project_draft where project_id = $1', [pid]), 0);
    // A stale autosave after submission does not resurrect the draft silently.
    await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ texts: { 'note.coverage': 'متأخر' }, revision: 1 }).expect(409);
  });

  test('clearing a draft is the owner\'s explicit act; their uploads stay theirs', async () => {
    const { u, pid } = await graduateWithProject();
    const up = await uploadFile(app, http, u, 'HabitList.jsx', COMPONENT_BYTES);
    await http.put(`/v1/projects/${pid}/draft`).set(auth(u)).send({ files: { 'file.component': up }, revision: null }).expect(200);
    assert.deepEqual((await http.delete(`/v1/projects/${pid}/draft`).set(auth(u)).expect(200)).body.data, { cleared: true });
    assert.equal(await n(`select count(*)::int n from upload where id = $1 and state = 'confirmed'`, [up]), 1);
  });
});
