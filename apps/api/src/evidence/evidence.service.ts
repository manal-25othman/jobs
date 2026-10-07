import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { UploadService } from '../slice1/upload.service';
import { EvidenceLedgerService } from './evidence-ledger.service';
import { SkillProgressEngine } from '../skill-progress/skill-progress-engine.service';
import {
  assertEvidenceItemShape, assertEvidenceItemTransition, findEvidenceType, userMayCreateType, evidenceTypeIsValidated,
  claimEffectOfEvidenceItem, DomainError,
} from '@naqla/domain';

/**
 * User-facing evidence ledger (Phase 1).
 *
 * A user adds material (a link, a file, a note), lists it, links it to skills
 * and withdraws what they added directly. None of this moves a claim: the
 * ledger is material, the claim is an evaluation outcome (INV-1).
 */
@Injectable()
export class EvidenceService {
  constructor(private readonly db: DbService, private readonly uploads: UploadService, private readonly ledger: EvidenceLedgerService, private readonly progress: SkillProgressEngine) {}

  /** The registry, with its validation state visible: nothing seeded is approved. */
  async listTypes() {
    return this.db.asService(async (c) => {
      const specs = await this.ledger.loadRegistry(c);
      const { rows } = await c.query(
        'select code, label_ar, label_en, description_en, channel, review_status, validation_note_en, display_order from evidence_item_type where enabled order by display_order');
      return rows.map((r) => {
        const spec = specs.find((s) => s.code === r.code)!;
        return {
          code: r.code, labelAr: r.label_ar, labelEn: r.label_en, descriptionEn: r.description_en, channel: r.channel,
          userAddable: userMayCreateType(spec), reviewStatus: r.review_status, validated: evidenceTypeIsValidated(spec), validationNote: r.validation_note_en,
        };
      });
    });
  }

  async createItem(userId: string, input: {
    typeCode: string; title: string; description?: string | null; url?: string | null; uploadId?: string | null;
    skillIds?: string[]; projectId?: string | null; metadata?: Record<string, unknown>;
  }) {
    if (!input?.typeCode) throw new BadRequestException('typeCode is required');
    return this.db.asService(async (c) => {
      const types = await this.ledger.loadRegistry(c);
      const type = findEvidenceType(types, input.typeCode);
      if (!userMayCreateType(type)) throw new DomainError(`evidence type '${type.code}' cannot be added directly by a user`);
      const draft = {
        typeCode: type.code, source: 'user_direct' as const, title: input.title ?? '', description: input.description ?? null,
        url: input.url ?? null, uploadId: input.uploadId ?? null, metadata: input.metadata ?? {},
      };
      assertEvidenceItemShape(type, draft);
      if (draft.uploadId) await this.uploads.assertOwnedConfirmed(c, userId, draft.uploadId);
      let projectId: string | null = null;
      if (input.projectId) {
        const pr = await c.query('select id from project where id = $1 and user_id = $2 and deleted_at is null', [input.projectId, userId]);
        if (pr.rowCount === 0) throw new NotFoundException('project not found');
        projectId = input.projectId;
      }
      const skillIds = [...new Set(input.skillIds ?? [])];
      for (const skillId of skillIds) await this.assertActiveSkill(c, skillId);
      const goal = await c.query('select target_role_id from career_goal where user_id = $1 and is_current', [userId]);

      const { rows } = await c.query(
        `insert into evidence_item (user_id, item_type_code, target_role_id, project_id, source, title, description, url, upload_id, metadata, status, submitted_at)
         values ($1,$2,$3,$4,'user_direct',$5,$6,$7,$8,$9,'submitted', now()) returning id, created_at`,
        [userId, type.code, goal.rows[0]?.target_role_id ?? null, projectId, draft.title, draft.description, draft.url, draft.uploadId, JSON.stringify(draft.metadata)]);
      const id: string = rows[0].id;
      for (const skillId of skillIds) {
        await c.query(`insert into evidence_item_skill (evidence_item_id, skill_id, user_id, link_role, linked_by) values ($1,$2,$3,'primary','user')`, [id, skillId, userId]);
      }
      await this.progress.applyAll(c, skillIds, { userId, trigger: 'evidence_item.added', facts: { type_code: type.code },
        eventRef: { table: 'evidence_item', id }, reason: 'material was added to the skill', actorKind: 'user' });
      await emitAuditEvent(c, {
        eventType: 'evidence_item.created', userId, actorKind: 'user', actorId: userId,
        subjectTable: 'evidence_item', subjectId: id,
        reason: `the user added ${type.code} evidence material; claim effect: ${claimEffectOfEvidenceItem()}`,
        payload: { typeCode: type.code, skillIds, projectId },
      });
      return this.getItemWith(c, userId, id);
    });
  }

