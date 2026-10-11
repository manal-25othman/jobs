# نَقْلة / NAQLA — Junior Frontend SME Integration Plan

**Date:** 2026-10-11 · **Status:** PROPOSAL. Nothing is implemented, activated, published or approved.

> **Revised (2026-10-11):** the Product Owner accepted this plan's direction conditionally and did not approve its configuration. The revision is `NAQLA-JUNIOR-FRONTEND-SME-REVISED-DECISION-PACK.md`. Its §10 lists exactly which sections of this plan it supersedes. This file stays as the record of the first proposal.

**What this is not.**
- It does not edit the SRS.
- It activates no policy and publishes no track.
- It creates no approval records.
- It alters no historical result.

The SME review and the clarifications are professional inputs, not authorization to publish (§12).

**Sources:**

| ID | Source | Identity / integrity |
|---|---|---|
| **SRC-A** | *NAQLA Junior Frontend Expert Review — Filled* (PDF, 25 pages), completed 2026-10-11 | sha256 `b47b89f237c304f261e0a87c28951041d8910113ff4d642fca16f57c24118471`. **Reviewer:** one Frontend Architect, more than 9 years' experience, who has evaluated and mentored Juniors (through team leadership, mentoring and reviews). Referred to here as **SME-JFE-01**. The name stays in the source held by the Product Owner and is not reproduced in the repository |
| **SRC-B** | The SME's follow-up clarification (Arabic, five points), relayed by the Product Owner on 2026-10-11, plus the Product Owner's English restatement (C1–C5) | Recorded verbatim in §1.2 |

**How the PDF was read.**
- Every checkbox in the form is **unmarked**. The SME recorded each choice as text in the notes column (e.g. «Must · Working · 2 · Task»).
- This plan reads those notes as the SME's selections.
- Where two answers in SRC-A disagree, the disagreement is listed in §12.1. Nothing has been resolved silently.

---

## 1. SME recommendation traceability

Each recommendation has an ID (`SME-nn`), its source (page), the SME's words, what the plan does with it (§ reference), and the kind of change:

| Change kind | Meaning |
|---|---|
| **CFG** | governed configuration |
| **EXT** | new rule type or capability (register entry) |
| **CNT** | content authoring |
| **POL** | policy change requiring approval |
| **DOC** | documentation / SRS change request |
| **REC** | recorded, no system change |

### 1.1 SRC-A (the filled PDF)

