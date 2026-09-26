/**
 * Runner: the product's own orchestrator → gateway → validation, fed by data.
 *
 * Deterministic by construction: ids come from a counter, the clock is the
 * dataset's fixed clock, and the LOCAL TEST provider adds no fact. Running the
 * same dataset twice yields byte-identical results (tested).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMAIN_RULESET_VERSION, InvariantViolation, assertNoUnsupportedLanguage } from '@naqla/domain';
import { PROPOSAL_SCHEMA_VERSION, type AgentType, type InputReference, type WordingPayload } from '../contracts.js';
import type { AgentProvider, ProviderRequest, ProviderResponse } from '../provider.js';
import { LocalTestProvider, LOCAL_TEST_PROVIDER_VERSION } from '../local-test-provider.js';
import { AgentGateway } from '../gateway.js';
import { route } from '../orchestrator.js';
import { validateAgainstDomain, ProposalRejected, type DomainFacts } from '../validation.js';
import { scoreScenario, type Observation } from './score.js';
import type { Dataset, Scenario, ScenarioResult, HarnessRun } from './types.js';

export const DEFAULT_DATASET_PATH = join(__dirname, '..', '..', 'eval', 'dataset.json');

export function loadDataset(path: string = DEFAULT_DATASET_PATH): Dataset {
  const d = JSON.parse(readFileSync(path, 'utf8')) as Dataset;
  const ids = new Set<string>();
  for (const s of d.scenarios) {
    if (ids.has(s.scenario_id)) throw new Error(`duplicate scenario id ${s.scenario_id}`);
    ids.add(s.scenario_id);
  }
  return d;
}

/** Records exactly which context keys the provider received. */
class SpyProvider implements AgentProvider {
  readonly name: string; readonly testOnly = true; sawKeys: string[] = []; model = 'n/a';
  constructor(private readonly inner: LocalTestProvider) { this.name = inner.name; }
  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    this.sawKeys = Object.keys(req.context).sort();
    const res = await this.inner.complete(req);
    this.model = res.model;
    return res;
  }
}

export function scenarioFacts(s: Scenario, d: Dataset): DomainFacts {
  return {
    skillStates: { ...s.domain_facts.skillStates },
    existingEvidence: new Set(s.domain_facts.existingEvidence),
    approvedTechnologies: new Set(s.domain_facts.approvedTechnologies),
    knownTechnologies: new Map(Object.entries(d.known_technologies)),
    numericFacts: new Set(s.domain_facts.numericFacts),
  };
}

const snapshot = (f: DomainFacts) => JSON.stringify({ s: f.skillStates, e: [...f.existingEvidence].sort(), t: [...f.approvedTechnologies].sort(), n: [...f.numericFacts].sort() });

