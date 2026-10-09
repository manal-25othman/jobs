import type { Pool, PoolClient } from 'pg';
import { resolvePackConstraints, type PackConstraintSet, type ResolvedPackConstraints, type PackConstraintType } from '@naqla/domain';
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
  return sets.map((s) => ({
    ...governedFromRow(s),
    trackId: (s.track_id as string | null) ?? null,
    constraints: rows.filter((r) => r.set_id === s.id).map((r) => ({ type: r.t as PackConstraintType, min: r.min_value === null ? null : Number(r.min_value), max: r.max_value === null ? null : Number(r.max_value) })),
  }));
}

export async function resolvePackConstraintsFor(c: PoolClient | Pool, trackId: string): Promise<ResolvedPackConstraints> {
  return resolvePackConstraints(await loadPackConstraintSets(c), trackId, { production: isProduction() });
}
