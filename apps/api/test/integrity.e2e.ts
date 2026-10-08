/**
 * Phase 6 — AI Usage & Integrity Flow.
 *
 * "Show that you understand the work you submitted — whether or not you used AI."
 *
 * Proves: the questionnaire is versioned configuration and every submission
 * keeps the version it was answered with; the legacy API shape still works;
 * declaring AI use changes no score, no state, no review requirement; signals
 * are observable facts with no outcome; AI-detection theatre is unrepresentable;
 * no challenge can be issued while nothing is validated and active; a
 * challenge result is an observation that never moves a verification level.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { assertBlindPayload } from '@naqla/domain';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, expectRejected, asAuthenticatedUser, COMPONENT_BYTES, TEST_BYTES, type TestUser } from './helpers';
import { ChallengeService } from '../src/integrity/challenge.service';
import { DbService } from '../src/infra/db.service';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const SKILL = FIXTURE.skillUiTesting;
async function bootstrapped(): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  return u;
}
type Questionnaire = { id: string; key: string; version: number; introAr: string; validated: boolean; activation: string; questions: { key: string; answerType: string; required: boolean; showIf: Record<string, unknown> }[] };
async function questionnaire(u: TestUser): Promise<{ questionnaire: Questionnaire; aiUseAllowedAr: string; scoreEffect: string; requiresHumanReview: boolean }> {
  return (await http.get('/v1/disclosure-questionnaire').set(auth(u)).expect(200)).body.data;
}
async function submit(u: TestUser, aiDisclosure: Record<string, unknown>, opts: { projectId?: string; uploads?: number; expect?: number } = {}) {
  const pid = opts.projectId ?? (await http.post('/v1/projects').set(auth(u)).send({ title: 'متتبّع عادات', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id as string;
  const ups: string[] = [];
  if ((opts.uploads ?? 2) >= 1) ups.push(await uploadFile(app, http, u, 'HabitList.jsx', COMPONENT_BYTES));
  if ((opts.uploads ?? 2) >= 2) ups.push(await uploadFile(app, http, u, 'HabitList.test.jsx', TEST_BYTES));
  const r = await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [SKILL], artifacts: COMPLETE_ARTIFACTS, uploadIds: ups, aiDisclosure }).expect(opts.expect ?? 201);
  return { pid, sid: r.body.data?.id as string, res: r };
}

describe('disclosure questionnaire — versioned configuration, kept with every submission', () => {
  test('the active questionnaire (dev: draft ai_usage@2) is served with the owner wording; it is not validated', async () => {
    const u = await bootstrapped();
    const q = await questionnaire(u);
    assert.equal(q.questionnaire.key, 'ai_usage'); assert.equal(q.questionnaire.version, 2); assert.equal(q.questionnaire.activation, 'development_only'); assert.equal(q.questionnaire.validated, false);
    assert.equal(q.questionnaire.introAr, 'استخدام أدوات الذكاء الاصطناعي مسموح. تساعدنا هذه الأسئلة على فهم طريقة عملك وما الذي أنجزته وراجعته بنفسك.');
    assert.equal(q.scoreEffect, 'none'); assert.equal(q.requiresHumanReview, false);
    assert.deepEqual(q.questionnaire.questions.map((x) => x.key), ['used_ai', 'used_for', 'ai_parts', 'changed_myself', 'rejected_or_corrected', 'verified_independently', 'understood_or_debugged']);
  });

  test('answers are validated against the exact version, stored with what the user saw, and mapped onto the legacy facts', async () => {
    const u = await bootstrapped();
    const q = (await questionnaire(u)).questionnaire;
    const { sid } = await submit(u, { questionnaireId: q.id, answers: { used_ai: true, used_for: ['explain_concepts', 'write_tests'], changed_myself: 'rewrote the empty-state branch', verified_independently: 'ran each state in the browser' } });
    const d = (await http.get(`/v1/submissions/${sid}/disclosure`).set(auth(u)).expect(200)).body.data;
    assert.equal(d.questionnaire, 'ai_usage@2'); assert.equal(d.captureMode, 'questionnaire'); assert.equal(d.aiUseDeclared, true);
    assert.deepEqual(d.declaredUse, ['explain_concepts', 'write_tests']);
    assert.deepEqual(d.answers.map((a: { questionKey: string }) => a.questionKey), ['used_ai', 'used_for', 'changed_myself', 'verified_independently']);
    assert.ok(d.answers[0].promptAr.length > 0, 'the prompt the user saw is frozen with the answer');
    // Errors are named: a missing required answer, an unknown key, a stale version.
    await submit(u, { questionnaireId: q.id, answers: { used_ai: true } }, { expect: 422 });
    await submit(u, { questionnaireId: q.id, answers: { used_ai: false, mood: 'fine' } }, { expect: 422 });
    const v1 = (await pool.query(`select id from disclosure_questionnaire where key = 'ai_usage' and version = 1`)).rows[0].id;
    const stale = await submit(u, { questionnaireId: v1, answers: { ai_help: ['x'] } }, { expect: 409 });
    assert.match(stale.res.body.error.message, /changed since it was shown/);
  });

  test('backward compatibility: the legacy shape is recorded against the baseline ai_usage@1, and historical rows stay as they were', async () => {
    const u = await bootstrapped();
    const { sid } = await submit(u, { declaredUse: ['explanation'], explanation: 'I asked for the meaning of aria-live' });
    const d = (await http.get(`/v1/submissions/${sid}/disclosure`).set(auth(u)).expect(200)).body.data;
    assert.equal(d.questionnaire, 'ai_usage@1'); assert.equal(d.captureMode, 'legacy_fields'); assert.deepEqual(d.declaredUse, ['explanation']); assert.equal(d.explanation, 'I asked for the meaning of aria-live');
    // Disclosures are immutable once recorded.
    const c = await pool.connect();
    try { await c.query('begin'); await expectRejected(c, `update ai_disclosure set declared_use = '{}' where submission_id = $1`, [sid], /immutable/); await c.query('rollback'); } finally { c.release(); }
  });

  test('a questionnaire that has been active is frozen; activating a draft for production is refused', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      const v2 = (await c.query(`select id from disclosure_questionnaire where key = 'ai_usage' and version = 2`)).rows[0].id;
      await expectRejected(c, `update disclosure_question set prompt_ar = 'changed' where questionnaire_id = $1`, [v2], /questions are immutable/);
      await c.query('rollback');
    } finally { c.release(); }
    const c2 = await pool.connect();
    try {
      await c2.query('begin');
      await c2.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'negative', true)");
      const v3 = (await c2.query(`insert into disclosure_questionnaire (key, version, label_ar, label_en, intro_ar, description_en, created_by) values ('ai_usage', 3, 'x', 'x', 'x', 'x', 'e2e') returning id`)).rows[0].id;
      await expectRejected(c2, `update disclosure_questionnaire set activation = 'production_active' where id = $1`, [v3], /production_active requires|DRAFT/);
      await c2.query('rollback');
    } finally { c2.release(); }
  });
});

describe('AI use is not cheating: declaring it changes nothing about the outcome', () => {
  test('same work, AI declared or not: same outcome, same score, same verification level, no human review, a neutral context signal only', async () => {
    const withAi = await bootstrapped(); const without = await bootstrapped();
    const q = (await questionnaire(withAi)).questionnaire;
    const a = await submit(withAi, { questionnaireId: q.id, answers: { used_ai: true, used_for: ['generate_code', 'debug'], ai_parts: 'the first draft of the component' } });
    const b = await submit(without, { questionnaireId: q.id, answers: { used_ai: false } });
    const ea = (await http.post(`/v1/submissions/${a.sid}/evaluate`).set(auth(withAi)).expect(201)).body.data;
    const eb = (await http.post(`/v1/submissions/${b.sid}/evaluate`).set(auth(without)).expect(201)).body.data;
    assert.equal(ea.outcome, eb.outcome); assert.equal(ea.totalScore, eb.totalScore); assert.equal(ea.transition?.to, 'demonstrated'); assert.equal(eb.transition?.to, 'demonstrated');
    assert.equal(ea.humanReview, null, 'declaring AI use does not send the work to a person');
    assert.equal((await pool.query('select count(*)::int as n from review_queue_item where submission_id = $1', [a.sid])).rows[0].n, 0);
    const sig = (await http.get(`/v1/submissions/${a.sid}/integrity-signals`).set(auth(withAi)).expect(200)).body.data.items as { signalType: string; direction: string; outcomeEffect: string; observation: string }[];
    assert.deepEqual(sig.map((s) => s.signalType), ['disclosure_recorded']);
    assert.equal(sig[0]!.direction, 'neutral_context'); assert.equal(sig[0]!.outcomeEffect, 'none'); assert.match(sig[0]!.observation, /AI use declared: yes/);
  });

  test('observable facts only: an unmet check and a resubmission become signals; the owner sees user-facing ones only', async () => {
    const u = await bootstrapped();
    const first = await submit(u, { declaredUse: [] }, { uploads: 1 });
    const ev = (await http.post(`/v1/submissions/${first.sid}/evaluate`).set(auth(u)).expect(201)).body.data;
    assert.equal(ev.outcome, 'blocked_by_checks');
    const s1 = (await http.get(`/v1/submissions/${first.sid}/integrity-signals`).set(auth(u)).expect(200)).body.data.items as { signalType: string; integrityCheckKey: string | null }[];
    assert.ok(s1.some((s) => s.signalType === 'deterministic_check_unmet' && s.integrityCheckKey === 'files_present'));
    const userFacing = (await pool.query(`select count(*)::int as n from integrity_signal where submission_id = $1 and visibility = 'user_facing'`, [first.sid])).rows[0].n;
    assert.equal(s1.length, userFacing, 'assessment-only signals stay with the assessment');
    const second = await submit(u, { declaredUse: [] }, { projectId: first.pid });
    const s2 = (await http.get(`/v1/submissions/${second.sid}/integrity-signals`).set(auth(u)).expect(200)).body.data.items as { signalType: string }[];
    assert.ok(s2.some((s) => s.signalType === 'resubmission_recorded'));
  });
});

describe('no AI-detection theatre — unrepresentable, not merely unused', () => {
  test('the database refuses detection sources, verdict outcomes, and the registry cannot register a detection source; no verdict column exists', async () => {
    const u = await bootstrapped();
    const { sid } = await submit(u, { declaredUse: [] });
    const c = await pool.connect();
    try {
      await c.query('begin');
      const base = `insert into integrity_signal (user_id, submission_id, signal_type, source, direction, observation, visibility, producer, producer_version, outcome_effect)`;
      await expectRejected(c, `${base} values ($1, $2, 'disclosure_recorded', 'writing_style_analysis', 'neutral_context', 'x', 'user_facing', 'x', 'x', 'none')`, [u.id, sid], /check constraint|does not accept source/);
      await expectRejected(c, `${base} values ($1, $2, 'disclosure_recorded', 'disclosure', 'neutral_context', 'x', 'user_facing', 'x', 'x', 'fraud')`, [u.id, sid], /check constraint/);
      await expectRejected(c, `${base} values ($1, $2, 'disclosure_recorded', 'deterministic_check', 'neutral_context', 'x', 'user_facing', 'x', 'x', 'none')`, [u.id, sid], /does not accept source/);
      await expectRejected(c, `insert into integrity_signal_type (code, label_ar, label_en, description_en, allowed_sources, direction) values ('ai_detector_hit', 'x', 'x', 'x', '{token_pattern_analysis}', 'inconsistent_with_understanding')`, [], /observable_sources|check constraint/);
      await c.query('rollback');
    } finally { c.release(); }
    const cols = (await pool.query(`select column_name from information_schema.columns where table_name in ('integrity_signal','challenge_result','ai_disclosure') and column_name ~ '(fraud|cheat|ai_prob|detector|plagiar|penalty)'`)).rows;
    assert.deepEqual(cols, [], 'no verdict or detection column exists to misuse');
    const reg = (await http.get('/v1/integrity/registry').set(auth(u)).expect(200)).body.data;
    assert.ok(reg.noDetection.refusedMethods.includes('ai_text_detector')); assert.equal(reg.signalOutcomeEffect, 'none'); assert.equal(reg.verificationEffect, 'none');
    assert.ok(reg.challengeTypes.length >= 9 && reg.challengeTypes.every((t: { enabled: boolean; reviewStatus: string }) => !t.enabled && t.reviewStatus === 'draft'));
    assert.ok(reg.challengePolicies.every((p: { activation: string }) => p.activation === 'inactive'));
  });
});

describe('challenges — records exist; nothing is issuable while nothing is validated and active', () => {
  test('NEGATIVE: a draft type cannot be issued (domain and database); a type cannot be enabled without validation; an inactive policy issues nothing', async () => {
    const u = await bootstrapped();
    const { sid } = await submit(u, { declaredUse: [] });
    const svc = app.get(ChallengeService); const db = app.get(DbService);
    await assert.rejects(db.asService((c) => svc.issue(c, { userId: u.id, submissionId: sid, typeCode: 'predict_output', issuedBy: 'human_reviewer', issuedByRef: 'e2e', promptAr: 'ماذا تعرض القائمة حين تفشل الشبكة؟' })), /DRAFT \/ NOT VALIDATED/);
    const policy = (await pool.query(`select id from challenge_policy where key = 'default' and version = 1`)).rows[0].id;
    const c = await pool.connect();
    try {
      await c.query('begin');
      await expectRejected(c, `insert into challenge_instance (user_id, submission_id, challenge_type_code, issued_by_kind, issued_by_ref, prompt_ar) values ($1,$2,'predict_output','human_reviewer','x','x')`, [u.id, sid], /not enabled/);
      await expectRejected(c, `update verification_challenge_type set enabled = true where code = 'predict_output'`, [], /enabled_needs_validation|check constraint/);
      await c.query(`update verification_challenge_type set review_status = 'approved', approved_by = 'sme-1', approved_at = now(), enabled = true where code = 'predict_output'`);
      await expectRejected(c, `insert into challenge_instance (user_id, submission_id, challenge_type_code, challenge_policy_id, issued_by_kind, issued_by_ref, prompt_ar) values ($1,$2,'predict_output',$3,'policy','x','x')`, [u.id, sid, policy], /policy default@1 is inactive/);
      await c.query('rollback');
    } finally { c.release(); }
  });

  test('records flow (type validated and enabled only inside this test): issue → answer → blind review → a signal; the verification level does not move', async () => {
    const u = await bootstrapped();
    const { sid } = await submit(u, { declaredUse: ['generate_code'] });
    await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u)).expect(201);
    const before = (await pool.query('select state from skill_claim where user_id = $1 and skill_id = $2', [u.id, SKILL])).rows[0].state;
    const decisionsBefore = (await pool.query('select count(*)::int as n from verification_decision where user_id = $1', [u.id])).rows[0].n;
    await pool.query(`update verification_challenge_type set review_status = 'approved', approved_by = 'sme-1', approved_at = now(), enabled = true where code = 'predict_output'`);
    try {
      const svc = app.get(ChallengeService); const db = app.get(DbService);
      await assert.rejects(db.asService((c) => svc.issue(c, { userId: u.id, submissionId: sid, typeCode: 'predict_output', issuedBy: 'human_reviewer', issuedByRef: 'e2e', promptAr: 'x', context: { email: 'leak@example.test' } })), /blind review/);
      const issued = await db.asService((c) => svc.issue(c, { userId: u.id, submissionId: sid, typeCode: 'predict_output', issuedBy: 'human_reviewer', issuedByRef: 'e2e-reviewer',
        promptAr: 'ماذا تعرض القائمة حين تفشل الشبكة؟', context: { artifactKey: 'file.component' } }));
      const mine = (await http.get(`/v1/me/challenges?submissionId=${sid}`).set(auth(u)).expect(200)).body.data;
      assert.equal(mine.introAr, 'خطوة تحقق قصيرة تساعدنا على تأكيد فهمك للعمل');
      assert.equal(mine.items[0].status, 'issued');
      await http.post(`/v1/me/challenges/${issued.id}/response`).set(auth(u)).send({ text: '' }).expect(400);
      await http.post(`/v1/me/challenges/${issued.id}/response`).set(auth(u)).send({ text: 'تعرض رسالة الخطأ وزر إعادة المحاولة' }).expect(201);
      await http.post(`/v1/me/challenges/${issued.id}/response`).set(auth(u)).send({ text: 'again' }).expect(409);
      const other = await bootstrapped();
      await http.post(`/v1/me/challenges/${issued.id}/response`).set(auth(other)).send({ text: 'x' }).expect(404);
      // A reviewer judges it blind; the owner cannot judge their own.
      const r = await newUser(); await http.post('/v1/me/bootstrap').set(auth(r)).send({}).expect(201);
      await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'human_reviewer', 'e2e operator')`, [r.id]);
      const queue = (await http.get('/v1/review/challenges').set(auth(r)).expect(200)).body.data.items;
      const mineInQueue = queue.find((x: { id: string }) => x.id === issued.id);
      assert.ok(mineInQueue); assert.doesNotThrow(() => assertBlindPayload(queue)); assert.ok(!JSON.stringify(queue).includes(u.id));
      await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'human_reviewer', 'e2e operator')`, [u.id]);
      await http.post(`/v1/review/challenges/${issued.id}/result`).set(auth(u)).send({ outcome: 'understanding_shown', observations: 'self' }).expect(403);
      await http.post(`/v1/review/challenges/${issued.id}/result`).set(auth(r)).send({ outcome: 'cheated', observations: 'x' }).expect(422);
      const res = (await http.post(`/v1/review/challenges/${issued.id}/result`).set(auth(r)).send({ outcome: 'understanding_not_shown', observations: 'the answer describes a loading state, not the error state', confidence: 0.6 }).expect(201)).body.data;
      assert.equal(res.verificationEffect, 'none');
      const sig = (await http.get(`/v1/submissions/${sid}/integrity-signals`).set(auth(u)).expect(200)).body.data.items as { signalType: string; direction: string; outcomeEffect: string }[];
      const ch = sig.find((s) => s.signalType === 'challenge_understanding_not_shown')!;
      assert.equal(ch.direction, 'inconsistent_with_understanding'); assert.equal(ch.outcomeEffect, 'none');
      // The integrity layer never touches the verification ladder.
      assert.equal((await pool.query('select state from skill_claim where user_id = $1 and skill_id = $2', [u.id, SKILL])).rows[0].state, before);
      assert.equal((await pool.query('select count(*)::int as n from verification_decision where user_id = $1', [u.id])).rows[0].n, decisionsBefore);
      const after = (await http.get(`/v1/me/challenges?submissionId=${sid}`).set(auth(u)).expect(200)).body.data.items[0];
      assert.equal(after.status, 'reviewed'); assert.equal(after.result.outcome, 'understanding_not_shown');
      const c = await pool.connect();
      try { await c.query('begin'); await expectRejected(c, `update challenge_result set outcome = 'understanding_shown' where instance_id = $1`, [issued.id], /immutable/); await c.query('rollback'); } finally { c.release(); }
      await asAuthenticatedUser(pool, other.id, async (cc) => {
        assert.equal((await cc.query('select count(*)::int as n from challenge_instance where user_id = $1', [u.id])).rows[0].n, 0);
        assert.equal((await cc.query('select count(*)::int as n from integrity_signal where user_id = $1', [u.id])).rows[0].n, 0);
      });
    } finally {
      await pool.query(`update verification_challenge_type set enabled = false, review_status = 'draft', approved_by = null, approved_at = null where code = 'predict_output'`);
    }
  });
});
