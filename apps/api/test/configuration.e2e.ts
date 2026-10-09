/**
 * Phase 4 — Configuration & Policy Layer.
 *
 * Proves: the legacy baseline is distinct from a draft and visibly not
 * validated; an ordinary draft cannot become production-active, cannot become
 * a baseline, and never replaces an active row by accident; activation is an
 * audited act; active content is immutable (a change is a new version);
 * every new assessment names its context policy and track configuration
 * version; old results keep the versions that produced them; claim and
 * challenge policies are recorded, not consumed; TrackSkill fields exist and
 * are shown as pending until approved.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, expectRejected, COMPONENT_BYTES, TEST_BYTES, type TestUser } from './helpers';
import { cliApprove, cliActivate, cliCreateTrackVersion } from '../src/configuration/config-admin.service';

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
async function evaluated(user: TestUser) {
  const pid = (await http.post('/v1/projects').set(auth(user)).send({ title: 'x', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id as string;
  const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES); const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
  const sid = (await http.post(`/v1/projects/${pid}/submissions`).set(auth(user)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, uploadIds: [u1, u2], aiDisclosure: { declaredUse: [] } }).expect(201)).body.data.id as string;
  await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201);
  const a = (await http.get(`/v1/submissions/${sid}/assessment`).set(auth(user)).expect(200)).body.data.items[0];
  return { sid, assessment: a as { versions: { contextPolicy: string; trackConfigVersionId: string | null; trackConfigVersion: number | null; configResolution: string }; inputsUsed: Record<string, unknown>; decisions: { policy: { key: string; version: number; status: string; resolution: string | null }; trackConfigVersionId: string | null }[] } };
}
/** A transaction with the audited-act settings, as the admin service sets them. */
async function withActor<T>(fn: (c: import('pg').PoolClient) => Promise<T>, production = false): Promise<T> {
  const c = await pool.connect();
  try { await c.query('begin'); await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'e2e test', true), set_config('naqla.production', $1, true)", [production ? 'on' : 'off']); const r = await fn(c); await c.query('commit'); return r; }
  catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

describe('activation model — the baseline is not a draft, and a draft is never active in production', () => {
  test('the registry shows the legacy baseline as NOT validated and distinct from draft; production would resolve to it, never to a draft', async () => {
    const user = await bootstrapped();
    const r = (await http.get('/v1/config/policies').set(auth(user)).expect(200)).body.data;
    // D-118: default@1 retired (history); default@2 is the restrictive safety baseline — not validated, never a draft.
    const v1 = r.verificationPolicies.items.find((p: { key: string; version: number }) => p.key === 'default' && p.version === 1);
    assert.equal(v1.activation, 'inactive'); assert.match(v1.validationNote, /LEGACY BASELINE — NOT EXPERT-VALIDATED/);
    const vp = r.verificationPolicies.items.find((p: { key: string; version: number }) => p.key === 'default' && p.version === 2);
    assert.ok(vp.baselineOf, 'default@2 is the migration-created baseline (momentarily inactive while this suite runs the test-only compatibility row)');
    assert.equal(vp.validated, false); assert.equal(vp.reviewStatus, 'draft');
    assert.match(vp.validationNote, /SAFETY BASELINE — restricts, never grants/);
    assert.match(r.activationModel.legacy_baseline, /NOT validated/);
    const cx = r.assessmentContextPolicies.items[0];
    assert.equal(cx.activation, 'legacy_baseline'); assert.equal(cx.inputs.user_identity, 'excluded');
    // Phase 7: claim policies are consumed. The baseline reproduces presentationFor(); no claim policy is validated; the
    // DRAFT default@1 rows stay inactive except the case-study row the demo seed allows outside production.
    assert.equal(r.claimPolicies.consumed, true);
    // The seeded rows only: claims*.e2e add e2e policy versions/keys (left inactive) when they run first.
    const seeded = r.claimPolicies.items.filter((p: { key: string; version: number }) => ['default', 'legacy_presentation'].includes(p.key) && p.version === 1);
    assert.equal(seeded.length, 17);
    assert.ok(seeded.every((p: { validated: boolean }) => !p.validated));
    assert.ok(r.claimPolicies.items.filter((p: { key: string }) => p.key === 'legacy_presentation').every((p: { activation: string; baselineOf: string | null }) => p.activation === 'legacy_baseline' && !!p.baselineOf));
    assert.deepEqual(r.claimPolicies.items.filter((p: { key: string; version: number; activation: string }) => p.key === 'default' && p.version === 1 && p.activation !== 'inactive').map((p: { claimKind: string; activation: string }) => `${p.claimKind}:${p.activation}`), ['case_study:development_only']);
    assert.equal(r.challengePolicies.runnerExists, false); assert.ok(r.challengePolicies.items.every((p: { activation: string }) => p.activation === 'inactive'));
    assert.ok(r.challengeTypes.every((t: { enabled: boolean; validated: boolean }) => !t.enabled && !t.validated));
  });

  test('NEGATIVE (database): a draft cannot be production_active, cannot become a baseline, cannot be created as a baseline, and development_only is refused in production', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'negative', true)");
      const v = (await c.query(`insert into verification_policy (key, version, description_en) values ('default', 98, 'e2e draft') returning id`)).rows[0].id;
      await expectRejected(c, `update verification_policy set activation = 'production_active' where id = $1`, [v], /DRAFT \/ NOT VALIDATED|production_active requires/);
      await expectRejected(c, `update verification_policy set activation = 'legacy_baseline' where id = $1`, [v], /legacy_baseline requires a migration-created baseline/);
      await expectRejected(c, `update verification_policy set baseline_of = 'fake' where id = $1`, [v], /baseline_of is frozen/);
      await expectRejected(c, `insert into verification_policy (key, version, description_en, baseline_of) values ('default', 97, 'fake baseline', 'fake')`, [], /only be created by a migration/);
      // "approved" without an approver is refused; approved with approver still needs the explicit activation act (stays inactive).
      await expectRejected(c, `update verification_policy set review_status = 'approved' where id = $1`, [v], /approved_is_recorded|approved\/published requires/);
      await c.query(`update verification_policy set review_status = 'approved', approved_by = 'sme-1', approved_at = now() where id = $1`, [v]);
      assert.equal((await c.query('select activation from verification_policy where id = $1', [v])).rows[0].activation, 'inactive', 'approval does not activate');
      // One active row per key: activating v98 while the baseline is active is refused at the index (no accidental replacement).
      await expectRejected(c, `update verification_policy set activation = 'production_active' where id = $1`, [v], /one_active_per_key|duplicate key/);
      // development_only cannot be activated in production.
      await c.query("select set_config('naqla.production', 'on', true)");
      await expectRejected(c, `update verification_policy set activation = 'development_only' where id = $1`, [v], /cannot be activated in production/);
      await c.query('rollback');
    } finally { c.release(); }
  });

  test('NEGATIVE: activation and review changes need an actor and a reason (audited); active content is immutable — a change is a new version', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      // D-118: the row in effect (the test-only compatibility row for this suite) — any row that has been active.
      const base = (await c.query(`select id from verification_policy where key = 'default' and activation <> 'inactive'`)).rows[0].id;
      await expectRejected(c, `update verification_policy set activation = 'inactive' where id = $1`, [base], /needs naqla.config_actor and naqla.config_reason/);
      await expectRejected(c, `update verification_policy set min_assessment_confidence = 0.9 where id = $1`, [base], /has been active; its content is immutable/);
      await expectRejected(c, `update assessment_context_policy set inputs = inputs || '{"user_identity":"optional"}' where key = 'default'`, [], /identity_excluded|immutable/);
      await c.query('rollback');
    } finally { c.release(); }
  });

  test('the admin acts: approve, activate (audited in config_change), never replacing an active row by accident; the baseline cannot be approved in place', async () => {
    const base = (await pool.query(`select id from verification_policy where key = 'default' and baseline_of is not null order by version desc limit 1`)).rows[0].id;
    await assert.rejects(cliApprove(pool, { table: 'verification_policy', id: base, approvedBy: 'sme-1', approvedByLabel: 'SME One', reason: 'x' }), /not approved in place/);
    const v = (await withActor((c) => c.query(`insert into verification_policy (key, version, description_en) values ('default', 96, 'e2e candidate') returning id`))).rows[0].id;
    await assert.rejects(cliActivate(pool, { table: 'verification_policy', id: v, activation: 'production_active', actor: 'ops', reason: 'go' }), /DRAFT \/ NOT VALIDATED|validated row approved/);
    const approved = await cliApprove(pool, { table: 'verification_policy', id: v, approvedBy: 'sme-1', approvedByLabel: 'SME One', reason: 'reviewed the knobs' });
    assert.equal(approved.reviewStatus, 'approved'); assert.equal(approved.activation, 'inactive');
    await assert.rejects(cliActivate(pool, { table: 'verification_policy', id: v, activation: 'production_active', actor: 'ops', reason: 'go' }), /already has an active row/);
    await assert.rejects(cliActivate(pool, { table: 'verification_policy', id: v, activation: 'production_active', actor: '', reason: 'go' }), /named actor/);
    const log = await pool.query(`select field, old_value, new_value, actor, reason from config_change where entity_id = $1 order by created_at`, [v]);
    assert.deepEqual(log.rows.map((r) => [r.field, r.old_value, r.new_value, r.actor]), [['review_status', 'draft', 'approved', 'SME One']]);
    await withActor((c) => c.query(`update verification_policy set activation = 'inactive' where id = $1`, [v]));
  });
});

