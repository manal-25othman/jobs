-- ═══════════════════════════════════════════════════════════════════════════
-- Historical claimed-skill audit (PO decision 3 after ENG-1 P3). READ-ONLY.
--
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/audit-claimed-skills.sql
--
-- Runs inside a READ ONLY transaction that is rolled back: it cannot insert, update or
-- delete anything (PostgreSQL refuses any write in a read-only transaction). It reports
-- counts and opaque ids only — no names, emails, file contents or free text.
--
-- What it looks for, in claimed skills recorded before migration 0028 (when a client could
-- write `submission_claimed_skill` directly and the API alone checked the activity mapping):
--   C1  claim owner differs from the submission owner
--   C2  claimed skill is not an active canonical skill today (alias / retired)
--   C3  platform-activity claim outside the activity's skill mapping
--   C4  submission whose claims include more than one PRIMARY skill (ambiguous under ENG-1 P0)
--   C5  claim with no verification decision on an evaluated submission whose results record a decision for EVERY
--       claimed skill (ENG-1 P0 unattributed, or per-skill) — proxy for "added after evaluation" (claimed skills carry
--       no insertion timestamp). Attributed legacy results decide one skill by design and are not flagged.
--   C6  evidence on a claimed skill earned through the submission's evaluation with NO verification decision for
--       that (result, skill) — evidence whose provenance cannot be traced to a decision
-- Impact per class: evidence rows earned for the anomalous (submission, skill) through an
-- evaluation of that submission, how many still stand, and skill claims they are primary for.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
begin transaction isolation level repeatable read read only;

-- CREATE is refused in a read-only transaction, so every check is a CTE over the same base.
\pset footer off
\echo '== summary: one row per check (claims, submissions, users, evidence earned through the anomalous claim, still standing, skill claims resting on it)'
with cs as (
  select cs.submission_id, cs.skill_id, cs.user_id as claim_user, s.user_id as submission_user, p.activity_spec_id,
         k.status as skill_status,
         exists (select 1 from activity_skill a where a.activity_spec_id = p.activity_spec_id and a.skill_id = cs.skill_id) as mapped,
         exists (select 1 from activity_skill a where a.activity_spec_id = p.activity_spec_id and a.skill_id = cs.skill_id and a.depth = 'primary') as is_primary,
         exists (select 1 from evaluation e where e.submission_id = cs.submission_id) as evaluated,
         exists (select 1 from verification_decision d join evaluation_result r on r.id = d.evaluation_result_id
                  where r.submission_id = cs.submission_id and canonical_skill_id(d.skill_id) = canonical_skill_id(cs.skill_id)) as decided,
         exists (select 1 from audit_event a join evaluation_result r on r.id = a.subject_id
                  where a.subject_table = 'evaluation_result' and r.submission_id = cs.submission_id
                    and (a.payload->'attribution' ? 'unattributed' or a.payload->'attribution' ? 'perSkill')) as decides_every_claim,
         exists (select 1 from evaluation_result r join evidence e on e.evaluation_result_id = r.id
                  where r.submission_id = cs.submission_id and canonical_skill_id(e.skill_id) = canonical_skill_id(cs.skill_id)
                    and not exists (select 1 from verification_decision d where d.evaluation_result_id = r.id and canonical_skill_id(d.skill_id) = canonical_skill_id(cs.skill_id))) as undecided_evidence
    from submission_claimed_skill cs
    join submission s on s.id = cs.submission_id
    join project p on p.id = s.project_id
    join skill k on k.id = cs.skill_id
), primaries as (
  select submission_id from cs where is_primary group by submission_id having count(*) > 1
), flagged as (
  select 'C1 claim owner differs from submission owner' as check_name, submission_id, skill_id, claim_user as user_id from cs where claim_user <> submission_user
  union all select 'C2 claimed skill not active/canonical today', submission_id, skill_id, claim_user from cs where skill_status <> 'active'
  union all select 'C3 platform claim outside the activity mapping', submission_id, skill_id, claim_user from cs where activity_spec_id is not null and not mapped
  union all select 'C4 more than one primary skill claimed (ambiguous under P0)', submission_id, skill_id, claim_user from cs where submission_id in (select submission_id from primaries) and is_primary
  union all select 'C5 no decision for this claim although its result decides every claim (possible late claim)', submission_id, skill_id, claim_user from cs where evaluated and decides_every_claim and not decided
  union all select 'C6 evidence for this claim without a verification decision', submission_id, skill_id, claim_user from cs where undecided_evidence
), impact as (
  select f.check_name, f.submission_id, f.skill_id, f.user_id, e.id as evidence_id, e.withdrawn_at,
         (select count(*) from skill_claim sc where sc.primary_evidence_id = e.id) as claims_resting
    from flagged f
    left join evaluation_result r on r.submission_id = f.submission_id
    left join evidence e on e.evaluation_result_id = r.id and canonical_skill_id(e.skill_id) = canonical_skill_id(f.skill_id)
)
select c.check_name,
       (select count(*) from flagged f where f.check_name = c.check_name) as claims,
       (select count(distinct submission_id) from flagged f where f.check_name = c.check_name) as submissions,
       (select count(distinct user_id) from flagged f where f.check_name = c.check_name) as users,
       (select count(distinct evidence_id) from impact i where i.check_name = c.check_name) as evidence_earned,
       (select count(distinct evidence_id) from impact i where i.check_name = c.check_name and i.evidence_id is not null and i.withdrawn_at is null) as evidence_standing,
       (select coalesce(sum(claims_resting), 0) from (select distinct evidence_id, claims_resting from impact i where i.check_name = c.check_name and i.evidence_id is not null) z) as skill_claims_resting
  from (values ('C1 claim owner differs from submission owner'), ('C2 claimed skill not active/canonical today'), ('C3 platform claim outside the activity mapping'),
               ('C4 more than one primary skill claimed (ambiguous under P0)'), ('C5 no decision for this claim although its result decides every claim (possible late claim)'),
               ('C6 evidence for this claim without a verification decision')) c(check_name)
 order by 1;

\echo '== totals (context)'
select (select count(*) from submission_claimed_skill) as claimed_skills, (select count(distinct submission_id) from submission_claimed_skill) as submissions,
       (select count(*) from submission_claimed_skill cs join submission s on s.id = cs.submission_id where exists (select 1 from evaluation e where e.submission_id = s.id)) as on_evaluated_submissions;

\echo '== up to 20 sample (submission_id, skill_id) per check with evidence still standing (opaque ids only, for operator follow-up)'
with cs as (
  select cs.submission_id, cs.skill_id, cs.user_id as claim_user, s.user_id as submission_user, p.activity_spec_id, k.status as skill_status,
         exists (select 1 from activity_skill a where a.activity_spec_id = p.activity_spec_id and a.skill_id = cs.skill_id) as mapped
    from submission_claimed_skill cs join submission s on s.id = cs.submission_id join project p on p.id = s.project_id join skill k on k.id = cs.skill_id
)
select case when claim_user <> submission_user then 'C1' when skill_status <> 'active' then 'C2' else 'C3' end as check_id, cs.submission_id, cs.skill_id, e.id as evidence_id
  from cs join evaluation_result r on r.submission_id = cs.submission_id
  join evidence e on e.evaluation_result_id = r.id and canonical_skill_id(e.skill_id) = canonical_skill_id(cs.skill_id) and e.withdrawn_at is null
 where claim_user <> submission_user or skill_status <> 'active' or (cs.activity_spec_id is not null and not mapped)
 order by 1, 2 limit 20;

rollback;
