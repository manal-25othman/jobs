import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DomainInfoController } from './domain-info.controller';
import { InfraModule } from './infra/infra.module';
import { Slice1Module } from './slice1/slice1.module';

/**
 * Vertical Slice 1 only.
 *
 * No CV builder, no LinkedIn module, no learning centre, no notifications, no
 * agent orchestration. Those are deliberately absent, not pending.
 */
@Module({
  imports: [InfraModule, Slice1Module],
  controllers: [HealthController, DomainInfoController],
})
export class AppModule {}
