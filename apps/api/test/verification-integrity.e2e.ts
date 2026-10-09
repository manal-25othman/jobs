/**
 * D-118 — critical verification-integrity remediation, against a real database.
 *
 * Runs under the SAFETY BASELINE (default@2, migration 0023): the policy every
 * real environment resolves to. The test-only legacy-compatibility row the
 * pre-remediation suites use is switched off here, and restored at the end.
 *
 *  1. three checked boxes cannot grant Demonstrated
 *  2. two arbitrary files cannot grant Demonstrated
 *  3. forged evaluation signals (and file/link/verified impersonation) are refused
 *  4. missing, malformed or unrelated artifacts cannot satisfy technical criteria
 *  5. crafted API requests cannot bypass the restriction
 *  6. failed or pending assessments preserve the current level
 *  7. a human-reviewed path on SME-approved, non-demo content still works
 *  8. the legacy basis can never decide in production
 *  9. existing audit records and historical decisions are not rewritten
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, INCOMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, asAuthenticatedUser,
  useSafetyBaseline, useLegacyVerificationCompat, type TestUser } from './helpers';
import { promoteDemo } from '../src/career-data/promotion';
import { reviewTransition, approveRubricValues } from '../src/career-data/review';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
const BLANK = new TextEncoder().encode('\n');

/** Everything that would mean "a level was granted" for this user. */
async function levelFacts(userId: string) {
  return {
    claims: (await pool.query(`select skill_id, state from skill_claim where user_id = $1 order by skill_id`, [userId])).rows.map((r) => `${r.skill_id}:${r.state}`),
    evidence: Number((await one('select count(*)::int n from evidence where user_id = $1', [userId])).n),
    transitions: Number((await one('select count(*)::int n from evidence_transition where user_id = $1', [userId])).n),
    promotions: Number((await one(`select count(*)::int n from audit_event where user_id = $1 and event_type = 'claim.promoted'`, [userId])).n),
    verifications: Number((await one('select count(*)::int n from verification where user_id = $1', [userId])).n),
  };
}
const NONE = { claims: [] as string[], evidence: 0, transitions: 0, promotions: 0, verifications: 0 };
/** Asserts a status and shows the body when it differs (debuggable failures). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ok<T extends { status: number; body: any }>(r: T, code = 201): T { assert.equal(r.status, code, JSON.stringify(r.body)); return r; }

async function graduate(): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  return u;
}
async function project(u: TestUser, activitySpecId: string = FIXTURE.activitySpecId): Promise<string> {
  return (await http.post('/v1/projects').set(auth(u)).send({ title: 'متتبّع عادات', kind: 'platform_activity', activitySpecId }).expect(201)).body.data.id;
}
async function submit(u: TestUser, body: Record<string, unknown>, code = 201, activitySpecId?: string) {
  const pid = await project(u, activitySpecId);
  return http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [FIXTURE.skillUiTesting], aiDisclosure: { declaredUse: [] }, ...body }).expect(code);
}
async function evaluate(u: TestUser, submissionId: string) {
  return (await http.post(`/v1/submissions/${submissionId}/evaluate`).set(auth(u)).expect(201)).body.data as
    { outcome: string; transition: unknown; verification: { decision: string; reason: string }; criteria: unknown[] };
}

let historyBefore = '';
const HISTORY_SQL = `select md5(string_agg(x, '|' order by x)) as h from (
    select 'er:' || id || outcome as x from evaluation_result where evaluated_at < $1 union all
    select 'vd:' || id || decision || resulting_state || reason from verification_decision where decided_at < $1 union all
    select 'et:' || id || from_state || to_state || reason from evidence_transition where occurred_at < $1 union all
    select 'v:' || id || outcome || resulting_state from verification where decided_at < $1 union all
    select 'ae:' || id || event_type from audit_event where occurred_at < $1) q`;
let cutoff = '';

before(async () => {
  app = await bootApp({ legacyVerificationCompat: false }); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  await useSafetyBaseline();
  cutoff = (await one('select now() as t')).t;
  historyBefore = (await pool.query(HISTORY_SQL, [cutoff])).rows[0].h;
});
after(async () => { await useLegacyVerificationCompat(); await pool?.end(); await app?.close(); });

describe('the safety baseline is what resolves', () => {
  test('default@2 is in effect: independently_verified, no Practiced on submission, not SME-validated; default@1 retired, kept as history', async () => {
    const rows = (await pool.query(`select version, activation, promotion_basis, practiced_on_submission, review_status::text from verification_policy where key = 'default' and version in (1, 2) order by version`)).rows;
    assert.deepEqual(rows.map((r) => [r.version, r.activation, r.promotion_basis, r.practiced_on_submission, r.review_status]),
      [[1, 'inactive', 'legacy_any_pass', true, 'draft'], [2, 'legacy_baseline', 'independently_verified', false, 'draft']]);
    const log = (await pool.query(`select new_value, actor from config_change where entity_table = 'verification_policy' and actor = 'migration 0023' order by created_at`)).rows;
    assert.deepEqual(log.map((r) => r.new_value), ['inactive', 'legacy_baseline'], 'the retirement and the new baseline are both audited');
  });
});

describe('declarations and uploads never earn a level', () => {
  test('1 · three checked boxes (+ a note, + two files): the run is recorded, the decision is assessment_pending_validation, nothing is promoted', async () => {
    const u = await graduate();
    const u1 = await uploadFile(app, http, u, 'HabitList.jsx', COMPONENT_BYTES); const u2 = await uploadFile(app, http, u, 'HabitList.test.jsx', TEST_BYTES);
    const sub = await submit(u, { artifacts: COMPLETE_ARTIFACTS, uploadIds: [u1, u2] });
    assert.deepEqual(await levelFacts(u.id), NONE, 'submitting records no level (no Practiced on submission)');
    const ev = await evaluate(u, sub.body.data.id);
    assert.equal(ev.outcome, 'passed', 'the formative result is still shown');
    assert.equal(ev.transition, null);
    assert.equal(ev.verification.decision, 'assessment_pending_validation');
    assert.match(ev.verification.reason, /declaration by the submitter/);
    assert.deepEqual(await levelFacts(u.id), NONE);
    const d = await one(`select decision, previous_state, resulting_state, policy_version from verification_decision where user_id = $1`, [u.id]);
    assert.deepEqual([d.decision, d.previous_state, d.resulting_state, d.policy_version], ['assessment_pending_validation', 'gap', 'gap', 2]);
  });
  test('2 · two arbitrary (blank) files with the boxes ticked: no level', async () => {
    const u = await graduate();
    const u1 = await uploadFile(app, http, u, 'a.txt', BLANK, 'text/plain'); const u2 = await uploadFile(app, http, u, 'b.txt', BLANK, 'text/plain');
    const ev = await evaluate(u, (await submit(u, { artifacts: COMPLETE_ARTIFACTS, uploadIds: [u1, u2] })).body.data.id);
    assert.equal(ev.verification.decision, 'assessment_pending_validation');
    assert.deepEqual(await levelFacts(u.id), NONE);
  });
  test('2b · two arbitrary files and nothing else: no level', async () => {
    const u = await graduate();
    const u1 = await uploadFile(app, http, u, 'a.txt', BLANK, 'text/plain'); const u2 = await uploadFile(app, http, u, 'b.txt', BLANK, 'text/plain');
    const ev = await evaluate(u, (await submit(u, { uploadIds: [u1, u2] })).body.data.id);
    assert.notEqual(ev.verification.decision, 'accepted');
    assert.deepEqual(await levelFacts(u.id), NONE);
  });
});

describe('forged facts are refused at the API', () => {
  test('3 · forged evaluation signals and producer impersonation: 400, nothing written', async () => {
    const u = await graduate();
    const before = Number((await one('select count(*)::int n from submission where user_id = $1', [u.id])).n);
    for (const forged of [
      { key: 'signal.tests_reference_component', kind: 'boolean', valueBool: true },
      { key: 'verified.tests_pass', kind: 'boolean', valueBool: true },
      { key: 'followup.answer', kind: 'text', valueText: 'answered' },
      { key: 'file.component', kind: 'boolean', valueBool: true },
      { key: 'link.repository', kind: 'text', valueText: 'https://example.com/repo' },
    ]) {
      const r = await submit(u, { artifacts: [...COMPLETE_ARTIFACTS, forged] }, 400);
      assert.match(JSON.stringify(r.body), /platform-owned/);
    }
    assert.equal(Number((await one('select count(*)::int n from submission where user_id = $1', [u.id])).n), before, 'no submission was created');
    assert.deepEqual(await levelFacts(u.id), NONE);
  });
});

describe('missing, malformed or unrelated artifacts', () => {
  test('4 · missing (a mandatory box unticked), malformed (a "checkbox" sent as text) and unrelated artifacts satisfy nothing', async () => {
    const u = await graduate();
    const missing = await evaluate(u, (await submit(u, { artifacts: INCOMPLETE_ARTIFACTS })).body.data.id);
    assert.notEqual(missing.outcome, 'passed'); assert.notEqual(missing.verification.decision, 'accepted');
    const malformed = await evaluate(u, (await submit(u, { artifacts: COMPLETE_ARTIFACTS.map((a) => (a.key.startsWith('test.') ? { key: a.key, kind: 'text' as const, valueText: 'yes I did' } : a)) })).body.data.id);
    assert.notEqual(malformed.verification.decision, 'accepted');
    const unrelated = await evaluate(u, (await submit(u, { artifacts: [{ key: 'test.something_else', kind: 'boolean', valueBool: true }, { key: 'note.unrelated', kind: 'text', valueText: 'a note about something else entirely, long enough' }] })).body.data.id);
    assert.notEqual(unrelated.outcome, 'passed'); assert.notEqual(unrelated.verification.decision, 'accepted');
    assert.deepEqual(await levelFacts(u.id), NONE);
  });
});

describe('direct API calls cannot bypass it', () => {
  test('5 · extra fields claiming a state, a decision or a verification are ignored; another user\'s submission is not evaluable; direct table writes are refused', async () => {
    const u = await graduate();
    const f1 = await uploadFile(app, http, u, 'HabitList.jsx', COMPONENT_BYTES); const f2 = await uploadFile(app, http, u, 'HabitList.test.jsx', TEST_BYTES);
    const sub = await submit(u, { uploadIds: [f1, f2], artifacts: COMPLETE_ARTIFACTS, state: 'demonstrated', proposedState: 'demonstrated', verification: 'accepted', outcome: 'passed', evaluatorKind: 'human', reviewed: true });
    const res = await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(u))
      .send({ outcome: 'passed', decision: 'accepted', resultingState: 'demonstrated', basis: { independentlyVerified: true } }).expect(201);
    assert.equal(res.body.data.verification.decision, 'assessment_pending_validation');
    await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(u)).expect(400); // already evaluated: a correction is a new submission
    const other = await graduate();
    await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(other)).expect(404);
    await asAuthenticatedUser(pool, u.id, async (c) => {
      for (const sql of [
        `insert into skill_claim (user_id, skill_id, state, state_reason) values ('${u.id}', '${FIXTURE.skillUiTesting}', 'demonstrated', 'I say so')`,
        `insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decision, previous_state, resulting_state, reason) select a.id, a.evaluation_result_id, a.user_id, '${FIXTURE.skillUiTesting}', (select id from verification_policy limit 1), 'default', 2, 'draft', 'x', 'policy', 'accepted', 'gap', 'demonstrated', 'forged' from assessment a where a.user_id = '${u.id}' limit 1`,
      ]) {
        await c.query('savepoint s');
        await assert.rejects(() => c.query(sql), /permission denied|row-level security/);
        await c.query('rollback to savepoint s');
      }
    });
    assert.deepEqual(await levelFacts(u.id), NONE);
  });
});

describe('the current level is preserved', () => {
  test('6 · a level earned earlier stays exactly as it was through a pending pass, a below-threshold run and a blocked run', async () => {
    const u = await graduate();
    // Earned before the remediation (legacy behaviour, test-only compatibility row), then the safety baseline returns.
    await useLegacyVerificationCompat();
    try {
      const u1 = await uploadFile(app, http, u, 'HabitList.jsx', COMPONENT_BYTES); const u2 = await uploadFile(app, http, u, 'HabitList.test.jsx', TEST_BYTES);
      const ev = await evaluate(u, (await submit(u, { artifacts: COMPLETE_ARTIFACTS, uploadIds: [u1, u2] })).body.data.id);
      assert.equal(ev.verification.decision, 'accepted');
    } finally { await useSafetyBaseline(); }
    const earned = await levelFacts(u.id);
    const claim = await one('select state, primary_evidence_id, state_reason from skill_claim where user_id = $1', [u.id]);
    assert.equal(claim.state, 'demonstrated');
    for (const artifacts of [COMPLETE_ARTIFACTS, INCOMPLETE_ARTIFACTS, []]) {
      const r = await submit(u, artifacts.length ? { artifacts } : { externalUrls: ['https://example.com/x'] });
      await evaluate(u, r.body.data.id);
    }
    const after = await one('select state, primary_evidence_id, state_reason from skill_claim where user_id = $1', [u.id]);
    assert.deepEqual(after, claim, 'state, primary evidence and reason unchanged');
    const now = await levelFacts(u.id);
    assert.deepEqual([now.evidence, now.transitions, now.promotions], [earned.evidence, earned.transitions, earned.promotions], 'no new evidence, transition or promotion');
  });
});

describe('a valid, authorised path still works: human review on SME-approved, non-demo content', () => {
  let activityId = ''; let rubricId = ''; let skillId = '';
  const SME = '33333333-3333-4333-8333-333333333333';
  before(async () => {
    const demoAct = (await one(`select id from activity_spec where slug = 'act_fe_build_interface' and is_demo_fixture`)).id;
    const existing = await one(`select canonical_entity_id from content_promotion where entity_kind = 'activity_spec' and demo_entity_id = $1 order by created_at desc limit 1`, [demoAct]);
    activityId = existing?.canonical_entity_id ?? (await promoteDemo(pool, 'activity_spec', demoAct, 'content author', 'D-118 positive path')).canonicalId;
    rubricId = (await one(`select id from rubric_version where activity_spec_id = $1 and not is_demo_fixture order by created_at desc limit 1`, [activityId])).id;
    const walk = async (kind: 'activity_spec' | 'rubric_version', id: string) => {
      const col = kind === 'activity_spec' ? 'status' : 'status';
      const st = async () => (await one(`select ${col}::text as s from ${kind} where id = $1`, [id])).s as string;
      if ((await st()) === 'draft') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'curated', decidedBy: null, decidedByLabel: 'author', rolePerformed: 'content_author', reason: 'submitted', production: false });
      if ((await st()) === 'curated') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'sme_reviewed', decidedBy: SME, decidedByLabel: 'Named SME', rolePerformed: 'sme', reason: 'reviewed', production: false });
      if ((await st()) === 'sme_reviewed') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'approved', decidedBy: SME, decidedByLabel: 'Named SME', rolePerformed: 'sme', reason: 'approved', production: false });
      if ((await st()) === 'approved') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'published', decidedBy: null, decidedByLabel: 'Product Owner', rolePerformed: 'product_owner', reason: 'publish', production: false });
    };
    if (!(await one('select values_approved_at from rubric_version where id = $1', [rubricId])).values_approved_at) {
      await approveRubricValues(pool, { rubricVersionId: rubricId, decidedBy: SME, decidedByLabel: 'Named SME', reason: 'D-118 positive path: values reviewed' });
    }
    await walk('activity_spec', activityId); await walk('rubric_version', rubricId);
    skillId = (await one(`select linked_skill_id from rubric_criterion where rubric_version_id = $1 and criterion_kind = 'skill_evidence' limit 1`, [rubricId])).linked_skill_id;
  });
  const LEVELS: Record<string, string> = { semantic_structure: 'solid', form_validation: 'solid', data_states: 'solid', state_transitions: 'solid', responsive_layout: 'solid', explanation_clarity: 'solid', judgment_assumption_check: 'met' };
  async function reviewedRun(u: TestUser, act: string, skill: string) {
    const pid = ok(await http.post('/v1/projects').set(auth(u)).send({ title: 'طلب إجازة', kind: 'platform_activity', activitySpecId: act })).body.data.id;
    const f1 = await uploadFile(app, http, u, 'index.html', COMPONENT_BYTES, 'text/plain'); const f2 = await uploadFile(app, http, u, 'styles.css', TEST_BYTES, 'text/plain');
    const f3 = await uploadFile(app, http, u, 'app.js', TEST_BYTES);
    const sub = await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [skill], uploadIds: [f1, f2, f3], aiDisclosure: { declaredUse: [] }, artifacts: [
      { key: 'note.data_flow', kind: 'text', valueText: 'The form submits to a state object; the list is fetched on load and re-rendered from state; loading, error and empty are explicit states.', locator: 'notes.md' },
      { key: 'answer.clarification', kind: 'text', valueText: 'The brief says four fields and the spec lists five; I implemented the four and flagged the fifth.', locator: 'notes.md' },
    ] }); ok(sub);
    const ev = ok(await http.post(`/v1/submissions/${sub.body.data.id}/evaluate`).set(auth(u))).body.data;
    assert.equal(ev.outcome, 'needs_human_review');
    const reviewer = await newUser(); await http.post('/v1/me/bootstrap').set(auth(reviewer)).send({}).expect(201);
    await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'human_reviewer', 'e2e operator')`, [reviewer.id]);
    const items = (await pool.query(`select id, criterion_key from review_queue_item where evaluation_id = $1 order by criterion_key`, [ev.evaluationId])).rows;
    let last: Record<string, unknown> = {};
    for (const it of items) {
      await http.post(`/v1/review/queue/${it.id}/assign`).set(auth(reviewer)).send({}).expect(201);
      await http.get(`/v1/review/items/${it.id}`).set(auth(reviewer)).expect(200); // the reviewer opens the item before deciding
      last = (await http.post(`/v1/review/items/${it.id}/decision`).set(auth(reviewer)).send({ levelKey: LEVELS[it.criterion_key], rationale: `Observed in the submitted files: ${it.criterion_key} meets the descriptor.` }).expect(201)).body.data;
    }
    return { evaluationId: ev.evaluationId as string, last };
  }
  test('7 · every skill criterion decided by a named reviewer, rubric values SME-approved, non-demo content ⇒ accepted, Demonstrated (never Verified)', async () => {
    const u = await graduate();
    const { evaluationId } = await reviewedRun(u, activityId, skillId);
    const d = await one(`select d.decision, d.resulting_state from verification_decision d join assessment a on a.id = d.assessment_id where a.evaluation_id = $1 and a.evaluator_kind = 'human'`, [evaluationId]);
    assert.deepEqual([d.decision, d.resulting_state], ['accepted', 'demonstrated']);
    assert.equal((await one('select state from skill_claim where user_id = $1 and skill_id = $2', [u.id, skillId])).state, 'demonstrated');
    assert.equal(Number((await one(`select count(*)::int n from evidence_transition where user_id = $1 and to_state = 'verified'`, [u.id])).n), 0);
  });
  test('7b · the same human review on DEMO content (values never SME-approved) stays pending', async () => {
    const demoAct = (await one(`select id from activity_spec where slug = 'act_fe_build_interface' and is_demo_fixture`)).id;
    const demoRubric = (await one(`select id, status from rubric_version where activity_spec_id = $1`, [demoAct]));
    if (demoRubric.status !== 'published') { // DEMO shortcut outside production, as human-review.e2e does
      await pool.query(`update rubric_version set status = 'curated' where id = $1 and status = 'draft'`, [demoRubric.id]); await pool.query(`update rubric_version set status = 'published' where id = $1`, [demoRubric.id]);
      await pool.query(`update activity_spec set status = 'curated' where id = $1 and status = 'draft'`, [demoAct]); await pool.query(`update activity_spec set status = 'published' where id = $1`, [demoAct]);
    }
    const demoSkill = (await one(`select linked_skill_id from rubric_criterion where rubric_version_id = $1 and criterion_kind = 'skill_evidence' limit 1`, [demoRubric.id])).linked_skill_id;
    const u = await graduate();
    const { evaluationId } = await reviewedRun(u, demoAct, demoSkill);
    const d = await one(`select d.decision, d.resulting_state, d.reason from verification_decision d join assessment a on a.id = d.assessment_id where a.evaluation_id = $1 and a.evaluator_kind = 'human'`, [evaluationId]);
    assert.equal(d.decision, 'assessment_pending_validation'); assert.match(d.reason, /DEMO|not approved by a named SME/);
    assert.deepEqual(await levelFacts(u.id), NONE);
  });
});

describe('the legacy basis never decides in production', () => {
  test('8 · the database refuses a legacy-basis row as production_active or as a baseline; development_only is refused in production', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'D-118 negative', true)");
      const v = (await c.query(`insert into verification_policy (key, version, description_en, promotion_basis) values ('default', 950, 'legacy attempt', 'legacy_any_pass') returning id`)).rows[0].id;
      await c.query(`update verification_policy set review_status = 'approved', approved_by = 'sme-x', approved_at = now() where id = $1`, [v]);
      await c.query(`update verification_policy set activation = 'inactive' where key = 'default' and activation <> 'inactive'`);
      await c.query('savepoint s'); await assert.rejects(() => c.query(`update verification_policy set activation = 'production_active' where id = $1`, [v]), /legacy promotion basis/); await c.query('rollback to savepoint s');
      await c.query('savepoint s'); await assert.rejects(() => c.query(`update verification_policy set activation = 'legacy_baseline' where key = 'default' and version = 1`), /legacy promotion basis/); await c.query('rollback to savepoint s');
      await c.query("select set_config('naqla.production', 'on', true)");
      await c.query('savepoint s'); await assert.rejects(() => c.query(`update verification_policy set activation = 'development_only' where id = $1`, [v]), /cannot be activated in production/); await c.query('rollback to savepoint s');
    } finally { await c.query('rollback'); c.release(); }
  });
  test('8b · in production mode a declared pass is pending under the safety baseline, and a lingering development-only legacy row is ignored', async () => {
    const u = await graduate();
    const f1 = await uploadFile(app, http, u, 'HabitList.jsx', COMPONENT_BYTES); const f2 = await uploadFile(app, http, u, 'HabitList.test.jsx', TEST_BYTES);
    const sub = (await submit(u, { uploadIds: [f1, f2], artifacts: COMPLETE_ARTIFACTS })).body.data.id;
    const prev = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const ev = await evaluate(u, sub);
      assert.equal(ev.verification.decision, 'assessment_pending_validation');
    } finally { process.env['NODE_ENV'] = prev; }
    assert.deepEqual(await levelFacts(u.id), NONE);
  });
});

describe('history', () => {
  test('9 · evaluation results, decisions, transitions, verification rows and audit events written before these runs are byte-for-byte unchanged', async () => {
    assert.equal((await pool.query(HISTORY_SQL, [cutoff])).rows[0].h, historyBefore);
    const accepted = Number((await one(`select count(*)::int n from verification_decision where decision = 'accepted'`)).n);
    assert.ok(accepted > 0, 'earlier accepted decisions are still there, as they were');
  });
});
