/**
 * CANDIDATE pack — act_fe_integrated_leave_requests (past leave requests). Not approved by an expert.
 * List tests serve their OWN requests (overrideFile), in an order that is neither oldest- nor newest-first, so a
 * page that hard-codes the shipped data or only reverses it is told apart from one that orders by submission date.
 * Data states come from the harness (failRequestsTo), never from the page's URL scenario.
 * 0.2.0: state-transition tests follow whole sequences of visible states (error → retry → error → retry → list or
 * empty), read the whole page (not only the list region) for a stale error, a live alert, aria-busy or a leftover retry
 * control, and a second data set of the same shape tells real rendering from output written for the shipped file.
 */
import type { PageDriver, TestPack } from '../pack.js';
import { MOBILE, TABLET, clickTagged, fail, pass, presence, probingReport, q, until } from './lib.js';

const DATA = 'data/leave-requests.json';

const REQUESTS = [
  { id: 7001, type: 'sick', startDate: '2027-03-02', endDate: '2027-03-04', days: 3, status: 'pending', submittedAt: '2027-03-01' },
  { id: 7002, type: 'annual', startDate: '2027-05-10', endDate: '2027-05-21', days: 10, status: 'approved', submittedAt: '2027-04-11' },
  { id: 7003, type: 'emergency', startDate: '2027-01-15', endDate: '2027-01-15', days: 1, status: 'rejected', submittedAt: '2027-01-14' },
  { id: 7004, type: 'annual', startDate: '2027-07-01', endDate: '2027-07-07', days: 7, status: 'pending', submittedAt: '2027-06-03' },
  { id: 7005, type: 'sick', startDate: '2027-02-08', endDate: '2027-02-09', days: 2, status: 'approved', submittedAt: '2027-02-08' },
  { id: 7006, type: 'annual', startDate: '2027-09-12', endDate: '2027-09-16', days: 5, status: 'rejected', submittedAt: '2027-08-20' },
];
/** A second data set of the same shape: other ids, years, durations and status mix, shuffled. */
const OTHER_REQUESTS = [
  { id: 9102, type: 'annual', startDate: '2028-10-03', endDate: '2028-10-16', days: 12, status: 'pending', submittedAt: '2028-09-01' },
  { id: 9087, type: 'emergency', startDate: '2028-03-21', endDate: '2028-03-21', days: 1, status: 'approved', submittedAt: '2028-03-21' },
  { id: 9140, type: 'sick', startDate: '2028-12-06', endDate: '2028-12-09', days: 4, status: 'rejected', submittedAt: '2028-12-05' },
  { id: 9055, type: 'annual', startDate: '2028-01-29', endDate: '2028-01-30', days: 2, status: 'approved', submittedAt: '2028-01-04' },
];
/** Start dates of the file shipped with the starter: none may appear while other data is served. */
const SHIPPED_STARTS = ['2026-02-08', '2026-04-14', '2026-06-03', '2026-08-16', '2026-12-20'];
const NEWEST_FIRST = [...REQUESTS].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).map((r) => r.startDate);
const TYPE_RE: Record<string, string> = { annual: 'سنوي', sick: 'مرض', emergency: 'اضطرار|طار' };
const STATUS_RE: Record<string, string> = { approved: 'مقبول|موافق|معتمد', pending: 'قيد|انتظار|معل', rejected: 'مرفوض|رفض' };

