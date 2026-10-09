/**
 * Phase 9 (H5 + H3) — configurable pack constraints, against a real database.
 *
 *  - the migration baseline equals the frozen pre-Phase-9 numbers and is NOT approved
 *  - historical / canonical imports behave exactly as before under the baseline
 *  - every non-dry-run validation records the set@version it ran under
 *  - a different track's numbers are actionable through the Track Builder
 *    (draft → named SME → product owner), never in production unvalidated
 *  - an unknown kind of rule cannot be stored or drafted; conflicts are refused
 *  - H3: evidence paths read the configured per-skill evidence count
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { join } from 'node:path';
import { LEGACY_PACK_CONSTRAINTS, minimumEvidenceCount, evidencePathStatus } from '@naqla/domain';
import { bootApp, newUser, type TestUser } from './helpers';
import { loadPack } from '../src/career-data/pack-loader';
import { importPack } from '../src/career-data/pipeline';
import { validatePack, PackValidationError, type Pack } from '../src/career-data/pack-schema';
import { resolvePackConstraintsFor } from '../src/career-data/pack-constraints';
import { coreSkillEvidencePaths, runQualityChecks } from '../src/career-data/quality-rules';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const ROOT = join(__dirname, '..', '..', '..', '..');
const TRACK = 'trk_frontend_junior';
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
let admin: TestUser; let sme: TestUser; let po: TestUser;
const get = (u: TestUser, path: string, code = 200) => http.get(`/v1/admin${path}`).set(auth(u)).expect(code);
const post = (u: TestUser, path: string, body: unknown, code = 201) => http.post(`/v1/admin${path}`).set(auth(u)).send(body as object).expect(code);
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
const fresh = (): { pack: Pack; files: ReturnType<typeof loadPack>['files'] } => loadPack(join(ROOT, 'data', 'career'), TRACK);
const mutated = (fn: (p: Pack) => void): Pack => { const { pack } = fresh(); const p = structuredClone(pack) as Pack; fn(p); return p; };
/** Gives one skill `n` learning resources (copies of a valid one): structurally valid, only the count changes. */
const resourcesFor = (p: Pack, n: number) => {
  const r0 = p.global.resources[0]!;
  p.global.resources = [...p.global.resources.filter((r) => r.skill !== r0.skill), ...Array.from({ length: n }, (_, i) => ({ ...r0, code: `${r0.code}_copy${i}` }))];
};

