-- ═══════════════════════════════════════════════════════════════════════════
-- Database-level invariant proof.
--
-- Each block attempts an operation that MUST fail, and fails the whole script
-- if the database accepts it. The point is that a developer who forgets to
-- call the domain guard still cannot write a row that breaks a rule.
--
--   psql -d naqla_test -v ON_ERROR_STOP=1 -f supabase/tests/invariants.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

create or replace function must_fail(stmt text, label text) returns void
  language plpgsql as $$
  begin
    begin
      execute stmt;
    exception when others then
      raise notice 'PASS  %  (rejected: %)', label, replace(SQLERRM, E'\n', ' ');
      return;
    end;
    raise exception 'FAIL  %  — the database ACCEPTED a row that breaks this rule', label;
  end;
  $$;

create or replace function must_succeed(stmt text, label text) returns void
  language plpgsql as $$
  begin
    execute stmt;
    raise notice 'PASS  %  (accepted)', label;
  end;
  $$;

-- ───────────────────────────── fixtures ────────────────────────────────────

insert into app_user (id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Test User'),
  ('22222222-2222-4222-8222-222222222222', 'Reviewer');

insert into skill (id, slug, label_ar, label_en, provenance_class, provenance_source)
  values ('33333333-3333-4333-8333-333333333333', 'ui-state', 'إدارة حالة الواجهة',
          'UI state management', 'curated', 'track pack trk_frontend_junior');

insert into target_role (id, slug, label_ar, label_en, track_id, source_label,
                         provenance_class, provenance_source)
  values ('44444444-4444-4444-8444-444444444444', 'frontend-junior', 'مطوّر واجهات',
          'Frontend Developer', 'trk_frontend_junior', 'reviewed role definition',
          'curated', 'role pack v0.2.0');

-- Test fixtures are DEMO content: only a demo fixture may be born published (non-production).
insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec, published_at, is_demo_fixture)
  values ('55555555-5555-4555-8555-555555555555', 'act_fe_003', '0.2.0', 'published',
          'اختبار الواجهات', 'ai_assisted', '{}'::jsonb, now(), true);

insert into rubric_version (id, activity_spec_id, version, status, criteria, published_at, is_demo_fixture)
  values ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555',
          '0.2.0', 'published', '[]'::jsonb, now(), true);

insert into project (id, user_id, title, kind, activity_spec_id, activity_spec_version)
  values ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111',
          'Habit tracker', 'platform_activity', '55555555-5555-4555-8555-555555555555', '0.2.0');

insert into submission (id, project_id, user_id, state, locked_at)
  values ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777',
          '11111111-1111-4111-8111-111111111111', 'locked', now());

insert into evaluation (id, submission_id, user_id, state)
  values ('99999999-9999-4999-8999-999999999999', '88888888-8888-4888-8888-888888888888',
          '11111111-1111-4111-8111-111111111111', 'completed');

-- ───────────────────────────── INV-2 / INV-7 ───────────────────────────────

select must_fail($$
  insert into evaluation_result (evaluation_id, submission_id, user_id, outcome)
  values ('99999999-9999-4999-8999-999999999999', '88888888-8888-4888-8888-888888888888',
          '11111111-1111-4111-8111-111111111111', 'passed')
$$, 'INV-2/INV-7: a scored result with no rubric or spec version');

select must_succeed($$
  insert into evaluation_result (id, evaluation_id, submission_id, user_id, outcome,
                                 rubric_version_id, activity_spec_id, activity_spec_version)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '99999999-9999-4999-8999-999999999999', '88888888-8888-4888-8888-888888888888',
          '11111111-1111-4111-8111-111111111111', 'passed',
          '66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', '0.2.0')
$$, 'INV-2/INV-7: a scored result carrying both versions');

select must_succeed($$
  insert into evaluation_result (evaluation_id, submission_id, user_id, outcome)
  values ('99999999-9999-4999-8999-999999999999', '88888888-8888-4888-8888-888888888888',
          '11111111-1111-4111-8111-111111111111', 'undetermined')
$$, 'safe mode: an undetermined result needs no rubric, because it carries no score');

select must_fail($$
  insert into evaluation_criterion_score (evaluation_result_id, criterion_key, score, max_score, rationale)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c1', 4, 4, '   ')
$$, 'a criterion score with no written justification');

select must_fail($$
  insert into evaluation_criterion_score (evaluation_result_id, criterion_key, score, max_score, rationale)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c2', 9, 4, 'out of range')
$$, 'a criterion score outside its range');

-- ───────────────────────────────── INV-1 ───────────────────────────────────

select must_fail($$
  insert into skill_claim (user_id, skill_id, state, state_reason)
  values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
          'demonstrated', 'no evidence attached')
$$, 'INV-1: a demonstrated claim with no evidence');

select must_succeed($$
  insert into evidence (id, user_id, skill_id, source_strength, evaluation_result_id,
                        provenance_class, provenance_source)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
          '33333333-3333-4333-8333-333333333333', 'platform_controlled',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'system_derived', 'evaluation aaaaaaaa')
$$, 'evidence derived from a real evaluation');

