# نَقْلة / NAQLA — SME Review Preparation + Human Evaluation Flow · Phase Report
**التاريخ:** 2026-09-27 · **الحالة:** بانتظار مراجعة المالكة · **المسار الأول:** Junior Web / Frontend Developer (`trk_frontend_junior@0.1.0`) — **DEMO / DRAFT / NOT SME APPROVED**

> **ما تثبته هذه المرحلة:** أن تسليمًا حقيقيًا يمرّ الآن من الفحص الحتمي إلى طابور مراجعة بشرية **عمياء**، فقرارٍ لكل بند بسبب مكتوب في سجل **لا يُعدَّل**، فتجميعٍ **قابل للتكرار** لا يقرّر فيه نموذج، فانتقالٍ في سلّم الدليل حدّه `demonstrated`؛ وأن حزمة Frontend صارت **قابلة للمراجعة** بندًا بندًا مع سؤال دقيق لكل بند؛ وأن الطريق من DEMO إلى محتوى حقيقي مبنيّ **بنسخة** لا بتعديل.
> **ما لا تثبته:** صحة أي محتوى في الحزمة. **لا بند واحد فيها معتمد من SME**، ولم يُرقَّ أي صف. لا وكيل ثالث · لا مزوّد LLM · لا Market Insights · لا مسار ثانٍ · لا تغيير في التصميم المُجمَّد · تحقق Supabase الحيّ ما زال محجوبًا.

**ما لم يُبنَ عمدًا:** إدارة قوى عاملة للمراجعين (SLA · توزيع آلي · إنتاجية) · مُقيِّم بنموذج · دمج `ui-state-management` (توصية فقط) · مُنتِج إشارات فحوص النزاهة `signal.*` · واجهة إدارة محتوى · أي ذكر لإطار عمل.

---

# PROVEN

| # | ما هو مُثبَت | أين |
|---|---|---|
| 1 | **المرحلة الحتمية أولًا:** بنود `rule` تُسجَّل، بنود `human`/`llm` تُعلَّق (`pendingHumanCriteria`)، النتيجة المؤقتة `needs_human_review` والحالة `queued_for_human`؛ **الفحص الحاجب نهائي بلا طابور** | `evaluator.ts` · `human-review.test.ts` · e2e |
| 2 | **بند لكل عنصر طابور**: البنود بشرية التقييم تدخل الطابور، والبند الحتمي (`deliverables_complete`) **لا يدخل** | `human-review.e2e.ts` (1) |
| 3 | **المخرَج الإلزامي الناقص لا يُتجاوز**: يُحسم حتميًا ولا يصل مراجعًا | e2e (10) · `aggregateWithHumanDecisions` |
| 4 | **المراجعة عمياء**: الطابور والعنصر لا يحملان اسمًا ولا بريدًا ولا معرّف مستخدم ولا بيانات ملف؛ الحمولة من قائمة أعمدة ثم `assertBlindPayload` (٢٩ مفتاحًا محظورًا في أي عمق) | e2e (3) · `human-review.ts` |
| 5 | **المراجع لا يعدّل التسليم ولا حالة الدليل**: لا مسار، وRLS ترفض عند القاعدة | e2e (6, 7) |
| 6 | **سجل المراجعة ثابت**: تعديل/حذف مرفوض بمُحفِّز؛ إعادة المراجعة سجل جديد يسمّي المتجاوَز وإلا `409`؛ الأحدث يسري | e2e (8, 9) · `criterion_review_immutable` |
| 7 | **لا نهائية قبل اكتمال كل بند** (٦/٧ ⇒ تبقى `queued_for_human`) | e2e (13) · `finalizationAllowed` |
| 8 | **التجميع قابل للتكرار**: نفس القرارات ⇒ نفس النتيجة؛ بند إلزامي غير مستوفٍ لا يُعوَّض | نطاق (6, 7) · e2e |
| 9 | **الاجتياز بعد المراجعة يمنح `demonstrated`، ولا تُنشئ المراجعة `verified` أبدًا** | e2e (14, 15) · قيد `transition_verified_not_yet_available` |
| 10 | **الوكلاء بعد النهائية فقط**؛ لا حدث وكيل على `needs_human_review` | `slice1.controller` · `review.service` |
| 11 | **المستخدم يرى «التقييم قيد المراجعة»** مع ما تحقّق آليًا وما ينتظر، **بلا وعد بوقت** | e2e (12) · `apps/app/src/app/evaluation/page.tsx` |
| 12 | **تعارض المصالح** يصعّد العنصر ويرفض التعيين؛ المؤلف لا يراجع تسليمه | e2e |
| 13 | **صلاحيات المراجع** قوائم `may`/`may_not` في النطاق + غياب المسارات + RLS خدمة فقط؛ `role_performed` على المنحة وعلى كل سجل (`human_reviewer` ≠ `sme`) | `reviewer_grant` · `HumanReviewerGuard` |
| 14 | **حالات القيم صريحة**: `weight_status` · `threshold_status` · `pass_threshold_status`؛ رُبريك غير تجريبي بقيمة غير `approved` **لا يُنشر** (مُحفِّز + Q20 + نطاق)؛ الحزمة **لا تستطيع** إعلان `approved` | `0008` · `pack-schema.ts` · نطاق (15) |
| 15 | **الترقية DEMO → كانوني** بنسخة `curated` غير تجريبية + تصحيحات مُسجَّلة + دورة مراجعة عادية + إغلاق يجعل الأصل `superseded` ويبقى مُعرَّفًا؛ **الأصل لا يُمَس** | `promotion.ts` · `career-data.e2e.ts` |
| 16 | **SME approval قبل النشر، وDEMO لا يُعتمد أبدًا** (نشاط غير تجريبي لا يُنشر بلا اعتماد؛ التجريبي لا يبلغ `approved`) | e2e · `invariants.sql` |
| 17 | **المستخدم يقرأ درجات بنوده** (فجوة RLS سابقة أُصلحت: `evaluation_criterion_score_select_own`) | `0008` |

