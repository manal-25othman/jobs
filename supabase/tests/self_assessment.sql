-- ═══════════════════════════════════════════════════════════════════════════
-- FR-U-013 / BR-001 proofs (migration 0041): a self-assessment is Observed only, private, append-only, and changes
-- no claim, evidence or level. Own fixtures (c1…). RLS proofs run as `authenticated`. Run by scripts/db-test.sh.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function sa_must_fail(stmt text, label text, expect_error text) returns void language plpgsql as $$
  begin
    begin execute stmt;
    exception when others then
      if SQLERRM !~ expect_error then raise exception 'FAIL  %  — refused for the WRONG reason: %', label, SQLERRM; end if;
      raise notice 'PASS  %  (refused: %)', label, replace(SQLERRM, E'\n', ' '); return;
    end;
    raise exception 'FAIL  %  — ACCEPTED', label;
  end $$;

insert into app_user (id, display_name) values ('c1000000-0000-4000-8000-000000000001', 'graduate (fixture)'), ('c1000000-0000-4000-8000-000000000002', 'other (fixture)');
-- The default proficiency scale is pack content; the proof database may not carry it, so a fixture provides one level.
do $$ begin
  if not exists (select 1 from proficiency_scale where code = 'scale_default') then
    insert into proficiency_scale (id, code, version, name_ar, name_en, is_demo_fixture) values ('c1000000-0000-4000-8000-000000000021', 'scale_default', '0-proof', 'م', 'm', true);
    insert into proficiency_level (scale_id, level_key, ordinal, label_ar, label_en, descriptor_ar, descriptor_en) values ('c1000000-0000-4000-8000-000000000021', 'working', 2, 'عملي', 'Working', 'و', 'd');
  end if;
end $$;
insert into skill (id, slug, label_ar, label_en, provenance_class, provenance_source) values ('c1000000-0000-4000-8000-000000000011', 'sa-proof-skill', 'م', 'm', 'curated', '0041 proof');

select sa_must_fail($$insert into skill_self_assessment (user_id, skill_id, rating) values ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011', 'expert')$$,
  '0041: a rating outside the proficiency scale is refused', 'self_assessment_bad_rating');
select sa_must_fail($$insert into skill_self_assessment (user_id, skill_id, rating, confidence) values ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011', 'working', 'demonstrated')$$,
  '0041: a self-assessment is Observed only', 'confidence_check');

-- As the graduate (RLS).
set role authenticated;
set request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
do $$
declare claims_before int; ev_before int;
begin
  select count(*) into claims_before from skill_claim; select count(*) into ev_before from evidence;
  insert into skill_self_assessment (user_id, skill_id, rating, note) values ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011', 'working', 'استخدمتها في مشروع التخرج');
  insert into skill_self_assessment (user_id, skill_id, rating) values ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011', 'unsure');
  if (select count(*) from skill_self_assessment) <> 2 then raise exception 'FAIL  0041: the owner cannot read their own history'; end if;
  if (select count(*) from skill_claim) <> claims_before or (select count(*) from evidence) <> ev_before then raise exception 'FAIL  0041: a self-assessment created a claim or evidence'; end if;
  raise notice 'PASS  0041 RLS: the owner records and reads a self-assessment history; no claim and no evidence is created';
end $$;
select sa_must_fail($$insert into skill_self_assessment (user_id, skill_id, rating) values ('c1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000011', 'working')$$,
  '0041 RLS: nobody records a self-assessment in another user''s name', 'row-level security');
select sa_must_fail($$update skill_self_assessment set rating = 'advanced'$$, '0041: a self-assessment is never edited', 'permission denied|append_only');
select sa_must_fail($$delete from skill_self_assessment$$, '0041: a self-assessment is never deleted by its owner', 'permission denied|append_only');
set request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from skill_self_assessment) <> 0 then raise exception 'FAIL  0041 RLS: another user reads a self-assessment'; end if;
  raise notice 'PASS  0041 RLS: another user reads none';
end $$;
set role anon; set request.jwt.claim.sub = '';
do $$ begin
  begin perform 1 from skill_self_assessment; raise exception 'FAIL  0041: anon reads self-assessments';
  exception when insufficient_privilege then raise notice 'PASS  0041: anon (the public) has no access'; end;
end $$;
reset role;
select sa_must_fail($$update skill_self_assessment set note = 'x' where user_id = 'c1000000-0000-4000-8000-000000000001'$$, '0041: even the service never rewrites a self-assessment', 'append_only');
do $$ begin
  delete from app_user where id = 'c1000000-0000-4000-8000-000000000002';
  raise notice 'PASS  0041: an account deletion still removes its rows (the cascade is not blocked)';
end $$;

-- Fixtures stay (history is never deleted); they are named sa-proof-*.
drop function sa_must_fail(text, text, text);
