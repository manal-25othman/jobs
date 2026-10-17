-- ═══════════════════════════════════════════════════════════════════════════
-- ENG-1 P4 / EXT-2 proofs (migration 0030): independence content facts are governed content; starter files are
-- service-only; EXT-2 readiness rule sets are sealed (development-only by explicit opt-in, never approved or
-- production-active). Own fixtures (9a…). Run by scripts/db-test.sh.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function ie_must_fail(setup text, stmt text, label text, expect_error text) returns void language plpgsql as $$
  begin
    begin
      if setup is not null then execute setup; end if;
      execute stmt;
    exception when others then
      if SQLERRM !~ expect_error then raise exception 'FAIL  %  — refused for the WRONG reason: %', label, SQLERRM; end if;
      raise notice 'PASS  %  (refused: %)', label, replace(SQLERRM, E'\n', ' ');
      return;
    end;
    raise exception 'FAIL  %  — ACCEPTED', label;
  end $$;
create or replace function ie_ok(setup text, stmt text, label text) returns void language plpgsql as $$
  begin
    begin
      if setup is not null then execute setup; end if;
      execute stmt;
      raise notice 'PASS  %  (accepted)', label;
      raise exception 'ie_rollback';
    exception when others then
      if SQLERRM = 'ie_rollback' then return; end if;
      raise exception 'FAIL  %  — refused: %', label, SQLERRM;
    end;
  end $$;
alter function ie_must_fail(text, text, text, text) security invoker;
alter function ie_ok(text, text, text) security invoker;

-- ─────────────────────────────── content facts ───────────────────────────────
insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec) values
  ('9a000000-0000-4000-8000-000000000021', 'ie-draft', '1.0.0', 'draft', 'نشاط', 'ai_assisted', '{}'::jsonb);
insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec, published_at, is_demo_fixture) values
  ('9a000000-0000-4000-8000-000000000022', 'ie-published', '1.0.0', 'published', 'نشاط', 'ai_assisted', '{}'::jsonb, now(), true);
select ie_ok(null, $$update activity_spec set variant_family = 'fam_html_form', task_purpose = 'practice' where id = '9a000000-0000-4000-8000-000000000021'$$,
  '0030: a DRAFT activity may receive its variant family and task purpose (content authoring)');
select ie_must_fail(null, $$update activity_spec set variant_family = 'fam_other' where id = '9a000000-0000-4000-8000-000000000022'$$,
  '0030: a PUBLISHED activity cannot be re-familied (no manufactured independence), for every role', 'fixed from SME review');
select ie_must_fail(null, $$update activity_spec set task_purpose = 'validation' where id = '9a000000-0000-4000-8000-000000000021'$$,
  '0030: task purpose must agree with the existing is_validation_activity flag', 'task_purpose_agrees');
select ie_ok(null, $$update activity_spec set task_purpose = 'validation', is_validation_activity = true where id = '9a000000-0000-4000-8000-000000000021'$$,
  '0030: a validation purpose with the validation flag is accepted');
select ie_must_fail(null, $$update activity_spec set task_purpose = 'homework' where id = '9a000000-0000-4000-8000-000000000021'$$, '0030: unknown task purpose refused', 'task_purpose_check');
select ie_must_fail(null, $$update activity_spec set variant_family = 'Bad Family!' where id = '9a000000-0000-4000-8000-000000000021'$$, '0030: malformed variant family refused', 'variant_family_format');
do $$ begin
  if exists (select 1 from activity_spec where id not in ('9a000000-0000-4000-8000-000000000021', '9a000000-0000-4000-8000-000000000022') and (variant_family is not null or task_purpose is not null)) then
    raise exception 'FAIL  0030 populated content facts';
  end if;
  raise notice 'PASS  0030: no activity received a variant family or purpose from the migration (all null = not reviewed = EXT-2 indeterminate)';
end $$;

-- ─────────────────────────────── starter files ───────────────────────────────
select ie_ok(null, $$insert into activity_starter_checksum (activity_spec_id, checksum_sha256, label) values ('9a000000-0000-4000-8000-000000000021', repeat('a', 64), 'starter index.html')$$,
  '0030: starter checksums may be recorded while the activity is draft');
select ie_must_fail(null, $$insert into activity_starter_checksum (activity_spec_id, checksum_sha256, label) values ('9a000000-0000-4000-8000-000000000022', repeat('b', 64), 'x')$$,
  '0030: starter files of a published activity are fixed', 'fixed from SME review');
select ie_must_fail(null, $$insert into activity_starter_checksum (activity_spec_id, checksum_sha256, label) values ('9a000000-0000-4000-8000-000000000021', 'not-a-sha', 'x')$$,
  '0030: a starter checksum must be a sha-256', 'check');
set role authenticated; set request.jwt.claim.sub = '9a000000-0000-4000-8000-0000000000aa';
select ie_must_fail(null, $$select 1 from activity_starter_checksum$$, '0030: a client cannot read starter checksums', 'permission denied');
reset role; set role anon;
select ie_must_fail(null, $$select 1 from activity_starter_checksum$$, '0030: anon cannot read starter checksums', 'permission denied');
reset role;

-- ─────────────────────────────── rule type + seal ───────────────────────────────
set naqla.config_actor = 'eng1 p4 proof'; set naqla.config_reason = 'prove the EXT-2 seal';
insert into readiness_rule_set (id, key, version, label_ar, label_en, description_en, created_by) values
  ('9a000000-0000-4000-8000-000000000031', 'ie_ext2', 1, 'x', 'x', 'EXT-2 proof set', 'proof'),
  ('9a000000-0000-4000-8000-000000000032', 'ie_plain', 1, 'x', 'x', 'plain proof set', 'proof');
