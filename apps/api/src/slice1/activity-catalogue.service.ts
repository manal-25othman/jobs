import { Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DbService } from '../infra/db.service';
import { AssessmentRecorderService } from '../assessment/assessment-recorder.service';
import { EvaluationService } from './evaluation.service';
import { activityAssessmentMode, workStatus, type WorkStatus } from '@naqla/domain';

/** Learner-facing activity columns. Nothing else of activity_spec leaves this service (0024 grants the same set). */
const ACTIVITY_COLUMNS = `a.id, a.slug, a.version, a.title_ar, a.title_en, a.objective_ar, a.objective_en, a.business_context_ar, a.business_context_en,
  a.level, a.ai_usage_mode, a.estimated_minutes, a.target_role_id, a.is_demo_fixture, a.can_yield_demonstrated, a.status, a.published_at`;

export interface ProjectStatusRow {
  id: string; title: string; kind: string; status: string; activitySpecId: string | null; activitySpecVersion: string | null;
  activity: { id: string; slug: string; titleAr: string; titleEn: string } | null;
  attempts: number; createdAt: string; updatedAt: string;
  latestSubmission: null | {
    id: string; submittedAt: string; evaluationId: string | null; evaluationState: string | null; resultId: string | null; outcome: string | null;
    decision: string | null; levelChanged: boolean;
  };
  workStatus: WorkStatus;
}

/**
 * Graduate activity journey, Phase 1 (A1, A2, A5).
 *
 * What a graduate may see is decided in ONE place, the database (migration 0024):
 * `graduate_activity_in_catalogue(activity, role)`. This service never widens it: an activity outside the
 * graduate's current-role catalogue answers 404 exactly like one that does not exist, unless the graduate
 * already has a project on it (their own history stays readable, and cannot be restarted).
 *
 * The assessment mode is derived from the rubric an evaluation would use (the same resolution as the
 * evaluation) through the D-118 rule; it is informational and decides nothing.
 */
@Injectable()
export class ActivityCatalogueService {
  constructor(private readonly db: DbService, private readonly evaluations: EvaluationService, private readonly assessments: AssessmentRecorderService) {}

  private async goal(c: PoolClient, userId: string) {
    const { rows } = await c.query(
      `select r.id, r.slug, r.label_ar, r.label_en, r.is_demo_fixture, graduate_role_visible(r.id) as visible
         from career_goal g join target_role r on r.id = g.target_role_id where g.user_id = $1 and g.is_current`, [userId]);
    return rows[0] ?? null;
  }

  /** A1 — the activities of the graduate's current role. */
  async list(userId: string) {
    return this.db.asService(async (c) => {
      const g = await this.goal(c, userId);
      const policy = await this.policyNote(c);
      if (!g) return { role: null, unavailableReason: 'no_career_goal' as const, items: [], policy };
      const role = { id: g.id, slug: g.slug, labelAr: g.label_ar, labelEn: g.label_en, isDemo: g.is_demo_fixture };
      if (!g.visible) return { role, unavailableReason: 'role_unavailable' as const, items: [], policy };
      const acts = await c.query(
        `select ${ACTIVITY_COLUMNS} from activity_spec a where graduate_activity_in_catalogue(a.id, $1)
          order by a.is_demo_fixture, a.level, a.title_ar, a.version`, [g.id]);
      const mine = await this.projectStatuses(userId, null);
      const items = [];
      for (const a of acts.rows) {
        const skills = await this.visibleSkills(c, a.id);
        const deliverables = await c.query(`select count(*)::int as n, count(*) filter (where format = 'source file')::int as files from activity_deliverable where activity_spec_id = $1`, [a.id]);
        const projects = mine.filter((p) => p.activitySpecId === a.id);
        items.push({
          ...this.summary(a), skills,
          deliverableCount: deliverables.rows[0].n, fileDeliverableCount: deliverables.rows[0].files,
          assessment: await this.assessment(c, a),
          myLatest: projects[0] ? { projectId: projects[0].id, workStatus: projects[0].workStatus, attempts: projects[0].attempts } : null,
        });
      }
      return { role, unavailableReason: null, items, policy };
    });
  }

