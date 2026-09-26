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
      aiDisclosure: { declaredUse: string[]; explanation?: string | null };
    },
  ) {
    return { ok: true, data: await this.submissions.createSubmission(user.id, projectId, body) };
  }

  @Get('submissions/:id')
  async getSubmission(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return { ok: true, data: await this.submissions.getSubmission(user.id, id) };
  }

  /* ───────────────────────── evaluation ─────────────────────────── */

  @Post('submissions/:id/evaluate')
  async evaluate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return { ok: true, data: await this.evaluations.evaluateSubmission(user.id, id) };
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

  @Post('evidence/:id/cv-bullet')
  async generateBullet(@CurrentUser() user: AuthenticatedUser, @Param('id') evidenceId: string) {
    return { ok: true, data: await this.assets.generateCvBulletForEvidence(user.id, evidenceId) };
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
}

/**
 * The only unauthenticated route in the slice.
 *
 * It serves the stored public projection and nothing else — the row itself
 * holds only what `toPublicReport` produced, so there is no private field to
 * accidentally include.
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
