import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  assignFileArtifactKeys, classifyActivityEvidenceType, classifyFileEvidenceType, classifyUrlEvidenceType,
  evidenceTypeFromRow, findEvidenceType, nextAttemptNumber, assertEvidenceItemShape, assertEvidenceItemTransition,
  type DeliverableSpec, type EvidenceTypeSpec, type EvidenceItemDraft,
} from '@naqla/domain';
import { emitAuditEvent } from '../infra/audit';

/**
 * Transaction-scoped writes to the evidence ledger (Phase 1).
 *
 * Every method takes the caller's PoolClient and runs INSIDE the caller's
 * transaction: a submission and its ledger items commit together or not at
 * all. Nothing here touches `evidence`, `skill_claim` or `evidence_transition`
 * — the ledger records material; only an evaluation moves a claim (INV-1).
 */
@Injectable()
export class EvidenceLedgerService {
  /** The registry, as data. Read once per transaction. */
  async loadRegistry(c: PoolClient): Promise<EvidenceTypeSpec[]> {
    const { rows } = await c.query(
      'select code, channel, required_fields, match_rule, enabled, review_status from evidence_item_type order by display_order',
    );
    return rows.map(evidenceTypeFromRow);
  }

  /** Declared deliverables of an activity (data). Empty for a personal project. */
  async loadDeliverables(c: PoolClient, activitySpecId: string | null): Promise<DeliverableSpec[]> {
    if (!activitySpecId) return [];
    const { rows } = await c.query(
      'select key, format, mandatory, position from activity_deliverable where activity_spec_id = $1 order by position',
      [activitySpecId],
    );
    return rows.map((r) => ({ key: r.key, format: r.format, mandatory: r.mandatory, position: Number(r.position) }));
  }

  /** The user's current target role, if any — recorded on the item as context, never as a rule. */
  private async currentTargetRole(c: PoolClient, userId: string): Promise<string | null> {
    const { rows } = await c.query('select target_role_id from career_goal where user_id = $1 and is_current', [userId]);
    return rows[0]?.target_role_id ?? null;
  }

  private async insertItem(c: PoolClient, types: EvidenceTypeSpec[], row: {
    userId: string; draft: EvidenceItemDraft; targetRoleId: string | null; activitySpecId: string | null;
    projectId: string | null; submissionId: string | null; evaluationResultId: string | null; parentItemId: string | null;
    artifactKey: string | null; attemptNumber: number; status: 'draft' | 'submitted'; supersedesItemId?: string | null;
  }): Promise<string> {
    const type = findEvidenceType(types, row.draft.typeCode);
    assertEvidenceItemShape(type, row.draft);
    const { rows } = await c.query(
      `insert into evidence_item
         (user_id, item_type_code, target_role_id, activity_spec_id, project_id, submission_id, evaluation_result_id, parent_item_id,
          source, title, description, url, upload_id, artifact_key, metadata, status, submitted_at, attempt_number, supersedes_item_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, case when $16 = 'submitted' then now() else null end, $17, $18)
       returning id`,
      [row.userId, row.draft.typeCode, row.targetRoleId, row.activitySpecId, row.projectId, row.submissionId, row.evaluationResultId,
       row.parentItemId, row.draft.source, row.draft.title, row.draft.description ?? null, row.draft.url ?? null, row.draft.uploadId ?? null,
       row.artifactKey, JSON.stringify(row.draft.metadata ?? {}), row.status, row.attemptNumber, row.supersedesItemId ?? null],
    );
    return rows[0].id as string;
  }

  private async linkSkill(c: PoolClient, itemId: string, userId: string, skillId: string, linkedBy: 'user' | 'system', role: 'primary' | 'secondary' = 'primary'): Promise<void> {
    await c.query(
      `insert into evidence_item_skill (evidence_item_id, skill_id, user_id, link_role, linked_by)
       values ($1,$2,$3,$4,$5) on conflict do nothing`,
      [itemId, skillId, userId, role, linkedBy],
    );
  }

