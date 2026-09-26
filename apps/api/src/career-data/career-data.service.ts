import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DbService } from '../infra/db.service';
import { consumableByProduct, demoContentAllowedInProduction, type ReviewState } from '@naqla/domain';

export interface RoleRequirementFact { skillId: string; skillCode: string; labelAr: string; labelEn: string; isCore: boolean; importance: string | null; targetProficiency: string | null; whyRequiredAr: string | null; whyRequiredEn: string | null; }
export interface RoleRequirementsContext { status: 'published' | 'unpublished' | 'missing'; roleId: string | null; roleLabelEn: string | null; reviewStatus: ReviewState | null; requirements: RoleRequirementFact[]; }
export interface ActivityContext {
  status: 'structured' | 'legacy_snapshot' | 'missing';
  activitySpecId: string | null; slug: string | null; version: string | null; titleAr: string | null; titleEn: string | null; objectiveEn: string | null;
  deliverables: { key: string; mandatory: boolean; descriptionEn: string }[];
  relatedSkills: { skillId: string; code: string; labelEn: string; depth: string }[];
  tasks: { code: string; titleEn: string }[];
  rubric: { version: string; criteria: { key: string; nameEn: string; linkedSkillId: string; weight: number; mandatory: boolean; evaluatorType: string }[] } | null;
}

/**
 * Structured career data for the product and the agents. Reads the PUBLISHED
 * layer only; anything else is reported as a limitation, never invented.
 */
@Injectable()
export class CareerDataService implements OnModuleInit {
  private readonly logger = new Logger(CareerDataService.name);
  constructor(private readonly db: DbService) {}

  /** Production refuses to start with published DEMO content (domain: demoContentAllowedInProduction). */
  async onModuleInit(): Promise<void> {
    if (process.env['NODE_ENV'] !== 'production') return;
    const offenders = await this.db.asService(async (c) => {
      const out: string[] = [];
      for (const [t, col] of [['skill', 'review_status'], ['target_role', 'review_status'], ['role_requirement', 'review_status'], ['task', 'review_status'], ['activity_spec', 'status'], ['rubric_version', 'status'], ['learning_resource', 'review_status'], ['career_presentation_rule', 'review_status']] as const) {
        const { rows } = await c.query(`select ${col} as s, count(*)::int as n from ${t} where is_demo_fixture group by ${col}`);
        for (const r of rows) if (!demoContentAllowedInProduction(r.s as ReviewState)) out.push(`${t}: ${r.n} demo row(s) ${r.s}`);
      }
      return out;
    });
    if (offenders.length) throw new Error(`DEMO career data is published in a production database; refusing to start: ${offenders.join('; ')}`);
  }

  roleRequirementsIn(c: PoolClient, roleId: string | null): Promise<RoleRequirementsContext> { return loadRoleRequirements(c, roleId); }
  activityContextIn(c: PoolClient, activitySpecId: string | null): Promise<ActivityContext> { return loadActivityContext(c, activitySpecId); }
}

export async function loadRoleRequirements(c: PoolClient, roleId: string | null): Promise<RoleRequirementsContext> {
  if (!roleId) return { status: 'missing', roleId: null, roleLabelEn: null, reviewStatus: null, requirements: [] };
  const role = await c.query('select id, label_en, review_status from target_role where id = $1', [roleId]);
  if (role.rowCount === 0) return { status: 'missing', roleId, roleLabelEn: null, reviewStatus: null, requirements: [] };
  const st = role.rows[0].review_status as ReviewState;
  if (!consumableByProduct(st)) return { status: 'unpublished', roleId, roleLabelEn: role.rows[0].label_en, reviewStatus: st, requirements: [] };
  const { rows } = await c.query(
    `select rr.skill_id, s.slug, s.label_ar, s.label_en, rr.is_core, rr.importance, rr.target_proficiency, rr.why_required_ar, rr.why_required_en
       from role_requirement rr join skill s on s.id = rr.skill_id where rr.target_role_id = $1 and rr.review_status = 'published' and s.status = 'active'
      order by rr.is_core desc, s.label_en`, [roleId]);
  if (rows.length === 0) return { status: 'unpublished', roleId, roleLabelEn: role.rows[0].label_en, reviewStatus: st, requirements: [] };
  return { status: 'published', roleId, roleLabelEn: role.rows[0].label_en, reviewStatus: st,
    requirements: rows.map((r) => ({ skillId: r.skill_id, skillCode: r.slug, labelAr: r.label_ar, labelEn: r.label_en, isCore: r.is_core, importance: r.importance, targetProficiency: r.target_proficiency, whyRequiredAr: r.why_required_ar, whyRequiredEn: r.why_required_en })) };
}

export async function loadActivityContext(c: PoolClient, activitySpecId: string | null): Promise<ActivityContext> {
  const empty: ActivityContext = { status: 'missing', activitySpecId, slug: null, version: null, titleAr: null, titleEn: null, objectiveEn: null, deliverables: [], relatedSkills: [], tasks: [], rubric: null };
  if (!activitySpecId) return empty;
  const a = await c.query('select id, slug, version, title_ar, title_en, objective_en, status from activity_spec where id = $1', [activitySpecId]);
  if (a.rowCount === 0) return empty;
  const row = a.rows[0];
  const deliverables = await c.query('select key, mandatory, description_en from activity_deliverable where activity_spec_id = $1 order by position', [row.id]);
  const skills = await c.query('select ak.skill_id, s.slug, s.label_en, ak.depth from activity_skill ak join skill s on s.id = ak.skill_id where ak.activity_spec_id = $1 order by ak.depth, s.label_en', [row.id]);
  const tasks = await c.query('select t.code, t.title_en from activity_task at_ join task t on t.id = at_.task_id where at_.activity_spec_id = $1 order by t.code', [row.id]);
  const rv = await c.query(`select id, version from rubric_version where activity_spec_id = $1 and status = 'published' order by created_at desc limit 1`, [row.id]);
  let rubric: ActivityContext['rubric'] = null;
  if (rv.rowCount) {
    const crit = await c.query('select key, name_en, linked_skill_id, weight, mandatory, evaluator_type from rubric_criterion where rubric_version_id = $1 order by position', [rv.rows[0].id]);
    rubric = { version: rv.rows[0].version, criteria: crit.rows.map((r) => ({ key: r.key, nameEn: r.name_en, linkedSkillId: r.linked_skill_id, weight: Number(r.weight), mandatory: r.mandatory, evaluatorType: r.evaluator_type })) };
  }
  const structured = deliverables.rowCount! > 0 && skills.rowCount! > 0;
  return { status: structured ? 'structured' : 'legacy_snapshot', activitySpecId: row.id, slug: row.slug, version: row.version, titleAr: row.title_ar, titleEn: row.title_en, objectiveEn: row.objective_en,
    deliverables: deliverables.rows.map((d) => ({ key: d.key, mandatory: d.mandatory, descriptionEn: d.description_en })),
    relatedSkills: skills.rows.map((s) => ({ skillId: s.skill_id, code: s.slug, labelEn: s.label_en, depth: s.depth })),
    tasks: tasks.rows.map((t) => ({ code: t.code, titleEn: t.title_en })), rubric };
}
