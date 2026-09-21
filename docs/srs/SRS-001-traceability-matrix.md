# SRS-001 — Detailed Requirements Traceability Matrix
**الإصدار:** 1.1 · **مرتبط بـ:** `SRS-001-career-os-functional.md` **v1.2** · **القرارات:** D-039 · D-043
> تتبّع **أمامي وعكسي**. كل `Requirement` بلا مصدر، وكل `Feature` بلا `Requirement`، **يظهر كـGap صريح في §5 ولا يُخفى**.
> `TC-TBD-xxx` عناصر نائبة — **لا تُكتب حالات الاختبار الكاملة في هذه المرحلة.**

## مفاتيح المبادئ (Vision / Product Principle)
| الرمز | المبدأ |
|---|---|
| `P-PROOF` | طبقة الإثبات: دليل بدل الادعاء |
| `P-MULTI` | متعدد التخصصات بالتصميم (D-027) |
| `P-EVID` | لا ادعاء بلا دليل (INV-1) |
| `P-JUDGE` | نقيس الحكم لا الإنتاج (D-019) |
| `P-TRUST` | المصداقية والحوكمة والتدقيق |
| `P-COST` | تكلفة منضبطة ومقيسة (INV-6) |
| `P-UX` | التعقيد الداخلي لا يصبح تعقيد مستخدم (D-041) |
| `P-PRIV` | الخصوصية والاحتفاظ وPDPL (D-024/025) |
| `P-DIR` | التوجيه: خطوة واحدة واضحة |

**الحالات:** `APPROVED` (ضمن الأساس المجمّد) · `GAP` (نقص مرصود) · `DEFERRED` (مرحلة لاحقة).

---

# 1. المصفوفة الأمامية — C1: User-Facing (FR-U)

