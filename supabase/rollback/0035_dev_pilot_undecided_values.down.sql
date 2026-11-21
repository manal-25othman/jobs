-- Rollback of 0035. Refuses while pilot data or an undecided weight exists (history is never deleted by a rollback).
do $$
begin
  if exists (select 1 from pilot_content_load) then
    raise exception '0035 rollback refused: development pilot loads exist (history is never deleted by a rollback)';
  end if;
  if exists (select 1 from rubric_criterion where weight is null) then
    raise exception '0035 rollback refused: a criterion weight is undecided (empty)';
  end if;
end $$;
drop table if exists pilot_content_load;
drop function if exists pilot_content_load_guard();
alter table rubric_version drop constraint if exists rubric_version_approved_threshold_has_value;
drop trigger if exists rubric_criterion_undecided_weight_guard_trg on rubric_criterion;
drop function if exists rubric_criterion_undecided_weight_guard();
alter table rubric_criterion drop constraint if exists rubric_criterion_weight_undecided_is_tbd;
alter table rubric_criterion alter column weight set not null;