  async linkSkills(userId: string, itemId: string, skillIds: string[]) {
    if (!skillIds?.length) throw new BadRequestException('skillIds must name at least one skill');
    return this.db.asService(async (c) => {
      const item = await c.query('select id, status, source from evidence_item where id = $1 and user_id = $2', [itemId, userId]);
      if (item.rowCount === 0) throw new NotFoundException('evidence item not found');
      if (item.rows[0].status !== 'submitted') throw new DomainError(`an item in status '${item.rows[0].status}' cannot be linked`);
      for (const skillId of new Set(skillIds)) {
        await this.assertActiveSkill(c, skillId);
        await c.query(`insert into evidence_item_skill (evidence_item_id, skill_id, user_id, link_role, linked_by) values ($1,$2,$3,'primary','user') on conflict do nothing`, [itemId, skillId, userId]);
      }
      await this.progress.applyAll(c, skillIds, { userId, trigger: 'evidence_item.added', facts: { linked: true },
        eventRef: { table: 'evidence_item', id: itemId }, reason: 'material was linked to the skill', actorKind: 'user' });
      await emitAuditEvent(c, {
        eventType: 'evidence_item.skills_linked', userId, actorKind: 'user', actorId: userId,
        subjectTable: 'evidence_item', subjectId: itemId,
        reason: `the user linked evidence material to skills; claim effect: ${claimEffectOfEvidenceItem()}`, payload: { skillIds },
      });
      return this.getItemWith(c, userId, itemId);
    });
  }

  /** Only material the user added directly can be withdrawn; a locked submission's items follow the submission. */
  async withdraw(userId: string, itemId: string, reason: string) {
    if (!reason || reason.trim().length === 0) throw new BadRequestException('a withdrawal needs a reason');
    return this.db.asService(async (c) => {
      const item = await c.query('select id, status, source from evidence_item where id = $1 and user_id = $2', [itemId, userId]);
      if (item.rowCount === 0) throw new NotFoundException('evidence item not found');
      if (item.rows[0].source !== 'user_direct') throw new DomainError('only material the user added directly can be withdrawn here; a submission is locked');
      assertEvidenceItemTransition(item.rows[0].status, 'withdrawn');
      await c.query(`update evidence_item set status = 'withdrawn', withdrawn_at = now(), withdrawn_reason = $2 where id = $1`, [itemId, reason.trim()]);
      await emitAuditEvent(c, {
        eventType: 'evidence_item.withdrawn', userId, actorKind: 'user', actorId: userId,
        subjectTable: 'evidence_item', subjectId: itemId, reason: reason.trim(), payload: {},
      });
      return this.getItemWith(c, userId, itemId);
    });
  }

  async listItems(userId: string, filter: { projectId?: string; skillId?: string; status?: string } = {}) {
    return this.db.asUser(userId, (c) => this.listItemsWith(c, userId, filter));
  }

  async getItem(userId: string, itemId: string) {
    return this.db.asUser(userId, (c) => this.getItemWith(c, userId, itemId));
  }