select must_fail($$
  insert into evidence (user_id, skill_id, source_strength, provenance_class, provenance_source)
  values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
          'platform_controlled', 'system_derived', 'nothing')
$$, 'platform-strength evidence with no evaluation behind it');

select must_succeed($$
  insert into skill_claim (id, user_id, skill_id, state, primary_evidence_id, state_reason)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
          'demonstrated', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'short check passed 4/4')
$$, 'INV-1: a demonstrated claim backed by evidence');

select must_fail($$
  insert into skill_claim (user_id, skill_id, state, state_reason)
  values ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
          'gap', 'gap should not be storable')
$$, 'gap is the absence of a claim and must not be a stored row');

-- ──────────────────────── evidence transitions ─────────────────────────────

select must_fail($$
  insert into evidence_transition (skill_claim_id, user_id, from_state, to_state,
                                   transition_rule_id, actor_kind, reason)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111',
          'demonstrated', 'practiced', 'T-BACKWARD', 'system', 'demotion')
$$, 'forward-only ladder: a backward transition');

select must_fail($$
  insert into evidence_transition (skill_claim_id, user_id, from_state, to_state,
                                   transition_rule_id, actor_kind, reason, evaluation_result_id)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111',
          'practiced', 'demonstrated', 'T-DEMO', 'ai_agent', 'agent promoted it',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
$$, 'INV-3: an AI agent as the actor on a graph write');

select must_fail($$
  insert into evidence_transition (skill_claim_id, user_id, from_state, to_state,
                                   transition_rule_id, actor_kind, reason)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111',
          'practiced', 'demonstrated', 'T-DEMO', 'system', 'no evaluation')
$$, 'promotion to demonstrated with no evaluation');

select must_fail($$
  insert into evidence_transition (skill_claim_id, user_id, from_state, to_state,
                                   transition_rule_id, actor_kind, reason, evaluation_result_id)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111',
          'demonstrated', 'verified', 'T-VERIFY', 'system', 'automatic verification',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
$$, 'verified granted with no named human reviewer');

select must_fail($$
  insert into evidence_transition (skill_claim_id, user_id, from_state, to_state,
                                   transition_rule_id, actor_kind, reason, evaluation_result_id)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111',
          'practiced', 'demonstrated', 'T-DEMO', 'system', '   ',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
$$, 'INV-8: a transition with no recorded reason');

select must_succeed($$
  insert into evidence_transition (skill_claim_id, user_id, from_state, to_state,
                                   transition_rule_id, actor_kind, reason, evaluation_result_id)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111',
          'practiced', 'demonstrated', 'T-DEMO-FROM-PRACTICED', 'system',
          'short check passed: V1, V2, V3 satisfied', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
$$, 'a legitimate forward transition with an evaluation and a reason');

-- ───────────────────────────────── INV-4 ───────────────────────────────────

select must_fail($$
  insert into market_fact (statement, provenance_class, provenance_source, observed_at)
  values ('most employers want this', 'ai_generated', 'model', current_date)
$$, 'INV-4: a market claim resting on model output');

select must_fail($$
  insert into role_requirement (target_role_id, skill_id, weight, demand_ratio)
  values ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 0.3, 0.7)
$$, 'INV-4: a demand ratio with no source or observation date');

select must_succeed($$
  insert into role_requirement (target_role_id, skill_id, weight, demand_ratio,
                                demand_source, demand_observed_at)
  values ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333',
          0.3, 0.7, 'job-ad sample 2026-09', current_date)
$$, 'INV-4: a sourced, dated demand ratio');

-- ─────────────────────── human review and assets ───────────────────────────

select must_fail($$
  insert into human_review (evaluation_id, reviewer_id, role_performed, state, decision)
  values ('99999999-9999-4999-8999-999999999999', '22222222-2222-4222-8222-222222222222',
          'human_reviewer', 'decided', 'accept')
$$, 'FR-P-037: a review decision with no written justification');

select must_fail($$
  insert into professional_asset (user_id, kind, title, body, provenance_class,
                                  provenance_source, published_at)
  values ('11111111-1111-4111-8111-111111111111', 'cv_bullet', 'x', 'y',
          'system_derived', 'evidence bbbbbbbb', now())
$$, 'an asset published without user approval');

select must_fail($$
  insert into share_link (user_id, resource_kind, resource_id, token_hash, expires_at, indexable)
  values ('11111111-1111-4111-8111-111111111111', 'case_study',
          '77777777-7777-4777-8777-777777777777', 'hash1', now() + interval '30 days', true)
$$, 'an indexable share link while OPEN-016 is unresolved');

select must_fail($$
  insert into submission_file (submission_id, user_id, bucket, object_path, content_type,
                               size_bytes, checksum_sha256, privacy_class)
  values ('88888888-8888-4888-8888-888888888888', '11111111-1111-4111-8111-111111111111',
          'submissions', 'a/b.zip', 'application/zip', 10, 'abc', 'private_publishable')
$$, 'a raw upload marked publishable');

select must_fail($$
  insert into readiness_score (user_id, kind, value, weights_version, triggered_by_event)
  values ('11111111-1111-4111-8111-111111111111', 'cv', 74, 'v1', 'profile.field_filled')
$$, 'a score moved by filling in a profile field');

