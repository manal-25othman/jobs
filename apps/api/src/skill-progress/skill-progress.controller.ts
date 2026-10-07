import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SkillProgressService } from './skill-progress.service';

/** Journey endpoints (Phase 2). Read-only for the user: the engine writes, events move. */
@Controller()
@UseGuards(SupabaseAuthGuard)
export class SkillProgressController {
  constructor(private readonly progress: SkillProgressService) {}

  @Get('skill-progress-rules')
  async rules() { return { ok: true, data: await this.progress.listRules() }; }

  @Get('me/skill-progress')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    const r = await this.progress.listMine(user.id);
    return { ok: true, data: { items: r.items, engine: r.engine, nextCursor: null } };
  }

  @Get('me/skill-progress/:skillId/events')
  async events(@CurrentUser() user: AuthenticatedUser, @Param('skillId') skillId: string) {
    return { ok: true, data: { items: await this.progress.eventsFor(user.id, skillId) } };
  }
}
