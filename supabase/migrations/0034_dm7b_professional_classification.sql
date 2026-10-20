-- ═══════════════════════════════════════════════════════════════════════════
-- 0034 — DM-7b / P-3 (D-130): versioned PROFESSIONAL skill classification, and pack-constraint schema 2.
-- ADDITIVE, INACTIVE, DEVELOPMENT-ONLY.
--
-- 1. skill_classification_set / skill_classification: per role, a versioned Must / Core / Supporting classification
--    (taxonomy must_core_supporting@1) with per-skill provenance:
--      - source_kind 'sme' or 'po_default' (D-4: a PO default is never presented as an expert decision);
--      - born draft and inactive;
--      - approval needs a named SME, plus the Product Owner when any PO default is present (four eyes: never the
--        drafter); entries are fixed once approved;
--      - the ONLY activation state is development_only (explicit opt-in naqla.classification_dev_activation = on; never
--        with naqla.production = on). A production state does not exist until a separately authorized P6 migration.
--      - one in effect per role.
--    role_requirement.is_core is NOT touched, and no value is mirrored into it (D-2). Readers are version-aware.
-- 2. pack_constraint_set.schema_version (1 = every existing set, unchanged; 2 = the class-based vocabulary) and
--    pack_constraint_v2 (the schema-2 constraints). A separate table, not new values of the pack_constraint_type
--    enum: an enum value cannot be dropped, so that would be irreversible. Frozen-after-active applies to both
--    tables. Schema-2 sets can be at most development_only before P6. The one-set-per-scope-level index now
--    includes the schema, so a v2 track set never displaces the v1 baseline.
--
-- No row is created, approved or activated. Nothing existing is rewritten.
-- Rollback: supabase/rollback/0034_dm7b_professional_classification.down.sql (refuses while any classification or
-- schema-2 set exists).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────── 1. professional classification ───────────────────────────────
create table skill_classification_set (
  id              uuid primary key default gen_random_uuid(),
  key             text not null check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  version         int not null check (version >= 1),
  target_role_id  uuid not null references target_role(id) on delete restrict,
  taxonomy        text not null check (taxonomy = 'must_core_supporting@1'),
  label_ar        text not null check (length(btrim(label_ar)) > 0),
  label_en        text not null check (length(btrim(label_en)) > 0),
  description_en  text not null,
  review_status   text not null default 'draft' check (review_status in ('draft', 'approved')),
  sme_approved_by text,
  sme_approved_at timestamptz,
  po_approved_by  text,
  po_approved_at  timestamptz,
  activation      text not null default 'inactive' check (activation in ('inactive', 'development_only')),
  activated_at    timestamptz,
  activated_by    text,
  deactivated_at  timestamptz,
  created_by      text not null check (length(btrim(created_by)) > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (key, version),
  constraint skill_classification_set_approved_shape check (review_status <> 'approved' or (sme_approved_by is not null and sme_approved_at is not null)),
  constraint skill_classification_set_po_shape check ((po_approved_by is null) = (po_approved_at is null)),
  constraint skill_classification_set_four_eyes check ((sme_approved_by is null or sme_approved_by <> created_by) and (po_approved_by is null or po_approved_by <> created_by)),
  constraint skill_classification_set_active_is_approved check (activation = 'inactive' or review_status = 'approved')
);
comment on table skill_classification_set is
  'DM-7b / P-3: versioned professional skill classification of a role (Must / Core / Supporting). Authoritative for CATEGORIES only; '
  'levels and pass conditions belong to the readiness rule set (D-3). Development-only until P6; no production state exists.';
create unique index skill_classification_set_one_active_per_role on skill_classification_set(target_role_id) where activation <> 'inactive';
create trigger skill_classification_set_touch before update on skill_classification_set for each row execute function touch_updated_at();

create table skill_classification (
  set_id       uuid not null references skill_classification_set(id) on delete restrict,
  skill_id     uuid not null references skill(id) on delete restrict,
  class        text not null check (class in ('must', 'core', 'supporting')),
  source_kind  text not null check (source_kind in ('sme', 'po_default')),
  source_ref   text not null check (length(btrim(source_ref)) > 0),
  rationale_en text,
  primary key (set_id, skill_id)
);
comment on table skill_classification is
  'DM-7b / P-3: one class per (set, canonical skill) with its provenance. source_kind = po_default is a Product Owner default, never presented as an expert decision (D-4).';

create or replace function skill_classification_set_guard() returns trigger
  language plpgsql as $$
  declare production boolean := coalesce(current_setting('naqla.production', true), '') = 'on';
  begin
    if tg_op = 'INSERT' then
      if new.review_status <> 'draft' or new.activation <> 'inactive' or new.activated_at is not null or new.sme_approved_by is not null or new.po_approved_by is not null then
        raise exception 'a skill classification is born draft and inactive, with no approval' using errcode = 'check_violation';
      end if;
      return new;
    end if;
    -- Identity and content never change; a change is a new version.
    if new.key is distinct from old.key or new.version is distinct from old.version or new.target_role_id is distinct from old.target_role_id
       or new.taxonomy is distinct from old.taxonomy or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception 'a skill classification''s identity is immutable; create a new version' using errcode = 'check_violation';
    end if;
    if old.review_status = 'approved' and (new.review_status <> 'approved' or new.sme_approved_by is distinct from old.sme_approved_by or new.sme_approved_at is distinct from old.sme_approved_at
       or new.po_approved_by is distinct from old.po_approved_by or new.po_approved_at is distinct from old.po_approved_at) then
      raise exception 'an approved skill classification is final; create a new version' using errcode = 'check_violation';
    end if;
    if new.review_status = 'approved' and old.review_status = 'draft' then
      if not exists (select 1 from skill_classification where set_id = new.id) then
        raise exception 'an empty skill classification cannot be approved' using errcode = 'check_violation';
      end if;
      if exists (select 1 from skill_classification where set_id = new.id and source_kind = 'po_default') and new.po_approved_by is null then
        raise exception 'D-4: this classification carries Product Owner defaults; the Product Owner''s named approval is required in addition to the SME''s' using errcode = 'check_violation';
      end if;
    end if;
    if new.activation = 'development_only' and old.activation is distinct from 'development_only' then
      if production then
        raise exception 'a skill classification can never be activated in production (no production state exists before P6)' using errcode = 'insufficient_privilege';
      end if;
      if coalesce(current_setting('naqla.classification_dev_activation', true), '') <> 'on' then
        raise exception 'a skill classification becomes development_only only with the explicit, transaction-local opt-in naqla.classification_dev_activation = on'
          using errcode = 'insufficient_privilege';
      end if;
      new.activated_at := coalesce(old.activated_at, now());
      new.deactivated_at := null;
    end if;
    if new.activation = 'inactive' and old.activation = 'development_only' then new.deactivated_at := now(); end if;
    if old.activated_at is not null and new.activated_at is distinct from old.activated_at then
      raise exception 'activated_at is history' using errcode = 'check_violation';
    end if;
    return new;
  end $$;
create trigger skill_classification_set_guard_trg before insert or update on skill_classification_set
  for each row execute function skill_classification_set_guard();
create or replace function skill_classification_set_no_delete() returns trigger language plpgsql as $$
  begin raise exception 'a skill classification is history: it is never deleted (deactivate it, or create a new version)' using errcode = 'check_violation'; end $$;
create trigger skill_classification_set_no_delete_trg before delete on skill_classification_set for each row execute function skill_classification_set_no_delete();

create or replace function skill_classification_guard() returns trigger
  language plpgsql as $$
  declare s record; sid uuid := coalesce(new.set_id, old.set_id);
  begin
    select review_status, activated_at, target_role_id into s from skill_classification_set where id = sid;
    if s.review_status <> 'draft' or s.activated_at is not null then
      raise exception 'the entries of an approved or once-active skill classification are fixed; create a new version' using errcode = 'check_violation';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'UPDATE' and (new.set_id is distinct from old.set_id or new.skill_id is distinct from old.skill_id) then
      raise exception 'a classification entry''s set and skill are immutable' using errcode = 'check_violation';
    end if;
    if canonical_skill_id(new.skill_id) <> new.skill_id then
      raise exception 'classify the canonical skill (OPEN-039), not an alias' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from role_requirement rr where rr.target_role_id = s.target_role_id and canonical_skill_id(rr.skill_id) = new.skill_id) then
      raise exception 'only a skill the role requires (role_requirement) can be classified for it' using errcode = 'check_violation';
    end if;
    return new;
  end $$;
