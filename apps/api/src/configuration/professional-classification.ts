import type { PoolClient } from 'pg';
import { BadRequestException } from '@nestjs/common';
import {
  assertClassificationSane, classificationInEffect, CLASSIFICATION_TAXONOMY, withCanonicalRuleSkills, type ReadinessRuleSet,
  type SkillClassificationEntry, type SkillClassificationSet, type ProfessionalClass, type ClassSource,
} from '@naqla/domain';
import { isProduction } from './configuration.service';
import { assertRoleSkillsPublishable } from '../career-data/publication-safety';

/**
 * DM-7b / P-3 (D-130) — the database side of the professional skill classification.
 *
 * The domain decides (shape, provenance, approval, in-effect resolution, readiness consistency); this file only reads
 * and writes governed rows. Writes are draft creation and the explicit governance steps; the database refuses
 * everything else (born draft/inactive, four eyes, PO approval for PO defaults, fixed once approved, no production
 * state, development_only only with the transaction-local opt-in). Nothing here touches role_requirement.is_core (D-2).
 */
export async function loadClassificationSets(c: PoolClient, roleId?: string): Promise<SkillClassificationSet[]> {
  const sets = (await c.query(`select * from skill_classification_set ${roleId ? 'where target_role_id = $1' : ''} order by key, version`, roleId ? [roleId] : [])).rows;
  if (sets.length === 0) return [];
  const entries = (await c.query('select set_id, skill_id::text as skill_id, class, source_kind, source_ref from skill_classification where set_id = any($1::uuid[]) order by skill_id',
    [sets.map((s) => s.id)])).rows;
  return sets.map((s) => ({
    id: s.id, key: s.key, version: Number(s.version), targetRoleId: s.target_role_id, taxonomy: s.taxonomy, reviewStatus: s.review_status, activation: s.activation,
    smeApprovedBy: s.sme_approved_by ?? null, poApprovedBy: s.po_approved_by ?? null,
    entries: entries.filter((e) => e.set_id === s.id).map((e) => ({ skillId: e.skill_id, cls: e.class as ProfessionalClass, source: e.source_kind as ClassSource, sourceRef: e.source_ref })),
  }));
}

/**
 * Alias handling (OPEN-039): the one canonical-skill lookup used wherever a rule or a classification names a skill —
 * readiness rule creation, approval, activation and evaluation, and the classification in effect. Unknown ids map to themselves.
 */
export async function canonicalSkillLookup(c: PoolClient, ids: readonly (string | null)[]): Promise<(skillId: string) => string> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (list.length === 0) return (s) => s;
  const rows = (await c.query('select id::text as id, canonical_skill_id(id)::text as canon from skill where id = any($1::uuid[])', [list])).rows;
  const map = new Map(rows.map((r) => [String(r.id), String(r.canon)]));
  return (s) => map.get(s) ?? s;
}

/** A readiness rule set with every rule's skill read as its canonical skill (the shared mapping above). */
export async function withCanonicalRules<T extends Pick<ReadinessRuleSet, 'rules'>>(c: PoolClient, set: T): Promise<T> {
  return withCanonicalRuleSkills(set, await canonicalSkillLookup(c, set.rules.map((r) => r.skillId)));
}

/** The classification in effect for a role (development only, approved; never in production), as a map by CANONICAL skill — or null (legacy is_core applies). */
export async function classificationEntriesInEffect(c: PoolClient, roleId: string | null): Promise<Map<string, SkillClassificationEntry> | null> {
  if (!roleId || isProduction()) return null;
  const set = classificationInEffect(await loadClassificationSets(c, roleId), roleId, { production: isProduction() });
  if (!set) return null;
  // An entry stays fixed once approved; if its skill is merged later, it is read as the skill it was merged into.
  const canon = await canonicalSkillLookup(c, set.entries.map((e) => e.skillId));
  return new Map(set.entries.map((e) => [canon(e.skillId), { ...e, skillId: canon(e.skillId) }]));
}

/** The entry for one (possibly alias) skill of a role's classification in effect. */
export async function entryFor(c: PoolClient, map: Map<string, SkillClassificationEntry> | null, skillId: string): Promise<SkillClassificationEntry | null> {
  if (!map) return null;
  const direct = map.get(skillId);
  if (direct) return direct;
  const canon = (await c.query('select canonical_skill_id($1::uuid)::text as id', [skillId])).rows[0]?.id as string | undefined;
  return canon ? map.get(canon) ?? null : null;
}

/** A new DRAFT, INACTIVE classification version (development and governance tooling). Validated by the domain; the database re-checks every entry. */
export async function createClassificationSet(c: PoolClient, p: { key: string; targetRoleId: string; labelAr: string; labelEn: string; description: string; createdBy: string;
  entries: readonly SkillClassificationEntry[]; rationale?: Readonly<Record<string, string>> }): Promise<{ id: string; version: number }> {
  try { assertClassificationSane({ taxonomy: CLASSIFICATION_TAXONOMY, entries: p.entries }); } catch (e) { throw new BadRequestException((e as Error).message); }
  const next = Number((await c.query('select coalesce(max(version), 0) + 1 as v from skill_classification_set where key = $1', [p.key])).rows[0].v);
  const id = (await c.query(`insert into skill_classification_set (key, version, target_role_id, taxonomy, label_ar, label_en, description_en, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [p.key, next, p.targetRoleId, CLASSIFICATION_TAXONOMY, p.labelAr, p.labelEn, p.description, p.createdBy])).rows[0].id as string;
  for (const e of p.entries) {
    await c.query('insert into skill_classification (set_id, skill_id, class, source_kind, source_ref, rationale_en) values ($1,$2,$3,$4,$5,$6)',
      [id, e.skillId, e.cls, e.source, e.sourceRef, p.rationale?.[e.skillId] ?? null]);
  }
  return { id, version: next };
}

/** Approval: a named SME, plus the Product Owner when PO defaults are present (D-4). Four eyes and finality are enforced by the database. */
export async function approveClassificationSet(c: PoolClient, p: { id: string; smeApprovedBy: string; poApprovedBy?: string | null }): Promise<void> {
  await assertClassificationRoleUsable(c, p.id, 'approving this classification');
  await c.query(`update skill_classification_set set review_status = 'approved', sme_approved_by = $2, sme_approved_at = now(),
                   po_approved_by = $3, po_approved_at = case when $3::text is null then null else now() end where id = $1`, [p.id, p.smeApprovedBy, p.poApprovedBy ?? null]);
}

/** Publication safety: a classification is never approved or activated for a role whose requirements reference a superseded or learner-invisible skill (Q25). */
async function assertClassificationRoleUsable(c: PoolClient, setId: string, action: string): Promise<void> {
  const role = (await c.query('select target_role_id from skill_classification_set where id = $1', [setId])).rows[0]?.target_role_id as string | undefined;
  if (role) await assertRoleSkillsPublishable(c, role, action);
}

/** development_only activation (never production): the publication-safety check, then the transaction-local opt-in the database requires. */
export async function activateClassificationForDevelopment(c: PoolClient, id: string): Promise<void> {
  await assertClassificationRoleUsable(c, id, 'activating this classification');
  await c.query("select set_config('naqla.classification_dev_activation', 'on', true)");
  await c.query(`update skill_classification_set set activation = 'development_only' where id = $1`, [id]);
}
