# نَقْلة / NAQLA — Configurable Track Architecture · **Phase 4 Report: Configuration & Policy Layer**
**التاريخ:** 2026-10-07 · **الخطة الحاكمة:** `CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md` (معتمدة) · **المرجع الكانوني:** `docs/srs/SRS-001-naqla-functional.md` v1.7 (بلا تغيير في هذه المرحلة) · **القرار:** D-111
**الحالة:** Phase 4 مُنفَّذة ومُثبَتة · **التنفيذ متوقف** بانتظار مراجعة المالكة قبل Phase 5 (Readiness Engine + Skill pages).

> **متطلب المالكة الأهم وكيف حُلّ:** لم يُعمَّم «المسودة تعمل في الإنتاج». أُدخل بُعد **`activation`** منفصل عن `review_status` بأربع قيم: `inactive` · `development_only` · **`legacy_baseline`** · `production_active`. `default@1` صار **`legacy_baseline`** بملاحظة ظاهرة «LEGACY BASELINE — NOT EXPERT-VALIDATED» و`review_status` بقي **`draft`** (لم تُعلَّم أي قيمة خبيرة معتمدة). الـbaseline لا يُنشئه إلا migration (`baseline_of` مجمَّد عند الإدراج؛ مسودة لا تصير baseline أبدًا — قيد قاعدة + نطاق + e2e). `production_active` يشترط صفًا مُصادَقًا عليه بمُعتمِد مُسمّى، ويُرفض وإلا. صف نشط واحد لكل مفتاح (فهرس فريد) فلا يحلّ صف جديد محل نشط بالصدفة؛ التفعيل فعل منفصل يتطلب فاعلًا وسببًا ويُسجَّل في `config_change` (إضافة فقط). **المحتوى ثابت منذ أول تفعيل**؛ التغيير إصدار جديد. الإنتاج يستشير `production_active` ثم `legacy_baseline` **ولا يستشير مسودة أبدًا** (`resolveActiveConfig`، مُختبَر). `development_only` مرفوض في الإنتاج بالقاعدة وبالنطاق.

> **بقية قيود المالكة:** إعداد مسار مُصدَّر ✓ · سياسة السياق ✓ (`assessment.context_policy_version` لم يعد `null`) · سياسة الادعاء ✓ (مُسجَّلة **غير مُستهلَكة**؛ `presentationFor()` كما هو) · سياسة التحدي ✓ (معطَّلة؛ لا مُشغِّل) · حقول TrackSkill ✓ (`pending_expert_validation` افتراضيًا) · كل قيمة خبيرة `draft`/`inactive` · التاريخ محفوظ بمراجع الإعداد التي أنتجته (الصفوف السابقة `null` = قبل 0014، ثابتة؛ md5 مُثبَت) · **لا إعادة حساب لأي نتيجة تاريخية** (ثبات + e2e: تفعيل إصدار جديد لا يمسّ تقييمًا قديمًا) · لا تفعيل تحدٍّ · لا تغيير أهلية CV/LinkedIn · لا تفعيل H6 · **لا عتبة جاهزية** (قيد يمنع ربط `readiness_rule_set_id`) · لا تحويل `mandatory`/`core`/الأعداد/الثقة/الحجب إلى افتراضات معتمدة.

---

## 1. What was implemented — ما نُفِّذ

