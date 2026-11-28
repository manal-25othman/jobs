/**
 * CANDIDATE pack — act_fe_debug_improve (workshop registration page). Not approved by an expert.
 * Observes the page's behaviour after the graduate's fixes: form semantics, keyboard use, per-field validation,
 * layout on phone and wide screens. It cannot read the root-cause note, and it never decides a criterion a person owns.
 * 0.2.0: the page has no data file, so its input varies instead: one page load receives several registrations with
 * different names and addresses, and each verdict must follow its own input.
 * 0.3.0: every name, address and viewport width is generated per run from the attempt seed (classes of invalid
 * address, not a list of values); success is recognised by what changed after the submit (any success wording or a
 * live status region), not by one sentence; a test whose precondition never appears (no reaction to a submit, an
 * invalid value accepted) is not applicable instead of failing a second criterion; stale-state checks moved from
 * validation to the form flow they measure.
 */
import type { PageDriver, TestPack, TestOutcomeReport, Viewport } from '../pack.js';
import {
  INVALID_CLASSES, clickTagged, fail, int, invalidEmail, mobileWidths, notApplicable, pass, personName, presence, probingReport, q, rng,
  shuffle, starterRetention, until, validEmail,
} from './lib.js';

/**
 * Page-specific isolated-world helpers: fields and the submit control by meaning (not the starter's ids), and what a
 * submit changed. A MutationObserver in the isolated world records the nodes the page touched after the submit, so a
 * success line counts only when it is new, whatever its wording (or a live status region with non-error text).
 */
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
  return innermost(/سجّليني|سجليني|سجّلني|سجلني/);
};
const SUCCESS_RE = /سجل(ت|نا|ك)|تسجيلك|اكتمل|تاكيد|استلم|مرحب|اهلا|نراك|بانتظارك|شكر|نجاح|(^|[^ء-ي])تم([^ء-ي]|$)|تمت|success|thank|registered|welcome/;
const FAIL_RE = /غير صالح|غير صحيح|خطا|تعذر|يرجي|رجاء|اكتب|ادخل|مطلوب|فشل|تحقق|تاكد|تصحيح|راجع|بحاجه|لم يتم|لم نتمكن|ناقص|invalid|error|required|please|check/;
const isCtl = (e) => !!e.closest('button, label, select, option, input, textarea, [role=button], a, script, style');
const innermostOf = (c) => c.filter((e) => !c.some((o) => o !== e && e.contains(o)));
const successEls = () => {
  const worded = [...document.body.querySelectorAll('*')].filter((e) => vis(e) && !isCtl(e))
    .filter((e) => { const t = fold(txt(e)); return t.length >= 2 && t.length <= 240 && SUCCESS_RE.test(t) && !FAIL_RE.test(t); });
  const live = [...document.querySelectorAll('[role=status], [role=alert], [aria-live], output')]
    .filter((e) => vis(e) && !e.querySelector('input, select, textarea, button'))
    .filter((e) => { const t = fold(txt(e)); return t.length >= 4 && t.length <= 240 && !FAIL_RE.test(t); });
  return innermostOf([...new Set([...worded, ...live])]);
};
const r2 = (window.__r2form = window.__r2form || { touched: [], base: null, obs: null });
const note = (m) => {
  if (m.type === 'characterData') r2.touched.push(m.target.parentElement);
  else if (m.type === 'attributes') r2.touched.push(m.target);
  else { for (const n of m.addedNodes) r2.touched.push(n.nodeType === 1 ? n : m.target); if (!m.addedNodes.length) r2.touched.push(m.target); }
};
const arm = () => {
  if (r2.obs) r2.obs.disconnect();
  r2.touched = [];
  r2.obs = new MutationObserver((ms) => ms.forEach(note));
  r2.obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'aria-invalid', 'open'] });
  if (r2.base === null) r2.base = successEls().map(txt);
  return true;
};
const flush = () => { if (r2.obs) r2.obs.takeRecords().forEach(note); };
const touchedHit = (el) => { flush(); return r2.touched.some((t) => t && (t === el || el.contains(t) || (t.contains(el) && !t.querySelector('input, textarea, select')))); };
/* A success line (any wording) or a live status message that the page wrote after the last submit. */
const okNew = () => successEls().some(touchedHit);
/* A success line still on the page that was not there when it opened (stale after a later rejection). */
const okVisible = () => successEls().map(txt).filter((t) => !(r2.base || []).includes(t)).length > 0;
/* Anything visible the page changed after the submit (a message, a marked field): the submit was handled at all. */
const reacted = () => { flush(); return okNew() || fields().some((f) => f.getAttribute('aria-invalid') === 'true')
  || r2.touched.some((t) => t && t.nodeType === 1 && vis(t) && !t.closest('button, input, select, textarea, option, script, style') && fold(txt(t)).length > 0); };
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
  if (!(await qf<boolean>(p, `arm(); return tag(submitCtl(), 'submit');`))) return false;
  return clickTagged(p, 'submit');
}

