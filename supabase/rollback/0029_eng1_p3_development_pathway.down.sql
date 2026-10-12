-- Rollback of 0029. Restores the P2 seal (per_skill ⇒ inactive). Refuses while any per_skill policy is not inactive:
-- deactivate it explicitly first (an audited configuration change). No data is touched.
do $$
begin
  if exists (select 1 from verification_policy where assessment_scope = 'per_skill' and activation <> 'inactive') then
    raise exception '0029 rollback refused: a per_skill policy is development_only; deactivate it first';
  end if;
end $$;
drop trigger if exists rubric_criterion_threshold_representable_trg on rubric_criterion;
drop function if exists rubric_criterion_threshold_representable();
drop trigger if exists verification_policy_per_skill_dev_guard_trg on verification_policy;
drop function if exists verification_policy_per_skill_dev_guard();
alter table verification_policy drop constraint if exists verification_policy_per_skill_development_only;
alter table verification_policy add constraint verification_policy_per_skill_sealed check (assessment_scope <> 'per_skill' or activation = 'inactive');
comment on column verification_policy.assessment_scope is
  'ENG-1: which skills a decision may move. primary_claimed_skill = the legacy path (one explicitly attributed skill, ENG-1 P0). per_skill = one decision per skill from its own criteria (P1 domain); SEALED inactive by verification_policy_per_skill_sealed until a separately approved migration.';
