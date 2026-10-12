/**
 * ENG-1 P0 — integrity of the legacy (single-skill) evaluation path.
 *
 * Three pure rules that the evaluation service applies before any level can move:
 *
 *   1. Coverage. A skill is "covered" by a rubric only through a VALID skill-evidence
 *      criterion: kind `skill_evidence`, a linked skill, a positive maximum. A skill no
 *      criterion measures can never be promoted by that rubric (closes F-9).
 *
 *   2. Attribution. The legacy path moves ONE skill per evaluation. That skill is chosen
 *      by an explicit, governed mapping — never by row order or uuid order (closes F-1/F-2):
 *          claimed by the learner  ∩  declared `primary` by the activity  ∩  covered by the rubric
 *      Exactly one candidate ⇒ attributed. Zero or several ⇒ UNATTRIBUTED: the evaluation is
 *      recorded, and no skill is promoted (fail closed).
 *
 *   3. Rubric resolution. An evaluation runs against the published rubric version bound to
 *      the submission's activity version (closes F-8). A legacy rubric with no binding is
 *      accepted only when nothing is ambiguous; otherwise the evaluation is refused.
 *
 * All ids handed to these functions must already be CANONICAL skill ids (OPEN-039).
 */

import type { PublishedRubric, EvaluationRun } from './evaluator.js';

/* ───────────────────────────────── coverage ───────────────────────────────── */

/** A criterion that may count as evidence for its linked skill. Gates and quality criteria never do (OPEN-044). */
export function isValidSkillEvidenceCriterion(c: Pick<PublishedRubric['criteria'][number], 'kind' | 'skillId' | 'maxScore'>): boolean {
  return (c.kind ?? 'skill_evidence') === 'skill_evidence' && c.skillId !== null && c.skillId !== '' && Number.isFinite(c.maxScore) && c.maxScore > 0;
}

/**
 * The skills a rubric measures, through valid skill-evidence criteria only.
 * `canonicalOf` maps a criterion's linked skill to its canonical id (identity when omitted).
 */
export function skillsCoveredByRubric(rubric: Pick<PublishedRubric, 'criteria'>, canonicalOf: (skillId: string) => string = (s) => s): readonly string[] {
  const out = new Set<string>();
  for (const c of rubric.criteria) if (isValidSkillEvidenceCriterion(c)) out.add(canonicalOf(c.skillId!));
  return [...out].sort();
}

/* ──────────────────────────────── attribution ─────────────────────────────── */

export type LegacyAttribution =
  | { readonly kind: 'attributed'; readonly skillId: string; readonly reason: string }
  | { readonly kind: 'unattributed'; readonly cause: 'no_candidate' | 'ambiguous'; readonly candidates: readonly string[]; readonly reason: string };

/**
 * Which ONE claimed skill the legacy whole-activity result may be attributed to.
 * Pure; the order of every input list is irrelevant (the result is a set operation).
 */
export function attributeLegacyPrimarySkill(input: {
  /** Canonical ids of the skills the learner claimed on this submission. */
  readonly claimedSkillIds: readonly string[];
  /** Canonical ids of the skills the activity declares at depth `primary` (governed content mapping). */
  readonly activityPrimarySkillIds: readonly string[];
  /** Canonical ids of the skills the resolved rubric measures through valid criteria. */
  readonly coveredSkillIds: readonly string[];
}): LegacyAttribution {
  const primary = new Set(input.activityPrimarySkillIds);
  const covered = new Set(input.coveredSkillIds);
  const candidates = [...new Set(input.claimedSkillIds)].filter((s) => primary.has(s) && covered.has(s)).sort();
  if (candidates.length === 1) {
    return { kind: 'attributed', skillId: candidates[0]!, reason: 'the only claimed skill that the activity declares primary and the rubric measures' };
  }
  if (candidates.length === 0) {
    return { kind: 'unattributed', cause: 'no_candidate', candidates,
      reason: 'no claimed skill is both declared primary by the activity and measured by a valid criterion of the rubric; no level can move (ENG-1 P0)' };
  }
  return { kind: 'unattributed', cause: 'ambiguous', candidates,
    reason: `${candidates.length} claimed skills are primary and measured by the rubric; a whole-activity result cannot be attributed to one of them, so no level moves (ENG-1 P0: per-skill results are not enabled)` };
}

/**
 * The run with any proposal withheld. Used when the result cannot be attributed to a skill:
 * the evaluation stands as recorded; it simply proposes nothing.
 */
export function withheldPromotion(run: EvaluationRun, reason: string): EvaluationRun {
  if (run.proposedState === null) return { ...run, reason: `${run.reason}; ${reason}` };
  return { ...run, proposedState: null, reason: `${run.reason}; promotion withheld: ${reason}` };
}

/* ───────────────────────────── rubric resolution ──────────────────────────── */

export interface RubricVersionCandidate {
  readonly id: string;
  /** Only published versions are evaluable; anything else is ignored. */
  readonly status: string;
  /** The activity version this rubric was published for; null for a legacy row published before ENG-1 P0. */
  readonly activitySpecVersion: string | null;
}

export type RubricResolution =
  | { readonly kind: 'bound'; readonly rubricVersionId: string }
  | { readonly kind: 'legacy_unbound_single'; readonly rubricVersionId: string }
  | { readonly kind: 'unresolved'; readonly reason: string };

/**
 * The rubric version an evaluation must use. Never "the latest".
 *
 *   - exactly one PUBLISHED version bound to the submission's activity version ⇒ that one;
 *   - several bound to it ⇒ unresolved (ambiguous);
 *   - none bound to it ⇒ the legacy fallback applies only when the activity has exactly one
 *     published version, it is unbound, AND the submission was made on the activity's current
 *     version (the only version that legacy rubric can have been published for);
 *   - anything else ⇒ unresolved. The caller refuses the evaluation; it never guesses.
 */
export function resolveRubricVersion(input: {
  readonly candidates: readonly RubricVersionCandidate[];
  readonly submissionActivityVersion: string | null;
  readonly currentActivityVersion: string;
}): RubricResolution {
  const published = input.candidates.filter((c) => c.status === 'published');
  const v = input.submissionActivityVersion;
  if (!v) return { kind: 'unresolved', reason: 'the submission records no activity version; its rubric cannot be identified' };
  const bound = published.filter((c) => c.activitySpecVersion === v);
  if (bound.length === 1) return { kind: 'bound', rubricVersionId: bound[0]!.id };
  if (bound.length > 1) return { kind: 'unresolved', reason: `${bound.length} published rubric versions are bound to activity version ${v}; the evaluation cannot choose between them` };
  if (published.length === 1 && published[0]!.activitySpecVersion === null && v === input.currentActivityVersion) {
    return { kind: 'legacy_unbound_single', rubricVersionId: published[0]!.id };
  }
  if (published.length === 0) return { kind: 'unresolved', reason: 'no published rubric for this activity' };
  return { kind: 'unresolved', reason: `no published rubric version can be resolved for activity version ${v}` };
}
