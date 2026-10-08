import type { PoolClient } from 'pg';
import type { DomainFacts } from '@naqla/agents';
import { canonicalEvidenceStates, type EvidenceState } from '@naqla/domain';

/**
 * The facts domain validation runs against, loaded from the database.
 *
 * D-076: a technology is "approved" only through an approved source. Here
 * those sources are the user's own declarations on projects and submissions
 * (project metadata / user-declared). Nothing is inferred from file contents.
 * The vocabulary itself is data: `technology_term`, seeded from track packs.
 */
export async function loadDomainFacts(c: PoolClient, userId: string): Promise<DomainFacts> {
  // OPEN-039: alias claims count for the canonical skill.
  const claims = await c.query('select canonical_skill_id(skill_id) as skill_id, state from skill_claim where user_id = $1', [userId]);
  const ev = await c.query('select id from evidence where user_id = $1 and withdrawn_at is null', [userId]);
  const approved = await c.query(
    `select distinct t from (
        select unnest(declared_technologies) as t from project where user_id = $1
        union all
        select unnest(declared_technologies) as t from submission where user_id = $1
     ) x`, [userId]);
  const known = await c.query('select term, aliases from technology_term');
  // Phase 7: technologies per piece of evidence (its project and that project's submissions), and the skill vocabulary.
  const byEvidence = await c.query(
    `select e.id, array_remove(array_agg(distinct t), null) as techs
       from evidence e
       left join lateral (
         select unnest(p.declared_technologies) as t from project p where p.id = e.project_id
         union all
         select unnest(s.declared_technologies) from submission s where s.project_id = e.project_id and s.user_id = e.user_id
       ) x on true
      where e.user_id = $1 and e.withdrawn_at is null group by e.id`, [userId]);
  // OPEN-039: an alias skill's labels count for its canonical skill (states are keyed by the canonical id).
  const skills = await c.query('select canonical_skill_id(id) as id, array_agg(label_en) || array_agg(label_ar) as labels from skill group by canonical_skill_id(id)');
  // Recorded numbers only: per evaluation result, the total, the maximum and
  // the count of fully met criteria. Nothing else is a number a wording may use.
  const scores = await c.query(
    `select sum(score)::text as total, sum(max_score)::text as max,
            count(*) filter (where score >= max_score)::text as met
       from evaluation_criterion_score s join evaluation_result r on r.id = s.evaluation_result_id
      where r.user_id = $1 group by r.id`, [userId]);
  const numericFacts = new Set<string>();
  for (const r of scores.rows) for (const v of [r.total, r.max, r.met]) numericFacts.add(String(Number(v)));
  return {
    skillStates: canonicalEvidenceStates([], claims.rows.map((r) => ({ skillId: String(r.skill_id), state: r.state as EvidenceState }))),
    existingEvidence: new Set<string>(ev.rows.map((r) => r.id)),
    approvedTechnologies: new Set<string>(approved.rows.map((r) => String(r.t))),
    approvedTechnologiesByEvidence: new Map(byEvidence.rows.map((r) => [String(r.id), new Set<string>((r.techs as string[]) ?? [])])),
    knownTechnologies: new Map<string, readonly string[]>(known.rows.map((r) => [String(r.term), (r.aliases as string[]) ?? []])),
    knownSkills: new Map<string, readonly string[]>(skills.rows.map((r) => [String(r.id), (r.labels as string[]) ?? []])),
    numericFacts,
  };
}

/** Approved technology sources for ONE piece of evidence (its project and that project's submissions). */
export async function approvedTechnologiesForEvidence(c: PoolClient, userId: string, evidenceId: string): Promise<string[]> {
  const { rows } = await c.query(
    `select distinct t from (
        select unnest(p.declared_technologies) as t from evidence e join project p on p.id = e.project_id where e.id = $1 and e.user_id = $2
        union all
        select unnest(s.declared_technologies) as t from evidence e join submission s on s.project_id = e.project_id and s.user_id = e.user_id where e.id = $1 and e.user_id = $2
     ) x order by t`, [evidenceId, userId]);
  return rows.map((r) => String(r.t));
}
