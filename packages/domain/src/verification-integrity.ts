/**
 * Critical verification-integrity remediation (D-118).
 *
 * Principle: a level is awarded only on facts the platform verified
 * independently.
 *   - A self-reported checkbox is a DECLARATION, not evidence.
 *   - An upload proves a file was SUBMITTED, not that its content meets a criterion.
 *   - A client can never write a platform-produced fact (`signal.*`, `verified.*`,
 *     `followup.*`), nor impersonate the upload producer (`file.*`) or the link
 *     producer (`link.*`).
 *
 * A criterion is INDEPENDENTLY VERIFIED when:
 *   - a named human reviewer decided it (evaluator `human`, after review), or
 *   - it is a rule over artifacts the platform itself produced and verified
 *     (`verified.*`). There is no such producer today; it is the namespace a
 *     future test runner writes.
 * Declarations, uploads, links and LLM output never verify a criterion by themselves.
 *
 * Whether this is REQUIRED is configuration: `verification_policy.promotion_basis`.
 *   - `independently_verified`: the safety baseline after this remediation.
 *   - `legacy_any_pass`: the pre-remediation behaviour; development/test
 *     compatibility only. Never usable in production (refused here, at
 *     activation and in the database).
 */
import { DomainError } from './errors.js';
import type { PublishedRubric, SubmissionArtifact } from './evaluator.js';

export const PROMOTION_BASES = ['independently_verified', 'legacy_any_pass'] as const;
export type PromotionBasis = (typeof PROMOTION_BASES)[number];

/** Artifact namespaces only the platform writes. A client request carrying one is refused. */
export const CLIENT_FORBIDDEN_ARTIFACT_PREFIXES: readonly string[] = ['signal.', 'verified.', 'followup.', 'file.', 'link.'];

/** Refuses a client-supplied artifact in a platform-owned namespace (files come from uploads, links from externalUrls, signals from the platform). */
export function assertClientArtifactAllowed(a: { readonly key: string }): void {
  const p = CLIENT_FORBIDDEN_ARTIFACT_PREFIXES.find((x) => a.key.startsWith(x));
  if (p) {
    throw new DomainError(`artifact '${a.key}' is in the platform-owned '${p}' namespace: ${p === 'file.' ? 'files come only from confirmed uploads' : p === 'link.' ? 'links come only from externalUrls' : 'only the platform produces these facts; a client value is never trusted'}`);
  }
}

export const ARTIFACT_PROVENANCES = ['platform_verified', 'uploaded_file', 'submitted_link', 'declared'] as const;
export type ArtifactProvenance = (typeof ARTIFACT_PROVENANCES)[number];

/** Where an artifact came from. Unknown ⇒ `declared` (fail closed). */
export function artifactProvenance(a: SubmissionArtifact & { readonly provenance?: ArtifactProvenance }): ArtifactProvenance {
  return a.provenance ?? 'declared';
}

export interface AssessmentBasis {
  /** True only when every skill-evidence criterion that counted was independently verified and the rubric values are SME-approved. */
  readonly independentlyVerified: boolean;
  readonly reasons: readonly string[];
}

/**
 * Whether this assessment may support a level under `independently_verified`.
 *   - The rubric's values (weights, thresholds, pass threshold) are approved by a named SME (OPEN-043), on non-demo content.
 *   - Every `skill_evidence` criterion is decided by a human reviewer, or is a rule whose every artifact is platform-verified.
 *   - Gate and quality criteria (they never produce evidence) may rest on submitted material.
 */
export function assessmentBasis(p: {
  readonly rubric: Pick<PublishedRubric, 'criteria'>;
  readonly artifacts: readonly (SubmissionArtifact & { readonly provenance?: ArtifactProvenance })[];
  /** Criteria a named human reviewer has decided for this run (finalised human review). */
  readonly humanDecidedCriteria: readonly string[];
  readonly rubricValuesApproved: boolean;
  readonly rubricIsDemo: boolean;
}): AssessmentBasis {
  const reasons: string[] = [];
  if (p.rubricIsDemo) reasons.push('the rubric is DEMO content (never SME-approved)');
  if (!p.rubricValuesApproved) reasons.push('the rubric values (weights, thresholds, pass threshold) are not approved by a named SME');
  const byKey = new Map(p.artifacts.map((a) => [a.key, a]));
  const human = new Set(p.humanDecidedCriteria);
  for (const c of p.rubric.criteria) {
    if ((c.kind ?? 'skill_evidence') !== 'skill_evidence') continue;
    const ev = c.evaluatorType ?? 'rule';
    if (ev === 'human') {
      if (!human.has(c.key)) reasons.push(`criterion '${c.key}' needs a human reviewer's decision`);
      continue;
    }
    if (ev !== 'rule' || !c.check) { reasons.push(`criterion '${c.key}' has no independent verifier`); continue; }
    const keys = c.check.type === 'all_of' ? c.check.artifactKeys : [c.check.artifactKey];
    for (const k of keys) {
      const a = byKey.get(k);
      const prov = a ? artifactProvenance(a) : null;
      if (prov !== 'platform_verified') {
        reasons.push(`criterion '${c.key}' rests on '${k}', which is ${prov === null ? 'missing' : prov === 'declared' ? 'a declaration by the submitter' : prov === 'uploaded_file' ? 'a submitted file (its content is not verified)' : 'a submitted link (its content is not verified)'}`);
      }
    }
  }
  return { independentlyVerified: reasons.length === 0, reasons };
}