  /**
   * Assigns the artifact keys of a submission's uploaded files from the
   * activity's declared deliverables, skipping keys the submission already
   * names as structured facts; the legacy demo convention is the named fallback.
   */
  fileArtifactKeys(deliverables: DeliverableSpec[], fileCount: number, reservedKeys: Iterable<string>) {
    return assignFileArtifactKeys(deliverables, fileCount, reservedKeys);
  }

  /**
   * Records a locked submission as ledger items: one activity item (the
   * submission), one child per file / link / text artifact, one disclosure
   * item, and — from the second attempt on — a previous_attempt item. The
   * earlier attempt's activity item is superseded (status only; never edited).
   */
  async recordSubmission(c: PoolClient, p: {
    userId: string; submissionId: string; projectId: string; projectTitle: string; activitySpecId: string | null;
    skillIds: string[];
    files: { uploadId: string; key: string; declaredName: string; contentType: string | null }[];
    links: { key: string; url: string }[];
    texts: { key: string; text: string; locator: string | null }[];
    disclosure: { mode: string; declaredUse: string[] };
  }): Promise<{ submissionItemId: string; attemptNumber: number; itemIds: string[] }> {
    const types = await this.loadRegistry(c);
    const targetRoleId = await this.currentTargetRole(c, p.userId);

    const prior = await c.query(
      `select i.id, i.attempt_number from evidence_item i join evidence_item_type t on t.code = i.item_type_code
        where i.project_id = $1 and t.channel = 'activity' and i.status = 'submitted'
        order by i.attempt_number desc limit 1`,
      [p.projectId],
    );
    const priorCount = await c.query(
      `select count(*) from evidence_item i join evidence_item_type t on t.code = i.item_type_code
        where i.project_id = $1 and t.channel = 'activity'`, [p.projectId]);
    const attemptNumber = nextAttemptNumber(Number(priorCount.rows[0].count));
    const previous = prior.rows[0] ? { id: prior.rows[0].id as string, attempt: Number(prior.rows[0].attempt_number) } : null;

    // activity_spec carries no `kind` column yet (a Phase 4 configuration field); the registry fallback applies.
    const activityType = classifyActivityEvidenceType(types, null);
    const ctx = { userId: p.userId, targetRoleId, activitySpecId: p.activitySpecId, projectId: p.projectId, submissionId: p.submissionId, evaluationResultId: null, attemptNumber, status: 'submitted' as const };
    const submissionItemId = await this.insertItem(c, types, {
      ...ctx, parentItemId: null, artifactKey: null, supersedesItemId: previous?.id ?? null,
      draft: { typeCode: activityType.code, source: 'user_submission', title: p.projectTitle, submissionId: p.submissionId,
               metadata: { file_count: p.files.length, link_count: p.links.length, text_count: p.texts.length } },
    });
    const itemIds = [submissionItemId];
    for (const skillId of p.skillIds) await this.linkSkill(c, submissionItemId, p.userId, skillId, 'user');

    for (const f of p.files) {
      const t = classifyFileEvidenceType(types, f.contentType);
      itemIds.push(await this.insertItem(c, types, { ...ctx, parentItemId: submissionItemId, artifactKey: f.key,
        draft: { typeCode: t.code, source: 'user_submission', title: f.declaredName, uploadId: f.uploadId, metadata: { artifact_key: f.key } } }));
    }
    for (const l of p.links) {
      const t = classifyUrlEvidenceType(types, l.url);
      itemIds.push(await this.insertItem(c, types, { ...ctx, parentItemId: submissionItemId, artifactKey: l.key,
        draft: { typeCode: t.code, source: 'user_submission', title: l.url, url: l.url, metadata: { artifact_key: l.key } } }));
    }
    for (const x of p.texts) {
      const t = findEvidenceType(types, 'text_explanation');
      itemIds.push(await this.insertItem(c, types, { ...ctx, parentItemId: submissionItemId, artifactKey: x.key,
        draft: { typeCode: t.code, source: 'user_submission', title: x.locator ?? x.key, description: x.text, metadata: { artifact_key: x.key } } }));
    }
    itemIds.push(await this.insertItem(c, types, { ...ctx, parentItemId: submissionItemId, artifactKey: null,
      draft: { typeCode: 'ai_usage_disclosure', source: 'system', title: 'AI usage disclosure', submissionId: p.submissionId,
               metadata: { mode: p.disclosure.mode, declared_use: p.disclosure.declaredUse } } }));

    if (previous) {
      assertEvidenceItemTransition('submitted', 'superseded');
      await c.query(`update evidence_item set status = 'superseded' where id = $1 and status = 'submitted'`, [previous.id]);
      itemIds.push(await this.insertItem(c, types, { ...ctx, parentItemId: submissionItemId, artifactKey: null,
        draft: { typeCode: 'previous_attempt', source: 'system', title: `Previous attempt #${previous.attempt}`,
                 metadata: { previous_item_id: previous.id, previous_attempt_number: previous.attempt } } }));
    }

    await emitAuditEvent(c, {
      eventType: 'evidence_item.recorded', userId: p.userId, actorKind: 'system',
      subjectTable: 'evidence_item', subjectId: submissionItemId,
      reason: 'the submission and its artifacts were recorded in the evidence ledger; no claim moved',
      payload: { submissionId: p.submissionId, attemptNumber, itemCount: itemIds.length, supersededItemId: previous?.id ?? null },
    });
    return { submissionItemId, attemptNumber, itemIds };
  }

