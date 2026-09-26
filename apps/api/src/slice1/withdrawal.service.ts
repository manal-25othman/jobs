import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import {
  effectOfWithdrawal, assertRelinkAllowed, assertAssetTransition, MissingPrerequisite,
  type EvidenceState, type AssetLifecycleState,
} from '@naqla/domain';
import { validateAgainstDomain, ProposalRejected } from '@naqla/agents';
import { loadDomainFacts } from '../agents/domain-facts';

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
  constructor(private readonly db: DbService) {}

  async withdraw(userId: string, evidenceId: string, reason: string) {
    if (!reason?.trim()) throw new MissingPrerequisite('reason', 'withdrawing evidence needs a recorded reason');
    return this.db.asService(async (c) => {
      const ev = await c.query('select id, user_id, withdrawn_at from evidence where id = $1', [evidenceId]);
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
        await emitAuditEvent(c, { eventType: 'asset.needs_review', userId, actorKind: 'system', subjectTable: 'professional_asset', subjectId: a.id,
          reason: 'the evidence behind this asset was withdrawn; the asset is kept and no longer presented as evidence-backed', payload: { evidenceId } });
        affected.push({ id: a.id, lifecycleState: effect.to, evidenceBacked: effect.evidenceBacked });
      }

      await emitAuditEvent(c, { eventType: 'evidence.withdrawn', userId, actorKind: 'user', actorId: userId, subjectTable: 'evidence', subjectId: evidenceId,
        reason: reason.trim(), payload: { affectedAssets: affected.map((a) => a.id) } });

      return { evidenceId, withdrawn: true as const, affectedAssets: affected };
    });
  }

  /** Explicit re-link to evidence that qualifies on its own. Nothing implicit. */
  async relink(userId: string, assetId: string, evidenceId: string) {
    if (!evidenceId) throw new BadRequestException('an evidence id is required');
    return this.db.asService(async (c) => {
      const asset = await c.query(
        'select id, user_id, skill_id, body, body_en, lifecycle_state, user_approved_at from professional_asset where id = $1', [assetId]);
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

      await c.query('insert into asset_evidence (asset_id, evidence_id) values ($1,$2) on conflict do nothing', [assetId, e.id]);
      await c.query(
        `update professional_asset set lifecycle_state = 'active', evidence_backed = true, review_reason = null, review_at = null,
                project_id = $2, evaluation_result_id = $3 where id = $1`, [assetId, e.project_id, e.evaluation_result_id]);
      await emitAuditEvent(c, { eventType: 'asset.relinked', userId, actorKind: 'user', actorId: userId, subjectTable: 'professional_asset', subjectId: assetId,
        reason: 'the user re-linked the asset to evidence that qualifies on its own', payload: { evidenceId: e.id } });
      return { assetId, lifecycleState: 'active' as const, evidenceBacked: true as const, linkedEvidenceId: e.id };
    });
  }
}
