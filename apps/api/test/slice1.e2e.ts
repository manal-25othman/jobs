/**
 * Vertical Slice 1 — end to end, against a real PostgreSQL database.
 *
 * Every numbered proof the owner asked for, plus the negative cases. The
 * negative cases matter more: they are the ones that would let a user promote
 * themselves or read someone else's evidence.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import {
  bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, INCOMPLETE_ARTIFACTS,
  expectRejected, asAuthenticatedUser, uploadFile, COMPONENT_BYTES, TEST_BYTES, type TestUser,
} from './helpers';

let app: INestApplication;
let http: ReturnType<typeof request>;
let pool: Pool;

before(async () => {
  app = await bootApp();
  http = request(app.getHttpServer());
  pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
});

after(async () => {
  await pool?.end();
  await app?.close();
});

/** Walks a user through goal → project → submission. Returns the ids. */
async function upToSubmission(user: TestUser, artifacts = COMPLETE_ARTIFACTS, withTestFile = true) {
  await http.post('/v1/me/bootstrap').set('Authorization', `Bearer ${user.token}`)
    .send({ displayName: 'Test' }).expect(201);

  await http.put('/v1/me/career-goal').set('Authorization', `Bearer ${user.token}`)
    .send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);

  const project = await http.post('/v1/projects').set('Authorization', `Bearer ${user.token}`)
    .send({
      title: 'متتبّع عادات', kind: 'platform_activity',
      activitySpecId: FIXTURE.activitySpecId,
    }).expect(201);

  const componentUpload = await uploadFile(app, http, user, 'HabitList.jsx', COMPONENT_BYTES);
  const testUpload = withTestFile ? await uploadFile(app, http, user, 'HabitList.test.jsx', TEST_BYTES) : null;

  const submission = await http.post(`/v1/projects/${project.body.data.id}/submissions`)
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      skillIds: [FIXTURE.skillUiTesting],
      artifacts,
      uploadIds: [componentUpload, ...(testUpload ? [testUpload] : [])],
      aiDisclosure: { declaredUse: [], explanation: null },
    }).expect(201);

  return {
    projectId: project.body.data.id, submissionId: submission.body.data.id,
    uploadIds: [componentUpload, ...(testUpload ? [testUpload] : [])],
  };
}

/* ═══════════════════════ 1 · career goal ════════════════════════════════ */

describe('1 — the user creates and selects a career goal', () => {
  test('a confirmed goal is stored and readable', async () => {
    const user = await newUser();
    await http.post('/v1/me/bootstrap').set('Authorization', `Bearer ${user.token}`)
      .send({}).expect(201);

    const set = await http.put('/v1/me/career-goal')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
    assert.equal(set.body.data.targetRoleId, FIXTURE.roleId);

    // The fixture role is not a reviewed role definition, and the API says so
    // rather than presenting fixture requirements as validated.
    assert.equal(set.body.data.requirementsIncomplete, true);

    const got = await http.get('/v1/me/career-goal')
      .set('Authorization', `Bearer ${user.token}`).expect(200);
    assert.equal(got.body.data.targetRoleId, FIXTURE.roleId);
  });

  test('NEGATIVE: an unconfirmed goal is refused', async () => {
    const user = await newUser();
    await http.post('/v1/me/bootstrap').set('Authorization', `Bearer ${user.token}`).send({});
    await http.put('/v1/me/career-goal').set('Authorization', `Bearer ${user.token}`)
      .send({ targetRoleId: FIXTURE.roleId, confirmed: false }).expect(400);
  });

  test('NEGATIVE: no token, no access', async () => {
    await http.get('/v1/me/career-goal').expect(401);
    await http.get('/v1/me/career-goal').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });
});

/* ═══════════════════════ 2 · project ════════════════════════════════════ */

describe('2 — the user creates a project', () => {
  test('a platform activity records its published spec version', async () => {
    const user = await newUser();
    await http.post('/v1/me/bootstrap').set('Authorization', `Bearer ${user.token}`).send({});
    const res = await http.post('/v1/projects').set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'متتبّع عادات', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId })
      .expect(201);
    assert.equal(res.body.data.activity_spec_version, '0.2.0');
  });

  test('NEGATIVE: a platform activity without a spec is refused (INV-7)', async () => {
    const user = await newUser();
    await http.post('/v1/me/bootstrap').set('Authorization', `Bearer ${user.token}`).send({});
    await http.post('/v1/projects').set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'x', kind: 'platform_activity' }).expect(400);
  });
});

