/**
 * CANDIDATE pack — act_fe_integrated_leave_requests (past leave requests). Not approved by an expert.
 * List tests serve their OWN requests (overrideFile), in an order that is neither oldest- nor newest-first, so a
 * page that hard-codes the shipped data or only reverses it is told apart from one that orders by submission date.
 * Data states come from the harness (failRequestsTo), never from the page's URL scenario.
 * 0.2.0: state-transition tests follow whole sequences of visible states (error → retry → error → retry → list or
 * empty), read the whole page (not only the list region) for a stale error, a live alert, aria-busy or a leftover retry
 * control, and a second data set of the same shape tells real rendering from output written for the shipped file.
 * 0.3.0: requests (ids, dates, durations, types, statuses, order) and viewport widths are generated per run from the
 * attempt seed; a period is compared by its DATE VALUES in any common format (ISO, d/m/y, Arabic or Latin digits,
 * Gregorian month names, Levantine names, the Hijri calendar), not by the ISO string; the retry control is found by
 * role and accessible name with its usual synonyms; a test whose precondition never appears (no error state, no retry
 * control) is not applicable; and root_cause_fixed observes only the planted defect (loading that never ends after a
 * retry), not a stale error, which state_transitions measures.
 */
import type { PageDriver, TestPack, TestOutcomeReport, Viewport } from '../pack.js';
import { type Rand, clickTagged, fail, int, mobileWidths, notApplicable, one, pass, presence, probingReport, q, rng, shuffle, until, widthsAround } from './lib.js';

const DATA = 'data/leave-requests.json';
type LeaveType = 'annual' | 'sick' | 'emergency';
type LeaveStatus = 'approved' | 'pending' | 'rejected';
interface Req { readonly id: number; readonly type: LeaveType; readonly startDate: string; readonly endDate: string; readonly days: number; readonly status: LeaveStatus; readonly submittedAt: string }

/** Start dates of the file shipped with the starter: none may appear while other data is served. */
const SHIPPED_STARTS = ['2026-02-08', '2026-04-14', '2026-06-03', '2026-08-16', '2026-12-20'];
const TYPE_RE: Record<LeaveType, string> = { annual: 'سنوي|اعتيادي', sick: 'مرض', emergency: 'اضطرار|طار' };
const STATUS_RE: Record<LeaveStatus, string> = { approved: 'مقبول|موافق|معتمد', pending: 'قيد|انتظار|معل', rejected: 'مرفوض|رفض' };

/* ───────── generated requests (per attempt seed): every start/end date unique; served order not sorted ───────── */

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000);

/** A date and its day/month-swapped twin (02/03 vs 03/02): neither may belong to two requests, so d/m/y text is unambiguous. */
const keys = (d: Date): string[] => {
  const y = d.getUTCFullYear(); const m = d.getUTCMonth() + 1; const day = d.getUTCDate();
  return day <= 12 ? [`${y}-${m}-${day}`, `${y}-${day}-${m}`] : [`${y}-${m}-${day}`];
};

function makeRequests(r: Rand, n: number, year: number, ids: Set<number>): Req[] {
  const used = new Set<string>();
  const types = shuffle(r, ['annual', 'sick', 'emergency', ...Array.from({ length: Math.max(0, n - 3) }, () => one(r, ['annual', 'sick', 'emergency'] as const))]) as LeaveType[];
  const statuses = shuffle(r, ['approved', 'pending', 'rejected', ...Array.from({ length: Math.max(0, n - 3) }, () => one(r, ['approved', 'pending', 'rejected'] as const))]) as LeaveStatus[];
  const out: Req[] = [];
  for (let i = 0; i < n; i++) {
    const days = i === 0 ? 1 : i === 1 ? 2 : int(r, 3, 14);
    let start: Date; let end: Date;
    do {
      start = new Date(Date.UTC(year, int(r, 0, 11), int(r, 1, 28)));
      end = addDays(start, days === 1 ? 0 : days - 1 + int(r, 0, 2));
    } while ([start, end].some((d) => keys(d).some((k) => used.has(k))));
    for (const d of [start, end]) keys(d).forEach((k) => used.add(k));
    let id = 0;
    do id = int(r, 1000, 99999); while (ids.has(id));
    ids.add(id);
    out.push({ id, type: types[i]!, startDate: iso(start), endDate: iso(end), days, status: statuses[i]!, submittedAt: iso(addDays(start, -int(r, 1, 45))) });
  }
  const bySubmitted = [...out].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).map((x) => x.id).join();
  let order = shuffle(r, out);
  for (let k = 0; k < 20 && [order.map((x) => x.id).join(), [...order].reverse().map((x) => x.id).join()].includes(bySubmitted); k++) order = shuffle(r, out);
  return order;
}

