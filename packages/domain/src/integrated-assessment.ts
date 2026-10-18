import { DomainError } from './errors.js';

/**
 * EXT-1 (ENG-1, inactive development extension) — `integrated_assessment_passed`.
 *
 * Expresses the SME's third readiness condition ("the integrated practical assessment is passed") as a readiness
 * rule. It reads ONE explicitly approved integrated activity, at explicitly listed activity versions, each pinned to
 * the rubric version that must have assessed it. It invents nothing:
 *   PR-2  every gate criterion and every mandatory criterion of the pinned rubric is `met` on the final assessment;
 *   PR-1  PR-2 AND total / max ≥ the rubric's pass_threshold — only when that threshold is APPROVED (else indeterminate).
 * Which rule applies is the SME/PO decision DM-6; the rule names it, the code never chooses it.
 *
 * Separation (PO Task C):
 *   activity completion  — a submission exists (`completion.submitted`)
 *   assessment success   — the pass rule holds on an ELIGIBLE final result (`completion.passed`)
 *   readiness            — this rule's outcome is one input of a rule set that stays `pending_validation` while sealed
 * Per-skill attribution is kept: the audit lists each skill's own per-skill outcome and decision on the counted
 * result, unmerged; the rule never reads or moves a level. Pure; fail closed.
 */
export const INTEGRATED_PASS_RULES = ['PR-1', 'PR-2'] as const;
export type IntegratedPassRule = (typeof INTEGRATED_PASS_RULES)[number];

export interface IntegratedAssessmentParams {
  readonly activity_code: string;
  /** Explicit (never '*'): each allowed activity version with the ONE rubric version pinned to it. */
  readonly allowed: readonly { readonly activity_version: string; readonly rubric_version: string }[];
  readonly pass_rule: IntegratedPassRule;
  /** Must be true: a result with a pending human review never counts. */
  readonly require_concluded_review: true;
}

const SLUG = /^[a-z][a-z0-9_]{1,80}$/;
export function parseIntegratedAssessmentParams(raw: unknown, ruleId = 'rule'): IntegratedAssessmentParams {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new DomainError(`rule ${ruleId}: integrated_assessment_passed params must be an object`);
  const p = raw as Record<string, unknown>;
  const known = new Set(['activity_code', 'allowed', 'pass_rule', 'require_concluded_review']);
  for (const k of Object.keys(p)) if (!known.has(k)) throw new DomainError(`rule ${ruleId}: unknown parameter '${k}' (nothing is defaulted or ignored)`);
  if (typeof p['activity_code'] !== 'string' || !SLUG.test(p['activity_code'])) throw new DomainError(`rule ${ruleId}: activity_code must be an activity slug`);
  if (!Array.isArray(p['allowed']) || p['allowed'].length === 0) throw new DomainError(`rule ${ruleId}: allowed must list at least one { activity_version, rubric_version } pin (no wildcard)`);
  const seen = new Set<string>();
  const allowed = (p['allowed'] as unknown[]).map((x, i) => {
    if (!x || typeof x !== 'object') throw new DomainError(`rule ${ruleId}: allowed[${i}] must be an object`);
    const a = x as Record<string, unknown>;
    if (Object.keys(a).some((k) => k !== 'activity_version' && k !== 'rubric_version')) throw new DomainError(`rule ${ruleId}: allowed[${i}] has an unknown field`);
    if (typeof a['activity_version'] !== 'string' || !a['activity_version'] || a['activity_version'] === '*') throw new DomainError(`rule ${ruleId}: allowed[${i}].activity_version must be an explicit version`);
    if (typeof a['rubric_version'] !== 'string' || !a['rubric_version'] || a['rubric_version'] === '*') throw new DomainError(`rule ${ruleId}: allowed[${i}].rubric_version must be an explicit, pinned rubric version`);
    if (seen.has(a['activity_version'])) throw new DomainError(`rule ${ruleId}: activity version ${a['activity_version']} is pinned twice`);
    seen.add(a['activity_version']);
    return { activity_version: a['activity_version'], rubric_version: a['rubric_version'] };
  });
  if (!(INTEGRATED_PASS_RULES as readonly unknown[]).includes(p['pass_rule'])) throw new DomainError(`rule ${ruleId}: pass_rule must be PR-1 or PR-2 (the SME/PO decision DM-6)`);
  if (p['require_concluded_review'] !== true) throw new DomainError(`rule ${ruleId}: require_concluded_review must be true (a pending review never counts)`);
  return { activity_code: p['activity_code'], allowed, pass_rule: p['pass_rule'] as IntegratedPassRule, require_concluded_review: true };
}

