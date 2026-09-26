import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { assertAssetTransition } from '@naqla/domain';

/**
 * Professional assets — read, preview and approval of DRAFT assets.
 *
 * D-074: nothing here writes wording. The deterministic layer prepares facts,
 * the Recruitment Agent proposes wording, domain validation checks it, and the
 * user approves it on the proposal path (AgentService.approve). The direct
 * "generate a CV bullet" endpoint no longer exists.
 *
 * Lifecycle: draft → preview → approved → active (→ needs_review ⇄ active).
 * Nothing becomes active without an explicit user approval, and the database
 * refuses the state change even if this service forgot to check.
 */
@Injectable()
export class AssetService {
  constructor(private readonly db: DbService) {}

  /** The preview step. A change is previewed, never applied by a button. */
  async previewAsset(userId: string, assetId: string) {
    return this.db.asService(async (c) => {
      const asset = await this.loadOwnAsset(c, userId, assetId);
      if (asset.lifecycle_state === 'draft') {
        assertAssetTransition('draft', 'preview', {});
        await c.query(
          `update professional_asset set lifecycle_state = 'preview' where id = $1`, [assetId],
        );
      }
      const traces = await c.query(
        `select clause, kind, ref from asset_trace where asset_id = $1 order by position`,
        [assetId],
      );
      return {
        assetId,
        current: null,
        proposedAr: asset.body,
        proposedEn: asset.body_en,
        evidenceBasis: traces.rows,
        requiresApproval: true as const,
      };
    });
  }

  async approveAsset(userId: string, assetId: string, editedBody?: string) {
    return this.db.asService(async (c) => {
      const asset = await this.loadOwnAsset(c, userId, assetId);
      const approvedAt = new Date().toISOString();

      // D-057: preview → optional edit → explicit approval → active. A draft
      // that was never previewed cannot be approved; the user must have seen it.
      assertAssetTransition(asset.lifecycle_state, 'approved', { userApprovedAt: approvedAt });

      // An edit outside the evidence drops the verified tag: the wording is
      // now the user's, not something the evaluation supports.
      const userEdited = typeof editedBody === 'string' && editedBody.trim() !== asset.body.trim();

      await c.query(
        `update professional_asset
            set body = coalesce($1, body),
                status = case when $2 then 'user_edited' else 'approved' end,
                lifecycle_state = 'active',
                user_approved_at = $3,
                provenance_class = case when $2 then 'user_generated' else provenance_class end
          where id = $4`,
        [editedBody ?? null, userEdited, approvedAt, assetId],
      );

      await emitAuditEvent(c, {
        eventType: 'asset.approved',
        userId, actorKind: 'user', actorId: userId,
        subjectTable: 'professional_asset', subjectId: assetId,
        reason: userEdited
          ? 'the user approved the asset after editing the wording'
          : 'the user approved the generated asset as written',
        payload: { userEdited },
      });

      const { rows } = await c.query(
        `select id, body, body_en, status, lifecycle_state, user_approved_at
           from professional_asset where id = $1`,
        [assetId],
      );
      return rows[0];
    });
  }

  async listAssets(userId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select id, kind, title, body, body_en, status, lifecycle_state,
                evidence_backed, review_reason, review_at,
                user_approved_at, created_at
           from professional_asset order by created_at desc`,
      );
      return rows;
    });
  }

  private async loadOwnAsset(c: import('pg').PoolClient, userId: string, assetId: string) {
    const { rows } = await c.query(
      `select id, user_id, body, body_en, lifecycle_state, user_approved_at
         from professional_asset where id = $1`,
      [assetId],
    );
    if (rows.length === 0) throw new NotFoundException('asset not found');
    if (rows[0].user_id !== userId) throw new NotFoundException('asset not found');
    return rows[0];
  }
}
