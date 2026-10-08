/**
 * Configuration & Policy Layer (Configurable Track Architecture, Phase 4).
 *
 * Every governed configuration row carries two independent things:
 *
 *   reviewStatus   expert validation: draft → … → approved / published.
 *   activation     whether the product USES the row:
 *     inactive          the default for every new row; never consulted.
 *     development_only  may run outside production only.
 *     legacy_baseline   the behaviour that existed before the policy layer.
 *                       It runs in production because it IS the pre-existing
 *                       behaviour — NOT because it is validated. Only a
 *                       migration can create one; the application cannot.
 *     production_active the explicit, audited promotion of a VALIDATED row.
 *
 * What is fixed here (invariants):
 *   - in production only `production_active` and `legacy_baseline` resolve;
 *     an ordinary draft never does, however it is labelled.
 *   - a row becomes `production_active` only when validated and approved by
 *     a named person; `legacy_baseline` is never assignable by the application.
 *   - the assessment context always excludes the user's identity and profile.
 *   - a professional claim always needs the user's approval (BR-021).
 *   - a TrackSkill is shown as core/supporting only once its classification
 *     is approved; before that it is "pending expert validation".
 *
 * What is data (DRAFT / NOT VALIDATED until an expert approves): every policy
 * value, every TrackSkill configuration field, every track configuration version.
 */

import { DomainError, InvariantViolation, MissingPrerequisite } from './errors.js';
import { EVIDENCE_STATES, type EvidenceState } from './evidence-state.js';

export const CONFIG_ACTIVATIONS = ['inactive', 'development_only', 'legacy_baseline', 'production_active'] as const;
export type ConfigActivation = (typeof CONFIG_ACTIVATIONS)[number];

export interface GovernedConfig {
  id: string;
  key: string;
  version: number;
  reviewStatus: string;
  activation: ConfigActivation;
  baselineOf: string | null;
  approvedBy: string | null;
}

export function configIsValidated(c: Pick<GovernedConfig, 'reviewStatus'>): boolean {
  return c.reviewStatus === 'approved' || c.reviewStatus === 'published';
}

export type ConfigResolution = 'production_active' | 'legacy_baseline' | 'development_only';

/**
 * Pure: which row of a key runs in this environment. Production consults a
 * validated active row, else the migration-created baseline, never a draft.
 * Outside production a development-only draft may run (like DEMO content).
 * Two candidates of the same rank is a data error, never a silent pick.
 */
export function resolveActiveConfig<T extends GovernedConfig>(rows: readonly T[], env: { production: boolean }): { row: T; resolution: ConfigResolution } | { row: null; resolution: 'none'; reason: string } {
  const pick = (activation: ConfigActivation): T | null => {
    const found = rows.filter((r) => r.activation === activation);
    if (found.length > 1) throw new DomainError(`ambiguous configuration: ${found.length} rows of key '${found[0]!.key}' are ${activation} (ids ${found.map((r) => r.id).join(', ')})`);
    return found[0] ?? null;
  };
  const prod = pick('production_active');
  if (prod) {
    if (!configIsValidated(prod) || !prod.approvedBy) throw new InvariantViolation('INV-8', `configuration ${prod.key}@${prod.version} is production_active but not validated/approved; refusing to use it`);
    return { row: prod, resolution: 'production_active' };
  }
  if (!env.production) {
    const dev = pick('development_only');
    if (dev) return { row: dev, resolution: 'development_only' };
  }
  const base = pick('legacy_baseline');
  if (base) {
    if (!base.baselineOf) throw new InvariantViolation('INV-8', `configuration ${base.key}@${base.version} claims legacy_baseline without a migration-created baseline_of`);
    return { row: base, resolution: 'legacy_baseline' };
  }
  return { row: null, resolution: 'none', reason: env.production ? 'no validated production configuration and no legacy baseline' : 'no active configuration (production_active, development_only or legacy_baseline)' };
}

/** Whether an activation change is allowed, as the application may request it. The database repeats these checks. */
export function assertActivationAllowed(p: { from: ConfigActivation; to: ConfigActivation; reviewStatus: string; approvedBy: string | null; baselineOf: string | null; production: boolean }): void {
  if (!(CONFIG_ACTIVATIONS as readonly string[]).includes(p.to)) throw new DomainError(`unknown activation '${p.to}'`);
  if (p.to === 'legacy_baseline') {
    if (!p.baselineOf) throw new InvariantViolation('INV-8', 'legacy_baseline is created by a migration only; a draft can never become a baseline');
  }
  if (p.to === 'production_active' && (!configIsValidated({ reviewStatus: p.reviewStatus }) || !p.approvedBy)) {
    throw new MissingPrerequisite('approval', `production_active needs a validated row approved by a named person (status '${p.reviewStatus}'); a DRAFT / NOT VALIDATED row cannot be active in production`);
  }
  if (p.to === 'development_only' && p.production) throw new DomainError('development_only configuration cannot be activated in production');
}

