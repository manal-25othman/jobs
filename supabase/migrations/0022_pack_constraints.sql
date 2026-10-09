-- ═══════════════════════════════════════════════════════════════════════════
-- 0022 · Phase 9 (H5) — configurable pack constraints
--
-- The profession-dependent NUMBERS of the pack validator become a governed,
-- versioned configuration: `pack_constraint_set` (+ `pack_constraint` rows of a
-- CLOSED type vocabulary). Same governance as every configuration table:
-- review_status + activation, config_activation_guard (production needs an
-- approved row; content frozen once active; every change in config_change),
-- four eyes, separation of duties at activation.
--
-- `legacy_pack_constraints@1` is the migration-created BASELINE holding exactly
-- the numbers validatePack hard-coded before Phase 9. It is not SME approved:
-- it is the pre-existing behaviour, so historical imports and production
-- validation behave as before. A track-specific or newer global set takes
-- effect only once approved by a named SME and activated by a product owner.
--
-- Technical, security and structural invariants stay in code and in the
-- schema (see docs/architecture/PHASE-9-PACK-CONSTRAINT-AUDIT.md).
-- ═══════════════════════════════════════════════════════════════════════════

create type pack_constraint_type as enum (
  'core_skill_count', 'task_count', 'activity_count', 'activity_primary_skill_count',
  'activity_core_primary_skill_count', 'rubric_min_criteria', 'resources_per_skill_max'
);
comment on type pack_constraint_type is 'Closed vocabulary (Phase 9). A new kind of rule is an explicit extension (migration + domain + register), never an interpreted string.';

create table pack_constraint_set (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  version            int not null check (version >= 1),
  track_id           text check (track_id is null or length(btrim(track_id)) > 0),   -- null = global (every track)
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
  drafted_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (key, version),
  constraint pack_constraint_set_baseline_shape check (activation <> 'legacy_baseline' or baseline_of is not null),
  constraint pack_constraint_set_four_eyes check (approved_by is null or drafted_by is null or approved_by <> drafted_by::text)
);
comment on table pack_constraint_set is 'Phase 9: governed numeric pack constraints (H5). legacy_pack_constraints@1 = the pre-Phase-9 validator numbers (baseline, not SME approved). Others are DRAFT until a named SME approves and a product owner activates.';
-- One active row per key AND scope: a track-specific version derived from the global baseline (same key) never displaces it.
create unique index pack_constraint_set_one_active_per_key_scope on pack_constraint_set(key, coalesce(track_id, '')) where activation <> 'inactive';
-- No two sets in effect at the same level for the same scope: a conflict is refused at activation, not discovered at import.
create unique index pack_constraint_set_one_per_scope_level on pack_constraint_set(coalesce(track_id, ''), activation) where activation <> 'inactive';
create trigger pack_constraint_set_touch before update on pack_constraint_set for each row execute function touch_updated_at();

create table pack_constraint (
  id              uuid primary key default gen_random_uuid(),
  set_id          uuid not null references pack_constraint_set(id) on delete cascade,
  constraint_type pack_constraint_type not null,
  min_value       int check (min_value is null or min_value >= 1),
  max_value       int check (max_value is null or max_value >= 1),
  note_en         text,
  unique (set_id, constraint_type),
  constraint pack_constraint_has_bound check (min_value is not null or max_value is not null),
  constraint pack_constraint_ordered check (min_value is null or max_value is null or min_value <= max_value)
);
comment on table pack_constraint is 'One numeric bound pair per constraint type. Floors (≥ 1) and ordering are structural invariants enforced here and in the domain.';
create or replace function pack_constraint_frozen_guard() returns trigger language plpgsql as $$
declare active_at timestamptz;
begin
  select activated_at into active_at from pack_constraint_set where id = coalesce(new.set_id, old.set_id);
  if active_at is not null then raise exception 'pack_constraint_set has been active; its constraints are immutable — create a new version'; end if;
  return coalesce(new, old);