| ID | p. | SME's answer (verbatim, abridged) | Plan disposition | Kind |
|---|---|---|---|---|
| SME-01 | 1 | First 3 things a new Junior should know: «HTML وCSS وJavaScript بشكل جيد، والقدرة على فهم المتطلبات وتنفيذ واجهة متجاوبة والتعامل مع Git» | Must set (§5); Git (§4) | CFG |
| SME-02 | 1 | Not ready if: «مش قادر يكتب JavaScript أساسي، أو يفهم الكود ويصلح خطأ بسيط من غير اعتماد كامل على غيره» | JS, code reading and debugging are Must (§5) | CFG |
| SME-03 | 2 | Mid-level, not Junior: «تصميم Architecture كاملة أو قيادة القرارات التقنية والتخطيط للمشروع» | Role-definition boundary text (§6.1) | CNT |
| SME-04 | 2 | Role definition: «يحتاج تعديل بسيط: التقييم يكون عملي ومناسب لمستوى Junior» | Practical-first model (§7, §8) | REC |
| SME-05 | 2 | Most important change: «إضافة فهم الكود وDebugging وGit والتعامل مع API وحالاتها ضمن أساسيات الدور» | Must/Core sets (§5) | CFG |
| SME-06 | 3 | Semantic HTML: **Must · Working · 2 · Task** | §3, §5 | CFG |
| SME-07 | 3 | Responsive CSS: **Must · Working · 2 · Task** | §3, §5 | CFG |
| SME-08 | 3 | JavaScript Fundamentals: **Must · Working · 2 · Task** | §3, §5 | CFG |
| SME-09 | 3 | UI State & Interaction: **Core · Working · 2 · Task** | §3, §5 | CFG |
| SME-10 | 3 | API Data & States: **Core · Working · 2 · Task** | §3, §5 | CFG |
| SME-11 | 3 | Accessibility Basics: **Core · Familiar · 1 · Task** | §3, §5 | CFG |
| SME-12 | 3 | Code Reading / Debugging (one row): **Must · Working · 2 · Bug** | Two existing registry skills (§5.2, decision D-6) | CFG |
| SME-13 | 4 | Top-5 Core: «Code Reading/Debugging، Responsive CSS، Semantic HTML، JavaScript Fundamentals، API Data & States» | Conflicts with SME-09/10 and SME-17 (§12.1, C-1) | REC |
| SME-14 | 4 | Debugging/Code Reading must be Core? «نعم. المطور لازم يعرف يقرأ الكود ويتتبع المشكلة ويصلحها حتى لو بمساعدة الفريق» | §5 | CFG |
| SME-15 | 4 | React/framework: «الـFramework حسب احتياج الشركة. الأساسيات أهم، وبعدها React أو Angular يسهل تعلمها» | Unchanged: framework-neutral track (D-076) | REC |
| SME-16 | 4 | Readiness by count? «لا. العدد وحده لا يعكس الجاهزية؛ لازم أساسيات إلزامية وتطبيق عملي» | No count/percentage rule (§7) | CFG |
| SME-17 | 4 | Mandatory, non-compensable: «HTML وCSS وJavaScript وDebugging؛ ومعهم Git الأساسي» | Must set + `non_compensable_skill` (§5, §7) | CFG |
| SME-18 | 4 | 3 of 7 enough? «لا تكفي. الأفضل اجتياز كل أساسيات الـCore وتنفيذ مهمة صغيرة متكاملة» | §7 (R-C, R-I) | CFG + EXT |
| SME-19 | 5 | Mandatory + Supporting model better? «نعم، لأنه يمنع نجاح مرشح عنده فجوة أساسية، مع السماح بتطوير مهارات إضافية بعد التوظيف» | §5 | CFG |
| SME-20 | 5 | Compensation: «ممكن في مهارات Supporting، لكن ما ينفعش نعوض ضعف JavaScript أو HTML بقوة في أداة أخرى» | Supporting skills have no readiness rule (§7) | CFG |
| SME-21 | 5 | Strong in 3, weak in 4? «فقط لو عنده الأساسيات ويثبت سرعة التعلم عمليًا؛ غير كده يحتاج تدريب إضافي» | Covered by Must/Core minimums; "learning speed" is not measured (§12.3) | REC |
| SME-22 | 5 | How to test without theory: «مهمة واجهة، إصلاح Bug، استدعاء API، شرح جزء من كوده، وتجربة Responsive وAccessibility» | Integrated assessment (§8) | CNT |
| SME-23 | 5 | One project enough? «مشروع واحد جيد كبداية، لكن الأفضل مهمة جديدة أو تعديل مباشر للتأكد إن المهارة مش حفظ» | Evidence composition (§5.3), with SRC-B C3 | CFG + EXT |
| SME-24 | 6 | Strongest evidence: «مزيج من Code/Diff وDemo وشرح بسيط؛ مع Bug Fix صغير للتأكد من الفهم» | §8 deliverables | CNT |
| SME-25 | 6–10 | Criteria importance, how to prove each, and whether its absence blocks Demonstrated (rows below) | Criterion mapping (§8.4) | CNT + CFG |
| | | · صحة التنفيذ — Critical · Task + Demo · **blocks** | | |
| | | · التعامل مع الحالات — Critical · Task · **blocks** | | |
| | | · جودة Debugging — Critical · Bug Fix · **blocks** | | |
| | | · فهم الكود — Critical · Code Reading · **blocks** | | |
| | | · وضوح القرار — Important · Explanation · does not block | | |
| | | · التحقق من مخرجات AI — Important · تعديل + شرح · **blocks** | | |
| | | · عدم الانحدار — Important · Test/Check · does not block | | |
| | | · Accessibility basics — Important · Task + Demo · does not block | | |
| SME-26 | 10 | Minimum the evaluator needs: «وصف المهمة، معايير واضحة، الكود، نتيجة التشغيل، وشرح المرشح لأهم القرارات» | Assessment context (§9.3) | CFG |
| SME-27 | 10 | Biasing information: «الاسم، الصورة، الجامعة والجهة السابقة… الأفضل إخفاؤها في التقييم التقني الأول» | Already enforced: identity and profile excluded (context policy, HR-004) | REC |
| SME-28 | 11 | CV/LinkedIn in evaluation: «مفيدين بعد التقييم التقني لفهم الخبرة، لكن مش دليل كافٍ على المهارة» | Unchanged: `user_profile` excluded | REC |
| SME-29 | 11–13 | Evaluator inputs: Task brief, Rubric, Code/Diff, User explanation = **Essential**; Demo, Screenshots, Automated checks, AI disclosure, Previous attempt = **Helpful**; CV/LinkedIn = **Not needed**; Identity = **Should not be shown** | §9.3; demo/screenshot capture missing (§10) | CFG |
| SME-30 | 13 | Understanding probe: «يطلب شرح جزء من الحل وتعديل بسيط عليه مباشرة… غيّر حالة API من نجاح إلى Error، أو عدّل سلوك زر؛ واطلب منه يشرح التغيير» | Follow-up modification round (§8.3; capability missing, §10) | EXT |
| SME-31 | 14 | AI use: «مقبول في التعلم، البحث، وتوليد أفكار أو مسودة كود بشرط مراجعته. مشكلة لو لا يفهم ما يسلّمه أو لا يختبره» | Consistent with D-111 (AI allowed; understanding assessed) | REC |
| SME-32 | 14 | Proof of understanding: «يشغّل الحل، يشرح قراراته، يصلح Bug غير متوقع، ويكتب تعديل صغير بنفسه» | §8 | CNT |
| SME-33 | 15 | Case 1 (responsive page + demo, no explanation, no Git): «جزئيًا؛ يثبت المظهر… لازم نتأكد من فهمه للكود»; needs «شرح HTML/CSS وتعديل Responsive مباشر»; CV: «نعم، كتنفيذ واجهة Responsive فقط» | Explanation + modification required (§8) | REC |
| SME-34 | 16 | Case 2 (heavy AI, fixed a new bug and explained): «نعم… دليل جيد»; more: «تعديل ثانٍ واختبار النتيجة»; CV: «نعم، للمهارات التي أثبتها فقط» | §8 | REC |
| SME-35 | 16–17 | Case 3 (API success only, no states): «لا. نجاح API وحده لا يكفي»; needs Loading, Error, Empty; CV: «بعد إكمال حالات API، نعم» | API states criteria (§8.4) | CNT |
| SME-36 | 17–18 | Case 4 (3 of 7, weak HTML/Git/a11y/testing): «لا؛ ضعف HTML وGit وAccessibility مؤثر»; CV: «لا نذكر جاهزية عامة قبل سد فجوات الأساسيات» | §7; Git Must (§4) | CFG |
| SME-37 | 18 | Case 5 (CV "40%" with no measurement): «لا. 40% تحتاج قياسًا قبل وبعد»; CV: «نعم بعد التوثيق، وإلا دون نسبة رقمية» | Already enforced by grounding (D-114, BR-026). Claim policies unchanged (§11) | REC |
| SME-38 | 19 | Case 6 (one Responsive activity → LinkedIn skill?): «دليل أولي، لكنه لا يثبت إتقانًا متكررًا»; more: «نشاط آخر أو تعديل مختلف»; CV: «يمكن ذكرها كمهارة أساسية بعد التأكد من الفهم» | Claim-policy recommendation, pending (§11) | POL |
| SME-39 | 19–21 | Case 7 (good theory, fails simple bug): «لا. النظري وحده لا يثبت القدرة على التنفيذ»; more: «مهمة Bug أخرى مع شرح الإصلاح» | Practical-first (§8) | REC |
| SME-40 | 20–21 | Case 8 (evaluator sees CV, name, university): «لا؛ الاسم والجامعة وCV قد يسببوا تحيزًا»; CV: «نعم، إذا كان إنجازًا مثبتًا وبصياغة مناسبة لمستواه» | Already enforced (HR-004, context policy) | REC |
| SME-41 | 22 | Common interview questions: let/const, == vs ===, Responsive, API error, tracing a bug in the browser | Item bank for integrated tasks (§8.5) | CNT |
| SME-42 | 22 | Short practical interview tasks: «بناء Card متجاوب، جلب بيانات API، إصلاح Bug بسيط، أو قراءة كود وشرح وظيفته» | §8 | CNT |
| SME-43 | 22 | Fastest probe: «أعطيه كود فيه Bug، وأطلب منه يحدد السبب ويصلحه ويشرح ماذا غيّر» | §8 debugging part | CNT |
| SME-44 | 22 | «أفضل 70% عملي و30% نظري» | NAQLA has no theory instrument; the SME's C1 says no separate theory test is needed (§12.3) | REC |
| SME-45 | 23 | 10 interview tasks: Semantic HTML page; Responsive; API with 3 states; form validation; array map/filter; loading/error/empty; bug fix; component reading; Git commit/branch; keyboard navigation; modifying AI-generated code | Item bank (§8.5) | CNT |
| SME-46 | 23 | Five probes mapped to what a good answer proves: build a Form → HTML (sound structure); responsive Card → CSS (understands layout); fix a Bug → JavaScript (traces logic); show API states → API States (stable UI); make a commit → Git (organises changes) | Criteria wording (§8.4) | CNT |
| SME-47 | 23 | LinkedIn Skill when: «لما يطبقها بنفسه في مهمة حقيقية ويشرح قراراته؛ الأفضل دليلان، حتى لو صغيرين» | Claim-policy recommendation, pending (§11) | POL |
| SME-48 | 24 | CV bullet when: «بعد تنفيذ عمل واضح يمكن إثباته بالكود أو Demo، ومع قياس موثق لأي أرقام» | Matches D-114 grounding (§11) | REC |
| SME-49 | 24 | LinkedIn skill vs CV achievement: «لا. إضافة Skill تحتاج إثبات استخدامها، أما CV Achievement فيحتاج أثر ونتيجة مثبتة» | Recommendation, pending (§11) | POL |
| SME-50 | 24 | Overclaim examples: «قدت معمارية النظام بالكامل» or «رفعت الأداء 80%» without a clear role or measurement | Grounding lexicon candidates (§11) | CNT |
| SME-51 | 24 | Three biggest errors: «اعتماد 3 من 7، الاعتماد على النظري، وإهمال إثبات فهم الكود» | §7, §8 | CFG |
| SME-52 | 24 | Three missing additions: «Git أساسي، مهام API كاملة، وقياس Debugging عملي» | §4, §8 | CFG + CNT |
| SME-53 | 25 | Three changes to assessment logic: «Core إلزامي، Rubric موحد، وأدلة عملية قصيرة بدل الاعتماد على عدد المهارات» | §5, §7, §8.4 (one rubric for the integrated assessment) | CFG + CNT |
| SME-54 | 25 | Count or mandatory set? «مجموعة Core إلزامية أولًا، ثم Supporting لتمييز المرشحين؛ العدد وحده مضلل» | §5, §7 | CFG |
| SME-55 | 25 | Pilot? «نعم، بعد التعديلات ومع تجربة صغيرة؛ لنرى هل النتائج عادلة وسهلة التطبيق» | §13, stage S6 | REC |
| SME-56 | 25 | Overall decision: **«يحتاج تعديلات بسيطة قبل التجربة»** | This plan | REC |

