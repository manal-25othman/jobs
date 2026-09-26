import {
  Body, Controller, Get, Param, Post, Put, UseGuards, Query,
} from '@nestjs/common';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserProvisioningService } from '../auth/user-provisioning.service';
import { CareerService } from './career.service';
import { SubmissionService, type SubmissionArtifactInput } from './submission.service';
import { EvaluationService } from './evaluation.service';
import { AssetService } from './asset.service';
import { ReportService } from './report.service';
import { ShareService } from './share.service';
import { UploadService } from './upload.service';
import { WithdrawalService } from './withdrawal.service';
import { AgentService } from '../agents/agent.service';
import { Delete } from '@nestjs/common';

/**
 * Vertical Slice 1 endpoints.
 *
 * Every authoritative write goes through a service that calls @naqla/domain.
 * No rule is decided in a controller — controllers move data and nothing else.
 */
@Controller()
@UseGuards(SupabaseAuthGuard)
export class Slice1Controller {
  constructor(
    private readonly users: UserProvisioningService,
    private readonly career: CareerService,
    private readonly submissions: SubmissionService,
    private readonly evaluations: EvaluationService,
    private readonly assets: AssetService,
    private readonly reports: ReportService,
    private readonly share: ShareService,
    private readonly uploads: UploadService,
    private readonly agents: AgentService,
    private readonly withdrawal: WithdrawalService,
  ) {}

  /* ─────────────────────────── identity ─────────────────────────── */

  @Post('me/bootstrap')
  async bootstrap(@CurrentUser() user: AuthenticatedUser, @Body() body: { displayName?: string }) {
    await this.users.ensureUser(user, body?.displayName);
    return { ok: true, data: { id: user.id } };
  }

  /* ───────────────────────── career goal ────────────────────────── */

  @Get('target-roles')
  async roles(@CurrentUser() user: AuthenticatedUser) {
    await this.users.ensureUser(user);
    return { ok: true, data: await this.career.listTargetRoles(user.id) };
  }

