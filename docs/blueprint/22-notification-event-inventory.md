# الوثيقة 17 — Notification & Event Inventory
> ما الأحداث التي تولّد: تنبيهًا داخل المنتج · فعلًا من Companion · تذكيرًا · دخولًا لطابور المراجعة · حدث تدقيق.
> **بلا اختيار مزوّد تنبيهات ولا قناة توصيل.** القناة قرار لاحق؛ **الحدث هو العقد**.

## المبدأ
كل تنبيه **مشترك على `Event`** (LBD-02)، لا استدعاء مباشر. إضافة تنبيه جديد لاحقًا = مشترك جديد، بلا تعديل في المنتِج.
**قاعدة ضبط:** حد أقصى **تنبيه واحد فعّال لكل مستخدم يوميًا** في Phase 1، وتجاهل تذكيرين متتاليين يوقف السلسلة (لا مطاردة).

## الجدول

| الحدث | تنبيه | Companion | تذكير | طابور مراجعة | تدقيق | ملاحظة |
|---|---|---|---|---|---|---|
| `account.created` | ✓ | ✓ ترحيب | — | — | ✓ | — |
| `username.reserved` | — | — | — | — | ✓ | — |
| `consent.granted` \| `consent.withdrawn` | ✓ عند السحب | — | — | — | ✓ | السحب يوقف النشر فورًا |
| `onboarding.completed` | — | ✓ | — | — | ✓ | — |
| `goal.set` | — | ✓ | — | — | ✓ | — |
| `snapshot.generated` | ✓ | ✓ يشرح النتيجة | — | — | ✓ | — |
| `snapshot.disputed` | — | — | — | ✓ | ✓ | مقياس جودة |
| `activity.assigned` | ✓ | ✓ يحوّلها لإجراء | — | — | ✓ | — |
| `activity.started` | — | — | ✓ يجدول | — | ✓ | — |
| `activity.stalled` (>3 أيام) | ✓ | ✓ يقترح تقليص النطاق | ✓ | — | ✓ | **أهم تذكير في P1** |
| `activity.deadline_near` | ✓ | ✓ | ✓ | — | ✓ | — |
| `activity.expired` \| `abandoned` | ✓ | ✓ يعرض الاستئناف | — | — | ✓ | لا يحذف العمل |
| `manager.intervened` | ✓ | — | — | — | ✓ | وسم "نظام" إلزامي |
| `manager.cap_reached` | — | — | — | — | ✓ | ضبط تكلفة |
| `submission.received` \| `locked` | ✓ | ✓ | — | — | ✓ | — |
| `validation.failed` | ✓ | ✓ يشرح النقص | — | — | ✓ | لا يستهلك محاولة |
| `checks.blocked` | ✓ | ✓ يشرح + فرصة التصحيح | — | — | ✓ | قبل أي نموذج |
| `integrity.flagged` | — | — | — | ✓ عند N2+ | ✓ | **لا تنبيه اتهامي للمستخدم** |
| `evaluation.completed` | ✓ | ✓ يشرح النتيجة | — | عيّنة/محفّز | ✓ | — |
| `evaluation.failed` | ✓ | ✓ يطمئن ويشرح | — | ✓ | ✓ | لا نتيجة مُخمَّنة |
| `evaluation.disputed` | — | — | — | ✓ **إلزامي** | ✓ | — |
| `verification.completed` | — | — | — | — | ✓ | — |
| `verification.downgraded` | ✓ | ✓ يشرح الشرط الساقط | — | متاح بالطلب | ✓ | **شاشة الخمسة عناصر** (D-015) |
| `verification.exception_granted` | — | — | — | ✓ **إلزامي مسبقًا** | ✓ | D-012a |
| `evidence.created` | ✓ | ✓ يحتفي باتزان | — | نافذة المعايرة | ✓ | لحظة القيمة الأساسية |
| `evidence.none_derived` | ✓ | ✓ يشرح ويقترح التالي | — | — | ✓ | نتيجة مشروعة |
| `claim.level_changed` | ✓ | ✓ | — | — | ✓ | صعودًا ونزولًا |
| `claim.recency_changed` | ✓ | ✓ يقترح إعادة إثبات | ✓ | — | ✓ | من `recency_policy` |
| `achievement.unlocked` | ✓ | ✓ | — | — | ✓ | — |
| `asset.generated` | ✓ | ✓ يقترح التصدير | — | — | ✓ | — |
| `asset.user_edited` | ✓ تحذير | — | — | — | ✓ | إسقاط وسم التوثيق |
| `case_study.published` \| `shared` | ✓ | ✓ | — | — | ✓ | بعد فحص الخصوصية |
| `workitem.completed` | ✓ | ✓ | — | — | ✓ | — |
| `validation_activity.completed` | ✓ | ✓ | — | — | ✓ | ترقية `self_reported` |
| `next_action.proposed` | ✓ | ✓ **الفعل الأساسي** | — | — | ✓ | إجراء واحد |
| `human_review.requested` \| `assigned` | — | — | — | ✓ | ✓ | — |
| `human_review.completed` | ✓ | ✓ يشرح القرار | — | — | ✓ | — |
| `human_override_up` | ✓ | ✓ | — | — | ✓ **موسّع** | الحقول الثمانية |
| `review.sla_expired` | — | — | — | ✓ تصعيد | ✓ | تشغيلي |
| `agent.proposal_rejected` | — | — | — | متابعة | ✓ | مؤشر جودة وكيل |
| `agent.budget_exceeded` | — | ✓ **تدرّج لا توقف** | — | — | ✓ | D-014 |
| `routing.skipped_for_budget` | — | — | — | — | ✓ | — |
| `cost.anomaly_detected` | — | — | — | تشغيلي | ✓ | إنذار داخلي |
| `retention.executed` \| `legal_hold.applied` | — | — | — | — | ✓ | إلزام امتثالي |
| `account.export_requested` \| `deletion_requested` | ✓ | — | — | تشغيلي | ✓ | زمن استجابة **TBD** |

## فئات الإخراج
| الفئة | الغرض | Phase 1 |
|---|---|---|
| **تنبيه داخل المنتج** | إعلام المستخدم بحدث يخصه | ✓ |
| **فعل Companion** | تحويل الحدث إلى إجراء واحد مفهوم | ✓ (متدرّج) |
| **تذكير** | إعادة إشراك عند التوقف أو اقتراب موعد | ✓ (واحد) |
| **طابور مراجعة** | إدخال حالة لمراجع بشري | ✓ |
| **حدث تدقيق** | أثر دائم للمساءلة | ✓ **لكل الأحداث بلا استثناء** |
| قناة خارجية (بريد · رسائل) | خارج المنتج | **قرار لاحق — TBD** |
