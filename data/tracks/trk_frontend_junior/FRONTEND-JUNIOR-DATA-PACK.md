# Track Data Pack — Junior Web / Frontend Developer
**pack_id:** `trk_frontend_junior` · **track_id:** `TRK-01` · **pack_version:** `0.2.0`
**pack_class:** **`FULL VALIDATION PACK`** — أول مسار تحقق فعلي للمشروع، **وليس Thin Pack ولا Architecture Test فقط**
**status:** `draft` · **levels_included:** `["junior"]` · **language_coverage:** `["ar","en"]`
**القالب المرجعي:** `docs/data-foundation/29-track-data-pack-template.md`

---

## ⚠️ حالة الحزمة — اقرأ أولًا

| البند | الحالة |
|---|---|
| `review_status` لكل سجل | **`draft`** — لا سجل واحد `approved` |
| `drafting_aid` لكل سجل | **`ai_assisted`** — صياغة بمساعدة نموذج لغوي (DF-10) |
| `sme_approval` | **غير موجود** |
| **هل يمكن لأي نشاط هنا أن ينتج `Verified Evidence`؟** | **لا.** `can_yield_verified = false` لكل الأنشطة حتى اعتماد SME (D-030 · FR-G-020) |
| الروابط | **لا رابط واحد مُتحقَّق منه** — كل مورد يحمل `url: SOURCE TO VERIFY` |
| إشارات السوق | **لم تُجمَع** — الملف فارغ عمدًا (§11) |

> **هذه حزمة صالحة للمراجعة، لا للنشر.** استخدامها في المنتج قبل اعتماد SME **خرق للثابت التاسع ولـD-030**.

### تغيير الحالة في v0.2.0
| البند | v0.1.0 | **v0.2.0** |
|---|---|---|
| تصنيف الحزمة | Thin Pack (اختبار معماري) | **`FULL VALIDATION PACK`** — مسار التحقق الأول الفعلي |
| الحجم | انحراف عن خطة السبرنت | **مقصود ومعتمد** — لا تقليص |
| المحتوى المحفوظ | — | 3 أنشطة · 3 رُبريكات · خريطة المهارات · خريطة المهام · فحوص النزاهة · عناصر موارد نائبة |

---

# 1. ROLE

```
role_id: rol_frontend_junior
name_ar: "مطوّر واجهات أمامية — مستوى مبتدئ"
name_en: "Junior Web / Frontend Developer"
role_family: TF-1  (Software Development)
level: junior
region_scope: sa
```

### description_ar
> مطوّر واجهات مبتدئ يحوّل تصاميم وواجهات محددة إلى صفحات ومكوّنات تعمل فعليًا في المتصفح، ويربطها بواجهات برمجية جاهزة، ويتعامل مع حالات البيانات المختلفة (التحميل · الخطأ · الفراغ)، ويصلح الأعطال التي تُسنَد إليه. يعمل داخل مشروع قائم وبمعايير فريق موجودة، ويسأل عند الغموض بدل الافتراض.

### description_en
> A junior developer who turns defined designs and specifications into working pages and components in the browser, integrates them with existing APIs, handles data states (loading, error, empty), and fixes assigned defects. Works inside an existing codebase under an existing team's conventions, and asks when requirements are ambiguous rather than assuming.

### mission_statement
> قيمته للفريق: **ينجز أعمال الواجهة المحددة بجودة مقبولة وبأقل عدد من الدورات المرتجعة**، ويقلّل الوقت الذي يصرفه الأعضاء الأقدم على مهام قابلة للتفويض.

### typical_responsibilities
- تنفيذ واجهات ومكوّنات من تصميم أو وصف محدد.
- ربط الواجهة بـAPI جاهز واستهلاك بياناته.
- معالجة حالات: تحميل · خطأ · فراغ · بيانات جزئية.
- جعل الصفحة تعمل على مقاسات الشاشات المطلوبة.
- إصلاح أعطال مُسنَدة ضمن نطاق محدد.
- تحسين بنية HTML وإمكانية الوصول الأساسية عند الطلب.
- المشاركة في مراجعة كود بمستوى ملاحظات أولية.
- التحقق من المخرجات التي تولّدها أدوات AI قبل تسليمها.

### expected_outputs *(أساس تصميم الأنشطة)*
| المخرَج | الوصف |
|---|---|
| صفحة/مكوّن يعمل | كود يعمل في المتصفح ويطابق المطلوب |
| معالجة حالات كاملة | تحميل · خطأ · فراغ مُنفَّذة ومرئية |
| سلوك متجاوب | يعمل على مقاسات محددة بلا تلف تخطيط |
| تقرير إصلاح عطل | السبب الجذري + التغيير + كيف تُحقَّق |
| ملاحظات مراجعة | ملاحظات محددة على كود غيره |
| أسئلة توضيح | أسئلة مكتوبة عند نقص المتطلب |
| ملخص قرارات | ما افترضه ولماذا |

### common_tools
```
[
  { name: "Browser DevTools",        criticality: "essential", skill_id: "skl_devtools" },
  { name: "Git",                     criticality: "essential", skill_id: "skl_git_basics" },
  { name: "Code editor (VS Code…)",  criticality: "essential", skill_id: null },
  { name: "React (or a comparable component framework)", criticality: "common", skill_id: "skl_component_patterns" },
  { name: "CSS framework / utility CSS",  criticality: "common",   skill_id: "skl_css_layout_responsive" },
  { name: "Figma (read-only handoff)",    criticality: "common",   skill_id: null },
  { name: "API client (Postman/…)",       criticality: "common",   skill_id: "skl_api_integration_states" },
  { name: "Issue tracker (Jira/…)",       criticality: "common",   skill_id: null },
  { name: "AI coding assistant",          criticality: "common",   skill_id: "skl_ai_output_verification" }
]
```

### common_work_environment
مشروع قائم بمعايير فريق مكتوبة أو ضمنية · مهام مُسنَدة عبر متتبّع مهام · مراجعة كود قبل الدمج · تصاميم تُسلَّم ناقصة الحالات غالبًا · API قد يتغير أو يكون غير موثّق بالكامل · تواصل مع مطوّر أقدم ومصمّم ومحلل أعمال.

### what a junior IS expected to know
- بنية HTML صحيحة ودلالية أساسية · الفرق بين العناصر الدلالية والعامة.
- تخطيط CSS الحديث (Flexbox · Grid) والتجاوب مع المقاسات.
- أساسيات JavaScript: أنواع البيانات · الدوال · التعامل مع المصفوفات والكائنات · التعامل غير المتزامن على مستوى `fetch`/`async`.
- استهلاك REST API وقراءة استجابته والتعامل مع أكوادها.
- الحالات الثلاث (تحميل · خطأ · فراغ) وأن غيابها **عيب لا نقص تجميلي**.
- استخدام DevTools لعزل مشكلة (Console · Network · Elements).
- قراءة كود موجود وفهمه قبل تعديله.
- أساسيات Git في سياق فريق.
- **أن يسأل عند الغموض بدل الافتراض الصامت.**

### what is NOT expected from a junior
> **هذا القسم يمنع تضخيم التوقعات ويحمي تصميم الأنشطة من الانحراف.**
- تصميم معمارية تطبيق أو اختيار مكدّس تقني.
- بناء أو صيانة نظام تصميم (Design System).
- إعداد CI/CD أو بيئات النشر.
- تحسين أداء على مستوى النظام أو معالجة اختناقات معقدة.
- عمل خلفي أو تصميم قاعدة بيانات أو تصميم API.
- أمن تطبيقات متقدم.
- تقدير جداول لمشاريع أو قيادة فريق أو إرشاد آخرين.
- قرارات منتج أو تصميم تجربة من الصفر.
- كتابة اختبارات شاملة لنظام قائم *(اختبار بسيط لما كتبه: مقبول)*.

### entry_barriers *(مفيدة للتشخيص)*
- مشاريع تدريبية متشابهة بلا تمييز.
- «يعرف React» بلا فهم لأساسيات JS والمتصفح.
- لا خبرة في **تعديل كود لم يكتبه** — وهي معظم عمل الوظيفة الأولى.
- غياب أي دليل على التعامل مع حالات البيانات الواقعية.
- عدم القدرة على شرح **لماذا** اختار حلًّا.

```
adjacent_roles: ["rol_ui_developer", "rol_fullstack_junior"]
progression_to: ["rol_frontend_mid"]   # غير مُنشأ في Phase 1
source_refs: ["src_mdn", "src_whatwg_html", "src_webdev_google", "src_w3c_wai", "src_sme_frontend_pending"]
provenance: { source_type: "curated", drafting_aid: "ai_assisted", review_status: "draft", reviewed_by: null }
```

---

# 2. SKILLS

## 2.1 قرار اختيار المهارات الأساسية — **ومبرره**

**5 مهارات أساسية فقط — مثبَّتة في v0.2.0 ولا تُوسَّع.** المعيار: *المهارة التي بدونها لا يُنجَز عمل الدور، ويمكن إثباتها في نشاط 60–120 دقيقة، وتُنقل معه إلى أي فريق ومكدّس.*

**شرط بقاء المهارة `core` (كلها مستوفاة):** مؤشرات ملاحَظة ✅ · مسار دليل ✅ · نشاط مناسب ✅ · بند رُبريك واضح ✅ · **طريق واقعي إلى `Demonstrated`** ✅.
**وحيث يتعذّر `Verified` في P1 — يُوثَّق ولا يُختلَق دليل ضعيف** (§5.5).

| المهارة | أساسية؟ | المبرر |
|---|---|---|
| Semantic HTML | ✅ core | أساس كل مخرَج · تُقاس بالنقد لا بالكتابة |
| CSS / Responsive | ✅ core | مطلب صريح في كل عمل واجهة · قابل للفحص الحتمي جزئيًا |
| JavaScript fundamentals | ✅ core | بدونها لا يستطيع الفهم ولا التعديل ولا التصحيح |
| API integration + UI states | ✅ core | **أكثر ما يُرفض فيه المبتدئون:** يبنون المسار السعيد فقط |
| Debugging / problem isolation | ✅ core | **أقل مهارة قابلة للاستبدال بـAI** · وأقربها لواقع الوظيفة |
| **React** | ➖ **supporting — معتمد في v0.2.0** | **قرار مقصود ومثبَّت:** الأساسيات الخمس تُنقل إلى React وVue وAngular وSvelte؛ جعل React أساسية يحوّل المسار إلى دور خاص بإطار واحد ويخالف `ARCH-REQ-TRACK-01`. **لا يتحول إلى `core` إلا بأحد شرطين:** (1) **Market Signal موثّق** بحجم عيّنة ومصدر وفترة · أو (2) **قرار منتج/دور صريح** يحوّل المسار إلى `React-specific role`. **الفرضية السوقية وحدها لا تكفي** (§11) |
| **Git** | ➖ **supporting** | أداة أساسية للعمل، لكنها **ليست ما يُرفض عليه المبتدئ**، ويصعب إثباتها في نشاط 90 دقيقة |
| **Accessibility** | ➖ **supporting** | أساسياتها مُدمَجة في بنود رُبريك Activity 2 · جعلها أساسية يتجاوز توقعات المبتدئ |

## 2.2 Core Skills (5)

```json
{
  "skill_id": "skl_semantic_html",
  "name_ar": "بنية HTML الدلالية",
  "name_en": "Semantic HTML & Document Structure",
  "family": "fam_web_markup",
  "type": "core",
  "is_core_for_role": true,
  "target_level": "working",
  "observable_indicators": [
    "يختار العنصر الدلالي المناسب بدل div/span العام ويشرح سببه",
    "يبني تسلسلًا هرميًا صحيحًا للعناوين (h1..h6) بلا تخطٍّ عشوائي",
    "يربط كل حقل إدخال بتسمية (label) صحيحة",
    "يستخدم سمات الصور البديلة بمعنى مفيد لا بنص مكرر",
    "يميّز ما يجب أن يكون زرًا عمّا يجب أن يكون رابطًا",
    "ينقد بنية HTML قائمة ويحدد ثلاثة تحسينات مُعلَّلة"
  ],
  "common_beginner_mistakes": [
    "div لكل شيء مع اعتماد كامل على الأنماط",
    "استخدام عنوان لأنه كبير بصريًا لا لأنه عنوان هيكلي",
    "زر بلا نص نصي (أيقونة فقط) بلا بديل",
    "onClick على عنصر غير تفاعلي",
    "alt وصفي طويل لصورة زخرفية، أو alt فارغ لصورة معلوماتية"
  ],
  "evidence_expected": ["artifact", "decision_rationale"],
  "ai_substitutability": "high",
  "ai_note": "النموذج يكتب HTML دلاليًا جيدًا. لذلك نقيس **النقد والتعليل والتصحيح**، لا الكتابة.",
  "recency_policy_id": "rec_web_standards",
  "status": "active",
  "source_refs": ["src_mdn", "src_whatwg_html"],
  "provenance": { "source_type": "curated", "drafting_aid": "ai_assisted", "review_status": "draft" }
}
```

```json
{
  "skill_id": "skl_css_layout_responsive",
  "name_ar": "تخطيط CSS والتجاوب",
  "name_en": "CSS Layout & Responsive Design",
  "family": "fam_web_styling",
  "type": "core",
  "is_core_for_role": true,
  "target_level": "working",
  "observable_indicators": [
    "يبني تخطيطًا بـFlexbox أو Grid ويبرّر اختياره",
    "ينفّذ سلوكًا متجاوبًا على مقاسات محددة بلا تلف تخطيط أو تمرير أفقي",
    "يتعامل مع محتوى متغير الطول بلا كسر التخطيط",
    "يستخدم وحدات نسبية حيث يلزم بدل قيم ثابتة",
    "يعزل سبب مشكلة تخطيط عبر DevTools بدل التجربة العشوائية"
  ],
  "common_beginner_mistakes": [
    "قيم ثابتة بالبكسل ثم إصلاحها باستثناءات لكل مقاس",
    "overflow:hidden أو position:absolute لإخفاء عَرَض مشكلة لا حلّها",
    "!important كحل أول",
    "افتراض محتوى قصير: نص طويل أو صورة مفقودة تكسر التخطيط",
    "اختبار على مقاس واحد فقط"
  ],
  "evidence_expected": ["artifact", "decision_rationale", "process_trace"],
  "ai_substitutability": "high",
  "ai_note": "الكتابة قابلة للاستبدال؛ **تشخيص سبب كسر التخطيط ليس كذلك**.",
  "recency_policy_id": "rec_web_standards",
  "status": "active",
  "source_refs": ["src_mdn", "src_webdev_google"],
  "provenance": { "source_type": "curated", "drafting_aid": "ai_assisted", "review_status": "draft" }
}
```