end $$;

-- ───────────────────────────── baseline (migration-created) ─────────────────────────────
-- The activation guard refuses an INSERT carrying baseline_of: only a migration
-- creates a baseline, before the guard is attached; the activation is logged.
insert into pack_constraint_set (key, version, track_id, label_ar, label_en, description_en, activation, baseline_of, activated_at, validation_note_en, created_by)
values ('legacy_pack_constraints', 1, null, 'قيود الحزمة السابقة (أساس توافق)', 'Legacy pack constraints (compatibility baseline)',
        'LEGACY BASELINE — the numbers validatePack hard-coded before Phase 9: 4–5 core skills, 10–12 tasks, exactly 3 activities, 2–3 primary and 2–3 core primary skills per activity, at least 5 criteria per rubric, at most 3 learning resources per skill.',
        'legacy_baseline', 'apps/api/src/career-data/pack-schema.ts validatePack (pre-Phase 9)', now(),
        'LEGACY BASELINE — pre-existing behaviour, NOT SME validated. Pending expert validation of every number.', 'migration 0022');
insert into pack_constraint (set_id, constraint_type, min_value, max_value)
select s.id, v.t::pack_constraint_type, v.mn, v.mx from pack_constraint_set s, (values
  ('core_skill_count', 4, 5), ('task_count', 10, 12), ('activity_count', 3, 3), ('activity_primary_skill_count', 2, 3),
  ('activity_core_primary_skill_count', 2, 3), ('rubric_min_criteria', 5, null), ('resources_per_skill_max', null, 3)
) as v(t, mn, mx) where s.key = 'legacy_pack_constraints' and s.version = 1;
insert into config_change (entity_table, entity_id, field, old_value, new_value, actor, reason)
select 'pack_constraint_set', id, 'activation', null, 'legacy_baseline', 'migration 0022', 'baseline = the pre-Phase-9 hard-coded validator numbers' from pack_constraint_set where key = 'legacy_pack_constraints';

-- Attached after the baseline's own rows: from here on, a set that has been active is frozen (the baseline included).
create trigger pack_constraint_frozen before insert or update or delete on pack_constraint for each row execute function pack_constraint_frozen_guard();
create trigger pack_constraint_set_activation before insert or update on pack_constraint_set for each row execute function config_activation_guard();
create trigger pack_constraint_set_four_eyes before update on pack_constraint_set for each row execute function config_four_eyes_guard();
create trigger pack_constraint_set_separation before update on pack_constraint_set for each row execute function config_activation_separation_guard();

-- ───────────────────────────── which constraints validated which import ─────────────────────────────
create table pack_validation_run (
  id                 uuid primary key default gen_random_uuid(),
  pack_id            text not null,
  pack_version       text not null,
  track_id           text not null,
  constraint_set_id  uuid references pack_constraint_set(id) on delete restrict,
  constraint_ref     text,                -- key@version, or null when none was in effect (the run failed explicitly)
  resolution         text,
  passed             boolean not null,
  problems           jsonb not null default '[]',
  created_at         timestamptz not null default now()
);
comment on table pack_validation_run is 'Phase 9: append-only record of every (non-dry-run) pack validation — which constraint set@version it ran under and the outcome.';
create or replace function pack_validation_run_immutable() returns trigger language plpgsql as $$
begin raise exception 'pack_validation_run is append-only'; end $$;
create trigger pack_validation_run_immutable_trg before update or delete on pack_validation_run for each row execute function pack_validation_run_immutable();

alter table pack_constraint_set enable row level security; alter table pack_constraint_set force row level security;
alter table pack_constraint enable row level security; alter table pack_constraint force row level security;
alter table pack_validation_run enable row level security; alter table pack_validation_run force row level security;
grant select, insert, update on pack_constraint_set to service_role;
grant select, insert, update, delete on pack_constraint to service_role;
grant select, insert on pack_validation_run to service_role;
