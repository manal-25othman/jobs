import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AgentService } from './agent.service';

@Controller('me')
@UseGuards(SupabaseAuthGuard)
export class AgentsController {
  constructor(private readonly agents: AgentService) {}

  @Get('proposals') async list(@CurrentUser() u: AuthenticatedUser) { return { ok: true, data: { items: await this.agents.list(u.id), nextCursor: null } }; }
  @Get('proposals/:id') async get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return { ok: true, data: await this.agents.preview(u.id, id) }; }
  @Post('proposals/:id/approve')
  async approve(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() body: { approved: boolean; editedBody?: string }) {
    if (!body?.approved) return { ok: false, error: { code: 'validation_failed', message: 'approval must be explicit' } };
    return { ok: true, data: await this.agents.approve(u.id, id, body.editedBody) };
  }
  @Post('proposals/:id/reject')
  async reject(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() body: { reason: string }) {
    return { ok: true, data: await this.agents.reject(u.id, id, body?.reason) };
  }
  /* Phase 7: claim drafts — request one, see the options, read a draft's history. */
  @Get('claim-drafts/options') async claimOptions(@CurrentUser() u: AuthenticatedUser) { return { ok: true, data: await this.agents.claimDraftOptions(u.id) }; }
  @Post('claim-drafts')
  async requestClaimDraft(@CurrentUser() u: AuthenticatedUser, @Body() body: { claimKind: string; evidenceId?: string | null }) {
    return { ok: true, data: await this.agents.requestClaimDraft(u.id, String(body?.claimKind ?? ''), body?.evidenceId ? String(body.evidenceId) : null) };
  }
  @Get('claim-drafts/:id/history') async claimHistory(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return { ok: true, data: { items: await this.agents.claimHistory(u.id, id) } }; }
  @Get('companion') async companion(@CurrentUser() u: AuthenticatedUser) { return { ok: true, data: await this.agents.companion(u.id) }; }
}