---

# READY FOR SME REVIEW
حزمة المراجعة: `docs/data/SME-REVIEW-PACK-FRONTEND.md` (A–J؛ لكل بند: المقترح · لماذا · المصدر · السؤال الدقيق · القرار · تعليق · الشدّة). التصنيف الصادق:

| الفئة | العدد | البنود |
|---|---|---|
| 🟢 **جاهز لمراجعة SME الآن** (يمكن اعتماده بعد المراجعة على نسخة الترقية) | الدور (٧ بنود) · مهارتان أساسيتان (`skl_ui_state_interaction` · `skl_api_data_states`) · ٥ مهارات مساندة · **١١ مهمة** · **٣ أنشطة** (المحتوى والسيناريو والأسئلة) · صياغة ١٨ فحص نزاهة · الدليل المتوقَّع · ملاءمة المبتدئ | A1–A5 · A7–A8 · B4 · B5 · C2 · C4–C7 · D1–D11 · E1–E3 · G · H · J |
| 🟡 **يُراجَع الآن، والاعتماد يحتاج تحقق مصدر** (`OPEN-042`) | ٣ مهارات أساسية معيارية + مهارتان مساندتان + أداة واحدة | **B1 `skl_html_semantic`** · **B2 `skl_css_responsive`** · **B3 `skl_js_fundamentals`** · C1 `skl_forms_validation` · C3 `skl_accessibility_basics` · A6 |
| ⚪ **مسودات مولَّدة من المنصّة** — تبقى `proposed`/`TBD` مهما قرّر SME حتى تُقاس | مدد الأنشطة (120/90/90) · **كل** الأوزان والعتبات (٢٢ بندًا + ٣ عتبات اجتياز) · `role_requirement.weight = NULL` | I · F (القيم) |
| 🔴 **لا يمكن اعتماده الآن** | `ui-testing` في ربط الدور بلا قياس (Q18) · بنود الاكتمال كدليل مهارة (`OPEN-044`) · ١١ فحص `signal.*` بلا مُنتِج (`OPEN-045`) · دمج `OPEN-039` · أي `Verified` | C8 · F8/F15/F22 · E (البنية) |