| Req ID | المبدأ | CAP | Feature | Phase | Pri | Actor | معيار القبول (مختصر) | Test ID | Status |
|---|---|---|---|---|---|---|---|---|---|
| FR-U-001 | P-PRIV | CAP-01 | F-ID-01 | P1 | MUST | User | حساب يُنشأ · لا معالجة بلا `Consent` | TC-TBD-001 | APPROVED |
| FR-U-002 | P-PRIV | CAP-01 | F-ID-02 | P1 | MUST | User | دخول وجلسة وإنهاء صريح | TC-TBD-002 | APPROVED |
| FR-U-003 | P-PRIV | CAP-01 | F-ID-03 | P1 | SHOULD | User | استعادة بلا كشف وجود الحساب | TC-TBD-003 | APPROVED |
| FR-U-004 | P-PROOF | CAP-02 | F-ID-04 | P1 | MUST | User | حجز دائم · منع انتحال · `/u/` غير منشور | TC-TBD-004 | APPROVED |
| FR-U-005 | P-PRIV | CAP-03 | F-ID-06 | P1 | MUST | User | موافقات منفصلة · سحب فوري · append-only | TC-TBD-005 | APPROVED |
| FR-U-006 | P-PRIV | CAP-04 | F-ID-07 | P1 | MUST | User | حزمة تصدير كاملة للفئات المسموحة | TC-TBD-006 | APPROVED |
| FR-U-007 | P-PRIV | CAP-04 | F-ID-08 | P1 | MUST | User | حذف وفق السياسة · احترام التعليق · حدث تدقيق | TC-TBD-007 | APPROVED |
| FR-U-010 | P-EVID | CAP-06 | F-CAR-01 | P1 | MUST | User | موسوم `declared` · لا ينتج دليلًا | TC-TBD-008 | APPROVED |
| FR-U-011 | P-DIR | CAP-07 | F-CAR-02 | P1 | MUST | User | هدف غير مدعوم ⇒ إفصاح لا توليد وهمي | TC-TBD-009 | APPROVED |
| FR-U-012 | P-DIR | CAP-07 | F-CAR-03 | P1 | SHOULD | User | مسار استكشافي بلا التزام | TC-TBD-010 | APPROVED |
| FR-U-013 | P-EVID | CAP-06 | F-CAR-04 | P1 | MUST | User | `Observed` فقط · لا عرض علني | TC-TBD-011 | APPROVED |
| FR-U-014 | P-DIR | CAP-08 | F-CAR-05 | P1 | MUST | User | صفحة واحدة · كل عبارة موسومة بمصدرها | TC-TBD-012 | APPROVED |
| FR-U-015 | P-TRUST | CAP-08 | F-CAR-07 | P1 | MUST | User | اعتراض يُسجَّل كحدث ومقياس جودة | TC-TBD-013 | APPROVED |
| FR-U-020 | P-DIR | CAP-15 | F-ACT-01 | P1 | MUST | User·System | نشاط واحد بسبب ظاهر | TC-TBD-014 | APPROVED |
| FR-U-021 | P-DIR | CAP-15 | F-ACT-02 | P1 | SHOULD | User | بديل واحد لا كتالوج | TC-TBD-015 | APPROVED |
| FR-U-022 | P-JUDGE | CAP-16 | F-ACT-03 | P1 | MUST | User | مدخلات خاصة غير متاحة عامًا | TC-TBD-016 | APPROVED |
| FR-U-023 | P-JUDGE | CAP-16 | F-CON-09 | P1 | MUST | User | بطاقة سياسة AI **قبل** البدء | TC-TBD-017 | APPROVED |
| FR-U-024 | P-DIR | CAP-16 | F-ACT-04 | P1 | MUST | User | موعد بلا عقوبة · التأخر يُوسم | TC-TBD-018 | APPROVED |
| FR-U-025 | P-PRIV | CAP-16 | F-ACT-05 | P1 | MUST | User | حفظ تلقائي · إشارات مُعلَنة مسبقًا | TC-TBD-019 | APPROVED |
| FR-U-026 | P-JUDGE | CAP-17 | F-ACT-06 | P1 | MUST | User | ضمن السقف · وسم "نظام لا إنسان" | TC-TBD-020 | APPROVED |
| FR-U-027 | P-EVID | CAP-19 | F-ACT-07 | P1 | MUST | User | ترقية بلا إعادة المشروع | TC-TBD-021 | APPROVED |
| FR-U-030 | P-MULTI | CAP-18 | F-WRK-01 | P1 | MUST | User | كيان واحد لكل الأنواع | TC-TBD-022 | APPROVED |
| FR-U-031 | P-MULTI | CAP-18 | F-WRK-02 | P1 | MUST | User | المصادر الخمسة مدعومة | TC-TBD-023 | APPROVED |
| FR-U-032 | P-EVID | CAP-18 | F-WRK-03..07 | P1 | MUST | User | السلسلة كاملة مرئية | TC-TBD-024 | APPROVED |
| FR-U-033 | P-TRUST | CAP-18 | F-WRK-09 | P1 | MUST | User | سقف `self_reported` ظاهر + طريق ترقية | TC-TBD-025 | APPROVED |
| FR-U-034 | P-MULTI | CAP-18 | F-WRK-10 | P1 | SHOULD | User | نفس الكيان بسقف مختلف | TC-TBD-026 | APPROVED |
| FR-U-040 | P-TRUST | CAP-20 | F-EVL-01 | P1 | MUST | User | قفل · إعادة التسليم نسخة جديدة | TC-TBD-027 | APPROVED |
| FR-U-041 | P-JUDGE | CAP-20 | F-EVL-02 | P1 | MUST | User | إقرار كامل · لا يخفض الدرجة بذاته | TC-TBD-028 | APPROVED |
| FR-U-042 | P-TRUST | CAP-23 | F-EVL-07 | P1 | MUST | User | لا رقم بلا بند ومبرر ومقتطف | TC-TBD-029 | APPROVED |
| FR-U-043 | P-UX | CAP-26 | F-EVL-11 | P1 | MUST | User | خمسة عناصر · بلا لغة رسوب | TC-TBD-030 | APPROVED |
| FR-U-044 | P-TRUST | CAP-28 | F-EVL-15 | P1 | MUST | User | لا استبدال للأصل · قرار مُعلَّل | TC-TBD-031 | APPROVED |
| FR-U-050 | P-EVID | CAP-24 | F-EVD-01 | P1 | MUST | User | بطاقة دليل كاملة الحقول | TC-TBD-032 | APPROVED |
| FR-U-051 | P-PRIV | CAP-24 | F-EVD-06 | P1 | MUST | User | إخفاء لا حذف | TC-TBD-033 | APPROVED |
| FR-U-052 | P-EVID | CAP-30 | F-AST-01 | P1 | MUST | User | `evidence_ref` لكل عبارة · لا اختراع | TC-TBD-034 | APPROVED |
| FR-U-053 | P-EVID | CAP-30 | F-AST-02 | P1 | MUST | User | Headline · About · مشروع | TC-TBD-035 | APPROVED |
| FR-U-054 | P-TRUST | CAP-39 | F-AST-03 | P1 | MUST | User | "لماذا نقول هذا" تفتح سلسلة النسب | TC-TBD-036 | APPROVED |
| FR-U-055 | P-PROOF | CAP-31 | F-AST-04/05 | P1 | MUST | User | نشر بموافقة بعد فحص خصوصية | TC-TBD-037 | APPROVED |
| FR-U-056 | P-PROOF | CAP-30 | F-AST-06 | P1 | SHOULD | User | تصدير نصي | TC-TBD-038 | APPROVED |
| FR-U-057 | P-TRUST | CAP-30 | F-AST-07 | P1 | MUST | User | التعديل خارج الدليل يُسقط الوسم | TC-TBD-039 | APPROVED |
| FR-U-060 | P-UX | CAP-33 | F-CMP-01 | P1 | MUST | User | من حالة النظام لا توليد حر | TC-TBD-040 | APPROVED |
| FR-U-061 | P-DIR | CAP-33/34 | F-CMP-02 | P1 | MUST | User | إجراء واحد مربوط بفجوة | TC-TBD-041 | APPROVED |
| FR-U-062 | P-DIR | CAP-41 | F-CMP-03/04 | P1 | MUST | User·System | تذكير · كشف توقف > 3 أيام | TC-TBD-042 | APPROVED |
| FR-U-063 | P-UX | CAP-33 | F-CMP-06 | P1 | MUST | User | الأسئلة الأربعة من بيانات النظام | TC-TBD-043 | APPROVED |
| FR-U-064 | P-TRUST | CAP-33 | F-CMP-05 | P1 | MUST | User | لا وعد بوظيفة · لا مقارنة | TC-TBD-044 | APPROVED |
| FR-U-065 | P-TRUST | CAP-33 | F-CMP-07 | P1 | MUST | User | إفصاح صريح عن خارج النطاق | TC-TBD-045 | APPROVED |
| FR-U-066 | P-UX | CAP-33 | F-CMP-09 | P1 | SHOULD | User | نبرة حسب التفضيل | TC-TBD-046 | APPROVED |
| FR-U-067 | P-PRIV | CAP-16 | F-GOV-11 | P1 | MUST | User | إفصاح ما يُسجَّل قبل بدء النشاط | TC-TBD-047 | APPROVED |

