-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 · Phase 9 prerequisites (owner requirements 1 and 2, after Phase 8)
--
-- 1. Public direct-read paths present only assets grounded under the version
--    in effect. The recruiter report already goes through the API gate
--    (presentableFilter). The one direct anon path — a case-study share link —
--    trusted "the user approved it" alone: an asset moved to needs_review, no
--    longer evidence-backed, citing evidence its owner withdrew directly, or
--    never re-grounded would still open. It now requires active +
--    evidence-backed + approved + no withdrawn evidence + grounded under the version
--    the last COMPLETED re-grounding run declared. No declared version ⇒ closed.
--    The declared version is written only by a re-grounding run or a vocabulary
--    activation (both re-ground first), and cleared by the pre-deployment
--    "freeze" step. Fail closed.
-- 2. Separation of duties at activation: the person activating a governed
--    configuration row may not be the person who drafted it or who approved it.
--    The API sets naqla.config_actor_id for the transaction; the database
--    refuses the activation when it matches. (Operator CLI acts carry a name,
--    not an identity, and are not part of this check — documented.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────── 1. grounding version declared for public paths ─────────────────────────────
create table grounding_public_state (
  singleton    boolean primary key default true check (singleton),
  version      text,                        -- null = frozen: no direct public path opens
  set_at       timestamptz not null default now(),
  set_by       text not null,
  reason       text not null check (length(btrim(reason)) > 0)
);
comment on table grounding_public_state is
  'Phase 9: the grounding version (engine + vocabulary) declared by the last completed re-grounding run. Direct public reads (case-study share links) require an asset grounded under it. Null ⇒ frozen (pre-deployment step). Written by the API/CLI service only.';
alter table grounding_public_state enable row level security; alter table grounding_public_state force row level security;
grant select, insert, update on grounding_public_state to service_role;

create table grounding_public_state_log (
  id         uuid primary key default gen_random_uuid(),
  version    text,
  set_by     text not null,
  reason     text not null,
  created_at timestamptz not null default now()
);
create or replace function grounding_public_state_log_trg() returns trigger language plpgsql as $$
begin
  insert into grounding_public_state_log (version, set_by, reason) values (new.version, new.set_by, new.reason);
  return new;
end $$;
create trigger grounding_public_state_logged after insert or update on grounding_public_state for each row execute function grounding_public_state_log_trg();
create or replace function grounding_public_state_log_immutable() returns trigger language plpgsql as $$
begin raise exception 'grounding_public_state_log is append-only'; end $$;
create trigger grounding_public_state_log_immutable_trg before update or delete on grounding_public_state_log for each row execute function grounding_public_state_log_immutable();
alter table grounding_public_state_log enable row level security; alter table grounding_public_state_log force row level security;
grant select, insert on grounding_public_state_log to service_role;

create or replace function public.asset_publicly_presentable(p_asset_id uuid)
  returns boolean
  language sql stable security definer set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.professional_asset pa
     where pa.id = p_asset_id
       and pa.user_approved_at is not null
       and pa.lifecycle_state = 'active'
       and pa.evidence_backed
       and pa.grounding_version is not null
       and pa.grounding_version = (select g.version from public.grounding_public_state g where g.singleton)
       -- evidence its owner withdrew directly (RLS permits it) closes the path at read time; a withdrawal
       -- that a later re-link superseded (standing re-established after it) does not count (D-077)
       and not exists (select 1 from public.asset_evidence ae join public.evidence e on e.id = ae.evidence_id
                        where ae.asset_id = pa.id and e.withdrawn_at is not null
                          and (pa.standing_checked_at is null or e.withdrawn_at > pa.standing_checked_at))
  );
$fn$;
revoke all on function public.asset_publicly_presentable(uuid) from public;
grant execute on function public.asset_publicly_presentable(uuid) to anon, authenticated;
comment on function public.asset_publicly_presentable(uuid) is
  'Phase 9: approved AND active AND evidence-backed AND citing no withdrawn evidence AND grounded under the declared public grounding version. Returns only a boolean.';

drop policy case_study_read_via_share_link on public.case_study;
create policy case_study_read_via_share_link on public.case_study
  for select to anon
  using (
    public.share_link_opens('case_study', public.case_study.id)
    and public.asset_publicly_presentable(public.case_study.asset_id)
  );
comment on policy case_study_read_via_share_link on public.case_study is
  'A live link (exists, unrevoked, unexpired) AND an asset that is presentable now: approved, active, evidence-backed, grounded under the declared version (Phase 9). Fail closed.';

-- ───────────────────────────── 2. separation of duties at activation ─────────────────────────────
create or replace function config_activation_separation_guard() returns trigger language plpgsql as $$
declare
  actor_id text := nullif(btrim(coalesce(current_setting('naqla.config_actor_id', true), '')), '');
begin
  if actor_id is not null and new.activation <> 'inactive' and new.activation is distinct from old.activation then
    if new.drafted_by is not null and actor_id = new.drafted_by::text then
      raise exception 'separation of duties: % % was drafted by the person activating it; another product owner must activate', tg_table_name, new.id;
    end if;
    if new.approved_by is not null and actor_id = new.approved_by then
      raise exception 'separation of duties: % % was approved by the person activating it; another product owner must activate', tg_table_name, new.id;
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['verification_policy','assessment_context_policy','claim_policy','challenge_policy',
                           'readiness_rule_set','disclosure_questionnaire','grounding_lexicon','track_config_version'] loop
    execute format('create trigger %1$I_separation before update on %1$I for each row execute function config_activation_separation_guard()', t);
  end loop;
end $$;
