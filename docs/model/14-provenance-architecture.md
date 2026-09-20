# الوثيقة 9 — Provenance Architecture
> لكل حقيقة في النظام يجب أن نستطيع الإجابة فورًا: **من أين جاءت · من أنشأها · أي وكيل اقترحها · أي نموذج · أي مصدر دعمها · متى تغيرت.**

## 1. أصناف المصدر

الرؤية حددت أربعة أصناف، ونضيف خامسًا للحسابات الحتمية:

| الصنف | المعنى | مثال | يصلح دليلًا؟ |
|---|---|---|---|
| `authoritative` | مصدر مرجعي خارجي معتمد | التصنيف الوطني · ESCO (P2) | كمرجع، لا كدليل شخصي |
| `curated` | محتوى أنتجته المنصة بمراجعة تحريرية | `RoleReferenceSpec` · `Rubric` · سجل الموارد | لا |
| `ai_generated` | مخرَج نموذج لغوي | صياغة Snapshot · مبرر بند · عبارة CV | **لا أبدًا** |
| `user_generated` | من المستخدم — وله نوعان فرعيان: | | |
| ↳ `user_generated.declared` | إعلان بلا تحقق | تقييم ذاتي · مهارات معلنة · مشروع `self_reported` | **لا** |
| ↳ `user_generated.evidence` | إنتاج فعلي خضع للتقييم | `Submission` · `Artifact` | **نعم** |
| `system_derived` *(إضافة مقترحة)* | حساب حتمي من حقائق قائمة | `Gap` · `Claim.level` · `Achievement` | مُشتق من أدلة |

> **`system_derived` إضافة تحتاج اعتمادك.** بدونها ستُوسم الحسابات الحتمية خطأً إما `ai_generated` (فتُضخَّم المخاطرة وتفقد الثقة في تمييزنا) أو `curated` (فنخسر تتبّع الاشتقاق). وهي صنف منخفض المخاطر عالي الفائدة للتدقيق.

**قاعدة ملزمة:** حقيقة `ai_generated` **لا تصبح أبدًا** `user_generated.evidence`. الصياغة لا تحوّل نصًا إلى دليل.

## 2. محتوى سجل المصدر (كائن قيمة على كل حقيقة)

| الحقل | المعنى |
|---|---|
| `source_class` + `subtype` | الصنف أعلاه |
| `created_by` | `user` · `agent` · `system` · `human_reviewer` · `editor` |
| `agent_id` + `agent_version` | الوكيل المقترِح (إن وُجد) |
| `proposal_ref` | الاقتراح الذي نشأت عنه (الثابت 3) |
| `model_id` + `prompt_version` | النموذج وإصدار التعليمات |
| `supporting_refs[]` | ما استندت إليه: مقتطف · بند رُبريك · مصدر خارجي |
| `derived_from[]` | الحقائق الأبوية (سلسلة الاشتقاق) |
| `external_source_ref` + `source_date` | للحقائق `authoritative` — **إلزامي** (الثابت 4) |
| `confidence` | ثقة القياس |
| `review_state` | `none` · `pending` · `reviewed` + `reviewer_id` |
| `asserted_at` · `changed_at` · `change_reason` | الزمن وسبب التغيّر |

## 3. سلسلة النسب (Lineage)

كل حقيقة مشتقة تشير إلى أبويها، فتتكوّن سلسلة قابلة للسير عكسيًا:

```
Claim.level = Verified
 └─ derived_from: Evidence#a (activity_1) · Evidence#b (activity_2)
      └─ Evidence#a derived_from: EvaluatorResult(core.judgment.assumption_check)
           ├─ supporting_ref: Artifact#7 (مقتطف السطور 12–18)
           ├─ rubric_version: data_analysis_v3 · scoring_policy: v2
           ├─ model_id + prompt_version
           └─ verification_ref: Verification#k (V1..V8) → human_review#r
```

**اختبار القبول:** كل ادعاء منشور يجب أن يُنتج هذه السلسلة **في صفحة واحدة** عند السؤال (الوثيقة 07 §10). إن تعذّر، **لا يُنشر الادعاء**.

## 4. التغيّر والتاريخ
- الحقائق غير القابلة للتعديل لا تتغير — **يُنشأ سجل جديد** ويُربط بالقديم عبر `derived_from`/`supersedes`.
- الحقائق الحالة (`Claim` · `WorkItem`) تحتفظ **بتاريخ حالات** لا بقيمة واحدة.
- كل تغيّر يحمل `change_reason` من مفردات مغلقة: `new_evidence` · `verification_downgrade` · `integrity_flag` · `recency_decay` · `human_review` · `user_withdrawal` · `recompute`.
- **لا تعديل صامت** — كل تغيّر يُنشر كحدث.

## 5. الفرض (Enforcement)
1. **كتابة بلا `provenance` مرفوضة** — قيد نموذج، لا مراجعة كود.
2. **حقيقة `authoritative` بلا `external_source_ref` مرفوضة** (الثابت 4).
3. **مخرَج وكيل بلا `proposal_ref` مرفوض** (الثابت 3).
4. **استدعاء نموذج بلا `model_id` + `prompt_version` + `CostRecord` مرفوض** (الثابت 6).
5. **`Evidence` بلا `supporting_refs` مرفوض** (الثابت 1).

## 6. ما يراه المستخدم
لكل عبارة أو ادعاء: **"لماذا نقول هذا؟"** يفتح: المصدر · الأساس (مقتطف/بند/مرجع) · من أنتجها (نظام · نموذج · مراجع بشري) · التاريخ · حالة المراجعة.
**قاعدة:** ما لا نستطيع شرح مصدره، **لا نعرضه**.
