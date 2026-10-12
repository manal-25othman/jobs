-- ═══════════════════════════════════════════════════════════════════════════
-- ENG-1 Phase A proofs (migration 0028): submission-based promotion is never validated or
-- active; claimed skills (an attribution input) cannot be written by a client nor, by any
-- role, outside the activity's mapping or after evaluation. Run by scripts/db-test.sh on a
-- fresh database after the other proofs. Own fixtures (9c…). Every refusal must come from
-- the layer it names.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function ih_must_fail(stmt text, label text, expect_error text) returns void language plpgsql as $$
  begin
    begin execute stmt;
    exception when others then
      if SQLERRM !~ expect_error then raise exception 'FAIL  %  — refused for the WRONG reason: %', label, SQLERRM; end if;
      raise notice 'PASS  %  (refused: %)', label, replace(SQLERRM, E'\n', ' ');
      return;
    end;
    raise exception 'FAIL  %  — ACCEPTED', label;
  end $$;
create or replace function ih_affects(stmt text, expected int, label text) returns void language plpgsql as $$
  declare n int;
  begin
    execute stmt; get diagnostics n = row_count;
    if n <> expected then raise exception 'FAIL  %  — expected % row(s) changed, got %', label, expected, n; end if;
    raise notice 'PASS  %  (% row(s) changed)', label, n;
  end $$;
create or replace function ih_value(stmt text, expected text, label text) returns void language plpgsql as $$
  declare v text;
  begin
    execute stmt into v;
    if v is distinct from expected then raise exception 'FAIL  %  — expected %, got %', label, expected, v; end if;
    raise notice 'PASS  %  (%)', label, v;
  end $$;
alter function ih_must_fail(text, text, text) security invoker;
alter function ih_affects(text, int, text) security invoker;
alter function ih_value(text, text, text) security invoker;

-- ─────────────────────── A1: submission-based promotion ─────────────────────
set naqla.config_actor = 'eng1 phase A proof';
set naqla.config_reason = 'prove the submission-promotion guard';
insert into verification_policy
  select (jsonb_populate_record(null::verification_policy, to_jsonb(v) || jsonb_build_object(
            'id', '9c000000-0000-4000-8000-0000000000f1', 'version', 801, 'baseline_of', null, 'activation', 'inactive',
            'review_status', 'draft', 'approved_by', null, 'approved_at', null, 'practiced_on_submission', true))).*
    from verification_policy v where key = 'default' and version = 2;
select ih_value($$select practiced_on_submission::text from verification_policy where id = '9c000000-0000-4000-8000-0000000000f1'$$, 'true',
  'A1: an INACTIVE DRAFT may still carry the development/test switch (history and the e2e harness are preserved)');
select ih_must_fail($$update verification_policy set review_status = 'approved', approved_by = gen_random_uuid(), approved_at = now() where id = '9c000000-0000-4000-8000-0000000000f1'$$,
  'A1: a policy enabling submission-based promotion cannot be APPROVED', 'no_submission_promotion');
select ih_must_fail($$update verification_policy set review_status = 'published', approved_by = gen_random_uuid(), approved_at = now() where id = '9c000000-0000-4000-8000-0000000000f1'$$,
  'A1: … nor PUBLISHED', 'no_submission_promotion');
select ih_must_fail($$insert into verification_policy select (jsonb_populate_record(null::verification_policy, to_jsonb(v) || jsonb_build_object('id', gen_random_uuid(), 'version', 802, 'baseline_of', null, 'activation', 'inactive', 'review_status', 'approved', 'approved_by', gen_random_uuid(), 'approved_at', now(), 'practiced_on_submission', true))).* from verification_policy v where key = 'default' and version = 2$$,
  'A1: … nor inserted already approved', 'no_submission_promotion');
select ih_must_fail($$update verification_policy set activation = 'legacy_baseline', baseline_of = 'x' where id = '9c000000-0000-4000-8000-0000000000f1'$$,
  'A1: … nor made the legacy baseline (the baseline freeze refuses first)', 'no_submission_promotion|baseline_of is frozen');
