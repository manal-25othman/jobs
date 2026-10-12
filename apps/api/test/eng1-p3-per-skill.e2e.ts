/**
 * ENG-1 P3 — the per-skill assessment pathway, driven through the real API as an INACTIVE DEVELOPMENT PATHWAY.
 *
 * The suite runs under a TEST-ONLY per_skill policy (key `default`, an unapproved draft) made development_only with the
 * explicit, transaction-local opt-in `naqla.per_skill_dev_activation = on` (migration 0029). The legacy compatibility
 * policy is restored when the suite ends. Content: the non-demo, SME-value-approved copy of `act_fe_build_interface`
 * (the same fixture verification-integrity.e2e uses), where every skill criterion is decided by a named reviewer.
 * Fixture threshold approvals are test data, not professional values.
 *
 *   1  HTML passes, form validation (JavaScript) fails within ONE activity — each from its own criteria
 *   2  an unmeasured (mapped, claimed, no criterion) skill never advances
 *   3  a previously demonstrated skill influences no other skill; each skill uses its own previous state
 *   4  a failed global integrity gate blocks every skill
 *   5  human-reviewed outcomes remain individually attributable (criterion → reviewer → skill)
 *   6  duplicate requests are idempotent
 *   7  evidence withdrawal preserves historical provenance; the skill alone can re-establish
 *   8  direct client tampering and cross-tenant access are refused
 *   9  historical API consumers remain compatible (legacy fields unchanged; `skills` is additive)
 *  10  production can never run the pathway; unapproved thresholds award no level
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, filesFor, asAuthenticatedUser, expectRejected, asHistoricalWithoutFile,
  useLegacyVerificationCompat, type TestUser } from './helpers';
import { reviewTransition, approveRubricValues } from '../src/career-data/review';
import { promoteDemo } from '../src/career-data/promotion';
import { setConfigActivation, approveConfigRow } from '../src/configuration/config-admin.service';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
const SME = '33333333-3333-4333-8333-333333333333';
const P3_DESCRIPTION = 'ENG-1 P3 TEST ONLY: per-skill development pathway; unapproved draft; development_only by explicit opt-in; never production.';
let activityId = ''; let rubricId = ''; let p3PolicyId = '';
const S: Record<'html' | 'forms' | 'states' | 'responsive' | 'unmeasured', string> = { html: '', forms: '', states: '', responsive: '', unmeasured: '' };
const SOLID: Record<string, string> = { semantic_structure: 'solid', form_validation: 'solid', data_states: 'solid', state_transitions: 'solid', responsive_layout: 'solid',
  explanation_clarity: 'solid', judgment_assumption_check: 'met' };

async function inConfigTx(fn: (c: import('pg').PoolClient) => Promise<void>, optIn = false): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('naqla.config_actor', 'ENG-1 P3 e2e', true), set_config('naqla.config_reason', 'controlled development test of the per-skill pathway', true)");
    if (optIn) await c.query("select set_config('naqla.per_skill_dev_activation', 'on', true)");
    await fn(c);
    await c.query('commit');
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}
async function usePerSkillPolicy(): Promise<void> {
  await inConfigTx(async (c) => {
    await c.query(`update verification_policy set activation = 'inactive' where key = 'default' and activation <> 'inactive' and id <> $1`, [p3PolicyId]);
    await c.query(`update verification_policy set activation = 'development_only' where id = $1 and activation <> 'development_only'`, [p3PolicyId]);
  }, true);
}

before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  // Content: the promoted (non-demo) copy of act_fe_build_interface, values SME-approved, published — as verification-integrity.e2e.
  const demoAct = (await one(`select id from activity_spec where slug = 'act_fe_build_interface' and is_demo_fixture`)).id;
  const existing = await one(`select canonical_entity_id from content_promotion where entity_kind = 'activity_spec' and demo_entity_id = $1 order by created_at desc limit 1`, [demoAct]);
  activityId = existing?.canonical_entity_id ?? (await promoteDemo(pool, 'activity_spec', demoAct, 'content author', 'ENG-1 P3 fixture')).canonicalId;
  rubricId = (await one(`select id from rubric_version where activity_spec_id = $1 and not is_demo_fixture order by created_at desc limit 1`, [activityId])).id;
  const walk = async (kind: 'activity_spec' | 'rubric_version', id: string) => {
    const st = async () => (await one(`select status::text as s from ${kind} where id = $1`, [id])).s as string;
    if ((await st()) === 'draft') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'curated', decidedBy: null, decidedByLabel: 'author', rolePerformed: 'content_author', reason: 'submitted', production: false });
    if ((await st()) === 'curated') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'sme_reviewed', decidedBy: SME, decidedByLabel: 'Named SME', rolePerformed: 'sme', reason: 'reviewed', production: false });
    if ((await st()) === 'sme_reviewed') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'approved', decidedBy: SME, decidedByLabel: 'Named SME', rolePerformed: 'sme', reason: 'approved', production: false });
    if ((await st()) === 'approved') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'published', decidedBy: null, decidedByLabel: 'Product Owner', rolePerformed: 'product_owner', reason: 'publish', production: false });
  };
  if (!(await one('select values_approved_at from rubric_version where id = $1', [rubricId])).values_approved_at) {
    await approveRubricValues(pool, { rubricVersionId: rubricId, decidedBy: SME, decidedByLabel: 'Named SME', reason: 'ENG-1 P3 fixture: test values (not professional values)' });
  }
  await walk('activity_spec', activityId); await walk('rubric_version', rubricId);
  const skillOf = async (key: string) => (await one(`select canonical_skill_id(linked_skill_id) as id from rubric_criterion where rubric_version_id = $1 and key = $2`, [rubricId, key])).id as string;
  S.html = await skillOf('semantic_structure'); S.forms = await skillOf('form_validation'); S.states = await skillOf('data_states'); S.responsive = await skillOf('responsive_layout');
  // A graduate-visible, active skill the rubric does not measure, mapped to the activity (secondary): claimable, never assessable.
  S.unmeasured = (await one(`select id from skill s where status = 'active' and graduate_content_visible(review_status, is_demo_fixture)
      and id not in (select canonical_skill_id(linked_skill_id) from rubric_criterion where rubric_version_id = $1 and linked_skill_id is not null)
      order by (select count(*) from activity_skill a where a.activity_spec_id = $2 and a.skill_id = s.id) desc, slug limit 1`, [rubricId, activityId])).id;
  await pool.query(`insert into activity_skill (activity_spec_id, skill_id, depth) values ($1, $2, 'secondary') on conflict do nothing`, [activityId, S.unmeasured]);
  // The test-only per_skill development policy (created once, reused).
  p3PolicyId = (await one(`select id from verification_policy where key = 'default' and description_en = $1`, [P3_DESCRIPTION]))?.id ?? '';
  if (!p3PolicyId) {
    await inConfigTx(async (c) => {
      const v = (await c.query(`select max(version) + 1 as v from verification_policy where key = 'default'`)).rows[0].v as number;
      p3PolicyId = (await c.query(`insert into verification_policy (key, version, description_en, promotion_basis, practiced_on_submission, assessment_scope)
        values ('default', $1, $2, 'independently_verified', false, 'per_skill') returning id`, [Math.max(v, 960), P3_DESCRIPTION])).rows[0].id;
    });
  }
  await usePerSkillPolicy();
});
after(async () => {
  // Restore what every other suite expects; the per_skill policy goes back to inactive.
  await useLegacyVerificationCompat();
  await pool?.end(); await app?.close();
});

async function graduate(): Promise<TestUser> {
  const u = await newUser(); await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: (await one('select target_role_id from activity_spec where id = $1', [activityId])).target_role_id, confirmed: true }).expect(200);
  return u;
}
async function submit(u: TestUser, skills: string[], act = activityId): Promise<string> {
  const pid = (await http.post('/v1/projects').set(auth(u)).send({ title: 'طلب إجازة', kind: 'platform_activity', activitySpecId: act }).expect(201)).body.data.id;
  const f1 = await uploadFile(app, http, u, 'index.html', COMPONENT_BYTES, 'text/plain'); const f2 = await uploadFile(app, http, u, 'styles.css', TEST_BYTES, 'text/plain');
  const f3 = await uploadFile(app, http, u, 'app.js', TEST_BYTES);
  return (await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: skills, files: filesFor([f1, f2, f3], ['file.index_html', 'file.styles_css', 'file.app_js']),
    aiDisclosure: { declaredUse: [] }, artifacts: [
      { key: 'note.data_flow', kind: 'text', valueText: 'The form submits to a state object; the list is fetched on load and re-rendered from state; loading, error and empty are explicit states.', locator: 'notes.md' },
      { key: 'answer.clarification', kind: 'text', valueText: 'The brief says four fields and the spec lists five; I implemented the four and flagged the fifth.', locator: 'notes.md' },
    ] }).expect(201)).body.data.id as string;
}
let reviewer: TestUser | null = null;
async function theReviewer(): Promise<TestUser> {
  if (reviewer) return reviewer;
  const r = await newUser(); await http.post('/v1/me/bootstrap').set(auth(r)).send({}).expect(201);
  await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'human_reviewer', 'e2e operator')`, [r.id]);
  return (reviewer = r);
}
/** Evaluate, then a named reviewer decides every human criterion with the given levels (auto-finalisation on the last). */
async function reviewed(u: TestUser, sid: string, levels: Record<string, string> = {}): Promise<{ evaluationId: string; finalResultId: string; interim: Record<string, unknown> }> {
  const ev = (await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u)).expect(201)).body.data;
  if (ev.outcome === 'needs_human_review') {
    const r = await theReviewer();
    const items = (await pool.query(`select id, criterion_key from review_queue_item where evaluation_id = $1 order by criterion_key`, [ev.evaluationId])).rows;
    for (const it of items) {
      await http.post(`/v1/review/queue/${it.id}/assign`).set(auth(r)).send({}).expect(201);
      await http.get(`/v1/review/items/${it.id}`).set(auth(r)).expect(200);
      await http.post(`/v1/review/items/${it.id}/decision`).set(auth(r)).send({ levelKey: levels[it.criterion_key] ?? SOLID[it.criterion_key], rationale: `Observed in the submitted files: ${it.criterion_key}.` }).expect(201);
    }
  }
  const fin = await one(`select r.id from evaluation_result r where r.evaluation_id = $1 and not exists (select 1 from evaluation_result n where n.supersedes_result_id = r.id)`, [ev.evaluationId]);
  return { evaluationId: ev.evaluationId, finalResultId: fin.id, interim: ev };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const skillRows = async (resultId: string): Promise<Record<string, any>> => Object.fromEntries((await pool.query(
  `select sa.skill_id, sa.id, sa.outcome, sa.current_state::text, sa.proposed_state::text, sa.claimed, sa.basis_independently_verified, sa.rubric_version_id, sa.rubric_resolution,
          d.decision, d.previous_state::text as d_prev, d.resulting_state::text as d_res, d.evidence_id, d.verification_id
     from skill_assessment sa left join verification_decision d on d.skill_assessment_id = sa.id where sa.evaluation_result_id = $1`, [resultId])).rows.map((r) => [r.skill_id, r]));
