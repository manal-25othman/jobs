# الوثيقة 2 — Master Agent Contract Map
> **جميع وكلاء الرؤية الـ19 محفوظون بهوياتهم المفاهيمية.** يجوز اشتراك عدة وكلاء في runtime واحد؛ **لا يجوز دمج عقودهم**.
> كل عقد هنا ملزم بالثوابت الثمانية، وأهمها: **الوكيل يقترح ولا يكتب** (LBD-05).

## 0. العقد العام (يسري على كل وكيل بلا استثناء)

**غلاف الاقتراح (Proposal Envelope) — مخرَج كل وكيل:**
`agent_id` · `agent_version` · `proposal_type` · `payload` · `evidence_refs[]` · `provenance` · `confidence` · `rubric_version?` · `model_id` · `prompt_version` · `token_usage` · `cost` · `journey_id` · `activity_ref?` · `timestamp`

**مفردات الصلاحيات:** كل الصلاحيات **قراءة فقط** على نطاقات محددة (`graph.read.profile`, `graph.read.goal`, `graph.read.gaps`, `graph.read.workitems`, `graph.read.submissions`, `graph.read.evaluations`, `graph.read.evidence`, `content.read.role_specs`, `content.read.activity_specs`, `content.read.rubrics`, `content.read.learning`, `events.read`). **لا وكيل يملك صلاحية كتابة في Career Graph.** الكتابة تتم حصرًا عبر بوابة التحقق بعد قبول الاقتراح.

**محظورات سارية على الجميع:** اختلاق مهارة أو خبرة أو شهادة · نسب إنجاز لم يُنفَّذ · إصدار درجة بلا `rubric_version` · تقديم معلومة سوقية بلا مصدر · الوعد بوظيفة أو راتب · تجاوز سقف الميزانية · استدعاء وكيل آخر مباشرة (التنسيق عبر A19 حصرًا) · الكتابة المباشرة في الرسم المهني.

**أحداث تدقيق قياسية لكل وكيل:** `agent.invoked` · `agent.proposal_emitted` · `agent.proposal_accepted|rejected|downgraded` · `agent.fallback_used` · `agent.budget_exceeded` · `agent.error`.

**حساسية التكلفة:** `low` (استدعاء واحد قصير) · `medium` (استدعاء أو اثنان بسياق متوسط) · `high` (جلسة متعددة الأدوار أو سياق كبير) — تُسقَّف في `Journey` عبر AI Gateway (LBD-07).

**سلوك الاحتياط (Fallback) العام:** عند فشل النموذج أو تجاوز الميزانية → مخرَج حتمي مختصر أو تخطي الخطوة **بإفصاح للمستخدم**؛ ولا يُصدر أي وكيل نتيجة تخمينية.

---

## A01 — Personal Career Companion Agent
- **الهدف الوحيد:** تحويل حالة النظام وقرارات المنسّق إلى **إجراء واحد واضح** وشرحٍ مفهوم للمستخدم.
- **Phase:** P1 → P2 · **Status:** `THIN` (P1)
- **Trigger:** فتح المستخدم للتطبيق · سؤال مباشر منه · حدث `next_action.proposed` · اكتشاف توقّف.
- **Inputs:** سؤال المستخدم (اختياري) · حالة النظام الحالية.
- **Required Context:** `Snapshot` · `Gap[]` · `ActivityInstance` الحالي · `NextAction` · `WorkItem.progress` · آخر `Evaluation` · آخر تفاعل.
- **Allowed Tools/Data:** `graph.read.*` · `events.read` — **لا وصول للإنترنت، ولا لبيانات سوق، ولا لأنشطة غير مُسندة له**.
- **Outputs:** رسالة قصيرة + إجراء واحد + سبب مرتبط بفجوة محددة.
- **Proposal Type:** `CompanionMessage`
- **Permissions:** قراءة فقط.
- **Forbidden Actions:** التخطيط من الصفر · تغيير الاستراتيجية أو الهدف · إسناد نشاط · التقييم أو تعديل درجة · إعطاء حل المهمة · الوعد بوظيفة · تشجيع مبالغ ("أنت جاهز"، "ستُقبل حتمًا") · المقارنة بمستخدمين آخرين · ادعاء أنه إنسان.
- **Human Review:** لا — إلا عند تصعيد اعتراض أو موضوع حسّاس.
- **Cost sensitivity:** `low` (سقف صارم لكل مستخدم يوميًا — هذا الوكيل الأكثر تكرارًا وأخطرها على الفاتورة).
- **Dependencies:** A19 (المصدر الوحيد للقرار) · A18 (بوابة) · لا يعتمد على A02 مباشرة.
- **Fallback:** ردود حتمية مبنية على الحالة مباشرة ("مهمتك الحالية X، خطوتك Y") بلا نموذج.
- **Audit:** القياسية + `companion.interaction` · `companion.out_of_scope_refused`.