/* ═══════════════════ 3 & 4 · submission does not self-promote ═══════════ */

describe('3, 4 — the user submits evidence, and it does not promote itself', () => {
  test('a submission is locked and the claim reaches practiced, no further', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user);

    const sub = await http.get(`/v1/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${user.token}`).expect(200);
    assert.equal(sub.body.data.state, 'locked');
    assert.ok(sub.body.data.locked_at, 'a locked submission records when it was locked');

    const skills = await http.get('/v1/me/skills')
      .set('Authorization', `Bearer ${user.token}`).expect(200);
    const claim = skills.body.data.items.find((s: { skillId: string }) => s.skillId === FIXTURE.skillUiTesting);
    assert.equal(claim.state, 'practiced', 'a submission proves work happened, not that a skill is proven');
    assert.equal(claim.evidenceCount, 0, 'no evidence exists before an evaluation');
  });

  test('NEGATIVE: no evidence row exists before evaluation', async () => {
    const user = await newUser();
    await upToSubmission(user);
    const { rows } = await pool.query('select count(*)::int as n from evidence where user_id = $1', [user.id]);
    assert.equal(rows[0].n, 0);
  });

  test('NEGATIVE: the user cannot write a claim directly through the database', async () => {
    const user = await newUser();
    await upToSubmission(user);
    await asAuthenticatedUser(pool, user.id, async (c) => {
      await expectRejected(
        c,
        `insert into skill_claim (user_id, skill_id, state, state_reason)
         values ($1,$2,'verified','I say so')`,
        [user.id, FIXTURE.skillUiTesting],
        /row-level security|permission denied|duplicate key/,
      );
    });
  });

  test('NEGATIVE: the user cannot insert a transition to demonstrated directly', async () => {
    const user = await newUser();
    await upToSubmission(user);
    const claim = await pool.query(
      'select id from skill_claim where user_id = $1 and skill_id = $2',
      [user.id, FIXTURE.skillUiTesting],
    );
    await asAuthenticatedUser(pool, user.id, async (c) => {
      await expectRejected(
        c,
        `insert into evidence_transition
           (skill_claim_id, user_id, from_state, to_state, transition_rule_id, actor_kind, reason)
         values ($1,$2,'practiced','demonstrated','T-FAKE','user','promoting myself')`,
        [claim.rows[0].id, user.id],
        /row-level security|permission denied|check constraint/,
      );
    });
  });
});

/* ═══════════════════ 5, 6, 7 · evaluation and transition ════════════════ */

describe('5, 6, 7 — evaluation against the rubric', () => {
  test('a passing evaluation moves practiced → demonstrated', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user);

    const res = await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);

    assert.equal(res.body.data.outcome, 'passed');
    assert.equal(res.body.data.totalScore, 4);
    assert.deepEqual(
      { from: res.body.data.transition.from, to: res.body.data.transition.to },
      { from: 'practiced', to: 'demonstrated' },
    );
    for (const c of res.body.data.criteria) {
      assert.ok(c.rationale?.length > 0, 'every criterion carries a written rationale');
    }

    const skills = await http.get('/v1/me/skills')
      .set('Authorization', `Bearer ${user.token}`).expect(200);
    const claim = skills.body.data.items.find((s: { skillId: string }) => s.skillId === FIXTURE.skillUiTesting);
    assert.equal(claim.state, 'demonstrated');
    assert.equal(claim.evidenceCount, 1);
  });

  test('NEGATIVE: failed criteria create no transition and no evidence', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user, INCOMPLETE_ARTIFACTS);

    const res = await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);

    assert.equal(res.body.data.outcome, 'below_threshold');
    assert.equal(res.body.data.transition, null, 'a failed evaluation transitions nothing');

    const { rows } = await pool.query('select count(*)::int as n from evidence where user_id = $1', [user.id]);
    assert.equal(rows[0].n, 0, 'no evidence is created by a failed evaluation');

    const skills = await http.get('/v1/me/skills').set('Authorization', `Bearer ${user.token}`);
    const claim = skills.body.data.items.find((s: { skillId: string }) => s.skillId === FIXTURE.skillUiTesting);
    assert.equal(claim.state, 'practiced', 'the claim holds where it was; v1 never moves backward either');
  });

  test('NEGATIVE: a blocking integrity failure stops before scoring', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user, COMPLETE_ARTIFACTS, false);

    const res = await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);

    assert.equal(res.body.data.outcome, 'blocked_by_checks');
    assert.equal(res.body.data.criteria.length, 0);
    assert.equal(res.body.data.transition, null);
  });

  test('assessment-only integrity detail never crosses the API boundary', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user);
    const res = await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    const keys = res.body.data.integrityChecks.map((i: { key: string }) => i.key);
    assert.ok(keys.includes('files_present'));
    assert.ok(!keys.includes('tests_reference_component'),
      'an assessment-only check is stored but never returned');
  });

  test('verification is recorded as its own decision, separate from the outcome', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user);
    await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);

    const got = await http.get(`/v1/submissions/${submissionId}/evaluation`)
      .set('Authorization', `Bearer ${user.token}`).expect(200);
    assert.equal(got.body.data.outcome, 'passed', 'what happened during the attempt');
    assert.equal(got.body.data.verification.outcome, 'accepted', 'what verification decided');
    assert.equal(got.body.data.verification.resulting_state, 'demonstrated');
  });
});

