# نَقْلة / NAQLA — Vision Registry (سجل الرؤية الكامل)
> **قاعدة حاكمة: لا يُحذف عنصر من الرؤية أبدًا.** العنصر إمّا يُنفَّذ، أو يُنفَّذ بحدّه الأدنى خلف عقد كامل، أو يُعرَّف كعقد بلا تنفيذ، أو يُسجَّل هنا محفوظًا بهويته ومرحلته ونقطة تمديده.
> هذا السجل هو المصدر الوحيد للحقيقة بخصوص "ما هو المنتج الكامل". خريطة الطريق تقول *متى*، والأسس المعمارية تقول *كيف نفتحه بلا هدم*.

## حالات التنفيذ الأربع

| الحالة | المعنى | الالتزام المعماري |
|---|---|---|
| `BUILT` | مُنفَّذ فعليًا في المرحلة | يعمل بالكامل ضمن نطاقه |
| `THIN` | منفّذ بحدّه الأدنى **خلف عقد كامل** | التوسعة لاحقًا = تبديل تنفيذ خلف نفس العقد، لا إعادة تصميم |
| `CONTRACT` | العقد/الواجهة والكيان معرّفان، بلا تنفيذ فعلي | الحقل/الكيان/المسار محجوز من اليوم الأول |
| `REGISTERED` | مسجّل في الرؤية، لا كود ولا عقد بعد | مربوط بنقطة تمديد معروفة مسبقًا |

**القاعدة الذهبية:** `THIN` يعني **ضيق النطاق، لا ضحل البنية**. نضيّق ما يراه المستخدم، ولا نضيّق العقد الذي يقف خلفه.

---

## أ. مكوّنات المنتج (18 عنصرًا — محفوظة بالكامل)

| ID | المكوّن | المرحلة | حالة Phase 1 | نقطة التمديد التي تفتحه لاحقًا |
|---|---|---|---|---|
| C01 | Career Profile | P1→P2 | `THIN` (8–12 حقلًا) | Profile Facets فوق Career Graph — إضافة وجه جديد لا يمس النواة |
| C02 | Career Diagnosis | P1→P2 | `THIN` (دور مرجعي واحد) | Role Reference Spec + Gap Engine — كل دور جديد = ملف محتوى |
| C03 | Career Roadmap 30/60/90 | P2 | `CONTRACT` (Next Best Action فقط) | Plan Engine يقرأ Gap Set ويكتب Plan — الواجهة محجوزة |
| C04 | Project / Evidence Hub | P1→P2 | `THIN` (Work Item كامل الحقول، بلا إدارة مشاريع) | Work Item موحّد: مهمة/مشروع تخرج/Freelance/تطوعي نوعٌ واحد بحقل `kind` |
| C05 | Achievement Engine | P1 | `BUILT` | يستهلك أحداث الإنجاز من Career Event Log — أي مصدر جديد يُغذّيه بلا تعديل |
| C06 | Job Simulation | P3 | `THIN` (مهمة + تدخّل مدير) | Activity Spec Profile = `simulation` — نفس مخطط المحتوى بعمق أكبر |
| C07 | Performance Evaluation | P1→P3 | `BUILT` (قواعد + رُبريك)، السلوكي P3 | Evaluator Plugins — إضافة مقيّم سلوكي = تسجيل plugin جديد |
| C08 | Skill Evidence | P1 | `BUILT` (ثابت جوهري) | Claim↔Evidence في نواة الـGraph — لا يتغير أبدًا |
| C09 | Learning & Development | P1→P2 | `THIN` (مورد واحد لكل فجوة) | Learning Resource Registry + سياسة Gap→Resource قابلة للاستبدال |
| C10 | CV | P1→P2 | `THIN` (عبارات + تصدير أساسي) | Projection Renderer فوق Career Graph — لا بيانات منفصلة للسيرة |
| C11 | LinkedIn | P1→P4 | `THIN` (Headline + About + مشروع) | نفس Renderer بقالب مختلف + Branding Plan لاحقًا |
| C12 | Portfolio | P1→P4 | `THIN` (Case Study واحدة) | نفس Renderer + Publishing Service |
| C13 | Personal Profile Website `/u/username` | P4 | `CONTRACT` (حجز اسم المستخدم والمسار من التسجيل) | Public Profile Service يقرأ Projections — لا هجرة أسماء لاحقًا |
| C14 | Interview Simulation | P3 | `REGISTERED` | Activity Spec Profile = `interview` + Evaluator مخصص |
| C15 | Opportunity Matching | P4 | `REGISTERED` | Match Service يستهلك Career Graph + Role Reference Specs |
| C16 | Business & Entrepreneurship Track | P5 | `REGISTERED` | Track = مجموعة Activities مرتبة + رُبريكات — لا بنية جديدة |
| C17 | Career Gym | P4→P5 | `REGISTERED` | Activity Spec Profile = `micro_challenge` |
| C18 | Smart Notifications | P1→P5 | `THIN` (تذكير واحد) | Signal Bus فوق Career Event Log — كل تنبيه جديد = مشترك جديد |

