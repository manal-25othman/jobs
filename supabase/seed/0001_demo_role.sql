-- ═══════════════════════════════════════════════════════════════════════════
-- Demo fixture: one target role, its skills, one activity, one rubric.
--
-- EVERYTHING HERE IS MARKED is_demo_fixture = true.
--
-- It is NOT SME-approved, so `can_yield_verified` stays false and no activity
-- seeded here can ever produce Verified evidence (D-030, enforced by
-- activity_spec_verified_needs_sme). This is fixture data for one demo role,
-- not curated content.
--
-- Frontend Developer is a SAMPLE role. Nothing in the schema, the domain or
-- the UI is specific to it: the same rows shape a Data Analyst or a BI track.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────── skills ────────────────────────────────────

insert into skill (id, slug, label_ar, label_en, family, provenance_class, provenance_source, is_demo_fixture)
values
  ('a0000000-0000-4000-8000-000000000001', 'ui-state-management', 'إدارة حالة الواجهة', 'UI state management',
   'frontend', 'curated', 'demo fixture: trk_frontend_junior v0.2.0', true),
  ('a0000000-0000-4000-8000-000000000002', 'ui-testing', 'اختبار الواجهات', 'UI testing',
   'frontend', 'curated', 'demo fixture: trk_frontend_junior v0.2.0', true),
  ('a0000000-0000-4000-8000-000000000003', 'component-building', 'بناء المكونات', 'Component building',
   'frontend', 'curated', 'demo fixture: trk_frontend_junior v0.2.0', true)
on conflict (id) do nothing;

-- ──────────────────────────── target role ──────────────────────────────────

insert into target_role (id, slug, label_ar, label_en, track_id, review_status,
                         source_label, provenance_class, provenance_source, is_demo_fixture)
values ('b0000000-0000-4000-8000-000000000001', 'frontend-developer',
        'مطوّرة واجهات أمامية', 'Frontend Developer', 'trk_frontend_junior',
        'draft',
        'demo fixture — not a reviewed role definition',
        'curated', 'demo fixture: trk_frontend_junior v0.2.0', true)
on conflict (id) do nothing;

-- review_status stays `draft` on purpose: the UI must show
-- "البيانات غير مكتملة بعد" for an unreviewed role rather than presenting
-- fixture requirements as if they were validated.

-- ───────────────────────── role requirements ───────────────────────────────
-- Demand ratios carry a source and an observation date, or the INV-4
-- constraint refuses them. This fixture's "source" is honestly labelled.

insert into role_requirement (target_role_id, skill_id, weight, is_core,
                              demand_ratio, demand_source, demand_observed_at)
values
  -- ui-state-management is NOT core here: the demo activity does not measure it, and a
  -- core skill without an evidence path fails quality rule Q06 (a real finding of the
  -- Career Data Foundation validation against this fixture).
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   0.400, false, null, null, null),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   0.350, true,  null, null, null),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
   0.250, false, null, null, null)
on conflict (target_role_id, skill_id) do nothing;

-- demand_ratio is deliberately NULL: this fixture has no real job-ad sample
-- behind it, and INV-4 forbids a market number without a dated source.
-- A fabricated "7 of 10 ads" here would be exactly the invented statistic the
-- invariant exists to prevent.

-- ─────────────────────────── activity spec ─────────────────────────────────

insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode,
                           estimated_minutes, spec, published_at, can_yield_verified, is_demo_fixture)
values ('c0000000-0000-4000-8000-000000000001', 'act_fe_003', '0.2.0', 'published',
        'اختبار الواجهات — تحقق قصير', 'ai_assisted', 20,
        jsonb_build_object(
          'summary', 'A short check: prove the habit-list component holds up under empty, loading and error states.',
          'deliverables', jsonb_build_array(
            'Tests for the empty and loading states',
            'A test for the error state plus a message the user can read',
            'A short note on what the tests cover and what they do not'
          )
        ),
        now(), false, true)
on conflict (id) do nothing;

-- can_yield_verified = false: no SME has approved this fixture (D-030).

