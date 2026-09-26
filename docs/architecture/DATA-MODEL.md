# نَقْلة / NAQLA — Data Model (PostgreSQL / Supabase)
**الإصدار:** 0.1.0 · **التاريخ:** 2026-09-26 · **الحالة:** مطبَّق ومُختبَر على PostgreSQL 16

> الملفات: `supabase/migrations/0001_init.sql` · `0002_rls.sql`
> الاختبارات: `supabase/tests/invariants.sql` · `supabase/tests/rls.sql` · المشغِّل `scripts/db-test.sh`

---

## ٠. حالة التحقق

| ما جرى | النتيجة |
|---|---|
| تشغيل المخطط على PostgreSQL 16 فعليًا | ✅ **٤٢ جدولًا** أُنشئت بلا خطأ |
| إثبات الثوابت على مستوى القاعدة | ✅ **٢٩ فحصًا**، كل واحد منها محاولة كتابة **يجب أن تُرفض** |
| إثبات نموذج الوصول (RLS) | ✅ بثلاثة أدوار حقيقية: `authenticated` ×٢ و`anon` |
| تغطية RLS | ✅ **٤٢ من ٤٢** جدولًا، `enable` + **`force`** · **٤٦ سياسة** |

> **ملاحظة صدق على الاختبار نفسه:** النسخة الأولى من اختبار RLS استعملت `SET LOCAL` خارج معاملة، وهو **أمر بلا أثر**. فمرّ الاختبار كاملًا بينما كان يعمل بصلاحية superuser التي **تتجاوز RLS أصلًا** — أي أنه كان يثبت لا شيء.
> صُحِّح إلى `SET ROLE` على مستوى الجلسة، وأُضيف حارس `assert_effective_role()` **يفشل الاختبار** إن لم يتبدّل الدور فعلًا أو كان الدور يتجاوز RLS. الحارس موجود تحديدًا حتى لا يتكرر هذا الصنف من النجاح الكاذب.

---

## ١. القرارات البنيوية

### ١.١ المُعرِّفات والأزمنة
- **`uuid` مفتاحًا أساسيًا** في كل جدول، تولّده القاعدة (`gen_random_uuid()`).
  السبب: الأصول المهنية والروابط العامة تُشارَك، والمعرّف المتسلسل يكشف حجم المنصة ويسمح بالتخمين.
- `created_at` في كل جدول · `updated_at` مع مُحفِّز `touch_updated_at()` في كل جدول قابل للتعديل.

### ١.٢ الأنواع المُعدَّدة بدل نص + `CHECK`
`evidence_state` · `evaluation_outcome` · `verification_outcome` · `provenance_class` · `ai_usage_mode` · `visibility` · `privacy_class` · `actor_kind` · `role_performed` · `content_status` · `evidence_source_strength`.

**السبب:** قيمة خارج المجموعة **لا تُدخَل أصلًا**، ولا تحتاج مراجعة كود لاكتشافها. ونوع مُعدَّد يظهر في مخطط القاعدة فيقرأه أي مطور جديد بلا وثيقة.

### ١.٣ الملكية والعزل
كل جدول يحمل بيانات شخصية فيه `user_id` صريح **حتى حين يمكن اشتقاقه** عبر علاقة.
**السبب:** سياسة RLS على عمود مباشر هي فحص مساواة واحد؛ وعبر ثلاث وصلات تصير استعلامًا فرعيًا يخضع بدوره لـRLS — وهو بالضبط الخطأ الذي أوقع سياسة رابط المشاركة أول مرة. التكرار هنا **قرار أمني لا إهمال تطبيعي**.

`org_id` على `app_user` محفوظ من Phase 1 (D-032) بلا أي ميزة مؤسسية.

### ١.٤ الثوابت كقيود قاعدة

| الثابت | كيف فُرض |
|---|---|
| **INV-1** لا ادعاء بلا دليل | `claim_requires_evidence` — شرط على الرتبة + مفتاح أجنبي إلى `evidence` |
| **INV-2** لا تقييم بلا رُبريك منشور | `evaluation_result_scored_needs_rubric` |
| **INV-3** الوكلاء يقترحون ولا يكتبون | `transition_actor_is_not_agent` + **منع RLS** للكتابة على `skill_claim`/`evidence` |
| **INV-4** لا معلومة سوقية بلا مصدر | `role_requirement_demand_sourced` + `market_fact_provenance_class_check` |
| **INV-5** كل حقيقة تحمل provenance | `provenance_class` **NOT NULL** في كل جدول يحمل حقيقة |
| **INV-6** كل استدعاء نموذج مُقاس | جدول `model_call` بـ`gateway_call_id` فريد |
| **INV-7** كل نشاط يشير إلى مواصفة منشورة | `project_activity_has_spec` + نفس قيد النتيجة |
| **INV-8** كل فعل ذي معنى يُنشر حدثًا | `reason` غير فارغ على `audit_event` و`evidence_transition` |
| **INV-9** درجة النشاط ≠ مستوى المهارة | **لا عمود** على `skill_claim` يشتق من درجة نشاط. الغياب هو الفرض |

**INV-9 يستحق وقفة:** لا يُفرض بقيد بل **بغياب عمود**. لو وُجد `skill_claim.activity_score` لأصبح ربطهما مسألة وقت. تصميم يمنع الخطأ أقوى من قيد يرصده.

### ١.٥ جداول الإضافة فقط
`evaluation_result` · `evaluation_criterion_score` · `evidence_transition` · `audit_event` · `model_call` · `consent` · `integrity_check` · `username_release`.

