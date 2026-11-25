-- ═══════════════════════════════════════════════════════════════════════════
-- A11 virtual manager proofs (migration 0042): scenarios are private, fixed content; a conversation is append-only,
-- owner-readable and service-written. Own fixtures (c2…). RLS proofs run as `authenticated`. Run by scripts/db-test.sh.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function vm_must_fail(stmt text, label text, expect_error text) returns void language plpgsql as $$
  begin
    begin execute stmt;
    exception when others then
      if SQLERRM !~ expect_error then raise exception 'FAIL  %  — refused for the WRONG reason: %', label, SQLERRM; end if;
      raise notice 'PASS  %  (refused: %)', label, replace(SQLERRM, E'\n', ' '); return;
    end;
    raise exception 'FAIL  %  — ACCEPTED', label;
  end $$;

insert into app_user (id, display_name) values ('c2000000-0000-4000-8000-000000000001', 'graduate (fixture)'), ('c2000000-0000-4000-8000-000000000002', 'other (fixture)');
insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec, is_demo_fixture) values
  ('c2000000-0000-4000-8000-000000000011', 'vm-proof-activity', '1.0.0', 'draft', 'نشاط', 'ai_assisted', '{}'::jsonb, true);
insert into manager_scenario (id, activity_spec_id, scenario_version, persona_ar, scenario, is_demo_fixture, created_by_label, reason) values
  ('c2000000-0000-4000-8000-000000000021', 'c2000000-0000-4000-8000-000000000011', '0.1.0', 'مديرة', '{"interventions":[{"key":"kickoff"}],"neverReveal":["secret-phrase"]}', true, 'proof', '0042 proof');
insert into project (id, user_id, title, kind, activity_spec_id, activity_spec_version) values
  ('c2000000-0000-4000-8000-000000000031', 'c2000000-0000-4000-8000-000000000001', 'p', 'platform_activity', 'c2000000-0000-4000-8000-000000000011', '1.0.0');
insert into manager_turn (project_id, user_id, scenario_id, intervention_key, author, kind, body) values
  ('c2000000-0000-4000-8000-000000000031', 'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000021', 'kickoff', 'manager', 'intervention', 'مرحبًا');

select vm_must_fail($$insert into manager_turn (project_id, user_id, scenario_id, intervention_key, author, kind, body) values
  ('c2000000-0000-4000-8000-000000000031', 'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000021', 'kickoff', 'manager', 'intervention', 'مرة ثانية')$$,
  '0042: an intervention is delivered once per project', 'duplicate key|manager_turn_one_intervention');
select vm_must_fail($$insert into manager_turn (project_id, user_id, scenario_id, intervention_key, author, kind, body) values
  ('c2000000-0000-4000-8000-000000000031', 'c2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000021', 'kickoff', 'graduate', 'message', 'x')$$,
  '0042: a turn belongs to the owner of the project', 'manager_turn_owner');
select vm_must_fail($$insert into manager_turn (project_id, user_id, scenario_id, intervention_key, author, kind, body) values
  ('c2000000-0000-4000-8000-000000000031', 'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000021', 'kickoff', 'manager', 'message', 'x')$$,
  '0042: only the graduate writes a «message»; the manager never speaks as the graduate', 'manager_turn_author_kind');
select vm_must_fail($$update manager_turn set body = 'تعديل'$$, '0042: a conversation turn is never rewritten', 'append_only');
select vm_must_fail($$update manager_scenario set persona_ar = 'x'$$, '0042: a scenario is fixed content', 'manager_scenario_fixed');
update activity_spec set status = 'curated' where id = 'c2000000-0000-4000-8000-000000000011';
update activity_spec set status = 'published' where id = 'c2000000-0000-4000-8000-000000000011';  -- the DEMO shortcut (0007)
select vm_must_fail($$insert into manager_scenario (activity_spec_id, scenario_version, persona_ar, scenario, created_by_label, reason) values
  ('c2000000-0000-4000-8000-000000000011', '0.2.0', 'مديرة', '{"interventions":[{"key":"k"}]}', 'proof', 'late')$$,
  '0042: a scenario cannot be added once the activity is published', 'manager_scenario_fixed');

set role authenticated;
set request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from manager_turn) <> 1 then raise exception 'FAIL  0042 RLS: the owner cannot read their conversation'; end if;
  raise notice 'PASS  0042 RLS: the owner reads their own conversation';
end $$;
select vm_must_fail($$select 1 from manager_scenario$$, '0042: a graduate never reads a scenario (it holds never-reveal phrases)', 'permission denied');
select vm_must_fail($$insert into manager_turn (project_id, user_id, scenario_id, intervention_key, author, kind, body) values
  ('c2000000-0000-4000-8000-000000000031', 'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000021', 'kickoff', 'graduate', 'message', 'x')$$,
  '0042: a graduate never writes a turn directly (the service checks the cap first)', 'permission denied');
set request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from manager_turn) <> 0 then raise exception 'FAIL  0042 RLS: another user reads a conversation'; end if;
  raise notice 'PASS  0042 RLS: another user reads none';
end $$;
set role anon; set request.jwt.claim.sub = '';
do $$ begin
  begin perform 1 from manager_turn; raise exception 'FAIL  0042: anon reads conversations';
  exception when insufficient_privilege then raise notice 'PASS  0042: anon has no access'; end;
end $$;
reset role;

-- Fixtures stay (content and history are never deleted); they are named vm-proof-*.
drop function vm_must_fail(text, text, text);
