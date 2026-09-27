import { Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { signedUrlTtlSeconds } from '@naqla/domain';
import {
  assertQueueTransition, assertBlindPayload, validateDecision, conflictOfInterest, finalizationAllowed, assertReviewerAction,
  type ReviewQueueState,
} from '@naqla/domain';
import { EvaluationService } from '../slice1/evaluation.service';
import { AgentService } from '../agents/agent.service';
import type { ReviewerIdentity } from './reviewer.guard';

/**
 * Human review of submissions — the minimum flow (OPEN-041).
 *
 * The reviewer sees a BLIND payload: activity context, the submission's facts
 * and files, the criterion with its descriptors, the deterministic results, and
 * the user's own explanation. Never who the user is. Every decision is an
 * immutable criterion_review row; a changed judgement supersedes, it never edits.
 * When every queue item of an evaluation is completed, the domain aggregates
 * and the ordinary evidence transition runs. No model decides anything here.
 */
@Injectable()
export class ReviewService {
  constructor(private readonly db: DbService, @Inject(STORAGE_PORT) private readonly storage: StoragePort, private readonly evaluations: EvaluationService, private readonly agents: AgentService) {}

  /** The reviewer's queue: pending items and the ones assigned to them. Blind. */
  async queue(reviewer: ReviewerIdentity) {
    return this.db.asService(async (c) => {
      const { rows } = await c.query(
        `select q.id, q.state, q.criterion_key, q.created_at, q.assigned_at, q.conflict_of_interest,
                a.slug as activity_slug, a.title_ar as activity_title_ar, a.title_en as activity_title_en,
                rc.name_ar as criterion_name_ar, rc.name_en as criterion_name_en, rc.dimension,
                (q.assigned_to = $1) as assigned_to_me
           from review_queue_item q
           join activity_spec a on a.id = q.activity_spec_id
           join rubric_criterion rc on rc.id = q.criterion_id
          where q.state = 'pending' or (q.assigned_to = $1 and q.state in ('assigned','in_review'))
          order by q.created_at`, [reviewer.id]);
      const items = rows.map((r) => ({ id: r.id, state: r.state, criterionKey: r.criterion_key, createdAt: r.created_at, assignedAt: r.assigned_at, conflictOfInterest: r.conflict_of_interest,
        activity: { slug: r.activity_slug, titleAr: r.activity_title_ar, titleEn: r.activity_title_en }, criterion: { nameAr: r.criterion_name_ar, nameEn: r.criterion_name_en, dimension: r.dimension }, assignedToMe: r.assigned_to_me }));
      assertBlindPayload(items);
      return items;
    });
  }

  /** Self-assignment. The author of the submission can never review it. */
  async assign(reviewer: ReviewerIdentity, itemId: string, declaredConflict = false) {
    const conflict = await this.db.asService(async (c) => {
      const item = await this.loadItem(c, itemId);
      const owner = await c.query('select user_id from submission where id = $1', [item.submission_id]);
      if (!conflictOfInterest(reviewer.id, owner.rows[0].user_id, declaredConflict)) return false;
      // Recorded in its own transaction so the refusal below cannot roll it back.
      assertQueueTransition(item.state as ReviewQueueState, 'escalated');
      await c.query(`update review_queue_item set state = 'escalated', conflict_of_interest = true, escalation_reason = $2 where id = $1`,
        [itemId, reviewer.id === owner.rows[0].user_id ? 'reviewer is the author of the submission' : 'reviewer declared a conflict of interest']);
      await emitAuditEvent(c, { eventType: 'review.conflict_of_interest', userId: null, actorKind: 'human_reviewer', actorId: reviewer.id, rolePerformed: 'human_reviewer', subjectTable: 'review_queue_item', subjectId: itemId, reason: 'conflict of interest; item escalated for another reviewer' });
      return true;
    });
    if (conflict) throw new ForbiddenException('conflict of interest: the item was escalated for another reviewer');
    return this.db.asService(async (c) => {
      const item = await this.loadItem(c, itemId);
      assertQueueTransition(item.state as ReviewQueueState, 'assigned');
      await c.query(`update review_queue_item set state = 'assigned', assigned_to = $2, assigned_at = now() where id = $1`, [itemId, reviewer.id]);
      await emitAuditEvent(c, { eventType: 'review.assigned', userId: null, actorKind: 'human_reviewer', actorId: reviewer.id, rolePerformed: 'human_reviewer', subjectTable: 'review_queue_item', subjectId: itemId, reason: 'self-assigned' });
      return { itemId, state: 'assigned' as const };
    });
  }

  /** Opens an item for review and returns the blind payload. */
  async open(reviewer: ReviewerIdentity, itemId: string) {
    return this.db.asService(async (c) => {
      const item = await this.loadItem(c, itemId);
      if (item.assigned_to !== reviewer.id) throw new ForbiddenException('this item is assigned to another reviewer');
      if (item.state === 'assigned') { assertQueueTransition('assigned', 'in_review'); await c.query(`update review_queue_item set state = 'in_review' where id = $1`, [itemId]); }
      else if (item.state !== 'in_review' && item.state !== 'completed') throw new BadRequestException(`item is ${item.state}`);
      const payload = await this.blindPayload(c, item);
      assertBlindPayload(payload); // the last gate before a person sees it
      return payload;
    });
  }

  /** A criterion-level decision: level + rationale → immutable record; item completed; finalise if nothing else is pending. */
  async decide(reviewer: ReviewerIdentity, itemId: string, body: { levelKey: string; rationale: string; disagreementWithAutomated?: boolean; supersedesReviewId?: string | null }) {
    assertReviewerAction('mark_criterion_result');
    const out = await this.db.asService(async (c) => {
      const item = await this.loadItem(c, itemId);
      if (item.assigned_to !== reviewer.id) throw new ForbiddenException('this item is assigned to another reviewer');
      const crit = await c.query(`select rc.id, rc.key, rc.evaluator_type, rc.max_score, rv.version, rv.id as rv_id from rubric_criterion rc join rubric_version rv on rv.id = rc.rubric_version_id where rc.id = $1`, [item.criterion_id]);
      const levels = await c.query('select level_key, score from rubric_criterion_level where criterion_id = $1 order by score', [item.criterion_id]);
      const { score } = validateDecision({ criterionKey: crit.rows[0].key, evaluatorType: crit.rows[0].evaluator_type, levels: levels.rows.map((l) => ({ levelKey: l.level_key, score: Number(l.score) })), levelKey: body.levelKey, rationale: body.rationale });

      // Re-review: the previous record stays; the new one points at it.
      const latest = await c.query('select id from criterion_review where queue_item_id = $1 order by created_at desc limit 1', [itemId]);
      if (item.state === 'completed') {
        if (!body.supersedesReviewId || body.supersedesReviewId !== latest.rows[0]?.id) throw new ConflictException('this item already has a decision; a re-review must name the record it supersedes');
        assertReviewerAction('request_re_review'); assertQueueTransition('completed', 'in_review');
        await c.query(`update review_queue_item set state = 'in_review' where id = $1`, [itemId]);
      } else if (item.state !== 'in_review') throw new BadRequestException(`item is ${item.state}; open it first`);

      const context = await this.deterministicContext(c, item.evaluation_id);
      const rec = await c.query(
        `insert into criterion_review (queue_item_id, reviewer_id, role_performed, submission_id, activity_spec_id, criterion_id, criterion_key, rubric_version_id, rubric_version,
           decision, score, max_score, rationale, deterministic_check_context, disagreement_with_automated_result, conflict_of_interest, supersedes_review_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id, created_at`,
        [itemId, reviewer.id, reviewer.rolePerformed, item.submission_id, item.activity_spec_id, item.criterion_id, crit.rows[0].key, crit.rows[0].rv_id, crit.rows[0].version,
         body.levelKey, score, Number(crit.rows[0].max_score), body.rationale.trim(), JSON.stringify(context), body.disagreementWithAutomated ?? false, item.conflict_of_interest, body.supersedesReviewId ?? null]);
      assertQueueTransition('in_review', 'completed');
      await c.query(`update review_queue_item set state = 'completed', completed_at = now() where id = $1`, [itemId]);
      await emitAuditEvent(c, { eventType: 'review.criterion_decided', userId: null, actorKind: 'human_reviewer', actorId: reviewer.id, rolePerformed: 'human_reviewer', subjectTable: 'criterion_review', subjectId: rec.rows[0].id,
        reason: `${crit.rows[0].key}: ${body.levelKey}`, payload: { itemId, supersedes: body.supersedesReviewId ?? null } });

      const all = await c.query('select state from review_queue_item where evaluation_id = $1', [item.evaluation_id]);
      const fin = finalizationAllowed(all.rows.map((r) => ({ state: r.state as ReviewQueueState })));
      return { reviewId: rec.rows[0].id, itemId, state: 'completed' as const, score, evaluationId: item.evaluation_id as string, pendingItems: fin.pending, finalizeNow: fin.allowed };
    });
    let finalized: Awaited<ReturnType<EvaluationService['finalizeHumanReview']>> | null = null;
    if (out.finalizeNow) {
      finalized = await this.evaluations.finalizeHumanReview(out.evaluationId);
      // Agents run AFTER finalisation, for the user, exactly as after a deterministic completion.
      const skillId = finalized.criteria[0]?.skillId ?? null;
      if (finalized.transition?.to === 'demonstrated') {
        await this.agents.onEvent({ type: 'evidence.demonstrated', userId: finalized.userId, facts: { evidenceId: finalized.transition.evidenceId, evaluationResultId: finalized.resultId },
          refs: [{ kind: 'evidence', id: finalized.transition.evidenceId }, { kind: 'evaluation_result', id: finalized.resultId }] });
      }
      await this.agents.onEvent({ type: 'evaluation.completed', userId: finalized.userId, facts: { outcome: finalized.outcome, anyCriterionUnmet: finalized.criteria.some((c) => c.score < c.maxScore), evaluationResultId: finalized.resultId, skillId },
        refs: [{ kind: 'evaluation_result', id: finalized.resultId }] });
    }
    return { reviewId: out.reviewId, itemId: out.itemId, state: out.state, score: out.score, pendingItems: out.pendingItems, finalized };
  }

  async returnItem(reviewer: ReviewerIdentity, itemId: string, reason: string) {
    assertReviewerAction('return_item');
    if (!reason?.trim()) throw new BadRequestException('returning an item needs a reason');
    return this.db.asService(async (c) => {
      const item = await this.loadItem(c, itemId);
      if (item.assigned_to !== reviewer.id) throw new ForbiddenException('this item is assigned to another reviewer');
      assertQueueTransition(item.state as ReviewQueueState, 'returned');
      await c.query(`update review_queue_item set state = 'returned', return_reason = $2 where id = $1`, [itemId, reason.trim()]);
      await c.query(`update review_queue_item set state = 'pending', assigned_to = null, assigned_at = null where id = $1`, [itemId]);
      await emitAuditEvent(c, { eventType: 'review.returned', userId: null, actorKind: 'human_reviewer', actorId: reviewer.id, rolePerformed: 'human_reviewer', subjectTable: 'review_queue_item', subjectId: itemId, reason: reason.trim() });
      return { itemId, state: 'pending' as const };
    });
  }

  async escalate(reviewer: ReviewerIdentity, itemId: string, reason: string) {
    assertReviewerAction('escalate_item');
    if (!reason?.trim()) throw new BadRequestException('escalating an item needs a reason');
    return this.db.asService(async (c) => {
      const item = await this.loadItem(c, itemId);
      assertQueueTransition(item.state as ReviewQueueState, 'escalated');
      await c.query(`update review_queue_item set state = 'escalated', escalation_reason = $2 where id = $1`, [itemId, reason.trim()]);
      await emitAuditEvent(c, { eventType: 'review.escalated', userId: null, actorKind: 'human_reviewer', actorId: reviewer.id, rolePerformed: 'human_reviewer', subjectTable: 'review_queue_item', subjectId: itemId, reason: reason.trim() });
      return { itemId, state: 'escalated' as const };
    });
  }

  /* ───────────────────────────── internals ─────────────────────────────── */

  private async loadItem(c: PoolClient, itemId: string) {
    const { rows } = await c.query('select * from review_queue_item where id = $1 for update', [itemId]);
    if (rows.length === 0) throw new NotFoundException('review item not found');
    return rows[0];
  }

  /** What the reviewer saw of the deterministic layer, frozen with each decision. */
  private async deterministicContext(c: PoolClient, evaluationId: string) {
    const res = await c.query(`select id, outcome from evaluation_result where evaluation_id = $1 and outcome = 'needs_human_review' order by evaluated_at desc limit 1`, [evaluationId]);
    if (res.rowCount === 0) return { interimResultId: null, criteria: [], integrityChecks: [] };
    const crit = await c.query('select criterion_key, score, max_score, rationale from evaluation_criterion_score where evaluation_result_id = $1 order by criterion_key', [res.rows[0].id]);
    const ic = await c.query(`select check_key, passed from integrity_check where evaluation_result_id = $1 and classification = 'user_facing' order by check_key`, [res.rows[0].id]);
    return { interimResultId: res.rows[0].id, criteria: crit.rows.map((r) => ({ key: r.criterion_key, score: Number(r.score), maxScore: Number(r.max_score), rationale: r.rationale })),
      integrityChecks: ic.rows.map((r) => ({ key: r.check_key, passed: r.passed })) };
  }

  /**
   * The blind payload. Built from an explicit whitelist of columns — no `select *`
   * on anything that carries a person — and checked by assertBlindPayload.
   */
  private async blindPayload(c: PoolClient, item: Record<string, unknown>) {
    const act = await c.query(`select slug, version, title_ar, title_en, business_context_ar, business_context_en, objective_ar, objective_en, ai_usage_mode, estimated_minutes from activity_spec where id = $1`, [item['activity_spec_id']]);
    const deliverables = await c.query('select key, format, mandatory, description_ar, description_en from activity_deliverable where activity_spec_id = $1 order by position', [item['activity_spec_id']]);
    const crit = await c.query(`select key, name_ar, name_en, dimension, description_ar, description_en, expected_evidence_ar, expected_evidence_en, excerpt_guidance_en, max_score, mandatory, evaluator_type, threshold_for_skill
                                  from rubric_criterion where id = $1`, [item['criterion_id']]);
    const levels = await c.query('select level_key, score, descriptor_ar, descriptor_en, observable_evidence_en from rubric_criterion_level where criterion_id = $1 order by score', [item['criterion_id']]);
    const arts = await c.query('select key, kind, value_bool, value_number, value_text, locator from submission_artifact where submission_id = $1 order by key', [item['submission_id']]);
    const files = await c.query(`select u.id, u.bucket, u.object_path, u.content_type, u.size_bytes, u.checksum_sha256, a.key
                                   from submission_artifact a join upload u on u.id = a.upload_id where a.submission_id = $1 and a.kind = 'file' and u.state = 'confirmed' order by a.key`, [item['submission_id']]);
    const disclosure = await c.query('select declared_use from ai_disclosure where submission_id = $1', [item['submission_id']]);
    const context = await this.deterministicContext(c, String(item['evaluation_id']));
    const decisions = await c.query('select id, decision, score, rationale, created_at, supersedes_review_id from criterion_review where queue_item_id = $1 order by created_at', [item['id']]);
    const fileEntries = [];
    for (const f of files.rows) {
      // Shown by artifact key, never by the owner-prefixed object path.
      fileEntries.push({ fileId: f.id, name: f.key, contentType: f.content_type, sizeBytes: Number(f.size_bytes), sha256: f.checksum_sha256,
        downloadUrl: await this.storage.createSignedDownload(f.bucket, f.object_path, signedUrlTtlSeconds('download')) });
    }
    const a = act.rows[0]; const k = crit.rows[0];
    return {
      itemId: item['id'], state: item['state'], evaluationId: item['evaluation_id'], submissionId: item['submission_id'],
      activity: { slug: a.slug, version: a.version, titleAr: a.title_ar, titleEn: a.title_en, businessContextAr: a.business_context_ar, businessContextEn: a.business_context_en, objectiveAr: a.objective_ar, objectiveEn: a.objective_en, aiUsageMode: a.ai_usage_mode, estimatedMinutes: a.estimated_minutes,
        deliverables: deliverables.rows.map((d) => ({ key: d.key, format: d.format, mandatory: d.mandatory, descriptionAr: d.description_ar, descriptionEn: d.description_en })) },
      criterion: { key: k.key, nameAr: k.name_ar, nameEn: k.name_en, dimension: k.dimension, descriptionAr: k.description_ar, descriptionEn: k.description_en, expectedEvidenceAr: k.expected_evidence_ar, expectedEvidenceEn: k.expected_evidence_en,
        excerptGuidanceEn: k.excerpt_guidance_en, maxScore: Number(k.max_score), mandatory: k.mandatory, evaluatorType: k.evaluator_type, thresholdForSkill: k.threshold_for_skill === null ? null : Number(k.threshold_for_skill),
        levels: levels.rows.map((l) => ({ levelKey: l.level_key, score: Number(l.score), descriptorAr: l.descriptor_ar, descriptorEn: l.descriptor_en, observableEvidenceEn: l.observable_evidence_en })) },
      submission: {
        artifacts: arts.rows.map((r) => ({ key: r.key, kind: r.kind, valueBool: r.value_bool, valueNumber: r.value_number === null ? null : Number(r.value_number), valueText: r.value_text, locator: r.locator })),
        files: fileEntries,
        // The user's own words, where the activity asked for them (notes and answers are artifacts).
        userExplanation: arts.rows.filter((r) => /^(note|answer)\./.test(r.key)).map((r) => ({ key: r.key, text: r.value_text })),
        aiDisclosure: { declaredUse: disclosure.rows[0]?.declared_use ?? [] },
      },
      deterministic: context,
      previousDecisions: decisions.rows.map((d) => ({ reviewId: d.id, decision: d.decision, score: Number(d.score), rationale: d.rationale, createdAt: d.created_at, supersedesReviewId: d.supersedes_review_id })),
    };
  }
}
