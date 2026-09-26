/**
 * The nine architectural invariants, as data plus the guards that enforce the
 * ones not already enforced inside a specific module.
 *
 * Source: docs/architecture/03-architecture-foundations.md §3.
 * "These nine are acceptance conditions on every pull request, not guidelines."
 */

import { InvariantCode, InvariantViolation } from './errors.js';

export interface InvariantSpec {
  readonly code: InvariantCode;
  readonly statement: string;
  readonly enforcedIn: readonly string[];
  /** Where it is enforced structurally rather than in application code. */
  readonly structuralEnforcement: string | null;
}

export const INVARIANTS: readonly InvariantSpec[] = [
  {
    code: 'INV-1',
    statement: 'No Claim without Evidence.',
    enforcedIn: ['claims.ts assertClaimHasEvidence'],
    structuralEnforcement: 'FK claim.evidence_id + CHECK on claim level (0001_init.sql)',
  },
  {
    code: 'INV-2',
    statement: 'No Evaluation without a published rubric_version.',
    enforcedIn: ['evaluation.ts assertEvaluationResultValid', 'evidence-state.ts assertTransitionAllowed'],
    structuralEnforcement: 'NOT NULL rubric_version + FK to rubric_version(status=published)',
  },
  {
    code: 'INV-3',
    statement: 'No agent writes to the Career Graph — proposals only, through a gate.',
    enforcedIn: ['evidence-state.ts assertTransitionAllowed', 'invariants.ts assertNotAiActor'],
    structuralEnforcement: 'RLS: the AI service role has no write grant on claim/evidence tables',
  },
  {
    code: 'INV-4',
    statement: 'No market information without a tagged source.',
    enforcedIn: ['provenance.ts assertMarketFactSourced'],
    structuralEnforcement: 'NOT NULL provenance_class + observed_at on market_fact',
  },
  {
    code: 'INV-5',
    statement: 'Every fact carries provenance.',
    enforcedIn: ['provenance.ts assertHasProvenance', 'claims.ts assertRecruiterItemTraceable'],
    structuralEnforcement: 'NOT NULL provenance_class on every fact-bearing table',
  },
  {
    code: 'INV-6',
    statement: 'Every model call goes through the gateway and is metered.',
    enforcedIn: ['invariants.ts assertMeteredModelCall', 'sharing.ts assertNotExposed'],
    structuralEnforcement: 'no provider SDK dependency outside the gateway package',
  },
  {
    code: 'INV-7',
    statement: 'Every Activity references a published Spec version.',
    enforcedIn: ['evaluation.ts assertEvaluationResultValid', 'ai-disclosure.ts assertModeRespected'],
    structuralEnforcement: 'NOT NULL activity_spec_version + FK to activity_spec(status=published)',
  },
  {
    code: 'INV-8',
    statement: 'Every meaningful act is published as an event.',
    enforcedIn: ['invariants.ts assertEmitsEvent'],
    structuralEnforcement: 'append-only audit_event table; no UPDATE/DELETE grant',
  },
  {
    code: 'INV-9',
    statement: 'Activity Score is not a Skill Verification Level.',
    enforcedIn: ['evaluation.ts activityScoreGrantsLevel', 'evaluation.ts promotionEligibleFrom'],
    structuralEnforcement: 'no column on claim derives from an activity score',
  },
];

export function invariant(code: InvariantCode): InvariantSpec {
  const found = INVARIANTS.find((i) => i.code === code);
  if (!found) throw new Error(`unknown invariant ${code}`);
  return found;
}

/* ───────────────────────────────── guards ───────────────────────────────── */

export type Actor =
  | { readonly kind: 'user'; readonly id: string }
  | { readonly kind: 'human_reviewer'; readonly id: string; readonly rolePerformed: 'sme' | 'human_reviewer' }
  | { readonly kind: 'system'; readonly component: string }
  | { readonly kind: 'ai_agent'; readonly agentId: string };

/** INV-3 — an agent may propose; it may never be the actor on a graph write. */
export function assertNotAiActor(actor: Actor, operation: string): void {
  if (actor.kind === 'ai_agent') {
    throw new InvariantViolation(
      'INV-3',
      `agent '${actor.agentId}' may propose but not perform '${operation}'`,
      { operation, agentId: actor.agentId },
    );
  }
}

/** INV-6 — a model call carries gateway metering or it did not happen. */
export interface ModelCallRecord {
  readonly gatewayCallId?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costUnits?: number;
  readonly purpose?: string;
}

export function assertMeteredModelCall(call: ModelCallRecord): void {
  const missing: string[] = [];
  if (!call.gatewayCallId) missing.push('gatewayCallId');
  if (!call.provider) missing.push('provider');
  if (!call.model) missing.push('model');
  if (call.inputTokens === undefined) missing.push('inputTokens');
  if (call.outputTokens === undefined) missing.push('outputTokens');
  if (!call.purpose) missing.push('purpose');
  if (missing.length > 0) {
    throw new InvariantViolation(
      'INV-6',
      `model call is not metered; missing: ${missing.join(', ')}`,
      { missing },
    );
  }
}

/** INV-8 — a meaningful act that emits no event is not complete. */
export interface MeaningfulAct {
  readonly name: string;
  readonly emittedEvent?: {
    readonly type: string;
    readonly actor: Actor;
    readonly occurredAt: string;
    readonly reason: string;
  } | null;
}

export function assertEmitsEvent(act: MeaningfulAct): void {
  const e = act.emittedEvent;
  if (!e) {
    throw new InvariantViolation('INV-8', `'${act.name}' completed without emitting an event`, { act: act.name });
  }
  if (!e.reason || e.reason.trim() === '') {
    // docs/blueprint/21: "no silent transition, and no transition without a
    // recorded reason".
    throw new InvariantViolation('INV-8', `'${act.name}' emitted an event with no recorded reason`, { act: act.name });
  }
}