### 1.2 SRC-B (follow-up clarification, verbatim)

| ID | SME's words (Arabic, verbatim) | PO restatement | Disposition |
|---|---|---|---|
| **C1** | «أفضل اعتبار Git مهارة أساسية يتم تقييمها ضمن المهام العملية، وليس من خلال اختبار نظري مستقل. المهم أن المتقدم يعرف يستخدم Commit وBranch وPull Request ويفهم التغييرات التي أجراها على الكود.» | Git is foundational, assessed inside practical activities; no separate theory test | §4 |
| **C2** | «Must: مهارات إلزامية لا يمكن اعتبار المتقدم جاهزًا بدون إثبات الحد الأدنى منها. Core: مهارات أساسية أيضًا، لكن يمكن قبول تفاوت في مستوى إتقانها، بشرط الوصول إلى الحد الأدنى المطلوب لمستوى Junior.» | Must = proven minimum, non-compensable; Core = matters, variation allowed above the Junior minimum | §5.1, §7 |
| **C3** | «يكفي مشروع عملي مع مهمة قصيرة مستقلة، بشرط أن تكون المهمة مختلفة وتثبت أن المتقدم قادر على تطبيق المهارة بنفسه، وليس فقط تكرار نفس الحل. لا أرى ضرورة لطلب مشروعين منفصلين لكل مهارة.» | Project + distinct short task suffices; the task must show independent application | §5.3, EXT-2 |
| **C4** | «المهمة العملية الجديدة، مع اجتياز الاختبارات التقنية، وشرح القرارات، والقدرة على تعديل الكود، تمثل أدلة كافية للتقييم الآلي في معظم المهارات… مراجعة بشرية للحالات الاستثنائية… لا أرى ضرورة لمراجعة بشرية لكل حالة، بشرط أن تكون معايير التقييم والاختبارات واضحة وموثوقة.» | Automated assessment for most skills after calibration and approval; human review for borderline, conflicting or ambiguous cases | §9 |
| **C5** | «اجتياز جميع مهارات Must بالمستوى المطلوب. تحقيق الحد الأدنى المحدد لمهارات Core، دون اشتراط الإتقان المتقدم. اجتياز مهمة عملية متكاملة تجمع المهارات الأساسية، مثل بناء واجهة Responsive، والتعامل مع API وحالات Loading وError، وإصلاح Bug بسيط… بدل الاعتماد على عدد المهارات أو نسبة ثابتة مثل 3 من 7.» | Readiness = all Must at required level + all Core at Junior minimum + integrated practical assessment passed | §7 |

## 2. Current canonical configuration (audit)

| Item | Current state (code `aa41977`, fresh database) |
|---|---|
| Pack | `trk_frontend_junior@0.2.1`, labelled **DEMO / DRAFT / NOT SME APPROVED**, `is_demo_fixture = true`, `drafting_aid = ai_assisted`. Role `frontend-developer-junior`: draft, demo |
| Role-skill map | 12 requirements: 5 `is_core` (HTML, CSS, JS, UI state, API states) and 7 supporting. Importance: critical ×3, high ×5, medium ×4. Proficiency: `working` ×6, `foundation` ×6. Minimum evidence: 2 ×5, 1 ×7. **All `classification_status = pending_expert_validation`**; `category`, `expected_level` and `readiness_contribution` are **null** |
| Git | Registry skill **`skl_version_control_basics`** exists (supporting, foundation, evidence `process_trace`). **No activity lists it and no rubric criterion is linked to it**, so it cannot be assessed today |
| Activities / rubrics | 3 pack activities: `build_interface` (120 min), `debug_improve` (90), `change_request` (90). All `junior`, none a validation activity. **All 19 skill criteria are `evaluator_type = human`**, plus one rule gate each (`deliverables_complete`). Weights and thresholds are `proposed`; no rubric values are SME-approved |
| Integrity checks | Per activity: deterministic presence or text-length checks; `human_observable` inputs for reviewers; 3 `future_deterministic` checks **inactive** (follow-up round, rendering runner) |
| Readiness | Engine with 6 rule types. **No `readiness_rule_set` exists** (`not_yet_configured`) |
| Track config | `track_config_version` v1 "draft v1": development-only, `applies_skill_config = false` |
| Verification | `default@2` safety baseline (D-118): `independently_verified`, no Practiced on submission, no H6 |
| Assessment context | `default@1`: identity and profile excluded; artifacts and AI disclosure required |
| Claim policies | `legacy_presentation@1` baselines in effect; `default@1` per kind inactive. Unchanged by this plan |
| SRS | v1.11 baseline approved. Already consistent with the SME on: human review as calibration and exception (§2.7, D-101 · HR-001/007); readiness as a report over configured rules (BR-024); Verified blocked (D-102); blind review (HR-004). **"3 of 7" is not in the SRS**: it was an open question in `CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md` §1/§5 |

