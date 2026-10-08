import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { governedFromRow, isProduction } from '../configuration/configuration.service';
import { IntegritySignalService } from './integrity-signal.service';
import {
  assertChallengeIssuable, assertChallengeTransition, assertBlindPayload, signalFromChallengeResult, CHALLENGE_OUTCOMES, CHALLENGE_INTRO_AR, INTEGRITY_VERIFICATION_EFFECT,
  DomainError, type ChallengePolicy, type ChallengeOutcome, type ChallengeStatus,
} from '@naqla/domain';

/** A formal input limit for a challenge response (not an expert value). */
const MAX_RESPONSE_LENGTH = 8000;

/**
 * Challenges (Phase 6): records for issue → response → result. Nothing issues
 * a challenge in the product yet: no type is enabled and no policy is active,
 * and both the domain and the database refuse otherwise. A result is an
 * observation about understanding; it becomes a signal, never a verdict and
 * never a verification effect.
 */
@Injectable()
export class ChallengeService {
  constructor(private readonly db: DbService, private readonly signals: IntegritySignalService) {}

  async issue(c: PoolClient, p: { userId: string; submissionId: string; typeCode: string; issuedBy: 'policy' | 'human_reviewer'; issuedByRef: string; policyId?: string | null;
    skillId?: string | null; promptAr: string; promptEn?: string | null; context?: Record<string, unknown>; evaluationResultId?: string | null }) {
    const t = await c.query('select code, enabled, review_status, approved_by from verification_challenge_type where code = $1', [p.typeCode]);
    if (t.rowCount === 0) throw new NotFoundException(`challenge type '${p.typeCode}' is not registered`);
    let policy: ChallengePolicy | null = null;
    if (p.policyId) {
      const r = await c.query('select * from challenge_policy where id = $1', [p.policyId]);
      if (r.rowCount === 0) throw new NotFoundException('challenge policy not found');
      policy = { ...governedFromRow(r.rows[0]), triggerRule: r.rows[0].trigger_rule, challengeTypes: r.rows[0].challenge_types, maxChallenges: r.rows[0].max_challenges };
    }
    assertChallengeIssuable({ type: { code: t.rows[0].code, enabled: t.rows[0].enabled, reviewStatus: t.rows[0].review_status, approvedBy: t.rows[0].approved_by }, issuedBy: p.issuedBy, policy, production: isProduction() });
    const context = p.context ?? {};
    assertBlindPayload(context, 'challenge.context');
    const sub = await c.query('select user_id from submission where id = $1', [p.submissionId]);
    if (sub.rowCount === 0 || sub.rows[0].user_id !== p.userId) throw new NotFoundException('submission not found');
    const { rows } = await c.query(
      `insert into challenge_instance (user_id, submission_id, evaluation_result_id, challenge_type_code, challenge_policy_id, policy_key, policy_version, issued_by_kind, issued_by_ref, skill_id, prompt_ar, prompt_en, context)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [p.userId, p.submissionId, p.evaluationResultId ?? null, p.typeCode, policy?.id ?? null, policy?.key ?? null, policy?.version ?? null, p.issuedBy, p.issuedByRef, p.skillId ?? null, p.promptAr, p.promptEn ?? null, JSON.stringify(context)]);
    await emitAuditEvent(c, { eventType: 'challenge.issued', userId: p.userId, actorKind: p.issuedBy === 'policy' ? 'system' : 'human_reviewer', actorId: null, rolePerformed: p.issuedBy === 'human_reviewer' ? 'human_reviewer' : null,
      subjectTable: 'challenge_instance', subjectId: rows[0].id, reason: `a short verification step (${p.typeCode}) was issued`, payload: { typeCode: p.typeCode, issuedByRef: p.issuedByRef, policy: policy ? `${policy.key}@${policy.version}` : null } });
    return { id: rows[0].id as string };
  }

  async listMine(userId: string, submissionId?: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select i.id, i.submission_id, i.challenge_type_code, t.label_ar as type_label_ar, i.prompt_ar, i.prompt_en, i.status, i.issued_at, i.due_at,
                r.response, r.submitted_at, x.outcome, x.observations, x.created_at as reviewed_at
           from challenge_instance i join verification_challenge_type t on t.code = i.challenge_type_code
           left join challenge_response r on r.instance_id = i.id left join challenge_result x on x.instance_id = i.id
          where ($1::uuid is null or i.submission_id = $1) order by i.issued_at desc`, [submissionId ?? null]);
      return { introAr: CHALLENGE_INTRO_AR, items: rows.map((r) => ({ id: r.id, submissionId: r.submission_id, typeCode: r.challenge_type_code, typeLabelAr: r.type_label_ar, promptAr: r.prompt_ar, promptEn: r.prompt_en,
        status: r.status, issuedAt: r.issued_at, dueAt: r.due_at, response: r.response, respondedAt: r.submitted_at, result: r.outcome ? { outcome: r.outcome, observations: r.observations, reviewedAt: r.reviewed_at } : null })) };
    });
  }

  async respond(userId: string, instanceId: string, body: { text?: string; code?: string }) {
    const text = (body?.text ?? '').trim(); const code = (body?.code ?? '').trim();
    if (!text && !code) throw new BadRequestException('a response needs text or code');
    if (text.length > MAX_RESPONSE_LENGTH || code.length > MAX_RESPONSE_LENGTH) throw new BadRequestException(`a response is at most ${MAX_RESPONSE_LENGTH} characters`);
    return this.db.asService(async (c) => {
      const i = await c.query('select id, user_id, status from challenge_instance where id = $1 for update', [instanceId]);
      if (i.rowCount === 0 || i.rows[0].user_id !== userId) throw new NotFoundException('challenge not found');
      assertChallengeTransition(i.rows[0].status as ChallengeStatus, 'answered');
      await c.query(`insert into challenge_response (instance_id, user_id, response) values ($1,$2,$3)`, [instanceId, userId, JSON.stringify({ ...(text ? { text } : {}), ...(code ? { code } : {}) })]);
      await c.query(`update challenge_instance set status = 'answered' where id = $1`, [instanceId]);
      await emitAuditEvent(c, { eventType: 'challenge.answered', userId, actorKind: 'user', actorId: userId, subjectTable: 'challenge_instance', subjectId: instanceId, reason: 'the user answered a verification step', payload: {} });
      return { id: instanceId, status: 'answered' as const };
    });
  }

  /** Reviewer view: answered challenges, blind (no owner, no profile), never the reviewer's own work. */
  async reviewerQueue(reviewerId: string) {
    return this.db.asService(async (c) => {
      const { rows } = await c.query(
        `select i.id, i.challenge_type_code, t.label_en as type_label_en, i.prompt_ar, i.prompt_en, i.context, i.issued_at, r.response, r.submitted_at
           from challenge_instance i join verification_challenge_type t on t.code = i.challenge_type_code join challenge_response r on r.instance_id = i.id
          where i.status = 'answered' and i.user_id <> $1 order by r.submitted_at`, [reviewerId]);
      const items = rows.map((r) => ({ id: r.id, typeCode: r.challenge_type_code, typeLabelEn: r.type_label_en, promptAr: r.prompt_ar, promptEn: r.prompt_en, context: r.context, issuedAt: r.issued_at, response: r.response, respondedAt: r.submitted_at }));
      assertBlindPayload(items, 'challengeQueue');
      return items;
    });
  }

  async recordResult(reviewerId: string, instanceId: string, body: { outcome: ChallengeOutcome; observations: string; confidence?: number | null }) {
    if (!(CHALLENGE_OUTCOMES as readonly string[]).includes(body?.outcome)) throw new DomainError(`outcome must be one of ${CHALLENGE_OUTCOMES.join(', ')}`);
    if (!body.observations?.trim()) throw new BadRequestException('a result states what was observed');
    return this.db.asService(async (c) => {
      const i = await c.query('select id, user_id, submission_id, status, policy_key, policy_version from challenge_instance where id = $1 for update', [instanceId]);
      if (i.rowCount === 0) throw new NotFoundException('challenge not found');
      const inst = i.rows[0];
      if (inst.user_id === reviewerId) throw new ForbiddenException('conflict of interest: a reviewer cannot judge a challenge on their own work');
      assertChallengeTransition(inst.status as ChallengeStatus, 'reviewed');
      const confidence = body.confidence ?? null;
      await c.query(`insert into challenge_result (instance_id, user_id, evaluator_kind, evaluator_ref, outcome, observations, confidence, policy_key, policy_version) values ($1,$2,'human',$3,$4,$5,$6,$7,$8)`,
        [instanceId, inst.user_id, `reviewer:${reviewerId}`, body.outcome, body.observations.trim(), confidence, inst.policy_key, inst.policy_version]);
      await c.query(`update challenge_instance set status = 'reviewed' where id = $1`, [instanceId]);
      const signalId = await this.signals.emit(c, { userId: inst.user_id, submissionId: inst.submission_id,
        draft: signalFromChallengeResult({ challengeInstanceId: instanceId, outcome: body.outcome, observations: body.observations.trim(), confidence, policyKey: inst.policy_key, policyVersion: inst.policy_version }) });
      await emitAuditEvent(c, { eventType: 'challenge.reviewed', userId: inst.user_id, actorKind: 'human_reviewer', actorId: reviewerId, rolePerformed: 'human_reviewer', subjectTable: 'challenge_instance', subjectId: instanceId,
        reason: `challenge result recorded as an observation (${body.outcome}); verification effect: ${INTEGRITY_VERIFICATION_EFFECT}`, payload: { signalId } });
      return { id: instanceId, status: 'reviewed' as const, signalId, verificationEffect: INTEGRITY_VERIFICATION_EFFECT };
    });
  }
}
