/**
 * Phase B, package 3 (PO decision 3) — an activity whose required starter materials are missing cannot be started.
 *
 *  - the catalogue and the detail say so (startable: false), and name nothing private
 *  - POST /projects is refused (409, [starter_materials_missing], explained in Arabic); no project is created
 *  - the database refuses the same insert by any path (0039 guard)
 *  - an activity that declares no material-required input (legacy content) is unaffected
 * Own fixtures: a DEMO role on its own track, one DEMO activity with one material-required input and no material.
 * (Like the other fixture suites, it runs after career-data.e2e, whose global content-quality check covers canonical content only.)
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { STARTER_MATERIALS_MISSING_AR } from '@naqla/domain';
import { bootApp, newUser, FIXTURE, type TestUser } from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const ROLE = randomUUID(); const ACT = randomUUID(); const tag = ROLE.slice(0, 8);

before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  await pool.query(`insert into target_role (id, slug, label_ar, label_en, track_id, source_label, provenance_class, provenance_source, is_demo_fixture)
    values ($1, $2, 'دور اختبار المواد', 'materials test role', $3, 'e2e', 'curated', 'Phase B package 3 e2e', true)`, [ROLE, `am-role-${tag}`, `am-track-${tag}`]);
  await pool.query(`insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec, is_demo_fixture, target_role_id)
    values ($1, $2, '1.0.0', 'curated', 'نشاط بلا مواد', 'ai_assisted', '{}'::jsonb, true, $3)`, [ACT, `am-act-${tag}`, ROLE]);
  await pool.query(`insert into activity_skill (activity_spec_id, skill_id, depth) values ($1, $2, 'primary')`, [ACT, FIXTURE.skillUiTesting]);
  await pool.query(`insert into activity_input (activity_spec_id, key, description_ar, description_en, is_platform_private, contains_planted_issue, material_required)
    values ($1, 'repo.starter', 'مشروع بداية', 'starter project', true, false, true)`, [ACT]);
  await pool.query(`update activity_spec set status = 'published' where id = $1`, [ACT]); // the DEMO shortcut (0007)
});
after(async () => { await pool?.end(); await app?.close(); });

async function graduateOn(roleId: string): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: roleId, confirmed: true }).expect(200);
  return u;
}

describe('Phase B package 3 — the start rule (PO decision 3)', () => {
  test('the catalogue and the detail say the activity cannot be started yet, naming nothing private', async () => {
    const u = await graduateOn(ROLE);
    const items = (await http.get('/v1/me/activities').set(auth(u)).expect(200)).body.data.items as { id: string; startable: boolean }[];
    assert.deepEqual(items.map((i) => [i.id, i.startable]), [[ACT, false]]);
    const d = (await http.get(`/v1/me/activities/${ACT}`).set(auth(u)).expect(200)).body.data;
    assert.equal(d.startable, false); assert.equal(d.materialsAvailable, false); assert.equal(d.missingMaterialCount, 1); assert.deepEqual(d.materials, []);
  });

  test('starting it is refused at the API (409, explained in Arabic) and no project is created', async () => {
    const u = await graduateOn(ROLE);
    const r = await http.post('/v1/projects').set(auth(u)).send({ title: 'x', kind: 'platform_activity', activitySpecId: ACT }).expect(409);
    assert.match(r.body.error.message, /^\[starter_materials_missing\]/);
    assert.ok(r.body.error.message.includes(STARTER_MATERIALS_MISSING_AR));
    assert.equal(Number((await pool.query('select count(*)::int n from project where user_id = $1', [u.id])).rows[0].n), 0);
  });

  test('the database refuses the same insert by any other path (0039)', async () => {
    const u = await graduateOn(ROLE);
    await assert.rejects(() => pool.query(`insert into project (user_id, title, kind, activity_spec_id, activity_spec_version) values ($1, 'x', 'platform_activity', $2, '1.0.0')`, [u.id, ACT]),
      /starter_materials_missing/);
  });

  test('an activity that declares no material-required input (legacy content) is unaffected', async () => {
    const u = await graduateOn(FIXTURE.roleId);
    const d = (await http.get(`/v1/me/activities/${FIXTURE.activitySpecId}`).set(auth(u)).expect(200)).body.data;
    assert.equal(d.startable, true);
    await http.post('/v1/projects').set(auth(u)).send({ title: 'متتبّع', kind: 'platform_activity', activitySpecId: FIXTURE.activitySpecId }).expect(201);
  });
});
