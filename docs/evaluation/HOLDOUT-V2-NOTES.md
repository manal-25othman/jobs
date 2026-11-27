# المجموعة المستقلة الثانية (v2) — ملاحظات المؤلِّف

> **مرشَّح، غير معتمد من خبير.** كل الحالات اصطناعية كتبها مؤلِّف واحد. المسار: `data/candidates/trk_frontend_junior_v2/r2-holdout-v2/<activity>/<case>/`.

## كيف كُتبت

- **ما قرأه المؤلِّف فقط:**
  - مواد الخرّيج والمراجِع لكل نشاط: `materials/<activity>/graduate|reviewer`.
  - معايير `rubrics.json` للأنشطة الثلاثة.
- **ما لم يُفتح:** حزم الاختبار، ومجموعات التقييم السابقة (`r2/` و`r2-holdout/`)، ووثائق التقييم المحظورة.
- **محتوى كل حالة:**
  - مجموعة ملفات كاملة قابلة للتشغيل.
  - `mock-api.js` و`data/` منسوخان كما في البداية، إلا في `leave/gaming` حيث التلاعب هو تعديل الخدمة.
  - لا ملاحظات مكتوبة ولا Git.
  - لذلك كل معيار يعتمد على ملاحظة أو إجابة أو Git قيمته `human`.
  - `deliverables_complete` في نشاطَي التغيير والإجازة قيمته `human` أيضًا، لأنه يشترط ملاحظات.
- **التحقق:** فُتحت كل الحالات الـ18 في Chromium بلا واجهة (playwright-core)، وفُحص فيها:
  - العرض: 360 و390 و1024 و1280.
  - السيناريوهات: ok وempty وerror وslow وflaky.
  - إعادة المحاولة.
  - Tab ثم Enter.
  - بيانات معدّلة عبر اعتراض `data/*.json`.
  - في `leave/gaming`: تشغيل `mock-api.js` الأصلي.

  جاء السلوك الفعلي مطابقًا للمقصود في كل حالة.

## الحالات وسبب الحكم الإلزامي الأهم

### act_fe_debug_improve

| الحالة | السبب |
|---|---|
| correct_a | إصلاح موضعي: form وbutton submit، وحاوية تمرير للجدول، و1024، وتعبير منتظم. كل الإلزامي مستوفى. |
| correct_b | setCustomValidity مع فحص نطاق، وجدول يصير بطاقات، وflex عند 64em. مستوفى. |
| near_miss | نقطة التحوّل `1025px`: العمود الجانبي تحت المحتوى على 1024 ← `responsive_fixed` غير مستوفى، وما سواه مستوفى. |
| cosmetic_fix | `onclick` على div، وبقاء `overflow-x: hidden` مع `transform: scale` ← البنية الدلالية والمتجاوب غير مستوفيين، والتحقق مستوفى. |
| gaming | قائمة سوداء فيها `sara@gmail`، واستعلامات `(width: 360px)` و`(width: 1024px)` ← المتجاوب والتحقق غير مستوفيين. |
| edge_broken | عنوان بلا @ يرمي TypeError داخل `onsubmit`، فيُرسَل النموذج وتُعاد الصفحة ← `validation_fixed` غير مستوفى. |

### act_fe_change_request

| الحالة | السبب |
|---|---|
| correct_a | `Array.isArray` في `loadTasks`، و`state.filter` مع select. مستوفى. |
| correct_b | حذف شرط الرمي، وأزرار `aria-pressed` من الحالة. مستوفى. |
| near_miss | التصفية تُخفي عناصر DOM ولا حقل لها في state، فيتباعد العرض أثناء slow ← `filter_in_state` وحده غير مستوفى. |
| cosmetic_fix | الرمي باقٍ، وفرع الخطأ في العرض يُظهر «لا مهام بعد»، فيبتلع خطأ 500 ← السبب والتتبّع وصحة JS غير مستوفاة. |
| gaming | فحص `mockApi.scenario === 'empty'` مع بقاء الرمي، فقائمة خالية حقيقية تظهر خطأً ← السبب والفراغ غير مستوفيين. |
| edge_broken | `.then` بلا `catch`: خطأ 500 يترك «جارٍ التحميل» للأبد ← `js_correctness` غير مستوفى. |

### act_fe_integrated_leave_requests

| الحالة | السبب |
|---|---|
| correct_a | `loadRequests` واحدة مع `finally`، وجدول دلالي متجاوب. مستوفى. |
| correct_b | حقل `status` واحد، و`setState`، وبطاقات من template. مستوفى. |
| near_miss | `finally` سليم، لكن `error` لا يُمسح عند إعادة المحاولة، فيبقى الخطأ مع القائمة ← `state_transitions` وحده غير مستوفى. |
| cosmetic_fix | `retry` المعيبة باقية، والمؤشر مخفي حين توجد طلبات ← السبب والتحوّلات غير مستوفيين. |
| gaming | سطر فشل flaky في `mock-api.js` مُعلَّق، والخلل باقٍ مع الخدمة الأصلية ← الحالات والتحوّلات والسبب غير مستوفاة. |
| edge_broken | `sorted[0].submittedAt` قبل فحص الفراغ، فتبقى رسالة التحميل في empty ← `data_states` غير مستوفى. |

## الأحكام الأقل يقينًا

1. **change/near_miss · `js_correctness` = met:** تعديل DOM خارج `renderTasks` قد يعدّه خبير «تحوّرًا مبعثرًا» أيضًا. حسبتُه في `filter_in_state` وحده.
2. **change/cosmetic_fix · `js_correctness` = unmet:** الرفض ملتقط تقنيًا، لكنه يُعرض فراغًا. وقد يُحكم بأنه مستوفى ويُحمَّل الخلل على `root_cause_fixed` وحده.
3. **change · `problem_traced`:** جعلته `unmet` من الكود وحده حين يكون التغيير خارج موضع السبب (cosmetic وgaming). وجعلته `human` حين يكون في موضعه، لأن الملاحظة غائبة.
4. **leave/near_miss · `data_states` = met:** وكذلك **leave/edge_broken · `state_transitions` = met**. الحدّ بين «حالة خاطئة» و«عرض خاطئ» اجتهاد.
5. **leave/gaming · `data_states` = unmet:** الحكم مقيس على الخدمة الأصلية لا على الخدمة المعدَّلة المسلَّمة.
6. **debug/cosmetic_fix · `form_submission_flow` = met:** لا يوجد form، ورسالة الحقل لا تُمسح إلا بالضغط التالي.
7. **debug/correct_b · `scope_discipline` = met:** أُعيدت كتابة جزء التحقق كاملًا، وتحويل الجدول إلى بطاقات أوسع من الحد الأدنى.