## ب. نظام الوكلاء (19 وكيلًا — محفوظون بالكامل)

> **قاعدة حاسمة: يجوز دمج الوكلاء في التنفيذ، ولا يجوز دمجهم في العقد.**
> في Phase 1 ننفّذ 4 وحدات تشغيلية فقط، لكن كل وكيل من الـ19 له **هوية وعقد مدخلات/مخرجات مستقل**. الفصل لاحقًا = نقل تنفيذ، لا إعادة تصميم.

| ID | الوكيل | المرحلة | حالة Phase 1 | وحدة التنفيذ في P1 |
|---|---|---|---|---|
| A01 | Personal Career Companion | P1→P2 | `THIN` | وحدة Companion فوق حالة النظام — بلا تخطيط حر |
| A02 | Career Strategist | P2 | `THIN` | داخل Diagnosis (حتمي + استدعاء واحد) |
| A03 | Technical Mentor | P2→P3 | `REGISTERED` | — |
| A04 | Recruiter | P3 | `REGISTERED` | — |
| A05 | Personal Branding | P4 | `REGISTERED` | — |
| A06 | Business & Entrepreneurship | P5 | `REGISTERED` | — |
| A07 | Learning & Development | P2 | `THIN` | بحث حتمي في سجل الموارد المُنسّق |
| A08 | Market Intelligence | P4 | `REGISTERED` | يُستعاض عنه بـRole Reference Spec مُنسّق يدويًا |
| A09 | Opportunity | P4 | `REGISTERED` | — |
| A10 | Simulation Manager | P3 | `THIN` | مدموج في Mission Runner |
| A11 | Virtual Manager | P1→P3 | `THIN` | مدموج في Mission Runner (تدخّل أو تدخّلان) |
| A12 | Client / Stakeholder | P3 | `REGISTERED` | — |
| A13 | Performance Evaluator | P1 | `BUILT` | وحدة مستقلة |
| A14 | Evidence | P1 | `BUILT` | وحدة مستقلة |
| A15 | Coach | P2 | `THIN` | تغذية راجعة من الرُبريك بلا خطة تطوير |
| A16 | Portfolio | P1→P4 | `THIN` | مدموج في Writer |
| A17 | CV & LinkedIn | P1 | `BUILT` | مدموج في Writer (سطح محدود) |
| A18 | Quality & Verification | P1→P3 | `BUILT` كبوابة قواعد | قواعد صارمة، ثم وكيل مستقل في P3 |
| A19 | Orchestrator | P1→P5 | `BUILT` كـJourney Engine حتمي | آلة حالات، ثم توجيه ديناميكي محكوم بميزانية |

## ج. أسس البيانات (محفوظة بالكامل)

| ID | العنصر | المرحلة | حالة P1 | ملاحظة |
|---|---|---|---|---|
| D01 | تصنيف المهن والمهارات الوطني | P2 | `CONTRACT` | Skill Ontology بمعرّفات داخلية + جدول مطابقة خارجي فارغ |
| D02 | ESCO | P2→P3 | `CONTRACT` | نفس جدول المطابقة — مصدر إضافي لا بنية جديدة |
| D03 | بيانات سوق العمل | P4 | `REGISTERED` | — |
| D04 | بيانات الوظائف الفعلية | P4 | `REGISTERED` | — |
| D05 | مصادر تعليم موثوقة | P1→P2 | `THIN` | سجل مُنسّق يدويًا |
| D06 | فصل مصادر البيانات الأربعة | P1 | `BUILT` | حقل `provenance` إلزامي على كل حقيقة منذ اليوم الأول |

## د. الحوكمة والسلامة والتكلفة (كلها Phase 1 — غير قابلة للتأجيل)

| ID | العنصر | حالة P1 | السبب |
|---|---|---|---|
| G01 | منع اختلاق مهارة/خبرة/شهادة | `BUILT` | ثابت جوهري، لا ميزة |
| G02 | لا تقييم بلا رُبريك مُصدَّر ومُؤرشف | `BUILT` | يستحيل ترميمه أثرًا رجعيًا |
| G03 | لا معلومة سوقية بلا مصدر | `BUILT` (كقاعدة) | يمنع دَين مصداقية |
| G04 | تتبّع التوكنات والتكلفة لكل وكيل ولكل مستخدم | `BUILT` | لا يمكن استرجاع بيانات تكلفة لم تُسجَّل |
| G05 | توجيه النماذج + التخزين المؤقت + سقوف الميزانية | `THIN` | البوابة موجودة، السياسات تنضج |
| G06 | سجل الموافقات وخصوصية البيانات (PDPL) | `BUILT` | التزام قانوني وأثر رجعي مستحيل |
| G07 | أثر تدقيق كامل لكل مخرج AI (نموذج، إصدار prompt، تكلفة، مصدر) | `BUILT` | أساس المصداقية والمعايرة |
| G08 | `Activity Score ≠ Skill Verification Level` | `BUILT` | الثابت التاسع (D-016) |
| G09 | Integrity Checks إلزامية لكل نشاط يمنح `Verified` | `BUILT` | D-013 |
| G10 | Validation Activity لترقية `self_reported` | `THIN` | D-018a |