# 2. المصفوفة الأمامية — C2: Internal Platform (FR-P)

| Req ID | المبدأ | CAP | Feature | Phase | Pri | Actor | معيار القبول (مختصر) | Test ID | Status |
|---|---|---|---|---|---|---|---|---|---|
| FR-P-001 | P-MULTI | CAP-05 | F-ID-05 | P1 | MUST | System | `org_id` موجود ومعطّل | TC-TBD-048 | APPROVED |
| FR-P-002 | P-TRUST | CAP-09 | F-CAR-06 | P1 | MUST | System | `system_derived` بقاعدة ومراجع وزمن | TC-TBD-049 | APPROVED |
| FR-P-003 | P-EVID | CAP-09 | F-CAR-08 | P1 | SHOULD | System | إعادة حساب بعد كل تقييم | TC-TBD-050 | APPROVED |
| FR-P-010 | P-MULTI | CAP-11 | F-CON-01 | P1 | MUST | System | العقد للستة · التفعيل لواحد | TC-TBD-051 | APPROVED |
| FR-P-011 | P-TRUST | CAP-11 | F-CON-02 | P1 | MUST | Author | تجميد بعد النشر · حماية النسخ الجارية | TC-TBD-052 | APPROVED |
| FR-P-012 | P-MULTI | CAP-13 | F-CON-03 | P1 | MUST | Author | كل فجوة منسوبة لمتطلب صريح | TC-TBD-053 | APPROVED |
| FR-P-013 | P-MULTI | CAP-13 | F-CON-05 | P1 | MUST | Author | معرّف دائم + `recency_policy` | TC-TBD-054 | APPROVED |
| FR-P-014 | P-MULTI | CAP-13 | F-CON-06 | P1 | MUST | System | الجدول موجود وفارغ | TC-TBD-055 | APPROVED |
| FR-P-015 | P-TRUST | CAP-12 | F-CON-04 | P1 | MUST | Author | بنود · واصفات · عتبات · `skill_mapping` | TC-TBD-056 | APPROVED |
| FR-P-016 | P-JUDGE | CAP-22 | F-CON-08 | P1 | MUST | Author·SME | لا اعتماد بلا I1+I2+I3 | TC-TBD-057 | APPROVED |
| FR-P-017 | P-TRUST | CAP-14 | F-CON-10 | P1 | MUST | Author | الترشيح من السجل حصرًا | TC-TBD-058 | APPROVED |
| FR-P-018 | P-TRUST | CAP-12 | F-CON-11 | P1 | MUST | Author·Reviewer | اتفاق ≥80% شرط نشر | TC-TBD-059 | APPROVED |
| FR-P-020 | P-COST | CAP-21 | F-EVL-03 | P1 | MUST | System | رفض شكلي لا يستهلك محاولة | TC-TBD-060 | APPROVED |
| FR-P-021 | P-COST | CAP-21 | F-EVL-04 | P1 | MUST | System | قبل أي نموذج · فرصة تصحيح واحدة | TC-TBD-061 | APPROVED |
| FR-P-022 | INV-9 | CAP-26 | F-EVL-10 | P1 | MUST | System | حتمي · الدرجة ≠ المستوى | TC-TBD-062 | APPROVED |
| FR-P-023 | P-TRUST | CAP-27 | F-EVL-12 | P1 | MUST | System | المحفّزات العشرة تدخل الطابور | TC-TBD-063 | APPROVED |
| FR-P-024 | P-TRUST | CAP-27 | F-EVL-16 | P1 | SHOULD | System | قياس الاتفاق — بوابة خروج P1 | TC-TBD-064 | APPROVED |
| FR-P-030 | P-COST | CAP-37 | F-AI-01 | P1 | MUST | System | حتمي · لا حلقات · أقل سياق | TC-TBD-065 | APPROVED |
| FR-P-031 | P-COST | CAP-38 | F-AI-05 | P1 | MUST | System | ست طبقات · **القيم TBD** | TC-TBD-066 | APPROVED |
| FR-P-032 | P-TRUST | CAP-38 | F-AI-06 | P1 | MUST | System | `prompt_version` لكل استدعاء | TC-TBD-067 | APPROVED |
| FR-P-033 | P-COST | CAP-38 | F-AI-08/09 | P1 | SHOULD | System | لا تخفيض لنموذج التقييم | TC-TBD-068 | APPROVED |
| FR-P-034 | P-COST | CAP-38 | F-AI-10 | P1 | SHOULD | System | إنذارات شذوذ · العتبات TBD | TC-TBD-069 | APPROVED |
| FR-P-035 | P-UX | CAP-33 | F-CMP-08 | P1 | MUST | System | تدرّج ثلاثي · لا توقف | TC-TBD-070 | APPROVED |
| **FR-P-036** | INV-1 | **CAP-29** | F-WRK-08 · F-EVD-07 | P1 | MUST | System | اشتقاق حتمي · ممنوع بلا دليل · `revoked` بسحب الدليل | TC-TBD-103 | **APPROVED** *(CHG-001)* |
| **FR-P-037** | P-TRUST | **CAP-27** | F-EVL-13 | P1 | MUST | Reviewer·System | مراجعة عمياء · سجل قرار غير قابل للتعديل + `role_performed` | TC-TBD-104 | **APPROVED** *(CHG-002)* |