interface ReqSets { readonly main: Req[]; readonly other: Req[] }
const cache = new Map<number, ReqSets>();
function sets(p: PageDriver): ReqSets {
  const hit = cache.get(p.seed);
  if (hit) return hit;
  const r = rng(p.seed, 'leave_requests/requests');
  const ids = new Set<number>();
  const y = int(r, 2027, 2029);
  let main: Req[]; let other: Req[];
  // Submission dates must be distinct too, so «newest first» has one answer.
  do main = makeRequests(r, 6, y, ids); while (new Set(main.map((x) => x.submittedAt)).size !== main.length);
  do other = makeRequests(r, 4, y + 1, ids); while (new Set(other.map((x) => x.submittedAt)).size !== other.length);
  const s = { main, other };
  cache.set(p.seed, s);
  return s;
}
const newestFirst = (reqs: readonly Req[]): string[] => [...reqs].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).map((x) => x.startDate);

const LEAVE_LIB = String.raw`
const region = () => document.getElementById('app') || document.querySelector('main') || document.body;
const reqItems = () => {
  const r = region();
  let it = [...r.querySelectorAll('li')];
  if (!it.length) it = [...r.querySelectorAll('tr')].filter((tr) => tr.querySelector('td'));
  if (!it.length) it = [...r.querySelectorAll('[role=listitem], [role=row], article, .request-row, .request')];
  return it.filter(vis);
};
const loadingShown = () => /(جار|يتم)\s*(ال)?تحميل/.test(fold(txt(document.body)));
const errorShown = () => /تعذر|خطا|فشل/.test(fold(txt(region())));
const emptyShown = () => /لا (توجد |يوجد )?(اي )?(طلبات|طلب)|ليس (لديك|هناك) (اي )?طلبات|لم (تقدم|يقدم)/.test(fold(txt(region())));
const retryAny = () => retryLike(document.body);
const retryReal = () => { const b = retryAny(); return realButton(b) ? b : null; };
const listed = (n) => reqItems().length === n && !loadingShown();
const ERR_RE = /تعذر|خطا|فشل|لم (نتمكن|يتمكن|تتمكن|يتم)|مشكله|انقطع/;
const errorAnywhere = () => ERR_RE.test(fold(txt(document.body)));
const alertShown = () => [...document.querySelectorAll('[role=alert]')].some((e) => vis(e) && txt(e));
const busyShown = () => [...document.querySelectorAll('[aria-busy=true], [role=progressbar], progress')].some(vis);
const errorTrace = () => [...new Set([...document.querySelectorAll('[role=alert]')].filter(vis).map(txt)
  .concat([txt([...document.body.querySelectorAll('*')].filter((e) => vis(e) && ERR_RE.test(fold(e.textContent || '')) && ![...e.children].some((c) => ERR_RE.test(fold(c.textContent || ''))))[0])]).filter((t) => t.length >= 4))];
const traceGone = (trace) => { const b = txt(document.body); return trace.every((t) => !b.includes(t)); };
const settledList = (n, trace) => listed(n) && !errorAnywhere() && !alertShown() && !busyShown() && !retryAny() && traceGone(trace);
const settledEmpty = () => emptyShown() && reqItems().length === 0 && !loadingShown() && !errorAnywhere() && !alertShown() && !busyShown();
const errorAgain = () => (errorShown() || alertShown()) && !!retryAny() && !loadingShown() && reqItems().length === 0;
const leftovers = (n, trace) => [
  reqItems().length !== n ? 'الطلبات غير معروضة كاملة' : '', loadingShown() || busyShown() ? 'التحميل ما زال ظاهرًا' : '',
  errorAnywhere() || !traceGone(trace) ? 'رسالة الخطأ ما زالت ظاهرة' : '', alertShown() ? 'تنبيه role=alert ما زال ظاهرًا' : '',
  retryAny() ? 'زر إعادة المحاولة ما زال ظاهرًا' : '',
].filter(Boolean).join(' · ');

/* Dates by VALUE: every date-like token in a text, in the formats people write (folded text: Latin digits, one alef). */
const MONTHS = [
  ['يناير', 'كانون الثاني', 'january', 'jan'], ['فبراير', 'شباط', 'february', 'feb'], ['مارس', 'اذار', 'march', 'mar'],
  ['ابريل', 'نيسان', 'april', 'apr'], ['مايو', 'ايار', 'may'], ['يونيو', 'يونيه', 'حزيران', 'june', 'jun'],
  ['يوليو', 'يوليه', 'تموز', 'july', 'jul'], ['اغسطس', 'اب', 'august', 'aug'], ['سبتمبر', 'ايلول', 'september', 'sept', 'sep'],
  ['اكتوبر', 'تشرين الاول', 'october', 'oct'], ['نوفمبر', 'تشرين الثاني', 'november', 'nov'], ['ديسمبر', 'كانون الاول', 'december', 'dec'],
];
const HIJRI = [['محرم'], ['صفر'], ['ربيع الاول'], ['ربيع الاخر', 'ربيع الثاني'], ['جمادي الاولي', 'جمادي الاول'], ['جمادي الاخره', 'جمادي الثانيه', 'جمادي الاخر'],
  ['رجب'], ['شعبان'], ['رمضان'], ['شوال'], ['ذو القعده'], ['ذو الحجه']];
const monthAlt = (list) => list.flat().sort((a, b) => b.length - a.length).join('|');
const monthIndex = (list, name) => list.findIndex((alts) => alts.includes(name)) + 1;
const NB = '(?![a-zء-ي])';
const dateTokens = (raw) => {
  const t = fold(raw).replace(/،/g, ',');
  const out = [];
  const push = (cal, y, m, d, s, e) => { if (m >= 1 && m <= 12 && d >= 1 && d <= 31) out.push({ cal, y, m, d, s, e }); };
  for (const x of t.matchAll(/(\d{4})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{1,2})/g)) push('?', +x[1], +x[2], +x[3], x.index, x.index + x[0].length);
  for (const x of t.matchAll(/(?<!\d)(\d{1,2})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{4})/g)) {
    push('?', +x[3], +x[2], +x[1], x.index, x.index + x[0].length); push('?', +x[3], +x[1], +x[2], x.index, x.index + x[0].length);
  }
  for (const [list, cal] of [[MONTHS, 'g'], [HIJRI, 'h']]) {
    const M = monthAlt(list);
    for (const x of t.matchAll(new RegExp('(?<!\\d)(\\d{1,2})\\s*(?:-|–|—|الي|حتي|to)\\s*(\\d{1,2})\\s+(' + M + ')' + NB + '(?:\\s*,?\\s*(\\d{4}))?', 'g'))) {
      const m = monthIndex(list, x[3]); const y = x[4] ? +x[4] : null;
      push(cal, y, m, +x[1], x.index, x.index + x[0].length); push(cal, y, m, +x[2], x.index, x.index + x[0].length);
    }
    for (const x of t.matchAll(new RegExp('(?<!\\d)(\\d{1,2})\\s+(?:من\\s+)?(' + M + ')' + NB + '(?:\\s*,?\\s*(\\d{4}))?', 'g'))) push(cal, x[3] ? +x[3] : null, monthIndex(list, x[2]), +x[1], x.index, x.index + x[0].length);
    for (const x of t.matchAll(new RegExp('(' + M + ')\\s+(\\d{1,2})' + '(?![0-9])(?:\\s*,?\\s*(\\d{4}))?', 'g'))) push(cal, x[3] ? +x[3] : null, monthIndex(list, x[1]), +x[2], x.index, x.index + x[0].length);
  }
  return out;
};
const hijriOf = (isoDate) => {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(isoDate + 'T00:00:00Z'));
    const v = (k) => +((parts.find((p) => p.type === k) || {}).value || 0);
    return { y: v('year'), m: v('month'), d: v('day') };
  } catch { return null; }
};
/* The tokens of a text that mean this date (Gregorian, or the Hijri date of the same day); a token without a year matches the day and month. */
const tokensFor = (text, isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number); const h = hijriOf(isoDate);
  return dateTokens(text).filter((k) => ((k.cal !== 'h') && k.m === m && k.d === d && (k.y === null || k.y === y))
    || (k.cal !== 'g' && h && k.m === h.m && k.d === h.d && (k.y === null || k.y === h.y)));
};
const hasDate = (text, isoDate) => tokensFor(text, isoDate).length > 0;
/* The text with every date-like token removed (so a day count is not read from a date). */
const withoutDates = (text) => {
  const t = fold(text).replace(/،/g, ',');
  const cut = new Array(t.length).fill(false);
  for (const k of dateTokens(text)) for (let i = k.s; i < k.e; i++) cut[i] = true;
  return [...t].map((c, i) => (cut[i] ? ' ' : c)).join('');
};
`;

