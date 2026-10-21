import { DomainError } from './errors.js';
import type { ReadinessRuleSet } from './readiness.js';

/**
 * DM-7b / P-3 (D-130) — the versioned PROFESSIONAL skill classification of a role: Must / Core / Supporting.
 *
 * Separate from the legacy `role_requirement.is_core` boolean, which keeps its v1 meaning and its v1 pack constraints
 * unchanged (D-2: no persistent mirror). Readers are version-aware: where a classification is IN EFFECT for a role, they
 * use it; everywhere else they use `is_core` exactly as before.
 *
 * Authority (D-3):
 *   - the approved classification is authoritative for skill CATEGORIES;
 *   - the separately approved readiness rule set is authoritative for required LEVELS and PASS conditions;
 *   - the two are checked for consistency; a classification never grants readiness by itself.
 *
 * Provenance (D-4): every entry records its source. `po_default` is a Product Owner default and is NEVER presented as an
 * expert decision. A set with any `po_default` entry needs the Product Owner's named approval in addition to the SME's.
 *
 * In effect: only an APPROVED set that is `development_only`, and never in production. There is no production
 * activation state until a separately authorized P6 migration (the database cannot even represent it).
 */
export const PROFESSIONAL_CLASSES = ['must', 'core', 'supporting'] as const;
export type ProfessionalClass = (typeof PROFESSIONAL_CLASSES)[number];
export const CLASS_SOURCES = ['sme', 'po_default'] as const;
export type ClassSource = (typeof CLASS_SOURCES)[number];
/** The closed taxonomy vocabulary; a new taxonomy is an extension-register item (EXT-3), never a free string. */
export const CLASSIFICATION_TAXONOMY = 'must_core_supporting@1' as const;

export interface SkillClassificationEntry {
  readonly skillId: string;
  readonly cls: ProfessionalClass;
  readonly source: ClassSource;
  readonly sourceRef: string;
}

export interface SkillClassificationSet {
  readonly id: string;
  readonly key: string;
  readonly version: number;
  readonly targetRoleId: string;
  readonly taxonomy: string;
  readonly reviewStatus: 'draft' | 'approved';
  readonly activation: 'inactive' | 'development_only';
  readonly smeApprovedBy: string | null;
  readonly poApprovedBy: string | null;
  readonly entries: readonly SkillClassificationEntry[];
}

/** Every entry valid, each skill once, a source reference for each; the taxonomy known. Every problem is reported. */
export function assertClassificationSane(set: Pick<SkillClassificationSet, 'taxonomy' | 'entries'>): void {
  const problems: string[] = [];
  if (set.taxonomy !== CLASSIFICATION_TAXONOMY) problems.push(`unknown taxonomy '${set.taxonomy}' (only ${CLASSIFICATION_TAXONOMY}; a new one is an EXT-3 extension)`);
  const seen = new Set<string>();
  for (const e of set.entries) {
    if (seen.has(e.skillId)) problems.push(`skill ${e.skillId} is classified twice`);
    seen.add(e.skillId);
    if (!(PROFESSIONAL_CLASSES as readonly string[]).includes(e.cls)) problems.push(`skill ${e.skillId}: unknown class '${e.cls}'`);
    if (!(CLASS_SOURCES as readonly string[]).includes(e.source)) problems.push(`skill ${e.skillId}: unknown source '${e.source}'`);
    if (!e.sourceRef || !e.sourceRef.trim()) problems.push(`skill ${e.skillId}: a classification records its source reference`);
  }
  if (set.entries.length === 0) problems.push('a classification classifies at least one skill');
  if (problems.length) throw new DomainError(`skill classification is not usable:\n  - ${problems.join('\n  - ')}`);
}

/** The approval a set needs before it can ever be in effect: a named SME, plus the PO when it carries any PO default. */
export function classificationApprovalProblems(set: Pick<SkillClassificationSet, 'reviewStatus' | 'smeApprovedBy' | 'poApprovedBy' | 'entries'>): string[] {
  const out: string[] = [];
  if (set.reviewStatus !== 'approved') out.push('not approved');
  if (!set.smeApprovedBy) out.push('no named SME approval');
  if (set.entries.some((e) => e.source === 'po_default') && !set.poApprovedBy) out.push('carries Product Owner defaults without the Product Owner\'s named approval');
  return out;
}