```json
{
  "skill_id": "skl_js_fundamentals",
  "name_ar": "أساسيات JavaScript والتعامل مع DOM والحالة",
  "name_en": "JavaScript Fundamentals, DOM & State Handling",
  "family": "fam_web_programming",
  "type": "core",
  "is_core_for_role": true,
  "target_level": "working",
  "observable_indicators": [
    "يتعامل مع المصفوفات والكائنات لتحويل بيانات API إلى ما تحتاجه الواجهة",
    "يفهم التنفيذ غير المتزامن على مستوى fetch/async ويتعامل مع نتيجته",
    "يحدّث الواجهة اعتمادًا على حالة صريحة لا على تعديل مباشر متفرق",
    "يتعامل مع قيم غائبة أو null بلا انهيار",
    "يقرأ رسالة خطأ في Console ويترجمها إلى سبب محتمل"
  ],
  "common_beginner_mistakes": [
    "افتراض أن البيانات وصلت (قراءة خاصية من undefined)",
    "خلط منطق الحالة بمنطق العرض فيصعب التعديل",
    "نسخ حل من الإنترنت أو من نموذج بلا فهم أثره",
    "حلقات متداخلة حيث تكفي عملية تحويل واحدة",
    "تجاهل حالة الفشل في الاستدعاء غير المتزامن"
  ],
  "evidence_expected": ["artifact", "decision_rationale", "live_defense"],
  "ai_substitutability": "medium",
  "ai_note": "الكتابة عالية الاستبدال؛ **الفهم والتعديل والتصحيح منخفضان**.",
  "recency_policy_id": "rec_web_programming",
  "status": "active",
  "source_refs": ["src_mdn"],
  "provenance": { "source_type": "curated", "drafting_aid": "ai_assisted", "review_status": "draft" }
}
```

```json
{
  "skill_id": "skl_api_integration_states",
  "name_ar": "ربط الواجهة بـAPI ومعالجة حالات البيانات",
  "name_en": "API Integration & UI State Handling",
  "family": "fam_web_integration",
  "type": "core",
  "is_core_for_role": true,
  "target_level": "working",
  "observable_indicators": [
    "يستدعي endpoint ويقرأ شكل الاستجابة قبل البناء عليها",
    "ينفّذ حالات: تحميل · خطأ · فراغ · نجاح — **الأربع جميعًا**",
    "يميّز خطأ الشبكة عن خطأ الخدمة عن بيانات صحيحة فارغة",
    "يتعامل مع حقول ناقصة في بعض السجلات لا كلها",
    "يعرض رسالة خطأ مفيدة للمستخدم لا نص الاستثناء الخام",
    "يسأل عن السلوك المطلوب عند غياب البيانات إن لم يُحدَّد"
  ],
  "common_beginner_mistakes": [
    "بناء المسار السعيد فقط",
    "معاملة مصفوفة فارغة كخطأ، أو الخطأ كفراغ",
    "عرض رسالة الاستثناء التقنية للمستخدم النهائي",
    "لا حالة تحميل فتبدو الواجهة معطّلة",
    "الافتراض أن كل سجل يحمل كل الحقول",
    "افتراض سلوك عند الفراغ بلا سؤال وبلا توثيق الافتراض"
  ],
  "evidence_expected": ["artifact", "decision_rationale", "live_defense"],
  "ai_substitutability": "medium",
  "ai_note": "**أهم مهارة في هذا المسار تمييزًا:** النموذج ينتج المسار السعيد بسهولة؛ **قرار أي الحالات موجودة وكيف تُعرض حكمٌ بشري**.",
  "recency_policy_id": "rec_web_programming",
  "status": "active",
  "source_refs": ["src_mdn", "src_webdev_google"],
  "provenance": { "source_type": "curated", "drafting_aid": "ai_assisted", "review_status": "draft" }
}
```

```json
{
  "skill_id": "skl_frontend_debugging",
  "name_ar": "تشخيص الأعطال وعزل المشكلة",
  "name_en": "Debugging & Problem Isolation",
  "family": "fam_engineering_practice",
  "type": "core",
  "is_core_for_role": true,
  "target_level": "working",
  "observable_indicators": [
    "يعيد إنتاج المشكلة بخطوات محددة قبل محاولة الإصلاح",
    "يضيّق النطاق تدريجيًا بدل تغييرات عشوائية",
    "يميّز العَرَض عن السبب الجذري",
    "يستخدم DevTools بقصد: Console للخطأ · Network للاستدعاء · Elements للتخطيط",
    "يتحقق أن الإصلاح عالج السبب ولم يُخفِ العَرَض",
    "**يلاحظ أثرًا جانبيًا على وظيفة أخرى**",
    "يكتب ما كان السبب وكيف تحقّق منه"
  ],
  "common_beginner_mistakes": [
    "تغييرات متعددة معًا فلا يُعرف أيها أصلح",
    "إخفاء العَرَض (overflow/try-catch فارغ) واعتباره إصلاحًا",
    "عدم إعادة الإنتاج أولًا",
    "الاكتفاء بأن الشاشة صارت تبدو صحيحة",
    "عدم فحص أثر التغيير على بقية الصفحة"
  ],
  "evidence_expected": ["process_trace", "decision_rationale", "live_defense"],
  "ai_substitutability": "low",
  "ai_note": "**أقل مهارة قابلة للاستبدال.** النموذج يقترح أسبابًا محتملة؛ العزل في سياق حقيقي والتحقق من عدم إخفاء العَرَض عمل بشري.",
  "recency_policy_id": "rec_engineering_practice",
  "status": "active",
  "source_refs": ["src_mdn", "src_chrome_devtools"],
  "provenance": { "source_type": "curated", "drafting_aid": "ai_assisted", "review_status": "draft" }
}
```

## 2.3 Supporting Skills (9) — بصيغة مختصرة

| skill_id | الاسم | family | type | target_level | `ai_subst.` | recency | مؤشرات ملاحَظة (مختصرة) | أخطاء المبتدئ الشائعة |
|---|---|---|---|---|---|---|---|---|
| `skl_code_reading` | قراءة وفهم كود قائم | `fam_engineering_practice` | supporting | working | **low** | `rec_engineering_practice` | يتبع مسار البيانات في كود لم يكتبه · يحدد مكان التغيير الصحيح · يلتزم بأسلوب الملف | يعيد كتابة ما لم يفهمه · يضيف كودًا موازيًا بدل التعديل في مكانه |
| `skl_component_patterns` | أنماط المكوّنات (React أو ما يعادله) | `fam_web_programming` | supporting | familiar | high | `rec_frameworks` | يقسّم واجهة إلى مكوّنات معقولة · يمرّر البيانات عبر الخصائص · يفصل الحالة عن العرض | مكوّن واحد ضخم · حالة مكرّرة في أكثر من موضع |
| `skl_a11y_basics` | أساسيات إمكانية الوصول | `fam_web_markup` | supporting | familiar | medium | `rec_web_standards` | تشغيل بلوحة المفاتيح · تباين مقبول · تسميات للعناصر التفاعلية · عدم الاعتماد على اللون وحده | يضيف سمات ARIA بلا حاجة · يعتبر الوصول تجميلًا |
| `skl_form_validation` | النماذج والتحقق من المدخلات | `fam_web_integration` | supporting | familiar | high | `rec_web_programming` | تحقق فوري ومناسب · رسائل خطأ قابلة للتنفيذ · حالات تعطيل الإرسال | رسائل عامة («خطأ») · تحقق بعد الإرسال فقط |
| `skl_devtools` | أدوات المتصفح | `fam_engineering_practice` | supporting | working | low | `rec_tools` | يستخدم Network لتأكيد الاستدعاء والاستجابة · Elements لعزل نمط · Console لقراءة الخطأ | لا يفتحها أصلًا · يخمّن |
| `skl_git_basics` ⚠️ | Git في سياق فريق | `fam_engineering_practice` | supporting · **`p1_scope: false`** | — | medium | `rec_tools` | فروع ورسائل التزام مفهومة · تغييرات مجمّعة منطقيًا | التزام واحد ضخم · رسائل بلا معنى |
| `skl_requirement_clarification` | توضيح المتطلب الناقص | `fam_professional_behavior` | supporting | working | **low** | `rec_behavioral` | **يكتشف الغموض ويسأل سؤالًا محددًا** · يوثّق الافتراض إن تعذّر السؤال | يفترض صامتًا · يسأل سؤالًا عامًا غير قابل للإجابة |
| `skl_technical_communication` | التواصل التقني المكتوب | `fam_professional_behavior` | supporting | working | medium | `rec_behavioral` | يشرح السبب الجذري والتغيير بإيجاز · يكتب ملاحظات مراجعة محددة | «تم الإصلاح» بلا تفسير · ملاحظات أسلوبية فقط |
| `skl_ai_output_verification` | التحقق من مخرجات أدوات AI | `fam_professional_behavior` | supporting | working | **low** | `rec_behavioral` | يفحص المخرَج قبل التسليم · يكتشف ما لا يناسب السياق · يشرح ما عدّله ولماذا | يسلّم كما هو · لا يستطيع شرح الكود الذي سلّمه |

## 2.4 Skill Families المستخدمة
`fam_web_markup` · `fam_web_styling` · `fam_web_programming` · `fam_web_integration` · `fam_engineering_practice` · `fam_professional_behavior`
> **يُضاف إلى `/global/SKILL_FAMILIES.json`** — و`fam_engineering_practice` و`fam_professional_behavior` **مشتركان مع كل المسارات التقنية** (إعادة استخدام مقصودة).

## 2.5 Recency Policies المستخدمة *(قيم ابتدائية للمعايرة لا للاعتماد — D-023)*
| policy_id | يشمل | current | aging | stale | refresh_method |
|---|---|---|---|---|---|
| `rec_web_standards` | HTML · CSS · a11y | 24 شهرًا | 24–48 | > 48 | نشاط جديد |
| `rec_web_programming` | JS · API · نماذج | 18 شهرًا | 18–36 | > 36 | نشاط جديد |
| `rec_frameworks` | React ونظائره | **12 شهرًا** | 12–24 | > 24 | نشاط بإصدار حديث |
| `rec_tools` | DevTools · Git | 24 شهرًا | 24–48 | > 48 | نشاط جديد |
| `rec_engineering_practice` | التصحيح · قراءة الكود | **36 شهرًا** | 36–60 | > 60 | نشاط جديد |
| `rec_behavioral` | التواصل · التوضيح · التحقق | **48 شهرًا** | 48–72 | > 72 | أي نشاط يقيسها |

> **منطق التفاوت:** الأطر تتقادم أسرع شيء · معايير الويب أبطأ · **الممارسة الهندسية والسلوك أبطأ ما يتقادم**. هذا ما يجعل `recency_policy` لكل عائلة لا رقمًا موحّدًا.

---

# 3. ROLE_SKILL_MAP

| `skill_id` | Core؟ | `importance` | `target_level` | لماذا يحتاجها مطوّر واجهات مبتدئ | `evidence_type_expected` | `min_evidence_count` | تقييم آلي جزئي؟ | يحتاج مراجعة بشرية؟ | `assessed_by_activities` |
|---|---|---|---|---|---|---|---|---|---|
| `skl_semantic_html` | ✅ | critical | working | كل مخرَج يبدأ ببنية · البنية الخاطئة تكسر الوصول والصيانة معًا | artifact · decision_rationale | **2** | **نعم جزئيًا** — وجود عناصر · تسلسل عناوين · ربط التسميات | **نعم** — جودة التعليل والنقد | `act_fe_002` · `act_fe_001` |
| `skl_css_layout_responsive` | ✅ | critical | working | التجاوب مطلب صريح في كل مهمة واجهة · وأول ما يُلاحظ عند الفشل | artifact · decision_rationale · process_trace | **2** | **نعم جزئيًا** — غياب تمرير أفقي · عدم تلف تخطيط على مقاسات محددة | **نعم** — سلامة المقاربة لا النتيجة فقط | `act_fe_002` · `act_fe_001` |
| `skl_js_fundamentals` | ✅ | critical | working | بدونها لا يفهم ولا يعدّل ولا يصحّح · وهي أساس كل ما بعدها | artifact · decision_rationale · live_defense | **2** | **جزئيًا** — سلوك الواجهة عند قيم ناقصة | **نعم** | `act_fe_001` · `act_fe_003` |
| `skl_api_integration_states` | ✅ | critical | working | معظم عمل الواجهة استهلاك بيانات · **وأكثر ما يُرفض فيه المبتدئ هو بناء المسار السعيد فقط** | artifact · decision_rationale · live_defense | **2** | **نعم بقوة** — وجود الحالات الأربع قابل للفحص الحتمي | **نعم** — ملاءمة الرسائل والقرار عند الفراغ | `act_fe_001` · `act_fe_003` |
| `skl_frontend_debugging` | ✅ | critical | working | العمل اليومي الأول للمبتدئ · وأقل مهارة قابلة للاستبدال بـAI | process_trace · decision_rationale · live_defense | **2** | **لا** — النتيجة تُفحَص، أما المنهج فلا | **نعم — إلزامًا** | `act_fe_002` · `act_fe_003` |
| `skl_code_reading` | ➖ | high | working | معظم عمل الوظيفة الأولى تعديل كود لم يكتبه | artifact · decision_rationale | 1 | لا | نعم | `act_fe_003` |
| `skl_component_patterns` | ➖ | high | familiar | الفرق الحديثة تعمل بمكوّنات · لكن المكدّس يختلف | artifact | 1 | جزئيًا | نعم | `act_fe_001` · `act_fe_003` |
| `skl_a11y_basics` | ➖ | medium | familiar | متطلب متزايد · وأساسياته في متناول المبتدئ | artifact · decision_rationale | 1 | **نعم جزئيًا** — تسميات · تباين · تشغيل بلوحة المفاتيح | نعم | `act_fe_002` |
| `skl_form_validation` | ➖ | medium | familiar | النماذج شائعة في أعمال المبتدئين | artifact | 1 | جزئيًا | نعم | `act_fe_003` |
| `skl_devtools` | ➖ | high | working | أداة التشخيص الأساسية | process_trace | 1 | لا | نعم | `act_fe_002` |
| ~~`skl_git_basics`~~ | ➖ | — | — | **خارج نطاق P1 (v0.2.0)** — باقٍ في السجل العالمي للاستخدام المستقبلي | — | — | — | — | **لا نشاط · `p1_scope: false`** |
| `skl_requirement_clarification` | ➖ | **high** | working | **الافتراض الصامت أخطر سلوك مبتدئ** · وهو ما نقيسه عبر المتطلب الناقص | decision_rationale · live_defense | 1 | لا | **نعم — إلزامًا** | `act_fe_001` · `act_fe_003` |
| `skl_technical_communication` | ➖ | high | working | تقرير الإصلاح وملاحظات المراجعة جزء من المخرَج | artifact · decision_rationale | 1 | لا | نعم | `act_fe_002` · `act_fe_003` |
| `skl_ai_output_verification` | ➖ | **high** | working | **واقع الممارسة الحديثة** · الإفصاح بلا تحقق لا قيمة له | decision_rationale · live_defense | 1 | لا | **نعم — إلزامًا** | الثلاثة |

### ⚠️ ثلاث ملاحظات تغطية يجب أن يراها SME
| # | الملاحظة | الأثر | المعالجة المقترحة |
|---|---|---|---|
| **C-1** | كل مهارة أساسية لها **نشاطان** ✅ | بوابة `G-4` مستوفاة | — |
| **C-2** | ~~`skl_git_basics` بلا نشاط~~ | **مُعالَج في v0.2.0** | **أُخرج من نطاق P1:** `p1_scope: false` · **لا يظهر كفجوة مطلوبة · لا يؤثر على التقدّم · لا يمنع اكتمال المسار.** يبقى في السجل العالمي حتى يوجد نشاط يقيسه. **قاعدة معتمدة: لا فجوة ظاهرة بلا طريق إثبات.** |
| **C-3** | `act_fe_001` يحمل 4 مهارات أساسية | خطر القياس السطحي | **قرار v0.2.0: لا ترفع الأوزان شكليًا.** `api_integration` و`js_fundamentals` بثقل · و`semantic_html` و`css` بوزن أخف **يبقى كما هو** · و**سقفهما في P1 = `Demonstrated`** (§5.5). **الجودة أهم من اكتمال جدول التوثيق.** |

