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

### ١.٧ استخدام `jsonb` — مواضع محدودة، ولكل تبرير مكتوب

| العمود | التبرير |
|---|---|
| `activity_spec.spec` | أجسام الأنشطة تختلف بالنوع، وهي **محتوى مُصدَّر**، لا حالة نطاق يُستعلم عنها |
| `rubric_version.criteria` | بنود رُبريك **مجمّدة**؛ رُبريك منشور لا يُعدَّل أبدًا |
| `cv_version.content_snapshot` | لقطة زمنية للمقارنة «قبل/بعد» |
| `linkedin_assessment.sections` | أسماء أقسام لينكدإن **عقد منصة خارجية لا نملكه** |
| `audit_event.payload` | أشكال الأحداث تختلف — **والحقول القابلة للاستعلام رُقِّيت أعمدة** |
| `job.payload` | حمولة طابور عامة عمدًا، ليبقى المحرّك قابلًا للاستبدال |
| `evidence_item_type.required_fields` · `match_rule` | **سجل أنواع كبيانات** (Phase 1): الحقول المطلوبة وقواعد التصنيف لكل نوع تُعدَّل كصف لا كهجرة؛ مُقيَّدة بـ`jsonb_typeof` ويفحصها مُحفِّز الشكل |
| `skill_progress_transition.guard` · `skill_progress_event.facts` | **قاعدة انتقال كبيانات** (Phase 2): شرط تصريحي صغير (`value` · `{"not"}` · `{"in"}`) يفسّره النطاق وحده، ووقائع الحدث كما وصلت — لتدقيق لماذا تحرّكت الرحلة أو لم تتحرّك |
| `disclosure_question.options/show_if` · `ai_disclosure_answer.question_snapshot/answer` · `challenge_instance.context` · `challenge_response.response` | **الاستبيان والتحقق كبيانات** (Phase 6): خيارات وشروط ظهور كإعداد؛ لقطة السؤال كما رآه المستخدم مع إجابته؛ سياق تحدٍّ أعمى وإجابة حرة — كلها ثابتة بعد التسجيل |
| `agent_proposal.grounding_result` · `claim_draft_event.grounding_result` | **نتيجة التأسيس** (Phase 7b): القرار والادعاءات ← معرّفات الوقائع والمشكلات بالعربية والإنجليزية والأجزاء غير المرتبطة والاختصار المقترح **والصياغة الأصلية** — كما حُسبت، مع نسخة المحرّك والمعجم |
| `agent_proposal.grounding_report` | **تقرير التأسيس** (Phase 7): قائمة مرتبة بالفحوص المسمّاة التي اجتازتها مسودة الصياغة المهنية (`{check, passed, detail}`) — ليرى المستخدم والمدقّق ما فُحص؛ مقيَّدة بـ`jsonb_typeof = 'array'` |
| `readiness_rule.params` · `readiness_evaluation.result` | **قيم القواعد كبيانات** (Phase 5): كل عدد ومستوى في `params` إعداد مُصدَّر يفسّره نوع القاعدة في الكود؛ اللقطة تحفظ التقرير والوقائع كما كانت لتُقرأ بالقواعد التي أنتجتها |
| `assessment_context_policy.inputs` · `challenge_policy.trigger_rule` · `track_config_version.skill_config_snapshot` | **الإعداد كبيانات مُصدَّرة** (Phase 4): خريطة مدخلات لكل نوع، قاعدة تشغيل مفتوحة بلا مُفسِّر بعد، ولقطة TrackSkill مجمَّدة مع الإصدار — ليُقرأ كل تقييم تاريخي بالإعداد الذي أنتجه |
| `assessment.inputs_used` · `raw_result` · `verification_policy.escalate_on` | **التدقيق** (Phase 3): ما قرأه المُقيِّم ونتيجته الخام كاملة تُحفظ كما كانت ليُعاد فحص أي قرار لاحقًا؛ قواعد التصعيد كبيانات مسودة |
| `evidence_item.metadata` | وصف إضافي يختلف بالنوع (مفتاح المخرَج · نتيجة الفحص · الإفصاح) — **الحقول القابلة للاستعلام أعمدة** (`url` · `upload_id` · `submission_id` · `evaluation_result_id` · `attempt_number` · `status`) |

**ولم تُستخدم `jsonb` لأي كيان نطاق أساسي.** `case_study` أقسامها **أعمدة** لأن الأقسام الأربعة قاعدة منتج: لو كانت `jsonb` لأمكن نشر دراسة حالة بثلاثة أقسام.

---

## ٢. خريطة الجداول (٤٢)