const ql = <T>(p: PageDriver, body: string): Promise<T> => q<T>(p, body, LEAVE_LIB);
const ul = (p: PageDriver, body: string, ms: number): Promise<boolean> => until(p, body, ms, LEAVE_LIB);

/** Serves the pack's requests, opens, and waits for a rendered list; returns how many requests are shown. */
async function openList(p: PageDriver, viewport?: Viewport, reqs: readonly Req[] = sets(p).main): Promise<number> {
  p.overrideFile(DATA, JSON.stringify(reqs));
  await p.open(undefined, viewport);
  await ul(p, `return reqItems().length > 0 && !loadingShown();`, 2500);
  await p.wait(100);
  return ql<number>(p, `return reqItems().length;`);
}

const NO_ERROR_STATE = 'فشل الخدمة لا يُظهر حالة خطأ مع إعادة محاولة، فلا تحوّل يُختبر هنا (يُحسب في حالات البيانات)';

/** Opens in the error state, then lets the next request answer with `next`, and activates the retry control. */
async function failThenRetry(p: PageDriver, next: 'ok' | 'slow' | 'empty'): Promise<'no_retry' | 'clicked'> {
  p.overrideFile(DATA, JSON.stringify(sets(p).main));
  p.failRequestsTo(DATA, 'error');
  await p.open();
  if (!(await ul(p, `return !!retryAny();`, 2500))) return 'no_retry';
  p.failRequestsTo(DATA, next);
  await ql(p, `return tag(retryAny(), 'retry');`);
  return (await clickTagged(p, 'retry')) ? 'clicked' : 'no_retry';
}

