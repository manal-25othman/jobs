import type { PoolClient } from 'pg';
import {
  resolveActiveConfig, claimEligibility, claimPolicyRef, CLAIM_KIND_CLASS,
  type ClaimKind, type ClaimPolicy, type ClaimSubject, type ResolvedClaimPolicy, type ClaimEligibility,
  type EvidenceState, type EvidenceSourceStrength,
} from '@naqla/domain';
import { skillsMentioned, type DomainFacts, type WordingPayload } from '@naqla/agents';
import { governedFromRow, isProduction } from '../configuration/configuration.service';

/**
 * Claim drafts (Phase 7, D-114): the database side of claim-policy
 * eligibility. The rule itself is pure (claimEligibility in @naqla/domain);
 * this file only loads the policy active for a kind and the facts it judges.
 */

export function claimPolicyFromRow(r: Record<string, unknown>): ClaimPolicy {
  return { ...governedFromRow(r), claimKind: r['claim_kind'] as ClaimKind, minEvidenceLevel: r['min_evidence_level'] as EvidenceState,
    minEvidenceCount: r['min_evidence_count'] === null ? null : Number(r['min_evidence_count']),
    minSourceStrength: (r['min_source_strength'] as EvidenceSourceStrength | null) ?? null,
    requiresVerificationDecision: r['requires_verification_decision'] === true, requiresUserApproval: true, lockUntilGrounded: r['lock_until_grounded'] !== false };
}

/** The claim policy in effect for a kind in this environment: validated production row, else the legacy baseline; outside production a development-only draft may run. Never an inactive draft. */
export async function resolveClaimPolicy(c: PoolClient, kind: ClaimKind): Promise<(ResolvedClaimPolicy & { validationNote: string }) | null> {
  const { rows } = await c.query('select * from claim_policy where claim_kind = $1', [kind]);
  const r = resolveActiveConfig(rows.map(claimPolicyFromRow), { production: isProduction() });
  if (!r.row) return null;
  const row = rows.find((x) => x.id === r.row!.id)!;
  return { policy: r.row, resolution: r.resolution, validationNote: String(row.validation_note_en) };
}

/** The facts a claim is judged by: the skills it asserts and the evidence it cites, as they stand NOW. */
export async function loadClaimSubject(c: PoolClient, userId: string, kind: ClaimKind, payload: Pick<WordingPayload, 'namedSkillIds' | 'suggestedValueAr' | 'suggestedValueEn'>,
  evidenceRefs: readonly string[], facts: Pick<DomainFacts, 'skillStates' | 'knownSkills' | 'knownTechnologies'>): Promise<ClaimSubject> {
  const assertedIds = CLAIM_KIND_CLASS[kind] === 'skill_assertion'
    ? new Set([...payload.namedSkillIds, ...[payload.suggestedValueAr, payload.suggestedValueEn ?? ''].flatMap((t) => skillsMentioned(t, facts.knownSkills, facts.knownTechnologies))])
    : new Set<string>();
  const ev = evidenceRefs.length === 0 ? { rows: [] as Record<string, unknown>[] } : await c.query(
    `select e.id, canonical_skill_id(e.skill_id) as skill_id, e.source_strength, e.withdrawn_at is null as standing
       from evidence e where e.user_id = $1 and e.id = any($2::uuid[])`, [userId, evidenceRefs]);
  const skillIds = new Set([...assertedIds, ...ev.rows.map((r) => String(r['skill_id']))]);
  const counts = skillIds.size === 0 ? { rows: [] as Record<string, unknown>[] } : await c.query(
    `select canonical_skill_id(skill_id) as skill_id, count(*)::int as n from evidence where user_id = $1 and withdrawn_at is null and canonical_skill_id(skill_id) = any($2::uuid[]) group by 1`,
    [userId, [...skillIds]]);
  const decided = skillIds.size === 0 ? { rows: [] as Record<string, unknown>[] } : await c.query(
    `select distinct canonical_skill_id(skill_id) as skill_id from verification_decision where user_id = $1 and canonical_skill_id(skill_id) = any($2::uuid[])`, [userId, [...skillIds]]);
  return {
    assertedSkills: [...assertedIds].map((skillId) => ({ skillId, state: facts.skillStates[skillId] ?? 'gap' })),
    // The state that decides is the claim's state for the evidence's (canonical) skill, from the same facts validation used.
    citedEvidence: ev.rows.map((r) => ({ evidenceId: String(r['id']), skillId: String(r['skill_id']), state: facts.skillStates[String(r['skill_id'])] ?? 'gap',
      sourceStrength: r['source_strength'] as EvidenceSourceStrength, standing: r['standing'] === true })),
    standingEvidenceCount: Object.fromEntries(counts.rows.map((r) => [String(r['skill_id']), Number(r['n'])])),
    skillsWithVerificationDecision: new Set(decided.rows.map((r) => String(r['skill_id']))),
  };
}

export function eligibilityFor(kind: ClaimKind, resolved: ResolvedClaimPolicy | null, subject: ClaimSubject): ClaimEligibility {
  return claimEligibility(kind, resolved, subject);
}

export async function recordClaimEvent(c: PoolClient, e: { proposalId: string; userId: string; event: 'drafted' | 'previewed' | 'approved' | 'rejected' | 'flagged_evidence_withdrawn' | 'refused_not_eligible';
  claimKind: ClaimKind; policy: ResolvedClaimPolicy | null; actorKind: 'user' | 'system'; detail: string; assetId?: string | null }): Promise<void> {
  await c.query(
    `insert into claim_draft_event (proposal_id, user_id, event, claim_kind, claim_policy_id, claim_policy_ref, actor_kind, detail, asset_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [e.proposalId, e.userId, e.event, e.claimKind, e.policy?.policy.id ?? null, e.policy ? `${claimPolicyRef(e.policy.policy)} (${e.policy.resolution})` : null, e.actorKind, e.detail, e.assetId ?? null]);
}
