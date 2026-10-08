import type { PoolClient } from 'pg';
import { claimPolicyRef, assetPresentableNow, CLAIM_KINDS, type ClaimKind } from '@naqla/domain';
import type { DomainFacts } from '@naqla/agents';
import { emitAuditEvent } from '../infra/audit';
import { loadDomainFacts } from './domain-facts';
import { resolveClaimPolicy, loadClaimSubject, eligibilityFor } from './claim-drafts';

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
  const out = { checked: 0, keptEligible: 0, movedToReview: 0, policyRefs: {} as Record<string, string | null> };
  for (const kind of kinds) {
    const resolved = await resolveClaimPolicy(c, kind);
    out.policyRefs[kind] = resolved ? `${claimPolicyRef(resolved.policy)} (${resolved.resolution})` : null;
    // Locked for the rest of the transaction: no concurrent approval or withdrawal interleaves with the re-check.
    const assets = await c.query(
      `select a.id, a.user_id, a.skill_id, a.body, a.body_en, a.lifecycle_state from professional_asset a
        where a.kind = $1 and a.lifecycle_state = 'active' and a.user_approved_at is not null order by a.id for update`, [kind]);
    for (const a of assets.rows) {
      a.evidence_ids = (await c.query('select evidence_id from asset_evidence where asset_id = $1', [a.id])).rows.map((r) => String(r.evidence_id));
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
        continue;
      }
      const reasonsEn = verdict.status === 'eligible' ? 'no claim policy in effect' : verdict.reasons.map((r) => r.en).join('; ');
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

/** The fail-closed presentation gate for one kind, as a predicate over asset rows. */
export async function presentableFilter(c: PoolClient, kind: ClaimKind) {
  const resolved = await resolveClaimPolicy(c, kind);
  const inEffect = resolved ? { policyId: resolved.policy.id, resolution: resolved.resolution } : null;
  return (row: { lifecycle_state: string; evidence_backed: boolean; user_approved_at: unknown; standing_policy_id: string | null; claim_policy_id: string | null }) =>
    assetPresentableNow({ lifecycleState: row.lifecycle_state, evidenceBacked: row.evidence_backed, userApprovedAt: row.user_approved_at ? String(row.user_approved_at) : null,
      standingPolicyId: row.standing_policy_id, claimPolicyId: row.claim_policy_id }, inEffect);
}
