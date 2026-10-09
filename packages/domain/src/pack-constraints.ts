/**
 * Phase 9 (H5) — profession-dependent numeric pack constraints as governed,
 * versioned configuration.
 *
 * Before Phase 9 the pack validator carried seven numbers in code ("4–5 core
 * skills", "10–12 tasks", "exactly 3 activities", …). They are content policy:
 * an expert may reasonably change them for another profession or level. They
 * now live in `pack_constraint_set` rows (review_status + activation, the same
 * guard as every governed table). The migration-created baseline
 * `legacy_pack_constraints@1` holds exactly the old numbers; it is NOT SME
 * approved — it is the pre-existing behaviour, kept so historical imports and
 * production behave as before (equivalence proven against
 * `LEGACY_PACK_CONSTRAINTS` below, the frozen reference).
 *
 * What stays in code (never configuration): technical, security and
 * structural invariants — enums, references, provenance, bilingual fields,
 * "never Verified", "a pack cannot approve itself", integrity-check shapes, the
 * framework-independence rule (owner decision D-084), and the structural FLOORS
 * below (a value of 0 would make a pack meaningless, so it is refused even if
 * an expert wrote it).
 *
 * The vocabulary is CLOSED: an unknown constraint type is refused, never
 * interpreted. A genuinely new kind of rule is an explicit extension
 * (docs/architecture/EXPERT-RULE-EXTENSION-REGISTER.md), not a guess.
 */
import { DomainError, InvariantViolation } from './errors.js';
import { resolveActiveConfig, type GovernedConfig, type ConfigResolution } from './configuration.js';

export const PACK_CONSTRAINT_TYPES = [
  'core_skill_count',                    // core skills mapped to the role
  'task_count',                          // tasks in the track
  'activity_count',                      // activities in the track
  'activity_primary_skill_count',        // skills an activity measures deeply (depth = primary)
  'activity_core_primary_skill_count',   // of those, CORE skills
  'rubric_min_criteria',                 // criteria per rubric (lower bound)
  'resources_per_skill_max',             // learning resources per skill gap (upper bound)
] as const;
export type PackConstraintType = (typeof PACK_CONSTRAINT_TYPES)[number];

export interface PackConstraint { readonly type: PackConstraintType; readonly min: number | null; readonly max: number | null }
export interface PackConstraintSet extends GovernedConfig { readonly trackId: string | null; readonly constraints: readonly PackConstraint[] }

/** Which bounds each type may carry, and the structural floor a value may never go below. */
export const PACK_CONSTRAINT_SHAPE: Readonly<Record<PackConstraintType, { readonly bounds: 'range' | 'min' | 'max'; readonly floor: number; readonly labelAr: string; readonly labelEn: string }>> = {
  core_skill_count:                  { bounds: 'range', floor: 1, labelAr: 'عدد المهارات الأساسية للدور', labelEn: 'core skills per role' },
  task_count:                        { bounds: 'range', floor: 1, labelAr: 'عدد مهام المسار', labelEn: 'tasks per track' },
  activity_count:                    { bounds: 'range', floor: 1, labelAr: 'عدد أنشطة المسار', labelEn: 'activities per track' },
  activity_primary_skill_count:      { bounds: 'range', floor: 1, labelAr: 'المهارات المقيسة بعمق في كل نشاط', labelEn: 'primary skills per activity' },
  activity_core_primary_skill_count: { bounds: 'range', floor: 1, labelAr: 'المهارات الأساسية المقيسة بعمق في كل نشاط', labelEn: 'core primary skills per activity' },
  rubric_min_criteria:               { bounds: 'min',   floor: 1, labelAr: 'أدنى عدد معايير في الرُبريك', labelEn: 'minimum criteria per rubric' },
  resources_per_skill_max:           { bounds: 'max',   floor: 1, labelAr: 'أقصى عدد موارد تعلّم لكل فجوة', labelEn: 'maximum learning resources per skill gap' },
};

/**
 * FROZEN REFERENCE — the numbers `validatePack` hard-coded before Phase 9
 * (apps/api/src/career-data/pack-schema.ts, git 48fedfb..fc808d3). The
 * migration baseline must equal this, and the equivalence test proves the
 * configured checker reproduces the old verdicts with it. Do not edit.
 */