/** The set in effect for a role: approved, development_only, outside production. Never in production (no such state exists). */
export function classificationInEffect(sets: readonly SkillClassificationSet[], roleId: string, env: { readonly production: boolean }): SkillClassificationSet | null {
  if (env.production) return null;
  const live = sets.filter((s) => s.targetRoleId === roleId && s.activation === 'development_only');
  if (live.length > 1) throw new DomainError(`two skill classifications are in effect for role ${roleId} (the database refuses this; refusing to guess)`);
  const s = live[0];
  if (!s || classificationApprovalProblems(s).length) return null;
  return s;
}

export type ProfessionalBadge = 'must' | 'core' | 'supporting';
/**
 * What the UI may state. With a classification in effect: its class and where it came from (a PO default is labelled as
 * such, never as an expert decision). Without one: null — the caller keeps the legacy `is_core` badge unchanged.
 */
export function professionalLabel(entry: SkillClassificationEntry | null): { readonly badge: ProfessionalBadge; readonly source: ClassSource; readonly expertApproved: boolean } | null {
  if (!entry) return null;
  return { badge: entry.cls, source: entry.source, expertApproved: entry.source === 'sme' };
}

/** Whether a role requirement is REQUIRED (Must ∪ Core) — version-aware: the classification when in effect, else legacy `is_core`. */
export function requiredForRole(entry: SkillClassificationEntry | null | undefined, legacyIsCore: boolean): boolean {
  return entry ? entry.cls === 'must' || entry.cls === 'core' : legacyIsCore;
}

const BLOCKING_SKILL_RULES = new Set(['non_compensable_skill', 'required_skill_at_level', 'skill_evidence_path']);
/**
 * D-3 / §7 consistency between the classification (categories) and a readiness rule set (levels and pass conditions):
 *   - every Must skill has a `non_compensable_skill` rule;
 *   - every Core skill has a `required_skill_at_level` (or `non_compensable_skill`) rule;
 *   - no blocking rule names a Supporting skill (SME-20: Supporting never blocks);
 *   - no `is_core`-based aggregate rule (`all_core_skills_at_level`, `min_skills_at_level` with scope core) in a
 *     classified role: its meaning would silently differ from the classification.
 * Levels are the rule set's (DM-2), never set here. Disabled rules do not count. Returns the problems (empty = consistent).
 */
export function classificationReadinessProblems(classified: readonly SkillClassificationEntry[], set: Pick<ReadinessRuleSet, 'rules'>, canonicalOf: (skillId: string) => string = (s) => s): string[] {
  const out: string[] = [];
  // Alias handling (OPEN-039): both sides are compared as CANONICAL skills — the same mapping at approval, activation and
  // evaluation, so a merge after approval can never make an approved, consistent pair fail on alias handling alone.
  const entries = classified.map((e) => ({ ...e, skillId: canonicalOf(e.skillId) }));
  const rules = set.rules.filter((r) => r.enabled);
  const bySkill = (types: readonly string[], skillId: string) => rules.some((r) => types.includes(r.type) && r.skillId !== null && canonicalOf(r.skillId) === skillId);
  for (const e of entries) {
    if (e.cls === 'must' && !bySkill(['non_compensable_skill'], e.skillId)) out.push(`Must skill ${e.skillId} has no non_compensable_skill rule`);
    if (e.cls === 'core' && !bySkill(['required_skill_at_level', 'non_compensable_skill'], e.skillId)) out.push(`Core skill ${e.skillId} has no required_skill_at_level rule`);
  }
  const supporting = new Set(entries.filter((e) => e.cls === 'supporting').map((e) => e.skillId));
  for (const r of rules) {
    if (BLOCKING_SKILL_RULES.has(r.type) && r.skillId !== null && supporting.has(canonicalOf(r.skillId))) out.push(`rule ${r.id} (${r.type}) makes Supporting skill ${canonicalOf(r.skillId)} a blocker`);
    if (r.type === 'all_core_skills_at_level' || (r.type === 'min_skills_at_level' && r.params['scope'] === 'core')) {
      out.push(`rule ${r.id} (${r.type}) reads the legacy is_core flag; in a classified role use explicit per-skill rules`);
    }
  }
  return out;
}
