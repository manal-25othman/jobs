import { isProduction } from '../configuration/configuration.service';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { recommendLearning, type LearningPlanProposal, type RegistryResource, type PracticeOption } from '@naqla/domain';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';

/**
 * Phase B, package 2 — the deterministic A07 learning recommendation on the skill page (contract A07, FR-A-011, FR-P-017).
 *
 *  - verified resources are read AS THE GRADUATE: the 0040 row policy is the gate (published + verified only);
 *  - the internal candidate preview (LEARNING_CANDIDATE_PREVIEW=internal) adds UNVERIFIED demo drafts. It is on only
 *    outside production AND in a deployment that shows demo content, every candidate item is labelled, and every
 *    preview served is audited (`learning.candidate_preview_served`);
 *  - practice options are the activities of the graduate's current role that exercise the skill;
 *  - nothing here writes a level, a claim, evidence or progress.
 */
@Injectable()
export class LearningService {
  constructor(private readonly db: DbService) {}

  previewRequested(): boolean {
    return process.env['LEARNING_CANDIDATE_PREVIEW'] === 'internal' && !isProduction();
  }

  async forSkill(userId: string, skillId: string, roleId: string | null, level: string): Promise<LearningPlanProposal> {
    const { verified, practice } = await this.db.asUser(userId, async (c) => ({
      verified: await this.resources(c, skillId, 'verified'),
      practice: roleId ? (await c.query(
        `select a.id, a.slug, a.title_ar, activity_materials_complete(a.id) as startable from activity_skill k join activity_spec a on a.id = k.activity_spec_id
          where k.skill_id = $1 and graduate_activity_in_catalogue(a.id, $2) order by a.slug`, [skillId, roleId])).rows
        .map((r): PracticeOption => ({ activityId: String(r.id), slug: String(r.slug), titleAr: String(r.title_ar), startable: r.startable === true })) : [],
    }));

    return this.db.asService(async (c) => {
      const preview = this.previewRequested() && (await c.query('select demo_content_visible() as v')).rows[0].v === true;
      const candidates = preview ? await this.resources(c, skillId, 'candidate') : [];
      const proposal = recommendLearning({ resources: [...verified, ...candidates], practiceOptions: practice, context: { level, candidatePreview: preview } });
      const shown = [proposal.resource, ...proposal.alternatives].filter((x) => x !== null);
      if (shown.length) {
        await emitAuditEvent(c, { eventType: 'learning.resource_recommended', userId, actorKind: 'system', subjectTable: 'learning_resource', subjectId: shown[0]!.id,
          reason: 'A07 deterministic recommendation for a skill on the skill page (registry only, with mandatory practice)',
          payload: { skillId, codes: shown.map((x) => x.code), exposures: shown.map((x) => x.exposure), practice: proposal.practice?.slug ?? null } });
      }
      const candidateCodes = shown.filter((x) => x.exposure === 'candidate').map((x) => x.code);
      if (candidateCodes.length) {
        await emitAuditEvent(c, { eventType: 'learning.candidate_preview_served', userId, actorKind: 'system', subjectTable: 'learning_resource', subjectId: null,
          reason: 'internal candidate preview: UNVERIFIED resources shown, labelled, in a development deployment (PO decision 2)', payload: { skillId, codes: candidateCodes } });
      }
      return proposal;
    });
  }

  private async resources(c: PoolClient, skillId: string, kind: 'verified' | 'candidate'): Promise<RegistryResource[]> {
    const where = kind === 'verified'
      // As the graduate: the row policy already admits only verified, visible rows; the predicate restates it.
      ? `learning_resource_verified(lr.quality_status, lr.review_status, lr.url, lr.link_check, lr.last_checked, lr.usage_terms_checked)`
      : `lr.is_demo_fixture and lr.quality_status = 'unverified' and lr.review_status in ('draft', 'curated', 'needs_revision')`;
    const rows = (await c.query(
      `select lr.id, lr.code, lr.title, lr.title_ar, lr.provider, lr.resource_type::text as resource_type, lr.language, lr.free_or_paid::text as free_or_paid, lr.url,
              lr.why_recommended_ar, lr.covers_target_level, lr.duration_minutes, lr.duration_basis, lr.quality_status::text as quality_status, lr.review_status::text as review_status,
              lr.link_check, lr.last_checked::text as last_checked, lr.usage_terms_checked::text as usage_terms_checked, a.slug as practice_slug
         from learning_resource lr left join activity_spec a on a.id = lr.practice_activity_spec_id
        where lr.skill_id = $1 and ${where}`, [skillId])).rows;
    return rows.map((r) => ({
      id: String(r.id), code: String(r.code ?? r.id), titleAr: r.title_ar, titleEn: String(r.title), provider: r.provider, resourceType: r.resource_type, language: r.language,
      freeOrPaid: r.free_or_paid, url: r.url, whyRecommendedAr: r.why_recommended_ar, coversTargetLevel: r.covers_target_level, durationMinutes: r.duration_minutes, durationBasis: r.duration_basis,
      qualityStatus: r.quality_status, reviewStatus: r.review_status, linkCheck: r.link_check, lastChecked: r.last_checked, usageTermsChecked: r.usage_terms_checked, practiceActivitySlug: r.practice_slug,
    }));
  }
}