create trigger skill_classification_guard_trg before insert or update or delete on skill_classification
  for each row execute function skill_classification_guard();

-- The class in effect for (role, skill): approved, development_only, never in production. Null ⇒ use legacy is_core.
create or replace function role_professional_class(p_role uuid, p_skill uuid) returns text
  language sql stable as $$
    select c.class from skill_classification c join skill_classification_set s on s.id = c.set_id
     where s.target_role_id = p_role and s.activation = 'development_only' and s.review_status = 'approved'
       and c.skill_id = canonical_skill_id(p_skill)
       and coalesce(current_setting('naqla.production', true), '') <> 'on'
  $$;
comment on function role_professional_class(uuid, uuid) is 'DM-7b / P-3: Must/Core/Supporting in effect for the role, or null (legacy is_core applies). Never in production.';

alter table skill_classification_set enable row level security; alter table skill_classification_set force row level security;
alter table skill_classification enable row level security;     alter table skill_classification force row level security;
revoke all on skill_classification_set, skill_classification from anon, authenticated;
grant select on skill_classification_set, skill_classification to authenticated;
grant select, insert, update on skill_classification_set, skill_classification to service_role;
grant delete on skill_classification to service_role;   -- draft entries only (guarded)
create policy skill_classification_set_read_in_effect on skill_classification_set for select to authenticated
  using (activation = 'development_only' and review_status = 'approved' and coalesce(current_setting('naqla.production', true), '') <> 'on');
