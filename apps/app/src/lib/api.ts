/**
 * The only way this app talks to the API.
 *
 * Every authoritative action goes through NestJS. The app never writes a
 * claim, an evidence row or a transition — it could not even if it tried, RLS
 * refuses — and it never re-derives a domain rule.
 */

export interface ApiOk<T> { ok: true; data: T }
export interface ApiErr { ok: false; error: { code: string; message: string } }
export type ApiResult<T> = ApiOk<T> | ApiErr;

const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; token: string },
): Promise<T> {
  const res = await fetch(`${BASE}/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${init.token}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });

  const payload = (await res.json().catch(() => null)) as ApiResult<T> | null;
  if (!payload) throw new Error(`the API returned no body (${res.status})`);
  if (!payload.ok) throw new Error(payload.error?.message ?? `request failed (${res.status})`);
  return payload.data;
}

/* ─────────────────────────── shapes this slice uses ─────────────────────── */

export interface TargetRole {
  id: string; slug: string; label_ar: string; label_en: string;
  review_status: string; is_demo_fixture: boolean;
}

export interface CareerGoal {
  id: string; targetRoleId: string; roleLabel: string; roleLabelAr?: string;
  roleReviewStatus: 'reviewed' | 'draft'; requirementsIncomplete: boolean; confirmedAt: string;
}

export interface Project {
  id: string; title: string; kind: 'platform_activity' | 'personal_project';
  status: string; activity_spec_version: string | null; created_at: string;
}

export interface SkillClaim {
  skillId: string; skillName: string; skillNameAr: string;
  state: 'gap' | 'self_reported' | 'practiced' | 'demonstrated' | 'verified';
  stateReason: string; evidenceCount: number; primaryEvidenceId: string | null;
  /** Phase 2 (additive): the journey dimension. Null when no journey was recorded. Never a verification. */
  progress: { state: string; stateLabelAr: string; stateLabelEn: string; lastEventAt: string | null } | null;
}

/* ─────────────────────────── skill journey (Phase 2) ─────────────────────── */

/** One skill's two dimensions side by side. `verification` is null when there is no claim (= gap). */
export interface SkillJourney {
  skillId: string; skillName: string; skillNameAr: string;
  progress: { state: string; stateLabelAr: string; stateLabelEn: string; stateReviewStatus: string; reason: string; lastTrigger: string | null; lastEventAt: string | null; updatedAt: string; targetRoleId: string | null };
  verification: { state: SkillClaim['state']; stateReason: string } | null;
  verificationEffectOfProgress: 'none';
}
export interface SkillJourneyEngine { active: boolean; reason: string | null; production: boolean; enabledRules: number; validatedRules: number; verificationEffect: 'none' }

export interface EvaluationCriterion {
  criterionId?: string; criterion_key?: string;
  score: number | string; maxScore?: number; max_score?: string;
  rationale: string; supportingExcerpt?: string | null; supporting_excerpt?: string | null;
}

export interface EvaluationResult {
  outcome: string; totalScore: number; maxScore: number; reason: string;
  criteria: EvaluationCriterion[];
  integrityChecks: { key: string; passed: boolean; message: string | null }[];
  transition: { from: string; to: string; evidenceId: string } | null;
  /** D-118: what the verification policy concluded. `assessment_pending_validation` = recorded as feedback, no level. */
  verification?: { decision: string; reason: string };
  evaluatedAt: string;
  /** Present while a person reviews the judgement criteria. No time estimate: there is no SLA yet. */
  humanReview: { pendingCriteria: string[]; completedCriteria: string[] } | null;
}

export interface ReviewQueueItem {
  id: string; state: string; criterionKey: string; createdAt: string; assignedToMe: boolean; conflictOfInterest: boolean;
  activity: { slug: string; titleAr: string; titleEn: string }; criterion: { nameAr: string; nameEn: string; dimension: string };
}
export interface ReviewItem {
  itemId: string; state: string;
  activity: { slug: string; titleAr: string; objectiveAr: string; businessContextAr: string; aiUsageMode: string; deliverables: { key: string; mandatory: boolean; descriptionAr: string }[] };
  criterion: { key: string; nameAr: string; descriptionAr: string; expectedEvidenceAr: string; maxScore: number; mandatory: boolean;
    levels: { levelKey: string; score: number; descriptorAr: string; observableEvidenceEn: string }[];
    observations: { key: string; reviewerPromptAr: string; reviewerPromptEn: string; passWhenEn: string; failWhenEn: string; affectsEvidence: boolean }[] };
  submission: { artifacts: { key: string; kind: string; valueBool: boolean | null; valueNumber: number | null; valueText: string | null; locator: string | null }[];
    files: { name: string; downloadUrl: string; sizeBytes: number }[]; userExplanation: { key: string; text: string | null }[]; aiDisclosure: { declaredUse: string[] } };
  deterministic: { criteria: { key: string; score: number; maxScore: number; rationale: string }[]; integrityChecks: { key: string; passed: boolean }[] };
  previousDecisions: { reviewId: string; decision: string; score: number; rationale: string; createdAt: string }[];
}

export interface CvBulletAsset {
  id: string; bodyAr: string; bodyEn: string; lifecycleState: string;
  traces: { clause: string; kind: string; ref: string }[];
  derivedFromEvidenceIds: string[]; draftingAidUsed: boolean;
}

export interface EvidenceReport {
  id: string;
  targetRole: { label: string; reviewStatus: string };
  skills: {
    skillLabel: string; evidenceState: string; stateReason: string;
    source: { projectTitle: string; kind: string };
    evaluationSummary: {
      outcome: string; score: number; maxScore: number; rubricVersion: string;
      evaluatedAt: string; criteria: { label: string; met: boolean; rationale: string }[];
    };
    integrityResult: { allPassed: boolean; userFacingChecks: { label: string; passed: boolean }[] };
  }[];
  professionalAssets: { kind: string; body: string; approvedAt: string }[];
  aiDisclosure: string;
  generatedAt: string;
  scopeNote: string;
}

/* ─────────────────────────── evidence ledger (Phase 1) ─────────────────── */

/** A registry row. `validated` is false for every seeded type: DRAFT / NOT VALIDATED. */
export interface EvidenceType {
  code: string; labelAr: string; labelEn: string; descriptionEn: string;
  channel: 'url' | 'file' | 'text' | 'activity' | 'system';
  userAddable: boolean; reviewStatus: string; validated: boolean; validationNote: string;
}

/** Material the user or the system put forward. `claimEffect` is always 'none': an item never moves a claim. */
export interface EvidenceItem {
  id: string; typeCode: string; typeLabelAr: string; typeLabelEn: string; channel: EvidenceType['channel'];
  typeReviewStatus: string; source: 'user_direct' | 'user_submission' | 'system';
  title: string; description: string | null; url: string | null; uploadId: string | null; artifactKey: string | null;
  projectId: string | null; submissionId: string | null; evaluationResultId: string | null; parentItemId: string | null;
  status: 'draft' | 'submitted' | 'withdrawn' | 'superseded'; submittedAt: string | null; attemptNumber: number;
  supersedesItemId: string | null; withdrawnAt: string | null; withdrawnReason: string | null;
  metadata: Record<string, unknown>; createdAt: string;
  skills: { skillId: string; role: string; linkedBy: 'user' | 'system'; labelAr: string; labelEn: string }[];
  derivations: { evidenceId: string; kind: 'evaluated_from' | 'recorded_as' }[];
  claimEffect: 'none';
}

/* ─────────────────────── structured assessment (Phase 3) ─────────────────── */

/** What an evaluator observed. Never a verdict; the verdict is in `decisions`. */
export interface Assessment {
  id: string; evaluationResultId: string; evaluatorKind: 'rule' | 'human' | 'llm'; evaluatorRef: string;
  versions: { rubric: string | null; activitySpec: string | null; domainRuleset: string; contextPolicy: string | null;
    /** Phase 4: which track configuration version and context policy produced this assessment, and how they were resolved. */
    trackConfigVersionId: string | null; trackConfigVersion: number | null; configResolution: 'production_active' | 'legacy_baseline' | 'development_only' | 'no_active_track_config' | 'pre_0014' };
  inputsUsed: Record<string, unknown>; outcome: string; totalScore: number; maxScore: number; confidence: number | null; createdAt: string;
  criteria: { key: string; kind: string; skillId: string | null; status: 'met' | 'partially_met' | 'not_met' | 'pending_human' | 'not_applicable'; score: number; maxScore: number;
    evidenceUsed: string[]; evidenceMissing: string[]; observations: string; strengths: string[]; gaps: string[]; confidence: number | null; evaluatorKind: string; reason: string; recommendedNextAction: string | null }[];
  decisions: { id: string; skillId: string; policy: { key: string; version: number; status: string; validated: boolean; resolution: 'production_active' | 'legacy_baseline' | 'development_only' | null }; trackConfigVersionId: string | null; domainRulesetVersion: string; decidedByKind: 'policy' | 'human'; decidedByRef: string | null;
    decision: string; previousState: string; proposedState: string | null; resultingState: string; confidence: number | null; reason: string; verificationId: string | null; evidenceId: string | null; humanOverrideOf: string | null; decidedAt: string }[];
}

/* ─────────────────────────── uploads (signed only) ─────────────────────── */

export interface UploadIntent {
  uploadId: string;
  target: { url: string; method: 'PUT'; headers: Record<string, string>; expiresInSeconds: number };
}

/**
 * Client-side upload: intent → PUT bytes straight to storage → confirm.
 * The API never proxies the bytes and never reveals where they live.
 */
export async function uploadEvidenceFile(file: File, token: string): Promise<string> {
  const intent = await api<UploadIntent>('/uploads', {
    method: 'POST', token,
    body: { declaredName: file.name, contentType: file.type || 'text/plain', declaredSize: file.size },
  });
  const put = await fetch(intent.target.url, { method: 'PUT', headers: intent.target.headers, body: file });
  if (!put.ok) throw new Error(`upload failed (${put.status})`);
  await api(`/uploads/${intent.uploadId}/confirm`, { method: 'POST', token });
  return intent.uploadId;
}

export async function revokeShareLink(id: string, token: string): Promise<void> {
  await api(`/share-links/${id}`, { method: 'DELETE', token });
}

/* ───────────────────────── readiness + skill pages (Phase 5) ───────────────────────── */

export type ReadinessStatus = 'not_yet_configured' | 'pending_validation' | 'evaluated';
export interface ReadinessReport {
  status: ReadinessStatus; headlineAr: string;
  ruleSet: { id: string; key: string; version: number; reviewStatus: string; validated: boolean; resolution: string } | null;
  rules: { ruleId: string; type: string; labelAr: string; labelEn: string; outcome: 'satisfied' | 'not_satisfied' | 'indeterminate'; detailEn: string; nonCompensable: boolean; skillIds: string[] }[];
  summary: { satisfied: number; notSatisfied: number; indeterminate: number; total: number };
  overall: 'meets_rule_set' | 'does_not_meet_rule_set' | null;
  verificationEffect: 'none';
}
/** One TrackSkill with its four separate dimensions. */
export interface TrackSkillView {
  skillId: string; labelAr: string; labelEn: string;
  progress: { state: string; labelAr: string; labelEn: string } | null;
  verification: { level: SkillClaim['state']; stateReason: string | null; hasClaim: boolean };
  evidence: { standingEvaluatedCount: number; submittedMaterialCount: number };
  readiness: { configured: boolean; rulesNamingSkill: { ruleId: string; labelAr: string; outcome: string; nonCompensable: boolean }[]; expectedLevel: string | null;
    expectedLevelStatus: 'pending_expert_validation' | 'approved' | 'undecided'; readinessContribution: 'counts' | 'informational' | 'undecided';
    badge: 'core' | 'supporting' | 'pending_expert_validation' | 'disabled'; classificationStatus: string; category: string | null; displayOrder: number | null; enabled: boolean };
  verificationEffectOfReadiness: 'none';
}
export interface TrackSkillsPage { role: { id: string; labelAr: string; labelEn: string } | null; items: TrackSkillView[]; readiness: ReadinessReport }
export interface TrackSkillDetail {
  role: TrackSkillsPage['role']; skill: TrackSkillView; readinessStatus: ReadinessStatus; readinessHeadlineAr: string; ruleSetValidated: boolean;
  materials: { id: string; typeCode: string; typeLabelAr: string; title: string; status: string; attemptNumber: number; submittedAt: string | null; source: string }[];
  evaluatedEvidence: { id: string; sourceStrength: string; evaluationResultId: string | null; projectId: string | null; createdAt: string; withdrawnAt: string | null }[];
  decisions: { id: string; decision: string; previousState: string; proposedState: string | null; resultingState: string; policy: string; policyStatus: string; policyResolution: string | null; trackConfigVersionId: string | null; decidedAt: string }[];
  journeyEvents: { trigger: string; from: string; to: string | null; applied: boolean; outcome: string; reason: string; at: string }[];
  activities: { id: string; slug: string; titleAr: string; version: string; depth: string }[];
}

/* ───────────────────────── AI usage & integrity (Phase 6) ───────────────────────── */

export interface DisclosureQuestionView {
  key: string; position: number; promptAr: string; promptEn: string; helpAr: string | null;
  answerType: 'yes_no' | 'single_choice' | 'multi_choice' | 'free_text' | 'text_list';
  options: { value: string; labelAr: string; labelEn: string }[]; required: boolean; showIf: Record<string, string | boolean>;
}
export interface DisclosureQuestionnaireView {
  questionnaire: { id: string; key: string; version: number; labelAr: string; introAr: string; reviewStatus: string; validated: boolean; activation: string; resolution: string; questions: DisclosureQuestionView[] } | null;
  aiUseAllowedAr?: string; scoreEffect?: 'none'; requiresHumanReview?: false;
}
/** A short verification step. Never an accusation. */
export interface ChallengeView {
  id: string; submissionId: string; typeCode: string; typeLabelAr: string; promptAr: string; promptEn: string | null;
  status: 'issued' | 'answered' | 'reviewed' | 'expired' | 'withdrawn'; issuedAt: string; dueAt: string | null;
  response: { text?: string; code?: string } | null; respondedAt: string | null; result: { outcome: string; observations: string; reviewedAt: string } | null;
}
