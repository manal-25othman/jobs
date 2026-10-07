# نَقْلة / NAQLA — Configurable Track Architecture · **Phase 3 Report: Structured Assessment + Verification Decision**
**التاريخ:** 2026-10-07 · **الخطة الحاكمة:** `CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md` (معتمدة) · **المرجع الكانوني:** `docs/srs/SRS-001-naqla-functional.md` v1.7 (CHG-012 مُطبَّق) · **القرار:** D-110
**الحالة:** Phase 3 مُنفَّذة ومُثبَتة · **التنفيذ متوقف** بانتظار مراجعة المالكة قبل Phase 4 (Configuration & Policy Layer).

> **قيود المالكة وكيف احتُرمت:** السلوك القائم محفوظ **حرفيًا** عبر سياسة مسودة (اختبار تطابق شامل في النطاق على كل تركيبة نتيجة × مقترح × حالي + e2e يثبت أن صف `verification` ونص سببه كما كانا) · `Assessment` و`Verification Decision` سجلان وجدولان منفصلان · **`llm` لا يمنح مستوى**: قيد قاعدة يمنع تسميته فاعلًا، و`decided_by_kind` لا يقبله، والنطاق يرمي INV-3 · **كل قرار يذكر السياسة ومفتاحها وإصدارها وحالتها وإصدار مجموعة القواعد** · كل مقبض خبراء (ثقة · أدلة · تصعيد · حجب · اشتقاق) عمود `null`/معطَّل في صف `draft` = DRAFT / NOT VALIDATED · H6 خلف `per_skill_evidence_derivation = false` · لا أثر على أهلية CV/LinkedIn (مُختبَر: لا أصل مهني يُنشأ) · التاريخ محفوظ (backfill إضافي؛ md5 لـ`verification` و`evaluation_result` و`skill_claim` قبل = بعد) · **CHG-012** مُطبَّق على `SRS-001` v1.7 وظيفيًا فقط (BR-022 · DR-017 · ملاحظة §5.1.6).

---

## 1. What was implemented — ما نُفِّذ

