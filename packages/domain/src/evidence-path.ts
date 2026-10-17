/**
 * ENG-1 P4 / EXT-2 — `skill_evidence_path`: independent evidence for one skill (pure, deterministic).
 *
 * Counted unit: an AUTHORIZED per-skill TASK RESULT (one evaluation result × one skill) that passes every test
 * (docs/architecture/ENG-1-P4-READINESS-EXT-2-DESIGN.md §2, T1–T7). A met assessment alone is never enough: the
 * decision must be positive (accepted / evidence_reestablished / evidence_corroborated — never exception_granted, PO-2) and the evidence
 * it produced must still stand.
 *
 * Independence (only where a path needs ≥ 2 tasks):
 *   I-2 variant family  tasks collapse by variant family; repeated attempts of one activity always collapse;
 *                       different activity ids alone never establish independence (missing family ⇒ indeterminate)
 *   I-5 artifact reuse  tasks sharing a learner upload checksum or a normalized text hash count once
 *                       (an activity's platform starter files are excluded)
 *   I-1 purpose         when required, one counted task must be a validation activity (unknown purpose ⇒ indeterminate)
 *   I-3 own criteria    the task's counted criteria — listed per activity, per skill, per rule version — were met
 *                       in THAT evaluation, by that skill's own assessment
 *
 * Fail closed: a missing fact never satisfies; it yields `indeterminate`. Nothing here writes or moves a level.
 */

import { DomainError } from './errors.js';

export const TASK_PURPOSES = ['practice', 'validation', 'integrated'] as const;
export type TaskPurpose = (typeof TASK_PURPOSES)[number];
export const UNDERSTANDING_MODES = ['none', 'within_criterion', 'integrated_code_understanding'] as const;
export type UnderstandingMode = (typeof UNDERSTANDING_MODES)[number];
export const LEGACY_RESULT_MODES = ['exclude', 'adapter'] as const;
export type LegacyResultMode = (typeof LEGACY_RESULT_MODES)[number];

/** Decisions that may support a counted task (the same definition as CLM-1). `exception_granted` is excluded (PO-2). */
export const POSITIVE_TASK_DECISIONS = ['accepted', 'evidence_reestablished', 'evidence_corroborated'] as const;

export interface CountedActivity { readonly versions: readonly string[] | '*'; readonly criteria: readonly string[] }
export interface SkillEvidencePathParams {
  readonly min_distinct_tasks: number;
  /** activity code (slug) → the activity versions that count and the criterion keys that must ALL be met in that task. */
  readonly counted_criteria: Readonly<Record<string, CountedActivity>>;
  readonly require_validation_activity: boolean;
  readonly understanding: UnderstandingMode;
  /** Required for `integrated_code_understanding`: where the understanding element is assessed. */
  readonly understanding_source?: { readonly activity: string; readonly versions: readonly string[] | '*'; readonly criteria: readonly string[] };
  /** Whether pre-P3 (legacy, primary-skill scope) results may count through the adapter. Default: exclude (fail closed). */
  readonly legacy_results: LegacyResultMode;
}

const PARAM_KEYS = new Set(['min_distinct_tasks', 'counted_criteria', 'require_validation_activity', 'understanding', 'understanding_source', 'legacy_results']);
const CODE = /^[a-z][a-z0-9_.-]{1,95}$/;
const KEY = /^[a-z][a-z0-9_.-]{0,95}$/;

function versionsOf(v: unknown, where: string): readonly string[] | '*' {
  if (v === '*') return '*';
  if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(x))) throw new DomainError(`${where}: versions must be '*' or a non-empty list of semantic versions`);
  return v as string[];
}
function criteriaOf(v: unknown, where: string): readonly string[] {
  if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === 'string' && KEY.test(x))) throw new DomainError(`${where}: criteria must be a non-empty list of criterion keys`);
  if (new Set(v).size !== v.length) throw new DomainError(`${where}: duplicate criterion key`);
  return v as string[];
}

