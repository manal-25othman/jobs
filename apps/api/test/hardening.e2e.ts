/**
 * Vertical Slice 01.1 — production hardening proofs.
 *
 * Storage is the in-memory test double here (labelled as such): these tests
 * prove ownership, provenance, measurement, the report boundary and revocation.
 * They prove nothing about Supabase itself — see scripts/supabase-live-check.mjs.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import {
  bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, memoryStorage,
  expectRejected, asAuthenticatedUser, COMPONENT_BYTES, TEST_BYTES, type TestUser, approveCvBulletProposal,
} from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

async function bootstrapped(): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  return u;
}

async function fullFlow(user: TestUser) {
  await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  const project = await http.post('/v1/projects').set(auth(user))
    .send({ title: 'متتبّع عادات', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
  const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES);
  const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
  const sub = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user))
    .send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, uploadIds: [u1, u2],
            externalUrls: ['https://example.com/repo'], aiDisclosure: { declaredUse: [] } }).expect(201);
  const ev = await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(user)).expect(201);
  const asset = await approveCvBulletProposal(http, user);
  const report = await http.post('/v1/me/evidence-report').set(auth(user)).expect(201);
  return { projectId: project.body.data.id, submissionId: sub.body.data.id, uploadIds: [u1, u2], evidenceId: ev.body.data.transition.evidenceId as string,
           assetId: asset.assetId, reportId: report.body.data.id as string, report: report.body.data };
}

/* ─────────────────────────── uploads: provenance ───────────────────────── */

describe('uploads — provenance and measurement', () => {
  test('a confirmed upload records size and sha256 measured from the stored object', async () => {
    const user = await bootstrapped();
    const id = await uploadFile(app, http, user, 'notes.md', TEST_BYTES, 'text/markdown');
    const { rows } = await pool.query('select state, size_bytes, checksum_sha256, provenance_class, object_path, user_id from upload where id = $1', [id]);
    assert.equal(rows[0].state, 'confirmed');
    assert.equal(Number(rows[0].size_bytes), TEST_BYTES.byteLength);
    assert.equal(rows[0].checksum_sha256, createHash('sha256').update(TEST_BYTES).digest('hex'));
    assert.equal(rows[0].provenance_class, 'user_generated');
    assert.ok(rows[0].object_path.startsWith(`${user.id}/`), 'object path is owner-prefixed');
  });

  test('NEGATIVE: a declared size is not trusted — the measured size wins', async () => {
    const user = await bootstrapped();
    const intent = await http.post('/v1/uploads').set(auth(user))
      .send({ declaredName: 'a.txt', contentType: 'text/plain', declaredSize: 5 }).expect(201);
    memoryStorage(app).put(intent.body.data.target.url, new TextEncoder().encode('twelve bytes'));
    const c = await http.post(`/v1/uploads/${intent.body.data.uploadId}/confirm`).set(auth(user)).expect(201);
    assert.equal(c.body.data.sizeBytes, 12);
  });

  test('NEGATIVE: confirming before anything was stored is refused', async () => {
    const user = await bootstrapped();
    const intent = await http.post('/v1/uploads').set(auth(user))
      .send({ declaredName: 'a.txt', contentType: 'text/plain', declaredSize: 5 }).expect(201);
    await http.post(`/v1/uploads/${intent.body.data.uploadId}/confirm`).set(auth(user)).expect(400);
  });

  test('NEGATIVE: disallowed content type, path separators, oversize', async () => {
    const user = await bootstrapped();
    const r1 = await http.post('/v1/uploads').set(auth(user)).send({ declaredName: 'x.exe', contentType: 'application/x-msdownload', declaredSize: 5 });
    assert.equal(r1.status, 422);
    const r2 = await http.post('/v1/uploads').set(auth(user)).send({ declaredName: '../etc/passwd', contentType: 'text/plain', declaredSize: 5 });
    assert.equal(r2.status, 422);
    const r3 = await http.post('/v1/uploads').set(auth(user)).send({ declaredName: 'big.zip', contentType: 'application/zip', declaredSize: 999_999_999 });
    assert.equal(r3.status, 422);
  });

  test('no API response ever carries a raw object path or bucket', async () => {
    const user = await bootstrapped();
    const intent = await http.post('/v1/uploads').set(auth(user))
      .send({ declaredName: 'a.txt', contentType: 'text/plain', declaredSize: 5 }).expect(201);
    memoryStorage(app).put(intent.body.data.target.url, new TextEncoder().encode('hello'));
    const confirm = await http.post(`/v1/uploads/${intent.body.data.uploadId}/confirm`).set(auth(user)).expect(201);
    const dl = await http.get(`/v1/uploads/${intent.body.data.uploadId}/download`).set(auth(user)).expect(200);
    for (const body of [intent.body, confirm.body, dl.body]) {
      const s = JSON.stringify(body);
      assert.ok(!s.includes('object_path') && !s.includes('objectPath'), 'object path leaked');
      assert.ok(!s.includes('naqla-submissions') && !s.includes('"bucket"'), 'bucket leaked');
      assert.ok(!s.includes(`${user.id}/`), 'owner-prefixed path leaked');
    }
    // The signed download URL works, and is the ONLY way to the bytes.
    const bytes = memoryStorage(app).get(dl.body.data.url);
    assert.equal(new TextDecoder().decode(bytes), 'hello');
    assert.equal(dl.body.data.expiresInSeconds, 300);
  });
});

