import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { assertActivationAllowed, configIsValidated, MissingPrerequisite, CLAIM_KIND_CLASS, evidenceOrdinal, type ConfigActivation, type ClaimKind, type EvidenceState } from '@naqla/domain';
import { GOVERNED_TABLES, governedFromRow, isProduction, type GovernedTable } from './configuration.service';
import { revalidateClaimAssets, regroundApprovedAssets, groundingStandingSnapshot, reconcileGrounding, type RegroundDetail, type GroundingSnapshot } from '../agents/asset-standing';
import { emitAuditEvent } from '../infra/audit';

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
  const scope = p.table === 'track_config_version' ? 'target_role_id' : p.table === 'claim_policy' ? 'key, claim_kind' : p.table === 'readiness_rule_set' ? "coalesce(target_role_id, '00000000-0000-0000-0000-000000000000'::uuid), key"
    : p.table === 'pack_constraint_set' ? "key, coalesce(track_id, '')" : 'key';
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
    if (p.table === 'grounding_lexicon') {
      const g = await regroundApprovedAssets(c, { cause: 'grounding_revalidation', actor: p.actor });
      // Phase 9: public direct-read paths follow the version every asset was just re-grounded under (same transaction).
      await declarePublicGroundingVersion(c, g.version, p.actor, `vocabulary activation: ${p.reason}`);
    }
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
  // D-118: the legacy promotion basis (declarations may earn a level) never runs in production; the database refuses it too.
  if (table === 'verification_policy' && row['promotion_basis'] === 'legacy_any_pass' && productionLike) {
    throw new BadRequestException('a verification policy with the legacy promotion basis cannot be activated in production: a declaration or an upload never earns a level (D-118)');
  }
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
export async function cliRevalidateClaims(pool: Pool, p: { claimKind: string | null; actor: string }) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const r = await revalidateClaimAssets(c, { claimKind: p.claimKind as Parameters<typeof revalidateClaimAssets>[1]['claimKind'], cause: 'revalidation_run', actor: p.actor });
    await c.query('commit'); return r;
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

/* ───────────────────────────── Phase 9: re-grounding deployment procedure ───────────────────────────── */

/** The version public direct-read paths (case-study share links) accept. Null = frozen (closed). Logged append-only. */
export async function declarePublicGroundingVersion(c: PoolClient, version: string | null, setBy: string, reason: string) {
  await c.query(`insert into grounding_public_state (singleton, version, set_at, set_by, reason) values (true, $1, now(), $2, $3)
      on conflict (singleton) do update set version = excluded.version, set_at = now(), set_by = excluded.set_by, reason = excluded.reason`, [version, setBy, reason]);
}

/** An operator is a person with an active product_owner grant. A name alone is not an authorization. */
export async function assertAuthorizedOperator(c: PoolClient, operatorId: string | null | undefined): Promise<string> {
  if (!operatorId || !/^[0-9a-f-]{36}$/i.test(operatorId)) throw new MissingPrerequisite('operator', 'an authorized operator is required: --operator <user-uuid> holding an active product_owner grant');
  const g = await c.query(`select u.display_name from reviewer_grant r join app_user u on u.id = r.user_id where r.user_id = $1 and r.role_performed = 'product_owner' and r.revoked_at is null`, [operatorId]);
  if (g.rowCount === 0) throw new MissingPrerequisite('operator', `user ${operatorId} holds no active product_owner grant; re-grounding is an operator act`);
  return `${String(g.rows[0].display_name ?? operatorId)} (${operatorId})`;
}

export interface RegroundRunResult {
  dryRun: boolean; operator: string | null; version: string;
  before: GroundingSnapshot; after: GroundingSnapshot;
  revalidation: { checked: number; keptEligible: number; movedToReview: number; details: { assetId: string; kind: string; outcome: 'eligible' | 'needs_review'; reasons: string[] }[] };
  regrounding: { checked: number; grounded: number; movedToReview: number; details: RegroundDetail[] };
  reconciliation: { ok: boolean; problems: string[] };
  publicVersionDeclared: string | null;
}