select ih_must_fail($$insert into verification_policy select (jsonb_populate_record(null::verification_policy, to_jsonb(v) || jsonb_build_object('id', gen_random_uuid(), 'key', 'ih_prod', 'version', 1, 'baseline_of', null, 'activation', 'production_active', 'review_status', 'approved', 'approved_by', gen_random_uuid(), 'approved_at', now(), 'practiced_on_submission', true))).* from verification_policy v where key = 'default' and version = 2$$,
  'A1: … nor production_active', 'no_submission_promotion');
-- An approved policy cannot switch it on afterwards (the approved row is the second example).
insert into verification_policy
  select (jsonb_populate_record(null::verification_policy, to_jsonb(v) || jsonb_build_object(
            'id', '9c000000-0000-4000-8000-0000000000f2', 'version', 803, 'baseline_of', null, 'activation', 'inactive',
            'review_status', 'approved', 'approved_by', gen_random_uuid(), 'approved_at', now(), 'practiced_on_submission', false))).*
    from verification_policy v where key = 'default' and version = 2;
select ih_must_fail($$update verification_policy set practiced_on_submission = true where id = '9c000000-0000-4000-8000-0000000000f2'$$,
  'A1: an APPROVED policy cannot enable it afterwards (the approved-content freeze refuses first; the constraint is the second layer)', 'no_submission_promotion|frozen|immutable');
select ih_value($$select convalidated::text from pg_constraint where conname = 'verification_policy_no_submission_promotion'$$, 'true',
  'A1: the constraint is validated (no historical row violates it on a fresh database)');
select ih_value($$select practiced_on_submission::text || '|' || activation || '|' || review_status from verification_policy where key = 'default' and version = 1$$, 'true|inactive|draft',
  'A1: the historical pre-0023 row default@1 is preserved unchanged');
reset naqla.config_actor; reset naqla.config_reason;

-- ─────────────────────── A3: claimed skills (fixtures, owner) ─────────────────────
insert into app_user (id, display_name) values ('9c000000-0000-4000-8000-000000000001', 'IH owner'), ('9c000000-0000-4000-8000-000000000002', 'IH other tenant');
insert into skill (id, slug, label_ar, label_en, provenance_class, provenance_source) values
  ('9c000000-0000-4000-8000-000000000011', 'ih-mapped', 'm', 'm', 'curated', 'phase A proof'),
  ('9c000000-0000-4000-8000-000000000012', 'ih-unmapped', 'u', 'u', 'curated', 'phase A proof'),
  ('9c000000-0000-4000-8000-000000000013', 'ih-mapped-2', 'm2', 'm2', 'curated', 'phase A proof');
insert into skill (id, slug, label_ar, label_en, provenance_class, provenance_source, status, merged_into_id) values
  ('9c000000-0000-4000-8000-000000000014', 'ih-alias', 'a', 'a', 'curated', 'phase A proof', 'merged_into', '9c000000-0000-4000-8000-000000000011');
insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec, published_at, is_demo_fixture)
  values ('9c000000-0000-4000-8000-000000000021', 'ih-act', '1.0.0', 'published', 'نشاط', 'ai_assisted', '{}'::jsonb, now(), true);
insert into activity_skill (activity_spec_id, skill_id, depth) values
  ('9c000000-0000-4000-8000-000000000021', '9c000000-0000-4000-8000-000000000011', 'primary'),
  ('9c000000-0000-4000-8000-000000000021', '9c000000-0000-4000-8000-000000000013', 'secondary'),
  ('9c000000-0000-4000-8000-000000000021', '9c000000-0000-4000-8000-000000000014', 'secondary');
insert into project (id, user_id, title, kind, activity_spec_id, activity_spec_version) values
  ('9c000000-0000-4000-8000-000000000031', '9c000000-0000-4000-8000-000000000001', 'p', 'platform_activity', '9c000000-0000-4000-8000-000000000021', '1.0.0');
insert into project (id, user_id, title, kind) values
  ('9c000000-0000-4000-8000-000000000032', '9c000000-0000-4000-8000-000000000001', 'personal', 'personal_project');
insert into submission (id, project_id, user_id) values
  ('9c000000-0000-4000-8000-000000000041', '9c000000-0000-4000-8000-000000000031', '9c000000-0000-4000-8000-000000000001'),  -- not yet evaluated
  ('9c000000-0000-4000-8000-000000000042', '9c000000-0000-4000-8000-000000000031', '9c000000-0000-4000-8000-000000000001'),  -- evaluated below
  ('9c000000-0000-4000-8000-000000000043', '9c000000-0000-4000-8000-000000000032', '9c000000-0000-4000-8000-000000000001');  -- personal project
