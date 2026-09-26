/**
 * Career data CLI (no Nest). Commands:
 *   import <packId> [--dry-run]        Source → Raw → Normalize → Deduplicate → Map → write DRAFT
 *   validate                           run every quality rule; exit 1 on any FAIL
 *   near-duplicates <packId>           write data/career/reports/near-duplicates.md
 *   review <kind> <id> <to> --role <r> --by <uuid|-> --label <name> --reason "<why>" [--minutes n]
 */
import { Pool } from 'pg';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPack } from './pack-loader';
import { importPack, renderNearDuplicateReport, ImportError } from './pipeline';
import { runQualityChecks, coreSkillEvidencePaths } from './quality-rules';
import { reviewTransition } from './review';
import { PackValidationError } from './pack-schema';
import type { ReviewState, ReviewerRole } from '@naqla/domain';

function arg(argv: string[], name: string): string | undefined { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }

export async function main(argv: string[], root: string): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) { console.error('DATABASE_URL is required'); return 2; }
  const production = process.env['NODE_ENV'] === 'production';
  const pool = new Pool({ connectionString: url });
  try {
    const [cmd, a1, a2, a3] = argv;
    if (cmd === 'import') {
      const { pack, files } = loadPack(join(root, 'data', 'career'), a1!);
      const r = await importPack(pool, pack, files, { dryRun: argv.includes('--dry-run') });
      console.log(`import ${r.packId}@${r.packVersion} ${argv.includes('--dry-run') ? '(dry run, rolled back)' : ''} — DEMO fixture: ${r.isDemoFixture}`);
      console.log(`  snapshots: ${r.snapshots.filter((s) => s.stored === 'new').length} new, ${r.snapshots.filter((s) => s.stored === 'existing').length} existing · normalized records: ${r.normalizedRecords}`);
      console.log(`  written (draft): ${Object.entries(r.written).map(([k, v]) => `${k}=${v}`).join(' ')}`);
      if (r.skippedFrozen.length) console.log(`  not touched (past curated): ${r.skippedFrozen.join(', ')}`);
      console.log(`  near-duplicate candidates proposed: ${r.nearDuplicates.length} (nothing merged)`);
      return 0;
    }
    if (cmd === 'validate') {
      const { results, failed } = await runQualityChecks(pool);
      for (const r of results) console.log(`${r.passed ? 'PASS' : r.severity === 'fail' ? 'FAIL' : 'WARN'} ${r.id} ${r.title}${r.offenders.length ? `\n     ${r.offenders.slice(0, 20).join('\n     ')}${r.offenders.length > 20 ? `\n     … ${r.offenders.length - 20} more` : ''}` : ''}`);
      const roles = await pool.query(`select slug from target_role order by slug`);
      for (const ro of roles.rows) { const paths = await coreSkillEvidencePaths(pool, ro.slug); if (paths.length) console.log(`core evidence paths — ${ro.slug}: ${paths.map((p) => `${p.skill}: ${p.status} [${p.activities.join(', ')}]`).join(' · ')}`); }
      console.log(failed ? 'QUALITY: FAILED' : 'QUALITY: PASSED');
      return failed ? 1 : 0;
    }
    if (cmd === 'near-duplicates') {
      const { pack, files } = loadPack(join(root, 'data', 'career'), a1!);
      const r = await importPack(pool, pack, files, { dryRun: true });
      const decided = (await pool.query('select a_code, b_code, decision, decision_reason from dedup_candidate')).rows;
      const md = renderNearDuplicateReport(r.nearDuplicates, r.packId, r.packVersion, decided);
      const out = join(root, 'data', 'career', 'reports', 'near-duplicates.md'); writeFileSync(out, md); console.log(`wrote ${out} (${r.nearDuplicates.length} candidates)`);
      return 0;
    }
    if (cmd === 'review') {
      const by = arg(argv, '--by'); const role = arg(argv, '--role') as ReviewerRole; const reason = arg(argv, '--reason') ?? ''; const label = arg(argv, '--label') ?? by ?? 'unknown';
      const r = await reviewTransition(pool, { entityKind: a1!, entityId: a2!, to: a3 as ReviewState, decidedBy: by && by !== '-' ? by : null, decidedByLabel: label, rolePerformed: role, reason,
        durationMinutes: arg(argv, '--minutes') ? Number(arg(argv, '--minutes')) : null, production });
      console.log(`${a1} ${a2}: ${r.from} → ${r.to} (${role}, ${label})`);
      return 0;
    }
    console.error('usage: career-data <import|validate|near-duplicates|review> …'); return 2;
  } catch (e) {
    if (e instanceof PackValidationError || e instanceof ImportError) { console.error(e.message); return 1; }
    console.error((e as Error).message); return 1;
  } finally { await pool.end(); }
}