describe('every new assessment names its configuration; history keeps the versions that produced it', () => {
  test('context policy + track configuration version recorded; a new track version does not touch old assessments', async () => {
    const user = await bootstrapped();
    const first = await evaluated(user);
    assert.equal(first.assessment.versions.contextPolicy, 'default@1');
    assert.equal(first.assessment.versions.configResolution, 'development_only', 'the demo track has a seeded draft v1, development only');
    assert.equal(first.assessment.versions.trackConfigVersion, 1);
    assert.ok(first.assessment.versions.trackConfigVersionId);
    assert.equal(first.assessment.inputsUsed['identity_excluded'], true);
    assert.equal(first.assessment.inputsUsed['context_policy'], 'default@1');
    assert.ok(Array.isArray(first.assessment.inputsUsed['excluded']) && (first.assessment.inputsUsed['excluded'] as string[]).includes('user_identity'));
    assert.equal(first.assessment.decisions[0]!.policy.resolution, 'development_only', 'the decision records which non-validated policy decided (here the test-only compatibility row, D-118)');
    assert.equal(first.assessment.decisions[0]!.trackConfigVersionId, first.assessment.versions.trackConfigVersionId);

    // A new draft version of the track configuration: created inactive; activated for development only after deactivating v1 explicitly.
    const v1 = first.assessment.versions.trackConfigVersionId!;
    const v2 = await cliCreateTrackVersion(pool, { targetRoleId: FIXTURE.roleId, label: 'e2e v2', verificationPolicy: 'default@1', assessmentContextPolicy: 'default@1', claimPolicyRef: 'default@1', challengePolicy: null, packVersion: '0.2.0', notes: null, createdBy: 'e2e' });
    assert.equal(v2.version, 2);
    await assert.rejects(cliActivate(pool, { table: 'track_config_version', id: v2.id, activation: 'development_only', actor: 'e2e', reason: 'switch' }), /already has an active row/);
    await cliActivate(pool, { table: 'track_config_version', id: v1, activation: 'inactive', actor: 'e2e', reason: 'switch to v2' });
    await cliActivate(pool, { table: 'track_config_version', id: v2.id, activation: 'development_only', actor: 'e2e', reason: 'switch to v2' });
    try {
      const second = await evaluated(user);
      assert.equal(second.assessment.versions.trackConfigVersion, 2);
      const again = (await http.get(`/v1/submissions/${first.sid}/assessment`).set(auth(user)).expect(200)).body.data.items[0];
      assert.equal(again.versions.trackConfigVersionId, v1, 'the old assessment still names v1: nothing was recalculated');
      assert.equal(again.versions.trackConfigVersion, 1);
      const track = (await http.get(`/v1/config/tracks/${FIXTURE.roleId}`).set(auth(user)).expect(200)).body.data;
      assert.equal(track.active.version, 2); assert.equal(track.active.resolution, 'development_only');
      assert.equal(track.readinessRules.exist, false);
      assert.ok(track.trackSkills.every((s: { badge: string; classificationStatus: string }) => s.badge === 'pending_expert_validation' && s.classificationStatus === 'pending_expert_validation'), 'is_core is never shown as core before approval');
      assert.ok(track.versions.find((v: { version: number }) => v.version === 1).skillConfigSnapshot.length >= 1);
    } finally {
      await cliActivate(pool, { table: 'track_config_version', id: v2.id, activation: 'inactive', actor: 'e2e', reason: 'restore v1' });
      await cliActivate(pool, { table: 'track_config_version', id: v1, activation: 'development_only', actor: 'e2e', reason: 'restore v1' });
    }
  });

  test('a track with no active configuration is recorded as such (never guessed); an imported pack gets a draft v1', async () => {
    const imported = await pool.query(`select tr.slug, v.version, v.activation, v.created_by from target_role tr join track_config_version v on v.target_role_id = tr.id where tr.slug = 'frontend-developer-junior' order by v.version`);
    assert.ok(imported.rowCount! >= 1); assert.equal(imported.rows[0].activation, 'development_only'); assert.match(imported.rows[0].created_by, /career-data import/);
    const orphan = (await pool.query(`insert into target_role (slug, label_ar, label_en, track_id, source_label, provenance_class, provenance_source, is_demo_fixture) values ('e2e-orphan-' || substr(gen_random_uuid()::text, 1, 8), 'x', 'x', 'trk_e2e_orphan', 'e2e', 'curated', 'e2e', true) returning id`)).rows[0].id;
    const user = await bootstrapped();
    const r = (await http.get(`/v1/config/tracks/${orphan}`).set(auth(user)).expect(200)).body.data;
    assert.equal(r.active.resolution, 'no_active_track_config');
  });

  test('TrackSkill configuration fields: pending by default; approved classification needs a reviewer; readiness rules cannot be attached yet', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      const rr = (await c.query(`select id from role_requirement where target_role_id = $1 limit 1`, [FIXTURE.roleId])).rows[0].id;
      await expectRejected(c, `update role_requirement set classification_status = 'approved' where id = $1`, [rr], /classification_approved_is_reviewed|check constraint/);
      await expectRejected(c, `update role_requirement set readiness_contribution = 'weight' where id = $1`, [rr], /check constraint/);
      await c.query(`update role_requirement set category = 'foundations', display_order = 1, expected_level = 'demonstrated' where id = $1`, [rr]);
      const tcv = (await c.query(`select id from track_config_version where target_role_id = $1 and activation <> 'inactive'`, [FIXTURE.roleId])).rows[0].id;
      await expectRejected(c, `update track_config_version set readiness_rule_set_id = gen_random_uuid() where id = $1`, [tcv], /no_readiness_rules_yet|immutable|check constraint/);
      await c.query('rollback');
    } finally { c.release(); }
  });
});
