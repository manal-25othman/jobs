import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import {
  generateCvBullet, assertAssetTransition, type EvidenceState,
} from '@naqla/domain';

/**
 * Professional asset generation — deterministic, template-based, no model.
 *
 * Lifecycle: draft → preview → approved → active.
 * Nothing becomes active without an explicit user approval, and the database
 * refuses the state change even if this service forgot to check.
 */
@Injectable()
export class AssetService {
  constructor(private readonly db: DbService) {}

  /** Generates a CV bullet from one piece of demonstrated evidence. */
  async generateCvBulletForEvidence(userId: string, evidenceId: string) {
    return this.db.asService(async (c) => {
      const { rows } = await c.query(
        `select e.id as evidence_id, e.user_id, e.skill_id, e.evaluation_result_id,
                sk.label_ar, sk.label_en,
                sc.state,
                p.id as project_id, p.title as project_title,
                rv.version as rubric_version
           from evidence e
           join skill sk on sk.id = e.skill_id
           join skill_claim sc on sc.user_id = e.user_id and sc.skill_id = e.skill_id
           left join project p on p.id = e.project_id
           left join evaluation_result er on er.id = e.evaluation_result_id
           left join rubric_version rv on rv.id = er.rubric_version_id
          where e.id = $1 and e.withdrawn_at is null`,
        [evidenceId],
      );
      if (rows.length === 0) throw new NotFoundException('evidence not found');
      const e = rows[0];
      if (e.user_id !== userId) throw new NotFoundException('evidence not found');

      const criteria = await c.query(
        `select criterion_key, score, max_score, rationale, supporting_excerpt, skill_id, confidence
           from evaluation_criterion_score where evaluation_result_id = $1`,
        [e.evaluation_result_id],
      );

      // The domain refuses outright if the evidence does not support a bullet.
      // No softening, no vaguer wording — a claim that cannot be supported is
      // not written.
      const bullet = generateCvBullet({
        evidenceId: e.evidence_id,
        skillId: e.skill_id,
        skillLabelAr: e.label_ar,
        skillLabelEn: e.label_en,
        evidenceState: e.state as EvidenceState,
        projectTitle: e.project_title ?? 'مشروع',
        evaluationResultId: e.evaluation_result_id,
        rubricVersion: e.rubric_version ?? 'unknown',
        criteria: criteria.rows.map((r) => ({
          criterionId: r.criterion_key,
          score: Number(r.score),
          maxScore: Number(r.max_score),
          rationale: r.rationale,
          supportingExcerpt: r.supporting_excerpt,
          skillId: r.skill_id,
          confidence: Number(r.confidence ?? 1),
        })),
        // Nothing is inferred. The platform runs on React; that says nothing
        // about the user, so the list is empty unless they declared one.
        declaredTechnologies: [],
      });

      const asset = await c.query(
        `insert into professional_asset
           (user_id, kind, title, body, body_en, status, lifecycle_state,
            provenance_class, provenance_source, drafting_aid_used,
            skill_id, project_id, evaluation_result_id)
         values ($1,'cv_bullet',$2,$3,$4,'generated','draft','system_derived',$5,false,$6,$7,$8)
         returning id, lifecycle_state, created_at`,
        [userId, e.label_ar, bullet.bodyAr, bullet.bodyEn,
         `evidence:${e.evidence_id}`, e.skill_id, e.project_id, e.evaluation_result_id],
      );
      const assetId: string = asset.rows[0].id;

      await c.query(
        `insert into asset_evidence (asset_id, evidence_id) values ($1,$2)
         on conflict do nothing`,
        [assetId, e.evidence_id],
      );

      let position = 0;
      for (const t of bullet.traces) {
        await c.query(
          `insert into asset_trace (asset_id, clause, kind, ref, position)
           values ($1,$2,$3,$4,$5)`,
          [assetId, t.clause, t.kind, t.ref, position++],
        );
      }

      await emitAuditEvent(c, {
        eventType: 'asset.generated',
        userId, actorKind: 'system', subjectTable: 'professional_asset', subjectId: assetId,
        reason: 'a CV bullet was assembled deterministically from evaluated evidence',
        payload: { evidenceId: e.evidence_id, clauses: bullet.traces.length, modelUsed: false },
      });

      return {
        id: assetId,
        kind: 'cv_bullet' as const,
        bodyAr: bullet.bodyAr,
        bodyEn: bullet.bodyEn,
        lifecycleState: 'draft' as const,
        traces: bullet.traces,
        derivedFromEvidenceIds: bullet.derivedFromEvidenceIds,
        draftingAidUsed: false,
      };
    });
  }

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
