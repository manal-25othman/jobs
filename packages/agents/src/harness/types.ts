/**
 * Agent evaluation harness — scenario and result contracts.
 *
 * A scenario is data. The runner feeds it through the SAME orchestrator,
 * gateway, schema validation and domain validation the product uses, with
 * the LOCAL TEST provider (TEST / NON-PRODUCTION). Nothing here proves model
 * quality; it proves what the governance layer does with a given output.
 */
import type { AgentType, ProposalType, Trigger } from '../contracts.js';
import type { EvidenceState } from '@naqla/domain';

export type HarnessMode = 'A' | 'B' | 'C';

export interface ScenarioDomainFacts {
  readonly skillStates: Readonly<Record<string, EvidenceState>>;
  readonly existingEvidence: readonly string[];
  readonly approvedTechnologies: readonly string[];
  readonly numericFacts: readonly string[];
}

export interface Scenario {
  readonly scenario_id: string;
  readonly title: string;
  readonly agent_under_test: AgentType;
  /** A = expected safe · B = adversarial provider output · C = ambiguous input. */
  readonly mode: HarnessMode;
  readonly trigger: Trigger;
  readonly target_role: string;
  /** What the orchestrator sees (route()). */
  readonly orchestration_facts: Readonly<Record<string, unknown>>;
  /** The FULL context handed to the gateway, private keys included: redaction is under test. */
  readonly input_facts: Readonly<Record<string, unknown>>;
  readonly evidence_refs: readonly string[];
  readonly evidence_status: 'demonstrated' | 'practiced' | 'self_reported' | 'withdrawn' | 'none' | 'blocked';
  readonly evaluation_context: Readonly<Record<string, unknown>> | null;
  readonly user_provided_claims: {
    readonly declared_technologies?: readonly string[];
    readonly profile_claims?: readonly string[];
    readonly explanation?: string | null;
    /** An edit made at approval time; validated the way the API validates it. */
    readonly edited_wording?: string | null;
  };
  readonly domain_facts: ScenarioDomainFacts;
  readonly provider: { readonly mode: 'normal' | 'scripted'; readonly candidates?: readonly unknown[] };
  readonly expected_allowed_proposals: readonly ProposalType[];
  readonly expected_rejected_proposals: readonly { readonly type: string; readonly code: 'schema' | 'domain' | 'forbidden_action'; readonly reason_contains: string }[];
  readonly forbidden_claims: readonly string[];
  readonly expected_warnings: readonly string[];
  readonly expected_domain_validation_result: 'all_accepted' | 'all_rejected' | 'mixed' | 'not_invoked';
  readonly expected_approval_requirement: 'wording_requires_user' | 'none' | 'not_invoked';
  readonly expected_edit_result?: 'accepted' | 'rejected';
  /**
   * A documented, still-open gap: the scenario is EXPECTED to fail today and
   * the report lists it as a false accept/reject. The test suite asserts the
   * gap is still open, so closing it silently is impossible too.
   */
  readonly known_gap?: string;
  readonly rationale: string;
}

export interface Dataset {
  readonly dataset_version: string;
  readonly fixed_clock: string;
  readonly known_technologies: Readonly<Record<string, readonly string[]>>;
  readonly scenarios: readonly Scenario[];
}

export type Verdict = 'PASS' | 'FAIL' | 'N/A';
export interface DimensionResult { readonly dimension: string; readonly verdict: Verdict; readonly detail: string; }

export interface AcceptedSummary {
  readonly proposalType: ProposalType; readonly requiresUserApproval: boolean; readonly evidenceRefs: readonly string[];
  readonly warnings: readonly string[]; readonly summary: string;
}

export interface ScenarioResult {
  readonly scenario_id: string; readonly title: string; readonly agent: AgentType; readonly mode: HarnessMode;
  readonly routed: { readonly ruleId: string; readonly agentType: AgentType } | null;
  readonly accepted: readonly AcceptedSummary[];
  readonly rejected: readonly { readonly code: string; readonly reason: string }[];
  readonly usage_status: string;
  readonly passed_context: readonly string[];
  readonly redacted_paths: readonly string[];
  readonly provider_saw_keys: readonly string[];
  readonly edit_stage: { readonly edited: string; readonly verdict: 'accepted' | 'rejected'; readonly reason: string } | null;
  readonly dimensions: readonly DimensionResult[];
  readonly pass: boolean;
  readonly known_gap: string | null;
  readonly false_accepts: readonly string[];
  readonly false_rejects: readonly string[];
}

export interface HarnessRun {
  readonly metadata: {
    readonly provider: string; readonly provider_version: string; readonly provider_model: string;
    readonly dataset_version: string; readonly proposal_schema_version: string; readonly domain_version: string;
    readonly fixed_clock: string; readonly deterministic: true;
  };
  readonly results: readonly ScenarioResult[];
  readonly summary: {
    readonly scenarios: number; readonly recruitment: number; readonly technical: number;
    readonly mode_a: number; readonly mode_b: number; readonly mode_c: number;
    readonly passed: number; readonly failed: number; readonly known_gap_failures: number; readonly unexpected_failures: number;
    readonly dimensions: Readonly<Record<string, { readonly pass: number; readonly fail: number; readonly na: number }>>;
    readonly false_accepts: number; readonly false_rejects: number;
    readonly rejections_by_code: Readonly<Record<string, number>>;
  };
}
