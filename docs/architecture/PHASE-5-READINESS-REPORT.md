# نَقْلة / NAQLA — Configurable Track Architecture · **Phase 5 Report: Readiness Engine + Skill Pages**
**التاريخ:** 2026-10-07 · **الخطة الحاكمة:** `CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md` (معتمدة) · **المرجع الكانوني:** `docs/srs/SRS-001-naqla-functional.md` v1.8 (CHG-013 مُطبَّق) · **القرار:** D-112
**الحالة:** Phase 5 مُنفَّذة ومُثبَتة · **التنفيذ متوقف** بانتظار مراجعة المالكة قبل Phase 6 (AI Usage / Integrity Flow).

> **قيود المالكة وكيف احتُرمت:** **لا عتبة نهائية** ولا «٣ من ٧» ولا «٧٠٪» ولا «كل الأساسية» — **لا مجموعة قواعد مبذورة أصلًا**، وقيد قاعدة يمنع أي «أساس توافق» للجاهزية · أنواع القواعد الستة كود؛ **كل قيمة** (مهارة · مستوى · عدد) صف إعداد مُصدَّر محكوم بنموذج التفعيل (Phase 4) · بلا مجموعة فعّالة ⇒ `not_yet_configured` بالعنوان المحايد المعتمد «معيار الجاهزية لهذا المسار قيد الاعتماد»؛ مجموعة مسودة مفعَّلة للتطوير ⇒ `pending_validation` بلا نتيجة إجمالية؛ لا نتيجة إلا لمجموعة **مُصادَق عليها مُفعَّلة للإنتاج** · `is_core`/`mandatory`/التصنيف لا تُعرض حقائق — الشارة `pending_expert_validation` حتى الاعتماد، وقاعدة «كل الأساسية» تُعاد `indeterminate` ما دام التصنيف معلَّقًا · صفحات المهارة تفصل **الرحلة · مستوى التحقق · الأدلة · المساهمة في الجاهزية** في أربع بطاقات · الجاهزية **لا تكتب** شيئًا (`verificationEffect: 'none'`؛ e2e يثبت ثبات الادعاءات) · مستوى التحقق لا يعني جاهزية (تصريح في الواجهة والـAPI) · اللقطات المسجَّلة تذكر إصدار المجموعة والإعداد الذي أنتجها (e2e: تفعيل إصدار جديد لا يمسّ اللقطة القديمة) · لا تغيير في أهلية CV/LinkedIn ولا تفعيل تحدٍّ ولا H6 · النظام المُجمَّد والأنماط القائمة (`card` · `chip` · `EvidenceState` · `disclaimer`) · **CHG-013** مُطبَّق على `SRS-001` v1.8 وظيفيًا (FR-G-023 · BR-023؛ بلا جداول ولا قيم ولا أوامر).

---

## 1. What was implemented — ما نُفِّذ

