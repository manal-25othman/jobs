/**
 * Phase 7 (D-114) — career claim drafts, end to end.
 *
 * Evidence → Proposed Claim → User Preview → User Approval → Professional Asset,
 * judged by the claim policy active for the kind. presentationFor() lives on
 * as the migration-created baseline `legacy_presentation@1`.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { LEGACY_PRESENTATION_BASELINE } from '@naqla/domain';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, asAuthenticatedUser, type TestUser } from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const SKILL = FIXTURE.skillUiTesting; const SECONDARY = 'a0000000-0000-4000-8000-000000000003';

async function evaluated(user: TestUser, skillIds: string[] = [SKILL]) {
  await http.post('/v1/me/bootstrap').set(auth(user)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  const project = await http.post('/v1/projects').set(auth(user)).send({ title: 'متتبّع عادات', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
  const u1 = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES);
  const u2 = await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES);
  const sub = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user))
    .send({ skillIds, artifacts: COMPLETE_ARTIFACTS, uploadIds: [u1, u2], aiDisclosure: { declaredUse: [] } }).expect(201);
  const ev = await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(user)).expect(201);
  return { evidenceId: ev.body.data.transition.evidenceId as string, projectId: project.body.data.id as string };
}
const ask = async (u: TestUser, claimKind: string, evidenceId: string | null) =>
  (await http.post('/v1/me/claim-drafts').set(auth(u)).send({ claimKind, evidenceId }).expect(201)).body.data as { status: string; proposalIds: string[]; reasons: { code: string; ar: string; en: string }[] };
const preview = async (u: TestUser, id: string) => (await http.get(`/v1/me/proposals/${id}`).set(auth(u)).expect(200)).body.data;
const history = async (u: TestUser, id: string) => ((await http.get(`/v1/me/claim-drafts/${id}/history`).set(auth(u)).expect(200)).body.data.items as { event: string; policyRef: string | null }[]).map((e) => e.event);
const admin = async (sql: string, params: unknown[] = []) => {
  const c = await pool.connect();
  try { await c.query('begin'); await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'Phase 7 claim-policy version test', true)"); const r = await c.query(sql, params); await c.query('commit'); return r; }
  catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
};

describe('presentationFor() as data — the baseline rows are exactly the hard-coded levels', () => {
  test('legacy_presentation@1 equals LEGACY_PRESENTATION_BASELINE; default@1 stays DRAFT and inactive (case study: development only)', async () => {
    const rows = (await pool.query(`select claim_kind, min_evidence_level::text as lvl, activation, baseline_of, review_status from claim_policy where key = 'legacy_presentation' and version = 1`)).rows;
    const fromDb = Object.fromEntries(rows.map((r) => [r.claim_kind, r.lvl]));
    const expected = Object.fromEntries(Object.entries(LEGACY_PRESENTATION_BASELINE).filter(([, v]) => v !== null));
    assert.deepEqual(fromDb, expected);
    assert.ok(rows.every((r) => r.activation === 'legacy_baseline' && r.baseline_of && r.review_status === 'draft'), 'a baseline, not a validated policy');
    const dflt = (await pool.query(`select claim_kind, activation, review_status from claim_policy where key = 'default' and version = 1`)).rows;
    assert.ok(dflt.every((r) => r.review_status === 'draft'));
    assert.deepEqual(dflt.filter((r) => r.activation !== 'inactive').map((r) => `${r.claim_kind}:${r.activation}`), ['case_study:development_only']);
  });
  test('the application still cannot create a baseline after 0017 (the guard is back on)', async () => {
    await assert.rejects(() => admin(`insert into claim_policy (key, version, claim_kind, description_en, min_evidence_level, activation, baseline_of) values ('sneaky', 1, 'cv_bullet', 'x', 'practiced', 'legacy_baseline', 'me')`),
      /legacy baseline can only be created by a migration/);
  });
});

describe('claim drafts — evidence → draft → preview → approval → asset', () => {
  test('the automatic CV-bullet draft is judged by the baseline and records its grounding', async () => {
    const user = await newUser(); await evaluated(user);
    const row = (await pool.query(`select id, claim_kind, claim_policy_ref, claim_policy_resolution, grounding_status, grounding_report from agent_proposal where user_id = $1 and proposal_type = 'cv_bullet'`, [user.id])).rows[0];
    assert.equal(row.claim_kind, 'cv_bullet'); assert.equal(row.claim_policy_ref, 'legacy_presentation@1'); assert.equal(row.claim_policy_resolution, 'legacy_baseline');
    assert.equal(row.grounding_status, 'grounded');
    const checks = (row.grounding_report as { check: string; passed: boolean }[]).map((x) => x.check);
    for (const c of ['evidence_exists', 'skill_levels', 'technology_grounding', 'no_professional_work_claim', 'numbers_are_recorded_facts', 'no_unsupported_outcome', 'policy:evidence_level']) assert.ok(checks.includes(c), c);
    assert.deepEqual(await history(user, row.id), ['drafted']);
  });

  test('every draftable kind: requested, previewed with current vs suggested, approved into an asset of that kind', async () => {
    const user = await newUser(); const { evidenceId } = await evaluated(user);
    const opts = (await http.get('/v1/me/claim-drafts/options').set(auth(user)).expect(200)).body.data;
    assert.equal(opts.kinds.find((k: { kind: string }) => k.kind === 'case_study').policy.resolution, 'development_only');
    assert.equal(opts.kinds.find((k: { kind: string }) => k.kind === 'cv_bullet').policy.ref, 'legacy_presentation@1');
    for (const kind of ['professional_summary', 'linkedin_headline', 'linkedin_about', 'linkedin_skill', 'project_description', 'linkedin_project', 'case_study', 'cv_bullet']) {
      const needsEvidence = !['professional_summary', 'linkedin_headline', 'linkedin_about'].includes(kind);
      const r = await ask(user, kind, needsEvidence ? evidenceId : null);
      assert.equal(r.status, 'drafted', `${kind}: ${JSON.stringify(r.reasons)}`);
      const pv = await preview(user, r.proposalIds[0]!);
      assert.equal(pv.claim.kind, kind); assert.ok(pv.claim.labelAr); assert.equal(pv.claim.eligibleNow, true); assert.deepEqual(pv.claim.missing, []);
      assert.ok(pv.suggestedAr && pv.why);
      if (needsEvidence) assert.equal(pv.claim.evidence[0].withdrawn, false);
      const ok = (await http.post(`/v1/me/proposals/${r.proposalIds[0]}/approve`).set(auth(user)).send({ approved: true }).expect(201)).body.data;
      assert.equal(ok.claimKind, kind);
      const asset = (await pool.query('select kind, lifecycle_state, claim_policy_ref, user_approved_at from professional_asset where id = $1', [ok.assetId])).rows[0];
      assert.equal(asset.kind, kind); assert.equal(asset.lifecycle_state, 'active'); assert.ok(asset.user_approved_at); assert.match(asset.claim_policy_ref, /@1 \((legacy_baseline|development_only)\)$/);
      assert.deepEqual(await history(user, r.proposalIds[0]!), ['drafted', 'previewed', 'approved']);
    }
    // The comparison: a second CV-bullet draft shows the approved one as the current wording.
    const again = await ask(user, 'cv_bullet', evidenceId);
    const pv = await preview(user, again.proposalIds[0]!);
    assert.ok(pv.current && pv.current.includes('متتبّع عادات'), 'current wording is the active approved bullet');
    // The recruiter report keeps listing CV bullets only, as before Phase 7.
    const report = await http.post('/v1/me/evidence-report').set(auth(user)).expect(201);
    assert.equal(report.body.data.professionalAssets.length, 1);
  });

  test('rejection is kept with its reason and no asset; nothing is applied', async () => {
    const user = await newUser(); await evaluated(user);
    const r = await ask(user, 'linkedin_headline', null);
    await preview(user, r.proposalIds[0]!);
    await http.post(`/v1/me/proposals/${r.proposalIds[0]}/reject`).set(auth(user)).send({ reason: 'أفضّل صياغتي' }).expect(201);
    const row = (await pool.query('select lifecycle, rejection_reason, resulting_asset_id from agent_proposal where id = $1', [r.proposalIds[0]])).rows[0];
    assert.deepEqual([row.lifecycle, row.rejection_reason, row.resulting_asset_id], ['rejected', 'أفضّل صياغتي', null]);
    assert.deepEqual(await history(user, r.proposalIds[0]!), ['drafted', 'previewed', 'rejected']);
    assert.equal((await pool.query(`select count(*)::int as n from professional_asset where user_id = $1 and kind = 'linkedin_headline'`, [user.id])).rows[0].n, 0);
  });
});

describe('critical evidence rules', () => {
  test('a practiced skill: a project description may be drafted; a CV bullet or LinkedIn skill may not', async () => {
    const user = await newUser(); const { evidenceId } = await evaluated(user, [SKILL, SECONDARY]);
    const state = (await pool.query('select state from skill_claim where user_id = $1 and skill_id = $2', [user.id, SECONDARY])).rows[0].state;
    assert.equal(state, 'practiced');
    // Fixture: evidence for the practiced skill from the same evaluation (the product records evidence at promotion;
    // this stands for practiced-level evidence so the policy, not a missing row, is what decides).
    const src = (await pool.query('select evaluation_result_id, project_id from evidence where id = $1', [evidenceId])).rows[0];
    const practicedEv = (await pool.query(`insert into evidence (user_id, skill_id, source_strength, evaluation_result_id, project_id, provenance_class, provenance_source, confidence)
      values ($1,$2,'platform_controlled',$3,$4,'system_derived','e2e fixture',1.0) returning id`, [user.id, SECONDARY, src.evaluation_result_id, src.project_id])).rows[0].id;
    // Closure guard: the DRAFT presentation-rule data that allows cv_bullet at practiced exists, and is NOT consumed —
    // eligibility stays presentationFor()-equivalent until an expert and the Product Owner decide otherwise.
    const conflicting = (await pool.query(`select allowed, review_status::text as rs from career_presentation_rule where asset_type = 'cv_bullet' and evidence_level = 'practiced'`)).rows;
    assert.ok(conflicting.length > 0 && conflicting.every((r) => r.allowed === true && r.rs === 'draft'), 'the conflicting draft rule is present and still draft');
    assert.equal((await pool.query(`select count(*)::int as n from claim_policy where claim_kind = 'cv_bullet' and activation <> 'inactive' and min_evidence_level::text <> 'demonstrated'`)).rows[0].n, 0,
      'no active cv_bullet policy below demonstrated');
    for (const kind of ['cv_bullet', 'linkedin_skill', 'case_study']) {
      const r = await ask(user, kind, practicedEv);
      assert.equal(r.status, 'not_eligible', kind); assert.equal(r.proposalIds.length, 0);
      assert.ok(r.reasons.some((x) => x.code === 'level_below_policy' && /مُمارَسة/.test(x.ar)), 'the reason is readable');
    }
    for (const kind of ['project_description', 'linkedin_project']) assert.equal((await ask(user, kind, practicedEv)).status, 'drafted', kind);
  });

  test('an edited wording with a fabricated metric or an unsupported outcome is refused at approval (REC-006)', async () => {
    const user = await newUser(); const { evidenceId } = await evaluated(user);
    const r = await ask(user, 'cv_bullet', evidenceId); await preview(user, r.proposalIds[0]!);
    const metric = await http.post(`/v1/me/proposals/${r.proposalIds[0]}/approve`).set(auth(user)).send({ approved: true, editedBody: 'غطّيتُ حالات القائمة فرفعتُ الأداء 40%' }).expect(400);
    assert.match(metric.body.error.message, /percentage|number 40/);
    const outcome = await http.post(`/v1/me/proposals/${r.proposalIds[0]}/approve`).set(auth(user)).send({ approved: true, editedBody: 'تولّيتُ حالات القائمة، ما جعل تهيئة المستخدمين الجدد أسلس' }).expect(400);
    assert.match(outcome.body.error.message, /unsupported outcome/);
    const work = await http.post(`/v1/me/proposals/${r.proposalIds[0]}/approve`).set(auth(user)).send({ approved: true, editedBody: 'بنيتُ قائمة العادات لعميل' }).expect(400);
    assert.match(work.body.error.message, /professional work/);
    const tech = await http.post(`/v1/me/proposals/${r.proposalIds[0]}/approve`).set(auth(user)).send({ approved: true, editedBody: 'بنيتُ قائمة العادات بـ React' }).expect(400);
    assert.match(tech.body.error.message, /React/);
    assert.equal((await pool.query('select lifecycle from agent_proposal where id = $1', [r.proposalIds[0]])).rows[0].lifecycle, 'awaiting_user');
  });

  test('withdrawn evidence: waiting drafts are flagged and cannot be approved; approved assets leave eligible presentation (D-077); history kept', async () => {
    const user = await newUser(); const { evidenceId } = await evaluated(user);
    const approved = await ask(user, 'linkedin_skill', evidenceId); await preview(user, approved.proposalIds[0]!);
    const ok = (await http.post(`/v1/me/proposals/${approved.proposalIds[0]}/approve`).set(auth(user)).send({ approved: true }).expect(201)).body.data;
    const waiting = await ask(user, 'case_study', evidenceId); await preview(user, waiting.proposalIds[0]!);
    const w = (await http.post(`/v1/evidence/${evidenceId}/withdraw`).set(auth(user)).send({ reason: 'المشروع ليس من عملي وحدي' }).expect(201)).body.data;
    assert.ok(w.flaggedClaimDrafts.includes(waiting.proposalIds[0]));
    assert.equal((await pool.query('select grounding_status, lifecycle from agent_proposal where id = $1', [waiting.proposalIds[0]])).rows[0].grounding_status, 'evidence_withdrawn');
    assert.deepEqual(await history(user, waiting.proposalIds[0]!), ['drafted', 'previewed', 'flagged_evidence_withdrawn']);
    const pv = await preview(user, waiting.proposalIds[0]!);
    assert.equal(pv.claim.eligibleNow, false); assert.ok(pv.claim.missing.some((m: { code: string }) => m.code === 'evidence_withdrawn'));
    await http.post(`/v1/me/proposals/${waiting.proposalIds[0]}/approve`).set(auth(user)).send({ approved: true }).expect(400);
    const asset = (await pool.query('select lifecycle_state, evidence_backed, kind from professional_asset where id = $1', [ok.assetId])).rows[0];
    assert.deepEqual([asset.lifecycle_state, asset.evidence_backed, asset.kind], ['needs_review', false, 'linkedin_skill']);
    // The approved draft's history is untouched.
    assert.deepEqual(await history(user, approved.proposalIds[0]!), ['drafted', 'previewed', 'approved']);
  });
});

describe('policy versions — a new version decides new approvals only; history keeps its version; deactivation rolls back', () => {
  test('a validated default@2 (cv_bullet needs verified) refuses a waiting draft; the earlier asset keeps its baseline; deactivating restores', async () => {
    const user = await newUser(); const { evidenceId } = await evaluated(user);
    const first = await ask(user, 'cv_bullet', evidenceId); await preview(user, first.proposalIds[0]!);
    const a1 = (await http.post(`/v1/me/proposals/${first.proposalIds[0]}/approve`).set(auth(user)).send({ approved: true }).expect(201)).body.data;
    const second = await ask(user, 'cv_bullet', evidenceId); await preview(user, second.proposalIds[0]!);

    const v2 = (await admin(`insert into claim_policy (key, version, claim_kind, description_en, min_evidence_level) values ('default', 2, 'cv_bullet', 'e2e: stricter version', 'verified') returning id`)).rows[0].id;
    // A new draft never replaces anything by being created: approval still passes under the baseline.
    assert.equal((await preview(user, second.proposalIds[0]!)).claim.policyNow.ref, 'legacy_presentation@1');
    await admin(`update claim_policy set review_status = 'approved', approved_by = 'e2e-sme', approved_at = now() where id = $1`, [v2]);
    await admin(`update claim_policy set activation = 'production_active' where id = $1`, [v2]);
    try {
      const refused = await http.post(`/v1/me/proposals/${second.proposalIds[0]}/approve`).set(auth(user)).send({ approved: true }).expect(400);
      assert.match(refused.body.error.message, /claim policy default@2/);
      assert.equal((await pool.query('select grounding_status, lifecycle from agent_proposal where id = $1', [second.proposalIds[0]])).rows[0].grounding_status, 'not_eligible');
      assert.deepEqual(await history(user, second.proposalIds[0]!), ['drafted', 'previewed', 'refused_not_eligible']);
      // Historical compatibility: the asset approved under the baseline is not recalculated.
      const asset = (await pool.query('select lifecycle_state, claim_policy_ref from professional_asset where id = $1', [a1.assetId])).rows[0];
      assert.deepEqual([asset.lifecycle_state, asset.claim_policy_ref], ['active', 'legacy_presentation@1 (legacy_baseline)']);
    } finally {
      await admin(`update claim_policy set activation = 'inactive' where id = $1`, [v2]);
    }
    // Rollback: with v2 inactive the baseline decides again, and the same draft can be approved.
    const ok = (await http.post(`/v1/me/proposals/${second.proposalIds[0]}/approve`).set(auth(user)).send({ approved: true }).expect(201)).body.data;
    assert.equal(ok.policyRef, 'legacy_presentation@1 (legacy_baseline)');
    assert.equal((await pool.query('select grounding_status from agent_proposal where id = $1', [second.proposalIds[0]])).rows[0].grounding_status, 'grounded');
    const changes = (await pool.query(`select field, new_value from config_change where entity_table = 'claim_policy' and entity_id = $1 order by created_at`, [v2])).rows.map((r) => `${r.field}:${r.new_value}`);
    assert.deepEqual(changes, ['review_status:approved', 'activation:production_active', 'activation:inactive']);
  });
});

describe('historical compatibility', () => {
  test('a wording proposal created before 0017 (no claim columns) is still previewable and approvable, judged by the baseline', async () => {
    const user = await newUser(); const { evidenceId } = await evaluated(user);
    const auto = (await pool.query(`select id, invocation_id from agent_proposal where user_id = $1 and proposal_type = 'cv_bullet'`, [user.id])).rows[0];
    // Shape of a pre-0017 row: same columns, claim columns null.
    const legacy = (await pool.query(`insert into agent_proposal (invocation_id, user_id, agent_type, proposal_type, subject_type, subject_id, summary, structured_payload, evidence_refs, rationale, requires_user_approval, lifecycle, validated_at)
      values ($1,$2,'recruitment','cv_bullet','evidence',$3,'legacy draft',$4,$5,'legacy',true,'awaiting_user',now()) returning id`,
      [auto.invocation_id, user.id, evidenceId, JSON.stringify({ kind: 'wording', currentValue: null, suggestedValueAr: 'عملتُ على «متتبّع عادات»', suggestedValueEn: null,
        supportingSources: [{ kind: 'evidence', ref: evidenceId }], reason: 'r', unsupportedRisk: 'none', limitationNote: null, namedSkillIds: [], namedTechnologies: [] }), [evidenceId]])).rows[0].id;
    const pv = await preview(user, legacy);
    assert.equal(pv.claim.draftedUnder, null, 'drafted before the claim-policy layer'); assert.equal(pv.claim.groundingStatus, null);
    assert.equal(pv.claim.policyNow.ref, 'legacy_presentation@1'); assert.equal(pv.claim.eligibleNow, true);
    const ok = (await http.post(`/v1/me/proposals/${legacy}/approve`).set(auth(user)).send({ approved: true }).expect(201)).body.data;
    assert.equal(ok.policyRef, 'legacy_presentation@1 (legacy_baseline)');
    const row = (await pool.query('select claim_kind, grounding_status, lifecycle from agent_proposal where id = $1', [legacy])).rows[0];
    assert.deepEqual([row.claim_kind, row.grounding_status, row.lifecycle], [null, null, 'approved'], 'the historical row is not rewritten into a claim draft');
  });
});

describe('isolation', () => {
  test('a claim draft history is visible to its owner only (RLS, as the authenticated role)', async () => {
    const a = await newUser(); await evaluated(a);
    const b = await newUser(); await http.post('/v1/me/bootstrap').set(auth(b)).send({}).expect(201);
    const id = (await pool.query(`select id from agent_proposal where user_id = $1 and claim_kind is not null limit 1`, [a.id])).rows[0].id;
    assert.deepEqual(await history(b, id), []);
    assert.deepEqual(await history(a, id), ['drafted']);
    await asAuthenticatedUser(pool, b.id, async (c) => {
      assert.equal((await c.query('select count(*)::int as n from claim_draft_event')).rows[0].n, 0);
      await assert.rejects(() => c.query(`insert into claim_draft_event (proposal_id, user_id, event, claim_kind, actor_kind, detail) values ($1,$2,'approved','cv_bullet','user','x')`, [id, b.id]));
    });
    await asAuthenticatedUser(pool, a.id, async (c) => {
      assert.ok((await c.query('select count(*)::int as n from claim_draft_event')).rows[0].n >= 1);
    });
    await assert.rejects(() => pool.query(`update claim_draft_event set detail = 'rewritten' where proposal_id = $1`, [id]), /append-only/);
  });
});