select must_succeed($$
  insert into readiness_score (user_id, kind, value, weights_version, triggered_by_event)
  values ('11111111-1111-4111-8111-111111111111', 'cv', 74, 'v1', 'evidence.created')
$$, 'a score moved by evidence being created');

select must_fail($$
  insert into audit_event (event_type, actor_kind, subject_table, reason)
  values ('claim.promoted', 'system', 'skill_claim', '  ')
$$, 'INV-8: an audit event with no reason');

select must_fail($$
  insert into activity_spec (slug, version, title_ar, ai_usage_mode, spec, can_yield_verified)
  values ('act_x', '0.1.0', 'x', 'ai_assisted', '{}'::jsonb, true)
$$, 'D-030: an activity that yields Verified without SME approval');

select must_fail($$
  insert into ai_disclosure (submission_id, user_id, mode, declared_use)
  values ('88888888-8888-4888-8888-888888888888', '11111111-1111-4111-8111-111111111111',
          'ai_prohibited', array['wrote the tests'])
$$, 'declared AI authoring on an ai_prohibited activity');

select must_fail($$
  insert into learning_resource (skill_id, title, provenance_class, provenance_source,
                                 verification_status)
  values ('33333333-3333-4333-8333-333333333333', 'Some course', 'curated', 'manual',
          'verified')
$$, 'a learning resource marked verified with no URL');

\echo ''
\echo 'All database-level invariant checks passed.'

-- ──────────────────── Career Data Foundation review guards ─────────────────

select must_fail($$
  insert into activity_spec (slug, version, status, title_ar, ai_usage_mode, published_at)
  values ('act_real', '1.0.0', 'published', 'نشاط', 'ai_assisted', now())
$$, 'CDF: real content cannot be born published');

select must_fail($$
  update skill set review_status = 'approved' where id = '33333333-3333-4333-8333-333333333333'
$$, 'CDF: draft → approved skips review');

select must_succeed($$
  update skill set review_status = 'curated' where id = '33333333-3333-4333-8333-333333333333'
$$, 'CDF: draft → curated by the content author');

select must_fail($$
  update skill set review_status = 'sme_reviewed' where id = '33333333-3333-4333-8333-333333333333'
$$, 'CDF: sme_reviewed without a named reviewer');

select must_fail($$
  update skill set review_status = 'published' where id = '33333333-3333-4333-8333-333333333333'
$$, 'CDF: curated → published on real content');

select must_fail($$
  delete from skill where id = '33333333-3333-4333-8333-333333333333'
$$, 'CDF: a skill is never deleted (canonical ids are never reused)');

select must_fail($$
  insert into skill_synonym (skill_id, relation, surface_form, language, related_skill_id)
  values ('33333333-3333-4333-8333-333333333333', 'equivalent', 'state handling', 'en', '33333333-3333-4333-8333-333333333333')
$$, 'CDF: an equivalent synonym pointing at another skill is a merge');

select must_succeed($$
  insert into skill_family (id, code, name_ar, name_en, is_demo_fixture, review_status)
  values ('33333333-3333-4333-8333-333333333334', 'demo_family', 'عائلة تجريبية', 'Demo family', true, 'curated')
$$, 'CDF: a DEMO fixture may be seeded as curated');
select must_fail($$
  update skill_family set review_status = 'sme_reviewed', reviewed_by = '22222222-2222-4222-8222-222222222222', reviewed_at = now()
   where id = '33333333-3333-4333-8333-333333333334'
$$, 'CDF: a DEMO fixture is never SME reviewed, even with a reviewer named');
select must_fail($$
  update skill_family set review_status = 'approved', reviewed_by = '22222222-2222-4222-8222-222222222222', reviewed_at = now()
   where id = '33333333-3333-4333-8333-333333333334'
$$, 'CDF: a DEMO fixture is never approved');

select must_fail($$
  insert into rubric_criterion (rubric_version_id, key, name_ar, name_en, dimension, linked_skill_id, source, weight, max_score,
    evaluator_type, human_review_required, check_type, description_ar, description_en, expected_evidence_ar, expected_evidence_en,
    rationale_when_met_ar, rationale_when_unmet_ar)
  values ('66666666-6666-4666-8666-666666666666', 'x', 'x', 'x', 'correctness', '33333333-3333-4333-8333-333333333333', 'activity', 1, 1,
    'human', true, 'none', 'x', 'x', 'x', 'x', 'x', 'x')
$$, 'CDF: criteria of a published rubric are frozen');

select must_fail($$
  insert into career_presentation_rule (asset_type, evidence_level, allowed, allowed_claim_verbs_en, must_cite_evidence)
  values ('cv_bullet', 'demonstrated', true, '{built}', false)
$$, 'CDF: a presentation rule must always cite evidence');

select must_fail($$
  insert into learning_resource (skill_id, title, url, provenance_class, provenance_source, quality_status)
  values ('33333333-3333-4333-8333-333333333333', 'x', null, 'curated', 'x', 'approved')
$$, 'CDF: a resource without a URL cannot be approved');

