import type { PoolClient } from 'pg';
import { claimPolicyRef, assetPresentableNow, claimKindForProposalType, CLAIM_KINDS, type ClaimKind } from '@naqla/domain';
import type { DomainFacts } from '@naqla/agents';
import { emitAuditEvent } from '../infra/audit';
import { loadDomainFacts } from './domain-facts';
import { resolveClaimPolicy, loadClaimSubject, eligibilityFor } from './claim-drafts';
import { currentGroundingVersion, groundWording } from './claim-facts';

/**
 * Current standing of approved professional assets (Phase 7b · BR-026 · DR-019).
 *
 * The approval is history: who approved which wording, under which policy,
 * when — never rewritten (a database trigger refuses it). STANDING is whether
 * the asset may be presented as evidence-backed NOW. When the claim policy in
 * effect for a kind changes, every active asset of that kind is re-checked
 * against it, in the SAME transaction as the change:
 *   - still eligible  → standing_policy_id = the policy now in effect
 *   - not eligible    → needs_review (D-077), not evidence-backed, reason recorded
 * Each check is an asset_standing_event. Nothing is approved or restored
 * automatically: a needs_review asset returns only by an explicit user act.
 * If any check fails, the caller's transaction (and with it the activation)
 * rolls back — no asset is left presented under an obsolete decision.
 */
export async function revalidateClaimAssets(c: PoolClient, p: { claimKind: ClaimKind | null; cause: 'policy_activation' | 'revalidation_run'; actor: string }) {
  const kinds = p.claimKind ? [p.claimKind] : [...CLAIM_KINDS];
  const factsByUser = new Map<string, DomainFacts>();
  const out = { checked: 0, keptEligible: 0, movedToReview: 0, policyRefs: {} as Record<string, string | null>, details: [] as { assetId: string; kind: ClaimKind; outcome: 'eligible' | 'needs_review'; reasons: string[] }[] };
  for (const kind of kinds) {
    const resolved = await resolveClaimPolicy(c, kind);
    out.policyRefs[kind] = resolved ? `${claimPolicyRef(resolved.policy)} (${resolved.resolution})` : null;
    // Locked for the rest of the transaction: no concurrent approval or withdrawal interleaves with the re-check.
    const assets = await c.query(
      `select a.id, a.user_id, a.skill_id, a.body, a.body_en, a.lifecycle_state, a.standing_checked_at from professional_asset a
        where a.kind = $1 and a.lifecycle_state = 'active' and a.user_approved_at is not null order by a.id for update`, [kind]);
    for (const a of assets.rows) {
      // The asset's CURRENT basis: a historical link to evidence withdrawn before the last re-link/standing check is history, not basis (D-077).
      a.evidence_ids = (await c.query(`select ae.evidence_id from asset_evidence ae join evidence e on e.id = ae.evidence_id
          where ae.asset_id = $1 and not (e.withdrawn_at is not null and $2::timestamptz is not null and e.withdrawn_at <= $2::timestamptz)`, [a.id, a.standing_checked_at])).rows.map((r) => String(r.evidence_id));
      out.checked++;
      const userId = String(a.user_id);
      if (!factsByUser.has(userId)) factsByUser.set(userId, await loadDomainFacts(c, userId));
      const subject = await loadClaimSubject(c, userId, kind, { namedSkillIds: a.skill_id ? [String(a.skill_id)] : [], suggestedValueAr: String(a.body), suggestedValueEn: a.body_en ?? null },
        (a.evidence_ids as string[]).map(String), factsByUser.get(userId)!);
      const verdict = eligibilityFor(kind, resolved, subject);
      const ref = out.policyRefs[kind];
      if (verdict.status === 'eligible' && resolved) {
        await c.query('update professional_asset set standing_policy_id = $2, standing_checked_at = now() where id = $1', [a.id, resolved.policy.id]);
        await c.query(`insert into asset_standing_event (asset_id, user_id, cause, claim_policy_id, claim_policy_ref, previous_state, new_state, eligible, reason, actor)
          values ($1,$2,$3,$4,$5,'active','active',true,$6,$7)`, [a.id, userId, p.cause, resolved.policy.id, ref, `still eligible under ${ref}`, p.actor]);
        out.keptEligible++;
        out.details.push({ assetId: String(a.id), kind, outcome: 'eligible', reasons: [] });
        continue;
      }
      const reasonsEn = verdict.status === 'eligible' ? 'no claim policy in effect' : verdict.reasons.map((r) => r.en).join('; ');
      out.details.push({ assetId: String(a.id), kind, outcome: 'needs_review', reasons: [reasonsEn] });
      const reasonAr = `اعتُمد هذا البند وفق قاعدة سابقة، ولم يعد يستوفي قاعدة العرض السارية${resolved ? ` (${claimPolicyRef(resolved.policy)})` : ''}. البند محفوظ كما اعتمدتِه، ولم يعد يُعرض بوصفه مدعومًا بدليل.`;
      await c.query(`update professional_asset set lifecycle_state = 'needs_review', evidence_backed = false, review_reason = $2, review_at = now(),
          standing_policy_id = $3, standing_checked_at = now() where id = $1`, [a.id, reasonAr, resolved?.policy.id ?? null]);
      await c.query(`insert into asset_standing_event (asset_id, user_id, cause, claim_policy_id, claim_policy_ref, previous_state, new_state, eligible, reason, actor)
        values ($1,$2,$3,$4,$5,'active','needs_review',false,$6,$7)`, [a.id, userId, p.cause, resolved?.policy.id ?? null, ref, reasonsEn, p.actor]);
      await c.query(`insert into notification (user_id, type, body_ar, action_label, action_href) values ($1, 'attention', $2, 'راجعي البند', $3)`, [userId, reasonAr, `/proposals?asset=${a.id}`]);
      await emitAuditEvent(c, { eventType: 'asset.needs_review', userId, actorKind: 'system', subjectTable: 'professional_asset', subjectId: String(a.id),
        reason: `the claim policy in effect changed (${ref ?? 'none'}); the asset no longer meets it: ${reasonsEn}. The approval is kept unchanged.`, payload: { cause: p.cause, policyRef: ref } });
      out.movedToReview++;
    }
  }
  return out;
}

