import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { HumanReviewerGuard } from './reviewer.guard';
import { ReviewService } from './review.service';

/**
 * Reviewer endpoints. There is deliberately NO endpoint here that touches a
 * submission, a profile, an evidence state, a rubric or a role requirement:
 * the reviewer's whole vocabulary is queue · open · decide · return · escalate.
 */
@Controller('review')
@UseGuards(HumanReviewerGuard)
export class ReviewController {
  constructor(private readonly review: ReviewService) {}
  private who(req: Request) { return req.naqlaReviewer!; }

  @Get('queue') async queue(@Req() req: Request) { return { ok: true, data: { items: await this.review.queue(this.who(req)) } }; }
  @Post('queue/:id/assign') async assign(@Req() req: Request, @Param('id') id: string, @Body() body: { conflictOfInterest?: boolean }) { return { ok: true, data: await this.review.assign(this.who(req), id, body?.conflictOfInterest ?? false) }; }
  @Get('items/:id') async open(@Req() req: Request, @Param('id') id: string) { return { ok: true, data: await this.review.open(this.who(req), id) }; }
  @Post('items/:id/decision')
  async decide(@Req() req: Request, @Param('id') id: string, @Body() body: { levelKey: string; rationale: string; disagreementWithAutomated?: boolean; supersedesReviewId?: string | null }) {
    return { ok: true, data: await this.review.decide(this.who(req), id, body) };
  }
  @Post('items/:id/return') async ret(@Req() req: Request, @Param('id') id: string, @Body() body: { reason: string }) { return { ok: true, data: await this.review.returnItem(this.who(req), id, body?.reason) }; }
  @Post('items/:id/escalate') async esc(@Req() req: Request, @Param('id') id: string, @Body() body: { reason: string }) { return { ok: true, data: await this.review.escalate(this.who(req), id, body?.reason) }; }
}