/** Content facts the rule set author must satisfy when the rule is CREATED (fail closed when content approval is missing). */
export interface IntegratedCatalogVersion {
  readonly activityVersion: string; readonly activityPublished: boolean; readonly activityIsDemo: boolean;
  readonly rubrics: readonly { readonly version: string; readonly published: boolean; readonly isDemo: boolean; readonly valuesApproved: boolean; readonly boundToActivityVersion: boolean;
    readonly gateOrMandatoryCriteria: number }[];
}
export function validateIntegratedCatalog(p: IntegratedAssessmentParams, catalog: readonly IntegratedCatalogVersion[]): void {
  for (const pin of p.allowed) {
    // A slug@version can exist as a demo fixture AND as canonical content: only the published, non-demo row qualifies.
    const v = catalog.find((c) => c.activityVersion === pin.activity_version && c.activityPublished && !c.activityIsDemo);
    if (!v) throw new DomainError(`EXT-1: ${p.activity_code}@${pin.activity_version} is not a published, non-demo activity version`);
    const r = v.rubrics.find((x) => x.version === pin.rubric_version);
    if (!r || !r.published || r.isDemo) throw new DomainError(`EXT-1: rubric ${pin.rubric_version} is not a published, non-demo rubric of ${p.activity_code}@${pin.activity_version}`);
    if (!r.boundToActivityVersion) throw new DomainError(`EXT-1: rubric ${pin.rubric_version} is not bound to ${p.activity_code}@${pin.activity_version} (ENG-1 P0 pinning)`);
    if (!r.valuesApproved) throw new DomainError(`EXT-1: rubric ${pin.rubric_version} values are not SME-approved`);
    if (r.gateOrMandatoryCriteria === 0) throw new DomainError(`EXT-1: rubric ${pin.rubric_version} names no gate or mandatory criterion; a pass rule over nothing is never accepted`);
  }
}

export interface IntegratedResultFact {
  readonly evaluationResultId: string;
  readonly submissionId: string;
  readonly evaluatedAt: string;
  readonly activityCode: string;
  readonly activityVersion: string;
  readonly rubricVersion: string;
  readonly activityPublished: boolean; readonly activityIsDemo: boolean;
  readonly rubricPublished: boolean; readonly rubricIsDemo: boolean; readonly rubricValuesApproved: boolean;
  /** Not superseded by a later result of the same evaluation (human review conclusion). */
  readonly resultFinal: boolean;
  readonly evaluationOutcome: string;
  /** Any criterion still waiting for a human decision. */
  readonly pendingHumanCriteria: number;
  /** Any integrity check that failed on this result. */
  readonly integrityFailed: boolean;
  readonly criteria: readonly { readonly key: string; readonly kind: 'gate' | 'skill_evidence' | 'quality'; readonly mandatory: boolean; readonly status: string | null; readonly score: number | null; readonly maxScore: number | null }[];
  readonly passThreshold: number | null;
  readonly passThresholdApproved: boolean;
  /** Evidence rows derived from this result: standing and withdrawn counts. */
  readonly evidenceStanding: number;
  readonly evidenceWithdrawn: number;
  /** Per-skill attribution (P3+): each skill's own outcome and decision on this result. Empty ⇒ a legacy result. */
  readonly perSkill: readonly { readonly skillId: string; readonly outcome: string; readonly decision: string | null }[];
  /** The claim behind the submission falls in an audit anomaly class. */
  readonly claimAnomaly: boolean;
}

export type IntegratedExclusion =
  | 'not_final' | 'demo' | 'unpublished' | 'values_unapproved' | 'version_not_allowed' | 'rubric_not_pinned' | 'claim_anomaly'
  | 'legacy_no_per_skill' | 'incomplete' | 'review_pending' | 'integrity_failed' | 'evidence_withdrawn' | 'no_standing_evidence';

export function integratedExclusion(f: IntegratedResultFact, p: IntegratedAssessmentParams): IntegratedExclusion | null {
  if (!f.resultFinal) return 'not_final';
  if (f.activityIsDemo || f.rubricIsDemo) return 'demo';
  if (!f.activityPublished || !f.rubricPublished) return 'unpublished';
  if (!f.rubricValuesApproved) return 'values_unapproved';
  const pin = p.allowed.find((a) => a.activity_version === f.activityVersion);
  if (f.activityCode !== p.activity_code || !pin) return 'version_not_allowed';
  if (pin.rubric_version !== f.rubricVersion) return 'rubric_not_pinned';
  if (f.claimAnomaly) return 'claim_anomaly';
  if (f.perSkill.length === 0) return 'legacy_no_per_skill';
  if (f.evaluationOutcome === 'undetermined') return 'incomplete';
  if (f.evaluationOutcome === 'needs_human_review' || f.pendingHumanCriteria > 0) return 'review_pending';
  if (f.integrityFailed || f.evaluationOutcome === 'blocked_by_checks') return 'integrity_failed';
  // A withdrawal (e.g. "not my own work") voids the pass; the result needs standing evidence.
  if (f.evidenceWithdrawn > 0) return 'evidence_withdrawn';
  if (f.evidenceStanding === 0) return 'no_standing_evidence';
  return null;
}