interface Settled { ok: boolean; emailMsg: boolean; emailInvalid: boolean; reacted: boolean }
/** Submits and waits briefly for any visible reaction (a new success line, a message or mark on the email field). */
async function submitAndSettle(p: PageDriver): Promise<Settled | null> {
  if (!(await submit(p))) return null;
  await uf(p, `const e = field('email'); return okNew() || !!msgFor(e) || (e && e.getAttribute('aria-invalid') === 'true');`, 800);
  await p.wait(80);
  return qf<Settled>(p, `const e = field('email'); return { ok: okNew(), emailMsg: !!msgFor(e), emailInvalid: !!e && e.getAttribute('aria-invalid') === 'true', reacted: reacted() };`);
}

const NO_REACTION = 'لا استجابة ظاهرة لأي إرسال، فلا حكم هنا (زر الإرسال يُقاس في البنية الدلالية)';
const seq = (p: PageDriver, salt: string) => rng(p.seed, `debug_improve/${salt}`);
const at = (i: number, n: number) => `(${i + 1} من ${n})`;

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

/** Runs `check` at every viewport; the first failing width is reported. */
async function atWidths(p: PageDriver, widths: readonly Viewport[], check: (v: Viewport) => Promise<TestOutcomeReport>): Promise<TestOutcomeReport> {
  let last: TestOutcomeReport = pass();
  for (const v of widths) {
    await p.open(undefined, v);
    last = await check(v);
    if (!last.pass) return last;
  }
  return pass(`نجح على ${widths.length} عروض: ${widths.map((v) => v.width).join('، ')}`);
}

