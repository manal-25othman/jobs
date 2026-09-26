/**
 * AgentGateway — the single door for every agent/model call.
 *
 * Responsibilities, in order: choose agent · validate allowed context · redact
 * · enforce budget · route to provider · record usage · validate output schema
 * · reject malformed · validate against domain · attach provenance · return
 * proposals. The domain never sees the provider; the provider never sees a
 * write path.
 */
import type { AgentProvider } from './provider.js';
import { agentDefinition, type AgentInvocation, type AgentProposal, type AgentType, type Trigger, type UsageRecord, type InputReference } from './contracts.js';
import { redactForAgent } from './redaction.js';
import { validateSchema, validateAgainstDomain, ProposalRejected, type DomainFacts } from './validation.js';
import { agentSpec } from './agents.js';

export interface GatewayRequest {
  readonly agentType: AgentType;
  readonly trigger: Trigger;
  readonly userId: string;
  readonly targetRoleId: string | null;
  readonly fullContext: Readonly<Record<string, unknown>>;
  readonly inputReferences: readonly InputReference[];
  readonly domainFacts: DomainFacts;
}

export interface GatewayResult {
  readonly invocation: AgentInvocation;
  readonly proposals: readonly AgentProposal[];
  readonly rejected: readonly { readonly reason: string; readonly code: string }[];
  readonly usage: UsageRecord;
  readonly redactedPaths: readonly string[];
}

export interface BudgetPolicy {
  /** Calls already made by this user in the current window. */
  callsUsed(userId: string): Promise<number>;
  readonly maxCallsPerWindow: number;
}

export interface Ids { newId(): string; now(): string; }

export class AgentGateway {
  constructor(
    private readonly provider: AgentProvider,
    private readonly budget: BudgetPolicy,
    private readonly ids: Ids,
    private readonly env: { readonly production: boolean },
  ) {
    if (env.production && provider.testOnly) {
      throw new Error(`provider '${provider.name}' is TEST/NON-PRODUCTION and cannot be used when NODE_ENV=production`);
    }
  }

  async invoke(req: GatewayRequest): Promise<GatewayResult> {
    const def = agentDefinition(req.agentType);
    if (!def.implemented) throw new Error(`agent '${req.agentType}' is an extension contract only`);
    const spec = agentSpec(req.agentType);
    const { context, passedPaths, redactedPaths } = redactForAgent(req.agentType, req.fullContext);

    const invocation: AgentInvocation = {
      invocationId: this.ids.newId(), agentId: def.agentId, agentType: req.agentType, trigger: req.trigger,
      userId: req.userId, targetRoleId: req.targetRoleId, allowedContext: passedPaths,
      requestedAction: spec.requestedAction(req.trigger), inputReferences: req.inputReferences,
      outputProposalTypes: spec.expectedProposalTypes(req.trigger),
      provenance: { class: 'ai_generated', source: `agent:${def.agentId}/provider:${this.provider.name}` },
      modelMetadata: this.provider.testOnly ? null : { provider: this.provider.name, model: 'unknown' },
      createdAt: this.ids.now(),
    };

    const base = { invocationId: invocation.invocationId, agentType: req.agentType, provider: this.provider.name, model: 'n/a',
      inputBytes: 0, outputBytes: 0, latencyMs: 0, estimatedCost: null, cacheStatus: 'n/a' as const };

    const used = await this.budget.callsUsed(req.userId);
    if (used >= this.budget.maxCallsPerWindow) {
      return { invocation, proposals: [], rejected: [{ code: 'budget', reason: 'budget exceeded' }], redactedPaths,
        usage: { ...base, status: 'budget_exceeded', errorType: 'budget' } };
    }

    let response;
    try {
      response = await this.provider.complete({ agentType: req.agentType, trigger: req.trigger,
        requestedAction: invocation.requestedAction, context, expectedProposalTypes: invocation.outputProposalTypes });
    } catch (e) {
      return { invocation, proposals: [], rejected: [{ code: 'provider_error', reason: (e as Error).message }], redactedPaths,
        usage: { ...base, status: 'provider_error', errorType: (e as Error).name || 'Error' } };
    }

    const proposals: AgentProposal[] = []; const rejected: { reason: string; code: string }[] = [];
    for (const cand of response.candidates) {
      try {
        const shaped = validateSchema(req.agentType, cand);
        validateAgainstDomain(shaped, req.domainFacts);
        proposals.push({ ...shaped, proposalId: this.ids.newId(), invocationId: invocation.invocationId,
          agentType: req.agentType, requiresDomainValidation: true, createdAt: this.ids.now() });
      } catch (e) {
        if (e instanceof ProposalRejected) rejected.push({ code: e.code, reason: e.message });
        else throw e;
      }
    }

    const status = proposals.length === 0 && response.candidates.length > 0 ? 'rejected_invalid_output' : 'ok';
    return { invocation, proposals, rejected, redactedPaths,
      usage: { ...base, model: response.model, inputBytes: response.inputBytes, outputBytes: response.outputBytes,
        latencyMs: response.latencyMs, estimatedCost: response.estimatedCost, cacheStatus: response.cacheStatus,
        status, errorType: status === 'ok' ? null : 'invalid_output' } };
  }
}

/** Lifecycle transitions for stored proposals. Approved history is never rewritten. */
export const LIFECYCLE_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  generated: ['validated', 'rejected'],
  validated: ['awaiting_user', 'rejected', 'superseded'],
  awaiting_user: ['approved', 'rejected', 'superseded'],
  approved: [],
  rejected: [],
  superseded: [],
};
export function assertLifecycle(from: string, to: string): void {
  if (!LIFECYCLE_TRANSITIONS[from]?.includes(to)) throw new Error(`proposal lifecycle: ${from} → ${to} is not permitted`);
}