| المكوّن | ما يفعله |
|---|---|
| **نموذج التفعيل** (كل جدول محكوم) | أعمدة `activation` · `baseline_of` · `activated_at` · `deactivated_at`. مُحفِّز عام `config_activation_guard`: baseline لا يُدرَج ولا يُسنَد من التطبيق · `production_active` ⇒ مُصادَق + مُعتمِد · `development_only` مرفوض حين `naqla.production=on` · `approved` ⇒ مُعتمِد · محتوى ثابت بعد أول تفعيل (مقارنة `to_jsonb` عدا أعمدة الحوكمة) · أي تغيير تفعيل/مصادقة يتطلب `naqla.config_actor`/`naqla.config_reason` ويكتب `config_change`. فهرس فريد: صف نشط واحد لكل مفتاح/مسار. حُذف عمود `enabled` من `verification_policy` (استُبدل بالتفعيل). |
| **`verification_policy default@1`** | `legacy_baseline` · `baseline_of = pre_0013_verification_behaviour` · `review_status = draft` · ملاحظة «LEGACY BASELINE — NOT EXPERT-VALIDATED …». كل قرار تحقق يسجّل `decided_by_ref = policy:<resolution>` فيُرى أن الـbaseline — لا سياسة مُصادَقة — هو الذي قرّر. |
| **`track_config_version`** | لكل مسار: إصدار · تسمية · `pack_version` · مراجع إصدارات السياسات الأربع · `progress_rules_version` · **لقطة TrackSkill** (`track_skill_config_snapshot(role)`) · ملاحظات · حوكمة. `v1 legacy_baseline` للمسارات الموجودة وقت الهجرة؛ `ensure_track_config_version()` للمسار المُنشأ لاحقًا (**مسودة فقط**: `development_only` خارج الإنتاج، `inactive` فيه) — تُستدعى من الاستيراد ومن seed الدور التجريبي. قيد `readiness_rule_set_id is null` حتى Phase 5. |
| **`assessment_context_policy`** | `inputs` لكل نوع (`required/optional/excluded`)؛ قيد: `user_identity` و`user_profile` `excluded` دائمًا. `default@1 legacy_baseline` = ما كان المُقيِّم يراه. النطاق `buildAssessmentContext` يبني المدخلات ويستبعد الهوية بالكود مهما قالت الصفوف؛ مدخل `required` غائب ⇒ خطأ مُسمّى. `assessment` يسجّل `context_policy_version` (`default@1`) و`context_policy_id`؛ `inputs_used` يذكر المُضمَّن والمستبعد والمُهمَل الاختياري. |
| **`claim_policy`** | ٩ أنواع ادعاء، كلها `draft` `inactive`، مرآة لسلوك `presentationFor()`/`career_presentation_rule` الحالي (CV bullet ⇒ demonstrated · LinkedIn skill ⇒ demonstrated · project ⇒ practiced · profile ⇒ verified …). `requires_user_approval = true` بقيد لا يُعطَّل (BR-021). **غير مُستهلَكة** (`CLAIM_POLICY_CONSUMED = false`): الأهلية كما هي حتى Phase 7. |
| **`verification_challenge_type` + `challenge_policy`** | ٥ أنواع تحدٍّ مسجَّلة معطَّلة غير مُصادَقة؛ سياسة `default@1` `draft` `inactive` بقاعدة `{}` = لا تحدٍّ. **لا مُشغِّل** (`CHALLENGE_RUNNER_EXISTS = false`). |
| **TrackSkill** (`role_requirement`) | `category` · `display_order` · `expected_level` · `readiness_contribution` (`counts`/`informational`/`null`؛ **لا وزن ولا عتبة**) · `enabled` · `classification_status` (`pending_expert_validation` افتراضيًا؛ `approved` يشترط `reviewed_by/at`). `trackSkillBadge`: لا «أساسية/مساندة» قبل الاعتماد. |
| **مراجع الإعداد على النتائج** | `assessment.track_config_version_id` · `context_policy_id` · `config_resolution` (`production_active` · `legacy_baseline` · `development_only` · `no_active_track_config`) · `verification_decision.track_config_version_id`. الصفوف السابقة `null` = قبل 0014 (ثابتة). |
| **النطاق** `configuration.ts` | `resolveActiveConfig` (الإنتاج: `production_active` ثم baseline، لا مسودة؛ `production_active` غير مُصادَق ⇒ INV-8) · `assertActivationAllowed` · `configIsValidated` (baseline ≠ مُصادَق) · سياق التقييم (`CONTEXT_INPUT_KINDS` · `ALWAYS_EXCLUDED_INPUTS` · `assertContextPolicySane` · `buildAssessmentContext`) · `assertClaimPolicySane` · `challengePolicyWouldTrigger` · `trackSkillBadge` · `trackSkillConfigFromSnapshot` · ثوابت الفجوات `CLAIM_POLICY_CONSUMED/CHALLENGE_RUNNER_EXISTS/READINESS_RULES_EXIST = false`. **١٠ اختبارات** (المجموع ١٨٢). `DOMAIN_RULESET_VERSION 0.10.0 → 0.11.0`. |
| **API** | `GET /v1/config/policies` (السياسات الأربع وأنواع التحدي بحالتي المصادقة والتفعيل، وما يُحلّ لكل مفتاح في هذه البيئة، وشرح نموذج التفعيل) · `GET /v1/config/tracks/:roleId` (الإصدارات ولقطاتها · النشط وكيف حُلّ · TrackSkills بشارتها · «لا قواعد جاهزية»). `submissions/:id/assessment` يحمل إصدار الإعداد وسياسة السياق وحلّ السياسة. |
| **الأفعال المُدقَّقة** (CLI) | `config-approve <table> <id> --by --label --reason` (لا يُصادَق على baseline في مكانه) · `config-activate <table> <id> --activation … --by --reason` (يرفض استبدال صف نشط؛ يرفض `production_active` لغير المُصادَق) · `config-new-version <role> …` (إصدار مسار جديد `inactive`). واجهة الإدارة Phase 8. |
| **الاستيراد** | `career-data import` ينشئ `v1 draft` لإعداد المسار المستورد إن لم يوجد (`development_only` خارج الإنتاج؛ `inactive` فيه). |
| **الواجهة** | `/evaluation`: سطر «إعداد المسار: الإصدار N (resolution) · سياسة السياق default@1 · الهوية مستبعدة»؛ قرار يقرّره baseline يُعرض «LEGACY BASELINE — غير مُصادَق عليها من الخبراء». `api.ts` مُحدَّث. |
| **الاختبارات** | `apps/api/test/configuration.e2e.ts` (٧): السجل يُظهر baseline غير مُصادَق ومختلفًا عن draft؛ الادعاء/التحدي `inactive` · **سلبيات القاعدة:** مسودة لا تصير `production_active` ولا baseline؛ لا إدراج baseline؛ `approved` بلا مُعتمِد مرفوض؛ الاعتماد لا يفعّل؛ لا استبدال نشط (فهرس)؛ `development_only` مرفوض في الإنتاج · تغيير بلا فاعل/سبب مرفوض؛ محتوى نشط ثابت؛ الهوية لا تُضمَّن · الأفعال: baseline لا يُصادَق في مكانه؛ تفعيل غير مُصادَق مرفوض؛ بعد المصادقة يبقى `inactive`؛ استبدال نشط مرفوض؛ `config_change` يسجّل · **كل تقييم جديد يسمّي سياسة السياق وإصدار المسار وحلّه؛ إصدار مسار جديد مُفعَّل لا يمسّ تقييمًا قديمًا** · مسار بلا إعداد ⇒ `no_active_track_config`؛ المستورد ⇒ `v1 development_only` · حقول TrackSkill: `approved` يشترط مراجعًا؛ لا `readiness_rule_set_id`. + `assessment.e2e` مُحدَّث (H6 عبر إصدار `development_only` بعد تعطيل baseline صراحةً وإعادته). |

