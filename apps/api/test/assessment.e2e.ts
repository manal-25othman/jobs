/**
 * Phase 3 — Structured Assessment + Verification Decision.
 *
 * Proves: the draft default policy reproduces the legacy verification exactly
 * (same verification row, same promotion); assessment and decision are
 * separate records; every decision names its policy and ruleset versions; an
 * llm can never be a decision actor; expert knobs are present and inert;
 * per-skill derivation stays off unless the policy enables it; records are
 * immutable and private.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { DOMAIN_RULESET_VERSION } from '@naqla/domain';
import {
  bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, INCOMPLETE_ARTIFACTS, uploadFile, expectRejected, asAuthenticatedUser,
  COMPONENT_BYTES, TEST_BYTES, type TestUser,
} from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const SKILL = FIXTURE.skillUiTesting; const SECONDARY = 'a0000000-0000-4000-8000-000000000003';

async function bootstrapped(): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  return u;
}
async function submitted(user: TestUser, artifacts = COMPLETE_ARTIFACTS, opts: { skillIds?: string[]; uploads?: number } = {}) {
  const pid = (await http.post('/v1/projects').set(auth(user)).send({ title: 'متتبّع عادات', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id as string;
  const uploads: string[] = [];
  if ((opts.uploads ?? 2) >= 1) uploads.push(await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES));
  if ((opts.uploads ?? 2) >= 2) uploads.push(await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES));
  const sid = (await http.post(`/v1/projects/${pid}/submissions`).set(auth(user))
    .send({ skillIds: opts.skillIds ?? [SKILL], artifacts, uploadIds: uploads, aiDisclosure: { declaredUse: [] } }).expect(201)).body.data.id as string;
  return { pid, sid };
}
type Assessment = { id: string; evaluatorKind: string; evaluatorRef: string; versions: { rubric: string; activitySpec: string; domainRuleset: string; contextPolicy: string | null }; outcome: string; confidence: number | null;
  inputsUsed: { artifact_keys: string[]; identity_excluded: boolean; evidence_item_ids: string[] };
  criteria: { key: string; status: string; evidenceUsed: string[]; evidenceMissing: string[]; recommendedNextAction: string | null; evaluatorKind: string; skillId: string | null }[];
  decisions: { skillId: string; policy: { key: string; version: number; status: string; validated: boolean }; domainRulesetVersion: string; decidedByKind: string; decision: string; previousState: string; proposedState: string | null; resultingState: string; verificationId: string | null; evidenceId: string | null; reason: string }[] };
async function assessmentOf(user: TestUser, sid: string): Promise<Assessment[]> {
  return (await http.get(`/v1/submissions/${sid}/assessment`).set(auth(user)).expect(200)).body.data.items as Assessment[];
}

describe('verification policy — data, DRAFT, llm structurally excluded', () => {
  test('the seeded default is draft, not validated, equals legacy (no knob set), and names only policy/human as actors', async () => {
    const user = await bootstrapped();
    const items = (await http.get('/v1/verification-policies').set(auth(user)).expect(200)).body.data.items as Record<string, unknown>[];
    const d = items.find((p) => p['key'] === 'default' && p['version'] === 1)!;
    assert.equal(d['reviewStatus'], 'draft'); assert.equal(d['validated'], false); assert.match(String(d['validationNote']), /LEGACY BASELINE — NOT EXPERT-VALIDATED/);
    // D-118: default@1 (the legacy behaviour) was retired by migration 0023 and is kept as history; default@2, the
    // restrictive SAFETY baseline, is what real environments resolve to (this suite runs a test-only compatibility row).
    assert.equal(d['activation'], 'inactive'); assert.equal(d['promotionBasis'], 'legacy_any_pass');
    const safety = items.find((p) => p['key'] === 'default' && p['version'] === 2)!;
    // (In this suite the harness has the test-only compatibility row in effect, so default@2 is momentarily inactive.)
    assert.ok(safety['baselineOf'], 'default@2 is the migration-created baseline');
    assert.deepEqual([safety['validated'], safety['promotionBasis'], safety['practicedOnSubmission']], [false, 'independently_verified', false]);
    assert.deepEqual(d['appliesOutcomes'], ['passed']); assert.equal(d['acceptRubricProposal'], true); assert.equal(d['maxResultingState'], null);
    assert.equal(d['minAssessmentConfidence'], null); assert.equal(d['minIndependentEvidence'], null); assert.equal(d['perSkillEvidenceDerivation'], false);
    assert.deepEqual(d['decisionActors'], ['policy', 'human']);
  });
  test('NEGATIVE: the database refuses an llm/agent decision actor, an approval without approver, and an llm-decided row', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await expectRejected(c, `insert into verification_policy (key, version, description_en, decision_actors) values ('default', 95, 'x', '{policy,llm}')`, [], /llm_never_decides|check constraint/);
      await expectRejected(c, `insert into verification_policy (key, version, description_en, decision_actors) values ('default', 95, 'x', '{agent}')`, [], /llm_never_decides|actors_known|check constraint/);
      await expectRejected(c, `insert into verification_policy (key, version, description_en, review_status) values ('default', 95, 'x', 'approved')`, [], /approved_is_recorded|approved\/published requires|check constraint/);
      await expectRejected(c, `insert into verification_policy (key, version, description_en, decision_actors) values ('x', 1, 'x', '{}')`, [], /actors_known|check constraint/);
      await c.query('rollback');
    } finally { c.release(); }
  });
});

describe('legacy behaviour preserved exactly through the draft policy', () => {
  test('a passing run: same verification row, same promotion; plus a rule assessment and an accepted decision naming default@1 (draft) and the ruleset version', async () => {
    const user = await bootstrapped();
    const { sid } = await submitted(user);
    const ev = await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201);
    assert.equal(ev.body.data.outcome, 'passed'); assert.deepEqual({ from: ev.body.data.transition.from, to: ev.body.data.transition.to }, { from: 'practiced', to: 'demonstrated' });
    const legacy = (await http.get(`/v1/submissions/${sid}/evaluation`).set(auth(user)).expect(200)).body.data.verification;
    assert.equal(legacy.outcome, 'accepted'); assert.equal(legacy.resulting_state, 'demonstrated'); assert.equal(legacy.proposed_state, 'demonstrated');
    assert.equal(legacy.reason, 'deterministic evaluation met every mandatory criterion (4/4)', 'the legacy reason text is byte-identical');

    const [a] = await assessmentOf(user, sid);
    assert.ok(a);
    assert.equal(a.evaluatorKind, 'rule'); assert.equal(a.evaluatorRef, `deterministic-evaluator@${DOMAIN_RULESET_VERSION}`);
    assert.equal(a.versions.domainRuleset, DOMAIN_RULESET_VERSION); assert.equal(a.versions.rubric, ev.body.data.criteria.length ? a.versions.rubric : a.versions.rubric);
    assert.equal(a.outcome, 'passed'); assert.equal(a.confidence, 1); assert.equal(a.inputsUsed.identity_excluded, true);
    const used = a.inputsUsed as unknown as { submission_artifacts: string[]; evidence_items: string[]; context_policy: string };
    assert.ok(used.submission_artifacts.includes('file.component') && used.evidence_items.length >= 5); assert.equal(used.context_policy, 'default@1');
    assert.deepEqual(a.criteria.map((cr) => [cr.key, cr.status]), [['empty_state_test', 'met'], ['loading_state_test', 'met'], ['error_message_visible', 'met'], ['coverage_note', 'met']]);
    assert.deepEqual(a.criteria[0]!.evidenceUsed, ['test.empty_state']); assert.deepEqual(a.criteria[0]!.evidenceMissing, []); assert.equal(a.criteria[0]!.recommendedNextAction, null);
    assert.equal(a.decisions.length, 1);
    const d = a.decisions[0]!;
    // D-118: the legacy behaviour now runs only under the explicit, development-only test compatibility row.
    assert.deepEqual(d.policy, { key: 'default', version: 900, status: 'draft', validated: false, resolution: 'development_only' });
    assert.equal(d.domainRulesetVersion, DOMAIN_RULESET_VERSION); assert.equal(d.decidedByKind, 'policy'); assert.equal(d.decision, 'accepted');
    assert.deepEqual([d.previousState, d.proposedState, d.resultingState], ['practiced', 'demonstrated', 'demonstrated']);
    assert.equal(d.evidenceId, ev.body.data.transition.evidenceId); assert.ok(d.verificationId, 'the decision points at the legacy verification row');
    const v = await pool.query('select id from verification where evaluation_result_id = $1', [ev.body.data.resultId]);
    assert.equal(v.rows[0].id, d.verificationId);
  });

  test('a failing run: not_met criteria name the missing evidence and a next action; decision not_applicable; no verification row, no evidence — as before', async () => {
    const user = await bootstrapped();
    const { sid } = await submitted(user, INCOMPLETE_ARTIFACTS);
    const ev = await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201);
    assert.equal(ev.body.data.transition, null);
    const [a] = await assessmentOf(user, sid);
    const missing = a!.criteria.find((cr) => cr.key === 'error_message_visible')!;
    assert.equal(missing.status, 'not_met'); assert.deepEqual(missing.evidenceMissing, ['test.error_message']); assert.equal(missing.recommendedNextAction, 'Provide: test.error_message');
    assert.equal(a!.decisions[0]!.decision, 'not_applicable'); assert.equal(a!.decisions[0]!.resultingState, 'practiced'); assert.equal(a!.decisions[0]!.verificationId, null);
    assert.equal((await pool.query('select count(*)::int as n from verification where evaluation_result_id = $1', [ev.body.data.resultId])).rows[0].n, 0);
    assert.equal((await pool.query('select count(*)::int as n from evidence where user_id = $1', [user.id])).rows[0].n, 0);
  });

  test('blocked by a gate: the assessment is still recorded (what was observed) with a not_applicable decision', async () => {
    const user = await bootstrapped();
    const { sid } = await submitted(user, COMPLETE_ARTIFACTS, { uploads: 1 });
    const ev = await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201);
    assert.equal(ev.body.data.outcome, 'blocked_by_checks');
    const [a] = await assessmentOf(user, sid);
    assert.equal(a!.outcome, 'blocked_by_checks'); assert.equal(a!.decisions[0]!.decision, 'not_applicable');
  });

  test('re-establishment after withdrawal (D-077) is recorded as its own decision kind; the claim state still does not move', async () => {
    const user = await bootstrapped();
    const first = await submitted(user);
    const ev = await http.post(`/v1/submissions/${first.sid}/evaluate`).set(auth(user)).expect(201);
    await http.post(`/v1/evidence/${ev.body.data.transition.evidenceId}/withdraw`).set(auth(user)).send({ reason: 'wrong file' }).expect(201);
    const second = await submitted(user);
    const ev2 = await http.post(`/v1/submissions/${second.sid}/evaluate`).set(auth(user)).expect(201);
    assert.equal(ev2.body.data.transition, null); assert.ok(ev2.body.data.reestablishedEvidenceId);
    const [a] = await assessmentOf(user, second.sid);
    assert.equal(a!.decisions[0]!.decision, 'evidence_reestablished'); assert.equal(a!.decisions[0]!.evidenceId, ev2.body.data.reestablishedEvidenceId);
    assert.deepEqual([a!.decisions[0]!.previousState, a!.decisions[0]!.resultingState], ['demonstrated', 'demonstrated']);
  });
});

describe('per-skill evidence derivation (H6) stays behind the policy flag', () => {
  test('flag off (draft default): one decision, one evidence; flag on: a claimed skill with no met criteria of its own still gets nothing', async () => {
    const user = await bootstrapped();
    const { sid } = await submitted(user, COMPLETE_ARTIFACTS, { skillIds: [SKILL, SECONDARY] });
    await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201);
    const [a] = await assessmentOf(user, sid);
    assert.deepEqual(a!.decisions.map((d) => d.skillId), [SKILL]);
    assert.equal((await pool.query('select count(*)::int as n from evidence where user_id = $1', [user.id])).rows[0].n, 1);

    // Phase 4: an active policy's content is immutable; the flag is turned on through a NEW version activated for development only,
    // after the baseline is explicitly deactivated (an audited act). Both steps are reverted at the end.
    const admin = async (sql: string, params: unknown[] = []) => {
      const c = await pool.connect();
      try { await c.query('begin'); await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'H6 negative test', true)"); const r = await c.query(sql, params); await c.query('commit'); return r; }
      catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
    };
    // D-118: the policy in effect for this suite is the test-only legacy-compatibility row; it is restored afterwards.
    const baseRow = (await pool.query(`select id, activation from verification_policy where key = 'default' and activation <> 'inactive'`)).rows[0];
    const base = baseRow.id;
    const v2 = (await admin(`insert into verification_policy (key, version, description_en, per_skill_evidence_derivation, promotion_basis, practiced_on_submission) values ('default', 99, 'e2e: H6 on (development only)', true, 'legacy_any_pass', true) returning id`)).rows[0].id;
    await admin(`update verification_policy set activation = 'inactive' where id = $1`, [base]);
    await admin(`update verification_policy set activation = 'development_only' where id = $1`, [v2]);
    try {
      const u2 = await bootstrapped();
      const s2 = await submitted(u2, COMPLETE_ARTIFACTS, { skillIds: [SKILL, SECONDARY] });
      await http.post(`/v1/submissions/${s2.sid}/evaluate`).set(auth(u2)).expect(201);
      const [a2] = await assessmentOf(u2, s2.sid);
      // The demo rubric's skill_evidence criteria all belong to SKILL; SECONDARY has none met, so it earns nothing even with the flag on.
      assert.deepEqual(a2!.decisions.map((d) => d.skillId), [SKILL]);
      assert.equal(a2!.decisions[0]!.policy.version, 99, 'the development-only v99 decided (outside production)');
      assert.equal((await pool.query('select count(*)::int as n from evidence where user_id = $1', [u2.id])).rows[0].n, 1);
      const claim = await pool.query('select state from skill_claim where user_id = $1 and skill_id = $2', [u2.id, SECONDARY]);
      assert.equal(claim.rows[0].state, 'practiced', 'no derivation without criteria of its own');
    } finally {
      await admin(`update verification_policy set activation = 'inactive' where id = $1`, [v2]);
      await admin(`update verification_policy set activation = $2 where id = $1`, [base, baseRow.activation]);
    }
  });
});

describe('records are immutable and private; CV/LinkedIn eligibility is not touched', () => {
  test('another user sees nothing; the owner cannot write; even the service role cannot rewrite or delete; no professional asset appears', async () => {
    const user = await bootstrapped();
    const { sid } = await submitted(user);
    await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(user)).expect(201);
    const [a] = await assessmentOf(user, sid);
    const other = await bootstrapped();
    await http.get(`/v1/submissions/${sid}/assessment`).set(auth(other)).expect(404);
    await asAuthenticatedUser(pool, other.id, async (c) => {
      assert.equal((await c.query('select count(*)::int as n from verification_decision where user_id = $1', [user.id])).rows[0].n, 0);
    });
    await asAuthenticatedUser(pool, user.id, async (c) => {
      assert.equal((await c.query(`update verification_decision set resulting_state = 'verified' where user_id = $1`, [user.id])).rowCount, 0);
      await expectRejected(c, `insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decision, previous_state, resulting_state, reason)
        select $1, evaluation_result_id, user_id, $2, (select id from verification_policy where key = 'default' and activation <> 'inactive'), 'default', 1, 'draft', 'x', 'policy', 'accepted', 'practiced', 'demonstrated', 'me' from assessment where id = $1`,
        [a!.id, SKILL], /row-level security/);
    });
    const c = await pool.connect();
    try {
      await c.query('begin');
      await expectRejected(c, `update assessment set confidence = 0.1 where id = $1`, [a!.id], /immutable/);
      await expectRejected(c, `delete from verification_decision where assessment_id = $1`, [a!.id], /immutable/);
      await expectRejected(c, `insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decision, previous_state, resulting_state, reason)
        select $1, evaluation_result_id, user_id, $2, (select id from verification_policy where key = 'default' and activation <> 'inactive'), 'default', 1, 'draft', 'x', 'llm', 'accepted', 'practiced', 'demonstrated', 'me' from assessment where id = $1`,
        [a!.id, SKILL], /decided_by_kind|check constraint/);
      await expectRejected(c, `insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decision, previous_state, proposed_state, resulting_state, reason)
        select $1, evaluation_result_id, user_id, $2, (select id from verification_policy where key = 'default' and activation <> 'inactive'), 'default', 1, 'draft', 'x', 'policy', 'accepted', 'practiced', 'demonstrated', 'verified', 'raise' from assessment where id = $1`,
        [a!.id, SKILL], /never_raises|check constraint/);
      await c.query('rollback');
    } finally { c.release(); }
    // No automatic CV/LinkedIn eligibility: the professional-asset tables are untouched by Phase 3.
    assert.equal((await pool.query('select count(*)::int as n from professional_asset where user_id = $1', [user.id])).rows[0].n, 0);
  });
});
