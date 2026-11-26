-- ═══════════════════════════════════════════════════════════════════════════
-- 0043 — GitHub as a source of submitted code, and R2 test runs (Phase C round 2, items 1–2).
--
--   * `github_link`: one graduate's connection to the platform's GitHub App installation. NO ACCESS TOKEN IS STORED:
--     the platform mints a short-lived installation token per read and discards it (design §4). Revocation is a
--     state change kept as history (`connected` → `revoked`), never a delete.
--   * `github_link_repo`: the repositories the graduate selected for the platform. A repository not listed here is
--     never read. Removal is recorded (`removed_at`), not deleted.
--   * `submission_source`: a submission's pin — one repository, one full commit SHA (and the PR / branch when given),
--     and the hash of the snapshot actually fetched. Insert-only: the evidence is that exact commit.
--   * `test_run`: an R2 result, bound to the submission, the commit SHA and the snapshot hash. Layer 1 only: it is an
--     observation, never a score, evidence, a level or a decision. `origin` is constrained to 'synthetic' until the
--     owner approves the security review (a later migration lifts it, never this one).
--   * `github_webhook_delivery`: delivery ids already processed (replay protection). Service-only.
-- ═══════════════════════════════════════════════════════════════════════════

create table github_link (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references app_user(id) on delete cascade,
  github_user_id   bigint not null check (github_user_id > 0),
  github_login     text not null check (github_login ~ '^[A-Za-z0-9-]{1,39}$'),
  installation_id  bigint not null check (installation_id > 0),
  status           text not null default 'connected' check (status in ('connected', 'revoked')),
  revoke_reason    text check (revoke_reason in ('user_unlinked', 'app_uninstalled', 'authorization_revoked', 'suspended', 'admin')),
  linked_at        timestamptz not null default now(),
  revoked_at       timestamptz,
  constraint github_link_revocation check ((status = 'revoked') = (revoked_at is not null and revoke_reason is not null))
);
create unique index github_link_one_live on github_link (user_id) where status = 'connected';
create index github_link_installation on github_link (installation_id) where status = 'connected';
comment on table github_link is 'A graduate''s GitHub App installation link. No token columns by design. connected → revoked only; history kept.';

create function github_link_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception '[github_link_history] a link is history: revoke it instead'; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'revoked' then raise exception '[github_link_history] a revoked link cannot change; link again to create a new one'; end if;
    if new.user_id <> old.user_id or new.github_user_id <> old.github_user_id or new.installation_id <> old.installation_id
       or new.github_login <> old.github_login or new.linked_at <> old.linked_at then
      raise exception '[github_link_history] only the revocation may change';
    end if;
  end if;
  return new;
end $$;
create trigger github_link_guard_upd before update or delete on github_link for each row when (pg_trigger_depth() = 0) execute function github_link_guard();

alter table github_link enable row level security;
alter table github_link force row level security;
revoke all on github_link from anon, authenticated;
grant select on github_link to authenticated;
grant all on github_link to service_role;
create policy github_link_own_read on github_link for select to authenticated using (user_id = auth.uid());

create table github_link_repo (
  id           uuid primary key default gen_random_uuid(),
  link_id      uuid not null references github_link(id) on delete cascade,
  repo_id      bigint not null check (repo_id > 0),
  full_name    text not null check (full_name ~ '^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$'),
  owner_login  text not null check (owner_login ~ '^[A-Za-z0-9-]{1,39}$'),
  is_private   boolean not null,
  selected_at  timestamptz not null default now(),
  removed_at   timestamptz
);
create unique index github_link_repo_live on github_link_repo (link_id, repo_id) where removed_at is null;
comment on table github_link_repo is 'Repositories the graduate selected for the platform. Only these are ever read. Removal recorded, never deleted.';

create function github_link_repo_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception '[github_repo_history] record the removal instead'; end if;
  if tg_op = 'UPDATE' and (old.removed_at is not null or new.repo_id <> old.repo_id or new.link_id <> old.link_id or new.full_name <> old.full_name
       or new.selected_at <> old.selected_at or new.removed_at is null) then
    raise exception '[github_repo_history] only a removal may be recorded, once';
  end if;
  return new;
end $$;
create trigger github_link_repo_guard_upd before update or delete on github_link_repo for each row when (pg_trigger_depth() = 0) execute function github_link_repo_guard();