  @Put('me/career-goal')
  async setGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { targetRoleId: string; confirmed: boolean },
  ) {
    await this.users.ensureUser(user);
    return { ok: true, data: await this.career.setCareerGoal(user.id, body.targetRoleId, body.confirmed) };
  }

  @Get('me/career-goal')
  async getGoal(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, data: await this.career.getCurrentGoal(user.id) };
  }

  /* ─────────────────────────── projects ─────────────────────────── */

  @Post('projects')
  async createProject(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: {
      title: string; kind: 'platform_activity' | 'personal_project';
      description?: string; activitySpecId?: string;
    },
  ) {
    await this.users.ensureUser(user);
    return { ok: true, data: await this.career.createProject(user.id, body) };
  }

  @Get('projects')
  async listProjects(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, data: { items: await this.career.listProjects(user.id), nextCursor: null } };
  }

  @Get('projects/:id')
  async getProject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return { ok: true, data: await this.career.getProject(user.id, id) };
  }

  /* ───────────────────────── submissions ────────────────────────── */

  @Post('projects/:id/submissions')
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @Body() body: {
      skillIds: string[];
      artifacts: SubmissionArtifactInput[];
      repositoryUrl?: string;
      uploadIds?: string[];
      externalUrls?: string[];
      aiDisclosure: { declaredUse: string[]; explanation?: string | null };
    },
  ) {
    return { ok: true, data: await this.submissions.createSubmission(user.id, projectId, body) };
  }

  /* ───────────────────────────── uploads ────────────────────────────── */

  @Post('uploads')
  async uploadIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { declaredName: string; contentType: string; declaredSize: number; purpose?: 'submission_file' | 'cv_upload' },
  ) {
    await this.users.ensureUser(user);
    return { ok: true, data: await this.uploads.createIntent(user.id, body) };
  }

  @Post('uploads/:id/confirm')
  async uploadConfirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return { ok: true, data: await this.uploads.confirm(user.id, id) };
  }

  @Get('uploads/:id/download')
  async uploadDownload(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return { ok: true, data: await this.uploads.signedDownload(user.id, id) };
  }

  @Get('submissions/:id')
  async getSubmission(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return { ok: true, data: await this.submissions.getSubmission(user.id, id) };
  }

  /* ───────────────────────── evaluation ─────────────────────────── */

  @Post('submissions/:id/evaluate')
  async evaluate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    // The evaluation transaction commits first. Orchestration runs AFTER it,
    // outside it, and its failure is swallowed: agents never break the product.
    const result = await this.evaluations.evaluateSubmission(user.id, id);
    const anyUnmet = result.criteria.some((c) => c.score < c.maxScore);
    const skillId = result.criteria[0]?.skillId ?? null;
    if (result.transition?.to === 'demonstrated') {
      await this.agents.onEvent({ type: 'evidence.demonstrated', userId: user.id,
        facts: { evidenceId: result.transition.evidenceId, evaluationResultId: result.resultId }, refs: [{ kind: 'evidence', id: result.transition.evidenceId }, { kind: 'evaluation_result', id: result.resultId }] });
    }
    await this.agents.onEvent({ type: 'evaluation.completed', userId: user.id,
      facts: { outcome: result.outcome, anyCriterionUnmet: anyUnmet, evaluationResultId: result.resultId, skillId }, refs: [{ kind: 'evaluation_result', id: result.resultId }] });
    return { ok: true, data: result };
  }

  @Get('submissions/:id/evaluation')
  async getEvaluation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return { ok: true, data: await this.evaluations.getEvaluationForSubmission(user.id, id) };
  }

  /* ─────────────────────────── skills ───────────────────────────── */

  @Get('me/skills')
  async skills(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, data: { items: await this.career.listSkillClaims(user.id), nextCursor: null } };
  }

  /* ─────────────────────────── assets ───────────────────────────── */

  // D-074: there is no direct "generate a CV bullet" endpoint. Wording comes
  // from a Recruitment Agent proposal (/v1/me/proposals) and user approval.

  /** D-077: withdraw own evidence. Nothing is deleted; derived assets need review. */
  @Post('evidence/:id/withdraw')
  async withdraw(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { reason: string }) {
    return { ok: true, data: await this.withdrawal.withdraw(user.id, id, body?.reason) };
  }

  /** D-077: explicit re-link of a needs_review asset to evidence that qualifies alone. */
  @Post('me/assets/:id/relink')
  async relink(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { evidenceId: string }) {
    return { ok: true, data: await this.withdrawal.relink(user.id, id, body?.evidenceId) };
  }

  @Get('me/assets')
  async listAssets(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, data: { items: await this.assets.listAssets(user.id), nextCursor: null } };
  }

  @Post('me/assets/:id/preview')
  async preview(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return { ok: true, data: await this.assets.previewAsset(user.id, id) };
  }

  @Post('me/assets/:id/approve')
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { approved: boolean; editedBody?: string },
  ) {
    if (!body?.approved) {
      return {
        ok: false,
        error: { code: 'validation_failed', message: 'approval must be explicit' },
      };
    }
    return { ok: true, data: await this.assets.approveAsset(user.id, id, body.editedBody) };
  }

  /* ─────────────────────────── report ───────────────────────────── */

  @Post('me/evidence-report')
  async generateReport(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, data: await this.reports.generate(user.id) };
  }

  @Post('share-links')
  async createShareLink(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { resourceKind: 'recruiter_report'; resourceId: string; expiresInDays: number },
  ) {
    return { ok: true, data: await this.share.create(user.id, body) };
  }

  @Delete('share-links/:id')
  async revokeShareLink(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return { ok: true, data: await this.share.revoke(user.id, id) };
  }
}

/**
 * The only unauthenticated route in the slice.
 *
 * It serves the public projection rebuilt from current state (D-077) through
 * `toPublicReport`, so there is no private field to accidentally include and
 * withdrawn evidence is gone from a live link at once.
 */
@Controller('public')
export class PublicReportController {
  constructor(
    private readonly reports: ReportService,
    private readonly share: ShareService,
  ) {}

  @Get('reports/:id')
  async publicReport(@Param('id') id: string, @Query('token') token?: string) {
    const opened = await this.share.verifyToken('recruiter_report', id, token);
    if (!opened) {
      return { ok: false, error: { code: 'not_found', message: 'no live link for this report' } };
    }
    const projection = await this.reports.getPublicProjection(id);
    if (!projection) {
      return { ok: false, error: { code: 'not_found', message: 'no live link for this report' } };
    }
    return { ok: true, data: projection };
  }
}
