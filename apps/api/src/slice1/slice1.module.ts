import { Module } from '@nestjs/common';
import { Slice1Controller, PublicReportController } from './slice1.controller';
import { CareerService } from './career.service';
import { SubmissionService } from './submission.service';
import { EvaluationService } from './evaluation.service';
import { AssetService } from './asset.service';
import { ReportService } from './report.service';
import { ShareService } from './share.service';
import { UploadService } from './upload.service';
import { UserProvisioningService } from '../auth/user-provisioning.service';

@Module({
  controllers: [Slice1Controller, PublicReportController],
  providers: [
    UserProvisioningService, CareerService, SubmissionService,
    EvaluationService, AssetService, ReportService, ShareService, UploadService,
  ],
})
export class Slice1Module {}