## 3. Current-to-proposed configuration diff (per skill)

The SME's proficiency vocabulary maps onto the existing scale (`proficiency_scale@1.0.0`):
- **Familiar → `foundation`**
- **Working → `working`**
- Strong was not used.

The proposed values carry `classification_status = proposed` until the SME confirms them in the Track Builder **and** the Product Owner activates the version (§13).

| Skill (registry, unchanged) | Before: is_core · importance · proficiency · min evidence · evidence types · auto? | **Proposed: category · is_core · proficiency (Junior minimum) · required level · evidence rule · readiness role** | SME source |
|---|---|---|---|
| `skl_html_semantic` | core · critical · working · 2 · artifact, rationale · partial | **must** · core · **working** · demonstrated · project + distinct short task · non-compensable | SME-06, 17, C2, C3 |
| `skl_css_responsive` | core · critical · working · 2 · artifact · partial | **must** · core · **working** · demonstrated · project + distinct short task · non-compensable | SME-07, 17 |
| `skl_js_fundamentals` | core · critical · working · 2 · artifact, rationale · partial | **must** · core · **working** · demonstrated · project + distinct short task · non-compensable | SME-08, 17 |
| `skl_frontend_debugging` | supporting · high · **foundation** · **1** · artifact, rationale · **no** | **must** · **core** · **working** · demonstrated · **2: bug fix in a project + a distinct bug-fix task** · non-compensable | SME-12, 14, 17, 43 |
| `skl_code_reading` | supporting · high · **foundation** · **1** · rationale, process_trace · no | **must** · **core** · **working** · demonstrated · **2, sharing the debugging evidence path** (reading + explaining the cause) · non-compensable | SME-12, 14; **decision D-6** |
| `skl_version_control_basics` (Git) | supporting · medium · foundation · 1 · process_trace · no | **must** · **core** · **foundation ("Git الأساسي")** · demonstrated · **observed within practical activities**; count is an **SME value** (V-3) · non-compensable | SME-17, 36, 52; **C1** |
| `skl_ui_state_interaction` | core · high · working · 2 · artifact, rationale · partial | **core** · core · **working** · demonstrated · project + distinct short task · required minimum (compensable above it) | SME-09, C2 |
| `skl_api_data_states` | core · high · working · 2 · artifact, rationale · partial | **core** · core · **working** · demonstrated · project + distinct short task · required minimum | SME-10, 35, C2 |
| `skl_accessibility_basics` | supporting · medium · foundation · 1 · artifact · partial | **core** · **core** · **foundation** · demonstrated · **1 task** · required minimum; **its absence does not block Demonstrated of other skills** | SME-11, 25 |
| `skl_forms_validation` | supporting · high · working · 1 · artifact | **supporting** (unchanged values) · no readiness rule | SME silent; **D-7** |
| `skl_technical_explanation` | supporting · medium · foundation · 1 · rationale | **supporting** · no readiness rule; **explanation remains a required criterion inside activities** (SME-26/29) | SME-25 (decision clarity: Important, not blocking) |
| `skl_requirements_reading` | supporting · medium · foundation · 1 · rationale | **supporting** (unchanged) · no readiness rule | SME silent; **D-7** |

**Net effect:** Must 6 · Core 3 · Supporting 3, and `is_core` true for 9 (Must ∪ Core). The new `category` value (`must` | `core` | `supporting`) uses the **existing** governed field. `readiness_contribution = counts` for Must and Core, `informational` for Supporting.

## 4. Git without duplicating the registry

- **One skill, the existing one.** `skl_version_control_basics` stays the only Git skill. No new skill, synonym or alias.
- **The skill definition is updated through content review**, not code. Proposed observable indicators, from C1:
  1. commits that are small and described («ينظّم التغييرات»);
  2. work done on a branch;
  3. a pull request whose description says what changed and why;
  4. the candidate can explain the diff of their own change.
- **Assessed inside practical activities, never by a theory test (C1).** Each practical activity and the integrated assessment add:
  - a deliverable **`link.repository`**: the repository with branch and PR, submitted through the existing `externalUrls`, never a client key;
  - a criterion **`git_workflow`** linked to `skl_version_control_basics`.
- **Today the criterion can only be human-observable.** The repository link is a `submitted_link` (D-118 provenance) and its content is not verified.
- **Automated assessment needs a Git evidence producer (CAP-6, §10).** It would read commit, branch and PR facts with recorded provenance (`verified.git.*`) and is not built.
- **Without either the criterion or the producer, the Git Must rule can never be satisfied.** That is the correct, fail-closed outcome: readiness stays unattainable rather than satisfied without proof.

## 5. Skill classifications and evidence rules

### 5.1 Semantics (from C2, kept as data, not code)

| Class | Meaning | Configuration |
|---|---|---|
| **Must** | No readiness without proven minimum; **non-compensable** | `category = must`, `is_core = true`, plus one `non_compensable_skill` readiness rule per skill |
| **Core** | Matters for readiness; variation above the Junior minimum is accepted; the minimum itself is not compensable | `category = core`, `is_core = true`, plus one `required_skill_at_level` rule per skill |
| **Supporting** | Distinguishes candidates (SME-54); no readiness effect; may compensate only among supporting skills (SME-20) | `category = supporting`, `readiness_contribution = informational`, no rule |

### 5.2 The Code Reading / Debugging row (SME-12)

- The SME wrote one row for two registry skills. They stay **two skills**: they are different observable behaviours, and merging them would rewrite history.
- Both get the row's values (Must · Working · 2 · Bug).
- **Shared evidence path:** one bug-fix assessment with two criteria:
  - `root_cause_fixed` → debugging;
  - `cause_explained_from_code` → code reading.
- **Decision D-6:** confirm both as Must, or keep code reading as Core.

### 5.3 Evidence composition (C3, SME-23)

