# خط استيراد بيانات المهن — كما نُفِّذ
`Source → Raw → Normalize → Deduplicate → Map → Review → Approve → Publish`
**الكود:** `apps/api/src/career-data/{pack-schema,pack-loader,pipeline,quality-rules,review,cli}.ts` · المدخل `scripts/career-data.mjs` · بلا Nest.

| المرحلة | ما يحدث | من يقرّر | يوقف الخط؟ |
|---|---|---|---|
| **Source** | صفوف `data_source` من `global/sources.json`؛ ترخيص إلزامي؛ `market_signal` مرفوض في هذه المرحلة | بشري (ملف الحزمة) | نعم |
| **Raw (L0)** | `raw_snapshot` لكل ملف: المحتوى حرفيًا + `sha256` + طريقة الالتقاط؛ **غير قابل للتعديل/الحذف** (مُحفِّزان)؛ إعادة الاستيراد بنفس المحتوى ⇒ لا لقطة جديدة | آلي | نعم عند فشل القراءة |
| **Normalize (L1)** | `normalized_record`: مفتاح مطابقة لكل اسم مهارة/مترادف/مهمة/دور بـ`normalizeMatchKey` (النطاق) — **يُحذف ويُعاد توليده** كل مرة | آلي | لا |
| **Deduplicate** | `nearDuplicateCandidates` (النطاق) على اتحاد مهارات القاعدة والحزمة ⇒ `dedup_candidate` بحالة `proposed` + تقرير `data/career/reports/near-duplicates.md`. **لا دمج آلي.** القرار بشري في العمود `decision` (merge/link/keep_separate/rejected) بسبب موثَّق (قيد) | آلي يقترح · **بشري يقرّر** | لا |
| **Map** | كل مرجع (مهارة · مصدر · مهمة · نشاط · بند مكتبة) يُحلّ إلى `id` داخلي؛ **أي مرجع غير محلول ⇒ `ImportError` قبل أي كتابة** (rollback) | آلي | **نعم** |
| **Write (curated draft)** | upsert بالـ`code` كل الجداول بحالة `draft`؛ صف تجاوز `curated` **لا يُلمَس** ويُدرَج في التقرير؛ بنود رُبريك منشور مجمّدة | آلي | — |
| **Review** | `review <kind> <uuid> <to> --role --by --reason` ⇒ `assertReviewTransition` ثم UPDATE (المُحفِّز يتحقق ثانية) ثم `review_log` | **بشري** | نعم |
| **Approve** | `approved` من SME مُسمّى فقط | **SME** | نعم |
| **Publish** | `published` من مالكة المنتج، ومن `approved` فقط؛ `supersedePrevious` يُعلِّم الإصدار السابق `superseded` | مالكة المنتج | نعم |

## الأوامر
```
npm run career:import            # build api + import trk_frontend_junior (idempotent)
node scripts/career-data.mjs import trk_frontend_junior --dry-run
npm run career:validate          # quality rules; exit 1 on any FAIL
npm run career:near-duplicates   # writes data/career/reports/near-duplicates.md
node scripts/career-data.mjs review <kind> <uuid> <to> --role <content_author|sme|product_owner> --by <uuid|-> --label "<name>" --reason "<why>" [--minutes n]
```
**التكرار (idempotence) مُختبَر:** استيرادان متتاليان ⇒ نفس الأعداد؛ اللقطات `existing`؛ مراجع الإسناد لا تتضخّم.

## التحقق قبل الكتابة (`validatePack`)
يجمع **كل** المشكلات ثم يفشل مرة واحدة: مراجع معطوبة · `source_refs` فارغة · ثنائية اللغة · مهارة بلا مؤشرات · مترادف يخلط الصيغة بالربط · قاعدة عرض تحت الحد الأدنى · مورد بلا نشاط تطبيق أو بـ`url` ومنزلة أعلى من `unverified` · **دور يذكر إطار عمل** · أساسية خارج ٤–٥ · مهام خارج ١٠–١٢ · أنشطة ≠ ٣ · نشاط بلا مدخل خاص/فحص assessment-only/سؤال شرح · `can_yield_verified = true` · بند بلا واصفات · مهارة أساسية بلا مسار دليل.

## ما لا يفعله الخط
لا ينشر · لا يعتمد · لا يدمج مهارتين · لا يخمّن مطابقة · لا يحذف · لا يستورد إشارة سوق · لا يعدّل صفًا تجاوز `curated`.