| المكوّن | ما يفعله |
|---|---|
| **سياسة التحقق** `verification_policy` | صف بيانات بمفتاح وإصدار وحالة تحقق. الأعمدة: `applies_outcomes` · `accept_rubric_proposal` · `max_resulting_state` · `min_assessment_confidence` · `min_independent_evidence` · `escalate_on` · `blocking_rule` · `per_skill_evidence_derivation` · `decision_actors`. **المبذورة `default@1` مسودة تساوي السلوك السابق**: تنطبق على `passed` فقط، تقبل اقتراح الرُبريك، بلا سقف (سقف الإنتاج `demonstrated` يبقى ثابتًا في الكود D-059/D-102)، كل مقبض `null`/معطَّل. قيود: `llm`/`agent` **لا يمكن تسميتهما فاعلين**؛ `approved` يشترط `approved_by/at`؛ سياسة مفعَّلة واحدة لكل مفتاح. |
| **التقييم المُهيكل** `assessment` + `assessment_criterion_result` | لكل نتيجة تقييم ولكل مُقيِّم: `evaluator_kind` (`rule` · `human` · `llm` محجوز) · `evaluator_ref` · إصدارات الرُبريك والنشاط ومجموعة القواعد (`DOMAIN_RULESET_VERSION`) وسياسة السياق (null حتى Phase 4) · `inputs_used` (مفاتيح الأدوات · عناصر المادة · `identity_excluded: true`) · `raw_result` كاملًا · الثقة (أضعف بند). لكل بند: الحالة · الدرجة · **الدليل المستخدم** · **الدليل الناقص** (من مفاتيح الفحص غير الموجودة) · الملاحظات · القوة · الفجوات · الثقة · نوع المُقيِّم · **الإجراء التالي** (`Provide: <keys>` — من المفاتيح الناقصة لا من اختراع). ثابتان (مُحفِّز يرفض التعديل والحذف). |
| **قرار التحقق** `verification_decision` | لكل تقييم ولكل مهارة **قرار مُسجَّل دائمًا** حتى حين لا ينطبق (`not_applicable` للفشل والحجب والمرحلي) أو عند إعادة الإثبات (`evidence_reestablished`، D-077): السياسة (`id` · `key` · `version` · **`status` وقت القرار**) · إصدار مجموعة القواعد · `decided_by_kind ∈ policy/human` · الحالة السابقة/المقترحة/الناتجة · الثقة · السبب · `human_override_of` (التجاوز البشري صف جديد لا يمحو) · روابط صف `verification` القديم و`evidence` الناتج. قيود: لا رفع فوق المقترح · لا تنزيل تحت السابق · إنسان ⇒ مرجع مُسمّى · ثابت. |
| **النطاق** `packages/domain/src/verification-policy.ts` | `decideWithPolicy(policy, facts)` نقي: `llm` ⇒ INV-3 · لا ينطبق ⇒ `not_applicable` · حدّ ثقة ⇒ `escalated_to_human` (تثبيت) · حدّ أدلة ⇒ `downgraded` · عدم قبول الاقتراح ⇒ `downgraded` · سقف ⇒ تقييد · وإلا `accepted` **عبر `decideVerification` القائم** (INV-9) · `legacyVerificationDecision` (القاعدة القديمة كدالة) · `criterionResultStatus` · `assessmentConfidence`. **٤ اختبارات** منها **تطابق شامل** مع القاعدة القديمة (≥٦٠ تركيبة). `DOMAIN_RULESET_VERSION 0.9.0 → 0.10.0`. |
| **تدفق التقييم** (`evaluation.service.ts`) | في المسارين (الآلي · إنهاء المراجعة البشرية): بعد كتابة النتيجة والدرجات **كما كانت** → تسجيل `assessment` (`rule` للآلي؛ `human` للمجمَّع مع قرارات المراجعين) → `decideAndApply`: تحميل السياسة · القرار من النطاق · **كتابة `verification` والترقية/إعادة الإثبات حرفيًا كما قبل** · تسجيل `verification_decision` · ثم H6 إن فعّلته السياسة. |
| **H6** `deriveEvidencePerSkill` | خلف `per_skill_evidence_derivation` (معطَّل): لكل مهارة **أخرى مُدَّعاة** في التسليم استوفى التشغيل كل بنود `skill_evidence` الخاصة بها، القرار نفسه عبر السياسة ثم ترقية وقرار مُسجَّل. **مُختبَر سلبًا فقط** (العلم مفعَّلًا ومهارة بلا بنود ⇒ لا شيء): لا يوجد بعد رُبريك متعدد المهارات بمعايير قاعدية ليُختبر الموجب. |
| **API** | `GET /v1/verification-policies` · `GET /v1/submissions/:id/assessment` (التقييمات مع بنودها وقراراتها؛ ملاحظة صريحة: ليس أهلية CV/LinkedIn). `GET submissions/:id/evaluation` كما هو. |
| **الواجهة** (الحد الأدنى؛ النظام المُجمَّد) | `/evaluation`: قسم «ما لوحظ وما تقرّر»: لكل بند حالته والدليل المستخدم وما ينقص والخطوة التالية؛ سطر القرار: النوع · من/إلى · السياسة وإصدارها و`(DRAFT / NOT VALIDATED)` · «قرّرتها السياسة، لا نموذج لغوي»؛ تصريح بأن القرار لا يغيّر أهلية السيرة/لينكدإن. `api.ts`: `Assessment`. |
| **Backfill** | كل `evaluation_result` تاريخي → `assessment` (`rule`، مرجع `backfill:0013`، الخام من الدرجات والفحوص، `domain_ruleset_version = 'pre-0.10.0'`) + بنود من `evaluation_criterion_score`؛ كل `verification` تاريخي → `verification_decision` تحت `default@1` (الذي أنتجه فعلًا) مع `decided_by_ref = backfill:0013`. مُثبَت على قاعدة ما قبل 0013. |
| **CHG-012 على SRS-001** | v1.7: **BR-022** (الرحلة ومستوى التحقق بُعدان منفصلان؛ إكمال نشاط ≠ تحقق) · **DR-017** · ملاحظة §5.1.6 · §21/§22 · المصفوفة. بلا أسماء جداول ولا محفّزات. |
| **الاختبارات** | `apps/api/test/assessment.e2e.ts` (٧): السجل draft و`llm` مرفوض بنيويًا · نجاح: **صف `verification` ونص سببه حرفيًا كما قبل** + تقييم `rule` بإصدارات ومدخلات وبنود `met` + قرار `accepted` يسمّي `default@1 draft` و`0.10.0` ويربط `verification` و`evidence` · فشل: بنود `not_met` تسمّي الناقص والإجراء التالي؛ `not_applicable`؛ لا `verification` ولا `evidence` · حجب: تقييم مُسجَّل + `not_applicable` · إعادة إثبات D-077: `evidence_reestablished` · H6 معطَّل/مفعَّل سلبًا · RLS وثبات: مستخدم آخر لا يرى؛ المالك لا يكتب؛ service role لا يعدّل ولا يحذف؛ `llm` ولا رفع فوق المقترح مرفوضان بالقاعدة؛ لا أصل مهني. + تأكيد في `human-review.e2e`: المرحلي `rule/needs_human_review/not_applicable` ثم النهائي `human/passed/accepted` تحت `default@1 draft`. |