const LEAVE_LIB = String.raw`
const region = () => document.getElementById('app') || document.querySelector('main') || document.body;
const reqItems = () => {
  const r = region();
  let it = [...r.querySelectorAll('li')];
  if (!it.length) it = [...r.querySelectorAll('tr')].filter((tr) => tr.querySelector('td'));
  if (!it.length) it = [...r.querySelectorAll('[role=listitem], [role=row], article, .request-row, .request')];
  return it.filter(vis);
};
const loadingShown = () => /جار[ً-ْي]*\s*(ال)?تحميل/.test(txt(document.body));
const errorShown = () => /تعذّر|تعذر|خطأ|فشل/.test(txt(region()));
const emptyShown = () => /لا (توجد )?طلبات/.test(txt(region()));
const retryAny = () => findButton(/إعادة المحاولة|حاول/) || innermost(/إعادة المحاولة/, region());
const retryReal = () => { const b = retryAny(); return realButton(b) ? b : null; };
const listed = (n) => reqItems().length === n && !loadingShown();
const ERR_RE = /تعذّر|تعذر|خطأ|فشل|لم (نتمكن|يتمكن|تتمكن|يتم)|مشكلة|انقطع/;
const errorAnywhere = () => ERR_RE.test(txt(document.body));
const alertShown = () => [...document.querySelectorAll('[role=alert]')].some((e) => vis(e) && txt(e));
const busyShown = () => [...document.querySelectorAll('[aria-busy=true], [role=progressbar]')].some(vis);
const errorTrace = () => [...new Set([...document.querySelectorAll('[role=alert]')].filter(vis).map(txt)
  .concat([txt(innermost(ERR_RE))]).filter((t) => t.length >= 4))];
const traceGone = (trace) => { const b = txt(document.body); return trace.every((t) => !b.includes(t)); };
const settledList = (n, trace) => listed(n) && !errorAnywhere() && !alertShown() && !busyShown() && !retryAny() && traceGone(trace);
const settledEmpty = () => emptyShown() && reqItems().length === 0 && !loadingShown() && !errorAnywhere() && !alertShown() && !busyShown();
const errorAgain = () => (errorShown() || alertShown()) && !!retryAny() && !loadingShown() && reqItems().length === 0;
const leftovers = (n, trace) => [
  reqItems().length !== n ? 'الطلبات غير معروضة كاملة' : '', loadingShown() || busyShown() ? 'التحميل ما زال ظاهرًا' : '',
  errorAnywhere() || !traceGone(trace) ? 'رسالة الخطأ ما زالت ظاهرة' : '', alertShown() ? 'تنبيه role=alert ما زال ظاهرًا' : '',
  retryAny() ? 'زر إعادة المحاولة ما زال ظاهرًا' : '',
].filter(Boolean).join(' · ');
`;

const ql = <T>(p: PageDriver, body: string): Promise<T> => q<T>(p, body, LEAVE_LIB);
const ul = (p: PageDriver, body: string, ms: number): Promise<boolean> => until(p, body, ms, LEAVE_LIB);

/** Serves the pack's requests, opens, and waits for a rendered list; returns how many requests are shown. */
async function openList(p: PageDriver, viewport?: { width: number; height: number }, reqs: readonly object[] = REQUESTS): Promise<number> {
  p.overrideFile(DATA, JSON.stringify(reqs));
  await p.open(undefined, viewport);
  await ul(p, `return reqItems().length > 0 && !loadingShown();`, 2500);
  await p.wait(100);
  return ql<number>(p, `return reqItems().length;`);
}
const N = REQUESTS.length;

/** Opens in the error state, then lets the next request answer with `next`, and activates the retry control. */
async function failThenRetry(p: PageDriver, next: 'ok' | 'slow' | 'empty'): Promise<'no_retry' | 'clicked'> {
  p.overrideFile(DATA, JSON.stringify(REQUESTS));
  p.failRequestsTo(DATA, 'error');
  await p.open();
  if (!(await ul(p, `return !!retryAny();`, 2500))) return 'no_retry';
  p.failRequestsTo(DATA, next);
  await ql(p, `return tag(retryAny(), 'retry');`);
  return (await clickTagged(p, 'retry')) ? 'clicked' : 'no_retry';
}

/** Requests whose type, period, days or status (in Arabic) are not all shown; raw English codes count once. */
function fieldsMissing(p: PageDriver, reqs: readonly (typeof REQUESTS)[number][]): Promise<number> {
  return ql<number>(p, `
    const reqs = ${JSON.stringify(reqs)}; const T = ${JSON.stringify(TYPE_RE)}; const S = ${JSON.stringify(STATUS_RE)};
    const texts = reqItems().map(txt);
    let bad = 0;
    for (const r of reqs) {
      const t = texts.find((x) => x.includes(r.startDate));
      const daysOk = t && (hasNumber(t.replace(r.startDate, '').replace(r.endDate, ''), r.days));
      if (!t || !t.includes(r.endDate) || !daysOk || !new RegExp(T[r.type]).test(t) || !new RegExp(S[r.status]).test(t)) bad++;
    }
    if (/\\b(annual|sick|emergency|approved|pending|rejected)\\b/.test(txt(region()))) bad++;
    return bad;`);
}

