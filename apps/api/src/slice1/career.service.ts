import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { SkillProgressEngine } from '../skill-progress/skill-progress-engine.service';

/**
 * Career goal and project.
 *
 * Both are the user's own intent, so RLS already defines authorisation and the
 * writes run as the user. Nothing here decides what is true about a skill.
 */
@Injectable()
export class CareerService {
  constructor(private readonly db: DbService, private readonly progress: SkillProgressEngine) {}

  /**
   * A4 — the roles a graduate may choose: visible content (published; DEMO only where demo content is visible,
   * labelled) WITH consumable content (a visible requirement or a catalogue activity). Drafts, test roles and
   * empty shells are not listed. The rule is the database's (`graduate_role_listed`, 0024), not a client filter.
   */
  async listTargetRoles(userId: string) {
    return this.db.asService(async (c) => {
      // Offered roles (0024 + 0037), plus the graduate's OWN current goal when it is still visible but no longer
      // offered (PO decision 1: existing associations are preserved; the legacy role is shown as theirs, not as a choice).
      const { rows } = await c.query(
        `select r.id, r.slug, r.label_ar, r.label_en, r.review_status, r.source_label, r.is_demo_fixture,
                r.description_ar, r.mission_statement_ar, r.typical_responsibilities_ar, r.expected_outputs_ar,
                r.expected_from_junior_ar, r.not_expected_from_junior_ar,
                graduate_role_listed(r.id) as offered,
                exists (select 1 from pilot_content_load l where l.target_role_id = r.id) as is_pilot
           from target_role r
          where graduate_role_listed(r.id)
             or (graduate_role_visible(r.id) and exists (select 1 from career_goal g where g.user_id = $1 and g.is_current and g.target_role_id = r.id))
          order by graduate_role_listed(r.id) desc, is_demo_fixture, label_en`, [userId]);
      const ids = rows.map((r) => r.id);
      // Main skill areas: the role's graduate-visible, enabled requirements (names only; no class is implied).
      const skills = ids.length ? (await c.query(
        `select rr.target_role_id as role_id, s.label_ar from role_requirement rr join skill s on s.id = rr.skill_id
          where rr.target_role_id = any($1) and rr.enabled and s.status = 'active'
            and graduate_content_visible(rr.review_status, rr.is_demo_fixture) and graduate_content_visible(s.review_status, s.is_demo_fixture)
          order by rr.display_order nulls last, s.label_ar`, [ids])).rows : [];
      // Sources recorded for the role definition (provenance as recorded; never upgraded here).
      const sources = ids.length ? (await c.query(
        `select sr.entity_id as role_id, d.source_name, d.publisher, d.source_type::text as source_type, d.url, d.url_verified
           from source_ref sr join data_source d on d.id = sr.source_id
          where sr.entity_kind = 'target_role' and sr.entity_id = any($1) order by d.source_name`, [ids])).rows : [];
      const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
      return rows.map((r) => ({
        id: r.id, slug: r.slug, label_ar: r.label_ar, label_en: r.label_en, review_status: r.review_status, source_label: r.source_label,
        is_demo_fixture: r.is_demo_fixture, isDemo: r.is_demo_fixture === true, label: r.is_demo_fixture ? 'DEMO — not reviewed' : null,
        isPilot: r.is_pilot === true,
        /** false only for the graduate's own legacy goal that is no longer offered to new choices. */
        offered: r.offered === true,
        profile: {
          descriptionAr: r.description_ar ?? null,
          missionAr: r.mission_statement_ar ?? null,
          responsibilitiesAr: arr(r.typical_responsibilities_ar),
          outputsAr: arr(r.expected_outputs_ar),
          expectedFromJuniorAr: arr(r.expected_from_junior_ar),
          notExpectedFromJuniorAr: arr(r.not_expected_from_junior_ar),
          skillAreasAr: skills.filter((s) => s.role_id === r.id).map((s) => String(s.label_ar)),
          sources: sources.filter((s) => s.role_id === r.id).map((s) => ({
            name: String(s.source_name), publisher: s.publisher ?? null, type: String(s.source_type), url: s.url ?? null, urlVerified: s.url_verified === true,
          })),
          reviewed: r.review_status === 'published' && r.is_demo_fixture !== true,
        },
      }));
    });
  }

  async setCareerGoal(userId: string, targetRoleId: string, confirmed: boolean) {
    if (!confirmed) {
      // Onboarding step 3 is an explicit confirmation, not a dropdown change.
      throw new BadRequestException('a career goal must be explicitly confirmed');
    }
    return this.db.asService(async (c) => {
      // A4: only a role the graduate may see can become their goal; anything else is "unknown" (no existence leak).
      const role = await c.query(
        'select id, label_en, review_status from target_role where id = $1 and graduate_role_visible(id)', [targetRoleId],
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
                tr.label_en, tr.label_ar, tr.review_status, tr.is_demo_fixture, graduate_role_visible(tr.id) as role_available
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
        // A goal set earlier on a role that is no longer offered stays the user's history; nothing new starts from it.
        roleAvailable: r.role_available === true,
        isDemo: r.is_demo_fixture === true,
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
                    and e.withdrawn_at is null and e.evidence_role = 'primary') as evidence_count,
                sc.primary_evidence_id,
                sp.state_code as progress_state, st.label_ar as progress_label_ar, st.label_en as progress_label_en, sp.last_event_at as progress_at
           from skill_claim sc
           join skill sk on sk.id = sc.skill_id
           left join skill_progress sp on sp.user_id = sc.user_id and sp.skill_id = sc.skill_id
           left join skill_progress_state st on st.code = sp.state_code
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
        // Phase 2 (additive): the journey dimension beside the verification level. Null when no journey was recorded.
        progress: r.progress_state ? { state: r.progress_state, stateLabelAr: r.progress_label_ar, stateLabelEn: r.progress_label_en, lastEventAt: r.progress_at } : null,
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
        if (!/^[0-9a-f-]{36}$/i.test(input.activitySpecId)) throw new NotFoundException('unknown activity spec');
        // A1/A2: work starts only on an activity in the graduate's current-role catalogue — published (INV-7: a
        // draft would make the work unreproducible), visible, mapped to the role. Anything else, including a draft
        // or another role's activity whose id is known, is "unknown" (no existence leak).
        const spec = await c.query(
          `select a.id, a.version, a.status from activity_spec a
            where a.id = $1 and graduate_activity_in_catalogue(a.id, (select target_role_id from career_goal where user_id = $2 and is_current))`,
          [input.activitySpecId, userId],
        );
        if (spec.rowCount === 0) throw new NotFoundException('unknown activity spec');
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
      // Phase 2: a platform activity starts the journey of the skills it declares. No claim is touched.
      if (specId) {
        const linked = await c.query('select skill_id, depth from activity_skill where activity_spec_id = $1', [specId]);
        for (const l of linked.rows) {
          await this.progress.apply(c, { userId, skillId: l.skill_id, trigger: 'project.created', facts: { depth: l.depth, activity_spec_id: specId },
            eventRef: { table: 'project', id: rows[0].id }, reason: `project created on activity ${specVersion}`, actorKind: 'user' });
        }
      }
      return rows[0];
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
