/**
 * A11 M1 — loads the CANDIDATE virtual-manager scenarios of the development pilot (0042 `manager_scenario`).
 * Development only (refused in production); pilot activities only; each scenario validated by the domain rule;
 * idempotent (same version + same content is skipped; different content needs a new version). Scenarios are content:
 * the database refuses them once an activity is past expert review. Nothing here approves a scenario.
 */
import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { assertManagerScenario, type ManagerScenario } from '@naqla/domain';

export class ManagerScenarioLoadError extends Error { override readonly name = 'ManagerScenarioLoadError'; }

export async function loadPilotManagerScenarios(pool: Pool, opts: { scenariosFile: string; byLabel: string; reason: string; production: boolean }) {
  if (opts.production) throw new ManagerScenarioLoadError('pilot manager scenarios are never loaded in production');
  if (!opts.byLabel?.trim() || !opts.reason?.trim()) throw new ManagerScenarioLoadError('a scenario load needs a name and a reason');
  const file = JSON.parse(readFileSync(opts.scenariosFile, 'utf8')) as { version: string; activities: Record<string, ManagerScenario> };
  const written: string[] = []; const skipped: string[] = [];
  for (const [slug, sc] of Object.entries(file.activities)) {
    assertManagerScenario(sc);
    const act = (await pool.query(`select a.id from activity_spec a where a.slug = $1 and exists (select 1 from pilot_content_load l where l.target_role_id = a.target_role_id)
                                    order by a.created_at desc limit 1`, [slug])).rows[0];
    if (!act) throw new ManagerScenarioLoadError(`no pilot activity '${slug}' is loaded; run the pilot loader first`);
    const cur = (await pool.query('select scenario from manager_scenario where activity_spec_id = $1 and scenario_version = $2', [act.id, file.version])).rows[0];
    if (cur) {
      if (canonical(cur.scenario) !== canonical(sc)) throw new ManagerScenarioLoadError(`${slug}: version ${file.version} is recorded with different content; bump the version`);
      skipped.push(slug); continue;
    }
    await pool.query(`insert into manager_scenario (activity_spec_id, scenario_version, persona_ar, scenario, is_demo_fixture, created_by_label, reason) values ($1,$2,$3,$4,true,$5,$6)`,
      [act.id, file.version, sc.personaAr, JSON.stringify(sc), opts.byLabel, opts.reason]);
    written.push(slug);
  }
  return { version: file.version, written, skipped };
}

/** Key-order-independent JSON (jsonb does not keep the authored key order). */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
