import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../configuration/configuration.module';
import { ReadinessService } from './readiness.service';
import { ReadinessController } from './readiness.controller';
import { LearningService } from './learning.service';
import { SelfAssessmentService } from './self-assessment.service';

/** Readiness Engine + skill pages data (Phase 5). */
@Module({ imports: [ConfigurationModule], controllers: [ReadinessController], providers: [ReadinessService, LearningService, SelfAssessmentService], exports: [ReadinessService, LearningService, SelfAssessmentService] })
export class ReadinessModule {}
