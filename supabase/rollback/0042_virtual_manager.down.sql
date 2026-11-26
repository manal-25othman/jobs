-- Rollback of 0042. Refuses while scenarios or conversation turns exist (content and user history are never deleted
-- by a rollback). The `virtual_manager` value of agent_type is left in place: Postgres cannot drop an enum value, and
-- the migration re-adds it with `if not exists`; it is refused below if any invocation used it.
do $$
begin
  if exists (select 1 from manager_turn) or exists (select 1 from manager_scenario) then
    raise exception '0042 rollback refused: virtual-manager scenarios or conversations exist';
  end if;
  if exists (select 1 from agent_invocation where agent_type::text = 'virtual_manager') then
    raise exception '0042 rollback refused: virtual-manager invocations exist';
  end if;
end $$;
drop table if exists manager_turn;
drop function if exists manager_turn_guard();
drop table if exists manager_scenario;
drop function if exists manager_scenario_guard();
