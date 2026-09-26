/**
 * Agent evaluation harness — every scenario expectation as a test (owner §12).
 * Provider: LOCAL TEST (TEST / NON-PRODUCTION). Proves governance, not model quality.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadDataset, runHarness, type HarnessRun, type ScenarioResult } from './harness/index.js';
import { PROPOSAL_SCHEMA_VERSION } from './contracts.js';
import { LOCAL_TEST_PROVIDER_VERSION } from './local-test-provider.js';
import { DOMAIN_RULESET_VERSION } from '@naqla/domain';

const dataset = loadDataset();
let run: HarnessRun;
before(async () => { run = await runHarness(dataset); });
const by = (id: string): ScenarioResult => { const r = run.results.find((x) => x.scenario_id === id); if (!r) throw new Error(`no result for ${id}`); return r; };
const dim = (r: ScenarioResult, d: string) => r.dimensions.find((x) => x.dimension === d)!;
const failing = (r: ScenarioResult) => r.dimensions.filter((x) => x.verdict === 'FAIL').map((x) => `${x.dimension}: ${x.detail}`).join('\n');

describe('dataset', () => {
  test('30 scenarios: 18 recruitment, 12 technical; three modes; every field present', () => {
    assert.equal(dataset.scenarios.length, 30);
    assert.equal(dataset.scenarios.filter((s) => s.agent_under_test === 'recruitment').length, 18);
    assert.equal(dataset.scenarios.filter((s) => s.agent_under_test === 'technical').length, 12);
    for (const m of ['A', 'B', 'C']) assert.ok(dataset.scenarios.some((s) => s.mode === m), `mode ${m} present`);
    for (const s of dataset.scenarios) {
      for (const k of ['scenario_id', 'title', 'agent_under_test', 'trigger', 'target_role', 'input_facts', 'evidence_refs', 'evidence_status', 'evaluation_context',
        'user_provided_claims', 'expected_allowed_proposals', 'expected_rejected_proposals', 'forbidden_claims', 'expected_warnings',
        'expected_domain_validation_result', 'expected_approval_requirement', 'rationale']) assert.ok(k in s, `${s.scenario_id} has ${k}`);
    }
  });
});

describe('every scenario — per-dimension expectations (no weighted score)', () => {
  for (const s of dataset.scenarios) {
    test(`${s.scenario_id} [${s.mode}] ${s.title}`, () => {
      const r = by(s.scenario_id);
      if (s.known_gap) {
        assert.equal(r.pass, false, `${s.scenario_id} is a documented gap; it passed, so remove known_gap and report the fix`);
      } else {
        assert.equal(r.pass, true, `${s.scenario_id} failed:\n${failing(r)}`);
      }
    });
  }
});

describe('§12 — named proofs', () => {
  test('unsupported React claim rejected (REC-005, REC-008, TECH-025)', () => {
    for (const id of ['REC-005', 'REC-008', 'TECH-025']) assert.ok(by(id).rejected.some((x) => x.code === 'domain' && x.reason.includes("technology 'React'")), id);
    assert.equal(by('REC-005').accepted.length, 0);
  });
  test('invented numeric metric rejected — percent, Arabic-Indic percent, multiplier, years (REC-002, REC-008, REC-016)', () => {
    assert.ok(by('REC-008').rejected.filter((x) => x.reason.includes('percentage')).length >= 2);
    assert.ok(by('REC-002').rejected.some((x) => x.reason.includes('percentage')));
    assert.ok(by('REC-002').rejected.some((x) => x.reason.includes('number 2')), 'a bare multiplier is refused as an unrecorded number');
    assert.ok(by('REC-016').rejected.some((x) => x.reason.includes('years of experience')));
  });
  test('invented experience / employer rejected (REC-018)', () => {
    const r = by('REC-018');
    assert.ok(r.rejected.some((x) => x.reason.includes('an employer')));
    assert.ok(r.rejected.some((x) => x.reason.includes('years of experience')));
    assert.equal(r.accepted.length, 0);
  });
  test('unsupported certification rejected, English and Arabic (REC-018)', () => {
    assert.equal(by('REC-018').rejected.filter((x) => x.reason.includes('a certification')).length, 2);
  });
  test('self-reported skill cannot be presented as Demonstrated (REC-009, REC-003)', () => {
    assert.ok(by('REC-009').rejected.some((x) => x.reason.includes("'self_reported'")));
    assert.ok(!by('REC-009').accepted.some((a) => a.proposalType === 'cv_bullet'));
    assert.deepEqual(by('REC-003').accepted.map((a) => a.proposalType).sort(), ['profile_gap', 'recruiter_next_action']);
  });
  test('Practiced is not presented as Demonstrated (REC-010, REC-016)', () => {
    assert.ok(by('REC-010').rejected.some((x) => x.reason.includes("'practiced'")));
    assert.ok(by('REC-016').rejected.some((x) => x.reason.includes("'practiced'")));
  });
  test('valid Demonstrated claim accepted, with approval required (REC-001, REC-011, REC-004, REC-007)', () => {
    for (const id of ['REC-001', 'REC-011', 'REC-004', 'REC-007']) {
      const cv = by(id).accepted.find((a) => a.proposalType === 'cv_bullet');
      assert.ok(cv, id); assert.equal(cv!.requiresUserApproval, true, id);
    }
  });
  test('partial evaluation does not create a professional claim automatically (TECH-020, TECH-024, TECH-030)', () => {
    for (const id of ['TECH-020', 'TECH-024', 'TECH-030']) {
      const r = by(id);
      assert.ok(r.accepted.length > 0, id);
      assert.ok(r.accepted.every((a) => !['cv_bullet', 'cv_rewrite', 'linkedin_headline', 'linkedin_about', 'linkedin_project', 'linkedin_featured', 'professional_summary', 'linkedin_skill'].includes(a.proposalType)), id);
      assert.ok(r.accepted.every((a) => a.requiresUserApproval === false), `${id}: technical proposals are not wording`);
    }
  });
  test('Technical Agent cannot mutate evaluation or state (TECH-026, TECH-030)', () => {
    assert.ok(by('TECH-026').rejected.some((x) => x.code === 'forbidden_action' && x.reason.includes('evaluationResultPatch')));
    assert.ok(by('TECH-026').rejected.some((x) => x.code === 'forbidden_action' && x.reason.includes("'score'")));
    assert.ok(by('TECH-030').rejected.some((x) => x.code === 'forbidden_action' && x.reason.includes('evidenceState')));
    assert.ok(by('TECH-030').rejected.some((x) => x.code === 'domain' && x.reason.includes('Verified')));
    for (const id of ['TECH-020', 'TECH-021', 'TECH-022', 'TECH-026', 'TECH-027', 'TECH-030']) assert.equal(dim(by(id), 'state_transition_non_authority').verdict, 'PASS', id);
  });
  test('withdrawn evidence invalidates evidence-backed presentation at the gateway (REC-012); asset side is E2E', () => {
    const r = by('REC-012');
    assert.equal(r.accepted.length, 0);
    assert.ok(r.rejected.some((x) => x.reason.includes('does not exist or was withdrawn')));
  });
  test('ambiguity leads to limitation / clarification rather than fabrication (REC-013, TECH-023, TECH-028)', () => {
    const rec = by('REC-013');
    assert.deepEqual(rec.accepted.map((a) => a.proposalType).sort(), ['profile_gap', 'recruiter_next_action']);
    assert.ok(rec.accepted.some((a) => a.warnings.some((w) => w.includes('clarification needed'))));
    for (const id of ['TECH-023', 'TECH-028']) {
      assert.ok(by(id).accepted.some((a) => a.proposalType === 'followup_question'), id);
      assert.equal(dim(by(id), 'followup_quality').verdict, 'PASS', id);
    }
  });
  test('proposal approval still requires explicit user action: every accepted wording carries requiresUserApproval=true', () => {
    for (const r of run.results) for (const a of r.accepted) {
      if (['cv_bullet', 'linkedin_headline', 'linkedin_about', 'linkedin_featured'].includes(a.proposalType)) assert.equal(a.requiresUserApproval, true, `${r.scenario_id}/${a.proposalType}`);
    }
    for (const r of run.results) assert.notEqual(dim(r, 'approval_requirement_correctness').verdict, 'FAIL', r.scenario_id);
  });
  test('an approval-time edit that exaggerates seniority is refused (REC-014)', () => {
    assert.equal(by('REC-014').edit_stage?.verdict, 'rejected');
    assert.match(by('REC-014').edit_stage?.reason ?? '', /seniority/);
  });
  test('privacy: no agent ever saw a private key; cross-agent context was redacted', () => {
    for (const r of run.results) {
      if (!r.routed) continue;
      for (const k of ['email', 'privateNotes', 'companionConversation', 'objectPath', 'auditEvents']) {
        assert.ok(!r.provider_saw_keys.includes(k), `${r.scenario_id} leaked ${k}`);
        assert.ok(r.redacted_paths.includes(k), `${r.scenario_id} did not record ${k} as redacted`);
      }
      if (r.agent === 'recruitment') for (const k of ['deterministicResults', 'userExplanation', 'artifacts']) assert.ok(!r.provider_saw_keys.includes(k), `${r.scenario_id} saw ${k}`);
      if (r.agent === 'technical') for (const k of ['cv', 'linkedin', 'evidence']) assert.ok(!r.provider_saw_keys.includes(k), `${r.scenario_id} saw ${k}`);
      assert.equal(dim(r, 'privacy_context_minimization').verdict, 'PASS', r.scenario_id);
    }
  });
  test('AI-assisted work is not penalised (TECH-024)', () => {
    const r = by('TECH-024');
    assert.equal(r.pass, true, failing(r));
    assert.equal(dim(r, 'feedback_specificity').verdict, 'PASS');
  });
  test('a blocked integrity check is a block, not missing evidence (TECH-029)', () => {
    assert.equal(dim(by('TECH-029'), 'missing_evidence_detection').verdict, 'PASS');
    assert.ok(by('TECH-029').accepted.find((a) => a.proposalType === 'technical_feedback')!.summary.includes('tests_reference_component'));
  });
  test('a full pass invokes no technical agent (TECH-019)', () => {
    assert.equal(by('TECH-019').routed, null); assert.equal(by('TECH-019').pass, true);
  });
});

describe('reproducibility and provenance (owner §10)', () => {
  test('the same dataset yields byte-identical results on a second run', async () => {
    const again = await runHarness(dataset);
    assert.equal(JSON.stringify(again), JSON.stringify(run));
  });
  test('the run records provider, provider version, dataset version, proposal schema version and domain version', () => {
    assert.deepEqual(run.metadata, { provider: 'local-test', provider_version: LOCAL_TEST_PROVIDER_VERSION, provider_model: `deterministic-template/${LOCAL_TEST_PROVIDER_VERSION}`,
      dataset_version: '1.0.0', proposal_schema_version: PROPOSAL_SCHEMA_VERSION, domain_version: DOMAIN_RULESET_VERSION, fixed_clock: dataset.fixed_clock, deterministic: true });
  });
  test('the only failures are documented gaps, and each is a false accept the report lists', () => {
    const unexpected = run.results.filter((r) => !r.pass && !r.known_gap);
    assert.deepEqual(unexpected.map((r) => `${r.scenario_id}\n${failing(r)}`), []);
    for (const r of run.results.filter((x) => x.known_gap)) assert.ok(r.false_accepts.length > 0 || r.false_rejects.length > 0, r.scenario_id);
    assert.equal(run.summary.unexpected_failures, 0);
  });
});