| المجال | الجداول |
|---|---|
| الهوية والهدف | `app_user` · `username_release` · `career_goal` · `target_role` · `skill` · `role_requirement` |
| المحتوى | `activity_spec` · `rubric_version` |
| العمل | `project` · `work_item` · `submission` · `submission_file` · `ai_disclosure` |
| التقييم | `evaluation` · `evaluation_result` · `evaluation_criterion_score` · `integrity_check` · `human_review` |
| الدليل | `evidence` · `skill_claim` · `evidence_transition` · **سجل المادة (0011):** `evidence_item_type` · `evidence_item` · `evidence_item_skill` · `evidence_derivation` · **رحلة المهارة (0012):** `skill_progress_state` · `skill_progress_trigger` · `skill_progress_transition` · `skill_progress` · `skill_progress_event` |
| التقييم المُهيكل (0013) | `verification_policy` · `assessment` · `assessment_criterion_result` · `verification_decision` *(بجانب `evaluation_result` و`verification` القائمين)* |
| الإفصاح والنزاهة (0016) | `disclosure_questionnaire` · `disclosure_question` · `ai_disclosure_answer` · `challenge_instance` · `challenge_response` · `challenge_result` · `integrity_signal_type` · `integrity_signal` *(+ أعمدة الاستبيان على `ai_disclosure`؛ + أعمدة على `verification_challenge_type`/`challenge_policy`)* |
| نزاهة التحقق (0023) | **+ `verification_policy.promotion_basis`** (`independently_verified` \| `legacy_any_pass`؛ الأخير تطوير فقط — حارس `verification_policy_legacy_basis`) · **+ `practiced_on_submission`** · `default@2` أساس أمان مقيِّد (هجرة) و`default@1` موقوف · **+ قرار `assessment_pending_validation`** على `verification_decision` (D-118) |
| وصول الخريج إلى المحتوى (0024) | **+ `platform_deployment`** (صف واحد: `demo_content_visible`، مغلق افتراضيًا، تغييره مُدقَّق في `config_change`) · **+ دوال** `graduate_content_visible` · `graduate_activity_visible` · `graduate_role_visible` · `graduate_activity_in_catalogue` · `graduate_role_listed` (قاعدة واحدة لـRLS والـAPI) · سياسات `target_role`/`skill`/`role_requirement`/`learning_resource`/`activity_*` للمستخدم المصادَق فقط ومع استثناء سجلّه الخاص · `activity_input` للخدمة فقط · منح أعمدة المتعلّم على `activity_spec` و`role_requirement` · `canonical_skill_id` صار `security definer` (D-119) |
| قيود الحزمة (0022) | `pack_constraint_set` *(محكوم؛ أساس `legacy_pack_constraints@1` = أرقام المحقق السابقة، غير معتمد)* · `pack_constraint` *(نوع من مفردات مغلقة `pack_constraint_type`؛ حدود ≥ 1 مرتّبة؛ مجمَّد بعد التفعيل)* · `pack_validation_run` *(إضافة فقط: المجموعة@الإصدار لكل تحقق)* · فهرس «مجموعة واحدة لكل نطاق ومستوى تفعيل» |
| نشر التأسيس وفصل المهام (0021) | `grounding_public_state` *(صف وحيد: الإصدار المعلن للمسارات العامة المباشرة؛ null = مجمَّد)* · `grounding_public_state_log` *(إضافة فقط)* · `asset_publicly_presentable()` تحل محل «اعتمده المستخدم» في سياسة رابط دراسة الحالة · حارس `config_activation_separation_guard` (المفعِّل ≠ الصائغ ≠ المعتمِد) |
| منشئ المسارات (0019 · 0020) | `track_skill_change` *(مسودة تغيير لمهارة المسار؛ لا حذف؛ انتقالات محروسة؛ RLS خدمة فقط)* · **+ `role_performed`:** `track_admin` · `product_owner` · **+ `drafted_by`** على ٨ جداول محكومة مع حارس «العينين الأربع» (`config_four_eyes_guard`) · **+ `track_config_version.applies_skill_config`** (الإصدار يطبّق لقطة المهارات عند تفعيله فقط) · **+ `professional_asset.grounding_version`** (العرض يتطلب مطابقته للإصدار الساري؛ فشل مغلق) · سبب مكانة `grounding_revalidation` · تجميد مخرجات النشاط المنشور (`activity_deliverable_frozen`) |
| التأسيس والمكانة (0018) | `grounding_lexicon` · `grounding_lexicon_entry` *(محكوم؛ مجمَّد بعد التفعيل)* · `asset_standing_event` *(إضافة فقط)* · **+ `agent_proposal`:** `grounding_result` · `grounding_version` · حالتا `needs_revision`/`refused` · **+ `professional_asset`:** `standing_policy_id` · `standing_checked_at` + مُحفِّز ثبات الاعتماد |
| مسودات الصياغة المهنية (0017) | `claim_draft_event` *(سجل إضافة فقط)* · **+ أعمدة المسودة على `agent_proposal`:** `claim_kind` · `claim_policy_id` · `claim_policy_ref` · `claim_policy_resolution` · `grounding_status` · `grounding_report` · **+ على `professional_asset`:** `claim_policy_id` · `claim_policy_ref` وأنواع أصول جديدة · **+ `claim_policy`:** نوع `project_description` وأساس التوافق `legacy_presentation@1` |
| الجاهزية (0015) | `readiness_rule_set` · `readiness_rule` · `readiness_evaluation` *(+ `track_config_version.readiness_rule_set_id` صار مسموحًا)* |
| طبقة الإعداد (0014) | `track_config_version` · `assessment_context_policy` · `claim_policy` · `challenge_policy` · `verification_challenge_type` · `config_change` *(+ أعمدة TrackSkill على `role_requirement`؛ + مراجع الإعداد على `assessment`/`verification_decision`)* |
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
