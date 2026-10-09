import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { SkillProgressEngine } from '../skill-progress/skill-progress-engine.service';
import {
  effectOfWithdrawal, assertRelinkAllowed, assertAssetTransition, MissingPrerequisite, claimKindForProposalType, claimPolicyRef,
  type EvidenceState, type AssetLifecycleState,
} from '@naqla/domain';
import { validateAgainstDomain, ProposalRejected } from '@naqla/agents';
import { loadDomainFacts } from '../agents/domain-facts';
import { recordClaimEvent, resolveClaimPolicy, loadClaimSubject, eligibilityFor } from '../agents/claim-drafts';
import { groundWording, groundingVersion } from '../agents/claim-facts';

/**
 * Withdrawn evidence (D-077).
 *
 * Withdrawing evidence never deletes anything. The evidence row is marked, the
 * assets that rested on it move to `needs_review` and stop being presented as
 * evidence-backed, and the public projection reflects that on its next read
 * because it is rebuilt from current state (ReportService.getPublicProjection).
 * Returning to `active` is an explicit re-link the domain must allow.
 */
@Injectable()
export class WithdrawalService {
  constructor(private readonly db: DbService, private readonly progress: SkillProgressEngine) {}

  async withdraw(userId: string, evidenceId: string, reason: string) {
    if (!reason?.trim()) throw new MissingPrerequisite('reason', 'withdrawing evidence needs a recorded reason');
    return this.db.asService(async (c) => {
      const ev = await c.query('select id, user_id, skill_id, withdrawn_at from evidence where id = $1', [evidenceId]);
      if (ev.rowCount === 0 || ev.rows[0].user_id !== userId) throw new NotFoundException('evidence not found');
      if (ev.rows[0].withdrawn_at) throw new BadRequestException('this evidence is already withdrawn');

      await c.query('update evidence set withdrawn_at = now(), withdrawn_reason = $2 where id = $1', [evidenceId, reason.trim()]);

      // An asset stays backed while ANY linked evidence still stands.
      const assets = await c.query(
        `select a.id from professional_asset a
           join asset_evidence ae on ae.asset_id = a.id
          where ae.evidence_id = $1 and a.user_id = $2 and a.lifecycle_state = 'active'
            and not exists (select 1 from asset_evidence ae2 join evidence e2 on e2.id = ae2.evidence_id
                             where ae2.asset_id = a.id and e2.withdrawn_at is null)`,
        [evidenceId, userId]);

      const affected: { id: string; lifecycleState: 'needs_review'; evidenceBacked: false }[] = [];
      for (const a of assets.rows) {
        const effect = effectOfWithdrawal({ assetId: a.id, evidenceId, reason: reason.trim() });
        await c.query(
          `update professional_asset set lifecycle_state = $2, evidence_backed = $3, review_reason = $4, review_at = now() where id = $1`,
          [a.id, effect.to, effect.evidenceBacked, effect.explanationAr]);
        await c.query(
          `insert into notification (user_id, type, body_ar, action_label, action_href)
           values ($1, 'attention', $2, 'راجعي البند', $3)`,
          [userId, effect.explanationAr, `/proposals?asset=${a.id}`]);
        // Phase 7b (DR-019): every standing change is its own event; the approval itself is untouched.
        await c.query(`insert into asset_standing_event (asset_id, user_id, cause, previous_state, new_state, eligible, reason, actor)
          values ($1,$2,'evidence_withdrawn','active','needs_review',false,$3,'user')`, [a.id, userId, `evidence ${evidenceId} withdrawn: ${reason.trim()}`]);
        await emitAuditEvent(c, { eventType: 'asset.needs_review', userId, actorKind: 'system', subjectTable: 'professional_asset', subjectId: a.id,
          reason: 'the evidence behind this asset was withdrawn; the asset is kept and no longer presented as evidence-backed', payload: { evidenceId } });
        affected.push({ id: a.id, lifecycleState: effect.to, evidenceBacked: effect.evidenceBacked });
      }

      // Phase 7: claim drafts still waiting for the user that cite this evidence are flagged, not deleted.
      // They can no longer be approved (approval re-checks the evidence); the user sees why.
      const drafts = await c.query(
        `select id, proposal_type, claim_kind from agent_proposal
          where user_id = $1 and lifecycle = 'awaiting_user' and $2 = any(evidence_refs)`, [userId, evidenceId]);
      const flaggedDrafts: string[] = [];
      for (const d of drafts.rows) {
        const kind = claimKindForProposalType(d.proposal_type);
        if (!kind) continue;
        if (d.claim_kind) await c.query(`update agent_proposal set grounding_status = 'evidence_withdrawn' where id = $1`, [d.id]);
        await recordClaimEvent(c, { proposalId: d.id, userId, event: 'flagged_evidence_withdrawn', claimKind: kind, policy: null, actorKind: 'system',
          detail: `evidence ${evidenceId} was withdrawn: ${reason.trim()}` });
        flaggedDrafts.push(d.id);
      }

      await emitAuditEvent(c, { eventType: 'evidence.withdrawn', userId, actorKind: 'user', actorId: userId, subjectTable: 'evidence', subjectId: evidenceId,
        reason: reason.trim(), payload: { affectedAssets: affected.map((a) => a.id), flaggedClaimDrafts: flaggedDrafts } });

      // Phase 2: the journey learns how much evidence still stands. The claim state is not touched here (D-077).
      const standing = await c.query('select count(*)::int as n from evidence where user_id = $1 and skill_id = $2 and withdrawn_at is null', [userId, ev.rows[0].skill_id]);
      await this.progress.apply(c, { userId, skillId: ev.rows[0].skill_id, trigger: 'evidence.withdrawn', facts: { standing_evidence_count: standing.rows[0].n },
        eventRef: { table: 'evidence', id: evidenceId }, reason: `evidence withdrawn: ${reason.trim()}`, actorKind: 'user' });

      return { evidenceId, withdrawn: true as const, affectedAssets: affected, flaggedClaimDrafts: flaggedDrafts };
    });
  }

