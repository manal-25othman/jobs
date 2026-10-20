/**
 * DM-7b / P-3 (D-130) — the versioned professional classification (Must / Core / Supporting), against a real database.
 *
 *  - v1 packs, the frozen legacy constraint baseline and legacy is_core readers are unchanged
 *  - a v2 (classified) pack validates only under a schema-2 constraint set; never a fallback across schemas
 *  - Task B (three Must primaries) passes under v2 and is refused under v1, as the DM-7b analysis predicted
 *  - the classification is governed: draft → named SME (+ Product Owner for PO defaults) → development_only opt-in
 *  - readers are version-aware (badges, provenance, agent gaps, Track Builder) and production sees legacy only
 *  - readiness: classification and rule set must agree; classification alone never grants readiness
 *  - nothing historical moves (is_core, claims, decisions, readiness evaluations)
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool, type PoolClient } from 'pg';
import { join } from 'node:path';
import { LEGACY_PACK_CONSTRAINTS } from '@naqla/domain';
import { bootApp, newUser, FIXTURE, type TestUser } from './helpers';
import { loadPack } from '../src/career-data/pack-loader';
import { importPack } from '../src/career-data/pipeline';
import { validatePack, PackValidationError, type Pack } from '../src/career-data/pack-schema';
import { resolvePackConstraintsFor } from '../src/career-data/pack-constraints';
import { loadRoleRequirements } from '../src/career-data/career-data.service';
import { createClassificationSet, approveClassificationSet, classificationEntriesInEffect } from '../src/configuration/professional-classification';
import { cliCreateReadinessSet, cliActivate, assertReadinessSetConsistentWithClassification } from '../src/configuration/config-admin.service';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const ROOT = join(__dirname, '..', '..', '..', '..');
const TRACK = 'trk_frontend_junior';
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
const tx = async <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => {
  const c = await pool.connect();
  try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
};
const SUFFIX = Math.random().toString(36).slice(2, 8);

/* ── the synthetic v2 pack: the canonical pack, classified 6 / 3 / 3, with Task B's primaries on the debugging activity ── */
const JFE_CLASS: Record<string, 'must' | 'core' | 'supporting'> = {
  skl_html_semantic: 'must', skl_css_responsive: 'must', skl_js_fundamentals: 'must', skl_frontend_debugging: 'must', skl_code_reading: 'must', skl_version_control_basics: 'must',
  skl_ui_state_interaction: 'core', skl_api_data_states: 'core', skl_accessibility_basics: 'core',
  skl_forms_validation: 'supporting', skl_technical_explanation: 'supporting', skl_requirements_reading: 'supporting',
};
const PO_DEFAULTS = new Set(['skl_forms_validation', 'skl_requirements_reading']);
const TASK_B_PRIMARIES = ['skl_code_reading', 'skl_frontend_debugging', 'skl_js_fundamentals'];
const fresh = () => loadPack(join(ROOT, 'data', 'career'), TRACK);
/** Task B shape on act_fe_debug_improve: three Must primaries; Version Control measured through a linked criterion (the canonical activities have no Git evidence path). */
function withTaskB(p: Pack): Pack {
  const a = p.track.activities.find((x) => x.code === 'act_fe_debug_improve')!;
  a.related_skills = [...TASK_B_PRIMARIES.map((skill) => ({ skill, depth: 'primary' as const })),
    { skill: 'skl_css_responsive', depth: 'secondary' as const }, { skill: 'skl_html_semantic', depth: 'secondary' as const }, { skill: 'skl_version_control_basics', depth: 'secondary' as const }];
  const rub = p.track.rubrics.find((r) => r.activity === 'act_fe_debug_improve')!;
  const c0 = rub.criteria.find((c) => (c.criterion_kind ?? 'skill_evidence') === 'skill_evidence')!;
  rub.criteria.push({ ...c0, key: 'git_history_explains_fix', linked_skill: 'skl_version_control_basics' });
  return p;
}
function v2Pack(edit: (p: Pack) => void = () => undefined): Pack {
  const p = withTaskB(structuredClone(fresh().pack) as Pack);
  p.track.manifest.pack_format_version = 2;
  for (const rs of p.track.roleSkills) {
    delete (rs as Partial<typeof rs>).is_core_for_role;   // format 2 carries the class, never the legacy flag
    rs.professional_class = JFE_CLASS[rs.skill];
    rs.class_source = PO_DEFAULTS.has(rs.skill) ? 'po_default' : 'sme';
    rs.class_source_ref = PO_DEFAULTS.has(rs.skill) ? 'decision pack §B: SME silent; PO default' : 'SME-JFE-01';
  }
  edit(p);
  return p;
}
const V2_CONSTRAINTS: [string, number | null, number | null][] = [
  ['must_skill_count', 6, 6], ['core_class_skill_count', 3, 3], ['supporting_skill_count', 3, 3], ['task_count', 10, 12], ['activity_count', 3, 3],
  ['activity_primary_skill_count', 2, 3], ['activity_required_primary_skill_count', 2, 3], ['rubric_min_criteria', 5, null], ['resources_per_skill_max', null, 3],
];