  /**
   * Records an evaluation run as an automated_check_result item and, when the
   * run produced an evaluated fact, the derivation bridge from that fact to
   * the items it was derived from. The fact itself was written by the
   * evaluation; this method only annotates it.
   */
  async recordEvaluation(c: PoolClient, p: {
    userId: string; submissionId: string; projectId: string; activitySpecId: string | null; evaluationResultId: string;
    outcome: string; totalScore: number; maxScore: number; evidenceId: string | null; skillId: string | null;
  }): Promise<{ checkItemId: string }> {
    const types = await this.loadRegistry(c);
    const targetRoleId = await this.currentTargetRole(c, p.userId);
    const parent = await c.query(
      `select i.id, i.attempt_number from evidence_item i join evidence_item_type t on t.code = i.item_type_code
        where i.submission_id = $1 and t.channel = 'activity' order by i.created_at desc limit 1`, [p.submissionId]);
    const parentItemId: string | null = parent.rows[0]?.id ?? null;
    const attemptNumber = parent.rows[0] ? Number(parent.rows[0].attempt_number) : 1;

    const checkItemId = await this.insertItem(c, types, {
      userId: p.userId, targetRoleId, activitySpecId: p.activitySpecId, projectId: p.projectId, submissionId: p.submissionId,
      evaluationResultId: p.evaluationResultId, parentItemId, artifactKey: null, attemptNumber, status: 'submitted',
      draft: { typeCode: 'automated_check_result', source: 'system', title: `Automated evaluation ${p.outcome}`,
               evaluationResultId: p.evaluationResultId,
               metadata: { outcome: p.outcome, total_score: p.totalScore, max_score: p.maxScore, produced_evidence: p.evidenceId !== null } },
    });
    if (p.skillId) await this.linkSkill(c, checkItemId, p.userId, p.skillId, 'system');

    if (p.evidenceId) {
      await c.query(
        `insert into evidence_derivation (evidence_id, evidence_item_id, user_id, derivation_kind) values ($1,$2,$3,'recorded_as') on conflict do nothing`,
        [p.evidenceId, checkItemId, p.userId]);
      if (parentItemId) {
        await c.query(
          `insert into evidence_derivation (evidence_id, evidence_item_id, user_id, derivation_kind) values ($1,$2,$3,'evaluated_from') on conflict do nothing`,
          [p.evidenceId, parentItemId, p.userId]);
      }
    }
    return { checkItemId };
  }
}
