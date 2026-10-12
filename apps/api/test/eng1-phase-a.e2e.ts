/**
 * ENG-1 P3 gate, Phase A — the remaining integrity gaps, through the real API and the database boundary.
 *
 *   A1  submission-based promotion (`practiced_on_submission`) can never be approved or activated for real users
 *       (config-admin validation boundary AND the database constraint, 0028)
 *   A2  CLM-1: a not_applicable / pending / rejected decision, withdrawn evidence or an overridden decision never
 *       counts as the "recorded verification decision" a claim policy may require
 *   A3  a client cannot claim skills by a direct database write (outside coverage, after evaluation, or at all);
 *       the legitimate submission workflow and tenant isolation are unchanged
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, filesFor, asAuthenticatedUser, expectRejected, type TestUser } from './helpers';
import { loadClaimSubject } from '../src/agents/claim-drafts';
import { approveConfigRow, setConfigActivation, assertVerificationPolicyMayBe } from '../src/configuration/config-admin.service';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const SKILL = FIXTURE.skillUiTesting; const SECONDARY = 'a0000000-0000-4000-8000-000000000003';
let UNMAPPED = '';

before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  // An active skill the seed activity does not cover.
  UNMAPPED = (await pool.query(`select id from skill where status = 'active' and id not in (select skill_id from activity_skill where activity_spec_id = $1) order by slug limit 1`, [FIXTURE.activitySpecId])).rows[0].id;
});
after(async () => { await pool?.end(); await app?.close(); });

async function bootstrapped(): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  return u;
}
async function submitted(user: TestUser, skillIds: string[]): Promise<{ pid: string; sid: string }> {
  const pid = (await http.post('/v1/projects').set(auth(user)).send({ title: 'Phase A', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id as string;
  const uploads = [await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES), await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES)];
  const sid = (await http.post(`/v1/projects/${pid}/submissions`).set(auth(user))
    .send({ skillIds, artifacts: COMPLETE_ARTIFACTS, files: filesFor(uploads), aiDisclosure: { declaredUse: [] } }).expect(201)).body.data.id as string;
  return { pid, sid };
}
async function decidedSkills(userId: string, skillIds: string[]): Promise<Set<string>> {
  const c = await pool.connect();
  try {
    const s = await loadClaimSubject(c, userId, 'cv_bullet', { namedSkillIds: skillIds, suggestedValueAr: '', suggestedValueEn: '' }, [],
      { skillStates: {}, knownSkills: [], knownTechnologies: [] } as never);
    return new Set(s.skillsWithVerificationDecision);
  } finally { c.release(); }
}

describe('A2 — CLM-1: only a positive decision counts as a recorded verification decision', () => {
  test('a not_applicable decision (unattributed result) is recorded but does NOT count for the claim', async () => {
    const u = await bootstrapped();
    const { sid } = await submitted(u, [SECONDARY]);
    await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u)).expect(201);
    const rows = (await pool.query('select decision from verification_decision where user_id = $1 and skill_id = $2', [u.id, SECONDARY])).rows;
    assert.deepEqual(rows.map((r) => r.decision), ['not_applicable'], 'fixture: the only decision for the skill is not_applicable');
    assert.equal((await decidedSkills(u.id, [SECONDARY])).has(SECONDARY), false, 'CLM-1: a not_applicable decision is not positive evidence');
  });

  test('an accepted decision with standing evidence counts — and stops counting once that evidence is withdrawn', async () => {
    const u = await bootstrapped();
    const { sid } = await submitted(u, [SKILL]);
    const ev = (await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u)).expect(201)).body.data;
    assert.ok(ev.transition?.evidenceId);
    assert.equal((await decidedSkills(u.id, [SKILL])).has(SKILL), true);
    await http.post(`/v1/evidence/${ev.transition.evidenceId}/withdraw`).set(auth(u)).send({ reason: 'not entirely my own work' }).expect(201);
    assert.equal((await decidedSkills(u.id, [SKILL])).has(SKILL), false, 'withdrawn evidence never supports a claim');
    const hist = (await pool.query('select decision, evidence_id from verification_decision where user_id = $1 and skill_id = $2', [u.id, SKILL])).rows;
    assert.equal(hist.length, 1); assert.equal(hist[0].decision, 'accepted'); assert.equal(hist[0].evidence_id, ev.transition.evidenceId, 'the decision history is preserved unchanged');
  });

  test('pending-validation, rejected and escalated decisions never count (recorded directly by the trusted owner role)', async () => {
    const u = await bootstrapped();
    const { sid } = await submitted(u, [SECONDARY]);
    await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u)).expect(201);
    const base = (await pool.query('select * from verification_decision where user_id = $1 limit 1', [u.id])).rows[0];
    for (const decision of ['assessment_pending_validation', 'rejected', 'escalated_to_human', 'downgraded']) {
      await pool.query(`insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decision, previous_state, resulting_state, reason)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'policy',$10,'gap','gap','phase A proof')`,
        [base.assessment_id, base.evaluation_result_id, u.id, SKILL, base.policy_id, base.policy_key, base.policy_version, base.policy_status, base.domain_ruleset_version, decision]);
    }
    assert.equal((await decidedSkills(u.id, [SKILL, SECONDARY])).size, 0);
  });
});

describe('A1 — submission-based promotion is never approved or active', () => {
  async function draftWithSwitch(): Promise<string> {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('naqla.config_actor', 'phase A e2e', true), set_config('naqla.config_reason', 'prove the guard', true)");
      const v = (await c.query(`select coalesce(max(version), 0) + 1 as v from verification_policy where key = 'phase_a_probe'`)).rows[0].v as number;
      const id = (await c.query(`insert into verification_policy (key, version, description_en, promotion_basis, practiced_on_submission) values ('phase_a_probe', $1, 'phase A probe', 'independently_verified', true) returning id`, [v])).rows[0].id as string;
      await c.query('commit');
      return id;
    } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
  }
  const inTx = async <T>(fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> => {
    const c = await pool.connect();
    try { await c.query('begin'); const r = await fn(c); await c.query('rollback'); return r; } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
  };

  test('config-admin refuses to APPROVE a policy that enables submission-based promotion', async () => {
    const id = await draftWithSwitch();
    await assert.rejects(() => inTx((c) => approveConfigRow(c, { table: 'verification_policy', id, approvedBy: '00000000-0000-4000-8000-0000000000aa', approvedByLabel: 'e2e', reason: 'try' })), /submission-based promotion/);
  });
  test('config-admin refuses to ACTIVATE it for real users; the development-only switch keeps working outside production', async () => {
    const id = await draftWithSwitch();
    await assert.rejects(() => inTx((c) => setConfigActivation(c, { table: 'verification_policy', id, activation: 'production_active', actor: 'e2e', reason: 'try' })), /approved|submission-based promotion/);
    assert.throws(() => assertVerificationPolicyMayBe({ key: 'k', version: 1, practiced_on_submission: true }, { activation: 'production_active' }), /submission-based promotion/);
    assert.doesNotThrow(() => assertVerificationPolicyMayBe({ key: 'k', version: 1, practiced_on_submission: true }, { activation: 'development_only' }));
  });
  test('the database refuses an approval written behind the service', async () => {
    const id = await draftWithSwitch();
    await assert.rejects(() => inTx(async (c) => {
      await c.query("select set_config('naqla.config_actor', 'phase A e2e', true), set_config('naqla.config_reason', 'bypass attempt', true)");
      await c.query(`update verification_policy set review_status = 'approved', approved_by = gen_random_uuid(), approved_at = now() where id = $1`, [id]);
    }), /no_submission_promotion/);
  });
  test('no approved or active policy anywhere enables it', async () => {
    const n = (await pool.query(`select count(*)::int n from verification_policy where practiced_on_submission and (review_status in ('approved','published') or activation in ('production_active','legacy_baseline'))`)).rows[0].n;
    assert.equal(n, 0);
  });
});

describe('A3 — claimed skills cannot be manipulated by direct database writes', () => {
  test('the API still refuses an unmapped skill; a direct client insert is refused outright (outside coverage, mapped, or after evaluation)', async () => {
    const u = await bootstrapped();
    const pid = (await http.post('/v1/projects').set(auth(u)).send({ title: 'A3', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id as string;
    const up = [await uploadFile(app, http, u, 'HabitList.jsx', COMPONENT_BYTES), await uploadFile(app, http, u, 'HabitList.test.jsx', TEST_BYTES)];
    await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [UNMAPPED], artifacts: COMPLETE_ARTIFACTS, files: filesFor(up), aiDisclosure: { declaredUse: [] } }).expect(400);
    const { sid } = await submitted(u, [SKILL]);
    await asAuthenticatedUser(pool, u.id, async (c) => {
      for (const skill of [UNMAPPED, SECONDARY]) {
        await expectRejected(c, 'insert into submission_claimed_skill (submission_id, skill_id, user_id) values ($1,$2,$3)', [sid, skill, u.id], /permission denied/);
      }
      await expectRejected(c, 'delete from submission_claimed_skill where submission_id = $1', [sid], /permission denied/);
      await expectRejected(c, `insert into submission_artifact (submission_id, user_id, key, kind, value_bool) values ($1,$2,'verified.tests_pass','boolean',true)`, [sid, u.id], /permission denied/);
      const mine = (await c.query('select skill_id from submission_claimed_skill where submission_id = $1', [sid])).rows.map((r) => r.skill_id);
      assert.deepEqual(mine, [SKILL], 'the owner still reads exactly their claim');
    });
    await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u)).expect(201);
    // Even the trusted owner role cannot add an ambiguity-creating claim between evaluation and a human finalisation.
    await assert.rejects(() => pool.query('insert into submission_claimed_skill (submission_id, skill_id, user_id) values ($1,$2,$3)', [sid, SECONDARY, u.id]), /already been evaluated/);
    await assert.rejects(() => pool.query('delete from submission_claimed_skill where submission_id = $1', [sid]), /evaluated submission/);
  });

  test('cross-tenant: another user can neither see nor add claims on someone else\'s submission', async () => {
    const owner = await bootstrapped(); const other = await bootstrapped();
    const { sid } = await submitted(owner, [SKILL]);
    await asAuthenticatedUser(pool, other.id, async (c) => {
      assert.equal((await c.query('select count(*)::int n from submission_claimed_skill where submission_id = $1', [sid])).rows[0].n, 0);
      await expectRejected(c, 'insert into submission_claimed_skill (submission_id, skill_id, user_id) values ($1,$2,$3)', [sid, SECONDARY, other.id], /permission denied/);
    });
  });
});