- For a skill whose minimum is **2**, the two evidence records must come from **different activities**.
- At least one of them must be a **distinct short task**: an activity flagged `is_validation_activity`, the field that already exists on `activity_spec`.
- **Same-activity resubmissions do not count twice.** They are repetition, not independent application.
- **Accessibility (minimum 1):** one task.
- **Git:** observed in at least *n* practical activities (*n* is an SME value, V-3).
- The current `min_evidence_per_skill` counts standing evidence rows and cannot tell repetition from independent work. **This needs extension EXT-2 (§7).**

### 5.4 What "required level" means (an approval question, D-1)

**Proposal:**
- **Readiness state.** Every Must and Core rule uses the verification state **`demonstrated`**.
- **Where the proficiency lives.** The skill's Junior minimum (`working` / `foundation`) is carried by:
  - the **rubric level descriptors**, which an SME calibrates against that proficiency;
  - the **evidence composition** (§5.3).
- **Why this way.** It needs no new level ladder, and the D-118 integrity rules still apply in full.

**Alternative (not recommended):**
- Map `foundation` to `practiced`.
- Under the D-118 safety baseline, Practiced is no longer awarded on submission, so it would itself need an independently verified basis. That makes the alternative no easier.

## 6. New candidate track version

These are drafts. Each is born **draft / inactive** through the existing governed flows, never through a migration that activates anything.

### 6.1 Content: pack `trk_frontend_junior@0.3.0-candidate`

| Change | From | Notes |
|---|---|---|
| Role definition | 0.2.1 text | Add SME-03 (Mid-level boundary), SME-05 (code understanding, debugging, Git, API states as fundamentals) and SME-15 (framework-neutral, unchanged) |
| Role-skill map | 0.2.1 | The §3 values; `CHANGES.md` entry citing SME-nn |
| Skill definition | `skl_version_control_basics` | §4 indicators |
| Activities | 3 | Add the `link.repository` deliverable and a `git_workflow` criterion to each. Make `responsive_layout` mandatory in `build_interface` (CSS is Must). Add **two short validation tasks** (`is_validation_activity = true`) and **one integrated assessment** (§8) |
| Rubrics | 3 | Criteria aligned to SME-25 (§8.4); **values stay `proposed`** until the SME approves them (OPEN-043) |

**Demo status.** The current pack is a DEMO fixture, and demo content can never be SME-approved (database guard).
- **Path:** the existing promotion flow (`content_promotion`) creates non-demo review copies. These go through draft → curated → sme_reviewed (named SME) → approved → published (Product Owner, separation of duties).
- **Decision D-2:** confirm this path, rather than editing demo rows.

### 6.2 Configuration (governed, draft)

```text
track_config_version  frontend-developer-junior v2  label "SME-JFE-01 candidate"
                      review_status draft · activation inactive · applies_skill_config true
                      carries track-skill changes TSC-01..TSC-12 (one per §3 row), each proposed by
                      track_admin, decided by the SME (professional values) — four eyes, Phase 8/9 separation.
readiness_rule_set    key junior_frontend_readiness · version 1 · target_role frontend-developer-junior
                      review_status draft · activation inactive (rules in §7)
verification_policy   unchanged (default@2 safety baseline). A future automated-basis policy is §9.4.
assessment_context    proposed default@2 (§9.3), draft · inactive
claim_policy          UNCHANGED (§11)
```

## 7. Readiness rule configuration

The rule set implements C5's three conditions. There is **no percentage, no skill count and no `min_skills_at_level`**.

| Rule | Type | Skill | Params | C5 condition | Available today? |
|---|---|---|---|---|---|
| R-M1 | `non_compensable_skill` | `skl_html_semantic` | `min_level: demonstrated` | 1 | yes |
| R-M2 | `non_compensable_skill` | `skl_css_responsive` | `min_level: demonstrated` | 1 | yes |
| R-M3 | `non_compensable_skill` | `skl_js_fundamentals` | `min_level: demonstrated` | 1 | yes |
| R-M4 | `non_compensable_skill` | `skl_frontend_debugging` | `min_level: demonstrated` | 1 | yes |
| R-M5 | `non_compensable_skill` | `skl_code_reading` | `min_level: demonstrated` | 1 | yes (D-6) |
| R-M6 | `non_compensable_skill` | `skl_version_control_basics` | `min_level: demonstrated` | 1 | yes; unattainable until Git is assessable (§4) |
| R-C1 | `required_skill_at_level` | `skl_ui_state_interaction` | `min_level: demonstrated` | 2 | yes |
| R-C2 | `required_skill_at_level` | `skl_api_data_states` | `min_level: demonstrated` | 2 | yes |
| R-C3 | `required_skill_at_level` | `skl_accessibility_basics` | `min_level: demonstrated` | 2 | yes |
| R-E1 | **`min_independent_evidence_per_skill`** (EXT-2) | each Must/Core skill | `min_count` from the role requirement (2, or 1 for accessibility); `distinct: activity`; `require_validation_activity: true` when `min_count ≥ 2` | 1 + 2 ("required level" = proven by independent application, C3) | **no** |
| R-I1 | **`integrated_assessment_passed`** (EXT-1) | — | `activity_slug: act_fe_integrated_junior`, `outcome: passed`, `decision_in: [accepted]`, `allowed_versions: [approved list]` | 3 | **no** |

**Why the rules are per skill.** Rather than `all_core_skills_at_level`, each skill gets its own rule. Core minimums differ by skill (C2), and per-skill rules report exactly which skill is missing (BR-024: a report, not a verdict).

**How a rule set becomes visible.**
- **Before activation:** readiness reports `not_yet_configured`.
- **Activated but not validated** (development only): `pending_validation`, with the neutral headline.
- **Only validated and `production_active`** gives `evaluated`.
- **The engine never changes a verification level** (BR-024).

**Proposed extension register entries.** The Product Owner records them; per the register, I do not:

| EXT | Expert criterion | Why no supported type fits | Proposed shape |
|---|---|---|---|
| **EXT-1** | C5 condition 3: «اجتياز مهمة عملية متكاملة» | Readiness facts are per-skill claim states and evidence counts. No type reads an assessment outcome | New rule type `integrated_assessment_passed {activity_slug, outcome, decision_in, allowed_versions}`. Its fact is a standing, non-withdrawn evaluation of an approved activity version with an accepted verification decision. Indeterminate when that activity is not published |
| **EXT-2** | C3: «مشروع عملي مع مهمة قصيرة مستقلة… ليس فقط تكرار نفس الحل» | `min_evidence_per_skill` counts rows. Resubmissions of one activity would count as independent | New rule type `min_independent_evidence_per_skill {min_count, distinct: 'activity', require_validation_activity}`. Its fact is the distinct `activity_spec` ids behind standing evidence, plus the validation flag |