export type IntegratedPassVerdict = { readonly verdict: 'passed' } | { readonly verdict: 'failed'; readonly reasons: readonly string[] } | { readonly verdict: 'indeterminate'; readonly reasons: readonly string[] };

export function integratedPassVerdict(f: IntegratedResultFact, rule: IntegratedPassRule): IntegratedPassVerdict {
  const required = f.criteria.filter((c) => c.kind === 'gate' || c.mandatory);
  if (required.length === 0) return { verdict: 'indeterminate', reasons: ['the pinned rubric names no gate or mandatory criterion'] };
  const unknown = required.filter((c) => c.status === null);
  if (unknown.length) return { verdict: 'indeterminate', reasons: [`no recorded result for ${unknown.map((c) => c.key).join(', ')}`] };
  const unmet = required.filter((c) => c.status !== 'met');
  if (unmet.length) return { verdict: 'failed', reasons: [`not met: ${unmet.map((c) => c.key).join(', ')}`] };
  if (rule === 'PR-2') return { verdict: 'passed' };
  if (!f.passThresholdApproved || f.passThreshold === null) return { verdict: 'indeterminate', reasons: ['PR-1 needs the rubric pass threshold, which is not approved'] };
  const scored = f.criteria.filter((c) => c.score !== null && c.maxScore !== null);
  if (scored.length !== f.criteria.length) return { verdict: 'indeterminate', reasons: ['PR-1 needs every criterion scored'] };
  const total = scored.reduce((a, c) => a + c.score!, 0); const max = scored.reduce((a, c) => a + c.maxScore!, 0);
  if (max <= 0) return { verdict: 'indeterminate', reasons: ['PR-1: the rubric has no scorable maximum'] };
  return total / max >= f.passThreshold ? { verdict: 'passed' } : { verdict: 'failed', reasons: [`total ${total}/${max} is below the approved pass threshold`] };
}

export interface IntegratedAssessmentAudit {
  readonly activity: string;
  readonly passRule: IntegratedPassRule;
  readonly completion: { readonly submitted: number; readonly finalResults: number; readonly passed: boolean };
  readonly counted: { readonly evaluationResultId: string; readonly activity: string; readonly rubricVersion: string; readonly perSkill: IntegratedResultFact['perSkill'] } | null;
  readonly excluded: readonly { readonly evaluationResultId: string; readonly reason: IntegratedExclusion }[];
  readonly judged: readonly { readonly evaluationResultId: string; readonly verdict: IntegratedPassVerdict['verdict']; readonly reasons: readonly string[] }[];
  readonly outcome: 'satisfied' | 'not_satisfied' | 'indeterminate';
  readonly reasons: readonly string[];
}

export function evaluateIntegratedAssessment(p: { readonly params: IntegratedAssessmentParams; readonly results: readonly IntegratedResultFact[]; readonly submissions: number }): IntegratedAssessmentAudit {
  const excluded: { evaluationResultId: string; reason: IntegratedExclusion }[] = [];
  const judged: { evaluationResultId: string; verdict: IntegratedPassVerdict['verdict']; reasons: readonly string[] }[] = [];
  let counted: IntegratedAssessmentAudit['counted'] = null;
  const ordered = [...p.results].sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt) || a.evaluationResultId.localeCompare(b.evaluationResultId));
  for (const f of ordered) {
    const why = integratedExclusion(f, p.params);
    if (why) { excluded.push({ evaluationResultId: f.evaluationResultId, reason: why }); continue; }
    const v = integratedPassVerdict(f, p.params.pass_rule);
    judged.push({ evaluationResultId: f.evaluationResultId, verdict: v.verdict, reasons: v.verdict === 'passed' ? [] : v.reasons });
    if (v.verdict === 'passed' && !counted) counted = { evaluationResultId: f.evaluationResultId, activity: `${f.activityCode}@${f.activityVersion}`, rubricVersion: f.rubricVersion, perSkill: f.perSkill };
  }
  const finalResults = p.results.filter((f) => f.resultFinal).length;
  const reasons: string[] = [];
  let outcome: IntegratedAssessmentAudit['outcome'];
  if (counted) outcome = 'satisfied';
  else if (judged.some((j) => j.verdict === 'indeterminate') || excluded.some((x) => x.reason === 'review_pending')) {
    outcome = 'indeterminate'; reasons.push('an eligible result cannot be judged yet (review pending or pass rule not decidable)');
  } else {
    outcome = 'not_satisfied';
    reasons.push(p.submissions === 0 ? 'the integrated activity has not been attempted' : judged.length === 0 ? 'no eligible final assessment of the integrated activity' : 'the integrated assessment was not passed');
  }
  return { activity: p.params.activity_code, passRule: p.params.pass_rule, completion: { submitted: p.submissions, finalResults, passed: counted !== null },
    counted, excluded, judged, outcome, reasons };
}
