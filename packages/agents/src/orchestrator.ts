/**
 * Deterministic orchestrator. Rules, not a model.
 *
 * Given an event, it returns which implemented agent to invoke and with what
 * requested action — or nothing. Every decision is a row in RULES, so the
 * routing is auditable and predictable. No conversation loops.
 */
import type { AgentType, ProposalType, Trigger } from './contracts.js';

export interface OrchestrationEvent {
  readonly type: Trigger;
  readonly userId: string;
  readonly facts: Readonly<Record<string, unknown>>;
}

export interface RoutingDecision {
  readonly ruleId: string;
  readonly agentType: AgentType;
  readonly requestedAction: string;
  readonly expectedProposalTypes: readonly ProposalType[];
}

interface Rule {
  readonly ruleId: string;
  readonly when: (e: OrchestrationEvent) => boolean;
  readonly route: RoutingDecision;
}

export const RULES: readonly Rule[] = [
  {
    ruleId: 'R1-demonstrated-to-recruitment',
    when: (e) => e.type === 'evidence.demonstrated',
    route: { ruleId: 'R1-demonstrated-to-recruitment', agentType: 'recruitment',
      requestedAction: 'propose CV/LinkedIn update from new demonstrated evidence',
      expectedProposalTypes: ['cv_bullet', 'recruiter_next_action'] },
  },
  {
    ruleId: 'R2-evaluation-failed-to-technical',
    when: (e) => e.type === 'evaluation.completed' && e.facts['outcome'] !== 'passed',
    route: { ruleId: 'R2-evaluation-failed-to-technical', agentType: 'technical',
      requestedAction: 'explain result and propose next technical action',
      expectedProposalTypes: ['rubric_explanation', 'technical_feedback', 'technical_next_action'] },
  },
  {
    ruleId: 'R3-evaluation-passed-partial-to-technical',
    when: (e) => e.type === 'evaluation.completed' && e.facts['outcome'] === 'passed' && e.facts['anyCriterionUnmet'] === true,
    route: { ruleId: 'R3-evaluation-passed-partial-to-technical', agentType: 'technical',
      requestedAction: 'explain result and note the unmet optional criterion',
      expectedProposalTypes: ['rubric_explanation', 'technical_feedback'] },
  },
  {
    ruleId: 'R4-unsupported-claim-to-recruitment',
    when: (e) => e.type === 'claim.unsupported_found',
    route: { ruleId: 'R4-unsupported-claim-to-recruitment', agentType: 'recruitment',
      requestedAction: 'explain the unsupported claim and propose a fix',
      expectedProposalTypes: ['profile_gap', 'recruiter_next_action'] },
  },
  {
    ruleId: 'R5-criterion-failed-to-technical',
    when: (e) => e.type === 'criterion.failed',
    route: { ruleId: 'R5-criterion-failed-to-technical', agentType: 'technical',
      requestedAction: 'explain the failed criterion', expectedProposalTypes: ['rubric_explanation', 'improvement_action'] },
  },
];

/** First matching rule wins. Returns null when no agent should run. */
export function route(event: OrchestrationEvent): RoutingDecision | null {
  for (const r of RULES) if (r.when(event)) return r.route;
  return null;
}
