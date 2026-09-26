/**
 * Agent contracts — framework-independent.
 *
 * The governing rule: agents READ → ANALYZE → PROPOSE → EXPLAIN. Nothing in
 * this package can write evidence, claims, evaluation history, assets or
 * publications. The only output type is a Proposal, and a Proposal is a
 * request the domain and the user decide on.
 */

/**
 * Version of the proposal envelope and payload contract. Bumped when a field,
 * payload kind or validation-relevant semantic changes. Recorded by the harness.
 */
export const PROPOSAL_SCHEMA_VERSION = '1.1.0';

/* ───────────────────────────── agent registry ──────────────────────────── */

export const AGENT_TYPES = ['recruitment', 'technical', 'learning', 'personal_branding', 'business'] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export interface AgentDefinition {
  readonly agentId: string;
  readonly agentType: AgentType;
  /** Only implemented agents may be invoked; the rest are extension contracts. */
  readonly implemented: boolean;
  /** Context field paths this agent may receive. Anything else is redacted. */
  readonly allowedContext: readonly string[];
  readonly proposalTypes: readonly ProposalType[];
}

/* ─────────────────────────── proposal taxonomy ─────────────────────────── */

export const RECRUITMENT_PROPOSAL_TYPES = [
  'cv_rewrite', 'cv_bullet', 'professional_summary', 'linkedin_headline', 'linkedin_about',
  'linkedin_skill', 'linkedin_project', 'linkedin_featured', 'profile_gap', 'recruiter_next_action',
] as const;

export const TECHNICAL_PROPOSAL_TYPES = [
  'technical_feedback', 'rubric_explanation', 'improvement_action', 'followup_question',
  'validation_activity', 'missing_evidence', 'technical_next_action',
] as const;

export const PROPOSAL_TYPES = [...RECRUITMENT_PROPOSAL_TYPES, ...TECHNICAL_PROPOSAL_TYPES] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

/** Proposals that change professional wording. These ALWAYS need the user. */
export const WORDING_PROPOSAL_TYPES: ReadonlySet<ProposalType> = new Set([
  'cv_rewrite', 'cv_bullet', 'professional_summary', 'linkedin_headline', 'linkedin_about',
  'linkedin_skill', 'linkedin_project', 'linkedin_featured',
]);

export const AGENTS: readonly AgentDefinition[] = [
  {
    agentId: 'A-RECRUIT', agentType: 'recruitment', implemented: true,
    allowedContext: [
      'targetRole', 'skills', 'evidence', 'evidenceStates', 'professionalAssets',
      'supportedClaims', 'unsupportedClaims', 'projects.title', 'projects.kind', 'cv', 'linkedin',
      'approvedTechnologies', 'ambiguity', 'skillId', 'skillState',
    ],
    proposalTypes: RECRUITMENT_PROPOSAL_TYPES,
  },
  {
    agentId: 'A-TECH', agentType: 'technical', implemented: true,
    allowedContext: [
      'targetRole', 'project', 'submission', 'rubric', 'rubricCriteria', 'artifacts',
      'deterministicResults', 'userExplanation', 'aiDisclosure', 'existingEvidence', 'ambiguity',
    ],
    proposalTypes: TECHNICAL_PROPOSAL_TYPES,
  },
  // Extension contracts only. The gateway refuses to invoke them.
  { agentId: 'A-LEARN', agentType: 'learning', implemented: false, allowedContext: [], proposalTypes: [] },
  { agentId: 'A-BRAND', agentType: 'personal_branding', implemented: false, allowedContext: [], proposalTypes: [] },
  { agentId: 'A-BIZ', agentType: 'business', implemented: false, allowedContext: [], proposalTypes: [] },
];

export function agentDefinition(type: AgentType): AgentDefinition {
  const d = AGENTS.find((a) => a.agentType === type);
  if (!d) throw new Error(`unknown agent type ${type}`);
  return d;
}

/* ───────────────────────────── invocation ──────────────────────────────── */

export const TRIGGERS = [
  'evidence.demonstrated', 'evaluation.completed', 'claim.unsupported_found',
  'criterion.failed', 'user.requested',
] as const;
export type Trigger = (typeof TRIGGERS)[number];

export interface InputReference {
  readonly kind: 'evidence' | 'evaluation_result' | 'submission' | 'project' | 'skill_claim'
                | 'professional_asset' | 'target_role' | 'rubric_version' | 'criterion';
  readonly id: string;
}

