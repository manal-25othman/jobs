# الوثيقة 23 — Track Data Pack Template
> قالب موحّد **لأي مسار مهني**. تصميم فقط — **بلا بيانات فعلية**. مخططات الحقول أدناه **عقود بيانات لا كود**.

## 1. القرار البنيوي الأول: ماذا يكون عالميًا وماذا يكون محليًا

> **المشكلة:** لو نسخنا `SKILLS.json` داخل كل مسار، لأصبح لـ«التواصل المهني» معرّف مختلف في كل مسار — **فتنكسر هوية المهارة عبر المسارات**، وتصبح مقارنة أدلة مستخدم انتقل بين مسارين مستحيلة. وهذا خرق مباشر لـLBD-08 (معرّفات داخلية دائمة).

| الطبقة | ما فيها | لماذا هنا |
|---|---|---|
| **`/global/`** *(سجلات مشتركة)* | المهارات · عائلاتها · مقاييس الإتقان · سياسات الحداثة · المترادفات · المصادر · موارد التعلّم · **مكتبة البنود العامة للرُبريكات** · قواعد العرض المهني | الهوية والدلالة مشتركة · التكرار يهدم التتبّع |
| **`/tracks/<track_id>/`** *(حزمة المسار)* | الدور · ربط الدور بالمهارات · المهام · الأنشطة · الرُبريكات · إشارات السوق · تجاوزات العرض · manifest · سجل المراجعة | خاصة بالمسار بطبيعتها |

**قاعدة ملزمة:** حزمة المسار **تشير** إلى السجلات العالمية ولا تنسخها. وإن احتاجت مهارة جديدة، **تُضاف إلى السجل العالمي أولًا** ثم تُربط.

---

## 2. بنية الحزمة والملفات

```
/global/
  SKILLS.json                  سجل المهارات العالمي (المعرّفات الدائمة)
  SKILL_FAMILIES.json          عائلات المهارات
  SKILL_SYNONYMS.json          المترادفات والصيغ البديلة (AR/EN)
  PROFICIENCY_SCALES.json      مقاييس الإتقان (مقياس واحد افتراضي)
  RECENCY_POLICIES.json        سياسات التقادم لكل عائلة/مهارة
  CRITERIA_LIBRARY.json        بنود الرُبريك العامة (core.*)
  LEARNING_RESOURCES.json      سجل موارد التعلّم
  SOURCES.json                 سجل المصادر
  CAREER_PRESENTATION_RULES.json  قواعد تحويل الدليل إلى أصول مهنية

/tracks/<track_id>/
  MANIFEST.json                هوية الحزمة وإصدارها وحالتها ومحتواها
  ROLE.json                    ملف الدور (مصدر الحقيقة)
  ROLE.md                      موجز الدور لقراءة SME — مُولَّد من ROLE.json
  ROLE_SKILL_MAP.json          ربط الدور بالمهارات بأوزان ومستويات
  TASKS.json                   المهام الفعلية للدور
  ACTIVITIES.json              الأنشطة (بما فيها Integrity Checks)
  RUBRICS.json                 الرُبريكات وبنودها وعتباتها
  MARKET_SIGNALS.json          إشارات السوق — منفصلة عن حقيقة الدور
  PRESENTATION_OVERRIDES.json  تجاوزات عرض خاصة بالمسار (اختياري)
  REVIEW_LOG.json              سجل مراجعات SME
  CHANGELOG.md                 تاريخ إصدارات الحزمة
```

