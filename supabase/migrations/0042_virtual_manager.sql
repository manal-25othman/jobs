-- ═══════════════════════════════════════════════════════════════════════════
-- 0042 — A11 Virtual Manager, M1 (FR-U-026 / FR-A-002, journey S11).
--
--   * `virtual_manager` agent type: A11 keeps its own contract (FR-A-012), on the existing gateway.
--   * `manager_scenario`: an activity's authored interventions (content an expert reviews), insert-only and fixed once
--     the activity is reviewed. It carries private assessment design (never-reveal phrases), so it is SERVICE-ONLY.
--   * `manager_turn`: the conversation of one project — the manager's interventions and replies, the graduate's
--     messages. Append-only; readable by the project's owner; written by the service only (the cap is enforced
--     before a write). Replies are NOT scored in P1 (S11); nothing here touches an evaluation, evidence or a level.
-- ═══════════════════════════════════════════════════════════════════════════

alter type agent_type add value if not exists 'virtual_manager';

create table manager_scenario (
  id               uuid primary key default gen_random_uuid(),
  activity_spec_id uuid not null references activity_spec(id) on delete restrict,
  scenario_version text not null check (scenario_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  persona_ar       text not null check (length(btrim(persona_ar)) between 1 and 120),
  scenario         jsonb not null check (jsonb_typeof(scenario) = 'object' and jsonb_typeof(scenario -> 'interventions') = 'array'
                                         and jsonb_array_length(scenario -> 'interventions') between 1 and 2),
  review_status    review_state not null default 'draft',
  is_demo_fixture  boolean not null default false,
  created_by_label text not null check (length(btrim(created_by_label)) > 0),
  reason           text not null check (length(btrim(reason)) > 0),
  created_at       timestamptz not null default now(),
  unique (activity_spec_id, scenario_version)
);
comment on table manager_scenario is
  'A11 scenarios (FR-U-026). Contains never-reveal assessment design: service-only. Insert-only; added while the activity is draft/curated.';

create function manager_scenario_guard() returns trigger language plpgsql set search_path = public as $$
declare st text;
begin
  if tg_op <> 'INSERT' then raise exception '[manager_scenario_fixed] a scenario is versioned content: add a new version instead'; end if;
  select status::text into st from activity_spec where id = new.activity_spec_id;
  if st not in ('draft', 'curated', 'needs_revision', 'rejected') then
    raise exception '[manager_scenario_fixed] the activity is %; scenarios are content fixed from expert review on', st;
  end if;
  return new;
end $$;
create trigger manager_scenario_guard_ins before insert on manager_scenario for each row execute function manager_scenario_guard();
create trigger manager_scenario_guard_upd before update or delete on manager_scenario for each row when (pg_trigger_depth() = 0) execute function manager_scenario_guard();

alter table manager_scenario enable row level security;
alter table manager_scenario force row level security;
revoke all on manager_scenario from anon, authenticated;
grant all on manager_scenario to service_role;

create table manager_turn (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references project(id) on delete cascade,
  user_id          uuid not null references app_user(id) on delete cascade,
  scenario_id      uuid not null references manager_scenario(id) on delete restrict,
  intervention_key text not null check (intervention_key ~ '^[a-z][a-z0-9_]{1,30}$'),
  author           text not null check (author in ('manager', 'graduate')),
  kind             text not null check (kind in ('intervention', 'message', 'reply', 'refusal', 'no_detail', 'cap_reached', 'withheld')),
  body             text not null check (length(btrim(body)) between 1 and 2000),
  proposal_id      uuid references agent_proposal(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint manager_turn_author_kind check ((author = 'graduate') = (kind = 'message'))
);
create unique index manager_turn_one_intervention on manager_turn (project_id, intervention_key) where kind = 'intervention';
create index manager_turn_project on manager_turn (project_id, created_at);
comment on table manager_turn is 'A11 conversation per project (FR-U-026). Append-only; owner-readable; service-written; not scored in P1.';

create function manager_turn_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op <> 'INSERT' then raise exception '[manager_turn_append_only] a conversation turn is history'; end if;
  if not exists (select 1 from project p where p.id = new.project_id and p.user_id = new.user_id) then
    raise exception '[manager_turn_owner] a turn belongs to the owner of the project';
  end if;
  if not exists (select 1 from project p join manager_scenario s on s.activity_spec_id = p.activity_spec_id where p.id = new.project_id and s.id = new.scenario_id) then
    raise exception '[manager_turn_scenario] the scenario is not the scenario of this project''s activity';
  end if;
  return new;
end $$;
create trigger manager_turn_guard_ins before insert on manager_turn for each row execute function manager_turn_guard();
create trigger manager_turn_guard_upd before update or delete on manager_turn for each row when (pg_trigger_depth() = 0) execute function manager_turn_guard();

alter table manager_turn enable row level security;
alter table manager_turn force row level security;
revoke all on manager_turn from anon, authenticated;
grant select on manager_turn to authenticated;
grant all on manager_turn to service_role;
create policy manager_turn_own_read on manager_turn for select to authenticated using (user_id = auth.uid());