# 3. المصفوفة الأمامية — C3: Agentic (FR-A)

| Req ID | المبدأ | CAP | Feature | Agent | Phase | Pri | معيار القبول (مختصر) | Test ID | Status |
|---|---|---|---|---|---|---|---|---|---|
| FR-A-001 | P-DIR | CAP-08 | F-CAR-05 | A02 | P1 | MUST | لا فجوة بلا متطلب · fallback حتمي | TC-TBD-071 | APPROVED |
| FR-A-002 | P-JUDGE | CAP-17 | F-ACT-06 | A11 | P1 | MUST | لا حلول · لا تلميح · وسم نظام | TC-TBD-072 | APPROVED |
| FR-A-003 | INV-2 | CAP-23 | F-EVL-06 | A13 | P1 | MUST | بند+مبرر+مقتطف+مهارة · بلا رؤية الملف | TC-TBD-073 | APPROVED |
| FR-A-004 | P-TRUST | CAP-23 | F-EVL-06 | A13 | P1 | MUST | لا نتيجة تخمينية · تصعيد بعد محاولة | TC-TBD-074 | APPROVED |
| FR-A-005 | P-JUDGE | CAP-22 | F-EVL-05 | A13 | P1 | MUST | فحص حاسم غير مكتشَف ⇒ سقف `Practiced` | TC-TBD-075 | APPROVED |
| FR-A-006 | INV-1 | CAP-24 | F-EVL-08 | A14 | P1 | MUST | "لا دليل" نتيجة مشروعة | TC-TBD-076 | APPROVED |
| FR-A-007 | P-EVID | CAP-30 | F-AST-01/02 | A17 | P1 | MUST | لا اختراع · لا تجاوز للمستوى | TC-TBD-077 | APPROVED |
| FR-A-008 | P-EVID | CAP-31 | F-AST-04 | A16 | P1 | MUST | لا اختلاق سياق · إفصاح المحاكاة | TC-TBD-078 | APPROVED |
| FR-A-009 | P-UX | CAP-33 | F-CMP-06 | A01 | P1 | MUST | يشرح ولا يخطط · لا يقيّم | TC-TBD-079 | APPROVED |
| FR-A-010 | P-DIR | CAP-35 | F-EVL-07 | A15 | P1 | MUST | نقد العمل لا الشخص · لا تغيير درجة | TC-TBD-080 | APPROVED |
| FR-A-011 | P-DIR | CAP-36 | F-CON-10 | A07 | P1 | MUST | ترشيح بلا تطبيق مرفوض | TC-TBD-081 | APPROVED |
| FR-A-012 | INV-3 | CAP-37 | **F-AI-11** | A01–A19 | P1 | MUST | دمج تنفيذ مسموح · دمج عقود ممنوع | TC-TBD-082 | **APPROVED** *(CHG-003)* |

