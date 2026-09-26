/**
 * Data quality rules (docs/data/DATA-QUALITY-RULES.md). Each rule returns the
 * offending rows; a FAIL rule with offenders fails the run. Loudly.
 */
import type { Pool, PoolClient } from 'pg';
import { isExactDuplicate, evidencePathStatus } from '@naqla/domain';

export interface QualityRule { readonly id: string; readonly title: string; readonly severity: 'fail' | 'warn'; run(c: PoolClient): Promise<string[]>; }
export interface QualityResult { readonly id: string; readonly title: string; readonly severity: 'fail' | 'warn'; readonly offenders: readonly string[]; readonly passed: boolean; }

const REVIEWED = [
  ['skill', 'review_status', 'slug'], ['target_role', 'review_status', 'slug'], ['role_requirement', 'review_status', 'id::text'], ['task', 'review_status', 'code'],
  ['activity_spec', 'status', "slug || '@' || version"], ['rubric_version', 'status', 'version'], ['learning_resource', 'review_status', "coalesce(code, id::text)"],
  ['career_presentation_rule', 'review_status', "asset_type::text || '@' || evidence_level::text"], ['data_source', 'review_status', 'code'],
  ['skill_family', 'review_status', 'code'], ['recency_policy', 'review_status', 'code'], ['proficiency_scale', 'review_status', 'code'], ['criterion_library', 'review_status', 'key'], ['skill_synonym', 'review_status', 'id::text'],
] as const;
const PROVENANCE = [
  ['skill', 'skill', 'slug'], ['target_role', 'target_role', 'slug'], ['role_requirement', 'role_requirement', 'id::text'], ['task', 'task', 'code'], ['activity_spec', 'activity_spec', "slug || '@' || version"],
  ['rubric_version', 'rubric_version', 'version'], ['rubric_criterion', 'rubric_criterion', "rubric_version_id::text || '/' || key"], ['learning_resource', 'learning_resource', "coalesce(code, id::text)"],
  ['career_presentation_rule', 'career_presentation_rule', "asset_type::text || '@' || evidence_level::text"], ['skill_family', 'skill_family', 'code'], ['recency_policy', 'recency_policy', 'code'],
  ['proficiency_scale', 'proficiency_scale', 'code'], ['criterion_library', 'criterion_library', 'key'],
] as const;

const q = (sql: string, map: (r: Record<string, unknown>) => string) => async (c: PoolClient) => (await c.query(sql)).rows.map(map);

