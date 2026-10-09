/**
 * Graduate activity journey — Phase 1 (backend) pure rules.
 *
 *   1. What a graduate may see (content visibility), mirrored exactly by the SQL
 *      function `graduate_content_visible` (migration 0024), which RLS and the
 *      API both use. The SQL is authoritative; this mirror exists so the rule
 *      has a name, a test and an equivalence check.
 *   2. What an activity's assessment can actually do (assessment mode). It is
 *      DERIVED from the rubric, its approval and the demo flag through the same
 *      `assessmentBasis` rule that decides at evaluation time (D-118), so the
 *      label can never promise more than the backend does. It is informational:
 *      it never decides a level.
 *   3. Which uploaded file is which deliverable (explicit mapping). A file is
 *      bound to a server-declared deliverable key by the client naming it; upload
 *      order carries no meaning, and no client-defined deliverable is accepted.
 *   4. Where a piece of work stands (work status), read from authoritative
 *      records (evaluation, result, verification decision).
 */
import { DomainError } from './errors.js';
import type { PublishedRubric } from './evaluator.js';
import { assessmentBasis } from './verification-integrity.js';
import { FILE_DELIVERABLE_FORMAT, type DeliverableSpec } from './evidence-items.js';

/* ───────────────────────────── 1. visibility ───────────────────────────── */

/** Review states a DEMO fixture can be in and still be shown (outside production, labelled). Retired content never is. */
const DEMO_HIDDEN_STATES: readonly string[] = ['superseded', 'rejected'];

/**
 * Whether a content row (role, skill, requirement, resource) may be shown to a graduate.
 *   - Non-demo content: only when `published`. Drafts, curated, SME-reviewed, approved-but-unpublished,
 *     superseded, rejected, needs_revision — and test rows, which are born draft — are never shown.
 *   - DEMO fixtures: only where the deployment says demo content is visible (never production), and
 *     never when retired. They are always labelled DEMO by the API.
 */
export function contentVisibleToGraduate(p: { readonly reviewStatus: string; readonly isDemo: boolean; readonly demoContentVisible: boolean }): boolean {
  if (p.isDemo) return p.demoContentVisible && !DEMO_HIDDEN_STATES.includes(p.reviewStatus);
  return p.reviewStatus === 'published';
}

/** An activity spec: `published` always, and a DEMO one only where demo content is visible. */
export function activityVisibleToGraduate(p: { readonly status: string; readonly isDemo: boolean; readonly demoContentVisible: boolean }): boolean {
  return p.status === 'published' && (!p.isDemo || p.demoContentVisible);
}

/* ─────────────────────────── 2. assessment mode ─────────────────────────── */

export const ACTIVITY_ASSESSMENT_MODES = ['human_reviewed', 'formative_only', 'automated_verified'] as const;
export type ActivityAssessmentMode = (typeof ACTIVITY_ASSESSMENT_MODES)[number];

/**
 * `automated_verified` is reserved. No platform producer of `verified.*` facts exists and no assessment
 * pathway for it has been approved, so it is never returned. Changing this is a separately approved decision.
 */
export const AUTOMATED_VERIFICATION_ENABLED = false as const;

export interface ActivityAssessmentModeResult {
  readonly mode: ActivityAssessmentMode;
  /** Whether a run of this activity can be evaluated at all (a published rubric exists). */
  readonly evaluable: boolean;
  /** Whether finished work on this activity can, under the D-118 rule, support a level. True only for `human_reviewed`. */
  readonly canSupportLevel: boolean;
  readonly reasons: readonly string[];
}

/**
 * The static half of `assessmentBasis`: what the activity can do before any work is submitted.
 *
 * `human_reviewed` ⇔ `assessmentBasis` would be satisfied once every human criterion is decided by a named
 * reviewer — computed by calling it with exactly that, so the two can never disagree. Anything else is
 * `formative_only`: the work is recorded and feedback is given, and the level does not change.
 */