**ما وُجد أثناء تحضير الحزمة ويحتاج نظر SME/المالكة (ليست أخطاء برمجية):** `validation_fixed` مربوط بـJS لا بالنماذج (يغيّر أي مهارة تكسب الدليل) · `code_reading` يشير إلى بند مكتبة «الانضباط بالنطاق» · `responsive_layout` اختياري رغم أن CSS أساسية · تغطية CSS وJS **ضحلة** (بند إلزامي واحد فعلي لكل منهما) · أزواج مهام متداخلة (D3/D4 · D6/D9 · D7/D8) · لا مهمة لـ«اختبار يدوي في متصفحَين» رغم أنه متوقَّع من المبتدئ · `live_defense` مطلوب لـJS ولا نشاط يوفّره.

**OPEN-039 (التكرار):** التحليل مكتمل (`docs/data/NEAR-DUPLICATE-ANALYSIS-UI-STATE.md`). النتيجة: **`equivalent` مرجَّح دلاليًا**؛ التوصية: إعلان `skl_ui_state_interaction` كانونية وتسجيل `ui-state-management` مترادفًا `equivalent` ثم `merged_into` **بعد موافقة المالكة الصريحة فقط**. حتى ذلك: `related` و`dedup_candidate.decision = proposed`. **لم يُدمج شيء.**

---

# HUMAN REVIEW FLOW
```
Submission → deterministic checks (blocking = final) → rule criteria scored
          → human-required criteria → review_queue_item (pending)
          → assign (conflict of interest ⇒ escalated) → in_review (blind payload)
          → criterion-level decision + written rationale → criterion_review (immutable)
          → all items completed → aggregateWithHumanDecisions (pure) → final evaluation_result
          → evidence transition (≤ demonstrated) → agents
```
| ماذا | أين |
|---|---|
| التدفق ومَن يملك أي قرار | `docs/evaluation/HUMAN-REVIEW-FLOW.md` |
| ما يجوز/لا يجوز للمراجع؛ SME دورٌ آخر | `docs/evaluation/HUMAN-REVIEW-PERMISSIONS.md` |
| الطابور (٦ حالات · تعيين · تعارض مصالح · إرجاع · تصعيد · أثر) | `docs/evaluation/HUMAN-REVIEW-QUEUE.md` |
| حالة كل وزن وعتبة وما يعتمد عليها | `docs/evaluation/RUBRIC-WEIGHTS-THRESHOLDS-REVIEW.md` |
| المخطط | `supabase/migrations/0008_human_review.sql`: `reviewer_grant` · `review_queue_item` (+حارس انتقالات) · `criterion_review` (+ثبات) · `content_promotion` · `promoted_from_id` · تعدادات `review_queue_state`/`value_status`/`promotion_step` · فهارس فريدة جزئية لكل `is_demo_fixture` · `rubric_values_publishable` · RLS خدمة فقط |
| النطاق | `packages/domain/src/human-review.ts` (انتقالات · صلاحيات · عمى · قرار · تعارض · نهائية · حالات القيم · ترقية) · `evaluator.ts` (`aggregateWithHumanDecisions` · `concludeRun`) · `DOMAIN_RULESET_VERSION 0.6.0` |
| الـAPI | `apps/api/src/review/` — `GET review/queue` · `POST review/queue/:id/assign` · `GET review/items/:id` · `POST review/items/:id/decision|return|escalate` خلف `HumanReviewerGuard`؛ `evaluation.service.finalizeHumanReview` |
| واجهة المراجع (أدنى) | `apps/app/src/app/review/page.tsx` (الطابور) · `apps/app/src/app/review/[id]/page.tsx` (تفاصيل · قرار البند · السبب · إرسال) — بالنظام البصري القائم، لا تغيير في `apps/web/` |
| شاشة المستخدم | `apps/app/src/app/evaluation/page.tsx`: «التقييم قيد المراجعة» · ما تحقّق آليًا · ما ينتظر · **لا زمن** |

