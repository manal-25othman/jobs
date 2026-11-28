/**
 * CANDIDATE pack — act_fe_change_request (team tasks: status filter + empty-list report). Not approved by an expert.
 * Every list test serves its OWN task data (overrideFile) with a status mix unlike the shipped file, so output that is
 * hard-coded for the shipped data fails. Data states come from the harness (failRequestsTo), not the URL scenario.
 * 0.2.0: the filter is chosen BEFORE the data arrives (in the error state, or while loading) and then the list is
 * rendered from new data, so a filter that hides or re-filters already-rendered items, rather than living in state,
 * is told apart; and a second data set of the same shape checks the default list against hard-coded output.
 * 0.3.0: every task set (titles, owners, due dates, ids, status mix, order) is generated per run from the attempt seed,
 * so a page cannot list the values a test uses; filter options and the retry control are found by role and accessible
 * name with their usual variants («منجزة (3)», aria-label, «أعيدي المحاولة»); a filtered list is checked by WHICH tasks
 * it shows, not by the wording of their status badge; a test whose precondition never appears is not applicable; and
 * root_cause_fixed only observes the empty-vs-failure distinction (the retry control belongs to js_correctness).
 */
import type { PageDriver, TestPack } from '../pack.js';
import { type Rand, clickTagged, fail, fileAt, int, notApplicable, one, pass, presence, probingReport, q, rng, shuffle, starterRetention, until } from './lib.js';

const DATA = 'data/tasks.json';
type Status = 'new' | 'in_progress' | 'done';
interface Task { readonly id: number; readonly title: string; readonly owner: string; readonly status: Status; readonly due: string }

const LABEL: Record<string, string> = { all: 'الكل', new: 'جديدة', in_progress: 'قيد التنفيذ', done: 'منجزة' };
/** Folded wording a task's status may be shown with (the brief fixes the filter options, not the badge text). */
const STATUS_WORDS: Record<Status, string> = { new: 'جديد', in_progress: 'قيد التنفيذ|قيد العمل|جار', done: 'منجز|مكتمل|تمت|انجزت' };
/** Titles of the file shipped with the starter: none may appear while other data is served. */
const SHIPPED_TITLES = ['تحديث صفحة الأسئلة الشائعة', 'مراجعة نصوص رسائل الخطأ في النموذج', 'إصلاح محاذاة الشعار على الجوال', 'إضافة نص بديل لصور صفحة الفريق', 'تجهيز قائمة التحقق قبل الإطلاق', 'توحيد ألوان الأزرار مع الهوية'];

/* ───────── generated task sets (per attempt seed): no digits in titles or owners, no status words in titles ───────── */

const VERBS = ['تحديث', 'مراجعة', 'إصلاح', 'تحسين', 'توثيق', 'اختبار', 'تنظيف', 'ترجمة', 'إعداد', 'تجهيز', 'تبسيط', 'نقل', 'ضبط', 'تقليل', 'تصميم', 'فحص'];
const OBJECTS = ['صفحة الأسعار', 'شريط التنقل العلوي', 'نموذج الاشتراك', 'نافذة التأكيد', 'بطاقات المنتجات', 'صور المعرض', 'تذييل الموقع', 'نصوص المساعدة',
  'جدول المواعيد', 'أيقونات الإعدادات', 'خطوط العناوين', 'هوامش الجوال', 'حقل البحث', 'رابط الدعم الفني', 'شاشة تسجيل الدخول', 'ملف الألوان', 'وصف صور الفريق',
  'قالب النشرة البريدية', 'لوحة الإحصاءات', 'صفحة الخطأ', 'قائمة الأسئلة', 'زر المشاركة', 'شريط التقدم', 'رسالة الترحيب'];
const OWNERS = ['هند', 'فهد', 'لمى', 'سعد', 'ريم', 'خالد', 'نورة', 'عبير', 'ماجد', 'رهف', 'أروى', 'بدر', 'جود', 'منيرة', 'تركي', 'غادة', 'سلمان', 'دانة', 'يزيد', 'Rana', 'Omar', 'Lina'];

