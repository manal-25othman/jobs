# Rubric Weights & Thresholds — حالة القيم (OPEN-043)
**القاعدة:** قيمة مسودة لا تصبح حقيقة إنتاجية صامتة. كل بند يحمل `weight_status` و`threshold_status`، وكل رُبريك `pass_threshold_status` ∈ {`approved` · `proposed` · `TBD`}. **الرُبريك غير التجريبي لا يُنشر** إلا وكل قيمه `approved` (مُحفِّز `rubric_values_publishable` + قاعدة الجودة Q20 + `assertValuesPublishable`). الحزمة **لا تستطيع** إعلان قيمها معتمدة (`validatePack` يرفض) — الاعتماد قرار SME يُسجَّل في القاعدة.

## الحالة الآن
| الرُبريك | pass_threshold | البنود | weight | threshold |
|---|---|---|---|---|
| `rub_fe_build_interface@0.1.0` | 0.75 · **proposed** | 8 | 8 proposed | 7 proposed · 1 TBD (`deliverables_complete` — لا عتبة مهارة لبند حتمي) |
| `rub_fe_debug_improve@0.1.0` | 0.75 · **proposed** | 7 | 7 proposed | 6 proposed · 1 TBD |
| `rub_fe_change_request@0.1.0` | 0.75 · **proposed** | 7 | 7 proposed | 6 proposed · 1 TBD |
| `rub_fe_003@0.2.0` (الشريحة ١ · demo منشور) | 1.0 · proposed | 4 | 4 proposed | 3 proposed · 1 TBD |
**لا قيمة معتمدة في النظام.** `role_requirement.weight` = NULL للحزمة كلها (غير محسوم).

## ما يعتمد على هذه القيم في المنتج
| القيمة | الأثر |
|---|---|
| `pass_threshold` | حدّ `passed`/`below_threshold` بعد استيفاء الإلزامي (`concludeRun`) |
| `weight` | **لا أثر تشغيلي الآن** (التجميع يجمع `score/max_score` لا الأوزان) — مُخزَّن ليحكمه SME قبل أي تشخيص موزون |
| `threshold_for_skill` | **لا أثر تشغيلي الآن** — سيحدّد متى يُشتق دليل المهارة من البند (V8) |
| `mandatory` | بند إلزامي غير مستوفٍ ⇒ لا اجتياز مهما بلغ المجموع (مُختبَر) |
| `role_requirement.weight` | وزن الفجوة في التشخيص — غير مبني بعد |

## ما يُطلب من SME
لكل بند (٢٢ + ٤): تأكيد/تعديل الوزن والعتبة وواصفات المستويات؛ للرُبريكات الثلاثة: تأكيد 0.75؛ للدور: أوزان الفجوة. الاعتماد يُسجَّل بأمر مراجعة على مستوى الرُبريك (تحديث الحالات جزء من تصحيحات الترقية `promotion-correction`).