### فروق مقصودة عن التسمية المقترحة — ومبرر كل فرق
| التغيير | السبب |
|---|---|
| `SKILLS.json` → `/global/` | هوية المهارة مشتركة (§1) |
| **إضافة `ROLE_SKILL_MAP.json`** | الربط علاقة لها خصائصها (أهمية · مستوى · سبب · نوع دليل) · حشوها في `SKILLS.json` يربط المهارة بدور واحد |
| `ROLE.md` **مُولَّد** لا مُحرَّر | مصدر واحد للحقيقة · يمنع تباعد النص عن الحقول |
| **إضافة `MANIFEST.json`** | لا إصدار ولا تتبّع ولا تحديث آمن بلا manifest |
| **إضافة `REVIEW_LOG.json`** | D-030 يشترط اعتماد SME · بلا سجل لا إثبات |
| **إضافة `CRITERIA_LIBRARY.json`** عالميًا | مكتبة بنود عامة تُشارَك بين المسارات (`12-rubric-architecture` §3) — تمنع نسخ البنود |
| **Integrity Checks داخل `ACTIVITIES.json`** | MD-09: جزء من `ActivitySpec` لا ملف مستقل |
| **إضافة `SKILL_SYNONYMS.json`** | المطابقة والدمج تحتاج سجلًا صريحًا لا منطقًا مخفيًا |

---

## 3. `MANIFEST.json` — هوية الحزمة

| الحقل | النوع | إلزامي | الوصف |
|---|---|---|---|
| `pack_id` | ID | ✅ | معرّف الحزمة (`trk_data_analyst_bi`) |
| `track_id` | ID | ✅ | مرجع المسار في سجل الرؤية (`TRK-05/06`) |
| `pack_version` | semver | ✅ | إصدار الحزمة |
| `status` | enum | ✅ | `draft` · `curated` · `sme_reviewed` · `approved` · `published` · `superseded` |
| `levels_included` | array | ✅ | `["junior"]` في Phase 1 |
| `language_coverage` | array | ✅ | `["ar","en"]` |
| `contents` | object | ✅ | كل ملف مع عدد سجلاته وآخر تحديثه |
| `global_registry_versions` | object | ✅ | **إصدار كل سجل عالمي استُخدم** — بدونه لا يمكن إعادة إنتاج الحزمة |
| `sme_approval` | object | ✅ للنشر | `reviewer_id` · `approved_at` · `scope` |
| `published_at` · `published_by` | — | ✅ للنشر | — |
| `supersedes` · `superseded_by` | ID | حسب الحالة | سلسلة الإصدارات |
| `validation_report` | object | ✅ للنشر | نتيجة بوابات الجودة (§10) |

---

## 4. `ROLE.json` — ملف الدور

| الحقل | النوع | إلزامي | ملاحظات |
|---|---|---|---|
| `role_id` | ID | ✅ | ثابت دائم · ASCII snake_case |
| `name_ar` · `name_en` | نص | ✅ | كلاهما إلزامي |
| `family` | enum | ✅ | من عائلات المسارات الستة (سجل الرؤية §هـ) |
| `level` | enum | ✅ | `junior` · `mid` · `senior` — **Phase 1 يركّز على `junior` فقط** |
| `description_ar` · `description_en` | نص | ✅ | وصف صادق لما يعنيه الدور فعلًا |
| `mission_statement` | نص | ✅ | ما القيمة التي يقدّمها هذا الدور للمنظمة — يُستخدم في صياغة الأنشطة |
| `typical_tasks` | array of `task_id` | ✅ | **مراجع إلى `TASKS.json`** لا نصوص مكرّرة |
| `common_tools` | array | ✅ | كل عنصر: `name` · `criticality` (`essential`/`common`/`optional`) · `skill_id?` |
| `expected_outputs` | array | ✅ | المخرجات التي يُنتجها الدور فعليًا — **أساس تصميم الأنشطة** |
| `target_user` | object | ✅ | التخصصات المناسبة · المستوى · سياق الدخول |
| `entry_barriers` | array | ➖ | ما يمنع الخريج عادةً من دخول الدور — **مفيد للتشخيص** |
| `adjacent_roles` | array of `role_id` | ➖ | للانتقال المستقبلي بين المسارات |
| `progression_to` | array of `role_id` | ➖ | يفتح `mid`/`senior` لاحقًا بلا تغيير بنية |
| `region_scope` | enum | ✅ | `sa` في Phase 1 |
| `source_refs` | array | ✅ | مراجع إلى `SOURCES.json` |
| `provenance` | object | ✅ | كما في الوثيقة 22 §5 |