---

# 4. TASKS *(11 مهمة)*

```json
{ "task_id": "tsk_fe_build_ui_from_design",
  "title_ar": "بناء واجهة من تصميم محدد", "title_en": "Build UI from a given design",
  "description": "تحويل شاشة أو مكوّن من تصميم (Figma أو صورة أو وصف) إلى كود يعمل، مع الالتزام بالتخطيط والمسافات والحالات التفاعلية.",
  "related_skills": [
    {"skill_id":"skl_semantic_html","involvement":"primary"},
    {"skill_id":"skl_css_layout_responsive","involvement":"primary"},
    {"skill_id":"skl_component_patterns","involvement":"secondary"}],
  "expected_output": "مكوّن/صفحة تعمل في المتصفح ومطابقة للتصميم على المقاسات المطلوبة",
  "common_tools": ["Figma (read-only)","DevTools","Code editor"],
  "frequency": "weekly", "complexity": "medium",
  "failure_modes": [
    "تجاهل الحالات غير المرسومة (تحميل · فراغ · خطأ · تمرير الفأرة · تعطيل)",
    "قيم بكسل ثابتة من التصميم بلا تفكير في التجاوب",
    "div لكل شيء لأن التصميم لا يذكر الدلالة",
    "نص أطول من المرسوم يكسر التخطيط",
    "عدم سؤال المصمم عن سلوك غير محدد" ] }
```

```json
{ "task_id": "tsk_fe_integrate_api",
  "title_ar": "ربط الواجهة بـAPI جاهز", "title_en": "Integrate an existing API",
  "description": "استدعاء endpoint موثّق جزئيًا، قراءة شكل استجابته، وتحويل بياناته إلى ما تعرضه الواجهة.",
  "related_skills": [
    {"skill_id":"skl_api_integration_states","involvement":"primary"},
    {"skill_id":"skl_js_fundamentals","involvement":"primary"}],
  "expected_output": "واجهة تعرض بيانات حقيقية من الاستدعاء مع تحويل صحيح للحقول",
  "common_tools": ["API client","DevTools Network"],
  "frequency": "weekly", "complexity": "medium",
  "failure_modes": [
    "البناء على شكل استجابة متوقَّع لا على الفعلي",
    "عدم فحص الاستدعاء في Network والتخمين من الواجهة",
    "الافتراض أن كل سجل يحمل كل الحقول",
    "تجاهل ترميز أو تنسيق التواريخ والأرقام",
    "تثبيت قيم اختبارية داخل الكود ونسيانها" ] }
```

```json
{ "task_id": "tsk_fe_handle_states",
  "title_ar": "معالجة حالات التحميل والخطأ والفراغ", "title_en": "Handle loading / error / empty states",
  "description": "تنفيذ الحالات الأربع (تحميل · نجاح · فراغ · خطأ) بسلوك ورسائل مناسبة للمستخدم النهائي.",
  "related_skills": [
    {"skill_id":"skl_api_integration_states","involvement":"primary"},
    {"skill_id":"skl_semantic_html","involvement":"secondary"}],
  "expected_output": "أربع حالات قابلة للمشاهدة والتحقق",
  "common_tools": ["DevTools (Network throttling / offline)"],
  "frequency": "weekly", "complexity": "medium",
  "failure_modes": [
    "حالة الفراغ غائبة فتظهر شاشة بيضاء",
    "خلط الفراغ بالخطأ",
    "عرض نص الاستثناء التقني للمستخدم",
    "حالة تحميل بلا نهاية عند الفشل",
    "**عدم سؤال أحد عن نص رسالة الفراغ المطلوب**" ] }
```

```json
{ "task_id": "tsk_fe_make_responsive",
  "title_ar": "جعل الصفحة متجاوبة", "title_en": "Make a page responsive",
  "description": "تعديل تخطيط قائم ليعمل على مقاسات محددة (جوال · لوحي · مكتبي) بلا تلف أو تمرير أفقي.",
  "related_skills": [{"skill_id":"skl_css_layout_responsive","involvement":"primary"}],
  "expected_output": "تخطيط سليم على المقاسات المطلوبة",
  "common_tools": ["DevTools device mode"],
  "frequency": "weekly", "complexity": "medium",
  "failure_modes": [
    "استثناء لكل مقاس بدل مقاربة مرنة واحدة",
    "إخفاء العناصر المزعجة بدل إعادة تنظيمها",
    "تمرير أفقي غير مقصود",
    "تجاهل الصور ذات الأبعاد المختلفة",
    "الاختبار بتصغير النافذة فقط" ] }
```

```json
{ "task_id": "tsk_fe_fix_bug",
  "title_ar": "إصلاح عطل مُسنَد", "title_en": "Fix an assigned defect",
  "description": "إعادة إنتاج عطل مُبلَّغ، عزل سببه الجذري، إصلاحه، والتحقق من عدم وجود أثر جانبي.",
  "related_skills": [
    {"skill_id":"skl_frontend_debugging","involvement":"primary"},
    {"skill_id":"skl_devtools","involvement":"primary"},
    {"skill_id":"skl_code_reading","involvement":"secondary"}],
  "expected_output": "إصلاح + وصف السبب الجذري + طريقة التحقق",
  "common_tools": ["DevTools","Git"],
  "frequency": "daily", "complexity": "medium",
  "failure_modes": [
    "إصلاح العَرَض لا السبب",
    "تغييرات متعددة معًا",
    "عدم إعادة الإنتاج أولًا",
    "**عدم ملاحظة أن الإصلاح كسر وظيفة أخرى**",
    "«تم الإصلاح» بلا تفسير" ] }
```

```json
{ "task_id": "tsk_fe_improve_semantics_a11y",
  "title_ar": "تحسين البنية الدلالية وإمكانية الوصول", "title_en": "Improve semantics & accessibility",
  "description": "مراجعة صفحة قائمة وتحسين عناصرها الدلالية وتسمياتها وتشغيلها بلوحة المفاتيح.",
  "related_skills": [
    {"skill_id":"skl_semantic_html","involvement":"primary"},
    {"skill_id":"skl_a11y_basics","involvement":"primary"}],
  "expected_output": "تغييرات محددة مع تعليل لكل تغيير",
  "common_tools": ["DevTools","لوحة المفاتيح"],
  "frequency": "monthly", "complexity": "low",
  "failure_modes": [
    "إضافة ARIA حيث يكفي العنصر الصحيح",
    "معالجة المظهر لا البنية",
    "تجاهل ترتيب التنقّل بلوحة المفاتيح",
    "الاعتماد على اللون وحده لنقل المعنى",
    "تغييرات بلا تعليل" ] }
```

```json
{ "task_id": "tsk_fe_review_component",
  "title_ar": "مراجعة مكوّن كتبه غيره", "title_en": "Review someone else's component",
  "description": "قراءة مكوّن وإبداء ملاحظات محددة على البنية والحالات والتسمية وقابلية القراءة.",
  "related_skills": [
    {"skill_id":"skl_code_reading","involvement":"primary"},
    {"skill_id":"skl_technical_communication","involvement":"primary"}],
  "expected_output": "قائمة ملاحظات محددة مرتّبة بالأهمية",
  "common_tools": ["Git / أداة مراجعة"],
  "frequency": "weekly", "complexity": "medium",
  "failure_modes": [
    "ملاحظات أسلوبية فقط (مسافات · تسمية) وتفويت عيب وظيفي",
    "«يبدو جيدًا» بلا فحص",
    "إعادة كتابة الحل بأسلوبه بدل ملاحظة المشكلة",
    "ملاحظات بلا أولوية فيغرق المؤلف" ] }
```

```json
{ "task_id": "tsk_fe_form_validation",
  "title_ar": "نموذج مع تحقق من المدخلات", "title_en": "Build a form with validation",
  "description": "بناء نموذج بحقول إلزامية واختيارية وتحقق ورسائل خطأ وسلوك إرسال.",
  "related_skills": [
    {"skill_id":"skl_form_validation","involvement":"primary"},
    {"skill_id":"skl_semantic_html","involvement":"secondary"},
    {"skill_id":"skl_a11y_basics","involvement":"secondary"}],
  "expected_output": "نموذج يعمل بتحقق ورسائل قابلة للتنفيذ",
  "common_tools": ["DevTools"],
  "frequency": "monthly", "complexity": "medium",
  "failure_modes": [
    "رسالة «خطأ» بلا بيان ما يجب فعله",
    "تحقق بعد الإرسال فقط",
    "حقول بلا تسميات مرتبطة",
    "السماح بإرسال مزدوج",
    "عدم تمييز الإلزامي عن الاختياري" ] }
```

```json
{ "task_id": "tsk_fe_implement_change_request",
  "title_ar": "تنفيذ تغيير في متطلب قائم", "title_en": "Implement a change to an existing requirement",
  "description": "تعديل سلوك موجود بناءً على طلب تغيير، مع الحفاظ على ما يعمل حاليًا.",
  "related_skills": [
    {"skill_id":"skl_code_reading","involvement":"primary"},
    {"skill_id":"skl_js_fundamentals","involvement":"primary"},
    {"skill_id":"skl_requirement_clarification","involvement":"primary"}],
  "expected_output": "تغيير مُنفَّذ + بيان ما تأثر + ما تحقّق منه",
  "common_tools": ["DevTools","Git"],
  "frequency": "weekly", "complexity": "high",
  "failure_modes": [
    "تنفيذ التغيير وكسر الحالة القائمة (انحدار)",
    "عدم ملاحظة تعارض التغيير مع افتراض قائم في الكود",
    "إضافة مسار موازٍ بدل التعديل في الموضع الصحيح",
    "عدم سؤال عن أولوية التعارض",
    "عدم إعادة اختبار المسار الأصلي" ] }
```

```json
{ "task_id": "tsk_fe_reproduce_and_report",
  "title_ar": "إعادة إنتاج مشكلة وتوثيقها", "title_en": "Reproduce and document an issue",
  "description": "تحويل بلاغ غامض إلى خطوات إعادة إنتاج محددة وسلوك متوقّع مقابل فعلي.",
  "related_skills": [
    {"skill_id":"skl_frontend_debugging","involvement":"primary"},
    {"skill_id":"skl_technical_communication","involvement":"primary"}],
  "expected_output": "تقرير: خطوات · متوقّع · فعلي · بيئة · دليل (سجل/لقطة)",
  "common_tools": ["DevTools","متتبّع المهام"],
  "frequency": "weekly", "complexity": "low",
  "failure_modes": [
    "«لا يعمل» بلا خطوات",
    "عدم تحديد البيئة أو المتصفح",
    "خلط ملاحظتين في بلاغ واحد",
    "عدم إرفاق دليل من Console أو Network" ] }
```

```json
{ "task_id": "tsk_fe_verify_ai_snippet",
  "title_ar": "التحقق من مقطع كود مولّد بأداة AI", "title_en": "Verify an AI-generated code snippet",
  "description": "فحص مقطع مقترح من أداة AI قبل إدخاله: هل يناسب السياق؟ هل يعالج الحالات؟ ما الذي يجب تعديله؟",
  "related_skills": [
    {"skill_id":"skl_ai_output_verification","involvement":"primary"},
    {"skill_id":"skl_js_fundamentals","involvement":"primary"},
    {"skill_id":"skl_code_reading","involvement":"secondary"}],
  "expected_output": "قرار (قبول/تعديل/رفض) + تعليل + التعديلات المنفَّذة",
  "common_tools": ["DevTools","أداة AI"],
  "frequency": "daily", "complexity": "medium",
  "failure_modes": [
    "الإدخال كما هو بلا فحص",
    "عدم القدرة على شرح ما سلّمه",
    "تجاهل أن المقطع يستخدم واجهة غير موجودة في المشروع",
    "تجاهل أن المقطع لا يعالج الفراغ أو الخطأ",
    "رفض المقطع كله بدل تعديل الجزء غير المناسب" ] }
```

---

# 5. ACTIVITIES *(3 أنشطة)*

> **قاعدة التصميم:** كل نشاط يقيس **2–3 مهارات أساسية بعمق**، وليس سبع مهارات سطحيًا.
> **كل الأنشطة `ai_assisted`** — لأن الممارسة الحديثة كذلك، **ولأن منعًا لا نستطيع التحقق منه منعٌ شكلي يضر المصداقية** (سياسة AI §2).
> **`can_yield_verified = false` في كل الأنشطة** حتى اعتماد SME.

## 5.1 `act_fe_001` — بناء واجهة مرتبطة بـAPI

```
activity_id: act_fe_001_product_list_api
spec_version: 0.1.0
profile: mission
title_ar: "شاشة قائمة المنتجات — من تصميم إلى واجهة تعمل ببيانات حقيقية"
title_en: "Product list screen — design to working UI with live data"
estimated_duration_min: 100   (المدى المقبول 80–120)
ai_usage_mode: ai_assisted
evidence_strength_class: platform_controlled
high_strength: false
is_validation_activity: false
can_yield_verified: false        # حتى اعتماد SME
```

**business_context**
> أنت مطوّر واجهات مبتدئ في فريق منتج داخلي. مديرك (افتراضي) أسند إليك شاشة «قائمة المنتجات» في لوحة إدارة داخلية. المصمّمة سلّمت الشاشة، وفريق الخلفية سلّم endpoint جاهزًا. **العرض التقديمي للإدارة بعد يومين**، والمطلوب شاشة تعمل ببيانات فعلية لا ببيانات ثابتة.

**objective**
> تنفيذ الشاشة بحيث تعرض بيانات الـAPI الفعلية، وتتعامل مع كل حالات البيانات الممكنة، وتعمل على مقاسي جوال ومكتبي.

**input_files**
```json
[
 {"file_ref":"design_product_list.png","description":"تصميم الشاشة — **يُظهر حالة النجاح فقط**","is_platform_private":true,"contains_planted_issue":false},
 {"file_ref":"api_contract_products.md","description":"وصف جزئي للـendpoint: الحقول الأساسية · **لا يذكر سلوك الفراغ ولا شكل الخطأ**","is_platform_private":true,"contains_planted_issue":true},
 {"file_ref":"mock_api_products.json","description":"استجابة عيّنة: 12 سجلًا — **3 منها بحقل `imageUrl = null` و1 بحقل `price` مفقود**","is_platform_private":true,"contains_planted_issue":true},
 {"file_ref":"mock_api_products_empty.json","description":"استجابة صحيحة بمصفوفة فارغة — **يجب أن يجرّبها المستخدم**","is_platform_private":true,"contains_planted_issue":true},
 {"file_ref":"starter_project/","description":"مشروع بداية بالحد الأدنى (بلا منطق جاهز)","is_platform_private":true,"contains_planted_issue":false}
]
```

