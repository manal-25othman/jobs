/**
 * Phase 9 — owner requirement 1: the safe deployment procedure for the
 * grounding-version change, end to end, on a scratch database.
 *
 *   1. pre-deployment count (claims-standing)
 *   2. dry run of the re-grounding (same code path, rolled back — nothing written)
 *   3. execution only by an authorized operator (product_owner grant)
 *   4. post-execution reconciliation of every affected asset
 *   5. recruiter reports and public share links expose only currently eligible assets
 *   6. failure and recovery: a refused or failed run changes nothing
 *
 * Historical assets are simulated as rows approved before migration 0020
 * (grounding_version null): one whose wording its records support, one whose
 * wording they do not. Nothing is ever marked grounded without being grounded.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, approveCvBulletProposal, type TestUser, filesFor } from './helpers';
import { cliRegroundAssets, cliGroundingStanding, cliFreezePublicGrounding } from '../src/configuration/config-admin.service';
import { reconcileGrounding, type GroundingSnapshot } from '../src/agents/asset-standing';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
let user: TestUser; let po: TestUser; let smeOnly: TestUser;
let supported = ''; let unsupported = ''; let reportId = ''; let token = '';
let caseSupported = ''; let caseUnsupported = '';
const UNSUPPORTED_AR = 'بنيتُ «متتبّع عادات» لعميل حقيقي وحسّنتُ أداءه بنسبة 40%';

async function person(roles: string[]): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  for (const r of roles) await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, $2, 'e2e operator')`, [u.id, r]);
  return u;
}
const reportBodies = async () => ((await http.post('/v1/me/evidence-report').set(auth(user)).expect(201)).body.data.professionalAssets as { body: string }[]).map((a) => a.body);
const publicBodies = async () => ((await http.get(`/public/reports/${reportId}?token=${token}`).expect(200)).body.data.professionalAssets as { body: string }[]).map((a) => a.body);
/** As the anonymous role (RLS applies): which of our two case studies a share link opens. */
async function anonCaseStudies(): Promise<string[]> {
  const c = await pool.connect();
  try {
    await c.query('begin'); await c.query('set local role anon');
    return (await c.query('select id from case_study where id = any($1::uuid[]) order by id', [[caseSupported, caseUnsupported]])).rows.map((r) => String(r.id));
  } finally { await c.query('rollback'); c.release(); }
}
const counts = async () => ({
  events: Number((await one('select count(*)::int n from asset_standing_event where asset_id = any($1::uuid[])', [[supported, unsupported]])).n),
  notifications: Number((await one('select count(*)::int n from notification where user_id = $1', [user.id])).n),
  publicLog: Number((await one('select count(*)::int n from grounding_public_state_log')).n),
});

before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  po = await person(['product_owner']); smeOnly = await person(['sme', 'track_admin']);
  user = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(user)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  const project = await http.post('/v1/projects').set(auth(user)).send({ title: 'متتبّع عادات', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
  const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES); const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
  const sub = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, files: filesFor([u1, u2]), aiDisclosure: { declaredUse: [] } }).expect(201);
  await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(user)).expect(201);
  supported = (await approveCvBulletProposal(http, user)).assetId;
  // Historical: approved before 0020 — no grounding version recorded.
  await pool.query('update professional_asset set grounding_version = null where id = $1', [supported]);
  // Historical and UNSUPPORTED: approved before grounding existed, citing the same evidence, claiming a client and a number no record holds.
  const a = await one('select * from professional_asset where id = $1', [supported]);
  unsupported = (await one(`insert into professional_asset (user_id, kind, title, body, status, provenance_class, provenance_source, drafting_aid_used, privacy_class, user_approved_at,
      lifecycle_state, skill_id, project_id, evaluation_result_id, evidence_backed, claim_policy_id, claim_policy_ref, standing_policy_id, grounding_version)
    values ($1,'cv_bullet',$2,$3,$4,$5,$6,$7,$8, now() - interval '30 days', 'active', $9,$10,$11, true, $12,$13,$14, null) returning id`,
    [user.id, a.title, UNSUPPORTED_AR, a.status, a.provenance_class, 'historical import (pre-grounding)', a.drafting_aid_used, a.privacy_class, a.skill_id, a.project_id, a.evaluation_result_id,
     a.claim_policy_id, a.claim_policy_ref, a.standing_policy_id])).id;
  await pool.query('insert into asset_evidence (asset_id, evidence_id) select $2, evidence_id from asset_evidence where asset_id = $1', [supported, unsupported]);
  // A recruiter-report share link (served through the API gate)…
  reportId = (await http.post('/v1/me/evidence-report').set(auth(user)).expect(201)).body.data.id;
  token = (await http.post('/v1/share-links').set(auth(user)).send({ resourceKind: 'recruiter_report', resourceId: reportId, expiresInDays: 7 }).expect(201)).body.data.token;
  // …and the one direct public path: case-study share links (anon, RLS).
  const er = a.evaluation_result_id ?? (await one('select e.evaluation_result_id from evidence e join asset_evidence ae on ae.evidence_id = e.id where ae.asset_id = $1 limit 1', [supported])).evaluation_result_id;
  for (const [asset, set] of [[supported, (v: string) => { caseSupported = v; }], [unsupported, (v: string) => { caseUnsupported = v; }]] as const) {
    const cs = (await one(`insert into case_study (user_id, asset_id, context, problem, what_i_built, result, source_evaluation_result_id) values ($1,$2,'c','p','w','r',$3) returning id`, [user.id, asset, er])).id;
    set(String(cs));
    await pool.query(`insert into share_link (user_id, resource_kind, resource_id, token_hash, expires_at) values ($1,'case_study',$2,$3, now() + interval '7 days')`, [user.id, cs, `e2e-${cs}`]);
  }
});
after(async () => { await pool?.end(); await app?.close(); });

