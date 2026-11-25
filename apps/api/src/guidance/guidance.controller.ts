import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { GuidanceService } from './guidance.service';

/** Phase B package 5 — A01 next step, A02 Career Snapshot (FR-U-014), and the three guidance capabilities (test provider only). */
@Controller()
@UseGuards(SupabaseAuthGuard)
export class GuidanceController {
  constructor(private readonly guidance: GuidanceService) {}

  @Get('me/next-step')
  async next(@CurrentUser() u: AuthenticatedUser) { return { ok: true, data: await this.guidance.nextStep(u.id) }; }

  @Get('me/career-snapshot')
  async snapshot(@CurrentUser() u: AuthenticatedUser) { return { ok: true, data: await this.guidance.snapshot(u.id) }; }

  @Get('me/guidance/capabilities')
  capabilities() { return { ok: true, data: { items: this.guidance.capabilities() } }; }

  @Post('me/guidance')
  async ask(@CurrentUser() u: AuthenticatedUser, @Body() body: { capability?: string; skillId?: string; submissionId?: string }) {
    return { ok: true, data: await this.guidance.ask(u.id, body ?? {}) };
  }
}
