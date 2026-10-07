import { Module } from '@nestjs/common';
import { ConfigurationService } from './configuration.service';
import { ConfigAdminService } from './config-admin.service';
import { ConfigurationController } from './configuration.controller';

/** Configuration & Policy Layer (Phase 4). */
@Module({ controllers: [ConfigurationController], providers: [ConfigurationService, ConfigAdminService], exports: [ConfigurationService] })
export class ConfigurationModule {}