/** The fail-closed presentation gate for one kind, as a predicate over asset rows: the policy AND the grounding version in effect. */
export async function presentableFilter(c: PoolClient, kind: ClaimKind) {
  const resolved = await resolveClaimPolicy(c, kind);
  const inEffect = resolved ? { policyId: resolved.policy.id, resolution: resolved.resolution } : null;
  const currentVersion = await currentGroundingVersion(c);
  // The caller selects `cites_withdrawn_evidence` (WITHDRAWN_EVIDENCE_SQL); a row without it is treated as citing withdrawn evidence — fail closed.
  return (row: { lifecycle_state: string; evidence_backed: boolean; user_approved_at: unknown; standing_policy_id: string | null; claim_policy_id: string | null; grounding_version: string | null; cites_withdrawn_evidence?: boolean }) =>
    assetPresentableNow({ lifecycleState: row.lifecycle_state, evidenceBacked: row.evidence_backed, userApprovedAt: row.user_approved_at ? String(row.user_approved_at) : null,
      standingPolicyId: row.standing_policy_id, claimPolicyId: row.claim_policy_id, citesWithdrawnEvidence: row.cites_withdrawn_evidence !== false }, inEffect, { assetVersion: row.grounding_version, currentVersion });
}

/**
 * Select-list expression for professional_asset rows (alias-free): whether evidence the asset cites was
 * withdrawn AFTER its standing was last established (approval, re-link or a standing check). A re-link keeps
 * the historical link to the withdrawn evidence beside the new one (D-077); that earlier withdrawal is
 * superseded by the re-link and does not count. Without a standing time, any withdrawal counts.
 */
