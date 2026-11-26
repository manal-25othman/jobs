import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CALIBRATION_NOT_APPROVED_AR, SUGGESTION_NOT_DECISION_AR, GIT_COUNTS_NOT_PROOF_AR, assertSuggestionGrounded, suggestCriterion, summarizeByCriterion,
  type CriterionSuggestionInput, type TestRunResult,
} from '@naqla/domain';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { AgentService } from '../agents/agent.service';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The automated layer of a review item, for the ASSIGNED reviewer only (Phase C round 2, item 6):
 *   layer 1 — the R2 test observations bound to the pinned commit;
 *   layer 2 — A13 per-criterion suggestions (deterministic rules → the gateway → the A13 guard), always escalated;
 * plus the pinned source. Nothing here decides, scores, writes evidence or touches a level. The graduate never sees it.
 */
@Injectable()
export class AutomatedReviewService {
  constructor(private readonly db: DbService, private readonly agents: AgentService) {}

  async forReviewItem(reviewerId: string, itemId: string) {
    if (!UUID.test(itemId)) throw new NotFoundException('review item not found');
    const ctx = await this.db.asService(async (c) => {
      const item = (await c.query(`select q.assigned_to, e.submission_id from review_queue_item q join evaluation e on e.id = q.evaluation_id where q.id = $1`, [itemId])).rows[0];
      if (!item) throw new NotFoundException('review item not found');
      if (item.assigned_to !== reviewerId) throw new ForbiddenException('this item is assigned to another reviewer');
      const sid = String(item.submission_id);
      const er = (await c.query(`select id, rubric_version_id from evaluation_result where submission_id = $1 order by evaluated_at desc limit 1`, [sid])).rows[0];
      const criteria = er ? (await c.query(`select key, name_ar, mandatory, evaluator_type::text as evaluator_type from rubric_criterion where rubric_version_id = $1 order by position`, [er.rubric_version_id])).rows : [];
      const scores = er ? (await c.query(`select criterion_key, score, max_score, supporting_excerpt from evaluation_criterion_score where evaluation_result_id = $1`, [er.id])).rows : [];
      const run = (await c.query(`select result from test_run where submission_id = $1 order by created_at desc limit 1`, [sid])).rows[0]?.result as TestRunResult | undefined;
      const source = (await c.query(`select full_name, commit_sha, pull_request_number, branch, snapshot_hash from submission_source where submission_id = $1`, [sid])).rows[0] ?? null;
      const injection = (await c.query(`select coalesce(bool_or((payload->>'injectionSuspected')::boolean), false) as v from audit_event where event_type = 'submission.source_pinned' and payload->>'commitSha' = $1`, [source?.commit_sha ?? ''])).rows[0]?.v === true;
      await emitAuditEvent(c, { eventType: 'review.automated_layer_read', userId: null, actorKind: 'human_reviewer', actorId: reviewerId, rolePerformed: 'human_reviewer',
        subjectTable: 'submission', subjectId: sid, reason: 'an assigned reviewer opened the automated observations and A13 suggestions (shadow stage)', payload: { reviewItemId: itemId, hasRun: !!run } });
      return { sid, criteria, scores, run, source, injection };
    });

    const byCrit = ctx.run ? summarizeByCriterion(ctx.run) : [];
    const inputs: CriterionSuggestionInput[] = ctx.criteria.map((k) => {
      const sc = ctx.scores.find((s) => s.criterion_key === k.key);
      const evaluatorType = (['rule', 'llm', 'human'].includes(String(k.evaluator_type)) ? k.evaluator_type : 'rule') as 'rule' | 'llm' | 'human';
      return {
        criterionKey: String(k.key), mandatory: k.mandatory === true, evaluatorType,
        ruleMet: evaluatorType === 'rule' && sc ? Number(sc.score) >= Number(sc.max_score) : null,
        ruleExcerpt: sc?.supporting_excerpt ? String(sc.supporting_excerpt).slice(0, 120) : null,
        tests: byCrit.find((b) => b.criterionKey === k.key) ?? null,
        testLabels: (ctx.run?.tests ?? []).filter((t) => t.criterionKey === k.key).map((t) => ({ labelAr: t.labelAr, outcome: t.outcome, mode: t.mode })),
      };
    });
    const sctx = { packApproved: ctx.run?.packStatus === 'approved', calibrationApproved: false, gamingSignals: ctx.run?.gamingSignals ?? [], injectionSuspected: ctx.injection };
    const items = inputs.map((i) => {
      const s = suggestCriterion(i, sctx);
      assertSuggestionGrounded(s, i);
      const label = ctx.criteria.find((k) => k.key === i.criterionKey)?.name_ar ?? i.criterionKey;
      return { ...s, labelAr: String(label) };
    });
    const a13 = items.length ? await this.agents.reviewSuggestions(reviewerId, { capability: 'review_suggestion', items }, ctx.sid) : null;
    return {
      noticeAr: SUGGESTION_NOT_DECISION_AR, calibrationAr: CALIBRATION_NOT_APPROVED_AR,
      source: ctx.source ? { repository: ctx.source.full_name, commitSha: ctx.source.commit_sha, pullRequestNumber: ctx.source.pull_request_number, branch: ctx.source.branch, snapshotHash: ctx.source.snapshot_hash, gitNoticeAr: GIT_COUNTS_NOT_PROOF_AR, injectionSuspected: ctx.injection } : null,
      testRun: ctx.run ? { status: ctx.run.status, commitSha: ctx.run.commitSha, packStatus: ctx.run.packStatus, gamingSignals: ctx.run.gamingSignals, blockedRequests: ctx.run.blockedRequests,
        tests: ctx.run.tests.map((t) => ({ testId: t.testId, criterionKey: t.criterionKey, labelAr: t.labelAr, outcome: t.outcome, mode: t.mode, noteAr: t.noteAr })) } : null,
      suggestions: (a13?.suggestions ?? []).map((p) => ({ ...p, labelAr: items.find((i) => i.criterionKey === p['criterionKey'])?.labelAr ?? null })),
      a13: a13 ? { status: a13.status, rejected: a13.rejected } : null,
    };
  }
}
