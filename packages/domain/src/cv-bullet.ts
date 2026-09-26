/**
 * CV bullet FACTS — deterministic preparation only (owner decision D-074).
 *
 * The domain no longer writes a sentence. It assembles the traced facts a
 * wording proposal may rest on; the Recruitment Agent proposes the wording;
 * domain validation checks it; the user approves it. Only then is it an asset.
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
  /** Technologies with an approved source. Never inferred (D-076). */
  readonly approvedTechnologies: readonly { readonly term: string; readonly source: TechnologySource }[];
}

export type TechnologySource = 'user_declared' | 'project_metadata' | 'project_artifact' | 'evidence_metadata';

export interface CvBulletFact {
  readonly kind: 'project' | 'skill' | 'criterion' | 'score' | 'technology';
  readonly valueAr: string;
  readonly valueEn: string;
  readonly ref: string;
}

export interface CvBulletFacts {
  readonly evidenceId: string;
  readonly skillId: string;
  readonly facts: readonly CvBulletFact[];
  /** What a wording may NOT contain, stated for the proposer. */
  readonly constraints: readonly string[];
  readonly provenanceClass: 'system_derived';
}

/** Words that assert mastery. Forbidden outright (docs/model/10). */
const FORBIDDEN_WORDS_AR = ['أتقنت', 'خبيرة', 'خبير', 'محترف', 'متمكن'];
const FORBIDDEN_WORDS_EN = ['mastered', 'expert', 'guru', 'ninja', 'rockstar', 'senior', 'lead'];

export function prepareCvBulletFacts(source: CvBulletSource): CvBulletFacts {
  if (evidenceOrdinal(source.evidenceState) < evidenceOrdinal('demonstrated')) {
    throw new InvariantViolation('INV-1',
      `CV bullet facts require evidence at 'demonstrated' or above; this claim is '${source.evidenceState}'`,
      { skillId: source.skillId, state: source.evidenceState });
  }
  if (!source.evidenceId) throw new InvariantViolation('INV-1', 'no facts without an evidence record');
  const met = source.criteria.filter((c) => c.score >= c.maxScore);
  if (met.length === 0) throw new MissingPrerequisite('criteria', 'no criterion was fully met, so there is nothing a bullet may claim');

  const total = source.criteria.reduce((s, c) => s + c.score, 0);
  const max = source.criteria.reduce((s, c) => s + c.maxScore, 0);
  const facts: CvBulletFact[] = [
    { kind: 'project', valueAr: source.projectTitle, valueEn: source.projectTitle, ref: source.projectTitle },
    { kind: 'skill', valueAr: source.skillLabelAr, valueEn: source.skillLabelEn, ref: source.skillId },
    ...met.map((c) => ({ kind: 'criterion' as const, valueAr: c.criterionId, valueEn: c.criterionId, ref: c.criterionId })),
    { kind: 'score', valueAr: `${total}/${max}`, valueEn: `${total}/${max}`, ref: source.evaluationResultId },
    ...source.approvedTechnologies.map((t) => ({ kind: 'technology' as const, valueAr: t.term, valueEn: t.term, ref: `${t.source}:${t.term}` })),
  ];
  return {
    evidenceId: source.evidenceId, skillId: source.skillId, facts, provenanceClass: 'system_derived',
    constraints: [
      'no percentage or invented metric', 'no technology outside the technology facts',
      'no mastery or seniority language', 'no employer, title, years or certification',
    ],
  };
}

/** Rejects mastery/seniority language and any bare percentage. */
export function assertNoUnsupportedLanguage(bodyAr: string, bodyEn: string): void {
  for (const w of FORBIDDEN_WORDS_AR) if (bodyAr.includes(w)) throw new InvariantViolation('INV-1', `the wording asserts mastery or seniority with "${w}"`, { word: w });
  const lowerEn = bodyEn.toLowerCase();
  for (const w of FORBIDDEN_WORDS_EN) if (new RegExp(`\\b${w}\\b`).test(lowerEn)) throw new InvariantViolation('INV-1', `the wording asserts mastery or seniority with "${w}"`, { word: w });
  if (/\d+\s*%/.test(bodyAr) || /\d+\s*%/.test(bodyEn) || /٪/.test(bodyAr)) throw new InvariantViolation('INV-4', 'the wording contains a percentage, which no evidence derives');
  if (/\b\d+\+?\s*(years?|yrs)\b/i.test(bodyEn) || /\d+\s*(سنوات|سنة|أعوام)/.test(bodyAr)) throw new InvariantViolation('INV-4', 'the wording asserts years of experience, which no evidence records');
  // A quantity in words is still a metric: "in half", "doubled", "tenfold".
  if (/\b(halved|in half|doubled?|twice as|tripled?|tenfold|\w+-fold)\b/i.test(bodyEn) || /(إلى النصف|بالنصف|ضعفين|ثلاثة أضعاف|أضعاف|مرتين)/.test(bodyAr)) {
    throw new InvariantViolation('INV-4', 'the wording quantifies an outcome in words, which no evidence measures');
  }
}

/* ────────────────────── approval lifecycle: draft → active ──────────────── */

export const ASSET_LIFECYCLE = ['draft', 'preview', 'approved', 'active', 'needs_review', 'retired'] as const;
export type AssetLifecycleState = (typeof ASSET_LIFECYCLE)[number];

const ASSET_TRANSITIONS: Readonly<Record<AssetLifecycleState, readonly AssetLifecycleState[]>> = {
  draft: ['preview'], preview: ['approved', 'draft'], approved: ['active'],
  active: ['retired', 'needs_review'], needs_review: ['active', 'retired'], retired: [],
};

export function assertAssetTransition(from: AssetLifecycleState, to: AssetLifecycleState, ctx: { readonly userApprovedAt?: string | null }): void {
  if (!ASSET_TRANSITIONS[from].includes(to)) throw new MissingPrerequisite('assetLifecycle', `a professional asset cannot go from '${from}' to '${to}'`);
  if ((to === 'approved' || to === 'active') && !ctx.userApprovedAt) throw new MissingPrerequisite('userApprovedAt', 'no system-generated professional wording becomes approved or active without an explicit user approval');
}