**دعم المستويات:** `level` حقل لا بنية. `mid`/`senior` لاحقًا = **ملفات دور جديدة** بنفس `role_id` أو معرّف مستقل + `progression_to`. **لا إعادة تصميم.**

---

## 5. `/global/SKILLS.json` — سجل المهارات

| الحقل | النوع | إلزامي | ملاحظات |
|---|---|---|---|
| `skill_id` | ID | ✅ | **دائم لا يتغير أبدًا** · ASCII · **لا يُشتق من الاسم** |
| `name_ar` · `name_en` | نص | ✅ | الاسم الكانوني |
| `skill_family` | ID | ✅ | مرجع إلى `SKILL_FAMILIES.json` |
| `type` | enum | ✅ | **`core` · `supporting` · `tool` · `behavioral`** |
| `definition_ar` · `definition_en` | نص | ✅ | تعريف يفصل هذه المهارة عن أقرب مهارة لها |
| `observable_indicators` | array | ✅ | **سلوكيات ملاحَظة** — أساس بنود الرُبريك · بلا ذلك تصبح المهارة غير قابلة للقياس |
| `proficiency_scale_id` | ID | ✅ | مرجع إلى `PROFICIENCY_SCALES.json` |
| `recency_policy_id` | ID | ✅ | مرجع إلى `RECENCY_POLICIES.json` (D-023) |
| `evidence_types_possible` | array | ✅ | `artifact` · `decision_rationale` · `live_defense` · `process_trace` |
| `ai_substitutability` | enum | ✅ | `low` · `medium` · `high` — **كم يستطيع نموذج أن يؤدي هذه المهارة نيابة عن المستخدم** → يحدد نمط AI وتصميم فحوص النزاهة |
| `external_mappings` | array | ➖ | `{system, code, match_type}` — **فارغ في Phase 1** (LBD-08) |
| `synonym_ids` | array | ➖ | مراجع إلى `SKILL_SYNONYMS.json` |
| `status` | enum | ✅ | `active` · `deprecated` · `merged_into` |
| `source_refs` · `provenance` | — | ✅ | — |

### تمييز الأنواع الأربعة — **دلالة لا تسمية**
| النوع | المعنى | أثره على المنتج |
|---|---|---|
| `core` | لا يُعتبر الشخص مؤهلًا للدور بدونها | **تنطبق عليها قاعدة الدليلين** (V8) · أعلى وزن في الفجوة |
| `supporting` | ترفع الجاهزية ولا تحدّدها | دليل واحد يكفي لـ`Verified` |
| `tool` | إتقان أداة محددة | **أسرع تقادمًا** · سياسة حداثة مختلفة · قابلة للاستبدال بأداة مكافئة |
| `behavioral` | تواصل · تعامل مع الغموض · أولويات | **أبطأ تقادمًا** · تُقاس من `behavioral` criteria وتفاعلات المدير الافتراضي · `ai_substitutability = low` غالبًا |

### `/global/PROFICIENCY_SCALES.json`
| الحقل | ملاحظات |
|---|---|
| `scale_id` · `scale_version` | مُصدَّر |
| `levels[]` | لكل مستوى: `level_key` · `order` · `label_ar/en` · `descriptor_ar/en` · `observable_at_this_level` |
| **قاعدة** | مقياس الإتقان **منفصل** عن مستويات الدليل (`Observed…Verified`) — **لا تُخلط.** الأول «كم يعرف»، الثاني «ماذا أثبت» |

### `/global/RECENCY_POLICIES.json`
`policy_id` · `applies_to` (`skill_family`/`skill_id`) · `current_window` · `aging_window` · `stale_after` · `refresh_method` · `policy_version` · `rationale` · `provenance`.
**قيم ابتدائية مقترحة للمعايرة لا للاعتماد:** أدوات ومنصات أقصر · أسس تحليلية أطول · سلوكية أطول · منهجية/تنظيمية أطول. **الأرقام تُضبط في Phase 0** (D-023).

