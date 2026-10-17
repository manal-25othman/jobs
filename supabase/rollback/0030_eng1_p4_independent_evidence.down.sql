-- Rollback of 0030. Refuses while any skill_evidence_path rule or starter checksum exists, or while an activity carries
-- a variant family / task purpose (content would be lost). No data is touched otherwise.
do $$
begin
  if exists (select 1 from readiness_rule where rule_type = 'skill_evidence_path') then
    raise exception '0030 rollback refused: skill_evidence_path rules exist (history is never deleted by a rollback)';
  end if;
  if exists (select 1 from verification_decision where decision = 'evidence_corroborated') then
    raise exception '0030 rollback refused: corroborated decisions exist (history is never deleted by a rollback)';
  end if;
  if exists (select 1 from verification_policy where record_corroborating_evidence) then raise exception '0030 rollback refused: a policy enables corroborating evidence'; end if;
  if exists (select 1 from activity_starter_checksum) then raise exception '0030 rollback refused: starter checksums exist'; end if;
  if exists (select 1 from activity_spec where variant_family is not null or task_purpose is not null) then
    raise exception '0030 rollback refused: activities carry a variant family or task purpose';
  end if;
end $$;
drop trigger if exists readiness_rule_evidence_path_seal_trg on readiness_rule;
drop function if exists readiness_rule_evidence_path_seal();
drop trigger if exists readiness_rule_set_evidence_path_seal_trg on readiness_rule_set;
drop function if exists readiness_rule_set_evidence_path_seal();
drop function if exists readiness_rule_set_has_evidence_path(uuid);
alter table readiness_rule drop constraint if exists readiness_rule_evidence_path_has_skill;
alter table readiness_rule drop constraint readiness_rule_rule_type_check;
alter table readiness_rule add constraint readiness_rule_rule_type_check check (rule_type in (
  'required_skill_at_level', 'non_compensable_skill', 'min_skills_at_level', 'all_core_skills_at_level', 'all_skills_at_expected_level', 'min_evidence_per_skill'));
drop trigger if exists activity_starter_checksum_guard_trg on activity_starter_checksum;
drop function if exists activity_starter_checksum_guard();
drop table if exists activity_starter_checksum;
drop trigger if exists activity_spec_independence_fields_guard_trg on activity_spec;
drop function if exists activity_spec_independence_fields_guard();
alter table activity_spec drop constraint if exists activity_spec_task_purpose_agrees, drop constraint if exists activity_spec_task_purpose_check,
  drop constraint if exists activity_spec_variant_family_format, drop column if exists task_purpose, drop column if exists variant_family;
drop trigger if exists verification_decision_corroboration_trg on verification_decision;
drop function if exists verification_decision_corroboration_consistent();
alter table verification_decision drop constraint verification_decision_decision_check;
alter table verification_decision add constraint verification_decision_decision_check check (decision in (
  'accepted', 'downgraded', 'rejected', 'escalated_to_human', 'exception_granted', 'not_applicable', 'evidence_reestablished', 'assessment_pending_validation'));
alter table verification_policy drop constraint if exists verification_policy_corroboration_per_skill_only, drop column if exists record_corroborating_evidence;
