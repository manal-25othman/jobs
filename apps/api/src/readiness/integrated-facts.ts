import type { PoolClient } from 'pg';
import { parseIntegratedAssessmentParams, type IntegratedAssessmentParams, type IntegratedCatalogVersion, type IntegratedResultFact, type ReadinessRuleSet } from '@naqla/domain';

/**
 * EXT-1 (`integrated_assessment_passed`) — the facts the rule reads, built from rows. READ-ONLY.
 * Every query is filtered by the explicit user id the service established; no client parameter selects whose facts are
 * read. Per-skill attribution comes from the result's own skill assessments and decisions, unmerged.
 */
export function integratedRules(set: ReadinessRuleSet | null): IntegratedAssessmentParams[] {
  return (set?.rules ?? []).filter((r) => r.enabled && r.type === 'integrated_assessment_passed').map((r) => parseIntegratedAssessmentParams(r.params, r.id));
}

export async function loadIntegratedFacts(c: PoolClient, userId: string, codes: readonly string[]): Promise<Record<string, { results: IntegratedResultFact[]; submissions: number }>> {
  const out: Record<string, { results: IntegratedResultFact[]; submissions: number }> = Object.fromEntries(codes.map((k) => [k, { results: [], submissions: 0 }]));
  if (codes.length === 0) return out;
  const subs = (await c.query(
    `select a.slug, count(distinct s.id)::int as n from submission s join project p on p.id = s.project_id join activity_spec a on a.id = p.activity_spec_id
      where s.user_id = $1 and a.slug = any($2::text[]) group by 1`, [userId, codes])).rows;
  for (const r of subs) out[r.slug]!.submissions = Number(r.n);
  const rows = (await c.query(
    `select r.id::text as result_id, r.submission_id::text as submission_id, r.evaluated_at, r.outcome::text as outcome,
            a.slug, a.version, a.status::text = 'published' as act_published, a.is_demo_fixture as act_demo,
            rv.version as rubric_version, coalesce(rv.status::text = 'published', false) as rub_published, coalesce(rv.is_demo_fixture, true) as rub_demo,
            rv.values_approved_at is not null as values_approved, rv.pass_threshold::float8 as pass_threshold, coalesce(rv.pass_threshold_status::text = 'approved', false) as threshold_approved,
            not exists (select 1 from evaluation_result n where n.supersedes_result_id = r.id) as final,
            (select count(*)::int from assessment asm join assessment_criterion_result acr on acr.assessment_id = asm.id
              where asm.evaluation_result_id = r.id and acr.status = 'pending_human') as pending,
            exists (select 1 from integrity_check ic where ic.evaluation_result_id = r.id and ic.passed = false) as integrity_failed,
            (select coalesce(jsonb_agg(jsonb_build_object('key', rc.key, 'kind', rc.criterion_kind::text, 'mandatory', rc.mandatory, 'status', acr.status,
                     'score', acr.score, 'max', coalesce(acr.max_score, rc.max_score)) order by rc.position, rc.key), '[]'::jsonb)
               from rubric_criterion rc
               left join lateral (select x.status, x.score, x.max_score from assessment asm join assessment_criterion_result x on x.assessment_id = asm.id
                                   where asm.evaluation_result_id = r.id and x.criterion_key = rc.key order by asm.created_at desc limit 1) acr on true
              where rc.rubric_version_id = r.rubric_version_id) as criteria,
            (select count(*)::int from evidence e where e.evaluation_result_id = r.id and e.user_id = r.user_id and e.withdrawn_at is null) as ev_standing,
            (select count(*)::int from evidence e where e.evaluation_result_id = r.id and e.user_id = r.user_id and e.withdrawn_at is not null) as ev_withdrawn,
            (select coalesce(jsonb_agg(jsonb_build_object('skillId', sa.skill_id::text, 'outcome', sa.outcome, 'decision', d.decision) order by sa.skill_id), '[]'::jsonb)
               from skill_assessment sa left join verification_decision d on d.skill_assessment_id = sa.id and d.human_override_of is null
              where sa.evaluation_result_id = r.id and sa.user_id = r.user_id) as per_skill,
            exists (select 1 from submission_claimed_skill cs join skill k on k.id = cs.skill_id
                     where cs.submission_id = r.submission_id
                       and (cs.user_id <> s.user_id or k.status <> 'active'
                            or not exists (select 1 from activity_skill ak where ak.activity_spec_id = p.activity_spec_id and ak.skill_id = cs.skill_id))) as anomaly
       from evaluation_result r
       join submission s on s.id = r.submission_id
       join project p on p.id = s.project_id
       join activity_spec a on a.id = p.activity_spec_id
       left join rubric_version rv on rv.id = r.rubric_version_id
      where s.user_id = $1 and r.user_id = $1 and a.slug = any($2::text[])`, [userId, codes])).rows;
  for (const r of rows) {
    out[r.slug]!.results.push({
      evaluationResultId: r.result_id, submissionId: r.submission_id, evaluatedAt: new Date(r.evaluated_at).toISOString(), activityCode: r.slug, activityVersion: r.version,
      rubricVersion: r.rubric_version ?? '', activityPublished: r.act_published === true, activityIsDemo: r.act_demo === true, rubricPublished: r.rub_published === true,
      rubricIsDemo: r.rub_demo === true, rubricValuesApproved: r.values_approved === true, resultFinal: r.final === true, evaluationOutcome: r.outcome,
      pendingHumanCriteria: Number(r.pending), integrityFailed: r.integrity_failed === true,
      criteria: (r.criteria as { key: string; kind: 'gate' | 'skill_evidence' | 'quality'; mandatory: boolean; status: string | null; score: number | string | null; max: number | string | null }[])
        .map((x) => ({ key: x.key, kind: x.kind, mandatory: x.mandatory === true, status: x.status ?? null, score: x.score === null ? null : Number(x.score), maxScore: x.max === null ? null : Number(x.max) })),
      passThreshold: r.pass_threshold === null ? null : Number(r.pass_threshold), passThresholdApproved: r.threshold_approved === true,
      evidenceStanding: Number(r.ev_standing), evidenceWithdrawn: Number(r.ev_withdrawn),
      perSkill: (r.per_skill as { skillId: string; outcome: string; decision: string | null }[]).map((x) => ({ skillId: x.skillId, outcome: x.outcome, decision: x.decision ?? null })),
      claimAnomaly: r.anomaly === true,
    });
  }
  return out;
}