-- ──────────────────────────── rubric version ───────────────────────────────

insert into rubric_version (id, activity_spec_id, version, status, is_demo_fixture, pass_threshold, proposes_state, criteria, published_at)
values ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'rub_fe_003@0.2.0', 'curated', true, 1.0, 'demonstrated',
        jsonb_build_object(
          'passThreshold', 1.0,
          'proposesState', 'demonstrated',
          'criteria', jsonb_build_array(
            jsonb_build_object(
              'key', 'empty_state_test', 'label', 'اختبار الحالة الفارغة',
              'maxScore', 1, 'skillId', 'a0000000-0000-4000-8000-000000000002',
              'mandatory', true,
              'check', jsonb_build_object('type','artifact_present','artifactKey','test.empty_state'),
              'rationaleWhenMet', 'يوجد اختبار يغطّي الحالة الفارغة.',
              'rationaleWhenUnmet', 'لا يوجد اختبار يغطّي الحالة الفارغة.'),
            jsonb_build_object(
              'key', 'loading_state_test', 'label', 'اختبار حالة التحميل',
              'maxScore', 1, 'skillId', 'a0000000-0000-4000-8000-000000000002',
              'mandatory', true,
              'check', jsonb_build_object('type','artifact_present','artifactKey','test.loading_state'),
              'rationaleWhenMet', 'يوجد اختبار يغطّي حالة التحميل.',
              'rationaleWhenUnmet', 'لا يوجد اختبار يغطّي حالة التحميل.'),
            jsonb_build_object(
              'key', 'error_message_visible', 'label', 'رسالة خطأ يراها المستخدم',
              'maxScore', 1, 'skillId', 'a0000000-0000-4000-8000-000000000002',
              'mandatory', true,
              'check', jsonb_build_object('type','artifact_present','artifactKey','test.error_message'),
              'rationaleWhenMet', 'مسار الخطأ يعرض رسالة مفهومة للمستخدم.',
              'rationaleWhenUnmet', 'مسار الخطأ لا يعرض رسالة للمستخدم.'),
            jsonb_build_object(
              'key', 'coverage_note', 'label', 'ملاحظة التغطية',
              'maxScore', 1, 'skillId', 'a0000000-0000-4000-8000-000000000002',
              'mandatory', false,
              'check', jsonb_build_object('type','artifact_text','artifactKey','note.coverage','minLength',20),
              'rationaleWhenMet', 'توجد ملاحظة تبيّن ما غطّته الاختبارات وما لم تغطِّه.',
              'rationaleWhenUnmet', 'لا توجد ملاحظة تغطية.')
          )
        ),
        now())
on conflict (id) do nothing;

-- ───────────────────────── integrity check specs ───────────────────────────

insert into integrity_check_spec (activity_spec_id, key, classification, blocking,
                                  check_definition, user_facing_message)
values
  ('c0000000-0000-4000-8000-000000000001', 'files_present', 'user_facing', true,
   jsonb_build_object('type','all_of','artifactKeys', jsonb_build_array('file.component','file.test')),
   'يلزم إرفاق المكوّن وملف اختباره معًا.'),
  ('c0000000-0000-4000-8000-000000000001', 'tests_reference_component', 'assessment_only', false,
   jsonb_build_object('type','artifact_present','artifactKey','signal.tests_reference_component'),
   null)
on conflict (activity_spec_id, key) do nothing;


-- ═══════════════ Career Data Foundation: the same fixture, normalized ═══════
-- DEMO / DRAFT / NOT SME APPROVED. Every row below is is_demo_fixture = true.
-- The global registry rows here (family, scale, policy, source) carry the same
-- codes the Frontend pack uses, so the import upserts them rather than
-- duplicating them.

insert into data_source (id, code, source_type, source_name, publisher, jurisdiction, language, url, version,
                         license_or_usage_notes, reliability, review_status, is_demo_fixture)
