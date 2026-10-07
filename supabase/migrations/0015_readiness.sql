-- 0015 — Readiness Engine (Configurable Track Architecture, Phase 5).
--
-- Rule TYPES live in code (@naqla/domain READINESS_RULE_TYPES). Rule VALUES
-- live here, in versioned, governed rule sets (same activation model as 0014:
-- inactive / development_only / production_active; there is no legacy
-- baseline because no readiness rule existed before this migration).
--
-- NOTHING IS SEEDED. No "3 of 7", no "70%", no "all core": a rule set is
-- created by an audited act, stays DRAFT / NOT VALIDATED until a named expert
-- approves it, and only then can it be activated for production. Until an
-- active validated set exists, readiness is `not_yet_configured` /
-- `pending_validation` — never a guessed result.
--
-- Readiness never writes a claim: the engine reads verification levels, it
-- does not produce them.

create table readiness_rule_set (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  version            int not null check (version >= 1),
  target_role_id     uuid references target_role(id) on delete restrict,
  label_ar           text not null,
  label_en           text not null,
  description_en     text not null,
  review_status      review_state not null default 'draft',
  approved_by        text,
  approved_at        timestamptz,
  validation_note_en text not null default 'DRAFT / NOT VALIDATED — pending expert validation',
  activation         text not null default 'inactive',
  baseline_of        text,
  activated_at       timestamptz,
  deactivated_at     timestamptz,
  created_by         text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (key, version),
  -- There was no readiness behaviour before Phase 5: a readiness baseline cannot exist.
  constraint readiness_rule_set_no_baseline check (baseline_of is null and activation <> 'legacy_baseline')
);
comment on table readiness_rule_set is 'Versioned readiness rule values (Phase 5). Nothing seeded; no baseline possible. Draft until a named expert approves; production uses an explicitly activated approved set only.';
create unique index readiness_rule_set_one_active_per_scope on readiness_rule_set (coalesce(target_role_id, '00000000-0000-0000-0000-000000000000'::uuid), key) where activation <> 'inactive';
create trigger readiness_rule_set_touch before update on readiness_rule_set for each row execute function touch_updated_at();
create trigger readiness_rule_set_activation before insert or update on readiness_rule_set for each row execute function config_activation_guard();

create table readiness_rule (
  id           uuid primary key default gen_random_uuid(),
  rule_set_id  uuid not null references readiness_rule_set(id) on delete cascade,
  rule_type    text not null check (rule_type in ('required_skill_at_level','non_compensable_skill','min_skills_at_level','all_core_skills_at_level','all_skills_at_expected_level','min_evidence_per_skill')),
  params       jsonb not null default '{}'::jsonb,
  skill_id     uuid references skill(id) on delete restrict,
  label_ar     text not null,
  label_en     text not null,
  position     int not null default 0,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint readiness_rule_params_is_object check (jsonb_typeof(params) = 'object')
);
comment on table readiness_rule is 'One rule value row. The type is a code constant; every number in params is configuration, DRAFT until its set is approved.';
-- Rules of a set that has ever been active are frozen: a change is a new set version.
create or replace function readiness_rule_frozen_guard() returns trigger language plpgsql as $$
declare active_at timestamptz;
begin
  select activated_at into active_at from readiness_rule_set where id = coalesce(new.rule_set_id, old.rule_set_id);
  if active_at is not null then raise exception 'readiness_rule_set has been active; its rules are immutable — create a new version'; end if;
  return coalesce(new, old);
end $$;
create trigger readiness_rule_frozen before insert or update or delete on readiness_rule for each row execute function readiness_rule_frozen_guard();

-- A track configuration version may now name a readiness rule set (Phase 4 forbade it).
alter table track_config_version drop constraint track_config_no_readiness_rules_yet;
alter table track_config_version add constraint track_config_readiness_rule_set_fk foreign key (readiness_rule_set_id) references readiness_rule_set(id) on delete restrict;

-- Append-only history: every recorded readiness evaluation names the rule set and
-- configuration versions that produced it. A later rule change never rewrites it.
create table readiness_evaluation (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references app_user(id) on delete cascade,
  target_role_id           uuid not null references target_role(id) on delete restrict,
  track_config_version_id  uuid references track_config_version(id) on delete restrict,
  readiness_rule_set_id    uuid references readiness_rule_set(id) on delete restrict,
  rule_set_key             text,
  rule_set_version         int,
  rule_set_status          review_state,
  rule_set_resolution      text not null check (rule_set_resolution in ('production_active','development_only','not_yet_configured')),
  status                   text not null check (status in ('not_yet_configured','pending_validation','evaluated')),
  result                   jsonb not null,
  domain_ruleset_version   text not null,
  evaluated_at             timestamptz not null default now(),
  constraint readiness_evaluation_result_is_object check (jsonb_typeof(result) = 'object'),
  constraint readiness_evaluation_status_shape check (
    (status = 'not_yet_configured' and readiness_rule_set_id is null)
    or (status <> 'not_yet_configured' and readiness_rule_set_id is not null)
  )
);
comment on table readiness_evaluation is 'Recorded readiness snapshots (Phase 5), immutable, tied to the rule set and track configuration versions that produced them. Never a verification level.';
create index readiness_evaluation_user_idx on readiness_evaluation(user_id, evaluated_at desc);
create or replace function readiness_evaluation_immutable() returns trigger language plpgsql as $$
begin raise exception 'readiness_evaluation is append-only'; end $$;
create trigger readiness_evaluation_immutable_trg before update or delete on readiness_evaluation for each row execute function readiness_evaluation_immutable();

alter table readiness_rule_set    enable row level security; alter table readiness_rule_set    force row level security;
alter table readiness_rule        enable row level security; alter table readiness_rule        force row level security;
alter table readiness_evaluation  enable row level security; alter table readiness_evaluation  force row level security;
grant select on readiness_rule_set, readiness_rule to anon, authenticated;
grant select, insert, update, delete on readiness_rule_set, readiness_rule to service_role;
grant select, insert, update, delete on readiness_evaluation to authenticated, service_role;
create policy readiness_rule_set_read on readiness_rule_set for select to anon, authenticated using (true);
create policy readiness_rule_read on readiness_rule for select to anon, authenticated using (true);
-- The owner reads their recorded evaluations; only the engine writes them (service role).
create policy readiness_evaluation_select_own on readiness_evaluation for select to authenticated using (user_id = auth.uid());
