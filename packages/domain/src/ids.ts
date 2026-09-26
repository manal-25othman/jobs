/**
 * Canonical identifier types.
 *
 * Every domain entity is identified by a UUID. The domain never generates one —
 * generation is an infrastructure concern (DB default, or an injected port) —
 * because a pure rule module must stay deterministic and testable.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Uuid = string;

export type UserId = Brand<Uuid, 'UserId'>;
export type CareerGoalId = Brand<Uuid, 'CareerGoalId'>;
export type TargetRoleId = Brand<Uuid, 'TargetRoleId'>;
export type RoleRequirementId = Brand<Uuid, 'RoleRequirementId'>;
export type SkillId = Brand<Uuid, 'SkillId'>;
export type SkillRequirementId = Brand<Uuid, 'SkillRequirementId'>;
export type ProjectId = Brand<Uuid, 'ProjectId'>;
export type ProjectEvidenceId = Brand<Uuid, 'ProjectEvidenceId'>;
export type EvidenceId = Brand<Uuid, 'EvidenceId'>;
export type EvaluationId = Brand<Uuid, 'EvaluationId'>;
export type EvaluationResultId = Brand<Uuid, 'EvaluationResultId'>;
export type EvaluationCriterionId = Brand<Uuid, 'EvaluationCriterionId'>;
export type IntegrityCheckId = Brand<Uuid, 'IntegrityCheckId'>;
export type AiDisclosureId = Brand<Uuid, 'AiDisclosureId'>;
export type ProfessionalAssetId = Brand<Uuid, 'ProfessionalAssetId'>;
export type CvVersionId = Brand<Uuid, 'CvVersionId'>;
export type CvAssessmentId = Brand<Uuid, 'CvAssessmentId'>;
export type LinkedInAssessmentId = Brand<Uuid, 'LinkedInAssessmentId'>;
export type CaseStudyId = Brand<Uuid, 'CaseStudyId'>;
export type RecruiterReportId = Brand<Uuid, 'RecruiterReportId'>;
export type PublicProfileId = Brand<Uuid, 'PublicProfileId'>;
export type ShareLinkId = Brand<Uuid, 'ShareLinkId'>;
export type LearningGapId = Brand<Uuid, 'LearningGapId'>;
export type LearningResourceId = Brand<Uuid, 'LearningResourceId'>;
export type PracticeActivityId = Brand<Uuid, 'PracticeActivityId'>;
export type NotificationId = Brand<Uuid, 'NotificationId'>;
export type AuditEventId = Brand<Uuid, 'AuditEventId'>;
export type SubmissionId = Brand<Uuid, 'SubmissionId'>;
export type HumanReviewId = Brand<Uuid, 'HumanReviewId'>;

/** A published, frozen content version. Never a free-form string in the domain. */
export type RubricVersion = Brand<string, 'RubricVersion'>;
export type ActivitySpecVersion = Brand<string, 'ActivitySpecVersion'>;
export type PolicyVersion = Brand<string, 'PolicyVersion'>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is Uuid {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Semantic version of a published content artefact, e.g. "0.2.0". */
const VERSION_RE = /^\d+\.\d+\.\d+$/;

export function isContentVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION_RE.test(value);
}
