import type { PoolClient } from 'pg';

/**
 * Assessment-design strings that must never reach a graduate through any agent output: planted-input descriptions and
 * reviewer material names. One helper, used by guidance (package 5) and the virtual manager (A11) as a second check
 * after the gateway.
 */
export async function loadHiddenTexts(c: PoolClient): Promise<string[]> {
  const rows = (await c.query(`select description_en as t from activity_input where contains_planted_issue and description_en is not null
                                union all select description_ar from activity_input where contains_planted_issue and description_ar is not null
                                union all select file_name from activity_material where audience = 'reviewer'`)).rows;
  return rows.map((r) => String(r.t)).filter((t) => t.trim().length >= 12);
}