/* ───────────────────────────── assessment context ───────────────────────────── */

/** `integrity_signals` (Phase 6) is a known kind; a context policy that does not list it excludes it (the baseline does). */
export const CONTEXT_INPUT_KINDS = ['submission_artifacts', 'evidence_items', 'ai_disclosure', 'previous_attempts', 'human_review_decisions', 'integrity_signals', 'user_identity', 'user_profile'] as const;
export type ContextInputKind = (typeof CONTEXT_INPUT_KINDS)[number];
export const CONTEXT_INPUT_MODES = ['required', 'optional', 'excluded'] as const;
export type ContextInputMode = (typeof CONTEXT_INPUT_MODES)[number];
/** Inputs the code excludes regardless of any policy row. */
export const ALWAYS_EXCLUDED_INPUTS: readonly ContextInputKind[] = ['user_identity', 'user_profile'];

export interface AssessmentContextPolicy extends GovernedConfig { inputs: Readonly<Partial<Record<ContextInputKind, ContextInputMode>>> }

export function assertContextPolicySane(inputs: unknown): asserts inputs is AssessmentContextPolicy['inputs'] {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) throw new DomainError('context inputs must be an object');
  for (const [k, v] of Object.entries(inputs as Record<string, unknown>)) {
    if (!(CONTEXT_INPUT_KINDS as readonly string[]).includes(k)) throw new DomainError(`unknown context input kind '${k}'`);
    if (!(CONTEXT_INPUT_MODES as readonly string[]).includes(v as string)) throw new DomainError(`context input '${k}' has unsupported mode '${String(v)}'`);
  }
  for (const k of ALWAYS_EXCLUDED_INPUTS) {
    if ((inputs as Record<string, unknown>)[k] !== 'excluded') throw new InvariantViolation('INV-3', `assessment context must exclude '${k}'; the policy says '${String((inputs as Record<string, unknown>)[k])}'`);
  }
}

export interface AssessmentContext {
  policyRef: string;
  included: Partial<Record<ContextInputKind, unknown>>;
  excluded: ContextInputKind[];
  omittedOptional: ContextInputKind[];
}

/** Pure: builds what an evaluator may see from what is available. A missing REQUIRED input is a named error. Identity never passes. */
export function buildAssessmentContext(policy: AssessmentContextPolicy, available: Partial<Record<ContextInputKind, unknown>>): AssessmentContext {
  assertContextPolicySane(policy.inputs);
  const included: Partial<Record<ContextInputKind, unknown>> = {};
  const excluded: ContextInputKind[] = []; const omittedOptional: ContextInputKind[] = [];
  for (const kind of CONTEXT_INPUT_KINDS) {
    const mode = ALWAYS_EXCLUDED_INPUTS.includes(kind) ? 'excluded' : (policy.inputs[kind] ?? 'excluded');
    const value = available[kind];
    if (mode === 'excluded') { excluded.push(kind); continue; }
    if (value === undefined || value === null) {
      if (mode === 'required') throw new MissingPrerequisite(kind, `assessment context '${policy.key}@${policy.version}' requires '${kind}' and it is not available`);
      omittedOptional.push(kind); continue;
    }
    included[kind] = value;
  }
  return { policyRef: `${policy.key}@${policy.version}`, included, excluded, omittedOptional };
}

/* ───────────────────────────────── claim policy ───────────────────────────────── */

export const CLAIM_KINDS = ['cv_bullet', 'linkedin_skill', 'linkedin_project', 'linkedin_headline', 'linkedin_about', 'professional_summary', 'case_study', 'professional_profile', 'evidence_report'] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export interface ClaimPolicy extends GovernedConfig {
  claimKind: ClaimKind;
  minEvidenceLevel: EvidenceState;
  minEvidenceCount: number | null;
  requiresVerificationDecision: boolean;
  requiresUserApproval: true;
  lockUntilGrounded: boolean;
}