const claimState = async (userId: string, skillId: string) => ((await one('select state::text from skill_claim where user_id = $1 and skill_id = $2', [userId, skillId]))?.state as string | undefined) ?? 'gap';

describe('ENG-1 P3 — per-skill assessment through the API (development pathway)', () => {
  let shared: { u: TestUser; sid: string; evaluationId: string; resultId: string } | null = null;

  test('1 · HTML passes and form validation fails within ONE activity; each skill from its own criteria; the pinned rubric; no legacy verification row', async () => {
    const u = await graduate();
    const sid = await submit(u, [S.html, S.forms]);
    const { evaluationId, finalResultId } = await reviewed(u, sid, { form_validation: 'missing' });
    const rows = await skillRows(finalResultId);
    assert.deepEqual(Object.keys(rows).sort(), [S.html, S.forms].sort(), 'exactly the claimed skills are assessed');
    assert.equal(rows[S.html].outcome, 'met'); assert.equal(rows[S.html].decision, 'accepted'); assert.equal(rows[S.html].d_res, 'demonstrated');
    assert.equal(rows[S.forms].outcome, 'not_met'); assert.equal(rows[S.forms].decision, 'not_applicable'); assert.equal(rows[S.forms].evidence_id, null);
    assert.equal(await claimState(u.id, S.html), 'demonstrated'); assert.equal(await claimState(u.id, S.forms), 'gap');
    for (const r of Object.values(rows)) { assert.equal(r.rubric_version_id, rubricId); assert.equal(r.rubric_resolution, 'bound'); assert.equal(r.verification_id, null); }
    const ev = await one('select skill_id, skill_assessment_id from evidence where id = $1', [rows[S.html].evidence_id]);
    assert.deepEqual([ev.skill_id, ev.skill_assessment_id], [S.html, rows[S.html].id], 'the evidence cites the HTML assessment');
    assert.equal(Number((await one('select count(*)::int n from verification where evaluation_result_id = $1', [finalResultId])).n), 0, 'no dual-write into the legacy single-skill table');
    assert.equal(Number((await one(`select count(*)::int n from skill_assessment_criterion where skill_assessment_id = $1`, [rows[S.forms].id])).n), 1);
    assert.equal((await one(`select criterion_key from skill_assessment_criterion where skill_assessment_id = $1`, [rows[S.html].id])).criterion_key, 'semantic_structure');
    shared = { u, sid, evaluationId, resultId: finalResultId };
  });

  test('2 · a mapped, claimed skill that no criterion measures is not_assessed and never advances — even beside a met skill', async () => {
    const u = await graduate();
    const { finalResultId } = await reviewed(u, await submit(u, [S.html, S.unmeasured]));
    const rows = await skillRows(finalResultId);
    assert.equal(rows[S.unmeasured].outcome, 'not_assessed'); assert.equal(rows[S.unmeasured].decision, 'not_applicable'); assert.equal(rows[S.unmeasured].evidence_id, null);
    assert.equal(Number((await one(`select count(*)::int n from skill_assessment_criterion where skill_assessment_id = $1`, [rows[S.unmeasured].id])).n), 0);
    assert.equal(await claimState(u.id, S.unmeasured), 'gap');
    assert.equal(rows[S.html].decision, 'accepted', 'the measured skill is unaffected');
  });

  test('3 · a previously demonstrated skill does not carry another: each skill uses its own previous state and evidence', async () => {
    const u = await graduate();
    await reviewed(u, await submit(u, [S.html]));
    assert.equal(await claimState(u.id, S.html), 'demonstrated');
    const second = await reviewed(u, await submit(u, [S.html, S.forms]), { form_validation: 'missing' });
    const rows = await skillRows(second.finalResultId);
    assert.equal(rows[S.html].current_state, 'demonstrated'); assert.equal(rows[S.html].proposed_state, null);
    assert.equal(rows[S.html].decision, 'not_applicable'); assert.match((await one('select reason from verification_decision where skill_assessment_id = $1', [rows[S.html].id])).reason, /already at 'demonstrated'/);
    assert.equal(rows[S.forms].current_state, 'gap', 'the other skill starts from ITS OWN state'); assert.equal(rows[S.forms].outcome, 'not_met');
    assert.equal(await claimState(u.id, S.forms), 'gap', 'a demonstrated HTML skill does not lift form validation');
    const third = await reviewed(u, await submit(u, [S.forms]));
    const r3 = await skillRows(third.finalResultId);
    assert.equal(r3[S.forms].decision, 'accepted'); assert.equal(r3[S.forms].d_prev, 'gap', 'promoted on its own criteria, from its own state');
  });

  test('4 · a failed global integrity gate blocks every skill; nothing advances', async () => {
    const u = await graduate();
    const sid = await submit(u, [S.html, S.forms]);
    await asHistoricalWithoutFile(pool, sid, 'file.index_html');
    const { finalResultId } = await reviewed(u, sid);
    const rows = await skillRows(finalResultId);
    for (const s of [S.html, S.forms]) { assert.equal(rows[s].outcome, 'blocked', s); assert.equal(rows[s].evidence_id, null); assert.equal(await claimState(u.id, s), 'gap'); }
  });

  test('5 · human-reviewed outcomes remain individually attributable: skill → its criterion → the reviewer\'s decision', async () => {
    assert.ok(shared, 'test 1 ran');
    const rows = (await pool.query(
      `select sa.skill_id, sc.criterion_key, acr.evaluator_kind, cr.reviewer_id, cr.score
         from skill_assessment sa join skill_assessment_criterion sc on sc.skill_assessment_id = sa.id
         join assessment_criterion_result acr on acr.id = sc.assessment_criterion_result_id
         join review_queue_item q on q.evaluation_id = $2 and q.criterion_key = sc.criterion_key
         join criterion_review cr on cr.queue_item_id = q.id
        where sa.evaluation_result_id = $1 order by sa.skill_id`, [shared!.resultId, shared!.evaluationId])).rows;
    const by = Object.fromEntries(rows.map((r) => [r.skill_id, r]));
    assert.equal(by[S.html].criterion_key, 'semantic_structure'); assert.equal(Number(by[S.html].score), 2);
    assert.equal(by[S.forms].criterion_key, 'form_validation'); assert.equal(Number(by[S.forms].score), 0);
    for (const r of rows) { assert.equal(r.evaluator_kind, 'human'); assert.equal(r.reviewer_id, reviewer!.id, 'the named reviewer of THAT criterion'); }
  });

  test('6 · duplicate requests are idempotent: a repeated evaluate answers the same evaluation; nothing is written twice', async () => {
    const { u, sid, evaluationId, resultId } = shared!;
    const count = async () => (await one(`select (select count(*) from skill_assessment where user_id = $1)::int a, (select count(*) from verification_decision where user_id = $1)::int d,
      (select count(*) from evidence where user_id = $1)::int e, (select count(*) from evaluation_result where submission_id = $2)::int r`, [u.id, sid]));
    const before = await count();
    const again = await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u));
    assert.ok(again.status < 300); assert.equal(again.body.data.evaluationId, evaluationId); assert.equal(again.body.data.alreadyEvaluated, true);
    assert.equal(again.body.data.skills.length, 2);
    assert.deepEqual(await count(), before);
    const html = (await skillRows(resultId))[S.html];
    await assert.rejects(() => pool.query(`insert into skill_assessment select (jsonb_populate_record(null::skill_assessment, to_jsonb(s) || jsonb_build_object('id', gen_random_uuid()))).* from skill_assessment s where s.id = $1`, [html.id]), /one_per_skill/);
    await assert.rejects(() => pool.query(`insert into evidence (user_id, skill_id, source_strength, evaluation_result_id, provenance_class, provenance_source, confidence, skill_assessment_id)
      values ($1,$2,'platform_controlled',$3,'system_derived','dup',1,$4)`, [u.id, S.html, resultId, html.id]), /duplicate key/);
    assert.deepEqual(await count(), before);
  });

  test('7 · withdrawing the HTML evidence preserves its provenance; only HTML can re-establish, from its own new assessment', async () => {
    const { u, resultId } = shared!;
    const html = (await skillRows(resultId))[S.html];
    const beforeSa = await one('select * from skill_assessment where id = $1', [html.id]);
    await http.post(`/v1/evidence/${html.evidence_id}/withdraw`).set(auth(u)).send({ reason: 'لم يكن العمل عملي بالكامل' }).expect(201);
    const ev = await one('select skill_id, skill_assessment_id, evaluation_result_id, withdrawn_at from evidence where id = $1', [html.evidence_id]);
    assert.ok(ev.withdrawn_at); assert.deepEqual([ev.skill_id, ev.skill_assessment_id, ev.evaluation_result_id], [S.html, html.id, resultId], 'provenance kept');
    assert.deepEqual(await one('select * from skill_assessment where id = $1', [html.id]), beforeSa, 'the assessment is history');
    assert.equal((await one('select decision from verification_decision where skill_assessment_id = $1', [html.id])).decision, 'accepted', 'the decision is history');
    const view = (await http.get(`/v1/submissions/${shared!.sid}/evaluation`).set(auth(u)).expect(200)).body.data;
    assert.equal(view.skills.find((x: { skillId: string }) => x.skillId === S.html).evidence.withdrawn, true);
    const again = await reviewed(u, await submit(u, [S.html, S.forms]), { form_validation: 'missing' });
    const rows = await skillRows(again.finalResultId);
    assert.equal(rows[S.html].decision, 'evidence_reestablished');
    assert.equal((await one('select skill_assessment_id from evidence where id = $1', [rows[S.html].evidence_id])).skill_assessment_id, rows[S.html].id);
    assert.equal(rows[S.forms].evidence_id, null, 'form validation gains nothing from HTML re-establishment');
  });

  test('8 · direct client tampering and cross-tenant access are refused', async () => {
    const { u, sid, resultId } = shared!;
    const html = (await skillRows(resultId))[S.html];
    await asAuthenticatedUser(pool, u.id, async (c) => {
      assert.equal((await c.query('select count(*)::int n from skill_assessment where evaluation_result_id = $1', [resultId])).rows[0].n, 2, 'the owner reads their own assessments');
      await expectRejected(c, `update skill_assessment set outcome = 'met' where id = $1`, [html.id], /permission denied/);
      await expectRejected(c, `insert into skill_assessment_criterion (skill_assessment_id, assessment_criterion_result_id, user_id, criterion_key, status, max_score) select $1, assessment_criterion_result_id, user_id, 'x', 'met', 2 from skill_assessment_criterion where skill_assessment_id = $1`, [html.id], /permission denied/);
      // No client update policy exists on decisions: RLS leaves the statement nothing to touch.
      assert.equal((await c.query(`update verification_decision set decision = 'accepted' where skill_assessment_id is not null`)).rowCount, 0);
      await expectRejected(c, `update evidence set skill_assessment_id = null where id = $1`, [html.evidence_id], /permission denied/);
      await expectRejected(c, `insert into submission_claimed_skill (submission_id, skill_id, user_id) values ($1,$2,$3)`, [sid, S.responsive, u.id], /permission denied/);
    });
    const other = await graduate();
    await asAuthenticatedUser(pool, other.id, async (c) => {
      assert.equal((await c.query('select count(*)::int n from skill_assessment where user_id = $1', [u.id])).rows[0].n, 0);
      assert.equal((await c.query('select count(*)::int n from skill_assessment_criterion where user_id = $1', [u.id])).rows[0].n, 0);
    });
    await http.get(`/v1/submissions/${sid}/evaluation`).set(auth(other)).expect(404);
    await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(other)).expect(404);
    const c = await pool.connect();
    try { await c.query('begin'); await c.query('set local role anon'); await assert.rejects(() => c.query('select 1 from skill_assessment'), /permission denied/); }
    finally { await c.query('rollback'); c.release(); }
  });

  test('9 · historical API consumers remain compatible: every legacy field is present and typed as before; `skills` is additive', async () => {
    const { u, sid } = shared!;
    const LEGACY_KEYS = ['submissionId', 'evaluationId', 'state', 'workStatus', 'humanReview', 'resultId', 'outcome', 'totalScore', 'maxScore', 'reason', 'rubricVersion',
      'activitySpecVersion', 'evaluatedAt', 'criteria', 'integrityChecks', 'transition', 'verification', 'verificationDecision', 'levelAttribution', 'actions'];
    const view = (await http.get(`/v1/submissions/${sid}/evaluation`).set(auth(u)).expect(200)).body.data;
    for (const k of LEGACY_KEYS) assert.ok(k in view, k);
    assert.equal(view.levelAttribution, 'per_skill');
    assert.equal(view.verification.decision, 'accepted', 'the representative decision is the one that moved a level');
    assert.deepEqual([view.transition.from, view.transition.to], ['gap', 'demonstrated']);
    assert.ok(Array.isArray(view.criteria) && view.criteria.length > 0);
    assert.deepEqual(view.skills.map((x: { outcome: string }) => x.outcome).sort(), ['met', 'not_met']);
    assert.ok(view.skills.every((x: { criteria: unknown[]; decision: unknown }) => Array.isArray(x.criteria) && x.decision));
    // My Work agrees with the evaluation view on the representative decision and the work status.
    const pid = (await one('select project_id from submission where id = $1', [sid])).project_id;
    const work = (await http.get('/v1/projects').set(auth(u)).expect(200)).body.data.items as { id: string; workStatus: string; latestSubmission: { decision: string; levelChanged: boolean } }[];
    const item = work.find((w) => w.id === pid)!;
    assert.equal(item.workStatus, view.workStatus); assert.equal(item.latestSubmission.decision, 'accepted'); assert.equal(item.latestSubmission.levelChanged, true);
    // A legacy-scope evaluation (the compatibility policy) answers exactly as before, with an empty `skills`.
    await useLegacyVerificationCompat();
    try {
      const lu = await newUser(); await http.post('/v1/me/bootstrap').set(auth(lu)).send({}).expect(201);
      await http.put('/v1/me/career-goal').set(auth(lu)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
      const pid = (await http.post('/v1/projects').set(auth(lu)).send({ title: 'legacy', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id;
      const up = [await uploadFile(app, http, lu, 'HabitList.jsx', COMPONENT_BYTES), await uploadFile(app, http, lu, 'HabitList.test.jsx', TEST_BYTES)];
      const lsid = (await http.post(`/v1/projects/${pid}/submissions`).set(auth(lu)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, files: filesFor(up), aiDisclosure: { declaredUse: [] } }).expect(201)).body.data.id;
      const ev = (await http.post(`/v1/submissions/${lsid}/evaluate`).set(auth(lu)).expect(201)).body.data;
      assert.ok(ev.transition?.evidenceId); assert.deepEqual(ev.skills, []);
      const lview = (await http.get(`/v1/submissions/${lsid}/evaluation`).set(auth(lu)).expect(200)).body.data;
      for (const k of LEGACY_KEYS) assert.ok(k in lview, k);
      assert.equal(lview.levelAttribution, 'attributed'); assert.deepEqual(lview.skills, []); assert.equal(lview.verification.outcome, 'accepted', 'the legacy verification row is still served');
      assert.equal(Number((await one('select count(*)::int n from skill_assessment where user_id = $1', [lu.id])).n), 0);
    } finally { await usePerSkillPolicy(); }
  });

  test('10a · production can never run the pathway: no development_only row resolves, the writer is never reached, the configuration paths refuse', async () => {
    const u = await graduate();
    const sid = await submit(u, [S.html]);
    const prev = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const r = await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u));
      assert.ok(r.status >= 400, `refused in production (${r.status})`);
      const c = await pool.connect();
      try {
        await c.query('begin');
        await assert.rejects(() => setConfigActivation(c, { table: 'verification_policy', id: p3PolicyId, activation: 'development_only', actor: 'e2e', reason: 'production attempt' }), /production|per-skill/);
      } finally { await c.query('rollback'); c.release(); }
    } finally { process.env['NODE_ENV'] = prev; }
    assert.equal(Number((await one('select count(*)::int n from skill_assessment where user_id = $1', [u.id])).n), 0);
    assert.equal(Number((await one('select count(*)::int n from evaluation where submission_id = $1', [sid])).n), 0, 'nothing was written');
    for (const attempt of [
      (c: import('pg').PoolClient) => approveConfigRow(c, { table: 'verification_policy', id: p3PolicyId, approvedBy: SME, approvedByLabel: 'Named SME', reason: 'try' }),
      (c: import('pg').PoolClient) => setConfigActivation(c, { table: 'verification_policy', id: p3PolicyId, activation: 'production_active', actor: 'e2e', reason: 'try' }),
    ]) {
      const c = await pool.connect();
      try { await c.query('begin'); await assert.rejects(() => attempt(c), /per-skill|approved|development/); } finally { await c.query('rollback'); c.release(); }
    }
    await assert.rejects(() => inConfigTx(async (c) => { await c.query("select set_config('naqla.production', 'on', true)"); await c.query(`update verification_policy set activation = 'inactive' where id = $1`, [p3PolicyId]);
      await c.query(`update verification_policy set activation = 'development_only' where id = $1`, [p3PolicyId]); }, true), /production/);
  });

  test('10b · without approved thresholds (the DEMO rubric: values proposed, never SME-approved) the pathway records test-only outcomes and awards no level', async () => {
    const demoAct = (await one(`select id from activity_spec where slug = 'act_fe_build_interface' and is_demo_fixture`)).id;
    const demoRubric = await one(`select id, status from rubric_version where activity_spec_id = $1`, [demoAct]);
    if (demoRubric.status !== 'published') { // DEMO shortcut outside production, as human-review.e2e does
      await pool.query(`update rubric_version set status = 'curated' where id = $1 and status = 'draft'`, [demoRubric.id]); await pool.query(`update rubric_version set status = 'published' where id = $1`, [demoRubric.id]);
      await pool.query(`update activity_spec set status = 'curated' where id = $1 and status = 'draft'`, [demoAct]); await pool.query(`update activity_spec set status = 'published' where id = $1`, [demoAct]);
    }
    const demoHtml = (await one(`select canonical_skill_id(linked_skill_id) as id from rubric_criterion where rubric_version_id = $1 and key = 'semantic_structure'`, [demoRubric.id])).id;
    const u = await graduate();
    const { finalResultId } = await reviewed(u, await submit(u, [demoHtml], demoAct));
    const rows = await skillRows(finalResultId);
    assert.equal(rows[demoHtml].outcome, 'incomplete'); assert.equal(rows[demoHtml].decision, 'not_applicable');
    assert.equal((await one(`select status from skill_assessment_criterion where skill_assessment_id = $1`, [rows[demoHtml].id])).status, 'threshold_unapproved');
    assert.equal(Number((await one('select count(*)::int n from evidence where user_id = $1', [u.id])).n), 0);
    assert.equal(await claimState(u.id, demoHtml), 'gap');
  });
});
