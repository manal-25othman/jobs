# نَقْلة / NAQLA — Configurable Track Architecture · **Phase 2 Report: Skill Status Model**
**التاريخ:** 2026-10-07 · **الخطة الحاكمة:** `CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md` (معتمدة) · **المرجع الكانوني:** `docs/srs/SRS-001-naqla-functional.md` v1.6 · **القرار:** D-109
**الحالة:** Phase 2 مُنفَّذة ومُثبَتة · **التنفيذ متوقف** بانتظار مراجعة المالكة قبل Phase 3 (Structured Assessment + Verification Decision).

> **قيود المالكة وكيف احتُرمت:** `skill_claim` لم تتغير دلالاته ولا صف فيه (backfill مُثبَت md5) · إكمال نشاط يحرّك **الرحلة** فقط ولا يلمس مستوى التحقق (`verificationEffectOfProgress() === 'none'`، مُختبَر: مشروع ⇒ `in_progress` **بلا ادعاء**) · لا قاعدة انتقال في الكود — الحالات والمحفّزات والقواعد صفوف `DRAFT / NOT VALIDATED` · البُعدان يُعادان جنبًا إلى جنب ولا يُشتق أحدهما من الآخر · توافق خلفي (٩٣ e2e قائمًا تمرّ كما هي + ٨ جديدة؛ `me/skills` إضافي فقط) · `CHG-011` مُطبَّق على `SRS-001` **وظيفيًا فقط** (v1.6 · DR-016 · `SubmittedMaterial`؛ بلا أسماء جداول).

---

## 1. What was implemented — ما نُفِّذ

