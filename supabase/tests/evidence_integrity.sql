-- ═══════════════════════════════════════════════════════════════════════════
-- O-2 / AP-1 proofs (migration 0027): evidence history is immutable except for the
-- withdrawal itself; a client cannot re-point a project. Run by scripts/db-test.sh on a
-- fresh database after the other proofs. Own fixtures (9d…). Every refusal must come from
-- the layer it names (column privilege, RLS, or the history trigger).
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function ei_must_fail(stmt text, label text, expect_error text) returns void language plpgsql as $$
  begin
    begin execute stmt;
    exception when others then
      if SQLERRM !~ expect_error then raise exception 'FAIL  %  — refused for the WRONG reason: %', label, SQLERRM; end if;
      raise notice 'PASS  %  (refused: %)', label, replace(SQLERRM, E'\n', ' ');
      return;
    end;
    raise exception 'FAIL  %  — ACCEPTED', label;
  end $$;
create or replace function ei_affects(stmt text, expected int, label text) returns void language plpgsql as $$
  declare n int;
  begin
    execute stmt; get diagnostics n = row_count;
    if n <> expected then raise exception 'FAIL  %  — expected % row(s) changed, got %', label, expected, n; end if;
    raise notice 'PASS  %  (% row(s) changed)', label, n;
  end $$;
create or replace function ei_value(stmt text, expected text, label text) returns void language plpgsql as $$
  declare v text;
  begin
    execute stmt into v;
    if v is distinct from expected then raise exception 'FAIL  %  — expected %, got %', label, expected, v; end if;
    raise notice 'PASS  %  (%)', label, v;
  end $$;
alter function ei_must_fail(text, text, text) security invoker;
alter function ei_affects(text, int, text) security invoker;
alter function ei_value(text, text, text) security invoker;

-- ───────────────────────────── fixtures (owner) ─────────────────────────────
insert into app_user (id, display_name) values ('9d000000-0000-4000-8000-000000000001', 'EI owner'), ('9d000000-0000-4000-8000-000000000002', 'EI other tenant');
insert into skill (id, slug, label_ar, label_en, provenance_class, provenance_source) values
  ('9d000000-0000-4000-8000-000000000011', 'ei-a', 'a', 'a', 'curated', 'o2 proof'), ('9d000000-0000-4000-8000-000000000012', 'ei-b', 'b', 'b', 'curated', 'o2 proof');
insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec, published_at, is_demo_fixture) values
  ('9d000000-0000-4000-8000-000000000021', 'ei-act-1', '1.0.0', 'published', 'نشاط', 'ai_assisted', '{}'::jsonb, now(), true),
  ('9d000000-0000-4000-8000-000000000022', 'ei-act-2', '1.0.0', 'published', 'نشاط', 'ai_assisted', '{}'::jsonb, now(), true);
insert into project (id, user_id, title, kind, activity_spec_id, activity_spec_version)
  values ('9d000000-0000-4000-8000-000000000031', '9d000000-0000-4000-8000-000000000001', 'p', 'platform_activity', '9d000000-0000-4000-8000-000000000021', '1.0.0');
insert into evidence (id, user_id, skill_id, source_strength, provenance_class, provenance_source, confidence) values
  ('9d000000-0000-4000-8000-000000000041', '9d000000-0000-4000-8000-000000000001', '9d000000-0000-4000-8000-000000000011', 'self_reported', 'user_generated', 'original', 0.9),
  ('9d000000-0000-4000-8000-000000000042', '9d000000-0000-4000-8000-000000000001', '9d000000-0000-4000-8000-000000000011', 'self_reported', 'user_generated', 'original', 0.9),
  ('9d000000-0000-4000-8000-000000000043', '9d000000-0000-4000-8000-000000000001', '9d000000-0000-4000-8000-000000000011', 'self_reported', 'user_generated', 'original', 0.9);

-- ─────────────────────────────── owner (client) ─────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
select assert_effective_role('authenticated');
select ei_must_fail($$update evidence set skill_id = '9d000000-0000-4000-8000-000000000012', withdrawn_at = now(), withdrawn_reason = 'x' where id = '9d000000-0000-4000-8000-000000000041'$$,
  'owner: cannot change the skill while withdrawing (the reproduced O-2 attack)', 'permission denied');
select ei_must_fail($$update evidence set confidence = 0.1 where id = '9d000000-0000-4000-8000-000000000041'$$, 'owner: cannot change confidence', 'permission denied');
select ei_must_fail($$update evidence set provenance_source = 'edited', withdrawn_at = now(), withdrawn_reason = 'x' where id = '9d000000-0000-4000-8000-000000000041'$$, 'owner: cannot change provenance while withdrawing', 'permission denied');
select ei_must_fail($$insert into evidence (user_id, skill_id, source_strength, provenance_class, provenance_source) values ('9d000000-0000-4000-8000-000000000001', '9d000000-0000-4000-8000-000000000011', 'platform_controlled', 'user_generated', 'me')$$,
  'owner: cannot create evidence', 'permission denied');
