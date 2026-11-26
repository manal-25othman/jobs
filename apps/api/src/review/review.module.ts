import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { HumanReviewerGuard } from './reviewer.guard';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';
import { EvaluationService } from '../slice1/evaluation.service';
import { MaterialService } from '../slice1/material.service';
import { AgentsModule } from '../agents/agents.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { SkillProgressModule } from '../skill-progress/skill-progress.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { IntegrityModule } from '../integrity/integrity.module';
import { ManagerModule } from '../manager/manager.module';
import { AutomatedReviewService } from './automated-review.service';

@Module({ imports: [StorageModule, AgentsModule, EvidenceModule, SkillProgressModule, AssessmentModule, IntegrityModule, ManagerModule], controllers: [ReviewController], providers: [SupabaseAuthGuard, HumanReviewerGuard, ReviewService, EvaluationService, MaterialService, AutomatedReviewService] })
export class ReviewModule {}
