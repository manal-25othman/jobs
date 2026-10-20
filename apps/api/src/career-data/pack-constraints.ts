import type { Pool, PoolClient } from 'pg';
import { resolvePackConstraints, type PackConstraintSet, type ResolvedPackConstraints, type PackConstraintType, type PackConstraintTypeV2 } from '@naqla/domain';
import { governedFromRow, isProduction } from '../configuration/configuration.service';

/**
 * Phase 9 (H5): the pack constraint sets as stored — governed rows plus their
 * closed-vocabulary constraints. Resolution (track-specific, then global;
 * production never uses an unvalidated row; conflicts and absence fail) is the
 * domain's `resolvePackConstraints`.
 */
export async function loadPackConstraintSets(c: PoolClient | Pool): Promise<PackConstraintSet[]> {
  const sets = (await c.query('select * from pack_constraint_set order by key, version')).rows;
  const rows = (await c.query('select set_id, constraint_type::text as t, min_value, max_value from pack_constraint order by set_id, constraint_type')).rows;
  // DM-7b / P-3: schema-2 (class-based) constraints live in their own table.
  const rows2 = (await c.query('select set_id, constraint_type as t, min_value, max_value from pack_constraint_v2 order by set_id, constraint_type')).rows;
  const num = (v: unknown) => (v === null ? null : Number(v));
  return sets.map((s) => ({
    ...governedFromRow(s),
    trackId: (s.track_id as string | null) ?? null,
    schemaVersion: Number(s.schema_version ?? 1) === 2 ? 2 as const : 1 as const,
    constraints: rows.filter((r) => r.set_id === s.id).map((r) => ({ type: r.t as PackConstraintType, min: num(r.min_value), max: num(r.max_value) })),
    constraintsV2: rows2.filter((r) => r.set_id === s.id).map((r) => ({ type: r.t as PackConstraintTypeV2, min: num(r.min_value), max: num(r.max_value) })),
  }));
}

/** The set in effect for a track, of the given constraint schema (the pack's format). Never a fallback across schemas. */
export async function resolvePackConstraintsFor(c: PoolClient | Pool, trackId: string, schemaVersion: 1 | 2 = 1): Promise<ResolvedPackConstraints> {
  return resolvePackConstraints(await loadPackConstraintSets(c), trackId, { production: isProduction() }, schemaVersion);
}