export const WITHDRAWN_EVIDENCE_SQL = `exists (select 1 from asset_evidence ae join evidence e on e.id = ae.evidence_id where ae.asset_id = professional_asset.id
  and e.withdrawn_at is not null and (professional_asset.standing_checked_at is null or e.withdrawn_at > professional_asset.standing_checked_at)) as cites_withdrawn_evidence`;

/**
 * Phase 8 — re-grounding (owner requirement 3). When the grounding vocabulary in
 * effect changes (activation) or the engine version changes (deployment), every
 * active approved asset is grounded again, as written, against the records it
 * cites. Grounded → its grounding_version is the one in effect; otherwise →
 * needs_review with the reason. Runs inside the caller's transaction: if it
 * cannot complete, the vocabulary change does not happen. The approval itself is
 * never rewritten (trigger), and nothing is restored automatically.
 */
export interface RegroundDetail { assetId: string; kind: ClaimKind; previousVersion: string | null; outcome: 'grounded' | 'needs_review'; issues: string[] }

export async function regroundApprovedAssets(c: PoolClient, p: { cause: 'grounding_revalidation'; actor: string }) {
  const version = await currentGroundingVersion(c);
  const out = { checked: 0, grounded: 0, movedToReview: 0, version, details: [] as RegroundDetail[] };
  const assets = await c.query(
    `select a.id, a.user_id, a.kind, a.body, a.body_en, a.grounding_version from professional_asset a
      where a.lifecycle_state = 'active' and a.user_approved_at is not null order by a.id for update`);
  const factsByUser = new Map<string, DomainFacts>();
  for (const a of assets.rows) {
    const kind = claimKindForProposalType(String(a.kind));
    if (!kind) continue;
    out.checked++;
    const userId = String(a.user_id);
    if (!factsByUser.has(userId)) factsByUser.set(userId, await loadDomainFacts(c, userId));
    const refs = (await c.query('select evidence_id from asset_evidence where asset_id = $1', [a.id])).rows.map((r) => String(r.evidence_id));
    const g = await groundWording(c, userId, kind, { ar: String(a.body), en: a.body_en ?? null, plan: null }, refs, factsByUser.get(userId)!);
    const detail: RegroundDetail = { assetId: String(a.id), kind, previousVersion: a.grounding_version ?? null, outcome: g.decision === 'grounded' ? 'grounded' : 'needs_review', issues: g.issues.map((x) => x.en) };
    out.details.push(detail);
    if (g.decision === 'grounded') {
      // Only an actual re-check under the version in effect sets it — never a bulk "mark as grounded".
      await c.query('update professional_asset set grounding_version = $2 where id = $1', [a.id, version]);
      await c.query(`insert into asset_standing_event (asset_id, user_id, cause, previous_state, new_state, eligible, reason, actor) values ($1,$2,$3,'active','active',true,$4,$5)`,
        [a.id, userId, p.cause, `still grounded under ${version}`, p.actor]);
      out.grounded++;
      continue;
    }
    const reasonAr = 'تغيّرت قواعد التحقق من الصياغة، ولم يعد هذا البند كما كُتب مستندًا إلى أدلتك المسجّلة. البند محفوظ كما اعتمدتِه، ولم يعد يُعرض بوصفه مدعومًا بدليل.';
    await c.query(`update professional_asset set lifecycle_state = 'needs_review', evidence_backed = false, review_reason = $2, review_at = now() where id = $1`, [a.id, reasonAr]);
    await c.query(`insert into asset_standing_event (asset_id, user_id, cause, previous_state, new_state, eligible, reason, actor) values ($1,$2,$3,'active','needs_review',false,$4,$5)`,
      [a.id, userId, p.cause, `not grounded under ${version}: ${g.issues.map((x) => x.en).join('; ')}`, p.actor]);
    await c.query(`insert into notification (user_id, type, body_ar, action_label, action_href) values ($1, 'attention', $2, 'راجعي البند', $3)`, [userId, reasonAr, `/proposals?asset=${a.id}`]);
    await emitAuditEvent(c, { eventType: 'asset.needs_review', userId, actorKind: 'system', subjectTable: 'professional_asset', subjectId: String(a.id),
      reason: `grounding ${version}: the approved wording is no longer accounted for by its cited records. The approval is kept unchanged.`, payload: { cause: p.cause, version } });
    out.movedToReview++;
  }
  return out;
}

