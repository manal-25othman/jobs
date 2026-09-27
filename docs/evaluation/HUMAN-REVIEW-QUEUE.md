# Review Queue — النموذج الأدنى
> ℹ️ **PHASE 0 MODE (SRS-001 v1.4 §2.7 · D-101).** الطابور للاستثناءات المعرَّفة وعيّنات المعايرة (SRS FR-P-023)، لا لكل تسليم كقاعدة.
`review_queue_item`: صف لكل (تقييم × بند بشري). البنود الحتمية **لا تدخل** (مُختبَر).

## الحالات
```
pending → assigned → in_review → completed
                 ↘ pending      ↘ returned → pending/assigned
pending/assigned/in_review → escalated → assigned/pending
completed → in_review   (إعادة مراجعة: سجل قرار جديد)
```
مفروضة في النطاق (`assertQueueTransition`) وفي القاعدة (`review_queue_guard`).

| الحالة | المعنى | من |
|---|---|---|
| `pending` | ينتظر مراجعًا | النظام عند التقييم |
| `assigned` | إسناد ذاتي | المراجع/ة (`POST /review/queue/:id/assign`) |
| `in_review` | فُتحت الحمولة العمياء | `GET /review/items/:id` |
| `completed` | قرار مسجَّل | `POST /review/items/:id/decision` |
| `returned` | أُرجع بسبب (ثم يعود `pending` بلا مُسنَد) | `POST /review/items/:id/return` |
| `escalated` | تعارض مصالح أو سبب مكتوب | إسناد المؤلف لنفسه · تصريح تعارض · `POST /review/items/:id/escalate` |

## ما يُدعَم
إسناد ذاتي · علَم تعارض المصالح (يُصعِّد) · اكتمال المراجعة · **أثر تدقيق** كامل (`audit_event`: `review.assigned` · `review.criterion_decided` · `review.returned` · `review.escalated` · `review.conflict_of_interest`) · `review_queue_item.updated_at`.

## ما لا يُدعَم عمدًا
توزيع آلي · أولويات · SLA وتنبيهات تأخر · فرق مراجعين · إحصاءات إنتاجية · مراجعة مزدوجة/اتفاق بين مراجعين (تُبنى مع المعايرة، وثيقة 23 §9 `calibration`).

## الوصول
لا سياسة عميل على `review_queue_item` و`criterion_review` و`reviewer_grant`: صاحب التسليم **لا يقرأ القائمة**، والمراجع يصل عبر API الخدمة الذي يتحقق من المنحة ويشكّل الحمولة العمياء.
