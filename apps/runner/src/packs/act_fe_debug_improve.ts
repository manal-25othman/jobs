/**
 * CANDIDATE pack — act_fe_debug_improve (workshop registration page). Not approved by an expert.
 * Observes the page's behaviour after the graduate's fixes: form semantics, keyboard use, per-field validation,
 * layout at 360 and 1024 px. It cannot read the root-cause note, and it never decides a criterion a person owns.
 */
import type { PageDriver, TestPack, TestOutcomeReport } from '../pack.js';
import { MOBILE, TABLET, clickTagged, fail, pass, presence, probingReport, q, starterRetention, until } from './lib.js';

/** Page-specific isolated-world helpers: find fields and the submit control by meaning, not by the starter's ids. */
const FORM_LIB = String.raw`
const fields = () => [...document.querySelectorAll('input, textarea')].filter((i) => !/^(hidden|submit|button|reset|checkbox|radio)$/.test(i.type));
const infoOf = (i) => [nameOf(i), i.id, i.name, i.type, i.getAttribute('autocomplete') || '', i.placeholder || ''].join(' ');
const field = (kind) => {
  const re = { name: /الاسم|full.?name|\bname\b/i, email: /البريد|e-?mail|\bmail\b/i, phone: /الجوال|الهاتف|phone|\btel\b|mobile/i }[kind];
  return fields().find((i) => re.test(infoOf(i)) && !(kind === 'name' && /البريد|mail|الجوال|phone|\btel\b/i.test(infoOf(i)))) || null;
};
const submitCtl = () => {
  const form = field('email') && field('email').closest('form');
  if (form) {
    const b = [...form.querySelectorAll('button, input[type=submit]')].find((x) => x.type === 'submit');
    if (b) return b;
  }
  return innermost(/سجّليني|سجليني/);
};
const okCount = () => (document.body.innerText.match(/تم تسجيل|بنجاح|شكرًا|شكرا/g) || []).length;
const which = () => {
  const a = document.activeElement;
  if (!a || a === document.body) return 'none';
  if (a === field('name')) return 'name';
  if (a === field('email')) return 'email';
  if (a.getAttribute('data-r2-target') === 'submit') return 'submit';
  return 'other';
};
`;

const qf = <T>(p: PageDriver, body: string): Promise<T> => q<T>(p, body, FORM_LIB);
const uf = (p: PageDriver, body: string, ms: number): Promise<boolean> => until(p, body, ms, FORM_LIB);

async function fillField(p: PageDriver, kind: 'name' | 'email', value: string): Promise<boolean> {
  const found = await qf<boolean>(p, `const f = field(${JSON.stringify(kind)}); if (!f) return false; f.setAttribute('data-r2-field', ${JSON.stringify(kind)}); return true;`);
  if (!found) return false;
  await p.fill(`[data-r2-field="${kind}"]`, value);
  return true;
}

async function submit(p: PageDriver): Promise<boolean> {
  if (!(await qf<boolean>(p, `return tag(submitCtl(), 'submit');`))) return false;
  return clickTagged(p, 'submit');
}

/** Submits and waits briefly for any visible reaction (a success line or a message on the email field). */
async function submitAndSettle(p: PageDriver): Promise<{ ok: boolean; emailMsg: boolean; emailInvalid: boolean } | null> {
  const before = await qf<number>(p, `return okCount();`);
  if (!(await submit(p))) return null;
  await uf(p, `const e = field('email'); return okCount() > ${before} || !!msgFor(e) || (e && e.getAttribute('aria-invalid') === 'true');`, 800);
  return qf(p, `const e = field('email'); return { ok: okCount() > ${before}, emailMsg: !!msgFor(e), emailInvalid: !!e && e.getAttribute('aria-invalid') === 'true' };`);
}

const INVALID = ['nora@example', 'reem.example.com', 'ali@', '@example.com', 'mona @example.com', 'sara@gmail'];
const VALID = ['sara@gmail.com', 'huda.alharbi@mail.example.sa', 'n.qahtani+ws@example.org'];

async function tabWalk(p: PageDriver, onStep: (w: string) => Promise<void>): Promise<string[]> {
  await qf(p, `return tag(submitCtl(), 'submit');`);
  const seen: string[] = [];
  for (let i = 0; i < 10; i++) {
    await p.press('Tab');
    const w = await qf<string>(p, `return which();`);
    seen.push(w);
    await onStep(w);
    if (w === 'submit') break;
  }
  return seen;
}

