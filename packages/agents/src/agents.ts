/**
 * The two specialist agents.
 *
 * An agent here is a context shaper and an output mapper: it says what it
 * needs to see, and the provider produces candidates the gateway validates.
 * Neither agent holds a write path to anything.
 */
import type { AgentType, ProposalType, Trigger } from './contracts.js';

export interface AgentSpec {
  readonly agentType: AgentType;
  /** Builds the FULL context; the gateway redacts it to the allow-list. */
  readonly requestedAction: (trigger: Trigger) => string;
  readonly expectedProposalTypes: (trigger: Trigger) => readonly ProposalType[];
}

export const RecruitmentAgent: AgentSpec = {
  agentType: 'recruitment',
  requestedAction: (t) => t === 'claim.unsupported_found'
    ? 'review the unsupported claim as a recruiter would and propose a fix'
    : 'review the profile against the target role as a recruiter would and propose evidence-backed wording',
  expectedProposalTypes: (t) => t === 'claim.unsupported_found'
    ? ['profile_gap', 'recruiter_next_action'] : ['cv_bullet', 'recruiter_next_action'],
};

export const TechnicalAgent: AgentSpec = {
  agentType: 'technical',
  requestedAction: () => 'review the evaluation as a technical mentor: explain, point out weaknesses, propose next step',
  expectedProposalTypes: () => ['rubric_explanation', 'technical_feedback', 'technical_next_action', 'missing_evidence'],
};

export function agentSpec(type: AgentType): AgentSpec {
  if (type === 'recruitment') return RecruitmentAgent;
  if (type === 'technical') return TechnicalAgent;
  throw new Error(`agent '${type}' is an extension contract only; it is not implemented`);
}