**النتائج:** النطاق **١٨٢/١٨٢** ✅ · API build ✅ · e2e **١١٦/١١٦** ✅ (قاعدة مُعاد بناؤها 0001→0014 + seed + استيراد الحزمة) · `npm test` الجذر ✅ · `npm run verify` ✅ · typecheck الواجهة ✅ · backfill مُثبَت ✅ (قاعدة بدور وتقييم وقرار قبل 0014: `assessment`/`verification_decision` بلا تغيير في المحتوى والأعمدة الجديدة `null`؛ baseline v1 للدور السابق؛ صفر `config_change` لأن الـbaselines إنشاء هجرة لا أفعال).

## 2. Files changed — الملفات

**جديدة:** `supabase/migrations/0014_track_configuration.sql` · `packages/domain/src/configuration.ts` · `packages/domain/src/configuration.test.ts` · `apps/api/src/configuration/{configuration.module.ts, configuration.service.ts, config-admin.service.ts, configuration.controller.ts}` · `apps/api/test/configuration.e2e.ts` · هذا التقرير.
**مُعدَّلة:** `packages/domain/src/index.ts` (تصدير + 0.11.0) · `apps/api/src/assessment/{assessment-recorder.service.ts (الحلّ بالتفعيل · سياسة السياق · مراجع الإعداد), assessment.service.ts, assessment.module.ts}` · `apps/api/src/slice1/evaluation.service.ts` (تمرير الحلّ وإصدار المسار) · `apps/api/src/career-data/{pipeline.ts (إصدار مسودة للمستورد), cli.ts (٣ أوامر)}` · `apps/api/src/app.module.ts` · `apps/api/test/assessment.e2e.ts` · `supabase/seed/0001_demo_role.sql` (إصدار مسودة للدور التجريبي) · `apps/app/src/lib/api.ts` · `apps/app/src/app/evaluation/page.tsx` · `docs/architecture/{DOMAIN-MODEL.md (§١٣ج), DATA-MODEL.md, CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md}` · `docs/decisions/DECISIONS.md` (D-111).
**لم تُمس:** `evidence-state.ts`/`presentationFor` · `career_presentation_rule` · `verification.ts` · `claims.ts` · الوكلاء · `apps/web/` · `data/**` · `SRS-001` (لا متطلب وظيفي جديد؛ انظر §5).