---

## 6. `ROLE_SKILL_MAP.json` — الربط

| الحقل | النوع | إلزامي | ملاحظات |
|---|---|---|---|
| `map_id` | ID | ✅ | — |
| `role_id` · `skill_id` | ID | ✅ | — |
| `importance` | enum | ✅ | `critical` · `high` · `medium` · `low` |
| `is_core_for_role` | boolean | ✅ | **يحدد انطباق قاعدة الدليلين** — قرار على مستوى الربط لا المهارة (مهارة `core` في دور قد تكون مساندة في آخر) |
| `target_level` | enum | ✅ | من `proficiency_scale` — **لمستوى `junior` في Phase 1** |
| `weight` | رقم | ✅ | وزن الفجوة في التشخيص |
| `why_required_ar` · `why_required_en` | نص | ✅ | **يُعرض للمستخدم** — الفجوة بلا سبب لا تُقنع |
| `evidence_type_expected` | array | ✅ | `artifact` · `decision_rationale` · `live_defense` · `process_trace` |
| `minimum_evidence_count` | عدد | ✅ | 2 للمهارات الأساسية · 1 لغيرها (V8) |
| `assessed_by_activities` | array of `activity_id` | ✅ | **أي نشاط يستطيع إثبات هذه المهارة** — بلا ذلك تصبح فجوة بلا مخرج |
| `source_refs` · `provenance` | — | ✅ | — |

> **قرار تصميمي مهم:** `is_core_for_role` **على الربط لا على المهارة**. «التواصل المهني» أساسية في IT Support ومساندة في Data Engineer — والنموذج يجب أن يحتمل ذلك.

---

## 7. `TASKS.json` — المهام الفعلية

| الحقل | النوع | إلزامي | ملاحظات |
|---|---|---|---|
| `task_id` | ID | ✅ | — |
| `role_id` | ID | ✅ | — |
| `title_ar` · `title_en` | نص | ✅ | — |
| `description_ar` · `description_en` | نص | ✅ | ماذا يفعل فعلًا لا ماذا يعرف |
| `frequency` | enum | ✅ | `daily` · `weekly` · `monthly` · `occasional` |
| `complexity` | enum | ✅ | `low` · `medium` · `high` |
| `related_skills` | array of `{skill_id, involvement}` | ✅ | `involvement`: `primary`/`secondary` |
| `expected_output` | نص + نوع | ✅ | **المخرَج الملموس** — أساس تحويل المهمة إلى نشاط |
| `common_tools` | array | ✅ | — |
| `typical_inputs` | array | ➖ | ما يُعطى له للبدء — يغذّي `input_files` في النشاط |
| `failure_modes` | array | ➖ | **كيف يُخطئ المبتدئ عادةً في هذه المهمة** → **أخصب مصدر لتصميم Integrity Checks** |
| `realism_notes` | نص | ➖ | ملاحظات SME عن الواقع مقابل الكتب |
| `source_refs` · `provenance` | — | ✅ | — |

> **`failure_modes` ليست حقلًا تجميليًا:** هي المادة الخام لتناقضات مدروسة وقيم شاذة وافتراضات خفية. **تُجمَع من SME مباشرة.**

---

## 8. `ACTIVITIES.json` — الأنشطة