async function person(roles: string[]): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  for (const r of roles) await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, $2, 'e2e operator')`, [u.id, r]);
  return u;
}
before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  admin = await person(['track_admin']); sme = await person(['sme']); po = await person(['product_owner']);
});
after(async () => { await pool?.end(); await app?.close(); });

describe('the legacy baseline reproduces the pre-Phase-9 validator', () => {
  test('the migration baseline equals the frozen reference, is in effect, and is NOT approved', async () => {
    const s = await one(`select id, activation, review_status::text, approved_by, baseline_of, track_id from pack_constraint_set where key = 'legacy_pack_constraints' and version = 1`);
    assert.deepEqual([s.activation, s.review_status, s.approved_by, s.track_id], ['legacy_baseline', 'draft', null, null]);
    assert.ok(s.baseline_of);
    const rows = (await pool.query(`select constraint_type::text t, min_value, max_value from pack_constraint where set_id = $1`, [s.id])).rows;
    const byType = new Map(rows.map((r) => [r.t, [r.min_value, r.max_value]]));
    for (const c of LEGACY_PACK_CONSTRAINTS) assert.deepEqual(byType.get(c.type), [c.min, c.max], c.type);
    assert.equal(rows.length, LEGACY_PACK_CONSTRAINTS.length);
    const r = await resolvePackConstraintsFor(pool, TRACK);
    assert.deepEqual([r.ref, r.scope, r.resolution], ['legacy_pack_constraints@1', 'global', 'legacy_baseline']);
  });
  test('the canonical pack validates and imports exactly as before; the run is recorded with the set@version', async () => {
    const { pack, files } = fresh();
    const before = Number((await one('select count(*)::int n from pack_validation_run')).n);
    const dry = await importPack(pool, pack, files, { dryRun: true });
    assert.deepEqual(dry.constraints, { ref: 'legacy_pack_constraints@1', scope: 'global', resolution: 'legacy_baseline' });
    assert.equal(Number((await one('select count(*)::int n from pack_validation_run')).n), before, 'a dry run records nothing');
    const r = await importPack(pool, pack, files);
    assert.equal(r.snapshots.every((s) => s.stored === 'existing'), true, 'historical import: same content, nothing new stored');
    const run = await one('select constraint_ref, resolution, passed, pack_version from pack_validation_run order by created_at desc limit 1');
    assert.deepEqual([run.constraint_ref, run.resolution, run.passed, run.pack_version], ['legacy_pack_constraints@1', 'legacy_baseline', true, pack.track.manifest.pack_version]);
  });
  test('the same packs are refused as before, with the same wording, and a failed run is recorded too', async () => {
    const C = await resolvePackConstraintsFor(pool, TRACK);
    const refused = (p: Pack, re: RegExp) => assert.throws(() => validatePack(p, C), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => re.test(x)));
    refused(mutated((p) => { p.track.activities.pop(); }), /activities: exactly 3 expected, found 2/);
    refused(mutated((p) => { p.track.tasks.splice(9); }), /tasks: 10–12 expected, found 9/);
    refused(mutated((p) => { p.track.roleSkills.find((x) => x.is_core_for_role)!.is_core_for_role = false; p.track.roleSkills.find((x) => x.is_core_for_role)!.is_core_for_role = false; }), /core skills must be 4–5, found 3/);
    refused(mutated((p) => { p.track.rubrics[0]!.criteria.splice(4); }), /at least 5 criteria, found 4/);
    const { files } = fresh();
    await assert.rejects(() => importPack(pool, mutated((p) => { p.track.activities.pop(); }), files), PackValidationError);
    const run = await one('select constraint_ref, passed, problems from pack_validation_run order by created_at desc limit 1');
    assert.equal(run.passed, false); assert.equal(run.constraint_ref, 'legacy_pack_constraints@1');
    assert.ok((run.problems as string[]).some((x) => /exactly 3 expected/.test(x)));
  });
  test('validation without a resolved constraint set is refused — never assumed numbers', () => {
    const { pack } = fresh();
    assert.throws(() => validatePack(pack, { ref: 'none', constraints: [] }), /no pack constraint set was resolved/);
  });
});

describe('expert numbers are actionable through the Track Builder — and only once validated', () => {
  let draftId = '';
  test('an administrator drafts a track-specific set (no JSON), with Arabic help; nothing changes yet', async () => {
    const list = (await get(admin, '/config/pack_constraint_set')).body.data;
    assert.ok(list.help['pack_constraint_set.constraints'].impactAr);
    const base = list.items.find((i: { key: string; version: number }) => i.key === 'legacy_pack_constraints' && i.version === 1);
    assert.equal(base.stage, 'draft'); assert.equal(base.annotation, 'legacy_baseline_in_effect');
    const children = (await pool.query(`select constraint_type::text as constraint_type, min_value, max_value from pack_constraint where set_id = $1`, [base.id])).rows
      .map((r) => (r.constraint_type === 'resources_per_skill_max' ? { ...r, max_value: 5 } : r));
    draftId = (await post(admin, '/config/pack_constraint_set/draft', { baseId: base.id, changes: { track_id: TRACK, label_en: 'Frontend junior — SME proposal', label_ar: 'مسار الواجهات — مقترح' }, children, reason: 'SME feedback: up to 5 resources per gap' })).body.data.id;
    const diff = (await get(sme, `/config/pack_constraint_set/${draftId}/diff`)).body.data;
    assert.equal(diff.children.changed.length, 1); assert.equal(diff.children.changed[0].after.max_value, 5);
    assert.ok(diff.childrenHelp.meaningAr);
    assert.equal((await resolvePackConstraintsFor(pool, TRACK)).ref, 'legacy_pack_constraints@1', 'a draft is never in effect');
  });
  test('an unknown kind of rule cannot be drafted or stored; an incomplete set cannot be drafted', async () => {
    const base = (await get(admin, '/config/pack_constraint_set')).body.data.items.find((i: { key: string; version: number }) => i.key === 'legacy_pack_constraints' && i.version === 1);
    const rows = (await pool.query(`select constraint_type::text as constraint_type, min_value, max_value from pack_constraint where set_id = $1`, [base.id])).rows;
    const r1 = await post(admin, '/config/pack_constraint_set/draft', { baseId: base.id, changes: {}, children: [...rows, { constraint_type: 'portfolio_must_be_public', min_value: 1, max_value: null }], reason: 'try' }, 400);
    assert.match(r1.body.error.message, /unsupported pack constraint type .* explicit extension/);
    const r2 = await post(admin, '/config/pack_constraint_set/draft', { baseId: base.id, changes: {}, children: rows.filter((x) => x.constraint_type !== 'activity_count'), reason: 'try' }, 400);
    assert.match(r2.body.error.message, /activity_count: missing/);
    await assert.rejects(() => pool.query(`insert into pack_constraint (set_id, constraint_type, min_value) values ($1, 'portfolio_must_be_public', 1)`, [draftId]), /invalid input value for enum/);
  });
  test('it cannot reach production unvalidated; a named SME approves; a product owner activates it for this track only', async () => {
    await post(admin, `/config/pack_constraint_set/${draftId}/submit`, { reason: 'ready' });
    await post(po, `/config/pack_constraint_set/${draftId}/activate`, { activation: 'production_active', reason: 'too early' }, 422);
    await post(admin, `/config/pack_constraint_set/${draftId}/validate`, { decision: 'approve', reason: 'self' }, 403);
    await post(sme, `/config/pack_constraint_set/${draftId}/validate`, { decision: 'approve', reason: 'reviewed with the track SME' });
    await post(po, `/config/pack_constraint_set/${draftId}/activate`, { activation: 'development_only', reason: 'trial' });
    try {
      const r = await resolvePackConstraintsFor(pool, TRACK);
      assert.deepEqual([r.ref.startsWith('legacy_pack_constraints@'), r.scope, r.resolution], [true, 'track', 'development_only']);
      const five = mutated((p) => resourcesFor(p, 5));
      assert.doesNotThrow(() => validatePack(five, r), 'the expert number is honoured without a code change');
      assert.throws(() => validatePack(five, { ref: 'legacy_pack_constraints@1', constraints: LEGACY_PACK_CONSTRAINTS }), /has 5 resources; at most 3 per gap/, 'the baseline still refuses it');
      const baseline = await one(`select activation from pack_constraint_set where key = 'legacy_pack_constraints' and version = 1`);
      assert.equal(baseline.activation, 'legacy_baseline', 'a track-specific set never displaces the global baseline');
      assert.equal((await resolvePackConstraintsFor(pool, 'trk_other')).ref, 'legacy_pack_constraints@1', 'other tracks keep the baseline');
      // A second set at the same level for the same track is refused at activation — a conflict never reaches an import.
      const base = (await get(admin, '/config/pack_constraint_set')).body.data.items.find((i: { id: string }) => i.id === draftId);
      assert.ok(base);
      const rows = (await pool.query(`select constraint_type::text as constraint_type, min_value, max_value from pack_constraint where set_id = $1`, [draftId])).rows;
      const other = await one(`insert into pack_constraint_set (key, version, track_id, label_ar, label_en, description_en, created_by) values ('conflicting_set', 1, $1, 'x', 'x', 'x', 'e2e') returning id`, [TRACK]);
      for (const x of rows) await pool.query('insert into pack_constraint (set_id, constraint_type, min_value, max_value) values ($1, $2::pack_constraint_type, $3, $4)', [other.id, x.constraint_type, x.min_value, x.max_value]);
      const c = await pool.connect();
      try {
        await c.query('begin'); await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'conflict attempt', true)");
        await assert.rejects(() => c.query(`update pack_constraint_set set activation = 'development_only' where id = $1`, [other.id]), /duplicate key value violates unique constraint "pack_constraint_set_one_per_scope_level"/);
      } finally { await c.query('rollback'); c.release(); }
    } finally {
      await post(po, `/config/pack_constraint_set/${draftId}/activate`, { activation: 'inactive', reason: 'e2e rollback' });
    }
    assert.equal((await resolvePackConstraintsFor(pool, TRACK)).ref, 'legacy_pack_constraints@1', 'rollback restores the baseline');
    await assert.rejects(() => pool.query(`update pack_constraint set min_value = 7 where set_id = $1 and constraint_type = 'task_count'`, [draftId]), /immutable/, 'a set that has been active is frozen');
  });
});

describe('H3: evidence paths read the configured per-skill evidence count', () => {
  test('the shipped pack states exactly the legacy numbers, so every status is unchanged', async () => {
    const { pack } = fresh();
    for (const rs of pack.track.roleSkills) assert.equal(rs.minimum_evidence_count, minimumEvidenceCount(rs.is_core_for_role), rs.skill);
    const rows = (await pool.query(`select rr.is_core, rr.minimum_evidence_count from role_requirement rr join target_role tr on tr.id = rr.target_role_id where tr.slug = 'frontend-developer-junior' and tr.is_demo_fixture`)).rows;
    assert.ok(rows.length > 0);
    for (const r of rows) for (const n of [0, 1, 2, 3]) {
      assert.equal(evidencePathStatus({ minimumEvidenceCount: r.minimum_evidence_count, activitiesWithLinkedCriterion: n }),
        evidencePathStatus({ minimumEvidenceCount: minimumEvidenceCount(r.is_core), activitiesWithLinkedCriterion: n }));
    }
    const paths = await coreSkillEvidencePaths(pool, 'frontend-developer-junior');
    assert.ok(paths.every((p) => p.status !== 'evidence_count_not_configured'));
  });
  test('quality rules still pass on the baseline (Q06 evidence paths, Q08 resources per skill from the global set)', async () => {
    const { results } = await runQualityChecks(pool);
    // Other suites leave e2e fixture roles in this shared database; the shipped track is what must pass (Q06 only depends on "no path at all", unchanged).
    const q06 = results.find((r) => r.id === 'Q06')!.offenders.filter((o) => o.startsWith('frontend-developer'));
    assert.deepEqual(q06, []);
    const q08 = results.find((r) => r.id === 'Q08')!;
    assert.equal(q08.passed, true, q08.offenders.join('; '));
  });
});