/** Strict shape of the params (unknown keys refused). Catalog validation against published rubrics is `validateSkillEvidencePathCatalog`. */
export function parseSkillEvidencePathParams(params: Readonly<Record<string, unknown>>, ruleId: string): SkillEvidencePathParams {
  for (const k of Object.keys(params)) if (!PARAM_KEYS.has(k)) throw new DomainError(`rule ${ruleId}: unknown skill_evidence_path param '${k}'`);
  const n = params['min_distinct_tasks'];
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) throw new DomainError(`rule ${ruleId}: min_distinct_tasks must be a positive integer (a per-skill value; no universal minimum)`);
  const cc = params['counted_criteria'];
  if (!cc || typeof cc !== 'object' || Array.isArray(cc) || Object.keys(cc).length === 0) throw new DomainError(`rule ${ruleId}: counted_criteria must name at least one activity`);
  const counted: Record<string, CountedActivity> = {};
  for (const [code, spec] of Object.entries(cc as Record<string, unknown>)) {
    if (!CODE.test(code)) throw new DomainError(`rule ${ruleId}: '${code}' is not an activity code`);
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new DomainError(`rule ${ruleId}: counted_criteria.${code} must be { versions, criteria }`);
    const s = spec as Record<string, unknown>;
    for (const k of Object.keys(s)) if (k !== 'versions' && k !== 'criteria') throw new DomainError(`rule ${ruleId}: counted_criteria.${code} has unknown key '${k}'`);
    counted[code] = { versions: versionsOf(s['versions'], `rule ${ruleId} counted_criteria.${code}`), criteria: criteriaOf(s['criteria'], `rule ${ruleId} counted_criteria.${code}`) };
  }
  const rv = params['require_validation_activity'];
  if (typeof rv !== 'boolean') throw new DomainError(`rule ${ruleId}: require_validation_activity must be a boolean`);
  if (rv && n < 2) throw new DomainError(`rule ${ruleId}: require_validation_activity is meaningful only when min_distinct_tasks ≥ 2`);
  const u = params['understanding'];
  if (!(UNDERSTANDING_MODES as readonly unknown[]).includes(u)) throw new DomainError(`rule ${ruleId}: understanding must be one of ${UNDERSTANDING_MODES.join(' | ')}`);
  let source: SkillEvidencePathParams['understanding_source'];
  if (u === 'integrated_code_understanding') {
    const src = params['understanding_source'] as Record<string, unknown> | undefined;
    if (!src || typeof src !== 'object' || typeof src['activity'] !== 'string' || !CODE.test(src['activity'] as string)) throw new DomainError(`rule ${ruleId}: integrated_code_understanding needs understanding_source { activity, versions, criteria }`);
    source = { activity: src['activity'] as string, versions: versionsOf(src['versions'], `rule ${ruleId} understanding_source`), criteria: criteriaOf(src['criteria'], `rule ${ruleId} understanding_source`) };
  } else if (params['understanding_source'] !== undefined) {
    throw new DomainError(`rule ${ruleId}: understanding_source is only meaningful with integrated_code_understanding`);
  }
  const legacy = params['legacy_results'] ?? 'exclude';
  if (!(LEGACY_RESULT_MODES as readonly unknown[]).includes(legacy)) throw new DomainError(`rule ${ruleId}: legacy_results must be exclude | adapter`);
  return { min_distinct_tasks: n, counted_criteria: counted, require_validation_activity: rv, understanding: u as UnderstandingMode, ...(source ? { understanding_source: source } : {}), legacy_results: legacy as LegacyResultMode };
}

/** What the published content says, for catalog validation: per activity code, per version, its criteria. */
export interface PathCatalogActivity {
  readonly code: string; readonly version: string; readonly published: boolean; readonly isDemo: boolean;
  readonly criteria: readonly { readonly key: string; readonly kind: string; readonly canonicalSkillId: string | null }[];
}

/**
 * Catalog validation at rule-set creation: every counted activity resolves to a published, non-demo version; every
 * counted key exists there, is a skill_evidence criterion and measures THIS skill (canonical). A task can never count
 * for one skill through another skill's criterion.
 */