| الحقل | النوع | إلزامي | ملاحظات |
|---|---|---|---|
| `activity_id` | ID | ✅ | — |
| `spec_version` | semver | ✅ | **مجمّد بعد النشر** (INV-7) |
| `role_id` · `level` | ID/enum | ✅ | — |
| `profile` | enum | ✅ | `mission` مُفعَّل · والباقي محجوز (LBD-03) |
| `title_ar` · `title_en` | نص | ✅ | — |
| `business_context_ar/en` | نص | ✅ | من يطلب · لماذا · ما القرار المعلّق على المخرَج |
| `objective_ar/en` | نص | ✅ | ما المطلوب إنجازه |
| `non_human_roles` | array | ✅ | `{role: manager/client, persona, disclosure_limits, intervention_cap}` |
| `input_files` | array | ✅ | `{file_ref, description, is_platform_private, contains_planted_issue}` |
| `required_deliverables` | array | ✅ | كل مخرَج: `{key, format, mandatory}` |
| `expected_outputs` | array | ✅ | **القيم/النتائج المتوقعة للفحوص الحتمية** — منفصلة عن المخرجات المطلوبة |
| `related_skills` | array of `skill_id` | ✅ | — |
| `skill_criteria_map` | object | ✅ | **أي بند رُبريك يقيس أي مهارة** — بلا ذلك **لا يُنتج النشاط دليلًا** |
| `estimated_duration_min` | عدد | ✅ | 60–120 دقيقة في Phase 1 |
| `ai_usage_mode` | enum | ✅ | `ai_prohibited` · `ai_assisted` · `ai_expected` |
| `integrity_checks` | array | ✅ | §8.1 — **إلزامية لأي نشاط يمنح `Verified`** (D-013) |
| `rubric_ref` | `{rubric_id, rubric_version, scoring_policy_version}` | ✅ | — |
| `evidence_strength_class` | enum | ✅ | `platform_controlled` غالبًا · `platform_observed` لأنشطة التحقق |
| `high_strength` | boolean | ✅ | يؤهّل لمسار استثناء D-012a — **بمعايير مكتوبة** |
| `can_yield_verified` | boolean | ✅ | **إن كان `true` فالحقول الحاجبة كلها إلزامية** |
| `is_validation_activity` | boolean | ✅ | نشاط ترقية `self_reported` → `platform_observed` (D-018a) |
| `deterministic_checks` | array | ✅ | §8.2 |
| `sme_approval` | object | ✅ للنشر | `reviewer_id` · `approved_at` · `notes` |
| `authoring_effort_minutes` | عدد | ➖ | **الزمن الفعلي لبناء النشاط — يُقاس ولا يُقدَّر** (D-030) |
| `provenance` | object | ✅ | — |

### 8.1 `integrity_checks[]`
| الحقل | ملاحظات |
|---|---|
| `check_id` | — |
| `type` | `planted_contradiction` · `missing_information` · `outlier` · `hidden_assumption` · `contextual_defense_question` |
| `location` | أين وُضع (ملف · صف · عمود · سؤال) |
| `expected_user_behavior` | ماذا يفعل المستخدم الواعي |
| `raw_ai_output_behavior` | **ماذا يفعل مخرَج نموذج خام عادةً** — أساس اختبار P5 |
| `weight` · `is_blocking` | فحص حاسم غير مكتشَف ⇒ سقف `Practiced` |
| `linked_criterion_id` | البند الذي يقيسه |

**شرط اعتماد:** نشاط `can_yield_verified = true` **يجب** أن يحوي: مدخلات خاصة (I1) + فحص نزاهة واحدًا على الأقل (I2) + سؤال تبرير سياقي (I3).

### 8.2 `deterministic_checks[]`
`check_id` · `rule_description` · `check_type` (`presence`/`value_match`/`range`/`structure`/`constraint`) · `expected` · `is_mandatory` · `failure_message_ar/en` · `linked_criterion_id?`.
**قاعدة:** ما تستطيع قاعدة أن تقرره **لا يُحوَّل إلى بند رُبريك**.

### 8.3 مقاومة الغش بالـAI — قواعد تصميم
1. **مدخلات مُولَّدة خاصة بالمنصة** — لا تُوجد على الإنترنت العام.
2. **قرار في ظل معلومات ناقصة** — لا سؤال له جواب واحد معروف.
3. **سؤال تبرير عن قرار في عمله هو** — لا عن المفهوم عمومًا.
4. **فحص نزاهة واحد على الأقل** مبني على `failure_modes` من `TASKS.json`.
5. **كلما ارتفع `ai_substitutability` للمهارة، ثقلت بنود الحكم وخفّت بنود الإنتاج.**

