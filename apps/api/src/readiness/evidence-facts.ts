import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  parseSkillEvidencePathParams, understandingKey,
  type EvidenceTaskFact, type PathCatalogActivity, type ReadinessRuleSet, type SkillEvidencePathParams, type TaskPurpose,
} from '@naqla/domain';

/**
 * ENG-1 P4 / EXT-2 — the facts the `skill_evidence_path` rule reads, built from rows. READ-ONLY.
 *
 * Every query is filtered by an explicit user id (the caller's own, established by the service); no client parameter
 * selects whose facts are read. Upload checksums and text hashes are compared in the pure domain function and never
 * returned to a client (the audit carries ids only).
 */

/** Text deliverables shorter than this (after normalization) are answers, not artifacts: they are not hashed for reuse. */
export const MIN_HASHED_TEXT = 40;

export function normalizedTextHash(text: string): string | null {
  const n = text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return n.length < MIN_HASHED_TEXT ? null : createHash('sha256').update(n).digest('hex');
}

export function evidencePathRules(set: ReadinessRuleSet | null): { skillId: string; params: SkillEvidencePathParams }[] {
  return (set?.rules ?? []).filter((r) => r.enabled && r.type === 'skill_evidence_path' && r.skillId)
    .map((r) => ({ skillId: r.skillId!, params: parseSkillEvidencePathParams(r.params, r.id) }));
}