export const actFeDebugImprovePack: TestPack = {
  activityId: 'act_fe_debug_improve',
  version: '0.1.0',
  status: 'candidate',
  entry: 'index.html',
  tests: [
    {
      id: 'semantic.form_with_submit_button', criterionKey: 'semantic_fixed', layer: 'a11y', mode: 'automated',
      labelAr: 'الحقول داخل نموذج form وزر الإرسال زر حقيقي',
      run: async (p) => {
        await p.open();
        const r = await qf<{ form: boolean; button: boolean }>(p, `
          const e = field('email'); const n = field('name'); const form = e && e.closest('form');
          const b = form && [...form.querySelectorAll('button, input[type=submit]')].find((x) => x.type === 'submit');
          return { form: !!form && !!n && n.closest('form') === form, button: !!b };`);
        return r.form && r.button ? pass() : fail(!r.form ? 'الحقول ليست داخل عنصر form واحد' : 'لا زر إرسال حقيقي داخل النموذج');
      },
    },
    {
      id: 'semantic.headings_and_table_headers', criterionKey: 'semantic_fixed', layer: 'a11y', mode: 'automated',
      labelAr: 'العناوين متسلسلة دون قفز، ولعناوين الجدول خلايا th',
      run: async (p) => {
        await p.open();
        const r = await qf<{ headings: boolean; table: boolean }>(p, `
          const tables = [...document.querySelectorAll('table')];
          const table = tables.every((t) => { const row = t.querySelector('tr'); return !!row && row.children.length > 0 && [...row.children].every((c) => c.tagName === 'TH'); });
          return { headings: headingsOrdered(), table };`);
        if (r.headings && r.table) return pass();
        return fail([!r.headings ? 'تسلسل العناوين غير مرتب' : '', !r.table ? 'صف عناوين الجدول بلا خلايا th' : ''].filter(Boolean).join(' · '));
      },
    },
    {
      id: 'a11y.fields_have_labels', criterionKey: 'a11y_keyboard_forms', layer: 'a11y', mode: 'automated',
      labelAr: 'لكل حقل تسمية مرتبطة به (لا يكفي النص المؤقت)',
      run: async (p) => {
        await p.open();
        const r = await qf<{ total: number; unnamed: number }>(p, `const fs = fields().filter(vis); return { total: fs.length, unnamed: fs.filter((f) => !nameOf(f)).length };`);
        return r.total > 0 && r.unnamed === 0 ? pass() : fail(`حقول بلا تسمية: ${r.unnamed} من ${r.total}`);
      },
    },
    {
      id: 'a11y.keyboard_reaches_submit', criterionKey: 'a11y_keyboard_forms', layer: 'a11y', mode: 'automated',
      labelAr: 'لوحة المفاتيح وحدها تصل إلى الحقول ثم زر الإرسال، وEnter يرسل',
      run: async (p) => {
        await p.open();
        const seen = await tabWalk(p, async () => undefined);
        const order = ['name', 'email', 'submit'].map((k) => seen.indexOf(k));
        if (order.some((i) => i < 0) || !(order[0]! < order[1]! && order[1]! < order[2]!)) return fail('زر الإرسال أو أحد الحقول لا يصله Tab بالترتيب');
        await p.press('Enter');
        const reacted = await uf(p, `return okCount() > 0 || !!msgFor(field('name')) || !!msgFor(field('email')) || [...document.querySelectorAll('[aria-invalid="true"]')].length > 0;`, 800);
        return reacted ? pass() : fail('Enter على زر الإرسال لم يُحدث استجابة ظاهرة');
      },
    },
    {
      id: 'a11y.focus_visible_on_controls', criterionKey: 'a11y_keyboard_forms', layer: 'a11y', mode: 'automated',
      labelAr: 'التركيز ظاهر على الحقول وزر الإرسال عند التنقل بلوحة المفاتيح',
      run: async (p) => {
        await p.open();
        const checked: { w: string; visible: boolean }[] = [];
        await tabWalk(p, async (w) => {
          if ((w === 'name' || w === 'email' || w === 'submit') && !checked.some((c) => c.w === w)) checked.push({ w, visible: Boolean((await p.focused())?.outlineVisible) });
        });
        const hidden = checked.filter((c) => !c.visible).length;
        const ok = checked.some((c) => c.w === 'name') && checked.some((c) => c.w === 'email') && hidden === 0;
        return ok ? pass() : fail(`عناصر بلا تركيز ظاهر: ${hidden} من ${checked.length}`);
      },
    },
    {
      id: 'a11y.field_errors_linked', criterionKey: 'a11y_keyboard_forms', layer: 'a11y', mode: 'automated',
      labelAr: 'رسالة خطأ الحقل مرتبطة به (aria-describedby) والحقل معلَّم aria-invalid',
      run: async (p) => {
        await p.open();
        if (!(await fillField(p, 'name', 'سارة')) || !(await fillField(p, 'email', 'reem.example.com'))) return fail('لم يُعثر على حقلي الاسم والبريد');
        if (!(await submitAndSettle(p))) return fail('لم يُعثر على زر الإرسال');
        const r = await qf<{ invalid: boolean; linked: boolean }>(p, `const e = field('email'); return { invalid: e.getAttribute('aria-invalid') === 'true', linked: !!linkedMsg(e) };`);
        if (r.invalid && r.linked) return pass();
        return fail([!r.linked ? 'الرسالة غير مرتبطة بالحقل' : '', !r.invalid ? 'الحقل غير معلَّم بأنه غير صالح' : ''].filter(Boolean).join(' · '));
      },
    },
    {
      id: 'validation.invalid_addresses_refused', criterionKey: 'validation_fixed', layer: 'functional', mode: 'automated',
      labelAr: 'عناوين بريد غير صالحة متنوعة تُرفض برسالة عند الحقل',
      run: async (p) => {
        await p.open();
        if (!(await fillField(p, 'name', 'سارة'))) return fail('لم يُعثر على حقل الاسم');
        for (let i = 0; i < INVALID.length; i++) {
          if (!(await fillField(p, 'email', INVALID[i]!))) return fail('لم يُعثر على حقل البريد');
          const r = await submitAndSettle(p);
          if (!r) return fail('لم يُعثر على زر الإرسال');
          if (r.ok) return fail(`قُبلت قيمة غير صالحة (${i + 1} من ${INVALID.length})`);
          if (!r.emailMsg) return fail(`لا رسالة عند الحقل بعد إرسال قيمة غير صالحة (${i + 1} من ${INVALID.length})`);
        }
        return pass();
      },
    },
    {
      id: 'validation.common_addresses_accepted', criterionKey: 'validation_fixed', layer: 'functional', mode: 'automated',
      labelAr: 'عناوين بريد صالحة شائعة تُقبل',
      run: async (p) => {
        for (let i = 0; i < VALID.length; i++) {
          await p.open();
          if (!(await fillField(p, 'name', 'هدى')) || !(await fillField(p, 'email', VALID[i]!))) return fail('لم يُعثر على حقلي الاسم والبريد');
          const r = await submitAndSettle(p);
          if (!r) return fail('لم يُعثر على زر الإرسال');
          if (!r.ok) return fail(`لم يُقبل عنوان صالح (${i + 1} من ${VALID.length})`);
        }
        return p.pageErrors().length === 0 ? pass() : fail('أخطاء غير معالجة في الصفحة');
      },
    },
    {
      id: 'form.per_field_messages_when_empty', criterionKey: 'form_submission_flow', layer: 'errors', mode: 'automated',
      labelAr: 'إرسال النموذج فارغًا: لا إرسال، ولكل حقل مطلوب رسالته',
      run: async (p) => {
        await p.open();
        if (!(await submit(p))) return fail('لم يُعثر على زر الإرسال');
        await uf(p, `return !!msgFor(field('name')) && !!msgFor(field('email'));`, 800);
        const r = await qf<{ ok: boolean; name: boolean; email: boolean }>(p, `return { ok: okCount() > 0, name: !!msgFor(field('name')), email: !!msgFor(field('email')) };`);
        if (r.ok) return fail('أُرسل النموذج وحقوله المطلوبة فارغة');
        return r.name && r.email ? pass() : fail('لا رسالة خاصة بكل حقل مطلوب');
      },
    },
    {
      id: 'form.values_kept_and_error_clears', criterionKey: 'form_submission_flow', layer: 'usability', mode: 'automated',
      labelAr: 'ما أدخله المستخدم يبقى بعد الرفض، ورسالة الحقل تزول بعد تصحيحه',
      run: async (p) => {
        await p.open();
        if (!(await fillField(p, 'name', 'سارة')) || !(await fillField(p, 'email', 'sara.example.com'))) return fail('لم يُعثر على حقلي الاسم والبريد');
        const first = await submitAndSettle(p);
        if (!first) return fail('لم يُعثر على زر الإرسال');
        if (first.ok || !(first.emailMsg || first.emailInvalid)) return fail('لم يظهر رفض واضح لقيمة غير صالحة');
        const kept = await qf<boolean>(p, `return field('name').value === 'سارة' && field('email').value === 'sara.example.com';`);
        if (!kept) return fail('ضاع ما أدخله المستخدم بعد الرفض');
        await fillField(p, 'email', 'sara@example.com');
        const second = await submitAndSettle(p);
        if (!second?.ok) return fail('لم يُقبل النموذج بعد التصحيح');
        const cleared = await qf<boolean>(p, `const e = field('email'); return !linkedMsg(e) && !nearMsg(e) && e.getAttribute('aria-invalid') !== 'true';`);
        return cleared ? pass() : fail('بقيت رسالة الخطأ بعد التصحيح');
      },
    },
    {
      id: 'responsive.page_width_360', criterionKey: 'responsive_fixed', layer: 'responsive', mode: 'automated',
      labelAr: 'لا محتوى يتجاوز عرض الشاشة على 360 بكسل',
      run: async (p) => {
        await p.open(undefined, MOBILE);
        const m = await p.layout();
        const o = await q<{ count: number; worst: number }>(p, `return overflowReport();`);
        const note = `عرض المحتوى ${m.contentWidth} على شاشة ${m.viewportWidth}؛ عناصر تتجاوز الشاشة: ${o.count}`;
        return m.contentWidth <= m.viewportWidth && o.count === 0 ? pass(note) : fail(note);
      },
    },
    {
      id: 'responsive.schedule_reachable_360', criterionKey: 'responsive_fixed', layer: 'responsive', mode: 'automated',
      labelAr: 'كل أعمدة جدول الورشة ظاهرة أو قابلة للتمرير داخل حاويتها على 360 بكسل',
      run: async (p) => {
        await p.open(undefined, MOBILE);
        const r = await q<{ missing: number; total: number }>(p, `
          const vw = document.documentElement.clientWidth;
          const labels = ['اليوم', 'الوقت', 'الموضوع', 'المدرّبة', 'القاعة', 'د. هيا العتيبي'];
          const scrollable = (el) => { for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
          const leaves = [...document.body.querySelectorAll('*')].filter((e) => e.children.length === 0);
          let missing = 0;
          for (const l of labels) {
            const el = leaves.find((e) => (e.textContent || '').trim() === l && vis(e));
            if (!el) { missing++; continue; }
            const r = el.getBoundingClientRect();
            if (!(r.left >= -1 && r.right <= vw + 1) && !scrollable(el)) missing++;
          }
          return { missing, total: labels.length };`);
        return r.missing === 0 ? pass() : fail(`عناصر من الجدول لا يمكن رؤيتها: ${r.missing} من ${r.total}`);
      },
    },
    {
      id: 'responsive.sidebar_beside_1024', criterionKey: 'responsive_fixed', layer: 'responsive', mode: 'automated',
      labelAr: 'العمود الجانبي بجانب المحتوى على عرض 1024 بكسل',
      run: async (p) => {
        await p.open(undefined, TABLET);
        const m = await p.layout();
        const r = await q<{ found: boolean; beside: boolean }>(p, `
          const side = [...document.body.querySelectorAll('*')].find((e) => e.children.length === 0 && (e.textContent || '').trim() === 'معلومات سريعة');
          const h1 = document.querySelector('h1');
          if (!side || !h1) return { found: false, beside: false };
          let lca = side.parentElement; while (lca && !lca.contains(h1)) lca = lca.parentElement;
          if (!lca) return { found: false, beside: false };
          const childOf = (el) => { let c = el; while (c.parentElement !== lca) c = c.parentElement; return c; };
          const a = childOf(side).getBoundingClientRect(); const b = childOf(h1).getBoundingClientRect();
          const apart = a.left >= b.right - 1 || a.right <= b.left + 1;
          const overlapY = a.top < b.bottom && b.top < a.bottom;
          return { found: true, beside: apart && overlapY };`);
        const ok = r.found && r.beside && m.contentWidth <= m.viewportWidth;
        return ok ? pass() : fail(!r.found ? 'لم يُعثر على العمود الجانبي' : 'العمود الجانبي ليس بجانب المحتوى');
      },
    },
  ],
  staticChecks: [
    {
      id: 'quality.starter_lines_kept', criterionKey: 'scope_discipline', layer: 'quality', mode: 'supports_human',
      labelAr: 'حجم التغيير مقارنة بملفات البداية (للمراجِع: إصلاح لا إعادة كتابة)',
      run: (files, starter): TestOutcomeReport => {
        const r = starterRetention(files, starter, ['index.html', 'styles.css', 'app.js']);
        const note = `بقي ${Math.round(r.ratio * 100)}% من أسطر البداية (${r.kept} من ${r.total})`;
        return r.ratio >= 0.4 ? pass(note) : fail(note);
      },
    },
    {
      id: 'gaming.environment_probing', criterionKey: 'scope_discipline', layer: 'gaming', mode: 'supports_human',
      labelAr: 'لا فحص لبيئة التشغيل ولا تعديل لواجهات الصفحة العامة',
      run: (files, starter) => probingReport(files, starter),
    },
    {
      id: 'quality.source_files_present', criterionKey: 'deliverables_complete', layer: 'quality', mode: 'automated',
      labelAr: 'الملفات الثلاثة موجودة',
      run: (files) => presence(files, ['index.html', 'styles.css', 'app.js']),
    },
  ],
  humanOnlyCriteria: [
    { criterionKey: 'root_cause_note', whyAr: 'جودة ملاحظة الأسباب الجذرية نص يقرؤه شخص؛ سلوك الصفحة لا يُظهر هل سُمّي السبب أم العَرَض.' },
  ],
};
