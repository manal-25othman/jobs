# حزم اختبار R2 المرشَّحة: أنشطة الواجهات الأمامية (مبتدئ)

> **الحالة: مرشَّحة، بانتظار مراجعة الخبير.** لم يعتمدها أي خبير مسمّى، ولا تغيّر أي نتيجة تقييم (وضع الظل).
> كل الكود الذي شُغّلت عليه **اصطناعي**. لا يوجد كود خرّيج حقيقي.
> **نجاح الاختبارات ليس إثباتًا للمهارة.** النتيجة ملاحظة عن سلوك نسخة واحدة من العمل (الطبقة 1 في `AUTOMATED-ASSESSMENT-QUALITY-METRICS.md`).

## الملفات

| ما هو | المسار |
|---|---|
| الحزم (إصدار `0.1.0`، الحالة `candidate`) | `apps/runner/src/packs/act_fe_debug_improve.ts` · `act_fe_change_request.ts` · `act_fe_integrated_leave_requests.ts` |
| أدوات مشتركة (عالم معزول وفحوص نصية) | `apps/runner/src/packs/lib.ts` |
| مجموعة التقييم الاصطناعية | `data/candidates/trk_frontend_junior_v2/r2/<activity>/<case>/` و`expected.candidate.json` |
| الاختبار | `apps/runner/src/packs/packs.test.ts` |

**مفاتيح الجداول:**
- **الطبقة:** `functional` · `output` · `errors` · `quality` · `usability` · `responsive` · `a11y` · `data_states` · `gaming`.
- **آلي:** الاختبار يحسم ملاحظته وحده.
- **داعم:** (`supports_human`) يجمع ملاحظة يحكم بها شخص، ولا يحسم المعيار.
- **ثابت:** فحص نصي للكود، لا يشغّله.

## مبادئ التصميم

- **كل استعلام من عالم معزول أو من المحرّك (CDP).** ترقيع الصفحة لـ`getBoundingClientRect` أو `querySelector` لا يغيّر ما يقرؤه الاختبار.
- **العناصر تُعرَف بمعناها لا بمعرّفات البداية:** بتسميتها أو نصها أو دورها. ثم يُعلَّم العنصر بسمة محايدة `data-r2-target` لينقر عليه المشغّل.
- **حالات البيانات من المشغّل:** عبر `failRequestsTo` لا عبر `?scenario=` في العنوان، فلا تكفي قراءة سيناريو العنوان لتجاوز الاختبار.
- **البيانات من الاختبار لا من التسليم:** كل اختبار قائمة يقدّم بياناته عبر `overrideFile`، بتوزيع وترتيب يختلفان عن الملف المرفق، فيفشل الإخراج المكتوب يدويًا.

## ١. `act_fe_debug_improve`: صفحة التسجيل في الورشة

13 اختبار متصفح و3 فحوص ثابتة. منها 14 آلية و2 داعمة.

