import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { SkillProgressModule } from '../skill-progress/skill-progress.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { IntegrityModule } from '../integrity/integrity.module';
import { Slice1Controller, PublicReportController } from './slice1.controller';
import { CareerService } from './career.service';
import { SubmissionService } from './submission.service';
import { EvaluationService } from './evaluation.service';
import { AssetService } from './asset.service';
import { ReportService } from './report.service';
import { ShareService } from './share.service';
import { UploadService } from './upload.service';
import { WithdrawalService } from './withdrawal.service';
import { ActivityCatalogueService } from './activity-catalogue.service';
import { UserProvisioningService } from '../auth/user-provisioning.service';

@Module({
  imports: [AgentsModule, EvidenceModule, SkillProgressModule, AssessmentModule, IntegrityModule],
  controllers: [Slice1Controller, PublicReportController],
  providers: [
    UserProvisioningService, CareerService, SubmissionService,
    EvaluationService, AssetService, ReportService, ShareService, UploadService, WithdrawalService, ActivityCatalogueService,
  ],
})
export class Slice1Module {}
