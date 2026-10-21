/**
 * OPEN-039 × readiness — alias-named rules are handled the same way at creation, approval, activation and evaluation.
 *
 *  - creation refuses a rule that names an alias, in words, naming the canonical skill;
 *  - a set that was consistent and activated stays consistent when one of its skills is merged AFTER approval: the
 *    rule is evaluated on the canonical skill (never "not part of this track"), the classification entry is read as
 *    the canonical skill, re-activation passes the same check, and no problem appears from alias handling alone.
 * Own fixtures (a demo role and three skills); everything is switched off again at the end.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool, type PoolClient } from 'pg';
import { bootApp, newUser, type TestUser } from './helpers';
import { cliCreateReadinessSet, cliActivate, assertReadinessSetConsistentWithClassification } from '../src/configuration/config-admin.service';
import { createClassificationSet, approveClassificationSet } from '../src/configuration/professional-classification';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const T = Math.random().toString(36).slice(2, 8);
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
const tx = async <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => {
  const c = await pool.connect();
  try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
};
let roleId = ''; let N = ''; let M = ''; let K = ''; let classId = ''; let setId = '';
type Report = { status: string; rules: { ruleId: string; outcome: string; skillIds: string[] }[]; classificationProblems?: string[] };

before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  roleId = (await one(`insert into target_role (slug, label_ar, label_en, track_id, source_label, provenance_class, provenance_source, is_demo_fixture) values ($1, 'دور اختبار', 'alias e2e role', 'trk_alias_e2e', 'e2e', 'curated', 'e2e', true) returning id`, [`e2e-alias-${T}`])).id;
  const skill = async (slug: string) => (await one(`insert into skill (slug, label_ar, label_en, provenance_class, provenance_source, is_demo_fixture) values ($1, $1, $1, 'curated', 'e2e', true) returning id`, [`${slug}-${T}`])).id as string;
  N = await skill('e2e-alias-old'); M = await skill('e2e-alias-canonical'); K = await skill('e2e-alias-core');
  for (const [s, core] of [[N, false], [K, true]] as const) {
    await pool.query(`insert into role_requirement (target_role_id, skill_id, is_core, importance, target_proficiency, why_required_ar, why_required_en, review_status, weight, minimum_evidence_count, is_demo_fixture)
      values ($1, $2, $3, 'high', 'working', 'سبب', 'reason', 'draft', 0.5, 2, true)`, [roleId, s, core]);
  }
  classId = (await tx((c) => createClassificationSet(c, { key: `e2e_alias_${T}`, targetRoleId: roleId, labelAr: 'تصنيف', labelEn: 'alias e2e classification', description: 'alias e2e', createdBy: 'e2e author',
    entries: [{ skillId: N, cls: 'must', source: 'sme', sourceRef: 'TEST FIXTURE' }, { skillId: K, cls: 'core', source: 'sme', sourceRef: 'TEST FIXTURE' }] }))).id;
  await tx((c) => approveClassificationSet(c, { id: classId, smeApprovedBy: 'SME (TEST FIXTURE)' }));
  await tx(async (c) => { await c.query("select set_config('naqla.classification_dev_activation', 'on', true)"); await c.query(`update skill_classification_set set activation = 'development_only' where id = $1`, [classId]); });
});
after(async () => {
  if (setId) await cliActivate(pool, { table: 'readiness_rule_set', id: setId, activation: 'inactive', actor: 'e2e', reason: 'alias e2e cleanup' }).catch(() => undefined);
  if (classId) await pool.query(`update skill_classification_set set activation = 'inactive' where id = $1`, [classId]);
  await pool?.end(); await app?.close();
});
async function learner(): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: roleId, confirmed: true }).expect(200);
  return u;
}
const report = async (u: TestUser): Promise<Report> => (await http.get('/v1/me/readiness').set(auth(u)).expect(200)).body.data.report;

describe('alias-named readiness rules: one mapping at creation, approval, activation and evaluation', () => {
  test('a consistent set is created and activated; its rules are judged on the role\'s skills', async () => {
    const set = await cliCreateReadinessSet(pool, { key: `e2e_alias_${T}`, targetRoleId: roleId, labelAr: 'قواعد', labelEn: 'alias e2e rules', description: 'alias e2e', createdBy: 'e2e', rules: [
      { type: 'non_compensable_skill', params: { min_level: 'demonstrated' }, skillId: N, labelAr: 'x', labelEn: 'Must N' },
      { type: 'required_skill_at_level', params: { min_level: 'demonstrated' }, skillId: K, labelAr: 'x', labelEn: 'Core K' },
    ] });
    setId = set.id;
    await cliActivate(pool, { table: 'readiness_rule_set', id: setId, activation: 'development_only', actor: 'e2e', reason: 'alias e2e' });
    const r = await report(await learner());
    assert.deepEqual(r.classificationProblems, []);
    assert.ok(r.rules.every((x) => x.outcome === 'not_satisfied'), JSON.stringify(r.rules.map((x) => x.outcome)));
  });
  test('after the Must skill is merged into another (post-approval), nothing fails because of alias handling', async () => {
    // The OPEN-039 effect: the old skill becomes an alias of M and the role requirement is repointed; the rule and the
    // classification entry keep their (now alias) ids — both are immutable once approved/active.
    await pool.query(`update skill set status = 'merged_into', merged_into_id = $2 where id = $1`, [N, M]);
    await pool.query(`update role_requirement set skill_id = $2 where target_role_id = $3 and skill_id = $1`, [N, M, roleId]);
    assert.equal((await one('select canonical_skill_id($1)::text as c', [N])).c, M);
    assert.equal((await one('select skill_id::text as s from readiness_rule where rule_set_id = $1 and rule_type = $2', [setId, 'non_compensable_skill'])).s, N, 'the stored rule still names the old id');
    const u = await learner();
    const r = await report(u);
    assert.deepEqual(r.classificationProblems, [], 'no false "Must skill has no non-compensable rule" from an alias');
    const must = r.rules.find((x) => x.skillIds.includes(M));
    assert.ok(must, 'the rule is read as the canonical skill');
    assert.equal(must!.outcome, 'not_satisfied', 'judged on the role skill, never "not part of this track"');
    assert.ok(r.rules.every((x) => x.outcome !== 'indeterminate'));
    const items = (await http.get('/v1/me/track-skills').set(auth(u)).expect(200)).body.data.items as { skillId: string; readiness: { badge: string } }[];
    assert.equal(items.find((i) => i.skillId === M)?.readiness.badge, 'must', 'the classification entry is read as the canonical skill');
    // Approval / activation use the same mapping: re-activating the same set passes the same check.
    await tx((c) => assertReadinessSetConsistentWithClassification(c, setId));
    await cliActivate(pool, { table: 'readiness_rule_set', id: setId, activation: 'inactive', actor: 'e2e', reason: 'off' });
    await cliActivate(pool, { table: 'readiness_rule_set', id: setId, activation: 'development_only', actor: 'e2e', reason: 'on again after the merge' });
  });
  test('a new rule naming the alias is refused at creation, naming the canonical skill', async () => {
    await assert.rejects(() => cliCreateReadinessSet(pool, { key: `e2e_alias_bad_${T}`, targetRoleId: roleId, labelAr: 'x', labelEn: 'x', description: 'x', createdBy: 'e2e', rules: [
      { type: 'required_skill_at_level', params: { min_level: 'demonstrated' }, skillId: N, labelAr: 'x', labelEn: 'alias' },
    ] }), (e: Error) => e.message.includes('names an alias skill') && e.message.includes(M));
  });
});
