/**
 * Deterministic CV bullet generation.
 *
 * NO MODEL CALL. A bullet is assembled from facts that already exist in the
 * evaluation, through a fixed template. Every clause traces to a criterion or
 * a recorded fact, and anything without a source is simply not written.
 *
 * The rule this enforces is the product's core promise: a CV bullet is a
 * CLAIM, and a claim needs evidence. A generated sentence that outruns its
 * evidence is exactly the failure NAQLA exists to prevent.
 */

import { InvariantViolation, MissingPrerequisite } from './errors.js';
import { evidenceOrdinal, type EvidenceState } from './evidence-state.js';
import type { EvaluationCriterionScore } from './evaluation.js';

export interface CvBulletSource {
  readonly evidenceId: string;
  readonly skillId: string;
  readonly skillLabelAr: string;
  readonly skillLabelEn: string;
  readonly evidenceState: EvidenceState;
  readonly projectTitle: string;
  readonly evaluationResultId: string;
  readonly rubricVersion: string;
  readonly criteria: readonly EvaluationCriterionScore[];
  /**
   * Technologies the user explicitly stated or a file clearly proves.
   * NEVER inferred from the platform's own stack: the product is built with
   * React, and that says nothing about the user.
   */
  readonly declaredTechnologies: readonly string[];
}

export interface CvBulletTrace {
  readonly clause: string;
  readonly kind: 'evidence' | 'criterion' | 'project' | 'skill';
  readonly ref: string;
}

export interface GeneratedCvBullet {
  readonly bodyAr: string;
  readonly bodyEn: string;
  /** Every clause, with what it rests on. Nothing is untraced. */
  readonly traces: readonly CvBulletTrace[];
  readonly derivedFromEvidenceIds: readonly string[];
  readonly provenanceClass: 'system_derived';
  /** No model touched this. */
  readonly draftingAidUsed: false;
  readonly status: 'draft';
}

/** Words that assert mastery. Forbidden outright (docs/model/10). */
const FORBIDDEN_WORDS_AR = ['أتقنت', 'خبيرة', 'خبير', 'محترف', 'متمكن'];
const FORBIDDEN_WORDS_EN = ['mastered', 'expert', 'guru', 'ninja', 'rockstar'];

/**
 * Generates one evidence-backed CV bullet.
 *
 * Refuses rather than softens: a claim that cannot be supported is not
 * rephrased into something vaguer, it is not written at all.
 */
