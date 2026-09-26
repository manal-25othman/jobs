/**
 * D-077 — withdrawn evidence, end to end (harness §9).
 *
 * The asset is kept, marked needs_review, no longer evidence-backed; the
 * public link reflects it immediately; re-link is explicit and rule-bound;
 * nothing is deleted.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import {
  bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES,
  approveCvBulletProposal, asAuthenticatedUser, expectRejected, type TestUser,
} from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

async function demonstrated(user: TestUser, title: string) {
  const project = await http.post('/v1/projects').set(auth(user)).send({ title, kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
  const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES);
  const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
  const sub = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user))
    .send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, uploadIds: [u1, u2], aiDisclosure: { declaredUse: [] } }).expect(201);
  const ev = await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(user)).expect(201);
  return ev.body.data as { outcome: string; transition: { to: string; evidenceId: string } | null; reestablishedEvidenceId: string | null };
}

describe('D-077 — withdrawn evidence: the asset survives, stops being evidence-backed, and the public link updates at once', () => {
  test('withdraw → needs_review → public projection excludes → explicit re-link restores', async () => {
    const user = await newUser();
    await http.post('/v1/me/bootstrap').set(auth(user)).send({}).expect(201);
    await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
    const first = await demonstrated(user, 'متتبّع عادات');
    assert.equal(first.transition?.to, 'demonstrated');
    const evidenceId = first.transition!.evidenceId;
    const { assetId } = await approveCvBulletProposal(http, user);

    const report = await http.post('/v1/me/evidence-report').set(auth(user)).expect(201);
    const reportId = report.body.data.id as string;
    assert.equal(report.body.data.professionalAssets.length, 1);
    assert.equal(report.body.data.professionalAssets[0].evidenceBacked, true);
    const link = await http.post('/v1/share-links').set(auth(user)).send({ resourceKind: 'recruiter_report', resourceId: reportId, expiresInDays: 7 }).expect(201);
    const token: string = link.body.data.token;
    const pubBefore = await http.get(`/public/reports/${reportId}?token=${token}`).expect(200);
    assert.equal(pubBefore.body.data.professionalAssets.length, 1);
    assert.equal(pubBefore.body.data.skills.length, 1);

    // ── withdraw ──
    await http.post(`/v1/evidence/${evidenceId}/withdraw`).set(auth(user)).send({ reason: '' }).expect(422);
    const w = await http.post(`/v1/evidence/${evidenceId}/withdraw`).set(auth(user)).send({ reason: 'لم يكن العمل عملي بالكامل' }).expect(201);
    assert.deepEqual(w.body.data.affectedAssets, [{ id: assetId, lifecycleState: 'needs_review', evidenceBacked: false }]);

    // Nothing deleted: evidence and asset rows are both still there, with why.
    const ev = await pool.query('select withdrawn_at, withdrawn_reason from evidence where id = $1', [evidenceId]);
    assert.equal(ev.rowCount, 1); assert.ok(ev.rows[0].withdrawn_at); assert.equal(ev.rows[0].withdrawn_reason, 'لم يكن العمل عملي بالكامل');
    const a = await pool.query('select lifecycle_state, evidence_backed, review_reason, body, user_approved_at from professional_asset where id = $1', [assetId]);
    assert.equal(a.rowCount, 1); assert.equal(a.rows[0].lifecycle_state, 'needs_review'); assert.equal(a.rows[0].evidence_backed, false);
    assert.match(a.rows[0].review_reason, /محفوظ/); assert.ok(a.rows[0].body); assert.ok(a.rows[0].user_approved_at, 'approval history preserved');
    const mine = await http.get('/v1/me/assets').set(auth(user)).expect(200);
    assert.equal(mine.body.data.items[0].lifecycle_state, 'needs_review'); assert.equal(mine.body.data.items[0].evidence_backed, false);

    // The user is told, non-punitively.
    const n = await pool.query(`select body_ar, type from notification where user_id = $1`, [user.id]);
    assert.equal(n.rowCount, 1); assert.ok(!/خطأ|عقوب|غش/.test(n.rows[0].body_ar));
    const audit = await pool.query(`select event_type from audit_event where user_id = $1 and event_type in ('evidence.withdrawn','asset.needs_review') order by event_type`, [user.id]);
    assert.deepEqual(audit.rows.map((r) => r.event_type), ['asset.needs_review', 'evidence.withdrawn']);

    // The SAME link, with no regeneration, no longer shows the asset or the claim it backed.
    const pubAfter = await http.get(`/public/reports/${reportId}?token=${token}`).expect(200);
    assert.equal(pubAfter.body.ok, true);
    assert.equal(pubAfter.body.data.professionalAssets.length, 0, 'public projection updated immediately');
    assert.equal(pubAfter.body.data.skills.length, 0, 'a claim whose evidence was withdrawn is not presented as supported');
    const priv = await http.post('/v1/me/evidence-report').set(auth(user)).expect(201);
    assert.equal(priv.body.data.professionalAssets.length, 0);

    // A proposal resting on withdrawn evidence can no longer be approved.
    const ps = (await http.get('/v1/me/proposals').set(auth(user)).expect(200)).body.data.items as Array<Record<string, unknown>>;
    assert.ok(ps.every((p) => p.lifecycle !== 'awaiting_user' || p.proposalType !== 'cv_bullet'), 'the only cv_bullet proposal was approved already');

    // ── re-link: refused to the withdrawn evidence; refused to nothing ──
    const r1 = await http.post(`/v1/me/assets/${assetId}/relink`).set(auth(user)).send({ evidenceId }).expect(422); // domain rule, named
    assert.match(r1.body.error.message, /withdrawn/);
    await http.post(`/v1/me/assets/${assetId}/relink`).set(auth(user)).send({}).expect(400);
    await http.post(`/v1/me/assets/${assetId}/relink`).set(auth(user)).send({ evidenceId: '00000000-0000-4000-8000-000000000000' }).expect(404);
    const still = await pool.query('select lifecycle_state from professional_asset where id = $1', [assetId]);
    assert.equal(still.rows[0].lifecycle_state, 'needs_review');

    // ── the user does the work again: evidence is RE-ESTABLISHED, no transition (the ladder is forward-only) ──
    const second = await demonstrated(user, 'متتبّع عادات — إعادة');
    assert.equal(second.outcome, 'passed'); assert.equal(second.transition, null);
    assert.ok(second.reestablishedEvidenceId, 'new evidence exists for the same state');
    const transitions = await pool.query(`select count(*)::int as n from evidence_transition where user_id = $1 and to_state = 'demonstrated'`, [user.id]);
    assert.equal(transitions.rows[0].n, 1, 'still exactly one transition to demonstrated; re-establishment wrote none');
    const claim = await pool.query('select state, primary_evidence_id from skill_claim where user_id = $1', [user.id]);
    assert.equal(claim.rows[0].state, 'demonstrated'); assert.equal(claim.rows[0].primary_evidence_id, second.reestablishedEvidenceId);

    // Explicit re-link to evidence that qualifies on its own.
    const rl = await http.post(`/v1/me/assets/${assetId}/relink`).set(auth(user)).send({ evidenceId: second.reestablishedEvidenceId }).expect(201);
    assert.equal(rl.body.data.lifecycleState, 'active'); assert.equal(rl.body.data.evidenceBacked, true);
    const links = await pool.query('select evidence_id from asset_evidence where asset_id = $1', [assetId]);
    assert.equal(links.rowCount, 2, 'the historical link is kept beside the new one');
    // Cannot re-link an already active asset again (active → active is not a transition).
    await http.post(`/v1/me/assets/${assetId}/relink`).set(auth(user)).send({ evidenceId: second.reestablishedEvidenceId }).expect(422);

    const pubRestored = await http.get(`/public/reports/${reportId}?token=${token}`).expect(200);
    assert.equal(pubRestored.body.data.professionalAssets.length, 1);
    assert.equal(pubRestored.body.data.skills.length, 1);
  });

  test('NEGATIVE: at the database, a user may only WITHDRAW their own evidence — never edit or delete it, never touch another user’s', async () => {
    const a = await newUser(); const b = await newUser();
    await http.post('/v1/me/bootstrap').set(auth(a)).send({}).expect(201);
    await http.post('/v1/me/bootstrap').set(auth(b)).send({}).expect(201);
    await http.put('/v1/me/career-goal').set(auth(a)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
    const ev = await demonstrated(a, 'x');
    const evidenceId = ev.transition!.evidenceId;

    await asAuthenticatedUser(pool, b.id, async (c) => {
      const r = await c.query(`update evidence set withdrawn_at = now(), withdrawn_reason = 'not mine' where id = $1`, [evidenceId]);
      assert.equal(r.rowCount, 0, 'another user: zero rows');
      const d = await c.query('delete from evidence where id = $1', [evidenceId]);
      assert.equal(d.rowCount, 0);
    });
    await asAuthenticatedUser(pool, a.id, async (c) => {
      const d = await c.query('delete from evidence where id = $1', [evidenceId]);
      assert.equal(d.rowCount, 0, 'the owner cannot delete evidence');
      await expectRejected(c, `update evidence set confidence = 0.1 where id = $1`, [evidenceId], /row-level security|permission denied/);
      const ok = await c.query(`update evidence set withdrawn_at = now(), withdrawn_reason = 'my choice' where id = $1`, [evidenceId]);
      assert.equal(ok.rowCount, 1, 'the owner may withdraw with a reason');
    });
    const untouched = await pool.query('select withdrawn_at from evidence where id = $1', [evidenceId]);
    assert.equal(untouched.rows[0].withdrawn_at, null, 'the RLS proof ran inside a rolled-back transaction');
  });
});