select ei_must_fail($$delete from evidence where id = '9d000000-0000-4000-8000-000000000041'$$, 'owner: cannot delete evidence', 'permission denied');
select ei_affects($$update evidence set withdrawn_at = now(), withdrawn_reason = 'not my own work' where id = '9d000000-0000-4000-8000-000000000041'$$, 1,
  'owner: CAN withdraw their own evidence (the legitimate operation is preserved)');
select ei_must_fail($$update evidence set withdrawn_reason = 'rewritten' where id = '9d000000-0000-4000-8000-000000000041'$$, 'owner: cannot rewrite the reason of a recorded withdrawal', 'already withdrawn');
select ei_must_fail($$update evidence set withdrawn_at = null, withdrawn_reason = null where id = '9d000000-0000-4000-8000-000000000041'$$, 'owner: cannot un-withdraw', 'row-level security|already withdrawn');
select ei_affects($$update project set title = 'renamed' where id = '9d000000-0000-4000-8000-000000000031'$$, 1, 'AP-1 owner: CAN still rename their project');
select ei_must_fail($$update project set activity_spec_version = '9.9.9' where id = '9d000000-0000-4000-8000-000000000031'$$, 'AP-1 owner: cannot re-point the activity version (rubric pinning input)', 'cannot be changed by a client');
select ei_must_fail($$update project set activity_spec_id = '9d000000-0000-4000-8000-000000000022' where id = '9d000000-0000-4000-8000-000000000031'$$, 'AP-1 owner: cannot move the project to another activity', 'cannot be changed by a client');
select ei_must_fail($$update project set kind = 'personal', activity_spec_id = null, activity_spec_version = null where id = '9d000000-0000-4000-8000-000000000031'$$, 'AP-1 owner: cannot change the project kind', 'cannot be changed by a client');

-- ──────────────────────────────── other tenant ──────────────────────────────
set request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000002';
select ei_affects($$update evidence set withdrawn_at = now(), withdrawn_reason = 'not yours' where id = '9d000000-0000-4000-8000-000000000042'$$, 0, 'other tenant: cannot withdraw someone else''s evidence (RLS: 0 rows)');
select ei_affects($$update project set title = 'hijack' where id = '9d000000-0000-4000-8000-000000000031'$$, 0, 'other tenant: cannot touch someone else''s project (RLS: 0 rows)');
select ei_value($$select count(*)::text from evidence$$, '0', 'other tenant: sees none of the owner''s evidence');

-- ─────────────────────────────────── anon ───────────────────────────────────
reset role; set role anon;
select ei_must_fail($$update evidence set withdrawn_at = now(), withdrawn_reason = 'x' where id = '9d000000-0000-4000-8000-000000000042'$$, 'anon: cannot update evidence', 'permission denied');
select ei_value($$select count(*)::text from evidence$$, '0', 'anon: reads no evidence');

-- ─────────────────── trusted server (service_role, bypasses RLS) ────────────
reset role; set role service_role;
select ei_affects($$update evidence set withdrawn_at = now(), withdrawn_reason = 'operator: confirmed request' where id = '9d000000-0000-4000-8000-000000000043'$$, 1,
  'service_role: the trusted withdrawal still works');
select ei_must_fail($$update evidence set skill_id = '9d000000-0000-4000-8000-000000000012' where id = '9d000000-0000-4000-8000-000000000042'$$, 'service_role: cannot rewrite history either', 'is history');
select ei_must_fail($$update evidence set withdrawn_at = null, withdrawn_reason = null where id = '9d000000-0000-4000-8000-000000000043'$$, 'service_role: cannot un-withdraw', 'already withdrawn');
select ei_affects($$update project set activity_spec_version = '1.0.0' where id = '9d000000-0000-4000-8000-000000000031'$$, 1, 'AP-1 service_role: trusted server writes to projects are unaffected');

-- ─────────────────────── database owner (migrations, API) ───────────────────
reset role;
select ei_must_fail($$update evidence set confidence = 0.2 where id = '9d000000-0000-4000-8000-000000000042'$$, 'owner role: evidence history is immutable for every role', 'is history');
select ei_value($$select skill_id || '|' || provenance_source || '|' || confidence || '|' || (withdrawn_at is null) from evidence where id = '9d000000-0000-4000-8000-000000000042'$$,
  '9d000000-0000-4000-8000-000000000011|original|0.900|true', 'the untouched row is exactly as recorded');
select ei_value($$select skill_id || '|' || provenance_source || '|' || withdrawn_reason from evidence where id = '9d000000-0000-4000-8000-000000000041'$$,
  '9d000000-0000-4000-8000-000000000011|original|not my own work', 'the withdrawn row kept every attribute and its first reason');