| المكوّن | ما يفعله |
|---|---|
| **مجموعات القواعد** `readiness_rule_set` | محكومة بنموذج التفعيل (`inactive` · `development_only` · `production_active`؛ **`legacy_baseline` ممنوع بقيد**): مفتاح · إصدار · مسار (أو عالمي) · تسميات · حالة مصادقة · تفعيل. مجموعة فعّالة واحدة لكل (مسار، مفتاح). **لا صف مبذور.** |
| **القواعد** `readiness_rule` | `rule_type` من ستة أنواع (قيد قاعدة + ثابت نطاق) · `params` (القيم) · `skill_id` · تسميات · ترتيب · تفعيل. **مجمَّدة بعد أول تفعيل للمجموعة** (مُحفِّز؛ التغيير إصدار جديد). |
| **أنواع القواعد (كود)** | `required_skill_at_level` («JavaScript إلزامية») · `non_compensable_skill` («غير قابلة للتعويض»؛ تُعاد موسومة كذلك) · `min_skills_at_level` («٥ مهارات على الأقل»؛ `scope ∈ all/enabled/core`) · `all_core_skills_at_level` («Debugging أساسية» عبر `is_core` + اعتماد التصنيف) · `all_skills_at_expected_level` («مستويات متوقعة مختلفة» عبر `expected_level`) · `min_evidence_per_skill`. |
| **المحرك** `evaluateReadiness` (نطاق، نقي) | يقرأ الوقائع (مستوى التحقق · عدد الأدلة القائمة · حالة الرحلة · إعداد TrackSkill) ويُعيد تقريرًا: الحالة · العنوان · القواعد بنتائجها (`satisfied` · `not_satisfied` · **`indeterminate`**) وتفاصيلها (عدّ لا نسبة) · ملخص عدّي · `overall` **فقط** عند `evaluated` (`meets_rule_set`/`does_not_meet_rule_set`) · `verificationEffect: 'none'`. **٧ اختبارات** (المجموع ١٨٩). `DOMAIN_RULESET_VERSION 0.11.0 → 0.12.0`. |
| **الحلّ** | مجموعة مفعَّلة خاصة بالمسار تسبق العالمية؛ `resolveActiveConfig` نفسه (الإنتاج: `production_active` فقط إذ لا baseline)؛ أكثر من مجموعة قابلة للتطبيق ⇒ خطأ مُسمّى. |
| **اللقطات** `readiness_evaluation` | إضافة فقط: المستخدم · المسار · إصدار إعداد المسار · مجموعة القواعد (المعرّف · المفتاح · الإصدار · الحالة · الحلّ) · الحالة · التقرير والوقائع · إصدار قواعد النطاق. |
| **API** | `GET /v1/me/readiness` (حي) · `POST /v1/me/readiness/evaluations` (لقطة) · `GET /v1/me/readiness/evaluations` · `GET /v1/me/track-skills` (كل مهارات المسار بأبعادها الأربعة + تقرير الجاهزية) · `GET /v1/me/track-skills/:skillId` (+ المادة · الدليل المُقيَّم · قرارات التحقق · أحداث الرحلة · الأنشطة المرتبطة). |
| **الأفعال** | `readiness-new-set <key> --rules <file.json> [--role] …` (مسودة `inactive`؛ الشكل يُفحص بالنطاق) · `config-approve`/`config-activate` على `readiness_rule_set` (نفس حوكمة Phase 4: مُصادَق + مُعتمِد قبل `production_active`؛ لا استبدال بالصدفة؛ `config_change`). |
| **الواجهة** | **`/skills`**: بطاقة الجاهزية (العنوان المحايد؛ عند مسودة مفعَّلة للتطوير قائمة القواعد موسومة `DRAFT / NOT VALIDATED` «للاطّلاع فقط — لا نتيجة ولا نسبة»؛ عند `evaluated` عدّ المستوفى من الكل) + قائمة المهارات: شارة التصنيف (`pending_expert_validation` ⇒ «التصنيف قيد اعتماد الخبراء») · حالة الرحلة · مستوى التحقق (`EvidenceState`) · عدّ الدليل المُقيَّم والمادة. **`/skills/[id]`**: أربع بطاقات مرقَّمة — الرحلة (+ أحداثها) · مستوى التحقق (+ القرارات وسياستها) · الأدلة (المادة ≠ المُقيَّم) · المساهمة في الجاهزية (الشارة · المستوى المتوقع وحالة اعتماده · الاحتساب · القواعد التي تسمّي المهارة موسومة مسودة إن لم تُعتمد) + الأنشطة المرتبطة. روابط من `/evaluation`. |
| **CHG-013 على SRS-001** | v1.8: **FR-G-023** (استعمال الإعداد في الإنتاج تفعيل صريح مُصدَّر؛ لا مسودة تصير فعّالة بصمت؛ لا استبدال بالصدفة؛ أساس التوافق موثَّق ظاهر غير مُصادَق حتى يُستبدل) · **BR-023** · المتطلبات 112 → 113 · المصفوفة (صف FR-G-023 · CHG-013). |
| **الاختبارات** | `apps/api/test/readiness.e2e.ts` (٤): بلا مجموعة ⇒ `not_yet_configured` بالعنوان المحايد، بلا نسبة، الصفحة بأربعة أبعاد وشارات `pending` · مجموعة بأربعة أنواع مفعَّلة للتطوير ⇒ `pending_validation` (مستوفاة/غير مستوفاة/غير محدَّدة للأساسية)، **الادعاءات لم تتغير**، اللقطة تذكر الإصدار؛ مصادقة + `production_active` ⇒ `evaluated` بلا نسبة؛ إصدار v2 بقيم مختلفة يحلّ محل v1 **بلا كود** واللقطة القديمة تبقى على v1 · السلبيات: لا baseline للجاهزية؛ نوع غير معروف مرفوض؛ قيم مشوّهة مرفوضة؛ قواعد مجموعة مفعَّلة مجمَّدة · RLS: اللقطات خاصة وإضافة فقط. |

