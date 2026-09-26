# نَقْلة / NAQLA — Local Development
**الإصدار:** 0.1.0 · **آخر تحقق:** 2026-09-26 على Node 22.22 و PostgreSQL 16.13

---

## ١. المتطلبات

| الأداة | النسخة | لماذا |
|---|---|---|
| Node.js | **≥ 20.11** (مُختبَر على 22.22) | `npm workspaces` و`node --test` |
| npm | ≥ 10 | مساحات العمل |
| PostgreSQL | ≥ 15 (مُختبَر على 16) | لتشغيل الهجرات واختباراتها محليًا |
| Supabase CLI | اختياري | للتشغيل الكامل بـAuth وStorage |

**لا حاجة إلى Docker** لتشغيل النطاق واختباراته — وهذا مقصود: أرخص حلقة تغذية راجعة في المشروع يجب ألّا تحتاج إلى حاوية.

---

## ٢. أول تشغيل

```bash
git clone <repo> && cd jobs
npm install                 # مساحة عمل واحدة لكل الحزم
cp .env.example .env.local  # ثم املئي القيم
npm test                    # النطاق + الإعدادات
```

`npm test` يبني `@naqla/domain` و`@naqla/config` و`@naqla/contracts` ويشغّل اختباراتها.
**النتيجة المتوقعة: ٧٠ اختبارًا ناجحًا** (٦٣ للنطاق · ٧ للإعدادات).

---

## ٣. الأوامر

| الأمر | ماذا يفعل |
|---|---|
| `npm test` | يبني الحزم المشتركة ويشغّل اختبارات النطاق والإعدادات |
| `npm run test:domain` | اختبارات النطاق وحدها — **أسرع حلقة، استعمليها أثناء العمل** |
| `npm run verify:boundaries` | **يفشل** إن استورد النطاق إطارًا، أو أعاد تطبيقٌ تعريف قاعدة |
| `npm run verify:prototype` | **يفشل** إن تغيّر النموذج المُجمَّد في `apps/web/` |
| `npm run eval:agents` | منصّة تقييم الوكلاء: ٣٠ سيناريو عبر المُنسّق والبوابة والنطاق بالمزوّد الاختباري، تشغيلان متطابقان، يكتب `packages/agents/eval/last-run.json` |
| `npm run build -w @naqla/api` | يبني الـAPI |
| `npm run build -w @naqla/app` | يبني تطبيق Next.js |
| `scripts/db-test.sh` | يطبّق الهجرات ويشغّل إثباتات القاعدة والوصول |

---

## ٤. قاعدة البيانات محليًا

### الطريق القصير (PostgreSQL عادي — يكفي لكل عمل Phase 0)

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
scripts/db-test.sh
```

يُنشئ `naqla_test` من الصفر، يطبّق الهجرات، ثم يشغّل:
- **٢٩ إثبات ثابت** — كل واحد محاولة كتابة **يجب أن ترفضها القاعدة**
- **إثباتات الوصول** بثلاثة أدوار حقيقية

`0002_rls.sql` يُنشئ أدوار Supabase إن غابت، فيعمل الملف نفسه في الحالتين.

### الطريق الكامل (Supabase CLI — عند الحاجة إلى Auth وStorage)

```bash
supabase start
supabase db reset          # يطبّق supabase/migrations بالترتيب
```

---

## ٥. تشغيل التطبيقين

```bash
npm run start:dev -w @naqla/api     # http://localhost:3001
npm run dev -w @naqla/app           # http://localhost:3000
```

**الـAPI يرفض الإقلاع بإعدادات ناقصة** ويطبع **كل** المشكلات دفعة واحدة، لا أولها. هذا مقصود: إصلاح خمس مشكلات في جولة أفضل من خمس جولات.

| المسار | ماذا يعطي |
|---|---|
| `GET /health` | حياة العملية |
| `GET /ready` | جاهزية صادقة: `degraded` مع `database: not_wired` — **لأن لا قاعدة موصولة بعد** |
| `GET /v1/domain/invariants` | الثوابت التسعة **مقروءة من `@naqla/domain`** |
| `GET /v1/domain/evidence-model` | الحالات والانتقالات المسموحة والممنوعة |
| `GET /v1/domain/planned-endpoints` | عقود الشريحة الأولى — **غير منفَّذة** |

> `/ready` يقول `degraded` عمدًا. **علامة خضراء لا تعني شيئًا أسوأ من حمراء.**

---

## ٦. خريطة المستودع

```
apps/
  web/     النموذج الثابت المُجمَّد — مرجع، لا يُعدَّل
  app/     تطبيق Next.js الإنتاجي — لم تُنقل إليه شاشة بعد
  api/     الـAPI بـNestJS — صحة وجاهزية فقط
packages/
  domain/      ← القواعد. لا يستورد إطارًا. 63 اختبارًا
  contracts/   ← عقود الشبكة. يعتمد على domain فقط
  config/      ← مخطط البيئة والتحقق منه
  ui/          ← فارغة عمدًا في Phase 0
supabase/
  migrations/  0001_init.sql · 0002_rls.sql
  tests/       invariants.sql · rls.sql
