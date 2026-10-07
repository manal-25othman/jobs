import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AssessmentService } from './assessment.service';

/** Structured assessment endpoints (Phase 3). Read-only. */
@Controller()
@UseGuards(SupabaseAuthGuard)
export class AssessmentController {
  constructor(private readonly assessments: AssessmentService) {}

  @Get('verification-policies')
  async policies() { return { ok: true, data: { items: await this.assessments.listPolicies() } }; }

  @Get('submissions/:id/assessment')
  async forSubmission(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return { ok: true, data: await this.assessments.forSubmission(user.id, id) };
  }
}