export const QUALITY_RULES: readonly QualityRule[] = [
  { id: 'Q01', title: 'duplicate canonical skills (normalised name key, ar or en)', severity: 'fail',
    async run(c) { const { rows } = await c.query(`select slug, label_en, label_ar from skill where status = 'active'`); const out: string[] = [];
      for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (isExactDuplicate({ nameEn: rows[i].label_en, nameAr: rows[i].label_ar }, { nameEn: rows[j].label_en, nameAr: rows[j].label_ar })) out.push(`${rows[i].slug} ≡ ${rows[j].slug}`);
      return out; } },
  { id: 'Q02', title: 'broken role-skill refs (mapping to a deprecated or merged skill)', severity: 'fail',
    run: q(`select tr.slug as role, s.slug as skill, s.status from role_requirement rr join skill s on s.id = rr.skill_id join target_role tr on tr.id = rr.target_role_id where s.status <> 'active'`, (r) => `${r.role} → ${r.skill} (${r.status})`) },
  { id: 'Q03', title: 'skill without a source', severity: 'fail',
    run: q(`select slug from skill s where not exists (select 1 from source_ref r where r.entity_kind = 'skill' and r.entity_id = s.id)`, (r) => String(r.slug)) },
  { id: 'Q04', title: 'activity without a rubric (and published activity without a published rubric)', severity: 'fail',
    run: q(`select a.slug, a.version, a.status from activity_spec a where not exists (select 1 from rubric_version rv where rv.activity_spec_id = a.id)
              or (a.status = 'published' and not exists (select 1 from rubric_version rv where rv.activity_spec_id = a.id and rv.status = 'published'))`, (r) => `${r.slug}@${r.version} (${r.status})`) },
  { id: 'Q05', title: 'rubric criterion without a linked skill; published rubric with no criteria at all', severity: 'fail',
    run: q(`select 'criterion ' || rc.key as label from rubric_criterion rc where rc.linked_skill_id is null
            union all select 'rubric ' || rv.version from rubric_version rv where rv.status = 'published' and not exists (select 1 from rubric_criterion rc where rc.rubric_version_id = rv.id) and rv.criteria is null`, (r) => String(r.label)) },
  { id: 'Q06', title: 'core skill without an evidence path (no activity measures it through a linked criterion)', severity: 'fail',
    async run(c) { const { rows } = await c.query(`select tr.slug as role, s.slug as skill,
        (select count(distinct rv.activity_spec_id) from rubric_criterion rc join rubric_version rv on rv.id = rc.rubric_version_id join activity_spec a on a.id = rv.activity_spec_id
          where rc.linked_skill_id = rr.skill_id and a.target_role_id = rr.target_role_id and rv.status <> 'superseded')::int as activities
        from role_requirement rr join skill s on s.id = rr.skill_id join target_role tr on tr.id = rr.target_role_id where rr.is_core`);
      return rows.filter((r) => evidencePathStatus({ isCoreForRole: true, activitiesWithLinkedCriterion: Number(r.activities) }) === 'none').map((r) => `${r.role} → ${r.skill}`); } },
  { id: 'Q07', title: 'published content without SME approval (non-demo)', severity: 'fail',
    async run(c) { const out: string[] = [];
      for (const [t, col, label] of REVIEWED) { const { rows } = await c.query(`select ${label} as label from ${t} where ${col} = 'published' and is_demo_fixture = false and reviewed_by is null`); out.push(...rows.map((r) => `${t}: ${r.label}`)); }
      return out; } },
  { id: 'Q07b', title: 'DEMO content published (allowed only outside production; the API refuses to start with it in production)', severity: 'warn',
    async run(c) { const out: string[] = [];
      for (const [t, col, label] of REVIEWED) { const { rows } = await c.query(`select ${label} as label from ${t} where ${col} = 'published' and is_demo_fixture = true`); out.push(...rows.map((r) => `${t}: ${r.label}`)); }
      return out; } },
  { id: 'Q08', title: 'learning resource without a practice link, or more than 3 per skill', severity: 'fail',
    run: q(`select coalesce(code, id::text) as label from learning_resource where practice_activity_spec_id is null
            union all select 'skill ' || s.slug || ' has ' || count(*) || ' resources' from learning_resource lr join skill s on s.id = lr.skill_id group by s.slug having count(*) > 3`, (r) => String(r.label)) },
  { id: 'Q09', title: 'Verified-capable activity without an approved verification path (none exists in Phase 1)', severity: 'fail',
    run: q(`select slug || '@' || version as label from activity_spec where can_yield_verified = true`, (r) => String(r.label)) },
  { id: 'Q10', title: 'invalid synonym merges (merge target not active; mutual broader/narrower; equivalent form equal to another canonical name)', severity: 'fail',
    run: q(`select 'merge ' || s.slug || ' → ' || t.slug as label from skill s join skill t on t.id = s.merged_into_id where s.status = 'merged_into' and t.status <> 'active'
            union all select 'mutual ' || a.slug || ' ⇄ ' || b.slug from skill_synonym x join skill_synonym y on y.skill_id = x.related_skill_id and y.related_skill_id = x.skill_id
              join skill a on a.id = x.skill_id join skill b on b.id = x.related_skill_id where x.relation in ('broader','narrower') and y.relation = x.relation
            union all select 'equivalent "' || sy.surface_form || '" of ' || a.slug || ' is the canonical name of ' || b.slug from skill_synonym sy join skill a on a.id = sy.skill_id
              join skill b on b.id <> a.id and (lower(b.label_en) = lower(sy.surface_form) or b.label_ar = sy.surface_form) where sy.relation = 'equivalent'`, (r) => String(r.label)) },
  { id: 'Q11', title: 'missing provenance (a career-data record with no source_ref)', severity: 'fail',
    async run(c) { const out: string[] = [];
      for (const [kind, t, label] of PROVENANCE) { const { rows } = await c.query(`select ${label} as label from ${t} x where not exists (select 1 from source_ref r where r.entity_kind = '${kind}' and r.entity_id = x.id)`); out.push(...rows.map((r) => `${t}: ${r.label}`)); }
      const dangling = await c.query(`select entity_kind, entity_id from source_ref r where not exists (select 1 from data_source d where d.id = r.source_id)`); out.push(...dangling.rows.map((r) => `source_ref ${r.entity_kind}/${r.entity_id} → missing source`));
      for (const [kind, t] of PROVENANCE) { const { rows } = await c.query(`select entity_id from source_ref r where r.entity_kind = '${kind}' and not exists (select 1 from ${t} x where x.id = r.entity_id)`); out.push(...rows.map((r) => `source_ref ${kind}/${r.entity_id} → entity no longer exists (dangling provenance)`)); }
      return out; } },
  { id: 'Q12', title: 'AI-assisted content approved or published without a named reviewer', severity: 'fail',
    async run(c) { const out: string[] = [];
      for (const [t, col, label] of REVIEWED) { const { rows } = await c.query(`select ${label} as label from ${t} where drafting_aid = 'ai_assisted' and ${col} in ('approved','published') and reviewed_by is null and is_demo_fixture = false`); out.push(...rows.map((r) => `${t}: ${r.label}`)); }
      return out; } },
  { id: 'Q13', title: 'market signals ingested (none may exist in this phase)', severity: 'fail',
    run: q(`select 'data_source ' || code as label from data_source where source_type = 'market_signal' and review_status not in ('draft','curated')
            union all select 'raw_snapshot from market source ' || d.code from raw_snapshot r join data_source d on d.id = r.source_id where d.source_type = 'market_signal'
            union all select 'market_fact ' || id::text from market_fact
            union all select 'role_requirement with demand_ratio on ' || s.slug from role_requirement rr join skill s on s.id = rr.skill_id where rr.demand_ratio is not null`, (r) => String(r.label)) },
  { id: 'Q14', title: 'bilingual completeness (name/title in both languages)', severity: 'fail',
    run: q(`select 'skill ' || slug as label from skill where length(btrim(label_ar)) = 0 or length(btrim(label_en)) = 0
            union all select 'role ' || slug from target_role where length(btrim(label_ar)) = 0 or length(btrim(label_en)) = 0
            union all select 'task ' || code from task where length(btrim(title_ar)) = 0 or length(btrim(title_en)) = 0
            union all select 'activity ' || slug from activity_spec where title_en is null or length(btrim(title_en)) = 0`, (r) => String(r.label)) },
  { id: 'Q15', title: 'skill registry completeness (family, type, substitutability, recency policy, scale, indicators)', severity: 'fail',
    run: q(`select slug from skill where skill_family_id is null or skill_type is null or ai_substitutability is null or recency_policy_id is null or proficiency_scale_id is null
              or cardinality(observable_indicators_en) = 0 or cardinality(observable_indicators_ar) = 0`, (r) => String(r.slug)) },
  { id: 'Q16', title: 'presentation rules cover every asset type × evidence level (practiced, demonstrated, verified)', severity: 'fail',
    run: q(`select a.t || '@' || l.l as label from unnest(array['cv_bullet','linkedin_skill','linkedin_project','case_study','professional_profile']) a(t)
              cross join unnest(array['practiced','demonstrated','verified']) l(l)
              where not exists (select 1 from career_presentation_rule r where r.asset_type::text = a.t and r.evidence_level::text = l.l)`, (r) => String(r.label)) },
  { id: 'Q17', title: 'integrity check without a typed purpose (legacy rows)', severity: 'warn',
    run: q(`select a.slug || '/' || i.key as label from integrity_check_spec i join activity_spec a on a.id = i.activity_spec_id where i.check_type is null`, (r) => String(r.label)) },
  { id: 'Q18', title: 'role-skill mapping references a skill the role does not measure through any task or activity', severity: 'warn',
    run: q(`select tr.slug || ' → ' || s.slug as label from role_requirement rr join skill s on s.id = rr.skill_id join target_role tr on tr.id = rr.target_role_id
             where not exists (select 1 from activity_skill ak join activity_spec a on a.id = ak.activity_spec_id where a.target_role_id = rr.target_role_id and ak.skill_id = rr.skill_id)
               and not exists (select 1 from task_skill tk join task t on t.id = tk.task_id where t.target_role_id = rr.target_role_id and tk.skill_id = rr.skill_id)`, (r) => String(r.label)) },
];