function makeTasks(r: Rand, counts: Readonly<Record<Status, number>>, used: Set<string>, ids: Set<number>): Task[] {
  const out: Task[] = [];
  for (const status of ['new', 'in_progress', 'done'] as const) {
    for (let i = 0; i < counts[status]; i++) {
      let title = '';
      do title = `${one(r, VERBS)} ${one(r, OBJECTS)}`; while (used.has(title));
      used.add(title);
      let id = 0;
      do id = int(r, 100, 9999); while (ids.has(id));
      ids.add(id);
      const due = `${int(r, 2027, 2029)}-${String(int(r, 1, 12)).padStart(2, '0')}-${String(int(r, 1, 28)).padStart(2, '0')}`;
      out.push({ id, title, owner: one(r, OWNERS), status, due });
    }
  }
  return shuffle(r, out);
}

interface TaskSets { readonly main: Task[]; readonly noDone: Task[]; readonly later: Task[]; readonly other: Task[] }
const cache = new Map<number, TaskSets>();
/** The attempt's task sets: `main` has three different non-zero status counts, `noDone` none done, `later` ≥ 2 done. */
function sets(p: PageDriver): TaskSets {
  const hit = cache.get(p.seed);
  if (hit) return hit;
  const r = rng(p.seed, 'change_request/tasks');
  const used = new Set<string>(); const ids = new Set<number>();
  const [a, b, c] = shuffle(r, [1, 2, 3, 4]);
  const s: TaskSets = {
    main: makeTasks(r, { new: a!, in_progress: b!, done: c! }, used, ids),
    noDone: makeTasks(r, { new: int(r, 1, 3), in_progress: int(r, 1, 2), done: 0 }, used, ids),
    later: makeTasks(r, { new: int(r, 1, 2), in_progress: int(r, 1, 2), done: int(r, 2, 4) }, used, ids),
    other: makeTasks(r, { new: int(r, 0, 2), in_progress: int(r, 1, 2), done: int(r, 1, 2) }, used, ids),
  };
  cache.set(p.seed, s);
  return s;
}

const TASKS_LIB = String.raw`
const region = () => document.getElementById('tasks') || document.querySelector('main') || document.body;
const items = () => [...region().querySelectorAll('li')].filter(vis);
const outsideItems = () => {
  const m = (document.querySelector('main') || document.body).cloneNode(true);
  m.querySelectorAll('li, option, select, script, style, template').forEach((x) => x.remove());
  return m.textContent.replace(/\s+/g, ' ');
};
const errorShown = () => /تعذر|خطا|فشل/.test(fold(txt(region()).replace(items().map(txt).join(' '), '')));
const emptyShown = () => /لا (توجد |يوجد )?(اي )?(مهام|مهمه)|ما من مهام|ليس (هناك|لديك|لدي) (اي )?مهام/.test(fold(txt(region())));
const loadingShown = () => /(جار|يتم)\s*(ال)?تحميل/.test(fold(txt(document.body)));
const retryCtl = () => retryControl(document);
const alertShown = () => [...document.querySelectorAll('[role=alert]')].some((e) => vis(e) && txt(e));
/* A filter option's label, compared by its words: counts, brackets and separators around it are allowed («منجزة (3)»). */
const bare = (s) => fold(s).replace(/[0-9()\[\]{}·•:|–—\-،,.]+/g, ' ').replace(/\s+/g, ' ').trim();
const isLabel = (s, label) => bare(s) === bare(label);
const filterButtons = () => [...document.querySelectorAll('button, [role=button], [role=tab], [role=radio], input[type=button]')].filter((x) => vis(x) && !x.closest('li'));
const pickFilter = (label) => {
  for (const s of document.querySelectorAll('select')) {
    const o = [...s.options].find((x) => isLabel(x.textContent, label));
    if (o && tag(s, 'filter')) return 'select:' + o.value;
  }
  for (const r of document.querySelectorAll('input[type=radio]')) {
    if (isLabel(nameOf(r), label)) { const t = vis(r) ? r : (r.labels && r.labels[0]); if (t && tag(t, 'filter')) return 'tag'; }
  }
  const b = filterButtons().find((x) => isLabel(accName(x), label));
  return b && tag(b, 'filter') ? 'tag' : '';
};
const controlShows = (label) => {
  for (const s of document.querySelectorAll('select')) {
    if ([...s.options].some((x) => isLabel(x.textContent, label))) { const o = s.options[s.selectedIndex]; return !!o && isLabel(o.textContent, label); }
  }
  const radios = [...document.querySelectorAll('input[type=radio]')].filter((r) => isLabel(nameOf(r), label));
  if (radios.length) return radios.some((r) => r.checked);
  const b = filterButtons().find((x) => isLabel(accName(x), label));
  if (!b) return false;
  const exposed = ['aria-pressed', 'aria-selected', 'aria-checked', 'aria-current'].filter((a) => b.hasAttribute(a));
  return exposed.length === 0 || exposed.some((a) => b.getAttribute(a) !== 'false');
};
const allTaskNodes = () => [...region().querySelectorAll('li')];
/* The list shows exactly these tasks (by title) and their count is visible outside the items. */
const shows = (titles) => {
  const texts = items().map(txt);
  return texts.length === titles.length && titles.every((t) => texts.some((x) => x.includes(t))) && hasNumber(outsideItems(), titles.length);
};
`;

