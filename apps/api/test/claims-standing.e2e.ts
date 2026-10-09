/**
 * Phase 7b (D-115 · CHG-016: BR-026, DR-019) — Claim-to-Fact grounding through
 * the product, and the current standing of approved assets.
 *
 *   - wording is approved only when every assertion rests on a cited record;
 *   - the approval is history and never rewritten;
 *   - when the claim policy in effect changes, approved assets are re-checked in
 *     the same transaction, or the change does not happen at all;
 *   - a change made outside that path cannot leave assets shown: the
 *     presentation gate fails closed until they are re-checked.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, approveCvBulletProposal, asAuthenticatedUser, type TestUser, filesFor } from './helpers';
import { cliActivate, cliApprove, cliRevalidateClaims } from '../src/configuration/config-admin.service';
import { resolveGroundingLexicon } from '../src/agents/claim-facts';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

async function demonstrated(user: TestUser, title: string) {
  const project = await http.post('/v1/projects').set(auth(user)).send({ title, kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
  const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES);
  const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
  const sub = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user))
    .send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, files: filesFor([u1, u2]), aiDisclosure: { declaredUse: [] } }).expect(201);
  const ev = await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(user)).expect(201);
  return ev.body.data as { outcome: string; transition: { to: string; evidenceId: string } | null; reestablishedEvidenceId: string | null };
}
async function userWithBullet(title = 'متتبّع عادات') {
  const user = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(user)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  const ev = await demonstrated(user, title);
  const approved = await approveCvBulletProposal(http, user);
  return { user, evidenceId: ev.transition!.evidenceId, ...approved };
}
const reportAssets = async (u: TestUser) => (await http.post('/v1/me/evidence-report').set(auth(u)).expect(201)).body.data.professionalAssets as unknown[];
const asset = async (id: string) => (await pool.query('select lifecycle_state, evidence_backed, body, body_en, user_approved_at, claim_policy_id, claim_policy_ref, standing_policy_id from professional_asset where id = $1', [id])).rows[0];
const standing = async (id: string) => (await pool.query('select cause, eligible, new_state, claim_policy_ref from asset_standing_event where asset_id = $1 order by created_at, id', [id])).rows;
const admin = async (sql: string, params: unknown[] = []) => {
  const c = await pool.connect();
  try { await c.query('begin'); await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'Phase 7b standing test', true)"); const r = await c.query(sql, params); await c.query('commit'); return r; }
  catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
};
/** A new approved cv_bullet policy version (inactive until activated). */
async function approvedPolicy(version: number, over: { level: string; strength?: string | null }) {
  const id = (await admin(`insert into claim_policy (key, version, claim_kind, description_en, min_evidence_level, min_source_strength) values ('e2e_standing', $1, 'cv_bullet', 'e2e', $2, $3) returning id`,
    [version, over.level, over.strength ?? null])).rows[0].id as string;
  await cliApprove(pool, { table: 'claim_policy', id, approvedBy: 'e2e-sme', approvedByLabel: 'e2e SME', reason: 'Phase 7b standing test' });
  return id;
}
const activate = (id: string, activation: 'production_active' | 'inactive') => cliActivate(pool, { table: 'claim_policy', id, activation, actor: 'e2e', reason: 'Phase 7b standing test' });