| المكوّن | ما يفعله |
|---|---|
| **سجل الحالات** `skill_progress_state` | ٦ حالات رحلة كبيانات: `not_started` (ابتدائية) · `in_progress` · `submitted` · `under_review` · `needs_more_evidence` · `evidence_recorded` («سُجِّل دليل مُقيَّم» — معلَم رحلة، **ليس مستوى تحقق**). قيد يرفض أي رمز من سلّم الدليل؛ حالة ابتدائية مفعَّلة واحدة؛ `approved` يشترط مُعتمِدًا. كلها `draft`. |
| **سجل المحفّزات** `skill_progress_trigger` | ٨ محفّزات كبيانات مع اسم المُنتِج: `project.created` · `evidence_item.added` · `submission.created` · `evaluation.queued_for_human` · `evaluation.completed` · `evidence.withdrawn` مفعَّلة؛ `more_evidence.requested` و`history.backfill` مسجَّلان **بلا مُنتِج** (`active = false`؛ إصدارهما من الكود يُرفض باسم). |
| **قواعد الانتقال** `skill_progress_transition` | ١٤ قاعدة مبذورة (`from` · `to` · `trigger` · `guard` تصريحي · `rationale_en` · `enabled` · `version` · `review_status`) — **كلها `draft`**. مثال: `submitted → evidence_recorded` عند `evaluation.completed` بشرط `{"produced_evidence": true}`؛ `evidence_recorded → needs_more_evidence` عند `evidence.withdrawn` بشرط `{"standing_evidence_count": 0}`. |
| **صف الرحلة** `skill_progress` | واحد لكل (مستخدم، مهارة) مع `target_role_id` سياقًا؛ `reason` · `last_trigger_code` · `transition_rule_id`. يُنشأ عند أول تماس بالحالة الابتدائية. |
| **السجل** `skill_progress_event` | إضافة فقط (مُحفِّز يرفض التعديل والحذف). **كل إصدار محفّز يُسجَّل**: `transitioned` · `no_matching_rule` · `rules_inactive` · `backfilled`، مع إصدار القاعدة والوقائع ومرجع الحدث (`evaluation_result` · `submission` · `project` · `evidence` · `evidence_item`). |
| **النطاق** `packages/domain/src/skill-progress.ts` | `nextProgress` نقي: قاعدة مفعَّلة واحدة تطابق (`from` · `trigger` · `guard`)؛ **قاعدتان ⇒ `DomainError` (خطأ بيانات، لا اختيار صامت)**؛ لا قاعدة ⇒ `none` صريح · `evaluateGuard` (`value` · `{not}` · `{in}`؛ الواقعة الغائبة تُفشل الشرط) · `assertProgressRuleSetSane` · `initialProgressState` · `assertProgressStateCodeDistinct` · `progressRulesUsable` (**المسودة تُطبَّق خارج الإنتاج فقط**) · `verificationEffectOfProgress() === 'none'`. **٩ اختبارات وحدة** (المجموع ١٦٨). `DOMAIN_RULESET_VERSION 0.8.0 → 0.9.0`. |
| **المحرّك** `SkillProgressEngine.apply(c, …)` | داخل معاملة الحدث المُنتِج: يحمّل القواعد كبيانات، يرفض محفّزًا غير مسجَّل أو بلا مُنتِج، ينشئ الصف إن لم يوجد، يسأل النطاق، يكتب الصف والحدث و`audit_event`. **لا يلمس `skill_claim` ولا `evidence` ولا `evidence_transition`.** في الإنتاج بقواعد `draft`: يسجّل `rules_inactive` ويحذّر ولا يطبّق. |
| **المُنتِجون** | إنشاء مشروع على نشاط (كل مهارات `activity_skill`) · إضافة/ربط مادة (`evidence_item.added`) · تسليم (المهارات المُدَّعاة) · تقييم آلي (`queued_for_human` أو `completed` بوقائع `outcome` · `produced_evidence`) · إنهاء المراجعة البشرية (`completed`) · سحب دليل (`standing_evidence_count`). |
| **API** | `GET /v1/skill-progress-rules` (الحالات والمحفّزات والقواعد بحالة تحققها + حالة المحرّك) · `GET /v1/me/skill-progress` (لكل مهارة: `progress` و`verification` جنبًا إلى جنب + `engine {active, reason}`) · `GET /v1/me/skill-progress/:skillId/events` · `GET /v1/me/skills` يحمل `progress` **إضافيًا** (كل الحقول القديمة كما هي). |
| **الواجهة** (الحد الأدنى؛ النظام المُجمَّد) | `/evaluation`: قسم «رحلة المهارة» يعرض حالة الرحلة بجانب مستوى التحقق بالمكوّن القائم `EvidenceState`، مع التصريح «بُعدان منفصلان؛ إكمال نشاط لا يرفع مستوى التحقق؛ القواعد DRAFT»، ويُظهر سبب تعطّل المحرّك إن تعطّل. `api.ts`: `SkillJourney` · `SkillJourneyEngine` · `SkillClaim.progress`. |
| **Backfill** | يشتق حالة رحلة لكل (مستخدم، مهارة) له ادعاء أو تسليم من التاريخ (دليل قائم ⇒ `evidence_recorded`؛ تقييم بلا دليل ⇒ `needs_more_evidence`؛ تسليم ⇒ `submitted`؛ غير ذلك `in_progress`) بمحفّز `history.backfill` وحدث `backfilled`. مُثبَت على قاعدة ما قبل 0012: `skill_claim` و`evidence` md5 قبل = بعد. |
| **CHG-011 على SRS-001** | v1.6: `DR-016` (المادة المُقدَّمة منفصلة عن الدليل المُقيَّم؛ لا تحرّك ادعاءً؛ أنواعها إعداد قابل للتحقق) · `SubmittedMaterial` في §6.1 · §21/§22 · المصفوفة مرتبطة بـv1.6. **بلا أسماء جداول ولا مخطط.** |
| **الاختبارات** | `apps/api/test/skill-progress.e2e.ts` (٨): السجل draft والمحرّك يصرّح · حالة رحلة لا تحمل رمز سلّم · **مشروع ⇒ `in_progress` بلا ادعاء**؛ تسليم ⇒ `submitted`/`practiced`؛ تقييم ⇒ `evidence_recorded`/`demonstrated` · فشل ⇒ `needs_more_evidence` والمستوى `practiced` ثابت؛ محاولة جديدة ⇒ `submitted` · سحب آخر دليل ⇒ `needs_more_evidence` والمستوى `demonstrated` ثابت (D-077) · مادة ⇒ `in_progress` بلا ادعاء · السجل يسجّل `transitioned` و`no_matching_rule` بإصدار القاعدة؛ إضافة فقط · RLS: مستخدم آخر لا يرى؛ المالك لا يكتب صفًا ولا حدثًا ولا قاعدة. |