/**
 * Phase 9 — standing snapshot used before and after a re-grounding run
 * (deployment procedure): how many active approved assets exist, under which
 * grounding version, and how many are presentable right now.
 */
export async function groundingStandingSnapshot(c: PoolClient) {
  const current = await currentGroundingVersion(c);
  const rows = (await c.query(`select id, kind, lifecycle_state, evidence_backed, user_approved_at, standing_policy_id, claim_policy_id, grounding_version, ${WITHDRAWN_EVIDENCE_SQL}
      from professional_asset where user_approved_at is not null and lifecycle_state in ('active','needs_review')`)).rows;
  const filters = new Map<ClaimKind, Awaited<ReturnType<typeof presentableFilter>>>();
  const snap = { currentVersion: current, activeApproved: 0, activeClaimKinds: 0, activeOtherKinds: 0, underCurrentVersion: 0, underOtherVersion: 0, withoutVersion: 0,
    presentableNow: 0, needsReview: 0, byVersion: {} as Record<string, number> };
  for (const r of rows) {
    if (r.lifecycle_state === 'needs_review') { snap.needsReview++; continue; }
    snap.activeApproved++;
    const kind = claimKindForProposalType(String(r.kind));
    if (!kind) { snap.activeOtherKinds++; continue; }
    snap.activeClaimKinds++;
    const v = r.grounding_version as string | null;
    snap.byVersion[v ?? '(none)'] = (snap.byVersion[v ?? '(none)'] ?? 0) + 1;
    if (v === null) snap.withoutVersion++; else if (v === current) snap.underCurrentVersion++; else snap.underOtherVersion++;
    if (!filters.has(kind)) filters.set(kind, await presentableFilter(c, kind));
    if (filters.get(kind)!(r).presentable) snap.presentableNow++;
  }
  return snap;
}
export type GroundingSnapshot = Awaited<ReturnType<typeof groundingStandingSnapshot>>;

/**
 * Reconciliation after a run: every asset that was active and approved before is
 * accounted for (re-grounded under the version in effect, or moved to review),
 * and no active approved claim asset is left under another version.
 */
export function reconcileGrounding(before: GroundingSnapshot, after: GroundingSnapshot, run: { checked: number; grounded: number; movedToReview: number }, revalidationMoved: number): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (run.checked !== before.activeClaimKinds - revalidationMoved) problems.push(`checked ${run.checked} assets, but ${before.activeClaimKinds - revalidationMoved} active approved claim assets were due`);
  if (run.grounded + run.movedToReview !== run.checked) problems.push(`grounded ${run.grounded} + moved ${run.movedToReview} ≠ checked ${run.checked}`);
  if (after.underOtherVersion !== 0 || after.withoutVersion !== 0) problems.push(`${after.underOtherVersion + after.withoutVersion} active approved asset(s) remain under another or no grounding version`);
  if (after.underCurrentVersion !== run.grounded) problems.push(`${after.underCurrentVersion} assets under the current version, but ${run.grounded} were grounded`);
  if (after.needsReview !== before.needsReview + run.movedToReview + revalidationMoved) problems.push(`needs_review went ${before.needsReview} → ${after.needsReview}, expected +${run.movedToReview + revalidationMoved}`);
  if (after.activeApproved + (after.needsReview - before.needsReview) !== before.activeApproved) problems.push('an asset left both active and needs_review states during the run');
  return { ok: problems.length === 0, problems };
}