alter table github_link_repo enable row level security;
alter table github_link_repo force row level security;
revoke all on github_link_repo from anon, authenticated;
grant select on github_link_repo to authenticated;
grant all on github_link_repo to service_role;
create policy github_link_repo_own_read on github_link_repo for select to authenticated
  using (exists (select 1 from github_link l where l.id = link_id and l.user_id = auth.uid()));

create table submission_source (
  id                  uuid primary key default gen_random_uuid(),
  submission_id       uuid not null unique references submission(id) on delete cascade,
  user_id             uuid not null references app_user(id) on delete cascade,
  provider            text not null default 'github' check (provider = 'github'),
  repo_id             bigint not null check (repo_id > 0),
  full_name           text not null check (full_name ~ '^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$'),
  commit_sha          text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  pull_request_number integer check (pull_request_number > 0),
  branch              text check (length(branch) between 1 and 200),
  snapshot_hash       text not null check (snapshot_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at          timestamptz not null default now()
);
comment on table submission_source is 'Pin of a submission to one repository commit (and PR). Insert-only: the evidence is that exact commit.';

create function submission_source_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op <> 'INSERT' then raise exception '[submission_source_fixed] a pinned source is evidence and never changes'; end if;
  if not exists (select 1 from submission s where s.id = new.submission_id and s.user_id = new.user_id) then
    raise exception '[submission_source_owner] the source belongs to the owner of the submission';
  end if;
  return new;
end $$;
create trigger submission_source_guard_ins before insert on submission_source for each row execute function submission_source_guard();
create trigger submission_source_guard_upd before update or delete on submission_source for each row when (pg_trigger_depth() = 0) execute function submission_source_guard();

alter table submission_source enable row level security;
alter table submission_source force row level security;
revoke all on submission_source from anon, authenticated;
grant select on submission_source to authenticated;
grant all on submission_source to service_role;
create policy submission_source_own_read on submission_source for select to authenticated using (user_id = auth.uid());

create table test_run (
  id               uuid primary key default gen_random_uuid(),
  submission_id    uuid not null references submission(id) on delete cascade,
  user_id          uuid not null references app_user(id) on delete cascade,
  activity_key     text not null check (activity_key ~ '^act_[a-z0-9_]{2,60}$'),
  pack_version     text not null check (pack_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  pack_status      text not null check (pack_status in ('candidate', 'approved')),
  commit_sha       text check (commit_sha ~ '^[0-9a-f]{40}$'),
  snapshot_hash    text not null check (snapshot_hash ~ '^sha256:[0-9a-f]{64}$'),
  origin           text not null check (origin = 'synthetic'),
  backend          text not null check (length(btrim(backend)) between 1 and 40),
  status           text not null check (status in ('completed', 'timeout', 'crashed', 'refused')),
  result           jsonb not null check (jsonb_typeof(result) = 'object' and jsonb_typeof(result -> 'tests') = 'array'),
  created_at       timestamptz not null default now()
);
create index test_run_submission on test_run (submission_id, created_at);
comment on table test_run is 'R2 results (layer 1 observations). Insert-only. origin=synthetic only until the security review is approved.';

create function test_run_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op <> 'INSERT' then raise exception '[test_run_history] a test run is history'; end if;
  if not exists (select 1 from submission s where s.id = new.submission_id and s.user_id = new.user_id) then
    raise exception '[test_run_owner] a run belongs to the owner of the submission';
  end if;
  if exists (select 1 from submission_source ss where ss.submission_id = new.submission_id and ss.commit_sha is distinct from new.commit_sha) then
    raise exception '[test_run_pin] the run must be on the commit the submission is pinned to';
  end if;
  return new;
end $$;
create trigger test_run_guard_ins before insert on test_run for each row execute function test_run_guard();
create trigger test_run_guard_upd before update or delete on test_run for each row when (pg_trigger_depth() = 0) execute function test_run_guard();

alter table test_run enable row level security;
alter table test_run force row level security;
revoke all on test_run from anon, authenticated;
grant select on test_run to authenticated;
grant all on test_run to service_role;
create policy test_run_own_read on test_run for select to authenticated using (user_id = auth.uid());

create table github_webhook_delivery (
  delivery_id  text primary key check (delivery_id ~ '^[A-Za-z0-9-]{8,80}$'),
  event        text not null check (length(event) between 1 and 60),
  received_at  timestamptz not null default now()
);
alter table github_webhook_delivery enable row level security;
alter table github_webhook_delivery force row level security;
revoke all on github_webhook_delivery from anon, authenticated;
grant all on github_webhook_delivery to service_role;
