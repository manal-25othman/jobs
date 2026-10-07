import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReadinessService } from './readiness.service';

/** Readiness + skill pages (Phase 5). Reads, plus one explicit act: recording a snapshot. */
@Controller()
@UseGuards(SupabaseAuthGuard)
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('me/readiness')
  async report(@CurrentUser() user: AuthenticatedUser) { return { ok: true, data: await this.readiness.report(user.id) }; }

  @Post('me/readiness/evaluations')
  async record(@CurrentUser() user: AuthenticatedUser) { return { ok: true, data: await this.readiness.record(user.id) }; }

  @Get('me/readiness/evaluations')
  async history(@CurrentUser() user: AuthenticatedUser) { return { ok: true, data: { items: await this.readiness.history(user.id) } }; }

  @Get('me/track-skills')
  async trackSkills(@CurrentUser() user: AuthenticatedUser) { return { ok: true, data: await this.readiness.trackSkills(user.id) }; }

  @Get('me/track-skills/:skillId')
  async trackSkill(@CurrentUser() user: AuthenticatedUser, @Param('skillId') skillId: string) { return { ok: true, data: await this.readiness.trackSkill(user.id, skillId) }; }
}
