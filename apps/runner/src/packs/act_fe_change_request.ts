/**
 * CANDIDATE pack — act_fe_change_request (team tasks: status filter + empty-list report). Not approved by an expert.
 * Every list test serves its OWN task data (overrideFile) with a status mix unlike the shipped file, so output that is
 * hard-coded for the shipped data fails. Data states come from the harness (failRequestsTo), not the URL scenario.
 */
import type { PageDriver, TestPack } from '../pack.js';
import { clickTagged, fail, fileAt, pass, presence, probingReport, q, starterRetention, until } from './lib.js';

const DATA = 'data/tasks.json';

/** Seven tasks: 2 new, 1 in progress, 4 done (the shipped file has 2 of each). Titles carry no digits. */
const TASKS = [
  { id: 11, title: 'كتابة دليل الأسلوب للواجهات', owner: 'هند', status: 'done', due: '2027-01-10' },
  { id: 12, title: 'تحسين سرعة تحميل الصور', owner: 'فهد', status: 'new', due: '2027-01-12' },
  { id: 13, title: 'اختبار النموذج بقارئ الشاشة', owner: 'لمى', status: 'done', due: '2027-01-14' },
  { id: 14, title: 'تنظيف ملفات الأنماط القديمة', owner: 'هند', status: 'in_progress', due: '2027-01-15' },
  { id: 15, title: 'ترجمة رسائل التنبيه', owner: 'فهد', status: 'done', due: '2027-01-18' },
  { id: 16, title: 'مراجعة تباين الألوان', owner: 'لمى', status: 'new', due: '2027-01-20' },
  { id: 17, title: 'توثيق مكوّن القائمة', owner: 'سعد', status: 'done', due: '2027-01-21' },
];
/** No task in the last status. */
const TASKS_NO_DONE = [
  { id: 21, title: 'إعداد قالب البريد الترحيبي', owner: 'ريم', status: 'new', due: '2027-02-01' },
  { id: 22, title: 'تحديث أيقونات القائمة', owner: 'خالد', status: 'new', due: '2027-02-03' },
  { id: 23, title: 'ضبط المسافات في الجوال', owner: 'نورة', status: 'in_progress', due: '2027-02-04' },
];
const LABEL: Record<string, string> = { all: 'الكل', new: 'جديدة', in_progress: 'قيد التنفيذ', done: 'منجزة' };

const TASKS_LIB = String.raw`
const region = () => document.getElementById('tasks') || document.querySelector('main') || document.body;
const items = () => [...region().querySelectorAll('li')].filter(vis);
const outsideItems = () => {
  const m = (document.querySelector('main') || document.body).cloneNode(true);
  m.querySelectorAll('li, option, select, script, style, template').forEach((x) => x.remove());
  return m.textContent.replace(/\s+/g, ' ');
};
const errorShown = () => /تعذّر|تعذر|خطأ|فشل/.test(txt(region()).replace(items().map(txt).join(' '), ''));
const emptyShown = () => /لا (توجد )?مهام/.test(txt(region()));
const loadingShown = () => /جار[ً-ْي]*\s*(ال)?تحميل/.test(txt(document.body));
const retryCtl = () => findButton(/إعادة|حاول/);
const alertShown = () => [...document.querySelectorAll('[role=alert]')].some((e) => vis(e) && txt(e));
const pickFilter = (label) => {
  for (const s of document.querySelectorAll('select')) {
    const o = [...s.options].find((x) => x.textContent.trim() === label);
    if (o && tag(s, 'filter')) return 'select:' + o.value;
  }
  for (const r of document.querySelectorAll('input[type=radio]')) {
    if (nameOf(r) === label) { const t = vis(r) ? r : (r.labels && r.labels[0]); if (t && tag(t, 'filter')) return 'tag'; }
  }
  const b = [...document.querySelectorAll('button, [role=button], [role=tab], [role=radio]')].find((x) => vis(x) && x.textContent.trim() === label && !x.closest('li'));
  return b && tag(b, 'filter') ? 'tag' : '';
};
const shows = (label, n) => {
  const it = items();
  if (it.length !== n) return false;
  if (label && !it.every((li) => txt(li).includes(label))) return false;
  return hasNumber(outsideItems(), n);
};
`;

