import { Injectable, BadRequestException } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import {
  buildCareerEvidenceReport, toPublicReport, NO_AI_DISCLOSURE,
  type ReportSkillEntry, type EvidenceState, type EvaluationOutcome,
} from '@naqla/domain';

/**
 * Career Evidence Report.
 *
 * The projection is a whitelist built in the domain: the query below selects
 * only the columns the contract names, and the domain then refuses the whole
 * object if a forbidden key appears anywhere in it. Two independent gates,
 * because the expensive failure here is a private field reaching a recruiter.
 */
@Injectable()
export class ReportService {
  constructor(private readonly db: DbService) {}

  async generate(userId: string) {
    return this.db.asService(async (c) => {
      const goal = await c.query(
        `select cg.id, tr.label_en, tr.label_ar, tr.review_status
           from career_goal cg
           join target_role tr on tr.id = cg.target_role_id
          where cg.user_id = $1 and cg.is_current`,
        [userId],
      );
      if (goal.rowCount === 0) {
        throw new BadRequestException('no current career goal; a report needs a target to report against');
      }
      const g = goal.rows[0];

      /* Only the fields the report contract names. No select *. */
      const claims = await c.query(
        `select sc.state, sc.state_reason,
                sk.label_en as skill_label,
                p.title as project_title, p.kind as project_kind,
                er.outcome, er.evaluated_at,
                rv.version as rubric_version,
                er.id as result_id
           from skill_claim sc
           join skill sk on sk.id = sc.skill_id
           left join evidence e on e.id = sc.primary_evidence_id
           left join project p on p.id = e.project_id
           left join evaluation_result er on er.id = e.evaluation_result_id
           left join rubric_version rv on rv.id = er.rubric_version_id
          where sc.user_id = $1
            and evidence_ordinal(sc.state) >= evidence_ordinal('practiced')
          order by evidence_ordinal(sc.state) desc, sk.label_en`,
        [userId],
      );

      const skills: ReportSkillEntry[] = [];
      for (const r of claims.rows) {
        const criteria = r.result_id ? await c.query(
          `select criterion_key, score, max_score, rationale
             from evaluation_criterion_score where evaluation_result_id = $1
            order by criterion_key`,
          [r.result_id],
        ) : { rows: [] };

        // user_facing only. An assessment-only check never reaches a report.
        const integrity = r.result_id ? await c.query(
          `select check_key, passed from integrity_check
            where evaluation_result_id = $1 and classification = 'user_facing'
            order by check_key`,
          [r.result_id],
        ) : { rows: [] };

        const score = criteria.rows.reduce((s: number, x: { score: string }) => s + Number(x.score), 0);
        const maxScore = criteria.rows.reduce((s: number, x: { max_score: string }) => s + Number(x.max_score), 0);

        skills.push({
          skillLabel: r.skill_label,
          evidenceState: r.state as EvidenceState,
          stateReason: r.state_reason,
          source: {
            projectTitle: r.project_title ?? '—',
            kind: (r.project_kind ?? 'personal_project') as 'platform_activity' | 'personal_project',
          },
          evaluationSummary: {
            outcome: (r.outcome ?? 'below_threshold') as EvaluationOutcome,
            score, maxScore,
            rubricVersion: r.rubric_version ?? '—',
            evaluatedAt: r.evaluated_at ? new Date(r.evaluated_at).toISOString() : '—',
            criteria: criteria.rows.map((x: { criterion_key: string; score: string; max_score: string; rationale: string }) => ({
              label: x.criterion_key,
              met: Number(x.score) >= Number(x.max_score),
              rationale: x.rationale,
            })),
          },
          integrityResult: {
            allPassed: integrity.rows.every((x: { passed: boolean }) => x.passed),
            userFacingChecks: integrity.rows.map((x: { check_key: string; passed: boolean }) => ({
              label: x.check_key, passed: x.passed,
            })),
          },
        });
      }

      // Only ACTIVE (approved) assets. A draft is not a claim yet.
      const assets = await c.query(
        `select body, user_approved_at from professional_asset
          where user_id = $1 and lifecycle_state = 'active' and user_approved_at is not null
          order by created_at`,
        [userId],
      );

      const report = buildCareerEvidenceReport({
        targetRole: {
          label: g.label_en,
          reviewStatus: g.review_status === 'published' ? 'reviewed' : 'draft',
        },
        skills,
        approvedAssets: assets.rows.map((a: { body: string; user_approved_at: Date }) => ({
          kind: 'cv_bullet' as const,
          body: a.body,
          approvedAt: new Date(a.user_approved_at).toISOString(),
        })),
        generatedAt: new Date().toISOString(),
      });

      const stored = await c.query(
        `insert into evidence_report (user_id, career_goal_id, projection, ai_disclosure)
         values ($1,$2,$3,$4) returning id, generated_at`,
        [userId, g.id, JSON.stringify(toPublicReport(report)), NO_AI_DISCLOSURE],
      );

      await emitAuditEvent(c, {
        eventType: 'evidence_report.generated',
        userId, actorKind: 'user', actorId: userId,
        subjectTable: 'evidence_report', subjectId: stored.rows[0].id,
        reason: 'the user generated a career evidence report',
        payload: { skillCount: skills.length, assetCount: assets.rowCount, modelUsed: false },
      });

      return { id: stored.rows[0].id, ...report };
    });
  }

  /** What a share link exposes: strictly narrower than the private report. */
  async getPublicProjection(reportId: string) {
    return this.db.asService(async (c) => {
      const { rows } = await c.query(
        `select er.projection, er.ai_disclosure, er.generated_at
           from evidence_report er
          where er.id = $1
            and public.share_link_opens('recruiter_report', er.id)`,
        [reportId],
      );
      if (rows.length === 0) return null;
      return rows[0].projection;
    });
  }
}