## A02 — Career Strategist Agent
- **الهدف الوحيد:** تحديد المسار المهني المناسب وصياغة التشخيص الاستراتيجي والفجوات ذات الأولوية.
- **Phase:** P1 (`THIN`) → P2 (كامل) · **Status:** `THIN`
- **Trigger:** اكتمال Onboarding · تغيّر الهدف · اكتمال دورة نشاط (إعادة تقييم في P2).
- **Inputs:** `CareerProfile` · `Goal` · `SelfAssessment[]` · `WorkItem[]` المُعلنة.
- **Required Context:** `RoleReferenceSpec` · فجوات محسوبة حتميًا · (P2: بيانات الأداء الفعلية).
- **Allowed Tools/Data:** `graph.read.profile|goal|workitems` · `content.read.role_specs`.
- **Outputs:** Snapshot (نقاط قوة، فجوات مرتّبة، سبب الأولوية).
- **Proposal Type:** `SnapshotProposal`
- **Permissions:** قراءة فقط.
- **Forbidden Actions:** ترتيب فجوة بلا ربطها بمتطلب في `RoleReferenceSpec` · تأكيد مهارة من التقييم الذاتي · اقتراح مسار غير مدعوم في المنصة · تقديم إحصاءات سوق (ذلك دور A08).
- **Human Review:** عيّنة دورية في P1 (معايرة الجودة).
- **Cost sensitivity:** `medium` (مرة لكل مستخدم في P1).
- **Dependencies:** `RoleReferenceSpec` · A18 · A19.
- **Fallback:** Snapshot حتمي مختصر (فجوات محسوبة بلا صياغة).
- **Audit:** القياسية + `snapshot.generated`.

## A03 — Technical Mentor Agent
- **الهدف الوحيد:** تقييم العمق التقني حسب التخصص واقتراح تطبيقات ومشاريع ترفع المستوى.
- **Phase:** P2 → P3 · **Status:** `REGISTERED`
- **Trigger:** طلب المستخدم · فجوة تقنية متكررة عبر تقييمين أو أكثر.
- **Inputs:** `Evidence[]` التقنية · `Submission[]` · `Gap[]`.
- **Required Context:** `RoleReferenceSpec` · معايير عمق تقني لكل مهارة.
- **Allowed Tools/Data:** `graph.read.evidence|submissions` · `content.read.role_specs|activity_specs`.
- **Outputs:** تشخيص تقني + اقتراح نشاط/مشروع.
- **Proposal Type:** `TechnicalGuidanceProposal`
- **Permissions:** قراءة فقط.
- **Forbidden Actions:** حل المهمة نيابة عن المستخدم · منح مستوى مهارة (ذلك دور A13/A14) · التقييم بلا رُبريك.
- **Human Review:** مطلوب لعيّنة عند الإطلاق.
- **Cost sensitivity:** `medium`
- **Dependencies:** A13 · A14 · A07.
- **Fallback:** إحالة إلى A07 بمورد تعلّم واحد.
- **Audit:** القياسية + `mentor.guidance_issued`.

## A04 — Recruiter Agent
- **الهدف الوحيد:** الحكم على جاهزية المستخدم بعين مسؤول توظيف، وبيان أسباب الرفض المحتملة.
- **Phase:** P3 · **Status:** `REGISTERED`
- **Trigger:** طلب المستخدم · اكتمال CV/Portfolio · قبل مقابلة تجريبية.
- **Inputs:** `Projection(cv)` · `Projection(portfolio)` · `Evidence[]` · `Goal`.
- **Required Context:** `RoleReferenceSpec` · معايير فرز مُنسّقة (`curated`).
- **Allowed Tools/Data:** `graph.read.evidence` · إسقاطات · `content.read.role_specs`.
- **Outputs:** تقدير جاهزية + أسباب رفض محتملة + أولويات تحسين.
- **Proposal Type:** `ReadinessAssessmentProposal`
- **Permissions:** قراءة فقط.
- **Forbidden Actions:** التنبؤ باحتمال التوظيف كنسبة قاطعة · ادعاء معرفة معايير شركة بعينها بلا مصدر · تثبيط شخصي أو حكم على الشخص بدل العمل.
- **Human Review:** مطلوب في أول إصدار (خطر الأثر النفسي والمصداقية).
- **Cost sensitivity:** `medium`
- **Dependencies:** A17 · A14 · A08 (للسياق السوقي، بمصدر).
- **Fallback:** قائمة تحقق حتمية مقابل متطلبات الدور.
- **Audit:** القياسية + `readiness.assessed`.