export function validateSkillEvidencePathCatalog(p: SkillEvidencePathParams, skillId: string, catalog: readonly PathCatalogActivity[], ruleId: string): void {
  const check = (code: string, versions: readonly string[] | '*', criteria: readonly string[], measuresSkill: boolean) => {
    const rows = catalog.filter((a) => a.code === code && a.published && !a.isDemo && (versions === '*' || versions.includes(a.version)));
    if (rows.length === 0) throw new DomainError(`rule ${ruleId}: no published, non-demo version of activity '${code}' matches ${versions === '*' ? 'any version' : versions.join(', ')}`);
    if (versions !== '*') for (const v of versions) if (!rows.some((r) => r.version === v)) throw new DomainError(`rule ${ruleId}: activity '${code}' has no published, non-demo version ${v}`);
    for (const a of rows) {
      for (const key of criteria) {
        const c = a.criteria.find((x) => x.key === key);
        if (!c) throw new DomainError(`rule ${ruleId}: criterion '${key}' does not exist on ${code}@${a.version}`);
        if (c.kind !== 'skill_evidence') throw new DomainError(`rule ${ruleId}: criterion '${key}' on ${code}@${a.version} is a ${c.kind} criterion, not skill evidence`);
        if (measuresSkill && c.canonicalSkillId !== skillId) throw new DomainError(`rule ${ruleId}: criterion '${key}' on ${code}@${a.version} measures another skill; it cannot count for this one`);
      }
    }
  };
  for (const [code, spec] of Object.entries(p.counted_criteria)) check(code, spec.versions, spec.criteria, true);
  if (p.understanding_source) check(p.understanding_source.activity, p.understanding_source.versions, p.understanding_source.criteria, false);
}

/** One (evaluation result × skill) candidate, as the API builds it from rows. Nothing here is a client input. */
export interface EvidenceTaskFact {
  readonly evaluationResultId: string;
  readonly evaluatedAt: string;
  readonly activitySpecId: string;
  readonly activityCode: string;
  readonly activityVersion: string;
  readonly activityPublished: boolean;
  readonly activityIsDemo: boolean;
  readonly rubricIsDemo: boolean;
  readonly rubricValuesApproved: boolean;
  readonly variantFamily: string | null;
  readonly taskPurpose: TaskPurpose | null;
  /** The result is the final one of its evaluation (not superseded by a human-review finalisation). */
  readonly resultFinal: boolean;
  readonly source: 'per_skill' | 'legacy';
  /** per_skill: the skill was claimed on the submission (PO-1: unclaimed observations never count). Legacy: true. */
  readonly claimed: boolean;
  /** per_skill: the skill's own outcome. Legacy: null. */
  readonly outcome: string | null;
  readonly basisIndependentlyVerified: boolean | null;
  /** criterion key → status for THIS skill (per_skill: its skill_assessment_criterion rows; legacy: the final assessment's results). */
  readonly criteria: Readonly<Record<string, string>>;
  readonly decision: { readonly id: string; readonly decision: string; readonly overridden: boolean; readonly policyValidated: boolean } | null;
  readonly evidence: { readonly id: string; readonly standing: boolean } | null;
  /** Legacy only: whether the whole-activity result was explicitly attributed to this skill (ENG-1 P0 audit payload or an unambiguous single primary claim). */
  readonly legacyAttribution: 'attributed' | 'unverifiable' | null;
  /** The claim behind it falls in an audit anomaly class (C1–C3, C5, C6). */
  readonly claimAnomaly: boolean;
  readonly skillAssessmentId: string | null;
  /** Server-measured checksums of the learner's uploads in this submission (never returned to a client). */
  readonly uploadChecksums: readonly string[];
  /** Server-computed hashes of the normalized text deliverables of this submission (never returned to a client). */
  readonly textHashes: readonly string[];
  /** Platform starter-file checksums of this activity: never a reuse conflict. */
  readonly starterChecksums: readonly string[];
}

export type TaskExclusion =
  | 'not_final' | 'demo' | 'unpublished' | 'values_unapproved' | 'activity_not_counted' | 'version_not_listed' | 'claim_anomaly'
  | 'legacy_excluded' | 'legacy_attribution_unverifiable' | 'legacy_criteria_unavailable'
  | 'not_claimed' | 'not_met' | 'unverified_basis' | 'decision_not_positive' | 'overridden' | 'policy_unvalidated'
  | 'no_evidence' | 'withdrawn' | 'criteria_not_met';