**النتائج:** النطاق **١٧٢/١٧٢** ✅ · API build ✅ · e2e **١٠٩/١٠٩** ✅ (قاعدة مُعاد بناؤها 0001→0013) · `npm test` الجذر ✅ · `npm run verify` ✅ (SRS v1.7) · typecheck الواجهة ✅ · backfill مُثبَت ✅.

## 2. Files changed — الملفات

**جديدة:** `supabase/migrations/0013_structured_assessment.sql` · `packages/domain/src/verification-policy.ts` · `packages/domain/src/verification-policy.test.ts` · `apps/api/src/assessment/{assessment.module.ts, assessment-recorder.service.ts, assessment.service.ts, assessment.controller.ts}` · `apps/api/test/assessment.e2e.ts` · هذا التقرير.
**مُعدَّلة:** `packages/domain/src/index.ts` (تصدير + 0.10.0) · `apps/api/src/slice1/evaluation.service.ts` (`decideAndApply` · `deriveEvidencePerSkill` · تسجيل التقييم في المسارين) · `apps/api/src/{app.module.ts, slice1/slice1.module.ts, review/review.module.ts}` · `apps/api/test/human-review.e2e.ts` (تأكيد إضافي) · `apps/app/src/lib/api.ts` · `apps/app/src/app/evaluation/page.tsx` · `docs/srs/SRS-001-naqla-functional.md` (v1.7 · CHG-012) · `docs/srs/SRS-001-traceability-matrix.md` · `docs/architecture/{DOMAIN-MODEL.md (§١٣ب), DATA-MODEL.md, CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md}` · `docs/decisions/DECISIONS.md` (D-110).
**لم تُمس:** `verification.ts` (القاعدة القديمة تُستدعى كما هي) · `evidence-state.ts` · `production-limits.ts` · `claims.ts`/`presentationFor` · `career_presentation_rule` · الوكلاء · `apps/web/` · `data/**` · أي جدول قائم.

## 3. Database changes — القاعدة

| | |
|---|---|
| **جداول جديدة (٤)** | `verification_policy` · `assessment` · `assessment_criterion_result` · `verification_decision` |
| **تعديل جداول قائمة** | **لا شيء.** `evaluation_result` · `verification` · `evidence` · `evidence_transition` · `skill_claim` كما هي وتُكتب كما كانت. |
| **قيود** | `llm`/`agent` ليسا فاعلي قرار (سياسة وقرار) · `decision_actors ⊆ {policy, human}` وغير فارغ · `approved` يشترط مُعتمِدًا · سياسة مفعَّلة واحدة لكل مفتاح · حدود الثقة ∈ [0,1] · القرار لا يرفع فوق المقترح ولا ينزل تحت السابق · إنسان ⇒ مرجع · التجاوز بشري فقط · `unique(evaluation_result_id, evaluator_kind)` |
| **مُحفِّزات** | `assessment_immutable` على الجداول الثلاثة (لا تعديل ولا حذف) · `touch_updated_at` للسياسة |
| **RLS** | السياسة مقروءة للجميع؛ التقييم والبنود والقرار: المالك يقرأ فقط؛ الكتابة service role داخل معاملة التقييم. مُثبَت بدور `authenticated`. |
| **Backfill** | إضافي فقط (§1). |