**task_brief**
1. نفّذ الشاشة حسب التصميم.
2. اربطها بالـendpoint واعرض البيانات الفعلية.
3. تعامل مع **حالات البيانات كلها** التي تراها ممكنة.
4. اجعل الشاشة تعمل على مقاس جوال ومقاس مكتبي.
5. **اكتب ملخص قرارات:** ما افترضته، وما لم تجد إجابته في الوصف.

**expected_deliverables**
```json
[
 {"key":"working_ui","format":"code + screenshots (أو رابط تشغيل)","mandatory":true},
 {"key":"states_evidence","format":"لقطات/تسجيل للحالات الأربع","mandatory":true},
 {"key":"responsive_evidence","format":"لقطتان: جوال · مكتبي","mandatory":true},
 {"key":"decisions_summary","format":"نص قصير: الافتراضات + الأسئلة","mandatory":true},
 {"key":"ai_disclosure","format":"نموذج الإقرار","mandatory":true}
]
```

**expected_user_decisions** *(ما نقيسه فعلًا)*
| القرار | السلوك المطلوب |
|---|---|
| ماذا يُعرض عند مصفوفة فارغة؟ | **يسأل المدير، أو يوثّق افتراضًا واضحًا** — لا يتركها شاشة بيضاء |
| ماذا يُعرض لسجل بلا صورة؟ | صورة بديلة أو حجز مساحة — **لا تخطيط مكسور ولا أيقونة صورة معطوبة** |
| ماذا يُعرض لسجل بلا سعر؟ | قيمة بديلة مفهومة — **لا `undefined` ولا `NaN` ولا انهيار** |
| كيف تُصاغ رسالة الخطأ؟ | نص مفيد للمستخدم — **لا نص الاستثناء** |
| هل تُعرض حالة تحميل؟ | نعم — وتنتهي في كل المسارات |

**related_skills (بأثقالها)**
| المهارة | الثقل | هل تُنتج دليلًا؟ |
|---|---|---|
| `skl_api_integration_states` | **أساسي ثقيل** | نعم |
| `skl_js_fundamentals` | **أساسي ثقيل** | نعم |
| `skl_semantic_html` | خفيف | **فقط ببلوغ عتبة بنده** |
| `skl_css_layout_responsive` | خفيف | **فقط ببلوغ عتبة بنده** |
| `skl_requirement_clarification` | مساند | نعم |
| `skl_ai_output_verification` | مساند | نعم |

**deterministic_checks**
```json
[
 {"check_id":"dc_001_1","check_type":"presence","rule_description":"وجود المخرجات الإلزامية الخمسة","is_mandatory":true},
 {"check_id":"dc_001_2","check_type":"presence","rule_description":"دليل على الحالات الأربع (تحميل · نجاح · فراغ · خطأ)","is_mandatory":true,
  "failure_message_ar":"لم نجد دليلًا على حالة الفراغ أو الخطأ. هذه العناصر جزء من المطلوب."},
 {"check_id":"dc_001_3","check_type":"constraint","rule_description":"لا ظهور لـ undefined أو NaN أو null في الواجهة المعروضة","is_mandatory":true},
 {"check_id":"dc_001_4","check_type":"constraint","rule_description":"لا تمرير أفقي على مقاس الجوال المحدد","is_mandatory":false},
 {"check_id":"dc_001_5","check_type":"value_match","rule_description":"عدد العناصر المعروضة = عدد سجلات الاستجابة","is_mandatory":true},
 {"check_id":"dc_001_6","check_type":"presence","rule_description":"إقرار AI مكتمل الحقول","is_mandatory":true}
]
```

**integrity_checks**
```json
[
 {"check_id":"ic_001_1","type":"missing_information",
  "location":"api_contract_products.md — لا يذكر سلوك الفراغ",
  "expected_user_behavior":"يسأل المدير عن نص/سلوك الفراغ، أو يوثّق افتراضًا صريحًا في ملخص القرارات",
  "raw_ai_output_behavior":"يولّد حالة فراغ بنص عام بلا سؤال وبلا توثيق افتراض",
  "weight":"high","is_blocking":true,"linked_criterion_id":"core.judgment.assumption_check"},

 {"check_id":"ic_001_2","type":"data_inconsistency",
  "location":"mock_api_products.json — 3 سجلات بـ imageUrl=null وسجل بلا price",
  "expected_user_behavior":"يكتشفها ويعالجها بقيمة بديلة، **ويذكر أنه لاحظها**",
  "raw_ai_output_behavior":"يفترض اكتمال كل الحقول فتظهر صور معطوبة أو NaN",
  "weight":"high","is_blocking":true,"linked_criterion_id":"track.frontend.data_edge_handling"},

 {"check_id":"ic_001_3","type":"outlier",
  "location":"سجل واحد بعنوان طويل جدًا (أطول من المرسوم)",
  "expected_user_behavior":"التخطيط يستوعبه (اقتطاع أو التفاف) بلا كسر",
  "raw_ai_output_behavior":"يلتزم بأبعاد التصميم فيكسر التخطيط",
  "weight":"medium","is_blocking":false,"linked_criterion_id":"track.frontend.layout_robustness"},

 {"check_id":"ic_001_4","type":"contextual_defense_question",
  "location":"سؤال بعد التسليم",
  "question_ar":"في حالة الفراغ: لماذا اخترت هذا السلوك تحديدًا؟ وما البديل الذي استبعدته ولماذا؟",
  "expected_user_behavior":"يربط قراره بالسياق (لوحة إدارة داخلية · مستخدم موظف) لا بقاعدة عامة",
  "raw_ai_output_behavior":"تبرير عام صحيح لغويًا وغير مرتبط بسياق النشاط",
  "weight":"high","is_blocking":true,"linked_criterion_id":"core.judgment.decision_under_uncertainty"}
]
```

**evaluation_requirements**
`rubric_ref: {rubric_id: "rub_fe_001", rubric_version: "0.1.0", scoring_policy_version: "0.1.0"}` · مراجعة بشرية **إلزامية** لكل تسليم في نافذة المعايرة · `skill_criteria_map` في §6.1.
`sme_approval: null` ⚠️ · `authoring_effort_minutes: TO BE MEASURED`

---

## 5.2 `act_fe_002` — تشخيص عطل + تجاوب + تحسين دلالي ووصول

```
activity_id: act_fe_002_debug_responsive_a11y
spec_version: 0.1.0
profile: mission
title_ar: "صفحة معطوبة — شخّص وأصلح وحسّن"
title_en: "A broken page — diagnose, fix, improve"
estimated_duration_min: 90   (المدى 70–110)
ai_usage_mode: ai_assisted
evidence_strength_class: platform_controlled
high_strength: true      # ⚠️ يحتاج معايير `high_strength` مكتوبة واعتماد SME
can_yield_verified: false
```

**business_context**
> صفحة «تفاصيل الطلب» في نظام داخلي تعمل منذ شهور. وصل بلاغان من فريق خدمة العملاء: **«الصفحة تُظهر بيانات خاطئة أحيانًا»** و**«الصفحة غير قابلة للاستخدام على الجوال»**. المدير أسند إليك البلاغين، وطلب أيضًا **تحسينين دلاليين على الأقل** لأن مراجعة إمكانية وصول قادمة.

**objective**
> إعادة إنتاج البلاغين، عزل السبب الجذري لكل منهما، إصلاحهما بلا إخفاء الأعراض، وتحسين البنية الدلالية — مع **تقرير يشرح السبب وطريقة التحقق**.

**input_files**
```json
[
 {"file_ref":"broken_page_project/","description":"مشروع يعمل مع عيوب مزروعة","is_platform_private":true,"contains_planted_issue":true},
 {"file_ref":"bug_reports.md","description":"بلاغان **غامضان كما يكتبهما غير التقنيين** — بلا خطوات إعادة إنتاج","is_platform_private":true,"contains_planted_issue":true},
 {"file_ref":"target_viewports.md","description":"المقاسات المطلوب دعمها","is_platform_private":true,"contains_planted_issue":false}
]
```

**task_brief**
1. **أعد إنتاج** كل بلاغ بخطوات محددة قبل أي إصلاح.
2. حدّد **السبب الجذري** لكل منهما.
3. أصلحهما.
4. **تحقّق** أن الإصلاح لم يكسر شيئًا آخر.
5. حسّن **بنيتين دلاليتين على الأقل** مع تعليل لكل تحسين.
6. اكتب **تقرير إصلاح**: خطوات الإنتاج · السبب الجذري · التغيير · طريقة التحقق.

**expected_deliverables**
`fix_code` · `reproduction_steps` · `root_cause_report` · `verification_evidence` · `semantic_improvements` (تغييران + تعليل) · `responsive_evidence` · `ai_disclosure` — **كلها إلزامية**.

**expected_user_decisions**
| القرار | السلوك المطلوب |
|---|---|
| البلاغان: عيبان أم عَرَضان لسبب واحد؟ | **البلاغ الأول عَرَضان لسبب واحد** — إدراك ذلك مؤشر قوي |
| إصلاح العَرَض أم السبب؟ | السبب · و**رفض الحل السريع المتاح** |
| ماذا يُحسَّن دلاليًا؟ | تغيير بنيوي حقيقي لا تجميل · **مع تعليل** |
| كيف يتحقق؟ | خطوات تحقق محددة لا «يبدو صحيحًا» |

**related_skills**
| المهارة | الثقل |
|---|---|
| `skl_frontend_debugging` | **أساسي ثقيل** |
| `skl_css_layout_responsive` | **أساسي ثقيل** |
| `skl_semantic_html` | **أساسي متوسط** |
| `skl_a11y_basics` · `skl_devtools` · `skl_technical_communication` | مساند |

**deterministic_checks**
```json
[
 {"check_id":"dc_002_1","check_type":"presence","rule_description":"وجود خطوات إعادة إنتاج مكتوبة","is_mandatory":true},
 {"check_id":"dc_002_2","check_type":"value_match","rule_description":"العطل لم يعد قابلًا لإعادة الإنتاج بالخطوات المذكورة","is_mandatory":true},
 {"check_id":"dc_002_3","check_type":"constraint","rule_description":"الوظائف الأخرى في الصفحة ما زالت تعمل (فحص انحدار)","is_mandatory":true},
 {"check_id":"dc_002_4","check_type":"constraint","rule_description":"لا تمرير أفقي على المقاسات المحددة","is_mandatory":true},
 {"check_id":"dc_002_5","check_type":"structure","rule_description":"تسلسل العناوين سليم وكل حقل مرتبط بتسمية","is_mandatory":false},
 {"check_id":"dc_002_6","check_type":"constraint","rule_description":"**لم يُستخدم overflow:hidden أو try/catch فارغ لإخفاء الأعراض**","is_mandatory":true,
  "failure_message_ar":"التغيير يخفي العَرَض بدل معالجة السبب."}
]
```

**integrity_checks**
```json
[
 {"check_id":"ic_002_1","type":"planted_contradiction",
  "location":"عيب واحد في تحويل البيانات يُنتج عَرَضين مختلفين في مكانين",
  "expected_user_behavior":"يربط العَرَضين بسبب واحد ولا يصلح كلًا منهما منفصلًا",
  "raw_ai_output_behavior":"يقترح إصلاحين موضعيين منفصلين",
  "weight":"high","is_blocking":true,"linked_criterion_id":"track.frontend.root_cause_isolation"},

 {"check_id":"ic_002_2","type":"hidden_assumption",
  "location":"عرض ثابت بالبكسل في حاوية داخلية هو سبب مشكلة الجوال — والعلاج الظاهر هو overflow:hidden",
  "expected_user_behavior":"يرفض الحل الظاهر ويصلح التخطيط جذريًا",
  "raw_ai_output_behavior":"يقترح overflow:hidden أو media query استثنائية",
  "weight":"high","is_blocking":true,"linked_criterion_id":"track.frontend.symptom_vs_cause"},

 {"check_id":"ic_002_3","type":"edge_case",
  "location":"الإصلاح الصحيح للعيب الأول يؤثر على حالة الفراغ إن لم يُنتبه لها",
  "expected_user_behavior":"يفحص أثر تغييره على المسارات الأخرى ويذكره",
  "raw_ai_output_behavior":"يصلح الحالة المذكورة بلا فحص الأثر",
  "weight":"high","is_blocking":false,"linked_criterion_id":"core.integrity.error_detection"},

 {"check_id":"ic_002_4","type":"contextual_defense_question",
  "location":"سؤال بعد التسليم",
  "question_ar":"كيف تأكدت أن ما أصلحته هو السبب وليس عَرَضًا؟ وما الذي كان سيحدث لو اكتفيت بالحل الأسرع؟",
  "expected_user_behavior":"يشرح خطوات عزل فعلية ويسمّي الحل السريع الذي رفضه",
  "raw_ai_output_behavior":"يشرح مبادئ التصحيح عمومًا بلا ربط بخطواته",
  "weight":"high","is_blocking":true,"linked_criterion_id":"core.judgment.decision_under_uncertainty"}
]
```

`rubric_ref: rub_fe_002@0.1.0` · مراجعة بشرية **إلزامية** · `sme_approval: null` ⚠️ · `authoring_effort_minutes: TO BE MEASURED`

---

## 5.3 `act_fe_003` — طلب تغيير على مشروع قائم + عطل قائم *(أُعيد تصميمه في v0.2.0)*

```
activity_id: act_fe_003_change_request_regression
spec_version: 0.2.0
profile: mission
title_ar: "طلب تغيير وصل متأخرًا — عدّل بلا أن تكسر"
title_en: "A late change request — modify without breaking"
estimated_duration_min: 100        # المدى المستهدف 90–120 (كان 110 بمدى حتى 130)
ai_usage_mode: ai_assisted
evidence_strength_class: platform_controlled
high_strength: false
can_yield_verified: false
```

### ما تغيّر ولماذا *(تقليص الزمن بلا إضعاف القياس)*
| التغيير | الأثر على الزمن | الأثر على القياس |
|---|---|---|
| **حُذف متطلب «حفظ الحالة عبر تحديث الصفحة»** | **−25 دقيقة** | **لا شيء** — كان ميزة إضافية تُنفَّذ، ولم يكن يقيس أيًّا من الأبعاد الخمسة المطلوبة |
| **صُغِّر المشروع القائم** إلى 4 ملفات بدل ~10 | **−10 دقائق** | **لا شيء** — زمن التنقّل ليس مهارة · **مواضع الافتراض الثلاثة باقية كما هي** |
| **دُمج `impact_notes` و`questions_or_assumptions`** في «مذكرة تغيير» واحدة | **−5 دقائق** | **لا شيء** — نفس المحتوى بصياغة أخف |
| **رسالة المدير تصل عند ~30 دقيقة** بدل 40 | 0 | **أفضل** — وقت أوسع للتعامل معها بقرار |

### الأبعاد الخمسة المطلوبة — **كلها محفوظة**
| البُعد | كيف يُقاس بعد التقليص |
|---|---|
| **قراءة مشروع قائم** | إيجاد **ثلاثة** مواضع تفترض «قيمة واحدة» — أحدها بعيد عن موضع التغيير الظاهر |
| **فهم requirement جديد** | تنفيذ الاختيار المتعدد + التعامل مع نقص في وصف الطلب |
| **Debugging / modification** | عطل العدّاد (يظهر بشرط: فلترين أو أكثر) |
| **التحقق من النتيجة** | إثبات أن السلوك الأصلي (اختيار واحد) ما زال يعمل |
| **شرح القرار** | مذكرة التغيير + سؤال الدفاع السياقي |