**`REVOKE UPDATE, DELETE`** عنها من `authenticated` و`anon` — **ليست مجرد "لا نعدّلها" بل لا يمكن**. إعادة التقييم تُضيف صفًّا بـ`supersedes_result_id`، وفهرس فريد يمنع استبدال نتيجة مرتين.

### ١.٦ الحذف الناعم — أين ولماذا
يُستخدم **فقط** حيث يتطلب المنتج الاسترجاع أو التاريخ:

| الجدول | السبب |
|---|---|
| `app_user.deleted_at` | مهلة استرجاع + سجل التدقيق يجب أن يبقى خلالها (D-024 · D-025) |
| `project.deleted_at` | `withdrawn` تُخفي ولا تحذف؛ والدليل يجب ألّا يتدلّى بلا مصدر |
| `evidence.withdrawn_at` | السحب واقعة لها سبب، ويجرّ معه ما اشتُق منه (`FR-P-036`) |
| `share_link.revoked_at` | الإلغاء يجب أن يكون قابلًا للتدقيق: متى، ومن |

**وليس في كل مكان.** `notification` تُحذف فعليًا، لأن لا متطلب يوجب استرجاعها.

### ١.٧ استخدام `jsonb` — أربعة مواضع فقط، ولكل تبرير مكتوب

| العمود | التبرير |
|---|---|
| `activity_spec.spec` | أجسام الأنشطة تختلف بالنوع، وهي **محتوى مُصدَّر**، لا حالة نطاق يُستعلم عنها |
| `rubric_version.criteria` | بنود رُبريك **مجمّدة**؛ رُبريك منشور لا يُعدَّل أبدًا |
| `cv_version.content_snapshot` | لقطة زمنية للمقارنة «قبل/بعد» |
| `linkedin_assessment.sections` | أسماء أقسام لينكدإن **عقد منصة خارجية لا نملكه** |
| `audit_event.payload` | أشكال الأحداث تختلف — **والحقول القابلة للاستعلام رُقِّيت أعمدة** |
| `job.payload` | حمولة طابور عامة عمدًا، ليبقى المحرّك قابلًا للاستبدال |

**ولم تُستخدم `jsonb` لأي كيان نطاق أساسي.** `case_study` أقسامها **أعمدة** لأن الأقسام الأربعة قاعدة منتج: لو كانت `jsonb` لأمكن نشر دراسة حالة بثلاثة أقسام.

---

## ٢. خريطة الجداول (٤٢)

| المجال | الجداول |
|---|---|
| الهوية والهدف | `app_user` · `username_release` · `career_goal` · `target_role` · `skill` · `role_requirement` |
| المحتوى | `activity_spec` · `rubric_version` |
| العمل | `project` · `work_item` · `submission` · `submission_file` · `ai_disclosure` |
| التقييم | `evaluation` · `evaluation_result` · `evaluation_criterion_score` · `integrity_check` · `human_review` |
| الدليل | `evidence` · `skill_claim` · `evidence_transition` |
| الأصول والدرجات | `professional_asset` · `asset_evidence` · `cv_version` · `readiness_score` · `score_component` · `cv_assessment` · `linkedin_assessment` · `case_study` · `recruiter_report` · `recruiter_report_item` |
| النشر والخصوصية | `public_profile` · `share_link` · `consent` |
| التعلّم | `learning_gap` · `learning_resource` · `practice_activity` |
| التشغيل | `notification` · `audit_event` · `model_call` · `market_fact` · `job` |

---

## ٣. طابور المهام فوق PostgreSQL

جدول `job` عام عمدًا (`queue` · `payload` · `state` · `attempts` · `run_after`).

**المكسب الحقيقي ليس التوفير بل المعاملاتية:** إدراج المهمة يحدث **داخل نفس المعاملة** التي أنشأت التسليم. فلا يوجد تسليم محفوظ بلا مهمة تقييم، ولا مهمة تقييم على تسليم لم يُحفظ. مع وسيط خارجي تصير هذه حالة يجب التعامل معها؛ هنا هي **مستحيلة**.

وبقي المحرّك **قابلًا للاستبدال**: `JOB_QUEUE_DRIVER` في الإعدادات، وحمولة عامة، فالانتقال إلى وسيط مخصّص عند الحاجة لا يمسّ النطاق.

---

## ٤. الهجرات

ترقيم متسلسل `NNNN_name.sql`، تُطبَّق بالترتيب، **ولا تُعدَّل هجرة طُبّقت**.
`0002_rls.sql` يُنشئ أدوار Supabase إن غابت، فيعمل الملف نفسه على Supabase وعلى PostgreSQL عادي للاختبار.

---

## ٥. ما لم يُبنَ في هذا المخطط

| البند | السبب |
|---|---|
| جداول جلسات الرفيق المهني | لا استدعاءات نماذج في Phase 0 · `OPEN-023` مفتوح |
| جدول أوزان الدرجات | الأوزان غير معتمدة؛ `loadWeights()` يفشل حتى تُعتمد |
| فهرسة بحث نصي | لا شاشة بحث في الشريحة الأولى |
| تقسيم `audit_event` زمنيًا | عند الحجم، لا قبله |
| سياسات الاحتفاظ التنفيذية | `RetentionExecution` مُصمَّم في `docs/model/16` · المدد **مبدئية** حتى مراجعة الخصوصية (D-024) |
