import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { governedFromRow, isProduction } from '../configuration/configuration.service';
import {
  resolveActiveConfig, validateDisclosureAnswers, legacyFieldsToAnswers, disclosureQuestionFromRow, questionSnapshot, configIsValidated,
  DISCLOSURE_SCORE_EFFECT, DISCLOSURE_REQUIRES_HUMAN_REVIEW, DISCLOSURE_INTRO_AR, MissingPrerequisite,
  type DisclosureQuestionnaire, type ValidatedDisclosure, type ConfigResolution,
} from '@naqla/domain';

/** The questionnaire scope. A structural name, not an expert value. */
export const DISCLOSURE_QUESTIONNAIRE_KEY = 'ai_usage';

export interface AiDisclosureInput {
  /** Pre-Phase-6 shape, still accepted (recorded against the legacy baseline questionnaire). */
  declaredUse?: string[];
  explanation?: string | null;
  /** Phase 6 shape: answers to the questionnaire version the client was shown. */
  questionnaireId?: string;
  answers?: Record<string, unknown>;
}
export interface PreparedDisclosure { questionnaire: DisclosureQuestionnaire; validated: ValidatedDisclosure; captureMode: 'legacy_fields' | 'questionnaire' }

/**
 * AI-usage disclosure (Phase 6). AI use is allowed; the disclosure is context
 * for assessment. It never lowers a score and never forces human review.
 */
@Injectable()
export class DisclosureService {
  constructor(private readonly db: DbService) {}

  private async load(c: PoolClient, row: Record<string, unknown>): Promise<DisclosureQuestionnaire> {
    const qs = await c.query('select id, key, position, prompt_ar, prompt_en, help_ar, answer_type, options, required, show_if, maps_to from disclosure_question where questionnaire_id = $1 order by position', [row['id']]);
    return { ...governedFromRow(row), labelAr: String(row['label_ar']), introAr: String(row['intro_ar']), questions: qs.rows.map(disclosureQuestionFromRow) };
  }

  async active(c: PoolClient): Promise<{ questionnaire: DisclosureQuestionnaire; resolution: ConfigResolution } | null> {
    const { rows } = await c.query('select * from disclosure_questionnaire where key = $1', [DISCLOSURE_QUESTIONNAIRE_KEY]);
    const r = resolveActiveConfig(rows.map(governedFromRow), { production: isProduction() });
    if (!r.row) return null;
    return { questionnaire: await this.load(c, rows.find((x) => x.id === r.row!.id)!), resolution: r.resolution };
  }

  /** The migration-created baseline: the exact two fields the pre-Phase-6 API captured. */
  private async baseline(c: PoolClient): Promise<DisclosureQuestionnaire> {
    const { rows } = await c.query('select * from disclosure_questionnaire where key = $1 and baseline_of is not null order by version limit 1', [DISCLOSURE_QUESTIONNAIRE_KEY]);
    if (!rows[0]) throw new MissingPrerequisite('disclosure_questionnaire', 'the legacy baseline questionnaire is missing');
    return this.load(c, rows[0]);
  }

  async prepare(c: PoolClient, input: AiDisclosureInput | undefined): Promise<PreparedDisclosure> {
    if (!input || typeof input !== 'object') throw new BadRequestException('aiDisclosure is required (answering "no AI" is a valid answer)');
    if (input.questionnaireId) {
      const act = await this.active(c);
      if (!act || act.questionnaire.id !== input.questionnaireId) {
        throw new ConflictException('the disclosure questionnaire changed since it was shown; reload it and answer the current version');
      }
      return { questionnaire: act.questionnaire, validated: validateDisclosureAnswers(act.questionnaire, input.answers ?? {}), captureMode: 'questionnaire' };
    }
    const base = await this.baseline(c);
    return { questionnaire: base, validated: validateDisclosureAnswers(base, legacyFieldsToAnswers(base, { declaredUse: input.declaredUse ?? [], explanation: input.explanation ?? null })), captureMode: 'legacy_fields' };
  }