> **لم يُقسَّم النشاط إلى نشاطين** لأن التقليص كان ممكنًا بلا مساس بأي بعد.

**business_context**
> ميزة «تصفية الطلبات» تعمل في الإنتاج. بعد اجتماع مع صاحب المصلحة وصل **طلب تغيير**: التصفية يجب أن تدعم **اختيارًا متعددًا** بدل واحد. وأثناء عملك يرسل المدير رسالة: **عميل داخلي يشتكي أن عدّاد النتائج يظهر رقمًا خاطئًا** — وهو عطل قائم قبل تغييرك.

**objective**
> تنفيذ التغيير بلا كسر ما يعمل، والتعامل مع عطل قائم ظهر أثناء العمل، مع **تحديد ما تأثر وكيف تحقّقت**.

**input_files**
```json
[
 {"file_ref":"existing_filter_project/","description":"مشروع قائم يعمل — **4 ملفات فقط** · بافتراض مضمَر بأن التصفية قيمة واحدة في ثلاثة مواضع","is_platform_private":true,"contains_planted_issue":true},
 {"file_ref":"change_request.md","description":"طلب التغيير — **لا يحدد ما يحدث لخيار كان مختارًا ولم يبقَ متاحًا**","is_platform_private":true,"contains_planted_issue":true},
 {"file_ref":"manager_message.md","description":"رسالة المدير عن عدّاد النتائج — تُسلَّم عند ~30 دقيقة","is_platform_private":true,"contains_planted_issue":true}
]
```

**task_brief**
1. **اقرأ الكود القائم** وحدد مكان التغيير الصحيح.
2. نفّذ **الاختيار المتعدد** للتصفية.
3. تعامل مع **عطل العدّاد** — إصلاحًا أو تأجيلًا بقرار معلَّل.
4. **تحقّق أن السلوك الأصلي (اختيار واحد) ما زال يعمل.**
5. اكتب **مذكرة تغيير قصيرة:** ما تأثر · ما لم تنفّذه ولماذا · أسئلتك أو افتراضاتك.

**expected_deliverables**
```json
[
 {"key":"modified_code","format":"code","mandatory":true},
 {"key":"change_note","format":"نص قصير: ما تأثر + ما لم يُنفَّذ ولماذا + الأسئلة/الافتراضات","mandatory":true},
 {"key":"regression_evidence","format":"دليل أن السلوك الأصلي يعمل","mandatory":true},
 {"key":"counter_decision","format":"بيان صريح: أُصلح العدّاد أم أُجِّل + التعليل","mandatory":true},
 {"key":"ai_disclosure","format":"نموذج الإقرار","mandatory":true}
]
```

**expected_user_decisions**
| القرار | السلوك المطلوب |
|---|---|
| التغيير يتعارض مع افتراض «قيمة واحدة» في الكود | **يكتشف التعارض ويسأل أو يوثّق قراره** |
| ماذا يحدث لخيار مختار لم يبقَ متاحًا؟ | يسأل أو يوثّق افتراضًا صريحًا |
| هل يصلح العدّاد أم يبلّغ فقط؟ | **قرار مشروع في الاتجاهين** — المهم أن يكون معلَّلًا ومتّسقًا |
| ما يُنفَّذ الآن وما يُؤجَّل | تقليص نطاق معلَّل مقبول · **التنفيذ الناقص الصامت ليس كذلك** |

**related_skills**
| المهارة | الثقل |
|---|---|
| `skl_js_fundamentals` | **أساسي ثقيل** |
| `skl_frontend_debugging` | **أساسي متوسط** *(العدّاد)* |
| `skl_api_integration_states` | **أساسي متوسط** *(حالة «لا نتائج» بعد التصفية)* |
| `skl_code_reading` · `skl_requirement_clarification` · `skl_technical_communication` | مساند |

**deterministic_checks**
```json
[
 {"check_id":"dc_003_1","check_type":"presence","rule_description":"وجود المخرجات الإلزامية الخمسة","is_mandatory":true},
 {"check_id":"dc_003_2","check_type":"value_match","rule_description":"الاختيار المتعدد يعمل: النتائج تطابق مجموع الفلاتر المختارة","is_mandatory":true},
 {"check_id":"dc_003_3","check_type":"constraint","rule_description":"**السلوك الأصلي (اختيار واحد) ما زال يعمل** — فحص انحدار","is_mandatory":true},
 {"check_id":"dc_003_4","check_type":"constraint","rule_description":"حالة «لا نتائج» مُعالَجة بعد التصفية","is_mandatory":true},
 {"check_id":"dc_003_5","check_type":"presence","rule_description":"بيان صريح: أُصلح العدّاد أم أُبلغ عنه","is_mandatory":true}
]
```
> *(حُذف فحص «حفظ الحالة» مع حذف متطلبه.)*

**integrity_checks** — *(خمسة، كما كانت · مصنّفة في §7)*
```json
[
 {"check_id":"ic_003_1","type":"planted_contradiction","surface":"assessment_only",
  "location":"ثلاثة مواضع تفترض قيمة واحدة — أحدها بعيد عن موضع التغيير الظاهر",
  "expected_user_behavior":"يجد المواضع الثلاثة أو يذكر احتمال وجود غيرها ويفحص",
  "raw_ai_output_behavior":"يعدّل الموضع الظاهر فقط فيقع انحدار صامت",
  "weight":"high","is_blocking":true,"linked_criterion_id":"track.frontend.change_impact_analysis"},

 {"check_id":"ic_003_2","type":"missing_information","surface":"user_facing",
  "location":"change_request.md لا يحدد سلوك خيار مختار لم يبقَ متاحًا",
  "expected_user_behavior":"يسأل المدير أو يوثّق افتراضًا صريحًا",
  "raw_ai_output_behavior":"ينفّذ افتراضًا صامتًا",
  "weight":"high","is_blocking":true,"linked_criterion_id":"core.judgment.assumption_check"},

 {"check_id":"ic_003_3","type":"follow_up_modification","surface":"user_facing",
  "location":"رسالة المدير عن العدّاد تصل عند ~30 دقيقة",
  "expected_user_behavior":"قرار معلَن: يصلح الآن أو يؤجل ويبلّغ بخطوات الإنتاج",
  "raw_ai_output_behavior":"يتجاهل التدخّل أو يدمجه بلا قرار معلَن",
  "weight":"high","is_blocking":false,"linked_criterion_id":"track.frontend.defect_triage_decision"},

 {"check_id":"ic_003_4","type":"edge_case","surface":"assessment_only",
  "location":"عطل العدّاد سببه احتساب مكرر يظهر فقط عند اختيار فلترين أو أكثر",
  "expected_user_behavior":"إن أصلحه يشرح شرط ظهوره؛ وإن أجّله يوثّق خطوات إنتاجه",
  "raw_ai_output_behavior":"يعيد كتابة العدّاد بلا فهم شرط ظهور العطل",
  "weight":"medium","is_blocking":false,"linked_criterion_id":"track.frontend.defect_triage_decision"},

 {"check_id":"ic_003_5","type":"contextual_defense_question","surface":"user_facing",
  "location":"سؤال واحد بعد التسليم",
  "question_ar":"ما الذي كان يمكن أن يُكسَر بتغييرك ولم تلاحظه إلا بالفحص؟ وكيف تحقّقت؟",
  "expected_user_behavior":"يسمّي أثرًا محددًا في كوده هو وطريقة تحقّقه",
  "raw_ai_output_behavior":"جواب عام عن الانحدار بلا ربط بالتغيير",
  "weight":"high","is_blocking":true,"linked_criterion_id":"core.integrity.error_detection"}
]
```

`rubric_ref: rub_fe_003@0.2.0` · مراجعة بشرية **إلزامية** · `sme_approval: null` ⚠️ · `authoring_effort_minutes: TO BE MEASURED`

## 5.4 تغطية المهارات الأساسية عبر الأنشطة *(بوابة G-4)*

| المهارة الأساسية | `act_fe_001` | `act_fe_002` | `act_fe_003` | أنشطة بعمق كافٍ | أقصى مستوى ممكن في P1 |
|---|---|---|---|---|---|
| `skl_js_fundamentals` | **ثقيل** | — | **ثقيل** | **2** | **`Verified`** ✅ |
| `skl_api_integration_states` | **ثقيل** | — | **متوسط** | **2** | **`Verified`** ✅ |
| `skl_frontend_debugging` | — | **ثقيل** | **متوسط** | **2** | **`Verified`** ✅ |
| `skl_semantic_html` | خفيف | **ثقيل** | — | **1** | **`Demonstrated`** ⛔ |
| `skl_css_layout_responsive` | خفيف | **ثقيل** | — | **1** | **`Demonstrated`** ⛔ |

## 5.5 قرار السقف: `semantic_html` و`css` تبقيان `Demonstrated` في P1 *(v0.2.0)*

> **القرار:** **لا رفع أوزان شكليًا.** بندا هاتين المهارتين في `act_fe_001` بوزن 10% لكل منهما، ولا يقيسان المهارة بعمق كافٍ لتكوين **دليل ثانٍ مستقل**.
> **لذلك سقفهما في P1 = `Demonstrated`** — ولا تُمنحان `Verified` (قاعدة الدليلين V8 غير مستوفاة فعليًا).

### لماذا بقيتا `Demonstrated`
| السبب | التفصيل |
|---|---|
| **البند في `act_fe_001` تابع لا أصيل** | يقيس «ألا تكون البنية خاطئة» لا «أن يُحسن المستخدم البنية بوعي» — وهذا `Practiced` في جوهره |
| **العمق الحقيقي في `act_fe_002` وحده** | هناك يُطلب **تحسينان دلاليان بتعليل** و**إصلاح تجاوب جذري** — وهذا دليل واحد قوي لا اثنان |
| **رفع الوزن لا يخلق عمقًا** | الوزن يغيّر حساب الدرجة، **ولا يغيّر ما طُلب من المستخدم فعلًا** — والادعاء يجب أن يعكس ما فُعل لا ما وُزن |
| **الاتساق مع INV-9** | مستوى المهارة يُشتق من قياس فعلي لا من هندسة أوزان |

### النشاط المستقبلي المطلوب لبلوغ `Verified`
| العنصر | المطلوب |
|---|---|
| **نوع النشاط** | نشاط **مخصّص للبنية والتجاوب** لا تابع — مثال: «إعادة بناء صفحة قائمة بدلالة سليمة وتجاوب من تصميم واحد، مع نقد مكتوب لبنية النسخة القديمة» |
| **العمق المطلوب** | ≥ 3 بنود مخصّصة لكل مهارة · تعليل بنيوي إلزامي · محتوى متغير الطول يختبر صلابة التخطيط |
| **الزمن المتوقع** | 70–90 دقيقة |
| **مؤشر النزاهة** | نقد بنية قائمة + سؤال دفاع عن اختيار عنصر على آخر — **يكشف من يكتب دلالة بلا فهمها** |
| **المرحلة** | **مُرشَّح كنشاط رابع للمسار** — خارج نطاق P1 الحالي (3 أنشطة) · يُسجَّل كبند مفتوح |

**ما يُعرض للمستخدم:** «أثبتت هذه المهارة بمستوى `Demonstrated`. للوصول إلى التوثيق الكامل نحتاج نشاطًا مخصّصًا لها — غير متاح في هذه المرحلة.» *(إفصاح صريح لا صمت.)*


---

# 6. RUBRICS

> **مستويات موحّدة:** `L0` غائب أو خاطئ · `L1` جزئي · `L2` **عتبة الإثبات** · `L3` متميّز.
> **العتبة الافتراضية للمهارة = `L2`.** الأوزان مئوية داخل كل رُبريك.
> **بند بلا `linked_skill` لا يُنتج دليلًا** (بوابة G-7). كل بند يُحدَّد مصدره: `core` من المكتبة العامة · `track` خاص بالمسار · `activity` خاص بالنشاط.

## 6.1 `rub_fe_001` — بناء واجهة مرتبطة بـAPI

```
rubric_id: rub_fe_001 · rubric_version: 0.1.0 · activity_id: act_fe_001
scoring_policy_version: 0.1.0 · status: draft · sme_approval: null
calibration: { golden_set_size: TO BE BUILT, includes_raw_ai_submission: true (إلزامي), agreement_rate: NOT MEASURED }
```

| # | `criterion_id` | الاسم | `linked_skill` | الوزن | المصدر | حتمي؟ |
|---|---|---|---|---|---|---|
| 1 | `track.frontend.api_consumption` | صحة استهلاك الـAPI وتحويل البيانات | `skl_api_integration_states` | **20%** | track | جزئيًا |
| 2 | `track.frontend.ui_state_coverage` | تغطية حالات البيانات الأربع | `skl_api_integration_states` | **20%** | track | **نعم** |
| 3 | `track.frontend.data_edge_handling` | التعامل مع الحقول الناقصة والقيم الشاذة | `skl_js_fundamentals` | **15%** | track | جزئيًا |
| 4 | `core.judgment.assumption_check` | اكتشاف المتطلب الناقص والتعامل معه | `skl_requirement_clarification` | **15%** | core | لا |
| 5 | `track.frontend.layout_robustness` | صلابة التخطيط والتجاوب | `skl_css_layout_responsive` | **10%** | track | جزئيًا |
| 6 | `track.frontend.semantic_structure` | سلامة البنية الدلالية | `skl_semantic_html` | **10%** | track | جزئيًا |
| 7 | `core.integrity.ai_verification` | التحقق من مخرجات AI وشرح ما سُلّم | `skl_ai_output_verification` | **10%** | core | لا |

### الواصفات

**1 · `track.frontend.api_consumption`** — الوزن 20%
| المستوى | الواصف | الدليل المتوقع |
|---|---|---|
| L0 | بيانات ثابتة أو استدعاء لا يعمل | لا مقتطف |
| L1 | يعرض بيانات لكن التحويل خاطئ أو ناقص حقولًا مطلوبة | مقتطف الاستدعاء + الفرق عن العقد |
| **L2** | **يستدعي ويعرض كل الحقول المطلوبة بتحويل صحيح ومطابق لشكل الاستجابة الفعلي** | مقتطف كود التحويل + لقطة نتيجة |
| L3 | يفصل منطق الجلب عن العرض بحيث يسهل تغيير المصدر · ويذكر سببه | مقتطف البنية + الملخص |

**2 · `track.frontend.ui_state_coverage`** — الوزن 20% · **`is_blocking: true`**
| المستوى | الواصف | فحص حتمي |
|---|---|---|
| L0 | حالة النجاح فقط | `dc_001_2` يرسب |
| L1 | حالتان أو ثلاث · أو خلط الفراغ بالخطأ | — |
| **L2** | **الحالات الأربع منفَّذة وقابلة للمشاهدة، والفراغ مميَّز عن الخطأ، والرسائل موجّهة للمستخدم لا تقنية** | `dc_001_2` + `dc_001_3` يمرّان |
| L3 | يضيف سلوكًا مفيدًا (إعادة محاولة · حفظ سياق) مع تعليل يناسب لوحة إدارة داخلية | — |

