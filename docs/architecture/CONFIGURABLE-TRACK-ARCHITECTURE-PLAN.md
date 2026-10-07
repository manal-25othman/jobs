# نَقْلة / NAQLA — Configurable Track Architecture · Assessment & Plan
**التاريخ:** 2026-10-07 · **الحالة:** **معتمدة** (المالكة، 2026-10-07) · **التنفيذ:** Phase 1 ✅ مُنفَّذة — التقرير `PHASE-1-EVIDENCE-SYSTEM-REPORT.md`؛ Phase 2 بانتظار مراجعة المالكة لتقرير Phase 1 · *(بنود الموافقة الثلاثة: H6 خلف سياسة معطَّلة افتراضيًا · H4 بيانات · H5 إعداد مُصدَّر)* · **المرجع الحاكم:** `docs/srs/SRS-001-naqla-functional.md` v1.5
**الهدف:** تشغيل تجربة NAQLA الأساسية (مسار → مهارات → نشاط → دليل → تقييم مُهيكل → تقدّم → ما ينقص → إعادة محاولة → مسودة ادعاء مهني) **دون تثبيت أي قاعدة مهنية تنتظر رأي الخبراء**. كل قاعدة من هذا النوع تُحمَل كـConfiguration مُصدَّرة قابلة للتعديل من Admin.

---

# A. Current State Assessment

## A.1 موجود ويُعاد استخدامه كما هو
| الطبقة | ما هو موجود | لماذا يُعاد استخدامه |
|---|---|---|
| **Track / Skill / TrackSkill / Activity / Rubric كبيانات** | `target_role` · `skill` (سجل عالمي) · `role_requirement` (= TrackSkill: `is_core` · `importance` · `target_proficiency` · `minimum_evidence_count` · `evidence_type_expected` · `weight` · `review_status` · `version`) · `activity_spec` + `activity_skill` (= SkillActivity بعمق primary/secondary) · `rubric_version` + `rubric_criterion` (+ `rubric_criterion_level` · `criterion_kind` · `evaluator_type` · `weight/threshold` بحالات `approved/proposed/TBD`) · `integrity_check_spec` (أنماط تقييم) · `criterion_library` | هذا هو جوهر «المسار ليس Array في الكود». ينقصه: الإصدار **المُجمَّع** للمسار (snapshot)، وحقول TrackSkill للعرض (`category` · `display_order` · `enabled` · `readiness_contribution`)، وواجهة Admin |
| **دورة مراجعة المحتوى** | `draft → curated → sme_reviewed → approved → published → superseded` نطاقًا وقاعدةً · `review_log` بالاسم · DEMO لا يُعتمد · الترقية بنسخة · `value_status` + `approve-values` | يصلح كما هو لحوكمة أي Configuration جديد (لا نبني دورة ثانية) |
| **خط التقييم** | حتمي (`runDeterministicEvaluation`) · بنود بشرية في طابور · تجميع نقي · `evaluation_result` append-only مع `supersedes` · `evaluation_criterion_score` · `integrity_check` · `verification` (append، «تخفض أو تثبّت») · `evidence_transition` | أساس «التقييم ≠ قرار التحقق» موجود جزئيًا؛ ينقصه النتيجة **المُهيكلة** لكل بند والخام للتدقيق |
| **المراجعة البشرية** | `review_queue_item` · `criterion_review` ثابت (الحكم الجديد سجل جديد) · `reviewer_grant` · حمولة عمياء | هذا هو Human Override المطلوب (§15): لا يمحو، يسجّل المراجع والسبب والسابق واللاحق والزمن |
| **الوكلاء والصياغة المهنية** | `agent_proposal` (معاينة إلزامية D-057 · اعتماد المستخدم · لا كتابة مباشرة) · `WORDING_PROPOSAL_TYPES` · حارس الصياغة (لا رقم بلا واقعة D-078 — يمنع «40%» حرفيًا) · `career_presentation_rule` (أهلية CV/LinkedIn لكل مستوى كبيانات) · `professional_asset` | يغطّي «Evidence → Proposed Claim → Preview → Approval» فعلًا؛ ينقصه كيان **Career Claim Draft** بحالة grounding/lock وسياسة فتح مُصدَّرة |
| **الإفصاح عن AI** | `ai_disclosure` (`mode` · `declared_use[]` · `explanation`) · `assessDisclosure` (لا يخفض الدرجة) | يُوسَّع إلى استبيان مُهيكل (٥ أسئلة) بلا تغيير الثابت |
| **نمط «الإعداد يفشل بصوت مسموع»** | `loadWeights()` (D-052): لا وزن ⇒ خطأ مُسمّى، لا رقم مخفي | **النمط الذي نعمّمه** على كل سياسة جديدة |
| الرفع والتخزين والأحداث | `upload` + روابط موقَّعة · `audit_event` · `submission_artifact` | قاعدة لأنواع الدليل الملفّية |

