# نَقْلة / NAQLA — Configurable Track Architecture · **Phase 6 Report: AI Usage & Integrity Flow**
**التاريخ:** 2026-10-08 · **الخطة الحاكمة:** `CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md` (معتمدة) · **المرجع الكانوني:** `docs/srs/SRS-001-naqla-functional.md` v1.9 (CHG-014 مُطبَّق) · **القرار:** D-113
**الحالة:** Phase 6 مُنفَّذة ومُثبَتة · **التنفيذ متوقف** بانتظار مراجعة المالكة قبل Phase 7 (Career Claim Draft).

> **المبدأ:** «أثبت لي أنك فاهم الشغل اللي قدمته، سواء استخدمت AI أو لا.» استخدام الذكاء الاصطناعي ليس غشًا. الإفصاح **سياق** للتقييم — ليس دليل كفاءة، ولا سبب رسوب، ولا يستدعي مراجعة بشرية بذاته.

> **لا «مسرح كشف AI» — بنيويًا لا اتفاقيًا:** لا يوجد في القاعدة عمود `fraud` ولا «درجة غش» ولا احتمال توليد (مُختبَر عبر `information_schema`) · مصادر الإشارات **قائمة مغلقة** من المصادر المرئية بقيد `CHECK`؛ تسجيل نوع إشارة بمصدر مثل `token_pattern_analysis` يُرفض في القاعدة · `outcome_effect` مقيَّد بـ`'none'` · النطاق يرفض أي حمولة تحمل مفاتيح حكم أو كشف (`ai_probability` · `ai_generated_percent` · `cheating_score` · `fraud` …) ويسمّي الطرق المرفوضة (`FORBIDDEN_INFERENCE_METHODS`) · لا شيء يقرأ أسلوب الكتابة أو التنسيق أو أنماط الرموز.

> **قيود المالكة:** مراجعة الحقول والبنى القائمة أولًا ✓ — **مدّ لا استبدال**؛ لا إعادة هيكلة كبرى · السلوك القائم محفوظ (**١٢٠ اختبار e2e قائمًا مرّت دون تعديل** قبل كتابة اختبارات المرحلة) · لا تفعيل تحدٍّ ولا شرط تشغيل · لا تعديل للجاهزية · لا تغيير لأهلية CV/LinkedIn · لا H6 · لا عتبات خبراء · لا إعادة تفسير للتاريخ (مُثبَت: صفر إجابات وصفر إشارات أُنشئت للإفصاحات السابقة، والأعمدة الجديدة `null`) · السلّم أمامي كما هو · الإشارة ≠ التقييم ≠ قرار التحقق · الخصوصية والعمى محفوظان · **CHG-014** مُطبَّق (SRS v1.9 · BR-024؛ وظيفي فقط).

---

## 0. Review before implementation — ما وُجد وما أُعيد استعماله

| القائم | القرار |
|---|---|
| `ai_disclosure` (سجل واحد لكل تسليم: وضع النشاط · `declared_use[]` · `explanation`؛ قيد `ai_prohibited ⇒ لا استخدام`؛ بلا عمود عقوبة) | **مُدِّد**: إصدار الاستبيان · `capture_mode` · `ai_use_declared` + جدول إجابات. الحقلان القديمان يُشتقان من الإجابات فيبقى كل قارئ قائم (`assertModeRespected` · سياق التقييم · المراجع · الوكلاء · الـledger) كما هو. |
| `assertModeRespected` · `assertDisclosureDidNotLowerScore` | **أُبقيا** ويُغذَّيان الآن من الإجابات المُتحقَّق منها. |
| سلّم N0–N4 (`assessDisclosure`) — مُختبَر، **غير موصول** | **لم يُمسّ ولم يُوصل**؛ أي ربط بين إشارات ونتيجة يمرّ بسياسة مُصادَق عليها مستقبلًا. |
| `integrity_check_spec` / `integrity_check` (فحوص حتمية وملاحظات بشرية لكل نشاط) | **مصدر إشارات**: كل فحص لم يجتز ⇒ إشارة `deterministic_check_unmet` برؤية تتبع تصنيف الفحص. |
| `verification_challenge_type` + `challenge_policy` (Phase 4) | **مُدِّدا** بأعمدة وأنواع؛ لم يُستبدلا. |
| نموذج التفعيل وسجل `config_change` (Phase 4) | **أُعيد استعماله** للاستبيان. |

## 1. What was implemented — ما نُفِّذ

