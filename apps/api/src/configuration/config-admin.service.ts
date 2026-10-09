import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { assertActivationAllowed, configIsValidated, MissingPrerequisite, CLAIM_KIND_CLASS, evidenceOrdinal, type ConfigActivation, type ClaimKind, type EvidenceState } from '@naqla/domain';
import { GOVERNED_TABLES, governedFromRow, isProduction, type GovernedTable } from './configuration.service';
import { revalidateClaimAssets, regroundApprovedAssets } from '../agents/asset-standing';

/**
 * The explicit, audited acts on configuration (Phase 4): approve a row, change
 * its activation, create the next draft version of a track configuration.
 * Each act sets the transaction's actor and reason so the database guard
 * writes config_change; without them the database refuses the change.
 */
export async function withConfigActor<T>(c: PoolClient, actor: string, reason: string, fn: () => Promise<T>): Promise<T> {
  if (!actor?.trim() || !reason?.trim()) throw new MissingPrerequisite('actor/reason', 'a configuration change needs a named actor and a written reason');
  await c.query("select set_config('naqla.config_actor', $1, true), set_config('naqla.config_reason', $2, true), set_config('naqla.production', $3, true)", [actor.trim(), reason.trim(), isProduction() ? 'on' : 'off']);
  return fn();
}

function assertGoverned(table: string): asserts table is GovernedTable {
  if (!(GOVERNED_TABLES as readonly string[]).includes(table)) throw new BadRequestException(`'${table}' is not a governed configuration table`);
}

export async function approveConfigRow(c: PoolClient, p: { table: string; id: string; approvedBy: string; approvedByLabel: string; reason: string }) {
  assertGoverned(p.table); assertActorReason(p.approvedByLabel, p.reason);
  const cur = await c.query(`select * from ${p.table} where id = $1 for update`, [p.id]);
  if (cur.rowCount === 0) throw new NotFoundException(`${p.table} ${p.id} not found`);
  const g = governedFromRow(cur.rows[0]);
  if (g.baselineOf) throw new BadRequestException('a legacy baseline is not approved in place; it is the pre-existing behaviour. Create a new version and approve that.');
  if (configIsValidated(g)) throw new BadRequestException(`${p.table} ${g.key}@${g.version} is already ${g.reviewStatus}`);
  return withConfigActor(c, p.approvedByLabel, p.reason, async () => {
    const r = await c.query(`update ${p.table} set review_status = 'approved', approved_by = $2, approved_at = now(), validation_note_en = $3 where id = $1 returning *`,
      [p.id, p.approvedBy, `approved by ${p.approvedByLabel}: ${p.reason}`]);
    return governedFromRow(r.rows[0]);
  });
}

function assertActorReason(actor: string, reason: string): void {
  if (!actor?.trim() || !reason?.trim()) throw new MissingPrerequisite('actor/reason', 'a configuration change needs a named actor and a written reason');
}

export async function setConfigActivation(c: PoolClient, p: { table: string; id: string; activation: ConfigActivation; actor: string; reason: string }) {
  assertGoverned(p.table); assertActorReason(p.actor, p.reason);
  const cur = await c.query(`select * from ${p.table} where id = $1 for update`, [p.id]);
  if (cur.rowCount === 0) throw new NotFoundException(`${p.table} ${p.id} not found`);
  const g = governedFromRow(cur.rows[0]);
  assertActivationAllowed({ from: g.activation, to: p.activation, reviewStatus: g.reviewStatus, approvedBy: g.approvedBy, baselineOf: g.baselineOf, production: isProduction() });
  const scope = p.table === 'track_config_version' ? 'target_role_id' : p.table === 'claim_policy' ? 'key, claim_kind' : p.table === 'readiness_rule_set' ? "coalesce(target_role_id, '00000000-0000-0000-0000-000000000000'::uuid), key" : 'key';
  if (p.activation !== 'inactive') assertActivationPermittedInPhase8(p.table, cur.rows[0], isProduction() || p.activation === 'production_active');
  if (p.activation !== 'inactive') {
    const clash = await c.query(`select id, version, activation from ${p.table} where (${scope}) = (select ${scope} from ${p.table} where id = $1) and id <> $1 and activation <> 'inactive'`, [p.id]);
    if (clash.rowCount) throw new BadRequestException(`${p.table} already has an active row (${clash.rows[0].activation} v${clash.rows[0].version}); deactivate it explicitly first — a new row never replaces an active one by accident`);
  }
  return withConfigActor(c, p.actor, p.reason, async () => {
    const r = await c.query(`update ${p.table} set activation = $2 where id = $1 returning *`, [p.id, p.activation]);
    // Phase 7b (BR-026): a change in the claim policy in effect re-checks every active asset of that kind IN THIS
    // TRANSACTION. If the re-check cannot complete, the activation rolls back with it — never a half-applied state.
    if (p.table === 'claim_policy') await revalidateClaimAssets(c, { claimKind: r.rows[0].claim_kind, cause: 'policy_activation', actor: p.actor });
    // Phase 8 (owner requirement 3): a change in the grounding vocabulary in effect re-grounds every approved asset in this transaction.
    if (p.table === 'grounding_lexicon') await regroundApprovedAssets(c, { cause: 'grounding_revalidation', actor: p.actor });
    // Phase 8: activating a Track Builder version writes its snapshot to the live TrackSkill rows, in this transaction.
    if (p.table === 'track_config_version' && p.activation !== 'inactive' && r.rows[0].applies_skill_config) await applyTrackSkillSnapshot(c, r.rows[0], p.actor);
    return governedFromRow(r.rows[0]);
  });
}

