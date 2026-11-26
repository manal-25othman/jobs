-- Rollback of 0044. Refuses while a scenario has a code-review comment (content is never deleted by a rollback).
do $$
begin
  if exists (select 1 from manager_scenario where jsonb_array_length(scenario -> 'interventions') > 2) then
    raise exception '0044 rollback refused: scenarios with a code-review comment exist';
  end if;
end $$;
alter table manager_scenario drop constraint manager_scenario_scenario_check;
alter table manager_scenario add constraint manager_scenario_scenario_check check (
  jsonb_typeof(scenario) = 'object' and jsonb_typeof(scenario -> 'interventions') = 'array'
  and jsonb_array_length(scenario -> 'interventions') between 1 and 2);
drop function if exists manager_interventions_during_work(jsonb);
