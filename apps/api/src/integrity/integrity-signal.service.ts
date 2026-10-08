import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import {
  DOMAIN_RULESET_VERSION, assertSignalWellFormed, signalFromDisclosure, signalFromResubmission, signalsFromIntegrityChecks, INTEGRITY_SIGNAL_OUTCOME_EFFECT,
  MissingPrerequisite, type IntegritySignalDraft, type IntegritySignalType, type IntegritySignalSource, type SignalDirection,
} from '@naqla/domain';

export const SIGNAL_PRODUCER = 'naqla-integrity';

/**
 * Structured integrity signals (Phase 6). Observable facts only; no
 * conclusion, no detection score, no verification effect. The assessment
 * may consume them later through a context policy that includes them.
 */
@Injectable()
export class IntegritySignalService {
  constructor(private readonly db: DbService) {}

  async emit(c: PoolClient, p: { userId: string; submissionId: string; evaluationResultId?: string | null; draft: IntegritySignalDraft }): Promise<string> {
    const t = await c.query('select code, allowed_sources, direction from integrity_signal_type where code = $1', [p.draft.signalType]);
    if (t.rowCount === 0) throw new MissingPrerequisite('integrity_signal_type', `signal type '${p.draft.signalType}' is not registered`);
    const type: IntegritySignalType = { code: t.rows[0].code, allowedSources: t.rows[0].allowed_sources as IntegritySignalSource[], direction: t.rows[0].direction as SignalDirection };
    assertSignalWellFormed(type, p.draft);
    const d = p.draft;
    const { rows } = await c.query(
      `insert into integrity_signal (user_id, submission_id, evaluation_result_id, signal_type, source, direction, related_evidence_item_ids, challenge_instance_id, integrity_check_key, disclosure_id,
                                     observation, confidence, visibility, producer, producer_version, policy_key, policy_version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
      [p.userId, p.submissionId, p.evaluationResultId ?? null, d.signalType, d.source, type.direction, d.relatedEvidenceItemIds ?? [], d.challengeInstanceId ?? null, d.integrityCheckKey ?? null,
       d.disclosureId ?? null, d.observation, d.confidence, d.visibility, SIGNAL_PRODUCER, DOMAIN_RULESET_VERSION, d.policyKey ?? null, d.policyVersion ?? null]);
    await emitAuditEvent(c, { eventType: 'integrity_signal.recorded', userId: p.userId, actorKind: 'system', subjectTable: 'integrity_signal', subjectId: rows[0].id,
      reason: `observable fact recorded (${d.signalType} from ${d.source}); no outcome attached`, payload: { signalType: d.signalType, source: d.source, outcomeEffect: INTEGRITY_SIGNAL_OUTCOME_EFFECT } });
    return rows[0].id as string;
  }

  /** At submission: the disclosure (neutral context) and, from the second attempt, the resubmission. */
  async emitForSubmission(c: PoolClient, p: { userId: string; submissionId: string; disclosureId: string; questionnaireRef: string; aiUseDeclared: boolean | null; answeredCount: number; submissionItemId: string; attemptNumber: number }) {
    await this.emit(c, { userId: p.userId, submissionId: p.submissionId, draft: signalFromDisclosure({ disclosureId: p.disclosureId, questionnaireRef: p.questionnaireRef, aiUseDeclared: p.aiUseDeclared, answeredCount: p.answeredCount }) });
    if (p.attemptNumber > 1) {
      const prev = await c.query('select supersedes_item_id from evidence_item where id = $1', [p.submissionItemId]);
      if (prev.rows[0]?.supersedes_item_id) {
        await this.emit(c, { userId: p.userId, submissionId: p.submissionId, draft: signalFromResubmission({ attemptNumber: p.attemptNumber, previousItemId: prev.rows[0].supersedes_item_id, submissionItemId: p.submissionItemId }) });
      }
    }
  }

  /** At the deterministic stage: one signal per check that did not pass. */
  async emitForEvaluation(c: PoolClient, p: { userId: string; submissionId: string; evaluationResultId: string; checks: readonly { key: string; passed: boolean; classification: 'user_facing' | 'assessment_only' }[] }) {
    for (const draft of signalsFromIntegrityChecks(p.checks)) await this.emit(c, { userId: p.userId, submissionId: p.submissionId, evaluationResultId: p.evaluationResultId, draft });
  }

  /** Owner view: user-facing signals only (RLS enforces it too). */
  async forSubmission(userId: string, submissionId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select s.id, s.signal_type, t.label_ar, t.label_en, s.source, s.direction, s.observation, s.confidence, s.integrity_check_key, s.challenge_instance_id, s.policy_key, s.policy_version, s.producer_version, s.outcome_effect, s.created_at
           from integrity_signal s join integrity_signal_type t on t.code = s.signal_type where s.submission_id = $1 order by s.created_at, s.id`, [submissionId]);
      return rows.map((r) => ({ id: r.id, signalType: r.signal_type, labelAr: r.label_ar, labelEn: r.label_en, source: r.source, direction: r.direction, observation: r.observation,
        confidence: r.confidence === null ? null : Number(r.confidence), integrityCheckKey: r.integrity_check_key, challengeInstanceId: r.challenge_instance_id,
        policy: r.policy_key ? `${r.policy_key}@${r.policy_version}` : null, producerVersion: r.producer_version, outcomeEffect: r.outcome_effect, createdAt: r.created_at }));
    });
  }

  /** Signal ids of a submission (for the assessment context; excluded unless a context policy includes them). */
  async idsForSubmission(c: PoolClient, submissionId: string): Promise<string[]> {
    return (await c.query('select id from integrity_signal where submission_id = $1 order by created_at', [submissionId])).rows.map((r) => r.id as string);
  }
}
