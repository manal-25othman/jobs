/**
 * Publication safety (v2): a professionally classified role is never approved, published, or given an approved /
 * active classification while one of its requirements references a superseded, rejected, inactive or
 * learner-invisible skill. The same query as Q25. Legacy (unclassified) roles keep their behaviour. Own fixtures.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool, type PoolClient } from 'pg';
import { promoteDemo, completePromotion } from '../src/career-data/promotion';
import { reviewTransition } from '../src/career-data/review';
import { runQualityChecks } from '../src/career-data/quality-rules';
import { createClassificationSet, approveClassificationSet, activateClassificationForDevelopment } from '../src/configuration/professional-classification';

let pool: Pool;
const T = Math.random().toString(36).slice(2, 8);
const SME = '44444444-4444-4444-8444-444444444444';
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
const tx = async <R>(fn: (c: PoolClient) => Promise<R>): Promise<R> => {
  const c = await pool.connect();
  try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
};
const role = async (slug: string, demo: boolean) => (await one(`insert into target_role (slug, label_ar, label_en, track_id, source_label, provenance_class, provenance_source, is_demo_fixture) values ($1, $1, $1, 'trk_pubsafe', 'e2e', 'curated', 'e2e', $2) returning id`, [`${slug}-${T}`, demo])).id as string;
const skill = async (slug: string, demo: boolean) => (await one(`insert into skill (slug, label_ar, label_en, provenance_class, provenance_source, is_demo_fixture) values ($1, $1, $1, 'curated', 'e2e', $2) returning id`, [`${slug}-${T}`, demo])).id as string;
const requirement = async (roleId: string, skillId: string, demo: boolean) => (await one(`insert into role_requirement (target_role_id, skill_id, is_core, importance, target_proficiency, why_required_ar, why_required_en, review_status, weight, minimum_evidence_count, is_demo_fixture)
  values ($1, $2, false, 'high', 'working', 'سبب', 'reason', 'draft', 0.5, 1, $3) returning id`, [roleId, skillId, demo])).id as string;
const step = (kind: string, id: string, to: string) => reviewTransition(pool, { entityKind: kind, entityId: id, to: to as never, decidedBy: to === 'curated' || to === 'published' ? null : SME, decidedByLabel: to === 'curated' ? 'author' : to === 'published' ? 'PO' : 'SME (TEST FIXTURE)',
  rolePerformed: (to === 'curated' ? 'content_author' : to === 'published' ? 'product_owner' : 'sme') as never, reason: `publication-safety e2e: ${to}`, production: false });
const classify = (roleId: string, entries: [string, 'must' | 'core' | 'supporting'][]) => tx((c) => createClassificationSet(c, { key: `e2e_pubsafe_${roleId.slice(0, 8)}`, targetRoleId: roleId, labelAr: 'x', labelEn: 'x', description: 'publication-safety e2e', createdBy: 'e2e author',
  entries: entries.map(([skillId, cls]) => ({ skillId, cls, source: 'sme' as const, sourceRef: 'TEST FIXTURE' })) }));

before(async () => { pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); });

describe('a classified role cannot be approved or published around a superseded or invisible skill', () => {
  test('demo role after a skill-only promotion: Q25 names it, and its classification cannot be approved', async () => {
    const r = await role('e2e-pubsafe-demo', true); const k = await skill('e2e-pubsafe-kept', true); const p = await skill('e2e-pubsafe-promoted', true);
    await requirement(r, k, true); await requirement(r, p, true);
    const set = await classify(r, [[k, 'must'], [p, 'core']]);
    const promo = await promoteDemo(pool, 'skill', p, 'content author', 'publication-safety e2e');
    for (const to of ['sme_reviewed', 'approved', 'published']) await step('skill', promo.canonicalId, to);
    await completePromotion(pool, promo.promotionId);
    const q25 = (await runQualityChecks(pool)).results.find((x) => x.id === 'Q25')!.offenders.filter((o) => o.startsWith(`e2e-pubsafe-demo-${T} →`));
    assert.deepEqual(q25, [`e2e-pubsafe-demo-${T} → e2e-pubsafe-promoted-${T} (superseded, successor ${promo.canonicalId} published)`]);
    await assert.rejects(() => tx((c) => approveClassificationSet(c, { id: set.id, smeApprovedBy: 'SME (TEST FIXTURE)' })),
      (e: Error) => /approving this classification refused/.test(e.message) && e.message.includes(`e2e-pubsafe-promoted-${T}`));
    assert.equal((await one('select review_status::text as s from skill_classification_set where id = $1', [set.id])).s, 'draft', 'nothing approved');
  });
  test('non-demo classified role: a requirement on a deprecated skill blocks approval / publication and development activation; the healthy requirement is unaffected', async () => {
    const r = await role('e2e-pubsafe-v2', false); const k = await skill('e2e-pubsafe-ok', false); const d = await skill('e2e-pubsafe-retired', false);
    const rk = await requirement(r, k, false); const rd = await requirement(r, d, false);
    const set = await classify(r, [[k, 'must'], [d, 'supporting']]);
    await tx((c) => approveClassificationSet(c, { id: set.id, smeApprovedBy: 'SME (TEST FIXTURE)' }));   // clean at approval time
    await pool.query(`update skill set status = 'deprecated' where id = $1`, [d]);                       // the skill is retired afterwards
    await assert.rejects(() => tx((c) => activateClassificationForDevelopment(c, set.id)), /activating this classification refused.*e2e-pubsafe-retired/);
    assert.equal((await one('select activation::text as a from skill_classification_set where id = $1', [set.id])).a, 'inactive');
    for (const to of ['curated', 'sme_reviewed']) { await step('role_requirement', rd, to); await step('role_requirement', rk, to); }
    await assert.rejects(() => step('role_requirement', rd, 'approved'), new RegExp(`approving this role requirement refused.*e2e-pubsafe-retired-${T} \\(deprecated, no successor\\)`));
    await step('role_requirement', rk, 'approved');                                                        // the healthy requirement proceeds
    for (const to of ['curated', 'sme_reviewed']) await step('target_role', r, to);
    await assert.rejects(() => step('target_role', r, 'approved'), /approving this target role refused.*e2e-pubsafe-retired/);
  });
  test('legacy (unclassified) role: behaviour unchanged — the same requirement still moves through review', async () => {
    const r = await role('e2e-pubsafe-legacy', false); const d = await skill('e2e-pubsafe-legacy-retired', false);
    const rd = await requirement(r, d, false);
    await pool.query(`update skill set status = 'deprecated' where id = $1`, [d]);
    for (const to of ['curated', 'sme_reviewed', 'approved']) await step('role_requirement', rd, to);
    assert.equal((await one('select review_status::text as s from role_requirement where id = $1', [rd])).s, 'approved', 'no new refusal on the legacy path (Q02 already reports deprecated mappings)');
  });
});
