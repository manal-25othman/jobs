import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { HumanReviewerGuard } from './reviewer.guard';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';
import { EvaluationService } from '../slice1/evaluation.service';
import { AgentsModule } from '../agents/agents.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { SkillProgressModule } from '../skill-progress/skill-progress.module';

@Module({ imports: [StorageModule, AgentsModule, EvidenceModule, SkillProgressModule], controllers: [ReviewController], providers: [SupabaseAuthGuard, HumanReviewerGuard, ReviewService, EvaluationService] })
export class ReviewModule {}