export function generateCvBullet(source: CvBulletSource): GeneratedCvBullet {
  // A CV bullet is only for evidence-backed states. `practiced` may appear in
  // a project description, never as an achievement bullet.
  if (evidenceOrdinal(source.evidenceState) < evidenceOrdinal('demonstrated')) {
    throw new InvariantViolation(
      'INV-1',
      `a CV bullet requires evidence at 'demonstrated' or above; this claim is '${source.evidenceState}'`,
      { skillId: source.skillId, state: source.evidenceState },
    );
  }
  if (!source.evidenceId) {
    throw new InvariantViolation('INV-1', 'a CV bullet cannot be generated without an evidence record');
  }
  if (source.criteria.length === 0) {
    throw new MissingPrerequisite(
      'criteria', 'a bullet is assembled from evaluated criteria; there are none',
    );
  }

  const met = source.criteria.filter((c) => c.score >= c.maxScore);
  if (met.length === 0) {
    throw new MissingPrerequisite(
      'criteria', 'no criterion was fully met, so there is nothing the bullet may claim',
    );
  }

  const traces: CvBulletTrace[] = [];

  /* Clause 1 — what was built. From the project, not from a description. */
  const whatAr = `عملتُ على «${source.projectTitle}»`;
  const whatEn = `Worked on "${source.projectTitle}"`;
  traces.push({ clause: whatAr, kind: 'project', ref: source.projectTitle });

  /* Clause 2 — the skill, named exactly as the skill catalogue names it. */
  const skillAr = `وأثبتُّ ${source.skillLabelAr}`;
  const skillEn = `demonstrating ${source.skillLabelEn}`;
  traces.push({ clause: skillAr, kind: 'skill', ref: source.skillId });

  /* Clause 3 — what the evaluation actually checked. One clause per met
     criterion, using the criterion's own label, never a paraphrase. */
  const criterionLabels = met.map((c) => c.criterionId);
  for (const c of met) {
    traces.push({ clause: c.criterionId, kind: 'criterion', ref: c.criterionId });
  }
  const checkedAr = `عبر ${met.length} من المعايير المُقيَّمة`;
  const checkedEn = `across ${met.length} evaluated criteria`;

  /* Clause 4 — the score. A real number from the evaluation, or nothing. */
  const total = source.criteria.reduce((s, c) => s + c.score, 0);
  const max = source.criteria.reduce((s, c) => s + c.maxScore, 0);
  const scoreAr = `بنتيجة ${total}/${max}`;
  const scoreEn = `scoring ${total}/${max}`;
  traces.push({ clause: scoreAr, kind: 'evidence', ref: source.evaluationResultId });

  /* Clause 5 — technologies, ONLY when declared. No inference, ever. */
  let techAr = '';
  let techEn = '';
  if (source.declaredTechnologies.length > 0) {
    const list = source.declaredTechnologies.join('، ');
    techAr = ` باستخدام ${list}`;
    techEn = ` using ${source.declaredTechnologies.join(', ')}`;
    traces.push({ clause: techAr.trim(), kind: 'evidence', ref: 'user_declared_technologies' });
  }

  const bodyAr = `${whatAr}، ${skillAr} ${checkedAr} ${scoreAr}${techAr}.`;
  const bodyEn = `${whatEn}, ${skillEn} ${checkedEn}, ${scoreEn}${techEn}.`;

  assertNoUnsupportedLanguage(bodyAr, bodyEn);

  return {
    bodyAr,
    bodyEn,
    traces,
    derivedFromEvidenceIds: [source.evidenceId],
    provenanceClass: 'system_derived',
    draftingAidUsed: false,
    status: 'draft',
  };
}

/** Rejects mastery language and any bare percentage the template never emits. */
export function assertNoUnsupportedLanguage(bodyAr: string, bodyEn: string): void {
  for (const w of FORBIDDEN_WORDS_AR) {
    if (bodyAr.includes(w)) {
      throw new InvariantViolation('INV-1', `the bullet asserts mastery with the word "${w}"`, { word: w });
    }
  }
  const lowerEn = bodyEn.toLowerCase();
  for (const w of FORBIDDEN_WORDS_EN) {
    if (lowerEn.includes(w)) {
      throw new InvariantViolation('INV-1', `the bullet asserts mastery with the word "${w}"`, { word: w });
    }
  }
  // A percentage or a "x%" improvement claim can only come from an invented
  // metric: the template never produces one.
  if (/\d+\s*%/.test(bodyAr) || /\d+\s*%/.test(bodyEn)) {
    throw new InvariantViolation(
      'INV-4', 'the bullet contains a percentage, which this template never derives from evidence',
    );
  }
}

/* ────────────────────── approval lifecycle: draft → active ──────────────── */

export const ASSET_LIFECYCLE = ['draft', 'preview', 'approved', 'active', 'retired'] as const;
export type AssetLifecycleState = (typeof ASSET_LIFECYCLE)[number];

const ASSET_TRANSITIONS: Readonly<Record<AssetLifecycleState, readonly AssetLifecycleState[]>> = {
  draft:    ['preview'],
  preview:  ['approved', 'draft'],
  approved: ['active'],
  active:   ['retired'],
  retired:  [],
};

export function assertAssetTransition(
  from: AssetLifecycleState,
  to: AssetLifecycleState,
  ctx: { readonly userApprovedAt?: string | null },
): void {
  if (!ASSET_TRANSITIONS[from].includes(to)) {
    throw new MissingPrerequisite(
      'assetLifecycle',
      `a professional asset cannot go from '${from}' to '${to}'`,
    );
  }
  if (to === 'approved' && !ctx.userApprovedAt) {
    throw new MissingPrerequisite(
      'userApprovedAt',
      'no system-generated professional wording becomes approved without an explicit user approval',
    );
  }
  if (to === 'active' && !ctx.userApprovedAt) {
    throw new MissingPrerequisite(
      'userApprovedAt', 'an asset becomes active only after the user approved it',
    );
  }
}
