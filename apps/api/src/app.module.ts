import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DomainInfoController } from './domain-info.controller';
import { InfraModule } from './infra/infra.module';
import { Slice1Module } from './slice1/slice1.module';
import { StorageModule } from './storage/storage.module';
import { AgentsModule } from './agents/agents.module';
import { CareerDataModule } from './career-data/career-data.module';
import { ReviewModule } from './review/review.module';
import { EvidenceModule } from './evidence/evidence.module';
import { SkillProgressModule } from './skill-progress/skill-progress.module';
import { AssessmentModule } from './assessment/assessment.module';
import { ConfigurationModule } from './configuration/configuration.module';
import { ReadinessModule } from './readiness/readiness.module';

/**
 * Vertical Slice 1 only.
 *
 * No CV builder, no LinkedIn module, no learning centre, no notifications, no
 * agent orchestration. Those are deliberately absent, not pending.
 */
@Module({
  imports: [InfraModule, StorageModule, CareerDataModule, AgentsModule, Slice1Module, ReviewModule, EvidenceModule, SkillProgressModule, AssessmentModule, ConfigurationModule, ReadinessModule],
  controllers: [HealthController, DomainInfoController],
})
export class AppModule {}