/* ── history fingerprint: nothing here may move ── */
const history = async () => one(`select
    (select md5(coalesce(string_agg(id::text || is_core::text, ',' order by id), '')) from role_requirement) as is_core,
    (select md5(coalesce(string_agg(id::text || state::text || coalesce(updated_at::text, ''), ',' order by id), '')) from skill_claim) as claims,
    (select count(*) from verification_decision)::int as decisions,
    (select count(*) from readiness_evaluation)::int as readiness_evaluations`);

let classificationId = ''; let v2SetId = '';
const SKILL_MUST = 'a0000000-0000-4000-8000-000000000003';   // component-building — legacy is_core = false
const SKILL_CORE = FIXTURE.skillUiTesting;                     // ui-testing — legacy is_core = true
let SKILL_SUPPORTING = '';                                     // skl_ui_state_interaction — PO default
let before0: Record<string, unknown>;

before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  SKILL_SUPPORTING = (await one(`select id from skill where slug = 'skl_ui_state_interaction'`)).id;
  before0 = await history();
});
after(async () => {
  // Leave nothing in effect for the suites that follow (history is never deleted: deactivation only).
  if (classificationId) await pool.query(`update skill_classification_set set activation = 'inactive' where id = $1`, [classificationId]);
  if (v2SetId) await tx(async (c) => { await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'dm7b cleanup', true)"); await c.query(`update pack_constraint_set set activation = 'inactive' where id = $1`, [v2SetId]); });
  await pool?.end(); await app?.close();
});
async function published<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    for (const st of ['curated', 'published']) {
      await c.query(`update target_role set review_status = $2 where id = $1`, [FIXTURE.roleId, st]);
      await c.query(`update role_requirement set review_status = $2 where target_role_id = $1`, [FIXTURE.roleId, st]);
    }
    return await fn(c);
  } finally { await c.query('rollback'); c.release(); }
}
async function learner(): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: FIXTURE.roleId, confirmed: true }).expect(200);
  return u;
}
async function person(roles: string[]): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  for (const r of roles) await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, $2, 'e2e operator')`, [u.id, r]);
  return u;
}

describe('v1 compatibility: legacy packs, baseline and readers are unchanged', () => {
  test('the canonical v1 pack resolves the frozen baseline and validates; no schema-2 set exists unless one is made', async () => {
    const r = await resolvePackConstraintsFor(pool, TRACK);
    assert.deepEqual([r.ref, r.resolution, r.schemaVersion ?? 1], ['legacy_pack_constraints@1', 'legacy_baseline', 1]);
    assert.doesNotThrow(() => validatePack(fresh().pack, r));
    const base = await one(`select id, schema_version from pack_constraint_set where key = 'legacy_pack_constraints' and version = 1`);
    assert.equal(base.schema_version, 1);
    assert.equal(Number((await one('select count(*)::int n from pack_constraint where set_id = $1', [base.id])).n), LEGACY_PACK_CONSTRAINTS.length);
    await assert.rejects(() => resolvePackConstraintsFor(pool, TRACK, 2), /no schema-2/);
  });
  test('Task B under v1 is refused by the legacy core-primary rule (one is_core primary), exactly as the analysis predicted', async () => {
    const r = await resolvePackConstraintsFor(pool, TRACK);
    const p = withTaskB(structuredClone(fresh().pack) as Pack);
    assert.throws(() => validatePack(p, r), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /act_fe_debug_improve.*CORE skills deeply, found 1/.test(x)));
  });
  test('a v1 pack may not carry professional classes; a v2 pack is never validated against the legacy set', async () => {
    const r = await resolvePackConstraintsFor(pool, TRACK);
    const mixed = structuredClone(fresh().pack) as Pack; mixed.track.roleSkills[0]!.professional_class = 'must';
    assert.throws(() => validatePack(mixed, r), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /a format-1 pack carries no professional class/.test(x)));
    assert.throws(() => validatePack(v2Pack(), r), /needs a schema-2 pack constraint set/);
    const { files } = fresh();
    await assert.rejects(() => importPack(pool, v2Pack(), files, { dryRun: true }), /no schema-2/);
  });
  test('with no classification in effect every reader is legacy: is_core decides badges and agent gaps', async () => {
    const view = (await http.get(`/v1/config/tracks/${FIXTURE.roleId}`).set(auth(await learner())).expect(200)).body.data;
    assert.deepEqual(view.classification, { inEffect: false, developmentOnly: false });
    assert.ok(view.trackSkills.every((s: { professionalClass: unknown; badge: string }) => s.professionalClass === null && s.badge !== 'must'));
    const req = await published((c) => loadRoleRequirements(c, FIXTURE.roleId));
    assert.equal(req.status, 'published'); assert.ok(req.requirements.length >= 3);
    for (const r of req.requirements) assert.deepEqual([r.requiredForRole, r.professionalClass], [r.isCore, null], r.labelEn);
  });
});

describe('v2: class-based pack constraints under a separate, development-only schema-2 set', () => {
  test('a schema-2 track set coexists with the v1 baseline; the v2 pack with Task B validates; the v1 path is untouched', async () => {
    v2SetId = await tx(async (c) => {
      await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'dm7b v2 trial', true)");
      const id = (await c.query(`insert into pack_constraint_set (key, version, track_id, label_ar, label_en, description_en, created_by, schema_version) values ($1, 1, $2, 'قيود مصنَّفة', 'classified constraints', 'DM-7b e2e: schema 2', 'e2e', 2) returning id`,
        [`e2e_dm7b_v2_${SUFFIX}`, TRACK])).rows[0].id as string;
      for (const [t, min, max] of V2_CONSTRAINTS) await c.query('insert into pack_constraint_v2 (set_id, constraint_type, min_value, max_value) values ($1, $2, $3, $4)', [id, t, min, max]);
      return id;
    });
    await assert.rejects(() => pool.query(`insert into pack_constraint (set_id, constraint_type, min_value, max_value) values ($1, 'core_skill_count', 4, 5)`, [v2SetId]), /schema-2 constraints/,
      'a schema-2 set never takes the legacy is_core constraints');
    await tx(async (c) => {
      await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'dm7b v2 trial', true)");
      await c.query(`update pack_constraint_set set activation = 'development_only' where id = $1`, [v2SetId]);
    });
    const r2 = await resolvePackConstraintsFor(pool, TRACK, 2);
    assert.deepEqual([r2.ref, r2.schemaVersion, r2.resolution], [`e2e_dm7b_v2_${SUFFIX}@1`, 2, 'development_only']);
    assert.doesNotThrow(() => validatePack(v2Pack(), r2), 'Task B: three Must primaries are three required primaries');
    const r1 = await resolvePackConstraintsFor(pool, TRACK);
    assert.equal(r1.ref, 'legacy_pack_constraints@1', 'a schema-2 track set never displaces the v1 baseline');
    assert.doesNotThrow(() => validatePack(fresh().pack, r1));
    assert.throws(() => validatePack(fresh().pack, r2), /no pack constraint set was resolved/, 'a v1 pack never validates against schema 2');
  });
  test('the class numbers and required primaries are enforced; 6 / 3 / 3 is this set’s numbers, not a rule in code', async () => {
    const r2 = await resolvePackConstraintsFor(pool, TRACK, 2);
    const five = v2Pack((p) => { p.track.roleSkills.find((x) => x.skill === 'skl_version_control_basics')!.professional_class = 'core'; });
    assert.throws(() => validatePack(five, r2), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /Must skills must be exactly 6, found 5/.test(x)) && e.problems.some((x) => /Core skills must be exactly 3, found 4/.test(x)));
    const bent = v2Pack((p) => { p.track.activities.find((x) => x.code === 'act_fe_debug_improve')!.related_skills = [{ skill: 'skl_js_fundamentals', depth: 'primary' }, { skill: 'skl_forms_validation', depth: 'primary' }, { skill: 'skl_technical_explanation', depth: 'primary' }]; });
    assert.throws(() => validatePack(bent, r2), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /act_fe_debug_improve.*Must\/Core skills deeply, found 1/.test(x)));
    const unsourced = v2Pack((p) => { delete p.track.roleSkills[0]!.class_source; });
    assert.throws(() => validatePack(unsourced, r2), /class_source/);
    const legacyFlag = v2Pack((p) => { p.track.roleSkills[0]!.is_core_for_role = true; });
    assert.throws(() => validatePack(legacyFlag, r2), /is_core_for_role/);
  });
  test('a v2 pack validates as a dry run only; importing it is refused (no publication, no CHG-017 yet)', async () => {
    const { files } = fresh();
    const runs = Number((await one('select count(*)::int n from pack_validation_run')).n);
    const dry = await importPack(pool, v2Pack(), files, { dryRun: true });
    assert.equal(dry.constraints.ref, `e2e_dm7b_v2_${SUFFIX}@1`);
    await assert.rejects(() => importPack(pool, v2Pack(), files), /importing it is not enabled/);
    assert.equal(Number((await one(`select count(*)::int n from pack_validation_run where constraint_ref = $1 and passed`, [`e2e_dm7b_v2_${SUFFIX}@1`])).n), 0, 'nothing was imported under schema 2');
    assert.ok(Number((await one('select count(*)::int n from pack_validation_run')).n) >= runs);
  });
});

describe('the classification is governed, provenance-explicit and development-only', () => {
  test('draft → refused approvals (D-4 PO approval, four eyes) → named SME + PO → opt-in development activation', async () => {
    const entries = [
      { skillId: SKILL_MUST, cls: 'must' as const, source: 'sme' as const, sourceRef: 'SME-JFE-01 (e2e fixture)' },
      { skillId: SKILL_CORE, cls: 'core' as const, source: 'sme' as const, sourceRef: 'SME-JFE-01 (e2e fixture)' },
      { skillId: SKILL_SUPPORTING, cls: 'supporting' as const, source: 'po_default' as const, sourceRef: 'PO default: SME silent (e2e fixture)' },
    ];
    await assert.rejects(() => tx((c) => createClassificationSet(c, { key: `e2e_dm7b_${SUFFIX}_bad`, targetRoleId: FIXTURE.roleId, labelAr: 'x', labelEn: 'x', description: 'x', createdBy: 'e2e author',
      entries: [...entries, { skillId: (SKILL_MUST), cls: 'core', source: 'sme', sourceRef: 'dup' }] })), /more than once|duplicate|twice/i);
    const created = await tx((c) => createClassificationSet(c, { key: `e2e_dm7b_${SUFFIX}`, targetRoleId: FIXTURE.roleId, labelAr: 'تصنيف مهني', labelEn: 'professional classification', description: 'DM-7b e2e', createdBy: 'e2e author', entries }));
    classificationId = created.id;
    assert.equal(await tx((c) => classificationEntriesInEffect(c, FIXTURE.roleId)), null, 'a draft is never in effect');
    await assert.rejects(() => tx((c) => approveClassificationSet(c, { id: classificationId, smeApprovedBy: 'SME-JFE-01' })), /Product Owner/);
    await assert.rejects(() => tx((c) => approveClassificationSet(c, { id: classificationId, smeApprovedBy: 'e2e author', poApprovedBy: 'PO' })), /four|check/i);
    await tx((c) => approveClassificationSet(c, { id: classificationId, smeApprovedBy: 'SME-JFE-01', poApprovedBy: 'Product Owner (e2e)' }));
    await assert.rejects(() => pool.query(`update skill_classification_set set activation = 'development_only' where id = $1`, [classificationId]), /opt-in/);
    await assert.rejects(() => pool.query(`update skill_classification set class = 'core' where set_id = $1 and skill_id = $2`, [classificationId, SKILL_SUPPORTING]), /fixed/);
    await tx(async (c) => { await c.query("select set_config('naqla.classification_dev_activation', 'on', true)"); await c.query(`update skill_classification_set set activation = 'development_only' where id = $1`, [classificationId]); });
    const inEffect = await tx((c) => classificationEntriesInEffect(c, FIXTURE.roleId));
    assert.equal(inEffect?.size, 3);
    assert.deepEqual(before0.is_core, (await history()).is_core, 'D-2: role_requirement.is_core is never mirrored or changed');
  });
  test('learner views: Must / Core / Supporting badges; a PO default is labelled and never expert-approved', async () => {
    const u = await learner();
    const view = (await http.get(`/v1/config/tracks/${FIXTURE.roleId}`).set(auth(u)).expect(200)).body.data;
    assert.deepEqual(view.classification, { inEffect: true, developmentOnly: true });
    const ts = (id: string) => view.trackSkills.find((s: { skillId: string }) => s.skillId === id);
    assert.deepEqual([ts(SKILL_MUST).badge, ts(SKILL_MUST).isCore, ts(SKILL_MUST).expertApproved], ['must', false, true], 'Must although the legacy flag says not core');
    assert.deepEqual([ts(SKILL_CORE).badge, ts(SKILL_CORE).classSource], ['core', 'sme']);
    assert.deepEqual([ts(SKILL_SUPPORTING).badge, ts(SKILL_SUPPORTING).classSource, ts(SKILL_SUPPORTING).expertApproved], ['supporting', 'po_default', false]);
    const page = (await http.get('/v1/me/track-skills').set(auth(u)).expect(200)).body.data;
    const item = (id: string) => page.items.find((s: { skillId: string }) => s.skillId === id).readiness;
    assert.deepEqual([item(SKILL_MUST).badge, item(SKILL_MUST).professionalClass], ['must', 'must']);
    assert.deepEqual([item(SKILL_SUPPORTING).classSource, item(SKILL_SUPPORTING).expertApproved], ['po_default', false]);
  });
  test('agent context and quality rules: required = Must ∪ Core (version-aware); Supporting is never a gap', async () => {
    // The fixture role's requirements are draft; publish them inside a transaction that is rolled back (nothing persists).
    const req = await published((c) => loadRoleRequirements(c, FIXTURE.roleId));
    assert.equal(req.status, 'published');
    const r = (id: string) => req.requirements.find((x) => x.skillId === id)!;
    assert.deepEqual([r(SKILL_MUST).requiredForRole, r(SKILL_MUST).professionalClass, r(SKILL_MUST).isCore], [true, 'must', false]);
    assert.deepEqual([r(SKILL_CORE).requiredForRole, r(SKILL_CORE).professionalClass], [true, 'core']);
    assert.deepEqual([r(SKILL_SUPPORTING).requiredForRole, r(SKILL_SUPPORTING).professionalClass], [false, 'supporting']);
    const sqlClass = await one('select role_professional_class($1, $2) as cls', [FIXTURE.roleId, SKILL_MUST]);
    assert.equal(sqlClass.cls, 'must');
  });
  test('Track Builder shows the class read-only and refuses an is_core edit for a classified role', async () => {
    const admin = await person(['track_admin']);
    const t = (await http.get(`/v1/admin/tracks/${FIXTURE.roleId}`).set(auth(admin)).expect(200)).body.data;
    assert.equal(t.classification.inEffect, true);
    const s = t.skills.find((x: { skillId: string }) => x.skillId === SKILL_MUST);
    assert.deepEqual([s.professionalClass, s.classSource, s.values.is_core], ['must', 'sme', false]);
    const r = await http.post(`/v1/admin/tracks/${FIXTURE.roleId}/skill-changes`).set(auth(admin)).send({ roleRequirementId: s.roleRequirementId, proposed: { is_core: true }, reason: 'try' }).expect(400);
    assert.match(r.body.error.message, /change the classification version instead/);
  });
  test('production never sees a classification: legacy readers only', async () => {
    const prev = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try { assert.equal(await tx((c) => classificationEntriesInEffect(c, FIXTURE.roleId)), null); } finally { process.env['NODE_ENV'] = prev; }
    const c = await pool.connect();
    try {
      await c.query('begin'); await c.query("select set_config('naqla.production', 'on', true)");
      assert.equal((await c.query('select role_professional_class($1, $2) as cls', [FIXTURE.roleId, SKILL_MUST])).rows[0].cls, null);
      await assert.rejects(() => c.query(`update skill_classification_set set activation = 'inactive' where id = $1`, [classificationId]).then(() => c.query("select set_config('naqla.classification_dev_activation', 'on', true)"))
        .then(() => c.query(`update skill_classification_set set activation = 'development_only' where id = $1`, [classificationId])), /never be activated in production/);
    } finally { await c.query('rollback'); c.release(); }
  });
});

describe('readiness: the classification and the rule set must agree; classification alone grants nothing', () => {
  const ruleSet = (key: string, rules: Parameters<typeof cliCreateReadinessSet>[1]['rules']) =>
    cliCreateReadinessSet(pool, { key: `${key}_${SUFFIX}`, targetRoleId: FIXTURE.roleId, labelAr: 'قواعد', labelEn: 'rules', description: 'DM-7b e2e', createdBy: 'e2e', rules });
  test('an inconsistent set is refused at activation, naming every disagreement', async () => {
    const bad = await ruleSet('e2e_dm7b_bad', [
      { type: 'required_skill_at_level', params: { min_level: 'demonstrated' }, skillId: SKILL_MUST, labelAr: 'x', labelEn: 'Must only required' },
      { type: 'required_skill_at_level', params: { min_level: 'demonstrated' }, skillId: SKILL_SUPPORTING, labelAr: 'x', labelEn: 'Supporting as blocker' },
      { type: 'all_core_skills_at_level', params: { min_level: 'demonstrated' }, labelAr: 'x', labelEn: 'legacy aggregate' },
    ]);
    await assert.rejects(() => cliActivate(pool, { table: 'readiness_rule_set', id: bad.id, activation: 'development_only', actor: 'e2e', reason: 'try' }),
      (e: Error) => /Must skill .* no non_compensable_skill/.test(e.message) && /Core skill .* no required_skill_at_level/.test(e.message) && /Supporting skill .* a blocker/.test(e.message) && /legacy is_core/.test(e.message));
  });
  test('a consistent set may be activated for development; its report is never "evaluated" while unvalidated, and classification grants no level', async () => {
    const good = await ruleSet('e2e_dm7b_good', [
      { type: 'non_compensable_skill', params: { min_level: 'demonstrated' }, skillId: SKILL_MUST, labelAr: 'x', labelEn: 'Must non-compensable' },
      { type: 'required_skill_at_level', params: { min_level: 'demonstrated' }, skillId: SKILL_CORE, labelAr: 'x', labelEn: 'Core required' },
    ]);
    await tx((c) => assertReadinessSetConsistentWithClassification(c, good.id));
    await cliActivate(pool, { table: 'readiness_rule_set', id: good.id, activation: 'development_only', actor: 'e2e', reason: 'dm7b trial' });
    try {
      const u = await learner();
      const rep = (await http.get('/v1/me/readiness').set(auth(u)).expect(200)).body.data.report;
      assert.equal(rep.status, 'pending_validation');
      assert.deepEqual(rep.classificationProblems, []);
      assert.notEqual(rep.overall, 'ready', 'a Must class with no evidence is never ready');
      const claims = Number((await one('select count(*)::int n from skill_claim where user_id = $1', [u.id])).n);
      assert.equal(claims, 0, 'reading readiness under a classification creates no claim');
    } finally {
      await cliActivate(pool, { table: 'readiness_rule_set', id: good.id, activation: 'inactive', actor: 'e2e', reason: 'dm7b cleanup' });
    }
  });
});

describe('history is untouched', () => {
  test('is_core, claims, verification decisions and readiness evaluations are exactly as before this suite', async () => {
    const now = await history();
    assert.equal(now.is_core, before0.is_core);
    assert.equal(now.claims, before0.claims);
    assert.equal(now.decisions, before0.decisions);
    assert.equal(now.readiness_evaluations, before0.readiness_evaluations);
  });
});