describe('grounding through the product — unsupported wording is refused and explained; the original draft is kept', () => {
  test('stored drafts carry their grounding result; the automatic bullet is grounded by a declared plan', async () => {
    const user = await newUser();
    await http.post('/v1/me/bootstrap').set(auth(user)).send({}).expect(201);
    await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
    await demonstrated(user, 'متتبّع عادات');
    const row = (await pool.query(`select id, grounding_status, grounding_result, grounding_version from agent_proposal where user_id = $1 and proposal_type = 'cv_bullet'`, [user.id])).rows[0];
    assert.equal(row.grounding_status, 'grounded');
    assert.equal(row.grounding_result.decision, 'grounded'); assert.equal(row.grounding_result.mode, 'declared_plan');
    assert.match(row.grounding_version, /^claim-grounding@1\+default@1$/);
    assert.ok(row.grounding_result.assertions.every((a: { factIds: string[] }) => a.factIds.length > 0), 'every declared assertion cites recorded facts');
    const pv = (await http.get(`/v1/me/proposals/${row.id}`).set(auth(user)).expect(200)).body.data;
    assert.equal(pv.claim.grounding.now.decision, 'grounded'); assert.equal(pv.claim.eligibleNow, true);
  });

  test('edits: invented employer, credential, client, technology, metric, outcome and paraphrased outcome are refused; a supported description passes', async () => {
    const { user } = await (async () => {
      const u = await newUser();
      await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
      await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
      await demonstrated(u, 'متتبّع عادات'); return { user: u };
    })();
    const id = (await pool.query(`select id from agent_proposal where user_id = $1 and proposal_type = 'cv_bullet'`, [user.id])).rows[0].id as string;
    await http.get(`/v1/me/proposals/${id}`).set(auth(user)).expect(200);
    const original = (await pool.query('select structured_payload from agent_proposal where id = $1', [id])).rows[0].structured_payload;
    const refusedEdits: [string, RegExp][] = [
      ['بنيتُ «متتبّع عادات» في شركة أكمي', /needs revision|refused/],
      ['بنيتُ «متتبّع عادات» وأنا حاصلة على شهادة معتمدة', /refused/],
      ['بنيتُ «متتبّع عادات» لعميل', /refused/],
      ['بنيتُ «متتبّع عادات» بـ Vue', /refused/],
      ['بنيتُ «متتبّع عادات» واستخدمه 500 طالب', /refused/],
      ['بنيتُ «متتبّع عادات»، ما جعل تهيئة المستخدمين الجدد أسلس', /refused/],
      ['بنيتُ «متتبّع عادات» فصار المستخدمون الجدد يبدؤون دون عناء', /needs revision/],
      ['كتبتُ اختبار الحالة الفارغة، وأضفتُ مؤشّرًا للتقدّم الأسبوعي', /needs revision/],
    ];
    let byGrounding = 0;
    for (const [editedBody, re] of refusedEdits) {
      const r = await http.post(`/v1/me/proposals/${id}/approve`).set(auth(user)).send({ approved: true, editedBody }).expect(400);
      // Defence in depth: the existing deterministic guards may refuse first; otherwise grounding refuses.
      assert.match(r.body.error.message, /claim grounding|domain validation/, editedBody);
      if (/claim grounding/.test(r.body.error.message)) { byGrounding++; assert.match(r.body.error.message, re, editedBody); }
    }
    // Exactly the three that no fixed pattern catches — an Arabic employer, a paraphrased outcome, a partly supported
    // clause — are stopped by grounding itself; the other five are stopped earlier by the deterministic guards.
    assert.equal(byGrounding, 3, 'grounding itself refuses the ones no fixed pattern catches');
    const events = (await pool.query(`select event, grounding_result from claim_draft_event where proposal_id = $1 and event = 'edit_refused' order by created_at, id`, [id])).rows;
    assert.equal(events.length, byGrounding, 'every edit refused by grounding is recorded with its grounding result');
    const partial = events[events.length - 1]!.grounding_result;
    assert.equal(partial.decision, 'needs_revision'); assert.ok(partial.suggestedTrim?.ar.includes('اختبار الحالة الفارغة') && !partial.suggestedTrim.ar.includes('مؤشّر'), 'the trim keeps the supported clause only');
    assert.ok(partial.issues.every((i: { ar: string }) => i.ar.length > 0), 'explained in Arabic');
    const still = (await pool.query('select lifecycle, structured_payload from agent_proposal where id = $1', [id])).rows[0];
    assert.equal(still.lifecycle, 'awaiting_user'); assert.deepEqual(still.structured_payload, original, 'the original draft is unchanged');
    // The user's own, supported description is approved.
    const ok = await http.post(`/v1/me/proposals/${id}/approve`).set(auth(user)).send({ approved: true, editedBody: 'بنيتُ «متتبّع عادات» مع اختبار الحالة الفارغة واختبار حالة التحميل.' }).expect(201);
    assert.equal(ok.body.data.userEdited, true);
  });
});

