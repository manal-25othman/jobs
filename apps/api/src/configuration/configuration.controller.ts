import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { ConfigurationService } from './configuration.service';

/** Read-only configuration endpoints (Phase 4). Changes are audited CLI acts until the Admin Track Builder (Phase 8). */
@Controller('config')
@UseGuards(SupabaseAuthGuard)
export class ConfigurationController {
  constructor(private readonly config: ConfigurationService) {}

  @Get('policies')
  async policies() { return { ok: true, data: await this.config.policies() }; }

  @Get('tracks/:roleId')
  async track(@Param('roleId') roleId: string) { return { ok: true, data: await this.config.trackConfig(roleId) }; }
}