export function activityAssessmentMode(p: {
  /** The published rubric of the activity version, or null when none is published. */
  readonly rubric: Pick<PublishedRubric, 'criteria'> | null;
  readonly rubricValuesApproved: boolean;
  readonly rubricIsDemo: boolean;
  readonly activityIsDemo: boolean;
  /** `activity_spec.can_yield_demonstrated`: content may restrict what an activity can support. */
  readonly canYieldDemonstrated: boolean;
}): ActivityAssessmentModeResult {
  if (!p.rubric) {
    return { mode: 'formative_only', evaluable: false, canSupportLevel: false, reasons: ['no published rubric: work is recorded, no evaluation runs'] };
  }
  const reasons: string[] = [];
  if (p.activityIsDemo) reasons.push('the activity is DEMO content (not reviewed)');
  if (!p.canYieldDemonstrated) reasons.push('the activity is declared as practice: it cannot support Demonstrated');
  const skillCriteria = p.rubric.criteria.filter((c) => (c.kind ?? 'skill_evidence') === 'skill_evidence');
  if (skillCriteria.length === 0) reasons.push('the rubric has no skill-evidence criterion');
  const humanKeys = skillCriteria.filter((c) => (c.evaluatorType ?? 'rule') === 'human').map((c) => c.key);
  const basis = assessmentBasis({ rubric: p.rubric, artifacts: [], humanDecidedCriteria: humanKeys, rubricValuesApproved: p.rubricValuesApproved, rubricIsDemo: p.rubricIsDemo });
  reasons.push(...basis.reasons);

  // Rule criteria over platform-verified facts only would be the automated pathway. It is not enabled.
  const automatable = skillCriteria.length > 0 && skillCriteria.every((c) => (c.evaluatorType ?? 'rule') === 'rule' && c.check
    && (c.check.type === 'all_of' ? c.check.artifactKeys : [c.check.artifactKey]).every((k) => k.startsWith('verified.')));
  if (automatable && !AUTOMATED_VERIFICATION_ENABLED) reasons.push('automated verification is not enabled (no approved platform verifier)');

  const canSupportLevel = reasons.length === 0 && humanKeys.length === skillCriteria.length && skillCriteria.length > 0;
  return { mode: canSupportLevel ? 'human_reviewed' : 'formative_only', evaluable: true, canSupportLevel, reasons };
}

/* ─────────────────────── 3. explicit deliverable mapping ─────────────────────── */

export const DELIVERABLE_MAPPING_ERRORS = [
  'deliverable_mapping_required', 'no_file_deliverables', 'malformed_file_mapping', 'unexpected_deliverable',
  'deliverable_format_mismatch', 'duplicate_deliverable', 'duplicate_upload', 'missing_mandatory_deliverable',
] as const;
export type DeliverableMappingError = (typeof DELIVERABLE_MAPPING_ERRORS)[number];

export class DeliverableMappingRefused extends DomainError {
  override readonly name = 'DeliverableMappingRefused';
  constructor(readonly reason: DeliverableMappingError, message: string, details: Record<string, unknown> = {}) {
    super(`[${reason}] ${message}`, { reason, ...details });
  }
}

export interface FileMappingInput { readonly uploadId: unknown; readonly deliverableKey: unknown }
export interface MappedFile { readonly uploadId: string; readonly key: string; readonly resolvedFrom: 'explicit_mapping' }

/**
 * Binds each uploaded file to a deliverable the ACTIVITY declares (server data), by the key the client names.
 * Refuses, with a named reason: a malformed entry; a key the activity does not declare; a key whose declared
 * format is not a file; the same deliverable or the same upload twice; and a mandatory file deliverable left
 * without a file. Ownership and confirmation of each upload are checked by the caller (storage facts).
 */