## A.2 يحتاج توسيعًا (متوافقًا مع الماضي)
| البند | الوضع الآن | ما ينقص |
|---|---|---|
| **Evidence** | `evidence` = واقعة إثبات واحدة **مربوطة بمهارة واحدة** (`skill_id NOT NULL`)، تُشتق فقط من تقييم ناجح؛ لا نوع، لا عنوان، لا رابط، لا محاولة، لا إصدار، لا metadata | **سجل أنواع الدليل** كبيانات (لا enum) · **جدول ربط Evidence↔Skill** · حقول metadata · أدلة يرفعها المستخدم (مستودع · diff · demo · لقطة · ملف · نص) **قبل** التقييم |
| **حالة المهارة** | `skill_claim.state` = سلّم التحقق فقط (`gap→self_reported→practiced→demonstrated→verified`، أمامي، enum) | طبقة **تقدّم** مستقلة (Not Started … Reassessment Required) بانتقالات **كبيانات** — تُبقي الفرق البنيوي بين إكمال النشاط وتحقق المهارة |
| **نتيجة التقييم** | درجة + مبرّر + مقتطف لكل بند | بنية لكل بند: الدليل المستخدَم/الناقص · ملاحظات · قوة/فجوات · ثقة · نوع المُقيِّم · الإجراء التالي · **الخام للتدقيق** · إصدار الرُبريك والمسار والسياسة |
| **قرار التحقق** | `decideVerification` يقبل الحالة التي يقترحها الرُبريك عند `passed` | **سياسة تحقق مُصدَّرة** (ما الذي يصير `Demonstrated` ومتى يُصعَّد) بدل منطق ثابت |
| **الجاهزية** | `computeReadiness` + `loadWeights` في النطاق، **غير موصولة**، وبأوزان CV/LinkedIn/Profile فقط | **Readiness Engine** بقواعد مُصدَّرة (أنواع القواعد في الكود، القيم في البيانات) |
| **أهلية CV/LinkedIn** | **مكرَّرة**: `presentationFor()` في الكود + `career_presentation_rule` في البيانات | مصدر واحد (البيانات) خلف `claim_policy` |
| **Admin** | لا دور إداري ولا واجهة؛ التعديل عبر CLI وملفات الحزمة | دور `track_admin` + API + واجهة بناء المسار بإصدارات |

