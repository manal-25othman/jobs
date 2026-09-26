import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';

/**
 * Career goal and project.
 *
 * Both are the user's own intent, so RLS already defines authorisation and the
 * writes run as the user. Nothing here decides what is true about a skill.
 */
@Injectable()
export class CareerService {
  constructor(private readonly db: DbService) {}

  async listTargetRoles(userId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select id, slug, label_ar, label_en, review_status, source_label, is_demo_fixture
           from target_role order by label_en`,
      );
      return rows;
    });
  }

  async setCareerGoal(userId: string, targetRoleId: string, confirmed: boolean) {
    if (!confirmed) {
      // Onboarding step 3 is an explicit confirmation, not a dropdown change.
      throw new BadRequestException('a career goal must be explicitly confirmed');
    }
    return this.db.asService(async (c) => {
      const role = await c.query(
        'select id, label_en, review_status from target_role where id = $1', [targetRoleId],
      );
      if (role.rowCount === 0) throw new NotFoundException('unknown target role');

      await c.query('update career_goal set is_current = false where user_id = $1 and is_current', [userId]);
      const { rows } = await c.query(
        `insert into career_goal (user_id, target_role_id, confirmed_at, is_current)
         values ($1, $2, now(), true)
         returning id, target_role_id, confirmed_at`,
        [userId, targetRoleId],
      );
      await emitAuditEvent(c, {
        eventType: 'career_goal.confirmed',
        userId, actorKind: 'user', actorId: userId,
        subjectTable: 'career_goal', subjectId: rows[0].id,
        reason: 'the user explicitly confirmed this as their current career goal',
        payload: { targetRoleId },
      });

      const r = role.rows[0];
      return {
        id: rows[0].id,
        targetRoleId,
        roleLabel: r.label_en,
        roleReviewStatus: r.review_status === 'published' ? 'reviewed' : 'draft',
        // An unreviewed role definition must show "data not complete yet"
        // rather than presenting fixture requirements as validated.
        requirementsIncomplete: r.review_status !== 'published',
        confirmedAt: rows[0].confirmed_at,
      };
    });
  }

  async getCurrentGoal(userId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select cg.id, cg.target_role_id, cg.confirmed_at,
                tr.label_en, tr.label_ar, tr.review_status
           from career_goal cg
           join target_role tr on tr.id = cg.target_role_id
          where cg.user_id = $1 and cg.is_current`,
        [userId],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        targetRoleId: r.target_role_id,
        roleLabel: r.label_en,
        roleLabelAr: r.label_ar,
        roleReviewStatus: r.review_status === 'published' ? 'reviewed' : 'draft',
        requirementsIncomplete: r.review_status !== 'published',
        confirmedAt: r.confirmed_at,
      };
    });
  }

  /** The user's claims with their evidence state. Read-only, RLS-scoped. */
  async listSkillClaims(userId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select sc.skill_id, sc.state, sc.state_reason,
                sk.label_ar, sk.label_en,
                (select count(*) from evidence e
                  where e.user_id = sc.user_id and e.skill_id = sc.skill_id
                    and e.withdrawn_at is null) as evidence_count,
                sc.primary_evidence_id
           from skill_claim sc
           join skill sk on sk.id = sc.skill_id
          order by evidence_ordinal(sc.state) desc, sk.label_en`,
      );
      return rows.map((r) => ({
        skillId: r.skill_id,
        skillNameAr: r.label_ar,
        skillName: r.label_en,
        state: r.state,
        stateReason: r.state_reason,
        evidenceCount: Number(r.evidence_count),
        primaryEvidenceId: r.primary_evidence_id,
      }));
    });
  }

  async createProject(userId: string, input: {
    title: string; kind: 'platform_activity' | 'personal_project';
    description?: string; activitySpecId?: string;
  }) {
    if (!input.title?.trim()) throw new BadRequestException('a project needs a title');

    return this.db.asService(async (c) => {
      let specId: string | null = null;
      let specVersion: string | null = null;

      if (input.kind === 'platform_activity') {
        if (!input.activitySpecId) {
          throw new BadRequestException('a platform activity must reference an activity spec');
        }
        const spec = await c.query(
          `select id, version, status from activity_spec where id = $1`, [input.activitySpecId],
        );
        if (spec.rowCount === 0) throw new NotFoundException('unknown activity spec');
        if (spec.rows[0].status !== 'published') {
          // INV-7: a draft spec would make the work unreproducible.
          throw new BadRequestException('an activity spec must be published before work starts against it');
        }
        specId = spec.rows[0].id;
        specVersion = spec.rows[0].version;
      }

      const { rows } = await c.query(
        `insert into project (user_id, title, kind, description, activity_spec_id,
                              activity_spec_version, status)
         values ($1,$2,$3,$4,$5,$6,'active')
         returning id, title, kind, status, activity_spec_version, created_at, updated_at`,
        [userId, input.title.trim(), input.kind, input.description ?? null, specId, specVersion],
      );
      await emitAuditEvent(c, {
        eventType: 'project.created',
        userId, actorKind: 'user', actorId: userId,
        subjectTable: 'project', subjectId: rows[0].id,
        reason: `the user created a ${input.kind}`,
      });
      return rows[0];
    });
  }

  async listProjects(userId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select id, title, kind, status, activity_spec_version, created_at, updated_at
           from project where deleted_at is null order by created_at desc`,
      );
      return rows;
    });
  }

  async getProject(userId: string, projectId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(
        `select id, title, kind, status, description, activity_spec_id,
                activity_spec_version, created_at
           from project where id = $1 and deleted_at is null`,
        [projectId],
      );
      // RLS already filtered by owner, so "not visible" and "does not exist"
      // are the same answer here — and that is the right answer to give.
      if (rows.length === 0) throw new NotFoundException('project not found');
      return rows[0];
    });
  }
}
