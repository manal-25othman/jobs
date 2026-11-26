-- ═══════════════════════════════════════════════════════════════════════════
-- GitHub source + R2 test-run proofs (migration 0043): no token storage; links and repository selections are
-- history; a pinned source is immutable; a test run is bound to the pinned commit and is synthetic-only.
-- Own fixtures (c3…). RLS proofs run as `authenticated`. Run by scripts/db-test.sh.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function gh_must_fail(stmt text, label text, expect_error text) returns void language plpgsql as $$
  begin
    begin execute stmt;
    exception when others then
      if SQLERRM !~ expect_error then raise exception 'FAIL  %  — refused for the WRONG reason: %', label, SQLERRM; end if;
      raise notice 'PASS  %  (refused: %)', label, replace(SQLERRM, E'\n', ' '); return;
    end;
    raise exception 'FAIL  %  — ACCEPTED', label;
  end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_name in ('github_link', 'github_link_repo', 'submission_source', 'test_run')
             and column_name ~* '(token|secret|private_key|password)') then
    raise exception 'FAIL  0043: a table stores a token or secret';
  end if;
  raise notice 'PASS  0043: no token, secret or key column exists (short-lived tokens are never stored)';
end $$;

insert into app_user (id, display_name) values ('c3000000-0000-4000-8000-000000000001', 'graduate (fixture)'), ('c3000000-0000-4000-8000-000000000002', 'other (fixture)');
insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec, is_demo_fixture) values
  ('c3000000-0000-4000-8000-000000000011', 'gh-proof-activity', '1.0.0', 'draft', 'نشاط', 'ai_assisted', '{}'::jsonb, true);
insert into project (id, user_id, title, kind, activity_spec_id, activity_spec_version) values
  ('c3000000-0000-4000-8000-000000000031', 'c3000000-0000-4000-8000-000000000001', 'p', 'platform_activity', 'c3000000-0000-4000-8000-000000000011', '1.0.0');
insert into submission (id, project_id, user_id, state, locked_at) values
  ('c3000000-0000-4000-8000-000000000041', 'c3000000-0000-4000-8000-000000000031', 'c3000000-0000-4000-8000-000000000001', 'locked', now());
insert into github_link (id, user_id, github_user_id, github_login, installation_id) values
  ('c3000000-0000-4000-8000-000000000051', 'c3000000-0000-4000-8000-000000000001', 1001, 'grad-one', 501);
insert into github_link_repo (link_id, repo_id, full_name, owner_login, is_private) values
  ('c3000000-0000-4000-8000-000000000051', 11, 'grad-one/leave-requests', 'grad-one', true);
insert into submission_source (submission_id, user_id, repo_id, full_name, commit_sha, pull_request_number, branch, snapshot_hash) values
  ('c3000000-0000-4000-8000-000000000041', 'c3000000-0000-4000-8000-000000000001', 11, 'grad-one/leave-requests', repeat('a', 40), 3, 'feature/filter', 'sha256:' || repeat('0', 64));

select gh_must_fail($$insert into github_link (user_id, github_user_id, github_login, installation_id) values ('c3000000-0000-4000-8000-000000000001', 1001, 'grad-one', 502)$$,
  '0043: one live link per graduate', 'duplicate key|github_link_one_live');
select gh_must_fail($$update github_link set installation_id = 999$$, '0043: a link''s identity never changes', 'github_link_history');
select gh_must_fail($$delete from github_link$$, '0043: a link is revoked, never deleted', 'github_link_history');
select gh_must_fail($$update github_link set status = 'revoked'$$, '0043: a revocation records when and why', 'github_link_revocation');
select gh_must_fail($$delete from github_link_repo$$, '0043: a repository selection is removed by record, not deleted', 'github_repo_history');
select gh_must_fail($$update github_link_repo set full_name = 'grad-one/other'$$, '0043: a selection only records its removal', 'github_repo_history');
select gh_must_fail($$insert into submission_source (submission_id, user_id, repo_id, full_name, commit_sha, snapshot_hash) values
  ('c3000000-0000-4000-8000-000000000041', 'c3000000-0000-4000-8000-000000000001', 11, 'grad-one/leave-requests', 'abc123', 'sha256:' || repeat('0', 64))$$,
  '0043: a source is pinned to a full commit SHA', 'check constraint|duplicate key');
select gh_must_fail($$update submission_source set commit_sha = repeat('b', 40)$$, '0043: a pinned source never changes', 'submission_source_fixed');
select gh_must_fail($$insert into test_run (submission_id, user_id, activity_key, pack_version, pack_status, commit_sha, snapshot_hash, origin, backend, status, result) values
  ('c3000000-0000-4000-8000-000000000041', 'c3000000-0000-4000-8000-000000000001', 'act_fe_debug_improve', '0.1.0', 'candidate', repeat('a', 40), 'sha256:' || repeat('0', 64), 'graduate', 'namespace-dev', 'completed', '{"tests":[]}')$$,
  '0043: only synthetic code may have a test run before the security review is approved', 'test_run_origin_check|check constraint');