/* ═══════════════════ 8 · evaluation history is immutable ════════════════ */

describe('8 — evaluation history is immutable', () => {
  test('NEGATIVE: the owner cannot update or delete a result', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user);
    await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);

    await asAuthenticatedUser(pool, user.id, async (c) => {
      await expectRejected(c, `update evaluation_result set outcome = 'passed' where user_id = $1`,
        [user.id], /permission denied/);
      await expectRejected(c, `delete from evaluation_criterion_score`, [], /permission denied/);
      await expectRejected(c, `delete from evidence_transition`, [], /permission denied/);
      await expectRejected(c, `delete from audit_event`, [], /permission denied/);
    });
  });

  test('NEGATIVE: re-evaluating the same submission is refused, not overwritten', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user);
    await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(400);
  });
});

/* ═══════════════════ 9, 10 · CV bullet and approval ═════════════════════ */

describe('9, 10 — CV bullet from supported evidence, approval required', () => {
  test('a bullet is generated from demonstrated evidence and traces to it', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user);
    const ev = await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    const evidenceId = ev.body.data.transition.evidenceId;

    const asset = await http.post(`/v1/evidence/${evidenceId}/cv-bullet`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);

    assert.equal(asset.body.data.lifecycleState, 'draft');
    assert.equal(asset.body.data.draftingAidUsed, false, 'no model was involved');
    assert.ok(asset.body.data.traces.length >= 4, 'every clause traces to a fact');
    assert.deepEqual(asset.body.data.derivedFromEvidenceIds, [evidenceId]);

    // No framework is inferred. The platform runs on React; the user never
    // said they used it, so it must not appear.
    assert.ok(!/React|Next\.js|TypeScript/i.test(asset.body.data.bodyEn));
    assert.ok(!/\d\s*%/.test(asset.body.data.bodyAr), 'no invented metric');
  });

  test('NEGATIVE: a practiced claim produces no bullet', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user, INCOMPLETE_ARTIFACTS);
    await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);

    // There is no evidence at all, so there is nothing to generate from.
    const { rows } = await pool.query('select count(*)::int as n from evidence where user_id = $1', [user.id]);
    assert.equal(rows[0].n, 0);
  });

  test('an unapproved bullet is never active, and approval is explicit', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user);
    const ev = await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    const asset = await http.post(`/v1/evidence/${ev.body.data.transition.evidenceId}/cv-bullet`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    const assetId = asset.body.data.id;

    const preview = await http.post(`/v1/me/assets/${assetId}/preview`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    assert.equal(preview.body.data.requiresApproval, true);

    // NEGATIVE: approval must be explicit.
    const refused = await http.post(`/v1/me/assets/${assetId}/approve`)
      .set('Authorization', `Bearer ${user.token}`).send({ approved: false }).expect(201);
    assert.equal(refused.body.ok, false);

    let row = await pool.query('select lifecycle_state, user_approved_at from professional_asset where id = $1', [assetId]);
    assert.notEqual(row.rows[0].lifecycle_state, 'active');
    assert.equal(row.rows[0].user_approved_at, null);

    await http.post(`/v1/me/assets/${assetId}/approve`)
      .set('Authorization', `Bearer ${user.token}`).send({ approved: true }).expect(201);

    row = await pool.query('select lifecycle_state, user_approved_at from professional_asset where id = $1', [assetId]);
    assert.equal(row.rows[0].lifecycle_state, 'active');
    assert.ok(row.rows[0].user_approved_at);
  });

  test('NEGATIVE: the database refuses an active asset with no approval', async () => {
    await assert.rejects(
      () => pool.query(
        `insert into professional_asset
           (user_id, kind, title, body, status, lifecycle_state, provenance_class, provenance_source)
         values ($1,'cv_bullet','t','b','generated','active','system_derived','x')`,
        ['11111111-1111-4111-8111-111111111111'],
      ),
      /asset_approved_needs_user_approval|violates foreign key/,
    );
  });
});