**3 · `track.frontend.data_edge_handling`** — الوزن 15%
| المستوى | الواصف |
|---|---|
| L0 | انهيار أو ظهور `undefined`/`NaN`/صور معطوبة |
| L1 | يعالج بعض الحالات ويفوّت أخرى · أو يعالجها بإخفاء العنصر بلا تعليل |
| **L2** | **يعالج الحقول الناقصة بقيمة بديلة مفهومة، ويذكر أنه لاحظها** *(`ic_001_2`)* |
| L3 | يميّز «حقل ناقص» عن «قيمة صفرية مشروعة» ويعالج كلًا بما يناسبه |

**4 · `core.judgment.assumption_check`** — الوزن 15% · **`is_blocking: true`**
| المستوى | الواصف |
|---|---|
| L0 | نفّذ افتراضًا صامتًا ولم يذكره |
| L1 | ذكر افتراضًا بصيغة عامة بلا ربط بالسياق |
| **L2** | **سأل المدير سؤالًا محددًا، أو وثّق افتراضًا صريحًا مع سببه** *(`ic_001_1`)* |
| L3 | سأل سؤالًا واحدًا دقيقًا **ومضى بافتراض مؤقت معلَن** حتى الإجابة — سلوك مهني ناضج |

**5 · `track.frontend.layout_robustness`** — الوزن 10%
| L0 | تلف تخطيط أو تمرير أفقي على مقاس مطلوب |
| L1 | يعمل على مقاس واحد · أو استثناءات متعددة لكل مقاس |
| **L2** | **يعمل على المقاسين ويستوعب العنوان الطويل** *(`ic_001_3`)* |
| L3 | مقاربة مرنة واحدة بلا استثناءات، مع تعليل اختيار Grid/Flex |

**6 · `track.frontend.semantic_structure`** — الوزن 10%
| L0 | div لكل شيء · عناصر تفاعلية غير قابلة للتشغيل بلوحة المفاتيح |
| L1 | بعض العناصر الدلالية بلا اتساق · تسلسل عناوين مضطرب |
| **L2** | **عناصر دلالية مناسبة · تسلسل عناوين سليم · نصوص بديلة ذات معنى** |
| L3 | يشرح سببًا بنيويًا لاختيار عنصر على آخر |

**7 · `core.integrity.ai_verification`** — الوزن 10% · **`is_blocking: true`**
| L0 | إقرار غائب · أو تسليم لا يستطيع شرحه |
| L1 | أقرّ بالاستخدام بلا وصف ما تحقّق منه |
| **L2** | **أقرّ بدقة، ووصف ما فحصه وما عدّله، وأجاب عن سؤال التبرير بربط سياقي** *(`ic_001_4`)* |
| L3 | يسمّي خطأً محددًا في مخرَج الأداة وسبب عدم ملاءمته لهذا السياق |

---

## 6.2 `rub_fe_002` — تشخيص وتجاوب ودلالة

```
rubric_id: rub_fe_002 · rubric_version: 0.1.0 · activity_id: act_fe_002 · status: draft · sme_approval: null
```

| # | `criterion_id` | الاسم | `linked_skill` | الوزن | المصدر |
|---|---|---|---|---|---|
| 1 | `track.frontend.reproduction_discipline` | إعادة الإنتاج قبل الإصلاح | `skl_frontend_debugging` | **15%** | track |
| 2 | `track.frontend.root_cause_isolation` | عزل السبب الجذري | `skl_frontend_debugging` | **25%** | track |
| 3 | `track.frontend.symptom_vs_cause` | رفض إخفاء العَرَض | `skl_css_layout_responsive` | **15%** | track |
| 4 | `core.integrity.error_detection` | فحص الأثر الجانبي (الانحدار) | `skl_frontend_debugging` | **15%** | core |
| 5 | `track.frontend.responsive_fix_quality` | جودة إصلاح التجاوب | `skl_css_layout_responsive` | **10%** | track |
| 6 | `track.frontend.semantic_improvement_quality` | جودة التحسين الدلالي وتعليله | `skl_semantic_html` | **10%** | track |
| 7 | `core.communication.clarity` | وضوح تقرير الإصلاح | `skl_technical_communication` | **10%** | core |

### الواصفات (البنود الحاسمة)

**2 · `track.frontend.root_cause_isolation`** — 25% · **`is_blocking: true`**
| L0 | غيّر أشياء متعددة حتى «صارت تعمل» بلا تحديد سبب |
| L1 | حدّد سببًا لأحد العَرَضين · أو أصلح كل عَرَض منفصلًا |
| **L2** | **حدّد السبب الجذري الواحد وربط العَرَضين به** *(`ic_002_1`)* وأصلحه في موضعه |
| L3 | يشرح خطوات التضييق التي أوصلته، ويذكر فرضية استبعدها وسبب استبعادها |

**3 · `track.frontend.symptom_vs_cause`** — 15% · **`is_blocking: true`**
| L0 | استخدم `overflow:hidden` أو ما يشبهه لإخفاء العَرَض *(`dc_002_6`)* |
| L1 | أصلح جذريًا في موضع وأخفى في آخر |
| **L2** | **رفض الحل الظاهر وأصلح سبب التخطيط** *(`ic_002_2`)* |
| L3 | يسمّي الحل السريع الذي رفضه ويشرح ضرره على المدى المتوسط |

**4 · `core.integrity.error_detection`** — 15%
| L0 | لم يفحص أثر تغييره · وقع انحدار |
| L1 | فحص المسار المُبلَّغ فقط |
| **L2** | **فحص المسارات الأخرى وذكر ما فحصه** *(`ic_002_3`)* |
| L3 | اكتشف أثرًا جانبيًا فعليًا وعالجه أو أبلغ عنه بوضوح |

**1 · `reproduction_discipline`** · **5 · `responsive_fix_quality`** · **6 · `semantic_improvement_quality`** · **7 · `communication.clarity`**
> بنفس هيكل المستويات الأربعة — `L2` = القيام بالمطلوب بشكل سليم وموثّق · `L3` = إضافة تعليل أو عمق يتجاوز المطلوب.
> ⚠️ **الواصفات النصية الكاملة لهذه الأربعة تحتاج صياغة SME** — كُتبت هنا كإطار لا كنص نهائي.

---

## 6.3 `rub_fe_003` — طلب تغيير وانحدار *(مُحدَّث في v0.2.0)*

```
rubric_id: rub_fe_003 · rubric_version: 0.2.0 · activity_id: act_fe_003 · status: draft · sme_approval: null
```

**ما تغيّر:** حُذف بند `state_persistence_quality` (10%) مع حذف متطلبه · أُضيف `post_filter_empty_state` للحفاظ على قياس `api_integration_states` · دُمج `core.ambiguity.handling` داخل `defect_triage_decision` · أُعيد توزيع الأوزان.

| # | `criterion_id` | الاسم | `linked_skill` | الوزن | المصدر |
|---|---|---|---|---|---|
| 1 | `track.frontend.code_comprehension` | فهم الكود القائم وتحديد موضع التغيير | `skl_code_reading` | **15%** | track |
| 2 | `track.frontend.change_impact_analysis` | تحليل أثر التغيير وإيجاد المواضع المتأثرة | `skl_js_fundamentals` | **25%** | track |
| 3 | `core.integrity.error_detection` | منع الانحدار والتحقق من السلوك الأصلي | `skl_js_fundamentals` | **20%** | core |
| 4 | `core.judgment.assumption_check` | التعامل مع التعارض والمتطلب الناقص | `skl_requirement_clarification` | **15%** | core |
| 5 | `track.frontend.defect_triage_decision` | التعامل مع العطل القائم والتدخّل أثناء العمل | `skl_frontend_debugging` | **15%** | track |
| 6 | `track.frontend.post_filter_empty_state` | حالة «لا نتائج» بعد التصفية | `skl_api_integration_states` | **10%** | track |

### الواصفات

**1 · `track.frontend.code_comprehension`** — 15%
| L0 | عدّل بلا فهم · أضاف مسارًا موازيًا بدل التعديل في موضعه |
| L1 | وجد موضع التغيير الظاهر ولم يتبع مسار البيانات |
| **L2** | **حدّد موضع التغيير الصحيح والتزم بأسلوب الملف القائم** |
| L3 | يشرح كيف تتبّع مسار البيانات ليصل إلى الموضع، ويذكر ما استبعده |

**2 · `track.frontend.change_impact_analysis`** — 25% · **`is_blocking: true`**
| L0 | عدّل الموضع الظاهر فقط · وقع انحدار صامت |
| L1 | وجد موضعين من ثلاثة |
| **L2** | **وجد المواضع الثلاثة، أو ذكر احتمال وجود غيرها وفحص فعلًا** *(`ic_003_1`)* |
| L3 | يشرح منهج البحث (تتبّع مسار البيانات لا بحث نصي أعمى) |

**3 · `core.integrity.error_detection`** — 20% · **`is_blocking: true`**
| L0 | لا دليل على فحص السلوك الأصلي |
| L1 | ذكر أنه فحص بلا دليل |
| **L2** | **دليل أن السلوك الأصلي (اختيار واحد) يعمل بعد التغيير** *(`dc_003_3`)* |
| L3 | سمّى ما كان يمكن أن يُكسَر ولماذا لم يُكسَر *(`ic_003_5`)* |

**4 · `core.judgment.assumption_check`** — 15% · **`is_blocking: true`**
| L0 | نفّذ افتراضًا صامتًا في موضع التعارض |
| L1 | ذكر التعارض بلا قرار واضح |
| **L2** | **اكتشف التعارض وسأل أو وثّق قرارًا معلَّلًا** *(`ic_003_2`)* |
| L3 | طرح خيارين بأثر كلٍّ منهما وأوصى بأحدهما |

**5 · `track.frontend.defect_triage_decision`** — 15%
| L0 | تجاهل رسالة المدير · أو «أصلحته» بلا فهم شرط ظهوره |
| L1 | استجاب بلا قرار معلَن عن الأولوية |
| **L2** | **قرار معلَن ومعلَّل: أصلحه الآن (مع شرح شرط ظهوره) أو أجّله (مع خطوات إنتاجه)** *(`ic_003_3` · `ic_003_4`)* |
| L3 | أعاد ترتيب أولوياته وأبلغ بأثر ذلك على التسليم |
> **ملاحظة:** هذا البند يستوعب `core.ambiguity.handling` — دُمج عمدًا لتقليل عدد البنود بلا فقد قياس.

**6 · `track.frontend.post_filter_empty_state`** — 10%
| L0 | لا معالجة — شاشة فارغة بلا رسالة |
| L1 | رسالة عامة لا تفرّق «لا نتائج للفلاتر» عن «خطأ» |
| **L2** | **حالة «لا نتائج» معالَجة برسالة مناسبة للسياق** *(`dc_003_4`)* |
| L3 | يقترح إجراءً مفيدًا (مسح الفلاتر) بتعليل |

## 6.4 `scoring_policy@0.1.0` — مقترح للمعايرة
| القاعدة | القيمة المقترحة |
|---|---|
| عتبة إثبات المهارة | **`L2`** في بنود المهارة المرتبطة بها |
| بند حاسم برسوب (`L0`) | **يمنع الترقية** مهما كان المجموع |
| عتبة المهارة الأساسية من نشاط | **كل** بنود المهارة الأساسية في النشاط ≥ `L2` |
| عتبة المهارة المساندة | **متوسط** بنودها ≥ `L2` |
| فحص حتمي إلزامي فاشل | **يوقف الخط** قبل التقييم |
| فحص نزاهة حاسم غير مكتشَف | **سقف `Practiced`** |
| المجموع الكلي | **يُحتسب للعرض فقط — ولا يُشتق منه مستوى مهارة** (INV-9) |

> ⚠️ **كل هذه القيم فرضيات.** تُضبط من المجموعة الذهبية في Phase 0، ولا تُعتمد قبلها.

---

# 7. INTEGRITY CHECKS — تصنيف وملخص *(مُحدَّث في v0.2.0)*

> **الغاية: قياس الفهم والاستقلالية — لا اصطياد المستخدم.**
> **قرار v0.2.0: لم يُحذف أي فحص. صُنِّفت الثلاثة عشر إلى نوعين بحسب ما يراه المستخدم.**

## 7.1 التصنيف

### أ. `user_facing` — يتفاعل معها المستخدم فعليًا *(6 فحوص)*
**تظهر كأحداث عمل طبيعية، لا كاختبارات.**

| الفحص | النشاط | كيف تبدو للمستخدم |
|---|---|---|
| `ic_001_1` معلومة ناقصة (سلوك الفراغ) | 001 | **وصف API ناقص** — كما يحدث في كل عمل حقيقي |
| `ic_001_4` سؤال دفاع سياقي | 001 | **سؤال من المدير بعد التسليم** عن قرار اتخذه |
| `ic_002_4` سؤال دفاع سياقي | 002 | سؤال عن كيف تأكد أنه أصلح السبب |
| `ic_003_2` معلومة ناقصة (خيار غير متاح) | 003 | **طلب تغيير ناقص** — واقع يومي |
| `ic_003_3` تدخّل أثناء العمل | 003 | **رسالة من المدير** عن عطل قائم |
| `ic_003_5` سؤال دفاع سياقي | 003 | سؤال عن أثر تغييره |

### ب. `assessment_only` — تُفحَص خلف الكواليس *(7 فحوص)*
**لا تُعلَن ولا تُشار إليها ولا يُسأل عنها المستخدم مباشرة.**

| الفحص | النشاط | ما يُفحَص صامتًا |
|---|---|---|
| `ic_001_2` تناقض بيانات (حقول ناقصة) | 001 | هل عالج `imageUrl=null` و`price` المفقود |
| `ic_001_3` قيمة شاذة (عنوان طويل) | 001 | هل صمد التخطيط |
| `ic_002_1` تناقض مزروع (سبب واحد بعَرَضين) | 002 | هل ربطهما بسبب واحد |
| `ic_002_2` افتراض خفي (الحل السريع الضار) | 002 | هل استخدم `overflow:hidden` |
| `ic_002_3` حالة حدّية (أثر على الفراغ) | 002 | هل فحص الأثر الجانبي |
| `ic_003_1` تناقض مزروع (ثلاثة مواضع) | 003 | كم موضعًا وجد |
| `ic_003_4` حالة حدّية (شرط ظهور العطل) | 003 | هل فهم شرط الظهور |

## 7.2 قواعد التجربة — **حتى لا يشعر المستخدم أنه تحت تحقيق**
| القاعدة | التفصيل |
|---|---|
| **سقف التدخّلات** | **سؤال دفاع واحد** لكل نشاط · **تدخّل واحد** أثناء العمل كأقصى حد |
| **لا إشعار بفحص** | لا رسالة «تم اكتشاف أنك لم تلاحظ…» أبدًا |
| **الفحوص الصامتة تظهر كبنود رُبريك بعد التقييم** | فيعرف **على أي أساس قِيس**، بلا لغة اتهام |
| **المعلومة الناقصة لها مسارَان مقبولان** | **يسأل** أو **يوثّق افتراضًا** — كلاهما يبلغ `L2` |
| **الإفصاح المسبق عام لا تفصيلي** | «الأنشطة تحوي عناصر تحقق مُصمَّمة» بلا كشف أيٍّ منها |
| **لا فحص يقرر نتيجة وحده** | الحد الأدنى إشارتان مستقلتان (سياسة AI §4) |
| **لغة غير عقابية في كل الحالات** | «لم نستطع توثيق…» لا «فشلت في…» |

