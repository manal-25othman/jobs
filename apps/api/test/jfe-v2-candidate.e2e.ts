/**
 * Junior Frontend v2 CANDIDATE (data/candidates/trk_frontend_junior_v2) — DRAFT, validation and dry run only.
 *
 *  - content: 6 Must · 3 Core · 3 Supporting with provenance; registry identities reused (no new skill, no copied registry)
 *  - three activities (F5); Task B valid only under the professional classification; every Must and Core skill has an
 *    explicit evidence path; Git is measured in one inspected project (F4) with no invented commit minimum
 *  - every SME value (weights, thresholds, level descriptors, durations, pass rule) is null + TBD, never a number
 *  - the real pipeline: dry run passes under a development schema-2 set; importing is refused; nothing is written
 *  - a development classification built from the candidate drives the learner labels (v2), then is switched off
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool, type PoolClient } from 'pg';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LEGACY_PACK_CONSTRAINTS } from '@naqla/domain';
import { bootApp, newUser, useCandidateClassification, type TestUser } from './helpers';
import { loadPack } from '../src/career-data/pack-loader';
import { importPack } from '../src/career-data/pipeline';
import { validatePack, PackValidationError, type Pack } from '../src/career-data/pack-schema';
import { loadCandidate, validateCandidate, type CandidateBundle } from '../src/career-data/candidate';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const ROOT = join(__dirname, '..', '..', '..', '..');
const DIR = join(ROOT, 'data', 'candidates', 'trk_frontend_junior_v2');
const CANON = join(ROOT, 'data', 'career');
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
const tx = async <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => {
  const c = await pool.connect();
  try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
};
const fresh = (): CandidateBundle => loadCandidate(DIR, CANON);
const mutated = (fn: (p: Pack, b: CandidateBundle) => void): CandidateBundle => { const b = fresh(); fn(b.pack, b); return b; };
const has = (b: CandidateBundle, re: RegExp) => validateCandidate(b).problems.some((x) => re.test(x));
const INT = 'act_fe_build_interface'; const TA = 'act_fe_debug_improve'; const TB = 'act_fe_change_request';

before(async () => { app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] }); });
after(async () => { await pool?.end(); await app?.close(); });

describe('the candidate content', () => {
  test('it validates under its schema-2 candidate constraints, stays DRAFT and is never importable', () => {
    const r = validateCandidate(fresh());
    assert.deepEqual(r.problems, []);
    assert.equal(r.format, 2); assert.equal(r.importable, false);
    const m = fresh().pack.track.manifest;
    assert.deepEqual([m.status, m.is_demo_fixture, m.pack_format_version], ['draft', false, 2]);
    assert.match(m.dataset_label, /NOT SME APPROVED/);
  });
  test('6 Must · 3 Core · 3 Supporting; the two PO defaults keep their provenance; Explanation is the SME-based Supporting', () => {
    const rs = fresh().pack.track.roleSkills;
    const by = (c: string) => rs.filter((x) => x.professional_class === c).map((x) => x.skill).sort();
    assert.deepEqual(by('must'), ['skl_code_reading', 'skl_css_responsive', 'skl_frontend_debugging', 'skl_html_semantic', 'skl_js_fundamentals', 'skl_version_control_basics']);
    assert.deepEqual(by('core'), ['skl_accessibility_basics', 'skl_api_data_states', 'skl_ui_state_interaction']);
    assert.deepEqual(by('supporting'), ['skl_forms_validation', 'skl_requirements_reading', 'skl_technical_explanation']);
    const src = (s: string) => rs.find((x) => x.skill === s)!;
    for (const s of ['skl_forms_validation', 'skl_requirements_reading']) { assert.equal(src(s).class_source, 'po_default'); assert.match(src(s).class_source_ref!, /Product Owner default/); }
    assert.equal(src('skl_technical_explanation').class_source, 'sme');
    assert.ok(rs.every((x) => !('is_core_for_role' in x)), 'one source of truth: no legacy is_core in a format-2 pack');
  });
  test('skill identities are the registry\'s: the candidate reuses the canonical global registry and adds no skill', async () => {
    assert.equal(existsSync(join(DIR, 'global')), false, 'no copied registry');
    const { pack } = fresh();
    const canonical = loadPack(CANON, 'trk_frontend_junior').pack;
    const registry = new Set(canonical.global.skills.map((s) => s.code));
    const named = new Set([...pack.track.roleSkills.map((x) => x.skill), ...pack.track.activities.flatMap((a) => a.related_skills.map((s) => s.skill)),
      ...pack.track.rubrics.flatMap((r) => r.criteria.map((c) => c.linked_skill).filter((x): x is string => !!x)), ...pack.track.tasks.flatMap((t) => t.related_skills.map((s) => s.skill))]);
    for (const s of named) assert.ok(registry.has(s), `${s} is a registry skill`);
    const inDb = Number((await one('select count(distinct slug)::int n from skill where slug = any($1)', [[...named]])).n);
    assert.equal(inDb, named.size, 'every skill already exists in the database: nothing new would be created');
    assert.deepEqual(pack.track.roleSkills.map((x) => x.skill).sort(), canonical.track.roleSkills.map((x) => x.skill).sort(), 'the same twelve skills as 0.2.1');
  });
  test('three activities (no fourth), each a new version of its 0.2.1 code; Task B measures three Must skills deeply', () => {
    const { pack } = fresh();
    assert.deepEqual(pack.track.activities.map((a) => `${a.code}@${a.version}`), [`${INT}@0.2.0`, `${TA}@0.2.0`, `${TB}@0.2.0`]);
    const prim = (code: string) => pack.track.activities.find((a) => a.code === code)!.related_skills.filter((s) => s.depth === 'primary').map((s) => s.skill).sort();
    assert.deepEqual(prim(TB), ['skl_code_reading', 'skl_frontend_debugging', 'skl_js_fundamentals']);
    assert.deepEqual(prim(INT), ['skl_api_data_states', 'skl_css_responsive', 'skl_frontend_debugging']);
    assert.deepEqual(prim(TA), ['skl_css_responsive', 'skl_html_semantic', 'skl_js_fundamentals']);
    // The same Task B under the legacy v1 rule is refused (1 is_core primary): it is valid only under the professional classification.
    const v1 = structuredClone(loadPack(CANON, 'trk_frontend_junior').pack) as Pack;
    v1.track.activities.find((a) => a.code === TB)!.related_skills = pack.track.activities.find((a) => a.code === TB)!.related_skills;
    assert.throws(() => validatePack(v1, { ref: 'legacy_pack_constraints@1', constraints: LEGACY_PACK_CONSTRAINTS }), (e: unknown) => e instanceof PackValidationError && e.problems.some((x) => /act_fe_change_request.*CORE skills deeply, found 1/.test(x)));
  });
  test('every Must and Core skill has an explicit evidence path; Supporting skills have none', () => {
    const b = fresh();
    const paths = new Map(b.paths.map((p) => [p.skill, p]));
    for (const rs of b.pack.track.roleSkills) {
      if (rs.professional_class === 'supporting') assert.equal(paths.has(rs.skill), false, rs.skill);
      else assert.equal(paths.get(rs.skill)?.params['min_distinct_tasks'], rs.minimum_evidence_count, rs.skill);
    }
    assert.equal(b.paths.filter((p) => p.class === 'must').length, 6);
  });
  test('Git: one inspected project (INT), branch + commits + pull request + explained changes, human-reviewed at a declared SHA, no invented commit minimum', () => {
    const { pack, paths } = fresh();
    const git = paths.find((p) => p.skill === 'skl_version_control_basics')!;
    assert.deepEqual(git.params['counted_criteria'], { [INT]: { versions: ['0.2.0'], criteria: ['git_workflow'] } });
    assert.equal(git.params['min_distinct_tasks'], 1); assert.equal(git.params['require_validation_activity'], false);
    const int = pack.track.activities.find((a) => a.code === INT)!;
    assert.ok(int.tasks.includes('tsk_fe_version_control_flow'));
    for (const k of ['link.pull_request', 'text.head_sha', 'answer.git_diff_explained']) assert.ok(int.deliverables.some((d) => d.key === k && d.mandatory), k);
    const c = pack.track.rubrics.find((r) => r.activity === INT)!.criteria.find((x) => x.key === 'git_workflow')!;
    assert.deepEqual([c.linked_skill, c.mandatory, c.evaluator_type, c.human_review_required], ['skl_version_control_basics', true, 'human', true]);
    const text = JSON.stringify([c, int.integrity_checks.filter((x) => x.linked_criterion_key === 'git_workflow')]);
    for (const k of ['G-1', 'G-2', 'G-3', 'G-4']) assert.ok(text.includes(k), k);
    assert.doesNotMatch(text, /(≥|>=|at least|minimum of)\s*\d+\s*(commits?|إيداع)/i, 'no commit-count minimum is applied');
    assert.ok((int.unresolved ?? []).some((u) => /S7/.test(u)), 'the commit minimum is listed as the SME value S7');
    assert.ok(int.integrity_checks.every((x) => x.evaluation_mode !== 'deterministic' || !/link\.|text\./.test(JSON.stringify(x.check_definition))), 'no deterministic check on a link or a declared SHA (no producer; never evidence alone)');
    assert.equal(pack.track.activities.filter((a) => a.related_skills.some((s) => s.skill === 'skl_version_control_basics')).length, 1, 'no second Git activity');
  });
  test('no SME value is invented: weights, thresholds, level descriptors, durations and pass rules are null + TBD', () => {
    const { pack } = fresh();
    for (const r of pack.track.rubrics) {
      assert.deepEqual([r.pass_threshold, r.pass_threshold_status], [null, 'TBD'], r.code);
      for (const c of r.criteria) {
        assert.deepEqual([c.weight, c.weight_status, c.levels_status], [null, 'TBD', 'TBD'], `${r.code}/${c.key}`);
        if ((c.criterion_kind ?? 'skill_evidence') === 'skill_evidence') assert.deepEqual([c.threshold_for_skill, c.threshold_status], [null, 'TBD'], `${r.code}/${c.key}`);
      }
    }
    assert.equal(pack.track.rubrics.find((r) => r.activity === INT)!.pass_rule?.status, 'TBD');
    for (const a of pack.track.activities) { assert.equal(a.estimated_minutes, null, a.code); assert.ok(a.unresolved!.some((u) => /S10/.test(u)) && a.unresolved!.some((u) => /S11/.test(u))); }
    assert.doesNotMatch(JSON.stringify(pack.track), /"(weight_status|threshold_status|pass_threshold_status|levels_status|mandatory_status)":"approved"/);
  });
  test('the validator catches what would make the candidate dishonest or incomplete', () => {
    assert.ok(has(mutated((p) => { const r = p.track.rubrics.find((x) => x.activity === INT)!; r.criteria = r.criteria.filter((c) => c.key !== 'git_workflow'); }), /skl_version_control_basics/), 'Git without its criterion');
    assert.ok(has(mutated((p) => { p.track.rubrics[0]!.criteria[0]!.weight = 1; }), /weight is null exactly when weight_status is TBD/), 'a TBD rendered as a number');
    assert.ok(has(mutated((p) => { p.track.rubrics[0]!.pass_threshold = 0.75; }), /pass_threshold is TBD, so it must be null/), 'a TBD pass threshold rendered as a number');
    assert.ok(has(mutated((p) => { p.track.activities[0]!.unresolved = []; }), /estimated_minutes is null but not listed as unresolved/), 'an unlisted unresolved duration');
    assert.ok(has(mutated((p) => { delete p.track.roleSkills.find((x) => x.skill === 'skl_forms_validation')!.class_source; }), /class_source/), 'provenance dropped');
    assert.ok(has(mutated((p) => { p.track.roleSkills.find((x) => x.skill === 'skl_requirements_reading')!.professional_class = 'core'; }), /Core skills must be exactly 3, found 4|Supporting skills must be exactly 3, found 2/), '6/3/3 enforced');
    assert.ok(has(mutated((p) => { p.track.activities.find((a) => a.code === TB)!.related_skills = [{ skill: 'skl_js_fundamentals', depth: 'primary' }, { skill: 'skl_technical_explanation', depth: 'primary' }, { skill: 'skl_forms_validation', depth: 'primary' }]; }), /act_fe_change_request.*Must\/Core skills deeply, found 1/), 'Task B bent to Supporting primaries');
    assert.ok(has(mutated((p) => { p.track.roleSkills.find((x) => x.skill === 'skl_version_control_basics')!.minimum_evidence_count = 2; }), /needs 2 distinct tasks but only 1 activity measures it/), 'a second Git activity would be required');
    assert.ok(has(mutated((_p, b) => { b.paths.find((x) => x.skill === 'skl_html_semantic')!.params['counted_criteria'] = { [INT]: { versions: ['0.2.0'], criteria: ['responsive_layout'] }, [TA]: { versions: ['0.2.0'], criteria: ['semantic_fixed'] } }; }), /does not measure skl_html_semantic/), 'a path counting another skill\'s criterion');
    assert.ok(has(mutated((_p, b) => { b.paths = b.paths.filter((x) => x.skill !== 'skl_code_reading'); }), /must skill 'skl_code_reading' has no explicit evidence path/), 'a Must skill without a path');
    assert.ok(has(mutated((_p, b) => { b.paths.push({ ...b.paths[0]!, path: 'P-X', skill: 'skl_forms_validation', class: 'must' }); }), /a Supporting skill never blocks|declared must/), 'a Supporting skill given a path');
    assert.ok(has(mutated((p) => { p.track.manifest.status = 'published'; }), /stays draft|draft or curated/), 'never anything but draft');
  });
});

describe('the real pipeline: dry run only', () => {
  test('under a development schema-2 set built from the candidate constraints the dry run passes; importing is refused; nothing is written', async () => {
    const b = fresh();
    const suffix = Math.random().toString(36).slice(2, 8);
    const state = async () => one(`select (select count(*) from activity_spec where version = '0.2.0' and slug in ($1, $2, $3))::int as acts,
      (select md5(string_agg(id::text || is_core::text || minimum_evidence_count::text, ',' order by id)) from role_requirement) as rr,
      (select count(*) from skill)::int as skills, (select count(*) from raw_snapshot)::int as snapshots`, [INT, TA, TB]);
    const before = await state();
    const setId = await tx(async (c) => {
      await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'JFE v2 candidate dry run', true)");
      const id = (await c.query(`insert into pack_constraint_set (key, version, track_id, label_ar, label_en, description_en, created_by, schema_version) values ($1, 1, 'trk_frontend_junior', 'قيود المرشّح', 'v2 candidate constraints', 'e2e: from pack_constraints_v2.candidate.json', 'e2e', 2) returning id`, [`e2e_jfe_v2_${suffix}`])).rows[0].id as string;
      for (const x of b.constraints.constraintsV2) await c.query('insert into pack_constraint_v2 (set_id, constraint_type, min_value, max_value) values ($1, $2, $3, $4)', [id, x.type, x.min, x.max]);
      await c.query(`update pack_constraint_set set activation = 'development_only' where id = $1`, [id]);
      return id;
    });
    try {
      const dry = await importPack(pool, b.pack, b.files, { dryRun: true });
      assert.equal(dry.constraints.ref, `e2e_jfe_v2_${suffix}@1`);
      assert.deepEqual([dry.written, dry.snapshots, dry.normalizedRecords], [{}, [], 0], 'validation only: nothing staged');
      await assert.rejects(() => importPack(pool, b.pack, b.files), /importing it is not enabled/);
    } finally {
      await tx(async (c) => { await c.query("select set_config('naqla.config_actor', 'e2e', true), set_config('naqla.config_reason', 'dry run done', true)"); await c.query(`update pack_constraint_set set activation = 'inactive' where id = $1`, [setId]); });
    }
    assert.deepEqual(await state(), before, 'no activity version, role requirement, skill or snapshot was written');
    assert.equal(Number((await one('select count(*)::int n from pack_validation_run where constraint_ref = $1 and passed', [`e2e_jfe_v2_${suffix}@1`])).n), 0, 'no v2 import is recorded as a passed import');
  });
});

describe('a development classification from the candidate drives the v2 learner labels', () => {
  test('each visible skill carries its candidate class; PO defaults are labelled and never expert-approved; off again afterwards', async () => {
    const roleId = (await one(`select id from target_role where slug = 'frontend-developer-junior' and is_demo_fixture`)).id as string;
    const cls = new Map(fresh().pack.track.roleSkills.map((r) => [r.skill, r]));
    const set = await useCandidateClassification(pool, roleId);
    try {
      const u: TestUser = await newUser();
      await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
      await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: roleId, confirmed: true }).expect(200);
      const items = (await http.get('/v1/me/track-skills').set(auth(u)).expect(200)).body.data.items as { skillId: string; readiness: { badge: string; professionalClass: string; classSource: string; expertApproved: boolean } }[];
      const slugs = new Map((await pool.query('select id::text, slug from skill where id = any($1)', [items.map((i) => i.skillId)])).rows.map((r) => [String(r.id), String(r.slug)]));
      assert.ok(items.length >= 11);
      for (const i of items) {
        const c = cls.get(slugs.get(i.skillId)!)!;
        assert.deepEqual([i.readiness.badge, i.readiness.professionalClass, i.readiness.classSource, i.readiness.expertApproved], [c.professional_class, c.professional_class, c.class_source, c.class_source === 'sme'], c.skill);
      }
      assert.equal(items.filter((i) => i.readiness.badge === 'must').length, 6, 'all six Must skills are shown as Must');
    } finally { await set.off(); }
    assert.equal(Number((await one(`select count(*)::int n from skill_classification_set where target_role_id = $1 and activation <> 'inactive'`, [roleId])).n), 0);
  });
});
