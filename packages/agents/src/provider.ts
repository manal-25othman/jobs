/**
 * Provider abstraction.
 *
 * OPEN-023 is unresolved, so NAQLA binds to no model vendor. The gateway talks
 * to this interface only; the domain never sees it. A real provider arrives as
 * an adapter after OPEN-023 closes.
 */

import type { AgentType, ProposalType, Trigger } from './contracts.js';

export interface ProviderRequest {
  readonly agentType: AgentType;
  readonly trigger: Trigger;
  readonly requestedAction: string;
  /** The redacted context — exactly what the agent is allowed to see. */
  readonly context: Readonly<Record<string, unknown>>;
  readonly expectedProposalTypes: readonly ProposalType[];
}

/** Raw provider output. Untrusted until the gateway validates it. */
export interface ProviderResponse {
  readonly provider: string;
  readonly model: string;
  /** Candidate proposals as loose objects; the gateway validates shape. */
  readonly candidates: readonly unknown[];
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly latencyMs: number;
  readonly estimatedCost: number | null;
  readonly cacheStatus: 'hit' | 'miss' | 'n/a';
}

export interface AgentProvider {
  readonly name: string;
  /** True only for non-production providers. The gateway refuses them in production. */
  readonly testOnly: boolean;
  complete(req: ProviderRequest): Promise<ProviderResponse>;
}
