/**
 * ENG-1 P2/P3 — the per-skill pathway is inactive for real users. Since P3 it exists as a development-only pathway
 * (eng1-p3-per-skill.e2e.ts drives it under an explicitly opted-in development policy). Proof that it stays inactive:
 *   1. under the legacy scope a real evaluation writes no per-skill record and links no decision or evidence to one;
 *   2. no per_skill policy is approved, published, production_active or a baseline, and none is active at rest;
 *      every per-skill record was decided under an unapproved per_skill draft;
 *   3. the database refuses development activation without the explicit test opt-in, and any other activation at all;
 *   4. the only API code that touches the pathway is the evaluation writer (which refuses production), the decision
 *      recorder, the configuration guards and the My Work read model (read only).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, FIXTURE, COMPLETE_ARTIFACTS, uploadFile, COMPONENT_BYTES, TEST_BYTES, filesFor, type TestUser } from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });

describe('ENG-1 P2 — the per-skill pathway is inactive', () => {
  test('a passing evaluation that moves a level writes no skill_assessment and links nothing to one', async () => {
    const u = await newUser();
    await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
    await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
    const pid = (await http.post('/v1/projects').set(auth(u)).send({ title: 'P2', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201)).body.data.id;
    const uploads = [await uploadFile(app, http, u, 'HabitList.jsx', COMPONENT_BYTES), await uploadFile(app, http, u, 'HabitList.test.jsx', TEST_BYTES)];
    const sid = (await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: [FIXTURE.skillUiTesting], artifacts: COMPLETE_ARTIFACTS, files: filesFor(uploads), aiDisclosure: { declaredUse: [] } }).expect(201)).body.data.id;
    const ev = (await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u)).expect(201)).body.data;
    assert.ok(ev.transition, 'the legacy path still promotes under the test-compatibility policy');
    assert.equal((await pool.query('select count(*)::int n from skill_assessment where user_id = $1', [u.id])).rows[0].n, 0);
    assert.equal((await pool.query('select count(*)::int n from verification_decision where user_id = $1 and skill_assessment_id is not null', [u.id])).rows[0].n, 0);
    assert.equal((await pool.query('select count(*)::int n from evidence where user_id = $1 and skill_assessment_id is not null', [u.id])).rows[0].n, 0);
  });
  test('no per_skill policy is validated or active for real users; at rest none is active; every per-skill record came from an unapproved per_skill draft', async () => {
    assert.equal((await pool.query(`select count(*)::int n from verification_policy where assessment_scope = 'per_skill' and (review_status in ('approved','published') or activation in ('production_active','legacy_baseline'))`)).rows[0].n, 0);
    assert.equal((await pool.query(`select count(*)::int n from verification_policy where assessment_scope = 'per_skill' and activation <> 'inactive'`)).rows[0].n, 0, 'the P3 suite restores the legacy policy when it ends');
    assert.equal((await pool.query(`select count(*)::int n from verification_decision d join verification_policy p on p.id = d.policy_id
      where d.skill_assessment_id is not null and (p.assessment_scope <> 'per_skill' or p.review_status in ('approved','published'))`)).rows[0].n, 0);
    assert.equal((await pool.query(`select count(*)::int n from verification_policy where per_skill_evidence_derivation and activation <> 'inactive'`)).rows[0].n, 0, 'no policy in effect enables H6 (an inactive H6 row left by the H6 negative test never decides)');
  });
  test('the database refuses to activate a per_skill policy without the explicit test opt-in, and refuses production_active outright', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'ENG-1 seal proof', true)");
      await c.query(`insert into verification_policy (key, version, description_en, assessment_scope) values ('eng1_seal', 1, 'seal proof', 'per_skill')`);
      await c.query('savepoint s');
      await assert.rejects(() => c.query(`update verification_policy set activation = 'development_only' where key = 'eng1_seal'`), /per_skill_dev_activation/);
      await c.query('rollback to savepoint s');
      await c.query("select set_config('naqla.per_skill_dev_activation', 'on', true)");
      await assert.rejects(() => c.query(`update verification_policy set review_status = 'approved', approved_by = gen_random_uuid(), approved_at = now(), activation = 'production_active' where key = 'eng1_seal'`), /per_skill_development_only/);
    } finally { await c.query('rollback').catch(() => undefined); c.release(); }
  });
  test('only the evaluation writer, the decision recorder, the configuration guards and the My Work read model touch the pathway; the writer refuses production', () => {
    const root = resolve(__dirname, '../../src');
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
    walk(root);
    assert.ok(files.length > 50, 'the source tree was found');
    const forbidden = /skill_assessment|assessment_scope|assessSkills?\b|decideSkillAssessment|PER_SKILL_MODEL_VERSION/;
    const hits = files.filter((f) => forbidden.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length + 1)).sort();
    assert.deepEqual(hits, ['assessment/assessment-recorder.service.ts', 'configuration/config-admin.service.ts', 'slice1/activity-catalogue.service.ts', 'slice1/evaluation.service.ts']);
    assert.doesNotMatch(readFileSync(join(root, 'slice1/activity-catalogue.service.ts'), 'utf8'), /insert into|update skill_assessment|skill_assessment \(/, 'My Work only reads');
    const writer = readFileSync(join(root, 'slice1/evaluation.service.ts'), 'utf8');
    assert.match(writer, /scope === 'per_skill' && isProduction\(\)/, 'the scope resolver refuses per_skill in production');
    assert.match(writer, /private async applyPerSkill[\s\S]{0,1200}if \(isProduction\(\)\) throw/, 'the writer refuses production');
  });
});