values ('e0000000-0000-4000-8000-000000000001', 'src_naqla_demo_fixture', 'curated', 'NAQLA demo fixture (Slice 1)', 'NAQLA', 'global', 'ar',
        null, 'slice-1', 'Platform-authored demo content. DEMO / DRAFT / NOT SME APPROVED. Not a reviewed source.', 'low', 'draft', true)
on conflict (id) do nothing;

insert into skill_family (id, code, name_ar, name_en, review_status, is_demo_fixture)
values ('f0000000-0000-4000-8000-000000000001', 'ui_engineering', 'هندسة الواجهات', 'UI engineering', 'draft', true),
       ('f0000000-0000-4000-8000-000000000002', 'quality_engineering', 'جودة البرمجيات', 'Quality engineering', 'draft', true)
on conflict (id) do nothing;

insert into proficiency_scale (id, code, version, name_ar, name_en, review_status, is_demo_fixture)
values ('f1000000-0000-4000-8000-000000000001', 'scale_default', '1.0.0', 'مقياس الإتقان الافتراضي', 'Default proficiency scale', 'draft', true)
on conflict (id) do nothing;
insert into proficiency_level (scale_id, level_key, ordinal, label_ar, label_en, descriptor_ar, descriptor_en)
values ('f1000000-0000-4000-8000-000000000001', 'foundation', 1, 'أساس', 'Foundation', 'يعرف المفاهيم ويطبّقها بإرشاد', 'Knows the concepts and applies them with guidance'),
       ('f1000000-0000-4000-8000-000000000001', 'working', 2, 'عملي', 'Working', 'ينجز مهام معتادة باستقلالية على نطاق محدود', 'Completes routine tasks independently within a bounded scope'),
       ('f1000000-0000-4000-8000-000000000001', 'independent', 3, 'مستقل', 'Independent', 'يتعامل مع مهام غير معتادة ويشرح قراراته', 'Handles non-routine tasks and explains decisions'),
       ('f1000000-0000-4000-8000-000000000001', 'advanced', 4, 'متقدم', 'Advanced', 'يقود التصميم ويراجع عمل الآخرين', 'Leads design and reviews others'' work')
on conflict do nothing;

insert into recency_policy (id, code, applies_to, current_window_months, aging_window_months, stale_after_months, refresh_method, rationale, policy_version, review_status, is_demo_fixture)
values ('f2000000-0000-4000-8000-000000000001', 'rp_practice', 'skill_family:ui_engineering', 24, 36, 48, 'new evaluated evidence',
        'Initial window for calibration only (D-023). Practice skills age slower than tools, faster than behaviour.', '0.1.0', 'draft', true)
on conflict (id) do nothing;

update skill set
  skill_family_id = case slug when 'ui-testing' then 'f0000000-0000-4000-8000-000000000002'::uuid else 'f0000000-0000-4000-8000-000000000001'::uuid end,
  skill_type = 'supporting', ai_substitutability = 'medium', recency_policy_id = 'f2000000-0000-4000-8000-000000000001',
  proficiency_scale_id = 'f1000000-0000-4000-8000-000000000001', evidence_types_possible = '{artifact,decision_rationale}',
  description_en = coalesce(description_en, 'Demo fixture skill (Slice 1). DEMO / DRAFT / NOT SME APPROVED.'),
  description_ar = coalesce(description_ar, 'مهارة تجريبية (الشريحة ١). تجريبية / مسودة / غير معتمدة من SME.'),
  observable_indicators_en = case when observable_indicators_en = '{}' then array['(demo fixture) indicator to be written by the content author'] else observable_indicators_en end,
  observable_indicators_ar = case when observable_indicators_ar = '{}' then array['(تجريبي) مؤشر يكتبه مؤلف المحتوى'] else observable_indicators_ar end,
  is_demo_fixture = true
where id in ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003');

update target_role set level = 'junior', family = 'software_engineering',
  description_en = coalesce(description_en, 'Demo fixture role (Slice 1). DEMO / DRAFT / NOT SME APPROVED.'),
  description_ar = coalesce(description_ar, 'دور تجريبي (الشريحة ١). تجريبي / مسودة / غير معتمد من SME.')