**النتائج:** النطاق **١٨٩/١٨٩** ✅ · API build ✅ · e2e **١٢٠/١٢٠** ✅ (قاعدة مُعاد بناؤها 0001→0015) · `npm test` الجذر ✅ · `npm run verify` ✅ (SRS v1.8) · typecheck الواجهة ✅.

## 2. Files changed — الملفات

**جديدة:** `supabase/migrations/0015_readiness.sql` · `packages/domain/src/readiness.ts` · `packages/domain/src/readiness.test.ts` · `apps/api/src/readiness/{readiness.module.ts, readiness.service.ts, readiness.controller.ts}` · `apps/api/test/readiness.e2e.ts` · `apps/app/src/app/skills/page.tsx` · `apps/app/src/app/skills/[id]/page.tsx` · هذا التقرير.
**مُعدَّلة:** `packages/domain/src/index.ts` (تصدير + 0.12.0) · `apps/api/src/configuration/{configuration.service.ts (جدول محكوم جديد), config-admin.service.ts (`createReadinessRuleSet`)}` · `apps/api/src/career-data/cli.ts` (`readiness-new-set`) · `apps/api/src/app.module.ts` · `apps/app/src/lib/api.ts` · `apps/app/src/app/evaluation/page.tsx` (رابط) · `docs/srs/SRS-001-naqla-functional.md` (v1.8 · CHG-013) · `docs/srs/SRS-001-traceability-matrix.md` · `docs/architecture/{DOMAIN-MODEL.md (§١٣د), DATA-MODEL.md, CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md}` · `docs/decisions/DECISIONS.md` (D-112).
**لم تُمس:** `skill_claim`/`evidence`/`skill_progress` (الجاهزية تقرأ فقط) · `presentationFor` · سياسات التحدي · H6 · `apps/web/` · `data/**`.

## 3. Database changes — القاعدة

| | |
|---|---|
| **جداول جديدة (٣)** | `readiness_rule_set` · `readiness_rule` · `readiness_evaluation` |
| **تعديل قائم** | `track_config_version`: رُفع قيد «لا قواعد جاهزية» وأُضيف مفتاح أجنبي إلى `readiness_rule_set` (nullable؛ لا صف تغيّر) |
| **قيود/مُحفِّزات** | لا baseline للجاهزية · `rule_type` ضمن الستة · `params` كائن · مجموعة فعّالة واحدة لكل (مسار، مفتاح) · قواعد مجموعة مفعَّلة مجمَّدة · اللقطة إضافة فقط · شكل الحالة (`not_yet_configured` ⇔ بلا مجموعة) · حوكمة Phase 4 (`config_activation_guard`) |
| **RLS** | المجموعات والقواعد مقروءة للجميع؛ اللقطات للمالك قراءةً فقط. |
| **Seed/Backfill** | **لا شيء.** |

## 4. What is configurable now — ما صار إعدادًا