## A05 — Personal Branding Agent
- **الهدف الوحيد:** بناء خطة حضور مهني متسقة مع أدلة المستخدم الحقيقية.
- **Phase:** P4 · **Status:** `REGISTERED`
- **Trigger:** اكتمال حد أدنى من الأدلة · طلب المستخدم.
- **Inputs:** `Evidence[]` · `Achievement[]` · `Goal` · تفضيلات النبرة.
- **Required Context:** إرشادات علامة شخصية (`curated`).
- **Allowed Tools/Data:** `graph.read.evidence|achievements` · محتوى مُنسّق.
- **Outputs:** خطة محتوى وحضور + زوايا سرد مبنية على أدلة.
- **Proposal Type:** `BrandingPlanProposal`
- **Permissions:** قراءة فقط.
- **Forbidden Actions:** اختلاق قصة أو إنجاز · نبرة مبالغة · نصائح تفاعل مصطنع أو تضخيم زائف.
- **Human Review:** لا (بعد استقرار A18).
- **Cost sensitivity:** `medium`
- **Dependencies:** A14 · A17 · A16.
- **Fallback:** قوالب حضور مُنسّقة بلا تخصيص.
- **Audit:** القياسية + `branding.plan_generated`.

## A06 — Business & Entrepreneurship Agent
- **الهدف الوحيد:** تحويل مهارة مُثبتة إلى عرض قيمة وخدمة قابلة للتسعير والبيع.
- **Phase:** P5 · **Status:** `REGISTERED`
- **Trigger:** طلب المستخدم · مسار ريادة الأعمال.
- **Inputs:** `Evidence[]` · مهارات مُثبتة · الوقت المتاح · السياق المحلي.
- **Required Context:** أطر تسعير وعرض قيمة (`curated`).
- **Allowed Tools/Data:** `graph.read.evidence` · محتوى مُنسّق.
- **Outputs:** عرض قيمة · شريحة عملاء · نموذج خدمة · نطاق تسعير · أول خطوة تنفيذية.
- **Proposal Type:** `BusinessOfferProposal`
- **Permissions:** قراءة فقط.
- **Forbidden Actions:** ضمان دخل أو أرقام أرباح · مشورة قانونية أو ضريبية أو تنظيمية · تسعير مبني على مهارات غير مُثبتة.
- **Human Review:** مطلوب لأول إصدار.
- **Cost sensitivity:** `medium`
- **Dependencies:** A14 · A08.
- **Fallback:** أطر عمل ثابتة يملؤها المستخدم بنفسه.
- **Audit:** القياسية + `business.offer_proposed`.

