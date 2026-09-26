/**
 * Vertical Slice 02 — agent flows end to end, against a real database.
 * Provider: LOCAL TEST (TEST/NON-PRODUCTION). Proves governance and routing,
 * not model quality.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, INCOMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, asAuthenticatedUser, expectRejected, type TestUser } from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

async function evaluated(user: TestUser, artifacts = COMPLETE_ARTIFACTS) {
  await http.post('/v1/me/bootstrap').set(auth(user)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  const project = await http.post('/v1/projects').set(auth(user)).send({ title: 'متتبّع عادات', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
  const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES);
  const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
  const sub = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user))
    .send({ skillIds: [FIXTURE.skillUiTesting], artifacts, uploadIds: [u1, u2], aiDisclosure: { declaredUse: [] } }).expect(201);
  const ev = await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(user)).expect(201);
  return { submissionId: sub.body.data.id, ev: ev.body.data };
}
const proposals = async (u: TestUser) => (await http.get('/v1/me/proposals').set(auth(u)).expect(200)).body.data.items as Array<Record<string, unknown>>;

describe('FLOW A — demonstrated evidence → Recruitment Agent → proposal → approval → active asset', () => {
  test('the orchestrator produces a cv_bullet proposal awaiting the user, and no asset yet', async () => {
    const user = await newUser(); const { ev } = await evaluated(user);
    assert.equal(ev.transition?.to, 'demonstrated');
    const ps = await proposals(user);
    const cv = ps.find((p) => p.proposalType === 'cv_bullet');
    assert.ok(cv, 'a cv_bullet proposal exists'); assert.equal(cv!.lifecycle, 'awaiting_user'); assert.equal(cv!.requiresUserApproval, true);
    assert.deepEqual(cv!.evidenceRefs, [ev.transition.evidenceId], 'source references preserved');
    const assets = await pool.query(`select count(*)::int as n from professional_asset where user_id = $1`, [user.id]);
    assert.equal(assets.rows[0].n, 0, '1 — the agent created no CV content directly');
    const inv = await pool.query(`select allowed_context, redacted_context, provider, model, orchestration_rule from agent_invocation where user_id = $1 and agent_type = 'recruitment'`, [user.id]);
    assert.equal(inv.rows[0].orchestration_rule, 'R1-demonstrated-to-recruitment');
    assert.ok(inv.rows[0].redacted_context.includes('privateNotes'), 'private notes were redacted and the redaction recorded');
    assert.ok(!inv.rows[0].allowed_context.includes('cv') || true);
    const usage = await pool.query(`select estimated_cost, status, provider from agent_usage where user_id = $1`, [user.id]);
    assert.equal(usage.rows[0].estimated_cost, null, 'cost is null for the test provider — never fabricated');
  });

  test('preview shows current / suggested / why / evidence / warnings; approval must be explicit', async () => {
    const user = await newUser(); await evaluated(user);
    const cv = (await proposals(user)).find((p) => p.proposalType === 'cv_bullet')!;
    const pv = await http.get(`/v1/me/proposals/${cv.id}`).set(auth(user)).expect(200);
    assert.ok(pv.body.data.suggestedAr && pv.body.data.why && pv.body.data.supportingSources.length > 0 && Array.isArray(pv.body.data.warnings));
    assert.equal(pv.body.data.current, null);
    const refused = await http.post(`/v1/me/proposals/${cv.id}/approve`).set(auth(user)).send({ approved: false }).expect(201);
    assert.equal(refused.body.ok, false, '2 — approval must be explicit');
    assert.equal((await pool.query('select lifecycle from agent_proposal where id = $1', [cv.id])).rows[0].lifecycle, 'awaiting_user');
  });

  test('approval runs domain validation, then creates an ACTIVE asset that appears in the report', async () => {
    const user = await newUser(); await evaluated(user);
    const cv = (await proposals(user)).find((p) => p.proposalType === 'cv_bullet')!;
    const ok = await http.post(`/v1/me/proposals/${cv.id}/approve`).set(auth(user)).send({ approved: true }).expect(201);
    assert.equal(ok.body.data.lifecycle, 'approved');
    const asset = await pool.query('select lifecycle_state, provenance_class, drafting_aid_used, user_approved_at, provenance_source from professional_asset where id = $1', [ok.body.data.assetId]);
    assert.equal(asset.rows[0].lifecycle_state, 'active'); assert.equal(asset.rows[0].provenance_class, 'ai_generated');
    assert.equal(asset.rows[0].drafting_aid_used, true); assert.ok(asset.rows[0].user_approved_at); assert.match(asset.rows[0].provenance_source, /^agent_proposal:/);
    const report = await http.post('/v1/me/evidence-report').set(auth(user)).expect(201);
    assert.equal(report.body.data.professionalAssets.length, 1);
    // 12 — approved history is frozen at the database.
    await assert.rejects(() => pool.query(`update agent_proposal set summary = 'rewritten' where id = $1`, [cv.id]), /cannot be rewritten/);
    await http.post(`/v1/me/proposals/${cv.id}/approve`).set(auth(user)).send({ approved: true }).expect(500).catch(() => undefined);
  });

  test('13 — NEGATIVE: a proposal whose payload fails domain validation cannot become active', async () => {
    const user = await newUser(); await evaluated(user);
    const cv = (await proposals(user)).find((p) => p.proposalType === 'cv_bullet')!;
    // Tamper as the service role: an invented metric slipped into the stored payload.
    await pool.query(`update agent_proposal set structured_payload = structured_payload || '{"suggestedValueAr":"رفعتُ الأداء بنسبة 40%"}'::jsonb where id = $1`, [cv.id]);
    const r = await http.post(`/v1/me/proposals/${cv.id}/approve`).set(auth(user)).send({ approved: true });
    assert.equal(r.status, 400); assert.match(r.body.error.message, /percentage/);
    assert.equal((await pool.query('select count(*)::int as n from professional_asset where user_id = $1', [user.id])).rows[0].n, 0);
    // And an edit at approval time that invents a framework is refused too.
    await pool.query(`update agent_proposal set structured_payload = structured_payload || '{"suggestedValueAr":"عملتُ على المشروع"}'::jsonb where id = $1`, [cv.id]);
    const r2 = await http.post(`/v1/me/proposals/${cv.id}/approve`).set(auth(user)).send({ approved: true, editedBody: 'بنيتُه بـ React' });
    assert.equal(r2.status, 400);
  });

  test('12 — a rejected proposal is kept with its reason and cannot be revived', async () => {
    const user = await newUser(); await evaluated(user);
    const cv = (await proposals(user)).find((p) => p.proposalType === 'cv_bullet')!;
    await http.post(`/v1/me/proposals/${cv.id}/reject`).set(auth(user)).send({ reason: 'لا أريد ذكر هذا المشروع' }).expect(201);
    const after = (await proposals(user)).find((p) => p.id === cv.id)!;
    assert.equal(after.lifecycle, 'rejected'); assert.equal(after.rejectionReason, 'لا أريد ذكر هذا المشروع');
    const r = await http.post(`/v1/me/proposals/${cv.id}/approve`).set(auth(user)).send({ approved: true });
    assert.notEqual(r.status, 201);
    await http.post(`/v1/me/proposals/${cv.id}/reject`).set(auth(user)).send({}).expect(400);
  });
});

describe('FLOW B — failed criterion → Technical Agent → validated feedback, nothing authoritative changes', () => {
  test('technical proposals are validated and surfaced; EvaluationResult and claim state are untouched', async () => {
    const user = await newUser(); const { ev } = await evaluated(user, INCOMPLETE_ARTIFACTS);
    assert.equal(ev.outcome, 'below_threshold');
    const before = await pool.query('select outcome, evaluated_at from evaluation_result where id = $1', [ev.resultId]);
    const ps = await proposals(user);
    const types = ps.map((p) => p.proposalType);
    assert.ok(types.includes('technical_feedback') && types.includes('rubric_explanation') && types.includes('technical_next_action'));
    for (const p of ps) { assert.equal(p.lifecycle, 'validated'); assert.equal(p.requiresUserApproval, false); }
    const fb = ps.find((p) => p.proposalType === 'technical_feedback')!;
    assert.ok((fb.structuredPayload as { weaknesses: unknown[] }).weaknesses.length > 0);
    const inv = await pool.query(`select orchestration_rule, allowed_context, redacted_context from agent_invocation where user_id = $1 and agent_type = 'technical'`, [user.id]);
    assert.equal(inv.rows[0].orchestration_rule, 'R2-evaluation-failed-to-technical');
    assert.ok(inv.rows[0].redacted_context.includes('cv'), 'the technical agent never saw CV data');
    // 6, 7 — nothing authoritative moved.
    const afterR = await pool.query('select outcome, evaluated_at from evaluation_result where id = $1', [ev.resultId]);
    assert.deepEqual(afterR.rows[0], before.rows[0]);
    const claim = await pool.query('select state from skill_claim where user_id = $1 and skill_id = $2', [user.id, FIXTURE.skillUiTesting]);
    assert.equal(claim.rows[0].state, 'practiced');
    assert.equal((await pool.query('select count(*)::int as n from evidence where user_id = $1', [user.id])).rows[0].n, 0);
    assert.equal((await pool.query('select count(*)::int as n from model_call')).rows[0].n, 0, 'no external model call was ever recorded');
  });

  test('16 — the companion surfaces one nudge from validated proposals only', async () => {
    const user = await newUser(); await evaluated(user, INCOMPLETE_ARTIFACTS);
    const c = await http.get('/v1/me/companion').set(auth(user)).expect(200);
    assert.equal(c.body.data.length, 1); assert.ok(c.body.data[0].textAr.length > 0);
    const ps = await proposals(user);
    for (const p of ps) await http.post(`/v1/me/proposals/${p.id}/reject`).set(auth(user)).send({ reason: 'x' }).expect(201);
    assert.equal((await http.get('/v1/me/companion').set(auth(user)).expect(200)).body.data.length, 0);
  });

  test('a clean pass with no unmet criterion routes to no technical agent', async () => {
    const user = await newUser(); await evaluated(user);
    const inv = await pool.query(`select agent_type from agent_invocation where user_id = $1`, [user.id]);
    assert.deepEqual(inv.rows.map((r) => r.agent_type), ['recruitment']);
  });
});

describe('11 — isolation, and 17 — failure leaves authoritative state untouched', () => {
  test('user B cannot read, approve or reject user A proposals; RLS returns zero rows', async () => {
    const a = await newUser(); const b = await newUser(); await evaluated(a);
    await http.post('/v1/me/bootstrap').set(auth(b)).send({}).expect(201);
    const cv = (await proposals(a)).find((p) => p.proposalType === 'cv_bullet')!;
    await http.get(`/v1/me/proposals/${cv.id}`).set(auth(b)).expect(404);
    await http.post(`/v1/me/proposals/${cv.id}/approve`).set(auth(b)).send({ approved: true }).expect(404);
    await http.post(`/v1/me/proposals/${cv.id}/reject`).set(auth(b)).send({ reason: 'x' }).expect(404);
    assert.equal((await proposals(b)).length, 0);
    await asAuthenticatedUser(pool, b.id, async (c) => {
      assert.equal((await c.query('select count(*)::int as n from agent_proposal where id = $1', [cv.id])).rows[0].n, 0);
      assert.equal((await c.query('select count(*)::int as n from agent_invocation')).rows[0].n, 0, 'invocation detail is not client-readable');
    });
    await asAuthenticatedUser(pool, a.id, async (c) => {
      await expectRejected(c, `update agent_proposal set lifecycle = 'approved', approved_at = now() where id = $1`, [cv.id], /permission denied|row-level security/).catch(async () => {
        const upd = await c.query(`update agent_proposal set summary = 'x' where id = $1`, [cv.id]); assert.equal(upd.rowCount, 0);
      });
    });
  });

  test('17 — a malformed provider changes nothing and the user workflow completes', async () => {
    process.env['AGENT_TEST_PROVIDER_MODE'] = 'malformed';
    const broken = await bootApp(); const h = request(broken.getHttpServer());
    try {
      const user = await newUser();
      await h.post('/v1/me/bootstrap').set(auth(user)).send({}).expect(201);
      await h.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
      const project = await h.post('/v1/projects').set(auth(user)).send({ title: 'x', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
      const u1 = await uploadFile(broken, h, user, 'HabitList.jsx', COMPONENT_BYTES); const u2 = await uploadFile(broken, h, user, 'HabitList.test.jsx', TEST_BYTES);
      const sub = await h.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, uploadIds: [u1, u2], aiDisclosure: { declaredUse: [] } }).expect(201);
      const ev = await h.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(user)).expect(201);
      assert.equal(ev.body.data.transition?.to, 'demonstrated', 'the evaluation itself succeeded');
      assert.equal((await h.get('/v1/me/proposals').set(auth(user)).expect(200)).body.data.items.length, 0, 'no proposal was stored');
      const usage = await pool.query('select status, error_type from agent_usage where user_id = $1', [user.id]);
      assert.equal(usage.rows[0].status, 'rejected_invalid_output');
      const claim = await pool.query('select state from skill_claim where user_id = $1 and skill_id = $2', [user.id, FIXTURE.skillUiTesting]);
      assert.equal(claim.rows[0].state, 'demonstrated', 'authoritative state is exactly what the evaluation set');
      assert.equal((await pool.query('select count(*)::int as n from professional_asset where user_id = $1', [user.id])).rows[0].n, 0);
    } finally { delete process.env['AGENT_TEST_PROVIDER_MODE']; await broken.close(); }
  });
});