  /** Explicit re-link to evidence that qualifies on its own. Nothing implicit. */
  async relink(userId: string, assetId: string, evidenceId: string) {
    if (!evidenceId) throw new BadRequestException('an evidence id is required');
    return this.db.asService(async (c) => {
      const asset = await c.query(
        'select id, user_id, skill_id, kind, body, body_en, lifecycle_state, user_approved_at from professional_asset where id = $1', [assetId]);
      if (asset.rowCount === 0 || asset.rows[0].user_id !== userId) throw new NotFoundException('asset not found');
      const a = asset.rows[0];

      const cand = await c.query(
        `select e.id, e.user_id, e.skill_id, e.withdrawn_at, e.project_id, e.evaluation_result_id, sc.state
           from evidence e join skill_claim sc on sc.user_id = e.user_id and sc.skill_id = e.skill_id where e.id = $1`, [evidenceId]);
      if (cand.rowCount === 0 || cand.rows[0].user_id !== userId) throw new NotFoundException('evidence not found');
      const e = cand.rows[0];

      // Domain rules first: owner, not withdrawn, same skill, qualifies alone.
      assertRelinkAllowed({ skillId: a.skill_id, ownerId: a.user_id },
        { evidenceId: e.id, skillId: e.skill_id, state: e.state as EvidenceState, withdrawn: !!e.withdrawn_at, ownerId: e.user_id });
      assertAssetTransition(a.lifecycle_state as AssetLifecycleState, 'active', { userApprovedAt: a.user_approved_at ? String(a.user_approved_at) : null });

      // The wording must still survive domain validation against current facts.
      try {
        validateAgainstDomain({ proposalType: 'cv_bullet', evidenceRefs: [e.id], structuredPayload: {
          kind: 'wording', currentValue: null, suggestedValueAr: a.body, suggestedValueEn: a.body_en ?? null, supportingSources: [],
          reason: 'explicit re-link', unsupportedRisk: 'none', limitationNote: null, namedSkillIds: [a.skill_id], namedTechnologies: [] } },
          await loadDomainFacts(c, userId));
      } catch (err) {
        if (err instanceof ProposalRejected) throw new BadRequestException(`re-link refused by domain validation: ${err.message}`);
        throw err;
      }

      // Phase 7b (BR-026): the wording must be eligible under the claim policy in effect now, and grounded in the new evidence's records.
      const kind = claimKindForProposalType(a.kind);
      if (!kind) throw new BadRequestException(`an asset of kind '${a.kind}' has no claim kind to re-check`);
      const facts = await loadDomainFacts(c, userId);
      const resolved = await resolveClaimPolicy(c, kind);
      const verdict = eligibilityFor(kind, resolved, await loadClaimSubject(c, userId, kind, { namedSkillIds: [a.skill_id], suggestedValueAr: a.body, suggestedValueEn: a.body_en ?? null }, [e.id], facts));
      if (verdict.status !== 'eligible' || !resolved) throw new BadRequestException(`re-link refused by the claim policy in effect: ${verdict.status === 'eligible' ? 'no policy' : verdict.reasons.map((r) => r.en).join('; ')}`);
      const grounding = await groundWording(c, userId, kind, { ar: a.body, en: a.body_en ?? null, plan: null }, [e.id], facts);
      if (grounding.decision !== 'grounded') throw new BadRequestException(`re-link refused by claim grounding (${grounding.decision}): ${grounding.issues.map((x) => x.en).join('; ')}`);

      await c.query('insert into asset_evidence (asset_id, evidence_id) values ($1,$2) on conflict do nothing', [assetId, e.id]);
      await c.query(
        `update professional_asset set lifecycle_state = 'active', evidence_backed = true, review_reason = null, review_at = null,
                project_id = $2, evaluation_result_id = $3, standing_policy_id = $4, standing_checked_at = now(), grounding_version = $5 where id = $1`, [assetId, e.project_id, e.evaluation_result_id, resolved.policy.id, groundingVersion(grounding)]);
      await c.query(`insert into asset_standing_event (asset_id, user_id, cause, claim_policy_id, claim_policy_ref, previous_state, new_state, eligible, reason, actor)
        values ($1,$2,'relinked',$3,$4,$5,'active',true,$6,'user')`, [assetId, userId, resolved.policy.id, `${claimPolicyRef(resolved.policy)} (${resolved.resolution})`, a.lifecycle_state, `re-linked to evidence ${e.id}; eligible and grounded`]);
      await emitAuditEvent(c, { eventType: 'asset.relinked', userId, actorKind: 'user', actorId: userId, subjectTable: 'professional_asset', subjectId: assetId,
        reason: 'the user re-linked the asset to evidence that qualifies on its own', payload: { evidenceId: e.id } });
      return { assetId, lifecycleState: 'active' as const, evidenceBacked: true as const, linkedEvidenceId: e.id };
    });
  }
}