export const LEGACY_PACK_CONSTRAINTS: readonly PackConstraint[] = Object.freeze([
  { type: 'core_skill_count', min: 4, max: 5 },
  { type: 'task_count', min: 10, max: 12 },
  { type: 'activity_count', min: 3, max: 3 },
  { type: 'activity_primary_skill_count', min: 2, max: 3 },
  { type: 'activity_core_primary_skill_count', min: 2, max: 3 },
  { type: 'rubric_min_criteria', min: 5, max: null },
  { type: 'resources_per_skill_max', min: null, max: 3 },
] as const);

export class UnsupportedRuleType extends DomainError {
  constructor(readonly ruleType: string) {
    super(`unsupported pack constraint type '${ruleType}': it is not interpreted. A new kind of rule needs an explicit extension (docs/architecture/EXPERT-RULE-EXTENSION-REGISTER.md)`);
  }
}

/** Every type exactly once, known, bounds of the right shape, integers, min ≤ max, at or above the structural floor. Every problem is reported. */
export function assertPackConstraintsSane(constraints: readonly { type: string; min: number | null; max: number | null }[]): asserts constraints is readonly PackConstraint[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of constraints) {
    if (!(PACK_CONSTRAINT_TYPES as readonly string[]).includes(c.type)) throw new UnsupportedRuleType(c.type);
    if (seen.has(c.type)) problems.push(`${c.type}: stated twice`);
    seen.add(c.type);
    const shape = PACK_CONSTRAINT_SHAPE[c.type as PackConstraintType];
    for (const [name, v] of [['min', c.min], ['max', c.max]] as const) {
      if (v !== null && (!Number.isInteger(v) || v < shape.floor)) problems.push(`${c.type}: ${name} must be an integer ≥ ${shape.floor} (structural floor), got ${String(v)}`);
    }
    if (shape.bounds === 'range' && (c.min === null || c.max === null)) problems.push(`${c.type}: needs both a minimum and a maximum`);
    if (shape.bounds === 'min' && (c.min === null || c.max !== null)) problems.push(`${c.type}: carries a minimum only`);
    if (shape.bounds === 'max' && (c.max === null || c.min !== null)) problems.push(`${c.type}: carries a maximum only`);
    if (c.min !== null && c.max !== null && c.min > c.max) problems.push(`${c.type}: minimum ${c.min} is above maximum ${c.max}`);
  }
  for (const t of PACK_CONSTRAINT_TYPES) if (!seen.has(t)) problems.push(`${t}: missing — a constraint set states every constraint (no silent default)`);
  if (problems.length) throw new DomainError(`pack constraint set is not usable:\n  - ${problems.join('\n  - ')}`);
}

export class PackConstraintsUnavailable extends DomainError {}

export interface ResolvedPackConstraints { readonly ref: string; readonly setId: string; readonly scope: 'track' | 'global'; readonly resolution: ConfigResolution; readonly constraints: readonly PackConstraint[] }

/**
 * The set in effect for a pack's track: a track-specific set in effect wins;
 * otherwise the global one. Within a scope, production_active > development_only
 * (never in production) > legacy_baseline; two rows at the same level is a
 * CONFLICT and fails. Nothing in effect fails. Never a silent default.
 */
export function resolvePackConstraints(sets: readonly PackConstraintSet[], trackId: string, env: { production: boolean }): ResolvedPackConstraints {
  for (const scope of ['track', 'global'] as const) {
    const rows = sets.filter((s) => (scope === 'track' ? s.trackId === trackId : s.trackId === null));
    let r: ReturnType<typeof resolveActiveConfig<PackConstraintSet>>;
    try { r = resolveActiveConfig(rows, env); }
    catch (e) { throw new PackConstraintsUnavailable(`conflicting pack constraint configuration for ${scope === 'track' ? `track '${trackId}'` : 'the global scope'}: ${(e as Error).message}`); }
    if (r.row) {
      assertPackConstraintsSane(r.row.constraints);
      return { ref: `${r.row.key}@${r.row.version}`, setId: r.row.id, scope, resolution: r.resolution, constraints: r.row.constraints };
    }
  }
  throw new PackConstraintsUnavailable(`no pack constraint set is in effect for track '${trackId}' (none track-specific, none global${env.production ? ' validated for production' : ''}); the pack cannot be validated`);
}

/** The counts a pack exhibits, computed by the validator. */
export interface PackCounts {
  readonly coreSkills: number;
  readonly tasks: number;
  readonly activities: number;
  readonly activityPrimaries: readonly { readonly code: string; readonly primaries: number; readonly corePrimaries: number }[];
  readonly rubricCriteria: readonly { readonly code: string; readonly criteria: number }[];
  readonly resourcesPerSkill: readonly { readonly skill: string; readonly resources: number }[];
}
export interface PackCountViolation { readonly type: PackConstraintType; readonly subject: string; readonly found: number; readonly message: string }