| المعرّف | المعيار | الطبقة | النمط | ما يلاحظه |
|---|---|---|---|---|
| `semantic.form_with_submit_button` | `semantic_fixed` | a11y | آلي | الحقول في `form` واحد، وفيه زر إرسال حقيقي |
| `semantic.headings_and_table_headers` | `semantic_fixed` | a11y | آلي | `h1` واحد وعناوين بلا قفز، وصف عناوين الجدول خلايا `th` |
| `a11y.fields_have_labels` | `a11y_keyboard_forms` | a11y | آلي | لكل حقل اسم من `label` أو `aria-*`، ولا يكفي `placeholder` |
| `a11y.keyboard_reaches_submit` | `a11y_keyboard_forms` | a11y | آلي | `Tab` يصل إلى الاسم ثم البريد ثم الزر، و`Enter` يُحدث استجابة |
| `a11y.focus_visible_on_controls` | `a11y_keyboard_forms` | a11y | آلي | `focused().outlineVisible` على الحقلين والزر |
| `a11y.field_errors_linked` | `a11y_keyboard_forms` | a11y | آلي | `aria-invalid="true"` و`aria-describedby` إلى رسالة غير فارغة |
| `validation.invalid_addresses_refused` | `validation_fixed` | functional | آلي | 6 عناوين غير صالحة متنوعة، أغلبها غير مذكور في المواد: لا نجاح، ورسالة عند الحقل |
| `validation.common_addresses_accepted` | `validation_fixed` | functional | آلي | 3 عناوين صالحة شائعة تُقبل، ولا أخطاء غير معالجة |
| `form.per_field_messages_when_empty` | `form_submission_flow` | errors | آلي | الإرسال فارغًا: لا إرسال، ولكل حقل مطلوب رسالته |
| `form.values_kept_and_error_clears` | `form_submission_flow` | usability | آلي | القيم تبقى بعد الرفض، والرسالة تزول بعد التصحيح |
| `responsive.page_width_360` | `responsive_fixed` | responsive | آلي | `layout()`، ثم بحث في العالم المعزول عن عناصر تتجاوز الشاشة خارج حاوية تمرير. يكشف ذلك التجاوز تحت قناع `overflow-x: hidden` |
| `responsive.schedule_reachable_360` | `responsive_fixed` | responsive | آلي | عناوين الأعمدة الخمسة واسم المدرّبة ظاهرة، أو داخل حاوية تمرير |
| `responsive.sidebar_beside_1024` | `responsive_fixed` | responsive | آلي | على 1024: العمود الجانبي والمحتوى متجاوران أفقيًا |
| `quality.starter_lines_kept` | `scope_discipline` | quality | داعم · ثابت | نسبة أسطر البداية الباقية بترتيبها (LCS). العتبة 40% إشارة للمراجِع |
| `gaming.environment_probing` | `scope_discipline` | gaming | داعم · ثابت | إشارات `gamingSignals` (فحص الأتمتة، وترقيع النماذج الأولية، وغيرها) |
| `quality.source_files_present` | `deliverables_complete` | quality | آلي · ثابت | الملفات الثلاثة موجودة |

**معايير بشرية فقط:**

| المعيار | السبب |
|---|---|
| `root_cause_note` | ملاحظة نصية. السلوك لا يُظهر هل سُمّي السبب أم العَرَض |

## ٢. `act_fe_change_request`: مهام الفريق

8 اختبارات متصفح و4 فحوص ثابتة. منها 7 آلية و5 داعمة.

| المعرّف | المعيار | الطبقة | النمط | ما يلاحظه |
|---|---|---|---|---|
| `output.list_follows_data` | `filter_in_state` | output | آلي | بيانات بديلة من 7 مهام: العناوين كلها والعدد ظاهر |
| `filter.control_labelled` | `filter_in_state` | a11y | آلي | عنصر اختيار بالخيارات الأربعة وله تسمية. يُقبل `select` أو مجموعة أزرار أو أزرار اختيار |
| `filter.each_status_then_all` | `filter_in_state` | functional | آلي | منجزة (4)، ثم جديدة (2)، ثم قيد التنفيذ (1)، ثم الكل (7). يتحقق من العناصر والعدد، ويكشف التصفية التي تُتلف الحالة |
| `filter.no_match_message` | `empty_state_correct` | output | آلي | حالة بلا مهام تُظهر «لا مهام… الحالة» لا خطأ، ثم يعود «الكل» |
| `data_states.empty_answer_message` | `empty_state_correct` | data_states | آلي | `empty`: «لا مهام بعد» بلا خطأ ولا إعادة محاولة ولا `role=alert` |
| `data_states.error_and_empty_distinct` | `root_cause_fixed` | data_states | داعم | `error` يُظهر خطأ وإعادة محاولة، و`empty` يُظهر حالة فراغ: حالتان مختلفتان |
| `errors.retry_recovers` | `js_correctness` | errors | آلي | فشل ثم إعادة محاولة: القائمة تظهر، ولا أخطاء غير معالجة |
| `data_states.loading_then_list` | `js_correctness` | data_states | آلي | `slow`: رسالة التحميل أثناء الطلب، ثم القائمة |
| `quality.structure_kept` | `problem_traced` | quality | داعم · ثابت | `state` و`renderTasks` و`loadTasks` باقية، ونسبة أسطر `app.js` الأصلية |
| `quality.declared_identifiers` | `js_correctness` | quality | داعم · ثابت | إسناد إلى معرّف غير معرَّف (متغير عام عرضي). فحص تقريبي |
| `gaming.environment_probing` | `js_correctness` | gaming | داعم · ثابت | إشارات الفحص، وأي تعديل على `mock-api.js` |
| `quality.source_files_present` | `deliverables_complete` | quality | داعم · ثابت | `app.js` و`index.html` موجودان. الملاحظة والشرح يتحقق منهما المراجِع |