  /** Same read, on the caller's connection — used inside a write transaction so the row just written is visible. */
  private async getItemWith(c: import('pg').PoolClient, userId: string, itemId: string) {
    const found = (await this.listItemsWith(c, userId)).find((i) => i.id === itemId);
    if (!found) throw new NotFoundException('evidence item not found');
    return found;
  }

  private async listItemsWith(c: import('pg').PoolClient, userId: string, filter: { projectId?: string; skillId?: string; status?: string } = {}) {
    {
      const { rows } = await c.query(
        `select i.id, i.item_type_code, t.label_ar, t.label_en, t.channel, t.review_status as type_review_status, i.source, i.title, i.description, i.url,
                i.upload_id, i.artifact_key, i.project_id, i.submission_id, i.evaluation_result_id, i.parent_item_id, i.status, i.submitted_at,
                i.attempt_number, i.supersedes_item_id, i.withdrawn_at, i.withdrawn_reason, i.metadata, i.created_at,
                coalesce((select json_agg(json_build_object('skillId', l.skill_id, 'role', l.link_role, 'linkedBy', l.linked_by, 'labelAr', sk.label_ar, 'labelEn', sk.label_en) order by l.created_at)
                   from evidence_item_skill l join skill sk on sk.id = l.skill_id where l.evidence_item_id = i.id), '[]'::json) as skills,
                coalesce((select json_agg(json_build_object('evidenceId', d.evidence_id, 'kind', d.derivation_kind)) from evidence_derivation d where d.evidence_item_id = i.id), '[]'::json) as derivations
           from evidence_item i join evidence_item_type t on t.code = i.item_type_code
          where i.user_id = $1
            and ($2::uuid is null or i.project_id = $2)
            and ($3::uuid is null or exists (select 1 from evidence_item_skill l where l.evidence_item_id = i.id and l.skill_id = $3))
            and ($4::text is null or i.status = $4)
          order by i.created_at desc, i.id`,
        [userId, filter.projectId ?? null, filter.skillId ?? null, filter.status ?? null]);
      return rows.map(mapItem);
    }
  }

  private async assertActiveSkill(c: import('pg').PoolClient, skillId: string): Promise<void> {
    const sk = await c.query(`select status, merged_into_id, (select slug from skill k where k.id = s.merged_into_id) as canonical_slug from skill s where s.id = $1`, [skillId]);
    if (sk.rowCount === 0) throw new BadRequestException(`unknown skill ${skillId}`);
    if (sk.rows[0].status !== 'active') {
      throw new BadRequestException(`skill ${skillId} is ${sk.rows[0].status}${sk.rows[0].canonical_slug ? `; use its canonical skill '${sk.rows[0].canonical_slug}' (${sk.rows[0].merged_into_id})` : ''}`);
    }
  }
}

function mapItem(r: Record<string, unknown>) {
  return {
    id: r['id'], typeCode: r['item_type_code'], typeLabelAr: r['label_ar'], typeLabelEn: r['label_en'], channel: r['channel'],
    typeReviewStatus: r['type_review_status'], source: r['source'], title: r['title'], description: r['description'], url: r['url'],
    uploadId: r['upload_id'], artifactKey: r['artifact_key'], projectId: r['project_id'], submissionId: r['submission_id'],
    evaluationResultId: r['evaluation_result_id'], parentItemId: r['parent_item_id'], status: r['status'], submittedAt: r['submitted_at'],
    attemptNumber: Number(r['attempt_number']), supersedesItemId: r['supersedes_item_id'], withdrawnAt: r['withdrawn_at'], withdrawnReason: r['withdrawn_reason'],
    metadata: r['metadata'], createdAt: r['created_at'], skills: r['skills'], derivations: r['derivations'],
    // Stated on every item so no client mistakes material for proof.
    claimEffect: claimEffectOfEvidenceItem(),
  };
}