export const actFeDebugImprovePack: TestPack = {
  activityId: 'act_fe_debug_improve',
  version: '0.3.0',
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
        await qf(p, `return arm();`);
        await p.press('Enter');
        const reactedNow = await uf(p, `return reacted();`, 800);
        return reactedNow ? pass() : fail('Enter على زر الإرسال لم يُحدث استجابة ظاهرة');
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
      labelAr: 'رسالة خطأ الحقل مرتبطة به (aria-describedby أو aria-errormessage) والحقل معلَّم aria-invalid',
      run: async (p) => {
        const r0 = seq(p, 'linked');
        await p.open();
        if (!(await fillField(p, 'name', personName(r0))) || !(await fillField(p, 'email', invalidEmail(r0, 'no_at')))) return fail('لم يُعثر على حقلي الاسم والبريد');
        const s = await submitAndSettle(p);
        if (!s) return fail('لم يُعثر على زر الإرسال');
        if (!s.reacted) return notApplicable(NO_REACTION);
        if (s.ok) return notApplicable('قُبل عنوان بلا @، فلا رسالة خطأ تُفحص هنا (يُحسب في التحقق)');
        const r = await qf<{ invalid: boolean; linked: boolean }>(p, `const e = field('email'); return { invalid: e.getAttribute('aria-invalid') === 'true', linked: !!linkedMsg(e) };`);
        if (r.invalid && r.linked) return pass();
        return fail([!r.linked ? 'الرسالة غير مرتبطة بالحقل' : '', !r.invalid ? 'الحقل غير معلَّم بأنه غير صالح' : ''].filter(Boolean).join(' · '));
      },
    },
    {
      id: 'validation.invalid_addresses_refused', criterionKey: 'validation_fixed', layer: 'functional', mode: 'automated',
      labelAr: 'عناوين بريد غير صالحة من ستة أنواع (تتولّد في كل تشغيل) تُرفض برسالة عند الحقل',
      run: async (p) => {
        const r0 = seq(p, 'invalid');
        const kinds = shuffle(r0, INVALID_CLASSES);
        await p.open();
        if (!(await fillField(p, 'name', personName(r0)))) return fail('لم يُعثر على حقل الاسم');
        let anyReaction = false;
        for (let i = 0; i < kinds.length; i++) {
          if (!(await fillField(p, 'email', invalidEmail(r0, kinds[i]!)))) return fail('لم يُعثر على حقل البريد');
          const r = await submitAndSettle(p);
          if (!r) return fail('لم يُعثر على زر الإرسال');
          if (!r.reacted && !anyReaction) return notApplicable(NO_REACTION);
          anyReaction = true;
          if (r.ok) return fail(`قُبلت قيمة غير صالحة ${at(i, kinds.length)}`);
          if (!r.emailMsg) return fail(`لا رسالة عند الحقل بعد إرسال قيمة غير صالحة ${at(i, kinds.length)}`);
        }
        return pass();
      },
    },
    {
      id: 'validation.common_addresses_accepted', criterionKey: 'validation_fixed', layer: 'functional', mode: 'automated',
      labelAr: 'عناوين بريد صالحة شائعة (تتولّد في كل تشغيل) تُقبل',
      run: async (p) => {
        const r0 = seq(p, 'valid');
        const n = 3;
        for (let i = 0; i < n; i++) {
          await p.open();
          if (!(await fillField(p, 'name', personName(r0))) || !(await fillField(p, 'email', validEmail(r0)))) return fail('لم يُعثر على حقلي الاسم والبريد');
          const r = await submitAndSettle(p);
          if (!r) return fail('لم يُعثر على زر الإرسال');
          if (!r.reacted && i === 0) return notApplicable(NO_REACTION);
          if (!r.ok) return fail(`لم يُقبل عنوان صالح ${at(i, n)}`);
        }
        return p.pageErrors().length === 0 ? pass() : fail('أخطاء غير معالجة في الصفحة');
      },
    },
    {
      id: 'validation.each_submission_follows_input', criterionKey: 'validation_fixed', layer: 'functional', mode: 'automated',
      labelAr: 'تسجيلات متتالية بأسماء وعناوين مختلفة (تتولّد في كل تشغيل) دون إعادة فتح الصفحة: كل قرار قبول أو رفض يتبع ما أُدخل',
      run: async (p) => {
        const r0 = seq(p, 'sequence');
        const kinds = shuffle(r0, INVALID_CLASSES);
        const steps = [true, false, true, false, true, false].map((ok, i) => ({ ok, name: personName(r0), email: ok ? validEmail(r0) : invalidEmail(r0, kinds[i % kinds.length]!) }));
        await p.open();
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]!;
          if (!(await fillField(p, 'name', step.name)) || !(await fillField(p, 'email', step.email))) return fail(`لم يُعثر على حقلي الاسم والبريد ${at(i, steps.length)}`);
          const r = await submitAndSettle(p);
          if (!r) return fail('لم يُعثر على زر الإرسال');
          if (!r.reacted && i === 0) return notApplicable(NO_REACTION);
          if (step.ok && !r.ok) return fail(`لم يُقبل تسجيل صالح ${at(i, steps.length)}`);
          if (!step.ok && r.ok) return fail(`قُبلت قيمة غير صالحة ${at(i, steps.length)}`);
          if (!step.ok && !r.emailMsg) return fail(`لا رسالة عند الحقل بعد إرسال قيمة غير صالحة ${at(i, steps.length)}`);
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
        await p.wait(80);
        const r = await qf<{ ok: boolean; name: boolean; email: boolean; reacted: boolean }>(p, `return { ok: okNew(), name: !!msgFor(field('name')), email: !!msgFor(field('email')), reacted: reacted() };`);
        if (!r.reacted) return notApplicable(NO_REACTION);
        if (r.ok) return fail('أُرسل النموذج وحقوله المطلوبة فارغة');
        return r.name && r.email ? pass() : fail('لا رسالة خاصة بكل حقل مطلوب');
      },
    },
    {
      id: 'form.values_kept_and_error_clears', criterionKey: 'form_submission_flow', layer: 'usability', mode: 'automated',
      labelAr: 'بعد الرفض يبقى ما أُدخل، وبعد التصحيح تزول رسالة الحقل ويُقبل، وبعد رفض لاحق لا تبقى رسالة النجاح السابقة',
      run: async (p) => {
        const r0 = seq(p, 'flow');
        const name = personName(r0); const bad = invalidEmail(r0, 'no_at'); const good = validEmail(r0);
        await p.open();
        if (!(await fillField(p, 'name', name)) || !(await fillField(p, 'email', bad))) return fail('لم يُعثر على حقلي الاسم والبريد');
        const first = await submitAndSettle(p);
        if (!first) return fail('لم يُعثر على زر الإرسال');
        if (!first.reacted) return notApplicable(NO_REACTION);
        if (first.ok) return notApplicable('قُبل عنوان بلا @، فلا رفض يُختبر بعده (يُحسب في التحقق)');
        const kept = await qf<boolean>(p, `return field('name').value === ${JSON.stringify(name)} && field('email').value === ${JSON.stringify(bad)};`);
        if (!kept) return fail('ضاع ما أدخله المستخدم بعد الرفض');
        await fillField(p, 'email', good);
        const second = await submitAndSettle(p);
        if (!second?.ok) {
          // Is the corrected address refused by the validation rule itself? Then this is validation's defect, not the flow's.
          await p.open();
          await fillField(p, 'name', name); await fillField(p, 'email', good);
          const fresh = await submitAndSettle(p);
          return fresh?.ok ? fail('لم يُقبل النموذج بعد التصحيح مع أن العنوان نفسه يُقبل في صفحة جديدة') : notApplicable('العنوان المصحَّح يُرفض حتى في صفحة جديدة (يُحسب في التحقق)');
        }
        const cleared = await qf<boolean>(p, `const e = field('email'); return !linkedMsg(e) && !nearMsg(e) && e.getAttribute('aria-invalid') !== 'true';`);
        if (!cleared) return fail('بقيت رسالة الخطأ بعد التصحيح');
        await fillField(p, 'name', personName(r0));
        await fillField(p, 'email', invalidEmail(r0, 'no_local'));
        const third = await submitAndSettle(p);
        if (!third || third.ok) return pass();
        return (await qf<boolean>(p, `return okVisible();`)) ? fail('بقيت رسالة النجاح السابقة ظاهرة بعد رفض قيمة غير صالحة') : pass();
      },
    },
    {
      id: 'responsive.page_width_mobile_range', criterionKey: 'responsive_fixed', layer: 'responsive', mode: 'automated',
      labelAr: 'لا محتوى يتجاوز عرض الشاشة على عروض جوال متعددة (360 وعرضان آخران بين 340 و430 بكسل)',
      run: async (p) => atWidths(p, mobileWidths(seq(p, 'mobile')), async (v) => {
        const m = await p.layout();
        const o = await q<{ count: number; worst: number }>(p, `return overflowReport();`);
        const note = `على عرض ${v.width}: عرض المحتوى ${m.contentWidth}؛ عناصر تتجاوز الشاشة: ${o.count}`;
        return m.contentWidth <= m.viewportWidth && o.count === 0 ? pass(note) : fail(note);
      }),
    },
    {
      id: 'responsive.schedule_reachable_mobile_range', criterionKey: 'responsive_fixed', layer: 'responsive', mode: 'automated',
      labelAr: 'كل أعمدة جدول الورشة ظاهرة أو قابلة للتمرير داخل حاويتها على عروض جوال متعددة',
      run: async (p) => atWidths(p, mobileWidths(seq(p, 'schedule')), async (v) => {
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
        return r.missing === 0 ? pass() : fail(`على عرض ${v.width}: عناصر من الجدول لا يمكن رؤيتها: ${r.missing} من ${r.total}`);
      }),
    },
    {
      id: 'responsive.sidebar_beside_wide_range', criterionKey: 'responsive_fixed', layer: 'responsive', mode: 'automated',
      labelAr: 'العمود الجانبي بجانب المحتوى على 1024 بكسل وعلى عرضين أوسع (يتغيّران في كل تشغيل)',
      run: async (p) => {
        const r0 = seq(p, 'wide');
        const widths: Viewport[] = [1024, int(r0, 1025, 1279), int(r0, 1280, 1440)].map((width) => ({ width, height: int(r0, 700, 900) }));
        return atWidths(p, widths, async (v) => {
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
          return ok ? pass() : fail(!r.found ? 'لم يُعثر على العمود الجانبي' : `على عرض ${v.width}: العمود الجانبي ليس بجانب المحتوى`);
        });
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