**من يملك أي قرار (مختصر):** حاجب/`rule`/اكتمال ⇒ حتمي نهائي · `human`/`llm` ⇒ مراجع/ة بسبب · التجميع ⇒ دالة نقية · الانتقال ⇒ سلّم النطاق (`verified` محجوب) · **النموذج ⇒ لا شيء**.

---

# NOT APPROVED
- **الحزمة كلها** `trk_frontend_junior@0.1.0`: كل صف `is_demo_fixture = true` · `drafting_aid = ai_assisted` · `draft` (أو `published` demo محليًا للتشغيل فقط). **لا `sme_reviewed` ولا `approved` لأي صف** — والقاعدة ترفض ذلك بنيويًا للـDEMO.
- **لم تُشغَّل الترقية** على أي صف؛ `content_promotion` فارغ خارج الاختبارات.
- **لا قيمة وزن/عتبة معتمدة** في النظام (`approved` = صفر).
- **لا دمج** لـ`ui-state-management`.
- `Verified` غير ممكن لأي مهارة (لا نشاط تحقق، لا سياسة).

---

# SOURCE GAPS (`OPEN-042` يبقى مفتوحًا)
الجدول الكامل: `docs/data/FRONTEND-SOURCE-GAPS.md` (السجل · الادعاء · المصدر المطلوب · النوع المقبول · حاجب؟). **لا جلب ولا اختلاق مصادر في هذه المرحلة.**

| حاجب للاعتماد | غير حاجب للمراجعة |
|---|---|
| لقطات L0 + ترخيص: HTML Living Standard · W3C CSS · ECMA-262 · WCAG 2.2 (لـB1–B3 · C1 · C3) · تأكيد ترخيص MDN لأي استخراج · `common_failure_modes` للمهام (جلسة SME) | تعريفات الممارسة (B4 · B5 · C2 · C4–C7) — قرار SME هو المصدر · حكم «ما يُتوقَّع من مبتدئ» (يُعلَّم `SME judgement`) · المدد (تُقاس) · موارد التعلّم (تبقى `unverified` بلا `url`) |

---

# OPEN DECISIONS
| ID | الحالة | ما يُطلب |
|---|---|---|
| OPEN-039 | توصية جاهزة (`equivalent`) | **قرار مالكة** بالدمج أو الإبقاء |
| OPEN-040 | الآلية مبنية (D-096) | **قرار مالكة** بتشغيل الترقية على الحزمة بعد مراجعة SME |
| OPEN-041 | المسار مبنيّ ومُختبَر | تسمية المراجعين وطاقتهم (OPEN-010أ · OPEN-034) |
| OPEN-042 | مفتوح | التقاط L0 + ترخيص (يحتاج شبكة وOPEN-008) |
| OPEN-043 | صريح (D-095) | قرار SME على ٢٢ وزنًا/عتبة + ٣ عتبات اجتياز + أوزان الفجوة |
| **OPEN-044** (جديد) | مفتوح | هل يُشتق دليل مهارة من بند الاكتمال؟ التوصية: لا |
| **OPEN-045** (جديد) | مفتوح — **حاجب لاعتماد الأنشطة** | ١١ فحص `signal.*` بلا مُنتِج + المراجع لا يرى diff: مُنتِج، أم بنود بشرية، أم حذف |
| **OPEN-046** (جديد) | مفتوح | لغة الشرح المقبولة (عربية/إنجليزية) |
القرارات الجديدة: **D-088 … D-096** في `docs/decisions/DECISIONS.md`.

---