| المكوّن | ما يفعله |
|---|---|
| **١ · استبيان إفصاح مُصدَّر** | `disclosure_questionnaire` (محكوم بنموذج التفعيل) + `disclosure_question` (مفتاح · ترتيب · صياغة عربية/إنجليزية · مساعدة · نوع الإجابة `yes_no`/`single_choice`/`multi_choice`/`free_text`/`text_list` · خيارات · مطلوب/اختياري · شرط ظهور · ربط اختياري بالحقول القديمة). **`ai_usage@1` أساس توافق** = الحقلان اللذان كانا يُجمعان. **`ai_usage@2` مسودة** بأسئلة المالكة السبعة (هل استخدمتِ · فيمَ · أي أجزاء اقترحها · ما الذي غيّرتِه · ما رفضتِه أو صحّحتِه · ما تحقّقتِ منه · ما احتجتِ فهمه أو تتبّعه بنفسك)؛ مفعَّلة **للتطوير فقط** في seed الديمو بفعلين مُدقَّقين؛ **في قاعدة بلا ديمو يبقى `@1` هو الفعّال و`@2` غير مفعَّل** (مُثبَت). الأسئلة **مجمَّدة** بعد أول تفعيل (التغيير إصدار جديد). |
| **٢ · سجلات إفصاح مرتبطة بالتسليم** | كل تسليم يسجّل **إصدار الاستبيان بالضبط** و`capture_mode`؛ `ai_disclosure_answer` تحفظ **لقطة السؤال كما رآه المستخدم** مع إجابته. التحقق بالإصدار الدقيق: إجابة مطلوبة ناقصة ⇒ ٤٢٢ مُسمّى؛ مفتاح غريب ⇒ ٤٢٢؛ **إصدار تغيّر منذ عرضه ⇒ ٤٠٩** «أعيدي التحميل». الإجابات عن أسئلة أخفاها شرط الظهور تُسقط. **الشكل القديم للـAPI مقبول** ويُسجَّل `legacy_fields` على `ai_usage@1`. السجل **ثابت** بعد التسجيل (مُحفِّز). |
| **٣ · سجل التحدي** | ٩ أنواع (٥ من Phase 4 + `fix_new_bug` · `alternative_implementation` · `predict_output` · `identify_error`)؛ مفاهيم المالكة كلها مغطّاة (شرح قرار = `clarification_question`/`explanation_question` · تعديل جزء = `followup_modification` · قراءة كود = `code_reading_probe`). أعمدة: `response_format` · `evaluation_mode ∈ human/deterministic` (**لا LLM حَكَمًا**) · `difficulty` · `timing_hint` · `skill_mapping`. **كلها معطَّلة مسودة**؛ قيد: **لا يُفعَّل نوع بلا مصادقة خبير مُسمّى**. |
| **٤ · معمارية سياسة التحدي** | `challenge_policy` + `timing` (`before_evaluation`/`after_evaluation`/`on_escalation`) · `difficulty` · `skill_ids` (مع `trigger_rule` · `challenge_types` · `max_challenges` من Phase 4). `default@1` **غير مفعَّلة** بقاعدة تشغيل `{}`. `assertChallengeIssuable`: النوع مُصادَق ومفعَّل **و**السياسة فعّالة في البيئة **و**تسرد النوع. |
| **٥ · سجلات المحاولة/النتيجة** | `challenge_instance` (النوع · السياسة وإصدارها · من أصدره `policy`/`human_reviewer` · المهارة · الصياغة · سياق **أعمى** · الحالة) — **القاعدة نفسها ترفض الإصدار** لنوع معطَّل أو تحت سياسة غير فعّالة؛ ثابت بعد الإصدار؛ دورة `issued → answered → reviewed` (أو `expired`/`withdrawn`). `challenge_response` (إجابة واحدة؛ ثابتة). `challenge_result` (مراجع مُسمّى أو حتمي؛ النتيجة `understanding_shown`/`understanding_not_shown`/`inconclusive` **ملاحظة عن الفهم لا حكم على الأمانة**؛ ملاحظات إلزامية؛ ثقة؛ ثابتة). |
| **٦ · إشارات نزاهة مُهيكلة** | `integrity_signal_type` (٧ أنواع، مسودة؛ مصادر مرئية فقط بقيد) · `integrity_signal`: النوع · المصدر · **الاتجاه** (`neutral_context`/`consistent_with_understanding`/`inconsistent_with_understanding`) · الأدلة المرتبطة · التحدي/الفحص/الإفصاح · الملاحظة · الثقة · الرؤية · المُنتِج وإصداره · السياسة وإصدارها · الوقت · **`outcome_effect = 'none'`**. المُنتِجون الآن: `disclosure_recorded` (**محايد** — الإفصاح بنعم ليس إشارة سلبية) · `resubmission_recorded` · `deterministic_check_unmet` · نتائج التحقق. `explanation_inconsistent_with_work` مسجَّل **بلا مُنتِج آلي** (مراجع مُسمّى فقط). |
| **العلاقة بالتحقق** | الإشارات **تُعرض** على سياق التقييم كنوع مدخل `integrity_signals`؛ **أساس سياسة السياق يستبعدها** (مُسجَّل في `inputs_used.excluded`)؛ سياسة سياق مُصادَقة مستقبلًا يمكن أن تضمّها. **لا شيء في الطبقة يمنح مستوى أو يزيله أو يخفضه** (مُختبَر: نتيجة تحقق «لم يظهر فهم» لا تغيّر حالة الادعاء ولا عدد قرارات التحقق). |
| **المراجعة البشرية** | **ليست إلزامية بسبب AI** (مُختبَر: نفس العمل بإفصاح نعم/لا ⇒ نفس النتيجة والدرجة والمستوى، وصفر عناصر في طابور المراجعة). المراجع يتلقى إجابات الاستبيان **سياقًا** في الحمولة العمياء (إصدار الاستبيان · الإجابات). |
| **النطاق** | `disclosure-questionnaire.ts` (`assertQuestionnaireSane` · `questionVisible` · `validateDisclosureAnswers` · `legacyFieldsToAnswers` · لقطة السؤال · `DISCLOSURE_SCORE_EFFECT='none'` · `DISCLOSURE_REQUIRES_HUMAN_REVIEW=false` · حدود إدخال شكلية مُسمّاة) و`integrity.ts` (مصادر مرئية · طرق مرفوضة · مفاتيح حكم مرفوضة · `assertNoDetectionTheatre` · `assertSignalWellFormed` · مُنتِجون من الوقائع · دورة حياة التحدي · `assertChallengeIssuable` · صياغة المالكة). **١١ اختبار وحدة** (المجموع ٢٠٠). `DOMAIN_RULESET_VERSION 0.12.0 → 0.13.0`. |
| **API** | `GET /v1/disclosure-questionnaire` · `POST projects/:id/submissions` يقبل `aiDisclosure: { questionnaireId, answers }` **أو** الشكل القديم · `GET /v1/submissions/:id/disclosure` · `GET /v1/submissions/:id/integrity-signals` (`user_facing` فقط) · `GET /v1/me/challenges` · `POST /v1/me/challenges/:id/response` · `GET /v1/integrity/registry` (شفافية: المبدأ · الطرق المرفوضة · السجلات وحالتها) · مراجع: `GET /v1/review/challenges` (أعمى؛ لا عمل المراجع نفسه) · `POST /v1/review/challenges/:id/result` (تعارض مصالح ⇒ ٤٠٣). **لا إصدار تحدٍّ عبر HTTP** — الإصدار خدمة داخلية تنتظر مُشغِّل سياسة مُصادَق عليها أو واجهة مراجع. |
| **٧ · تجربة المستخدم** | `/project`: الاستبيان **يُجلب ويُعرض من الإعداد** (لا سؤال مُثبَّت في الواجهة) بحسب نوع الإجابة وشرط الظهور، بعبارة المالكة «استخدام أدوات الذكاء الاصطناعي مسموح…» + «الإجابة بأنك استخدمتِ الذكاء الاصطناعي لا تخفض درجتك ولا تُحيل عملك إلى مراجعة بشرية بذاتها. نقيّم فهمك ومساهمتك في العمل؛ ولا نستخدم أي «كاشف ذكاء اصطناعي» ولا نخمّن مصدر الكود من أسلوبه» + «صيغة الأسئلة قيد اعتماد الخبراء» حين لم تُعتمد. `/evaluation`: قسم بعنوان «خطوة تحقق قصيرة تساعدنا على تأكيد فهمك للعمل» **يظهر فقط إن صدر تحدٍّ** (لا يصدر في هذه المرحلة)، مع «هذه خطوة لتأكيد فهمك لعملك، وليست اتهامًا». |
| **٨ · التدقيق والإصدارات** | الاستبيان عبر `config_change` (تفعيلات seed الديمو مُسجَّلة) · أحداث `audit_event`: `ai_disclosure.recorded` · `integrity_signal.recorded` · `challenge.issued` · `challenge.answered` · `challenge.reviewed` · كل سجل ثابت أو إضافة فقط · كل إشارة تذكر مُنتِجها وإصداره · كل تحدٍّ ونتيجة يذكران السياسة وإصدارها. |