describe('re-grounding deployment procedure', () => {
  let before0: Awaited<ReturnType<typeof cliGroundingStanding>>;

  test('1 · pre-deployment count; historical assets are hidden everywhere until re-grounded (fail closed)', async () => {
    before0 = await cliGroundingStanding(pool);
    assert.ok(before0.withoutVersion >= 2, 'both historical assets are counted without a grounding version');
    assert.equal(before0.currentVersion, 'claim-grounding@1+default@1');
    assert.deepEqual(await reportBodies(), [], 'the private report hides them');
    assert.deepEqual(await publicBodies(), [], 'the recruiter share link hides them');
    assert.deepEqual(await anonCaseStudies(), [], 'no case-study share link opens');
  });

  test('2 · dry run: the plan names who stays and who would move — and writes nothing', async () => {
    const c0 = await counts();
    const plan = await cliRegroundAssets(pool, { dryRun: true });
    assert.equal(plan.dryRun, true); assert.equal(plan.operator, null);
    const d = (id: string) => plan.regrounding.details.find((x) => x.assetId === id);
    assert.equal(d(supported)?.outcome, 'grounded'); assert.equal(d(supported)?.previousVersion, null);
    assert.equal(d(unsupported)?.outcome, 'needs_review'); assert.ok(d(unsupported)!.issues.length > 0, 'the reason is named');
    assert.equal(plan.reconciliation.ok, true, plan.reconciliation.problems.join('; '));
    // Nothing written.
    for (const id of [supported, unsupported]) {
      const r = await one('select lifecycle_state, grounding_version from professional_asset where id = $1', [id]);
      assert.deepEqual([r.lifecycle_state, r.grounding_version], ['active', null]);
    }
    assert.deepEqual(await counts(), c0, 'no standing event, notification or public-state change');
  });

  test('3 · execution needs an authorized operator; a refused run changes nothing', async () => {
    const c0 = await counts();
    await assert.rejects(() => cliRegroundAssets(pool, { dryRun: false, reason: 'deploy' }), /authorized operator is required/);
    await assert.rejects(() => cliRegroundAssets(pool, { dryRun: false, operatorId: smeOnly.id, reason: 'deploy' }), /holds no active product_owner grant/);
    await assert.rejects(() => cliRegroundAssets(pool, { dryRun: false, operatorId: po.id, reason: '' }), /written reason/);
    assert.deepEqual(await counts(), c0);
    assert.equal((await one('select grounding_version from professional_asset where id = $1', [supported])).grounding_version, null);
  });

  test('4 · execution by a product owner: supported stays (re-checked, not assumed), unsupported moves to review; reconciliation holds', async () => {
    const r = await cliRegroundAssets(pool, { dryRun: false, operatorId: po.id, reason: 'engine deployment claim-grounding@1' });
    assert.equal(r.reconciliation.ok, true, r.reconciliation.problems.join('; '));
    assert.equal(r.publicVersionDeclared, 'claim-grounding@1+default@1');
    const s = await one('select lifecycle_state, grounding_version, user_approved_at, body from professional_asset where id = $1', [supported]);
    assert.deepEqual([s.lifecycle_state, s.grounding_version], ['active', 'claim-grounding@1+default@1']);
    const ev = await one(`select cause, eligible, actor from asset_standing_event where asset_id = $1 and cause = 'grounding_revalidation'`, [supported]);
    assert.equal(ev.eligible, true); assert.match(ev.actor, new RegExp(po.id));
    const u = await one('select lifecycle_state, grounding_version, user_approved_at, body, evidence_backed from professional_asset where id = $1', [unsupported]);
    assert.deepEqual([u.lifecycle_state, u.grounding_version, u.evidence_backed], ['needs_review', null, false], 'never marked grounded');
    assert.ok(u.user_approved_at); assert.equal(u.body, UNSUPPORTED_AR, 'the historical approval and wording are untouched');
    assert.ok(Number((await one(`select count(*)::int n from notification where user_id = $1 and action_href like '%' || $2`, [user.id, unsupported])).n) >= 1, 'the owner is told');
    // Post-execution reconciliation, read independently.
    const after = await cliGroundingStanding(pool);
    assert.equal(after.underOtherVersion + after.withoutVersion, 0, 'no active approved asset left under another or no version');
    assert.equal(after.publicVersion, 'claim-grounding@1+default@1');
    const audit = await one(`select actor_id, role_performed::text from audit_event where event_type = 'grounding.reground_run' order by occurred_at desc limit 1`);
    assert.deepEqual([audit.actor_id, audit.role_performed], [po.id, 'product_owner']);
  });

  test('5 · reports and public share links expose only currently eligible assets', async () => {
    const supportedBody = (await one('select body from professional_asset where id = $1', [supported])).body;
    assert.deepEqual(await reportBodies(), [supportedBody]);
    assert.deepEqual(await publicBodies(), [supportedBody]);
    assert.deepEqual(await anonCaseStudies(), [caseSupported], 'the case study of the moved asset stays closed');
  });

  test('6 · pre-deployment freeze closes the direct public path until the next completed run; it never reopens by itself', async () => {
    await assert.rejects(() => cliFreezePublicGrounding(pool, { operatorId: smeOnly.id, reason: 'x' }), /product_owner/);
    await cliFreezePublicGrounding(pool, { operatorId: po.id, reason: 'deploying claim-grounding@2' });
    assert.deepEqual(await anonCaseStudies(), []);
    await cliRegroundAssets(pool, { dryRun: false, operatorId: po.id, reason: 'post-deployment re-grounding' });
    assert.deepEqual(await anonCaseStudies(), [caseSupported]);
    assert.equal((await one('select lifecycle_state from professional_asset where id = $1', [unsupported])).lifecycle_state, 'needs_review', 'a later run restores nothing');
    const log = (await pool.query(`select version from grounding_public_state_log order by created_at desc limit 2`)).rows.map((r) => r.version);
    assert.deepEqual(log, ['claim-grounding@1+default@1', null], 'every declaration is logged');
  });

  test('8 · evidence withdrawn directly by its owner (RLS, bypassing the API service) closes every presentation path at once; the next dry run names it', async () => {
    const supportedBody = (await one('select body from professional_asset where id = $1', [supported])).body;
    assert.deepEqual(await publicBodies(), [supportedBody]);
    const ev = (await one('select evidence_id from asset_evidence where asset_id = $1 limit 1', [supported])).evidence_id;
    // As the owner, through RLS (role authenticated), COMMITTED — as a Supabase client could do it, with no API service involved.
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user.id]);
      await c.query('set local role authenticated');
      const r = await c.query(`update evidence set withdrawn_at = now(), withdrawn_reason = 'my choice' where id = $1`, [ev]);
      assert.equal(r.rowCount, 1, 'the owner may withdraw directly');
      await c.query('commit');
    } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
    assert.equal((await one('select lifecycle_state from professional_asset where id = $1', [supported])).lifecycle_state, 'active', 'no service ran: the asset row is unchanged');
    assert.deepEqual(await reportBodies(), [], 'the private report no longer presents it');
    assert.deepEqual(await publicBodies(), [], 'the recruiter share link no longer presents it');
    assert.deepEqual(await anonCaseStudies(), [], 'the case-study share link closes');
    const plan = await cliRegroundAssets(pool, { dryRun: true });
    assert.equal(plan.revalidation.details.find((d) => d.assetId === supported)?.outcome, 'needs_review', 'the dry run names it for review');
  });

  test('7 · reconciliation detects an inconsistent run (the executor rolls back on it)', () => {
    const snap = (o: Partial<GroundingSnapshot>): GroundingSnapshot => ({ currentVersion: 'v', activeApproved: 3, activeClaimKinds: 3, activeOtherKinds: 0, underCurrentVersion: 0, underOtherVersion: 0,
      withoutVersion: 3, presentableNow: 0, needsReview: 0, byVersion: {}, ...o });
    const ok = reconcileGrounding(snap({}), snap({ activeApproved: 2, activeClaimKinds: 2, underCurrentVersion: 2, withoutVersion: 0, needsReview: 1 }), { checked: 3, grounded: 2, movedToReview: 1 }, 0);
    assert.equal(ok.ok, true, ok.problems.join('; '));
    const missed = reconcileGrounding(snap({}), snap({ activeApproved: 3, underCurrentVersion: 2, withoutVersion: 1 }), { checked: 2, grounded: 2, movedToReview: 0 }, 0);
    assert.equal(missed.ok, false); assert.ok(missed.problems.some((p) => /remain under another or no grounding version/.test(p)));
  });
});