  /** A2 — one activity, learner projection only. 404 when outside the graduate's catalogue (and not their own history). */
  async detail(userId: string, activityId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(activityId)) throw new NotFoundException('activity not found');
    const out = await this.db.asService(async (c) => {
      const g = await this.goal(c, userId);
      const inCatalogue = g ? (await c.query('select graduate_activity_in_catalogue($1, $2) as ok', [activityId, g.id])).rows[0].ok === true : false;
      const ownHistory = (await c.query('select 1 from project where user_id = $1 and activity_spec_id = $2 and deleted_at is null limit 1', [userId, activityId])).rowCount! > 0;
      if (!inCatalogue && !ownHistory) return null;
      const a = (await c.query(`select ${ACTIVITY_COLUMNS} from activity_spec a where a.id = $1`, [activityId])).rows[0];
      if (!a) return null;
      const deliverables = await c.query(
        `select key, format, mandatory, description_ar, description_en, position from activity_deliverable where activity_spec_id = $1 order by position`, [activityId]);
      // Inputs: the key always; the description only when the input carries no planted issue (its wording would
      // reveal the assessment design). The planted-issue flag itself never leaves the service.
      const inputs = await c.query(`select key, description_ar, description_en, contains_planted_issue from activity_input where activity_spec_id = $1 order by key`, [activityId]);
      return {
        ...this.summary(a),
        businessContextAr: a.business_context_ar, businessContextEn: a.business_context_en, objectiveEn: a.objective_en,
        available: inCatalogue,
        skills: await this.visibleSkills(c, activityId),
        deliverables: deliverables.rows.map((d) => ({ key: d.key, format: d.format, kind: d.format === 'source file' ? 'file' as const : 'text' as const, mandatory: d.mandatory,
          descriptionAr: d.description_ar, descriptionEn: d.description_en, position: Number(d.position) })),
        inputs: inputs.rows.map((i) => i.contains_planted_issue
          ? { key: i.key, descriptionAr: null, descriptionEn: null, descriptionWithheld: true }
          : { key: i.key, descriptionAr: i.description_ar, descriptionEn: i.description_en, descriptionWithheld: false }),
        materialsAvailable: false,
        assessment: await this.assessment(c, a),
        policy: await this.policyNote(c),
      };
    });
    if (!out) throw new NotFoundException('activity not found');
    return { ...out, myProjects: await this.projectStatuses(userId, activityId) };
  }

  private summary(a: Record<string, any>) {
    return {
      id: a.id, slug: a.slug, version: a.version, titleAr: a.title_ar, titleEn: a.title_en, objectiveAr: a.objective_ar,
      level: a.level, estimatedMinutes: a.estimated_minutes, aiUsageMode: a.ai_usage_mode,
      isDemo: a.is_demo_fixture === true,
      // Shown with every demo item: demo content is never reviewed and never supports a level.
      label: a.is_demo_fixture ? 'DEMO — not reviewed' : null,
    };
  }

  private async visibleSkills(c: PoolClient, activityId: string) {
    const { rows } = await c.query(
      `select s.id, s.slug, s.label_ar, s.label_en, k.depth from activity_skill k join skill s on s.id = k.skill_id
        where k.activity_spec_id = $1 and s.status = 'active' and graduate_content_visible(s.review_status, s.is_demo_fixture)
        group by s.id, s.slug, s.label_ar, s.label_en, k.depth order by k.depth, s.label_en`, [activityId]);
    return rows.map((r) => ({ id: r.id, slug: r.slug, labelAr: r.label_ar, labelEn: r.label_en, depth: r.depth }));
  }

  /** What the backend can actually do with work on this activity (derived; never chosen by a client). */
  private async assessment(c: PoolClient, a: Record<string, any>) {
    const rubric = await this.evaluations.publishedRubricOrNull(c, a.id, a.version);
    const rv = rubric ? (await c.query('select is_demo_fixture, values_approved_at from rubric_version where id = $1', [rubric.rubricVersionId])).rows[0] : null;
    const m = activityAssessmentMode({
      rubric, rubricValuesApproved: !!rv?.values_approved_at, rubricIsDemo: rv ? rv.is_demo_fixture === true : true,
      activityIsDemo: a.is_demo_fixture === true, canYieldDemonstrated: a.can_yield_demonstrated === true,
    });
    return { mode: m.mode, evaluable: m.evaluable, canSupportLevel: m.canSupportLevel, reasons: m.reasons };
  }

  /** The verification policy in effect, only to flag a development-only legacy policy (never production: the DB refuses it). */
  private async policyNote(c: PoolClient) {
    try {
      const { policy, resolution } = await this.assessments.loadPolicy(c);
      return { key: `${policy.key}@${policy.version}`, promotionBasis: policy.promotionBasis, resolution,
        developmentLegacyPolicy: policy.promotionBasis === 'legacy_any_pass' };
    } catch { return { key: null, promotionBasis: null, resolution: 'none', developmentLegacyPolicy: false }; }
  }

  /**
   * A5 — the graduate's projects with their current work status, from authoritative records (submission,
   * evaluation, final result, verification decision). Read under the graduate's own RLS.
   */
  async projectStatuses(userId: string, activityId: string | null): Promise<ProjectStatusRow[]> {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select p.id, p.title, p.kind, p.status, p.activity_spec_id, p.activity_spec_version, p.created_at, p.updated_at,
                a.slug as activity_slug, a.title_ar as activity_title_ar, a.title_en as activity_title_en,
                (select count(*)::int from submission s where s.project_id = p.id) as attempts,
                ls.id as submission_id, ls.created_at as submitted_at, ev.id as evaluation_id, ev.state as evaluation_state,
                er.id as result_id, er.outcome
           from project p
           left join activity_spec a on a.id = p.activity_spec_id
           left join lateral (select s.id, s.created_at from submission s where s.project_id = p.id order by s.created_at desc limit 1) ls on true
           left join lateral (select e.id, e.state from evaluation e where e.submission_id = ls.id order by e.queued_at desc limit 1) ev on true
           left join lateral (select r.id, r.outcome from evaluation_result r where r.evaluation_id = ev.id
                                and not exists (select 1 from evaluation_result n where n.supersedes_result_id = r.id)
                               order by r.evaluated_at desc limit 1) er on true
          where p.deleted_at is null and ($1::uuid is null or p.activity_spec_id = $1::uuid)
          order by p.created_at desc`, [activityId]);
      const resultIds = rows.map((r) => r.result_id).filter(Boolean);
      const decisions = resultIds.length ? (await c.query(
        `select evaluation_result_id, decision, previous_state, resulting_state, evidence_id from verification_decision where evaluation_result_id = any($1::uuid[])`, [resultIds])).rows : [];
      return rows.map((r) => {
        const ds = decisions.filter((d) => d.evaluation_result_id === r.result_id);
        const decision = (ds.find((d) => d.decision === 'assessment_pending_validation') ?? ds[0])?.decision ?? null;
        const levelChanged = ds.some((d) => d.decision !== 'assessment_pending_validation' && d.evidence_id && d.resulting_state && d.resulting_state !== d.previous_state);
        return {
          id: r.id, title: r.title, kind: r.kind, status: r.status, activitySpecId: r.activity_spec_id, activitySpecVersion: r.activity_spec_version,
          activity: r.activity_spec_id ? { id: r.activity_spec_id, slug: r.activity_slug, titleAr: r.activity_title_ar, titleEn: r.activity_title_en } : null,
          attempts: Number(r.attempts), createdAt: r.created_at, updatedAt: r.updated_at,
          latestSubmission: r.submission_id ? { id: r.submission_id, submittedAt: r.submitted_at, evaluationId: r.evaluation_id, evaluationState: r.evaluation_state,
            resultId: r.result_id, outcome: r.outcome, decision, levelChanged } : null,
          workStatus: workStatus({ hasSubmission: !!r.submission_id, evaluationState: r.evaluation_state, outcome: r.outcome, decision, levelChanged }),
        };
      });
    });
  }
}