insert into submission_claimed_skill (submission_id, skill_id, user_id) values
  ('9c000000-0000-4000-8000-000000000042', '9c000000-0000-4000-8000-000000000011', '9c000000-0000-4000-8000-000000000001');
insert into evaluation (id, submission_id, user_id) values ('9c000000-0000-4000-8000-000000000051', '9c000000-0000-4000-8000-000000000042', '9c000000-0000-4000-8000-000000000001');

-- ─────────────────────────────── owner (client) ─────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '9c000000-0000-4000-8000-000000000001';
select assert_effective_role('authenticated');
select ih_must_fail($$insert into submission_claimed_skill (submission_id, skill_id, user_id) values ('9c000000-0000-4000-8000-000000000041', '9c000000-0000-4000-8000-000000000012', '9c000000-0000-4000-8000-000000000001')$$,
  'A3 client: cannot claim a skill OUTSIDE the activity''s coverage by a direct write', 'permission denied');
select ih_must_fail($$insert into submission_claimed_skill (submission_id, skill_id, user_id) values ('9c000000-0000-4000-8000-000000000041', '9c000000-0000-4000-8000-000000000011', '9c000000-0000-4000-8000-000000000001')$$,
  'A3 client: cannot add even a mapped skill directly (claims come only with the submission, through the server)', 'permission denied');
select ih_must_fail($$insert into submission_claimed_skill (submission_id, skill_id, user_id) values ('9c000000-0000-4000-8000-000000000042', '9c000000-0000-4000-8000-000000000013', '9c000000-0000-4000-8000-000000000001')$$,
  'A3 client: cannot add a claim to an EVALUATED submission (ambiguity / attribution manipulation before finalize)', 'permission denied');
select ih_must_fail($$delete from submission_claimed_skill where submission_id = '9c000000-0000-4000-8000-000000000042'$$,
  'A3 client: cannot remove a claimed skill', 'permission denied');
select ih_must_fail($$update submission_claimed_skill set skill_id = '9c000000-0000-4000-8000-000000000013' where submission_id = '9c000000-0000-4000-8000-000000000042'$$,
  'A3 client: cannot re-point a claimed skill', 'permission denied');
select ih_must_fail($$insert into submission_artifact (submission_id, user_id, key, kind, value_bool) values ('9c000000-0000-4000-8000-000000000041', '9c000000-0000-4000-8000-000000000001', 'verified.tests_pass', 'boolean', true)$$,
  'A3 client: cannot forge a platform-only artifact by a direct write (D-118 namespaces)', 'permission denied');
select ih_must_fail($$insert into submission (project_id, user_id) values ('9c000000-0000-4000-8000-000000000031', '9c000000-0000-4000-8000-000000000001')$$,
  'A3 client: cannot create a submission behind the API', 'permission denied');
select ih_value($$select count(*)::text from submission_claimed_skill$$, '1', 'A3 client: still READS their own claimed skills');
select ih_must_fail($$insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decision, previous_state, resulting_state, reason) values (gen_random_uuid(), gen_random_uuid(), '9c000000-0000-4000-8000-000000000001', '9c000000-0000-4000-8000-000000000011', gen_random_uuid(), 'default', 1, 'draft', 'v', 'policy', 'accepted', 'gap', 'demonstrated', 'forged')$$,
  'A3 client: cannot forge a verification decision (attribution record)', 'row-level security|permission denied');
select ih_must_fail($$insert into audit_event (event_type, user_id, actor_kind, subject_table, reason, payload) values ('verification.decided', '9c000000-0000-4000-8000-000000000001', 'system', 'verification_decision', 'forged', '{"attribution":{"kind":"attributed"}}')$$,
  'A3 client: cannot forge an audit event (the attribution payload)', 'row-level security|permission denied');
select ih_must_fail($$insert into activity_skill (activity_spec_id, skill_id, depth) values ('9c000000-0000-4000-8000-000000000021', '9c000000-0000-4000-8000-000000000012', 'primary')$$,
  'A3 client: cannot widen an activity''s mapping', 'permission denied');

