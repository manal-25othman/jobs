-- ═══════════════════════════════════════════════════════════════════════════
-- ENG-1 P2 — proofs for the additive, inactive per-skill schema (0026) and the
-- P0 rubric binding (0025). Every "must fail" is a row the database refuses even
-- when the service code forgets a guard. Runs after invariants.sql and rls.sql on
-- a fresh database (scripts/db-test.sh); uses its own fixture ids (9e…).
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function ps_must_fail(stmt text, label text, expect_error text default null) returns void language plpgsql as $$
  begin
    begin
      execute 'set constraints all immediate';   -- deferred (commit-time) checks fire inside this block
      execute stmt;
    exception when others then
      if expect_error is not null and SQLERRM !~ expect_error then
        raise exception 'FAIL  %  — rejected for the WRONG reason: %', label, SQLERRM;
      end if;
      raise notice 'PASS  %  (rejected: %)', label, replace(SQLERRM, E'\n', ' ');
      return;
    end;
    raise exception 'FAIL  %  — the database ACCEPTED it', label;
  end $$;
-- Runs `setup` then `stmt` in ONE subtransaction (same now(), deferred checks still deferred); only `stmt` may fail.
create or replace function ps_must_fail_after(setup text, stmt text, label text, expect_error text) returns void language plpgsql as $$
  declare ok boolean := false;
  begin
    begin
      execute setup; ok := true;
      execute stmt;
    exception when others then
      if not ok then raise exception 'FAIL  %  — setup failed: %', label, SQLERRM; end if;
      if SQLERRM !~ expect_error then raise exception 'FAIL  %  — rejected for the WRONG reason: %', label, SQLERRM; end if;
      raise notice 'PASS  %  (rejected: %)', label, replace(SQLERRM, E'\n', ' ');
      return;
    end;
    raise exception 'FAIL  %  — the database ACCEPTED it', label;
  end $$;
alter function ps_must_fail_after(text, text, text, text) security invoker;
create or replace function ps_expect(stmt text, expected bigint, label text) returns void language plpgsql as $$
  declare actual bigint;
  begin
    execute 'select count(*) from (' || stmt || ') q' into actual;
    if actual <> expected then raise exception 'FAIL  %  — expected %, got %', label, expected, actual; end if;
    raise notice 'PASS  %  (% row(s))', label, actual;
  end $$;
alter function ps_expect(text, bigint, text) security invoker;
alter function ps_must_fail(text, text, text) security invoker;

-- ───────────────────────────── fixtures (owner) ─────────────────────────────
insert into app_user (id, display_name) values ('9e000000-0000-4000-8000-000000000001', 'PS user A'), ('9e000000-0000-4000-8000-000000000002', 'PS user B');
insert into skill (id, slug, label_ar, label_en, provenance_class, provenance_source) values
  ('9e000000-0000-4000-8000-000000000011', 'ps-html', 'html', 'html', 'curated', 'eng1 proof'),
  ('9e000000-0000-4000-8000-000000000012', 'ps-css', 'css', 'css', 'curated', 'eng1 proof');
insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec, published_at, is_demo_fixture)
  values ('9e000000-0000-4000-8000-000000000021', 'ps-act', '1.0.0', 'published', 'نشاط', 'ai_assisted', '{}'::jsonb, now(), true);
-- Published on insert: the 0025 trigger binds it to the activity's version.
insert into rubric_version (id, activity_spec_id, version, status, criteria, published_at, is_demo_fixture)
  values ('9e000000-0000-4000-8000-000000000031', '9e000000-0000-4000-8000-000000000021', 'rub@1', 'published', '[]'::jsonb, now(), true);
insert into project (id, user_id, title, kind, activity_spec_id, activity_spec_version)
  values ('9e000000-0000-4000-8000-000000000041', '9e000000-0000-4000-8000-000000000001', 'p', 'platform_activity', '9e000000-0000-4000-8000-000000000021', '1.0.0');