كل ما طلبته المالكة كمثال يُطبَّق بإصدار مجموعة قواعد/إعداد جديد **بلا كود**:
- **JavaScript إلزامية** → قاعدة `required_skill_at_level {min_level}` على مهارة JS.
- **Debugging أساسية** → `is_core = true` + اعتماد `classification_status` على صف TrackSkill، ثم قاعدة `all_core_skills_at_level` تُحكم بدل أن تبقى `indeterminate`.
- **٥ مهارات على الأقل** → `min_skills_at_level {min_count: 5, min_level, scope}`.
- **مهارات غير قابلة للتعويض** → `non_compensable_skill` لكل منها.
- **مستويات متوقعة مختلفة** → `expected_level` لكل TrackSkill + قاعدة `all_skills_at_expected_level`.
- **كم دليلًا لكل مهارة** → `min_evidence_per_skill`.
- أي مجموعة تُنشأ مسودة، تُصادَق باسم خبير، تُفعَّل بفعل مُدقَّق؛ القديمة تبقى للتاريخ واللقطات تشير إليها.

## 5. What remains intentionally unresolved — ما تُرك عمدًا

- **كل قيم القواعد** ومجموعة القواعد الأولى نفسها — رأي الخبراء؛ لا شيء مبذور.
- **قواعد مركّبة** (أو/أوزان/تعويض بين مهارات) — تُضاف كأنواع كود جديدة إذا طلبها الخبراء؛ لم تُفترض.
- **ربط إصدار إعداد المسار بمجموعة قواعد** (`readiness_rule_set_id`) — العمود جاهز؛ الحلّ الآن بالتفعيل لكل مسار/عالمي؛ يُستعمل حين تُجمَّع إصدارات المسار بالكامل (Phase 8).
- **«الخطوة التالية» المقترحة للمستخدم** من فجوة الجاهزية — تُعرض الآن القواعد غير المستوفاة كما هي؛ اقتراح نشاط يبقى للوكيل التقني عبر مقترح (لا توجيه آلي).
- **SRS**: لا تغيير لهذه المرحلة (CHG-013 كان لحوكمة الإعداد). صياغة «الجاهزية تقرير على قواعد مُعدَّة لا مستوى» وظيفيًا تحتاج `CHG-014` بقرار المالكة (مقترح: BR-024 + ملاحظة §5.1.6).

## 6. Risks — المخاطر

| الخطر | التخفيف |
|---|---|
| قراءة قائمة القواعد المسودة في `/skills` كأنها حكم | العنوان المحايد يتصدّر؛ وسم `DRAFT / NOT VALIDATED` و«للاطّلاع فقط — لا نتيجة ولا نسبة»؛ لا `overall`. تظهر خارج الإنتاج فقط (مسودة لا تُفعَّل في الإنتاج). |
| `indeterminate` يُقرأ إخفاقًا | تسمية «غير محدَّدة (تنتظر اعتماد التصنيف)» وتفصيل السبب. |
| تضخّم اللقطات عند الاستدعاء المتكرر | التسجيل فعل صريح (`POST`)؛ `GET` حي بلا كتابة. |
| مهارة مرتبطة بأكثر من مجموعة قواعد | مجموعة فعّالة واحدة لكل مسار (الخاصة تسبق العالمية)؛ الغموض خطأ مُسمّى. |

## 7. What expert input can change later without code changes — ما يغيّره الخبراء بلا كود

- إنشاء أول مجموعة قواعد للمسار بالقيم التي يقرّونها، ومصادقتها وتفعيلها.
- اعتماد تصنيف كل TrackSkill ومستواه المتوقع واحتسابه، فتصير قواعد «الأساسية» و«المستوى المتوقع» قابلة للحكم.
- تعديل أي قيمة لاحقًا بإصدار جديد؛ اللقطات القديمة تبقى على إصدارها.

---
**التالي بعد مراجعة المالكة:** Phase 6 — AI Usage / Integrity Flow (استبيان الإفصاح المُهيكل كبيانات · سجل التحدي وسياسته بلا تحدٍّ نشط).
