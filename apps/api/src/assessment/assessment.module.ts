import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../configuration/configuration.module';
import { AssessmentRecorderService } from './assessment-recorder.service';
import { AssessmentService } from './assessment.service';
import { AssessmentController } from './assessment.controller';

/** Structured Assessment + Verification Decision (Phase 3). The recorder is exported for the evaluation transaction. */
@Module({ imports: [ConfigurationModule], controllers: [AssessmentController], providers: [AssessmentRecorderService, AssessmentService], exports: [AssessmentRecorderService] })
export class AssessmentModule {}