set request.jwt.claim.sub = '9c000000-0000-4000-8000-000000000002';
select ih_value($$select count(*)::text from submission_claimed_skill$$, '0', 'tenant: another user sees none of the owner''s claimed skills');
select ih_must_fail($$insert into submission_claimed_skill (submission_id, skill_id, user_id) values ('9c000000-0000-4000-8000-000000000041', '9c000000-0000-4000-8000-000000000011', '9c000000-0000-4000-8000-000000000002')$$,
  'tenant: another user cannot claim on the owner''s submission', 'permission denied');

reset role; set role anon;
select ih_must_fail($$insert into submission_claimed_skill (submission_id, skill_id, user_id) values ('9c000000-0000-4000-8000-000000000041', '9c000000-0000-4000-8000-000000000011', '9c000000-0000-4000-8000-000000000001')$$,
  'anon: cannot claim', 'permission denied');

-- ─────────────── trusted server (service_role) and the database owner ───────────────
reset role; set role service_role;
select ih_affects($$insert into submission_claimed_skill (submission_id, skill_id, user_id) values ('9c000000-0000-4000-8000-000000000041', '9c000000-0000-4000-8000-000000000011', '9c000000-0000-4000-8000-000000000001')$$, 1,
  'service_role: the legitimate workflow (a mapped skill, before evaluation) still works');
select ih_affects($$insert into submission_claimed_skill (submission_id, skill_id, user_id) values ('9c000000-0000-4000-8000-000000000041', '9c000000-0000-4000-8000-000000000013', '9c000000-0000-4000-8000-000000000001')$$, 1,
  'service_role: a mapped SECONDARY skill may be claimed (attribution, not insertion, decides what it proves)');
select ih_affects($$insert into submission_claimed_skill (submission_id, skill_id, user_id) values ('9c000000-0000-4000-8000-000000000043', '9c000000-0000-4000-8000-000000000012', '9c000000-0000-4000-8000-000000000001')$$, 1,
  'service_role: a personal project (no activity) may claim any active skill');
select ih_must_fail($$insert into submission_claimed_skill (submission_id, skill_id, user_id) values ('9c000000-0000-4000-8000-000000000041', '9c000000-0000-4000-8000-000000000012', '9c000000-0000-4000-8000-000000000001')$$,
  'every role: a skill outside the activity''s mapping is refused', 'skill_not_mapped_to_activity');
select ih_must_fail($$insert into submission_claimed_skill (submission_id, skill_id, user_id) values ('9c000000-0000-4000-8000-000000000041', '9c000000-0000-4000-8000-000000000014', '9c000000-0000-4000-8000-000000000001')$$,
  'every role: an alias (merged) skill is refused even when mapped', 'only an active');
select ih_must_fail($$insert into submission_claimed_skill (submission_id, skill_id, user_id) values ('9c000000-0000-4000-8000-000000000042', '9c000000-0000-4000-8000-000000000013', '9c000000-0000-4000-8000-000000000001')$$,
  'every role: no claim is added after the submission is evaluated', 'already been evaluated');
select ih_must_fail($$insert into submission_claimed_skill (submission_id, skill_id, user_id) values ('9c000000-0000-4000-8000-000000000041', '9c000000-0000-4000-8000-000000000011', '9c000000-0000-4000-8000-000000000002')$$,
  'every role: a claim belongs to the submission''s owner', 'owner of the submission');
reset role;
select ih_must_fail($$update submission_claimed_skill set skill_id = '9c000000-0000-4000-8000-000000000013' where submission_id = '9c000000-0000-4000-8000-000000000042'$$,
  'owner role: a claimed skill is never changed', 'is history');
select ih_must_fail($$delete from submission_claimed_skill where submission_id = '9c000000-0000-4000-8000-000000000042'$$,
  'owner role: a claimed skill of an evaluated submission is never removed', 'evaluated submission');
select ih_affects($$delete from submission_claimed_skill where submission_id = '9c000000-0000-4000-8000-000000000043'$$, 1,
  'owner role: a claim on an unevaluated submission may still be removed by the server');
select ih_affects($$delete from app_user where id = '9c000000-0000-4000-8000-000000000001'$$, 1,
  'cascade: deleting the account (with its evaluated submission) still cascades through the guard');
select ih_value($$select count(*)::text from submission_claimed_skill where user_id = '9c000000-0000-4000-8000-000000000001'$$, '0', 'cascade: the account''s claimed skills went with it');