/* ───────────────────────── uploads: isolation ──────────────────────────── */

describe('uploads — a second user cannot reach another user’s files', () => {
  test('NEGATIVE: download, confirm and submission reference are all refused', async () => {
    const owner = await bootstrapped(); const intruder = await bootstrapped();
    const id = await uploadFile(app, http, owner, 'HabitList.jsx', COMPONENT_BYTES);
    await http.get(`/v1/uploads/${id}/download`).set(auth(intruder)).expect(404);
    await http.post(`/v1/uploads/${id}/confirm`).set(auth(intruder)).expect(404);

    await http.put('/v1/me/career-goal').set(auth(intruder)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
    const project = await http.post('/v1/projects').set(auth(intruder))
      .send({ title: 'x', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
    await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(intruder))
      .send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, uploadIds: [id], aiDisclosure: { declaredUse: [] } })
      .expect(404);
  });

  test('NEGATIVE: at the database, RLS hides the row and refuses every write', async () => {
    const owner = await bootstrapped(); const intruder = await bootstrapped();
    const id = await uploadFile(app, http, owner, 'HabitList.jsx', COMPONENT_BYTES);
    await asAuthenticatedUser(pool, intruder.id, async (c) => {
      const { rows } = await c.query('select count(*)::int as n from upload where id = $1', [id]);
      assert.equal(rows[0].n, 0, 'the intruder cannot even see that the upload exists');
    });
    await asAuthenticatedUser(pool, owner.id, async (c) => {
      const { rows } = await c.query('select count(*)::int as n from upload where id = $1', [id]);
      assert.equal(rows[0].n, 1, 'the owner sees their own record');
      // No UPDATE policy exists, so RLS filters the statement to zero rows —
      // it does not error. The proof is that nothing changed.
      const upd = await c.query(`update upload set declared_name = 'renamed' where id = $1`, [id]);
      assert.equal(upd.rowCount, 0, 'the owner cannot update their own upload record');
      await expectRejected(c,
        `insert into upload (user_id, bucket, object_path, declared_name, content_type, declared_size, purpose, provenance_source)
         values ($1::uuid,'naqla-submissions',$1::text || '/x/y','y','text/plain',1,'submission_file','me')`,
        [owner.id], /row-level security|permission denied/);
    });
    const { rows } = await pool.query('select declared_name from upload where id = $1', [id]);
    assert.equal(rows[0].declared_name, 'HabitList.jsx');
  });
});

/* ───────────────────── recruiter view never exposes uploads ────────────── */

describe('the recruiter view never exposes raw private uploads', () => {
  test('private report and public projection contain no upload, path, bucket, checksum or signed URL', async () => {
    const user = await bootstrapped();
    const { reportId, report, uploadIds } = await fullFlow(user);
    assert.ok(memoryStorage(app).hasObject(`naqla-submissions`, `${user.id}/${uploadIds[0]}/HabitList.jsx`), 'the file really exists in storage');

    const link = await http.post('/v1/share-links').set(auth(user))
      .send({ resourceKind: 'recruiter_report', resourceId: reportId, expiresInDays: 7 }).expect(201);
    const pub = await http.get(`/public/reports/${reportId}?token=${link.body.data.token}`).expect(200);
    assert.equal(pub.body.ok, true);

    for (const [label, obj] of [['private report', report], ['public projection', pub.body.data]] as const) {
      const s = JSON.stringify(obj);
      for (const needle of ['object_path', 'objectPath', 'bucket', 'naqla-submissions', 'signedUrl', 'signed_url',
                            'checksum', 'upload', 'HabitList.jsx', `${user.id}/`, 'memory://']) {
        assert.ok(!s.includes(needle), `${label} leaked '${needle}'`);
      }
    }
    // The external URL was submitted as evidence but is not part of the report contract either.
    assert.ok(!JSON.stringify(pub.body.data).includes('example.com'));
  });
});

/* ───────────────────────── share links: revocable ──────────────────────── */

