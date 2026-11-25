import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReadinessService } from './readiness.service';
import { SelfAssessmentService } from './self-assessment.service';

/** Readiness + skill pages (Phase 5). Reads, plus one explicit act: recording a snapshot. */
@Controller()
@UseGuards(SupabaseAuthGuard)
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService, private readonly selfAssessment: SelfAssessmentService) {}

  @Get('me/readiness')
  async report(@CurrentUser() user: AuthenticatedUser) { return { ok: true, data: await this.readiness.report(user.id) }; }

  @Post('me/readiness/evaluations')
  async record(@CurrentUser() user: AuthenticatedUser) { return { ok: true, data: await this.readiness.record(user.id) }; }

  @Get('me/readiness/evaluations')
  async history(@CurrentUser() user: AuthenticatedUser) { return { ok: true, data: { items: await this.readiness.history(user.id) } }; }

  @Get('me/track-skills')
  async trackSkills(@CurrentUser() user: AuthenticatedUser) { return { ok: true, data: await this.readiness.trackSkills(user.id) }; }

  /** FR-U-013: the graduate's own self-assessment (Observed only; never evidence, never public). */
  @Get('me/self-assessment')
  async selfView(@CurrentUser() user: AuthenticatedUser) { return { ok: true, data: await this.selfAssessment.view(user.id) }; }

  @Put('me/self-assessment')
  async selfSave(@CurrentUser() user: AuthenticatedUser, @Body() body: { items?: unknown }) { return { ok: true, data: await this.selfAssessment.save(user.id, body ?? {}) }; }

  @Get('me/track-skills/:skillId')
  async trackSkill(@CurrentUser() user: AuthenticatedUser, @Param('skillId') skillId: string) { return { ok: true, data: await this.readiness.trackSkill(user.id, skillId) }; }
}
