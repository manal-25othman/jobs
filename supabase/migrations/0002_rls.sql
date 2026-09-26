-- ═══════════════════════════════════════════════════════════════════════════
-- NAQLA — row level security
--
-- Default is DENY. RLS is enabled on every table before any feature exists, so
-- no table is ever reachable "temporarily" while a policy is written later.
--
-- Three principals:
--   anon           — an unauthenticated visitor. Sees published content only,
--                    and only through an explicit, unrevoked path.
--   authenticated  — a signed-in user. Sees their own rows, full stop.
--   service_role   — the API. BYPASSES RLS by design, so every service-role
--                    path must do its own authorisation. It is never given to
--                    the browser.
--
-- The anon key is public. It is only safe because of what is below. Disabling
-- RLS on one table turns that public key into a data leak.
-- ═══════════════════════════════════════════════════════════════════════════

-- Supabase provides these roles. Created here only when absent, so the same
-- migration runs on a plain PostgreSQL cluster for testing.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;

-- In Supabase auth.uid() exists. Defined here so the schema runs and can be
-- tested on a plain PostgreSQL cluster too.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
    create function auth.uid() returns uuid
      language sql stable as $fn$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $fn$;
    create function auth.role() returns text
      language sql stable as $fn$
        select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
      $fn$;
  end if;
end $$;

-- ───────────────────── enable RLS everywhere, no exceptions ────────────────

do $$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end $$;

-- ═══════════════════ 1. rows the user owns directly ════════════════════════
-- Pattern: a user_id column that must equal auth.uid().

do $$
declare t text;
begin
  foreach t in array array[
    'app_user','career_goal','project','work_item','submission','submission_file',
    'ai_disclosure','evaluation','professional_asset','cv_version','readiness_score',
    'cv_assessment','linkedin_assessment','case_study','recruiter_report',
    'public_profile','share_link','consent','learning_gap','practice_activity',
    'notification','skill_claim','evidence','evidence_transition','evaluation_result'
  ]
  loop
    -- app_user keys on id, everything else on user_id.
    if t = 'app_user' then
      execute format($p$
        create policy %1$I_select_own on public.%1$I
          for select to authenticated using (id = auth.uid() and deleted_at is null)
      $p$, t);
    else
      execute format($p$
        create policy %1$I_select_own on public.%1$I
          for select to authenticated using (user_id = auth.uid())
      $p$, t);
    end if;
  end loop;
end $$;

-- ═══════════════ 2. what a user may WRITE, and what only the API may ═══════
--
-- A user edits their own intent: goals, projects, submissions, disclosures,
-- approvals. A user NEVER writes their own evidence, claims, transitions,
-- evaluation results or scores — those come from the pipeline, through the
-- service role, after the domain rules have run. Granting a user write access
-- to skill_claim would let them promote themselves, which is the one thing the
-- whole product exists to prevent.

create policy career_goal_write_own on public.career_goal
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy project_write_own on public.project
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy work_item_write_own on public.work_item
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Insert only: a locked submission is never edited or deleted by its author.
create policy submission_insert_own on public.submission
  for insert to authenticated with check (user_id = auth.uid());

create policy submission_file_insert_own on public.submission_file
  for insert to authenticated with check (user_id = auth.uid());

create policy ai_disclosure_insert_own on public.ai_disclosure
  for insert to authenticated with check (user_id = auth.uid());

-- The user approves or edits their own asset wording; the API creates it.
create policy professional_asset_update_own on public.professional_asset
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy public_profile_write_own on public.public_profile
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A user may create and revoke their own share links, never another's.
create policy share_link_write_own on public.share_link
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy consent_insert_own on public.consent
  for insert to authenticated with check (user_id = auth.uid());

create policy notification_update_own on public.notification
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy app_user_update_own on public.app_user
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ═══════════ 3. platform content: readable by everyone, written by none ════
-- Role definitions, skills, specs, rubrics and resources are curated content.
-- No client writes them; content tooling uses the service role.

do $$
declare t text;
begin
  foreach t in array array[
    'target_role','skill','role_requirement','activity_spec','rubric_version',
    'learning_resource','market_fact'
  ]
  loop
    execute format($p$
      create policy %1$I_read_published on public.%1$I
        for select to authenticated, anon using (true)
    $p$, t);
  end loop;
end $$;

-- A draft or deprecated spec is not content a user may see.
drop policy activity_spec_read_published on public.activity_spec;
create policy activity_spec_read_published on public.activity_spec
  for select to authenticated, anon using (status = 'published');

drop policy rubric_version_read_published on public.rubric_version;
-- Rubric criteria are assessment material: a user seeing the rubric before
-- submitting changes what the evaluation measures.
create policy rubric_version_read_none on public.rubric_version
  for select to authenticated using (false);

-- ═══════════════ 4. anonymous access: only through an explicit path ════════
--
-- An anonymous visitor may read a public profile that its owner published, and
-- a case study reached through an unrevoked, unexpired share link. Nothing
-- else. There is no anon policy on evidence, evaluations, submissions, files,
-- reports, disclosures, audit events or model calls — so those are denied.

