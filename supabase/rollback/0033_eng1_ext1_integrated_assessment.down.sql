-- Rollback of 0033. Refuses while any EXT-1 rule exists (history is never deleted by a rollback); restores the 0030 seal.
do $$
begin
  if exists (select 1 from readiness_rule where rule_type = 'integrated_assessment_passed') then
    raise exception '0033 rollback refused: integrated_assessment_passed rules exist (history is never deleted by a rollback)';
  end if;
end $$;
create or replace function readiness_rule_set_evidence_path_seal() returns trigger
  language plpgsql as $$
  begin
    if tg_op = 'INSERT' or not readiness_rule_set_has_evidence_path(new.id) then return new; end if;
    if new.review_status in ('approved', 'published') or new.activation in ('production_active', 'legacy_baseline') then
      raise exception 'ENG-1 P4: a readiness rule set with a skill_evidence_path (EXT-2) rule is sealed: it cannot be approved, published or production-activated before the P6 decision'
        using errcode = 'check_violation';
    end if;
    if new.activation = 'development_only' and old.activation is distinct from 'development_only' then
      if coalesce(current_setting('naqla.production', true), '') = 'on' then
        raise exception 'ENG-1 P4: an EXT-2 readiness rule set can never be activated in production' using errcode = 'insufficient_privilege';
      end if;
      if coalesce(current_setting('naqla.readiness_ext_dev_activation', true), '') <> 'on' then
        raise exception 'ENG-1 P4: an EXT-2 readiness rule set becomes development_only only with the explicit, transaction-local test opt-in naqla.readiness_ext_dev_activation = on'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
    return new;
  end $$;
create or replace function readiness_rule_evidence_path_seal() returns trigger
  language plpgsql as $$
  declare s record;
  begin
    if new.rule_type <> 'skill_evidence_path' then return new; end if;
    select review_status::text as review_status, activation into s from readiness_rule_set where id = new.rule_set_id;
    if s.review_status in ('approved', 'published') or s.activation <> 'inactive' then
      raise exception 'ENG-1 P4: a skill_evidence_path rule can be added only to an inactive, unapproved readiness rule set' using errcode = 'check_violation';
    end if;
    return new;
  end $$;
drop function if exists readiness_rule_set_has_sealed_rule(uuid);
alter table readiness_rule drop constraint if exists readiness_rule_integrated_has_no_skill;
alter table readiness_rule drop constraint readiness_rule_rule_type_check;
alter table readiness_rule add constraint readiness_rule_rule_type_check check (rule_type in (
  'required_skill_at_level', 'non_compensable_skill', 'min_skills_at_level', 'all_core_skills_at_level', 'all_skills_at_expected_level',
  'min_evidence_per_skill', 'skill_evidence_path'));