**النتائج:** النطاق **١٦٨/١٦٨** ✅ · API build ✅ · e2e **١٠١/١٠١** ✅ (قاعدة مُعاد بناؤها 0001→0012 + seed + الحزمة الكانونية) · `npm test` الجذر ✅ · `npm run verify` ✅ (SRS v1.6) · typecheck الواجهة ✅ · backfill مُثبَت ✅.

## 2. Files changed — الملفات

**جديدة:** `supabase/migrations/0012_skill_progress.sql` · `packages/domain/src/skill-progress.ts` · `packages/domain/src/skill-progress.test.ts` · `apps/api/src/skill-progress/{skill-progress.module.ts, skill-progress-engine.service.ts, skill-progress.service.ts, skill-progress.controller.ts}` · `apps/api/test/skill-progress.e2e.ts` · هذا التقرير.
**مُعدَّلة:** `packages/domain/src/index.ts` (تصدير + 0.9.0) · `apps/api/src/slice1/{career.service.ts (project.created + `progress` في `me/skills`), submission.service.ts, evaluation.service.ts (المساران), withdrawal.service.ts}` · `apps/api/src/evidence/{evidence.service.ts, evidence.module.ts}` · `apps/api/src/{app.module.ts, slice1/slice1.module.ts, review/review.module.ts}` · `apps/app/src/lib/api.ts` · `apps/app/src/app/evaluation/page.tsx` · `docs/srs/SRS-001-naqla-functional.md` (v1.6 · CHG-011) · `docs/srs/SRS-001-traceability-matrix.md` (الرابط) · `docs/architecture/{DOMAIN-MODEL.md (§١١ب), DATA-MODEL.md, CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md}` · `docs/decisions/DECISIONS.md` (D-109).
**لم تُمس:** `apps/web/` · `data/**` · `evidence-state.ts` · `verification.ts` · `claims.ts` · الوكلاء · محقق الحزمة · أي جدول قائم.

## 3. Database changes — القاعدة

| | |
|---|---|
| **جداول جديدة (٥)** | `skill_progress_state` · `skill_progress_trigger` · `skill_progress_transition` · `skill_progress` · `skill_progress_event` |
| **تعديل جداول قائمة** | **لا شيء.** `skill_claim` و`evidence` و`evidence_transition` كما هي. |
| **قيود** | رمز الحالة ∉ سلّم الدليل · حالة ابتدائية مفعَّلة واحدة (فهرس فريد جزئي) · `from <> to` · `guard`/`facts` كائنات jsonb · `approved` يشترط `approved_by/at` (حالات وقواعد) · حدث مطبَّق يحمل `to_state`؛ غير مطبَّق لا يحمله · `unique(user_id, skill_id)` · `unique(from, to, trigger, version)` |
| **مُحفِّزات** | `skill_progress_event_immutable` (إضافة فقط) · `touch_updated_at` ×٣ |
| **RLS** | السجلات الثلاثة مقروءة للجميع · الرحلة والسجل: المالك يقرأ فقط؛ **لا سياسة إدراج ولا تعديل للمستخدم** — المحرّك يكتب كـservice role داخل معاملة الحدث. مُثبَت بدور `authenticated`. |
| **Backfill** | إضافي فقط؛ لا يقرأ إلا التاريخ ولا يكتب إلا الجدولين الجديدين. |

## 4. What is configurable now — ما صار إعدادًا