/** The next draft version of a track's configuration, assembled from named policy versions and the live TrackSkill rows. Inactive until activated. */
export async function createTrackConfigVersion(c: PoolClient, p: { targetRoleId: string; label: string; verificationPolicy: string; assessmentContextPolicy: string; claimPolicyRef: string; challengePolicy: string | null; packVersion: string | null; notes: string | null; createdBy: string }) {
  const ref = (s: string) => { const m = /^([a-z][a-z0-9_]+)@(\d+)$/.exec(s); if (!m) throw new BadRequestException(`policy reference '${s}' must be key@version`); return { key: m[1]!, version: Number(m[2]) }; };
  const vp = ref(p.verificationPolicy); const cx = ref(p.assessmentContextPolicy); ref(p.claimPolicyRef);
  const vpId = await c.query('select id from verification_policy where key = $1 and version = $2', [vp.key, vp.version]);
  const cxId = await c.query('select id from assessment_context_policy where key = $1 and version = $2', [cx.key, cx.version]);
  if (vpId.rowCount === 0 || cxId.rowCount === 0) throw new NotFoundException('referenced policy version not found');
  let chId: string | null = null;
  if (p.challengePolicy) { const ch = ref(p.challengePolicy); const r = await c.query('select id from challenge_policy where key = $1 and version = $2', [ch.key, ch.version]); if (r.rowCount === 0) throw new NotFoundException('challenge policy not found'); chId = r.rows[0].id; }
  const next = await c.query('select coalesce(max(version), 0) + 1 as v from track_config_version where target_role_id = $1', [p.targetRoleId]);
  const r = await c.query(
    `insert into track_config_version (target_role_id, version, label, pack_version, verification_policy_id, assessment_context_policy_id, claim_policy_ref, challenge_policy_id, progress_rules_version, skill_config_snapshot, notes_en, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8, coalesce((select max(version) from skill_progress_transition), 1), track_skill_config_snapshot($1), $9, $10) returning id, version`,
    [p.targetRoleId, Number(next.rows[0].v), p.label, p.packVersion, vpId.rows[0].id, cxId.rows[0].id, p.claimPolicyRef, chId, p.notes, p.createdBy]);
  return { id: r.rows[0].id as string, version: Number(r.rows[0].version) };
}

