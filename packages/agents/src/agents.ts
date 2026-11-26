/**
 * The two specialist agents.
 *
 * An agent here is a context shaper and an output mapper: it says what it
 * needs to see, and the provider produces candidates the gateway validates.
 * Neither agent holds a write path to anything.
 */
import type { AgentType, ProposalType, Trigger } from './contracts.js';
import type { GuidanceCapability } from './guidance.js';

/** Learner-facing guidance capabilities, plus the reviewer-facing A13 suggestion. */
export type AgentCapability = GuidanceCapability | 'review_suggestion';

export interface AgentSpec {
  readonly agentType: AgentType;
  /** Builds the FULL context; the gateway redacts it to the allow-list. */
  readonly requestedAction: (trigger: Trigger, capability?: AgentCapability) => string;
  readonly expectedProposalTypes: (trigger: Trigger, capability?: AgentCapability) => readonly ProposalType[];
}

export const RecruitmentAgent: AgentSpec = {
  agentType: 'recruitment',
  requestedAction: (t, cap) => cap === 'career_guidance'
    ? 'explain the current career state: the one next step and the role gaps, from recorded facts only (A01/A02)'
    : t === 'claim.unsupported_found'
    ? 'review the unsupported claim as a recruiter would and propose a fix'
    : 'review the profile against the target role as a recruiter would and propose evidence-backed wording',
  expectedProposalTypes: (t, cap) => cap === 'career_guidance' ? ['recruiter_next_action', 'profile_gap']
    : t === 'claim.unsupported_found'
    ? ['profile_gap', 'recruiter_next_action'] : ['cv_bullet', 'recruiter_next_action'],
};

export const TechnicalAgent: AgentSpec = {
  agentType: 'technical',
  requestedAction: (_t, cap) => cap === 'review_suggestion'
    ? 'suggest, per criterion, met / unmet / uncertain with the excerpt it rests on and a confidence, for the human reviewer only; never a decision (A13)'
    : cap === 'improvement_hints'
    ? 'give ONE level of hint for each unmet criterion of the graduate\'s own result: where to look, the concept, or a resource; never code or the fix (A15/A03)'
    : cap === 'learning_guidance'
    ? 'guide learning for one skill as a technical mentor: the registry resource, the practice and self-check questions; never a solution (A07/A03)'
    : 'review the evaluation as a technical mentor: explain, point out weaknesses, propose next step',
  expectedProposalTypes: (_t, cap) => cap === 'review_suggestion' ? ['criterion_suggestion']
    : cap === 'improvement_hints' ? ['improvement_action']
    : cap === 'learning_guidance' ? ['technical_next_action', 'followup_question']
    : ['rubric_explanation', 'technical_feedback', 'technical_next_action', 'missing_evidence'],
};

/** A11 Virtual Manager: one reply in the persona, from the learner-facing scenario only. */
export const VirtualManagerAgent: AgentSpec = {
  agentType: 'virtual_manager',
  requestedAction: () => 'reply once as the virtual manager of this work simulation: clarify partially from the scenario, never a solution, never a score hint (A11)',
  expectedProposalTypes: () => ['manager_turn'],
};

export function agentSpec(type: AgentType): AgentSpec {
  if (type === 'virtual_manager') return VirtualManagerAgent;
  if (type === 'recruitment') return RecruitmentAgent;
  if (type === 'technical') return TechnicalAgent;
  throw new Error(`agent '${type}' is an extension contract only; it is not implemented`);
}