export interface AgentInvocation {
  readonly invocationId: string;
  readonly agentId: string;
  readonly agentType: AgentType;
  readonly trigger: Trigger;
  readonly userId: string;
  readonly targetRoleId: string | null;
  /** Exactly the context field paths that were passed. Recorded, not assumed. */
  readonly allowedContext: readonly string[];
  readonly requestedAction: string;
  readonly inputReferences: readonly InputReference[];
  readonly outputProposalTypes: readonly ProposalType[];
  readonly provenance: { readonly class: 'ai_generated'; readonly source: string };
  /** Null for the local test provider. Never fabricated. */
  readonly modelMetadata: { readonly provider: string; readonly model: string } | null;
  readonly createdAt: string;
}

/* ─────────────────────────── proposal envelope ─────────────────────────── */

export const PROPOSAL_LIFECYCLE = ['generated', 'validated', 'awaiting_user', 'approved', 'rejected', 'superseded'] as const;
export type ProposalLifecycle = (typeof PROPOSAL_LIFECYCLE)[number];

export type SubjectType = 'skill_claim' | 'evidence' | 'evaluation_result' | 'professional_asset' | 'career_goal' | 'submission';

export interface AgentProposal {
  readonly proposalId: string;
  readonly invocationId: string;
  readonly agentType: AgentType;
  readonly proposalType: ProposalType;
  readonly subjectType: SubjectType;
  readonly subjectId: string;
  readonly summary: string;
  readonly structuredPayload: ProposalPayload;
  readonly evidenceRefs: readonly string[];
  readonly sourceRefs: readonly InputReference[];
  readonly rationale: string;
  readonly warnings: readonly string[];
  readonly requiresUserApproval: boolean;
  readonly requiresDomainValidation: true;
  readonly createdAt: string;
}

/** Every payload is one of these. An arbitrary blob is not a proposal. */
export type ProposalPayload =
  | WordingPayload
  | GapPayload
  | ActionPayload
  | TechnicalFeedbackPayload
  | RubricExplanationPayload
  | FollowupQuestionPayload
  | ValidationActivityPayload
  | MissingEvidencePayload;

/** A professional-wording change. Current → suggested, with its basis. */
export interface WordingPayload {
  readonly kind: 'wording';
  readonly currentValue: string | null;
  readonly suggestedValueAr: string;
  readonly suggestedValueEn: string | null;
  readonly supportingSources: readonly { readonly kind: 'evidence' | 'criterion' | 'project' | 'skill'; readonly ref: string }[];
  readonly reason: string;
  readonly unsupportedRisk: 'none' | 'low' | 'high';
  readonly limitationNote: string | null;
  /** Skills the wording names, by id, so validation can check their state. */
  readonly namedSkillIds: readonly string[];
  /** Technologies the wording names. Must be user-declared or it is refused. */
  readonly namedTechnologies: readonly string[];
}

export interface GapPayload {
  readonly kind: 'gap';
  readonly skillId: string;
  readonly explanation: string;
  readonly currentState: string;
}

export interface ActionPayload {
  readonly kind: 'action';
  readonly action: string;
  readonly why: string;
  readonly estimatedMinutes: number | null;
}

export interface TechnicalFeedbackPayload {
  readonly kind: 'technical_feedback';
  readonly strengths: readonly string[];
  readonly weaknesses: readonly { readonly criterion: string; readonly observation: string }[];
  readonly suggestions: readonly string[];
}

export interface RubricExplanationPayload {
  readonly kind: 'rubric_explanation';
  readonly criteria: readonly { readonly criterion: string; readonly met: boolean; readonly likelyWhy: string }[];
}

export interface FollowupQuestionPayload {
  readonly kind: 'followup_question';
  readonly questions: readonly string[];
  readonly purpose: string;
}

export interface ValidationActivityPayload {
  readonly kind: 'validation_activity';
  readonly skillId: string;
  readonly description: string;
  /** A recommendation only. The domain decides whether it is legal. */
  readonly wouldPropose: { readonly from: string; readonly to: string } | null;
}

export interface MissingEvidencePayload {
  readonly kind: 'missing_evidence';
  readonly skillId: string;
  readonly whatIsMissing: string;
  readonly howToProvide: string;
}

/* ──────────────────────────── usage record ─────────────────────────────── */

export interface UsageRecord {
  readonly invocationId: string;
  readonly agentType: AgentType;
  readonly provider: string;
  readonly model: string;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly latencyMs: number;
  /** Null unless the provider reports a real figure. Never estimated. */
  readonly estimatedCost: number | null;
  readonly status: 'ok' | 'rejected_invalid_output' | 'provider_error' | 'budget_exceeded' | 'context_refused';
  readonly cacheStatus: 'hit' | 'miss' | 'n/a';
  readonly errorType: string | null;
}
