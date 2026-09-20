# الوثيقة 12 — Design for Future Phases
> كيف يفتح النموذج المفاهيمي المراحل اللاحقة **بلا إعادة بناء**. توضيح فقط — **لا تنفيذ لمنطق أي منها الآن.**

## 1. جدول الجاهزية

| القدرة المستقبلية | المرحلة | تستخدم من النموذج الحالي | تضيف | يجب ألا تغيّر |
|---|---|---|---|---|
| **Learning Agent (A07)** | P2 | `Gap` · `Skill` · `LearningNeed` · `ResourceRecommendation` · `LearningResource` · `Activity` · `EvaluatorResult` | موارد جديدة في السجل · سياسة ترشيح قابلة للاستبدال · `Activity` بملف `exercise` | سلسلة Gap→Need→Resource→Practice→Submission→Evaluation→Evidence · قيد "لا ترشيح بلا تطبيق" |
| **Recruiter (A04)** | P3 | `Claim` · `Evidence` · `Role` · الإسقاطات | `ReadinessAssessment` كإسقاط + نوع اقتراح جديد · معايير فرز `curated` | أن التقييم يبقى للعمل لا للشخص · لا تنبؤ بالتوظيف |
| **Personal Branding (A05)** | P4 | `Evidence` · `Achievement` · `Goal` | `BrandingPlan` كإسقاط | قاعدة: الصياغة لا تتجاوز مستوى الدليل |
| **Opportunities (A09)** | P4 | `Claim` · `Evidence` · `Role` · `Skill` + `SkillMapping` | `Opportunity` · `MatchResult` · مصادر فرص · موافقة مشاركة منفصلة | لا ترشيح بلا سبب مطابقة · لا مشاركة بيانات بلا موافقة |
| **Interview Simulation (C14)** | P3 | **لا كيان جديد**: `Activity` بملف `interview` · `Artifact` نوع محادثة · `RubricVersion` مخصص | `Evaluator Plugin` للمقابلات · شخصيات مُحاوِرة في الـSpec | خط الأنابيب العشري كما هو · قواعد الأدلة كما هي |
| **Business Track (C16)** | P5 | `ActivitySpec` بملف `business_exercise` · الرُبريكات · `Evidence` | `Track` (تجميعة مرتبة) · مكتبة بنود `track.business.*` | لا تسعير مبني على مهارات غير مُثبتة · لا ضمان دخل |
| **Career Gym (C17)** | P4–P5 | `Activity` بملف `micro_challenge` | رُبريكات قصيرة · جدولة يومية | أن التحدي القصير ينتج `Practiced` غالبًا لا `Verified` |
| **Portfolio Website (C13)** | P4 | `UsernameReservation` (محجوز من P1) · `Claim` · `Evidence` · `Achievement` · `WorkItem` · حالة النشر | `PublicProfile` كإسقاط + خدمة نشر + فحص خصوصية | الأسماء المحجوزة · موافقة العرض العام لكل عنصر · قواعد اللغة |
| **B2B2C (P5)** | P5 | `org_id` الموجود على كل كيان (D-006) · `Event` · `Claim` | `Membership` · `Cohort` · `OrgRole` · تقارير مجمّعة | **لا تسريب لمحتوى عمل أو تفاصيل أدلة فردية للمؤسسة بلا موافقة المستخدم** |
| **ESCO / التصنيف الوطني** | P2 | `Skill` · `SkillMapping` (موجود وفارغ) | تعبئة صفوف المطابقة | ثبات المعرّفات الداخلية |
| **Market Intelligence (A08)** | P4 | `Role` · `Skill` | `MarketSource` · `MarketInsight` + إلزام `external_source_ref` | الثابت 4: لا معلومة سوقية بلا مصدر |

## 2. لماذا لا تحتاج أيٌّ منها تغييرًا في النواة

| القدرة | نقطة التمديد المستخدمة |
|---|---|
| المقابلات · Career Gym · ريادة الأعمال · المحاكاة | `Activity Profile` (LBD-03) |
| التقييم السلوكي · تقييم المقابلات | `Evaluator Plugin` (LBD-04) |
| كل وكيل متبقٍّ | `Agent Contract` (LBD-05) |
| CV · LinkedIn · Portfolio · الموقع العام · تقرير الجاهزية | `Projection Template` (LBD-10) |
| كل التنبيهات الذكية | `Signal Subscriber` (LBD-02) |
| مسار مهني جديد · المطابقة | `Role Reference Spec` + مكتبة بنود مسار |
| ESCO · التصنيف الوطني | `Skill Mapping` (LBD-08) |
| المؤسسات | `org_id` مفعّل (LBD-11) |

## 3. ما الذي **سيكسر** النموذج (محظورات دائمة)
1. إنشاء `Claim` أو مستوى مهارة من مصدر لا يمر بخط التقييم.
2. بناء مصدر حقيقة موازٍ للسيرة أو الملف العام بدل الإسقاط فوق `Career Graph`.
3. كيان "مقابلة" أو "محاكاة" أو "تحدٍّ" مستقل عن `Activity`.
4. رُبريك أو عتبة مكتوبة في الكود أو داخل نص الـprompt.
5. سماح لوكيل بالكتابة المباشرة في الرسم.
6. ربط الأدلة بأكواد تصنيف خارجية بدل المعرّفات الداخلية.
7. حقيقة بلا `provenance`، أو استدعاء نموذج بلا `CostRecord`.
8. اشتقاق مستوى مهارة من الدرجة الإجمالية للنشاط (خرق الثابت التاسع).

## 4. أول اختبار عملي للجاهزية
**في P2، عند إضافة المسار المهني الثاني:** يجب أن تتم بـ`RoleReferenceSpec` + مكتبة بنود مسار + 3 `ActivitySpec` + رُبريكاتها — **بلا سطر كود في النواة**.
فشل هذا الاختبار = عيب معماري يُصحَّح **قبل** P3، لا بعده.
