/**
 * Career data CLI (no Nest). Commands:
 *   import <packId> [--dry-run]        Source → Raw → Normalize → Deduplicate → Map → write DRAFT
 *   validate                           run every quality rule; exit 1 on any FAIL
 *   near-duplicates <packId>           write data/career/reports/near-duplicates.md
 *   review <kind> <id> <to> --role <r> --by <uuid|-> --label <name> --reason "<why>" [--minutes n]
 *   approve-values <rubric-version-uuid> --by <uuid> --label <name> --reason "<why>"   the ONE recorded SME act that lets weight/threshold statuses become approved (OPEN-043)
 *   config-approve <table> <id> --by <uuid> --label <name> --reason "<why>"            Phase 4: validate a configuration row (never a legacy baseline in place)
 *   config-activate <table> <id> --activation <inactive|development_only|production_active> --by <name> --reason "<why>"   audited; production_active needs an approved row; an active row is never replaced by accident
 *   config-new-version <role-uuid> --label <l> --verification key@v --context key@v --claim key@v [--challenge key@v] [--pack v] --by <name>   next DRAFT track configuration version (inactive)
 *   claims-revalidate [claim_kind] --by <name>   Phase 7b: re-check approved assets' standing against the claim policy in effect (recovery after an out-of-band change)
 *   readiness-new-set <key> --rules <file.json> [--role <uuid>] --label-ar <l> --label-en <l> --description <d> --by <name>   Phase 5: a DRAFT readiness rule set (inactive); rule types are code, values are the file's
 */