---

## 9. `RUBRICS.json` + `/global/CRITERIA_LIBRARY.json`

### الرُبريك
`rubric_id` · `rubric_version` *(مجمّد)* · `role_id` · `activity_id` · `scoring_policy_version` · `dimensions[]` · `criteria[]` · `calibration` · `status` · `sme_approval` · `provenance`.

### البند (Criterion) — **التقييم بندًا بندًا، لا درجة عامة**
| الحقل | إلزامي | ملاحظات |
|---|---|---|
| `criterion_id` | ✅ | **مُسمّى بنطاق:** `core.*` · `track.<track>.*` · `activity.<id>.*` · **لا يتغير أبدًا** |
| `criterion_name_ar/en` | ✅ | — |
| `dimension` | ✅ | `correctness` · `judgment` · `communication` · `integrity` · `completeness` |
| `linked_skill` | ✅/➖ | **بند بلا `linked_skill` لا يُنتج دليلًا** — يُسمح به لقياس جودة عامة فقط |
| `weight` | ✅ | — |
| `levels[]` | ✅ | لكل مستوى: `level_key` · `score` · `descriptor_ar/en` · `observable_evidence` |
| `threshold_for_skill` | ✅ إن وُجد `linked_skill` | العتبة التي تعني إثبات المهارة |
| `is_blocking` | ✅ | رسوبه يوقف الترقية |
| `evaluator_type` | ✅ | `rule` · `llm` · `human` |
| `deterministic_check_refs` | ➖ | البنود المحسومة بقاعدة |
| `evidence_expected` | ✅ | ما يصلح مقتطفًا داعمًا من التسليم |
| `excerpt_guidance` | ➖ | كيف يُختار المقتطف — يرفع جودة بطاقة الدليل |
| `source` (`core`/`track`/`activity`) | ✅ | من أين جاء البند |

### `CRITERIA_LIBRARY.json` — البنود العامة
بنود تُكتب مرة وتُستخدم في كل المسارات: `core.completeness.*` · `core.judgment.assumption_check` · `core.judgment.decision_under_uncertainty` · `core.communication.clarity` · `core.communication.audience_fit` · `core.ambiguity.handling` · `core.integrity.ai_verification` · `core.integrity.error_detection`.
**الرُبريك يُركَّب:** `include(core) + include(track) + activity_specific[]` مع تجاوز محلي للوزن والعتبة **بلا تعديل البند الأصلي**.

### `calibration`
`golden_set_ref` · `golden_set_size` · `agreement_rate` · `includes_raw_ai_submission` (**إلزامي `true`**) · `calibrated_at` · `calibrated_by`.
**شرط نشر:** اتفاق ≥ 80% على مستوى البند.

---

## 10. `/global/LEARNING_RESOURCES.json`

| الحقل | إلزامي | ملاحظات |
|---|---|---|
| `resource_id` | ✅ | — |
| `skill_ids` | ✅ | **متعدد** — مورد واحد قد يخدم أكثر من مهارة |
| `title_ar` · `title_en` | ✅ | — |
| `provider` | ✅ | — |
| `resource_type` | ✅ | `video` · `course` · `documentation` · `article` · `tutorial` · `exercise` · `project` |
| `language` | ✅ | — |
| `level` | ✅ | يطابق `proficiency_scale` |
| `duration_minutes` | ✅ | — |
| `free_or_paid` | ✅ | `free` · `paid` · `freemium` |
| `url` | ✅ | — |
| `why_recommended_ar/en` | ✅ | **مربوط بفجوة محددة** لا وصف عام |
| `covers_target_level` | ✅ | هل يكفي لبلوغ المستوى المستهدف أم جزء منه |
| `practice_activity_ref` | ✅ | **التطبيق الإلزامي بعده** — ترشيح بلا تطبيق مرفوض (عقد A07) |
| `prerequisites` | ➖ | — |
| `quality_status` | ✅ | `unverified` · `sme_reviewed` · `approved` · `flagged` · `retired` |
| `last_checked` | ✅ | تاريخ آخر فحص للرابط والمحتوى |
| `access_notes` | ➖ | تسجيل مطلوب · قيود جغرافية |
| `source_refs` · `provenance` | ✅ | — |