insert into skill (id, slug, label_ar, label_en, provenance_class, provenance_source) values ('9a000000-0000-4000-8000-000000000011', 'ie-html', 'h', 'h', 'curated', 'p4 proof');
insert into readiness_rule (rule_set_id, rule_type, params, skill_id, label_ar, label_en) values
  ('9a000000-0000-4000-8000-000000000031', 'skill_evidence_path', '{"min_distinct_tasks": 2}'::jsonb, '9a000000-0000-4000-8000-000000000011', 'x', 'x');
select ie_must_fail(null, $$insert into readiness_rule (rule_set_id, rule_type, params, skill_id, label_ar, label_en) values ('9a000000-0000-4000-8000-000000000031', 'skill_evidence_path', '{}'::jsonb, null, 'x', 'x')$$,
  '0030: an EXT-2 rule names its skill', 'evidence_path_has_skill');
select ie_must_fail(null, $$insert into readiness_rule (rule_set_id, rule_type, params, skill_id, label_ar, label_en) values ('9a000000-0000-4000-8000-000000000031', 'integrated_assessment_passed', '{}'::jsonb, null, 'x', 'x')$$,
  '0030: EXT-1 is NOT a rule type (recommendation only; nothing bypasses it silently)', 'rule_type_check');
select ie_must_fail(null, $$update readiness_rule_set set review_status = 'approved', approved_by = 'po', approved_at = now() where id = '9a000000-0000-4000-8000-000000000031'$$,
  'SEAL: an EXT-2 rule set cannot be APPROVED', 'sealed');
select ie_must_fail(null, $$update readiness_rule_set set review_status = 'published', approved_by = 'po', approved_at = now() where id = '9a000000-0000-4000-8000-000000000031'$$,
  'SEAL: … nor PUBLISHED', 'sealed');
select ie_must_fail(null, $$update readiness_rule_set set activation = 'production_active' where id = '9a000000-0000-4000-8000-000000000031'$$,
  'SEAL: … nor PRODUCTION_ACTIVE', 'sealed|approved');
select ie_must_fail(null, $$update readiness_rule_set set activation = 'development_only' where id = '9a000000-0000-4000-8000-000000000031'$$,
  'SEAL: development_only needs the explicit opt-in', 'readiness_ext_dev_activation');
select ie_must_fail($$select set_config('naqla.readiness_ext_dev_activation', 'on', true), set_config('naqla.production', 'on', true)$$,
  $$update readiness_rule_set set activation = 'development_only' where id = '9a000000-0000-4000-8000-000000000031'$$,
  'SEAL: never in production, even with the opt-in', 'production');
select ie_ok($$select set_config('naqla.readiness_ext_dev_activation', 'on', true)$$,
  $$update readiness_rule_set set activation = 'development_only' where id = '9a000000-0000-4000-8000-000000000031'$$,
  'SEAL: with the opt-in, outside production, an EXT-2 set may run development_only (controlled testing)');
update readiness_rule_set set review_status = 'approved', approved_by = 'po', approved_at = now() where id = '9a000000-0000-4000-8000-000000000032';
select ie_must_fail(null, $$insert into readiness_rule (rule_set_id, rule_type, params, skill_id, label_ar, label_en) values ('9a000000-0000-4000-8000-000000000032', 'skill_evidence_path', '{}'::jsonb, '9a000000-0000-4000-8000-000000000011', 'x', 'x')$$,
  'SEAL: an EXT-2 rule cannot be slipped into an APPROVED set', 'only to an inactive, unapproved');
select ie_must_fail(null, $$insert into readiness_rule (rule_set_id, rule_type, params, skill_id, label_ar, label_en) values ('9a000000-0000-4000-8000-000000000032', 'min_evidence_per_skill', '{"min_count":1}'::jsonb, null, 'x', 'x');
  update readiness_rule set rule_type = 'skill_evidence_path', skill_id = '9a000000-0000-4000-8000-000000000011' where rule_set_id = '9a000000-0000-4000-8000-000000000032'$$,
  'SEAL: … nor by re-typing an existing rule', 'only to an inactive, unapproved');
reset naqla.config_actor; reset naqla.config_reason;
do $$ begin
  if exists (select 1 from readiness_rule_set s where readiness_rule_set_has_evidence_path(s.id) and (s.review_status in ('approved','published') or s.activation <> 'inactive')) then
    raise exception 'FAIL  an EXT-2 rule set is approved or active';
  end if;
  raise notice 'PASS  at rest: no EXT-2 rule set is approved or active';
end $$;

-- ─────────────────────────────── corroborating evidence ───────────────────────────────
select ie_must_fail(null, $$insert into verification_policy (key, version, description_en, record_corroborating_evidence) values ('ie_corr', 1, 'x', true)$$,
  'CORROBORATION: the policy flag exists only in the per_skill scope (itself development-only)', 'corroboration_per_skill_only');
select ie_must_fail(null, $$insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decision, previous_state, resulting_state, reason)
  values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'default', 1, 'draft', 'v', 'policy', 'evidence_corroborated', 'demonstrated', 'demonstrated', 'legacy attempt')$$,
  'CORROBORATION: never on the legacy path (a per-skill assessment is required), for every role', 'per-skill pathway');
do $$ begin
  if exists (select 1 from verification_policy where record_corroborating_evidence) then raise exception 'FAIL  a policy enables corroboration after migration'; end if;
  raise notice 'PASS  CORROBORATION: no policy enables it after the migration (default off)';
end $$;