describe('approval is history — never rewritten', () => {
  test('an approved asset cannot be rewritten in the database; standing changes are events beside it', async () => {
    const { user, assetId } = await userWithBullet();
    await assert.rejects(() => pool.query(`update professional_asset set body = 'rewritten' where id = $1`, [assetId]), /approval is history/);
    await assert.rejects(() => pool.query(`update professional_asset set user_approved_at = now() where id = $1`, [assetId]), /approval is history/);
    await asAuthenticatedUser(pool, user.id, async (c) => {
      assert.equal((await c.query('select count(*)::int as n from asset_standing_event')).rows[0].n, 0, 'nothing has changed yet');
    });
  });

  test('withdrawn evidence: standing event; re-link to a different project\'s evidence is refused by grounding; the asset stays in review', async () => {
    const { user, evidenceId, assetId } = await userWithBullet('متتبّع عادات');
    await http.post(`/v1/evidence/${evidenceId}/withdraw`).set(auth(user)).send({ reason: 'ليس عملي وحدي' }).expect(201);
    assert.deepEqual((await standing(assetId)).map((e) => `${e.cause}:${e.new_state}`), ['evidence_withdrawn:needs_review']);
    await assert.rejects(() => pool.query(`update asset_standing_event set reason = 'x' where asset_id = $1`, [assetId]), /append-only/);
    const redo = await demonstrated(user, 'مشروع آخر مختلف');
    const r = await http.post(`/v1/me/assets/${assetId}/relink`).set(auth(user)).send({ evidenceId: redo.reestablishedEvidenceId }).expect(400);
    assert.match(r.body.error.message, /claim grounding/, 'the bullet names «متتبّع عادات»; the new evidence records another project');
    const a = await asset(assetId);
    assert.equal(a.lifecycle_state, 'needs_review'); assert.ok(a.user_approved_at); assert.match(a.body, /متتبّع عادات/);
    assert.equal((await reportAssets(user)).length, 0);
  });
});

