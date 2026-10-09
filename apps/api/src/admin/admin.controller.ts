import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

/** Admin Track Builder API (Phase 8). Every route: AdminGuard + a per-action role check in the service. */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  private who(req: Request) { return req.naqlaAdmin!; }

  @Get('overview') async overview(@Req() r: Request) { return { ok: true, data: await this.admin.overview(this.who(r)) }; }

  // governed configuration
  @Get('config/:kind') async list(@Req() r: Request, @Param('kind') kind: string) { return { ok: true, data: await this.admin.listGoverned(this.who(r), kind) }; }
  @Get('config/:kind/:id/diff') async diff(@Req() r: Request, @Param('kind') kind: string, @Param('id') id: string) { return { ok: true, data: await this.admin.diffGoverned(this.who(r), kind, id) }; }
  @Post('config/:kind/draft') async draft(@Req() r: Request, @Param('kind') kind: string, @Body() b: { baseId: string; changes: Record<string, unknown>; children?: Record<string, unknown>[] | null; reason: string }) {
    return { ok: true, data: await this.admin.createDraftVersion(this.who(r), kind, b) };
  }
  @Post('config/:kind/:id/submit') async submit(@Req() r: Request, @Param('kind') kind: string, @Param('id') id: string, @Body() b: { reason: string }) { return { ok: true, data: await this.admin.submitGoverned(this.who(r), kind, id, b?.reason ?? '') }; }
  @Post('config/:kind/:id/validate') async validate(@Req() r: Request, @Param('kind') kind: string, @Param('id') id: string, @Body() b: { decision: 'approve' | 'needs_revision' | 'reject'; reason: string }) {
    return { ok: true, data: await this.admin.validateGoverned(this.who(r), kind, id, b) };
  }
  @Post('config/:kind/:id/activate') async activate(@Req() r: Request, @Param('kind') kind: string, @Param('id') id: string, @Body() b: { activation: 'inactive' | 'development_only' | 'production_active'; reason: string }) {
    return { ok: true, data: await this.admin.activateGoverned(this.who(r), kind, id, b) };
  }

  // track builder
  @Get('tracks/:roleId') async track(@Req() r: Request, @Param('roleId') roleId: string) { return { ok: true, data: await this.admin.track(this.who(r), roleId) }; }
  @Post('tracks/:roleId/skill-changes') async propose(@Req() r: Request, @Param('roleId') roleId: string, @Body() b: { roleRequirementId: string; proposed: Record<string, unknown>; reason: string }) {
    return { ok: true, data: await this.admin.proposeSkillChange(this.who(r), roleId, b) };
  }
  @Post('skill-changes/:id/:to') async change(@Req() r: Request, @Param('id') id: string, @Param('to') to: 'pending_review' | 'approved' | 'rejected' | 'withdrawn', @Body() b: { reason: string }) {
    return { ok: true, data: await this.admin.changeTransition(this.who(r), id, { to, reason: b?.reason ?? '' }) };
  }
  @Post('tracks/:roleId/versions') async build(@Req() r: Request, @Param('roleId') roleId: string, @Body() b: { label: string; reason: string }) { return { ok: true, data: await this.admin.buildTrackVersion(this.who(r), roleId, b) }; }
  @Get('track-versions/:id/diff') async versionDiff(@Req() r: Request, @Param('id') id: string) { return { ok: true, data: await this.admin.trackVersionDiff(this.who(r), id) }; }
  @Post('track-versions/:id/submit') async submitVersion(@Req() r: Request, @Param('id') id: string, @Body() b: { reason: string }) { return { ok: true, data: await this.admin.submitTrackVersion(this.who(r), id, b?.reason ?? '') }; }
  @Post('track-versions/:id/validate') async validateVersion(@Req() r: Request, @Param('id') id: string, @Body() b: { decision: 'approve' | 'needs_revision' | 'reject'; reason: string }) {
    return { ok: true, data: await this.admin.validateTrackVersion(this.who(r), id, b) };
  }
  @Post('track-versions/:id/activate') async activateVersion(@Req() r: Request, @Param('id') id: string, @Body() b: { activation: 'inactive' | 'development_only' | 'production_active'; reason: string }) {
    return { ok: true, data: await this.admin.activateTrackVersion(this.who(r), id, b) };
  }

  // career content
  @Get('content') async content(@Req() r: Request) { return { ok: true, data: await this.admin.content(this.who(r)) }; }
  @Post('content/skills') async createSkill(@Req() r: Request, @Body() b: { slug: string; labelAr: string; labelEn: string; descriptionAr?: string; descriptionEn?: string; skillType?: string; reason: string }) {
    return { ok: true, data: await this.admin.createSkill(this.who(r), b) };
  }
  @Post('content/edit') async edit(@Req() r: Request, @Body() b: { kind: 'activity_deliverable' | 'rubric_criterion'; id: string; changes: Record<string, unknown>; reason: string }) {
    return { ok: true, data: await this.admin.editContent(this.who(r), b) };
  }
  @Post('content/review') async review(@Req() r: Request, @Body() b: { entityKind: string; id: string; to: 'curated' | 'sme_reviewed' | 'approved' | 'rejected' | 'needs_revision' | 'published' | 'superseded'; reason: string }) {
    return { ok: true, data: await this.admin.reviewContent(this.who(r), b) };
  }
  @Post('content/rubrics/:id/approve-values') async values(@Req() r: Request, @Param('id') id: string, @Body() b: { reason: string }) { return { ok: true, data: await this.admin.approveRubricValues(this.who(r), id, b?.reason ?? '') }; }
}
