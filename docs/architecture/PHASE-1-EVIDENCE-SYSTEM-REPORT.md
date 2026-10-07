# نَقْلة / NAQLA — Configurable Track Architecture · **Phase 1 Report: Evidence System**
**التاريخ:** 2026-10-07 · **الخطة الحاكمة:** `CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md` (معتمدة) · **المرجع الكانوني:** `docs/srs/SRS-001-naqla-functional.md` v1.5 (بلا تغيير) · **القرار:** D-108
**الحالة:** Phase 1 مُنفَّذة ومُثبَتة · **التنفيذ متوقف** بانتظار مراجعة المالكة قبل Phase 2 (Skill Status Model).

> **قيود المالكة وكيف احتُرمت:** لا تغيير في السلوك الإنتاجي (٨٠ اختبار e2e قائم تمرّ كما هي + ١٣ جديدًا) · توافق خلفي (الـbackfill مُثبَت بلا تغيير في `evidence`/`skill_claim`) · كل قيمة تعتمد على الخبراء `DRAFT / NOT VALIDATED` (١٧ نوع دليل كلها `review_status = draft`، و`approved` مرفوض بلا `approved_by/at`) · لا قاعدة مهنية صارت معتمدة · لا وكيل ثالث · لا LLM · لا توسعة للتصميم المُجمَّد · لا مسار ثانٍ.

---

## 1. What was implemented — ما نُفِّذ