## A.3 أين توجد القواعد المثبَّتة في الكود (Hard-coded) — جرد صريح
| # | القاعدة | الموضع | الأثر إن غيّرها الخبير | المعالجة |
|---|---|---|---|---|
| H1 | «نشاط منصّة ناجح ⇒ `demonstrated`» (`T-DEMO-FROM-*`) و«`verified` يحتاج مراجعًا» | `packages/domain/src/evidence-state.ts` `TRANSITIONS` | تغيير شرط الانتقال يحتاج تعديل كود | إبقاء **الثوابت** (أمامي فقط · لا AI ينفّذ · `Verified` محجوب) في الكود، ونقل **شروط** الصعود إلى `verification_policy` (Phase 3/4) |
| H2 | «التحقق يسري فقط عند `passed`؛ المقبول = ما يقترحه الرُبريك» | `verification.ts` `verificationApplies` · `decideVerification` | لا يمكن مثلًا اشتراط دليلين أو ثقة | سياسة تحقق مُصدَّرة؛ الدالة تأخذ السياسة مدخلًا |
| H3 | عدد الأدلة الأدنى: أساسية 2، غيرها 1 | `career-data.ts` `minimumEvidenceCount` | تغيير العدد = كود | من `role_requirement.minimum_evidence_count` (موجود) حصرًا |
| H4 | أهلية CV/LinkedIn لكل مستوى | `evidence-state.ts` `presentationFor` · `claims.ts` | قاعدة مكرَّرة مع البيانات | قراءة من `career_presentation_rule`/`claim_policy` (Phase 7/9 — يحتاج موافقة §22) |
| H5 | أرقام تحقق الحزمة: أساسية 4–5 · مهام 10–12 · أنشطة = 3 · أساسية بعمق 2–3 · بنود ≥ 5 · موارد ≤ 3 | `apps/api/src/career-data/pack-schema.ts` · `MAX_RESOURCES_PER_SKILL` | «الحد الأدنى 5 مهارات» أو «4 أنشطة» = كود | قيود بنية المسار إلى `track_config` (Phase 4/9 — موافقة §22) |
| H6 | الدليل يُمنح **لأول مهارة مُدَّعاة** في التسليم فقط | `evaluation.service.ts` `promote` (`submission_claimed_skill … limit 1`) | لا دليل لعدة مهارات من تسليم واحد؛ `threshold_for_skill` غير مستعمل | اشتقاق الدليل لكل مهارة من بنودها (`skillsEvidencedByRun`) عبر جدول الربط (Phase 3 — **موافقة §22**) |
| H7 | مفاتيح أدوات التسليم `file.component`/`file.test` بالترتيب | `submission.service.ts:95` | أي نشاط جديد بملفات مختلفة يحتاج كودًا | مفاتيح من `activity_deliverable` + أنواع الدليل (Phase 1) |
| H8 | سلّم الإفصاح N0–N4 (`n ≥ 4 ⇒ N3`) | `ai-disclosure.ts` | ثابت معتمد (D-019/سياسة 08) | يبقى؛ أسئلة الاستبيان وسياسة التحدي تُصدَّر |
| H9 | `rationale ≥ 12` حرفًا للقرار البشري | `human-review.ts` | شكلي | يبقى كحدّ شكلي مُسمّى |
| H10 | أعلى حالة إنتاجية `demonstrated` | `production-limits.ts` | قرار منتج (D-102) لا قرار خبير | **يبقى في الكود عمدًا** |
| H11 | ميزانية الوكلاء 50/يوم (تطوير) | `@naqla/config` | مُسمّاة؛ مطلوبة في الإنتاج | كما هي |

## A.4 ما سيصعب تغييره بعد رأي الخبراء إن لم نعالجه الآن
1. **H6** — طريقة اشتقاق الدليل من التسليم (مهارة واحدة مقابل عدة مهارات لكل بند).
2. **H1/H2** — شروط `Demonstrated` (دليل واحد؟ دليلان؟ ثقة؟ بشري؟).
3. **الجاهزية** — لا محرك الآن؛ أي قاعدة تُكتب في الكود ستصبح «3 من 7» مخفية.
4. **أنواع الدليل** — enum في الكود يعني هجرة لكل نوع جديد.
5. **تصنيف المهارات في الواجهة** — إن عُرض `is_core` مباشرة سيظهر «أساسية» قبل الاعتماد.

## A.5 الهجرات المطلوبة (كلها إضافية، بلا حذف عمود ولا تغيير enum قائم)
`0011_evidence_system` · `0012_skill_progress` · `0013_structured_assessment` · `0014_track_configuration` · `0015_career_claim_draft` · `0016_track_admin`.

## A.6 الأجزاء التي ستتأثر
`packages/domain` (وحدات جديدة + توقيعات تأخذ السياسة مدخلًا) · `apps/api/src/slice1` (التسليم · التقييم · المهارات) · `apps/api/src/agents` (سياق الفجوة والصياغة يقرأ من طبقة الادعاء) · `apps/api/src/career-data` (الحزمة تحمل حقول TrackSkill الجديدة) · `apps/app` (صفحات جديدة) · الاختبارات (e2e: إضافة لا كسر) · الوثائق (`DOMAIN-MODEL.md` · `DATA-MODEL.md` · SRS §6 بـCHG).

---

# B. Proposed Architecture

