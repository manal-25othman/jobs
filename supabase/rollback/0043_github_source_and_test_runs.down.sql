-- Rollback of 0043. Refuses while any link, pinned source or test run exists (user history and evidence are never
-- deleted by a rollback).
do $$
begin
  if exists (select 1 from github_link) or exists (select 1 from submission_source) or exists (select 1 from test_run) then
    raise exception '0043 rollback refused: GitHub links, pinned sources or test runs exist';
  end if;
end $$;
drop table if exists github_webhook_delivery;
drop table if exists test_run;
drop function if exists test_run_guard();
drop table if exists submission_source;
drop function if exists submission_source_guard();
drop table if exists github_link_repo;
drop function if exists github_link_repo_guard();
drop table if exists github_link;
drop function if exists github_link_guard();
