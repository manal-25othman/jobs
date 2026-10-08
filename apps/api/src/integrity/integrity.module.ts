import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { HumanReviewerGuard } from '../review/reviewer.guard';
import { DisclosureService } from './disclosure.service';
import { IntegritySignalService } from './integrity-signal.service';
import { ChallengeService } from './challenge.service';
import { IntegrityController, ChallengeReviewController } from './integrity.controller';

/** AI Usage & Integrity Flow (Phase 6). Exported services are used inside the submission and evaluation transactions. */
@Module({
  controllers: [IntegrityController, ChallengeReviewController],
  providers: [SupabaseAuthGuard, HumanReviewerGuard, DisclosureService, IntegritySignalService, ChallengeService],
  exports: [DisclosureService, IntegritySignalService, ChallengeService],
})
export class IntegrityModule {}