const span = (c: PackConstraint): string => c.min !== null && c.max !== null ? (c.min === c.max ? `exactly ${c.min}` : `${c.min}–${c.max}`) : c.min !== null ? `at least ${c.min}` : `at most ${c.max}`;
const within = (c: PackConstraint, n: number): boolean => (c.min === null || n >= c.min) && (c.max === null || n <= c.max);

/** The configured numeric checks. Messages keep the pre-Phase-9 wording where it was stable, and name the set they came from. */
export function checkPackCounts(counts: PackCounts, resolved: Pick<ResolvedPackConstraints, 'ref' | 'constraints'>): PackCountViolation[] {
  const by = new Map(resolved.constraints.map((c) => [c.type, c]));
  const get = (t: PackConstraintType): PackConstraint => { const c = by.get(t); if (!c) throw new InvariantViolation('INV-8', `pack constraint '${t}' missing from ${resolved.ref}`); return c; };
  const out: PackCountViolation[] = [];
  const v = (type: PackConstraintType, subject: string, found: number, message: string) => out.push({ type, subject, found, message: `${message} [${resolved.ref}]` });
  const core = get('core_skill_count'); if (!within(core, counts.coreSkills)) v('core_skill_count', 'role', counts.coreSkills, `role: core skills must be ${span(core)}, found ${counts.coreSkills}`);
  const tasks = get('task_count'); if (!within(tasks, counts.tasks)) v('task_count', 'tasks', counts.tasks, `tasks: ${span(tasks)} expected, found ${counts.tasks}`);
  const acts = get('activity_count'); if (!within(acts, counts.activities)) v('activity_count', 'activities', counts.activities, `activities: ${span(acts)} expected, found ${counts.activities}`);
  const prim = get('activity_primary_skill_count'); const corePrim = get('activity_core_primary_skill_count');
  for (const a of counts.activityPrimaries) {
    if (!within(prim, a.primaries)) v('activity_primary_skill_count', a.code, a.primaries, `activity '${a.code}': an activity measures ${span(prim)} skills deeply (primary), found ${a.primaries}`);
    if (!within(corePrim, a.corePrimaries)) v('activity_core_primary_skill_count', a.code, a.corePrimaries, `activity '${a.code}': an activity measures ${span(corePrim)} CORE skills deeply, found ${a.corePrimaries}`);
  }
  const crit = get('rubric_min_criteria');
  for (const r of counts.rubricCriteria) if (!within(crit, r.criteria)) v('rubric_min_criteria', r.code, r.criteria, `rubric '${r.code}': ${span(crit)} criteria, found ${r.criteria}`);
  const res = get('resources_per_skill_max');
  for (const s of counts.resourcesPerSkill) if (!within(res, s.resources)) v('resources_per_skill_max', s.skill, s.resources, `skill '${s.skill}' has ${s.resources} resources; ${span(res)} per gap`);
  return out;
}

/**
 * FROZEN REFERENCE of the pre-Phase-9 numeric checks, transcribed literally
 * from the old validator (same literals, same comparisons). Used only by the
 * equivalence proof. Returns the violated checks as (type, subject).
 */
export function legacyPackCountViolations(counts: PackCounts): { type: PackConstraintType; subject: string }[] {
  const out: { type: PackConstraintType; subject: string }[] = [];
  const core = counts.coreSkills; if (!(core >= 4 && core <= 5)) out.push({ type: 'core_skill_count', subject: 'role' });
  if (!(counts.tasks >= 10 && counts.tasks <= 12)) out.push({ type: 'task_count', subject: 'tasks' });
  if (!(counts.activities === 3)) out.push({ type: 'activity_count', subject: 'activities' });
  for (const a of counts.activityPrimaries) {
    if (!(a.primaries >= 2 && a.primaries <= 3)) out.push({ type: 'activity_primary_skill_count', subject: a.code });
    if (!(a.corePrimaries >= 2 && a.corePrimaries <= 3)) out.push({ type: 'activity_core_primary_skill_count', subject: a.code });
  }
  for (const r of counts.rubricCriteria) if (!(r.criteria >= 5)) out.push({ type: 'rubric_min_criteria', subject: r.code });
  for (const s of counts.resourcesPerSkill) if (!(s.resources <= 3)) out.push({ type: 'resources_per_skill_max', subject: s.skill });
  return out;
}