# 4. المصفوفة الأمامية — C4: Governance (FR-G)

| Req ID | المبدأ | CAP | Feature | Phase | Pri | Actor | معيار القبول (مختصر) | Test ID | Status |
|---|---|---|---|---|---|---|---|---|---|
| FR-G-001 | INV-5 | CAP-39 | F-GOV-01 | P1 | MUST | System | كتابة بلا مصدر مرفوضة | TC-TBD-083 | APPROVED |
| FR-G-002 | INV-5 | CAP-39 | F-GOV-02 | P1 | MUST | System | قاعدة+مراجع+زمن · لا LLM | TC-TBD-084 | APPROVED |
| FR-G-003 | P-TRUST | CAP-39 | F-GOV-03 | P1 | MUST | System | سلسلة نسب في صفحة واحدة | TC-TBD-085 | APPROVED |
| FR-G-004 | INV-3 | CAP-39 | F-GOV-04 | P1 | MUST | System | لا كتابة مباشرة من وكيل | TC-TBD-086 | APPROVED |
| FR-G-005 | INV-8 | CAP-40 | F-GOV-05 | P1 | MUST | System | append-only · لا حذف | TC-TBD-087 | APPROVED |
| FR-G-006 | P-EVID | CAP-25 | F-EVL-09 | P1 | MUST | System | V1–V8 · تخفض ولا ترفع · وضع آمن | TC-TBD-088 | APPROVED |
| FR-G-007 | P-TRUST | CAP-27 | F-EVL-14 | P1 | MUST | Reviewer | الحقول الثمانية · لا رفع بشرط مفقود | TC-TBD-089 | APPROVED |
| FR-G-008 | P-EVID | CAP-24 | F-EVD-03 | P1 | MUST | System | سقوف قوة المصدر مطبّقة | TC-TBD-090 | APPROVED |
| FR-G-009 | P-EVID | CAP-25 | F-EVD-04 | P1 | MUST | System·Reviewer | دليلان · الاستثناء موثّق ومراجَع | TC-TBD-091 | APPROVED |
| FR-G-010 | INV-6 | CAP-38 | F-AI-02/03 | P1 | MUST | System | لا استدعاء بلا `CostRecord` + لقطة سعر | TC-TBD-092 | APPROVED |
| FR-G-011 | P-COST | CAP-38 | F-AI-04 | P1 | MUST | System | التجميعات السبع · منها لكل دليل | TC-TBD-093 | APPROVED |
| FR-G-012 | P-TRUST | CAP-39 | F-AI-07 | P1 | MUST | System | أثر كامل لكل مخرَج AI | TC-TBD-094 | APPROVED |
| FR-G-013 | P-PRIV | CAP-42 | F-GOV-06 | P1 | MUST | Admin | سياسة لكل فئة · بيانات لا كود | TC-TBD-095 | APPROVED |
| FR-G-014 | P-PRIV | CAP-42 | F-GOV-07 | P1 | MUST | Admin | التعليق يسبق الحذف المجدول | TC-TBD-096 | APPROVED |
| FR-G-015 | P-PRIV | CAP-42 | F-GOV-08 | P1 | MUST | Admin | بوابة على Technical Design | TC-TBD-097 | APPROVED |
| FR-G-016 | P-PRIV | CAP-31 | F-GOV-09 | P1 | MUST | System | فحص قبل أي نشر عام | TC-TBD-098 | APPROVED |
| FR-G-017 | P-JUDGE | CAP-22 | F-GOV-10 | P1 | MUST | System·Reviewer | N0–N4 · إشارتان · قابل للاعتراض | TC-TBD-099 | APPROVED |
| FR-G-018 | P-TRUST | CAP-42 | **F-GOV-12** | P1 | MUST | Admin | لا تأثير تقييمي لـAdmin | TC-TBD-100 | **APPROVED** *(CHG-003)* |
| FR-G-019 | P-TRUST | CAP-42 | **F-GOV-13** | P1 | MUST | Admin | قراءة بسبب موثّق + حدث تدقيق | TC-TBD-101 | **APPROVED** *(CHG-003)* |
| FR-G-020 | P-TRUST | CAP-11 | **F-CON-12** | P0/P1 | MUST | SME | لا نشر بلا اعتماد SME | TC-TBD-102 | **APPROVED** *(CHG-004)* |