select gh_must_fail($$insert into test_run (submission_id, user_id, activity_key, pack_version, pack_status, commit_sha, snapshot_hash, origin, backend, status, result) values
  ('c3000000-0000-4000-8000-000000000041', 'c3000000-0000-4000-8000-000000000001', 'act_fe_debug_improve', '0.1.0', 'candidate', repeat('b', 40), 'sha256:' || repeat('0', 64), 'synthetic', 'namespace-dev', 'completed', '{"tests":[]}')$$,
  '0043: a test run is on the commit the submission is pinned to', 'test_run_pin');
select gh_must_fail($$insert into test_run (submission_id, user_id, activity_key, pack_version, pack_status, commit_sha, snapshot_hash, origin, backend, status, result) values
  ('c3000000-0000-4000-8000-000000000041', 'c3000000-0000-4000-8000-000000000002', 'act_fe_debug_improve', '0.1.0', 'candidate', repeat('a', 40), 'sha256:' || repeat('0', 64), 'synthetic', 'namespace-dev', 'completed', '{"tests":[]}')$$,
  '0043: a test run belongs to the owner of the submission', 'test_run_owner');
insert into test_run (submission_id, user_id, activity_key, pack_version, pack_status, commit_sha, snapshot_hash, origin, backend, status, result) values
  ('c3000000-0000-4000-8000-000000000041', 'c3000000-0000-4000-8000-000000000001', 'act_fe_debug_improve', '0.1.0', 'candidate', repeat('a', 40), 'sha256:' || repeat('0', 64), 'synthetic', 'namespace-dev', 'completed', '{"tests":[]}');
select gh_must_fail($$update test_run set status = 'timeout'$$, '0043: a test run is history', 'test_run_history');
update github_link_repo set removed_at = now() where repo_id = 11;
update github_link set status = 'revoked', revoked_at = now(), revoke_reason = 'user_unlinked' where id = 'c3000000-0000-4000-8000-000000000051';
select gh_must_fail($$update github_link set status = 'connected', revoked_at = null, revoke_reason = null$$, '0043: a revoked link never comes back (link again instead)', 'github_link_history');
do $$ begin
  if (select count(*) from submission_source) < 1 or (select count(*) from test_run) < 1 then raise exception 'FAIL  0043: revocation removed evidence'; end if;
  raise notice 'PASS  0043: revoking access keeps the pinned evidence and its test runs (history), and reads stop';
end $$;

set role authenticated;
set request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from github_link) <> 1 or (select count(*) from github_link_repo) <> 1 or (select count(*) from submission_source) <> 1 or (select count(*) from test_run) <> 1 then
    raise exception 'FAIL  0043 RLS: the owner cannot read their own link, selection, source or runs';
  end if;
  raise notice 'PASS  0043 RLS: the owner reads their own link, selection, source and runs';
end $$;
select gh_must_fail($$insert into test_run (submission_id, user_id, activity_key, pack_version, pack_status, commit_sha, snapshot_hash, origin, backend, status, result) values
  ('c3000000-0000-4000-8000-000000000041', 'c3000000-0000-4000-8000-000000000001', 'act_fe_debug_improve', '0.1.0', 'approved', repeat('a', 40), 'sha256:' || repeat('0', 64), 'synthetic', 'x', 'completed', '{"tests":[]}')$$,
  '0043: a graduate never writes a test run (the runner service does)', 'permission denied');
select gh_must_fail($$insert into github_link_repo (link_id, repo_id, full_name, owner_login, is_private) values ('c3000000-0000-4000-8000-000000000051', 12, 'grad-one/x', 'grad-one', false)$$,
  '0043: a graduate never writes a selection directly (it comes from GitHub)', 'permission denied');
select gh_must_fail($$select 1 from github_webhook_delivery$$, '0043: webhook deliveries are service-only', 'permission denied');
set request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from github_link) + (select count(*) from github_link_repo) + (select count(*) from submission_source) + (select count(*) from test_run) <> 0 then
    raise exception 'FAIL  0043 RLS: another user reads a link, selection, source or run';
  end if;
  raise notice 'PASS  0043 RLS: another user reads none (private repositories stay private)';
end $$;
set role anon; set request.jwt.claim.sub = '';
do $$ begin
  begin perform 1 from github_link; raise exception 'FAIL  0043: anon reads links';
  exception when insufficient_privilege then raise notice 'PASS  0043: anon has no access'; end;
end $$;
reset role;

drop function gh_must_fail(text, text, text);
