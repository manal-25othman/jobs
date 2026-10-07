import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../configuration/configuration.module';
import { ReadinessService } from './readiness.service';
import { ReadinessController } from './readiness.controller';

/** Readiness Engine + skill pages data (Phase 5). */
@Module({ imports: [ConfigurationModule], controllers: [ReadinessController], providers: [ReadinessService], exports: [ReadinessService] })
export class ReadinessModule {}