/** The content an EXT-1 rule may name: every version of the activity with its rubrics (published, demo, values, binding, required criteria). */
export async function loadIntegratedCatalog(c: PoolClient, code: string): Promise<IntegratedCatalogVersion[]> {
  const rows = (await c.query(
    `select a.version, a.status::text = 'published' as published, a.is_demo_fixture,
            (select coalesce(jsonb_agg(jsonb_build_object('version', rv.version, 'published', rv.status::text = 'published', 'isDemo', rv.is_demo_fixture,
                     'valuesApproved', rv.values_approved_at is not null, 'bound', rv.activity_spec_version = a.version,
                     'required', (select count(*) from rubric_criterion rc where rc.rubric_version_id = rv.id and (rc.mandatory or rc.criterion_kind = 'gate')))), '[]'::jsonb)
               from rubric_version rv where rv.activity_spec_id = a.id) as rubrics
       from activity_spec a where a.slug = $1`, [code])).rows;
  return rows.map((r) => ({ activityVersion: r.version, activityPublished: r.published === true, activityIsDemo: r.is_demo_fixture === true,
    rubrics: (r.rubrics as { version: string; published: boolean; isDemo: boolean; valuesApproved: boolean; bound: boolean | null; required: number | string }[])
      .map((x) => ({ version: x.version, published: x.published === true, isDemo: x.isDemo === true, valuesApproved: x.valuesApproved === true, boundToActivityVersion: x.bound === true, gateOrMandatoryCriteria: Number(x.required) })) }));
}