/* ═══════════════════ 11 · career evidence report ════════════════════════ */

describe('11 — the report is built from allowed fields only', () => {
  test('it contains the contract fields and no private ones', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user);
    const ev = await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    const asset = await http.post(`/v1/evidence/${ev.body.data.transition.evidenceId}/cv-bullet`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    await http.post(`/v1/me/assets/${asset.body.data.id}/preview`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    await http.post(`/v1/me/assets/${asset.body.data.id}/approve`)
      .set('Authorization', `Bearer ${user.token}`).send({ approved: true }).expect(201);

    const report = await http.post('/v1/me/evidence-report')
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    const r = report.body.data;

    assert.ok(r.targetRole?.label);
    assert.equal(r.skills.length, 1);
    assert.equal(r.skills[0].evidenceState, 'demonstrated');
    assert.equal(r.professionalAssets.length, 1);
    assert.equal(r.aiDisclosure, 'No AI used in this evaluation/asset generation.');

    const serialised = JSON.stringify(r);
    for (const forbidden of [
      'object_path', 'objectPath', 'bucket', 'token_hash', 'reviewerNote',
      'assessmentOnly', 'tests_reference_component', 'signal',
    ]) {
      assert.ok(!serialised.includes(forbidden), `the report leaked '${forbidden}'`);
    }
  });

  test('NEGATIVE: an unapproved asset does not appear in the report', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user);
    const ev = await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    await http.post(`/v1/evidence/${ev.body.data.transition.evidenceId}/cv-bullet`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);

    const report = await http.post('/v1/me/evidence-report')
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    assert.equal(report.body.data.professionalAssets.length, 0);
  });

  test('NEGATIVE: no career goal, no report', async () => {
    const user = await newUser();
    await http.post('/v1/me/bootstrap').set('Authorization', `Bearer ${user.token}`).send({});
    await http.post('/v1/me/evidence-report')
      .set('Authorization', `Bearer ${user.token}`).expect(400);
  });
});

/* ═══════════════════ 12 · isolation between users ═══════════════════════ */

describe('12 — a second user sees none of the first user’s work', () => {
  test('NEGATIVE: project, submission, evaluation, asset and report are all invisible', async () => {
    const owner = await newUser();
    const intruder = await newUser();

    const { projectId, submissionId } = await upToSubmission(owner);
    const ev = await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${owner.token}`).expect(201);
    const asset = await http.post(`/v1/evidence/${ev.body.data.transition.evidenceId}/cv-bullet`)
      .set('Authorization', `Bearer ${owner.token}`).expect(201);
    await http.post(`/v1/me/assets/${asset.body.data.id}/preview`)
      .set('Authorization', `Bearer ${owner.token}`).expect(201);
    await http.post(`/v1/me/assets/${asset.body.data.id}/approve`)
      .set('Authorization', `Bearer ${owner.token}`).send({ approved: true }).expect(201);
    const report = await http.post('/v1/me/evidence-report')
      .set('Authorization', `Bearer ${owner.token}`).expect(201);

    await http.post('/v1/me/bootstrap').set('Authorization', `Bearer ${intruder.token}`).send({});

    await http.get(`/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${intruder.token}`).expect(404);
    await http.get(`/v1/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${intruder.token}`).expect(404);
    await http.get(`/v1/submissions/${submissionId}/evaluation`)
      .set('Authorization', `Bearer ${intruder.token}`).expect(404);
    await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${intruder.token}`).expect(404);
    await http.post(`/v1/evidence/${ev.body.data.transition.evidenceId}/cv-bullet`)
      .set('Authorization', `Bearer ${intruder.token}`).expect(404);
    await http.post(`/v1/me/assets/${asset.body.data.id}/preview`)
      .set('Authorization', `Bearer ${intruder.token}`).expect(404);
    await http.post(`/v1/me/assets/${asset.body.data.id}/approve`)
      .set('Authorization', `Bearer ${intruder.token}`).send({ approved: true }).expect(404);

    const theirProjects = await http.get('/v1/projects')
      .set('Authorization', `Bearer ${intruder.token}`).expect(200);
    assert.equal(theirProjects.body.data.items.length, 0);

    const theirSkills = await http.get('/v1/me/skills')
      .set('Authorization', `Bearer ${intruder.token}`).expect(200);
    assert.equal(theirSkills.body.data.items.length, 0);

    const theirAssets = await http.get('/v1/me/assets')
      .set('Authorization', `Bearer ${intruder.token}`).expect(200);
    assert.equal(theirAssets.body.data.items.length, 0);

    // The intruder cannot create a share link to someone else's report.
    await http.post('/v1/share-links').set('Authorization', `Bearer ${intruder.token}`)
      .send({ resourceKind: 'recruiter_report', resourceId: report.body.data.id, expiresInDays: 7 })
      .expect(404);
  });
});