/**
 * Opens with the service failing and waits for the error state; returns what the error said (visible alerts and the
 * innermost element carrying an error word), so a later state can be checked for any trace of it. Null: no error state.
 */
async function openInError(p: PageDriver): Promise<string[] | null> {
  p.overrideFile(DATA, JSON.stringify(REQUESTS));
  p.failRequestsTo(DATA, 'error');
  await p.open();
  if (!(await ul(p, `return errorAgain();`, 2500))) return null;
  return ql<string[]>(p, `return errorTrace();`);
}

/** Lets the next request answer with `next`, then activates the visible retry control; false when there is none. */
async function retryWith(p: PageDriver, next: 'ok' | 'slow' | 'empty' | 'error'): Promise<boolean> {
  p.failRequestsTo(DATA, next);
  if (!(await ql<boolean>(p, `return tag(retryAny(), 'retry');`))) return false;
  return clickTagged(p, 'retry');
}

/** A retry that fails again: the page must come back to the error state, with no list and no loading left. */
async function retryFailsAgain(p: PageDriver): Promise<boolean> {
  if (!(await retryWith(p, 'error'))) return false;
  await p.wait(700);
  return ul(p, `return errorAgain();`, 2000);
}

export const actFeIntegratedLeaveRequestsPack: TestPack = {
  activityId: 'act_fe_integrated_leave_requests',
  version: '0.2.0',
  status: 'candidate',
  entry: 'index.html',
  tests: [
    {
      id: 'semantic.heading_and_landmarks', criterionKey: 'semantic_structure', layer: 'a11y', mode: 'automated',
      labelAr: 'عنوان رئيسي واحد h1، وعناوين متسلسلة، ومعلم main',
      run: async (p) => {
        await openList(p);
        const r = await ql<{ headings: boolean; main: boolean }>(p, `return { headings: headingsOrdered(), main: !!document.querySelector('main, [role=main]') };`);
        if (r.headings && r.main) return pass();
        return fail([!r.headings ? 'لا عنوان رئيسي واحد أو العناوين غير متسلسلة' : '', !r.main ? 'لا معلم main' : ''].filter(Boolean).join(' · '));
      },
    },
    {
      id: 'semantic.requests_as_list_or_table', criterionKey: 'semantic_structure', layer: 'a11y', mode: 'automated',
      labelAr: 'الطلبات معروضة قائمةً (ul/ol) أو جدولًا بعناوين أعمدة',
      run: async (p) => {
        if ((await openList(p)) === 0) return fail('لم تُعرض الطلبات');
        const ok = await ql<boolean>(p, `return reqItems().every((el) => (el.tagName === 'LI' && /^(UL|OL)$/.test(el.parentElement.tagName)) || (el.tagName === 'TR' && !!el.closest('table') && !!el.closest('table').querySelector('th')));`);
        return ok ? pass() : fail('الطلبات ليست عناصر قائمة ولا صفوف جدول له عناوين');
      },
    },
    {
      id: 'output.requests_follow_data', criterionKey: 'data_states', layer: 'output', mode: 'automated',
      labelAr: 'كل طلب يعرض نوعه وحالته بالعربية، وفترته، وعدد أيامه، أيًّا كانت البيانات',
      run: async (p) => {
        if ((await openList(p)) !== N) return fail('عدد الطلبات المعروضة لا يطابق ما أرجعته الخدمة');
        const bad = await fieldsMissing(p, REQUESTS);
        return bad === 0 ? pass() : fail(`طلبات لا تُعرض حقولها كاملة بالعربية: ${bad}`);
      },
    },
    {
      id: 'output.other_requests_same_shape', criterionKey: 'data_states', layer: 'output', mode: 'automated',
      labelAr: 'بيانات أخرى بالبنية نفسها (أرقام وتواريخ وحالات مختلفة) تُعرض كلها، ولا يظهر شيء من الملف المرفق',
      run: async (p) => {
        if ((await openList(p, undefined, OTHER_REQUESTS)) !== OTHER_REQUESTS.length) return fail('عدد الطلبات المعروضة لا يطابق البيانات الأخرى');
        const bad = await fieldsMissing(p, OTHER_REQUESTS);
        if (bad > 0) return fail(`طلبات لا تُعرض حقولها كاملة بالعربية: ${bad}`);
        const stale = await ql<number>(p, `const b = txt(document.body); return ${JSON.stringify(SHIPPED_STARTS)}.filter((d) => b.includes(d)).length;`);
        return stale === 0 ? pass() : fail(`تظهر طلبات من الملف المرفق لا من الخدمة: ${stale}`);
      },
    },
    {
      id: 'output.order_by_submission_date', criterionKey: 'judgment_assumption_check', layer: 'output', mode: 'supports_human',
      labelAr: 'للمراجِع: ترتيب الطلبات المعروضة بحسب تاريخ التقديم (الأحدث أولًا)',
      run: async (p) => {
        if ((await openList(p)) !== N) return fail('عدد الطلبات المعروضة لا يطابق ما أرجعته الخدمة');
        const ok = await ql<boolean>(p, `const order = ${JSON.stringify(NEWEST_FIRST)}; const texts = reqItems().map(txt); return order.every((d, i) => (texts[i] || '').includes(d));`);
        return ok ? pass() : fail('الترتيب المعروض ليس من الأحدث إلى الأقدم بحسب تاريخ التقديم');
      },
    },
    {
      id: 'data_states.loading_visible', criterionKey: 'data_states', layer: 'data_states', mode: 'automated',
      labelAr: 'رسالة التحميل ظاهرة أثناء الطلب وتختفي حين تظهر الطلبات',
      run: async (p) => {
        p.overrideFile(DATA, JSON.stringify(REQUESTS));
        p.failRequestsTo(DATA, 'slow');
        await p.open();
        await p.wait(700);
        if (!(await ql<boolean>(p, `return loadingShown() && reqItems().length === 0;`))) return fail('لا رسالة تحميل أثناء انتظار الخدمة');
        return (await ul(p, `return listed(${REQUESTS.length});`, 3500)) ? pass() : fail('رسالة التحميل لم تُستبدل بالطلبات');
      },
    },
    {
      id: 'data_states.error_with_retry_button', criterionKey: 'data_states', layer: 'errors', mode: 'automated',
      labelAr: 'فشل الخدمة يُظهر رسالة واضحة وزر «إعادة المحاولة» حقيقيًا، دون رسالة تحميل',
      run: async (p) => {
        p.failRequestsTo(DATA, 'error');
        await p.open();
        if (!(await ul(p, `return errorShown() && !loadingShown();`, 2500))) return fail('لا رسالة خطأ واضحة بعد فشل الخدمة');
        return (await ql<boolean>(p, `return !!retryReal();`)) ? pass() : fail('عنصر إعادة المحاولة ليس زرًا');
      },
    },
    {
      id: 'data_states.empty_message', criterionKey: 'data_states', layer: 'data_states', mode: 'automated',
      labelAr: 'قائمة خالية تُظهر «لا طلبات إجازة سابقة» دون خطأ ولا تحميل',
      run: async (p) => {
        p.failRequestsTo(DATA, 'empty');
        await p.open();
        const ok = await ul(p, `return emptyShown() && !errorShown() && !loadingShown() && reqItems().length === 0;`, 2500);
        return ok ? pass() : fail('لا رسالة للقائمة الخالية');
      },
    },
    {
      id: 'state.retry_completes_cleanly', criterionKey: 'state_transitions', layer: 'functional', mode: 'automated',
      labelAr: 'إعادة المحاولة بعد الفشل: تحميل ظاهر، ثم الطلبات وحدها دون تحميل ولا خطأ',
      run: async (p) => {
        if ((await failThenRetry(p, 'slow')) === 'no_retry') return fail('لا عنصر لإعادة المحاولة بعد الفشل');
        if (!(await ul(p, `return loadingShown() && !errorShown();`, 1200))) return fail('لا رسالة تحميل أثناء إعادة المحاولة');
        const ok = await ul(p, `return listed(${REQUESTS.length}) && !errorShown();`, 4000);
        return ok ? pass() : fail('بعد إعادة المحاولة بقيت حالتان متعارضتان أو لم تظهر الطلبات');
      },
    },
    {
      id: 'state.retry_then_empty_answer', criterionKey: 'root_cause_fixed', layer: 'functional', mode: 'supports_human',
      labelAr: 'للمراجِع: إعادة المحاولة التي تنتهي بقائمة خالية تُنهي التحميل وتُظهر حالة الفراغ',
      run: async (p) => {
        if ((await failThenRetry(p, 'empty')) === 'no_retry') return fail('لا عنصر لإعادة المحاولة بعد الفشل');
        const ok = await ul(p, `return emptyShown() && !loadingShown() && !errorShown();`, 3000);
        return ok ? pass() : fail('بعد إعادة المحاولة بقائمة خالية لم تنته رسالة التحميل أو لم تظهر حالة الفراغ');
      },
    },
    {
      id: 'state.retry_success_clears_error', criterionKey: 'state_transitions', layer: 'functional', mode: 'automated',
      labelAr: 'بعد نجاح إعادة المحاولة لا يبقى في الصفحة كلها أثر للخطأ: لا رسالته، ولا تنبيه، ولا زر إعادة المحاولة، ولا تحميل',
      run: async (p) => {
        const trace = await openInError(p);
        if (!trace) return fail('لا حالة خطأ مع إعادة المحاولة بعد الفشل');
        if (!(await retryWith(p, 'slow'))) return fail('لا عنصر لإعادة المحاولة بعد الفشل');
        if (!(await ul(p, `return loadingShown() && !errorAnywhere() && !alertShown() && reqItems().length === 0;`, 1200))) {
          return fail('أثناء إعادة المحاولة لم يظهر التحميل وحده: بقيت رسالة الخطأ أو لم يظهر التحميل');
        }
        if (await ul(p, `return settledList(${N}, ${JSON.stringify(trace)});`, 3500)) return pass();
        return fail(await ql<string>(p, `return leftovers(${N}, ${JSON.stringify(trace)});`));
      },
    },
    {
      id: 'state.second_retry_cycle', criterionKey: 'state_transitions', layer: 'functional', mode: 'automated',
      labelAr: 'دورتان: فشل، ثم إعادة محاولة تفشل (خطأ وحده)، ثم إعادة محاولة تنجح (تحميل ثم الطلبات وحدها)',
      run: async (p) => {
        const trace = await openInError(p);
        if (!trace) return fail('لا حالة خطأ مع إعادة المحاولة بعد الفشل');
        if (!(await retryFailsAgain(p))) return fail('إعادة المحاولة التي تفشل لا تعيد حالة الخطأ وحدها (مع زر إعادة المحاولة، دون تحميل)');
        if (!(await retryWith(p, 'slow'))) return fail('لا عنصر لإعادة المحاولة في الدورة الثانية');
        if (!(await ul(p, `return loadingShown() && !errorAnywhere() && !alertShown();`, 1200))) return fail('في الدورة الثانية لم يظهر التحميل وحده');
        if (await ul(p, `return settledList(${N}, ${JSON.stringify(trace)});`, 3500)) return pass();
        return fail(`بعد الدورة الثانية: ${await ql<string>(p, `return leftovers(${N}, ${JSON.stringify(trace)});`)}`);
      },
    },
    {
      id: 'state.second_retry_ends_empty', criterionKey: 'state_transitions', layer: 'functional', mode: 'automated',
      labelAr: 'دورتان: فشل، ثم إعادة محاولة تفشل، ثم إعادة محاولة بقائمة خالية: حالة الفراغ وحدها دون تحميل ولا خطأ',
      run: async (p) => {
        if (!(await openInError(p))) return fail('لا حالة خطأ مع إعادة المحاولة بعد الفشل');
        if (!(await retryFailsAgain(p))) return fail('إعادة المحاولة التي تفشل لا تعيد حالة الخطأ وحدها (مع زر إعادة المحاولة، دون تحميل)');
        if (!(await retryWith(p, 'empty'))) return fail('لا عنصر لإعادة المحاولة في الدورة الثانية');
        if (await ul(p, `return settledEmpty();`, 3000)) return pass();
        const r = await ql<{ loading: boolean; error: boolean; empty: boolean }>(p, `return { loading: loadingShown() || busyShown(), error: errorAnywhere() || alertShown(), empty: emptyShown() };`);
        return fail([r.loading ? 'التحميل ما زال ظاهرًا' : '', r.error ? 'رسالة الخطأ ما زالت ظاهرة' : '', !r.empty ? 'لا رسالة للقائمة الخالية' : ''].filter(Boolean).join(' · ') || 'الحالة الأخيرة ليست حالة الفراغ وحدها');
      },
    },
    {
      id: 'responsive.page_width_360', criterionKey: 'responsive_layout', layer: 'responsive', mode: 'automated',
      labelAr: 'لا محتوى يتجاوز عرض الشاشة على 360 بكسل والطلبات معروضة',
      run: async (p) => {
        if ((await openList(p, MOBILE)) === 0) return fail('لم تُعرض الطلبات');
        const m = await p.layout();
        const o = await q<{ count: number }>(p, `return overflowReport();`);
        const note = `عرض المحتوى ${m.contentWidth} على شاشة ${m.viewportWidth}؛ عناصر تتجاوز الشاشة: ${o.count}`;
        return m.contentWidth <= m.viewportWidth && o.count === 0 ? pass(note) : fail(note);
      },
    },
    {
      id: 'responsive.page_width_1024', criterionKey: 'responsive_layout', layer: 'responsive', mode: 'automated',
      labelAr: 'لا تمرير أفقي على 1024 بكسل والطلبات معروضة',
      run: async (p) => {
        if ((await openList(p, TABLET)) === 0) return fail('لم تُعرض الطلبات');
        const m = await p.layout();
        const o = await q<{ count: number }>(p, `return overflowReport();`);
        const note = `عرض المحتوى ${m.contentWidth} على شاشة ${m.viewportWidth}`;
        return m.contentWidth <= m.viewportWidth && o.count === 0 ? pass(note) : fail(note);
      },
    },
    {
      id: 'a11y.retry_by_keyboard', criterionKey: 'a11y_basics', layer: 'a11y', mode: 'automated',
      labelAr: 'زر إعادة المحاولة يصله Tab بتركيز ظاهر، وEnter يعيد التحميل',
      run: async (p) => {
        p.overrideFile(DATA, JSON.stringify(REQUESTS));
        p.failRequestsTo(DATA, 'error');
        await p.open();
        if (!(await ul(p, `return !!retryAny();`, 2500))) return fail('لا عنصر لإعادة المحاولة بعد الفشل');
        await ql(p, `return tag(retryAny(), 'retry');`);
        let reached = false;
        for (let i = 0; i < 8 && !reached; i++) {
          await p.press('Tab');
          reached = await ql<boolean>(p, `return !!document.activeElement && document.activeElement.getAttribute('data-r2-target') === 'retry';`);
        }
        if (!reached) return fail('لوحة المفاتيح لا تصل إلى إعادة المحاولة');
        if (!(await p.focused())?.outlineVisible) return fail('التركيز على إعادة المحاولة غير ظاهر');
        p.failRequestsTo(DATA, 'ok');
        await p.press('Enter');
        return (await ul(p, `return listed(${REQUESTS.length});`, 3000)) ? pass() : fail('Enter لم يُعد التحميل');
      },
    },
  ],
  staticChecks: [
    {
      id: 'gaming.environment_probing', criterionKey: 'root_cause_fixed', layer: 'gaming', mode: 'supports_human',
      labelAr: 'لا فحص لبيئة التشغيل ولا تعديل للخدمة الوهمية',
      run: (files, starter) => probingReport(files, starter, ['mock-api.js']),
    },
    {
      id: 'quality.source_files_present', criterionKey: 'deliverables_complete', layer: 'quality', mode: 'supports_human',
      labelAr: 'الملفات الثلاثة موجودة (الملاحظات ورابط الـPull Request يتحقق منها المراجِع)',
      run: (files) => presence(files, ['index.html', 'styles.css', 'app.js']),
    },
  ],
  humanOnlyCriteria: [
    { criterionKey: 'problem_traced', whyAr: 'تتبّع البلاغ إلى موضعه في كود البداية نص يكتبه الخرّيج ويحكم عليه شخص.' },
    { criterionKey: 'code_understanding', whyAr: 'ملاحظة تدفق البيانات بالإشارة إلى الكود تُقرأ ولا تُختبر من سلوك الصفحة.' },
    { criterionKey: 'git_workflow', whyAr: 'المنصة لا تقرأ المستودع الخاص؛ الفرع والإيداعات والـPull Request يفحصها مراجِع مسمّى.' },
    { criterionKey: 'decision_clarity', whyAr: 'القراران وأسبابهما نص يحكم عليه شخص.' },
  ],
};