# TEST RESULTS
| المجموعة | النتيجة |
|---|---|
| النطاق `@naqla/domain` | **132 / 132** (منها 16 للمراجعة البشرية: مرحلة حتمية · نهائية · تجميع · انتقالات الطابور · صلاحيات · عمى · قرار · حالات القيم · ترقية) |
| `@naqla/config` · `@naqla/agents` | 9 / 9 · 77 / 77 |
| API e2e (قاعدة نظيفة + استيراد الحزمة) | **72 / 72** — `human-review.e2e.ts` 7 اختبارات تغطي الإثباتات الـ15 المطلوبة + تعارض المصالح + اعتماد المحتوى؛ `career-data.e2e.ts` + اختبار الترقية؛ `slice1` · `hardening` · `withdrawal` · `agents` بلا تراجع |
| إثباتات القاعدة (`scripts/db-test.sh`: RLS + invariants) | **84 PASS · 0 FAIL** |
| `career:validate` على قاعدة نظيفة | **PASSED** — Q01–Q21: 0 FAIL · 2 WARN (Q07b demo منشور محليًا · Q18 `ui-testing`/`ui-state-management` بلا قياس) |
| منصّة تقييم الوكلاء | 30 سيناريو: 29 PASS + 1 **GAP معروف موثَّق** (REC-006 ادعاء نتيجة دلالي) — بلا تراجع |
| `verify:boundaries` · `verify:prototype` · `verify:tokens` | الحدود قائمة · النموذج المُجمَّد سالم (18 ملفًا) · 77 رمزًا مطابقًا |
| `apps/app` typecheck · `apps/api` build | نظيفان |

**خريطة الاختبارات الـ15 المطلوبة → أين أُثبتت:** (1) SME قبل النشر · (2) DEMO لا يُعتمد ⇒ e2e «a non-demo activity cannot be published…» + `invariants.sql` · (3) لا هوية للمراجع ⇒ e2e (3) + نطاق · (4) البنود البشرية تدخل الطابور · (5) الحتمية لا تدخل · (12) المستخدم يرى «قيد المراجعة» ⇒ e2e (1) · (6) لا تعديل للتسليم · (7) لا تعديل لحالة الدليل ⇒ e2e (6, 7) · (8) السجل ثابت · (9) إعادة المراجعة سجل جديد · (13) لا نهائية قبل المراجعات · (14) الاعتماد يُسهم في `demonstrated` · (15) لا `verified` من مراجعة ⇒ e2e (8, 9, 13, 14, 15) + نطاق · (10) الإلزامي الناقص لا يُتجاوز ⇒ e2e (10) + نطاق · (11) التجميع قابل للتكرار ⇒ نطاق (6) + e2e.

**ملاحظات صادقة:** `career:validate` بعد تشغيل e2e يحمل صفوفًا اختبارية عمدًا فيفشل Q06/Q11 — سلوك صحيح للأداة. تحقق Supabase الحيّ (Auth · Storage · RLS بجلسة حقيقية) **ما زال محجوبًا**؛ لا يُدَّعى الاستعداد الإنتاجي لسلوك Supabase.

---

# NEXT SAFE STEP
1. **مراجعة المالكة لهذا التقرير** ولحزمة `SME-REVIEW-PACK-FRONTEND.md`، وقراران لا يخصّان SME: `OPEN-039` (الدمج) و`OPEN-045` (مصير فحوص `signal.*` — يحجب اعتماد الأنشطة).
2. **تسمية SME ومراجع بشري واحد على الأقل** (OPEN-009أ · OPEN-010أ · OPEN-034) — بدونهما لا يُستهلك شيء مما بُني.
3. **جلسة SME** على الحزمة كما هي (DEMO)، تُكتب قراراتها في أعمدة «القرار/تعليق»؛ ثم `promote` للسجلات التي قرّر اعتمادها، وتصحيحاتها بـ`promotion-correction`، ومراجعتها بأمر `review` بالاسم.
4. **لا يُنشر شيء حقيقي** قبل: اعتماد SME على النسخة · قيم `approved` (OPEN-043) · لقطات L0 للمهارات المعيارية (OPEN-042).
**لا يُبدأ:** وكيل ثالث · مزوّد LLM · Market Insights · مسار ثانٍ · تغيير التصميم المُجمَّد.