export async function runQualityChecks(pool: Pool, rules: readonly QualityRule[] = QUALITY_RULES): Promise<{ results: QualityResult[]; failed: boolean }> {
  const c = await pool.connect();
  try {
    const results: QualityResult[] = [];
    for (const r of rules) { const offenders = await r.run(c); results.push({ id: r.id, title: r.title, severity: r.severity, offenders, passed: offenders.length === 0 }); }
    return { results, failed: results.some((r) => r.severity === 'fail' && !r.passed) };
  } finally { c.release(); }
}

/** Evidence-path status of every core skill of a role (for the report and the SME pack). */
export async function coreSkillEvidencePaths(pool: Pool, roleSlug: string): Promise<{ skill: string; activities: string[]; status: string; canYieldVerified: false }[]> {
  const { rows } = await pool.query(`select s.slug as skill, coalesce(array_agg(distinct a.slug) filter (where a.slug is not null), '{}') as activities
      from role_requirement rr join target_role tr on tr.id = rr.target_role_id join skill s on s.id = rr.skill_id
      left join rubric_criterion rc on rc.linked_skill_id = s.id
      left join rubric_version rv on rv.id = rc.rubric_version_id and rv.status <> 'superseded'
      left join activity_spec a on a.id = rv.activity_spec_id and a.target_role_id = tr.id
      where tr.slug = $1 and rr.is_core group by s.slug order by s.slug`, [roleSlug]);
  return rows.map((r) => ({ skill: r.skill, activities: r.activities, status: evidencePathStatus({ isCoreForRole: true, activitiesWithLinkedCriterion: r.activities.length }), canYieldVerified: false as const }));
}
