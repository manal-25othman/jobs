/**
 * Human evaluation flow (OPEN-041): deterministic checks → queue → blind review →
 * immutable criterion decisions → aggregation → domain transition. The fifteen
 * proofs the owner asked for, against a real database.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, uploadFile, COMPONENT_BYTES, TEST_BYTES, asAuthenticatedUser, expectRejected, type TestUser } from './helpers';
import { EvaluationService } from '../src/slice1/evaluation.service';
import { assertBlindPayload } from '@naqla/domain';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
let activityId: string; let rubricId: string; let skillId: string;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  // The pack activity with 1 rule criterion + 7 human criteria. DEMO shortcut: curated → published (non-production).
  const a = await pool.query(`select id from activity_spec where slug = 'act_fe_build_interface' and is_demo_fixture`); activityId = a.rows[0].id;
  const r = await pool.query(`select id, status from rubric_version where activity_spec_id = $1`, [activityId]); rubricId = r.rows[0].id;
  if (r.rows[0].status !== 'published') {
    await pool.query(`update rubric_version set status = 'curated' where id = $1 and status = 'draft'`, [rubricId]);
    await pool.query(`update rubric_version set status = 'published' where id = $1`, [rubricId]);
    await pool.query(`update activity_spec set status = 'curated' where id = $1 and status = 'draft'`, [activityId]);
    await pool.query(`update activity_spec set status = 'published' where id = $1`, [activityId]);
  }
  skillId = (await pool.query(`select id from skill where slug = 'skl_ui_state_interaction' and is_demo_fixture`)).rows[0].id;
});
after(async () => { await pool?.end(); await app?.close(); });

const ARTIFACTS = [
  { key: 'file.index_html', kind: 'boolean' as const, valueBool: true, locator: 'index.html' },
  { key: 'file.styles_css', kind: 'boolean' as const, valueBool: true, locator: 'styles.css' },
  { key: 'file.app_js', kind: 'boolean' as const, valueBool: true, locator: 'app.js' },
  { key: 'note.data_flow', kind: 'text' as const, valueText: 'The form submits to a state object; the list is fetched on load and re-rendered from state; loading, error and empty are three explicit states held in one place.', locator: 'notes.md' },
  { key: 'answer.clarification', kind: 'text' as const, valueText: 'The brief says four fields and the spec lists five; I implemented the four in the brief and flagged the fifth as a question.', locator: 'notes.md' },
];
async function reviewer(): Promise<TestUser> {
  const u = await newUser(); await http.post('/v1/me/bootstrap').set(auth(u)).send({ displayName: 'Reviewer Person' }).expect(201);
  await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'human_reviewer', 'e2e operator')`, [u.id]);
  return u;
}
async function submitted(user: TestUser, artifacts = ARTIFACTS) {
  await http.post('/v1/me/bootstrap').set(auth(user)).send({ displayName: 'Sara Identity' }).expect(201);
  await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  const project = await http.post('/v1/projects').set(auth(user)).send({ title: 'طلب إجازة', kind: 'platform_activity', activitySpecId: activityId }).expect(201);
  const u1 = await uploadFile(app, http, user, 'index.html', COMPONENT_BYTES); const u2 = await uploadFile(app, http, user, 'app.js', TEST_BYTES);
  const sub = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user)).send({ skillIds: [skillId], artifacts, uploadIds: [u1, u2], aiDisclosure: { declaredUse: ['code_completion'] } }).expect(201);
  const ev = await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(user)).expect(201);
  return { submissionId: sub.body.data.id as string, ev: ev.body.data as { outcome: string; humanReview: { pendingCriteria: string[] } | null; evaluationId: string } };
}
const queueOf = async (r: TestUser) => (await http.get('/v1/review/queue').set(auth(r)).expect(200)).body.data.items as Array<{ id: string; criterionKey: string; state: string }>;
const LEVELS: Record<string, string> = { semantic_structure: 'solid', form_validation: 'solid', data_states: 'solid', state_transitions: 'solid', responsive_layout: 'solid', explanation_clarity: 'partial', judgment_assumption_check: 'met' };
async function decideAll(r: TestUser, evaluationId: string, until = Infinity) {
  const items = (await pool.query(`select id, criterion_key from review_queue_item where evaluation_id = $1 and state <> 'completed' order by criterion_key`, [evaluationId])).rows;
  let n = 0; const out: Array<Record<string, unknown>> = [];
  for (const it of items) {
    if (n >= until) break;
    await http.post(`/v1/review/queue/${it.id}/assign`).set(auth(r)).send({}).expect(201);
    await http.get(`/v1/review/items/${it.id}`).set(auth(r)).expect(200);
    const d = await http.post(`/v1/review/items/${it.id}/decision`).set(auth(r)).send({ levelKey: LEVELS[it.criterion_key], rationale: `Observed in the submission: ${it.criterion_key} meets the descriptor.` }).expect(201);
    out.push(d.body.data); n++;
  }
  return out;
}

describe('4, 5, 12 — deterministic stage, queue contents, what the user sees', () => {
  test('human-required criteria enter the queue; the deterministic criterion does not; the user sees "pending review"', async () => {
    const user = await newUser(); const { submissionId, ev } = await submitted(user);
    assert.equal(ev.outcome, 'needs_human_review'); assert.equal(ev.humanReview?.pendingCriteria.length, 7);
    const q = await pool.query('select criterion_key from review_queue_item where evaluation_id = $1 order by criterion_key', [ev.evaluationId]);
    assert.equal(q.rowCount, 7, '4 — one item per human criterion');
    assert.ok(!q.rows.some((r) => r.criterion_key === 'deliverables_complete'), '5 — the rule criterion never enters the queue');
    const view = await http.get(`/v1/submissions/${submissionId}/evaluation`).set(auth(user)).expect(200);
    assert.equal(view.body.data.state, 'queued_for_human'); assert.equal(view.body.data.outcome, 'needs_human_review');
    assert.equal(view.body.data.humanReview.pending, 7); assert.equal(view.body.data.criteria.length, 1, 'what was checked automatically');
    assert.ok(!JSON.stringify(view.body.data).match(/minutes|دقائق|فشل/), '12 — no invented time, no "failed"');
    assert.equal((await pool.query('select count(*)::int n from evidence where user_id = $1', [user.id])).rows[0].n, 0, 'nothing proposed before review');
    // The user cannot re-evaluate while it is in review.
    await http.post(`/v1/submissions/${submissionId}/evaluate`).set(auth(user)).expect(400);
  });
  test('10 — a missing mandatory deliverable blocks deterministically; nothing reaches a reviewer', async () => {
    const user = await newUser(); const { ev } = await submitted(user, ARTIFACTS.filter((a) => a.key !== 'file.styles_css'));
    assert.equal(ev.outcome, 'blocked_by_checks'); assert.equal(ev.humanReview, null);
    assert.equal((await pool.query('select count(*)::int n from review_queue_item where evaluation_id = $1', [ev.evaluationId])).rows[0].n, 0);
    assert.equal((await pool.query('select state from evaluation where id = $1', [ev.evaluationId])).rows[0].state, 'completed');
  });
});

describe('OPEN-044 / OPEN-045 / OPEN-039 — what the deterministic stage records, what the reviewer receives, what a claim may name', () => {
  test('6, 8 — human-observable checks reach the reviewer of their criterion as inputs; removed and inactive checks are not evaluated; the gate scores without a skill', async () => {
    const user = await newUser(); const { ev } = await submitted(user); const r = await reviewer();
    const interim = (await pool.query(`select id from evaluation_result where evaluation_id = $1 order by evaluated_at limit 1`, [ev.evaluationId])).rows[0].id;
    const checks = (await pool.query('select check_key from integrity_check where evaluation_result_id = $1 order by check_key', [interim])).rows.map((x) => x.check_key);
    assert.deepEqual(checks, ['clarify_fields_conflict', 'explain_data_flow', 'files_present'], '8 — only active deterministic checks were evaluated; no signal.* check, no removed check');
    const gate = (await pool.query(`select skill_id, score, max_score from evaluation_criterion_score where evaluation_result_id = $1 and criterion_key = 'deliverables_complete'`, [interim])).rows[0];
    assert.equal(gate.skill_id, null, '3 — the completeness gate is scored but mapped to no skill'); assert.equal(Number(gate.score), Number(gate.max_score));
    const item = (await pool.query(`select id from review_queue_item where evaluation_id = $1 and criterion_key = 'data_states'`, [ev.evaluationId])).rows[0];
    await http.post(`/v1/review/queue/${item.id}/assign`).set(auth(r)).send({}).expect(201);
    const opened = await http.get(`/v1/review/items/${item.id}`).set(auth(r)).expect(200);
    const obs = opened.body.data.criterion.observations as Array<{ key: string; reviewerPromptAr: string; passWhenEn: string; failWhenEn: string; affectsEvidence: boolean }>;
    assert.deepEqual(obs.map((o) => o.key).sort(), ['empty_response_edge', 'error_500_expected_failure'], '6 — the two human-observable checks of data_states are inputs to its reviewer');
    for (const o of obs) { assert.ok(o.reviewerPromptAr.length > 20); assert.ok(o.passWhenEn && o.failWhenEn); assert.equal(o.affectsEvidence, true); }
    assert.doesNotThrow(() => assertBlindPayload(opened.body.data));
    const other = (await pool.query(`select id from review_queue_item where evaluation_id = $1 and criterion_key = 'semantic_structure'`, [ev.evaluationId])).rows[0];
    await http.post(`/v1/review/queue/${other.id}/assign`).set(auth(r)).send({}).expect(201);
    assert.deepEqual((await http.get(`/v1/review/items/${other.id}`).set(auth(r)).expect(200)).body.data.criterion.observations, [], 'a criterion with no observation gets none');
  });
  test('OPEN-039 — a claim on the alias skill is refused and names the canonical skill; nothing is guessed', async () => {
    const user = await newUser(); await http.post('/v1/me/bootstrap').set(auth(user)).send({ displayName: 'Alias Claimer' }).expect(201);
    await http.put('/v1/me/career-goal').set(auth(user)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
    const project = await http.post('/v1/projects').set(auth(user)).send({ title: 'x', kind: 'platform_activity', activitySpecId: activityId }).expect(201);
    const res = await http.post(`/v1/projects/${project.body.data.id}/submissions`).set(auth(user)).send({ skillIds: ['a0000000-0000-4000-8000-000000000001'], artifacts: ARTIFACTS, uploadIds: [], aiDisclosure: { declaredUse: [] } }).expect(400);
    assert.match(JSON.stringify(res.body), /merged_into.*skl_ui_state_interaction/);
    assert.equal((await pool.query(`select count(*)::int n from skill where id = 'a0000000-0000-4000-8000-000000000001'`)).rows[0].n, 1, 'the alias row still exists');
  });
});

describe('3, 6, 7, 8, 9, 13, 14, 15 — blind review, permissions, immutability, finalisation', () => {
  test('3 — the reviewer receives no identity: queue and item payloads carry no name, email, user id or profile data', async () => {
    const user = await newUser(); const { submissionId, ev } = await submitted(user); const r = await reviewer();
    const q = await queueOf(r); assert.ok(q.filter((i) => i.state === 'pending').length >= 7);
    const item = (await pool.query(`select id from review_queue_item where evaluation_id = $1 and criterion_key = 'semantic_structure'`, [ev.evaluationId])).rows[0];
    await http.post(`/v1/review/queue/${item.id}/assign`).set(auth(r)).send({}).expect(201);
    const opened = await http.get(`/v1/review/items/${item.id}`).set(auth(r)).expect(200);
    const text = JSON.stringify(opened.body.data) + JSON.stringify(q);
    for (const forbidden of ['Sara Identity', user.id, 'display_name', 'displayName', 'email', 'username', 'university', 'user_id', 'userId', '"cv"', 'linkedin']) assert.ok(!text.includes(forbidden), `payload leaked ${forbidden}`);
    assert.doesNotThrow(() => assertBlindPayload(opened.body.data));
    assert.equal(opened.body.data.criterion.key, 'semantic_structure'); assert.ok(opened.body.data.criterion.levels.length >= 2);
    assert.ok(opened.body.data.submission.artifacts.length >= 5); assert.equal(opened.body.data.submission.files.length, 2);
    assert.ok(opened.body.data.submission.files.every((f: { downloadUrl: string; name: string }) => f.downloadUrl && !f.name.includes(user.id)));
    assert.ok(opened.body.data.submission.userExplanation.some((e: { key: string }) => e.key === 'note.data_flow'));
    assert.equal(opened.body.data.deterministic.criteria.length, 1);
    assert.equal(opened.body.data.submissionId, submissionId);
  });
  test('6, 7 — a reviewer cannot modify the submission or the evidence state: no route exists, and RLS refuses at the database', async () => {
    const user = await newUser(); await submitted(user); const r = await reviewer();
    await http.put(`/v1/review/submissions/x`).set(auth(r)).expect(404);
    await http.post(`/v1/review/evidence/x/state`).set(auth(r)).expect(404);
    const art = (await pool.query('select id from submission_artifact where user_id = $1 limit 1', [user.id])).rows[0].id;
    await asAuthenticatedUser(pool, r.id, async (c) => {
      assert.equal((await c.query(`update submission_artifact set value_text = 'edited by reviewer' where id = $1`, [art])).rowCount, 0);
      assert.equal((await c.query(`update skill_claim set state = 'demonstrated' where user_id = $1`, [user.id])).rowCount, 0);
      assert.equal((await c.query(`update submission set state = 'closed' where user_id = $1`, [user.id])).rowCount, 0);
      await expectRejected(c, `insert into evidence (user_id, skill_id, source_strength, provenance_class, provenance_source) values ($1,$2,'platform_controlled','curated','reviewer')`, [user.id, skillId], /permission denied|row-level security/);
      await expectRejected(c, 'select 1 from review_queue_item', [], /permission denied/);
    });
    // And a non-reviewer account gets nothing from the review API.
    await http.get('/v1/review/queue').set(auth(user)).expect(403);
  });
  test('8, 9, 13, 14, 15 — immutable records, re-review as a new record, no finalisation before every review, then Demonstrated (never Verified)', async () => {
    const user = await newUser(); const { submissionId, ev } = await submitted(user); const r = await reviewer();
    const svc = app.get(EvaluationService, { strict: false });
    const six = await decideAll(r, ev.evaluationId, 6);
    assert.equal(six[5]!['pendingItems'], 1); assert.equal(six[5]!['finalized'], null);
    assert.equal((await pool.query('select state from evaluation where id = $1', [ev.evaluationId])).rows[0].state, 'queued_for_human', '13 — not finalised');
    await assert.rejects(() => svc.finalizeHumanReview(ev.evaluationId), /still pending/);
    assert.equal((await http.get(`/v1/submissions/${submissionId}/evaluation`).set(auth(user)).expect(200)).body.data.humanReview.pending, 1);

    // 8 — immutable: even the service role cannot edit or delete a decision.
    // Re-review a NON-mandatory criterion upward; a mandatory one left partial would rightly fail the rubric.
    const rec = (await pool.query(`select id, queue_item_id from criterion_review where submission_id = $1 and criterion_key = 'explanation_clarity' order by created_at limit 1`, [submissionId])).rows[0];
    await assert.rejects(() => pool.query(`update criterion_review set rationale = 'rewritten' where id = $1`, [rec.id]), /immutable/);
    await assert.rejects(() => pool.query(`delete from criterion_review where id = $1`, [rec.id]), /immutable/);
    // 9 — re-review: a new record superseding the old one; the old one stays. Without naming it: refused.
    await http.post(`/v1/review/items/${rec.queue_item_id}/decision`).set(auth(r)).send({ levelKey: 'solid', rationale: 'On second reading the note does state where state lives.' }).expect(409);
    const re = await http.post(`/v1/review/items/${rec.queue_item_id}/decision`).set(auth(r)).send({ levelKey: 'solid', rationale: 'On second reading the note does state where state lives.', supersedesReviewId: rec.id }).expect(201);
    const recs = await pool.query('select id, decision, supersedes_review_id from criterion_review where queue_item_id = $1 order by created_at', [rec.queue_item_id]);
    assert.equal(recs.rowCount, 2); assert.equal(recs.rows[1].supersedes_review_id, rec.id); assert.equal(re.body.data.finalized, null);
    // a decision on the rule criterion is impossible: it has no queue item
    assert.equal((await pool.query(`select count(*)::int n from review_queue_item where evaluation_id = $1 and criterion_key = 'deliverables_complete'`, [ev.evaluationId])).rows[0].n, 0);

    // The seventh decision finalises: aggregation, verification, transition, agents.
    const last = await decideAll(r, ev.evaluationId, 1);
    const fin = last.find((d) => d['finalized'])!['finalized'] as { outcome: string; transition: { to: string } | null; totalScore: number; maxScore: number };
    assert.equal(fin.outcome, 'passed'); assert.equal(fin.transition?.to, 'demonstrated', '14 — an approved review contributed to Demonstrated');
    const results = await pool.query('select outcome, supersedes_result_id from evaluation_result where evaluation_id = $1 order by evaluated_at', [ev.evaluationId]);
    assert.deepEqual(results.rows.map((x) => x.outcome), ['needs_human_review', 'passed']); assert.ok(results.rows[1].supersedes_result_id, 'the interim result is kept and superseded, never rewritten');
    const scores = await pool.query('select criterion_key, score from evaluation_criterion_score where evaluation_result_id = (select id from evaluation_result where evaluation_id = $1 and outcome = $2) order by criterion_key', [ev.evaluationId, 'passed']);
    assert.equal(scores.rowCount, 8); assert.equal(Number(scores.rows.find((s) => s.criterion_key === 'explanation_clarity')!.score), 2, 'the superseding re-review (solid) counted, not the first decision (partial)');
    // 11 — reproducible: the recorded decisions imply exactly this total.
    const expected = 1 /*deliverables*/ + 2 + 2 + 2 + 2 + 2 + 2 /*clarity after re-review*/ + 1 /*assumption met*/;
    assert.equal(fin.totalScore, expected); assert.equal(fin.maxScore, 14);
    const view = await http.get(`/v1/submissions/${submissionId}/evaluation`).set(auth(user)).expect(200);
    assert.equal(view.body.data.state, 'completed'); assert.equal(view.body.data.outcome, 'passed'); assert.equal(view.body.data.humanReview, null);
    const claim = await pool.query('select state from skill_claim where user_id = $1 and skill_id = $2', [user.id, skillId]);
    assert.equal(claim.rows[0].state, 'demonstrated', '15 — Demonstrated, not Verified');
    await assert.rejects(() => pool.query(`update rubric_version set proposes_state = 'verified' where id = $1`, [rubricId]), /rubric_never_proposes_verified/);
    const ps = (await http.get('/v1/me/proposals').set(auth(user)).expect(200)).body.data.items as Array<{ proposalType: string }>;
    assert.ok(ps.some((p) => p.proposalType === 'cv_bullet'), 'agents ran after finalisation, not before');
  });
  test('conflict of interest: the author cannot review their own submission; a declared conflict escalates the item', async () => {
    const user = await newUser(); const { ev } = await submitted(user);
    await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'human_reviewer', 'e2e operator')`, [user.id]);
    const item = (await pool.query('select id from review_queue_item where evaluation_id = $1 limit 1', [ev.evaluationId])).rows[0].id;
    await http.post(`/v1/review/queue/${item}/assign`).set(auth(user)).send({}).expect(403);
    const row = await pool.query('select state, conflict_of_interest, escalation_reason from review_queue_item where id = $1', [item]);
    assert.equal(row.rows[0].state, 'escalated'); assert.equal(row.rows[0].conflict_of_interest, true); assert.match(row.rows[0].escalation_reason, /author/);
    const r = await reviewer(); const other = (await pool.query('select id from review_queue_item where evaluation_id = $1 and state = $2 limit 1', [ev.evaluationId, 'pending'])).rows[0].id;
    await http.post(`/v1/review/queue/${other}/assign`).set(auth(r)).send({ conflictOfInterest: true }).expect(403);
    assert.equal((await pool.query('select state from review_queue_item where id = $1', [other])).rows[0].state, 'escalated');
  });
});

describe('1, 2 — content approval stays with a named SME; demo content never becomes approved', () => {
  test('a non-demo activity cannot be published without approval, and a demo one cannot be approved at all', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, is_demo_fixture) values ('99999999-9999-4999-8999-999999999999','act_real_e2e','0.1.0','curated','x','ai_assisted',false)`);
      await expectRejected(c, `update activity_spec set status = 'published' where id = '99999999-9999-4999-8999-999999999999'`, [], /only an approved record/);
      const demoDraft = (await c.query(`select id from activity_spec where slug = 'act_fe_debug_improve' and is_demo_fixture`)).rows[0].id;
      await c.query(`update activity_spec set status = 'curated' where id = $1 and status = 'draft'`, [demoDraft]);
      await expectRejected(c, `update activity_spec set status = 'sme_reviewed', reviewed_by = gen_random_uuid(), reviewed_at = now() where id = $1`, [demoDraft], /DEMO/);
      await c.query('rollback');
    } finally { c.release(); }
  });
});
