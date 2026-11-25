-- ═══════════════════════════════════════════════════════════════════════════
-- 0038 — Phase B, package 4: workspace drafts (SRS FR-U-025 «يجب أن يتتبع النظام التقدّم ويحفظ المسودات»).
--
-- One private draft per workspace (project): the written answers, the deliverable → upload references, the skills
-- the graduate selected and their work-method answers. A draft is the graduate's work in progress ONLY:
--   * it is never a submission, an artifact, an evidence item, evidence or a claim — nothing reads it but its owner
--     and the workspace; the submission is still built from what the graduate sends when they submit;
--   * a file reference names only the owner's own CONFIRMED submission upload (enforced here, not just in the API);
--   * it is removed when the work is submitted (same transaction) or with the project / the user (cascade).
-- Rollback: supabase/rollback/0038_workspace_drafts.down.sql.
-- ═══════════════════════════════════════════════════════════════════════════

create table project_draft (
  project_id  uuid primary key references project(id) on delete cascade,
  user_id     uuid not null references app_user(id) on delete cascade,
  texts       jsonb not null default '{}'::jsonb check (jsonb_typeof(texts) = 'object'),
  files       jsonb not null default '{}'::jsonb check (jsonb_typeof(files) = 'object'),
  skill_ids   jsonb not null default '[]'::jsonb check (jsonb_typeof(skill_ids) = 'array'),
  disclosure  jsonb not null default '{}'::jsonb check (jsonb_typeof(disclosure) = 'object'),
  revision    integer not null default 1 check (revision > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint project_draft_size check (octet_length(texts::text) + octet_length(disclosure::text) <= 200000)
);
comment on table project_draft is
  'FR-U-025: the graduate''s unsent work for one workspace. Never evidence, never a submission; private to its owner; cleared on submission.';

create function project_draft_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  if not exists (select 1 from project p where p.id = new.project_id and p.user_id = new.user_id and p.deleted_at is null) then
    raise exception 'a draft belongs to its own project''s owner' using errcode = 'insufficient_privilege';
  end if;
  for k, v in select * from jsonb_each(new.files) loop
    if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~* '^[0-9a-f-]{36}$' or not exists (
         select 1 from upload u where u.id = (v #>> '{}')::uuid and u.user_id = new.user_id and u.state = 'confirmed' and u.purpose = 'submission_file') then
      raise exception 'a draft file must be the owner''s own confirmed submission upload (%)', k using errcode = 'check_violation';
    end if;
  end loop;
  for k, v in select * from jsonb_each(new.texts) loop
    if jsonb_typeof(v) <> 'string' then raise exception 'a draft text must be a string (%)', k using errcode = 'check_violation'; end if;
  end loop;
  if tg_op = 'UPDATE' then
    new.revision := old.revision + 1; new.created_at := old.created_at;
    if new.user_id <> old.user_id or new.project_id <> old.project_id then
      raise exception 'a draft never changes owner or project' using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger project_draft_guard_trg before insert or update on project_draft for each row execute function project_draft_guard();

alter table project_draft enable row level security;
create policy project_draft_own on project_draft for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on project_draft from anon;
grant select, insert, update, delete on project_draft to authenticated;
grant all on project_draft to service_role;
