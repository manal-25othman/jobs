/**
 * ENG-1 P4 / EXT-2 — independent evidence in readiness, through the real API, as an INACTIVE DEVELOPMENT PATHWAY.
 *
 * Runs under a TEST-ONLY per_skill verification policy with corroborating evidence enabled (migration 0030 flag), made
 * development_only with the 0029 opt-in, and a TEST-ONLY readiness rule set with skill_evidence_path rules made
 * development_only with the 0030 opt-in. Both are restored/deactivated when the suite ends. Content: test clones of the
 * SME-value-approved, non-demo `act_fe_build_interface` with test variant families and task purposes (test data, not
 * professional values).
 *
 *   1  project + a genuinely independent short task ⇒ satisfied (the second task left CORROBORATING evidence, no level change)
 *   2  the project alone ⇒ not satisfied (no universal minimum; the path value decides)
 *   3  one-project exception (a one-task path, as P-GIT) ⇒ satisfied by one project
 *   4  different activity in the SAME variant family ⇒ one task; unknown family ⇒ indeterminate; repeated submissions collapse
 *   5  a reused learner artifact ⇒ one task
 *   6  withdrawn evidence ⇒ no longer counted; history unchanged
 *   7  mixed per-skill results from one activity ⇒ each skill's path from its own result
 *   8  demo / unpublished content and unapproved values never count; legacy results excluded unless the rule says adapter
 *   9  cross-tenant isolation; readiness stays pending (never `evaluated`) and is unconfigured in production; the sealed set
 *      can never be approved or production-activated
 *
 * Integrity safeguards (PO decision on corroborating evidence, migration 0031):
 *   S1 the corroborating row is role 'corroborating', never the claim's primary evidence, and the database refuses every
 *      attempt to make it carry a level, a claim, an asset or an agent proposal
 *   S2 repeating the same task / re-evaluating / same family / a reused artifact records NO additional evidence (with why)
 *   S3 corroborating evidence alone never grants a career claim (CLM-1 unchanged); EXT-2 alone may count it
 *   S4 the test policy itself can never be approved or production-activated
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool, type PoolClient } from 'pg';
import { bootApp, newUser, uploadFile, filesFor, useLegacyVerificationCompat, asAuthenticatedUser, expectRejected, type TestUser } from './helpers';
import { reviewTransition, approveRubricValues } from '../src/career-data/review';
import { promoteDemo } from '../src/career-data/promotion';
import { createReadinessRuleSet, approveConfigRow, setConfigActivation } from '../src/configuration/config-admin.service';
import { loadEvidenceTaskFacts } from '../src/readiness/evidence-facts';
import { loadClaimSubject } from '../src/agents/claim-drafts';
import { loadDomainFacts } from '../src/agents/domain-facts';
import { claimEligibility, TEXT_FINGERPRINT_VERSION, type ClaimPolicy } from '@naqla/domain';
import { textFingerprint } from '../src/readiness/text-fingerprints';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
const SME = '44444444-4444-4444-8444-444444444444';
const TAG = Math.random().toString(16).slice(2, 8);
const P4_POLICY = 'ENG-1 P4 TEST ONLY: per-skill development pathway with corroborating evidence; unapproved draft; never production.';
let canonicalId = ''; let roleId = ''; let ruleSetId = ''; let policyId = '';
const ACT: Record<'INT' | 'A' | 'SAMEFAM' | 'NOFAM' | 'CURATED' | 'EXT1', { id: string; slug: string; version: string; rubricVersion: string }> = {} as never;
const S: Record<'html' | 'ui' | 'api', string> = { html: '', ui: '', api: '' };
const SOLID: Record<string, string> = { semantic_structure: 'solid', form_validation: 'solid', data_states: 'solid', state_transitions: 'solid', responsive_layout: 'solid',
  explanation_clarity: 'solid', judgment_assumption_check: 'met' };

async function tx<T>(fn: (c: PoolClient) => Promise<T>, gucs: Record<string, string> = {}): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('naqla.config_actor', 'ENG-1 P4 e2e', true), set_config('naqla.config_reason', 'controlled development test of EXT-2', true)");
    for (const [k, v] of Object.entries(gucs)) await c.query('select set_config($1, $2, true)', [k, v]);
    const r = await fn(c); await c.query('commit'); return r;
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}
async function walk(kind: 'activity_spec' | 'rubric_version', id: string) {
  const st = async () => (await one(`select status::text as s from ${kind} where id = $1`, [id])).s as string;
  if ((await st()) === 'draft') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'curated', decidedBy: null, decidedByLabel: 'author', rolePerformed: 'content_author', reason: 'submitted', production: false });
  if ((await st()) === 'curated') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'sme_reviewed', decidedBy: SME, decidedByLabel: 'Named SME', rolePerformed: 'sme', reason: 'reviewed', production: false });
  if ((await st()) === 'sme_reviewed') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'approved', decidedBy: SME, decidedByLabel: 'Named SME', rolePerformed: 'sme', reason: 'approved', production: false });
  if ((await st()) === 'approved') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'published', decidedBy: null, decidedByLabel: 'Product Owner', rolePerformed: 'product_owner', reason: 'publish', production: false });
}
/** A TEST clone of the canonical activity (content, deliverables, skills, checks, rubric with criteria and levels) with its own family and purpose. */
async function cloneActivity(name: string, family: string | null, purpose: string | null, publish = true, bindRubric = false): Promise<{ id: string; slug: string; version: string; rubricVersion: string }> {
  const slug = `p4_${name}_${TAG}`;
  const id = await tx(async (c) => {
    const newId = (await c.query(`insert into activity_spec select (jsonb_populate_record(null::activity_spec, to_jsonb(a) || jsonb_build_object(
        'id', gen_random_uuid(), 'slug', $2::text, 'status', 'curated', 'published_at', null, 'reviewed_by', null, 'reviewed_at', null, 'sme_approved_by', null, 'sme_approved_at', null,
        'can_yield_verified', false, 'promoted_from_id', null, 'variant_family', $3::text, 'task_purpose', $4::text, 'is_validation_activity', coalesce($4::text = 'validation', false),
        'created_at', now(), 'updated_at', now()))).* from activity_spec a where a.id = $1 returning id`, [canonicalId, slug, family, purpose])).rows[0].id as string;
    for (const t of ['activity_input', 'activity_deliverable', 'activity_skill', 'activity_task', 'integrity_check_spec']) {
      await c.query(`insert into ${t} select (jsonb_populate_record(null::${t}, to_jsonb(x) || jsonb_build_object('id', gen_random_uuid(), 'activity_spec_id', $2::uuid))).* from ${t} x where x.activity_spec_id = $1`, [canonicalId, newId]);
    }
    const src = (await c.query(`select id from rubric_version where activity_spec_id = $1 and status = 'published' and not is_demo_fixture order by created_at desc limit 1`, [canonicalId])).rows[0].id;
    const rub = (await c.query(`insert into rubric_version select (jsonb_populate_record(null::rubric_version, to_jsonb(r) || jsonb_build_object(
        'id', gen_random_uuid(), 'activity_spec_id', $2::uuid, 'version', $3::text, 'status', 'curated', 'published_at', null, 'reviewed_by', null, 'reviewed_at', null,
        'values_approved_by', null, 'values_approved_by_label', null, 'values_approved_at', null, 'values_approval_reason', null, 'pass_threshold_status', 'proposed',
        'activity_spec_version', case when $4::boolean then (select version from activity_spec where id = $2::uuid) else null end, 'promoted_from_id', null, 'created_at', now()))).* from rubric_version r where r.id = $1 returning id`, [src, newId, `rub_${slug}@1`, bindRubric])).rows[0].id as string;
    for (const cr of (await c.query('select id, criterion_kind::text as kind from rubric_criterion where rubric_version_id = $1', [src])).rows) {
      const ncr = (await c.query(`insert into rubric_criterion select (jsonb_populate_record(null::rubric_criterion, to_jsonb(x) || jsonb_build_object('id', gen_random_uuid(), 'rubric_version_id', $2::uuid,
          'weight_status', 'proposed', 'threshold_status', case when $3::text = 'skill_evidence' then 'proposed' else null end, 'created_at', now()))).* from rubric_criterion x where x.id = $1 returning id`,
        [cr.id, rub, cr.kind])).rows[0].id;
      await c.query(`insert into rubric_criterion_level select (jsonb_populate_record(null::rubric_criterion_level, to_jsonb(l) || jsonb_build_object('id', gen_random_uuid(), 'criterion_id', $2::uuid))).* from rubric_criterion_level l where l.criterion_id = $1`, [cr.id, ncr]);
    }
    return { newId, rub };
  });
  await approveRubricValues(pool, { rubricVersionId: id.rub, decidedBy: SME, decidedByLabel: 'Named SME', reason: 'ENG-1 P4 test clone: test values (not professional values)' });
  if (publish) { await walk('activity_spec', id.newId); await walk('rubric_version', id.rub); }
  const v = await one('select version from activity_spec where id = $1', [id.newId]);
  return { id: id.newId, slug, version: v.version as string, rubricVersion: `rub_${slug}@1` };
}

