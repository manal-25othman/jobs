# Frontend Track — Source Gaps (OPEN-042 يبقى مفتوحًا)
**لا جلب ولا اختلاق مصادر في هذه المهمة.** ما يلي يسمّي بالضبط ما يحتاج مصدرًا رسميًا/مُنسَّقًا قبل الاعتماد.

| السجل | الادعاء | المصدر المطلوب | نوع مقبول | حاجب لمراجعة SME؟ |
|---|---|---|---|---|
| `skl_html_semantic` (تعريف · مؤشرات) | «عناصر دلالية · landmarks · ترتيب عناوين» | HTML Living Standard (لقطة L0 + ترخيص مؤكَّد) | official | **غير حاجب** للمراجعة · **حاجب** للاعتماد |
| `skl_css_responsive` | «Flexbox/Grid · استعلامات وسائط · وحدات نسبية» | CSS specs index (W3C) | official | كذلك |
| `skl_js_fundamentals` | «async/await · معالجة الرفض · نطاق المتغيرات» | ECMA-262 | official | كذلك |
| `skl_accessibility_basics` | «alt · التركيز الظاهر · أسماء العناصر التفاعلية» | WCAG 2.2 (SC 1.1.1 · 2.4.7 · 4.1.2 — تُذكر بعد الالتقاط) | official | كذلك |
| `skl_forms_validation` | «label لكل حقل · التحقق المدمج» | HTML Living Standard §forms | official | كذلك |
| `skl_ui_state_interaction` · `skl_api_data_states` · `skl_frontend_debugging` · `skl_code_reading` | تعريفات ممارسة | لا معيار رسمي — مصدر **مُنسَّق** (SME) | curated | غير حاجب (قرار SME هو المصدر) |
| `skl_technical_explanation` · `skl_requirements_reading` | سلوكية | مصدر مُنسَّق (SME) | curated | غير حاجب |
| `skl_version_control_basics` | «Git: فرع · commit صغير · قراءة diff» | توثيق Git الرسمي | official/curated | غير حاجب |
| الدور (`frontend-developer-junior`) — «ما يُتوقَّع/لا يُتوقَّع من مبتدئ» | حكم سوق سعودي | مقابلات مشغّلين / إعلانات (مؤشر فقط، DF-4) + SME | curated (+market_signal لاحقًا كمؤشر) | **غير حاجب** — لكن يُعلَّم `SME judgement` |
| المهام (١١) — `common_failure_modes` | «كيف يخطئ المبتدئ» | جلسة SME (المادة الخام لفحوص النزاهة) | curated | **حاجب للاعتماد** (بلا SME لا تُعتمد) |
| مدد الأنشطة (120/90/90 د) | تقدير | قياس فعلي في تجربة أولى (`authoring_effort_minutes` + زمن الإنجاز) | platform_generated (بعد عيّنة) | غير حاجب؛ **يبقى `proposed`** |
| موارد التعلّم (١٠) | «مرجع MDN/W3C لكذا» | التحقق من الرابط والمحتوى (`url` ثم `last_checked`) | curated | غير حاجب؛ **حاجب للترشيح** (تبقى `unverified` وبلا `url`) |
| `src_mdn_web_docs` كمزوّد | ترخيص CC-BY-SA/CC0 | تأكيد الترخيص | — | حاجب لأي استخراج محتوى |
| سياسات الحداثة (نوافذ الأشهر) | معايرة | قرار SME + قياس لاحق | curated | غير حاجب (D-023) |

**الخلاصة:** يمكن لـSME أن يراجع كل الحزمة الآن على أساس خبرته. **الاعتماد** (`approved`) لخمس مهارات معيارية يبقى محجوبًا حتى تُلتقط لقطات L0 للمصادر الرسمية وتُؤكَّد تراخيصها (`url_verified = true` · `retrieved_at`) — وهذا يحتاج شبكة وقرارًا في `OPEN-008`.