scripts/       verify-boundaries · verify-frozen-prototype · db-test
docs/architecture/  DOMAIN-MODEL · DATA-MODEL · AI-BOUNDARY · ACCESS-CONTROL-MODEL
```

---

## ٧. قواعد العمل

### النطاق أولًا
قاعدة عمل جديدة تُكتب في `packages/domain` **مع اختبارها**، ثم تُستهلك. ولا تُكتب في `apps/api` ولا `apps/app` — و`npm run verify:boundaries` **يفشل البناء** إن حدث.

### النموذج المُجمَّد لا يُعدَّل
`apps/web/` مرجع بصري ومحتوى وتفاعل، وأساس مقارنة الانحدار للتجاوب وRTL.
**لا يصير تدريجيًا قاعدة الكود الإنتاجية.** `verify:prototype` يفشل عند أي تغيير؛ وإن كان التغيير مقصودًا، يُسجَّل سببه ثم يُعاد الأساس بـ`--write`.

### الأسرار
`SUPABASE_SERVICE_ROLE_KEY` **يتجاوز RLS**. لا يصل المتصفح، ولا يوضع في متغير `NEXT_PUBLIC_`، **واختبار يرفض** أي اسم يبدأ بـ`NEXT_PUBLIC_` ويحوي سرًّا.

### الهجرات
مرقّمة بالتسلسل. **ولا تُعدَّل هجرة طُبّقت** — التصحيح هجرة جديدة.

---

## ٨. مشكلات شائعة

| العرض | السبب والعلاج |
|---|---|
| `Configuration is invalid` عند إقلاع الـAPI | متغيّر ناقص. الرسالة تسمّيه كله — قارنيها بـ`.env.example` |
| `verify:boundaries` يفشل | استُورد إطار داخل `packages/domain`، أو أُعيد تعريف قاعدة في تطبيق |
| `verify:prototype` يفشل | عُدِّل ملف في `apps/web/`. إن كان مقصودًا: سجّلي السبب ثم `node scripts/verify-frozen-prototype.mjs --write` |
| `role "authenticated" does not exist` | يعمل على PostgreSQL عادي بلا `0002_rls.sql`. طبّقي الهجرتين بالترتيب |
| اختبار RLS ينجح كله بلا سبب | **افحصي حارس `assert_effective_role`** — بلا تبديل دور حقيقي كل شيء يمر بصلاحية superuser ويثبت لا شيء |

---

## ٩. تشغيل الشريحة الرأسية الأولى كاملة

```bash
# 1 · قاعدة البيانات
createdb naqla_dev
export DATABASE_URL="postgresql://postgres@localhost:5432/naqla_dev"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/0001_init.sql \
  -f supabase/migrations/0002_rls.sql \
  -f supabase/migrations/0003_slice_1.sql \
  -f supabase/seed/0001_demo_role.sql

# 2 · الإعدادات
cp .env.example .env.local        # ثم املئي القيم، ومنها SUPABASE_JWT_SECRET

# 3 · الـAPI
npm run build -w @naqla/api && npm run start -w @naqla/api      # :3001

# 4 · الواجهة
npm run dev -w @naqla/app                                        # :3000
```

ثم في المتصفح: `/login` ← `/goal` ← `/project` ← `/evaluation` ← `/asset` ← `/report`.

### الاختبارات

```bash
npm test                          # 94 اختبار نطاق + 7 إعدادات
npm run verify                    # الحدود + النموذج المُجمَّد + الرموز
scripts/db-test.sh                # 29 إثبات ثابت + 42 إثبات وصول
DATABASE_URL=... npm run test:e2e -w @naqla/api   # 29 اختبار طرف-إلى-طرف
```

**اختبارات الطرف إلى الطرف تحتاج قاعدة بيانات مهاجَرة ومزروعة**، ويمكن أن تكون نفس `naqla_dev`.
`SUPABASE_JWT_SECRET` مطلوب للـAPI، وتُصدَّر الرموز في الاختبارات محليًا بنفس الخوارزمية والمطالبات التي يصدرها Supabase.

### ملاحظة على Supabase محليًا
الحزمة الكاملة (Auth وStorage وStudio) تحتاج **Docker** عبر `supabase start`.
وهذه الشريحة **لم تُشغَّل على حزمة Supabase حيّة** — راجعي `VERTICAL-SLICE-01-REPORT.md` §DEMO/FIXTURE.


---

## ١٠. التشغيل على مشروع Supabase حقيقي

```bash
# 1 · الهجرات والبذرة (Supabase CLI مرتبط بالمشروع)
supabase link --project-ref <ref>
supabase db push                           # يطبّق supabase/migrations بالترتيب
psql "$DATABASE_URL" -f supabase/seed/0001_demo_role.sql

# 2 · المتغيرات — في بيئة التشغيل لا في الدردشة
#   NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY · SUPABASE_JWT_SECRET · DATABASE_URL
#   STORAGE_DRIVER=supabase (الافتراضي)

# 3 · الـAPI ثم الإثبات الحيّ
npm run start -w @naqla/api
NAQLA_API_URL=http://localhost:3001 npm run live:supabase
```

`live:supabase` يُنشئ مستخدمَين مؤقتَين ويحذفهما، ويثبت: الجلسة، وتجديد الرمز، ورفض الرمز المزوّر، وRLS بمفتاح `anon` الحقيقي، ورفعًا وتنزيلًا موقّعين، وعزل الملفات بين مستخدمَين (بما فيه محاولة توقيع من المستخدم الآخر عبر Storage مباشرة)، والمسار كاملًا، ورابط مشاركة يُفتح ثم يُغلق بالإلغاء.

> **في بيئة البناء هذه:** لا بيانات اعتماد Supabase، والسياسة الشبكية ترفض `supabase.com`. لذلك لم يُشغَّل هذا السكربت بعد.
