# الوثيقة 16 — State Machine Inventory
> الكيانات التي تحتاج آلة حالات وحالاتها المعتمدة. **لا تفاصيل تنفيذ** — فقط الحالات والمحفّزات والقواعد.

## 1. `Activity`
`assigned` → `started` → `in_progress` → `submitted` → `under_evaluation` → `completed`
حالات جانبية: `declined` (رفضه المستخدم) · `expired` (تجاوز الموعد دون عمل) · `abandoned` (توقف > نافذة محددة) · `superseded` (استُبدل ببديل)
- **البداية:** `assigned` · **النهائية:** `completed` · `declined` · `expired`
- **المحفّزات:** قرار A19 · فعل المستخدم · انقضاء الوقت
- **قاعدة:** `abandoned` **لا تحذف العمل**؛ الاستئناف ممكن ويعيدها إلى `in_progress`.

## 2. `WorkItem`
`draft` → `active` → `completed` → `evidenced`
حالات جانبية: `archived` · `withdrawn`
- **البداية:** `draft` · **النهائية:** `evidenced` · `archived`
- **قاعدة:** `evidenced` لا تُبلغ إلا بوجود `Evidence` واحد على الأقل. و`self_reported` تبلغ `completed` ولا تبلغ توثيقًا أعلى من `Demonstrated`.

## 3. `Submission`
`received` → `locked` → `validated` → `checked` → `evaluated` → `verified` → `closed`
حالات جانبية: `rejected_format` (فشل التحقق الشكلي) · `blocked_by_checks` (فشل فحص حتمي إلزامي) · `resubmitted` (نُسخت منها نسخة جديدة) · `in_human_review`
- **البداية:** `received` · **النهائية:** `closed` · `rejected_format`
- **قاعدة:** بعد `locked` **لا تعديل**؛ التصحيح يُنشئ `Submission` جديدة مرتبطة.

## 4. `Evaluation`
`queued` → `running` → `completed`
حالات جانبية: `failed` (بعد إعادة محاولة واحدة) → `queued_for_human` · `disputed` → `revised` (تقييم مراجعة جديد لا استبدال)
- **البداية:** `queued` · **النهائية:** `completed` · `revised`
- **قاعدة:** لا انتقال إلى `completed` بلا `rubric_version` و`EvaluatorResult[]` كاملة. **ولا حالة "مُخمَّنة".**

## 5. `Verification`
`pending` → `evaluating` → `accepted` | `downgraded` | `rejected`
حالات جانبية: `escalated_to_human` → `human_resolved` · `exception_granted` (D-012a)
- **البداية:** `pending` · **النهائية:** `accepted` · `downgraded` · `rejected` · `human_resolved`
- **قاعدة:** الوضع الآمن عند العطل = `downgraded`. و`exception_granted` تتطلب `reviewer_id` + `exception_reason`.

## 6. `Claim` *(التفصيل الكامل في الوثيقة 10)*
`Observed` → `Practiced` → `Demonstrated` → `Verified` → `Verified (Aging)` → `Verified (Historical)`
حالات جانبية: `Under Review` · `Withdrawn` · `Suspended` · `Superseded`
- **البداية:** `Observed` · **لا حالة نهائية** (الادعاء حيّ ما دام الحساب حيًّا)
- **قاعدة:** الصعود بعمل جديد فقط · النزول لا يحذف · التقادم حتمي من `recency_policy`.

## 7. `Achievement`
`eligible` → `granted` → `published`
حالات جانبية: `revoked` (سُحب الدليل الداعم) · `hidden` (بطلب المستخدم)
- **البداية:** `eligible` (حساب `system_derived`) · **النهائية:** `published` · `revoked`
- **قاعدة:** `granted` مستحيلة بلا `Evidence`؛ وسحب الدليل يُحوّلها `revoked` بسبب مُسجَّل.

## 8. `HumanReview`
`queued` → `assigned` → `in_review` → `decided` → `applied`
حالات جانبية: `info_requested` (المؤقت متوقف) · `reassigned` (تعارض مصالح) · `expired_sla` (تصعيد)
- **البداية:** `queued` · **النهائية:** `applied`
- **قاعدة:** `decided` تتطلب مبررًا مكتوبًا؛ و`applied` تُنشر كحدث تدقيق وتُحدّث `Claim`.

---

## كيانات إضافية تحتاج آلة حالات *(لم تُذكر في الطلب، وأراها لازمة)*

## 9. `ActivitySpec` / `RubricVersion` (دورة المحتوى)
`draft` → `in_review` → `published` → `deprecated`
- **قاعدة:** `published` **مجمّد**؛ و`deprecated` لا يُستخدم لتقييم جديد ويبقى مقروءًا للتقييمات القديمة إلى الأبد.

## 10. `Projection` (CV / LinkedIn / Case Study)
`generated` → `user_edited` → `published` → `unpublished`
- **قاعدة:** `user_edited` خارج الدليل **يُسقط وسم التوثيق**؛ و`published` تتطلب موافقة عرض عام + اجتياز فحص الخصوصية.

## 11. `Consent`
`granted` → `withdrawn`
- **قاعدة:** append-only — السحب **سجل جديد** لا تعديل، ويسري فورًا ومستقبلًا.

## 12. `RetentionExecution`
`scheduled` → `on_legal_hold?` → `executed` → `audited`
- **قاعدة:** التعليق القانوني **يسبق** أي حذف مجدول ويوقفه بسجل موثّق.

---

## قواعد عامة على كل آلات الحالات
1. كل انتقال يُنشر كحدث بـ: الحالة السابقة · الجديدة · السبب · الفاعل · الزمن.
2. **لا انتقال صامت** — ولا انتقال بلا سبب مُسجَّل.
3. الحالات الجانبية لا تحذف بيانات، تُخفيها أو توقفها.
4. عند أي التباس ⇒ **الحالة الأكثر تحفظًا** (الوضع الآمن).
5. آلات الحالات **بيانات تعريفية** لا شروط متناثرة في الكود.
