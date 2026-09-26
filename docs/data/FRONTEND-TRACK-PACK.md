# حزمة المسار الأول — Junior Web / Frontend Developer (`trk_frontend_junior@0.1.0`)
**التسمية:** **DEMO / DRAFT / NOT SME APPROVED** · `drafting_aid = ai_assisted` · كل صف `is_demo_fixture = true` · الحالة في القاعدة `draft`
**الملفات:** `data/career/global/*.json` (السجلات العالمية) · `data/career/tracks/trk_frontend_junior/*.json` (الحزمة) — تُستورد بـ`npm run career:import`.

## سياسة الأطر
مسار ويب/واجهات **عام**. لا React ولا Vue ولا Angular ولا Next.js مهارةً أو متطلبًا أو افتراضًا. مُتحقَّق منه آليًا: `validatePack` يرفض دورًا يذكر إطارًا في وصفه أو مسؤولياته أو أدواته (اختبار سلبي e2e)، وD-076 تحكم أي ذكر لتقنية في اقتراح.

## الدور
`frontend-developer-junior` — «مطوّر/ة واجهات ويب — مبتدئ» / Junior Web / Frontend Developer · `family: software_engineering` · `level: junior` · `region_scope: sa`
- **يُتوقَّع من المبتدئ:** إنجاز مهمة محدودة النطاق باستقلالية · السؤال عند نقص المعلومة · الاختبار اليدوي في متصفحين · شرح تدفق البيانات.
- **لا يُتوقَّع:** معمارية النظام · اختيار إطار الفريق · تحسين الأداء المتقدم · قيادة المراجعة · إتقان إطار قبل الانضمام.
- **الأدوات:** أدوات المطوّر في المتصفح (essential) · محرّر كود · Git · عميل HTTP · فاحص إتاحة · متتبّع مهام.

## المهارات (١٢ جديدة في السجل العالمي + ١ مُعاد استخدامها)
| code | النوع | الدور | ai_subst. | الحداثة |
|---|---|---|---|---|
| `skl_html_semantic` | supporting | **core** | high | rp_web_standards |
| `skl_css_responsive` | supporting | **core** | high | rp_web_standards |
| `skl_js_fundamentals` | supporting | **core** | high | rp_web_standards |
| `skl_ui_state_interaction` | supporting | **core** | medium | rp_practice |
| `skl_api_data_states` | supporting | **core** | medium | rp_practice |
| `skl_forms_validation` | supporting | supporting | high | rp_practice |
| `skl_frontend_debugging` | supporting | supporting | medium | rp_practice |
| `skl_accessibility_basics` | supporting | supporting | medium | rp_web_standards |
| `skl_code_reading` | supporting | supporting | medium | rp_practice |
| `skl_version_control_basics` | tool | supporting | high | rp_tools |
| `skl_technical_explanation` | behavioral | supporting | low | rp_behavioral |
| `skl_requirements_reading` | behavioral | supporting | low | rp_behavioral |
| `ui-testing` *(الشريحة ١)* | supporting | supporting | medium | rp_practice |

**`skill_type` في السجل ≠ `is_core` في الربط:** كل المهارات أعلاه `supporting`/`tool`/`behavioral` كنوع عالمي؛ «الأساسية» صفة **الربط بهذا الدور** (٥ بالضبط). كل مهارة: تعريف يفصلها عن أقربها · مؤشرات ملاحَظة · أنماط فشل · نوع دليل ممكن · مصدر.
**المترادفات (١٨):** صيغ (`RWD` · `a11y` · `JS` · «جافاسكريبت» نقحرة · …) وروابط (`skl_forms_validation` narrower→ `skl_ui_state_interaction` · `skl_version_control_basics` tool_of→ `skl_code_reading` · `skl_ui_state_interaction` related→ `ui-state-management`). **لا دمج.**

## المهام (١١)
`tsk_fe_build_from_brief` · `tsk_fe_form_validation` · `tsk_fe_fetch_api` · `tsk_fe_data_states` · `tsk_fe_responsive_page` · `tsk_fe_fix_ui_bug` · `tsk_fe_improve_semantics` · `tsk_fe_accessibility_basics` · `tsk_fe_debug_interaction` · `tsk_fe_explain_data_flow` · `tsk_fe_inspect_codebase` — لكل مهمة مخرَج ملموس وأنماط فشل بلغتين. («التحقق من مدخلات المستخدم» أُدمج في مهمة النموذج لأنه هو نفسه.)