| المكوّن | ما يفعله |
|---|---|
| **سجل أنواع الدليل** `evidence_item_type` | جدول بيانات (لا enum): `code` · `channel ∈ url/file/text/activity/system` · `required_fields` · `match_rule` (تصنيف الروابط/الملفات/الأنشطة) · `enabled` · `review_status` + `approved_by/at` · `validation_note_en = 'DRAFT / NOT VALIDATED — pending expert validation'`. **١٧ صفًا** = أنواع المالكة الستة عشر (GitHub Repository · GitHub commit/diff · Live Demo URL · Screenshot · File Upload · Code submission · Text explanation · Bug Fix · Short Task · Project · Code Review · Code Reading · Automated Check Result · User Reflection · AI Usage Disclosure · Previous Attempt) **+ `external_url`** كنوع احتياطي مُعلَن للرابط غير المصنَّف (بدل تخمين في الكود). |
| **سجل عناصر الدليل** `evidence_item` | حقول §3 من التكليف: `id` · `user_id` · `target_role_id` (track) · `skill`(عبر جدول الربط) · `activity_spec_id` · `project_id` · `submission_id` · `evaluation_result_id` · نوع · `source ∈ user_direct/user_submission/system` · `title` · `description` · `url` · `upload_id` · `artifact_key` · `metadata jsonb` · `status ∈ draft/submitted/withdrawn/superseded` · `submitted_at` · `version` · `attempt_number` · `supersedes_item_id` · `parent_item_id` · `withdrawn_at/reason` · `created_at/updated_at`. **ثابت بعد التقديم** (مُحفِّز يرفض أي تعديل في المحتوى) · **لا حذف** (مُحفِّز) · **شكل العنصر يقرّره صف النوع** (مُحفِّز يقرأ `channel` و`required_fields`). |
| **ربط عنصر ↔ مهارات** `evidence_item_skill` | عدة مهارات للعنصر الواحد؛ `link_role ∈ primary/secondary` · `linked_by ∈ user/system` · `weight` **مقيَّد بـNULL دائمًا** (لا وزن قبل رأي الخبراء). |
| **الجسر إلى الواقعة** `evidence_derivation` | يربط واقعة `evidence` (التي يكتبها التقييم) بالعناصر: `recorded_as` (عنصر نتيجة الفحص الآلي للتشغيلة) · `evaluated_from` (عنصر التسليم الذي قُرئ). يُكتب مع التقييم فقط. |
| **النطاق** `packages/domain/src/evidence-items.ts` | الثوابت فقط: دورة حياة أمامية · شكل العنصر بحسب القناة · `userMayCreateType` · التصنيف من `match_rule` (`classifyUrl/File/ActivityEvidenceType` — بلا بديل مخفي: لا صف احتياطي ⇒ `MissingPrerequisite`) · `assignFileArtifactKeys` (H7) · `nextAttemptNumber` · `claimEffectOfEvidenceItem() === 'none'` (INV-1 للسجل) · `evidenceTypeIsValidated`. **١٤ اختبار وحدة** جديدًا (المجموع ١٥٩). `DOMAIN_RULESET_VERSION 0.7.0 → 0.8.0`. |
| **API** `apps/api/src/evidence/` | `GET /v1/evidence-types` (السجل مع حالة التحقق) · `GET /v1/me/evidence` (مرشّحات `projectId` · `skillId` · `status`) · `POST /v1/me/evidence` (مادة `user_direct` للقنوات url/file/text؛ الملف يشترط رفعًا مؤكَّدًا يملكه المستخدم) · `GET /v1/me/evidence/:id` · `POST /v1/me/evidence/:id/skills` · `POST /v1/me/evidence/:id/withdraw` (مادة المستخدم المباشرة فقط؛ التسليم مقفل). كل استجابة تحمل `claimEffect: 'none'`. |
| **تدفق التسليم** (`submission.service.ts`) | داخل معاملة التسليم نفسها: عنصر نشاط (`code_submission` عبر الاحتياطي المُعلَن؛ `bug_fix`… تُفعَّل حين يحمل النشاط `kind`) + عنصر لكل ملف (`file_upload`/`screenshot` بحسب `content_type`) + لكل رابط (مصنَّف بقاعدة السجل) + لكل نص (`text_explanation`) + `ai_usage_disclosure` + من المحاولة الثانية `previous_attempt` وتصبح السابقة `superseded`. **مفاتيح الملفات من `activity_deliverable`** (H7) بقاعدة توافق (§6). |
| **تدفق التقييم** (`evaluation.service.ts` · المساران الآلي والبشري) | عنصر `automated_check_result` لكل تشغيلة (ناجحة أو لا) + `evidence_derivation` عند إنتاج واقعة. **كتابة `evidence`/`skill_claim`/`evidence_transition` لم تتغير حرفًا.** |
| **Backfill** | التسليمات والتقييمات السابقة تُسجَّل عناصرَ (محاولات مرقّمة · روابط مهارات · اشتقاقات) — مُثبَت على قاعدة بتاريخ ما قبل 0011: md5 لـ`evidence` و`skill_claim` قبل = بعد. |
| **الواجهة** (الحد الأدنى؛ بالنظام البصري المُجمَّد) | `/project`: قسم «الأدلة المسجّلة» من `me/evidence` بنوع العنصر وحالته ورقم المحاولة، مع التصريح: «مادة، لا إثبات… الأنواع قيد التحقق من الخبراء». `api.ts`: أنواع `EvidenceType` · `EvidenceItem`. لا صفحة جديدة. |
| **الاختبارات** | `apps/api/test/evidence.e2e.ts` (١٣ اختبارًا): السجل draft · التسليم → عناصر ومفاتيح · **INV-1: عناصر موجودة وعدّ الأدلة 0 قبل التقييم** · محاولة ٢ تستبدل الأولى · الرابط غير المصنَّف يذهب للاحتياطي · التقييم → عنصر + اشتقاق (وفشل التقييم: عنصر بلا اشتقاق) · الإضافة لا تنشئ ادعاءً · الملف يشترط رفعًا مملوكًا · أنواع النظام/النشاط ممنوعة على المستخدم · السحب (سبب إلزامي؛ التسليم مقفل؛ النهائي نهائي) · RLS: مستخدم آخر لا يرى؛ المالك لا يعدّل ولا يضيف عنصر نظام ولا اشتقاقًا؛ وحتى service role لا يعدّل محتوى عنصر مُقدَّم ولا يحذفه ولا يضع وزنًا. |

**النتائج:** `npm test` (النطاق ١٥٩ · config · agents) ✅ · API build ✅ · e2e **٩٣/٩٣** ✅ (قاعدة مُعاد بناؤها 0001→0011 + seed + استيراد الحزمة الكانونية) · `npm run verify` ✅ · typecheck الواجهة ✅.

## 2. Files changed — الملفات