export function assertClaimPolicySane(p: ClaimPolicy): void {
  if (!(CLAIM_KINDS as readonly string[]).includes(p.claimKind)) throw new DomainError(`unknown claim kind '${p.claimKind}'`);
  if (!(EVIDENCE_STATES as readonly string[]).includes(p.minEvidenceLevel)) throw new DomainError(`claim policy ${p.claimKind}: unknown level '${p.minEvidenceLevel}'`);
  if (p.requiresUserApproval !== true) throw new InvariantViolation('INV-3', 'a professional claim always needs the user\'s approval (BR-021); a policy cannot waive it');
  if (p.minEvidenceCount !== null && (!Number.isInteger(p.minEvidenceCount) || p.minEvidenceCount < 1)) throw new DomainError(`claim policy ${p.claimKind}: evidence count must be a positive integer`);
}

/** Phase 4 states it explicitly: claim policies are recorded, not consumed. presentationFor() decides until Phase 7. */
export const CLAIM_POLICY_CONSUMED = false as const;

/* ───────────────────────────────── challenge policy ───────────────────────────────── */

export interface ChallengePolicy extends GovernedConfig { triggerRule: Readonly<Record<string, unknown>>; challengeTypes: readonly string[]; maxChallenges: number | null }

/** A challenge policy is inert unless it is active AND declares a trigger. There is no runner in Phase 4 either way. */
export function challengePolicyWouldTrigger(p: ChallengePolicy, env: { production: boolean }): boolean {
  const active = resolveActiveConfig([p], env).row !== null;
  return active && Object.keys(p.triggerRule).length > 0 && p.challengeTypes.length > 0;
}
export const CHALLENGE_RUNNER_EXISTS = false as const;

/* ───────────────────────────────── TrackSkill ───────────────────────────────── */

export const TRACK_SKILL_CLASSIFICATION_STATUSES = ['pending_expert_validation', 'proposed', 'approved'] as const;
export type TrackSkillClassificationStatus = (typeof TRACK_SKILL_CLASSIFICATION_STATUSES)[number];

/** What the UI may show about a TrackSkill's classification. `is_core` is never shown as "core" before approval. */
export function trackSkillBadge(p: { isCore: boolean; classificationStatus: TrackSkillClassificationStatus; enabled: boolean }): 'core' | 'supporting' | 'pending_expert_validation' | 'disabled' {
  if (!p.enabled) return 'disabled';
  if (p.classificationStatus !== 'approved') return 'pending_expert_validation';
  return p.isCore ? 'core' : 'supporting';
}

export interface TrackSkillConfig {
  roleRequirementId: string; skillId: string; isCore: boolean; importance: string | null; category: string | null; displayOrder: number | null;
  expectedLevel: EvidenceState | null; readinessContribution: 'counts' | 'informational' | null; enabled: boolean; classificationStatus: TrackSkillClassificationStatus;
  minimumEvidenceCount: number | null; reviewStatus: string; version: number;
}

/** Reads a snapshot element (snake_case jsonb) into the typed config. Unknown values are refused, not defaulted. */
export function trackSkillConfigFromSnapshot(r: Record<string, unknown>): TrackSkillConfig {
  const cs = r['classification_status'];
  if (!(TRACK_SKILL_CLASSIFICATION_STATUSES as readonly string[]).includes(cs as string)) throw new DomainError(`unknown classification_status '${String(cs)}'`);
  const rc = r['readiness_contribution'];
  if (rc !== null && rc !== undefined && rc !== 'counts' && rc !== 'informational') throw new DomainError(`unknown readiness_contribution '${String(rc)}'`);
  return {
    roleRequirementId: String(r['role_requirement_id']), skillId: String(r['skill_id']), isCore: r['is_core'] === true, importance: (r['importance'] as string | null) ?? null,
    category: (r['category'] as string | null) ?? null, displayOrder: r['display_order'] === null || r['display_order'] === undefined ? null : Number(r['display_order']),
    expectedLevel: (r['expected_level'] as EvidenceState | null) ?? null, readinessContribution: (rc as 'counts' | 'informational' | null) ?? null,
    enabled: r['enabled'] !== false, classificationStatus: cs as TrackSkillClassificationStatus,
    minimumEvidenceCount: r['minimum_evidence_count'] === null || r['minimum_evidence_count'] === undefined ? null : Number(r['minimum_evidence_count']),
    reviewStatus: String(r['review_status']), version: Number(r['version'] ?? 1),
  };
}

/** No readiness threshold exists in Phase 4: the engine is Phase 5 and this constant names the gap. */
export const READINESS_RULES_EXIST = false as const;
