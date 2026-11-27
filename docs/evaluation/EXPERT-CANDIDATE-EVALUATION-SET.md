# مجموعة تقييم مستقلة مرشَّحة (holdout) — مسار الواجهات الأمامية للمبتدئين

> **الحالة: مرشَّحة، تنتظر مراجعة الخبير.** لم يعتمدها خبير، ولا يُدّعى هنا أي اعتماد. كل الحالات مُصطنعة كتبها مؤلف المجموعة. لا تعود أي حالة إلى عمل شخص حقيقي.

## الغرض

حزم الاختبار الآلية ومساعد الأحكام (A13) ضُبطت على مجموعة تطوير من الحالات، لذلك لا يصلح قياس جودتها على المجموعة نفسها. هذه المجموعة **منفصلة عن مجموعة التطوير** وكُتبت دون معرفة بالاختبارات، فتقيس:

- هل تصيب الحزم وA13 في حكمها على تسليمات لم تُضبط عليها؟
- هل تكشف الإخفاء والتلاعب؟

المكان: `data/candidates/trk_frontend_junior_v2/r2-holdout/<activity>/<case>/`

## طريقة التأليف

- **ما قُرئ فقط:**
  - مواد الخرّيج في `materials/<activity>/graduate/`.
  - مرجع المراجِع `reviewer/REFERENCE.md` والحل المرجعي `reviewer/solution/`.
  - معايير `tracks/trk_frontend_junior/rubrics.json`.
- **ما لم يُفتح:**
  - `apps/runner/src/packs/`.
  - مجموعة التطوير `r2/`.
  - `R2-CANDIDATE-TEST-PACKS.md` و`A13-SHADOW-PIPELINE-RUN.md`.
  - ولم يُبحث في المستودع عن معرّفات الاختبارات.
- **محتوى كل حالة:**
  - ملفات الصفحة الكاملة القابلة للتشغيل: `index.html` و`styles.css` و`app.js`، ومعها `mock-api.js` و`data/` في النشاطين اللذين يستخدمان خدمة وهمية.
  - الملف `expected.candidate.json`: حكم لكل معيار مع تعليل عربي، والحقل `gamingExpected`.
- **الأسلوب:** كُتبت الحالات بأسلوب يختلف عن الحل المرجعي في البنية والتسمية.
- **التحقق:** شُغِّلت كل حالة في متصفح بلا واجهة للتأكد من أن السلوك المقصود يظهر فعلًا، مثل التمرير الأفقي على 360، وموضع العمود الجانبي على 1024، وسيناريوهات `empty/error/flaky`.
- **معنى الحكم `human`:** يُستخدم فقط حين يعتمد المعيار على نص مكتوب غير موجود في الحالة، كملاحظة السبب الجذري، وشرح الدالة، وملاحظة القرار، وGit. والحالات تحتوي كودًا فقط.
  - **استثناء:** في `problem_traced` لنشاط طلب التغيير يُحكم `unmet` إن لم يقع التغيير في موضع السبب، لأن هذا الجزء من المعيار يُرى في الكود.

## act_fe_debug_improve

`root_cause_note` = `human` في كل الحالات، و`deliverables_complete` = `met` في كل الحالات.

| الحالة | ما تمثّله | semantic_fixed | responsive_fixed | validation_fixed | السبب الرئيسي |
|---|---|---|---|---|---|
| `alt_correct` | إصلاح صحيح بأسلوب آخر | met | met | met | رسائل تُنشأ في JS، وتحقق بتقطيع النص، ونقطة تحوّل `64em` |
| `subtle_partial` | إغفال واحد | met | **unmet** | met | بقيت `min-width:1280px`، فلا يظهر العمود الجانبي على 1024 |
| `symptom_mask` | إخفاء العَرَض | met | **unmet** | met | بقي `overflow-x:hidden`، وأُخفي عمودا «المدرّبة» و«القاعة» بـ`display:none` |
| `tamper_or_hardcode` | سلوك مختلف تحت الأتمتة (`gamingExpected: true`) | met | **unmet** | **unmet** | الإصلاح مشروط بـ`navigator.webdriver`، وللمستخدم الحقيقي قائمة نطاقات منسوخة من الشكوى |
| `overscope_rewrite` | إعادة كتابة شاملة تعمل | met | met | met | `scope_discipline` = unmet، وهو غير إلزامي |

## act_fe_change_request

`component_explained` و`decision_explained` و`deliverables_complete` = `human` في كل الحالات.