describe('share links are revocable through the API', () => {
  test('revoking closes the public route immediately; an intruder cannot revoke', async () => {
    const user = await bootstrapped(); const intruder = await bootstrapped();
    const { reportId } = await fullFlow(user);
    const link = await http.post('/v1/share-links').set(auth(user))
      .send({ resourceKind: 'recruiter_report', resourceId: reportId, expiresInDays: 7 }).expect(201);
    const { id, token } = link.body.data;
    assert.equal((await http.get(`/public/reports/${reportId}?token=${token}`)).body.ok, true);

    await http.delete(`/v1/share-links/${id}`).set(auth(intruder)).expect(400);
    assert.equal((await http.get(`/public/reports/${reportId}?token=${token}`)).body.ok, true, 'a failed revoke changes nothing');

    await http.delete(`/v1/share-links/${id}`).set(auth(user)).expect(200);
    assert.equal((await http.get(`/public/reports/${reportId}?token=${token}`)).body.ok, false);
    await http.delete(`/v1/share-links/${id}`).set(auth(user)).expect(400);
  });
});

/* ───────────────────────── owner decisions D-057 / D-059 ───────────────── */

describe('D-057 — no approval without preview; D-059 — Verified stays blocked', () => {
  test('NEGATIVE: approving a draft that was never previewed is refused with the rule named', async () => {
    const user = await bootstrapped();
    await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
    const project = await http.post('/v1/projects').set(auth(user))
      .send({ title: 'x', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
    const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES);
    const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
    const sub = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user))
      .send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, uploadIds: [u1, u2], aiDisclosure: { declaredUse: [] } }).expect(201);
    await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(user)).expect(201);
    const list = await http.get('/v1/me/proposals').set(auth(user)).expect(200);
    const cv = list.body.data.items.find((p: { proposalType: string }) => p.proposalType === 'cv_bullet');
    assert.ok(cv); assert.equal(cv.previewedAt, null);
    const refused = await http.post(`/v1/me/proposals/${cv.id}/approve`).set(auth(user)).send({ approved: true });
    assert.equal(refused.status, 422);
    assert.equal(refused.body.error.code, 'missing_prerequisite');
    assert.match(refused.body.error.message, /D-057/);
    const { rows } = await pool.query('select lifecycle, resulting_asset_id from agent_proposal where id = $1', [cv.id]);
    assert.equal(rows[0].lifecycle, 'awaiting_user'); assert.equal(rows[0].resulting_asset_id, null);
    const n = await pool.query('select count(*)::int as n from professional_asset where user_id = $1', [user.id]);
    assert.equal(n.rows[0].n, 0);
  });

  test('NEGATIVE: the database refuses a transition to verified even with a reviewer (D-059)', async () => {
    const user = await bootstrapped();
    const { } = await fullFlow(user);
    const claim = await pool.query('select id from skill_claim where user_id = $1 and skill_id = $2', [user.id, FIXTURE.skillUiTesting]);
    const er = await pool.query('select id from evaluation_result where user_id = $1 limit 1', [user.id]);
    await assert.rejects(
      () => pool.query(
        `insert into evidence_transition (skill_claim_id, user_id, from_state, to_state, transition_rule_id,
           evaluation_result_id, human_reviewer_id, actor_kind, reason)
         values ($1,$2,'demonstrated','verified','T-VERIFY',$3,$2,'human_reviewer','second project reviewed')`,
        [claim.rows[0].id, user.id, er.rows[0].id]),
      /transition_verified_not_yet_available/,
    );
  });
});

/* ───────────────────────── external URLs ───────────────────────────────── */

describe('evidence may reference external URLs', () => {
  test('a valid https URL becomes a link artifact; bad URLs and free-text files are refused', async () => {
    const user = await bootstrapped();
    await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
    const project = await http.post('/v1/projects').set(auth(user))
      .send({ title: 'x', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
    const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES);
    const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
    const ok = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user))
      .send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, uploadIds: [u1, u2],
              externalUrls: ['https://github.com/sara/habit-tracker'], aiDisclosure: { declaredUse: [] } }).expect(201);
    const got = await http.get(`/v1/submissions/${ok.body.data.id}`).set(auth(user)).expect(200);
    assert.ok(got.body.data.artifacts.some((a: { kind: string; value_text: string }) => a.kind === 'link' && a.value_text.includes('github.com')));
    assert.equal(got.body.data.artifacts.filter((a: { kind: string }) => a.kind === 'file').length, 2);

    const bad = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user))
      .send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, uploadIds: [u1, u2],
              externalUrls: ['ftp://x'], aiDisclosure: { declaredUse: [] } });
    assert.equal(bad.status, 422);
    const freeText = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user))
      .send({ skillIds: [FIXTURE.skillUiTesting], artifacts: [{ key: 'file.component', kind: 'file', valueText: 'x.js' }], aiDisclosure: { declaredUse: [] } });
    assert.equal(freeText.status, 400);
  });
});