where id = 'b0000000-0000-4000-8000-000000000001';

update role_requirement set is_demo_fixture = true, importance = case when is_core then 'high'::importance_level else 'medium'::importance_level end,
  target_proficiency = 'working', evidence_type_expected = '{artifact}', minimum_evidence_count = case when is_core then 2 else 1 end,
  why_required_en = coalesce(why_required_en, '(demo fixture) reason to be written by the content author'),
  why_required_ar = coalesce(why_required_ar, '(تجريبي) السبب يكتبه مؤلف المحتوى')
where target_role_id = 'b0000000-0000-4000-8000-000000000001';

update activity_spec set target_role_id = 'b0000000-0000-4000-8000-000000000001', level = 'junior', title_en = 'UI testing — a short check',
  business_context_en = 'A small product team needs the habit list to be safe to ship: it must not go blank or hang on bad data.',
  business_context_ar = 'فريق منتج صغير يحتاج أن تكون قائمة العادات آمنة للنشر: لا تفرغ ولا تتجمّد عند بيانات سيئة.',
  objective_en = 'Prove the habit-list component holds up under empty, loading and error states.',
  objective_ar = 'أثبتي أن مكوّن قائمة العادات يصمد في الحالات الفارغة وحالة التحميل وحالة الخطأ.'
where id = 'c0000000-0000-4000-8000-000000000001';

insert into activity_deliverable (activity_spec_id, key, format, mandatory, description_ar, description_en, position) values
  ('c0000000-0000-4000-8000-000000000001', 'file.component', 'source file', true, 'ملف المكوّن', 'The component source file', 0),
  ('c0000000-0000-4000-8000-000000000001', 'file.test', 'source file', true, 'ملف الاختبار', 'The test file', 1),
  ('c0000000-0000-4000-8000-000000000001', 'note.coverage', 'text', false, 'ملاحظة التغطية', 'A short note on what the tests cover and do not', 2)
on conflict do nothing;
insert into activity_skill (activity_spec_id, skill_id, depth) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'primary'),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'secondary')
on conflict do nothing;
update integrity_check_spec set check_type = 'followup_modification', location_en = 'submission form',
  expected_user_behavior_en = 'attaches both files'
where activity_spec_id = 'c0000000-0000-4000-8000-000000000001' and key = 'files_present';
update integrity_check_spec set check_type = 'deterministic_signal', location_en = 'test file',
  expected_user_behavior_en = 'tests import and exercise the component under test',
  raw_ai_output_behavior_en = 'tests that assert on a copy of the component rather than importing it'
where activity_spec_id = 'c0000000-0000-4000-8000-000000000001' and key = 'tests_reference_component';