**معايير بشرية فقط:**

| المعيار | السبب |
|---|---|
| `component_explained` | شرح نصي لما تفعله `renderTasks` بالحالة المرفقة |
| `decision_explained` | ملاحظة القرار: السبب، والتغيير، والبديل المرفوض |

## ٣. `act_fe_integrated_leave_requests`: طلبات الإجازة

12 اختبار متصفح وفحصان ثابتان. منها 10 آلية و4 داعمة.

| المعرّف | المعيار | الطبقة | النمط | ما يلاحظه |
|---|---|---|---|---|
| `semantic.heading_and_landmarks` | `semantic_structure` | a11y | آلي | `h1` واحد، وعناوين متسلسلة، و`main` |
| `semantic.requests_as_list_or_table` | `semantic_structure` | a11y | آلي | الطلبات عناصر `li` في `ul` أو `ol`، أو صفوف جدول له `th` |
| `output.requests_follow_data` | `data_states` | output | آلي | 6 طلبات بديلة: النوع والحالة بالعربية، والفترة، والأيام. لا رموز إنجليزية خام |
| `output.order_by_submission_date` | `judgment_assumption_check` | output | داعم | الترتيب تنازليًا بـ`submittedAt`، والبيانات ليست مرتبة تصاعديًا ولا تنازليًا |
| `data_states.loading_visible` | `data_states` | data_states | آلي | `slow`: التحميل ظاهر بعد 700 مللي ثانية، ثم تحل محله الطلبات |
| `data_states.error_with_retry_button` | `data_states` | errors | آلي | `error`: رسالة واضحة وعنصر إعادة محاولة هو زر حقيقي |
| `data_states.empty_message` | `data_states` | data_states | آلي | `empty`: «لا طلبات…» دون خطأ ولا تحميل |
| `state.retry_completes_cleanly` | `state_transitions` | functional | آلي | فشل ثم إعادة محاولة بطيئة: تحميل، ثم الطلبات وحدها دون حالتين متعارضتين |
| `state.retry_then_empty_answer` | `root_cause_fixed` | functional | داعم | فشل ثم إعادة محاولة بقائمة خالية: ينتهي التحميل وتظهر حالة الفراغ. يكشف إخفاء المؤشر بدل إصلاحه |
| `responsive.page_width_360` | `responsive_layout` | responsive | آلي | كما في النشاط الأول، والطلبات معروضة |
| `responsive.page_width_1024` | `responsive_layout` | responsive | آلي | لا تمرير أفقي على 1024 |
| `a11y.retry_by_keyboard` | `a11y_basics` | a11y | آلي | `Tab` يصل إلى إعادة المحاولة بتركيز ظاهر، و`Enter` يعيد التحميل |
| `gaming.environment_probing` | `root_cause_fixed` | gaming | داعم · ثابت | إشارات الفحص، وأي تعديل على `mock-api.js` |
| `quality.source_files_present` | `deliverables_complete` | quality | داعم · ثابت | الملفات الثلاثة. الملاحظات ورابط الـPR يتحقق منها المراجِع |

**معايير بشرية فقط:**

| المعيار | السبب |
|---|---|
| `problem_traced` | تتبّع نصي للبلاغ |
| `code_understanding` | ملاحظة تدفق البيانات |
| `git_workflow` | المنصة لا تقرأ المستودع الخاص؛ يفحصه مراجِع مسمّى |
| `decision_clarity` | القراران وأسبابهما نص |

## مجموعة التقييم الاصطناعية

ستّ حالات لكل نشاط. في كل حالة يذكر `expected.candidate.json` ما يلي، وكله **مرشَّح، لم يعتمده خبير**:
- نتيجة كل اختبار؛
- حكمًا مرشَّحًا لكل معيار: `met` أو `unmet` أو `human`؛
- الحد الأدنى من إشارات الفحص.