## B.1 المبدأ: الثوابت في الكود، القيم في البيانات، القرار في سياسة مُصدَّرة
```
Invariants (code, never configurable)      Policies (data, versioned, approved)         Facts (user data)
──────────────────────────────────         ──────────────────────────────────────      ─────────────────
INV-1..9 · forward-only ladder             verification_policy · readiness_rule_set    evidence · skill_claim
no AI grants a level · Verified blocked    claim_policy · assessment_context_policy    skill_progress · assessments
blind review · no number without a fact    challenge_policy · track_config_version     submissions · disclosures
                  └──────────── pure domain evaluators: f(policy, facts) → decision ────────────┘
```
- كل دالة قرار في النطاق تأخذ **السياسة مدخلًا** (`evaluateReadiness(ruleSet, facts)` · `decideVerification(policy, assessment)` · `claimEligibility(policy, claim)` · `nextProgress(transitions, event)`)، وترفض سياسة ناقصة بخطأ مُسمّى (نمط `loadWeights`).
- **لا Default مخفي:** كل قيمة ابتدائية صف بيانات باسم `DRAFT / NOT VALIDATED`، `status = draft`، `approved_by = null`. خارج الإنتاج يُسمح بتشغيل سياسة `draft` (كالـDEMO)، وفي الإنتاج يُرفض الإقلاع بسياسة غير معتمدة (نمط `CareerDataService.onModuleInit`).
- **الواجهة لا تحمل قاعدة:** الشارات والتصنيفات والحالات تأتي من الـAPI الذي يقرأ الإعدادات؛ تصنيف غير معتمد يُعرض «قيد التحقق من الخبراء» لا «أساسية».

## B.2 الطبقات
| الطبقة | المكوّنات | الملاحظة |
|---|---|---|
| **Evidence** | `evidence_type` (سجل بيانات: code · label · قناة · حقول مطلوبة · حدود الحجم) · `evidence` (مُوسَّع) · `evidence_skill_link` (evidence × skill × dominance) · `evidence_version` عبر `supersedes_evidence_id` + `attempt_number` | `evidence.skill_id` يبقى (المهارة الأولية) للتوافق؛ الربط المتعدد في الجدول الجديد |
| **Skill status** | `skill_progress` (user × skill × track: state · reason · updated) · `skill_progress_transition` (from · to · trigger · guard · enabled · version) | السلّم (`skill_claim.state`) = التحقق؛ التقدّم = الرحلة. إكمال نشاط يحرّك التقدّم إلى `evidence_submitted/under_assessment`، **ولا يمس السلّم** |
| **Rubric Engine** | الموجود + `evidence_requirement` لكل بند (نوع الدليل · الحد الأدنى · إلزامي) + `evaluator_config` (jsonb مُسنَد: `deterministic|automated_test|llm_assisted|human|hybrid` بلا اختيار نهائي) + `confidence_requirement` + `enabled` + `blocking` (= `mandatory` الموجود) | مستقل عن Frontend: لا شيء فيه يخص مسارًا |
| **Assessment** | `assessment` (تشغيل واحد: الإصدارات الثلاثة · المُقيِّم · السياق المستعمل · الخام) · `assessment_criterion_result` (مُهيكل) → **`verification_decision`** (سياسة · النتيجة · الثقة · override) | `evaluation_result` يبقى (الدرجة والتوافق الخلفي)؛ الجديد يُضاف بجانبه ويشير إليه |
| **Context Builder** | `assessment_context_policy` (لكل رُبريك/نشاط: لكل نوع مدخل `required|optional|excluded`) + البناء يمر بقائمة السماح العمياء القائمة | الهوية مستبعدة افتراضيًا **بالكود** (ثابت)، لا بالإعداد |
| **Integrity** | استبيان الإفصاح المُهيكل (٥ أسئلة كبيانات `disclosure_question`) · `verification_challenge_type` (سجل) · `challenge_policy` (لكل مهارة/نشاط/رُبريك: الأنواع والعدد والمحفّز) | لا تحدٍّ يُنفَّذ حتى تُعتمد سياسة |
| **Readiness** | `readiness_rule_set` (لكل مسار، مُصدَّر) · `readiness_rule` (`rule_type ∈ mandatory_skills · minimum_verified_skills · minimum_level · weighted_score · combination · custom`, params jsonb) · `readiness_evaluation` (نتيجة لكل مستخدم مع إصدار القواعد) | بلا مجموعة معتمدة ⇒ الجاهزية «غير محسوبة بعد» (حالة صادقة لا صفر) |
| **Career Claim Draft** | `career_claim_draft` (kind · evidence_refs · grounding_status · verification_state · generated_text · warnings · locked · policy_version · proposal_id) · `claim_policy` (لكل نوع ادعاء: المستوى الأدنى · عدد الأدلة · قوة المصدر · يحتاج تحقق) | يُولَّد عبر `agent_proposal` القائم؛ الحارس الرقمي القائم يمنع «40%» |
| **Admin / Track Builder** | `reviewer_grant.role_performed += track_admin` · `track_config_version` (لقطة مُجمَّعة لمسار: المهارات والأنشطة والرُبريكات والسياسات بإصداراتها) · API `admin/tracks/**` · واجهة `/admin/tracks` | كل تعديل = مسودة؛ النشر يُنشئ إصدارًا ثابتًا؛ كل تقييم يسجّل `track_config_version_id` |