**النتائج:** النطاق **٢٠٠/٢٠٠** ✅ · API build ✅ · e2e **١٢٩/١٢٩** ✅ (قاعدة مُعاد بناؤها 0001→0016) · `npm test` الجذر ✅ · `npm run verify` ✅ (SRS v1.9) · typecheck الواجهة ✅ · إثبات عدم إعادة تفسير التاريخ ✅.

## 2. Files changed — الملفات

**جديدة:** `supabase/migrations/0016_ai_usage_integrity.sql` · `packages/domain/src/{disclosure-questionnaire.ts, integrity.ts, integrity.test.ts}` · `apps/api/src/integrity/{integrity.module.ts, disclosure.service.ts, integrity-signal.service.ts, challenge.service.ts, integrity.controller.ts}` · `apps/api/test/integrity.e2e.ts` · هذا التقرير.
**مُعدَّلة:** `packages/domain/src/{index.ts (تصدير + 0.13.0), configuration.ts (نوع مدخل `integrity_signals`)}` · `apps/api/src/slice1/{submission.service.ts (الإفصاح عبر الاستبيان + إشارات التسليم), evaluation.service.ts (إشارات الفحوص), slice1.controller.ts (شكل الطلب), slice1.module.ts}` · `apps/api/src/assessment/assessment-recorder.service.ts` (عرض الإشارات على السياق) · `apps/api/src/review/{review.service.ts (الاستبيان في الحمولة العمياء), review.module.ts}` · `apps/api/src/app.module.ts` · `apps/api/test/human-review.e2e.ts` (تأكيد إضافي) · `supabase/seed/0001_demo_role.sql` (تفعيل المسودة للتطوير) · `apps/app/src/lib/api.ts` · `apps/app/src/app/project/page.tsx` · `apps/app/src/app/evaluation/page.tsx` · `docs/srs/SRS-001-naqla-functional.md` (v1.9 · CHG-014) · `docs/srs/SRS-001-traceability-matrix.md` · `docs/architecture/{DOMAIN-MODEL.md (§١٦ب), DATA-MODEL.md, CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md}` · `docs/decisions/DECISIONS.md` (D-113).
**لم تُمس:** `ai-disclosure.ts` (القواعد والسلّم) · `verification.ts`/`verification-policy.ts` · الجاهزية · `presentationFor` · السلّم · الوكلاء · `apps/web/` · `data/**`.