## 4. What is configurable now — ما صار إعدادًا

- **من يقرّر وعلى أي نتائج**: `decision_actors` · `applies_outcomes`.
- **هل يُقبل اقتراح الرُبريك تلقائيًا** وما **السقف** (`accept_rubric_proposal` · `max_resulting_state`).
- **حدّ الثقة** (`min_assessment_confidence`) ⇒ تصعيد لإنسان بدل القبول.
- **كفاية الأدلة** (`min_independent_evidence`) ⇒ تثبيت بدل الترقية (BR-012/013 حين يُحسمان).
- **قواعد التصعيد** (`escalate_on` — بنية جاهزة، بلا تفسير بعد) و**قاعدة الحجب** (`blocking_rule`).
- **الاشتقاق لكل مهارة** (`per_skill_evidence_derivation`).
- **إصدار سياسة جديد** بدل تعديل القديم: القرارات القديمة تذكر إصدارها وتبقى كما هي.

## 5. What remains intentionally unresolved — ما تُرك عمدًا

- **قيم المقابض كلها** (`null`/معطَّلة): حدّ الثقة · عدد الأدلة · التصعيد · الحجب — رأي خبراء (OPEN-048 · BR-012/013).
- **`escalate_on`**: مخطَّط كبنية مفتوحة؛ ربطها بأسباب §2.7 (ثقة منخفضة · أدلة متعارضة · اختلاف مُقيِّمين · حالة غير مدعومة · اعتراض · عيّنة) تفسيرٌ لاحق في النطاق حين تُعتمد القيم.
- **التجاوز البشري**: العمود `human_override_of` والقيد موجودان؛ لا نقطة نهاية ولا واجهة (Phase 4/6 مع أدوار الحوكمة).
- **`assessment.context_policy_version` = null** حتى `assessment_context_policy` (Phase 4)؛ المدخلات تُسجَّل الآن كما هي مع `identity_excluded`.
- **`evaluator_kind = 'llm'`** محجوز في المخطط؛ لا مزوّد موصول (قرار المالكة)؛ حين يُوصل، تقييمه مدخل للسياسة لا قرار.
- **H6 الموجب** غير مُختبَر لغياب رُبريك متعدد المهارات بمعايير قاعدية؛ يُختبر مع أول رُبريك كهذا قبل أي تفعيل.
- **أهلية CV/LinkedIn** كما هي (Phase 7 بموافقة H4).

## 6. Risks — المخاطر

| الخطر | التخفيف |
|---|---|
| في الإنتاج، سياسة `draft` **تُطبَّق** (خلافًا لقواعد الرحلة) | مقصود: هي السلوك القائم حرفيًا؛ كل قرار يحمل `policy_status = draft`؛ تحذير إقلاع؛ الاعتماد صف بيانات لا كود. |
| تضخّم الصفوف (تقييم + بنود + قرار لكل تشغيل) | إدراج فقط، مفهرس بالتسليم والمستخدم×المهارة؛ لا قراءة في مسار الترقية. |
| قراءة `recommended_next_action` كنصيحة مهنية | يُشتق من المفاتيح الناقصة فقط ويُعرض كـ«الخطوة التالية: Provide: …». |
| تغيير مستقبلي في السياسة يُعاد تطبيقه على التاريخ | ممنوع بالتصميم: القرار يذكر إصداره؛ إعادة التقييم سجل جديد (B.3). |

## 7. What expert input can change later without code changes — ما يغيّره الخبراء بلا كود

- اعتماد `default@1` كما هي، أو إصدار `default@2` بقيم: حدّ ثقة · عدد أدلة مستقلة · سقف · قبول/عدم قبول الاقتراح · من يقرّر.
- تعطيل سياسة وتفعيل أخرى لكل مفتاح (مستقبلًا لكل مسار/نشاط عبر مفاتيح مختلفة).
- تشغيل H6 بعد اختباره الموجب.

---
**التالي بعد مراجعة المالكة:** Phase 4 — Configuration & Policy Layer (`0014`: `track_config_version` · سياسات السياق/الادعاء/التحدي · حقول TrackSkill على `role_requirement`؛ التقييم يسجّل إصدار الإعداد).