**جديدة:** `supabase/migrations/0011_evidence_system.sql` · `packages/domain/src/evidence-items.ts` · `packages/domain/src/evidence-items.test.ts` · `apps/api/src/evidence/{evidence.module.ts, evidence-ledger.service.ts, evidence.service.ts, evidence.controller.ts}` · `apps/api/test/evidence.e2e.ts` · `docs/architecture/PHASE-1-EVIDENCE-SYSTEM-REPORT.md`.
**مُعدَّلة:** `packages/domain/src/index.ts` (تصدير + الإصدار) · `apps/api/src/slice1/submission.service.ts` (مفاتيح الملفات من المخرجات + تسجيل في السجل) · `apps/api/src/slice1/evaluation.service.ts` (تسجيل التشغيلة + الاشتقاق) · `apps/api/src/{app.module.ts, slice1/slice1.module.ts, review/review.module.ts}` (استيراد `EvidenceModule`) · `apps/app/src/lib/api.ts` · `apps/app/src/app/project/page.tsx` · `docs/architecture/{DOMAIN-MODEL.md (§٩ب), DATA-MODEL.md (§1.7 · §2), CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md (الحالة)}` · `docs/decisions/DECISIONS.md` (D-108).
**لم تُمس:** `apps/web/` · `data/career/**` · `data/tracks/**` · `SRS-001` · المصفوفة · الوكلاء · `evidence-state.ts` · `verification.ts` · `claims.ts` · محقق الحزمة.

## 3. Database changes — القاعدة

| | |
|---|---|
| **جداول جديدة (٤)** | `evidence_item_type` · `evidence_item` · `evidence_item_skill` · `evidence_derivation` |
| **تعديل جداول قائمة** | **لا شيء.** لا عمود مُضاف ولا enum مُعدَّل ولا صف قديم مُعاد كتابته. |
| **مُحفِّزات (٤)** | `evidence_item_shape_guard` (الشكل من صف النوع) · `evidence_item_immutable_guard` (لا تعديل بعد التقديم؛ النهائي نهائي) · `evidence_item_no_delete` · `touch_updated_at` |
| **قيود** | `approved/published` يشترط `approved_by/at` · `status = 'submitted' ⇒ submitted_at` · `withdrawn ⇔ withdrawn_at` + سبب · `weight is null` · لا والد/استبدال ذاتي · `jsonb_typeof` للحقول الثلاثة |
| **RLS** | السجل مقروء للجميع (`enabled`) · العنصر والربط: المالك يقرأ ويضيف (`source <> 'system'` · `linked_by = 'user'`)؛ **لا سياسة تعديل** · الاشتقاق قراءة للمالك فقط؛ الكتابة service role داخل معاملة التقييم. مُثبَت بدور `authenticated` لا `postgres`. |
| **Backfill** | إضافي فقط (§1). |
| **ملاحظة تسمية** | اسم السجل `evidence_item_type` لا `evidence_type` لأن الأخير enum قائم على `role_requirement.evidence_type_expected` (لم يُمس). |

## 4. What is configurable now — ما صار إعدادًا

- **إضافة نوع دليل** = صف في `evidence_item_type` (لا هجرة ولا كود): قناته · حقوله المطلوبة · قاعدة تصنيفه · تفعيله · ترتيبه.
- **تصنيف الروابط** (`url_host_suffixes` · `url_path_pattern` · `url_fallback`) · **الملفات** (`content_type_prefix` · `file_fallback`) · **الأنشطة** (`activity_kind` · `activity_fallback`) — كلها بيانات في `match_rule`.
- **مفاتيح ملفات التسليم** من `activity_deliverable` (ترتيب `position` · `format = 'source file'`) — نشاط جديد بملفات مختلفة **لا يحتاج كودًا** (H7 مُغلَق).
- **حالة التحقق لكل نوع** (`review_status` · `approved_by/at` · `validation_note_en`) — تعتمدها SME مُسمّاة لاحقًا كصف.
- **تعطيل نوع** (`enabled = false`) يمنع عناصر جديدة ويُبقي التاريخ.

## 5. What remains intentionally unresolved — ما تُرك عمدًا