create policy skill_classification_read_in_effect on skill_classification for select to authenticated
  using (exists (select 1 from skill_classification_set s where s.id = set_id and s.activation = 'development_only' and s.review_status = 'approved'
                 and coalesce(current_setting('naqla.production', true), '') <> 'on'));

-- ─────────────────────────────── 2. pack-constraint schema 2 ───────────────────────────────
alter table pack_constraint_set
  add column schema_version int not null default 1 check (schema_version in (1, 2)),
  add constraint pack_constraint_set_schema2_development_only check (schema_version = 1 or activation in ('inactive', 'development_only'));
comment on column pack_constraint_set.schema_version is
  'DM-7b / P-3: 1 = the legacy is_core-based vocabulary (pack format 1; every pre-existing set); 2 = the class-based vocabulary (pack format 2). Immutable.';
drop index if exists pack_constraint_set_one_per_scope_level;
create unique index pack_constraint_set_one_per_scope_level on pack_constraint_set(coalesce(track_id, ''), activation, schema_version) where activation <> 'inactive';

create or replace function pack_constraint_set_schema_frozen() returns trigger language plpgsql as $$
  begin
    if new.schema_version is distinct from old.schema_version then raise exception 'a pack constraint set''s schema_version is immutable' using errcode = 'check_violation'; end if;
    return new;
  end $$;
create trigger pack_constraint_set_schema_frozen_trg before update on pack_constraint_set for each row execute function pack_constraint_set_schema_frozen();

create table pack_constraint_v2 (
  id              uuid primary key default gen_random_uuid(),
  set_id          uuid not null references pack_constraint_set(id) on delete cascade,
  constraint_type text not null check (constraint_type in ('must_skill_count', 'core_class_skill_count', 'supporting_skill_count', 'task_count', 'activity_count',
                                                          'activity_primary_skill_count', 'activity_required_primary_skill_count', 'rubric_min_criteria', 'resources_per_skill_max')),
  min_value       int check (min_value is null or min_value >= 0),
  max_value       int check (max_value is null or max_value >= 0),
  note_en         text,
  unique (set_id, constraint_type),
  constraint pack_constraint_v2_has_bound check (min_value is not null or max_value is not null),
  constraint pack_constraint_v2_ordered check (min_value is null or max_value is null or min_value <= max_value)
);
comment on table pack_constraint_v2 is 'DM-7b / P-3: schema-2 (class-based) pack constraints. Closed vocabulary; floors and completeness enforced in the domain; frozen once the set has been active.';
create trigger pack_constraint_v2_frozen before insert or update or delete on pack_constraint_v2 for each row execute function pack_constraint_frozen_guard();

create or replace function pack_constraint_schema_guard() returns trigger language plpgsql as $$
  declare v int;
  begin
    select schema_version into v from pack_constraint_set where id = new.set_id;
    if tg_table_name = 'pack_constraint' and v <> 1 then raise exception 'a schema-% set takes schema-2 constraints (pack_constraint_v2), not legacy ones', v using errcode = 'check_violation'; end if;
    if tg_table_name = 'pack_constraint_v2' and v <> 2 then raise exception 'a schema-% set takes legacy constraints (pack_constraint), not schema-2 ones', v using errcode = 'check_violation'; end if;
    return new;
  end $$;
create trigger pack_constraint_schema_guard_trg before insert or update on pack_constraint for each row execute function pack_constraint_schema_guard();
create trigger pack_constraint_v2_schema_guard_trg before insert or update on pack_constraint_v2 for each row execute function pack_constraint_schema_guard();

alter table pack_constraint_v2 enable row level security; alter table pack_constraint_v2 force row level security;
revoke all on pack_constraint_v2 from anon, authenticated;
grant select, insert, update, delete on pack_constraint_v2 to service_role;