/** A new DRAFT readiness rule set (inactive). Rule types are code constants; every value here is configuration. */
export async function createReadinessRuleSet(c: PoolClient, p: { key: string; targetRoleId: string | null; labelAr: string; labelEn: string; description: string; createdBy: string;
  rules: { type: string; params: Record<string, unknown>; skillId?: string | null; labelAr: string; labelEn: string }[] }) {
  const { assertReadinessRuleSetSane, readinessRuleFromRow } = await import('@naqla/domain');
  const next = await c.query('select coalesce(max(version), 0) + 1 as v from readiness_rule_set where key = $1', [p.key]);
  const set = await c.query(
    `insert into readiness_rule_set (key, version, target_role_id, label_ar, label_en, description_en, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning id, version`,
    [p.key, Number(next.rows[0].v), p.targetRoleId, p.labelAr, p.labelEn, p.description, p.createdBy]);
  const rules = [];
  let pos = 0;
  for (const r of p.rules) {
    const row = await c.query(`insert into readiness_rule (rule_set_id, rule_type, params, skill_id, label_ar, label_en, position) values ($1,$2,$3,$4,$5,$6,$7) returning id, rule_type, params, skill_id, label_ar, label_en, enabled, position`,
      [set.rows[0].id, r.type, JSON.stringify(r.params), r.skillId ?? null, r.labelAr, r.labelEn, pos++]);
    rules.push(readinessRuleFromRow(row.rows[0]));
  }
  assertReadinessRuleSetSane({ id: set.rows[0].id, key: p.key, version: Number(set.rows[0].version), reviewStatus: 'draft', activation: 'inactive', baselineOf: null, approvedBy: null, targetRoleId: p.targetRoleId, labelAr: p.labelAr, labelEn: p.labelEn, rules });
  return { id: set.rows[0].id as string, version: Number(set.rows[0].version), rules: rules.length };
}
export async function cliCreateReadinessSet(pool: Pool, p: Parameters<typeof createReadinessRuleSet>[1]) {
  const c = await pool.connect(); try { await c.query('begin'); const r = await createReadinessRuleSet(c, p); await c.query('commit'); return r; } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

/** Pool-based wrappers for the CLI (no Nest). */
export async function cliApprove(pool: Pool, p: Parameters<typeof approveConfigRow>[1]) {
  const c = await pool.connect(); try { await c.query('begin'); const r = await approveConfigRow(c, p); await c.query('commit'); return r; } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}
export async function cliActivate(pool: Pool, p: Parameters<typeof setConfigActivation>[1]) {
  const c = await pool.connect(); try { await c.query('begin'); const r = await setConfigActivation(c, p); await c.query('commit'); return r; } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}
/**
 * Phase 8 server-side blocks — they hold for the CLI, the admin API and anything else that activates through this service:
 *   - challenge policies are never activated (challenge triggers are a pending expert decision);
 *   - a skill-asserting claim kind below demonstrated is never activated (CV bullet at Practiced is pending);
 *   - per-skill evidence derivation (H6) is never activated in production.
 */
export function assertActivationPermittedInPhase8(table: string, row: Record<string, unknown>, productionLike: boolean): void {
  if (table === 'challenge_policy') throw new BadRequestException('challenge policies cannot be activated: challenge triggers are a pending expert decision (Phase 8 defines, never activates)');
  if (table === 'claim_policy' && CLAIM_KIND_CLASS[row['claim_kind'] as ClaimKind] === 'skill_assertion' && evidenceOrdinal(row['min_evidence_level'] as EvidenceState) < evidenceOrdinal('demonstrated')) {
    throw new BadRequestException(`a '${String(row['claim_kind'])}' policy below demonstrated cannot be activated: presenting a skill below demonstrated (e.g. a CV bullet at Practiced) is a pending expert and Product Owner decision`);
  }
  if (table === 'claim_policy' && row['lock_until_grounded'] === false) throw new BadRequestException('a claim policy that does not require grounding cannot be activated: evidence grounding (G1+G2) is never loosened');
  if (table === 'verification_policy' && row['per_skill_evidence_derivation'] === true && productionLike) {
    throw new BadRequestException('per-skill evidence derivation (H6) cannot be activated in production without explicit approval');
  }
}

/** Activation of a Track Builder version: live TrackSkill rows take the version's snapshot. Audited per row; classification approval travels with the SME's name. */
export async function applyTrackSkillSnapshot(c: PoolClient, version: Record<string, unknown>, actor: string): Promise<number> {
  const snapshot = version['skill_config_snapshot'] as Record<string, unknown>[];
  let n = 0;
  for (const s of snapshot) {
    const approvedClass = s['classification_status'] === 'approved';
    const r = await c.query(
      `update role_requirement set is_core = $2, importance = $3::importance_level, minimum_evidence_count = $4, category = $5, display_order = $6, expected_level = $7::evidence_state,
              readiness_contribution = $8, enabled = $9, classification_status = $10,
              reviewed_by = case when $10 = 'approved' then coalesce($11::uuid, reviewed_by) else reviewed_by end,
              reviewed_at = case when $10 = 'approved' then coalesce($12::timestamptz, reviewed_at, now()) else reviewed_at end
        where id = $1 and target_role_id = $13`,
      [s['role_requirement_id'], s['is_core'], s['importance'], s['minimum_evidence_count'], s['category'], s['display_order'], s['expected_level'], s['readiness_contribution'], s['enabled'],
       s['classification_status'], approvedClass ? (s['classification_reviewed_by'] ?? null) : null, approvedClass ? (s['classification_reviewed_at'] ?? null) : null, version['target_role_id']]);
    n += r.rowCount ?? 0;
  }
  await c.query(`update track_skill_change set status = 'applied', applied_at = now() where included_in_version_id = $1 and status = 'included'`, [version['id']]);
  await c.query(`insert into audit_event (event_type, user_id, actor_kind, subject_table, subject_id, reason, payload) values ('track.version_applied', null, 'system', 'track_config_version', $1, $2, $3)`,
    [version['id'], `track configuration v${String(version['version'])} activated by ${actor}: its TrackSkill snapshot is now live`, JSON.stringify({ rows: n })]);
  return n;
}

/** Recovery: re-check standing after a change made outside the audited path (e.g. raw SQL). Until then the presentation gate hides affected assets. */
export async function cliRevalidateClaims(pool: Pool, p: { claimKind: string | null; actor: string; reground?: boolean }) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const r = await revalidateClaimAssets(c, { claimKind: p.claimKind as Parameters<typeof revalidateClaimAssets>[1]['claimKind'], cause: 'revalidation_run', actor: p.actor });
    // Phase 8: after an engine version change (a deployment), approved assets stay hidden until re-grounded.
    const g = p.reground ? await regroundApprovedAssets(c, { cause: 'grounding_revalidation', actor: p.actor }) : null;
    await c.query('commit'); return { ...r, regrounded: g };
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}
export async function cliCreateTrackVersion(pool: Pool, p: Parameters<typeof createTrackConfigVersion>[1]) {
  const c = await pool.connect(); try { await c.query('begin'); const r = await createTrackConfigVersion(c, p); await c.query('commit'); return r; } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

@Injectable()
export class ConfigAdminService {
  // Nest-side admin actions arrive with the Admin Track Builder (Phase 8). The functions above are the single implementation the CLI uses today.
}