- **اشتقاق دليل لكل مهارة من بنود الرُبريك (H6)** — لم يُنفَّذ؛ ينتظر سياسة التحقق المُصدَّرة في Phase 3 ويبقى **معطَّلًا افتراضيًا** كما قرّرت المالكة. الواقعة ما زالت تُمنح للمهارة الأولى المُدَّعاة كما قبل.
- **`activity_spec.kind`** لا يوجد عمود بعد؛ لذا كل تسليم يُصنَّف `code_submission` عبر الاحتياطي المُعلَن، وأنواع `bug_fix/short_task/project/code_review/code_reading` مسجَّلة وتُفعَّل حين تحمل الأنشطة `kind` (حقل إعداد مسار في Phase 4).
- **لا وزن ولا عدّ ولا عتبة** لأي نوع دليل (`weight` NULL مقيَّد؛ `minimum_evidence_count` القائم على `role_requirement` لم يُربط بالسجل).
- **سحب عنصر لا يسحب واقعة** — سحب الواقعة يبقى عبر D-077 (`POST evidence/:id/withdraw`)؛ ربط السحبين قرار سياسة لاحق.
- **لا استبيان إفصاح مُهيكل** (Phase 6)؛ عنصر `ai_usage_disclosure` يسجّل الإقرار الحالي كما هو.
- **`SRS-001` لم يتغير:** العنصر كيان تصميم تقني تحت FR-P القائمة وINV-1 (الـSRS يستثني Database Schema صراحةً). إن أرادت المالكة تسميته في §6.1 فذلك `CHG-011` بقرارها.
- **لا واجهة لإضافة مادة** من المستخدم (الـAPI موجود)؛ أُجِّلت إلى صفحات المهارة (Phase 5) حتى لا تُوسَّع الواجهة في هذه المرحلة.

## 6. Risks — المخاطر

| الخطر | التخفيف |
|---|---|
| **قاعدة التوافق لمفاتيح الملفات**: تسليم يذكر مخرَجًا ملفيًا كحقيقة صريحة (كما تفعل اختبارات المراجعة البشرية) تبقى ملفاته على `file.component`/`file.test` حتى لا تُشبع بوابة `files_present` بالمصادفة؛ تسليم بملفات فقط يأخذ المفاتيح المُعلَنة. **قاعدة مُسمّاة ومُختبَرة** (`resolvedFrom` يُسجَّل)، لكنها سلوك ثنائي يستحق مراجعة المالكة. | اختبار وحدة + e2e؛ تُراجَع مع Phase 6 حين تصبح واجهة التسليم مبنية على المخرجات المُعلَنة. |
| ازدواج ظاهري بين `submission_artifact` و`evidence_item` | الأول حقائق الرُبريك (لم يتغير)؛ الثاني السجل المُنمَّط. `artifact_key` يربطهما. دمجهما تغيير سلوك مرفوض الآن. |
| عدد الصفوف (٥–٨ عناصر لكل تسليم) | فهارس على `user_id` · `submission_id` · `project_id`؛ الاستعلامات مملوكة؛ لا أثر على مسار التقييم (نفس المعاملة، إدراج فقط). |
| الـbackfill يصنّف الروابط القديمة بتعبير SQL ثابت (github) | مرة واحدة على تاريخ قليل؛ العناصر الجديدة تُصنَّف من السجل. |
| الواجهة تعرض تسميات أنواع `draft` | التصريح الظاهر «قيد التحقق من الخبراء» في القسم نفسه. |

## 7. What expert input can change later without code changes — ما يغيّره الخبراء بلا كود

- اعتماد/رفض/تعطيل أي نوع دليل، وإعادة تسميته، وترتيبه (`evidence_item_type` صف).
- إضافة أنواع جديدة (مثل «مقابلة فنية» أو «مراجعة زميل») بقناة وحقول مطلوبة.
- قواعد التصنيف: أي مستضيف/مسار للروابط، أي `content_type` للملفات، أي `kind` للأنشطة.
- أي مخرَج ملفي لنشاط (مفتاحه · ترتيبه · إلزاميته) من `activity_deliverable` في الحزمة.
- لاحقًا (Phase 3/4) وعبر السياسات المُصدَّرة لا هذا السجل: ما يُحتسب دليلًا لأي مهارة، وكم دليلًا يلزم، وهل يُشتق لكل مهارة من بنودها (H6).

---
**التالي بعد مراجعة المالكة:** Phase 2 — Skill Status Model (`0012_skill_progress`؛ لا يمس `skill_claim`).
