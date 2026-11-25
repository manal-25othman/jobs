-- ═══════════════════════════════════════════════════════════════════════════
-- Phase B package 3 proofs (migration 0039): starter materials and the start rule. Own fixtures (b3…).
-- RLS proofs run as `authenticated`, never as postgres or service_role. Run by scripts/db-test.sh.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function am_must_fail(stmt text, label text, expect_error text) returns void language plpgsql as $$
  begin
    begin execute stmt;
    exception when others then
      if SQLERRM !~ expect_error then raise exception 'FAIL  %  — refused for the WRONG reason: %', label, SQLERRM; end if;
      raise notice 'PASS  %  (refused: %)', label, replace(SQLERRM, E'\n', ' '); return;
    end;
    raise exception 'FAIL  %  — ACCEPTED', label;
  end $$;

do $$ begin
  if exists (select 1 from activity_input where material_required and not exists (
       select 1 from activity_spec a join pilot_content_load l on l.target_role_id = a.target_role_id where a.id = activity_input.activity_spec_id)) then
    raise exception 'FAIL  0039: an existing non-pilot input was declared material-required'; end if;
  raise notice 'PASS  0039: existing inputs keep their historical behaviour (only pilot inputs are declared material-required)';
end $$;

insert into app_user (id, display_name) values ('b3000000-0000-4000-8000-000000000001', 'graduate (fixture)');
insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec, is_demo_fixture) values
  ('b3000000-0000-4000-8000-000000000011', 'am-needs-materials', '1.0.0', 'draft', 'نشاط', 'ai_assisted', '{}'::jsonb, true),
  ('b3000000-0000-4000-8000-000000000012', 'am-described-only', '1.0.0', 'draft', 'نشاط', 'ai_assisted', '{}'::jsonb, true);
insert into activity_input (activity_spec_id, key, description_ar, description_en, is_platform_private, contains_planted_issue, material_required) values
  ('b3000000-0000-4000-8000-000000000011', 'repo.starter', 'مشروع', 'project', true, true, true),
  ('b3000000-0000-4000-8000-000000000011', 'request.change', 'طلب', 'request', true, false, true),
  ('b3000000-0000-4000-8000-000000000012', 'brief.only', 'وصف', 'brief', false, false, false);

create or replace function am_material(audience text, covers text, file text) returns text language sql as $$
  select format($f$insert into activity_material (activity_spec_id, audience, covers_input_keys, file_name, content_type, bucket, object_path, size_bytes, checksum_sha256, material_version, is_demo_fixture, created_by_label, reason)
    values ('b3000000-0000-4000-8000-000000000011', %L, %L::text[], %L, 'application/zip', 'activity-materials', %L, 10, repeat('a', 64), '0.1.0', true, 'proof', '0039 proof')$f$,
    audience, covers, file, 'b3000000-0000-4000-8000-000000000011/0.1.0/' || audience || '/' || file)
$$;

do $$ begin
  if activity_materials_complete('b3000000-0000-4000-8000-000000000011') then raise exception 'FAIL  0039: an activity without its required materials is startable'; end if;
  if not activity_materials_complete('b3000000-0000-4000-8000-000000000012') then raise exception 'FAIL  0039: an activity with no required material is blocked'; end if;
  raise notice 'PASS  0039: the start rule follows the declared inputs (required ⇒ blocked until covered; described-only ⇒ startable)';
end $$;
select am_must_fail($$insert into project (user_id, title, kind, activity_spec_id, activity_spec_version) values ('b3000000-0000-4000-8000-000000000001', 'x', 'platform_activity', 'b3000000-0000-4000-8000-000000000011', '1.0.0')$$,
  '0039: the database refuses to start an activity whose starter materials are missing', 'starter_materials_missing');
select am_must_fail(am_material('graduate', '{repo.unknown}', 'starter.zip'), '0039: a graduate material covers only declared inputs', 'does not declare');
select am_must_fail(am_material('reviewer', '{repo.starter}', 'ref.zip'), '0039: a reviewer material covers no graduate input', 'activity_material_reviewer_covers_nothing');
select am_must_fail(am_material('graduate', '{}', 'starter.zip'), '0039: a graduate material covers at least one input', 'activity_material_graduate_covers_something');
do $$ begin
  execute am_material('graduate', '{repo.starter}', 'starter.zip');
  if activity_materials_complete('b3000000-0000-4000-8000-000000000011') then raise exception 'FAIL  0039: partially covered inputs make the activity startable'; end if;
  execute am_material('graduate', '{request.change}', 'request.zip');
  execute am_material('reviewer', '{}', 'reviewer.zip');
  if not activity_materials_complete('b3000000-0000-4000-8000-000000000011') then raise exception 'FAIL  0039: fully covered inputs leave the activity blocked'; end if;
  insert into project (user_id, title, kind, activity_spec_id, activity_spec_version) values ('b3000000-0000-4000-8000-000000000001', 'x', 'platform_activity', 'b3000000-0000-4000-8000-000000000011', '1.0.0');
  raise notice 'PASS  0039: once every required input is covered by a graduate material, the activity can be started (a reviewer file never counts)';
end $$;
select am_must_fail($$update activity_material set size_bytes = 11 where file_name = 'starter.zip'$$, '0039: a material is never edited', 'immutable');
select am_must_fail($$delete from activity_material where file_name = 'starter.zip'$$, '0039: a material is never deleted', 'immutable');
update activity_spec set status = 'curated' where id = 'b3000000-0000-4000-8000-000000000011';
update activity_spec set status = 'published' where id = 'b3000000-0000-4000-8000-000000000011';  -- the DEMO shortcut (0007)
select am_must_fail(am_material('graduate', '{repo.starter}', 'late.zip'), '0039: materials are content fixed once the activity is published (or SME-reviewed)', 'fixed from SME review on');

-- RLS, as `authenticated`: materials are service-only.
set role authenticated;
set request.jwt.claim.sub = 'b3000000-0000-4000-8000-000000000001';
do $$ begin
  begin perform 1 from activity_material; raise exception 'FAIL  0039: a graduate reads activity_material directly';
  exception when insufficient_privilege then raise notice 'PASS  0039 RLS: a graduate has no direct access to materials (reviewer files included)'; end;
end $$;
reset role;

drop function am_material(text, text, text); drop function am_must_fail(text, text, text);
