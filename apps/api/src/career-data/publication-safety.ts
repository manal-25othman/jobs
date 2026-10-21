import type { Pool, PoolClient } from 'pg';
import { BadRequestException } from '@nestjs/common';

/**
 * Publication safety for role requirements (Q25 and the v2 approval gates share this one query).
 *
 *  - `hidden`   (Q25): the requirement and its role are graduate-visible, the skill is active, but the skill is not
 *                graduate-visible (0024) — e.g. a DEMO skill superseded by an OPEN-040 promotion: the track would
 *                silently omit a required skill.
 *  - `unusable`: the skill is superseded or rejected, or no longer active (deprecated / merged) — whatever the
 *                requirement's own state. A role is never approved or published around such a skill.
 * Read-only: nothing is repointed or rewritten here.
 */
export interface RoleSkillVisibilityRow { requirementId: string; role: string; skill: string; skillStatus: string; skillReview: string; successorId: string | null; successorReview: string | null; hidden: boolean; unusable: boolean }

export async function roleSkillVisibility(c: Pool | PoolClient, roleId: string | null = null): Promise<RoleSkillVisibilityRow[]> {
  const { rows } = await c.query(
    `select rr.id::text as requirement_id, tr.slug as role, s.slug as skill, s.status::text as skill_status, s.review_status::text as skill_review,
            succ.id::text as successor_id, succ.review_status::text as successor_review,
            (s.status = 'active' and graduate_content_visible(rr.review_status, rr.is_demo_fixture) and graduate_content_visible(tr.review_status, tr.is_demo_fixture)
              and not graduate_content_visible(s.review_status, s.is_demo_fixture)) as hidden,
            (s.status <> 'active' or s.review_status in ('superseded', 'rejected')) as unusable
       from role_requirement rr join target_role tr on tr.id = rr.target_role_id join skill s on s.id = rr.skill_id
       left join skill succ on succ.promoted_from_id = s.id and not succ.is_demo_fixture
      where ($1::uuid is null or rr.target_role_id = $1::uuid)
      order by tr.slug, s.slug`, [roleId]);
  return rows.map((r) => ({ requirementId: r.requirement_id, role: r.role, skill: r.skill, skillStatus: r.skill_status, skillReview: r.skill_review,
    successorId: r.successor_id ?? null, successorReview: r.successor_review ?? null, hidden: r.hidden === true, unusable: r.unusable === true }));
}

export const visibilityLabel = (r: RoleSkillVisibilityRow): string =>
  `${r.role} → ${r.skill} (${r.skillStatus === 'active' ? r.skillReview : r.skillStatus}${r.successorId ? `, successor ${r.successorId} ${r.successorReview}` : ', no successor'})`;

/** Whether the role is on the professionally classified (v2) path: it has a classification version, in any state. */
export async function roleIsClassified(c: Pool | PoolClient, roleId: string): Promise<boolean> {
  return ((await c.query('select 1 from skill_classification_set where target_role_id = $1 limit 1', [roleId])).rowCount ?? 0) > 0;
}

/**
 * Refuses an approval / publication step for a role (or one of its requirements) while any requirement references a
 * superseded, rejected, inactive or learner-invisible skill. The way out is a governed fix (promote the role so its
 * requirements point at the published successor, or replace the requirement) — never a silent repoint here.
 */
export async function assertRoleSkillsPublishable(c: Pool | PoolClient, roleId: string, action: string, requirementId?: string): Promise<void> {
  const bad = (await roleSkillVisibility(c, roleId)).filter((r) => (r.hidden || r.unusable) && (!requirementId || r.requirementId === requirementId));
  if (bad.length) throw new BadRequestException(`${action} refused: a role requirement references a superseded, retired or learner-invisible skill (Q25): ${bad.map(visibilityLabel).join('; ')}`);
}