before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  const demoAct = (await one(`select id, target_role_id from activity_spec where slug = 'act_fe_build_interface' and is_demo_fixture`));
  roleId = demoAct.target_role_id;
  const existing = await one(`select canonical_entity_id from content_promotion where entity_kind = 'activity_spec' and demo_entity_id = $1 order by created_at desc limit 1`, [demoAct.id]);
  canonicalId = existing?.canonical_entity_id ?? (await promoteDemo(pool, 'activity_spec', demoAct.id, 'content author', 'ENG-1 P4 fixture')).canonicalId;
  const rubricId = (await one(`select id from rubric_version where activity_spec_id = $1 and not is_demo_fixture order by created_at desc limit 1`, [canonicalId])).id;
  if (!(await one('select values_approved_at from rubric_version where id = $1', [rubricId])).values_approved_at) {
    await approveRubricValues(pool, { rubricVersionId: rubricId, decidedBy: SME, decidedByLabel: 'Named SME', reason: 'ENG-1 P4 fixture: test values' });
  }
  await walk('activity_spec', canonicalId); await walk('rubric_version', rubricId);
  const skillOf = async (key: string) => (await one(`select canonical_skill_id(linked_skill_id) as id from rubric_criterion where rubric_version_id = $1 and key = $2`, [rubricId, key])).id as string;
  S.html = await skillOf('semantic_structure'); S.ui = await skillOf('state_transitions'); S.api = await skillOf('data_states');
  ACT.INT = await cloneActivity('int', `fam_int_${TAG}`, 'integrated');
  ACT.A = await cloneActivity('a', `fam_a_${TAG}`, 'validation');
  ACT.SAMEFAM = await cloneActivity('samefam', `fam_int_${TAG}`, 'practice');
  ACT.NOFAM = await cloneActivity('nofam', null, null);
  ACT.CURATED = await cloneActivity('curated', `fam_c_${TAG}`, 'practice', false);
  ACT.EXT1 = await cloneActivity('ext1', `fam_x_${TAG}`, 'integrated', true, true);
  // TEST-ONLY verification policy: per-skill scope with corroborating evidence (0029 + 0030 opt-in).
  policyId = await tx(async (c) => {
    let id = (await c.query(`select id from verification_policy where key = 'default' and description_en = $1`, [P4_POLICY])).rows[0]?.id as string | undefined;
    if (!id) {
      const v = Math.max(985, Number((await c.query(`select max(version) + 1 as v from verification_policy where key = 'default'`)).rows[0].v));
      id = (await c.query(`insert into verification_policy (key, version, description_en, promotion_basis, practiced_on_submission, assessment_scope, record_corroborating_evidence)
        values ('default', $1, $2, 'independently_verified', false, 'per_skill', true) returning id`, [v, P4_POLICY])).rows[0].id as string;
    }
    await c.query(`update verification_policy set activation = 'inactive' where key = 'default' and activation <> 'inactive' and id <> $1`, [id]);
    await c.query(`update verification_policy set activation = 'development_only' where id = $1 and activation <> 'development_only'`, [id]);
    return id;
  }, { 'naqla.per_skill_dev_activation': 'on' });
  // TEST-ONLY readiness rule set (sealed type), development_only with the 0030 opt-in.
  const counted = (codes: string[], key: string) => Object.fromEntries(codes.map((c) => [c, { versions: '*', criteria: [key] }]));
  ruleSetId = await tx(async (c) => {
    await c.query(`update readiness_rule_set set activation = 'inactive' where target_role_id = $1 and activation <> 'inactive'`, [roleId]);
    const set = await createReadinessRuleSet(c, { key: `p4_ext2_${TAG}`, targetRoleId: roleId, labelAr: 'اختبار', labelEn: 'P4 EXT-2 test (development only)', description: 'ENG-1 P4 e2e: test path values, not SME values', createdBy: 'e2e',
      rules: [
        { type: 'skill_evidence_path', skillId: S.html, labelAr: 'HTML', labelEn: 'P-HTML (test)', params: { min_distinct_tasks: 2, counted_criteria: counted([ACT.INT.slug, ACT.A.slug, ACT.SAMEFAM.slug, ACT.NOFAM.slug, 'act_fe_build_interface'], 'semantic_structure'), require_validation_activity: true, understanding: 'none' } },
        { type: 'skill_evidence_path', skillId: S.api, labelAr: 'API', labelEn: 'one-project path (as P-GIT, test)', params: { min_distinct_tasks: 1, counted_criteria: counted([ACT.INT.slug], 'data_states'), require_validation_activity: false, understanding: 'within_criterion' } },
        { type: 'skill_evidence_path', skillId: S.ui, labelAr: 'UI', labelEn: 'one-project path for UI state (test)', params: { min_distinct_tasks: 1, counted_criteria: counted([ACT.INT.slug], 'state_transitions'), require_validation_activity: false, understanding: 'none' } },
        { type: 'skill_evidence_path', skillId: S.html, labelAr: 'HTML legacy', labelEn: 'legacy adapter path (test)', params: { min_distinct_tasks: 1, counted_criteria: counted([ACT.INT.slug], 'semantic_structure'), require_validation_activity: false, understanding: 'none', legacy_results: 'adapter' } },
      ] });
    await c.query(`update readiness_rule_set set activation = 'development_only' where id = $1`, [set.id]);
    return set.id;
  }, { 'naqla.readiness_ext_dev_activation': 'on' });
});
after(async () => {
  await tx(async (c) => { await c.query(`update readiness_rule_set set activation = 'inactive' where id = $1`, [ruleSetId]); }).catch(() => undefined);
  await useLegacyVerificationCompat();
  await pool?.end(); await app?.close();
});