  async record(c: PoolClient, p: { submissionId: string; userId: string; mode: string; prepared: PreparedDisclosure }): Promise<string> {
    const { questionnaire: q, validated: v, captureMode } = p.prepared;
    const d = await c.query(
      `insert into ai_disclosure (submission_id, user_id, mode, declared_use, explanation, questionnaire_id, questionnaire_key, questionnaire_version, capture_mode, ai_use_declared)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [p.submissionId, p.userId, p.mode, v.declaredUse, v.explanation, q.id, q.key, q.version, captureMode, v.aiUseDeclared]);
    const disclosureId: string = d.rows[0].id;
    for (const a of v.answers) {
      await c.query(`insert into ai_disclosure_answer (disclosure_id, user_id, question_id, question_key, question_snapshot, answer) values ($1,$2,$3,$4,$5,$6)`,
        [disclosureId, p.userId, a.question.id, a.question.key, JSON.stringify(questionSnapshot(a.question)), JSON.stringify(a.answer)]);
    }
    await emitAuditEvent(c, { eventType: 'ai_disclosure.recorded', userId: p.userId, actorKind: 'user', actorId: p.userId, subjectTable: 'ai_disclosure', subjectId: disclosureId,
      reason: 'the user answered the AI-usage disclosure; context for assessment only',
      payload: { questionnaire: `${q.key}@${q.version}`, captureMode, answered: v.answers.length, scoreEffect: DISCLOSURE_SCORE_EFFECT, requiresHumanReview: DISCLOSURE_REQUIRES_HUMAN_REVIEW } });
    return disclosureId;
  }

  /** What the client renders. */
  async activeForClient() {
    return this.db.asService(async (c) => {
      const act = await this.active(c);
      if (!act) return { questionnaire: null, note: 'no active questionnaire; the legacy fields are accepted' };
      const q = act.questionnaire;
      return {
        questionnaire: { id: q.id, key: q.key, version: q.version, labelAr: q.labelAr, introAr: q.introAr, reviewStatus: q.reviewStatus, validated: configIsValidated(q), activation: q.activation, resolution: act.resolution,
          questions: q.questions.map((x) => ({ key: x.key, position: x.position, promptAr: x.promptAr, promptEn: x.promptEn, helpAr: x.helpAr, answerType: x.answerType, options: x.options, required: x.required, showIf: x.showIf })) },
        aiUseAllowedAr: DISCLOSURE_INTRO_AR, scoreEffect: DISCLOSURE_SCORE_EFFECT, requiresHumanReview: DISCLOSURE_REQUIRES_HUMAN_REVIEW,
      };
    });
  }

  async forSubmission(userId: string, submissionId: string) {
    return this.db.asUser(userId, async (c) => {
      const d = await c.query(`select id, mode, declared_use, explanation, questionnaire_key, questionnaire_version, capture_mode, ai_use_declared, declared_at from ai_disclosure where submission_id = $1`, [submissionId]);
      if (d.rowCount === 0) throw new NotFoundException('no disclosure for this submission');
      const r = d.rows[0];
      const answers = await c.query('select question_key, question_snapshot, answer from ai_disclosure_answer where disclosure_id = $1 order by (question_snapshot->>\'position\')::int', [r.id]);
      return {
        id: r.id, activityMode: r.mode, declaredUse: r.declared_use, explanation: r.explanation, aiUseDeclared: r.ai_use_declared, declaredAt: r.declared_at,
        questionnaire: r.questionnaire_key ? `${r.questionnaire_key}@${r.questionnaire_version}` : null, captureMode: r.capture_mode ?? 'pre_0016',
        answers: answers.rows.map((a) => ({ questionKey: a.question_key, promptAr: a.question_snapshot.prompt_ar, answerType: a.question_snapshot.answer_type, answer: a.answer })),
        scoreEffect: DISCLOSURE_SCORE_EFFECT,
      };
    });
  }
}
