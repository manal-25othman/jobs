/**
 * Contracts for the first production vertical slice:
 *
 *   user -> career goal -> project -> evidence submission -> evaluation
 *        -> evidence state update -> generated professional asset -> report
 *
 * Types only. No endpoint is implemented in Phase 0 — these exist so that the
 * first implementation has a contract to satisfy rather than a shape to invent.
 */

import type {
  EvidenceState, EvaluationOutcome, EvidenceSourceStrength,
  ClaimStrength, ScoreKind, AiUsageMode, Visibility,
} from '@naqla/domain';

/* ───────────────────────────── shared shapes ───────────────────────────── */

export interface Paged<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/** Every score crossing the wire carries its disclaimer. Not optional. */
export interface ScoreDto {
  readonly kind: ScoreKind;
  readonly value: number;
  readonly delta: number | null;
  readonly disclaimerAr: string;
  readonly disclaimerEn: string;
  readonly computedAt: string;
  readonly components: readonly {
    readonly key: string;
    readonly status: 'weak' | 'fair' | 'good' | 'strong';
    readonly reason: string;
  }[];
}

export interface SkillClaimDto {
  readonly skillId: string;
  readonly skillName: string;
  readonly state: EvidenceState;
  readonly strength: ClaimStrength;
  readonly evidenceCount: number;
  readonly sourceStrength: EvidenceSourceStrength | null;
  /** Why it sits at this state, in the user's language. */
  readonly stateReason: string;
  readonly cvEligibleAs: 'bullet' | 'project_description_only' | null;
  readonly linkedInEligibleAs: 'skill' | 'project_mention_only' | null;
}

/* ─────────────────────────── 1. career goal ─────────────────────────────── */

export interface SetCareerGoalRequest {
  readonly targetRoleId: string;
  /** The explicit confirmation step from onboarding. */
  readonly confirmed: true;
}

export interface CareerGoalDto {
  readonly id: string;
  readonly targetRoleId: string;
  readonly roleLabel: string;
  /** Whether the role definition itself has been reviewed. */
  readonly roleReviewStatus: 'reviewed' | 'draft' | 'incomplete';
  /** True when the role definition is incomplete: show "data not complete
   *  yet", never invented requirements. */
  readonly requirementsIncomplete: boolean;
  readonly confirmedAt: string;
}

/* ───────────────────────────── 2. project ──────────────────────────────── */

export interface CreateProjectRequest {
  readonly title: string;
  readonly kind: 'platform_activity' | 'personal_project';
  readonly description: string;
  /** Present only for platform activities. */
  readonly activitySpecId?: string;
}

export interface ProjectDto {
  readonly id: string;
  readonly title: string;
  readonly kind: 'platform_activity' | 'personal_project';
  readonly status: 'draft' | 'active' | 'completed' | 'evidenced' | 'archived' | 'withdrawn';
  readonly activitySpecVersion: string | null;
  readonly aiUsageMode: AiUsageMode | null;
  readonly deliverables: readonly {
    readonly id: string;
    readonly title: string;
    readonly status: 'pending' | 'in_progress' | 'delivered';
  }[];
  readonly updatedAt: string;
}

/* ───────────────────── 3. evidence submission ──────────────────────────── */

export interface CreateSubmissionRequest {
  readonly projectId: string;
  /** Storage object paths already uploaded via a signed URL. */
  readonly filePaths: readonly string[];
  readonly repositoryUrl?: string;
  readonly aiDisclosure: {
    readonly declaredUse: readonly string[];
    readonly explanation: string | null;
  };
}

export interface SubmissionDto {
  readonly id: string;
  readonly projectId: string;
  readonly state:
    | 'received' | 'locked' | 'validated' | 'checked'
    | 'evaluated' | 'verified' | 'closed'
    | 'rejected_format' | 'blocked_by_checks' | 'in_human_review' | 'resubmitted';
  readonly lockedAt: string | null;
  readonly supersedesSubmissionId: string | null;
  readonly createdAt: string;
}

/* ───────────────────────── 4. evaluation ────────────────────────────────── */

export interface EvaluationDto {
  readonly id: string;
  readonly submissionId: string;
  readonly state: 'queued' | 'running' | 'completed' | 'failed' | 'queued_for_human' | 'disputed' | 'revised';
  readonly queuedAt: string;
  readonly completedAt: string | null;
}

/** Immutable. A re-evaluation returns a new row with supersedesResultId set. */
export interface EvaluationResultDto {
  readonly id: string;
  readonly evaluationId: string;
  readonly outcome: EvaluationOutcome;
  readonly rubricVersion: string;
  readonly activitySpecVersion: string;
  readonly criteria: readonly {
    readonly criterionId: string;
    readonly label: string;
    readonly score: number;
    readonly maxScore: number;
    readonly rationale: string;
    readonly supportingExcerpt: string | null;
  }[];
  readonly supersedesResultId: string | null;
  readonly evaluatedAt: string;
  readonly reviewedByHuman: boolean;
}

/* ─────────────────── 5. evidence state update ──────────────────────────── */