---

**الخلاصة:** 18 مكوّنًا + 19 وكيلًا + 6 مصادر بيانات + 7 ضوابط = **50 عنصرًا، صفر محذوف**.
في Phase 1: 12 عنصرًا `BUILT`، 15 `THIN`، 4 `CONTRACT`، 19 `REGISTERED`. *(محدّث بعد قرارات الاعتماد: A01 Companion وC04 Project Hub رُفعا إلى `THIN` في Phase 1.)*

---

## هـ. المسارات المهنية (Career Tracks) — *(D-027 · D-028)*

> **مبدأ هوية معتمد:**
> **`NAQLA is multi-discipline by design.` — `Data Analyst / BI` مسار تحقق أول (validation beachhead)، وليس هوية المنتج.**
>
> **قيد ملزم على كل عمل لاحق:** يُمنع على أي Requirement أو Entity أو Agent Contract أو State Machine أو Activity Model أو Evidence Model أن يفترض أن المنتج خاص بتحليل البيانات. المسار **معطى محتوى (content parameter)**، لا افتراض بنيوي.

**حالة التنفيذ:** `Data Analyst / BI` هو المسار الوحيد المُفعَّل في Phase 1. كل ما عداه `REGISTERED`.

### TF-1 — تطوير البرمجيات (Software Development)
| ID | المسار | الحالة |
|---|---|---|
| TRK-01 | Frontend Developer | `REGISTERED` |
| TRK-02 | Backend Developer | `REGISTERED` |
| TRK-03 | Full-Stack Developer | `REGISTERED` |
| TRK-04 | Mobile Developer | `REGISTERED` |

### TF-2 — البيانات والذكاء الاصطناعي (Data & AI)
| ID | المسار | الحالة |
|---|---|---|
| TRK-05 | **Data Analyst** | **`ACTIVE` — مسار التحقق الأول (P0/P1)** |
| TRK-06 | **BI Analyst** | **`ACTIVE` — ضمن مسار التحقق الأول** |
| TRK-07 | Data Engineer | `REGISTERED` |
| TRK-08 | Data Scientist | `REGISTERED` |
| TRK-09 | AI / ML Engineer | `REGISTERED` |
| TRK-10 | Generative AI / AI Automation | `REGISTERED` |

### TF-3 — تقنية المعلومات والبنية التحتية (IT & Infrastructure)
| ID | المسار | الحالة |
|---|---|---|
| TRK-11 | IT Support | `REGISTERED` |
| TRK-12 | Application Support | `REGISTERED` |
| TRK-13 | System Administrator | `REGISTERED` |
| TRK-14 | Cloud Support / Cloud Engineer | `REGISTERED` |
| TRK-15 | Network / Infrastructure | `REGISTERED` |

### TF-4 — الأمن السيبراني (Cybersecurity)
| ID | المسار | الحالة |
|---|---|---|
| TRK-16 | SOC Analyst | `REGISTERED` |
| TRK-17 | Cybersecurity Analyst | `REGISTERED` |
| TRK-18 | GRC | `REGISTERED` |
| TRK-19 | Security Engineering | `REGISTERED` |

### TF-5 — تقنية الأعمال والأنظمة (Business & Systems Technology)
| ID | المسار | الحالة |
|---|---|---|
| TRK-20 | Business Analyst | `REGISTERED` |
| TRK-21 | Systems Analyst | `REGISTERED` |
| TRK-22 | ERP / Application Specialist | `REGISTERED` |
| TRK-23 | Technical Project / Product Coordinator | `REGISTERED` |

### TF-6 — المنتج الرقمي (Digital Product)
| ID | المسار | الحالة |
|---|---|---|
| TRK-24 | UI/UX Designer | `REGISTERED` |
| TRK-25 | Product Designer | `REGISTERED` |

**الإجمالي: 25 مسارًا في 6 عائلات — مسار واحد مُفعَّل (مركّب من TRK-05/06)، و23 مسجّلة.**

### ما يلزم لتفعيل أي مسار مسجّل *(D-029 — محتوى لا كود)*
`RoleReferenceSpec` · `Skill[]` + `recency_policy` + `SkillMapping` · `ActivitySpec[]` · `RubricVersion[]` + `ScoringPolicy` · `IntegrityCheck[]` · `LearningResource[]` · إعدادات المحتوى (اللغة، الزمن، أنماط AI).

### ما يُمنع أن يتغير لإضافة مسار *(D-029 — شرط قبول معماري)*
`Career Graph` · `Evidence model` · `Claim lifecycle` · `Evaluation pipeline` · `Agent orchestration contracts` · `Project/WorkItem model` · `CV/LinkedIn/Portfolio projection architecture`.

> **احتياج المسار الثاني لتغيير جوهري في أيٍّ منها = Architecture Failure يُصحَّح قبل أي توسّع.**