## B.3 الإصدار والتدقيق
- **Configuration Versioning:** الصفوف الفردية تحمل `version` ودورة المراجعة القائمة؛ `track_config_version` يجمّد تركيبة المسار كاملة (قائمة معرّفات + إصدارات + hash). تعديل مسودة لا يمس إصدارًا منشورًا.
- **Assessment Versioning:** كل `assessment` و`verification_decision` و`readiness_evaluation` يسجّل: `rubric_version_id` · `track_config_version_id` · `policy_version` · `DOMAIN_RULESET_VERSION` · المُقيِّم (نوع + معرّف) · الوقت · الثقة. نتائج المستخدمين القدماء لا تتغير بتغيير الإعداد؛ إعادة التقييم سجل جديد يشير إلى القديم.
- **Audit:** `audit_event` القائم + `config_change` (من · ماذا · قبل · بعد · السبب).

---

# C. Data Model Changes (ملخص الهجرات)
| الهجرة | الجداول/الأعمدة | التوافق |
|---|---|---|
| `0011_evidence_system` | `evidence_type` (code pk · label_ar/en · channel ∈ url/file/text/system · required_fields jsonb · enabled) مع ١٦ صفًا ابتدائيًا موسومة `seeded_draft` · `evidence` + (`evidence_type_code` · `track_id` · `activity_spec_id` · `submission_id` · `source` · `title` · `description` · `url` · `upload_id` · `submitted_at` · `version` · `attempt_number` · `status` · `metadata jsonb` · `updated_at` · `supersedes_evidence_id`) · `evidence_skill_link` (evidence_id · skill_id · role ∈ primary/secondary · weight null) · RLS: المالك يقرأ ويضيف أدلته؛ لا تعديل بعد التقديم | الأعمدة الجديدة nullable أو بافتراض؛ الصفوف القديمة تُملأ (`evidence_type_code = 'automated_check_result'`/`'activity_submission'`) ويُنشأ ربطها من `skill_id` |
| `0012_skill_progress` | `skill_progress_state` (سجل حالات كبيانات لا enum) · `skill_progress` (user × skill × track_id · state · reason · last_event · updated_at) · `skill_progress_transition` (from · to · trigger · guard jsonb · enabled · version · status) مع مسودة انتقالات `DRAFT / NOT VALIDATED` | لا يمس `skill_claim` |
| `0013_structured_assessment` | `assessment` (evaluation_result_id · evaluator_kind · evaluator_ref · context_policy_version · inputs_used jsonb · raw_result jsonb · confidence · versions…) · `assessment_criterion_result` (criterion_id · status · evidence_used[] · evidence_missing[] · observations · strengths · gaps · confidence · reviewer_type · reason · recommended_next_action) · `verification_decision` (assessment_id · policy_version · decision · resulting_state · confidence · human_override_of · reviewer · reason · previous_state · new_state · decided_at) | `verification` القائم يبقى ويُغذّى كما هو |
| `0014_track_configuration` | `track_config_version` · `readiness_rule_set` · `readiness_rule` · `verification_policy` · `claim_policy` · `assessment_context_policy` · `challenge_policy` · `verification_challenge_type` · `disclosure_question` · `config_change` · أعمدة TrackSkill على `role_requirement`: `category` · `display_order` · `expected_level` · `readiness_contribution` · `enabled` · `classification_status` | كل صف جديد `status = draft` باسم DRAFT |
| `0015_career_claim_draft` | `career_claim_draft` + ربطه بـ`agent_proposal` و`professional_asset` | — |
| `0016_track_admin` | `role_performed += 'track_admin'` (ملف منفصل لقيمة enum) · سياسات خدمة فقط · `config_change` RLS | — |

