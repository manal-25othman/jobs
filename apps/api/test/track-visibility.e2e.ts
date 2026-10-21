/**
 * Why a learner's track can show one skill fewer than the role requires — proven on an own fixture, then made loud.
 *
 * Rule (0024, graduate_content_visible): a DEMO row is visible to graduates outside production unless it is
 * `superseded` or `rejected`. OPEN-040 promotion supersedes the demo skill when its non-demo copy is published. If only
 * the SKILL is promoted, the demo role keeps pointing at the superseded demo row: the requirement stays visible, its
 * skill does not, so the track omits it. This is the state the career-data suite leaves for `skl_forms_validation`.
 * Q25 names that state (with the successor), so it is never silent.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, type TestUser } from './helpers';
import { promoteDemo, completePromotion } from '../src/career-data/promotion';
import { reviewTransition } from '../src/career-data/review';
import { runQualityChecks } from '../src/career-data/quality-rules';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const T = Math.random().toString(36).slice(2, 8);
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
let roleId = ''; let kept = ''; let promoted = ''; let roleSlug = '';

before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  roleSlug = `e2e-vis-${T}`;
  roleId = (await one(`insert into target_role (slug, label_ar, label_en, track_id, source_label, provenance_class, provenance_source, is_demo_fixture) values ($1, 'دور', 'visibility e2e role', 'trk_vis_e2e', 'DEMO', 'curated', 'e2e', true) returning id`, [roleSlug])).id;
  const skill = async (slug: string) => (await one(`insert into skill (slug, label_ar, label_en, provenance_class, provenance_source, is_demo_fixture) values ($1, $1, $1, 'curated', 'e2e', true) returning id`, [`${slug}-${T}`])).id as string;
  kept = await skill('e2e-vis-kept'); promoted = await skill('e2e-vis-promoted');
  for (const s of [kept, promoted]) {
    await pool.query(`insert into role_requirement (target_role_id, skill_id, is_core, importance, target_proficiency, why_required_ar, why_required_en, review_status, weight, minimum_evidence_count, is_demo_fixture)
      values ($1, $2, false, 'high', 'working', 'سبب', 'reason', 'draft', 0.5, 1, true)`, [roleId, s]);
  }
});
after(async () => { await pool?.end(); await app?.close(); });

async function trackSkillIds(): Promise<string[]> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: roleId, confirmed: true }).expect(200);
  return ((await http.get('/v1/me/track-skills').set(auth(u)).expect(200)).body.data.items as { skillId: string }[]).map((i) => i.skillId).sort();
}
const q25 = async () => (await runQualityChecks(pool)).results.find((r) => r.id === 'Q25')!.offenders.filter((o) => o.startsWith(`${roleSlug} →`));

describe('track visibility after a skill-only promotion', () => {
  test('clean fixture: the learner sees every required skill, and Q25 names nothing for this role', async () => {
    assert.deepEqual(await trackSkillIds(), [kept, promoted].sort());
    assert.deepEqual(await q25(), []);
  });
  test('after the OPEN-040 promotion of one skill, that skill leaves the track by rule 0024 — and Q25 names it with its successor', async () => {
    const r = await promoteDemo(pool, 'skill', promoted, 'content author', 'visibility e2e');
    const go = (to: string, role: string, by: string | null) => reviewTransition(pool, { entityKind: 'skill', entityId: r.canonicalId, to: to as never, decidedBy: by, decidedByLabel: by ?? 'PO', rolePerformed: role as never, reason: `visibility e2e: ${to}`, production: false });
    const sme = '33333333-3333-4333-8333-333333333333';
    await go('sme_reviewed', 'sme', sme); await go('approved', 'sme', sme); await go('published', 'product_owner', null);
    await completePromotion(pool, r.promotionId);
    // The exact rule, as the database states it:
    assert.equal((await one(`select review_status::text as s from skill where id = $1`, [promoted])).s, 'superseded');
    assert.equal((await one(`select graduate_content_visible('superseded', true) as v`)).v, false, 'a superseded demo row is never shown to graduates');
    assert.equal((await one(`select graduate_content_visible('draft', true) as v`)).v, true, 'a draft demo row is shown outside production');
    // The requirement itself is untouched (no history rewritten) and still visible; only its skill is not.
    const rr = await one(`select skill_id::text as s, review_status::text as st from role_requirement where target_role_id = $1 and skill_id = $2`, [roleId, promoted]);
    assert.deepEqual(rr, { s: promoted, st: 'draft' });
    assert.deepEqual(await trackSkillIds(), [kept], 'the track omits exactly the superseded skill');
    const offenders = await q25();
    assert.equal(offenders.length, 1);
    assert.match(offenders[0]!, new RegExp(`^${roleSlug} → e2e-vis-promoted-${T} \\(superseded, successor ${r.canonicalId} published\\)$`));
  });
});