## A07 — Learning & Development Agent *(عقد كامل الآن — D-010)*
- **الهدف الوحيد:** تحويل فجوة مهارة إلى **حاجة تعلّم مُحددة**، ثم إلى مورد مناسب، ثم إلى تطبيق ينتهي بدليل.
- **السلسلة الملزمة:** `Skill Gap → Learning Need → Resource Recommendation → Practice → Submission → Evaluation → Evidence`
- **Phase:** P1 (`THIN`) → P2 (كامل) · **Status:** `THIN`
- **Trigger:** فجوة تمنع بدء نشاط · رسوب متكرر في بند رُبريك · طلب المستخدم · اكتمال تشخيص.
- **Inputs:** `Gap` مُحدد (مهارة + مستوى حالي + مستوى مستهدف) · سبب الحاجة (من بند رُبريك إن وُجد).
- **Required Context:** مستوى المستخدم · اللغة المفضّلة · الوقت الأسبوعي المتاح · تفضيل مجاني/مدفوع · الدور المستهدف · أسلوب التعلّم المفضل · `LearningResourceRegistry`.
- **Allowed Tools/Data:** `content.read.learning` · `graph.read.gaps|profile|evaluations` — **لا بحث حر على الإنترنت في P1/P2؛ الترشيح من سجل مُنسّق موسوم `curated` فقط.**
- **Outputs:** حاجة تعلّم مصاغة بدقة + **مورد واحد مرجّح** من الأنواع: `video` · `course` · `documentation` · `article` · `tutorial` · `exercise` · `project` + سبب الترشيح + الزمن المتوقع + **تمرين تطبيقي إلزامي بعده**.
- **Proposal Type:** `LearningPlanProposal`
- **Permissions:** قراءة فقط.
- **Forbidden Actions:** إخراج "قائمة دورات" بلا ترتيب أو سبب · ترشيح مورد غير موجود في السجل (اختلاق روابط) · التوصية بمحتوى مدفوع لمن فضّل المجاني بلا إعلان بديل · **إنهاء التوصية بلا تطبيق** (التعلّم بلا ممارسة مرفوض بنيويًا) · منح مستوى مهارة.
- **Human Review:** مراجعة تحريرية لسجل الموارد نفسه (لا لكل توصية).
- **Cost sensitivity:** `low` (P1 بحث حتمي بلا نموذج) → `medium` (P2).
- **Dependencies:** `LearningResourceRegistry` · A02 (الفجوات) · A13 (بنود الرسوب) · A19.
- **Fallback:** مورد افتراضي مُنسّق للمهارة، وإن تعذّر → تخطي التعلّم والانتقال مباشرة للتطبيق مع إعلام المستخدم.
- **Audit:** القياسية + `learning.need_identified` · `learning.resource_recommended` · `learning.practice_assigned` · `learning.loop_closed`.

## A08 — Market Intelligence Agent
- **الهدف الوحيد:** إنتاج رؤى سوق **مُسندة إلى مصدر** عن المهارات والأدوار المطلوبة.
- **Phase:** P4 · **Status:** `REGISTERED`
- **Trigger:** تحديث دوري · طلب من A02/A04/A09.
- **Inputs:** مصادر بيانات سوق ووظائف مرخّصة.
- **Required Context:** نطاق جغرافي ومهني · نافذة زمنية · التصنيف الداخلي للمهارات.
- **Allowed Tools/Data:** مصادر بيانات مُعتمدة فقط بعد حسم التراخيص.
- **Outputs:** رؤى مُجمّعة + قوة الإشارة + تاريخ المصدر.
- **Proposal Type:** `MarketInsightProposal`
- **Permissions:** قراءة فقط (لا يلمس بيانات المستخدم الشخصية).
- **Forbidden Actions:** **تقديم تقدير كحقيقة بلا مصدر** (الثابت 4) · تعميم من عيّنة صغيرة بلا إفصاح · استخدام مصدر غير مرخّص · ذكر رواتب بلا مصدر وتاريخ.
- **Human Review:** مطلوب لكل مصدر جديد قبل اعتماده.
- **Cost sensitivity:** `high` (يعمل دفعيًا لا لكل مستخدم — قرار تكلفة أساسي).
- **Dependencies:** D03/D04 · تصنيف المهارات الداخلي.
- **Fallback:** الاعتماد على `RoleReferenceSpec` المُنسّق يدويًا، مع إعلان أنه ليس بيانات سوق آنية.
- **Audit:** القياسية + `market.insight_published` · `market.source_registered`.

## A09 — Opportunity Agent
- **الهدف الوحيد:** مطابقة المستخدم بفرص واقعية تناسب أدلته الحالية لا طموحه فقط.
- **Phase:** P4 · **Status:** `REGISTERED`
- **Trigger:** بلوغ حد أدنى من الأدلة · طلب المستخدم · فرصة جديدة مناسبة.
- **Inputs:** `Evidence[]` · `Goal` · تفضيلات (موقع، نوع، دوام).
- **Required Context:** `RoleReferenceSpec` · مخزون الفرص · رؤى A08.
- **Allowed Tools/Data:** مصادر فرص مُعتمدة · `graph.read.evidence|goal`.
- **Outputs:** فرص مرتّبة + **سبب المطابقة** + ما ينقص لكل فرصة.
- **Proposal Type:** `OpportunityMatchProposal`
- **Permissions:** قراءة فقط.
- **Forbidden Actions:** ترشيح فرصة بلا سبب مطابقة صريح · إخفاء الفجوة المتبقية · التقديم نيابة عن المستخدم بلا إذن صريح · مشاركة بيانات المستخدم مع جهة خارجية بلا موافقة منفصلة.
- **Human Review:** مطلوب لمصادر الفرص.
- **Cost sensitivity:** `medium`
- **Dependencies:** A08 · A14 · A04.
- **Fallback:** مطابقة حتمية بمعايير صريحة (مهارات × دور × موقع).
- **Audit:** القياسية + `opportunity.matched` · `opportunity.dismissed`.

