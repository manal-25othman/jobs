/**
 * Career Data Foundation — the rules the data layer lives by.
 *
 * Framework-independent. The database enforces the same transitions with
 * triggers; the import pipeline, the review commands and the quality checks
 * all call these functions first so a rule is stated once.
 *
 *   review:   draft → curated → sme_reviewed → approved → published → superseded
 *             (rejected / needs_revision → curated)
 *   layers:   raw → normalized → curated → approved → published → superseded
 */
import { DomainError, MissingPrerequisite, IllegalTransition } from './errors.js';
import { evidenceOrdinal, type EvidenceState } from './evidence-state.js';

/* ────────────────────────────── review workflow ───────────────────────── */

export const REVIEW_STATES = [
  'draft', 'curated', 'sme_reviewed', 'approved', 'published', 'superseded', 'rejected', 'needs_revision',
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const DATA_LAYERS = ['raw', 'normalized', 'curated', 'approved', 'published', 'superseded'] as const;
export type DataLayer = (typeof DATA_LAYERS)[number];

/** Which layer a reviewed record sits in. Draft and curated are both L2. */
export function layerOf(state: ReviewState): DataLayer {
  switch (state) {
    case 'approved': return 'approved';
    case 'published': return 'published';
    case 'superseded': return 'superseded';
    default: return 'curated';
  }
}

export const REVIEW_TRANSITIONS: Readonly<Record<ReviewState, readonly ReviewState[]>> = {
  draft: ['curated', 'superseded'],
  curated: ['sme_reviewed', 'rejected', 'needs_revision', 'superseded'],
  sme_reviewed: ['approved', 'rejected', 'needs_revision', 'superseded'],
  approved: ['published', 'needs_revision', 'superseded'],
  published: ['superseded'],
  superseded: [],
  rejected: ['curated'],
  needs_revision: ['curated'],
};

export const REVIEWER_ROLES = ['content_author', 'sme', 'product_owner', 'system'] as const;
export type ReviewerRole = (typeof REVIEWER_ROLES)[number];

/** Who may grant each state. SME approval is never granted by anyone else. */
export const STATE_GRANTED_BY: Readonly<Record<ReviewState, readonly ReviewerRole[]>> = {
  draft: ['content_author', 'system'],
  curated: ['content_author'],
  sme_reviewed: ['sme'],
  approved: ['sme'],
  published: ['product_owner'],
  superseded: ['product_owner', 'system'],
  rejected: ['sme'],
  needs_revision: ['sme'],
};

export interface ReviewDecision {
  readonly from: ReviewState;
  readonly to: ReviewState;
  readonly decidedBy: string | null;
  readonly rolePerformed: ReviewerRole;
  readonly reason: string;
  readonly isDemoFixture: boolean;
  readonly draftingAid: 'none' | 'ai_assisted';
  /** True in a production environment (NODE_ENV=production). */
  readonly production: boolean;
}

/**
 * The one place a review transition is judged.
 *
 * - No state is skipped; every grant has the right role behind it.
 * - `sme_reviewed` / `approved` need a named reviewer: "SME approved" is a
 *   person's decision, never a default.
 * - A DEMO fixture can never be SME reviewed or approved. It may be published
 *   only outside production, so a developer can exercise the product.
 * - AI-drafted content is never approved or published without a reviewer.
 */
export function assertReviewTransition(d: ReviewDecision): void {
  if (!REVIEW_TRANSITIONS[d.from]?.includes(d.to)) {
    throw new IllegalTransition('career_data_review', d.from, d.to, 'not a permitted review transition');
  }
  if (!STATE_GRANTED_BY[d.to].includes(d.rolePerformed)) {
    throw new DomainError(`'${d.to}' can only be granted by ${STATE_GRANTED_BY[d.to].join(' or ')}, not by ${d.rolePerformed}`);
  }
  if (!d.reason?.trim()) throw new MissingPrerequisite('reason', 'a review decision needs a written reason');
  if (d.isDemoFixture) {
    if (d.to === 'sme_reviewed' || d.to === 'approved') {
      throw new DomainError('a DEMO / DRAFT fixture is never SME reviewed or approved; import it as real content first');
    }
    if (d.to === 'published' && d.production) {
      throw new DomainError('a DEMO fixture cannot be published in production');
    }
    return;
  }
  if ((d.to === 'sme_reviewed' || d.to === 'approved' || d.to === 'rejected' || d.to === 'needs_revision') && !d.decidedBy) {
    throw new MissingPrerequisite('decidedBy', `'${d.to}' requires a named SME; nothing is marked SME-reviewed automatically`);
  }
  if (d.to === 'published' && d.from !== 'approved') {
    throw new IllegalTransition('career_data_review', d.from, d.to, 'only an approved record can be published');
  }
  // DF-10: AI-drafted content is approved by a named person. Publishing later
  // (product owner) rests on that recorded approval; the database also refuses
  // to publish an AI-assisted record whose reviewed_by is empty.
  if (d.draftingAid === 'ai_assisted' && d.to === 'approved' && !d.decidedBy) {
    throw new MissingPrerequisite('decidedBy', 'AI-assisted content is never approved without a named reviewer (DF-10)');
  }
}

/** The product consumes the published layer only. */
export function consumableByProduct(state: ReviewState): boolean {
  return state === 'published';
}

/** Demo content may exist in a production database only as draft/curated, never published. */
export function demoContentAllowedInProduction(state: ReviewState): boolean {
  return state !== 'published' && state !== 'approved' && state !== 'sme_reviewed';
}

/* ────────────────────────────── skill registry ────────────────────────── */

export const SKILL_TYPES = ['core', 'supporting', 'tool', 'behavioral'] as const;
export type SkillType = (typeof SKILL_TYPES)[number];
export const AI_SUBSTITUTABILITY = ['low', 'medium', 'high'] as const;
export type AiSubstitutability = (typeof AI_SUBSTITUTABILITY)[number];

export const SYNONYM_RELATIONS = ['equivalent', 'broader', 'narrower', 'related', 'tool_of', 'translation_variant'] as const;
export type SynonymRelation = (typeof SYNONYM_RELATIONS)[number];

/**
 * A synonym either names a surface form of THIS skill (equivalent,
 * translation_variant) or links to ANOTHER skill (broader, narrower, related,
 * tool_of). The second kind never merges; it relates.
 */
export function assertSynonymWellFormed(s: {
  readonly skillId: string; readonly relation: SynonymRelation;
  readonly surfaceForm: string | null; readonly relatedSkillId: string | null;
}): void {
  const linksAnother = s.relation === 'broader' || s.relation === 'narrower' || s.relation === 'related' || s.relation === 'tool_of';
  if (linksAnother) {
    if (!s.relatedSkillId) throw new MissingPrerequisite('relatedSkillId', `'${s.relation}' relates two skills; it needs the other skill`);
    if (s.relatedSkillId === s.skillId) throw new DomainError('a skill cannot be broader, narrower, related or a tool of itself');
  } else {
    if (!s.surfaceForm?.trim()) throw new MissingPrerequisite('surfaceForm', `'${s.relation}' names a surface form; it needs the text`);
    if (s.relatedSkillId) throw new DomainError(`'${s.relation}' is a surface form of one skill; it must not point at another skill (that would be a merge)`);
  }
}

/**
 * Match key for normalisation (L1): Arabic letter forms unified, diacritics
 * and tatweel removed, case folded, punctuation stripped. Used ONLY to compare;
 * the displayed text is never changed.
 */
export function normalizeMatchKey(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ً-ْٰـ]/g, '')       // harakat, superscript alef, tatweel
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token-set similarity between two match keys, 0..1. Deterministic, no model. */
export function matchKeySimilarity(a: string, b: string): number {
  const ta = new Set(normalizeMatchKey(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeMatchKey(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  const jaccard = inter / union;
  // A shared leading token ("css", "javascript") counts a little: it is how
  // vendor variants and abbreviations present themselves.
  const [fa] = [...ta]; const [fb] = [...tb];
  return Math.min(1, jaccard + (fa && fa === fb && fa.length > 2 ? 0.15 : 0));
}

export interface NearDuplicateCandidate {
  readonly aCode: string; readonly bCode: string; readonly similarity: number; readonly onField: 'name_en' | 'name_ar';
}

/**
 * Near-Duplicate Report input: skills with their canonical names. Pairs above
 * the threshold are PROPOSED for a human decision. Nothing here merges.
 */
export function nearDuplicateCandidates(
  skills: readonly { readonly code: string; readonly nameEn: string; readonly nameAr: string }[],
  threshold = 0.5,
): NearDuplicateCandidate[] {
  const out: NearDuplicateCandidate[] = [];
  for (let i = 0; i < skills.length; i++) for (let j = i + 1; j < skills.length; j++) {
    const a = skills[i]!, b = skills[j]!;
    const en = matchKeySimilarity(a.nameEn, b.nameEn);
    const ar = matchKeySimilarity(a.nameAr, b.nameAr);
    if (en >= threshold) out.push({ aCode: a.code, bCode: b.code, similarity: Number(en.toFixed(3)), onField: 'name_en' });
    else if (ar >= threshold) out.push({ aCode: a.code, bCode: b.code, similarity: Number(ar.toFixed(3)), onField: 'name_ar' });
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}

/** Two skills whose match keys are identical are duplicates, not near-duplicates. */
export function isExactDuplicate(a: { nameEn: string; nameAr: string }, b: { nameEn: string; nameAr: string }): boolean {
  return normalizeMatchKey(a.nameEn) === normalizeMatchKey(b.nameEn) || normalizeMatchKey(a.nameAr) === normalizeMatchKey(b.nameAr);
}

/* ─────────────────────────── role ↔ skill mapping ─────────────────────── */

export const IMPORTANCE = ['critical', 'high', 'medium', 'low'] as const;
export type Importance = (typeof IMPORTANCE)[number];
export const EVIDENCE_TYPES = ['artifact', 'decision_rationale', 'live_defense', 'process_trace'] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/** V8: a core skill needs two independent evidence paths for Verified; one path suffices for Demonstrated. */
export function minimumEvidenceCount(isCoreForRole: boolean): number { return isCoreForRole ? 2 : 1; }

/**
 * A core skill has an evidence path when at least one activity measures it
 * through a rubric criterion linked to it. Without that, the gap has no exit.
 */
export function evidencePathStatus(input: {
  readonly isCoreForRole: boolean;
  readonly activitiesWithLinkedCriterion: number;
}): 'none' | 'demonstrated_possible' | 'verified_possible' {
  if (input.activitiesWithLinkedCriterion === 0) return 'none';
  if (input.activitiesWithLinkedCriterion >= minimumEvidenceCount(input.isCoreForRole)) return 'verified_possible';
  return 'demonstrated_possible';
}

/* ───────────────────────────── activities and rubrics ─────────────────── */

export const INTEGRITY_CHECK_TYPES = {
  user_facing: ['clarification_question', 'explanation_question', 'followup_modification'],
  assessment_only: ['planted_inconsistency', 'deterministic_signal', 'edge_case', 'output_consistency', 'expected_failure_mode'],
} as const;
export type IntegrityCheckType =
  | (typeof INTEGRITY_CHECK_TYPES.user_facing)[number] | (typeof INTEGRITY_CHECK_TYPES.assessment_only)[number];

export function integrityClassificationOf(t: IntegrityCheckType): 'user_facing' | 'assessment_only' {
  return (INTEGRITY_CHECK_TYPES.user_facing as readonly string[]).includes(t) ? 'user_facing' : 'assessment_only';
}

export const RUBRIC_DIMENSIONS = ['correctness', 'judgment', 'communication', 'integrity', 'completeness'] as const;
export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];
export const EVALUATOR_TYPES = ['rule', 'llm', 'human'] as const;

/**
 * What an activity must carry before it may EVER yield Verified (D-013, D-030):
 * platform-private input, at least one assessment-only integrity check, a
 * contextual justification question, and a named SME approval. Until the
 * verification policy exists, the answer is simply "not yet".
 */
export function verifiedPathStatus(a: {
  readonly hasPrivateInput: boolean; readonly assessmentOnlyChecks: number; readonly explanationQuestions: number;
  readonly smeApprovedBy: string | null; readonly verificationPolicyApproved: boolean;
}): { readonly canYieldVerified: false; readonly missing: readonly string[] } {
  const missing: string[] = [];
  if (!a.hasPrivateInput) missing.push('platform-private input (I1)');
  if (a.assessmentOnlyChecks === 0) missing.push('assessment-only integrity check (I2)');
  if (a.explanationQuestions === 0) missing.push('contextual explanation question (I3)');
  if (!a.smeApprovedBy) missing.push('SME approval (D-030)');
  if (!a.verificationPolicyApproved) missing.push('approved verification policy (OPEN: SME accreditation)');
  // Phase 1 ceiling: Demonstrated (D-059). The answer is false whatever is present.
  return { canYieldVerified: false, missing };
}

/* ─────────────────────────── presentation rules ───────────────────────── */

export const PRESENTATION_ASSET_TYPES = ['cv_bullet', 'linkedin_skill', 'linkedin_project', 'case_study', 'professional_profile'] as const;
export type PresentationAssetType = (typeof PRESENTATION_ASSET_TYPES)[number];

/** Minimum evidence level per asset type (pack template §13). A rule below it is invalid. */
export const PRESENTATION_MINIMUM_LEVEL: Readonly<Record<PresentationAssetType, EvidenceState>> = {
  cv_bullet: 'practiced', linkedin_skill: 'demonstrated', linkedin_project: 'practiced', case_study: 'demonstrated', professional_profile: 'verified',
};

export function assertPresentationRuleSane(r: {
  readonly assetType: PresentationAssetType; readonly evidenceLevel: EvidenceState; readonly allowed: boolean;
  readonly mustCiteEvidence: boolean; readonly allowedVerbsEn: readonly string[]; readonly forbiddenPhrasesEn: readonly string[];
}): void {
  if (!r.mustCiteEvidence) throw new DomainError('must_cite_evidence is always true: every professional statement carries an evidence reference');
  const min = PRESENTATION_MINIMUM_LEVEL[r.assetType];
  if (r.allowed && evidenceOrdinal(r.evidenceLevel) < evidenceOrdinal(min)) {
    throw new DomainError(`${r.assetType} is not allowed at '${r.evidenceLevel}'; the minimum is '${min}'`);
  }
  if (r.allowed && r.allowedVerbsEn.length === 0) throw new MissingPrerequisite('allowedVerbs', 'an allowed rule states which claim verbs the level permits');
  for (const v of r.allowedVerbsEn) if (r.forbiddenPhrasesEn.some((f) => f.toLowerCase() === v.toLowerCase())) {
    throw new DomainError(`'${v}' is both allowed and forbidden`);
  }
}

/* ─────────────────────────── learning resources ───────────────────────── */

export const RESOURCE_QUALITY = ['unverified', 'sme_reviewed', 'approved', 'flagged', 'retired'] as const;
export const MAX_RESOURCES_PER_SKILL = 3;

/** No invented URLs: without a verified link a resource stays `unverified` with url = null. */
export function assertLearningResourceHonest(r: { readonly url: string | null; readonly qualityStatus: string; readonly practiceActivityRef: string | null }): void {
  if (!r.url && r.qualityStatus !== 'unverified' && r.qualityStatus !== 'retired') {
    throw new DomainError(`a resource without a URL can only be 'unverified' or 'retired', not '${r.qualityStatus}'`);
  }
  if (!r.practiceActivityRef) throw new MissingPrerequisite('practiceActivityRef', 'a recommendation without a practice activity is refused (contract A07)');
}