## الأنشطة (٣) — كل نشاط يقيس ٢–٣ مهارات أساسية بعمق
| النشاط | أساسية (primary) | ثانوية | مدة | فحوص النزاهة |
|---|---|---|---|---|
| `act_fe_build_interface` — بناء واجهة تفاعلية بمدخلات مُهيكلة وحالات بيانات | ui_state · api_data_states · html_semantic | css_responsive · forms_validation · technical_explanation | 120 د | سؤال استيضاح (تناقض ٤/٥ حقول) · سؤال شرح (تدفق البيانات) · تناقض مزروع · حالة حدّية (استجابة فارغة) · نمط فشل (500) · متابعة (الملفات) |
| `act_fe_debug_improve` — تصحيح وتحسين واجهة قائمة | css_responsive · html_semantic · js_fundamentals | accessibility · forms · debugging | 90 د | سؤال شرح (عرَض مقابل سبب) · تعديل لاحق (نقطة توقف 900px) · `overflow-x: hidden` مزروع · إشارة حتمية (تحقق البريد) · اتساق المخرج · الملفات |
| `act_fe_change_request` — تعديل مشروع قائم بعد تغيّر متطلب | js_fundamentals · ui_state · api_data_states | code_reading · debugging · technical_explanation | 90 د | سؤال شرح (البديل المرفوض) · تعديل لاحق (فلتر ثانٍ) · `[]` كخطأ مزروع · إشارة حتمية (فلتر عبر الحالة) · حالة حدّية (فلتر فارغ) · الملفات |

كلها `ai_usage_mode = ai_assisted` · `can_yield_demonstrated = true` · **`can_yield_verified = false`**.

## الرُبريكات (٣ · ٢٢ بندًا · ٦٩ واصف مستوى)
كل بند: مهارة مرتبطة · بُعد · وزن · `max_score` · إلزامي؟ · `threshold_for_skill` · `evaluator_type` · مستويات (0/1 أو 0/1/2) بواصفات ودليل ملاحَظ · دليل متوقَّع · مبرّر عند الاستيفاء/عدمه. بنود المكتبة العامة المُستخدمة: `core.completeness.deliverables` · `core.judgment.assumption_check` · `core.judgment.scope_discipline` · `core.communication.clarity` · `core.correctness.root_cause` — **٧ من ٢٢ (٣٢٪)**. حد الاجتياز 0.75 · يقترح `demonstrated`.
**قيد صادق:** ١٩ من ٢٢ بندًا `evaluator_type = human`. المُقيِّم الحتمي الحالي **يرفض** تشغيل رُبريك منشور فيه بنود بشرية (لا يختصرها) — فهذه الأنشطة لا تُقيَّم حتى يُبنى مسار المراجعة البشرية (`OPEN-041`).

## مسارات الدليل للمهارات الأساسية
| المهارة | الأنشطة التي تقيسها ببند مرتبط | الحالة |
|---|---|---|
| html_semantic | build_interface · debug_improve | demonstrated ممكن · مساران (شرط Verified) |
| css_responsive | build_interface · debug_improve | كذلك |
| js_fundamentals | debug_improve · change_request | كذلك |
| ui_state_interaction | build_interface · change_request | كذلك |
| api_data_states | build_interface · change_request | كذلك |

**Verified غير ممكن في Phase 1** لأي منها: يلزم اعتماد SME + سياسة تحقق معتمدة + تنفيذ فحوص النزاهة I1–I3 في التقييم — `verifiedPathStatus()` يسمّي الناقص.

## موارد التعلّم (١٠ — بيانات وصفية فقط)
`url = null` و`quality_status = unverified` في **كلها** (لا شبكة، لا تحقق). كل مورد مربوط بمهارة وبنشاط تطبيق. ٣ منها «NAQLA (to be written)» — لا مورد خارجي مُتحقَّق منه لها بعد.

## المصادر (٧ + مصدر الشريحة ١)
`src_naqla_frontend_pack_v0_1` (curated · المصدر الأساسي) · `src_whatwg_html_living_standard` · `src_w3c_wcag22` · `src_ecma262` · `src_w3c_css` (official) · `src_mdn_web_docs` (curated) · `src_platform_generated_placeholder` (٠ سجل). الرسمية بلا `retrieved_at` ولا لقطة L0 (`url_verified = false`) — تُلتقط عند توفر الشبكة وتأكيد الترخيص.

## قواعد العرض (١٥)
٥ أنواع أصول × ٣ مستويات. `cv_bullet` من `practiced` («عملتُ على») · `linkedin_skill`/`case_study` من `demonstrated` · `professional_profile` يتطلب `verified`. عبارات ممنوعة موحّدة (خبير · محترف · senior · mastered …). `must_cite_evidence` دائمًا.