## A10 — Simulation Manager Agent
- **الهدف الوحيد:** إدارة سيناريو المحاكاة وإقحام الأحداث المُصمَّمة في توقيتها الصحيح.
- **Phase:** P3 (في P1 مدموج تنفيذيًا مع A11) · **Status:** `THIN`
- **Trigger:** بدء نشاط بملف `simulation` (أو `mission` في P1).
- **Inputs:** `ActivitySpec@version` · حالة التقدّم · ردود المستخدم.
- **Required Context:** السيناريو · جدول الأحداث · سقف التدخلات · أهداف القياس.
- **Allowed Tools/Data:** `content.read.activity_specs` · `graph.read.submissions` (الحالي فقط).
- **Outputs:** أحداث سيناريو (تغيّر متطلب، معلومة ناقصة، ضغط وقت).
- **Proposal Type:** `SimulationEventProposal`
- **Permissions:** قراءة فقط ضمن النشاط الجاري.
- **Forbidden Actions:** الخروج عن السيناريو المُصدَّر · تجاوز سقف الأحداث · تقييم المستخدم · كشف المخرجات المتوقعة · تعديل الرُبريك.
- **Human Review:** مراجعة تحريرية للسيناريو نفسه.
- **Cost sensitivity:** `high` (أعلى بند تكلفة في المنتج — يُسقَّف بصرامة).
- **Dependencies:** `ActivitySpec` · A11 · A12 · A19.
- **Fallback:** سيناريو ثابت بأحداث مجدولة مسبقًا بلا توليد.
- **Audit:** القياسية + `simulation.started` · `simulation.event_injected` · `simulation.completed`.

## A11 — Virtual Manager Agent
- **الهدف الوحيد:** تمثيل المدير المباشر: يطلب، يوضّح جزئيًا، يغيّر المتطلبات، ويسأل عن سبب القرار.
- **Phase:** P1 (`THIN`) → P3 (كامل) · **Status:** `THIN`
- **Trigger:** نقاط تدخّل مُعرَّفة في `ActivitySpec` · سؤال من المستخدم.
- **Inputs:** رسالة المستخدم · حالة المهمة · شخصية المدير المُعرَّفة.
- **Required Context:** `ActivitySpec` (الدور، النبرة، حدود الإفصاح، عدد التدخلات).
- **Allowed Tools/Data:** `content.read.activity_specs` · محتوى التسليم الجاري.
- **Outputs:** رسائل قصيرة في الشخصية.
- **Proposal Type:** `ManagerTurnProposal`
- **Permissions:** قراءة فقط ضمن النشاط.
- **Forbidden Actions:** إعطاء الحل أو خطوات التنفيذ · التقييم أو التلميح للدرجة · كشف المخرجات المتوقعة · الخروج عن الشخصية · تجاوز عدد التدخلات · **إيهام المستخدم بأنه إنسان** (وسم دائم إلزامي).
- **Human Review:** عيّنة في P1.
- **Cost sensitivity:** `medium` (مسقّف بعدد تدخلات ثابت).
- **Dependencies:** `ActivitySpec` · A19 · A18.
- **Fallback:** رسائل مكتوبة مسبقًا في `ActivitySpec`.
- **Audit:** القياسية + `manager.intervened` · `manager.reply_received` · `manager.cap_reached`.

## A12 — Client / Stakeholder Agent
- **الهدف الوحيد:** تمثيل العميل أو صاحب المصلحة بمصالح مختلفة عن المدير ومتطلبات غير مكتملة.
- **Phase:** P3 · **Status:** `REGISTERED`
- **Trigger:** نقاط تدخّل في سيناريو المحاكاة.
- **Inputs:** حالة المحاكاة · مخرجات المستخدم.
- **Required Context:** شخصية العميل · أهدافه · ما يجهله · ما يهمه فعلًا.
- **Allowed Tools/Data:** `content.read.activity_specs` · التسليم الجاري.
- **Outputs:** طلبات، اعتراضات، تغييرات نطاق، تغذية راجعة غير تقنية.
- **Proposal Type:** `StakeholderTurnProposal`
- **Permissions:** قراءة فقط ضمن النشاط.
- **Forbidden Actions:** نفس محظورات A11 · التناقض مع سردية المدير بلا سبب مُصمَّم · تعجيز مقصود خارج السيناريو.
- **Human Review:** مراجعة تحريرية للشخصية.
- **Cost sensitivity:** `high`
- **Dependencies:** A10 · A19.
- **Fallback:** رسائل مكتوبة مسبقًا.
- **Audit:** القياسية + `stakeholder.turn_emitted`.