| الحالة | ما تُظهره |
|---|---|
| `reference_like` | حل المراجِع فوق ملفات البداية: كل الاختبارات تنجح |
| `starter_unchanged` | مواد البداية كما هي: اختبارات السلوك المطلوب تغييره تفشل، وما كان يعمل أصلًا ينجح، مثل إعادة المحاولة في مهام الفريق |
| `partial` | بعض الأعطال مُصلَح وبعضها لا، فتفشل اختبارات ما لم يُصلَح وحدها |
| `wrong_fix` | علاج العَرَض. يمرّ الاختبار الذي يعيد إنتاج البلاغ، ويفشل اختبار المسار المجاور (التفصيل بعد الجدول) |
| `edge_data` | كود صحيح ببنية مختلفة عن الحل: تسميات تغلّف الحقول، ومجموعة أزرار `aria-pressed`، وجدول بدل قائمة. في النشاطين الثاني والثالث مع ملف بيانات **فارغ**. كل الاختبارات تنجح، فالنتيجة لا تعتمد على شكل الحل المرجعي ولا على بيانات التسليم |
| `gaming` | إخراج مكتوب يدويًا للبيانات المرفقة، أو فحص `navigator.webdriver` و`location.hostname`، أو ترقيع `getBoundingClientRect`، أو تعديل الخدمة الوهمية. تفشل اختبارات البيانات المتغيّرة وفحص `gaming.environment_probing`، وتظهر الإشارات |

**أمثلة `wrong_fix` لكل نشاط:**

| النشاط | علاج العَرَض | يمرّ | يفشل |
|---|---|---|---|
| التسجيل في الورشة | إخفاء أعمدة الجدول مع إبقاء القناع | `page_width_360` | `schedule_reachable_360` |
| مهام الفريق | «لا مهام» داخل فرع الخطأ | `empty_answer_message` | `error_and_empty_distinct` و`retry_recovers` |
| طلبات الإجازة | إخفاء المؤشر حين توجد طلبات | `retry_completes_cleanly` | `retry_then_empty_answer` |

**ملاحظة على حالة `gaming` في مهام الفريق:** الصفحة «تُصلح» الفراغ فقط حين تكتشف عنوان بيئة الاختبار. لذلك تنجح اختبارات الفراغ السلوكية. لا يكشفها إلا الفحص الثابت، وهو داعم للمراجِع لا حكم.

**زمن التشغيل المقيس** (لكل محاولة، بيئة التطوير):

| النشاط | الزمن |
|---|---|
| التسجيل في الورشة | 5–8 ثوانٍ |
| مهام الفريق | 7–12 ثانية |
| طلبات الإجازة | 12–19 ثانية |

المجموعة كاملة (24 اختبارًا) تستغرق نحو 3 دقائق.

## الحدود: ما لا تثبته هذه الاختبارات

- **النجاح ليس إثبات مهارة ولا جاهزية.** هو ملاحظة عن نسخة واحدة. المعايير كلها `human` في الرُّبريك، والاختبارات مدخل للمراجِع.
- **لا تقرأ الاختبارات الملاحظات ولا الشروح ولا المستودع.** لذلك تبقى المعايير البشرية فقط بلا اختبار.
- **الاختبارات الداعمة لا تحسم:**
  - نسبة الأسطر الباقية لا تقول هل التغيير في موضع العطل؛
  - ترتيب الطلبات لا يقول هل لوحظ التعارض وعُلّل؛
  - فحص المتغيرات العامة تقريبي.
- **إشارات الفحص الثابتة ليست اتهامًا ولا حكمًا.** قد يكون للفحص سبب مشروع، والقرار لشخص.
- **حلول صحيحة قد لا تتعرّف عليها الاختبارات:**
  - جدول يُحوَّل على الجوال إلى بطاقات عناوينها في `::before`؛
  - نص نجاح لا يحوي «تم» أو «بنجاح» أو «شكرًا»؛
  - رسالة خطأ بعيدة عن حقلها في DOM.
  
  هذه تحتاج معايرة على تسليمات حقيقية بعد اعتماد المراجعة الأمنية.
- **اختيار الحالة في `select` يتم بضبط القيمة وإطلاق `change` من العالم المعزول.** الحدث غير موثوق (`isTrusted=false`)، و`PageDriver` لا يملك اختيار خيار. كود يشترط `isTrusted` سيفشل خطأً.
- **العتبات والنصوص المقبولة مرشَّحة:** 40% و50% للأسطر، و700 مللي ثانية للتحميل، وتعابير النصوص العربية. **تنتظر مراجعة الخبير**، وكذلك ربط كل اختبار بمعياره والأحكام المرشَّحة في الحالات.