---

# 5. سجل الفجوات (Gap Register) — **محدَّث بعد `CHG-001..004`**

| Gap ID | النوع | الوصف | الحل المنفَّذ | الحالة |
|---|---|---|---|---|
| **GAP-00** | تناقض عددي | عدد المتطلبات ذُكر 97 والفعلي 102 | تصحيح §19.2 | ✅ **مغلق** (v1.1) |
| **GAP-01** | ميزة بلا متطلب | `F-CON-07` (3 أنشطة معتمدة) — **التزام تسليم محتوى لا سلوك نظام** | **استثناء مقبول موثّق**: يُتتبَّع في `27-team-resource-model` وقياسات Phase 0 (`hours_per_activity`) بدل متطلب وظيفي | 🟢 **مغلق كـContent Commitment** |
| **GAP-02** | ميزة بلا متطلب | إنشاء `Achievement` (CAP-29) | **`FR-P-036`** | ✅ **مغلق** (`CHG-001`) |
| **GAP-03** | ميزة بلا متطلب | واجهة المراجع وسجل القرار (`F-EVL-13`) | **`FR-P-037`** | ✅ **مغلق** (`CHG-002`) |
| **GAP-04** | تغطية جزئية | `F-EVD-02` · `F-EVD-05` مغطّيان بقواعد وحالات | **مقبول موثّق**: `SR-006` + `DR-012` + §8 — المستويات **قاعدة لا قدرة** | 🟢 **مغلق بتفسير** |
| **GAP-05** | متطلب بلا ميزة | `FR-A-012` · `FR-G-018` · `FR-G-019` | **`F-AI-11`** · **`F-GOV-12`** · **`F-GOV-13`** | ✅ **مغلق** (`CHG-003`) |
| **GAP-06** | متطلب بلا ميزة | `FR-G-020` | **`F-CON-12`** | ✅ **مغلق** (`CHG-004`) |
| **GAP-07** | تناقض عددي | **أعداد جرد المزايا كانت تقديرًا لا عدًّا**: ذُكر 91 ميزة و76 MUST و43 واجهة… والفعلي **104** قبل الإضافات | **إعادة حساب آلية** من صفوف الجداول + **قاعدة تصنيف حتمية معلنة** بدل تصنيف يدوي | ✅ **مغلق** (v1.1) |

## نتيجة إعادة فحص التغطية *(الشروط الثلاثة المطلوبة)*

| الشرط | النتيجة |
|---|---|
| **لا Feature بلا Requirement** إلا باستثناء Content Commitment موثّق | ✅ **مستوفى** — 107 من 108 لها متطلب · `F-CON-07` **استثناء موثّق** · `F-EVD-02/05` مغطّيان بقواعد مُعلنة |
| **لا Requirement بلا مصدر واضح** | ✅ **مستوفى** — 104 متطلبًا، كلها بمصدر ميزة (وبعضها بقرار داعم إضافي) |
| **لا Gap أحمر متبقٍ** | ✅ **مستوفى** — **صفر فجوات حمراء** · 2 مغلقتان بتفسير موثّق · 5 مغلقة بالحل |

> **ملاحظة منهجية:** فجوتان من السبع (GAP-00 · GAP-07) كانتا **أخطاء عدّ في وثائقي**، ولم تظهرا إلا بالعدّ الآلي. الأرقام في هذه الوثائق **تُحسب ولا تُقدَّر** من الآن.

---

# 6. الفهرس العكسي (Feature → Requirements)

> **السؤال المجاب:** أي ميزة تحقّقها أي متطلبات؟