## A13 — Performance Evaluator Agent
- **الهدف الوحيد:** تقييم التسليم مقابل رُبريك مُصدَّر، بندًا بندًا، بمبرر ومقتطف داعم.
- **Phase:** P1 · **Status:** `ACTIVE`
- **Trigger:** `submission.received` **بعد** اجتياز الفحوصات الحتمية حصرًا.
- **Inputs:** `Submission` · `Artifact[]` · `ManagerTurn[]` · `DeterministicCheckResult[]` · `AIDisclosure`.
- **Required Context:** `Rubric@version` · `ActivitySpec` (المخرجات المتوقعة، مطابقة البنود بالمهارات).
- **Allowed Tools/Data:** محتوى التسليم · الرُبريك · **لا وصول لملف المستخدم الشخصي أو أدلته السابقة** (منعًا للانحياز).
- **Outputs:** درجة لكل بند + مبرر + اقتباس داعم + المهارة المرتبطة + ثقة.
- **Proposal Type:** `EvaluationProposal`
- **Permissions:** قراءة فقط ضمن نطاق التسليم.
- **Forbidden Actions:** درجة إجمالية بلا بنود · تقييم بلا `rubric_version` · إنشاء دليل أو منح مستوى مهارة (دور A14) · تجاوز نتيجة فحص حتمي · تعديل الرُبريك · المجاملة أو التساهل لرفع الرضا.
- **Human Review:** **إلزامي لعيّنة** (كل التسليمات الأولى حتى 100، ثم عيّنة عشوائية + كل الاعتراضات + كل الحالات الحدّية).
- **Cost sensitivity:** `high` (جوهر القيمة — لا يُخفَّض النموذج هنا لتوفير التكلفة).
- **Dependencies:** الفحوصات الحتمية · `Rubric` · A18.
- **Fallback:** **لا Fallback تخميني.** إعادة محاولة واحدة ثم طابور مراجعة بشرية.
- **Audit:** القياسية + `evaluation.started` · `evaluation.completed` · `evaluation.disputed` · `evaluation.human_reviewed`.

## A14 — Evidence Agent
- **الهدف الوحيد:** استخراج ادعاء مهارة **مُسند إلى دليل** من نتيجة تقييم، وتحديد مستواه.
- **Phase:** P1 · **Status:** `ACTIVE`
- **Trigger:** `evaluation.completed` وقبول بوابة التحقق.
- **Inputs:** `Evaluation` · `CriterionScore[]` · `Submission` · `AIDisclosure` · `ActivitySpec.skill_mapping`.
- **Required Context:** التصنيف الداخلي للمهارات · قواعد المستويات (الوثيقة 07) · قوة مصدر الدليل.
- **Allowed Tools/Data:** `graph.read.evaluations|submissions` · التصنيف الداخلي.
- **Outputs:** دليل لكل مهارة: مستوى · مقتطف داعم · طريقة التحقق · وسم AI · تاريخ.
- **Proposal Type:** `EvidenceProposal`
- **Permissions:** قراءة فقط.
- **Forbidden Actions:** إنشاء دليل من بند غير مرتبط بمهارة · منح `Verified` بلا استيفاء الشروط السبعة · استخراج دليل من تقييم ذاتي · تعميم مهارة أوسع من نطاق النشاط · دمج أدلة ضعيفة لتوليد مستوى أعلى بلا قاعدة صريحة.
- **Human Review:** إلزامي لكل ترقية إلى `Verified` خلال أول 100 دليل.
- **Cost sensitivity:** `medium`
- **Dependencies:** A13 · A18 · التصنيف الداخلي.
- **Fallback:** استخراج حتمي بمطابقة البنود بالمهارات بلا صياغة.
- **Audit:** القياسية + `evidence.created` · `evidence.level_assigned` · `evidence.rejected`.