## 3. Database changes — القاعدة

| | |
|---|---|
| **جداول جديدة (٨)** | `disclosure_questionnaire` · `disclosure_question` · `ai_disclosure_answer` · `challenge_instance` · `challenge_response` · `challenge_result` · `integrity_signal_type` · `integrity_signal` |
| **أعمدة على قائم** | `ai_disclosure`: `questionnaire_id` · `questionnaire_key` · `questionnaire_version` · `capture_mode` · `ai_use_declared` (nullable؛ التاريخ `null`) · `verification_challenge_type`: `response_format` · `evaluation_mode` · `difficulty` · `timing_hint` · `skill_mapping` (+ ٤ صفوف معطَّلة) · `challenge_policy`: `timing` · `difficulty` · `skill_ids` |
| **قيود/مُحفِّزات** | مصادر الإشارات مغلقة مرئية (نوعًا وصفًا) · `outcome_effect = 'none'` · مصدر الإشارة ضمن مصادر نوعها والاتجاه يطابقه · الإشارة إضافة فقط · `ai_disclosure` و`ai_disclosure_answer` ثابتان · الأسئلة مجمَّدة بعد التفعيل · نوع التحدي لا يُفعَّل بلا مصادقة · إصدار التحدي يُرفض لنوع معطَّل أو سياسة غير فعّالة · التحدي ثابت بعد الإصدار والنهائي نهائي · الإجابة والنتيجة ثابتتان · حوكمة Phase 4 على الاستبيان |
| **RLS** | الاستبيان وأنواع الإشارات مقروءة للجميع؛ الإجابات والتحديات والإجابات عليها ونتائجها للمالك قراءةً؛ **الإشارات للمالك `user_facing` فقط**؛ الكتابة خدمة داخل المعاملة. مُثبَت بدور `authenticated`. |
| **Backfill** | **لا شيء** — لا إعادة تفسير للتاريخ (مُثبَت md5). |

## 4. What is configurable now — ما صار إعدادًا

