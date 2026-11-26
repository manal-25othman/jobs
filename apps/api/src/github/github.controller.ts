import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseAuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { GitHubService } from './github.service';
import { TestRunService } from './test-run.service';

/** GitHub source of submitted code and R2 test results (Phase C round 2, items 1–2). */
@Controller()
@UseGuards(SupabaseAuthGuard)
export class GitHubController {
  constructor(private readonly gh: GitHubService, private readonly runs: TestRunService) {}

  @Get('me/github')
  async status(@CurrentUser() u: AuthenticatedUser) { return { ok: true, data: await this.gh.status(u.id) }; }

  @Post('me/github/simulated-install')
  async connect(@CurrentUser() u: AuthenticatedUser, @Body() body: { login?: unknown; repositories?: unknown }) { return { ok: true, data: await this.gh.connectSimulated(u.id, body ?? {}) }; }

  @Delete('me/github')
  async unlink(@CurrentUser() u: AuthenticatedUser) { return { ok: true, data: await this.gh.unlink(u.id) }; }

  @Get('me/github/repos/:repoId/commits')
  async commits(@CurrentUser() u: AuthenticatedUser, @Param('repoId') repoId: string, @Query('head') head?: string) { return { ok: true, data: await this.gh.commits(u.id, Number(repoId), head) }; }

  @Post('submissions/:id/github-source')
  async pin(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() body: { repoId?: unknown; commitSha?: unknown; pullRequestNumber?: unknown }) {
    return { ok: true, data: await this.gh.pin(u.id, id, body ?? {}) };
  }

  @Post('projects/:id/submissions/from-github')
  async submitFromGitHub(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return { ok: true, data: await this.gh.submitFromGitHub(u.id, id, body ?? {}) };
  }

  @Get('submissions/:id/test-runs')
  async testRuns(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return { ok: true, data: await this.runs.forSubmission(u.id, id) }; }

  @Get('projects/:id/attempts')
  async attempts(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return { ok: true, data: await this.gh.attempts(u.id, id) }; }
}

/** Unauthenticated by design: GitHub calls it; the HMAC signature over the raw body is the authentication. */
@Controller()
export class GitHubWebhookController {
  constructor(private readonly gh: GitHubService) {}

  @Post('webhooks/github')
  @HttpCode(200)
  async webhook(@Req() req: Request & { rawBody?: Buffer }, @Headers() headers: Record<string, string>, @Body() body: Record<string, unknown>) {
    return { ok: true, data: await this.gh.webhook(headers, req.rawBody, body ?? {}) };
  }
}