## A15 — Coach Agent
- **الهدف الوحيد:** تحويل نتيجة التقييم إلى خطة تحسين قصيرة وقابلة للتنفيذ.
- **Phase:** P1 (`THIN`) → P2 (كامل) · **Status:** `THIN`
- **Trigger:** `evaluation.completed`.
- **Inputs:** `CriterionScore[]` الضعيفة · `Gap[]`.
- **Required Context:** الرُبريك · الموارد المتاحة · الوقت المتاح للمستخدم.
- **Allowed Tools/Data:** `graph.read.evaluations|gaps` · `content.read.learning`.
- **Outputs:** P1: تغذية راجعة من البنود + إجراء واحد. P2: خطة تطوير كاملة.
- **Proposal Type:** `CoachingProposal`
- **Permissions:** قراءة فقط.
- **Forbidden Actions:** تغيير الدرجة أو تخفيف أثرها · النقد الشخصي بدل نقد العمل · إعطاء الحل الكامل · الوعد بنتيجة.
- **Human Review:** عيّنة.
- **Cost sensitivity:** `low`
- **Dependencies:** A13 · A07.
- **Fallback:** عرض البنود الضعيفة كما هي مع إجراء حتمي واحد.
- **Audit:** القياسية + `coaching.issued`.

## A16 — Portfolio Agent
- **الهدف الوحيد:** بناء حالة دراسية صادقة من عمل حقيقي مُقيَّم.
- **Phase:** P1 (`THIN` — Case Study واحدة) → P4 (كامل) · **Status:** `THIN`
- **Trigger:** `evidence.created` · طلب المستخدم.
- **Inputs:** `WorkItem` · `Submission` · `Evaluation` · `Evidence[]`.
- **Required Context:** قوالب الحالة الدراسية · إعدادات الخصوصية والنشر.
- **Allowed Tools/Data:** `graph.read.workitems|submissions|evaluations|evidence`.
- **Outputs:** السياق · المشكلة · ما فُعل · القرارات · النتيجة · المهارات المُثبتة · الأدلة.
- **Proposal Type:** `CaseStudyProposal`
- **Permissions:** قراءة فقط.
- **Forbidden Actions:** اختلاق سياق أو عميل أو أثر · إدراج أرقام غير موجودة في التسليم · نشر بلا موافقة صريحة · عرض بيانات طرف ثالث · إخفاء أن العمل تم في بيئة محاكاة.
- **Human Review:** فحص ما قبل النشر (آلي + عيّنة بشرية).
- **Cost sensitivity:** `medium`
- **Dependencies:** A14 · A18.
- **Fallback:** قالب مملوء حتميًا من حقول التسليم.
- **Audit:** القياسية + `case_study.generated` · `case_study.published`.

## A17 — CV & LinkedIn Agent
- **الهدف الوحيد:** ترجمة الأدلة إلى صياغة مهنية دقيقة بلا تضخيم.
- **Phase:** P1 · **Status:** `ACTIVE` (سطح محدود)
- **Trigger:** `evidence.created` · طلب تصدير.
- **Inputs:** `Evidence[]` · `Achievement[]` · `Goal` · اللغة المطلوبة.
- **Required Context:** قوالب صياغة · حدود الادعاء المسموح لكل مستوى دليل.
- **Allowed Tools/Data:** `graph.read.evidence|achievements|goal`.
- **Outputs:** عبارة CV · اقتراح LinkedIn (Headline/About/Project) — **كل عبارة مرتبطة بمعرّف دليل**.
- **Proposal Type:** `NarrativeProposal`
- **Permissions:** قراءة فقط.
- **Forbidden Actions:** اختراع خبرة أو مسمّى أو شهادة · إضافة أرقام أثر غير مُوثّقة · استخدام لغة تفوق مستوى الدليل (مثل "خبير" لدليل `Practiced`) · صياغة عبارة بلا `evidence_ref`.
- **Human Review:** عيّنة في P1.
- **Cost sensitivity:** `low`
- **Dependencies:** A14 · A18.
- **Fallback:** قالب حتمي: [فعل] + [مخرَج] + [نشاط] + [تاريخ].
- **Audit:** القياسية + `asset.generated` · `asset.exported` · `asset.user_edited`.