import { Pool } from 'pg';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPack } from './pack-loader';
import { importPack, renderNearDuplicateReport, ImportError } from './pipeline';
import { runQualityChecks, coreSkillEvidencePaths } from './quality-rules';
import { reviewTransition, approveRubricValues } from './review';
import { promoteDemo, completePromotion, recordCorrection } from './promotion';
import { PackValidationError } from './pack-schema';
import { cliApprove, cliActivate, cliCreateTrackVersion, cliCreateReadinessSet, cliRevalidateClaims } from '../configuration/config-admin.service';
import { readFileSync } from 'node:fs';
import type { ConfigActivation } from '@naqla/domain';
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
      console.log(`  near-duplicate candidates proposed: ${r.nearDuplicates.length} (nothing merged automatically)`);
      for (const x of r.resolutions) console.log(`  owner-decided resolution: ${x.alias} → ${x.canonical} ${x.applied ? `applied (alias kept as merged_into; repointed ${Object.entries(x.repointed).map(([k, v]) => `${k}=${v}`).join(' ') || 'nothing'})` : 'already applied'}`);
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
    if (cmd === 'approve-values') {
      const by = arg(argv, '--by'); const label = arg(argv, '--label') ?? by ?? 'unknown'; const reason = arg(argv, '--reason') ?? '';
      if (!by || by === '-' || !reason.trim()) { console.error('approve-values needs --by <reviewer-uuid> and --reason'); return 2; }
      const r = await approveRubricValues(pool, { rubricVersionId: a1!, decidedBy: by, decidedByLabel: label, reason });
      console.log(`rubric ${r.version}: ${r.criteria} criteria weights/thresholds and the pass threshold are now approved by ${label} (recorded)`);
      return 0;
    }
    if (cmd === 'promote') {
      const r = await promoteDemo(pool, a1!, a2!, arg(argv, '--by') ?? 'unknown', arg(argv, '--note') ?? null);
      console.log(`promotion ${r.promotionId}: review copy ${r.canonicalId} created (${Object.entries(r.copied).map(([k, v]) => `${k}=${v}`).join(' ')}); it is curated, non-demo, and now walks the review workflow`);
      return 0;
    }
    if (cmd === 'promotion-correction') {
      await recordCorrection(pool, a1!, { field: arg(argv, '--field')!, from: arg(argv, '--from'), to: arg(argv, '--to'), by: arg(argv, '--by') ?? 'unknown', reason: arg(argv, '--reason') ?? '' });
      console.log('correction recorded'); return 0;
    }
    if (cmd === 'promotion-complete') {
      const r = await completePromotion(pool, a1!);
      console.log(`promotion closed: demo superseded=${r.demoSuperseded}, ${r.reviewLogIds.length} review decision(s) recorded`); return 0;
    }
    if (cmd === 'config-approve') {
      const by = arg(argv, '--by'); const label = arg(argv, '--label') ?? by ?? 'unknown'; const reason = arg(argv, '--reason') ?? '';
      if (!by || !reason.trim()) { console.error('config-approve needs --by <uuid> and --reason'); return 2; }
      const r = await cliApprove(pool, { table: a1!, id: a2!, approvedBy: by, approvedByLabel: label, reason });
      console.log(`${a1} ${r.key}@${r.version}: ${r.reviewStatus} (recorded in config_change)`); return 0;
    }
    if (cmd === 'config-activate') {
      const by = arg(argv, '--by'); const reason = arg(argv, '--reason') ?? ''; const activation = arg(argv, '--activation') as ConfigActivation;
      if (!by || !reason.trim() || !activation) { console.error('config-activate needs --activation, --by <name> and --reason'); return 2; }
      const r = await cliActivate(pool, { table: a1!, id: a2!, activation, actor: by, reason });
      console.log(`${a1} ${r.key}@${r.version}: activation ${r.activation} (recorded in config_change)`); return 0;
    }
    if (cmd === 'claims-revalidate') {
      const by = arg(argv, '--by'); if (!by) { console.error('claims-revalidate needs --by <name>'); return 2; }
      const r = await cliRevalidateClaims(pool, { claimKind: a1 && !a1.startsWith('--') ? a1 : null, actor: by });
      console.log(`claims-revalidate: ${r.checked} active asset(s) checked · ${r.keptEligible} still eligible · ${r.movedToReview} moved to needs_review (recorded in asset_standing_event)`); return 0;
    }
    if (cmd === 'readiness-new-set') {
      const file = arg(argv, '--rules'); if (!file) { console.error('readiness-new-set needs --rules <file.json>'); return 2; }
      const rules = JSON.parse(readFileSync(file, 'utf8')) as Parameters<typeof cliCreateReadinessSet>[1]['rules'];
      const r = await cliCreateReadinessSet(pool, { key: a1!, targetRoleId: arg(argv, '--role') ?? null, labelAr: arg(argv, '--label-ar') ?? a1!, labelEn: arg(argv, '--label-en') ?? a1!, description: arg(argv, '--description') ?? 'DRAFT / NOT VALIDATED', createdBy: arg(argv, '--by') ?? 'unknown', rules });
      console.log(`readiness_rule_set ${r.id}: ${a1}@${r.version} created as an inactive DRAFT with ${r.rules} rule(s)`); return 0;
    }
    if (cmd === 'config-new-version') {
      const r = await cliCreateTrackVersion(pool, { targetRoleId: a1!, label: arg(argv, '--label') ?? 'draft', verificationPolicy: arg(argv, '--verification') ?? 'default@1', assessmentContextPolicy: arg(argv, '--context') ?? 'default@1',
        claimPolicyRef: arg(argv, '--claim') ?? 'default@1', challengePolicy: arg(argv, '--challenge') ?? null, packVersion: arg(argv, '--pack') ?? null, notes: arg(argv, '--notes') ?? null, createdBy: arg(argv, '--by') ?? 'unknown' });
      console.log(`track_config_version ${r.id}: v${r.version} created as an inactive DRAFT`); return 0;
    }
    console.error('usage: career-data <import|validate|near-duplicates|review|approve-values|promote|promotion-correction|promotion-complete|config-approve|config-activate|config-new-version|readiness-new-set|claims-revalidate> …'); return 2;
  } catch (e) {
    if (e instanceof PackValidationError || e instanceof ImportError) { console.error(e.message); return 1; }
    console.error((e as Error).message); return 1;
  } finally { await pool.end(); }
}