## 7.3 التوزيع
| النوع | العدد | حاسمة |
|---|---|---|
| `user_facing` | **6** | 5 |
| `assessment_only` | **7** | 3 |
| **المجموع** | **13** | **8** |

| النشاط | user_facing | assessment_only | المجموع |
|---|---|---|---|
| `act_fe_001` | 2 | 2 | 4 |
| `act_fe_002` | 1 | 3 | 4 |
| `act_fe_003` | 3 | 2 | 5 |

> ⚠️ **ملاحظة تحتاج قرارك:** `act_fe_003` فيه **ثلاثة تدخّلات user-facing** (متطلب ناقص + رسالة مدير + سؤال دفاع). هذا **على حدّ السقف**، وقد يبدو كثيرًا في نشاط 100 دقيقة. **أرجّح إبقاءها** لأن كل واحد منها حدث عمل طبيعي مختلف، **لكن T-04 في خطة الاختبار سيقيس إن شعر المستخدم بالضغط.**


---

# 8. AI USAGE

| النشاط | النمط | المبرر |
|---|---|---|
| `act_fe_001` | **`ai_assisted`** | كتابة الواجهة والاستدعاء عالية الاستبدال؛ **القرار عند الفراغ والحقول الناقصة ليس كذلك** |
| `act_fe_002` | **`ai_assisted`** | النموذج يقترح أسبابًا محتملة؛ **العزل والتحقق وعدم إخفاء العَرَض عمل بشري** |
| `act_fe_003` | **`ai_assisted`** | النموذج لا يعرف الافتراضات المضمَرة في كود لم يره كاملًا؛ **تحليل أثر التغيير منخفض الاستبدال** |

### ما نقيّمه فعلًا *(لا كتابة الكود يدويًا)*
| البُعد | البند/الفحص الذي يقيسه |
|---|---|
| **Judgment** | `core.judgment.assumption_check` · `core.judgment.decision_under_uncertainty` |
| **Debugging** | `track.frontend.root_cause_isolation` · `track.frontend.reproduction_discipline` |
| **Verification** | `core.integrity.error_detection` · فحوص الانحدار الحتمية |
| **Explanation** | `core.communication.clarity` · أسئلة الدفاع السياقية الثلاثة |
| **Modification ability** | `track.frontend.change_impact_analysis` · `track.frontend.code_comprehension` |

### `ai_substitutability` — **تصنيف تصميمي لا مقياس** *(مثبَّت في v0.2.0)*
| القاعدة | التفصيل |
|---|---|
| القيم المسموحة | **`low` · `medium` · `high` فقط** |
| ما هو | **مُصنِّف تصميمي** يساعد في تحديد **أسلوب القياس**: كلما ارتفع، ثقلت بنود الحكم وخفّت بنود الإنتاج |
| ما ليس | **ليس رقمًا ولا نسبة ولا metric علمية** · **يُمنع تحويله إلى درجة** أو إدخاله في أي حساب |
| من يحدده | **SME** — وهو أحد بنود مراجعته (S-11) |

### قواعد معلَنة للمستخدم
1. **الإفصاح لا يخفض الدرجة.**
2. ما يُقاس: **الحكم والتحقق والاختيار والتبرير واكتشاف الخطأ والقرار**.
3. **تسليم لا تستطيع شرحه لا يُوثَّق كدليل** — ولو كان صحيحًا تقنيًا.
4. أثر استخدام AI: **يغيّر محتوى الادعاء لا حجم الدرجة** — «أثبت الحكم والتحقق (بمساعدة أدوات في التنفيذ)».

---

# 9. LEARNING_RESOURCES

> ⚠️ **لم أتحقق من أي رابط في هذه الجلسة.** كل مورد يحمل `url: SOURCE TO VERIFY`، والأسماء أدناه لمصادر معروفة **يجب التحقق من وجودها ومحتواها وحداثتها قبل أي استخدام**.
> **`quality_status: unverified` لكل المداخل.** و`practice_activity_ref` **إلزامي** لكل مورد (عقد A07).

## 9.1 `skl_semantic_html`
| # | العنوان | المزوّد | النوع | لغة | مستوى | مجاني؟ | مدة تقديرية | لماذا أُرشِّحه | `practice_activity_ref` |
|---|---|---|---|---|---|---|---|---|---|
| 1 | مرجع عناصر HTML ودلالتها | **MDN Web Docs** | `documentation` | en | beginner | free | 60–90 د | المرجع المعياري · يُستخدم مراجعةً عند القرار لا قراءةً متصلة | `act_fe_002` |
| 2 | دليل بنية المستند والعناوين | **web.dev (Google)** | `article` | en | beginner | free | 30–45 د | يربط الدلالة بالوصول والأثر العملي | `act_fe_002` |
| 3 | تمارين بنية HTML | **freeCodeCamp** | `exercise` | en | beginner | free | 2–3 س | تطبيق متدرّج بتغذية راجعة فورية | `act_fe_002` |
```
url: SOURCE TO VERIFY   (لكل الثلاثة) · quality_status: unverified · last_checked: null
```

## 9.2 `skl_css_layout_responsive`
| # | العنوان | المزوّد | النوع | لغة | مجاني؟ | مدة | لماذا | تطبيق |
|---|---|---|---|---|---|---|---|---|
| 1 | دليل Flexbox وGrid | **MDN Web Docs** | `documentation` | en | free | 2–3 س | المرجع الأدق للتخطيط الحديث | `act_fe_002` |
| 2 | أساسيات التصميم المتجاوب | **web.dev (Google)** | `tutorial` | en | free | 1–2 س | مقاربة مرنة بدل استثناءات لكل مقاس | `act_fe_001` |
| 3 | تحديات تخطيط عملية | **Frontend Mentor** | `project` | en | freemium | 3–5 س | تطبيق على تصاميم حقيقية — **أقرب مورد لواقع الوظيفة** | `act_fe_001` |
```
url: SOURCE TO VERIFY · quality_status: unverified
```

## 9.3 `skl_js_fundamentals`
| # | العنوان | المزوّد | النوع | لغة | مجاني؟ | مدة | لماذا | تطبيق |
|---|---|---|---|---|---|---|---|---|
| 1 | أساسيات JavaScript | **javascript.info** | `tutorial` | en | free | 8–12 س | تدرّج منظّم يغطي الأنواع والدوال وغير المتزامن | `act_fe_001` |
| 2 | مرجع JavaScript | **MDN Web Docs** | `documentation` | en | free | مرجعي | للرجوع عند الحاجة لا للقراءة المتصلة | `act_fe_003` |
| 3 | تمارين تحويل بيانات (مصفوفات وكائنات) | **provider: TBD** | `exercise` | en | free | 2–4 س | **الفجوة الأكثر تكرارًا:** تحويل استجابة API إلى ما تحتاجه الواجهة | `act_fe_001` |
```
url: SOURCE TO VERIFY · quality_status: unverified
⚠️ المورد الثالث: لم أحدد مزوّدًا بعينه — يحتاج بحثًا وتحققًا من SME.
```

## 9.4 `skl_api_integration_states`
| # | العنوان | المزوّد | النوع | لغة | مجاني؟ | مدة | لماذا | تطبيق |
|---|---|---|---|---|---|---|---|---|
| 1 | استخدام Fetch API | **MDN Web Docs** | `documentation` | en | free | 45–60 د | الأساس التقني للاستدعاء والتعامل مع الاستجابة | `act_fe_001` |
| 2 | أنماط حالات التحميل والخطأ والفراغ | **provider: TBD** | `article` | en | free | 30–45 د | **أهم فجوة في هذا المسار** — لا مصدر محدد بعد | `act_fe_001` |
| 3 | مشروع تطبيقي يستهلك API عامًا | **provider: TBD** | `project` | en | free | 4–6 س | تطبيق كامل الحلقة | `act_fe_001` |
```
⚠️ موردان من ثلاثة بلا مصدر محدد. هذه **أهم فجوة موارد في الحزمة** لأنها أهم مهارة تمييزية.
```

## 9.5 `skl_frontend_debugging`
| # | العنوان | المزوّد | النوع | لغة | مجاني؟ | مدة | لماذا | تطبيق |
|---|---|---|---|---|---|---|---|---|
| 1 | توثيق Chrome DevTools | **Google Chrome DevTools Docs** | `documentation` | en | free | 1–2 س | Console · Network · Elements بقصد لا بعشوائية | `act_fe_002` |
| 2 | تصحيح JavaScript في المتصفح | **MDN Web Docs** | `tutorial` | en | free | 45–60 د | نقاط التوقف وقراءة مسار التنفيذ | `act_fe_002` |
| 3 | منهج عزل المشكلة | **provider: TBD** | `article` | en | free | 30 د | **المنهج أهم من الأداة** — لا مصدر محدد بعد | `act_fe_002` |

## 9.6 موارد المهارات المساندة *(حد أدنى)*
| المهارة | المورد المقترح | النوع | ملاحظة |
|---|---|---|---|
| `skl_a11y_basics` | **W3C WAI** — مقدمة إمكانية الوصول | `documentation` | مرجع معياري · `SOURCE TO VERIFY` |
| `skl_component_patterns` | التوثيق الرسمي لـ**React** (أو الإطار المختار) | `documentation` | **لا تربط الحزمة بإطار واحد** — يُحدَّد حسب اختيار المستخدم |
| `skl_git_basics` | **provider: TBD** | `tutorial` | ⚠️ **خارج نطاق P1** — لا يُرشَّح مورده حتى يوجد نشاط |
| `skl_code_reading` | **provider: TBD** | — | ⚠️ **لا أعرف موردًا جيدًا لهذه المهارة** — فجوة حقيقية · التعلّم الأفضل بالممارسة عبر `act_fe_003` |

**إجمالي الموارد:** 18 مدخلًا · **`unverified` بالكامل** · **6 منها `provider: TBD`**.

### قواعد v0.2.0 لموارد التعلّم
| القاعدة | التفصيل |
|---|---|
| **لا توسيع للعدد الآن** | 18 مدخلًا تكفي · الإضافة تنتظر جلسة بحث منفصلة |
| **لا مورد غير متحقق منه يُضاف** | — |
| **لا رابط مُختلَق** | كل مدخل: `url: SOURCE TO VERIFY` · `quality_status: unverified` · `last_checked: null` |
| `provider: TBD` مقبول | إلى أن تُجرى جلسة البحث والتحقق |
| **لا مورد يُرشَّح للمستخدم قبل `quality_status: approved`** | قيد بنيوي لا سياسة |

---

# 10. SOURCES

| `source_id` | الاسم | `type` | jurisdiction | lang | ماذا يدعم | `review_status` |
|---|---|---|---|---|---|---|
| `src_mdn` | MDN Web Docs | `official` | global | en | HTML · CSS · JS · Fetch · DevTools | **unverified** |
| `src_whatwg_html` | WHATWG HTML Standard | `official` | global | en | دلالة العناصر ومعيار البنية | **unverified** |
| `src_webdev_google` | web.dev (Google) | `official` | global | en | التجاوب · البنية · الوصول العملي | **unverified** |
| `src_w3c_wai` | W3C Web Accessibility Initiative | `official` | global | en | أساسيات إمكانية الوصول | **unverified** |
| `src_chrome_devtools` | Chrome DevTools Documentation | `official` | global | en | منهج التشخيص والأدوات | **unverified** |
| `src_pack_curated` | هذه الحزمة (محتوى المنصة) | `curated` | sa | ar/en | الأدوار · المهام · الأنشطة · الرُبريكات · فحوص النزاهة | **draft** |
| `src_sme_frontend_pending` | خبير مجال Frontend | `curated` | sa | ar | **لم يُعيَّن بعد** — واقعية المهام وأنماط الفشل والعتبات | **not_started** |
| `src_market_frontend_sa` | إشارات سوق الواجهات — السعودية | `market_signal` | sa | ar/en | الطلب على الأطر والأدوات | **not_collected** |
| `src_platform_frontend` | أداء المستخدمين على المنصة | `platform_generated` | — | — | معايرة صعوبة الأنشطة والعتبات | **no_data_yet** |

### تصنيف كل معلومة في الحزمة
| المحتوى | `source_type` | ملاحظة |
|---|---|---|
| مواصفات HTML/CSS/JS ودلالة العناصر | `official` | يُستند إلى المعايير — **بعد التحقق** |
| وصف الدور والمسؤوليات وما لا يُتوقَّع | `curated` | **حكم مهني يحتاج اعتماد SME** |
| المهام وأنماط الفشل | `curated` | **أضعف ما في الحزمة الآن** — أُلِّف بلا خبير مجال |
| الأنشطة وفحوص النزاهة والرُبريكات | `curated` | تصميم تقييمي · يحتاج SME ومعايرة |
| أوزان البنود والعتبات | `curated` | **فرضيات** |
| نوافذ الحداثة | `curated` | **فرضيات** |
| الطلب على React | ⚠️ **لا مصدر** | **فرضية غير مثبتة** — انظر §11 |

> **لم أخترع مصدرًا واحدًا، ولم أكتب رابطًا واحدًا.**

---

# 11. MARKET_SIGNALS — **فارغ عمدًا**

```json
{ "signals": [], "status": "not_collected", "reason": "لم تُجمَع أي بيانات سوق في هذه الجلسة" }
```

### فرضية مسجّلة لا إشارة
> **الفرضية:** إعلانات وظائف Junior Frontend في السوق السعودي تطلب React بنسبة مرتفعة، وقد تطلب TypeScript.
> **الحالة:** **فرضية غير مثبتة — لا حجم عيّنة ولا مصدر ولا فترة.** مُسجَّلة هنا كي لا تتحول بالتكرار إلى «معلومة».
> **لو ثبتت:** فأثرها **اقتراح** رفع `skl_component_patterns` إلى `core`، ويمر بدورة المراجعة كاملة — **ولا يعدّل `ROLE_SKILL_MAP` آليًا** (DF-4).
> **ما يلزم لتحويلها إلى إشارة:** عيّنة إعلانات محددة الفترة والمصدر والحجم، ومنهجية قراءة مكتوبة، ونسبة قابلة للتكرار.

---

# 12. CAREER_PRESENTATION_RULES

> **القاعدة الحاكمة: لا Career Asset بلا Evidence مناسب. ولا رقم أثر غير موجود في التسليم.**

## 12.1 الحد الأدنى لكل أصل
| الأصل | أدنى مستوى | أدنى قوة مصدر | صياغة مسموحة |
|---|---|---|---|
| `cv_bullet` | `Demonstrated` | أي مصدر **بصياغة تعكسه** | `Practiced` → «عمل على» فقط |
| `linkedin_skill` | `Demonstrated` | `platform_*` | **لا مهارة من تقييم ذاتي** |
| `linkedin_project` | `Practiced` | أي مصدر | بوسم إن كان `self_reported` |
| `case_study` | `Demonstrated` | `platform_*` | **يُفصح أن العمل في بيئة محاكاة** |
| `professional_profile` | `Verified` لعرض وسم التوثيق | `platform_*` | P4 |