export async function runScenario(s: Scenario, d: Dataset, ids: { n: number }): Promise<ScenarioResult> {
  const facts = scenarioFacts(s, d);
  const before = snapshot(facts);
  const decision = route({ type: s.trigger, userId: 'user-harness', facts: s.orchestration_facts });

  let observation: Observation;
  let providerModel = 'n/a';
  if (!decision) {
    observation = { routed: null, accepted: [], rejected: [], usageStatus: 'not_invoked', passedContext: [], redactedPaths: [], providerSawKeys: [], editStage: null, factsUnchanged: snapshot(facts) === before, facts };
  } else {
    const inner = s.provider.mode === 'scripted' ? new LocalTestProvider('scripted', { candidates: s.provider.candidates ?? [] }) : new LocalTestProvider('normal');
    const spy = new SpyProvider(inner);
    const gateway = new AgentGateway(spy, { maxCallsPerWindow: 1000, async callsUsed() { return 0; } },
      { newId: () => `h-${++ids.n}`, now: () => d.fixed_clock }, { production: false });
    const refs: InputReference[] = s.evidence_refs.map((id) => ({ kind: 'evidence', id }));
    const result = await gateway.invoke({ agentType: decision.agentType as AgentType, trigger: s.trigger, userId: 'user-harness',
      targetRoleId: s.target_role, fullContext: s.input_facts, inputReferences: refs, domainFacts: facts });
    providerModel = spy.model;

    // Approval-time edit: validated exactly as AgentService.approve does it.
    let editStage: Observation['editStage'] = null;
    const edited = s.user_provided_claims.edited_wording;
    const firstWording = result.proposals.find((p) => p.structuredPayload.kind === 'wording');
    if (edited && firstWording) {
      const payload = firstWording.structuredPayload as WordingPayload;
      try {
        validateAgainstDomain({ proposalType: firstWording.proposalType, structuredPayload: { ...payload, suggestedValueAr: edited }, evidenceRefs: firstWording.evidenceRefs }, facts);
        assertNoUnsupportedLanguage(edited, '');
        editStage = { edited, verdict: 'accepted', reason: 'domain validation passed' };
      } catch (e) {
        if (e instanceof ProposalRejected || e instanceof InvariantViolation) editStage = { edited, verdict: 'rejected', reason: e.message };
        else throw e;
      }
    }
    observation = { routed: { ruleId: decision.ruleId, agentType: decision.agentType as AgentType }, accepted: result.proposals, rejected: result.rejected,
      usageStatus: result.usage.status, passedContext: result.invocation.allowedContext, redactedPaths: result.redactedPaths,
      providerSawKeys: spy.sawKeys, editStage, factsUnchanged: snapshot(facts) === before, facts };
  }

  const { dimensions, falseAccepts, falseRejects } = scoreScenario(s, observation);
  return {
    scenario_id: s.scenario_id, title: s.title, agent: s.agent_under_test, mode: s.mode,
    routed: observation.routed,
    accepted: observation.accepted.map((p) => ({ proposalType: p.proposalType, requiresUserApproval: p.requiresUserApproval, evidenceRefs: p.evidenceRefs, warnings: p.warnings, summary: p.summary })),
    rejected: observation.rejected, usage_status: observation.usageStatus === 'not_invoked' ? 'not_invoked' : `${observation.usageStatus} (${providerModel})`,
    passed_context: observation.passedContext, redacted_paths: observation.redactedPaths, provider_saw_keys: observation.providerSawKeys,
    edit_stage: observation.editStage, dimensions, pass: dimensions.every((x) => x.verdict !== 'FAIL'), known_gap: s.known_gap ?? null,
    false_accepts: falseAccepts, false_rejects: falseRejects,
  };
}

export async function runHarness(d: Dataset = loadDataset()): Promise<HarnessRun> {
  const ids = { n: 0 };
  const results: ScenarioResult[] = [];
  for (const s of d.scenarios) results.push(await runScenario(s, d, ids));

  const dims: Record<string, { pass: number; fail: number; na: number }> = {};
  const codes: Record<string, number> = {};
  for (const r of results) {
    for (const x of r.dimensions) {
      dims[x.dimension] ??= { pass: 0, fail: 0, na: 0 };
      if (x.verdict === 'PASS') dims[x.dimension]!.pass++; else if (x.verdict === 'FAIL') dims[x.dimension]!.fail++; else dims[x.dimension]!.na++;
    }
    for (const rj of r.rejected) codes[rj.code] = (codes[rj.code] ?? 0) + 1;
  }
  const count = (f: (r: ScenarioResult) => boolean) => results.filter(f).length;
  return {
    metadata: { provider: 'local-test', provider_version: LOCAL_TEST_PROVIDER_VERSION, provider_model: `deterministic-template/${LOCAL_TEST_PROVIDER_VERSION}`,
      dataset_version: d.dataset_version, proposal_schema_version: PROPOSAL_SCHEMA_VERSION, domain_version: DOMAIN_RULESET_VERSION,
      fixed_clock: d.fixed_clock, deterministic: true },
    results,
    summary: {
      scenarios: results.length, recruitment: count((r) => r.agent === 'recruitment'), technical: count((r) => r.agent === 'technical'),
      mode_a: count((r) => r.mode === 'A'), mode_b: count((r) => r.mode === 'B'), mode_c: count((r) => r.mode === 'C'),
      passed: count((r) => r.pass), failed: count((r) => !r.pass),
      known_gap_failures: count((r) => !r.pass && r.known_gap !== null), unexpected_failures: count((r) => !r.pass && r.known_gap === null), dimensions: dims,
      false_accepts: results.reduce((n, r) => n + r.false_accepts.length, 0), false_rejects: results.reduce((n, r) => n + r.false_rejects.length, 0),
      rejections_by_code: codes,
    },
  };
}