---

# D. UI/UX Changes (بالنظام البصري المُجمَّد؛ لا تغيير في `apps/web/`)
| الصفحة | المحتوى | قواعد العرض |
|---|---|---|
| `/skills` (N4) | قائمة مهارات المسار من الإعداد: الاسم · التصنيف **إن كان معتمدًا** وإلا «قيد التحقق من الخبراء» · حالة التقدّم · مستوى التحقق · عدد الأدلة · الخطوة التالية | لا «أساسية/إلزامية» من `is_core` مباشرة؛ الشارة من `classification_status` |
| `/skills/[id]` (N4 panel) | الاسم · الوصف · لماذا تهم · المستوى الحالي · حالة التقدّم · التقدّم (عدّ لا نسبة) · الأنشطة المرتبطة · الأدلة · ملاحظات التقييم المُهيكلة · ما ينقص · المحاولات السابقة · الإجراء المقترح | الصياغة: «الدليل الحالي يثبت جزءًا من المهارة، ونحتاج خطوة إضافية للتأكد من …» مع إظهار حالة التحقق الحقيقية |
| `/project` (تسليم) | أنواع الدليل من السجل (رابط مستودع · diff · demo · لقطة · ملف · نص…) · ربط اختياري بمهارات · استبيان الإفصاح (٥ أسئلة) | المفاتيح من مخرجات النشاط لا من الكود |
| `/evaluation` | النتيجة المُهيكلة لكل بند (الدليل المستخدم/الناقص · ملاحظات · الإجراء التالي · الثقة · من قيّم) · ما ينتظر مراجعة | لا «فشل»؛ حالة التحقق واضحة |
| `/proposals` (+ Claim drafts) | مسودة الادعاء: حالة الإسناد · حالة التحقق · التحذيرات · مقفلة/مفتوحة بحسب السياسة · معاينة ← اعتماد | «مسودة غير مُمثَّلة كإنجاز موثَّق» حتى تتحقق السياسة |
| `/admin/tracks/**` | بناء المسار: المهارات (إضافة · تعطيل · ترتيب · تصنيف · مستوى · عدد أدلة) · الأنشطة (ربط بعدة مهارات) · الرُبريكات (بنود · متطلبات دليل · تفعيل) · قواعد الجاهزية · سياسة التحقق · سياسة الادعاء · نشر إصدار | كل حقل يحمل حالته (`draft/proposed/approved`)؛ النشر يُنشئ إصدارًا |

---

# E. Implementation Plan (مراحل صغيرة قابلة للعكس؛ تقرير في نهاية كل مرحلة)
| # | المرحلة | يبني | يغيّر سلوكًا قائمًا؟ | يحتاج موافقة §22؟ |
|---|---|---|---|---|
| 1 | **Evidence System** ✅ | 0011 · نطاق `evidence-items.ts` · API `me/evidence` (إضافة · قائمة · ربط بمهارات · سحب) · التسليم يُنشئ عناصر من ملفاته/روابطه/نصوصه · المفاتيح من مخرجات النشاط · **انحراف مُعلَن:** سجل `evidence_item` منفصل بدل أعمدة على `evidence` (D-108) | لا (إضافي؛ مُثبَت بـ٩٣ e2e) | لا |
| 2 | **Skill Status Model** | 0012 · نطاق `skill-progress.ts` (انتقالات مدخل) · الأحداث (تسليم · تقييم · طلب دليل أكثر) تحرّك التقدّم · `me/skills` يُعيد البُعدين | لا | لا |
| 3 | **Structured Assessment + Verification Decision** | 0013 · نطاق `assessment.ts` · التقييم يكتب نتائج مُهيكلة + الخام · قرار التحقق عبر سياسة **مسودة تساوي السلوك الحالي** | لا (المسودة = الحالي) | **نعم لـH6** (دليل لكل مهارة من بنودها) — يُنفَّذ خلف السياسة ومعطَّلًا حتى الموافقة |
| 4 | **Configuration & Policy Layer** | 0014 · سياسات مُصدَّرة + `track_config_version` · مُقيِّمات نقية · التقييم يسجّل إصدار الإعداد · الحزمة تحمل حقول TrackSkill | لا | لا |
| 5 | **Readiness Engine + Skill pages** | محرك القواعد (أنواع في الكود، قيم بيانات) · `/skills` · `/skills/[id]` | لا | لا |
| 6 | **AI Usage / Integrity Flow** | استبيان مُهيكل · سجل أنواع التحدي · سياسة التحدي (بلا تحدٍّ نشط) | لا | لا |
| 7 | **Career Claim Draft** | 0015 · طبقة المسودة · سياسة الفتح · واجهة | يُحوّل `presentationFor` إلى قراءة بيانات | **نعم لـH4** |
| 8 | **Admin Track Builder** | 0016 · API · واجهة · نشر إصدارات | لا | لا |
| 9 | **تصفية القواعد المثبَّتة المتبقية** | H3 · H5 إلى الإعداد | يغيّر محقق الحزمة | **نعم لـH5** |

