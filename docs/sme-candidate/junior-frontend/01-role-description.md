> **DRAFT · NOT SME APPROVED · NOT PUBLISHED · NOT IMPORTED (Rev. 2).** Candidate text for `role.json` of a future `trk_frontend_junior` candidate version. The canonical role (`0.2.1`) is unchanged.

# Role description: `frontend-developer-junior` (candidate)

## Changes from 0.2.1 (and their source)

| Field | 0.2.1 | Candidate | Source |
|---|---|---|---|
| `description_ar` | «يبني ويصلح واجهات ويب صغيرة إلى متوسطة من وصف قصير، باستخدام HTML وCSS وJavaScript كما تعرّفها المعايير، ويشرح قراراته لفريقه. لا يُفترض إطار عمل معيّن؛ الأطر تُتعلَّم في سياق الفريق.» | «يبني ويصلح واجهات ويب صغيرة إلى متوسطة من وصف قصير، باستخدام HTML وCSS وJavaScript كما تعرّفها المعايير؛ **يقرأ كودًا قائمًا ويتتبّع الأعطال ويصلحها، ويتعامل مع بيانات API وحالاتها، ويعمل بـGit ضمن فريق**، ويشرح قراراته لفريقه. لا يُفترض إطار عمل معيّن؛ الأطر تُتعلَّم في سياق الفريق.» | SME-05, SME-01, SME-15 |
| `description_en` | (as 0.2.1) | "Builds and fixes small-to-medium web interfaces from a short brief using standards-based HTML, CSS and JavaScript; **reads existing code, traces and fixes defects, handles API data and its states, and works with Git in a team**; explains decisions to the team. No specific framework is assumed; frameworks are learned in the team's context." | same |
| `typical_responsibilities_ar` | 7 items | adds «العمل على فرع وتقديم Pull Request بوصف واضح» and «معالجة حالات التحميل والخطأ والفراغ في بيانات API» | C1, SME-35 |
| `expected_from_junior_ar` | 4 items | adds «قراءة مكوّن بسيط وشرح سلوكه وتتبّع مشكلة أساسية فيه», «إصلاح خطأ بسيط في كود لم يكتبه بنفسه من سببه» and «فهم ما يسلّمه وشرح ما غيّره في كوده» | SME-02, SME-32, **F1, F2** (Rev. 2: no universal «تعديله عند الطلب», F3) |
| `not_expected_from_junior_ar` | 5 items | «تصميم معمارية النظام» becomes «تصميم معمارية النظام كاملة أو قيادة القرارات التقنية والتخطيط للمشروع» (Mid-level boundary) | SME-03 |
| framework policy | framework-neutral | **unchanged** | SME-15, D-076 |

## Candidate text (Arabic, learner-facing)

**المهمة:** تحويل متطلب منتج إلى واجهة تعمل، يمكن للمستخدم استخدامها وللفريق صيانتها. *(unchanged)*

**مسؤوليات معتادة:**
- بناء صفحات ومكوّنات من وصف قصير
- إصلاح أعطال واجهة مُبلَّغ عنها
- ربط الواجهة ببيانات من API ومعالجة حالات التحميل والخطأ والفراغ
- التحقق من مدخلات النماذج
- جعل الصفحة متجاوبة وقابلة للوصول
- قراءة كود قائم وتعديله
- العمل على فرع وتقديم Pull Request بوصف واضح
- شرح ما تغيّر ولماذا

**ما يُتوقَّع من المبتدئ:**
- إنجاز مهمة محدودة النطاق باستقلالية
- طرح سؤال عند نقص المعلومة بدل الافتراض
- اختبار عمله يدويًا في متصفحين على الأقل
- شرح تدفق البيانات في ما بناه
- قراءة مكوّن بسيط وشرح سلوكه وتتبّع مشكلة أساسية فيه
- إصلاح خطأ بسيط في كود لم يكتبه بنفسه من سببه
- فهم ما يسلّمه وشرح ما غيّره في كوده

**ما لا يُتوقَّع من المبتدئ:**
- تصميم معمارية النظام كاملة أو قيادة القرارات التقنية والتخطيط للمشروع
- اختيار إطار العمل للفريق
- تحسين الأداء المتقدم
- قيادة مراجعة الكود
- إتقان إطار عمل معيّن قبل الانضمام

## Checks this text must still pass

- **No framework name** anywhere in the text (`verify-docs` §3; SRS §3.1).
- **No claim** that the platform *verifies* a skill (Verified blocked, D-102).
- **No readiness percentage or count** (SME-16, SME-51, C5).