export function resolveDeliverableFileMapping(deliverables: readonly DeliverableSpec[], files: readonly FileMappingInput[]): MappedFile[] {
  if (!Array.isArray(files)) throw new DeliverableMappingRefused('malformed_file_mapping', 'files must be a list of { uploadId, deliverableKey }');
  const declared = new Map(deliverables.map((d) => [d.key, d]));
  const fileDeliverables = deliverables.filter((d) => d.format === FILE_DELIVERABLE_FORMAT);
  if (fileDeliverables.length === 0) {
    throw new DeliverableMappingRefused('no_file_deliverables', 'this activity declares no file deliverable; it accepts no files');
  }
  const seenKeys = new Set<string>();
  const seenUploads = new Set<string>();
  const out: MappedFile[] = [];
  for (const f of files) {
    if (!f || typeof f !== 'object' || typeof f.uploadId !== 'string' || !f.uploadId || typeof f.deliverableKey !== 'string' || !f.deliverableKey) {
      throw new DeliverableMappingRefused('malformed_file_mapping', 'each file needs a string uploadId and a string deliverableKey');
    }
    const d = declared.get(f.deliverableKey);
    if (!d) {
      throw new DeliverableMappingRefused('unexpected_deliverable', `'${f.deliverableKey}' is not a deliverable of this activity (expected one of: ${fileDeliverables.map((x) => x.key).join(', ')})`, { deliverableKey: f.deliverableKey });
    }
    if (d.format !== FILE_DELIVERABLE_FORMAT) {
      throw new DeliverableMappingRefused('deliverable_format_mismatch', `'${f.deliverableKey}' is a ${d.format} deliverable, not a file; send it as text`, { deliverableKey: f.deliverableKey });
    }
    if (seenKeys.has(f.deliverableKey)) throw new DeliverableMappingRefused('duplicate_deliverable', `deliverable '${f.deliverableKey}' is mapped more than once`, { deliverableKey: f.deliverableKey });
    if (seenUploads.has(f.uploadId)) throw new DeliverableMappingRefused('duplicate_upload', `upload ${f.uploadId} is mapped to more than one deliverable`, { uploadId: f.uploadId });
    seenKeys.add(f.deliverableKey); seenUploads.add(f.uploadId);
    out.push({ uploadId: f.uploadId, key: f.deliverableKey, resolvedFrom: 'explicit_mapping' });
  }
  const missing = fileDeliverables.filter((d) => d.mandatory && !seenKeys.has(d.key)).map((d) => d.key);
  if (missing.length > 0) {
    throw new DeliverableMappingRefused('missing_mandatory_deliverable', `mandatory file deliverable(s) missing: ${missing.join(', ')}`, { missing });
  }
  return out;
}

/**
 * Whether a submission must map its files explicitly: any platform activity that declares a file deliverable.
 * The positional `uploadIds` form remains only for work with no declared file deliverable (a personal project).
 */
export function explicitFileMappingRequired(deliverables: readonly DeliverableSpec[]): boolean {
  return deliverables.some((d) => d.format === FILE_DELIVERABLE_FORMAT);
}

/* ─────────────────────────────── 4. work status ─────────────────────────────── */

export const WORK_STATUSES = [
  'in_progress', 'submitted', 'evaluation_running', 'evaluation_failed', 'under_human_review',
  'blocked_by_checks', 'pending_validation', 'level_recorded', 'feedback_ready',
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

/**
 * The state of a piece of work, from authoritative records only.
 *   - No submission: `in_progress`.
 *   - A submission with no evaluation: `submitted` (an explicit evaluate action is available).
 *   - Evaluation queued_for_human: `under_human_review` (no invented time).
 *   - A final result: `blocked_by_checks`, or — from the verification decision — `pending_validation`
 *     (D-118: recorded, level unchanged), `level_recorded` (a decision that moved the level), else `feedback_ready`.
 * Nothing here says a skill was proven; `level_recorded` is the only status that reflects a level change.
 */
export function workStatus(p: {
  readonly hasSubmission: boolean;
  readonly evaluationState: string | null;
  readonly outcome: string | null;
  readonly decision: string | null;
  readonly levelChanged: boolean;
}): WorkStatus {
  if (!p.hasSubmission) return 'in_progress';
  if (!p.evaluationState) return 'submitted';
  if (p.evaluationState === 'queued_for_human') return 'under_human_review';
  if (p.evaluationState === 'failed') return 'evaluation_failed';
  if (p.evaluationState !== 'completed') return 'evaluation_running';
  if (p.outcome === 'blocked_by_checks') return 'blocked_by_checks';
  if (p.decision === 'assessment_pending_validation') return 'pending_validation';
  if (p.levelChanged) return 'level_recorded';
  return 'feedback_ready';
}