## 12.2 أمثلة صياغة — **بلا أرقام مُختلَقة**

### من `act_fe_001` (ربط API ومعالجة الحالات)
| المستوى | `cv_bullet` مسموح | ممنوع |
|---|---|---|
| `Practiced` | «عمل على بناء شاشة قائمة تستهلك واجهة برمجية وتعرض بياناتها.» | — |
| `Demonstrated` | «بنى شاشة قائمة مرتبطة بواجهة برمجية، وعالج حالات التحميل والخطأ والفراغ والبيانات الناقصة.» | ❌ «حسّن تجربة المستخدم بنسبة 30%» · ❌ «قلّل زمن التحميل» — **لا أساس في التسليم** |
| `Verified` | نفس العبارة **+ وسم التوثيق** ورابط الدليل | ❌ «خبير في تكامل الواجهات» — **لقب عام ممنوع** |

`linkedin_skill` المسموح: **`API Integration`** · **`JavaScript`** — بشرط بلوغ عتبة بنديهما.
`linkedin_project`: «Product list screen with full data-state handling» + رابط الـCase Study.

### من `act_fe_002` (تشخيص وتجاوب ودلالة)
| المستوى | `cv_bullet` مسموح | ممنوع |
|---|---|---|
| `Demonstrated` | «شخّص عطلين مُبلَّغين في صفحة قائمة، وحدّد سببهما الجذري المشترك، وأصلحه بلا أثر جانبي، وحسّن البنية الدلالية للصفحة.» | ❌ «أصلح 15 عطلًا» · ❌ «حسّن إمكانية الوصول إلى AA» — **لم يُقَس** |

`linkedin_skill`: **`Debugging`** · **`Responsive Design`** · **`Semantic HTML`**.

### من `act_fe_003` (تغيير على قائم)
| المستوى | `cv_bullet` مسموح | ممنوع |
|---|---|---|
| `Demonstrated` | «نفّذ طلب تغيير على ميزة قائمة (تصفية متعددة الاختيار مع حفظ الحالة)، وحدّد المواضع المتأثرة، وتحقّق من استمرار السلوك الأصلي.» | ❌ «قاد تطوير ميزة» · ❌ «حسّن الأداء» |

`linkedin_skill`: **`Code Maintenance`** · **`JavaScript`**.

## 12.3 قواعد صياغة ملزمة
| القاعدة | التفصيل |
|---|---|
| البنية | `[فعل] + [مخرَج] + [سياق] + [أثر إن وُجد في التسليم فقط]` |
| أفعال مسموحة | `Practiced`: عمل على · شارك في — `Demonstrated`: بنى · نفّذ · شخّص · أصلح · حسّن — `Verified`: نفسها **+ وسم موثّق** |
| ألقاب ممنوعة | خبير · متقدم · محترف · متمكّن — **بلا استثناء** |
| الأرقام | **لا رقم أثر إلا إن وُجد في التسليم نفسه** |
| الإفصاح عن المحاكاة | كل Case Study تذكر أن العمل في **بيئة نشاط مُصمَّمة** لا مشروع إنتاج |
| إفصاح AI | حين كان الإنتاج بمساعدة أدوات: **يُوثَّق الحكم والتحقق لا الإنتاج اليدوي** |
| تعديل المستخدم | التعديل خارج الدليل **يُسقط وسم التوثيق** عن تلك العبارة |
| اللغة | مخرجات CV/LinkedIn **بالإنجليزية** · شرح المستخدم بالعربية |
| Case Study | السياق · المشكلة · القرارات · **ما لم يُنفَّذ ولماذا** · النتيجة · المهارات المُثبتة · رابط الدليل |

---

# 13. REVIEW CHECKLIST

## 13.1 يحتاج **SME** (خبير Frontend) — حاجب للنشر
| # | البند | لماذا |
|---|---|---|
| S-1 | **واقعية المهام الإحدى عشرة وتكرارها وتعقيدها** | كُتبت بلا خبير مجال — **أضعف ما في الحزمة** |
| S-2 | **`failure_modes` لكل مهمة** | **أخصب مصدر لفحوص النزاهة** — إن كانت خاطئة فالفحوص خاطئة |
| S-3 | **قائمة «ما لا يُتوقَّع من المبتدئ»** | تحديد سقف التوقعات قرار سوقي |
| S-4 | **المستويات المستهدفة (`target_level`)** لكل مهارة | حكم سوقي لا نص |
| S-5 | **قرار React: مساند أم أساسي** | قرار سوقي تقني — وله أثر مباشر على المحتوى |
| S-6 | **صلاحية الأنشطة الثلاثة كعمل واقعي** | هل يشبه هذا عمل يوم فعلي؟ |
| S-7 | **فحوص النزاهة الثلاثة عشر** | هل تقيس الفهم فعلًا أم تُربك بلا قياس؟ |
| S-8 | **واصفات الرُبريك — وخصوصًا السبعة المعلَّمة «تحتاج صياغة SME»** | الواصف الضعيف = تقييم انطباعي |
| S-9 | **الأوزان والعتبات و`scoring_policy`** | كلها فرضياتي |
| S-10 | **معايير `high_strength` لـ`act_fe_002`** | تؤهّل لمسار استثناء D-012a — **لا تُمنح بلا معايير مكتوبة** |
| S-11 | **`ai_substitutability` لكل مهارة** | يحدد ثقل بنود الحكم مقابل الإنتاج |
| S-12 | **ملاحظة التغطية `C-3`**: هل الوزن الخفيف كافٍ لدليل ثانٍ؟ | **أوصي بـلا** — والقرار قراره |

## 13.2 يمكنك مراجعته بنفسك *(بلا خبرة Frontend)*
| # | البند |
|---|---|
| P-1 | **اتساق البنية مع القالب** (وثيقة 23) — هل كل حقل مطلوب موجود؟ |
| P-2 | **بوابات الجودة الثمانية عشر** — أيها يمرّ الآن وأيها لا |
| P-3 | **وضوح لغة الأنشطة للمستخدم المبتدئ** — هل التعليمات مفهومة؟ |
| P-4 | **قواعد العرض المهني** — هل تمنع فعلًا الادعاء المتجاوز؟ (سؤال منتج لا تقني) |
| P-5 | **نبرة الرسائل والتقييم** — غير عقابية؟ متسقة مع D-015؟ |
| P-6 | **الالتزام بسياسة AI** — الإفصاح لا يخفض الدرجة · لا اصطياد |
| P-7 | **ملاحظة `C-2`**: `skl_git_basics` بلا نشاط — قرار منتج: نخرجه أم نضيف تسليمًا عبر مستودع؟ |
| P-8 | **حجم الحزمة مقابل خطة السبرنت** — الحزمة أثقل من «رقيقة» (§13.4) |
| P-9 | **اكتمال الحقول الثنائية اللغة** — نصوص كثيرة عربية فقط أو إنجليزية فقط |

## 13.3 يحتاج **اختبارًا فعليًا** (لا مراجعة مكتبية)
| # | الاختبار | الهدف | المقياس |
|---|---|---|---|
| T-1 | **تنفيذ `act_fe_001` بمخرَج نموذج خام** (بلا حكم بشري) | إثبات P5 | **يجب أن يرسب** — المستهدف ≥70% |
| T-2 | تنفيذ كل نشاط بمستخدم حقيقي مبتدئ | صلاحية الزمن والتعليمات | الزمن الفعلي ضمن المدى · بلا حجب |
| T-3 | تقييم مزدوج (بشري + رُبريك) لعشرة تسليمات | معايرة | **اتفاق ≥80% بندًا** |
| T-4 | هل تُكتشف فحوص النزاهة فعلًا؟ | صلاحية الفحوص | **فحص لا يكتشفه أحد = فحص خاطئ** · وفحص يكتشفه الجميع = بلا قيمة |
| T-5 | التحقق من الموارد الثمانية عشر | صلاحية الروابط والمحتوى | `quality_status → sme_reviewed` |
| T-6 | قياس `hours_per_activity` و`sme_review_time` | ميزانية وجدول واقعيان | أرقام فعلية |
| T-7 | **بناء المجموعة الذهبية** لكل رُبريك | شرط نشر | 12–20 تسليمًا متنوعًا **تشمل مخرَج AI خامًا** |

## 13.4 **ما لا نعرفه بعد** — بصراحة
| # | المجهول | الأثر |
|---|---|---|
| U-1 | **هل 90–110 دقيقة كافية لكل نشاط؟** | **أرجّح لا لـ`act_fe_003`** — قد يحتاج 130+، وهذا يصادم حد «60–120» |
| U-2 | **هل مخرَج AI الخام يرسب فعلًا في هذه الرُبريكات؟** | **أخطر مجهول** — إن نجح، فالحزمة لا تُنتج دليلًا ذا معنى |
| U-3 | **العتبات الصحيحة** | كل الأوزان والعتبات فرضياتي بلا معايرة |
| U-4 | **نوافذ الحداثة** | 12/18/24/36/48 شهرًا أرقام معقولة **غير مُعايَرة** |
| U-5 | **موارد تعلّم موثوقة لحالات البيانات وقراءة الكود** | **فجوتان حقيقيتان** — لا أعرف موردًا جيدًا لهما |
| U-6 | **واقع السوق السعودي لهذا الدور** | React · TypeScript · المسميات الفعلية — **لا بيانات** |
| U-7 | **هل يستطيع مبتدئ تشغيل مشاريع البداية؟** | العائق البيئي قد يُفشل النشاط لأسباب لا علاقة لها بالمهارة |
| U-8 | **هل يميّز المقيّم بين إصلاح جذري وإخفاء عَرَض؟** | **أصعب بند تقييم في الحزمة** — وقد يحتاج بشريًا دائمًا لا نموذجًا |
| U-9 | **كم مهارة من الـ14 جديدة فعلًا مقابل معاد استخدامها؟** | يُقاس عند بناء المسار الثاني — مؤشر نجاح التجريد |
| U-10 | **هل هذه الحزمة «رقيقة» كما خططت؟** | **لا — هي أثقل** (14 مهارة · 11 مهمة · 3 أنشطة · 3 رُبريكات) · **أقرب للكاملة** — وهو انحراف عن خطة السبرنت يحتاج قرارك |

---

## 14. بوابات الجودة — محدَّثة بعد v0.2.0

> **لا شيء حُوِّل من `draft` إلى `approved`.** و`can_yield_verified = false` في الأنشطة الثلاثة.
> **لا تُعتبر مكتملة:** اعتماد SME · المعايرة · اكتمال ثنائي اللغة · التحقق من الموارد — **لأنها لم تُنفَّذ فعلًا.**

### ✅ Passed (9)
| البوابة | الدليل |
|---|---|
| G-2 المهارات موجودة وفعّالة | 14 مهارة مُعرَّفة · `skl_git_basics` بـ`p1_scope: false` |
| G-3 كل مهارة أساسية لها نشاط | الخمس مغطّاة |
| G-6 رُبريك و`skill_criteria_map` لكل نشاط | ثلاثة رُبريكات |
| G-7 كل بند له مهارة مرتبطة | كل البنود لها `linked_skill` |
| G-11 كل مورد له تطبيق إلزامي | 18 مدخلًا |
| G-12 سياسة حداثة ومقياس لكل مهارة | 6 سياسات |
| G-13 إشارات السوق بحجم عيّنة | **فارغة عمدًا** — لا إشارة بلا عيّنة |
| G-14 قاعدة عرض لكل أصل × مستوى | §12 |
| **G-4 قاعدة الدليلين — مُعالَجة بصدق** | **3 مهارات تبلغ `Verified` · 2 مسقوفتان بـ`Demonstrated` بقرار موثّق (§5.5)** — لا تضخيم أوزان |

### 🟡 Partial (3)
| البوابة | الناقص |
|---|---|
| G-1 مصدر ومراجعة لكل سجل | المصادر موجودة · **لا مراجعة واحدة** |
| G-10 مورد لكل فجوة ذات أولوية | موجود · **`unverified` بالكامل** · 6 بـ`provider: TBD` |
| G-17 لا معرّف مكرر ولا مرجع معطوب | **يحتاج فحصًا آليًا** — لم يُنفَّذ |

### 🔴 Blocked (6)
| البوابة | السبب | من يفتحها |
|---|---|---|
| **G-5 اعتماد SME للأنشطة المنتجة لـ`Verified`** | **لا اعتماد** → `can_yield_verified = false` | SME |
| **G-8 واصفات لكل مستوى** | **4 بنود بإطار بلا واصفات نهائية** *(انخفض من 7 بعد إعادة تصميم رُبريك 003)* | SME |
| **G-9 معايرة ≥80% ومجموعة ذهبية** | **لم تُبنَ** | اختبار T-03 + SME |
| **G-15 manifest بإصدارات السجلات العالمية** | **السجلات العالمية لم تُبذر** | جلسة بذر |
| **G-16 لا محتوى `ai_assisted` بلا مراجع** | **كل الحزمة كذلك** | SME |
| **G-18 اكتمال ثنائي اللغة** | نصوص كثيرة بلغة واحدة | تحرير + SME |

**النتيجة: 9 مستوفاة · 3 جزئية · 6 محجوبة** *(كانت 8 / 4 / 6)*.
→ **الحزمة `draft` صالحة للمراجعة ولاختبارات الخطة اليدوية · غير صالحة للنشر.**

---

## 15. سجل تغييرات الحزمة

| الإصدار | التغييرات |
|---|---|
| **0.1.0** | الحزمة الأولى: دور · 14 مهارة · 11 مهمة · 3 أنشطة · 3 رُبريكات · 13 فحص نزاهة · 18 موردًا · 9 مصادر |
| **0.2.0** | • **الحزمة صارت `FULL VALIDATION PACK`** — أول مسار تحقق فعلي، لا Thin Pack<br>• **React مثبَّت `supporting`** بشرطين صريحين للتحويل إلى `core`<br>• **`skl_git_basics` خارج نطاق P1** (`p1_scope: false`) — لا فجوة ظاهرة بلا طريق إثبات<br>• **`semantic_html` و`css` مسقوفتان بـ`Demonstrated`** بقرار موثّق — **لا رفع أوزان شكليًا** + تحديد النشاط المستقبلي المطلوب (§5.5)<br>• **`act_fe_003` أُعيد تصميمه** إلى 100 دقيقة (مدى 90–120) بحذف متطلب حفظ الحالة وتصغير المشروع — **بلا فقد أي بعد من الأبعاد الخمسة**<br>• **`rub_fe_003@0.2.0`**: حُذف بند حفظ الحالة · أُضيف `post_filter_empty_state` · دُمج `ambiguity.handling` في `defect_triage_decision` · أُعيد توزيع الأوزان<br>• **فحوص النزاهة صُنِّفت** `user_facing` (6) و`assessment_only` (7) + **قواعد تجربة تمنع الإحساس بالتحقيق**<br>• **`ai_substitutability` مثبَّت كتصنيف** لا رقم<br>• **قواعد موارد التعلّم** — لا توسيع · `provider: TBD` مقبول<br>• **الأنشطة الثلاثة تبقى `ai_assisted`**<br>• بوابات الجودة: **9 / 3 / 6** |

**الملفان المرافقان:** `SME-REVIEW-PACK.md` · `FRONTEND-PACK-MANUAL-TEST-PLAN.md`