- **الاستبيان كله**: الصياغة · العدد · الترتيب · نوع الإجابة · الخيارات · مطلوب/اختياري · شرط الظهور · الربط بالحقول القديمة — إصدار جديد بلا كود، ومصادقة وتفعيل مُدقَّقان.
- **أنواع التحدي**: طريقة التسليم · شكل الإجابة · من يحكم (إنسان/حتمي) · الصعوبة · التوقيت · الربط بالمهارات · التفعيل (بعد المصادقة).
- **سياسة التحدي**: متى · كم · أي أنواع · لأي مهارات · بأي صعوبة · بأي شرط.
- **أنواع الإشارات**: التسمية · الوصف · المصادر المسموحة (ضمن المرئية) · الاتجاه.
- **إدخال الإشارات في سياق التقييم**: إصدار سياسة سياق يضمّ `integrity_signals`.

## 5. What remains intentionally unresolved — ما تُرك عمدًا

- **الاستبيان النهائي** (صياغة · عدد · مطلوب/اختياري) — `@2` مسودة للتطوير؛ الإنتاج على أساس التوافق.
- **كل ما يخص التحدي**: الأنواع الفعّالة · العدد · التوقيت · الصعوبة · ربط المهارات · شروط التشغيل — مسودة/معطَّل.
- **تفسير `trigger_rule`** وأي **ربط لإشارة بنتيجة** (تصعيد · تحدٍّ · قرار) — يحتاج سياسة مُصادَق عليها؛ اليوم `outcome_effect='none'` بقيد.
- **مسار إصدار التحدي** (مُشغِّل السياسة أو واجهة المراجع لإصداره) — الخدمة موجودة ومُختبَرة؛ لا نقطة نهاية للإصدار.
- **إدخال الإشارات في التقييم** — بانتظار سياسة سياق مُصادَقة.
- **سلّم N0–N4** — غير موصول كما كان.
- **SRS**: لا تغيير لهذه المرحلة. صياغة وظيفية لمبدأ «AI ليس غشًا؛ الإفصاح سياق؛ النزاهة = إثبات الفهم؛ لا كشف للمصدر؛ الإشارات بلا نتيجة» تحتاج `CHG-015` بقرار المالكة (مقترح: BR-025 + DR-018).

## 6. Risks — المخاطر

| الخطر | التخفيف |
|---|---|
| أن يُفهم «الاتجاه» `inconsistent_with_understanding` حكمًا | تسمية الواقعة لا الحكم؛ `outcome_effect='none'`؛ لا يُنتجه إلا تحدٍّ مُراجَع أو مراجع مُسمّى؛ لا أثر على المستوى. |
| تغيّر الاستبيان بين العرض والإرسال | ٤٠٩ صريح «أعيدي التحميل»؛ لا قبول لإصدار قديم بصمت. |
| عميل قديم يرسل الشكل القديم في بيئة تعمل بـ`@2` | يُقبل ويُسجَّل `legacy_fields` على `@1` بصدق؛ لا يُنسب إلى `@2`. |
| ظهور إشارات الفحوص الداخلية للمستخدم | RLS يقصر رؤية المالك على `user_facing`؛ مُختبَر. |
| نص حر في الإفصاح قد يحمل معلومات شخصية يراها المراجع | المراجع يرى نصّ المستخدم كما في الملاحظات القائمة؛ مفاتيح الهوية ممنوعة بـ`assertBlindPayload`؛ لا اسم ولا بريد من النظام. |

## 7. What expert input can change later without code changes — ما يغيّره الخبراء بلا كود

- اعتماد استبيان نهائي (أي صياغة وعدد وترتيب وإلزامية) وتفعيله للإنتاج.
- اعتماد أنواع تحدٍّ بعينها وتفعيلها، وتحديد صعوبتها وتوقيتها وربطها بالمهارات.
- اعتماد سياسة تحدٍّ بشروط تشغيل (مثلًا عند تعارض بين الشرح والعمل، أو ثقة منخفضة) — **التشغيل الفعلي يحتاج أيضًا مُشغِّلًا يُبنى بقرار**.
- تضمين الإشارات في سياق التقييم بإصدار سياسة سياق جديد.
- أي ربط مستقبلي بين إشارة ونتيجة — **عبر سياسة مُصادَق عليها صراحةً فقط**.

---
**التالي بعد مراجعة المالكة:** Phase 7 — Career Claim Draft (`0017`؛ طبقة المسودة · سياسة الفتح · **استبدال `presentationFor()` بقراءة سياسة الادعاء** كما وافقت المالكة).
