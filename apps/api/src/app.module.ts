import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DomainInfoController } from './domain-info.controller';

/**
 * Phase 0 module graph, deliberately almost empty.
 *
 * Feature modules (projects, submissions, evaluation, assets) arrive in the
 * first vertical slice. Adding them now would be feature work, which Phase 0
 * excludes.
 */
@Module({
  controllers: [HealthController, DomainInfoController],
})
export class AppModule {}