/** Requests whose type, period (by date value), days or status (in Arabic) are not all shown; raw English codes count once. */
function fieldsMissing(p: PageDriver, reqs: readonly Req[]): Promise<number> {
  return ql<number>(p, `
    const reqs = ${JSON.stringify(reqs)}; const T = ${JSON.stringify(TYPE_RE)}; const S = ${JSON.stringify(STATUS_RE)};
    const texts = reqItems().map(txt);
    let bad = 0;
    for (const r of reqs) {
      const t = texts.find((x) => hasDate(x, r.startDate) && hasDate(x, r.endDate)) || texts.find((x) => hasDate(x, r.startDate));
      const f = t ? fold(t) : '';
      const daysOk = t && hasNumber(withoutDates(t), r.days);
      if (!t || !hasDate(t, r.endDate) || !daysOk || !new RegExp(T[r.type]).test(f) || !new RegExp(S[r.status]).test(f)) bad++;
    }
    if (/\\b(annual|sick|emergency|approved|pending|rejected)\\b/.test(txt(region()))) bad++;
    return bad;`);
}

/**
 * Opens with the service failing and waits for the error state; returns what the error said (visible alerts and the
 * innermost element carrying an error word), so a later state can be checked for any trace of it. Null: no error state.
 */
async function openInError(p: PageDriver): Promise<string[] | null> {
  p.overrideFile(DATA, JSON.stringify(sets(p).main));
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
async function retryFailsAgain(p: PageDriver): Promise<'again' | 'no_retry' | 'other'> {
  if (!(await retryWith(p, 'error'))) return 'no_retry';
  await p.wait(700);
  return (await ul(p, `return errorAgain();`, 2000)) ? 'again' : 'other';
}

async function atWidths(p: PageDriver, widths: readonly Viewport[]): Promise<TestOutcomeReport> {
  for (const v of widths) {
    if ((await openList(p, v)) === 0) return fail(`على عرض ${v.width}: لم تُعرض الطلبات`);
    const m = await p.layout();
    const o = await q<{ count: number }>(p, `return overflowReport();`);
    if (!(m.contentWidth <= m.viewportWidth && o.count === 0)) return fail(`على عرض ${v.width}: عرض المحتوى ${m.contentWidth}؛ عناصر تتجاوز الشاشة: ${o.count}`);
  }
  return pass(`نجح على ${widths.length} عروض: ${widths.map((v) => v.width).join('، ')}`);
}

export const actFeIntegratedLeaveRequestsPack: TestPack = {
  activityId: 'act_fe_integrated_leave_requests',
  version: '0.3.0',
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
      labelAr: 'كل طلب يعرض نوعه وحالته بالعربية، وفترته (تاريخان بأي صيغة شائعة)، وعدد أيامه، أيًّا كانت البيانات (تتولّد في كل تشغيل)',
      run: async (p) => {
        const { main } = sets(p);
        if ((await openList(p)) !== main.length) return fail('عدد الطلبات المعروضة لا يطابق ما أرجعته الخدمة');
        const bad = await fieldsMissing(p, main);
        return bad === 0 ? pass() : fail(`طلبات لا تُعرض حقولها كاملة بالعربية: ${bad}`);
      },
    },
    {
      id: 'output.other_requests_same_shape', criterionKey: 'data_states', layer: 'output', mode: 'automated',
      labelAr: 'بيانات أخرى بالبنية نفسها (أرقام وتواريخ وحالات مختلفة) تُعرض كلها، ولا يظهر شيء من الملف المرفق',
      run: async (p) => {
        const { other } = sets(p);
        if ((await openList(p, undefined, other)) !== other.length) return fail('عدد الطلبات المعروضة لا يطابق البيانات الأخرى');
        const bad = await fieldsMissing(p, other);
        if (bad > 0) return fail(`طلبات لا تُعرض حقولها كاملة بالعربية: ${bad}`);
        const stale = await ql<number>(p, `const b = txt(document.body); return ${JSON.stringify(SHIPPED_STARTS)}.filter((d) => tokensFor(b, d).some((k) => k.y !== null)).length;`);
        return stale === 0 ? pass() : fail(`تظهر طلبات من الملف المرفق لا من الخدمة: ${stale}`);
      },
    },
    {
      id: 'output.order_by_submission_date', criterionKey: 'judgment_assumption_check', layer: 'output', mode: 'supports_human',
      labelAr: 'للمراجِع: ترتيب الطلبات المعروضة بحسب تاريخ التقديم (الأحدث أولًا)',
      run: async (p) => {
        const { main } = sets(p);
        if ((await openList(p)) !== main.length) return fail('عدد الطلبات المعروضة لا يطابق ما أرجعته الخدمة');
        const ok = await ql<boolean>(p, `const order = ${JSON.stringify(newestFirst(main))}; const texts = reqItems().map(txt); return order.every((d, i) => hasDate(texts[i] || '', d));`);
        return ok ? pass() : fail('الترتيب المعروض ليس من الأحدث إلى الأقدم بحسب تاريخ التقديم');
      },
    },
    {
      id: 'data_states.loading_visible', criterionKey: 'data_states', layer: 'data_states', mode: 'automated',
      labelAr: 'رسالة التحميل ظاهرة أثناء الطلب وتختفي حين تظهر الطلبات',
      run: async (p) => {
        const { main } = sets(p);
        p.overrideFile(DATA, JSON.stringify(main));
        p.failRequestsTo(DATA, 'slow');
        await p.open();
        await p.wait(700);
        if (!(await ql<boolean>(p, `return loadingShown() && reqItems().length === 0;`))) return fail('لا رسالة تحميل أثناء انتظار الخدمة');
        return (await ul(p, `return listed(${main.length});`, 3500)) ? pass() : fail('رسالة التحميل لم تُستبدل بالطلبات');
      },
    },
    {
      id: 'data_states.error_with_retry_button', criterionKey: 'data_states', layer: 'errors', mode: 'automated',
      labelAr: 'فشل الخدمة يُظهر رسالة واضحة وزر «إعادة المحاولة» حقيقيًا، دون رسالة تحميل',
      run: async (p) => {
        p.failRequestsTo(DATA, 'error');
        await p.open();
        if (!(await ul(p, `return (errorShown() || alertShown()) && !loadingShown();`, 2500))) return fail('لا رسالة خطأ واضحة بعد فشل الخدمة');
        if (!(await ql<boolean>(p, `return !!retryAny();`))) return fail('لا عنصر لإعادة المحاولة بعد الفشل');
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
        if ((await failThenRetry(p, 'slow')) === 'no_retry') return notApplicable(NO_ERROR_STATE);
        if (!(await ul(p, `return loadingShown() && !errorShown();`, 1200))) return fail('لا رسالة تحميل أثناء إعادة المحاولة');
        const ok = await ul(p, `return listed(${sets(p).main.length}) && !errorShown();`, 4000);
        return ok ? pass() : fail('بعد إعادة المحاولة بقيت حالتان متعارضتان أو لم تظهر الطلبات');
      },
    },
    {
      id: 'state.loading_ends_after_retry', criterionKey: 'root_cause_fixed', layer: 'functional', mode: 'supports_human',
      labelAr: 'للمراجِع: بعد إعادة محاولة ناجحة ينتهي التحميل، سواء أرجعت الخدمة طلبات أم قائمة خالية',
      run: async (p) => {
        for (const next of ['ok', 'empty'] as const) {
          if ((await failThenRetry(p, next)) === 'no_retry') return notApplicable(NO_ERROR_STATE);
          await p.wait(500);
          const ended = await ul(p, `return !loadingShown() && !busyShown();`, 3000);
          if (!ended) return fail(next === 'ok' ? 'بعد إعادة المحاولة وظهور الطلبات لم ينته التحميل' : 'بعد إعادة المحاولة بقائمة خالية لم ينته التحميل');
        }
        return pass();
      },
    },
    {
      id: 'state.retry_success_clears_error', criterionKey: 'state_transitions', layer: 'functional', mode: 'automated',
      labelAr: 'بعد نجاح إعادة المحاولة لا يبقى في الصفحة كلها أثر للخطأ: لا رسالته، ولا تنبيه، ولا زر إعادة المحاولة، ولا تحميل',
      run: async (p) => {
        const n = sets(p).main.length;
        const trace = await openInError(p);
        if (!trace) return notApplicable(NO_ERROR_STATE);
        if (!(await retryWith(p, 'slow'))) return notApplicable(NO_ERROR_STATE);
        if (!(await ul(p, `return loadingShown() && !errorAnywhere() && !alertShown() && reqItems().length === 0;`, 1200))) {
          return fail('أثناء إعادة المحاولة لم يظهر التحميل وحده: بقيت رسالة الخطأ أو لم يظهر التحميل');
        }
        if (await ul(p, `return settledList(${n}, ${JSON.stringify(trace)});`, 3500)) return pass();
        return fail(await ql<string>(p, `return leftovers(${n}, ${JSON.stringify(trace)});`));
      },
    },
    {
      id: 'state.second_retry_cycle', criterionKey: 'state_transitions', layer: 'functional', mode: 'automated',
      labelAr: 'دورتان: فشل، ثم إعادة محاولة تفشل (خطأ وحده)، ثم إعادة محاولة تنجح (تحميل ثم الطلبات وحدها)',
      run: async (p) => {
        const n = sets(p).main.length;
        const trace = await openInError(p);
        if (!trace) return notApplicable(NO_ERROR_STATE);
        const again = await retryFailsAgain(p);
        if (again === 'no_retry') return notApplicable(NO_ERROR_STATE);
        if (again === 'other') return fail('إعادة المحاولة التي تفشل لا تعيد حالة الخطأ وحدها (مع زر إعادة المحاولة، دون تحميل)');
        if (!(await retryWith(p, 'slow'))) return fail('لا عنصر لإعادة المحاولة في الدورة الثانية');
        if (!(await ul(p, `return loadingShown() && !errorAnywhere() && !alertShown();`, 1200))) return fail('في الدورة الثانية لم يظهر التحميل وحده');
        if (await ul(p, `return settledList(${n}, ${JSON.stringify(trace)});`, 3500)) return pass();
        return fail(`بعد الدورة الثانية: ${await ql<string>(p, `return leftovers(${n}, ${JSON.stringify(trace)});`)}`);
      },
    },
    {
      id: 'state.second_retry_ends_empty', criterionKey: 'state_transitions', layer: 'functional', mode: 'automated',
      labelAr: 'دورتان: فشل، ثم إعادة محاولة تفشل، ثم إعادة محاولة بقائمة خالية: حالة الفراغ وحدها دون تحميل ولا خطأ',
      run: async (p) => {
        if (!(await openInError(p))) return notApplicable(NO_ERROR_STATE);
        const again = await retryFailsAgain(p);
        if (again === 'no_retry') return notApplicable(NO_ERROR_STATE);
        if (again === 'other') return fail('إعادة المحاولة التي تفشل لا تعيد حالة الخطأ وحدها (مع زر إعادة المحاولة، دون تحميل)');
        if (!(await retryWith(p, 'empty'))) return fail('لا عنصر لإعادة المحاولة في الدورة الثانية');
        if (await ul(p, `return settledEmpty();`, 3000)) return pass();
        const r = await ql<{ loading: boolean; error: boolean; empty: boolean }>(p, `return { loading: loadingShown() || busyShown(), error: errorAnywhere() || alertShown(), empty: emptyShown() };`);
        return fail([r.loading ? 'التحميل ما زال ظاهرًا' : '', r.error ? 'رسالة الخطأ ما زالت ظاهرة' : '', !r.empty ? 'لا رسالة للقائمة الخالية' : ''].filter(Boolean).join(' · ') || 'الحالة الأخيرة ليست حالة الفراغ وحدها');
      },
    },
    {
      id: 'responsive.page_width_mobile_range', criterionKey: 'responsive_layout', layer: 'responsive', mode: 'automated',
      labelAr: 'لا محتوى يتجاوز عرض الشاشة على عروض جوال متعددة (360 وعرضان آخران بين 340 و430 بكسل) والطلبات معروضة',
      run: async (p) => atWidths(p, mobileWidths(rng(p.seed, 'leave_requests/mobile'))),
    },
    {
      id: 'responsive.page_width_desktop_range', criterionKey: 'responsive_layout', layer: 'responsive', mode: 'automated',
      labelAr: 'لا تمرير أفقي على 1024 بكسل وعلى عرضين آخرين بين 900 و1440 بكسل والطلبات معروضة',
      run: async (p) => atWidths(p, widthsAround(rng(p.seed, 'leave_requests/desktop'), 1024, [900, 1020], [1028, 1440], 768)),
    },
    {
      id: 'a11y.retry_by_keyboard', criterionKey: 'a11y_basics', layer: 'a11y', mode: 'automated',
      labelAr: 'زر إعادة المحاولة يصله Tab بتركيز ظاهر، وEnter يعيد التحميل',
      run: async (p) => {
        const { main } = sets(p);
        p.overrideFile(DATA, JSON.stringify(main));
        p.failRequestsTo(DATA, 'error');
        await p.open();
        if (!(await ul(p, `return !!retryAny();`, 2500))) return notApplicable(NO_ERROR_STATE);
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
        return (await ul(p, `return listed(${main.length});`, 3000)) ? pass() : fail('Enter لم يُعد التحميل');
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
