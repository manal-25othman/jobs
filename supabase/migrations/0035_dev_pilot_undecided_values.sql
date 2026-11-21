-- ═══════════════════════════════════════════════════════════════════════════
-- 0035 — Development-only graduate pilot (D-135): undecided expert values stay undecided in the database.
--
-- The Junior Frontend v2 candidate records every undecided expert value as empty + TBD (CR-14). The database could
-- hold an empty pass threshold and skill threshold already, but not an empty criterion weight. This migration:
--
-- 1. lets rubric_criterion.weight be EMPTY, and only as "undecided": empty ⇔ weight_status = 'TBD', only on a
--    DEMO-fixture rubric, and only written inside the development pilot loader's transaction
--    (naqla.pilot_content_load = on), never with naqla.production = on;
-- 2. states that an APPROVED pass threshold always has a value (NOT VALID: historical rows are not re-checked);
-- 3. adds pilot_content_load — an immutable, service-only ledger of each pilot load (what was written, from which
--    files, by whom, why). Inserting a ledger row needs the same opt-in and is refused in production.
--
-- Nothing else changes: no existing row is rewritten; the rule that a non-demo rubric publishes only with
-- SME-approved values (0008) is untouched; no content is created, published, approved or activated here.
-- Rollback: supabase/rollback/0035_dev_pilot_undecided_values.down.sql (refuses while pilot data exists).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────── 1. undecided criterion weight ─────────────────────────
alter table rubric_criterion alter column weight drop not null;
alter table rubric_criterion add constraint rubric_criterion_weight_undecided_is_tbd check (weight is not null or weight_status = 'TBD');
comment on constraint rubric_criterion_weight_undecided_is_tbd on rubric_criterion is
  'D-135: an empty weight means "not yet decided by the SME" (status TBD) — never a number in disguise.';

create function rubric_criterion_undecided_weight_guard() returns trigger
  language plpgsql as $$
  begin
    if new.weight is null and (tg_op = 'INSERT' or old.weight is not null) then
      if coalesce(current_setting('naqla.production', true), '') = 'on' then
        raise exception 'D-135: an undecided (empty) criterion weight is never written in production' using errcode = 'insufficient_privilege';
      end if;
      if coalesce(current_setting('naqla.pilot_content_load', true), '') <> 'on' then
        raise exception 'D-135: an undecided (empty) criterion weight is written only by the development pilot loader (naqla.pilot_content_load = on)'
          using errcode = 'insufficient_privilege';
      end if;
      if not coalesce((select is_demo_fixture from rubric_version where id = new.rubric_version_id), false) then
        raise exception 'D-135: an undecided (empty) criterion weight is allowed only on a DEMO-fixture rubric' using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end $$;
create trigger rubric_criterion_undecided_weight_guard_trg before insert or update of weight on rubric_criterion
  for each row execute function rubric_criterion_undecided_weight_guard();

-- ───────────────────────── 2. an approved value is a value ─────────────────────────
alter table rubric_version add constraint rubric_version_approved_threshold_has_value
  check (pass_threshold_status <> 'approved' or pass_threshold is not null) not valid;

-- ───────────────────────── 3. the pilot-load ledger ─────────────────────────
create table pilot_content_load (
  id              uuid primary key default gen_random_uuid(),
  pack_id         text not null,
  pack_version    text not null,
  target_role_id  uuid not null references target_role(id) on delete restrict,
  loaded_by_label text not null check (length(trim(loaded_by_label)) > 0),
  reason          text not null check (length(trim(reason)) > 0),
  files           jsonb not null,
  written         jsonb not null,
  loaded_at       timestamptz not null default now(),
  unique (pack_id, pack_version)
);
comment on table pilot_content_load is
  'D-135: development-only graduate pilot. One immutable row per loaded candidate version: the demo-fixture rows written, the source file hashes, who and why. Never in production.';

create function pilot_content_load_guard() returns trigger
  language plpgsql as $$
  begin
    if tg_op <> 'INSERT' then raise exception 'D-135: the pilot-load ledger is append-only'; end if;
    if coalesce(current_setting('naqla.production', true), '') = 'on' then
      raise exception 'D-135: pilot content is never loaded in production' using errcode = 'insufficient_privilege';
    end if;
    if coalesce(current_setting('naqla.pilot_content_load', true), '') <> 'on' then
      raise exception 'D-135: pilot content is loaded only with the explicit, transaction-local opt-in naqla.pilot_content_load = on'
        using errcode = 'insufficient_privilege';
    end if;
    if not coalesce((select is_demo_fixture from target_role where id = new.target_role_id), false) then
      raise exception 'D-135: a pilot role is always a DEMO fixture' using errcode = 'check_violation';
    end if;
    return new;
  end $$;
create trigger pilot_content_load_guard_trg before insert or update or delete on pilot_content_load
  for each row execute function pilot_content_load_guard();

alter table pilot_content_load enable row level security;
alter table pilot_content_load force row level security;
revoke all on pilot_content_load from public, anon, authenticated;
grant select, insert on pilot_content_load to service_role;
