/**
 * Human review of submissions — the rules (OPEN-041).
 *
 *   Submission → deterministic checks → criteria requiring human review → queue
 *   → blind review → criterion-level decision → written rationale → immutable
 *   record → aggregation (evaluator.ts) → domain transition.
 *
 * Which layer owns which decision:
 *   integrity checks (blocking)   → deterministic, final, never lifted by a person
 *   rule criteria                 → deterministic, authoritative
 *   human/llm criteria            → a named reviewer, one decision each, immutable
 *   aggregation + threshold       → domain (pure function)
 *   evidence state transition     → domain ladder; Verified stays blocked (D-059)
 *   no model decides any of these
 */
import { DomainError, IllegalTransition, MissingPrerequisite } from './errors.js';

/* ───────────────────────────── review queue ────────────────────────────── */

export const REVIEW_QUEUE_STATES = ['pending', 'assigned', 'in_review', 'completed', 'returned', 'escalated'] as const;
export type ReviewQueueState = (typeof REVIEW_QUEUE_STATES)[number];

export const REVIEW_QUEUE_TRANSITIONS: Readonly<Record<ReviewQueueState, readonly ReviewQueueState[]>> = {
  pending: ['assigned', 'escalated'],
  assigned: ['in_review', 'pending', 'escalated'],
  in_review: ['completed', 'returned', 'escalated'],
  completed: ['in_review'],          // re-review: a new decision record, the old one kept
  returned: ['pending', 'assigned'],
  escalated: ['assigned', 'pending'],
};

export function assertQueueTransition(from: ReviewQueueState, to: ReviewQueueState): void {
  if (!REVIEW_QUEUE_TRANSITIONS[from]?.includes(to)) throw new IllegalTransition('review_queue', from, to, 'not a permitted queue transition');
}

/* ─────────────────────────── reviewer permissions ──────────────────────── */

export const REVIEWER_MAY = ['mark_criterion_result', 'add_rationale', 'confirm_or_override_judgment_criterion', 'request_re_review', 'return_item', 'escalate_item'] as const;
export const REVIEWER_MAY_NOT = [
  'invent_evidence', 'edit_submission', 'edit_user_profile', 'publish_cv_or_linkedin_claim', 'change_role_requirements',
  'change_rubric_definition', 'bypass_deterministic_failure', 'decide_rule_criterion', 'set_evidence_state', 'grant_verified',
] as const;
export type ReviewerAction = (typeof REVIEWER_MAY)[number] | (typeof REVIEWER_MAY_NOT)[number];

export function assertReviewerAction(action: ReviewerAction): void {
  if ((REVIEWER_MAY_NOT as readonly string[]).includes(action)) {
    throw new DomainError(`a human reviewer may not ${action.replace(/_/g, ' ')}`);
  }
}

/* ───────────────────────────── blind review ────────────────────────────── */

/** Keys that never appear in a review payload, at any depth. */
export const BLIND_FORBIDDEN_KEYS: readonly string[] = [
  'user_id', 'userId', 'display_name', 'displayName', 'username', 'email', 'phone', 'avatar', 'avatar_url', 'picture', 'photo',
  'university', 'college', 'degree', 'gpa', 'birth', 'birthdate', 'age', 'gender', 'nationality', 'city', 'address',
  'cv', 'linkedin', 'profile', 'bio', 'social', 'org_id', 'employer',
];

/** Refuses any payload that carries identity or unrelated profile data. */
export function assertBlindPayload(payload: unknown, path = 'payload'): void {
  if (Array.isArray(payload)) { payload.forEach((v, i) => assertBlindPayload(v, `${path}[${i}]`)); return; }
  if (payload && typeof payload === 'object') {
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      if (BLIND_FORBIDDEN_KEYS.includes(k)) throw new DomainError(`blind review: '${path}.${k}' would reveal identity or unrelated profile data`);
      assertBlindPayload(v, `${path}.${k}`);
    }
  }
}