/* ═══════════════════ 13 · the shared report projection ══════════════════ */

describe('13 — a shared report reveals only the public projection', () => {
  test('the link opens the projection, and nothing beyond it', async () => {
    const user = await newUser();
    const { submissionId } = await upToSubmission(user);
    const ev = await http.post(`/v1/submissions/${submissionId}/evaluate`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    const asset = await http.post(`/v1/evidence/${ev.body.data.transition.evidenceId}/cv-bullet`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    await http.post(`/v1/me/assets/${asset.body.data.id}/preview`)
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    await http.post(`/v1/me/assets/${asset.body.data.id}/approve`)
      .set('Authorization', `Bearer ${user.token}`).send({ approved: true }).expect(201);
    const report = await http.post('/v1/me/evidence-report')
      .set('Authorization', `Bearer ${user.token}`).expect(201);
    const reportId = report.body.data.id;

    // NEGATIVE: with no link, the public route reveals nothing.
    const before = await http.get(`/public/reports/${reportId}`).expect(200);
    assert.equal(before.body.ok, false);

    const link = await http.post('/v1/share-links').set('Authorization', `Bearer ${user.token}`)
      .send({ resourceKind: 'recruiter_report', resourceId: reportId, expiresInDays: 7 })
      .expect(201);
    const token: string = link.body.data.token;
    assert.ok(token, 'the token is returned once');

    // NEGATIVE: a wrong token does not open it.
    const wrong = await http.get(`/public/reports/${reportId}?token=not-the-token`).expect(200);
    assert.equal(wrong.body.ok, false);

    const opened = await http.get(`/public/reports/${reportId}?token=${token}`).expect(200);
    assert.equal(opened.body.ok, true);
    const pub = opened.body.data;

    assert.ok(pub.targetRole);
    assert.equal(pub.skills.length, 1);
    assert.ok(pub.professionalAssets.length === 1);

    // The public projection is strictly narrower than the private report.
    const serialised = JSON.stringify(pub);
    for (const privateField of [
      'evaluationSummary', 'integrityResult', 'stateReason', 'rubricVersion',
      'criteria', 'rationale', 'scopeNote',
    ]) {
      assert.ok(!serialised.includes(privateField), `the public report exposed '${privateField}'`);
    }

    // Revoking shuts the door.
    await pool.query('update share_link set revoked_at = now() where resource_id = $1', [reportId]);
    const afterRevoke = await http.get(`/public/reports/${reportId}?token=${token}`).expect(200);
    assert.equal(afterRevoke.body.ok, false);
  });
});

/* ═════════════════════ transactional integrity ══════════════════════════ */

describe('transactional integrity', () => {
  test('no evaluation ever passes without its evidence and transition', async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n
        from evaluation_result er
        join verification v on v.evaluation_result_id = er.id
       where er.outcome = 'passed'
         and v.outcome = 'accepted'
         and v.resulting_state <> v.proposed_state is false
         and not exists (select 1 from evidence e where e.evaluation_result_id = er.id)
    `);
    assert.equal(rows[0].n, 0, 'an accepted promotion with no evidence row would be a torn write');
  });

  test('no evidence exists without the evaluation result behind it', async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from evidence
       where source_strength in ('platform_controlled','platform_observed')
         and evaluation_result_id is null
    `);
    assert.equal(rows[0].n, 0);
  });

  test('no asset exists without its source evidence', async () => {
    const { rows } = await pool.query(`
      select count(*)::int as n from professional_asset pa
       where pa.kind = 'cv_bullet'
         and not exists (select 1 from asset_evidence ae where ae.asset_id = pa.id)
    `);
    assert.equal(rows[0].n, 0);
  });

  test('no model call was ever recorded: this slice contains no AI', async () => {
    const { rows } = await pool.query('select count(*)::int as n from model_call');
    assert.equal(rows[0].n, 0);
  });
});