## 8. Integrated practical assessment

### 8.1 Purpose and scope (C5, SME-18/22/32/42/43)

**One activity, `act_fe_integrated_junior` (candidate),** of about 150–180 minutes; the exact duration is an SME value (V-6). In it the candidate:
1. builds a **responsive** view, semantically structured, from a brief;
2. **consumes a mock API** and implements **loading, error and empty** states;
3. **fixes a planted bug** in supplied code and explains its cause;
4. answers short questions **explaining two decisions** in their own code;
5. completes a **follow-up modification** after submission (e.g. «غيّر حالة API من نجاح إلى Error، أو عدّل سلوك زر») and explains it (SME-30);
6. works in **Git**: branch, commits, and a PR with a description (C1).

It is the readiness gate (R-I1). It is **not** the only evidence: the per-skill rules still require project plus distinct task evidence.

### 8.2 Inputs (platform-provided; Phase 3 materials dependency)

| Input | Private? | Note |
|---|---|---|
| Brief and acceptance list | learner-visible | SME-authored |
| Starter repository with one planted bug | **platform-private** (`contains_planted_issue`) | Learner sees «مادة تُقدَّم مع النشاط» (D-119 projection) |
| Mock API (200 / 500 / empty / slow) | platform-private behaviour | Needs the mock-API service (CAP-4) |

### 8.3 Deliverables (declared, explicit mapping, A3)

| Key | Kind |
|---|---|
| `file.index_html`, `file.styles_css`, `file.app_js` | file |
| `note.data_flow`, `note.bug_cause` | text |
| `answer.decision_1`, `answer.decision_2` | text |
| `link.repository` | via `externalUrls` |
| *(follow-up round)* `file.app_js@followup`, `note.followup_change` | needs CAP-7 |

### 8.4 Rubric: SME criteria mapped to existing criteria

| SME criterion (SME-25) | Importance → proposed `mandatory` / blocks Demonstrated | Integrated-task criterion | Reuses (existing key → activity) | Linked skill |
|---|---|---|---|---|
| صحة التنفيذ | Critical → mandatory, **blocks** | `implementation_correct` | `semantic_structure` (build_interface), `js_correctness` (change_request) | html, js |
| (responsive) | Critical (CSS is Must) → mandatory | `responsive_layout` | `responsive_layout` (build_interface, currently non-mandatory), `responsive_fixed` (debug_improve) | css |
| التعامل مع الحالات | Critical → mandatory, **blocks** | `data_states` | `data_states` (build_interface), `empty_state_correct` (change_request) | api_states |
| (UI state) | Core | `state_transitions` | `state_transitions` (build_interface), `filter_in_state` (change_request) | ui_state |
| جودة Debugging | Critical → mandatory, **blocks** | `root_cause_fixed` | `root_cause_fixed` (change_request), `root_cause_note` (debug_improve) | debugging |
| فهم الكود | Critical → mandatory, **blocks** | `cause_explained_from_code` | `code_reading` (change_request), `scope_discipline` (debug_improve) | code_reading |
| التحقق من مخرجات AI | Important, but **blocks** (SME) → mandatory | `modification_and_explanation` (follow-up round) | none; new; needs CAP-7 | js (D-8) |
| وضوح القرار | Important → not mandatory | `decision_clarity` | `explanation_clarity`, `decision_explained` | technical_explanation |
| عدم الانحدار | Important → not mandatory | `no_regression` | none; new; needs CAP-1 | js |
| Accessibility basics | Important → not mandatory, **does not block** | `a11y_basics` | `a11y_basics_fixed` (debug_improve) | accessibility |
| Git (C1) | Must → mandatory | `git_workflow` | none; new | version_control |
| Gate | — | `deliverables_complete` (gate, rule) | existing pattern | — |

**Pass rule (V-4, an SME value):**
- the gate passes;
- every **mandatory** criterion meets its threshold;
- the total meets the rubric's pass threshold.

All weights and thresholds remain `proposed` until the SME approves them (OPEN-043).

### 8.5 Item bank (content only)

SME-41, 45 and 46 become authored variants, so the follow-up and short tasks are **different** from the project (C3), not repetitions:
- a semantic page and form;
- a responsive card;
- a fetch with three states;
- form validation;
- array map/filter;
- reading a component;
- keyboard navigation;
- modifying AI-generated code;
- commit and branch.

The two **short validation tasks** draw from this bank:
- **Task A:** responsive card plus fetch with states.
- **Task B:** given code with a bug, find, fix and explain it.

## 9. Automated-versus-human assessment boundaries

### 9.1 The rule (C4, SRS §2.7, D-101)

> Automated by default **after** calibration and approval; human only for defined exceptions. Never automated **before** an independently verifiable basis exists (D-118).

### 9.2 Per criterion

| Criterion | Today (only honest option) | Target after calibration | Producer needed | Human escalation triggers (target) |
|---|---|---|---|---|
| implementation_correct | human | **automated**: hidden test suite run by the platform | CAP-1, CAP-3 | tests pass but explanation fails (conflict) · score within the borderline band |
| responsive_layout | human | **automated**: rendering at configured viewports, overflow and layout assertions | CAP-2 | visual ambiguity flagged by the runner |
| data_states | human (`human_observable` inputs exist) | **automated**: mock API forces 200/500/empty/slow; DOM state assertions | CAP-4, CAP-2 | conflict with explanation |
| state_transitions | human | **automated**: interaction script | CAP-2 | — |
| root_cause_fixed | human | **automated**: planted-bug regression test | CAP-1 | fix passes but cause note is wrong |
| cause_explained_from_code | human | **human-calibrated, then structured automation** (cause chosen from code locations, explained against a key); **no LLM** (AI-BOUNDARY) | CAP-8 | borderline band, or any disagreement |
| modification_and_explanation | not possible today | **automated** follow-up tests plus structured explanation | CAP-7, CAP-1 | follow-up fails but the original passed (possible not-own work); handled as context, never as an accusation (D-111) |
| decision_clarity | human | human sample, or structured prompts | — | — |
| no_regression | not possible today | **automated**: the original suite re-run after the fix | CAP-1 | — |
| a11y_basics | human | **automated subset** (accessibility rules, keyboard path), plus a human sample | CAP-5 | — |
| git_workflow | human (link reviewed) | **automated**: commit, branch and PR facts | CAP-6 | history missing or rewritten |
| deliverables_complete (gate) | rule, presence only | unchanged | — | — |

### 9.3 Evaluator inputs (SME-26/29), proposed `assessment_context_policy default@2` (draft)

