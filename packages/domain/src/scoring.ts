/**
 * Readiness scoring.
 *
 * Three internal readiness indices: Professional Profile, CV, LinkedIn.
 * They are NOT employment predictions, hiring probabilities, certification
 * scores or guarantees — the disclaimer is part of the type, so a caller
 * cannot render a score without carrying it.
 *
 * Weights are deliberately ABSENT. Phase 0 has not approved any, and inventing
 * plausible-looking numbers would make an unvalidated model look settled.
 * `loadWeights` therefore fails loudly until configuration supplies them.
 */

import { MissingPrerequisite } from './errors.js';

export const SCORE_KINDS = ['profile', 'cv', 'linkedin'] as const;
export type ScoreKind = (typeof SCORE_KINDS)[number];

export const READINESS_DISCLAIMER_AR =
  'مؤشر جاهزية داخلي من نقلة، وليس درجة توظيف أو ضمان قبول.';
export const READINESS_DISCLAIMER_EN =
  'An internal NAQLA readiness indicator — not a hiring score or a guarantee.';

/** A score can never be rendered without its disclaimer. */
export interface ReadinessScore {
  readonly kind: ScoreKind;
  readonly value: number;
  readonly disclaimerAr: typeof READINESS_DISCLAIMER_AR;
  readonly disclaimerEn: typeof READINESS_DISCLAIMER_EN;
  readonly computedAt: string;
  readonly inputsVersion: string;
  readonly components: readonly ScoreComponent[];
}

export interface ScoreComponent {
  readonly key: string;
  /** The qualitative word shown to the user. */
  readonly status: 'weak' | 'fair' | 'good' | 'strong';
  /** A reason sentence is mandatory — a status word alone explains nothing. */
  readonly reason: string;
  readonly weight: number;
  readonly normalised: number;
}

/**
 * The only events that may move a score (frozen design §9).
 * Filling in profile fields is deliberately not one of them.
 */
export const SCORE_MOVING_EVENTS = [
  'project.completed',
  'skill.demonstrated',
  'evidence.created',
  'achievement.generated',
  'cv.updated',
  'linkedin.updated',
] as const;

export type ScoreMovingEvent = (typeof SCORE_MOVING_EVENTS)[number];

export function mayMoveScore(event: string): event is ScoreMovingEvent {
  return (SCORE_MOVING_EVENTS as readonly string[]).includes(event);
}

/* ───────────────────────────── weight configuration ─────────────────────── */

export interface ScoreWeights {
  readonly version: string;
  readonly kind: ScoreKind;
  /** component key -> weight. Must sum to 1. */
  readonly weights: Readonly<Record<string, number>>;
  /** Who approved these numbers, and in which record. */
  readonly approvedBy: string;
}

/**
 * Component keys per score, taken from the drill-downs the frozen design
 * specifies. The KEYS are approved (they are in §9); the WEIGHTS are not.
 */
export const SCORE_COMPONENT_KEYS: Readonly<Record<ScoreKind, readonly string[]>> = {
  cv: [
    'role_alignment', 'summary', 'projects', 'achievements',
    'skills', 'evidence_backed_claims', 'ats_structure',
  ],
  linkedin: [
    'role_alignment', 'evidence_backed_claims', 'core_sections_complete',
    'professional_positioning', 'projects_and_education',
  ],
  profile: ['cv', 'linkedin', 'evidence_base'],
};

/**
 * Returns the approved weights for a score, or throws.
 *
 * There is no default and no fallback on purpose. An unapproved weight set is
 * a TBD (D-037), and a TBD rendered as a number is a fabricated product claim.
 */
export function loadWeights(
  kind: ScoreKind,
  configured: readonly ScoreWeights[],
): ScoreWeights {
  const found = configured.find((w) => w.kind === kind);
  if (!found) {
    throw new MissingPrerequisite(
      `scoreWeights.${kind}`,
      `no approved weights for the '${kind}' readiness score. ` +
        'Phase 0 has not set them; they stay explicit configuration, never arbitrary values.',
    );
  }
  const keys = SCORE_COMPONENT_KEYS[kind];
  for (const k of keys) {
    if (!(k in found.weights)) {
      throw new MissingPrerequisite(
        `scoreWeights.${kind}.${k}`,
        `component '${k}' is specified in the design drill-down but has no weight`,
      );
    }
  }
  const sum = Object.values(found.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) {
    throw new MissingPrerequisite(
      `scoreWeights.${kind}`,
      `weights must sum to 1; they sum to ${sum}`,
    );
  }
  return found;
}

/**
 * Computes a readiness score from components and approved weights.
 * Pure: no I/O, no model call, no clock — `computedAt` is supplied.
 */
export function computeReadiness(
  kind: ScoreKind,
  components: readonly ScoreComponent[],
  weights: ScoreWeights,
  computedAt: string,
): ReadinessScore {
  let total = 0;
  for (const c of components) {
    const w = weights.weights[c.key];
    if (w === undefined) {
      throw new MissingPrerequisite(
        `scoreWeights.${kind}.${c.key}`,
        `component '${c.key}' has no approved weight`,
      );
    }
    total += w * c.normalised;
  }
  return {
    kind,
    value: Math.round(total * 100),
    disclaimerAr: READINESS_DISCLAIMER_AR,
    disclaimerEn: READINESS_DISCLAIMER_EN,
    computedAt,
    inputsVersion: weights.version,
    components,
  };
}

/** A delta is derived from two stored scores; it is never typed in by hand. */
export function scoreDelta(previous: ReadinessScore | null, current: ReadinessScore): number | null {
  if (!previous) return null;
  if (previous.kind !== current.kind) {
    throw new MissingPrerequisite('scoreDelta.kind', 'cannot diff two different score kinds');
  }
  return current.value - previous.value;
}