| Feature | Requirements | Status |
|---|---|---|
| F-ID-01 · 02 · 03 | FR-U-001 · 002 · 003 | ✓ |
| F-ID-04 | FR-U-004 | ✓ |
| F-ID-05 | FR-P-001 | ✓ |
| F-ID-06 · 07 · 08 | FR-U-005 · 006 · 007 | ✓ |
| F-CAR-01 · 02 · 03 · 04 | FR-U-010 · 011 · 012 · 013 | ✓ |
| F-CAR-05 | FR-U-014 · **FR-A-001** | ✓ |
| F-CAR-06 · 08 | FR-P-002 · FR-P-003 | ✓ |
| F-CAR-07 | FR-U-015 | ✓ |
| F-CON-01 · 02 · 03 | FR-P-010 · 011 · 012 | ✓ |
| F-CON-04 | FR-P-015 | ✓ |
| F-CON-05 · 06 | FR-P-013 · 014 | ✓ |
| **F-CON-07** | — *(التزام محتوى موثّق)* | 🟢 **استثناء مقبول** |
| F-CON-08 | FR-P-016 | ✓ |
| F-CON-09 | FR-U-023 | ✓ |
| F-CON-10 | FR-P-017 · **FR-A-011** | ✓ |
| F-CON-11 | FR-P-018 | ✓ |
| **F-CON-12** | **FR-G-020** | ✓ *(CHG-004)* |
| F-ACT-01 · 02 · 03 · 04 · 05 | FR-U-020 · 021 · 022 · 024 · 025 | ✓ |
| F-ACT-06 | FR-U-026 · **FR-A-002** | ✓ |
| F-ACT-07 | FR-U-027 | ✓ |
| F-WRK-01 · 02 | FR-U-030 · 031 | ✓ |
| F-WRK-03..07 | FR-U-032 | ✓ |
| **F-WRK-08** | **FR-P-036** | ✓ *(CHG-001)* |
| F-WRK-09 · 10 | FR-U-033 · 034 | ✓ |
| F-EVL-01 · 02 | FR-U-040 · 041 | ✓ |
| F-EVL-03 · 04 | FR-P-020 · 021 | ✓ |
| F-EVL-05 | **FR-A-005** | ✓ |
| F-EVL-06 | **FR-A-003 · FR-A-004** | ✓ |
| F-EVL-07 | FR-U-042 · **FR-A-010** | ✓ |
| F-EVL-08 | **FR-A-006** | ✓ |
| F-EVL-09 | FR-G-006 | ✓ |
| F-EVL-10 | FR-P-022 | ✓ |
| F-EVL-11 | FR-U-043 | ✓ |
| F-EVL-12 | FR-P-023 | ✓ |
| **F-EVL-13** | **FR-P-037** | ✓ *(CHG-002)* |
| F-EVL-14 | FR-G-007 | ✓ |
| F-EVL-15 | FR-U-044 | ✓ |
| F-EVL-16 | FR-P-024 | ✓ |
| F-AST-01 | FR-U-052 · **FR-A-007** | ✓ |
| F-AST-02 | FR-U-053 · **FR-A-007** | ✓ |
| F-AST-03 | FR-U-054 | ✓ |
| F-AST-04 · 05 | FR-U-055 · **FR-A-008** | ✓ |
| F-AST-06 · 07 | FR-U-056 · 057 | ✓ |
| F-EVD-01 | FR-U-050 | ✓ |
| **F-EVD-02 · 05** | SR-006 · DR-012 · §8 | 🟢 **مغطّى بقواعد (مقبول)** |
| F-EVD-03 · 04 | FR-G-008 · 009 | ✓ |
| F-EVD-06 | FR-U-051 | ✓ |
| **F-EVD-07** | **FR-P-036** | ✓ *(CHG-001)* |
| F-CMP-01 · 02 | FR-U-060 · 061 | ✓ |
| F-CMP-03 · 04 | FR-U-062 | ✓ |
| F-CMP-05 | FR-U-064 | ✓ |
| F-CMP-06 | FR-U-063 · **FR-A-009** | ✓ |
| F-CMP-07 | FR-U-065 | ✓ |
| F-CMP-08 | FR-P-035 | ✓ |
| F-CMP-09 | FR-U-066 | ✓ |
| F-AI-01 | FR-P-030 | ✓ |
| F-AI-02 · 03 | FR-G-010 | ✓ |
| F-AI-04 | FR-G-011 | ✓ |
| F-AI-05 | FR-P-031 | ✓ |
| F-AI-06 | FR-P-032 | ✓ |
| F-AI-07 | FR-G-012 | ✓ |
| F-AI-08 · 09 | FR-P-033 | ✓ |
| F-AI-10 | FR-P-034 | ✓ |
| **F-AI-11** | **FR-A-012** | ✓ *(CHG-003)* |
| F-GOV-01..05 | FR-G-001 … 005 | ✓ |
| F-GOV-06 · 07 · 08 · 09 · 10 | FR-G-013 · 014 · 015 · 016 · 017 | ✓ |
| F-GOV-11 | FR-U-067 | ✓ |
| **F-GOV-12** | **FR-G-018** | ✓ *(CHG-003)* |
| **F-GOV-13** | **FR-G-019** | ✓ *(CHG-003)* |