/** Why a candidate does not count (T1–T7 + I-3), or null when it counts. Order is fixed and documented. */
export function taskExclusion(f: EvidenceTaskFact, p: SkillEvidencePathParams, env: { readonly production: boolean }): TaskExclusion | null {
  if (!f.resultFinal) return 'not_final';
  if (f.activityIsDemo || f.rubricIsDemo) return 'demo';
  if (!f.activityPublished) return 'unpublished';
  if (!f.rubricValuesApproved) return 'values_unapproved';
  const spec = p.counted_criteria[f.activityCode];
  if (!spec) return 'activity_not_counted';
  if (spec.versions !== '*' && !spec.versions.includes(f.activityVersion)) return 'version_not_listed';
  if (f.claimAnomaly) return 'claim_anomaly';
  if (f.source === 'legacy') {
    if (p.legacy_results === 'exclude') return 'legacy_excluded';
    if (f.legacyAttribution !== 'attributed') return 'legacy_attribution_unverifiable';
  } else {
    if (!f.claimed) return 'not_claimed';
    if (f.outcome !== 'met') return 'not_met';
    if (f.basisIndependentlyVerified !== true) return 'unverified_basis';
  }
  if (!f.decision || !(POSITIVE_TASK_DECISIONS as readonly string[]).includes(f.decision.decision)) return 'decision_not_positive';
  if (f.decision.overridden) return 'overridden';
  if (env.production && !f.decision.policyValidated) return 'policy_unvalidated';
  if (!f.evidence) return 'no_evidence';
  if (!f.evidence.standing) return 'withdrawn';
  for (const key of spec.criteria) {
    const st = f.criteria[key];
    if (st === undefined) return f.source === 'legacy' ? 'legacy_criteria_unavailable' : 'criteria_not_met';
    if (st !== 'met') return 'criteria_not_met';
  }
  return null;
}

export type PathOutcome = 'satisfied' | 'not_satisfied' | 'indeterminate';
export interface SkillEvidencePathAudit {
  readonly skillId: string;
  readonly minDistinctTasks: number;
  readonly counted: readonly { group: string; variantFamily: string | null; activity: string; evaluationResultId: string; skillAssessmentId: string | null; decisionId: string; evidenceId: string; source: 'per_skill' | 'legacy'; criteria: Readonly<Record<string, string>> }[];
  readonly collapsed: readonly { group: string; kept: string; dropped: readonly string[] }[];
  readonly excluded: readonly { evaluationResultId: string; reason: TaskExclusion }[];
  /** ids only — never a checksum or a hash. */
  readonly reuseConflicts: readonly { a: string; b: string; sharedBy: 'upload' | 'text' }[];
  readonly independentTasks: number;
  readonly validationPresent: boolean | null;
  readonly understanding: 'not_required' | 'met' | 'not_met' | 'unknown';
  readonly outcome: PathOutcome;
  readonly reasons: readonly string[];
  /** Some counted task rests on a decision of an unvalidated (development-only) policy. Never true in production. */
  readonly developmentOnly: boolean;
}

/**
 * EXT-2 evaluation for one skill. Pure. `understandingMet`: null when the understanding element was never assessed
 * on an eligible result (⇒ indeterminate), undefined when the path does not need it.
 */
