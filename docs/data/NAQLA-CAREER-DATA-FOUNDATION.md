# نَقْلة / NAQLA — Career Data Foundation (في طبقة البيانات الفعلية)
**التاريخ:** 2026-09-26 · **الحالة:** مُنفَّذ كطبقة بيانات · المحتوى الأول **DEMO / DRAFT / NOT SME APPROVED**

> هذه الوثيقة تصف ما **وُجد فعلًا** في PostgreSQL بعد نقل تصميم أساس البيانات (الوثائق 22–25 في `docs/data-foundation/`) من الورق إلى الجداول. كل جملة هنا تقابل جدولًا أو قيدًا أو مُحفِّزًا أو اختبارًا.

## ١. المبدأ الحاكم كما نُفِّذ
| المبدأ | التنفيذ |
|---|---|
| DF-1 الحقيقة مُهيكَلة | المهارات · الأدوار · الربط · المهام · الأنشطة · بنود الرُبريك · المصادر · قواعد العرض — **صفوف بأعمدة مُنمَّطة**. JSONB بقي في مكانين مبرَّرين فقط: `raw_snapshot.content` (أرشيف L0 حرفي) و`integrity_check_spec.check_definition` (مُسنَد صغير). عمودا `activity_spec.spec` و`rubric_version.criteria` صارا **اختياريين (legacy snapshot)** والصفوف المُنمَّطة مرجعية |
| DF-2 لا منشور بلا مصدر ومراجعة | `source_ref` لكل سجل (قاعدة جودة Q11) · `review_status` على كل جدول · مُحفِّز `career_data_review_guard` |
| DF-3 المعرّف دائم | `id` (uuid) هو الهوية؛ `slug`/`code` مفتاح ASCII يُختار عند الإنشاء ولا يتغيّر مع الأسماء · **لا حذف** (`career_data_no_delete` على skill · target_role · task · activity_spec · rubric_version · raw_snapshot) فلا يُعاد استخدام معرّف |
| DF-4 السوق ليست حقيقة الدور | `source_type = market_signal` موجود في المخطط · قيد `data_source_market_signal_not_published` · قاعدة Q13 تفشل إن وُجدت إشارة أو `market_fact` أو `demand_ratio` |
| DF-6 المهارات عالمية | جدول `skill` واحد لكل المسارات؛ الحزمة **تشير** إليه (استُعملت مهارة الشريحة ١ `ui-testing` داخل ربط الدور الجديد) · `is_core` على `role_requirement` لا على `skill` |
| DF-8 التحديث إصدار | `published → superseded` فقط · بنود رُبريك منشور **مجمّدة** بمُحفِّز |
| DF-10 مساعدة AI في الصياغة | `drafting_aid = ai_assisted` على كل سجل الحزمة؛ الاعتماد يرفضه بلا `reviewed_by` |

## ٢. الطبقات (§13 من المهمة)
`raw → normalized → curated → approved → published → superseded`
- **raw (L0):** `raw_snapshot` — ملف الحزمة كما هو، `sha256`، غير قابل للتعديل ولا للحذف. ١٥ لقطة للحزمة الأولى.
- **normalized (L1):** `normalized_record` — مفاتيح مطابقة (`normalizeMatchKey` في النطاق: توحيد الألف/الياء/التاء، حذف التشكيل، الحالة، الترقيم) **قابلة لإعادة التوليد** وتُعاد كتابتها في كل استيراد. ٦١ سجلًا.
- **curated (L2):** صفوف الجداول المرجعية بحالة `draft`/`curated` — `layerOf()` في النطاق و`data_layer_of()` في القاعدة.
- **approved / published / superseded (L3):** حالات المراجعة نفسها. **المنتج يستهلك `published` فقط** (`consumableByProduct`).

## ٣. دورة المراجعة (§14)
```
draft → curated → sme_reviewed → approved → published → superseded
            ↑            ↓ rejected / needs_revision
            └────────────┘
```
| الانتقال | من يمنحه | ما يلزم |
|---|---|---|
| → curated | `content_author` | — |
| → sme_reviewed · approved · rejected · needs_revision | **`sme` مُسمّى** | `reviewed_by` + `reviewed_at` |
| → published | `product_owner` | الحالة السابقة `approved` **حصرًا** |
| → superseded | `product_owner` / `system` | — |

مفروض ثلاثًا: `assertReviewTransition` في `@naqla/domain` · مُحفِّزا `career_data_review_guard` و`career_data_review_guard_status` في القاعدة · أمر `review` في الخط يكتب `review_log` (من · دور · سبب · مدة · تعارض مصالح).
**الـDEMO fixture:** لا يصل `sme_reviewed`/`approved` أبدًا (مُحفِّز + نطاق). يجوز `curated → published` **خارج الإنتاج فقط** ليعمل المنتج تطويريًا؛ والـAPI **يرفض الإقلاع** في `NODE_ENV=production` إن وُجد صف demo منشور (`CareerDataService.onModuleInit`, مُختبَر).