export interface EvidenceTransitionDto {
  readonly evidenceId: string;
  readonly skillId: string;
  readonly from: EvidenceState;
  readonly to: EvidenceState;
  readonly transitionRuleId: string;
  readonly evaluationResultId: string | null;
  readonly humanReviewerId: string | null;
  /** INV-8: never a silent transition. */
  readonly reason: string;
  readonly occurredAt: string;
}

/* ─────────────────── 6. generated professional asset ───────────────────── */

export interface ProfessionalAssetDto {
  readonly id: string;
  readonly kind: 'cv_bullet' | 'linkedin_skill' | 'case_study' | 'showcase_project';
  readonly title: string;
  readonly body: string;
  readonly status: 'generated' | 'user_edited' | 'approved' | 'published' | 'unpublished';
  /** Which evidence produced it. Empty is impossible for an evidence-backed asset. */
  readonly derivedFromEvidenceIds: readonly string[];
  readonly provenanceClass: 'system_derived' | 'ai_generated' | 'user_generated';
  /** True when a model helped phrase it; substance still comes from evidence. */
  readonly draftingAidUsed: boolean;
  /** Nothing is applied anywhere before this is set. */
  readonly userApprovedAt: string | null;
  readonly createdAt: string;
}

/**
 * The preview step. A change is previewed and approved; it is never applied by
 * a button labelled "apply" (frozen design §9).
 */
export interface PreviewAssetChangeRequest {
  readonly assetId: string;
}

export interface AssetChangePreviewDto {
  readonly assetId: string;
  readonly current: string | null;
  readonly proposed: string;
  readonly evidenceBasis: readonly string[];
  readonly expectedScoreDeltas: readonly { readonly kind: ScoreKind; readonly delta: number }[];
  readonly requiresApproval: true;
}

export interface ApproveAssetChangeRequest {
  readonly assetId: string;
  /** Optional user edit. Editing outside the evidence drops the verified tag. */
  readonly editedBody?: string;
  readonly approved: true;
}

/* ─────────────────────── 7. evidence report ────────────────────────────── */

export interface RecruiterReportDto {
  readonly id: string;
  readonly generatedAt: string;
  readonly eligible: boolean;
  readonly ineligibleReason: string | null;
  readonly items: readonly {
    readonly observation: string;
    readonly why: string;
    readonly movesScore: ScoreKind | null;
    readonly expectedDelta: number | null;
    /** INV-5: points at a real field or evidence row. */
    readonly tracesTo: { readonly kind: 'field' | 'evidence'; readonly ref: string };
  }[];
  readonly scores: readonly ScoreDto[];
}

export interface ShareLinkDto {
  readonly id: string;
  readonly resourceKind: 'case_study' | 'public_profile' | 'recruiter_report';
  readonly resourceId: string;
  readonly visibility: Visibility;
  readonly url: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly indexable: false;
}

/* ───────────────────────── endpoint catalogue ──────────────────────────── */

/**
 * The slice's endpoints, as data. Not implemented in Phase 0 — this is the
 * checklist the first implementation is measured against.
 */
export const SLICE_1_ENDPOINTS = [
  { method: 'PUT',  path: '/v1/me/career-goal',                      request: 'SetCareerGoalRequest',      response: 'CareerGoalDto' },
  { method: 'POST', path: '/v1/projects',                            request: 'CreateProjectRequest',      response: 'ProjectDto' },
  { method: 'GET',  path: '/v1/projects',                            request: null,                        response: 'Paged<ProjectDto>' },
  { method: 'POST', path: '/v1/projects/:projectId/submissions',     request: 'CreateSubmissionRequest',   response: 'SubmissionDto' },
  { method: 'GET',  path: '/v1/submissions/:submissionId/evaluation', request: null,                       response: 'EvaluationDto' },
  { method: 'GET',  path: '/v1/evaluations/:evaluationId/results',   request: null,                        response: 'Paged<EvaluationResultDto>' },
  { method: 'GET',  path: '/v1/me/skills',                           request: null,                        response: 'Paged<SkillClaimDto>' },
  { method: 'GET',  path: '/v1/me/skills/:skillId/transitions',      request: null,                        response: 'Paged<EvidenceTransitionDto>' },
  { method: 'GET',  path: '/v1/me/assets',                           request: null,                        response: 'Paged<ProfessionalAssetDto>' },
  { method: 'POST', path: '/v1/me/assets/:assetId/preview',          request: 'PreviewAssetChangeRequest', response: 'AssetChangePreviewDto' },
  { method: 'POST', path: '/v1/me/assets/:assetId/approve',          request: 'ApproveAssetChangeRequest', response: 'ProfessionalAssetDto' },
  { method: 'GET',  path: '/v1/me/recruiter-report',                 request: null,                        response: 'RecruiterReportDto' },
  { method: 'GET',  path: '/v1/me/scores',                           request: null,                        response: 'Paged<ScoreDto>' },
  { method: 'POST', path: '/v1/share-links',                         request: 'CreateShareLinkRequest',    response: 'ShareLinkDto' },
  { method: 'DELETE', path: '/v1/share-links/:id',                   request: null,                        response: 'ShareLinkDto' },
] as const;

export interface CreateShareLinkRequest {
  readonly resourceKind: 'case_study' | 'public_profile' | 'recruiter_report';
  readonly resourceId: string;
  readonly expiresInDays: number;
}
