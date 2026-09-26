/**
 * Review commands: the only way a career-data record changes review state.
 * The domain judges the transition; the database trigger judges it again;
 * every decision lands in review_log with the person and the reason.
 */
import type { Pool } from 'pg';
import { assertReviewTransition, type ReviewState, type ReviewerRole } from '@naqla/domain';

const TABLE: Record<string, { table: string; status: string }> = {
  skill: { table: 'skill', status: 'review_status' }, target_role: { table: 'target_role', status: 'review_status' }, role_requirement: { table: 'role_requirement', status: 'review_status' },
  task: { table: 'task', status: 'review_status' }, activity_spec: { table: 'activity_spec', status: 'status' }, rubric_version: { table: 'rubric_version', status: 'status' },
  learning_resource: { table: 'learning_resource', status: 'review_status' }, career_presentation_rule: { table: 'career_presentation_rule', status: 'review_status' },
  data_source: { table: 'data_source', status: 'review_status' }, skill_family: { table: 'skill_family', status: 'review_status' }, recency_policy: { table: 'recency_policy', status: 'review_status' },
  proficiency_scale: { table: 'proficiency_scale', status: 'review_status' }, criterion_library: { table: 'criterion_library', status: 'review_status' }, skill_synonym: { table: 'skill_synonym', status: 'review_status' },
};

export interface ReviewCommand {
  readonly entityKind: string; readonly entityId: string; readonly to: ReviewState;
  readonly decidedBy: string | null; readonly decidedByLabel: string; readonly rolePerformed: ReviewerRole; readonly reason: string;
  readonly durationMinutes?: number | null; readonly conflictOfInterest?: boolean; readonly production: boolean;
}

export async function reviewTransition(pool: Pool, cmd: ReviewCommand): Promise<{ from: ReviewState; to: ReviewState }> {
  const t = TABLE[cmd.entityKind]; if (!t) throw new Error(`unknown entity kind '${cmd.entityKind}'`);
  const c = await pool.connect();
  try {
    await c.query('begin');
    const cur = await c.query(`select ${t.status} as status, is_demo_fixture, drafting_aid from ${t.table} where id = $1 for update`, [cmd.entityId]);
    if (cur.rowCount === 0) throw new Error(`${cmd.entityKind} ${cmd.entityId} not found`);
    const from = cur.rows[0].status as ReviewState;
    assertReviewTransition({ from, to: cmd.to, decidedBy: cmd.decidedBy, rolePerformed: cmd.rolePerformed, reason: cmd.reason,
      isDemoFixture: cur.rows[0].is_demo_fixture, draftingAid: cur.rows[0].drafting_aid, production: cmd.production });
    const setsReviewer = cmd.rolePerformed === 'sme';
    await c.query(`update ${t.table} set ${t.status} = $2${setsReviewer ? ', reviewed_by = $3, reviewed_at = now()' : ''}${t.table === 'activity_spec' && cmd.to === 'approved' ? ', sme_approved_by = $3, sme_approved_at = now()' : ''} where id = $1`,
      setsReviewer || (t.table === 'activity_spec' && cmd.to === 'approved') ? [cmd.entityId, cmd.to, cmd.decidedBy] : [cmd.entityId, cmd.to]);
    await c.query(`insert into review_log (entity_kind, entity_id, from_status, to_status, decided_by, decided_by_label, role_performed, reason, duration_minutes, conflict_of_interest)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [cmd.entityKind, cmd.entityId, from, cmd.to, cmd.decidedBy, cmd.decidedByLabel, cmd.rolePerformed, cmd.reason, cmd.durationMinutes ?? null, cmd.conflictOfInterest ?? false]);
    await c.query('commit');
    return { from, to: cmd.to };
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

/** Publishing a new version supersedes the previous published one of the same activity/rubric — explicit, logged. */
export async function supersedePrevious(pool: Pool, entityKind: 'activity_spec' | 'rubric_version', newId: string, by: string, production: boolean): Promise<string[]> {
  const t = TABLE[entityKind]!;
  const key = entityKind === 'activity_spec' ? 'slug' : 'activity_spec_id';
  const { rows } = await pool.query(`select id from ${t.table} where ${key} = (select ${key} from ${t.table} where id = $1) and id <> $1 and ${t.status} = 'published'`, [newId]);
  const done: string[] = [];
  for (const r of rows) { await reviewTransition(pool, { entityKind, entityId: r.id, to: 'superseded', decidedBy: null, decidedByLabel: by, rolePerformed: 'system', reason: `superseded by ${newId}`, production }); done.push(r.id); }
  return done;
}
