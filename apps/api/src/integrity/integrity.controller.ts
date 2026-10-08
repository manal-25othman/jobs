import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { HumanReviewerGuard } from '../review/reviewer.guard';
import { DbService } from '../infra/db.service';
import { DisclosureService } from './disclosure.service';
import { IntegritySignalService } from './integrity-signal.service';
import { ChallengeService } from './challenge.service';
import { FORBIDDEN_INFERENCE_METHODS, INTEGRITY_SIGNAL_OUTCOME_EFFECT, INTEGRITY_VERIFICATION_EFFECT, type ChallengeOutcome } from '@naqla/domain';

/** AI usage & integrity (Phase 6). The user-facing surface. */
@Controller()
@UseGuards(SupabaseAuthGuard)
export class IntegrityController {
  constructor(private readonly disclosures: DisclosureService, private readonly signals: IntegritySignalService, private readonly challenges: ChallengeService, private readonly db: DbService) {}

  @Get('disclosure-questionnaire')
  async questionnaire() { return { ok: true, data: await this.disclosures.activeForClient() }; }

  @Get('submissions/:id/disclosure')
  async disclosure(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return { ok: true, data: await this.disclosures.forSubmission(user.id, id) }; }

  @Get('submissions/:id/integrity-signals')
  async submissionSignals(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return { ok: true, data: { items: await this.signals.forSubmission(user.id, id) } }; }

  @Get('me/challenges')
  async myChallenges(@CurrentUser() user: AuthenticatedUser, @Query('submissionId') submissionId?: string) { return { ok: true, data: await this.challenges.listMine(user.id, submissionId) }; }

  @Post('me/challenges/:id/response')
  async respond(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { text?: string; code?: string }) { return { ok: true, data: await this.challenges.respond(user.id, id, body) }; }

  /** Transparency: what the integrity layer is, and what it refuses to be. */
  @Get('integrity/registry')
  async registry() {
    return { ok: true, data: await this.db.asService(async (c) => ({
      principle: 'AI use is allowed. NAQLA asks whether you understand, verify, modify and can reason about the work you submit.',
      noDetection: { refusedMethods: FORBIDDEN_INFERENCE_METHODS, note: 'No AI detector, no style or token analysis, no probability of AI authorship.' },
      signalOutcomeEffect: INTEGRITY_SIGNAL_OUTCOME_EFFECT, verificationEffect: INTEGRITY_VERIFICATION_EFFECT,
      signalTypes: (await c.query('select code, label_ar, label_en, description_en, allowed_sources, direction, review_status, validation_note_en from integrity_signal_type order by code')).rows
        .map((r) => ({ code: r.code, labelAr: r.label_ar, labelEn: r.label_en, descriptionEn: r.description_en, allowedSources: r.allowed_sources, direction: r.direction, reviewStatus: r.review_status, validationNote: r.validation_note_en })),
      challengeTypes: (await c.query('select code, label_ar, label_en, description_en, delivery, response_format, evaluation_mode, difficulty, timing_hint, skill_mapping, enabled, review_status, validation_note_en from verification_challenge_type order by code')).rows
        .map((r) => ({ code: r.code, labelAr: r.label_ar, labelEn: r.label_en, descriptionEn: r.description_en, delivery: r.delivery, responseFormat: r.response_format, evaluationMode: r.evaluation_mode,
          difficulty: r.difficulty, timingHint: r.timing_hint, skillMapping: r.skill_mapping, enabled: r.enabled, reviewStatus: r.review_status, validationNote: r.validation_note_en })),
      challengePolicies: (await c.query('select key, version, activation, review_status, trigger_rule, challenge_types, max_challenges, timing, difficulty, skill_ids, validation_note_en from challenge_policy order by key, version')).rows
        .map((r) => ({ key: r.key, version: Number(r.version), activation: r.activation, reviewStatus: r.review_status, triggerRule: r.trigger_rule, challengeTypes: r.challenge_types, maxChallenges: r.max_challenges, timing: r.timing, difficulty: r.difficulty, skillIds: r.skill_ids, validationNote: r.validation_note_en })),
      questionnaires: (await c.query('select key, version, activation, baseline_of, review_status, validation_note_en from disclosure_questionnaire order by key, version')).rows
        .map((r) => ({ key: r.key, version: Number(r.version), activation: r.activation, isLegacyBaseline: r.baseline_of !== null, reviewStatus: r.review_status, validationNote: r.validation_note_en })),
    })) };
  }
}

/** Reviewer side of challenges: blind, never on one's own work. */
@Controller('review/challenges')
@UseGuards(HumanReviewerGuard)
export class ChallengeReviewController {
  constructor(private readonly challenges: ChallengeService) {}
  private who(req: Request): string { return req.naqlaReviewer!.id; }

  @Get()
  async queue(@Req() req: Request) { return { ok: true, data: { items: await this.challenges.reviewerQueue(this.who(req)) } }; }

  @Post(':id/result')
  async result(@Req() req: Request, @Param('id') id: string, @Body() body: { outcome: ChallengeOutcome; observations: string; confidence?: number | null }) {
    return { ok: true, data: await this.challenges.recordResult(this.who(req), id, body) };
  }
}
