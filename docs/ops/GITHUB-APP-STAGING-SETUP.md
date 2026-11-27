# إعداد تطبيق GitHub لبيئة التجربة (STAGING) فقط

> **لمن:** مالكة المنتج. **متى:** قبل أول تجربة للمحوّل الحقيقي على بيئة التجربة.
> - هذا التطبيق **لبيئة التجربة وحدها**. تطبيق الإنتاج يُنشأ لاحقًا بقرار منفصل.
> - الحقائق من `docs/ops/research/GITHUB-APP-INTEGRATION-RESEARCH.md`. ما لم يُتحقق منه موسوم **UNVERIFIED**.
> - **قاعدة لا استثناء لها:** أي قيمة سرية (المفتاح الخاص، Client secret، أسرار webhook والحالة) لا تُكتب في المحادثة، ولا في المستودع، ولا في رسالة، ولا في لقطة شاشة. تذهب مباشرة إلى خزنة أسرار الاستضافة.

## أولًا: إنشاء التطبيق

1. سجّلي الدخول إلى **حسابك الشخصي** على GitHub، لا إلى منظمة.
2. افتحي صفحة إنشاء تطبيق جديد: Settings → Developer settings → GitHub Apps → **New GitHub App** (المسار من واجهة GitHub، **UNVERIFIED** في البحث).
   - الطريق الموصى به: **الإنشاء يدويًا** بالقيم أدناه.
   - البديل: ملف المواصفات `ops/github-app/naqla-staging.manifest.json`. يشرح `ops/github-app/README.md` ما تستبدلينه فيه، ولماذا الإنشاء اليدوي أسلم.
3. **الاسم:** مثل `NAQLA Staging`. أبقي كلمة Staging في الاسم.
4. **Homepage URL:** عنوان واجهة بيئة التجربة.
5. **Callback URL:** عنوان API التجربة + مسار الرجوع الذي يحدده الفريق (مثال: `https://STAGING-APP.example/github/callback`).
6. فعّلي **Request user authorization (OAuth) during installation**.
7. أبقي **Expire user authorization tokens** مفعّلًا (يكون مفعّلًا افتراضيًا ما لم يُلغَ).
8. أبقي **Enable Device Flow** غير مفعّل.
9. **Webhook:** مفعّل.
   - **Webhook URL:** `https://STAGING-API.example/v1/webhooks/github` (بعنوان API التجربة الحقيقي).
   - **Webhook secret:** نص عشوائي طويل (32 حرفًا على الأقل) تولّدينه بنفسك، وتضعينه في الخزنة مباشرة باسم `GITHUB_WEBHOOK_SECRET`.

## ثانيًا: الصلاحيات (قراءة فقط، ثلاث لا غير)

10. تحت **Repository permissions**:

| الصلاحية | القيمة |
|---|---|
| Contents | **Read-only** |
| Metadata | **Read-only** |
| Pull requests | **Read-only** |
| كل ما سواها | **No access** |

11. **Organization permissions** و**Account permissions**: كلها **No access**.
12. **Subscribe to events:** لا تختاري أي حدث. الأحداث الثلاثة التي نحتاجها (`installation` و`installation_repositories` و`github_app_authorization`) تصل لكل تطبيق تلقائيًا.
13. **Where can this GitHub App be installed?** اختاري **Only on this account**.
14. اضغطي **Create GitHub App**.

## ثالثًا: القيم وأين تذهب

كلها تُدخَل في **خزنة أسرار الاستضافة لبيئة التجربة**، لا في أي مكان آخر:

| المتغير | من أين | سري؟ |
|---|---|---|
| `GITHUB_APP_ID` | رقم App ID أعلى صفحة التطبيق | لا، لكن ضعيه في الخزنة نفسها |
| `GITHUB_APP_SLUG` | الجزء الأخير من رابط التطبيق العام `github.com/apps/<slug>` | لا |
| `GITHUB_APP_CLIENT_ID` | Client ID في صفحة التطبيق | لا |
| `GITHUB_APP_CLIENT_SECRET` | زر **Generate a new client secret**. يظهر مرة واحدة: انسخيه إلى الخزنة فورًا | **نعم** |
| `GITHUB_APP_PRIVATE_KEY` | زر **Generate a private key**. ينزّل ملف `.pem`: ضعي محتواه كاملًا في الخزنة، ثم **احذفي الملف** من جهازك | **نعم** |
| `GITHUB_WEBHOOK_SECRET` | النص الذي ولّدتِه في الخطوة 9 | **نعم** |
| `GITHUB_APP_STATE_SECRET` | نص عشوائي آخر (32 حرفًا على الأقل)، مختلف عن سر webhook | **نعم** |

15. ولّدي مفتاحًا خاصًا **واحدًا** فقط. GitHub يوصي بألا تُنشأ مفاتيح أكثر من الحاجة.

## رابعًا: التثبيت للتجربة

16. افتحي `https://github.com/apps/<slug>/installations/new` وثبّتي التطبيق على حسابك الشخصي.
17. اختاري **Only select repositories**، لا **All repositories**.
18. اختاري مستودع تجربة أو اثنين **بمحتوى اصطناعي** فقط، لا مستودعات فيها بيانات حقيقية.
19. لتغيير الاختيار لاحقًا: Settings → Applications → Installed GitHub Apps → **Configure**.
   - تنبيه موثَّق: لأي تطبيق GitHub قراءة على كل المستودعات **العامة** مهما اخترتِ. المنصة نفسها لا تقرأ إلا ما اخترتِه.

## خامسًا: التدوير والإلغاء

20. **تدوير المفتاح الخاص:** صفحة التطبيق → Private keys → ولّدي مفتاحًا جديدًا → ضعيه في الخزنة مكان القديم → تأكدي أن التجربة تعمل → **احذفي المفتاح القديم**.
21. **تدوير Client secret:** بالترتيب نفسه: سر جديد ← الخزنة ← حذف القديم.
22. **تدوير سر webhook:** غيّريه في صفحة التطبيق وفي الخزنة في الوقت نفسه.
23. **عند الاشتباه بتسريب:** احذفي المفتاح أو السر المسرَّب من صفحة التطبيق **فورًا** (يتوقف عن العمل حالًا)، ثم ولّدي بديلًا.
24. **لإيقاف الوصول كليًا:** Settings → Applications → Installed GitHub Apps → Configure → **Suspend** (إيقاف مؤقت) أو **Uninstall** (إزالة). ولإلغاء التفويض: تبويب **Authorized GitHub Apps** → **Revoke**.

## ما لا يُفعَّل أبدًا

- أي صلاحية **Read & write** أو **Admin**، ولا Administration ولا Workflows ولا Secrets ولا Actions ولا Issues ولا Checks.
- أي حدث في Subscribe to events. الافتراضي يكفي.
- جعل التطبيق عامًا (Any account) في بيئة التجربة.
- **All repositories** عند التثبيت، أو التثبيت على منظمة.
- Device Flow.
- وضع أي سر في المحادثة، أو المستودع، أو ملف `.env` داخل المستودع، أو رسالة بريد.
