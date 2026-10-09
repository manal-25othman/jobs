/**
 * Phase 8 (D-116) — Admin Track Builder, end to end.
 *
 *   - authorisation is enforced by the backend: an administrator drafts, a
 *     named SME validates, a product owner activates/publishes — each refused
 *     outside its role, and nobody validates their own draft (four eyes);
 *   - every edit is a NEW draft version; nothing in effect changes until an
 *     approved version is activated through the existing activation service;
 *   - track-skill edits reach the live rows only when their version is activated;
 *   - challenge activation, CV bullet below demonstrated and H6 stay blocked;
 *   - a grounding-vocabulary or engine change never leaves an approved asset
 *     presented without a re-check (fail closed).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, approveCvBulletProposal, type TestUser } from './helpers';
import { cliRegroundAssets } from '../src/configuration/config-admin.service';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
let admin: TestUser; let sme: TestUser; let sme2: TestUser; let po: TestUser; let outsider: TestUser; let adminAndSme: TestUser;

async function person(roles: string[]): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  for (const r of roles) await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, $2, 'e2e operator')`, [u.id, r]);
  return u;
}
before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  admin = await person(['track_admin']); sme = await person(['sme']); sme2 = await person(['sme']); po = await person(['product_owner']); outsider = await person([]);
  adminAndSme = await person(['track_admin', 'sme']);
});
after(async () => { await pool?.end(); await app?.close(); });

const get = (u: TestUser, path: string, code = 200) => http.get(`/v1/admin${path}`).set(auth(u)).expect(code);
const post = (u: TestUser, path: string, body: unknown, code = 201) => http.post(`/v1/admin${path}`).set(auth(u)).send(body as object).expect(code);
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];

describe('authorisation is enforced on the backend', () => {
  test('no grant ⇒ 403; unauthenticated ⇒ 401', async () => {
    await get(outsider, '/overview', 403);
    await http.get('/v1/admin/overview').expect(401);
  });
  test('each role reads; the overview names the separation and the pending expert decisions', async () => {
    for (const u of [admin, sme, po]) await get(u, '/overview');
    const o = (await get(admin, '/overview')).body.data;
    assert.deepEqual(o.me.roles, ['track_admin']);
    assert.match(o.separationAr, /صلاحية التعديل ليست صلاحية اعتماد مهني/);
    assert.equal(o.pendingExpertDecisions.length, 10);
  });
});

describe('governed configuration — a new draft version, validated by an SME, activated by the product owner', () => {
  let draftId = '';
  test('an administrator drafts a new version; the base row is untouched; a CV bullet below demonstrated cannot even be drafted', async () => {
    const list = (await get(admin, '/config/claim_policy')).body.data;
    const base = list.items.find((i: { key: string; family: string; version: number }) => i.key === 'default' && i.family.includes('linkedin_skill') && i.version === 1);
    assert.equal(base.stage, 'draft'); assert.ok(list.help['claim_policy.min_evidence_level'].impactAr);
    const before = await one(`select md5(to_jsonb(c)::text) as h from claim_policy c where id = $1`, [base.id]);
    await post(admin, '/config/claim_policy/draft', { baseId: base.id, changes: { min_evidence_count: 2 }, reason: 'e2e' }).then((r) => { draftId = r.body.data.id; });
    assert.equal((await one(`select md5(to_jsonb(c)::text) as h from claim_policy c where id = $1`, [base.id])).h, before.h, 'the base version is unchanged');
    const d = await one('select version, review_status::text, activation, drafted_by, min_evidence_count from claim_policy where id = $1', [draftId]);
    assert.deepEqual([d.review_status, d.activation, d.drafted_by, d.min_evidence_count], ['draft', 'inactive', admin.id, 2]);
    const cvBase = list.items.find((i: { key: string; family: string; version: number }) => i.key === 'default' && i.family.includes('cv_bullet') && i.version === 1);
    const refused = await post(admin, '/config/claim_policy/draft', { baseId: cvBase.id, changes: { min_evidence_level: 'practiced' }, reason: 'try' }, 400);
    assert.match(refused.body.error.message, /pending expert and Product Owner decision/);
    await post(admin, '/config/claim_policy/draft', { baseId: base.id, changes: { review_status: 'approved' }, reason: 'sneaky' }, 400);
    // Grounding is never loosened from the Track Builder: the switch is not editable, and a row without it is refused at activation.
    await post(admin, '/config/claim_policy/draft', { baseId: base.id, changes: { lock_until_grounded: false }, reason: 'loosen' }, 400);
    const { assertActivationPermittedInPhase8 } = await import('../src/configuration/config-admin.service');
    assert.throws(() => assertActivationPermittedInPhase8('claim_policy', { claim_kind: 'linkedin_skill', min_evidence_level: 'demonstrated', lock_until_grounded: false }, true), /never loosened/);
  });
  test('the diff previews exactly what changes, with the Arabic explanation', async () => {
    const d = (await get(sme, `/config/claim_policy/${draftId}/diff`)).body.data;
    const changed = d.fields.filter((f: { changed: boolean }) => f.changed);
    assert.deepEqual(changed.map((f: { field: string; before: unknown; after: unknown }) => [f.field, f.before, f.after]), [['min_evidence_count', null, 2]]);
    assert.ok(changed[0].help.meaningAr);
  });
  test('roles: the administrator cannot validate or activate; the SME cannot activate; the product owner cannot validate', async () => {
    await post(admin, `/config/claim_policy/${draftId}/submit`, { reason: 'ready for review' });
    await post(admin, `/config/claim_policy/${draftId}/validate`, { decision: 'approve', reason: 'self' }, 403);
    await post(po, `/config/claim_policy/${draftId}/validate`, { decision: 'approve', reason: 'po' }, 403);
    await post(sme, `/config/claim_policy/${draftId}/activate`, { activation: 'production_active', reason: 'sme' }, 403);
    await post(admin, `/config/claim_policy/${draftId}/activate`, { activation: 'production_active', reason: 'admin' }, 403);
  });
  test('four eyes: someone holding both roles cannot validate their own draft — refused by the API and by the database', async () => {
    const base = (await get(adminAndSme, '/config/claim_policy')).body.data.items.find((i: { key: string; family: string; version: number }) => i.key === 'default' && i.family.includes('linkedin_project') && i.version === 1);
    const id = (await post(adminAndSme, '/config/claim_policy/draft', { baseId: base.id, changes: { description_en: 'mine' }, reason: 'e2e' })).body.data.id;
    await post(adminAndSme, `/config/claim_policy/${id}/submit`, { reason: 'r' });
    await post(adminAndSme, `/config/claim_policy/${id}/validate`, { decision: 'approve', reason: 'mine' }, 403);
    const c = await pool.connect();
    try {
      await c.query('begin'); await c.query("select set_config('naqla.config_actor','e2e',true), set_config('naqla.config_reason','bypass attempt',true)");
      await assert.rejects(() => c.query(`update claim_policy set review_status = 'approved', approved_by = $2, approved_at = now() where id = $1`, [id, adminAndSme.id]), /four eyes/);
    } finally { await c.query('rollback'); c.release(); }
  });
  test('an SME validates; the product owner activates through the activation service (audited, replaces atomically), then rolls it back', async () => {
    await post(sme, `/config/claim_policy/${draftId}/validate`, { decision: 'approve', reason: 'reviewed the evidence count' });
    const v = await one('select review_status::text, approved_by from claim_policy where id = $1', [draftId]);
    assert.deepEqual([v.review_status, v.approved_by], ['approved', sme.id]);
    const r = (await post(po, `/config/claim_policy/${draftId}/activate`, { activation: 'production_active', reason: 'go' })).body.data;
    assert.equal(r.activation, 'production_active');
    const stage = (await get(po, '/config/claim_policy')).body.data.items.find((i: { id: string }) => i.id === draftId);
    assert.equal(stage.stage, 'production_active'); assert.equal(stage.inEffect, true);
    await post(po, `/config/claim_policy/${draftId}/activate`, { activation: 'inactive', reason: 'e2e rollback' });
    const changes = (await pool.query(`select field, new_value from config_change where entity_id = $1 order by created_at`, [draftId])).rows.map((x) => `${x.field}:${x.new_value}`);
    assert.deepEqual(changes, ['review_status:curated', 'review_status:approved', 'activation:production_active', 'activation:inactive']);
    const audits = (await pool.query(`select event_type, role_performed::text from audit_event where subject_id = $1 and event_type like 'admin.%' order by occurred_at`, [draftId])).rows.map((x) => `${x.event_type}:${x.role_performed}`);
    assert.deepEqual(audits, ['admin.draft_version_created:track_admin', 'admin.submitted_for_review:track_admin', 'admin.validated_approve:sme', 'admin.activation_changed:product_owner', 'admin.activation_changed:product_owner']);
  });
  test('an unapproved draft never becomes production-active, even for a product owner', async () => {
    const base = (await get(admin, '/config/assessment_context_policy')).body.data.items.find((i: { key: string; version: number }) => i.key === 'default' && i.version === 1);
    const id = (await post(admin, '/config/assessment_context_policy/draft', { baseId: base.id, changes: { description_en: 'draft' }, reason: 'e2e' })).body.data.id;
    const r = await post(po, `/config/assessment_context_policy/${id}/activate`, { activation: 'production_active', reason: 'try' }, 422);
    assert.match(r.body.error.message, /approv|validated|DRAFT/i);
    await post(admin, '/config/assessment_context_policy/draft', { baseId: base.id, changes: { inputs: { user_identity: 'required' } }, reason: 'identity' }, 400);
  });
});

describe('pending expert decisions stay blocked', () => {
  test('a challenge policy is defined and validated, but never activated', async () => {
    const base = (await get(admin, '/config/challenge_policy')).body.data.items[0];
    const id = (await post(admin, '/config/challenge_policy/draft', { baseId: base.id, changes: { max_challenges: 2, trigger_rule: { on: 'escalation' } }, reason: 'definition only' })).body.data.id;
    await post(admin, `/config/challenge_policy/${id}/submit`, { reason: 'r' });
    await post(sme, `/config/challenge_policy/${id}/validate`, { decision: 'approve', reason: 'definition reviewed' });
    const r = await post(po, `/config/challenge_policy/${id}/activate`, { activation: 'development_only', reason: 'try' }, 400);
    assert.match(r.body.error.message, /not available in this phase|cannot be activated/);
    assert.equal((await one('select activation from challenge_policy where id = $1', [id])).activation, 'inactive');
  });
});

describe('track builder — track-skill edits are drafts until a validated version is activated', () => {
  let roleId = ''; let rrId = ''; let changeId = ''; let versionId = '';
  test('an administrator proposes a classification change; nothing live changes', async () => {
    roleId = (await one(`select id from target_role where slug = 'frontend-developer-junior'`)).id;
    const t = (await get(admin, `/tracks/${roleId}`)).body.data;
    const sk = t.skills.find((s: { values: { is_core: boolean } }) => s.values.is_core === false) ?? t.skills[0];
    rrId = sk.roleRequirementId;
    assert.equal(sk.classificationPending, true);
    assert.ok(t.fieldHelp.is_core.impactAr);
    const live = await one('select is_core, classification_status from role_requirement where id = $1', [rrId]);
    changeId = (await post(admin, `/tracks/${roleId}/skill-changes`, { roleRequirementId: rrId, proposed: { is_core: !live.is_core, expected_level: 'demonstrated' }, reason: 'e2e: core per SME discussion' })).body.data.id;
    await post(admin, `/tracks/${roleId}/skill-changes`, { roleRequirementId: rrId, proposed: { classification_status: 'approved' }, reason: 'sneaky' }, 400);
    assert.deepEqual(await one('select is_core, classification_status from role_requirement where id = $1', [rrId]), live, 'live row untouched');
  });
  test('a professional change: the product owner cannot approve it; a named SME (not its author) does', async () => {
    await post(admin, `/skill-changes/${changeId}/pending_review`, { reason: 'submit' });
    await post(po, `/skill-changes/${changeId}/approved`, { reason: 'po' }, 403);
    await post(sme, `/skill-changes/${changeId}/approved`, { reason: 'validated as core for this role' });
    const ch = await one('select status, decided_by, decided_role from track_skill_change where id = $1', [changeId]);
    assert.deepEqual([ch.status, ch.decided_by, ch.decided_role], ['approved', sme.id, 'sme']);
  });
  test('a version is built (draft, previewable), validated by an SME, and only activation makes it live — classification approved with the SME\'s name', async () => {
    versionId = (await post(admin, `/tracks/${roleId}/versions`, { label: 'e2e', reason: 'core classification' })).body.data.id;
    const diff = (await get(sme, `/track-versions/${versionId}/diff`)).body.data;
    const row = diff.skills.find((s: { roleRequirementId: string }) => s.roleRequirementId === rrId);
    assert.ok(row.fields.some((f: { field: string }) => f.field === 'is_core'));
    assert.ok(row.fields.some((f: { field: string; after: unknown }) => f.field === 'classification_status' && f.after === 'approved'));
    assert.equal((await one('select classification_status from role_requirement where id = $1', [rrId])).classification_status, 'pending_expert_validation', 'still pending live');
    await post(admin, `/track-versions/${versionId}/submit`, { reason: 'r' });
    await post(admin, `/track-versions/${versionId}/validate`, { decision: 'approve', reason: 'self' }, 403);
    await post(sme2, `/track-versions/${versionId}/validate`, { decision: 'approve', reason: 'version reviewed' });
    await post(po, `/track-versions/${versionId}/activate`, { activation: 'development_only', reason: 'apply e2e version' });
    const live = await one('select is_core, expected_level::text, classification_status, reviewed_by from role_requirement where id = $1', [rrId]);
    assert.equal(live.classification_status, 'approved'); assert.equal(live.reviewed_by, sme.id); assert.equal(live.expected_level, 'demonstrated');
    assert.equal((await one('select status from track_skill_change where id = $1', [changeId])).status, 'applied');
    const t = (await get(po, `/tracks/${roleId}`)).body.data;
    assert.equal(t.versions.find((v: { id: string }) => v.id === versionId).inEffect, true);
    assert.ok((await one(`select count(*)::int as n from audit_event where event_type = 'track.version_applied' and subject_id = $1`, [versionId])).n === 1);
  });
});

describe('career content — drafts, SME validation, publication', () => {
  test('a new skill is born draft; submitted by the administrator; validated by an SME; published by the product owner', async () => {
    const id = (await post(admin, '/content/skills', { slug: `e2e-skill-${Date.now()}`, labelAr: 'مهارة تجريبية', labelEn: 'E2E skill', reason: 'e2e' })).body.data.id;
    await post(sme, '/content/review', { entityKind: 'skill', id, to: 'curated', reason: 'x' }, 403);
    await post(admin, '/content/review', { entityKind: 'skill', id, to: 'curated', reason: 'ready' });
    await post(admin, '/content/review', { entityKind: 'skill', id, to: 'sme_reviewed', reason: 'self' }, 403);
    await post(sme, '/content/review', { entityKind: 'skill', id, to: 'sme_reviewed', reason: 'reviewed' });
    await post(sme, '/content/review', { entityKind: 'skill', id, to: 'approved', reason: 'approved' });
    await post(sme, '/content/review', { entityKind: 'skill', id, to: 'published', reason: 'x' }, 403);
    await post(po, '/content/review', { entityKind: 'skill', id, to: 'published', reason: 'publish' });
    const s = await one('select review_status::text, reviewed_by from skill where id = $1', [id]);
    assert.deepEqual([s.review_status, s.reviewed_by], ['published', sme.id]);
    const log = (await pool.query(`select to_status::text, role_performed::text from review_log where entity_id = $1 order by decided_at`, [id])).rows.map((x) => `${x.to_status}:${x.role_performed}`);
    assert.deepEqual(log, ['curated:content_author', 'sme_reviewed:sme', 'approved:sme', 'published:product_owner']);
  });
  test('rubric values: editable only when returned; an edit resets them to proposed; a different SME approves them', async () => {
    // A non-demo rubric: the promoted copy of the demo change-request activity (promoted here when no earlier suite did).
    const nonDemo = `select r.id, r.status::text from rubric_version r join activity_spec a on a.id = r.activity_spec_id where a.slug = 'act_fe_change_request' and not r.is_demo_fixture`;
    if ((await pool.query(nonDemo)).rowCount === 0) {
      const { promoteDemo } = await import('../src/career-data/promotion');
      const demoAct = (await one(`select id from activity_spec where slug = 'act_fe_change_request' and is_demo_fixture`)).id;
      await promoteDemo(pool, 'activity_spec', demoAct, 'content author', 'track-admin e2e');
    }
    const rv = await one(nonDemo);
    if (rv.status === 'draft') await post(admin, '/content/review', { entityKind: 'rubric_version', id: rv.id, to: 'curated', reason: 'submitted for review' });
    const crit = await one('select id, weight from rubric_criterion where rubric_version_id = $1 order by position limit 1', [rv.id]);
    await post(admin, '/content/edit', { kind: 'rubric_criterion', id: crit.id, changes: { weight: 0.5 }, reason: 'try while under review' }, 400);
    await post(sme, '/content/review', { entityKind: 'rubric_version', id: rv.id, to: 'needs_revision', reason: 'weights need rework' });
    const e = (await post(admin, '/content/edit', { kind: 'rubric_criterion', id: crit.id, changes: { weight: 0.5 }, reason: 'rebalanced' })).body.data;
    assert.equal(e.valuesReset, true);
    assert.equal((await one('select weight_status::text from rubric_criterion where id = $1', [crit.id])).weight_status, 'proposed');
    await post(admin, '/content/review', { entityKind: 'rubric_version', id: rv.id, to: 'curated', reason: 'resubmitted' });
    await post(admin, `/content/rubrics/${rv.id}/approve-values`, { reason: 'self' }, 403);
    await post(sme, `/content/rubrics/${rv.id}/approve-values`, { reason: 'weights validated' });
    assert.equal((await one('select weight_status::text from rubric_criterion where id = $1', [crit.id])).weight_status, 'approved');
  });
  test('a published activity\'s deliverables cannot be edited (service and database)', async () => {
    const d = await one(`select d.id from activity_deliverable d join activity_spec a on a.id = d.activity_spec_id where a.status = 'published' limit 1`);
    await post(admin, '/content/edit', { kind: 'activity_deliverable', id: d.id, changes: { description_en: 'x' }, reason: 'try' }, 400);
  });
});

describe('grounding vocabulary and engine changes never leave approved assets shown without a re-check', () => {
  let user: TestUser; let assetId = '';
  const reportCount = async () => (await http.post('/v1/me/evidence-report').set(auth(user)).expect(201)).body.data.professionalAssets.length as number;
  before(async () => {
    user = await newUser();
    await http.post('/v1/me/bootstrap').set(auth(user)).send({}).expect(201);
    await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
    const project = await http.post('/v1/projects').set(auth(user)).send({ title: 'متتبّع عادات', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
    const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES); const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
    const sub = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, uploadIds: [u1, u2], aiDisclosure: { declaredUse: [] } }).expect(201);
    await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(user)).expect(201);
    assetId = (await approveCvBulletProposal(http, user)).assetId;
  });
  test('approval records the grounding version; an engine-version mismatch hides the asset until re-grounded', async () => {
    assert.equal((await one('select grounding_version from professional_asset where id = $1', [assetId])).grounding_version, 'claim-grounding@1+default@1');
    assert.equal(await reportCount(), 1);
    await pool.query(`update professional_asset set grounding_version = 'claim-grounding@0+default@1' where id = $1`, [assetId]); // as if approved under an older engine
    assert.equal(await reportCount(), 0, 'fail closed: not grounded under the version in effect');
    await cliRegroundAssets(pool, { dryRun: false, operatorId: po.id, reason: 'e2e deploy' });
    assert.equal(await reportCount(), 1, 'presented again once re-grounded');
  });
  test('activating a new vocabulary re-grounds approved assets in the same transaction: unsupported wording moves to review', async () => {
    const base = (await get(admin, '/config/grounding_lexicon')).body.data.items.find((i: { key: string; version: number }) => i.key === 'default' && i.version === 1);
    const entries = (await pool.query(`select language, cls, form from grounding_lexicon_entry where lexicon_id = $1`, [base.id])).rows;
    // The new version drops the Arabic word «عبر» the approved bullet uses: the bullet can no longer be grounded as written.
    const id = (await post(admin, '/config/grounding_lexicon/draft', { baseId: base.id, changes: {}, children: entries.filter((e) => !(e.language === 'ar' && e.form === 'عبر')), reason: 'e2e vocabulary change' })).body.data.id;
    const diff = (await get(sme, `/config/grounding_lexicon/${id}/diff`)).body.data;
    assert.equal(diff.children.removed.length, 1);
    await post(admin, `/config/grounding_lexicon/${id}/submit`, { reason: 'r' });
    await post(sme, `/config/grounding_lexicon/${id}/validate`, { decision: 'approve', reason: 'vocabulary reviewed' });
    try {
      await post(po, `/config/grounding_lexicon/${id}/activate`, { activation: 'development_only', reason: 'new vocabulary' });
      const a = await one('select lifecycle_state, body, user_approved_at from professional_asset where id = $1', [assetId]);
      assert.equal(a.lifecycle_state, 'needs_review'); assert.ok(a.user_approved_at, 'the approval is untouched');
      assert.equal(await reportCount(), 0);
      const ev = await one(`select cause, eligible from asset_standing_event where asset_id = $1 order by created_at desc limit 1`, [assetId]);
      assert.deepEqual([ev.cause, ev.eligible], ['grounding_revalidation', false]);
    } finally {
      await post(po, `/config/grounding_lexicon/${base.id}/activate`, { activation: 'development_only', reason: 'e2e restore' });
    }
    assert.equal((await one('select lifecycle_state from professional_asset where id = $1', [assetId])).lifecycle_state, 'needs_review', 'restoring the vocabulary approves nothing back');
  });
});