-- The same four criteria as rows. The evaluator reads these; the JSONB above is a legacy snapshot.
insert into rubric_criterion (rubric_version_id, key, position, name_ar, name_en, dimension, linked_skill_id, source, weight, max_score, mandatory,
  threshold_for_skill, evaluator_type, human_review_required, check_type, check_artifact_key, check_min_length,
  description_ar, description_en, expected_evidence_ar, expected_evidence_en, rationale_when_met_ar, rationale_when_unmet_ar) values
  ('d0000000-0000-4000-8000-000000000001', 'empty_state_test', 0, 'اختبار الحالة الفارغة', 'Empty-state test', 'correctness', 'a0000000-0000-4000-8000-000000000002', 'activity', 1, 1, true, 1.0, 'rule', false,
   'artifact_present', 'test.empty_state', null, 'يوجد اختبار للحالة الفارغة', 'A test covers the empty state', 'اختبار يُصرِّح بالحالة الفارغة', 'A test asserting the empty state', 'يوجد اختبار يغطّي الحالة الفارغة.', 'لا يوجد اختبار يغطّي الحالة الفارغة.'),
  ('d0000000-0000-4000-8000-000000000001', 'loading_state_test', 1, 'اختبار حالة التحميل', 'Loading-state test', 'correctness', 'a0000000-0000-4000-8000-000000000002', 'activity', 1, 1, true, 1.0, 'rule', false,
   'artifact_present', 'test.loading_state', null, 'يوجد اختبار لحالة التحميل', 'A test covers the loading state', 'اختبار يُصرِّح بحالة التحميل', 'A test asserting the loading state', 'يوجد اختبار يغطّي حالة التحميل.', 'لا يوجد اختبار يغطّي حالة التحميل.'),
  ('d0000000-0000-4000-8000-000000000001', 'error_message_visible', 2, 'رسالة خطأ يراها المستخدم', 'Visible error message', 'correctness', 'a0000000-0000-4000-8000-000000000002', 'activity', 1, 1, true, 1.0, 'rule', false,
   'artifact_present', 'test.error_message', null, 'مسار الخطأ يعرض رسالة', 'The error path shows a message', 'اختبار يُصرِّح برسالة الخطأ', 'A test asserting the error message', 'مسار الخطأ يعرض رسالة مفهومة للمستخدم.', 'مسار الخطأ لا يعرض رسالة للمستخدم.'),
  ('d0000000-0000-4000-8000-000000000001', 'coverage_note', 3, 'ملاحظة التغطية', 'Coverage note', 'communication', 'a0000000-0000-4000-8000-000000000002', 'activity', 1, 1, false, null, 'rule', false,
   'artifact_text', 'note.coverage', 20, 'ملاحظة عمّا غطّته الاختبارات', 'A note on what the tests cover', 'نص الملاحظة', 'The note text', 'توجد ملاحظة تبيّن ما غطّته الاختبارات وما لم تغطِّه.', 'لا توجد ملاحظة تغطية.')
on conflict do nothing;
insert into rubric_criterion_level (criterion_id, level_key, score, descriptor_ar, descriptor_en, observable_evidence_en)
select c.id, l.level_key, l.score, l.d_ar, l.d_en, l.obs from rubric_criterion c
  cross join (values ('unmet', 0, 'غير مستوفى', 'Unmet', 'the artifact is absent'), ('met', 1, 'مستوفى', 'Met', 'the artifact is present')) as l(level_key, score, d_ar, d_en, obs)
 where c.rubric_version_id = 'd0000000-0000-4000-8000-000000000001'
on conflict do nothing;

-- Criteria in place: the demo rubric may now be published (DEMO shortcut: curated → published, non-production only).
update rubric_version set status = 'published' where id = 'd0000000-0000-4000-8000-000000000001' and status = 'curated';

-- provenance: every fixture record traces to the demo source
insert into source_ref (entity_kind, entity_id, source_id, note_en)
select k::career_entity_kind, i::uuid, 'e0000000-0000-4000-8000-000000000001', 'demo fixture' from (values
  ('skill','a0000000-0000-4000-8000-000000000001'), ('skill','a0000000-0000-4000-8000-000000000002'), ('skill','a0000000-0000-4000-8000-000000000003'),
  ('target_role','b0000000-0000-4000-8000-000000000001'), ('activity_spec','c0000000-0000-4000-8000-000000000001'),
  ('rubric_version','d0000000-0000-4000-8000-000000000001'), ('skill_family','f0000000-0000-4000-8000-000000000001'), ('skill_family','f0000000-0000-4000-8000-000000000002'),
  ('proficiency_scale','f1000000-0000-4000-8000-000000000001'), ('recency_policy','f2000000-0000-4000-8000-000000000001')) as v(k, i)
on conflict do nothing;
insert into source_ref (entity_kind, entity_id, source_id, note_en)
select 'role_requirement', id, 'e0000000-0000-4000-8000-000000000001', 'demo fixture' from role_requirement where target_role_id = 'b0000000-0000-4000-8000-000000000001'
on conflict do nothing;
insert into source_ref (entity_kind, entity_id, source_id, note_en)
select 'rubric_criterion', id, 'e0000000-0000-4000-8000-000000000001', 'demo fixture' from rubric_criterion where rubric_version_id = 'd0000000-0000-4000-8000-000000000001'
on conflict do nothing;

commit;