export function evaluateSkillEvidencePath(p: {
  readonly params: SkillEvidencePathParams; readonly skillId: string; readonly tasks: readonly EvidenceTaskFact[];
  readonly understandingMet?: boolean | null; readonly production: boolean;
}): SkillEvidencePathAudit {
  const { params } = p;
  const reasons: string[] = [];
  const excluded: { evaluationResultId: string; reason: TaskExclusion }[] = [];
  const eligible: EvidenceTaskFact[] = [];
  // One candidate per (result, skill): a defensive de-duplication (the database already guarantees it).
  const seen = new Set<string>();
  for (const f of [...p.tasks].sort((a, b) => a.evaluationResultId.localeCompare(b.evaluationResultId))) {
    if (seen.has(f.evaluationResultId)) { excluded.push({ evaluationResultId: f.evaluationResultId, reason: 'not_final' }); continue; }
    seen.add(f.evaluationResultId);
    const why = taskExclusion(f, params, { production: p.production });
    if (why) excluded.push({ evaluationResultId: f.evaluationResultId, reason: why }); else eligible.push(f);
  }
  // I-6 / I-2: repeated attempts of one activity always collapse; otherwise tasks collapse by variant family.
  const groupOf = (f: EvidenceTaskFact) => f.variantFamily !== null ? `family:${f.variantFamily}` : `activity:${f.activitySpecId}`;
  const groups = new Map<string, EvidenceTaskFact[]>();
  for (const f of eligible) (groups.get(groupOf(f)) ?? groups.set(groupOf(f), []).get(groupOf(f))!).push(f);
  // An activity without a family can still share a family-less group with nothing else; but a family-less activity
  // that ALSO appears under a family (cannot happen: family is per activity) is impossible by construction.
  const kept: EvidenceTaskFact[] = [];
  const collapsed: { group: string; kept: string; dropped: string[] }[] = [];
  for (const [g, fs] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...fs].sort((a, b) => (b.evaluatedAt.localeCompare(a.evaluatedAt)) || a.evaluationResultId.localeCompare(b.evaluationResultId));
    kept.push(sorted[0]!);
    if (sorted.length > 1) collapsed.push({ group: g, kept: sorted[0]!.evaluationResultId, dropped: sorted.slice(1).map((x) => x.evaluationResultId) });
  }
  // I-5: groups sharing a learner artifact count once (union-find over kept tasks). Starter files never conflict.
  const parent = kept.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const reuseConflicts: { a: string; b: string; sharedBy: 'upload' | 'text' }[] = [];
  const own = (f: EvidenceTaskFact) => new Set(f.uploadChecksums.filter((c) => !f.starterChecksums.includes(c)));
  for (let i = 0; i < kept.length; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      const a = kept[i]!; const b = kept[j]!;
      const upl = [...own(a)].some((c) => own(b).has(c) && !b.starterChecksums.includes(c));
      const txt = a.textHashes.some((h) => b.textHashes.includes(h));
      if (upl || txt) { reuseConflicts.push({ a: a.evaluationResultId, b: b.evaluationResultId, sharedBy: upl ? 'upload' : 'text' }); parent[find(j)] = find(i); }
    }
  }
  const components = new Map<number, EvidenceTaskFact[]>();
  kept.forEach((f, i) => { const r = find(i); (components.get(r) ?? components.set(r, []).get(r)!).push(f); });
  const count = components.size;
  const min = params.min_distinct_tasks;

  let indeterminate = false;
  // Independence can be established only when every counted task's family is known (for a ≥ 2-task path).
  if (min >= 2 && count >= min && kept.some((f) => f.variantFamily === null)) {
    indeterminate = true; reasons.push('variant family unknown for a counted task: independence cannot be established');
  }
  let validationPresent: boolean | null = null;
  if (min >= 2 && params.require_validation_activity) {
    if (kept.some((f) => f.taskPurpose === 'validation')) validationPresent = true;
    else if (kept.some((f) => f.taskPurpose === null)) { validationPresent = null; if (count >= min) { indeterminate = true; reasons.push('task purpose unknown for a counted task: the validation requirement cannot be judged'); } }
    else { validationPresent = false; reasons.push('no counted task is a validation activity'); }
  }
  let understanding: SkillEvidencePathAudit['understanding'] = 'not_required';
  if (params.understanding === 'integrated_code_understanding') {
    if (p.understandingMet === true) understanding = 'met';
    else if (p.understandingMet === false) { understanding = 'not_met'; reasons.push('the integrated code-understanding element is not met'); }
    else { understanding = 'unknown'; reasons.push('the integrated code-understanding element has not been assessed on an eligible result'); }
  }
  if (count < min) reasons.push(`${count} independent task(s); the path needs ${min}`);

  let outcome: PathOutcome;
  if (count < min || validationPresent === false || understanding === 'not_met') outcome = 'not_satisfied';
  else if (indeterminate || understanding === 'unknown') outcome = 'indeterminate';
  else outcome = 'satisfied';

  return {
    skillId: p.skillId, minDistinctTasks: min,
    counted: kept.map((f) => ({ group: groupOf(f), variantFamily: f.variantFamily, activity: `${f.activityCode}@${f.activityVersion}`, evaluationResultId: f.evaluationResultId,
      skillAssessmentId: f.skillAssessmentId, decisionId: f.decision!.id, evidenceId: f.evidence!.id, source: f.source,
      criteria: Object.fromEntries((params.counted_criteria[f.activityCode]?.criteria ?? []).map((k) => [k, f.criteria[k]!])) })),
    collapsed, excluded, reuseConflicts, independentTasks: count, validationPresent, understanding, outcome, reasons,
    developmentOnly: kept.some((f) => !f.decision!.policyValidated),
  };
}

/** Stable key for an understanding source (the API computes one fact per key). */
export function understandingKey(src: NonNullable<SkillEvidencePathParams['understanding_source']>): string {
  return `${src.activity}|${src.versions === '*' ? '*' : [...src.versions].sort().join(',')}|${[...src.criteria].sort().join(',')}`;
}