/* ───────────────────────── criterion decisions ─────────────────────────── */

export interface CriterionLevel { readonly levelKey: string; readonly score: number; }
export interface DecisionInput {
  readonly criterionKey: string; readonly evaluatorType: 'rule' | 'llm' | 'human'; readonly levels: readonly CriterionLevel[];
  readonly levelKey: string; readonly rationale: string;
}

/** A decision names a level of the criterion and carries a rationale. Rule criteria are never decided by a person. */
export function validateDecision(d: DecisionInput): { readonly score: number } {
  if (d.evaluatorType === 'rule') throw new DomainError(`criterion '${d.criterionKey}' is decided deterministically; a human decision on it is refused`);
  const lvl = d.levels.find((l) => l.levelKey === d.levelKey);
  if (!lvl) throw new DomainError(`'${d.levelKey}' is not a level of criterion '${d.criterionKey}'`);
  if (!d.rationale || d.rationale.trim().length < 12) throw new MissingPrerequisite('rationale', 'a criterion decision needs a written rationale (at least a sentence)');
  return { score: lvl.score };
}

/** Conflict of interest: the reviewer is the author, or declared one. */
export function conflictOfInterest(reviewerId: string, submissionOwnerId: string, declared: boolean): boolean {
  return declared || reviewerId === submissionOwnerId;
}

/* ───────────────────────────── finalisation ────────────────────────────── */

export function finalizationAllowed(queue: readonly { readonly state: ReviewQueueState }[]): { readonly allowed: boolean; readonly pending: number } {
  const pending = queue.filter((q) => q.state !== 'completed').length;
  return { allowed: queue.length > 0 && pending === 0, pending };
}

/* ─────────────────────── weights and thresholds (OPEN-043) ─────────────── */

export const VALUE_STATUS = ['approved', 'proposed', 'TBD'] as const;
export type ValueStatus = (typeof VALUE_STATUS)[number];

/** Real content publishes only when every weight and threshold is SME-approved. Demo content may carry proposals. */
export function assertValuesPublishable(input: { readonly isDemoFixture: boolean; readonly passThresholdStatus: ValueStatus; readonly criterionStatuses: readonly { readonly key: string; readonly weight: ValueStatus; readonly threshold: ValueStatus }[] }): void {
  if (input.isDemoFixture) return;
  const bad: string[] = [];
  if (input.passThresholdStatus !== 'approved') bad.push(`pass_threshold (${input.passThresholdStatus})`);
  for (const c of input.criterionStatuses) { if (c.weight !== 'approved') bad.push(`${c.key}.weight (${c.weight})`); if (c.threshold !== 'approved') bad.push(`${c.key}.threshold (${c.threshold})`); }
  if (bad.length) throw new DomainError(`a rubric publishes only with SME-approved values; still proposed/TBD: ${bad.join(', ')}`);
}

/* ────────────────────── demo → canonical promotion (OPEN-040) ──────────── */

export const PROMOTION_STEPS = ['review_copy_created', 'corrected', 'approved', 'published', 'abandoned'] as const;
export type PromotionStep = (typeof PROMOTION_STEPS)[number];

/**
 * A demo record is never mutated into approved content. Promotion creates a
 * non-demo REVIEW COPY that then walks the ordinary review workflow; the demo
 * row stays demo and is superseded when the canonical copy publishes.
 */
export function assertPromotionAllowed(input: { readonly sourceIsDemo: boolean; readonly sourceStatus: string; readonly alreadyPromoted: boolean }): void {
  if (!input.sourceIsDemo) throw new DomainError('only a DEMO record is promoted; real content follows the review workflow directly');
  if (input.sourceStatus === 'superseded') throw new DomainError('a superseded demo record cannot be promoted again');
  if (input.alreadyPromoted) throw new DomainError('this demo record already has an open review copy');
}