| Input | Setting |
|---|---|
| Task brief | required |
| Rubric | required, for the reviewer only (never to the learner, D-119) |
| Submission artifacts (code/diff) | required |
| User explanation | required |
| Automated check results | optional |
| AI disclosure | optional (context, never a penalty) |
| Previous attempts | optional |
| Demo / screenshots | optional; needs CAP-9 |
| User identity, user profile, CV/LinkedIn | **excluded** (unchanged) |

### 9.4 The policy that would enable automation (later, separately approved)

- A new `verification_policy` version, still `promotion_basis = independently_verified`.
- `escalate_on` configured with the C4 triggers: borderline band, conflicting signals, ambiguous result, plus an HR-002 calibration sample.
- It becomes possible only when criteria rest on **`platform_verified`** artifacts from CAP-1…7, which requires a provenance column (CAP-10) and its own review.
- It needs **SME approval of the calibrated values and Product Owner activation.**
- **The `default@2` safety baseline stays in effect until then.** No automatic level, no H6, no Verified.

## 10. Missing technical capabilities

| CAP | Capability | Executable today? | Status |
|---|---|---|---|
| — | Presence and length checks on submitted files and text (`artifact_present`, `all_of`, `artifact_text`); blocking integrity gate | **yes** | Proves only that something was submitted, never content (D-118). **Not skill evidence** |
| — | Human review with named reviewers, blind, on SME-approved non-demo rubrics | **yes** | The only route to Demonstrated today |
| CAP-1 | Sandboxed code test runner producing `verified.tests.*` (hidden suites, regression re-run) | no | Needs implementation **and** calibration. Isolated execution, no network, resource limits |
| CAP-2 | Headless rendering runner (viewports, layout assertions, interaction scripts) | no | Implementation + calibration. Was `output_consistency_layout` (inactive) |
| CAP-3 | Static structural analysis (HTML semantics, JS syntax and lint) | no | Implementation + calibration |
| CAP-4 | Mock API service with controllable responses for activities | no | Implementation (described in inputs only today) |
| CAP-5 | Automated accessibility rule checks plus keyboard-path script | no | Implementation + calibration; automated checks cover only a subset |
| CAP-6 | Git evidence producer (read-only repository facts: branch, commits, PR) | no | Implementation + privacy review (repository access consent) |
| CAP-7 | Post-submission follow-up modification round | no | Implementation. The `followup.*` checks are `future_deterministic` and inactive |
| CAP-8 | Structured explanation capture (choose a cause or code location, then a short justification) | partial | Text deliverables exist. Structured items and keys need implementation; **no LLM** |
| CAP-9 | Demo / screenshot capture | partial | The `screenshot` evidence type exists; no capture flow in the workspace |
| CAP-10 | `platform_verified` provenance column and producer registry | no | Called out in the D-118 report; needed before any automated basis |
| CAP-11 | Readiness rule types EXT-1 and EXT-2 | no | Domain type + tests + Track Builder kind (register procedure) |
| CAP-12 | Per-skill evidence from one multi-skill run (H6) | exists behind a flag | **Activation blocked.** The integrated task needs it, or one primary skill per run (**decision D-5**) |
| CAP-13 | Calibration workflow (golden set, agreement rate, borderline band) | fields exist (`golden_set_size`, `agreement_rate`) | Workflow and tooling not built (HR-002/003) |
| CAP-14 | Starter materials delivery (private, signed, versioned) | no | Phase 3 |
| CAP-15 | Readiness display that names Must vs Core | partial | Skill pages show readiness rules; category labels need copy only |

## 11. Claims, CV and LinkedIn: unchanged

SME-37, 38, 47, 48, 49 and 50 are **recommendations**:
- LinkedIn skill: applied independently in a real task, decisions explained, preferably two small evidences.
- CV bullet: clear, provable work; measured numbers only.
- A LinkedIn skill needs less than a CV achievement.
- Overclaim examples.

**Current policies are unchanged:**
- `legacy_presentation@1` baselines are in effect;
- `default@1` per kind is inactive;
- grounding under D-114 and BR-026 already refuses unmeasured numbers.

**If approved later:**
- a `linkedin_skill` policy with a minimum **independent evidence count of 2**, using the existing field `min_evidence_count`;
- grounding-lexicon entries for the SME's overclaim patterns («قدت معمارية النظام بالكامل», unmeasured "X%").

Each needs separate SME approval and Product Owner activation (decision D-9).

## 12. Outstanding decisions and risks

### 12.1 Conflicts inside the SME input (to resolve with the SME)

| C | Conflict | Proposal |
|---|---|---|
| C-1 | Skills table: UI State = Core, API = Core, Debugging = **Must**. "Top-5 Core" lists Debugging and API as Core, with no UI State | Read "Core" in the top-5 as "fundamental". The table and SME-17 (mandatory list) win. **Ask the SME** |
| C-2 | AI-output verification is Important, yet **blocks** Demonstrated | Make it a mandatory criterion of the integrated task only (follow-up round) |
| C-3 | Git: not in the skills table; Must per SME-17, SME-36 and C1 ("Git الأساسي") | Must at `foundation` (§3) |
| C-4 | Testing named as a weakness in Case 4; `ui-testing` was removed from the role map (OD-3) | Not re-added. **Ask the SME** whether testing is expected of Juniors (D-7) |
| C-5 | Forms validation and requirements reading are absent from the SME table | Kept Supporting, unchanged (D-7) |

### 12.2 SME-approved values still required

| ID | Value needed |
|---|---|
| V-1 | Confirm each §3 row: category, Junior-minimum proficiency, evidence composition |
| V-2 | Rubric weights, thresholds and level descriptors for all criteria (OPEN-043), calibrated to `working` / `foundation` |
| V-3 | Git: in how many practical activities it must be observed; what counts as an acceptable commit, branch or PR |
| V-4 | Integrated task: pass rule, mandatory criteria, borderline band |
| V-5 | Escalation triggers and calibration sample size, for automation (C4) |
| V-6 | Integrated task: duration, brief, planted bug, mock-API scenarios, follow-up variants; short tasks A/B (content) |
| V-7 | The item bank (§8.5) and the learner-safe wording of private inputs |
| V-8 | Golden set for calibration (HR-002: first 100 submissions) |

### 12.3 Product Owner decisions and approvals required

