-- ═══════════════════════════════════════════════════════════════════════════
-- 0044 — A11 M3: one code-review comment from a "team member" after the submission (training on team feedback).
--   A scenario may now hold 1–3 interventions: one or two during the work (S11, enforced by the domain) and at most
--   one after the submission. Nothing else changes: still content an expert reviews, still not scored, still private.
-- ═══════════════════════════════════════════════════════════════════════════
create function manager_interventions_during_work(s jsonb) returns integer language sql immutable set search_path = public as $$
  select count(*)::integer from jsonb_array_elements(s -> 'interventions') i where i ->> 'trigger' is distinct from 'submission_received'
$$;
alter table manager_scenario drop constraint if exists manager_scenario_scenario_check;
alter table manager_scenario add constraint manager_scenario_scenario_check check (
  jsonb_typeof(scenario) = 'object' and jsonb_typeof(scenario -> 'interventions') = 'array'
  and jsonb_array_length(scenario -> 'interventions') between 1 and 3
  and manager_interventions_during_work(scenario) between 1 and 2);