const qt = <T>(p: PageDriver, body: string): Promise<T> => q<T>(p, body, TASKS_LIB);
const ut = (p: PageDriver, body: string, ms: number): Promise<boolean> => until(p, body, ms, TASKS_LIB);

async function openWith(p: PageDriver, tasks: readonly Task[]): Promise<boolean> {
  p.overrideFile(DATA, JSON.stringify(tasks));
  await p.open();
  return ut(p, `return items().length === ${tasks.length};`, 2500);
}

async function pick(p: PageDriver, status: string): Promise<boolean> {
  const how = await qt<string>(p, `return pickFilter(${JSON.stringify(LABEL[status])});`);
  if (how === 'tag') return clickTagged(p, 'filter');
  // A real, trusted selection through the browser engine (not an event made in the page's world).
  if (how.startsWith('select:')) { await p.selectOption('[data-r2-target="filter"]', how.slice(7)); return true; }
  return false;
}

const titlesOf = (tasks: readonly Task[], status: string): string[] => tasks.filter((t) => status === 'all' || t.status === status).map((t) => t.title);
const expectShown = (p: PageDriver, tasks: readonly Task[], status: string): Promise<boolean> =>
  ut(p, `return shows(${JSON.stringify(titlesOf(tasks, status))});`, 1200);

/** After a failed load: waits for the page to settle and says whether an error state (message, alert or retry) shows. */
async function settledError(p: PageDriver): Promise<{ error: boolean; retry: boolean; empty: boolean }> {
  await ut(p, `return !loadingShown() && (emptyShown() || errorShown() || alertShown() || !!retryCtl());`, 2500);
  return qt(p, `return { error: errorShown() || alertShown(), retry: !!retryCtl(), empty: emptyShown() };`);
}

/**
 * Chooses «منجزة» before any task is rendered, then lets the list render from the `later` set: first in the error
 * state (then retry), else while the request is still loading. Returns how the choice was made, or '' when the control
 * is not there before the data (the caller then checks the ready list instead).
 */
async function chooseBeforeData(p: PageDriver, later: readonly Task[]): Promise<'retry' | 'loading' | ''> {
  p.overrideFile(DATA, JSON.stringify(later));
  p.failRequestsTo(DATA, 'error');
  await p.open();
  if (await ut(p, `return !!retryCtl() && !loadingShown() && items().length === 0;`, 2500)) {
    if (await pick(p, 'done')) {
      p.failRequestsTo(DATA, 'ok');
      if ((await qt<boolean>(p, `return tag(retryCtl(), 'retry');`)) && (await clickTagged(p, 'retry'))) return 'retry';
    }
  }
  p.failRequestsTo(DATA, 'slow');
  await p.open();
  await p.wait(150);
  if ((await qt<boolean>(p, `return loadingShown() && items().length === 0;`)) && (await pick(p, 'done'))) return 'loading';
  return '';
}