| ID | Decision |
|---|---|
| D-1 | "Required level" = `demonstrated`, plus proficiency carried by rubric calibration and evidence composition (§5.4) |
| D-2 | Promotion path from DEMO to non-demo reviewed content (§6.1) |
| D-3 | Register EXT-1 and EXT-2 and approve building them (inactive) |
| D-4 | SRS change request (proposed **CHG-017**, not applied), covering: Must/Core semantics; readiness as all-Must + all-Core-minimum + integrated assessment; evidence independence (project + distinct short task); Git assessed within activities; integrated assessment as a gate. **BR-024 and D-101/D-102 stay as they are** |
| D-5 | H6 per-skill derivation for the integrated task, or one primary skill per run (keeps H6 off) |
| D-6 | Code reading Must, or Core (§5.2) |
| D-7 | Testing, forms validation and requirements reading (C-4, C-5) |
| D-8 | Which skill the AI-verification criterion links to (js, or explanation) |
| D-9 | Claim-policy changes (§11): none until separately approved |
| D-10 | Order of capability builds CAP-1…CAP-13 and their privacy and security reviews (sandboxing, repository access) |
| D-11 | SME-21 "learning speed" and SME-44 "70/30 theory": recorded, no instrument proposed |
| D-12 | Pilot (SME-55): small, after the modifications. Not before staging and the existing pilot blockers |

### 12.4 Risks

1. **Readiness becomes unreachable until producers or human review exist for every Must** (notably Git, CAP-6). This is the correct fail-closed outcome, but it means no graduate can be "ready" in the pilot without reviewer capacity.
2. **Reviewer load.** Until CAP-1…7 are calibrated, every skill criterion is human-reviewed. C4's "human only for exceptions" is a **target**, not today's state.
3. **Over-reliance on the integrated task.** EXT-1 must require an approved activity version and a standing result, or one task could become a "pass once, ready forever" shortcut. Recency follows the existing `recency_policy` (V7 in the Verified definition stays a future concern).
4. **Sandboxed execution is a new attack surface** (CAP-1/2). It needs its own security review before any build.
5. **Proficiency is not stored on evidence (D-1).** If the rubric calibration is weak, "Working" is not distinguishable from "Foundation".
6. **Historical results.** Demonstrated levels earned on the legacy basis in test environments stay as history. No real-user data exists, so no re-assessment is needed.

## 13. Tests required before activation

Nothing is activated before **all** of the following pass on staging.

| Area | Test |
|---|---|
| Config equivalence | Activating the candidate `track_config_version` v2 changes only the §3 fields. Diff = TSC-01..12; history and earlier versions untouched |
| Readiness rules (domain, unit) | All 6 Must at `demonstrated` + 3 Core + independent evidence + integrated pass ⇒ `meets_rule_set` |
| | Any one Must missing ⇒ `not_satisfied`, reported **non-compensable** and **not offset** by any other skill |
| | Core below its minimum ⇒ `not_satisfied` |
| | A Supporting skill missing ⇒ no effect |
| | No percentage or count appears in the report |
| EXT-2 | Two resubmissions of one activity ⇒ 1 independent evidence |
| | Project + validation task ⇒ 2 |
| | Withdrawn evidence ⇒ not counted |
| | Demo-content evidence ⇒ not counted in production |
| EXT-1 | Unpublished or demo integrated activity ⇒ indeterminate |
| | Passed but decision pending (D-118) ⇒ not satisfied |
| | Withdrawn ⇒ not satisfied |
| | A version outside `allowed_versions` ⇒ not satisfied |
| Readiness states | Unvalidated or development set ⇒ `pending_validation` headline only; production requires validated + `production_active`; readiness never changes a level (BR-024) |
| D-118 regression | The full `verification-integrity` suite. Declarations, uploads and forged signals still earn nothing; client `verified.*` / `signal.*` still 400; Verified unreachable |
| Content | `validatePack` + quality rules on the 0.3.0 candidate. Every Must/Core skill has at least 2 activities covering it, at least 1 of them a validation task (C3). Every active check has a producer (Q22). `git_workflow` present wherever Git is claimed |
| Separation of duties | Drafter ≠ SME decider ≠ activator, for every TSC and for the version |
| Assessment context | Identity and profile never reach a reviewer payload (blind-review tests) |
| UI (Phase 2 harness) | Catalogue and detail chips stay honest: human-reviewed until an automated basis exists. Readiness copy names Must vs Core and never shows a percentage |
| Calibration (before any automation) | Agreement rate on the golden set meets the SME-approved value (V-5/V-8). Borderline routing sends cases to people. Dispute path works |

## 14. Implementation dependency plan

Nothing here touches the graduate activity UI code paths in flight (`apps/app`). UI-facing items are copy-only and come last.

| Stage | Contents | Depends on | Who | Touches |
|---|---|---|---|---|
| **S0 · Approvals** | D-1…D-12; SME confirms V-1, resolves C-1…C-5 | this plan | PO, SME | docs only |
| **S1 · Content (draft)** | 0.3.0 candidate via the promotion flow; Git indicators; criteria (§8.4); integrated task; short tasks A/B; item bank | S0 (D-2, D-6, D-7) | content author → SME review | `data/career`, review records (draft) |
| **S2 · Track config draft** | TSC-01..12 in the Track Builder; `track_config_version` v2 (inactive); readiness rule set R-M/R-C (draft, inactive) | S0, S1 | track_admin → SME → (later) PO | governed config (draft) |
| **S3 · Extensions** | EXT-1, EXT-2: domain types, tests, Track Builder kind, register rows; R-E1 and R-I1 added to the draft set | S0 (D-3), S2 | engineering | `packages/domain`, `apps/api/readiness`, admin (no graduate UI) |
| **S4 · SRS** | CHG-017 drafted and approved (D-4), **then** applied | S0 | PO | SRS (after approval only) |
| **S5 · Producers** | CAP-10 provenance first, then CAP-4, CAP-1, CAP-2, CAP-3, CAP-5, CAP-7, CAP-6, CAP-8; each with its own security and privacy review | S0 (D-10) | engineering | new services; `verified.*` producers |
| **S6 · Calibration** | Golden set (V-8), agreement metrics, borderline band (V-4/V-5); a new verification policy drafted (§9.4) | S5, SME | SME, reviewers | config (draft) |
| **S7 · Activation** | Rubric values approved (V-2); content published; v2 + readiness set validated and activated (PO, separation of duties); staging tests (§13); small pilot (SME-55) | S1–S6, staging, pilot blockers | PO | activation records |

**What can start immediately after approval, without touching the UI work:** S1 (content), S2 (drafts) and S3 (domain extensions).

**Human-reviewed assessment can run before S5.** Through human review alone, the candidate content can produce Demonstrated (D-118 authorised path) as soon as S1 + S2 + V-2 are approved and published, so a reviewer-backed pilot does not wait for automation.

**Stopped. Awaiting Product Owner approval.**
- No SRS edit.
- No configuration created or activated.
- No track published.
- No approval record created.
- No historical result altered.
