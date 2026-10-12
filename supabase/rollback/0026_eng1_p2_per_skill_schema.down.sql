-- Rollback of 0026 (ENG-1 P2). Restores the pre-0026 schema exactly.
-- Refuses while any per-skill record or reference exists: a rollback never deletes assessment history.
-- (While the pathway is sealed inactive there are none.)
do $$
begin
  if exists (select 1 from skill_assessment) or exists (select 1 from verification_decision where skill_assessment_id is not null)
     or exists (select 1 from evidence where skill_assessment_id is not null) or exists (select 1 from verification_policy where assessment_scope <> 'primary_claimed_skill') then
    raise exception 'rollback of 0026 refused: per-skill records or a per_skill policy exist; they are history and are never deleted by a rollback';
  end if;
end $$;

drop trigger if exists evidence_skill_assessment_guard_trg on evidence;
drop function if exists evidence_skill_assessment_guard();
drop index if exists evidence_one_platform_row_per_result_skill;
drop index if exists evidence_one_per_skill_assessment;
alter table evidence drop column if exists skill_assessment_id;

drop trigger if exists verification_decision_skill_assessment_trg on verification_decision;
drop function if exists verification_decision_skill_assessment_consistent();
drop index if exists verification_decision_one_per_skill_assessment;
alter table verification_decision drop column if exists skill_assessment_id;

drop table if exists skill_assessment_criterion;
drop table if exists skill_assessment;
drop function if exists skill_assessment_criterion_consistent();
drop function if exists skill_assessment_outcome_consistent();
drop function if exists skill_assessment_consistent();

alter table verification_policy drop constraint if exists verification_policy_per_skill_sealed;
alter table verification_policy drop constraint if exists verification_policy_scope_excludes_h6;
alter table verification_policy drop column if exists assessment_scope;