**ما لن يحدث في أي مرحلة:** تثبيت 3/7 · مهارات إلزامية/أساسية نهائية · React شرطًا · عدد أدلة نهائي · أوزان نهائية · AI حكمًا نهائيًا · مشروع واحد يثبت مهارة تلقائيًا · إكمال نشاط = تحقق مهارة · فتح CV تلقائيًا · أي قاعدة سوق مفترضة كأنها معتمدة.

---

# F. Decisions intentionally deferred until expert validation
كلها تُحمَل كـConfiguration بحالة `draft`/`proposed`، ولا يُعتمد أيٌّ منها إلا بفعل SME مُسجَّل:
1. أي المهارات إلزامية (`role_requirement.mandatory` — جديد، مسودة false).
2. تصنيف Core / Supporting / Nice-to-have (`category` + `classification_status`).
3. هل 3 من 7 تكفي، أو أي حدّ أدنى للجاهزية (`readiness_rule_set` — لا مجموعة معتمدة).
4. العدد الأدنى من المهارات للجاهزية (`minimum_verified_skills` — قاعدة غير مفعَّلة).
5. مستوى الإتقان المطلوب لكل مهارة (`expected_level` / `target_proficiency` — `proposed`).
6. عدد الأدلة المطلوبة لكل مهارة (`minimum_evidence_count` — `proposed`).
7. نوع الدليل الأقوى وترتيب القوة (`evidence_type.strength_rank` — بلا قيمة).
8. هل مشروع واحد يكفي (`verification_policy.min_independent_evidence` — مسودة).
9. أوزان وعتبات الرُبريك (`proposed`/`TBD` كما هي).
10. شروط انتقال المهارة إلى `Demonstrated` (`verification_policy` — المسودة تساوي السلوك الحالي وموسومة كذلك).
11. شروط الجاهزية (أنواع القواعد مبنية، القيم لا).
12. شروط السماح بإضافة مهارة إلى LinkedIn و13. شروط إنشاء CV achievement (`claim_policy` لكل نوع — مسودة من `career_presentation_rule` القائمة، `proposed`).
14. متى يحتاج التقييم مراجعة بشرية و15. متى يكفي تقييم AI (`evaluator_config` لكل بند + `assessment_context_policy` + عتبات الثقة OPEN-048 — بلا اختيار).
16. هل React أو أي إطار شرط للدور (لا؛ يبقى بيانات دور قابلة للتغيير بدليل سوق — D-104).
17. الحدود النهائية لاستخدام AI من المستخدم (`ai_usage_mode` لكل نشاط + `challenge_policy` — بلا تحدٍّ نشط).
18. أنواع التحدي وعددها لكل مهارة/نشاط/رُبريك.
19. عتبات الثقة والاتساق (OPEN-048) · 20. آلية `Verified` (OPEN-047 — محجوب).

**بعد وصول رأي الخبراء** تُطبَّق الإجابات بتعديل الإعداد (مثال: «JavaScript إلزامية» = `mandatory=true` على صف TrackSkill واعتماده؛ «الحد الأدنى 5» = قيمة قاعدة `minimum_verified_skills`؛ «بند حاجب» = `mandatory=true`؛ «LinkedIn تحتاج Demonstrated» = `claim_policy.linkedin_skill.min_level`) **بلا إعادة بناء**.
