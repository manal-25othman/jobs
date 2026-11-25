-- ═══════════════════════════════════════════════════════════════════════════
-- 0039 — Phase B, package 3 (PO decisions 3 and 4): activity starter materials and the start rule.
--
-- 1. activity_input.material_required: whether an input is delivered to the graduate as a file. Declared by CONTENT.
--    Existing rows keep `false` (their historical behaviour: described only); the development pilot's inputs are
--    declared true below. Content created later states it explicitly.
-- 2. activity_material: a versioned, immutable, platform-owned file of an activity, for one AUDIENCE:
--      graduate — a starter package covering one or more of the activity's inputs;
--      reviewer — reference material (planted-defect explanations, reference solution), never shown to a graduate.
--    Service-only (no anon / authenticated access at all): delivery is through the API, by short-lived signed URLs,
--    to the project's owner (graduate materials) or to the assigned reviewer (reviewer materials).
--    Like starter checksums (0030), materials are content: added while the activity is draft / curated /
--    needs_revision / rejected, fixed from SME review on; never updated, never deleted.
-- 3. activity_materials_complete(activity): every material-required input is covered by a graduate material —
--    the rule that decides whether an activity can be STARTED (enforced again in the API and the domain).
-- Rollback: supabase/rollback/0039_activity_materials.down.sql.
-- ═══════════════════════════════════════════════════════════════════════════

alter table activity_input add column material_required boolean not null default false;
comment on column activity_input.material_required is
  'Phase B package 3: the input is delivered as a file (activity_material, audience graduate); an activity whose required inputs are not all covered cannot be started.';

-- The development pilot declares every input as delivered material (D-135 pilot rows only; nothing else changes).
update activity_input i set material_required = true
  where exists (select 1 from activity_spec a join pilot_content_load l on l.target_role_id = a.target_role_id where a.id = i.activity_spec_id);

create table activity_material (
  id               uuid primary key default gen_random_uuid(),
  activity_spec_id uuid not null references activity_spec(id) on delete restrict,
  audience         text not null check (audience in ('graduate', 'reviewer')),
  covers_input_keys text[] not null default '{}',
  file_name        text not null check (file_name ~ '^[A-Za-z0-9._-]{1,120}$'),
  content_type     text not null check (length(btrim(content_type)) > 0),
  bucket           text not null check (length(btrim(bucket)) > 0),
  object_path      text not null unique check (object_path !~ '(^/|\.\.)'),
  size_bytes       bigint not null check (size_bytes > 0),
  checksum_sha256  text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  material_version text not null check (length(btrim(material_version)) > 0),
  is_demo_fixture  boolean not null default false,
  created_by_label text not null check (length(btrim(created_by_label)) > 0),
  reason           text not null check (length(btrim(reason)) > 0),
  created_at       timestamptz not null default now(),
  unique (activity_spec_id, audience, file_name, material_version),
  constraint activity_material_reviewer_covers_nothing check (audience = 'graduate' or covers_input_keys = '{}'),
  constraint activity_material_graduate_covers_something check (audience = 'reviewer' or cardinality(covers_input_keys) > 0)
);
comment on table activity_material is
  'Phase B package 3: versioned, immutable platform files of an activity (graduate starter packages; reviewer-only references). Service-only; delivered by signed URL.';

create function activity_material_guard() returns trigger language plpgsql as $$
declare st text; k text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'activity materials are immutable: publish a new material version instead' using errcode = 'check_violation';
  end if;
  select status::text into st from activity_spec where id = new.activity_spec_id;
  if st not in ('draft', 'curated', 'needs_revision', 'rejected') then
    raise exception 'activity materials are content fixed from SME review on (activity is %)', st using errcode = 'check_violation';
  end if;
  foreach k in array new.covers_input_keys loop
    if not exists (select 1 from activity_input i where i.activity_spec_id = new.activity_spec_id and i.key = k) then
      raise exception 'a graduate material covers an input the activity does not declare (%)', k using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;
create trigger activity_material_guard_trg before insert or update or delete on activity_material
  for each row execute function activity_material_guard();

alter table activity_material enable row level security;
alter table activity_material force row level security;
revoke all on activity_material from anon, authenticated;
grant select, insert on activity_material to service_role;

-- The start rule: every material-required input is covered by at least one graduate material.
create function activity_materials_complete(p_activity uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from activity_input i
     where i.activity_spec_id = p_activity and i.material_required
       and not exists (select 1 from activity_material m
                        where m.activity_spec_id = p_activity and m.audience = 'graduate' and i.key = any(m.covers_input_keys)))
$$;
revoke all on function activity_materials_complete(uuid) from public, anon;
grant execute on function activity_materials_complete(uuid) to authenticated, service_role;

-- Starting an activity creates its project: the database refuses a project on an activity that cannot be started,
-- whatever path the insert takes. Existing projects (history) are untouched: the rule applies to new rows only.
create function project_activity_materials_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.activity_spec_id is not null and not activity_materials_complete(new.activity_spec_id) then
    raise exception '[starter_materials_missing] this activity cannot be started: its starter materials are not available yet'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger project_activity_materials_guard_trg before insert on project
  for each row execute function project_activity_materials_guard();