/**
 * Re-grounds every active approved asset under the grounding version in effect.
 *   dry run  — the SAME code path inside a transaction that is rolled back: the
 *              plan (which assets stay, which would move to needs_review) with
 *              nothing written, no notification sent. No operator needed.
 *   execute  — an authorized operator (product_owner grant); reconciliation must
 *              pass or the whole run rolls back; then the public grounding version
 *              is declared and an audit event recorded, in the same transaction.
 * Nothing is marked grounded without being grounded: an asset gets the version
 * only when the engine accepts its wording against its cited records now.
 */
export async function cliRegroundAssets(pool: Pool, p: { operatorId?: string | null; dryRun: boolean; reason?: string }): Promise<RegroundRunResult> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const operator = p.dryRun ? null : await assertAuthorizedOperator(c, p.operatorId);
    if (!p.dryRun && !p.reason?.trim()) throw new MissingPrerequisite('reason', 'a re-grounding run needs a written reason');
    const actor = operator ?? 'dry run';
    const before = await groundingStandingSnapshot(c);
    const rv = await revalidateClaimAssets(c, { claimKind: null, cause: 'revalidation_run', actor });
    const rg = await regroundApprovedAssets(c, { cause: 'grounding_revalidation', actor });
    const after = await groundingStandingSnapshot(c);
    const reconciliation = reconcileGrounding(before, after, rg, rv.movedToReview);
    const result: RegroundRunResult = { dryRun: p.dryRun, operator, version: rg.version, before, after,
      revalidation: { checked: rv.checked, keptEligible: rv.keptEligible, movedToReview: rv.movedToReview, details: rv.details },
      regrounding: { checked: rg.checked, grounded: rg.grounded, movedToReview: rg.movedToReview, details: rg.details }, reconciliation, publicVersionDeclared: null };
    if (p.dryRun) { await c.query('rollback'); return result; }
    if (!reconciliation.ok) throw new Error(`re-grounding reconciliation failed; nothing was changed:\n  - ${reconciliation.problems.join('\n  - ')}`);
    await declarePublicGroundingVersion(c, rg.version, actor, p.reason!.trim());
    await emitAuditEvent(c, { eventType: 'grounding.reground_run', userId: null, actorKind: 'user', actorId: p.operatorId!, rolePerformed: 'product_owner', subjectTable: 'professional_asset', subjectId: null,
      reason: p.reason!.trim(), payload: { version: rg.version, before, after: { ...after }, grounded: rg.grounded, movedToReview: rg.movedToReview + rv.movedToReview } });
    await c.query('commit');
    return { ...result, publicVersionDeclared: rg.version };
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

/** Read-only standing report (pre-deployment count, post-run check). */
export async function cliGroundingStanding(pool: Pool) {
  const c = await pool.connect();
  try {
    const snap = await groundingStandingSnapshot(c);
    const pub = (await c.query('select version, set_at, set_by from grounding_public_state where singleton')).rows[0] ?? null;
    return { ...snap, publicVersion: pub ? (pub.version as string | null) : null, publicSetBy: pub?.set_by ?? null };
  } finally { c.release(); }
}

/** Pre-deployment step: close direct public paths until the new version has been re-grounded. Operator only. */
export async function cliFreezePublicGrounding(pool: Pool, p: { operatorId: string; reason: string }) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const operator = await assertAuthorizedOperator(c, p.operatorId);
    if (!p.reason?.trim()) throw new MissingPrerequisite('reason', 'a freeze needs a written reason');
    await declarePublicGroundingVersion(c, null, operator, `freeze: ${p.reason.trim()}`);
    await emitAuditEvent(c, { eventType: 'grounding.public_frozen', userId: null, actorKind: 'user', actorId: p.operatorId, rolePerformed: 'product_owner', subjectTable: 'grounding_public_state', subjectId: null, reason: p.reason.trim(), payload: {} });
    await c.query('commit');
    return { operator };
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}
export async function cliCreateTrackVersion(pool: Pool, p: Parameters<typeof createTrackConfigVersion>[1]) {
  const c = await pool.connect(); try { await c.query('begin'); const r = await createTrackConfigVersion(c, p); await c.query('commit'); return r; } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

@Injectable()
export class ConfigAdminService {
  // Nest-side admin actions arrive with the Admin Track Builder (Phase 8). The functions above are the single implementation the CLI uses today.
}