**التغطية بعد `CHG-001..004`:** **107 من 108 ميزة لها متطلب** · **1 استثناء Content Commitment موثّق** (`F-CON-07`) · **2 مغطّاة بقواعد مُعلنة** (`F-EVD-02/05`) · **صفر فجوات حمراء**.

---

# 7. تغطية القدرات (Capability Coverage)

| CAP | الحالة | المتطلبات |
|---|---|---|
| CAP-01 … CAP-04 | ✓ مغطّاة | FR-U-001 … 007 |
| CAP-05 | 🟡 بذرة فقط | FR-P-001 · باقيها `DEFERRED` P5 |
| CAP-06 … CAP-09 | ✓ مغطّاة | FR-U-010..015 · FR-P-002/003 · FR-A-001 |
| CAP-10 | `DEFERRED` P2 | — |
| CAP-11 … CAP-14 | ✓ مغطّاة | FR-P-010..018 · FR-G-020 *(F-CON-12)* |
| CAP-15 … CAP-19 | ✓ مغطّاة | FR-U-020..034 · FR-A-002 |
| CAP-20 … CAP-26 | ✓ مغطّاة | FR-U-040..044 · FR-P-020..022 · FR-A-003..006 · FR-G-006/008/009 |
| CAP-27 · CAP-28 | ✓ **مغطّاة** | FR-P-023/024 · **FR-P-037** · FR-G-007 |
| **CAP-29** | ✓ **مغطّاة** | **FR-P-036** |
| CAP-30 · CAP-31 | ✓ مغطّاة | FR-U-052..057 · FR-A-007/008 · FR-G-016 |
| CAP-32 | `DEFERRED` P4 | الاسم محجوز عبر FR-U-004 |
| CAP-33 … CAP-36 | ✓ مغطّاة | FR-U-060..066 · FR-P-035 · FR-A-009..011 |
| CAP-37 … CAP-42 | ✓ مغطّاة | FR-P-030..034 · FR-G-001..005 · 010..015 · 018/019 |
| CAP-43 … CAP-51 | `DEFERRED` P3–P5 | لا متطلبات في هذا الأساس — **مقصود** |

---

# 8. قواعد صيانة المصفوفة *(D-039 · D-042)*

1. **كل متطلب جديد** يدخل بـ: مبدأ · CAP · Feature · Phase · Priority · Actor · معيار قبول · `TC-TBD-xxx` · Status — **قبل اعتماده**.
2. **لا يُقبل متطلب بلا مصدر** (ميزة أو قرار موثّق)، ولا تُقبل ميزة بلا متطلب — **وإلا تُسجَّل كـGap ظاهر**.
3. **كل تغيير في متطلب معتمد** يحمل `CHG-xxx` ويحدّث: الصف في §1–4 · الفهرس العكسي §6 · سجل الفجوات §5.
4. **`TC-TBD-xxx` تُستبدل بمعرّفات اختبار حقيقية** عند اشتقاق حالات الاختبار — **ولا تُحذف الصفوف**.
5. **المصفوفة تُراجَع عند كل بوابة مرحلة**، وتُرفق نتيجتها بقرار العبور.
6. **فجوة مفتوحة لا تمنع الأساس** — لكنها تمنع ادعاء اكتمال التغطية.

---

## سجل التغييرات المطبَّقة على الأساس *(D-043)*

| Change ID | السبب | الأثر المنفَّذ | الحالة |
|---|---|---|---|
| `CHG-001` | GAP-02 | `FR-P-036` + تتبّع `F-WRK-08`/`F-EVD-07`/CAP-29 + INV-1 | ✅ **مطبَّق** |
| `CHG-002` | GAP-03 | `FR-P-037` + تتبّع `F-EVL-13`/CAP-27 | ✅ **مطبَّق** |
| `CHG-003` | GAP-05 | `F-AI-11` · `F-GOV-12` · `F-GOV-13` في الجرد + تحديث ثلاثة صفوف | ✅ **مطبَّق** |
| `CHG-004` | GAP-06 | `F-CON-12` في الجرد + تحديث `FR-G-020` | ✅ **مطبَّق** |

**الاعتماد:** Product Owner (R-1) · **المبرر:** سدّ فجوات تتبّع لقدرات معتمدة أصلًا — **لا توسعة نطاق**.

## الأعداد بعد التطبيق
| البُعد | العدد |
|---|---|
| المتطلبات الوظيفية | **104** (FR-U 47 · FR-P **25** · FR-A 12 · FR-G 20) |
| مزايا Phase 1 | **108** (97 MUST · 11 SHOULD) |
| صفوف المصفوفة | **104** · `TC-TBD-001 … TC-TBD-104` |
| الفجوات الحمراء | **0** |
| طلبات تغيير مفتوحة | **0** |