## 3. Database changes — القاعدة

| | |
|---|---|
| **جداول جديدة (٦)** | `config_change` · `assessment_context_policy` · `claim_policy` · `verification_challenge_type` · `challenge_policy` · `track_config_version` |
| **أعمدة على جداول قائمة** | `verification_policy`: + `activation` · `baseline_of` · `activated_at` · `deactivated_at`؛ **− `enabled`** (من 0013، استُبدل) · `role_requirement`: + ٦ حقول TrackSkill · `assessment`: + `track_config_version_id` · `context_policy_id` · `config_resolution` · `verification_decision`: + `track_config_version_id` — كلها nullable/بافتراض؛ لا صف قديم مُعاد كتابته |
| **دوال** | `config_activation_guard()` · `track_skill_config_snapshot(role)` · `ensure_track_config_version(role, pack, by, activation)` (مسودات فقط) |
| **قيود** | baseline يشترط `baseline_of` · `production_active` ⇒ مُصادَق + مُعتمِد (مُحفِّز) · صف نشط واحد لكل مفتاح/مسار/نوع ادعاء (فهارس) · الهوية مستبعدة (سياسة السياق) · `requires_user_approval = true` (ادعاء) · `readiness_rule_set_id is null` (مسار) · `classification_status = approved` ⇒ مراجع · `readiness_contribution ∈ counts/informational` |
| **RLS** | السجلات مقروءة للجميع؛ `config_change` service role فقط (لا سياسة للمستخدم). |
| **Backfill** | baseline v1 لكل مسار موجود؛ `default@1` ⇒ baseline؛ إضافي فقط. |

## 4. What is configurable now — ما صار إعدادًا