insert into submission (id, project_id, user_id) values ('9e000000-0000-4000-8000-000000000051', '9e000000-0000-4000-8000-000000000041', '9e000000-0000-4000-8000-000000000001');
insert into evaluation (id, submission_id, user_id) values ('9e000000-0000-4000-8000-000000000061', '9e000000-0000-4000-8000-000000000051', '9e000000-0000-4000-8000-000000000001');
insert into evaluation_result (id, evaluation_id, submission_id, user_id, outcome, rubric_version_id, activity_spec_id, activity_spec_version)
  values ('9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000061', '9e000000-0000-4000-8000-000000000051', '9e000000-0000-4000-8000-000000000001',
          'passed', '9e000000-0000-4000-8000-000000000031', '9e000000-0000-4000-8000-000000000021', '1.0.0');
insert into assessment (id, evaluation_result_id, evaluation_id, submission_id, user_id, evaluator_kind, evaluator_ref, rubric_version_id, rubric_version,
                        activity_spec_id, activity_spec_version, domain_ruleset_version, raw_result, outcome, total_score, max_score)
  values ('9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000061', '9e000000-0000-4000-8000-000000000051',
          '9e000000-0000-4000-8000-000000000001', 'human', 'proof', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', '0.19.0', '{}'::jsonb, 'passed', 2, 4);
insert into assessment_criterion_result (id, assessment_id, user_id, criterion_key, criterion_kind, skill_id, status, score, max_score, observations, evaluator_kind, reason) values
  ('9e000000-0000-4000-8000-000000000091', '9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000001', 'h1', 'skill_evidence', '9e000000-0000-4000-8000-000000000011', 'met', 2, 2, 'o', 'human', 'r'),
  ('9e000000-0000-4000-8000-000000000092', '9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000001', 'c1', 'skill_evidence', '9e000000-0000-4000-8000-000000000012', 'not_met', 0, 2, 'o', 'human', 'r');

select ps_expect($$select 1 from rubric_version where id = '9e000000-0000-4000-8000-000000000031' and activity_spec_version = '1.0.0'$$, 1, '0025: a rubric published on insert is bound to its activity version');
select ps_must_fail($$update rubric_version set activity_spec_version = '2.0.0' where id = '9e000000-0000-4000-8000-000000000031'$$, '0025: the binding is immutable');

-- A valid per-skill chain, recorded in one transaction (the outcome↔criteria check runs at commit).
begin;
insert into skill_assessment (id, assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version, activity_spec_id,
                              activity_spec_version, rubric_resolution, claimed, outcome, basis_independently_verified, basis_reasons, confidence, current_state, proposed_state, reason) values
  ('9e000000-0000-4000-8000-0000000000a1', '9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011',
   'per_skill@1', '0.19.0', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', 'bound', true, 'met', true, '{}', 1, 'gap', 'demonstrated', 'html met'),
  ('9e000000-0000-4000-8000-0000000000a2', '9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000012',
   'per_skill@1', '0.19.0', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', 'bound', true, 'not_met', true, '{}', 1, 'gap', null, 'css not met');
insert into skill_assessment_criterion (skill_assessment_id, assessment_criterion_result_id, user_id, criterion_key, status, score, max_score, threshold, threshold_status) values
  ('9e000000-0000-4000-8000-0000000000a1', '9e000000-0000-4000-8000-000000000091', '9e000000-0000-4000-8000-000000000001', 'h1', 'met', 2, 2, 0.5, 'approved'),
  ('9e000000-0000-4000-8000-0000000000a2', '9e000000-0000-4000-8000-000000000092', '9e000000-0000-4000-8000-000000000001', 'c1', 'not_met', 0, 2, 0.5, 'approved');
commit;
select ps_expect($$select 1 from skill_assessment where assessment_id = '9e000000-0000-4000-8000-000000000081'$$, 2, 'a valid chain is accepted: one skill met, one not, in the same evaluation');

-- ───────────────────────── skill_assessment integrity ───────────────────────
select ps_must_fail($$insert into skill_assessment (id, assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version, activity_spec_id, activity_spec_version, rubric_resolution, claimed, outcome, basis_independently_verified, current_state, proposed_state, reason) values (gen_random_uuid(), '9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', 'per_skill@1', 'v', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', 'bound', true, 'not_met', true, 'gap', null, 'dup')$$, 'INV-PS5: one assessment per (assessment, skill)', 'one_per_skill');
select ps_must_fail($$insert into skill_assessment (id, assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version, activity_spec_id, activity_spec_version, rubric_resolution, claimed, outcome, basis_independently_verified, current_state, proposed_state, reason) values (gen_random_uuid(), '9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000012', 'per_skill@1', 'v', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', 'bound', true, 'not_met', true, 'gap', 'demonstrated', 'x')$$, 'INV-PS2: a not_met assessment cannot carry a proposal');
select ps_must_fail($$delete from skill_assessment_criterion; delete from skill_assessment where id = '9e000000-0000-4000-8000-0000000000a2'$$, 'immutability: per-skill records cannot be deleted');
select ps_must_fail($$update skill_assessment set outcome = 'met' where id = '9e000000-0000-4000-8000-0000000000a2'$$, 'immutability: an outcome cannot be rewritten');
select ps_must_fail($$update skill_assessment_criterion set status = 'met' where skill_assessment_id = '9e000000-0000-4000-8000-0000000000a2'$$, 'immutability: a criterion result cannot be rewritten');
select ps_must_fail($$insert into skill_assessment (id, assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version, activity_spec_id, activity_spec_version, rubric_resolution, claimed, outcome, basis_independently_verified, current_state, proposed_state, reason) values (gen_random_uuid(), '9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-000000000012', 'per_skill@1', 'v', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', 'bound', true, 'blocked', false, 'gap', null, 'x')$$, 'tenant: a skill assessment cannot belong to another user than its assessment');
select ps_must_fail($$insert into skill_assessment (id, assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version, activity_spec_id, activity_spec_version, rubric_resolution, claimed, outcome, basis_independently_verified, current_state, proposed_state, reason) values (gen_random_uuid(), '9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000012', 'per_skill@1', 'v', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '9.9.9', 'bound', true, 'blocked', false, 'gap', null, 'x')$$, 'context: the activity version must be the assessment''s');
select ps_must_fail($$insert into skill_assessment (id, assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version, activity_spec_id, activity_spec_version, rubric_resolution, claimed, outcome, basis_independently_verified, current_state, proposed_state, reason) values (gen_random_uuid(), '9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000012', 'per_skill@1', 'v', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', 'bound', true, 'met', true, 'gap', 'verified', 'x')$$, 'INV-9: never proposes Verified');
select ps_must_fail($$insert into skill_assessment (id, assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version, activity_spec_id, activity_spec_version, rubric_resolution, claimed, outcome, basis_independently_verified, current_state, proposed_state, reason) values (gen_random_uuid(), '9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000012', 'per_skill@1', 'v', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', 'bound', true, 'met', true, 'demonstrated', 'demonstrated', 'x')$$, 'a proposal must be above the skill''s OWN previous state');

-- Outcome ↔ criteria (commit-time checks, forced immediate here). A fresh evaluation result for these.
insert into evaluation (id, submission_id, user_id) values ('9e000000-0000-4000-8000-000000000062', '9e000000-0000-4000-8000-000000000051', '9e000000-0000-4000-8000-000000000001');
insert into evaluation_result (id, evaluation_id, submission_id, user_id, outcome, rubric_version_id, activity_spec_id, activity_spec_version)
  values ('9e000000-0000-4000-8000-000000000072', '9e000000-0000-4000-8000-000000000062', '9e000000-0000-4000-8000-000000000051', '9e000000-0000-4000-8000-000000000001', 'passed', '9e000000-0000-4000-8000-000000000031', '9e000000-0000-4000-8000-000000000021', '1.0.0');
insert into assessment (id, evaluation_result_id, evaluation_id, submission_id, user_id, evaluator_kind, evaluator_ref, rubric_version_id, rubric_version, activity_spec_id, activity_spec_version, domain_ruleset_version, raw_result, outcome, total_score, max_score)
  values ('9e000000-0000-4000-8000-000000000082', '9e000000-0000-4000-8000-000000000072', '9e000000-0000-4000-8000-000000000062', '9e000000-0000-4000-8000-000000000051', '9e000000-0000-4000-8000-000000000001', 'human', 'proof', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', '0.19.0', '{}'::jsonb, 'passed', 2, 2);
insert into assessment_criterion_result (id, assessment_id, user_id, criterion_key, criterion_kind, skill_id, status, score, max_score, observations, evaluator_kind, reason) values
  ('9e000000-0000-4000-8000-000000000093', '9e000000-0000-4000-8000-000000000082', '9e000000-0000-4000-8000-000000000001', 'h1', 'skill_evidence', '9e000000-0000-4000-8000-000000000011', 'met', 2, 2, 'o', 'human', 'r');
select ps_must_fail($$insert into skill_assessment (id, assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version, activity_spec_id, activity_spec_version, rubric_resolution, claimed, outcome, basis_independently_verified, current_state, proposed_state, reason) values (gen_random_uuid(), '9e000000-0000-4000-8000-000000000082', '9e000000-0000-4000-8000-000000000072', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', 'per_skill@1', 'v', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', 'bound', true, 'met', true, 'gap', 'demonstrated', 'no criteria')$$, 'met requires the criteria it rests on', 'met requires every recorded criterion');
select ps_must_fail($$insert into skill_assessment_criterion (skill_assessment_id, assessment_criterion_result_id, user_id, criterion_key, status, score, max_score, threshold, threshold_status)
  values ('9e000000-0000-4000-8000-0000000000a1', '9e000000-0000-4000-8000-000000000091', '9e000000-0000-4000-8000-000000000001', 'h1', 'met', 2, 2, 0.5, 'approved')$$, 'criteria are recorded with their skill assessment, never added later', 'never later');
-- The next three run parent + criterion in one subtransaction, so each is refused by the rule it targets.
select ps_must_fail_after($$insert into skill_assessment (id, assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version, activity_spec_id, activity_spec_version, rubric_resolution, claimed, outcome, basis_independently_verified, current_state, proposed_state, reason) values ('9e000000-0000-4000-8000-0000000000b1', '9e000000-0000-4000-8000-000000000082', '9e000000-0000-4000-8000-000000000072', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', 'per_skill@1', 'v', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', 'bound', true, 'not_met', true, 'gap', null, 'x')$$, $$insert into skill_assessment_criterion (skill_assessment_id, assessment_criterion_result_id, user_id, criterion_key, status, score, max_score, threshold, threshold_status) values ('9e000000-0000-4000-8000-0000000000b1', '9e000000-0000-4000-8000-000000000091', '9e000000-0000-4000-8000-000000000001', 'h1', 'not_met', 0, 2, 0.5, 'approved')$$,
  'a criterion result from another assessment cannot be cited', 'belongs to another assessment');
insert into assessment_criterion_result (id, assessment_id, user_id, criterion_key, criterion_kind, skill_id, status, score, max_score, observations, evaluator_kind, reason) values
  ('9e000000-0000-4000-8000-000000000094', '9e000000-0000-4000-8000-000000000082', '9e000000-0000-4000-8000-000000000001', 'c1', 'skill_evidence', '9e000000-0000-4000-8000-000000000012', 'not_met', 0, 2, 'o', 'human', 'r');
select ps_must_fail_after($$insert into skill_assessment (id, assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version, activity_spec_id, activity_spec_version, rubric_resolution, claimed, outcome, basis_independently_verified, current_state, proposed_state, reason) values ('9e000000-0000-4000-8000-0000000000b1', '9e000000-0000-4000-8000-000000000082', '9e000000-0000-4000-8000-000000000072', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', 'per_skill@1', 'v', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', 'bound', true, 'not_met', true, 'gap', null, 'x')$$, $$insert into skill_assessment_criterion (skill_assessment_id, assessment_criterion_result_id, user_id, criterion_key, status, score, max_score, threshold, threshold_status) values ('9e000000-0000-4000-8000-0000000000b1', '9e000000-0000-4000-8000-000000000094', '9e000000-0000-4000-8000-000000000001', 'c1', 'not_met', 0, 2, 0.5, 'approved')$$,
  'a criterion measuring another skill cannot be cited', 'does not measure this skill');
select ps_must_fail_after($$insert into skill_assessment (id, assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version, activity_spec_id, activity_spec_version, rubric_resolution, claimed, outcome, basis_independently_verified, current_state, proposed_state, reason) values ('9e000000-0000-4000-8000-0000000000b1', '9e000000-0000-4000-8000-000000000082', '9e000000-0000-4000-8000-000000000072', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', 'per_skill@1', 'v', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', 'bound', true, 'not_met', true, 'gap', null, 'x')$$, $$insert into skill_assessment_criterion (skill_assessment_id, assessment_criterion_result_id, user_id, criterion_key, status, score, max_score, threshold, threshold_status) values ('9e000000-0000-4000-8000-0000000000b1', '9e000000-0000-4000-8000-000000000093', '9e000000-0000-4000-8000-000000000001', 'h1', 'met', 2, 2, 0.5, 'proposed')$$,
  'a met criterion needs an APPROVED threshold (no full-marks fallback)', 'met_has_approved_threshold');

-- ───────────────────────────── decision provenance ──────────────────────────
select ps_must_fail($$insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decision, previous_state, proposed_state, resulting_state, reason, skill_assessment_id) values ('9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000012', (select id from verification_policy where key = 'default' and version = 2), 'default', 2, 'draft', 'v', 'policy', 'accepted', 'gap', 'demonstrated', 'demonstrated', 'x', '9e000000-0000-4000-8000-0000000000a2')$$, 'accepted requires a met, verified skill assessment');
select ps_must_fail($$insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decision, previous_state, proposed_state, resulting_state, reason, skill_assessment_id) values ('9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000012', (select id from verification_policy where key = 'default' and version = 2), 'default', 2, 'draft', 'v', 'policy', 'accepted', 'gap', 'demonstrated', 'demonstrated', 'x', '9e000000-0000-4000-8000-0000000000a1')$$, 'a decision cannot borrow another skill''s assessment');
select ps_must_fail($$insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decision, previous_state, proposed_state, resulting_state, reason, skill_assessment_id) values ('9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', (select id from verification_policy where key = 'default' and version = 2), 'default', 2, 'draft', 'v', 'policy', 'accepted', 'practiced', 'demonstrated', 'demonstrated', 'x', '9e000000-0000-4000-8000-0000000000a1')$$, 'the previous state must be the skill''s own');
insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decision, previous_state, proposed_state, resulting_state, reason, skill_assessment_id)
  values ('9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', (select id from verification_policy where key = 'default' and version = 2), 'default', 2, 'draft', 'v', 'policy', 'accepted', 'gap', 'demonstrated', 'demonstrated', 'html accepted', '9e000000-0000-4000-8000-0000000000a1');
select ps_must_fail($$insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version, decided_by_kind, decision, previous_state, proposed_state, resulting_state, reason, skill_assessment_id) values ('9e000000-0000-4000-8000-000000000081', '9e000000-0000-4000-8000-000000000071', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', (select id from verification_policy where key = 'default' and version = 2), 'default', 2, 'draft', 'v', 'policy', 'accepted', 'gap', 'demonstrated', 'demonstrated', 'again', '9e000000-0000-4000-8000-0000000000a1')$$, 'idempotency: one decision per skill assessment (a human override is a new row that names what it overrides)');

-- ───────────────────────────── evidence provenance ──────────────────────────
insert into evidence (user_id, skill_id, source_strength, evaluation_result_id, provenance_class, provenance_source, skill_assessment_id)
  values ('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', 'platform_controlled', '9e000000-0000-4000-8000-000000000071', 'system_derived', 'proof', '9e000000-0000-4000-8000-0000000000a1');
select ps_must_fail($$insert into evidence (user_id, skill_id, source_strength, evaluation_result_id, provenance_class, provenance_source, skill_assessment_id) values ('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000011', 'platform_controlled', '9e000000-0000-4000-8000-000000000071', 'system_derived', 'proof', null)$$, 'F-10: one platform evidence row per (evaluation result, skill)', 'one_platform_row_per_result_skill');
select ps_must_fail($$insert into evidence (user_id, skill_id, source_strength, evaluation_result_id, provenance_class, provenance_source, skill_assessment_id) values ('9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000012', 'platform_controlled', '9e000000-0000-4000-8000-000000000071', 'system_derived', 'proof', '9e000000-0000-4000-8000-0000000000a2')$$, 'evidence cannot rest on a not_met skill assessment');
select ps_must_fail($$insert into evidence (user_id, skill_id, source_strength, evaluation_result_id, provenance_class, provenance_source, skill_assessment_id) values ('9e000000-0000-4000-8000-000000000002', '9e000000-0000-4000-8000-000000000011', 'platform_controlled', '9e000000-0000-4000-8000-000000000071', 'system_derived', 'proof', '9e000000-0000-4000-8000-0000000000a1')$$, 'tenant: evidence cannot borrow another user''s skill assessment');
select ps_must_fail($$update evidence set skill_assessment_id = null where skill_assessment_id = '9e000000-0000-4000-8000-0000000000a1'$$, 'evidence provenance is immutable after insert');

-- ───────────────────────────── inactivity seal ──────────────────────────────
select ps_expect($$select 1 from verification_policy where assessment_scope <> 'primary_claimed_skill'$$, 0, 'every existing policy keeps the legacy scope');
insert into verification_policy (key, version, description_en, assessment_scope) values ('ps_proof', 1, 'ENG-1 P2 proof: a per_skill row may exist only inactive', 'per_skill');
select ps_must_fail_after($$select set_config('naqla.config_actor', 'eng1 proof', true), set_config('naqla.config_reason', 'seal proof', true)$$,
  $$update verification_policy set activation = 'development_only' where key = 'ps_proof'$$, 'SEALED: a per_skill policy cannot be activated, even development_only (audited actor set)', 'per_skill_sealed');
select ps_must_fail_after($$select set_config('naqla.config_actor', 'eng1 proof', true), set_config('naqla.config_reason', 'seal proof', true)$$,
  $$insert into verification_policy (key, version, description_en, assessment_scope, activation) values ('ps_proof2', 1, 'x', 'per_skill', 'development_only')$$, 'SEALED: a per_skill policy cannot be born active', 'per_skill_sealed');
select ps_must_fail($$insert into verification_policy (key, version, description_en, assessment_scope, per_skill_evidence_derivation) values ('ps_proof', 2, 'x', 'per_skill', true)$$, 'per_skill and H6 are mutually exclusive', 'excludes_h6');
delete from verification_policy where key = 'ps_proof';

-- ─────────────────────────────── RLS isolation ──────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '9e000000-0000-4000-8000-000000000001';
select assert_effective_role('authenticated');
select ps_expect($$select 1 from skill_assessment$$, 2, 'user A sees their own skill assessments');
select ps_expect($$select 1 from skill_assessment_criterion$$, 2, 'user A sees their own criterion links');
select ps_must_fail($$insert into skill_assessment (id, assessment_id, evaluation_result_id, user_id, skill_id, model_version, domain_ruleset_version, rubric_version_id, rubric_version, activity_spec_id, activity_spec_version, rubric_resolution, claimed, outcome, basis_independently_verified, current_state, proposed_state, reason) values (gen_random_uuid(), '9e000000-0000-4000-8000-000000000082', '9e000000-0000-4000-8000-000000000072', '9e000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000012', 'per_skill@1', 'v', '9e000000-0000-4000-8000-000000000031', 'rub@1', '9e000000-0000-4000-8000-000000000021', '1.0.0', 'bound', true, 'blocked', false, 'gap', null, 'self-written')$$, 'a user cannot write a skill assessment for themselves', 'permission denied');
select ps_must_fail($$update evidence set skill_assessment_id = null, withdrawn_at = now(), withdrawn_reason = 'x' where skill_assessment_id is not null$$, 'a user cannot detach evidence provenance while withdrawing', 'immutable');
set request.jwt.claim.sub = '9e000000-0000-4000-8000-000000000002';
select ps_expect($$select 1 from skill_assessment$$, 0, 'user B sees none of user A''s skill assessments');
select ps_expect($$select 1 from skill_assessment_criterion$$, 0, 'user B sees none of user A''s criterion links');
reset role;
set role anon;
select ps_must_fail($$select 1 from skill_assessment$$, 'anon has no access to skill assessments', 'permission denied');
reset role;
