import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ManagerService } from './manager.service';

/** A11 Virtual Manager (FR-U-026): the graduate's manager panel in the workspace. */
@Controller()
@UseGuards(SupabaseAuthGuard)
export class ManagerController {
  constructor(private readonly manager: ManagerService) {}

  @Get('projects/:id/manager')
  async view(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return { ok: true, data: await this.manager.view(u.id, id) }; }

  @Post('projects/:id/manager/messages')
  async send(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() body: { interventionKey?: string; body?: unknown }) {
    return { ok: true, data: await this.manager.send(u.id, id, body ?? {}) };
  }
}