export const actFeChangeRequestPack: TestPack = {
  activityId: 'act_fe_change_request',
  version: '0.3.0',
  status: 'candidate',
  entry: 'index.html',
  tests: [
    {
      id: 'output.list_follows_data', criterionKey: 'js_correctness', layer: 'output', mode: 'automated',
      labelAr: 'القائمة الافتراضية تعرض مهام الخدمة كلها وعددها، أيًّا كانت البيانات (تتولّد في كل تشغيل)',
      run: async (p) => {
        const { main } = sets(p);
        if (!(await openWith(p, main))) return fail('عدد المهام المعروضة لا يطابق ما أرجعته الخدمة');
        const r = await qt<{ titles: boolean; count: boolean }>(p, `
          const t = items().map(txt).join(' | ');
          return { titles: ${JSON.stringify(main.map((x) => x.title))}.every((x) => t.includes(x)), count: hasNumber(outsideItems(), ${main.length}) };`);
        if (!r.titles) return fail('عناوين المهام المعروضة لا تطابق البيانات');
        return r.count ? pass() : fail('عدد المهام المعروضة غير ظاهر');
      },
    },
    {
      id: 'filter.control_labelled', criterionKey: 'filter_in_state', layer: 'a11y', mode: 'automated',
      labelAr: 'عنصر اختيار الحالة موجود بخياراته الأربعة وله تسمية',
      run: async (p) => {
        await openWith(p, sets(p).main);
        const r = await qt<{ kind: string; named: boolean }>(p, `
          const labels = ${JSON.stringify(Object.values(LABEL))};
          const sel = [...document.querySelectorAll('select')].find((s) => labels.every((l) => [...s.options].some((o) => isLabel(o.textContent, l))));
          if (sel) return { kind: 'select', named: !!nameOf(sel) };
          const radios = [...document.querySelectorAll('input[type=radio]')];
          if (labels.every((l) => radios.some((r) => isLabel(nameOf(r), l)))) return { kind: 'radio', named: true };
          const btns = labels.map((l) => filterButtons().find((b) => isLabel(accName(b), l)));
          if (btns.every(Boolean)) {
            let g = btns[0].parentElement; while (g && !btns.every((b) => g.contains(b))) g = g.parentElement;
            const groupNamed = !!g && (/^(group|toolbar|radiogroup|tablist)$/.test(g.getAttribute('role') || '') && !!nameOf(g) || (g.tagName === 'FIELDSET' && !!g.querySelector('legend')));
            const stateExposed = btns.some((b) => b.hasAttribute('aria-pressed') || b.hasAttribute('aria-selected') || b.hasAttribute('aria-checked') || b.hasAttribute('aria-current'));
            return { kind: 'buttons', named: groupNamed || stateExposed };
          }
          return { kind: '', named: false };`);
        if (!r.kind) return fail('لا عنصر اختيار للحالة بخياراته الأربعة');
        return r.named ? pass() : fail('عنصر اختيار الحالة بلا تسمية');
      },
    },
    {
      id: 'filter.each_status_then_all', criterionKey: 'filter_in_state', layer: 'functional', mode: 'automated',
      labelAr: 'اختيار كل حالة يعرض مهامها فقط مع عددها، والعودة إلى «الكل» تعيدها جميعًا',
      run: async (p) => {
        const { main } = sets(p);
        if (!(await openWith(p, main))) return fail('لم تُعرض القائمة');
        for (const status of ['done', 'new', 'in_progress', 'all']) {
          if (!(await pick(p, status))) return fail('لا عنصر اختيار للحالة');
          if (!(await expectShown(p, main, status))) return fail(`المعروض بعد اختيار «${LABEL[status]}» لا يطابق المهام أو عددها`);
        }
        return pass();
      },
    },
    {
      id: 'filter.kept_when_data_renders', criterionKey: 'filter_in_state', layer: 'functional', mode: 'automated',
      labelAr: 'حالة تُختار قبل وصول البيانات تبقى مطبّقة وظاهرة في عنصر الاختيار حين تُعرض البيانات، ثم تغييرها وإزالتها يعيدان الحساب من القائمة كاملة',
      run: async (p) => {
        const { later } = sets(p);
        const how = await chooseBeforeData(p, later);
        if (how === '') {
          // The control appears only with the data: check the ready list is recomputed, not hidden item by item.
          if (!(await openWith(p, later))) return fail('لم تُعرض القائمة');
          if (!(await pick(p, 'done'))) return fail('لا عنصر اختيار للحالة');
          if (!(await expectShown(p, later, 'done'))) return fail('المعروض بعد اختيار «منجزة» لا يطابق المهام أو عددها');
          const others = JSON.stringify(titlesOf(later, 'new').concat(titlesOf(later, 'in_progress')));
          const hidden = await qt<number>(p, `return allTaskNodes().filter((li) => ${others}.some((t) => (li.textContent || '').includes(t))).length;`);
          if (hidden > 0) return fail(`المهام غير المطابقة مخفية في الصفحة لا محسوبة من الحالة: ${hidden}`);
        } else {
          const note = how === 'retry' ? 'بعد إعادة المحاولة' : 'بعد انتهاء التحميل';
          await ut(p, `return !loadingShown() && (items().length > 0 || emptyShown() || errorShown());`, 3500);
          if (!(await expectShown(p, later, 'done'))) return fail(`الحالة المختارة قبل وصول البيانات لم تُطبَّق ${note}`);
          if (!(await qt<boolean>(p, `return controlShows(${JSON.stringify(LABEL.done)});`))) return fail(`عنصر الاختيار لا يُظهر الحالة المطبّقة ${note}`);
        }
        for (const status of ['new', 'all', 'in_progress', 'all']) {
          if (!(await pick(p, status))) return fail('لا عنصر اختيار للحالة');
          if (!(await expectShown(p, later, status))) return fail(`المعروض بعد اختيار «${LABEL[status]}» لا يُحسب من القائمة كاملة`);
        }
        return pass();
      },
    },
    {
      id: 'filter.no_match_message', criterionKey: 'empty_state_correct', layer: 'output', mode: 'automated',
      labelAr: 'حالة بلا مهام تُظهر رسالة «لا مهام بهذه الحالة» لا خطأ، ثم تعود القائمة',
      run: async (p) => {
        const { noDone } = sets(p);
        if (!(await openWith(p, noDone))) return fail('لم تُعرض القائمة');
        if (!(await pick(p, 'done'))) return fail('لا عنصر اختيار للحالة');
        const ok = await ut(p, `return items().length === 0 && emptyShown() && /حاله|تصفيه|مختار|منجز/.test(fold(txt(region()))) && !errorShown() && !retryCtl();`, 1200);
        if (!ok) return fail('لم تظهر رسالة الحالة الفارغة للتصفية');
        if (!(await pick(p, 'all'))) return fail('لا عنصر اختيار للحالة');
        return (await expectShown(p, noDone, 'all')) ? pass() : fail('لم تعد المهام بعد اختيار «الكل»');
      },
    },
    {
      id: 'data_states.empty_answer_message', criterionKey: 'empty_state_correct', layer: 'data_states', mode: 'automated',
      labelAr: 'قائمة خالية من الخدمة تُظهر «لا مهام بعد» دون رسالة خطأ ولا إعادة محاولة',
      run: async (p) => {
        p.failRequestsTo(DATA, 'empty');
        await p.open();
        await ut(p, `return !loadingShown() && (emptyShown() || errorShown());`, 2500);
        const r = await qt<{ empty: boolean; error: boolean; retry: boolean; alert: boolean }>(p, `return { empty: emptyShown(), error: errorShown(), retry: !!retryCtl(), alert: alertShown() };`);
        if (r.empty && !r.error && !r.retry && !r.alert) return pass();
        return fail(r.error || r.retry || r.alert ? 'القائمة الخالية تُعرض كأنها خطأ' : 'لا رسالة للقائمة الخالية');
      },
    },
    {
      id: 'data_states.error_and_empty_distinct', criterionKey: 'root_cause_fixed', layer: 'data_states', mode: 'supports_human',
      labelAr: 'للمراجِع: فشل الخدمة يبقى خطأً (لا يُعرض فراغًا)، والقائمة الخالية حالة فراغ لا خطأ — حالتان مختلفتان',
      run: async (p) => {
        p.failRequestsTo(DATA, 'error');
        await p.open();
        const e = await settledError(p);
        p.failRequestsTo(DATA, 'empty');
        await p.open();
        await ut(p, `return !loadingShown() && (emptyShown() || errorShown() || alertShown());`, 2500);
        const z = await qt<{ error: boolean; empty: boolean }>(p, `return { error: errorShown() || alertShown(), empty: emptyShown() };`);
        const errOk = e.error && !e.empty;
        const emptyOk = z.empty && !z.error;
        if (errOk && emptyOk) return pass();
        return fail(!errOk ? 'فشل الخدمة لا يُعرض خطأً (يُعرض فراغًا أو لا شيء)' : 'القائمة الخالية لا تُعرض حالة فراغ');
      },
    },
    {
      id: 'errors.retry_recovers', criterionKey: 'js_correctness', layer: 'errors', mode: 'automated',
      labelAr: 'بعد فشل التحميل، إعادة المحاولة تعرض القائمة دون أخطاء غير معالجة',
      run: async (p) => {
        const { main } = sets(p);
        p.overrideFile(DATA, JSON.stringify(main));
        p.failRequestsTo(DATA, 'error');
        await p.open();
        const e = await settledError(p);
        if (!e.retry) return e.error ? fail('حالة الخطأ بلا عنصر لإعادة المحاولة') : notApplicable('فشل الخدمة لا يُظهر حالة خطأ، فلا إعادة محاولة تُختبر (يُحسب في السبب الجذري)');
        p.failRequestsTo(DATA, 'ok');
        await qt(p, `return tag(retryCtl(), 'retry');`);
        if (!(await clickTagged(p, 'retry'))) return fail('لا زر لإعادة المحاولة بعد الفشل');
        if (!(await ut(p, `return shows(${JSON.stringify(main.map((t) => t.title))});`, 2500))) return fail('لم تظهر القائمة بعد إعادة المحاولة');
        const clean = await qt<boolean>(p, `return !errorShown() && !loadingShown();`);
        if (!clean) return fail('بقيت رسالة خطأ أو تحميل بعد النجاح');
        return p.pageErrors().length === 0 ? pass() : fail('أخطاء غير معالجة في الصفحة');
      },
    },
    {
      id: 'output.other_tasks_same_shape', criterionKey: 'js_correctness', layer: 'output', mode: 'automated',
      labelAr: 'بيانات أخرى بالبنية نفسها (عناوين ومسؤولون وحالات وترتيب مختلف) تُعرض كلها بحالتها وعددها، ولا يظهر شيء من الملف المرفق',
      run: async (p) => {
        const { other } = sets(p);
        if (!(await openWith(p, other))) return fail('عدد المهام المعروضة لا يطابق البيانات الأخرى');
        const r = await qt<{ bad: number; count: boolean; stale: number }>(p, `
          const tasks = ${JSON.stringify(other)}; const W = ${JSON.stringify(STATUS_WORDS)};
          const texts = items().map(txt);
          const bad = tasks.filter((t) => !texts.some((x) => x.includes(t.title) && x.includes(t.owner) && new RegExp(W[t.status]).test(fold(x.replace(t.title, ''))))).length;
          const body = txt(document.body);
          return { bad, count: hasNumber(outsideItems(), tasks.length), stale: ${JSON.stringify(SHIPPED_TITLES)}.filter((x) => body.includes(x)).length };`);
        if (r.bad > 0) return fail(`مهام لا تُعرض بعنوانها ومسؤولها وحالتها: ${r.bad}`);
        if (r.stale > 0) return fail(`تظهر مهام من الملف المرفق لا من الخدمة: ${r.stale}`);
        return r.count ? pass() : fail('عدد المهام المعروضة غير ظاهر أو لا يطابق البيانات');
      },
    },
    {
      id: 'data_states.loading_then_list', criterionKey: 'js_correctness', layer: 'data_states', mode: 'automated',
      labelAr: 'رسالة التحميل ظاهرة أثناء الطلب، ثم تحل محلها القائمة',
      run: async (p) => {
        const { main } = sets(p);
        p.overrideFile(DATA, JSON.stringify(main));
        p.failRequestsTo(DATA, 'slow');
        await p.open();
        await p.wait(600);
        const during = await qt<boolean>(p, `return loadingShown() && items().length === 0;`);
        if (!during) return fail('لا رسالة تحميل أثناء انتظار الخدمة');
        const after = await ut(p, `return !loadingShown() && items().length === ${main.length};`, 3500);
        return after ? pass() : fail('رسالة التحميل لم تُستبدل بالقائمة');
      },
    },
  ],
  staticChecks: [
    {
      id: 'quality.structure_kept', criterionKey: 'problem_traced', layer: 'quality', mode: 'supports_human',
      labelAr: 'للمراجِع: البنية القائمة باقية (state وrenderTasks وloadTasks) وحجم التغيير محدود',
      run: (files, starter) => {
        const app = fileAt(files, 'app.js') ?? '';
        const kept = /\bconst\s+state\s*=/.test(app) && /function\s+renderTasks\s*\(/.test(app) && /function\s+loadTasks\s*\(/.test(app);
        const r = starterRetention(files, starter, ['app.js']);
        const note = `بقي ${Math.round(r.ratio * 100)}% من أسطر app.js الأصلية`;
        return kept && r.ratio >= 0.5 ? pass(note) : fail(kept ? note : `تغيّرت البنية القائمة · ${note}`);
      },
    },
    {
      id: 'quality.declared_identifiers', criterionKey: 'js_correctness', layer: 'quality', mode: 'supports_human',
      labelAr: 'للمراجِع: لا متغيرات تُسند دون تعريف (متغيرات عامة عرضية)',
      run: (files) => {
        const src = (fileAt(files, 'app.js') ?? '')
          .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
          .replace(/`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, '""');
        const declared = new Set<string>();
        for (const m of src.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]!);
        for (const m of src.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) for (const a of m[1]!.split(',')) { const id = a.trim().split(/[\s=]/)[0]; if (id) declared.add(id); }
        for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*=>/g)) declared.add(m[1]!);
        for (const m of src.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) declared.add(m[1]!);
        const undeclared = new Set<string>();
        for (const m of src.matchAll(/(?:^|[;{}\n])\s*([A-Za-z_$][\w$]*)\s*(?:[+\-*/]?=)(?!=)/g)) if (!declared.has(m[1]!)) undeclared.add(m[1]!);
        return undeclared.size === 0 ? pass() : fail(`إسناد دون تعريف: ${[...undeclared].slice(0, 5).join('، ')}`);
      },
    },
    {
      id: 'gaming.environment_probing', criterionKey: 'js_correctness', layer: 'gaming', mode: 'supports_human',
      labelAr: 'لا فحص لبيئة التشغيل ولا تعديل للخدمة الوهمية',
      run: (files, starter) => probingReport(files, starter, ['mock-api.js']),
    },
    {
      id: 'quality.source_files_present', criterionKey: 'deliverables_complete', layer: 'quality', mode: 'supports_human',
      labelAr: 'ملف الكود موجود (الملاحظة والشرح يتحقق منهما المراجِع)',
      run: (files) => presence(files, ['app.js', 'index.html']),
    },
  ],
  humanOnlyCriteria: [
    { criterionKey: 'component_explained', whyAr: 'شرح ما تفعله renderTasks بالحالة المرفقة نص يقرؤه شخص؛ لا يظهر في سلوك الصفحة.' },
    { criterionKey: 'decision_explained', whyAr: 'ملاحظة القرار (السبب، والتغيير، والبديل المرفوض) يحكم عليها شخص من النص.' },
  ],
};