create policy public_profile_read_published on public.public_profile
  for select to anon
  using (visibility = 'public' and published_at is not null);

-- The check runs as SECURITY DEFINER because a policy's subquery is evaluated
-- under the CALLER's row level security. An anonymous visitor cannot read
-- share_link (correctly — they must not enumerate links), so an inline EXISTS
-- would always be false and the link would never open. This function is the
-- narrow, audited exception: it answers one boolean and returns no data.
create or replace function public.share_link_opens(
  p_resource_kind text,
  p_resource_id   uuid
) returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.share_link sl
    where sl.resource_kind = p_resource_kind
      and sl.resource_id   = p_resource_id
      and sl.revoked_at is null
      and sl.expires_at > now()
  );
$fn$;

revoke all on function public.share_link_opens(text, uuid) from public;
grant execute on function public.share_link_opens(text, uuid) to anon, authenticated;

comment on function public.share_link_opens(text, uuid) is
  'Returns only whether a live link exists. It never returns the token or any row, so it cannot be used to enumerate links.';

-- Same reasoning for the owner approval check.
create or replace function public.asset_is_approved(p_asset_id uuid)
  returns boolean
  language sql stable security definer set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.professional_asset pa
    where pa.id = p_asset_id and pa.user_approved_at is not null
  );
$fn$;

revoke all on function public.asset_is_approved(uuid) from public;
grant execute on function public.asset_is_approved(uuid) to anon, authenticated;

create policy case_study_read_via_share_link on public.case_study
  for select to anon
  using (
    public.share_link_opens('case_study', public.case_study.id)
    and public.asset_is_approved(public.case_study.asset_id)
  );

comment on policy case_study_read_via_share_link on public.case_study is
  'Four conditions together: a link exists, is unrevoked, is unexpired, and the user approved the asset.';

-- ═══════════════ 5. append-only tables: no UPDATE, no DELETE ═══════════════
--
-- These carry history that must not be rewritten. There is deliberately no
-- update or delete policy for ANY principal, and the grants are revoked as
-- well, so even the service role cannot rewrite them through PostgREST.

do $$
declare t text;
begin
  foreach t in array array[
    'evaluation_result','evaluation_criterion_score','evidence_transition',
    'audit_event','model_call','consent','integrity_check','username_release'
  ]
  loop
    execute format('revoke update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;

comment on table public.evaluation_result is
  'Append-only. Re-evaluation appends a superseding row. UPDATE and DELETE are revoked, not merely unused.';

-- ═══════════════ 6. never reachable from a client, at all ══════════════════
--
-- Assessment internals and operational rows. No policy is created for them, so
-- RLS denies every client read. They are reachable only through the service
-- role, which does its own authorisation.
--
--   integrity_check   — assessment_only detail would teach users the checks
--   human_review      — blind review; the subject must not read the queue
--   model_call        — cost and prompt metadata
--   audit_event       — read through an export path, never a live client query
--   job               — queue internals
--   username_release  — other people's released usernames

comment on table public.human_review is
  'No client policy: review is blind, and the reviewed user must not read the queue.';
comment on table public.integrity_check is
  'No client policy: exposing integrity checks teaches people how to pass them.';
comment on table public.job is
  'No client policy: queue internals are operational, not product data.';

-- ═══════════════════ 7. storage buckets and access rules ═══════════════════
--
-- Executed against storage.buckets when running on Supabase. Private by
-- default; every object is served through a short-lived signed URL, and no raw
-- bucket URL is ever handed out.
--
--   naqla-cv-uploads       private  a CV the user uploaded. Never shared.
--   naqla-submissions      private  project and evidence files. Never shared.
--   naqla-generated-docs   private  produced CV/PDF/DOCX. Shared only via a
--                                   signed URL the user asked for.
--   naqla-profile-assets   private  optional avatar or banner. Served through
--                                   a signed URL even when the profile is
--                                   public, so the object path stays opaque.
--
-- Signed URL lifetimes: 60s for an upload target, 300s for a download.
-- Rationale: long-lived URLs are shareable credentials nobody can revoke.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
      values ('naqla-cv-uploads',     'naqla-cv-uploads',     false),
             ('naqla-submissions',    'naqla-submissions',    false),
             ('naqla-generated-docs', 'naqla-generated-docs', false),
             ('naqla-profile-assets', 'naqla-profile-assets', false)
      on conflict (id) do nothing;

    -- Object paths are prefixed with the owner's uuid, so the policy is a
    -- prefix comparison and a user cannot enumerate another user's folder.
    execute $p$
      create policy naqla_objects_own on storage.objects
        for all to authenticated
        using (bucket_id like 'naqla-%' and (storage.foldername(name))[1] = auth.uid()::text)
        with check (bucket_id like 'naqla-%' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;
end $$;
