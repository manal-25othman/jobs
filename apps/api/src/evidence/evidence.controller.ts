import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserProvisioningService } from '../auth/user-provisioning.service';
import { EvidenceService } from './evidence.service';

/** Evidence ledger endpoints (Phase 1). Controllers move data; rules live in @naqla/domain. */
@Controller()
@UseGuards(SupabaseAuthGuard)
export class EvidenceController {
  constructor(private readonly users: UserProvisioningService, private readonly evidence: EvidenceService) {}

  @Get('evidence-types')
  async types() {
    return { ok: true, data: { items: await this.evidence.listTypes() } };
  }

  @Get('me/evidence')
  async list(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string, @Query('skillId') skillId?: string, @Query('status') status?: string) {
    const filter: { projectId?: string; skillId?: string; status?: string } = {};
    if (projectId) filter.projectId = projectId;
    if (skillId) filter.skillId = skillId;
    if (status) filter.status = status;
    return { ok: true, data: { items: await this.evidence.listItems(user.id, filter), nextCursor: null } };
  }

  @Post('me/evidence')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: {
    typeCode: string; title: string; description?: string | null; url?: string | null; uploadId?: string | null;
    skillIds?: string[]; projectId?: string | null; metadata?: Record<string, unknown>;
  }) {
    await this.users.ensureUser(user);
    return { ok: true, data: await this.evidence.createItem(user.id, body) };
  }

  @Get('me/evidence/:id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return { ok: true, data: await this.evidence.getItem(user.id, id) };
  }

  @Post('me/evidence/:id/skills')
  async link(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { skillIds: string[] }) {
    return { ok: true, data: await this.evidence.linkSkills(user.id, id, body?.skillIds ?? []) };
  }

  @Post('me/evidence/:id/withdraw')
  async withdraw(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { reason: string }) {
    return { ok: true, data: await this.evidence.withdraw(user.id, id, body?.reason ?? '') };
  }
}