/** Per-skill (P3+) and legacy task candidates for the given canonical skills of ONE user. */
export async function loadEvidenceTaskFacts(c: PoolClient, userId: string, skillIds: readonly string[]): Promise<Record<string, EvidenceTaskFact[]>> {
  const out: Record<string, EvidenceTaskFact[]> = Object.fromEntries(skillIds.map((s) => [s, [] as EvidenceTaskFact[]]));
  if (skillIds.length === 0) return out;

  const perSkill = (await c.query(
    `select sa.skill_id::text as skill_id, sa.id::text as sa_id, sa.claimed, sa.outcome, sa.basis_independently_verified,
            r.id::text as result_id, r.evaluated_at, r.submission_id::text as submission_id,
            not exists (select 1 from evaluation_result n where n.supersedes_result_id = r.id) as final,
            a.id::text as activity_id, a.slug, a.version, a.status::text = 'published' as act_published, a.is_demo_fixture as act_demo, a.variant_family, a.task_purpose,
            rv.is_demo_fixture as rub_demo, rv.values_approved_at is not null as values_approved,
            (select jsonb_object_agg(sc.criterion_key, sc.status) from skill_assessment_criterion sc where sc.skill_assessment_id = sa.id) as criteria,
            d.id::text as decision_id, d.decision, d.policy_status::text as policy_status,
            exists (select 1 from verification_decision o where o.human_override_of = d.id) as overridden,
            e.id::text as evidence_id, (e.withdrawn_at is null) as standing
       from skill_assessment sa
       join evaluation_result r on r.id = sa.evaluation_result_id
       join activity_spec a on a.id = sa.activity_spec_id
       join rubric_version rv on rv.id = sa.rubric_version_id
       left join verification_decision d on d.skill_assessment_id = sa.id and d.human_override_of is null
       left join evidence e on e.skill_assessment_id = sa.id and e.user_id = sa.user_id
      where sa.user_id = $1 and sa.skill_id = any($2::uuid[])`, [userId, skillIds])).rows;

  const legacy = (await c.query(
    `select canonical_skill_id(d.skill_id)::text as skill_id, r.id::text as result_id, r.evaluated_at, r.submission_id::text as submission_id,
            not exists (select 1 from evaluation_result n where n.supersedes_result_id = r.id) as final,
            a.id::text as activity_id, a.slug, a.version, a.status::text = 'published' as act_published, a.is_demo_fixture as act_demo, a.variant_family, a.task_purpose,
            coalesce(rv.is_demo_fixture, true) as rub_demo, rv.values_approved_at is not null as values_approved,
            d.id::text as decision_id, d.decision, d.policy_status::text as policy_status,
            exists (select 1 from verification_decision o where o.human_override_of = d.id) as overridden,
            e.id::text as evidence_id, (e.withdrawn_at is null) as standing,
            (select ev.payload->'attribution'->>'skillId' from audit_event ev where ev.subject_table = 'evaluation_result' and ev.subject_id = r.id order by ev.occurred_at desc limit 1) as attributed_skill,
            (select ev.payload ? 'attribution' from audit_event ev where ev.subject_table = 'evaluation_result' and ev.subject_id = r.id order by ev.occurred_at desc limit 1) as has_attribution,
            (select array_agg(distinct canonical_skill_id(cs.skill_id)::text) from submission_claimed_skill cs join activity_skill ak on ak.skill_id = cs.skill_id and ak.depth = 'primary'
              where cs.submission_id = r.submission_id and ak.activity_spec_id = p.activity_spec_id) as claimed_primaries,
            (select jsonb_object_agg(acr.criterion_key, acr.status) from assessment asm join assessment_criterion_result acr on acr.assessment_id = asm.id
              where asm.evaluation_result_id = r.id and acr.skill_id is not null and canonical_skill_id(acr.skill_id) = canonical_skill_id(d.skill_id)) as criteria
       from verification_decision d
       join evaluation_result r on r.id = d.evaluation_result_id
       join submission s on s.id = r.submission_id
       join project p on p.id = s.project_id
       join activity_spec a on a.id = p.activity_spec_id
       left join rubric_version rv on rv.id = r.rubric_version_id
       left join evidence e on e.id = d.evidence_id and e.user_id = d.user_id
      where d.user_id = $1 and d.skill_assessment_id is null and d.human_override_of is null
        and canonical_skill_id(d.skill_id) = any($2::uuid[])`, [userId, skillIds])).rows;

  const submissions = [...new Set([...perSkill, ...legacy].map((r) => r.submission_id as string))];
  const activities = [...new Set([...perSkill, ...legacy].map((r) => r.activity_id as string))];
  const uploads = submissions.length ? (await c.query(
    `select sa.submission_id::text as submission_id, array_agg(distinct u.checksum_sha256) filter (where u.checksum_sha256 is not null) as checksums
       from submission_artifact sa join upload u on u.id = sa.upload_id and u.user_id = sa.user_id
      where sa.submission_id = any($1::uuid[]) and sa.user_id = $2 group by 1`, [submissions, userId])).rows : [];
  const texts = submissions.length ? (await c.query(
    `select submission_id::text as submission_id, value_text from submission_artifact where submission_id = any($1::uuid[]) and user_id = $2 and kind = 'text' and value_text is not null`,
    [submissions, userId])).rows : [];
  const starters = activities.length ? (await c.query(
    `select activity_spec_id::text as activity_id, array_agg(checksum_sha256) as checksums from activity_starter_checksum where activity_spec_id = any($1::uuid[]) group by 1`, [activities])).rows : [];
  // Audit anomaly classes C1–C3 for the claim behind each (submission, skill): wrong owner, non-canonical skill, outside the mapping.
  const anomalies = submissions.length ? (await c.query(
    `select cs.submission_id::text as submission_id, canonical_skill_id(cs.skill_id)::text as skill_id
       from submission_claimed_skill cs join submission s on s.id = cs.submission_id join project p on p.id = s.project_id join skill k on k.id = cs.skill_id
      where cs.submission_id = any($1::uuid[])
        and (cs.user_id <> s.user_id or k.status <> 'active'
             or (p.activity_spec_id is not null and not exists (select 1 from activity_skill ak where ak.activity_spec_id = p.activity_spec_id and ak.skill_id = cs.skill_id)))`,
    [submissions])).rows : [];

  const uploadsOf = (sid: string) => (uploads.find((u) => u.submission_id === sid)?.checksums as string[] | null) ?? [];
  const textsOf = (sid: string) => [...new Set(texts.filter((t) => t.submission_id === sid).map((t) => normalizedTextHash(String(t.value_text))).filter((h): h is string => h !== null))];
  const startersOf = (aid: string) => (starters.find((x) => x.activity_id === aid)?.checksums as string[] | null) ?? [];
  const anomalous = (sid: string, skill: string) => anomalies.some((x) => x.submission_id === sid && x.skill_id === skill);
  const validated = (status: string | null) => status === 'approved' || status === 'published';
  const common = (r: Record<string, unknown>) => ({
    evaluationResultId: r['result_id'] as string, evaluatedAt: new Date(r['evaluated_at'] as string).toISOString(), activitySpecId: r['activity_id'] as string,
    activityCode: r['slug'] as string, activityVersion: r['version'] as string, activityPublished: r['act_published'] === true, activityIsDemo: r['act_demo'] === true,
    rubricIsDemo: r['rub_demo'] === true, rubricValuesApproved: r['values_approved'] === true, variantFamily: (r['variant_family'] as string | null) ?? null,
    taskPurpose: (r['task_purpose'] as TaskPurpose | null) ?? null, resultFinal: r['final'] === true,
    decision: r['decision_id'] ? { id: r['decision_id'] as string, decision: r['decision'] as string, overridden: r['overridden'] === true, policyValidated: validated(r['policy_status'] as string | null) } : null,
    evidence: r['evidence_id'] ? { id: r['evidence_id'] as string, standing: r['standing'] === true } : null,
    claimAnomaly: anomalous(r['submission_id'] as string, r['skill_id'] as string),
    uploadChecksums: uploadsOf(r['submission_id'] as string), textHashes: textsOf(r['submission_id'] as string), starterChecksums: startersOf(r['activity_id'] as string),
  });
  for (const r of perSkill) {
    out[r.skill_id]?.push({ ...common(r), source: 'per_skill', claimed: r.claimed === true, outcome: r.outcome, basisIndependentlyVerified: r.basis_independently_verified === true,
      criteria: (r.criteria as Record<string, string> | null) ?? {}, legacyAttribution: null, skillAssessmentId: r.sa_id });
  }
  for (const r of legacy) {
    // ENG-1 P0 audit payload names the attributed skill; before P0 (no attribution recorded) only an unambiguous single primary claim is attributable.
    const attributed = r.attributed_skill === r.skill_id
      || (r.has_attribution !== true && Array.isArray(r.claimed_primaries) && r.claimed_primaries.length === 1 && r.claimed_primaries[0] === r.skill_id);
    out[r.skill_id]?.push({ ...common(r), source: 'legacy', claimed: true, outcome: null, basisIndependentlyVerified: null, criteria: (r.criteria as Record<string, string> | null) ?? {},
      legacyAttribution: attributed ? 'attributed' : 'unverifiable', skillAssessmentId: null });
  }
  return out;
}

