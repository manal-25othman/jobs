import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { normalizeSelfAssessment, changedSelfAssessments, EXTRA_RATING_AR, SELF_ASSESSMENT_NOTICE_AR, SELF_ASSESSMENT_NOT_EVIDENCE_AR, SELF_ASSESSMENT_EXTRA_RATINGS } from '@naqla/domain';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';

/**
 * FR-U-013 / BR-001 — the graduate's self-assessment of the skills of their current role (journey S06).
 *
 * Read and written AS THE GRADUATE (row security, migration 0041): only their own rows, append-only. It never touches
 * a skill claim, evidence, a verification decision or readiness, and no public, share, report, CV or agent path
 * reads it. The scale is the default proficiency scale (data), plus «not tried» and «unsure».
 */
@Injectable()
export class SelfAssessmentService {
  constructor(private readonly db: DbService) {}

  private async scale(c: PoolClient) {
    const rows = (await c.query(`select l.level_key, l.label_ar, l.descriptor_ar from proficiency_level l join proficiency_scale s on s.id = l.scale_id
                                   where s.code = 'scale_default' order by l.ordinal`)).rows;
    return [...rows.map((r) => ({ key: String(r.level_key), labelAr: String(r.label_ar), descriptorAr: String(r.descriptor_ar) })),
      ...SELF_ASSESSMENT_EXTRA_RATINGS.map((k) => ({ key: k, labelAr: EXTRA_RATING_AR[k], descriptorAr: '' }))];
  }

  private async roleSkills(c: PoolClient, userId: string) {
    const goal = (await c.query(`select g.target_role_id, r.label_ar from career_goal g join target_role r on r.id = g.target_role_id where g.user_id = $1 and g.is_current`, [userId])).rows[0];
    if (!goal) return { role: null, skills: [] as { skillId: string; labelAr: string }[] };
    const skills = (await c.query(`select rr.skill_id, s.label_ar from role_requirement rr join skill s on s.id = rr.skill_id
        where rr.target_role_id = $1 and rr.enabled and s.status = 'active' order by rr.display_order nulls last, s.label_ar`, [goal.target_role_id])).rows;
    return { role: { id: String(goal.target_role_id), labelAr: String(goal.label_ar) }, skills: skills.map((r) => ({ skillId: String(r.skill_id), labelAr: String(r.label_ar) })) };
  }

  /** Latest rating per skill (own rows only), with the Arabic label. */
  async latest(userId: string): Promise<Map<string, { rating: string; ratingAr: string; note: string | null; at: string; count: number }>> {
    return this.db.asUser(userId, async (c) => {
      const scale = await this.scale(c);
      const rows = (await c.query(`select distinct on (skill_id) skill_id, rating, note, created_at, count(*) over (partition by skill_id) as n
                                     from skill_self_assessment where user_id = $1 order by skill_id, created_at desc, id desc`, [userId])).rows;
      return new Map(rows.map((r) => [String(r.skill_id), { rating: String(r.rating), ratingAr: scale.find((x) => x.key === r.rating)?.labelAr ?? String(r.rating), note: r.note ?? null, at: new Date(r.created_at).toISOString(), count: Number(r.n) }]));
    });
  }

  async view(userId: string) {
    const latest = await this.latest(userId);
    return this.db.asUser(userId, async (c) => {
      const { role, skills } = await this.roleSkills(c, userId);
      return { role, noticeAr: SELF_ASSESSMENT_NOTICE_AR, notEvidenceAr: SELF_ASSESSMENT_NOT_EVIDENCE_AR, confidence: 'observed' as const, scale: await this.scale(c),
        items: skills.map((s) => ({ ...s, latest: latest.get(s.skillId) ?? null })) };
    });
  }

  async save(userId: string, body: { items?: unknown }) {
    const before = await this.latest(userId);
    const recorded = await this.db.asUser(userId, async (c) => {
      const { role, skills } = await this.roleSkills(c, userId);
      if (!role) throw new ConflictException('[no_career_goal] اختاري هدفك المهني أولًا؛ التقييم الذاتي لمهارات دورك.');
      const scale = await this.scale(c);
      const items = normalizeSelfAssessment(body?.items, { skillIds: skills.map((s) => s.skillId), levelKeys: scale.filter((x) => !(SELF_ASSESSMENT_EXTRA_RATINGS as readonly string[]).includes(x.key)).map((x) => x.key) });
      const changed = changedSelfAssessments(items, new Map([...before].map(([k, v]) => [k, { rating: v.rating, note: v.note }])));
      for (const it of changed) {
        await c.query(`insert into skill_self_assessment (user_id, skill_id, target_role_id, rating, note) values ($1, $2, $3, $4, $5)`, [userId, it.skillId, role.id, it.rating, it.note]);
      }
      return changed.length;
    });
    if (recorded > 0) {
      await this.db.asService((c) => emitAuditEvent(c, { eventType: 'profile.skills_declared', userId, actorKind: 'user', actorId: userId, subjectTable: 'skill_self_assessment', subjectId: null,
        reason: 'the graduate recorded a self-assessment (Observed only; not evidence, no level change)', payload: { recorded } }));
    }
    return { recorded, ...(await this.view(userId)) };
  }

  /** One skill's latest self-assessment, for the skill page. */
  async forSkill(userId: string, skillId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(skillId)) throw new NotFoundException('skill not found');
    return (await this.latest(userId)).get(skillId) ?? null;
  }
}
