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
}

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
  evaluatedAt: string;
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