- **حالات الرحلة**: إضافة/تعطيل/إعادة تسمية/ترتيب كصفوف؛ تغيير الحالة الابتدائية.
- **قواعد الانتقال**: أي `from → to` عند أي محفّز بشرط تصريحي، بإصدار؛ تعطيل قاعدة أو استبدالها بإصدار أعلى دون كود (القاعدة القديمة تبقى للتاريخ والأحداث تشير إلى إصدارها).
- **المحفّزات**: تسجيل محفّز جديد بلا مُنتِج ثم تفعيله حين يوجد مُنتِج.
- **التطبيق في الإنتاج**: اعتماد القواعد (`approved_by/at`) هو ما يفعّل المحرّك في الإنتاج؛ لا متغيّر بيئة ولا علم في الكود.
- **الشرح للمستخدم**: `label_ar/en` و`description_en` لكل حالة من البيانات.

## 5. What remains intentionally unresolved — ما تُرك عمدًا

- **قواعد الانتقال نفسها**: المبذورة مسودة تقريبية لا رأي خبراء (مثلًا: هل تعود `evidence_recorded` إلى `submitted` عند محاولة جديدة؟ هل الملف المضاف يكفي لـ`in_progress`؟).
- **`more_evidence.requested`**: مسجَّل بلا مُنتِج — متى يطلب النظام أو المراجع دليلًا إضافيًا قرارُ سياسة لاحق (Phase 3/4).
- **الرحلة لكل مسار**: `target_role_id` يُسجَّل سياقًا؛ المفتاح (مستخدم، مهارة) — فصل الرحلة لكل مسار يُحسم حين يُسمح بأكثر من مسار.
- **الخطوة التالية المقترحة** للمستخدم (ما ينقص) — Phase 5 مع محرك الجاهزية؛ الآن تُعرض الحالة وسببها فقط.
- **المسار البشري**: `queued_for_human` يحرّك إلى `under_review`؛ لا تمييز بعد بين سبب التصعيد (ثقة · تعارض · عيّنة) — ينتظر Phase 3.
- **SRS-001**: لم يُغيَّر لهذه المرحلة (CHG-011 كان للمادة). صياغة وظيفية لـ«حالة الرحلة ومستوى التحقق بُعدان منفصلان» تحتاج `CHG-012` بقرار المالكة؛ المقترح: `DR-017` + سطر في §5.1.6.

## 6. Risks — المخاطر

| الخطر | التخفيف |
|---|---|
| قراءة `evidence_recorded` كأنه «مُثبتة» | التسمية «سُجِّل دليل مُقيَّم»، الوصف يصرّح «ليس مستوى تحقق»، والواجهة تعرض المستوى بجانبه بالمكوّن القائم. |
| في الإنتاج الرحلة لا تتحرّك حتى تُعتمد القواعد | مقصود (لا مسودة في الإنتاج)؛ الـAPI يعلن `engine.active=false` وسببه والواجهة تعرضه. |
| ازدياد الأحداث (حدث لكل مهارة نشاط عند إنشاء مشروع) | إدراج فقط، مفهرس؛ النشاط الحالي يعلن مهارتين. |
| قاعدتان متطابقتان بعد تعديل إداري | `nextProgress` يرمي خطأ بيانات مُسمّى؛ `assertProgressRuleSetSane` يرفض التكرار الحرفي. |

## 7. What expert input can change later without code changes — ما يغيّره الخبراء بلا كود

- اعتماد مجموعة القواعد أو تعديل أي قاعدة (الحالة المستهدفة · الشرط · التفعيل · إصدار جديد).
- إضافة حالات رحلة (مثل «بانتظار تحدٍّ» أو «متوقفة») وربطها بقواعد.
- تفعيل `more_evidence.requested` حين يُبنى مُنتِجه وتحديد من أي حالات يعمل.
- ما يُعرض للمستخدم عن كل حالة (التسميات والأوصاف).

---
**التالي بعد مراجعة المالكة:** Phase 3 — Structured Assessment + Verification Decision (`0013`؛ سياسة تحقق مسودة **تساوي السلوك الحالي**؛ H6 خلفها معطَّلًا).