describe('policy activation re-checks approved assets atomically', () => {
  test('a policy that still accepts them keeps them shown (standing updated); a stricter one moves them to review and out of reports and share links; deactivating never restores', async () => {
    const { user, assetId } = await userWithBullet();
    const report = await http.post('/v1/me/evidence-report').set(auth(user)).expect(201);
    const reportId = report.body.data.id as string;
    const link = await http.post('/v1/share-links').set(auth(user)).send({ resourceKind: 'recruiter_report', resourceId: reportId, expiresInDays: 7 }).expect(201);
    const pub = async () => (await http.get(`/public/reports/${reportId}?token=${link.body.data.token}`).expect(200)).body.data.professionalAssets.length as number;
    assert.equal(await pub(), 1);
    const before = await asset(assetId);

    const lenient = await approvedPolicy(1, { level: 'demonstrated', strength: 'platform_controlled' });
    const strict = await approvedPolicy(2, { level: 'verified' });
    try {
      await activate(lenient, 'production_active');
      let a = await asset(assetId);
      assert.equal(a.lifecycle_state, 'active'); assert.equal(a.standing_policy_id, lenient, 're-verified under the policy now in effect');
      assert.equal((await reportAssets(user)).length, 1); assert.equal(await pub(), 1);
      await activate(lenient, 'inactive');
      await activate(strict, 'production_active');
      a = await asset(assetId);
      assert.equal(a.lifecycle_state, 'needs_review'); assert.equal(a.evidence_backed, false);
      assert.equal((await reportAssets(user)).length, 0, 'recruiter report no longer presents it');
      assert.equal(await pub(), 0, 'the live share link no longer presents it');
      // The approval itself is untouched.
      assert.deepEqual([a.body, a.body_en, String(a.user_approved_at), a.claim_policy_id, a.claim_policy_ref], [before.body, before.body_en, String(before.user_approved_at), before.claim_policy_id, before.claim_policy_ref]);
      const ev = await standing(assetId);
      assert.deepEqual(ev.map((e) => `${e.cause}:${e.eligible}:${e.new_state}`), ['policy_activation:true:active', 'policy_activation:true:active', 'policy_activation:false:needs_review']);
      assert.match(ev[2]!.claim_policy_ref, /e2e_standing@2 \(production_active\)/);
      assert.equal((await pool.query(`select count(*)::int as n from notification where user_id = $1 and body_ar like '%قاعدة سابقة%'`, [user.id])).rows[0].n, 1);
    } finally {
      for (const id of [lenient, strict]) await activate(id, 'inactive').catch(() => undefined);
    }
    // Rolling the policy back does not approve anything back: the asset stays in review until the user acts.
    assert.equal((await asset(assetId)).lifecycle_state, 'needs_review');
    assert.equal((await reportAssets(user)).length, 0);
  });

  test('if the re-check cannot complete, the activation does not happen (atomic)', async () => {
    const { user, assetId } = await userWithBullet();
    const strict = await approvedPolicy(3, { level: 'verified' });
    await pool.query(`create or replace function e2e_fail_standing() returns trigger language plpgsql as $$ begin raise exception 'e2e: standing store unavailable'; end $$`);
    await pool.query(`create trigger e2e_fail_standing before insert on asset_standing_event for each row execute function e2e_fail_standing()`);
    try {
      await assert.rejects(() => activate(strict, 'production_active'), /standing store unavailable/);
    } finally {
      await pool.query('drop trigger e2e_fail_standing on asset_standing_event'); await pool.query('drop function e2e_fail_standing()');
    }
    const p = (await pool.query('select activation from claim_policy where id = $1', [strict])).rows[0];
    assert.equal(p.activation, 'inactive', 'the policy did not become active');
    assert.equal((await pool.query(`select count(*)::int as n from config_change where entity_id = $1 and field = 'activation'`, [strict])).rows[0].n, 0, 'no activation was recorded');
    assert.equal((await asset(assetId)).lifecycle_state, 'active');
    assert.equal((await reportAssets(user)).length, 1, 'still presented under the unchanged policy');
  });

  test('a change made outside the audited path fails closed: assets disappear from reports until re-checked', async () => {
    const { user, assetId } = await userWithBullet();
    const lenient = await approvedPolicy(4, { level: 'demonstrated', strength: 'platform_controlled' });
    try {
      await admin(`update claim_policy set activation = 'production_active' where id = $1`, [lenient]); // raw SQL: no re-check ran
      assert.equal((await asset(assetId)).lifecycle_state, 'active', 'nothing was rewritten');
      assert.equal((await reportAssets(user)).length, 0, 'not verified under the policy now in effect ⇒ not presented');
      const r = await cliRevalidateClaims(pool, { claimKind: 'cv_bullet', actor: 'e2e' });
      assert.ok(r.checked >= 1);
      assert.equal((await asset(assetId)).standing_policy_id, lenient);
      assert.equal((await reportAssets(user)).length, 1, 'presented again once verified under it');
      await admin(`update claim_policy set activation = 'inactive' where id = $1`, [lenient]); // raw rollback
      assert.equal((await reportAssets(user)).length, 0, 'verified under a policy no longer in effect ⇒ hidden again');
      await cliRevalidateClaims(pool, { claimKind: 'cv_bullet', actor: 'e2e' });
      assert.equal((await reportAssets(user)).length, 1);
      assert.ok((await standing(assetId)).every((e) => e.cause === 'revalidation_run' && e.eligible));
    } finally {
      await admin(`update claim_policy set activation = 'inactive' where id = $1 and activation <> 'inactive'`, [lenient]);
    }
  });
});

describe('production activation guards', () => {
  test('a DRAFT claim policy cannot become production_active; a draft grounding vocabulary never resolves in production', async () => {
    const id = (await admin(`insert into claim_policy (key, version, claim_kind, description_en, min_evidence_level) values ('e2e_standing', 9, 'cv_bullet', 'draft', 'demonstrated') returning id`)).rows[0].id;
    await assert.rejects(() => activate(id, 'production_active'), /approv|validated|DRAFT/i);
    await assert.rejects(() => admin(`update claim_policy set activation = 'production_active' where id = $1`, [id]), /production_active requires/);
    const prev = process.env['NODE_ENV'];
    const c = await pool.connect();
    try {
      process.env['NODE_ENV'] = 'production';
      assert.equal(await resolveGroundingLexicon(c), null, 'production: no validated vocabulary ⇒ grounding fails closed');
      process.env['NODE_ENV'] = prev ?? 'test';
      assert.equal((await resolveGroundingLexicon(c))?.resolution, 'development_only');
    } finally { process.env['NODE_ENV'] = prev; c.release(); }
    await assert.rejects(() => admin(`update grounding_lexicon_entry set form = 'x' where lexicon_id = (select id from grounding_lexicon where key = 'default' and version = 1)`), /immutable/,
      'the active vocabulary is frozen; a change is a new version');
  });
});