| الحالة | ما تمثّله | problem_traced | root_cause_fixed | filter_in_state | empty_state_correct | js_correctness | السبب الرئيسي |
|---|---|---|---|---|---|---|---|
| `alt_correct` | صحيح بأسلوب آخر | human | met | met | met | met | `Array.isArray` في `loadTasks`، وأزرار راديو داخل `fieldset` |
| `subtle_partial` | إغفال واحد | human | met | met | met | **unmet** | `filtered = …` بلا تصريح، فيصير متغيرًا عامًا عرَضيًا |
| `symptom_mask` | التفاف في العرض | **unmet** | **unmet** | met | met | **unmet** | شرط `tasks.length===0` داخل فرع الخطأ، فصار خطأ 500 الحقيقي يظهر «لا مهام بعد» |
| `tamper_or_hardcode` | لعب على البيئة (`gamingExpected: true`) | **unmet** | **unmet** | **unmet** | **unmet** | met | تفرّع على `mockApi.scenario==='empty'`، وتصفية بمعرّفات منسوخة من البيانات |
| `filter_not_in_state` | التصفية خارج الحالة | human | met | **unmet** | met | met | إخفاء عناصر DOM مباشرة خارج `renderTasks`، ولا يوجد `state.filter` |

## act_fe_integrated_leave_requests

`problem_traced` و`code_understanding` و`git_workflow` و`deliverables_complete` = `human` في كل الحالات، وكذلك المعياران غير الإلزاميين `decision_clarity` و`judgment_assumption_check`.

| الحالة | ما تمثّله | semantic_structure | responsive_layout | data_states | state_transitions | root_cause_fixed | السبب الرئيسي |
|---|---|---|---|---|---|---|---|
| `alt_correct` | صحيح بأسلوب آخر | met | met | met | met | met | طور واحد `store.phase`، ودالة تحميل واحدة، وجدول |
| `subtle_partial` | إغفال واحد | met | **unmet** | met | met | met | بقي `span{min-width:140px}` في صف flex بلا التفاف، فيظهر تمرير أفقي على 360 |
| `symptom_mask` | إخفاء بـCSS | met | met | met | **unmet** | **unmet** | `#app:has(.requests) .loading{display:none}`، و`isLoading` تبقى `true` |
| `tamper_or_hardcode` | تعديل الخدمة والبيانات (`gamingExpected: true`) | met | met | **unmet** | **unmet** | **unmet** | `flaky` لم يعد يفشل في `mock-api.js`، وأُعيد ترتيب `data/` |
| `retry_state_broken` | واجهة سليمة وانتقال معيب | met | met | met | **unmet** | met | `state.error` لا يُمسح، فتتعايش `error` والطلبات بعد نجاح إعادة المحاولة |

## ما يحتاج حكم الخبير

الأحكام الأقل يقينًا:

1. **`debug/tamper_or_hardcode`: `scope_discipline` = met.** حكمتُ بأن التلاعب ليس خروجًا عن النطاق. قد يرى الخبير أن شيفرة كشف الأتمتة تغيير خارج مواضع الأعطال.
2. **`change/symptom_mask`: `empty_state_correct` = met و`js_correctness` = unmet.**
   - الصفحة تعرض رسالة الفراغ صحيحة.
   - لكن ابتلاع خطأ 500 حكمتُ عليه تحت `js_correctness` («معالجة الرفض»).
   - قد يُعدّ ذلك احتسابًا مزدوجًا مع `root_cause_fixed`، أو قد يُنقل إلى `empty_state_correct`.
3. **`change/tamper_or_hardcode`:**
   - `empty_state_correct` = unmet مع أن الصفحة صحيحة على البيانات المشحونة. حكمتُ بالسلوك على خدمة حقيقية.
   - `js_correctness` = met مع اعتماد الكود على حقل في الخدمة الوهمية.
4. **`change/filter_not_in_state`: `js_correctness` = met.** هل يُعدّ تعديل DOM خارج العرض «تحوّرًا مشتركًا مبعثرًا»؟ المرجع يضعه تحت الالتزام بالبنية.
5. **`leave/symptom_mask`: `data_states` = met.** الحالات تظهر صحيحة على الشاشة لأن CSS تخفي المؤشر. قد يرى الخبير الحكم unmet.
6. **`leave/tamper_or_hardcode`: `data_states` = unmet.** حكمتُ بالخدمة المقدَّمة الأصلية، لا بالنسخة المعدَّلة.
7. **`leave/retry_state_broken`: `data_states` = met و`root_cause_fixed` = met.** الخلل يظهر فقط في الحالة الداخلية، أو في إعادة محاولة تُرجع قائمة خالية، وهذا لا تُنتجه الخدمة الوهمية.
8. **`debug/alt_correct`:** هل نقطة التحوّل `64em` بدل `1024px` مقبولة؟ قيمتها 1024 بكسل عند حجم الخط الافتراضي.
9. **الحكم `human` لـ`deliverables_complete`** في طلب التغيير وطلبات الإجازة: المعيار آلي للحضور، لكن الملاحظات غير موجودة في الحالات.

## الحالة

مرشَّحة، تنتظر مراجعة الخبير. لم تُستخدم في ضبط أي حزمة. يجب ألا تُضاف إلى مجموعة التطوير ولا تُعرض على من يضبط الاختبارات، حفاظًا على استقلالها.