- **الإصدار المُجمَّع للمسار**: أي سياسات (بإصداراتها) وأي لقطة TrackSkill تعمل معًا؛ إصدار جديد بأمر، وتفعيله فعل مُدقَّق.
- **ما يراه المُقيِّم**: لكل نوع مدخل `required/optional/excluded` (عدا الهوية: مستبعدة بنيويًا).
- **شروط كل نوع ادعاء** (المستوى · العدد · القوة · قرار التحقق · القفل) — جاهزة للمصادقة ثم الاستهلاك في Phase 7.
- **متى وكم وأي تحدٍّ** — بيانات جاهزة؛ لا تُنفَّذ حتى يوجد مُشغِّل وسياسة مُصادَقة مُفعَّلة.
- **عرض كل TrackSkill**: التصنيف والترتيب والمستوى المتوقع والتفعيل وحالة المصادقة.
- **من يفعّل وماذا ولماذا** — مسجَّل في `config_change` دائمًا.

## 5. What remains intentionally unresolved — ما تُرك عمدًا

- **قيم كل سياسة** — كلها `draft`/`inactive` أو baseline غير مُصادَق.
- **مفاتيح السياسات عالمية** (`default`): الفصل لكل مسار يُحسم حين يوجد مسار ثانٍ (إصدار المسار يشير إلى المفاتيح أصلًا).
- **حقول TrackSkill في الحزمة** (`pack-schema`/`pipeline`): مؤجَّل — تُضبط الآن بالقاعدة ويُجمَّد في اللقطة؛ إلحاقها بملفات الحزمة قرار صياغة بيانات يُؤخذ مع Phase 8.
- **تفسير `trigger_rule` و`escalate_on`**: بنى مفتوحة بلا مُفسِّر حتى تُعتمد القيم.
- **واجهة إدارة الإعداد**: CLI فقط (Phase 8).
- **SRS-001**: لا تغيير — نموذج التفعيل تصميم تقني تحت الثوابت القائمة. إن أرادت المالكة صياغة «السلوك القائم يعمل حتى يُستبدل بإعداد مُصادَق عليه بفعل مُدقَّق» وظيفيًا فذلك `CHG-013` بقرارها (مقترح: BR-023).

## 6. Risks — المخاطر

| الخطر | التخفيف |
|---|---|
| قراءة `legacy_baseline` كأنه «معتمد» | التسمية والملاحظة الظاهرة في كل استجابة وفي قرار التحقق وفي الواجهة؛ `validated=false` دائمًا؛ لا يُصادَق في مكانه. |
| مسار جديد في الإنتاج بلا إعداد نشط | يُسجَّل `no_active_track_config` ولا يُخمَّن؛ التفعيل فعل مُدقَّق بعد المصادقة. |
| تغيير إعداد يُقرأ كأنه يسري على التاريخ | النتائج ثابتة وتشير إلى إصدارها؛ المحتوى النشط لا يتغير (مُحفِّز)؛ e2e يثبت أن الإصدار الجديد لا يمسّ القديم. |
| فاعل/سبب عبر `set_config` قد يُنسى في مسار جديد | القاعدة ترفض التغيير بلا الاثنين؛ لا يوجد مسار «صامت». |

## 7. What expert input can change later without code changes — ما يغيّره الخبراء بلا كود

- المصادقة على أي سياسة/إصدار مسار (`config-approve`) ثم تفعيله (`config-activate production_active`) — الـbaseline يُعطَّل صراحةً حينها.
- إصدار سياسة سياق بمدخلات مختلفة (عدا الهوية).
- قيم سياسات الادعاء لكل نوع، تمهيدًا لاستهلاكها في Phase 7.
- تفعيل أنواع تحدٍّ وسياسة تحدٍّ حين يُبنى المُشغِّل (Phase 6).
- تصنيف كل TrackSkill ومستواه المتوقع وترتيبه وتفعيله، واعتماد تصنيفه بمراجع مُسمّى.

---
**التالي بعد مراجعة المالكة:** Phase 5 — Readiness Engine + Skill pages (قواعد بأنواع في الكود وقيم بيانات مسودة؛ `/skills` و`/skills/[id]` بالنظام المُجمَّد؛ لا عتبة معتمدة).