---

## 11. `/global/SOURCES.json`

| الحقل | إلزامي | ملاحظات |
|---|---|---|
| `source_id` | ✅ | — |
| `source_type` | ✅ | `official` · `curated` · `market_signal` · `platform_generated` |
| `source_name` | ✅ | — |
| `publisher` | ➖ | — |
| `url` | ➖ | — |
| `jurisdiction` | ✅ | النطاق الجغرافي/النظامي |
| `language` | ✅ | — |
| `retrieved_at` | ✅ | — |
| `version` | ✅ | إصدار المصدر أو تاريخه |
| `license` · `usage_notes` | ✅ | **مصدر بلا ترخيص واضح لا يدخل الطبقة الخام** |
| `raw_snapshot_ref` | ✅ | مرجع لقطة L0 |
| `reliability` | ✅ | `high` · `medium` · `low` |
| `review_status` · `reviewed_by` | ✅ | — |

---

## 12. `MARKET_SIGNALS.json` — منفصلة عن حقيقة الدور

| الحقل | إلزامي | ملاحظات |
|---|---|---|
| `signal_id` | ✅ | — |
| `role_id` · `skill_id` | ✅ | — |
| `region` | ✅ | — |
| `sample_period` | ✅ | `{from, to}` |
| `sample_size` | ✅ | **إشارة بلا حجم عيّنة لا تُنشر** |
| `frequency` | ✅ | تكرار ظهور المهارة في العيّنة |
| `metric_type` | ✅ | `mention_frequency` · `requirement_rate` · `co_occurrence` |
| `source_id` | ✅ | — |
| `captured_at` | ✅ | — |
| `confidence` | ✅ | `high` · `medium` · `low` |
| `expires_at` | ✅ | **الإشارة تنتهي؛ حقيقة الدور لا** |
| `proposed_change` | ➖ | `{target_field, from, to, rationale}` — **اقتراح لا تطبيق** |
| `change_review_status` | ✅ | `not_proposed` · `proposed` · `accepted` · `rejected` |

**قواعد ملزمة (DF-4):**
1. **لا إشارة تُعدّل `ROLE_SKILL_MAP` آليًا.** التعديل يمر بدورة المراجعة كاملة.
2. **لا تُعرض إشارة للمستخدم كحقيقة** — إن عُرضت، فبمصدرها وتاريخها وحجم عيّنتها (INV-4).
3. **الإشارة المنتهية تبقى أرشيفيًا** ولا تُستخدم في توصية.

---

## 13. `/global/CAREER_PRESENTATION_RULES.json`

> **القاعدة الحاكمة: لا Career Asset بلا Evidence مناسب.**

| الحقل | إلزامي | ملاحظات |
|---|---|---|
| `rule_id` | ✅ | — |
| `asset_type` | ✅ | `cv_bullet` · `linkedin_skill` · `linkedin_project` · `case_study` · `professional_profile` |
| `minimum_evidence_level` | ✅ | أدنى مستوى دليل يسمح بهذا الأصل |
| `minimum_source_strength` | ✅ | أدنى قوة مصدر |
| `minimum_evidence_count` | ✅ | — |
| `requires_verified` | ✅ | هل يتطلب `Verified` |
| `allowed_claim_verbs_ar/en` | ✅ | **أفعال مسموحة لكل مستوى** — `Practiced` → «عمل على» · `Demonstrated` → «أنجز/أنتج» · `Verified` → «أثبت (موثّق)» |
| `forbidden_phrases_ar/en` | ✅ | «خبير» · «متقدم» · «محترف» · أي لقب عام |
| `template_pattern` | ✅ | بنية العبارة: `[فعل] + [مخرَج] + [سياق] + [أثر إن وُجد في الدليل]` |
| `must_cite_evidence` | ✅ | **دائمًا `true`** — كل عبارة تحمل `evidence_ref` |
| `numeric_claims_policy` | ✅ | **لا رقم أثر إلا إن وُجد في التسليم نفسه** |
| `ai_disclosure_handling` | ✅ | كيف يُصاغ الادعاء حين كان الإنتاج بمساعدة AI (يُوثَّق الحكم لا الإنتاج) |
| `recency_handling` | ✅ | صياغة `Aging` و`Historical` |
| `language_target` | ✅ | `ar` · `en` — المخرجات المهنية بالإنجليزية |
| `on_user_edit` | ✅ | **التعديل خارج الدليل يُسقط وسم التوثيق** |