const qt = <T>(p: PageDriver, body: string): Promise<T> => q<T>(p, body, TASKS_LIB);
const ut = (p: PageDriver, body: string, ms: number): Promise<boolean> => until(p, body, ms, TASKS_LIB);

async function openWith(p: PageDriver, tasks: readonly object[]): Promise<boolean> {
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

const expectShown = (p: PageDriver, status: string, n: number): Promise<boolean> =>
  ut(p, `return shows(${JSON.stringify(status === 'all' ? '' : LABEL[status])}, ${n});`, 1200);

export const actFeChangeRequestPack: TestPack = {
  activityId: 'act_fe_change_request',
  version: '0.1.0',
  status: 'candidate',
  entry: 'index.html',
  tests: [
    {
      id: 'output.list_follows_data', criterionKey: 'filter_in_state', layer: 'output', mode: 'automated',
      labelAr: 'القائمة الافتراضية تعرض مهام الخدمة كلها وعددها، أيًّا كانت البيانات',
      run: async (p) => {
        if (!(await openWith(p, TASKS))) return fail('عدد المهام المعروضة لا يطابق ما أرجعته الخدمة');
        const r = await qt<{ titles: boolean; count: boolean }>(p, `
          const t = items().map(txt).join(' | ');
          return { titles: ${JSON.stringify(TASKS.map((x) => x.title))}.every((x) => t.includes(x)), count: hasNumber(outsideItems(), ${TASKS.length}) };`);
        if (!r.titles) return fail('عناوين المهام المعروضة لا تطابق البيانات');
        return r.count ? pass() : fail('عدد المهام المعروضة غير ظاهر');
      },
    },
    {
      id: 'filter.control_labelled', criterionKey: 'filter_in_state', layer: 'a11y', mode: 'automated',
      labelAr: 'عنصر اختيار الحالة موجود بخياراته الأربعة وله تسمية',
      run: async (p) => {
        await openWith(p, TASKS);
        const r = await qt<{ kind: string; named: boolean }>(p, `
          const labels = ${JSON.stringify(Object.values(LABEL))};
          const sel = [...document.querySelectorAll('select')].find((s) => labels.every((l) => [...s.options].some((o) => o.textContent.trim() === l)));
          if (sel) return { kind: 'select', named: !!nameOf(sel) };
          const radios = [...document.querySelectorAll('input[type=radio]')];
          if (labels.every((l) => radios.some((r) => nameOf(r) === l))) return { kind: 'radio', named: true };
          const btns = labels.map((l) => [...document.querySelectorAll('button, [role=button], [role=tab], [role=radio]')].find((b) => b.textContent.trim() === l && !b.closest('li')));
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
        if (!(await openWith(p, TASKS))) return fail('لم تُعرض القائمة');
        const steps: [string, number][] = [['done', 4], ['new', 2], ['in_progress', 1], ['all', TASKS.length]];
        for (const [status, n] of steps) {
          if (!(await pick(p, status))) return fail('لا عنصر اختيار للحالة');
          if (!(await expectShown(p, status, n))) return fail(`المعروض بعد اختيار «${LABEL[status]}» لا يطابق المهام أو عددها`);
        }
        return pass();
      },
    },
    {
      id: 'filter.no_match_message', criterionKey: 'empty_state_correct', layer: 'output', mode: 'automated',
      labelAr: 'حالة بلا مهام تُظهر رسالة «لا مهام بهذه الحالة» لا خطأ، ثم تعود القائمة',
      run: async (p) => {
        if (!(await openWith(p, TASKS_NO_DONE))) return fail('لم تُعرض القائمة');
        if (!(await pick(p, 'done'))) return fail('لا عنصر اختيار للحالة');
        const ok = await ut(p, `return items().length === 0 && emptyShown() && /حالة/.test(txt(region())) && !errorShown() && !retryCtl();`, 1200);
        if (!ok) return fail('لم تظهر رسالة الحالة الفارغة للتصفية');
        if (!(await pick(p, 'all'))) return fail('لا عنصر اختيار للحالة');
        return (await expectShown(p, 'all', TASKS_NO_DONE.length)) ? pass() : fail('لم تعد المهام بعد اختيار «الكل»');
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
      labelAr: 'للمراجِع: فشل الخدمة يُظهر خطأ مع إعادة محاولة، والقائمة الخالية تُظهر حالة فراغ — حالتان مختلفتان',
      run: async (p) => {
        p.failRequestsTo(DATA, 'error');
        await p.open();
        await ut(p, `return !loadingShown() && (emptyShown() || errorShown());`, 2500);
        const e = await qt<{ error: boolean; retry: boolean; empty: boolean }>(p, `return { error: errorShown(), retry: !!retryCtl(), empty: emptyShown() };`);
        p.failRequestsTo(DATA, 'empty');
        await p.open();
        await ut(p, `return !loadingShown() && (emptyShown() || errorShown());`, 2500);
        const z = await qt<{ error: boolean; retry: boolean; empty: boolean }>(p, `return { error: errorShown(), retry: !!retryCtl(), empty: emptyShown() };`);
        const errOk = e.error && e.retry && !e.empty;
        const emptyOk = z.empty && !z.error && !z.retry;
        if (errOk && emptyOk) return pass();
        return fail(!errOk ? 'فشل الخدمة لا يُعرض خطأً مع إعادة محاولة' : 'القائمة الخالية لا تُعرض حالة فراغ');
      },
    },
    {
      id: 'errors.retry_recovers', criterionKey: 'js_correctness', layer: 'errors', mode: 'automated',
      labelAr: 'بعد فشل التحميل، إعادة المحاولة تعرض القائمة دون أخطاء غير معالجة',
      run: async (p) => {
        p.overrideFile(DATA, JSON.stringify(TASKS));
        p.failRequestsTo(DATA, 'error');
        await p.open();
        if (!(await ut(p, `return !!retryCtl();`, 2500))) return fail('لا زر لإعادة المحاولة بعد الفشل');
        p.failRequestsTo(DATA, 'ok');
        await qt(p, `return tag(retryCtl(), 'retry');`);
        if (!(await clickTagged(p, 'retry'))) return fail('لا زر لإعادة المحاولة بعد الفشل');
        if (!(await ut(p, `return shows('', ${TASKS.length});`, 2500))) return fail('لم تظهر القائمة بعد إعادة المحاولة');
        const clean = await qt<boolean>(p, `return !errorShown() && !loadingShown();`);
        if (!clean) return fail('بقيت رسالة خطأ أو تحميل بعد النجاح');
        return p.pageErrors().length === 0 ? pass() : fail('أخطاء غير معالجة في الصفحة');
      },
    },
    {
      id: 'data_states.loading_then_list', criterionKey: 'js_correctness', layer: 'data_states', mode: 'automated',
      labelAr: 'رسالة التحميل ظاهرة أثناء الطلب، ثم تحل محلها القائمة',
      run: async (p) => {
        p.overrideFile(DATA, JSON.stringify(TASKS));
        p.failRequestsTo(DATA, 'slow');
        await p.open();
        await p.wait(600);
        const during = await qt<boolean>(p, `return loadingShown() && items().length === 0;`);
        if (!during) return fail('لا رسالة تحميل أثناء انتظار الخدمة');
        const after = await ut(p, `return !loadingShown() && items().length === ${TASKS.length};`, 3500);
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