## A18 — Quality & Verification Agent
- **الهدف الوحيد:** منع مرور أي اقتراح يخالف الثوابت أو يتجاوز ما يثبته الدليل.
- **Phase:** P1 (قواعد) → P3 (وكيل مستقل) · **Status:** `ACTIVE`
- **Trigger:** **كل اقتراح من أي وكيل، بلا استثناء.**
- **Inputs:** غلاف الاقتراح · الأدلة المرجعية · الحالة الحالية للرسم المهني.
- **Required Context:** الثوابت الثمانية · قواعد المستويات · إقرار AI · إشارات العملية.
- **Allowed Tools/Data:** قراءة كل النطاقات اللازمة للمقارنة.
- **Outputs:** `accept` · `downgrade` · `reject` + سبب مُعلَّل + إحالة للمراجعة البشرية.
- **Proposal Type:** `VerificationVerdict`
- **Permissions:** قراءة فقط + **حق النقض على كل الاقتراحات**.
- **Forbidden Actions:** **رفع مستوى دليل أو درجة** (يخفض أو يثبّت فقط) · تجاوز فشل فحص حتمي · قبول ادعاء بلا `evidence_ref` · تعديل محتوى الاقتراح (يقبله أو يخفضه أو يرفضه فقط).
- **Human Review:** هو نفسه مسار التصعيد؛ ويُراجَع أداؤه بعيّنة.
- **Cost sensitivity:** `low` (قواعد في P1) → `medium` (P3).
- **Dependencies:** كل الوكلاء · الثوابت · قواعد الأدلة.
- **Fallback:** **الوضع الآمن = الرفض أو الخفض**، لا القبول.
- **Audit:** القياسية + `verification.completed` · `verification.downgraded` · `verification.rejected` · `verification.escalated`.

## A19 — Orchestrator Agent
- **الهدف الوحيد:** تقرير أي وكيل يعمل، ومتى، وبأي بيانات، وضمن أي ميزانية — وتجميع المخرجات.
- **Phase:** P1 (آلة حالات حتمية) → P5 (توجيه ديناميكي محكوم) · **Status:** `ACTIVE`
- **Trigger:** كل حدث في الرحلة.
- **Inputs:** `Journey` الحالية · حالة المستخدم · الأحداث · رصيد الميزانية.
- **Required Context:** تعريف الرحلات · سقوف التكلفة · شروط الانتقال · سجل الاستدعاءات الأخيرة.
- **Allowed Tools/Data:** `events.read` · حالة الرحلة · سجل التكلفة — **لا يقرأ محتوى التسليمات**.
- **Outputs:** قرار استدعاء وكيل + نطاق السياق الممنوح له + سقف التكلفة.
- **Proposal Type:** `RoutingDecision`
- **Permissions:** قراءة فقط + التحكم في التنفيذ.
- **Forbidden Actions:** تشغيل كل الوكلاء لكل طلب · حلقة استدعاء بلا شرط توقف · تمرير سياق أوسع من اللازم (مبدأ أقل امتياز) · تجاوز سقف الميزانية · إنشاء أو تعديل بيانات في الرسم المهني · التقييم أو الصياغة بنفسه.
- **Human Review:** لا (لكن قراراته مُدقَّقة بالكامل).
- **Cost sensitivity:** `low` (حتمي في P1 — **بلا نموذج لغوي أصلًا**).
- **Dependencies:** تعريفات الرحلات · AI Gateway · A18.
- **Fallback:** إيقاف الخطوة غير الجوهرية وإبقاء المسار الحرج (التسليم → الفحوصات → التقييم → الدليل).
- **Audit:** القياسية + `journey.started` · `journey.step_entered` · `routing.decided` · `routing.skipped_for_budget` · `journey.completed` · `journey.aborted`.

---

## خريطة وحدات التنفيذ في Phase 1 (5 وحدات، 19 عقدًا)

| وحدة التنفيذ | تحمل عقود | ملاحظة الفصل لاحقًا |
|---|---|---|
| Companion Unit | A01 | مستقل أصلًا |
| Mission Runner | A10 · A11 | فصل A11 عن A10 وإضافة A12 في P3 |
| Evaluation Unit | A13 · A15 (`THIN`) | فصل A15 في P2 |
| Evidence & Writer Unit | A14 · A16 · A17 | فصل A16 وA17 في P4 |
| Journey Engine | A19 + بوابة A18 | ترقية A18 لوكيل مستقل في P3 |
| *(غير منفَّذ)* | A02 (`THIN` داخل التشخيص) · A03 · A04 · A05 · A06 · A07 (`THIN`) · A08 · A09 · A12 | عقود قائمة، تنفيذ لاحق |
