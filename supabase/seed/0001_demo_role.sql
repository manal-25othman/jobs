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
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   0.400, true,  null, null, null),
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

insert into rubric_version (id, activity_spec_id, version, status, criteria, published_at)
values ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'rub_fe_003@0.2.0', 'published',
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

commit;