## ٤. الجداول
| المفهوم | الجدول | ملاحظة |
|---|---|---|
| المصادر | `data_source` | `source_type` · `jurisdiction` · `license_or_usage_notes` إلزامي · `url_verified` · `retrieved_at` مطلوب للاعتماد لغير `curated` |
| الإسناد | `source_ref (entity_kind, entity_id, source_id)` | تعدّدي بتعداد صريح؛ Q11 يتحقق من وجود الكيان |
| عائلات · مقياس إتقان · حداثة | `skill_family` · `proficiency_scale/level` · `recency_policy` | مقياس واحد بأربعة مستويات؛ نوافذ الحداثة **للمعايرة** (D-023) |
| سجل المهارات | `skill` (+أعمدة) | `skill_type` · `ai_substitutability` · مؤشرات ملاحَظة وأنماط فشل (text[] بلغتين) · `status` active/deprecated/merged_into · `merged_into_id` |
| المترادفات | `skill_synonym` | `equivalent`/`translation_variant` = صيغة لهذه المهارة · `broader`/`narrower`/`related`/`tool_of` = **ربط** بمهارة أخرى؛ قيد `synonym_shape` يمنع الخلط (= الدمج) |
| الدور | `target_role` (+أعمدة) · `role_tool` | مستوى · وصف · مسؤوليات · مخرجات · **ما يُتوقَّع/لا يُتوقَّع من المبتدئ** · أدوات (بلا إطار) |
| ربط الدور بالمهارة | `role_requirement` (= RoleSkill) | `is_core` · `importance` · `target_proficiency` · `why_required_*` · `evidence_type_expected[]` · `minimum_evidence_count` · `can_be_partially_auto_evaluated` · `human_review_required` · `weight` **NULL = غير محسوم** |
| المهام | `task` · `task_skill` | تكرار · تعقيد · مخرَج · **أنماط الفشل** |
| الأنشطة | `activity_spec` (+أعمدة) · `activity_input` · `activity_deliverable` · `activity_skill` · `activity_task` | `can_yield_demonstrated` · `can_yield_verified=false` |
| فحوص النزاهة | `integrity_check_spec.check_type` | user-facing: `clarification_question` · `explanation_question` · `followup_modification` — assessment-only: `planted_inconsistency` · `deterministic_signal` · `edge_case` · `output_consistency` · `expected_failure_mode`؛ قيد يربط النوع بالتصنيف |
| الرُبريك | `rubric_version` (+`pass_threshold` · `proposes_state`) · `rubric_criterion` · `rubric_criterion_level` · `criterion_library` | كل بند **مربوط بمهارة (NOT NULL)** · بُعد · وزن · حد أدنى للمهارة · نوع المُقيِّم · فحص حتمي بأعمدة · واصفات لكل مستوى |
| موارد التعلّم | `learning_resource` (+أعمدة) | `url` NULL ⇒ `quality_status = unverified` (قيد) · `practice_activity_spec_id` |
| قواعد العرض | `career_presentation_rule` | `asset_type × evidence_level` · أفعال مسموحة/عبارات ممنوعة · `must_cite_evidence = true` (قيد) |
| المراجعة | `review_log` | قرار SME **باسم** (قيد) |
| الخط | `raw_snapshot` · `normalized_record` · `dedup_candidate` | Q13 يرفض أي لقطة من مصدر سوق |

## ٥. ما قرأه الوكلاء (§16)
- **وكيل التوظيف** يستلم `roleRequirements` من الطبقة **المنشورة** فقط (`loadRoleRequirements`): `published` ⇒ يقترح `profile_gap` لكل مهارة أساسية بلا دليل مؤهِّل؛ `unpublished`/`missing` ⇒ تحذير «role requirements unpublished» ولا يخترع. **لا يُنسخ متطلب دور إلى دليل المستخدم** (مُختبَر: صفر أدلة/ادعاءات جديدة).
- **الوكيل التقني** يستلم `activityContext` (المخرجات · المهارات · المهام · بنود الرُبريك المنشور مع مهاراتها): يسمّي النشاط ومخرجاته الإلزامية في `missing_evidence`، ويلحق `linkedSkillId` بكل بند مشروح؛ بنية غائبة ⇒ تحذير.
- أمثلة السياق في `packages/agents/eval/dataset.json` لم تتغيّر: المنصّة (٣٠ سيناريو) ما زالت خضراء.

## ٦. ما لم يُنفَّذ عمدًا
لا استيراد إشارات سوق · لا أداة إدارة محتوى · لا وكيل تعلّم (لكن السلسلة `learning_gap → learning_resource → practice_activity → activity_spec` موجودة بجداولها) · لا مسار ثانٍ · لا تغيير في محرك التقييم (البنود البشرية لا تعمل فيه — يرفض صراحةً، انظر `OPEN-041`).