/**
 * The integrated code-understanding element: met when a final, non-demo, values-approved evaluation of the source activity
 * (allowed versions) has every source criterion met; false when such evaluations exist but none meets it; null when the
 * learner has none (never assessed ⇒ indeterminate).
 */
export async function loadUnderstanding(c: PoolClient, userId: string, sources: readonly NonNullable<SkillEvidencePathParams['understanding_source']>[]): Promise<Record<string, boolean | null>> {
  const out: Record<string, boolean | null> = {};
  for (const src of sources) {
    const rows = (await c.query(
      `select r.id, (select count(*) filter (where acr.status = 'met') = $4::int and count(*) = $4::int
                       from assessment asm join assessment_criterion_result acr on acr.assessment_id = asm.id
                      where asm.evaluation_result_id = r.id and acr.criterion_key = any($3::text[])) as all_met
         from evaluation_result r join submission s on s.id = r.submission_id join project p on p.id = s.project_id
         join activity_spec a on a.id = p.activity_spec_id join rubric_version rv on rv.id = r.rubric_version_id
        where s.user_id = $1 and a.slug = $2 and a.status = 'published' and not a.is_demo_fixture and not rv.is_demo_fixture and rv.values_approved_at is not null
          and ($5::text[] is null or a.version = any($5::text[]))
          and not exists (select 1 from evaluation_result n where n.supersedes_result_id = r.id)`,
      [userId, src.activity, src.criteria, src.criteria.length, src.versions === '*' ? null : src.versions])).rows;
    out[understandingKey(src)] = rows.length === 0 ? null : rows.some((x) => x.all_met === true);
  }
  return out;
}

/** Published-content catalog for rule-set validation: each version of the named activities, with its published rubric's criteria. */
export async function loadPathCatalog(c: PoolClient, codes: readonly string[]): Promise<PathCatalogActivity[]> {
  if (codes.length === 0) return [];
  const rows = (await c.query(
    `select a.id, a.slug, a.version, a.status::text = 'published' as published, a.is_demo_fixture,
            (select jsonb_agg(jsonb_build_object('key', rc.key, 'kind', rc.criterion_kind::text, 'skill', case when rc.linked_skill_id is null then null else canonical_skill_id(rc.linked_skill_id)::text end))
               from rubric_version rv join rubric_criterion rc on rc.rubric_version_id = rv.id
              where rv.activity_spec_id = a.id and rv.status = 'published' and (rv.activity_spec_version is null or rv.activity_spec_version = a.version)) as criteria
       from activity_spec a where a.slug = any($1::text[])`, [codes])).rows;
  return rows.map((r) => ({ code: r.slug, version: r.version, published: r.published === true, isDemo: r.is_demo_fixture === true,
    criteria: ((r.criteria as { key: string; kind: string; skill: string | null }[] | null) ?? []).map((x) => ({ key: x.key, kind: x.kind, canonicalSkillId: x.skill })) }));
}
