/**
 * ENG-1 P2 — the per-skill pathway exists only as schema. Proof that it is inactive:
 *   1. a real evaluation writes no per-skill record and links no decision or evidence to one;
 *   2. every policy keeps the legacy scope, and a per_skill policy cannot be activated (database seal);
 *   3. no API source file reads or writes the new tables or the per-skill domain functions.
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
  test('no per-skill record exists anywhere after the whole suite has run, and no policy uses the per_skill scope', async () => {
    assert.equal((await pool.query('select count(*)::int n from skill_assessment')).rows[0].n, 0);
    assert.equal((await pool.query('select count(*)::int n from skill_assessment_criterion')).rows[0].n, 0);
    assert.equal((await pool.query(`select count(*)::int n from verification_policy where assessment_scope <> 'primary_claimed_skill'`)).rows[0].n, 0);
    assert.equal((await pool.query(`select count(*)::int n from verification_policy where per_skill_evidence_derivation and activation <> 'inactive'`)).rows[0].n, 0, 'no policy in effect enables H6 (an inactive H6 row left by the H6 negative test never decides)');
  });
  test('the database refuses to activate a per_skill policy, even development_only with an audited actor', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'ENG-1 P2 seal proof', true)");
      await c.query(`insert into verification_policy (key, version, description_en, assessment_scope) values ('eng1_seal', 1, 'seal proof', 'per_skill')`);
      await assert.rejects(() => c.query(`update verification_policy set activation = 'development_only' where key = 'eng1_seal'`), /per_skill_sealed/);
    } finally { await c.query('rollback').catch(() => undefined); c.release(); }
  });
  test('no API source reads or writes the per-skill tables, the scope column or the per-skill domain functions', () => {
    const root = resolve(__dirname, '../../src');
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
    walk(root);
    assert.ok(files.length > 50, 'the source tree was found');
    const forbidden = /skill_assessment|assessment_scope|assessSkills?\b|decideSkillAssessment|PER_SKILL_MODEL_VERSION/;
    const hits = files.filter((f) => forbidden.test(readFileSync(f, 'utf8')));
    assert.deepEqual(hits, [], 'the inactive pathway has no reader or writer');
  });
});