async function graduate(): Promise<TestUser> {
  const u = await newUser(); await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  await http.put('/v1/me/career-goal').set(auth(u)).send({ targetRoleId: roleId, confirmed: true }).expect(200);
  return u;
}
/** Submits and has a named reviewer decide every human criterion. `seed` makes the uploaded files and texts unique to this task. */
async function reviewedTask(u: TestUser, act: string, skills: string[], seed: string, levels: Record<string, string> = {}, texts?: { flow: string; clarification: string }, review = true): Promise<{ sid: string; resultId: string }> {
  const pid = (await http.post('/v1/projects').set(auth(u)).send({ title: 'P4', kind: 'platform_activity', activitySpecId: act }).expect(201)).body.data.id;
  const bytes = (s: string) => new TextEncoder().encode(`${s} :: ${seed}`);
  const f1 = await uploadFile(app, http, u, 'index.html', bytes('<form><label for=n>Name</label><input id=n></form>'), 'text/plain');
  const f2 = await uploadFile(app, http, u, 'styles.css', bytes('form { display: grid; }'), 'text/plain');
  const f3 = await uploadFile(app, http, u, 'app.js', bytes('const state = { items: [] };'));
  const sid = (await http.post(`/v1/projects/${pid}/submissions`).set(auth(u)).send({ skillIds: skills, files: filesFor([f1, f2, f3], ['file.index_html', 'file.styles_css', 'file.app_js']),
    aiDisclosure: { declaredUse: [] }, artifacts: [
      { key: 'note.data_flow', kind: 'text', valueText: texts?.flow ?? `The form submits to a state object; the list is re-rendered from state; loading, error and empty are explicit. (${seed})`, locator: 'notes.md' },
      { key: 'answer.clarification', kind: 'text', valueText: texts?.clarification ?? `The brief says four fields and the spec lists five; I implemented four and flagged the fifth. (${seed})`, locator: 'notes.md' },
    ] }).expect(201)).body.data.id as string;
  const ev = (await http.post(`/v1/submissions/${sid}/evaluate`).set(auth(u)).expect(201)).body.data;
  if (ev.outcome === 'needs_human_review' && review) {
    const r = await newUser(); await http.post('/v1/me/bootstrap').set(auth(r)).send({}).expect(201);
    await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'human_reviewer', 'e2e operator')`, [r.id]);
    for (const it of (await pool.query(`select id, criterion_key from review_queue_item where evaluation_id = $1 order by criterion_key`, [ev.evaluationId])).rows) {
      await http.post(`/v1/review/queue/${it.id}/assign`).set(auth(r)).send({}).expect(201);
      await http.get(`/v1/review/items/${it.id}`).set(auth(r)).expect(200);
      await http.post(`/v1/review/items/${it.id}/decision`).set(auth(r)).send({ levelKey: levels[it.criterion_key] ?? SOLID[it.criterion_key], rationale: `Observed in the submitted files: ${it.criterion_key}.` }).expect(201);
    }
  }
  const fin = await one(`select r.id from evaluation_result r where r.evaluation_id = $1 and not exists (select 1 from evaluation_result n where n.supersedes_result_id = r.id)`, [ev.evaluationId]);
  return { sid, resultId: fin.id };
}
type Rule = { ruleId: string; labelEn: string; outcome: string; audit?: { independentTasks: number; counted: { evaluationResultId: string; activity: string }[]; excluded: { evaluationResultId: string; reason: string }[]; collapsed: unknown[]; reuseConflicts: { sharedBy: string }[]; developmentOnly: boolean; reasons: string[] } };
async function readiness(u: TestUser): Promise<{ status: string; overall: string | null; rules: Rule[] }> {
  return (await http.get('/v1/me/readiness').set(auth(u)).expect(200)).body.data.report;
}
const rule = (r: { rules: Rule[] }, label: string) => r.rules.find((x) => x.labelEn === label)!;
const decisionOf = async (resultId: string, skill: string) => (await one(`select d.decision, d.previous_state::text as prev, d.resulting_state::text as res, d.evidence_id from verification_decision d
  join skill_assessment sa on sa.id = d.skill_assessment_id where sa.evaluation_result_id = $1 and sa.skill_id = $2`, [resultId, skill]));
const reasonOf = async (resultId: string, skill: string) => (await one(`select d.reason from verification_decision d join skill_assessment sa on sa.id = d.skill_assessment_id
  where sa.evaluation_result_id = $1 and sa.skill_id = $2`, [resultId, skill])).reason as string;
const evidenceCount = async (u: TestUser, skill: string) => Number((await one('select count(*)::int as n from evidence where user_id = $1 and skill_id = $2', [u.id, skill])).n);
/** Runs a statement as postgres inside a rolled-back transaction and expects the database to refuse it (guards hold for every role). */
async function refused(sql: string, params: unknown[], pattern: RegExp, gucs: Record<string, string> = {}) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    for (const [k, v] of Object.entries(gucs)) await c.query('select set_config($1, $2, true)', [k, v]);
    await assert.rejects(() => c.query(sql, params), pattern, sql);
  } finally { await c.query('rollback'); c.release(); }
}

describe('ENG-1 P4 — independent evidence (EXT-2) in readiness, development pathway', () => {
  let shared: { u: TestUser; intResult: string; aResult: string } | null = null;

  test('1 · project + a genuinely independent short task ⇒ satisfied; the second task left CORROBORATING evidence and no level change', async () => {
    const u = await graduate();
    const int = await reviewedTask(u, ACT.INT.id, [S.html], 'int-1');
    const a = await reviewedTask(u, ACT.A.id, [S.html], 'a-1');
    assert.deepEqual([(await decisionOf(int.resultId, S.html)).decision, (await decisionOf(int.resultId, S.html)).res], ['accepted', 'demonstrated']);
    const corr = await decisionOf(a.resultId, S.html);
    assert.deepEqual([corr.decision, corr.prev, corr.res], ['evidence_corroborated', 'demonstrated', 'demonstrated']); assert.ok(corr.evidence_id);
    assert.equal(Number((await one(`select count(*)::int n from evidence_transition where user_id = $1`, [u.id])).n), 1, 'exactly one level change (the project)');
    const primary = (await decisionOf(int.resultId, S.html)).evidence_id;
    assert.deepEqual(await one('select e.evidence_role, sc.primary_evidence_id from evidence e join skill_claim sc on sc.user_id = e.user_id and sc.skill_id = e.skill_id where e.id = $1', [corr.evidence_id]),
      { evidence_role: 'corroborating', primary_evidence_id: primary }, 'the claim still rests on the project; the corroborating row is labelled as such');
    assert.equal((await one('select evidence_role from evidence where id = $1', [primary])).evidence_role, 'primary');
    assert.equal((await one('select state::text from skill_claim where user_id = $1 and skill_id = $2', [u.id, S.html])).state, 'demonstrated');
    const r = await readiness(u);
    const html = rule(r, 'P-HTML (test)');
    assert.equal(html.outcome, 'satisfied'); assert.equal(html.audit!.independentTasks, 2); assert.equal(html.audit!.developmentOnly, true);
    assert.deepEqual(html.audit!.counted.map((c) => c.evaluationResultId).sort(), [int.resultId, a.resultId].sort());
    assert.equal(r.status, 'pending_validation', 'a sealed rule set is never `evaluated`'); assert.equal(r.overall, null, 'no readiness verdict');
    assert.doesNotMatch(JSON.stringify(r), /[0-9a-f]{64}/, 'no checksum or hash leaves the server');
    shared = { u, intResult: int.resultId, aResult: a.resultId };
  });

  test('2 · the project alone does not satisfy a two-task path; 3 · a one-task path (the Git-style exception) is satisfied by the same single project', async () => {
    const u = await graduate();
    await reviewedTask(u, ACT.INT.id, [S.html, S.api], 'int-2');
    const r = await readiness(u);
    assert.equal(rule(r, 'P-HTML (test)').outcome, 'not_satisfied'); assert.match(rule(r, 'P-HTML (test)').audit!.reasons.join(' '), /1 independent task/);
    assert.equal(rule(r, 'one-project path (as P-GIT, test)').outcome, 'satisfied'); assert.equal(rule(r, 'one-project path (as P-GIT, test)').audit!.independentTasks, 1);
  });

  test('4 · S2 same variant family ⇒ one task and NO corroborating evidence; unknown family ⇒ indeterminate; repeating one activity adds no evidence', async () => {
    const same = await graduate();
    await reviewedTask(same, ACT.INT.id, [S.html], 'int-4a'); const sf = await reviewedTask(same, ACT.SAMEFAM.id, [S.html], 'same-4a');
    assert.equal((await decisionOf(sf.resultId, S.html)).evidence_id, null, 'same family: no corroborating evidence is written');
    assert.match(await reasonOf(sf.resultId, S.html), /not independent of earlier evidence of this skill \(same_variant_family\)/);
    assert.equal(await evidenceCount(same, S.html), 1);
    const r1 = rule(await readiness(same), 'P-HTML (test)');
    assert.equal(r1.audit!.independentTasks, 1); assert.equal(r1.outcome, 'not_satisfied');
    assert.ok(r1.audit!.excluded.some((x) => x.evaluationResultId === sf.resultId && x.reason === 'decision_not_positive'));
    const nofam = await graduate();
    await reviewedTask(nofam, ACT.INT.id, [S.html], 'int-4b'); await reviewedTask(nofam, ACT.NOFAM.id, [S.html], 'nofam-4b');
    assert.equal(rule(await readiness(nofam), 'P-HTML (test)').outcome, 'indeterminate', 'different activity ids alone never establish independence');
    const again = await graduate();
    await reviewedTask(again, ACT.INT.id, [S.html], 'int-4c'); const retry = await reviewedTask(again, ACT.INT.id, [S.html], 'int-4c-retry');
    assert.equal((await decisionOf(retry.resultId, S.html)).evidence_id, null, 'repeating the same assessment creates no additional evidence');
    assert.match(await reasonOf(retry.resultId, S.html), /\(same_activity\)/);
    assert.equal(await evidenceCount(again, S.html), 1);
    const r3 = rule(await readiness(again), 'P-HTML (test)');
    assert.equal(r3.audit!.independentTasks, 1); assert.equal(r3.outcome, 'not_satisfied');
  });

  test('5 · S2 a learner artifact reused across two otherwise independent tasks ⇒ no corroborating evidence, one task', async () => {
    const u = await graduate();
    await reviewedTask(u, ACT.INT.id, [S.html], 'same-seed'); const a = await reviewedTask(u, ACT.A.id, [S.html], 'same-seed');
    assert.equal((await decisionOf(a.resultId, S.html)).evidence_id, null);
    assert.match(await reasonOf(a.resultId, S.html), /\(reused_upload\)/);
    assert.equal(await evidenceCount(u, S.html), 1);
    const r = rule(await readiness(u), 'P-HTML (test)');
    assert.equal(r.audit!.independentTasks, 1); assert.equal(r.outcome, 'not_satisfied');
  });

  test('S1 · the database refuses to let corroborating evidence carry a level, a claim, an asset or a proposal — or be duplicated', async () => {
    const { u, intResult, aResult } = shared!;
    const corr = (await decisionOf(aResult, S.html)).evidence_id as string;
    await refused(`update evidence set evidence_role = 'primary' where id = $1`, [corr], /role is set at insert and immutable/);
    await refused(`update skill_claim set primary_evidence_id = $1 where user_id = $2 and skill_id = $3`, [corr, u.id, S.html], /never be a claim's primary evidence/);
    await refused(`insert into asset_evidence (asset_id, evidence_id) values (gen_random_uuid(), $1)`, [corr], /never backs a professional asset/);
    await refused(`insert into verification_decision select (jsonb_populate_record(null::verification_decision, to_jsonb(d) || jsonb_build_object('id', gen_random_uuid(), 'decision', 'accepted'))).*
      from verification_decision d where d.evidence_id = $1`, [corr], /cited only by an evidence_corroborated decision|per-skill|skill assessment/);
    await refused(`insert into evidence (user_id, skill_id, source_strength, evaluation_result_id, project_id, provenance_class, provenance_source, confidence, skill_assessment_id, evidence_role)
      select user_id, skill_id, source_strength, evaluation_result_id, project_id, provenance_class, provenance_source, confidence, skill_assessment_id, 'corroborating' from evidence where id = $1`,
      [corr], /duplicate earlier evidence|one_per_skill_assessment|one_platform_row/);
    assert.equal((await one('select evidence_corroboration_conflict($1, $2, $3) as k', [u.id, S.html, aResult])).k, 'same_assessment_event');
    assert.equal((await one('select evidence_corroboration_conflict($1, $2, $3) as k', [u.id, S.html, intResult])).k, 'same_assessment_event');
    const proposal = await one(`select * from agent_proposal limit 1`);
    if (proposal) {
      await refused(`insert into agent_proposal select (jsonb_populate_record(null::agent_proposal, to_jsonb(p) || jsonb_build_object('id', gen_random_uuid(), 'evidence_refs', jsonb_build_array($1::text)))).*
        from agent_proposal p where p.id = $2`, [corr, proposal.id], /never cited by an agent proposal/);
    }
  });

  test('6 · withdrawn evidence no longer counts; the decision and assessment history are unchanged', async () => {
    const { u, aResult } = shared!;
    const before = await decisionOf(aResult, S.html);
    await http.post(`/v1/evidence/${before.evidence_id}/withdraw`).set(auth(u)).send({ reason: 'لم يكن العمل عملي بالكامل' }).expect(201);
    const r = rule(await readiness(u), 'P-HTML (test)');
    assert.equal(r.outcome, 'not_satisfied'); assert.ok(r.audit!.excluded.some((x) => x.evaluationResultId === aResult && x.reason === 'withdrawn'));
    assert.deepEqual(await decisionOf(aResult, S.html), before, 'the decision is history');
    assert.equal((await one('select state::text from skill_claim where user_id = $1 and skill_id = $2', [u.id, S.html])).state, 'demonstrated', 'withdrawing corroborating evidence moves no level');
  });

  test('6b · S3 corroborating evidence alone never grants a career claim; EXT-2 still counts it; a resubmission after withdrawal is not independent', async () => {
    const u = await graduate();
    const int = await reviewedTask(u, ACT.INT.id, [S.html], 'int-6b'); const a = await reviewedTask(u, ACT.A.id, [S.html], 'a-6b');
    const corr = (await decisionOf(a.resultId, S.html)).evidence_id as string; const primary = (await decisionOf(int.resultId, S.html)).evidence_id as string;
    // Claim request form and draft request: corroborating evidence is not offered and cannot be cited.
    const form = (await http.get('/v1/me/claim-drafts/options').set(auth(u)).expect(200)).body.data;
    assert.ok(form.evidence.some((e: { id: string }) => e.id === primary), 'fixture: primary evidence is offered');
    assert.ok(!form.evidence.some((e: { id: string }) => e.id === corr), 'corroborating evidence is never offered as a claim source');
    const refusedDraft = await http.post('/v1/me/claim-drafts').set(auth(u)).send({ claimKind: 'cv_bullet', evidenceId: corr });
    assert.equal(refusedDraft.status, 400, JSON.stringify(refusedDraft.body)); assert.match(JSON.stringify(refusedDraft.body), /does not exist, is not yours, or was withdrawn/);
    // The primary evidence is withdrawn: only corroborating evidence of the skill stands.
    await http.post(`/v1/evidence/${primary}/withdraw`).set(auth(u)).send({ reason: 'المشروع الأول لم يكن عملي بالكامل' }).expect(201);
    const policy = { id: 'p', key: 'e2e', version: 1, reviewStatus: 'approved', activation: 'production_active', baselineOf: null, approvedBy: 'x', claimKind: 'cv_bullet', minEvidenceLevel: 'demonstrated',
      minEvidenceCount: 1, minSourceStrength: null, requiresVerificationDecision: true, requiresUserApproval: true, lockUntilGrounded: true } as unknown as ClaimPolicy;
    const c = await pool.connect();
    try {
      const facts = await loadDomainFacts(c, u.id);
      assert.equal(facts.existingEvidence.has(corr), false, 'not citable evidence for any proposal');
      const subject = await loadClaimSubject(c, u.id, 'cv_bullet', { namedSkillIds: [S.html], suggestedValueAr: '', suggestedValueEn: null }, [corr], facts);
      assert.equal(subject.citedEvidence[0]!.standing, false, 'corroborating evidence does not stand for a claim');
      assert.equal(subject.standingEvidenceCount[S.html] ?? 0, 0, 'and is not counted toward a claim');
      assert.equal(subject.skillsWithVerificationDecision.has(S.html), false, 'evidence_corroborated is not a positive decision (CLM-1 unchanged)');
      const v = claimEligibility('cv_bullet', { policy, resolution: 'production_active' }, subject);
      assert.equal(v.status, 'not_eligible');
    } finally { c.release(); }
    const r = rule(await readiness(u), 'P-HTML (test)');
    assert.ok(r.audit!.counted.some((x) => x.evaluationResultId === a.resultId), 'EXT-2 counts the standing corroborating evidence');
    assert.ok(r.audit!.excluded.some((x) => x.evaluationResultId === int.resultId && x.reason === 'withdrawn'));
    assert.equal((await one('select state::text from skill_claim where user_id = $1 and skill_id = $2', [u.id, S.html])).state, 'demonstrated', 'no level moved');
    // Withdraw the corroborating evidence too, then resubmit the same validation task: a withdrawal never makes a repeat independent.
    await http.post(`/v1/evidence/${corr}/withdraw`).set(auth(u)).send({ reason: 'سحب الدليل الداعم' }).expect(201);
    const before = await evidenceCount(u, S.html);
    const again = await reviewedTask(u, ACT.A.id, [S.html], 'a-6b-retry');
    const d = await decisionOf(again.resultId, S.html);
    assert.notEqual(d.decision, 'evidence_corroborated');
    assert.notEqual(d.decision, 'accepted', 'no promotion either: the level is unchanged');
    if (d.decision !== 'evidence_reestablished') assert.equal(await evidenceCount(u, S.html), before, 'no additional evidence from repeating a withdrawn task');
    assert.equal((await one('select count(*)::int as n from evidence where id in ($1, $2) and withdrawn_at is not null', [primary, corr])).n, 2, 'withdrawn rows are kept, not rewritten');
  });

  test('7 · mixed per-skill results from one activity: HTML counts, UI state (not met in the same evaluation) does not', async () => {
    const u = await graduate();
    const int = await reviewedTask(u, ACT.INT.id, [S.html, S.ui], 'int-7', { state_transitions: 'missing' });
    const r = await readiness(u);
    assert.equal(rule(r, 'one-project path for UI state (test)').outcome, 'not_satisfied');
    assert.ok(rule(r, 'one-project path for UI state (test)').audit!.excluded.some((x) => x.evaluationResultId === int.resultId && x.reason === 'not_met'));
    assert.ok(rule(r, 'P-HTML (test)').audit!.counted.some((x) => x.evaluationResultId === int.resultId), 'the same result counts for HTML');
  });

  test('8a · demo content never counts; unpublished content cannot even be named by a rule', async () => {
    const demoAct = (await one(`select id from activity_spec where slug = 'act_fe_build_interface' and is_demo_fixture`)).id;
    const demoRubric = await one(`select id, status from rubric_version where activity_spec_id = $1`, [demoAct]);
    if (demoRubric.status !== 'published') {
      await pool.query(`update rubric_version set status = 'curated' where id = $1 and status = 'draft'`, [demoRubric.id]); await pool.query(`update rubric_version set status = 'published' where id = $1`, [demoRubric.id]);
      await pool.query(`update activity_spec set status = 'curated' where id = $1 and status = 'draft'`, [demoAct]); await pool.query(`update activity_spec set status = 'published' where id = $1`, [demoAct]);
    }
    const u = await graduate();
    const demo = await reviewedTask(u, demoAct, [S.html], 'demo-8');
    const r = rule(await readiness(u), 'P-HTML (test)');
    assert.ok(r.audit!.excluded.some((x) => x.evaluationResultId === demo.resultId && x.reason === 'demo'), JSON.stringify(r.audit!.excluded));
    await assert.rejects(() => tx((c) => createReadinessRuleSet(c, { key: `p4_bad_${TAG}`, targetRoleId: roleId, labelAr: 'x', labelEn: 'x', description: 'x', createdBy: 'e2e',
      rules: [{ type: 'skill_evidence_path', skillId: S.html, labelAr: 'x', labelEn: 'x', params: { min_distinct_tasks: 1, counted_criteria: { [ACT.CURATED.slug]: { versions: '*', criteria: ['semantic_structure'] } }, require_validation_activity: false, understanding: 'none' } }] })),
      /no published, non-demo version/);
    await assert.rejects(() => tx((c) => createReadinessRuleSet(c, { key: `p4_bad2_${TAG}`, targetRoleId: roleId, labelAr: 'x', labelEn: 'x', description: 'x', createdBy: 'e2e',
      rules: [{ type: 'skill_evidence_path', skillId: S.html, labelAr: 'x', labelEn: 'x', params: { min_distinct_tasks: 1, counted_criteria: { [ACT.INT.slug]: { versions: '*', criteria: ['state_transitions'] } }, require_validation_activity: false, understanding: 'none' } }] })),
      /measures another skill/, 'a task can never count for HTML through another skill\'s criterion');
  });

  test('8b · legacy (pre-P3, primary-skill scope) results: excluded by default, counted only through the adapter rule when attributed', async () => {
    const u = await graduate();
    await useLegacyVerificationCompat();
    let legacy: { resultId: string };
    try { legacy = await reviewedTask(u, ACT.INT.id, [S.html], 'legacy-8b'); }
    finally { await tx(async (c) => {
      await c.query(`update verification_policy set activation = 'inactive' where key = 'default' and activation <> 'inactive' and id <> $1`, [policyId]);
      await c.query(`update verification_policy set activation = 'development_only' where id = $1`, [policyId]);
    }, { 'naqla.per_skill_dev_activation': 'on' }); }
    const d = await one(`select decision, skill_assessment_id from verification_decision where evaluation_result_id = $1 and canonical_skill_id(skill_id) = $2`, [legacy.resultId, S.html]);
    assert.equal(d.skill_assessment_id, null, 'fixture: a legacy decision'); assert.equal(d.decision, 'accepted');
    const r = await readiness(u);
    assert.ok(rule(r, 'P-HTML (test)').audit!.excluded.some((x) => x.evaluationResultId === legacy.resultId && x.reason === 'legacy_excluded'));
    const adapter = rule(r, 'legacy adapter path (test)');
    assert.equal(adapter.outcome, 'satisfied'); assert.ok(adapter.audit!.counted.some((x) => x.evaluationResultId === legacy.resultId));
  });

  test('9a · cross-tenant: another learner\'s facts never include these tasks; a client cannot read or write rule configuration', async () => {
    const { u } = shared!;
    const other = await graduate();
    const c = await pool.connect();
    try {
      const mine = await loadEvidenceTaskFacts(c, u.id, [S.html]); const theirs = await loadEvidenceTaskFacts(c, other.id, [S.html]);
      assert.ok(mine[S.html]!.length >= 2); assert.equal(theirs[S.html]!.length, 0);
    } finally { c.release(); }
    assert.equal(rule(await readiness(other), 'P-HTML (test)').audit!.counted.length, 0);
    await asAuthenticatedUser(pool, other.id, async (cc) => {
      await expectRejected(cc, `insert into readiness_rule (rule_set_id, rule_type, params, skill_id, label_ar, label_en) values ($1, 'skill_evidence_path', '{}', $2, 'x', 'x')`, [ruleSetId, S.html], /permission denied|row-level security/);
      await expectRejected(cc, `update activity_spec set variant_family = 'hijack' where id = $1`, [ACT.A.id], /permission denied|row-level security|fixed from SME review/);
      await expectRejected(cc, 'select 1 from activity_starter_checksum', [], /permission denied/);
    });
  });

  test('9b · readiness stays inactive for real users: never approved or production-activated; production sees it unconfigured; deactivated ⇒ unconfigured', async () => {
    const { u } = shared!;
    for (const attempt of [
      (c: PoolClient) => approveConfigRow(c, { table: 'readiness_rule_set', id: ruleSetId, approvedBy: SME, approvedByLabel: 'Named SME', reason: 'try' }),
      (c: PoolClient) => setConfigActivation(c, { table: 'readiness_rule_set', id: ruleSetId, activation: 'production_active', actor: 'e2e', reason: 'try' }),
    ]) {
      const c = await pool.connect();
      try { await c.query('begin'); await assert.rejects(() => attempt(c), /sealed|approved/); } finally { await c.query('rollback'); c.release(); }
    }
    const prev = process.env['NODE_ENV']; process.env['NODE_ENV'] = 'production';
    try {
      const r = await readiness(u);
      assert.equal(r.status, 'not_yet_configured', 'a development_only set never resolves in production'); assert.equal(r.rules.length, 0);
    } finally { process.env['NODE_ENV'] = prev; }
    await tx(async (c) => { await c.query(`update readiness_rule_set set activation = 'inactive' where id = $1`, [ruleSetId]); });
    try {
      assert.equal((await readiness(u)).status, 'not_yet_configured');
      await assert.rejects(() => tx(async (c) => { await c.query(`update readiness_rule_set set activation = 'development_only' where id = $1`, [ruleSetId]); }), /readiness_ext_dev_activation/);
    } finally {
      await tx(async (c) => { await c.query(`update readiness_rule_set set activation = 'development_only' where id = $1`, [ruleSetId]); }, { 'naqla.readiness_ext_dev_activation': 'on' });
    }
    // Recording a development snapshot keeps the audit (ids only) and changes no level.
    const levels = (await pool.query('select skill_id, state::text from skill_claim where user_id = $1 order by skill_id', [u.id])).rows;
    const rec = (await http.post('/v1/me/readiness/evaluations').set(auth(u)).send({}).expect(201)).body.data;
    assert.equal(rec.report.status, 'pending_validation');
    assert.deepEqual((await pool.query('select skill_id, state::text from skill_claim where user_id = $1 order by skill_id', [u.id])).rows, levels, 'readiness never changes a level');
  });

  test('S4 · the corroborating test policy can never be approved or production-activated; the writer never runs in production', async () => {
    for (const attempt of [
      (c: PoolClient) => approveConfigRow(c, { table: 'verification_policy', id: policyId, approvedBy: SME, approvedByLabel: 'Named SME', reason: 'try' }),
      (c: PoolClient) => setConfigActivation(c, { table: 'verification_policy', id: policyId, activation: 'production_active', actor: 'e2e', reason: 'try' }),
    ]) {
      const c = await pool.connect();
      try { await c.query('begin'); await assert.rejects(() => attempt(c)); } finally { await c.query('rollback'); c.release(); }
    }
    const audited = { 'naqla.config_actor': 'ENG-1 P4 e2e', 'naqla.config_reason': 'prove the policy seal', 'naqla.per_skill_dev_activation': 'on' };
    await refused(`update verification_policy set review_status = 'approved', approved_by = gen_random_uuid(), approved_at = now() where id = $1`, [policyId], /per_skill_development_only/, audited);
    await refused(`update verification_policy set activation = 'production_active' where id = $1`, [policyId], /per_skill|development|approved/, audited);
    const c = await pool.connect();
    try {
      await c.query('begin'); await c.query(`select set_config('naqla.production', 'on', true)`);
      await assert.rejects(() => c.query(`insert into evidence (user_id, skill_id, source_strength, provenance_class, provenance_source, evidence_role, skill_assessment_id)
        select user_id, skill_id, 'platform_controlled', 'system_derived', 'x', 'corroborating', id from skill_assessment limit 1`), /never written in production/);
    } finally { await c.query('rollback'); c.release(); }
    assert.equal(Number((await one(`select count(*)::int as n from verification_policy where record_corroborating_evidence and (review_status in ('approved','published') or activation in ('production_active','legacy_baseline'))`)).n), 0);
  });
});

/* ───────────── Task A (0032): one versioned text fingerprint; uncertain duplicates fail closed ───────────── */
describe('ENG-1 — versioned text fingerprints (naqla-text-fp-v1): consistent duplicate checks, Arabic and English', () => {
  const AR = 'يرسل النموذج البيانات إلى كائن الحالة ثم تُعرض القائمة من جديد، وحالات التحميل والخطأ والفراغ واضحة في 3 خطوات';
  // The same Arabic text with harakat, tatweel, an RLM mark, Arabic-Indic digits and no-break spaces (representation only).
  const AR_VARIANT = AR.replace('يرسل', 'يُرسِلُ').replace('النموذج', 'النمـــوذج').replace('3', String.fromCharCode(0x0663))
    .replace('الحالة ', 'الحالة' + String.fromCharCode(0x200F) + ' ').replace(/ من /g, String.fromCharCode(0x00A0) + 'من' + String.fromCharCode(0x00A0));
  const EN = 'The brief says four fields and the spec lists five; I implemented four and flagged the fifth to the team lead.';
  const EN_VARIANT = '  ' + EN.toUpperCase().replace(/ /g, String.fromCharCode(0x2009) + ' ') + '\n';
  const own = (seed: string) => ({ flow: `Own Arabic-free flow note written for this task only: ${seed} — state drives the list.`, clarification: `Own clarification for ${seed}: four fields were implemented as briefed.` });

  test('A1 · the database and EXT-2 use the same version; every stored fingerprint equals the one TypeScript definition', async () => {
    assert.equal((await one('select current_text_fingerprint_version() as v')).v, TEXT_FINGERPRINT_VERSION);
    assert.equal(Number((await one(`select count(*)::int as n from pg_proc where proname = 'evidence_normalized_text_hash'`)).n), 0, 'no second (SQL) normalizer');
    const stored = (await pool.query(`select sa.value_text, f.fingerprint, f.normalized_length from artifact_text_fingerprint f join submission_artifact sa on sa.id = f.submission_artifact_id
      where f.fingerprint_version = $1 limit 200`, [TEXT_FINGERPRINT_VERSION])).rows;
    assert.ok(stored.length > 0, 'fixture: earlier tests stored fingerprints');
    for (const r of stored) { const f = textFingerprint(String(r.value_text)); assert.equal(f.fingerprint, r.fingerprint); assert.equal(f.normalizedLength, r.normalized_length); }
  });

  test('A2 · Arabic: the same text with diacritics, tatweel, marks, digits and spaces is a reused artifact — no corroborating evidence', async () => {
    const u = await graduate();
    await reviewedTask(u, ACT.INT.id, [S.html], 'ar-int', {}, { flow: AR, clarification: own('ar-int').clarification });
    const a = await reviewedTask(u, ACT.A.id, [S.html], 'ar-a', {}, { flow: AR_VARIANT, clarification: own('ar-a').clarification });
    assert.equal((await decisionOf(a.resultId, S.html)).evidence_id, null);
    assert.match(await reasonOf(a.resultId, S.html), /\(reused_text\)/);
    const r = rule(await readiness(u), 'P-HTML (test)');
    assert.equal(r.audit!.independentTasks, 1); assert.ok(r.audit!.excluded.some((x) => x.evaluationResultId === a.resultId && x.reason === 'decision_not_positive'));
    // EXT-2's own comparison (the same stored fingerprints) also sees the two tasks share a text artifact.
    const c = await pool.connect();
    try {
      const facts = (await loadEvidenceTaskFacts(c, u.id, [S.html]))[S.html]!;
      const [x, y] = [facts.find((f) => f.activitySpecId === ACT.INT.id)!, facts.find((f) => f.activitySpecId === ACT.A.id)!];
      assert.ok(x.textHashes.some((h) => y.textHashes.includes(h)), 'EXT-2 and the database agree: reused text');
      assert.equal(x.artifactsVerifiable && y.artifactsVerifiable, true);
    } finally { c.release(); }
  });

  test('A3 · English: the same text in another case and spacing is reused; a genuinely different text (a paraphrase) is NOT accused', async () => {
    const u = await graduate();
    await reviewedTask(u, ACT.INT.id, [S.html], 'en-int', {}, { flow: own('en-int').flow, clarification: EN });
    const a = await reviewedTask(u, ACT.A.id, [S.html], 'en-a', {}, { flow: own('en-a').flow, clarification: EN_VARIANT });
    assert.match(await reasonOf(a.resultId, S.html), /\(reused_text\)/);
    const v = await graduate();
    await reviewedTask(v, ACT.INT.id, [S.html], 'en-int2', {}, { flow: own('en-int2').flow, clarification: EN });
    const b = await reviewedTask(v, ACT.A.id, [S.html], 'en-a2', {}, { flow: own('en-a2').flow, clarification: 'Four fields were requested and the specification listed five; I built the four and raised the fifth with the lead.' });
    assert.equal((await decisionOf(b.resultId, S.html)).decision, 'evidence_corroborated', 'no similarity judgment: different wording is a different text');
    assert.equal(rule(await readiness(v), 'P-HTML (test)').audit!.independentTasks, 2);
  });

  test('A4 · cross-tenant: another learner\'s identical text is never compared (no accusation across learners)', async () => {
    const first = await graduate();
    await reviewedTask(first, ACT.INT.id, [S.html], 'xt-1', {}, { flow: AR + ' (xt)', clarification: own('xt-1').clarification });
    const second = await graduate();
    await reviewedTask(second, ACT.INT.id, [S.html], 'xt-2', {}, { flow: own('xt-2').flow, clarification: own('xt-2').clarification });
    const b = await reviewedTask(second, ACT.A.id, [S.html], 'xt-3', {}, { flow: AR + ' (xt)', clarification: own('xt-3').clarification });
    assert.equal((await decisionOf(b.resultId, S.html)).decision, 'evidence_corroborated', 'the first learner\'s artifact is not this learner\'s earlier evidence');
    await asAuthenticatedUser(pool, second.id, async (cc) => { await expectRejected(cc, 'select 1 from artifact_text_fingerprint', [], /permission denied/); });
  });

  test('A5 · withdrawn evidence still blocks reuse: a withdrawal never makes a resubmitted artifact independent', async () => {
    const u = await graduate();
    await reviewedTask(u, ACT.INT.id, [S.html], 'wd-int', {}, own('wd-int'));
    const a = await reviewedTask(u, ACT.A.id, [S.html], 'wd-a', {}, { flow: AR + ' (wd)', clarification: own('wd-a').clarification });
    const corr = (await decisionOf(a.resultId, S.html)).evidence_id as string; assert.ok(corr);
    await http.post(`/v1/evidence/${corr}/withdraw`).set(auth(u)).send({ reason: 'سحب الدليل الداعم' }).expect(201);
    const again = await reviewedTask(u, ACT.NOFAM.id, [S.html], 'wd-nofam', {}, { flow: AR.replace('يرسل', 'يُرسِل') + ' (wd)', clarification: own('wd-n').clarification });
    assert.equal((await decisionOf(again.resultId, S.html)).evidence_id, null);
    assert.match(await reasonOf(again.resultId, S.html), /\(reused_text\)/);
  });

  test('A6 · uncertain duplicates fail closed: an artifact without a current-version fingerprint is a conflict, never "independent"', async () => {
    const u = await graduate();
    const int = await reviewedTask(u, ACT.INT.id, [S.html], 'fc-int', {}, own('fc-int'));
    // The accepted (first) task stores no fingerprint; for a skill with no earlier evidence the only thing left to compare is its text.
    assert.equal(Number((await one('select count(*)::int as n from artifact_text_fingerprint where submission_id = $1', [int.sid])).n), 0, 'fixture: not fingerprinted yet');
    assert.equal((await one('select evidence_corroboration_conflict($1, $2, $3) as k', [u.id, S.api, int.resultId])).k, 'text_fingerprint_missing');
    // A fingerprint of ANOTHER version does not count as the current one.
    const art = (await one(`select id from submission_artifact where submission_id = $1 and kind = 'text' limit 1`, [int.sid])).id;
    await pool.query(`insert into artifact_text_fingerprint (submission_artifact_id, fingerprint_version, user_id, submission_id, fingerprint, normalized_length, runtime_unicode)
      values ($1, 'naqla-text-fp-v0', $2, $3, $4, 60, 'test')`, [art, u.id, int.sid, 'a'.repeat(64)]);
    assert.equal((await one('select evidence_corroboration_conflict($1, $2, $3) as k', [u.id, S.api, int.resultId])).k, 'text_fingerprint_missing');
  });
});

/* ───────────── Task C: EXT-1 integrated_assessment_passed (inactive, development-only, sealed) ───────────── */
describe('EXT-1 — integrated_assessment_passed in readiness, development pathway', () => {
  let ext1Set = '';
  type IRule = { labelEn: string; outcome: string; skillIds: string[]; integratedAudit?: { completion: { submitted: number; finalResults: number; passed: boolean }; counted: { evaluationResultId: string; perSkill: { skillId: string; outcome: string; decision: string | null }[] } | null;
    excluded: { evaluationResultId: string; reason: string }[]; judged: { evaluationResultId: string; verdict: string; reasons: string[] }[]; reasons: string[] } };
  const ext1 = async (u: TestUser, label = 'EXT-1 PR-2 (test)') => ((await readiness(u)).rules as unknown as IRule[]).find((r) => r.labelEn === label)!;
  const pin = () => ({ activity_code: ACT.EXT1.slug, allowed: [{ activity_version: ACT.EXT1.version, rubric_version: ACT.EXT1.rubricVersion }], require_concluded_review: true });
  const create = (rules: { type: string; params: Record<string, unknown>; skillId?: string | null; labelAr: string; labelEn: string }[], key: string) =>
    tx((c) => createReadinessRuleSet(c, { key, targetRoleId: roleId, labelAr: 'اختبار', labelEn: 'EXT-1 test (development only)', description: 'EXT-1 e2e: test pins, not SME values', createdBy: 'e2e', rules }));

  before(async () => {
    ext1Set = (await create([
      { type: 'integrated_assessment_passed', params: { ...pin(), pass_rule: 'PR-2' }, labelAr: 'تكاملي', labelEn: 'EXT-1 PR-2 (test)' },
      { type: 'integrated_assessment_passed', params: { ...pin(), pass_rule: 'PR-1' }, labelAr: 'تكاملي', labelEn: 'EXT-1 PR-1 (test)' },
    ], `p4_ext1_${TAG}`)).id;
    await tx(async (c) => {
      await c.query(`update readiness_rule_set set activation = 'inactive' where target_role_id = $1 and activation <> 'inactive'`, [roleId]);
      await c.query(`update readiness_rule_set set activation = 'development_only' where id = $1`, [ext1Set]);
    }, { 'naqla.readiness_ext_dev_activation': 'on' });
  });
  after(async () => {
    await tx(async (c) => {
      await c.query(`update readiness_rule_set set activation = 'inactive' where id = $1`, [ext1Set]);
      await c.query(`update readiness_rule_set set activation = 'development_only' where id = $1`, [ruleSetId]);
    }, { 'naqla.readiness_ext_dev_activation': 'on' });
  });

  test('C1 · creation fails closed: wildcard, unpinned or unbound rubric, unpublished content, a skill, an unknown parameter or an invented threshold are refused', async () => {
    const bad: [Record<string, unknown>, RegExp, (string | null)?][] = [
      [{ ...pin(), allowed: [{ activity_version: '*', rubric_version: ACT.EXT1.rubricVersion }], pass_rule: 'PR-2' }, /explicit version/],
      [{ ...pin(), allowed: [{ activity_version: ACT.EXT1.version, rubric_version: 'rub_other@9' }], pass_rule: 'PR-2' }, /not a published, non-demo rubric/],
      [{ activity_code: 'act_fe_003', allowed: [{ activity_version: '0.2.0', rubric_version: 'rub_fe_003@0.2.0' }], pass_rule: 'PR-2', require_concluded_review: true }, /not a published, non-demo activity version/],
      [{ activity_code: ACT.CURATED.slug, allowed: [{ activity_version: ACT.CURATED.version, rubric_version: ACT.CURATED.rubricVersion }], pass_rule: 'PR-2', require_concluded_review: true }, /not a published, non-demo activity version/],
      [{ ...pin(), pass_rule: 'PR-2', min_total: 0.8 }, /unknown parameter/],
      [{ ...pin(), pass_rule: 'PR-2', require_concluded_review: false }, /require_concluded_review/],
      [{ ...pin(), pass_rule: 'PR-2' }, /never a skill|integrated_has_no_skill/, S.html],
    ];
    for (const [params, re, skill] of bad) {
      await assert.rejects(() => create([{ type: 'integrated_assessment_passed', params, skillId: skill ?? null, labelAr: 'x', labelEn: 'x' }], `p4_ext1_bad_${Math.random().toString(16).slice(2, 8)}`), re, JSON.stringify(params));
    }
  });

  test('C2 · not attempted ⇒ not satisfied (completion 0); readiness stays pending_validation with no verdict', async () => {
    const u = await graduate();
    const r = await ext1(u);
    assert.equal(r.outcome, 'not_satisfied'); assert.deepEqual(r.integratedAudit!.completion, { submitted: 0, finalResults: 0, passed: false });
    const rep = await readiness(u); assert.equal(rep.status, 'pending_validation'); assert.equal(rep.overall, null);
  });

  test('C3 · a concluded, eligible final result with standing evidence ⇒ satisfied under PR-2; per-skill results are listed, unmerged; PR-1 applies the APPROVED threshold to the same result', async () => {
    const u = await graduate();
    // Two non-mandatory criteria missed: every gate and mandatory criterion is met (PR-2 passes), the total 11/15 is below the approved 0.75 (PR-1 does not),
    // and the skill measured by responsive_layout is not met in the same result.
    const resp = (await one(`select canonical_skill_id(rc.linked_skill_id)::text as id from rubric_criterion rc join rubric_version rv on rv.id = rc.rubric_version_id
      where rv.activity_spec_id = $1 and rc.key = 'responsive_layout'`, [ACT.EXT1.id])).id as string;
    const before = (await pool.query('select skill_id, state::text from skill_claim where user_id = $1 order by 1', [u.id])).rows;
    const t = await reviewedTask(u, ACT.EXT1.id, [S.html, resp], 'ext1-c3', { responsive_layout: 'missing', explanation_clarity: 'missing' });
    const r = await ext1(u);
    assert.equal(r.outcome, 'satisfied', JSON.stringify(r.integratedAudit)); assert.equal(r.integratedAudit!.counted!.evaluationResultId, t.resultId);
    assert.deepEqual(r.integratedAudit!.completion, { submitted: 1, finalResults: 1, passed: true });
    const ps = r.integratedAudit!.counted!.perSkill;
    assert.equal(ps.find((x) => x.skillId === S.html)!.outcome, 'met'); assert.notEqual(ps.find((x) => x.skillId === resp)!.outcome, 'met', 'a skill not met in the same result: reported, not merged');
    assert.deepEqual(r.skillIds.sort(), [S.html, resp].sort());
    const pr1 = await ext1(u, 'EXT-1 PR-1 (test)');
    assert.equal(pr1.outcome, 'not_satisfied', JSON.stringify(pr1.integratedAudit)); assert.match(JSON.stringify(pr1.integratedAudit!.judged), /below the approved pass threshold/);
    const rec = (await http.post('/v1/me/readiness/evaluations').set(auth(u)).send({}).expect(201)).body.data;
    assert.equal(rec.report.status, 'pending_validation');
    const after = (await pool.query('select skill_id, state::text from skill_claim where user_id = $1 order by 1', [u.id])).rows;
    assert.ok(after.length >= before.length, 'levels come only from the per-skill writer');
    assert.deepEqual((await pool.query('select skill_id, state::text from skill_claim where user_id = $1 order by 1', [u.id])).rows, after, 'readiness moved no level');
    shared3 = { u, resultId: t.resultId };
  });
  let shared3: { u: TestUser; resultId: string } | null = null;

  test('C4 · a pending human review is never a pass (indeterminate); a failed mandatory criterion ⇒ not satisfied', async () => {
    const pending = await graduate();
    await reviewedTask(pending, ACT.EXT1.id, [S.html], 'ext1-c4a', {}, undefined, false);
    const p = await ext1(pending);
    assert.equal(p.outcome, 'indeterminate'); assert.ok(p.integratedAudit!.excluded.some((x) => x.reason === 'review_pending' || x.reason === 'not_final'));
    assert.equal(p.integratedAudit!.completion.passed, false); assert.equal(p.integratedAudit!.completion.submitted, 1, 'completed the activity, no assessment success yet');
    const failed = await graduate();
    await reviewedTask(failed, ACT.EXT1.id, [S.html, S.ui], 'ext1-c4b', { state_transitions: 'missing' });
    const f = await ext1(failed);
    assert.equal(f.outcome, 'not_satisfied', JSON.stringify(f.integratedAudit)); assert.match(JSON.stringify(f.integratedAudit!.judged), /not met: state_transitions/, 'one mandatory criterion decides');
  });

  test('C5 · withdrawn evidence voids the pass; the result and its decisions are unchanged history', async () => {
    const { u, resultId } = shared3!;
    const ev = (await pool.query(`select id from evidence where evaluation_result_id = $1 and withdrawn_at is null`, [resultId])).rows;
    assert.ok(ev.length >= 1);
    const decisions = (await pool.query('select id, decision from verification_decision where evaluation_result_id = $1 order by id', [resultId])).rows;
    await http.post(`/v1/evidence/${ev[0].id}/withdraw`).set(auth(u)).send({ reason: 'لم يكن العمل عملي بالكامل' }).expect(201);
    const r = await ext1(u);
    assert.equal(r.outcome, 'not_satisfied'); assert.ok(r.integratedAudit!.excluded.some((x) => x.evaluationResultId === resultId && x.reason === 'evidence_withdrawn'));
    assert.deepEqual((await pool.query('select id, decision from verification_decision where evaluation_result_id = $1 order by id', [resultId])).rows, decisions);
  });

  test('C6 · tenant isolation: another learner\'s results never appear; a client cannot read or write the rule', async () => {
    const other = await graduate();
    const r = await ext1(other);
    assert.equal(r.integratedAudit!.completion.submitted, 0); assert.equal(r.integratedAudit!.excluded.length + r.integratedAudit!.judged.length, 0);
    await asAuthenticatedUser(pool, other.id, async (cc) => {
      await expectRejected(cc, `insert into readiness_rule (rule_set_id, rule_type, params, skill_id, label_ar, label_en) values ($1, 'integrated_assessment_passed', '{}', null, 'x', 'x')`, [ext1Set], /permission denied|row-level security/);
    });
  });

  test('C7 · sealed: never approved, published or production-activated; development_only only with the opt-in; production sees it unconfigured', async () => {
    for (const attempt of [
      (c: PoolClient) => approveConfigRow(c, { table: 'readiness_rule_set', id: ext1Set, approvedBy: SME, approvedByLabel: 'Named SME', reason: 'try' }),
      (c: PoolClient) => setConfigActivation(c, { table: 'readiness_rule_set', id: ext1Set, activation: 'production_active', actor: 'e2e', reason: 'try' }),
    ]) {
      const c = await pool.connect();
      try { await c.query('begin'); await assert.rejects(() => attempt(c), /sealed|approved/); } finally { await c.query('rollback'); c.release(); }
    }
    const audited = { 'naqla.config_actor': 'e2e', 'naqla.config_reason': 'prove the EXT-1 seal' };
    await refused(`update readiness_rule_set set review_status = 'approved', approved_by = 'po', approved_at = now() where id = $1`, [ext1Set], /EXT-1 \(integrated_assessment_passed\) or EXT-2/, audited);
    await refused(`update readiness_rule set label_en = 'retyped' where rule_set_id = $1`, [ext1Set], /only to an inactive, unapproved/, audited);
    await tx(async (c) => { await c.query(`update readiness_rule_set set activation = 'inactive' where id = $1`, [ext1Set]); });
    try {
      await refused(`update readiness_rule_set set activation = 'development_only' where id = $1`, [ext1Set], /readiness_ext_dev_activation/, audited);
      await refused(`update readiness_rule_set set activation = 'development_only' where id = $1`, [ext1Set], /never be activated in production|production/,
        { ...audited, 'naqla.readiness_ext_dev_activation': 'on', 'naqla.production': 'on' });
    } finally {
      await tx(async (c) => { await c.query(`update readiness_rule_set set activation = 'development_only' where id = $1`, [ext1Set]); }, { 'naqla.readiness_ext_dev_activation': 'on' });
    }
    const prev = process.env['NODE_ENV']; process.env['NODE_ENV'] = 'production';
    try { assert.equal((await readiness(shared3!.u)).status, 'not_yet_configured'); } finally { process.env['NODE_ENV'] = prev; }
    assert.equal(Number((await one(`select count(*)::int as n from readiness_rule_set s where readiness_rule_set_has_sealed_rule(s.id) and (s.review_status in ('approved','published') or s.activation in ('production_active','legacy_baseline'))`)).n), 0);
  });
});