**مصفوفة الحد الأدنى — مقترح للمراجعة:**
| الأصل | أدنى مستوى | أدنى قوة مصدر | ملاحظة |
|---|---|---|---|
| `cv_bullet` | `Demonstrated` | أي مصدر **بصياغة تعكسه** | `Practiced` يُصاغ «عمل على» فقط |
| `linkedin_skill` | `Demonstrated` | `platform_*` | **لا تُدرَج مهارة من تقييم ذاتي** |
| `linkedin_project` | `Practiced` | أي مصدر | مع وسم إن كان `self_reported` |
| `case_study` | `Demonstrated` | `platform_*` | **يُفصح أن العمل في بيئة محاكاة** |
| `professional_profile` | `Verified` لعرض وسم التوثيق | `platform_*` | P4 |

---

## 14. بوابات جودة الحزمة (Pack Quality Gates) — قابلة للفحص آليًا

**لا تُنشر حزمة يفشل فيها أي بند:**

| # | البوابة |
|---|---|
| G-1 | كل سجل يحمل `provenance` كامل و`review_status` |
| G-2 | كل مهارة في `ROLE_SKILL_MAP` موجودة في `/global/SKILLS.json` وحالتها `active` |
| G-3 | **كل مهارة `is_core_for_role = true` لها نشاط واحد على الأقل يستطيع إثباتها** (`assessed_by_activities` غير فارغ) |
| G-4 | **كل مهارة أساسية لها نشاطان مختلفان** — وإلا استحال بلوغ `Verified` (V8) |
| G-5 | كل نشاط `can_yield_verified = true` يحوي I1 + I2 + I3 و`sme_approval` |
| G-6 | كل نشاط له `rubric_ref` صالح و`skill_criteria_map` غير فارغ |
| G-7 | كل بند رُبريك إما له `linked_skill` أو مُعلَّم بوضوح كبند جودة عامة |
| G-8 | كل بند له واصفات لكل مستوى — **بند بلا واصفات مرفوض** |
| G-9 | كل رُبريك منشور له `calibration` باتفاق ≥80% ومجموعة ذهبية تحوي **مخرَج AI خامًا** |
| G-10 | كل فجوة ذات أولوية لها مورد تعلّم واحد على الأقل بحالة `approved` |
| G-11 | كل مورد مرشَّح له `practice_activity_ref` |
| G-12 | كل مهارة لها `recency_policy_id` و`proficiency_scale_id` |
| G-13 | كل إشارة سوق لها `sample_size` و`confidence` و`expires_at` |
| G-14 | قاعدة عرض موجودة لكل `asset_type` × كل مستوى دليل |
| G-15 | `manifest.global_registry_versions` مكتمل — الحزمة قابلة لإعادة الإنتاج |
| G-16 | **لا سجل `drafting_aid = ai_assisted` بلا `reviewed_by`** |
| G-17 | لا معرّف مكرر · لا مرجع معطوب · لا مهارة `deprecated` مستخدمة |
| G-18 | كل الحقول الإلزامية موجودة بالعربية والإنجليزية حيث اشتُرط |

> **هذه البوابات هي أعلى عائد للأتمتة المبكرة** — فحص آلي بسيط يمنع أخطاءً يكتشفها المستخدم لاحقًا على حساب مصداقيتنا.
