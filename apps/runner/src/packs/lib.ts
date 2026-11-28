/**
 * Shared helpers for the junior-frontend candidate packs. Everything here either builds an expression for the
 * ISOLATED world (`PageDriver.inspect` / `waitFor`) or reads submitted source TEXT for a static check. Nothing runs
 * in the page's main world, and nothing here carries a value the graduate's page could read.
 */
import type { SubmittedFile } from '@naqla/domain';
import type { PageDriver, TestOutcomeReport, Viewport } from '../pack.js';
import { gamingSignals } from '../gaming.js';

export const MOBILE: Viewport = { width: 360, height: 740 };
export const TABLET: Viewport = { width: 1024, height: 768 };

/* ───────────────────────────── varied inputs (0.3.0) ───────────────────────────── */

/** Deterministic PRNG (mulberry32) for one attempt seed, salted per test so tests do not share one stream. */
export function rng(seed: number, salt: string): () => number {
  let a = seed >>> 0;
  for (let i = 0; i < salt.length; i++) a = Math.imul(a ^ salt.charCodeAt(i), 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rand = () => number;
export const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
export const one = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
export function shuffle<T>(r: Rand, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/**
 * Several viewports inside a RANGE around the width the brief names, not the single announced width: the named width
 * itself, one below and one above it (seeded). Layout written for one exact width passes at most one of them.
 */
export function widthsAround(r: Rand, named: number, below: readonly [number, number], above: readonly [number, number], height: number): Viewport[] {
  return [named, int(r, below[0], below[1]), int(r, above[0], above[1])].map((width) => ({ width, height: height + int(r, -60, 60) }));
}
export const mobileWidths = (r: Rand): Viewport[] => widthsAround(r, 360, [340, 358], [362, 430], 740);

const AR_FIRST = ['منى', 'سارة', 'ريم', 'نورة', 'هيا', 'لمى', 'جود', 'رهف', 'دانة', 'غادة', 'أسيل', 'شهد', 'عبير', 'منيرة', 'ليان', 'هند', 'فهد', 'خالد', 'سعد', 'ماجد', 'بدر', 'تركي', 'يزيد', 'وليد', 'عبدالله', 'سلمان', 'عمر', 'نواف'];
const AR_FAMILY = ['الشهري', 'القحطاني', 'العتيبي', 'الحربي', 'الغامدي', 'الزهراني', 'المطيري', 'الدوسري', 'الشمري', 'العنزي', 'السبيعي', 'القرني', 'البلوي', 'الجهني', 'الرشيدي'];
const LAT_FIRST = ['Sara', 'Rana', 'Lina', 'Noor', 'Huda', 'Maha', 'Omar', 'Faisal', 'Yousef', 'Tariq', 'Reem', 'Dana'];
const LAT_FAMILY = ['Saleh', 'Alharbi', 'Qahtani', 'Alotaibi', 'Hassan', 'Nasser', 'Ghamdi', 'Rashed'];
const LAT_LOCAL = ['sara', 'rana', 'lina', 'noor', 'huda', 'maha', 'omar', 'faisal', 'yousef', 'tariq', 'reem', 'dana', 'alanoud', 'abeer', 'nawaf'];
const DOMAIN = ['example', 'mail', 'inbox', 'post', 'webmail', 'my-mail', 'office'];
const TLD = ['com', 'net', 'org', 'sa', 'co', 'info', 'com.sa', 'edu.sa'];

/** A plausible person name: Arabic (one or two parts) or Latin. */
export function personName(r: Rand): string {
  const k = r();
  if (k < 0.45) return `${one(r, AR_FIRST)} ${one(r, AR_FAMILY)}`;
  if (k < 0.65) return one(r, AR_FIRST);
  return `${one(r, LAT_FIRST)} ${one(r, LAT_FAMILY)}`;
}
const local = (r: Rand): string => {
  const a = one(r, LAT_LOCAL); const k = r();
  return k < 0.3 ? a : k < 0.55 ? `${a}.${one(r, LAT_LOCAL)}` : k < 0.75 ? `${a}${int(r, 1, 99)}` : k < 0.9 ? `${a}_${one(r, LAT_LOCAL)}` : `${a}-${one(r, LAT_LOCAL)}`;
};
const host = (r: Rand): string => (r() < 0.25 ? `${one(r, ['mx', 'team', 'hr', 'students'])}.` : '') + one(r, DOMAIN);

/** A common valid address (dots, digits, `_`, `-`, `+tag`, sub-domains, two-part TLDs). */
export function validEmail(r: Rand): string {
  const tag = r() < 0.2 ? `+${one(r, ['ws', 'events', 'news'])}` : '';
  return `${local(r)}${tag}@${host(r)}.${one(r, TLD)}`;
}

/** The classes of invalid address every reasonable rule rejects; one fresh value per class and run. */
export const INVALID_CLASSES = ['no_at', 'no_local', 'no_domain', 'no_dot_domain', 'space', 'double_at'] as const;
export function invalidEmail(r: Rand, kind: (typeof INVALID_CLASSES)[number]): string {
  const l = local(r); const h = host(r); const t = one(r, TLD);
  switch (kind) {
    case 'no_at': return `${l}.${h}.${t}`;
    case 'no_local': return `@${h}.${t}`;
    case 'no_domain': return `${l}@`;
    case 'no_dot_domain': return `${l}@${one(r, DOMAIN)}`;
    case 'space': return `${l} ${one(r, LAT_LOCAL)}@${h}.${t}`;
    case 'double_at': return `${l}@@${h}.${t}`;
  }
}

/**
 * Helpers defined inside every isolated-world expression. They only read the shared DOM (and, to let the trusted
 * driver click a control it found semantically, set a neutral `data-r2-target` attribute on it).
 */
const DOM_LIB = String.raw`
const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const txt = (el) => ((el && el.innerText) || '').replace(/\s+/g, ' ').trim();
const nameOf = (el) => {
  if (!el) return '';
  const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
    .map((id) => document.getElementById(id)).filter(Boolean).map((e) => e.textContent).join(' ');
  const labels = el.labels ? [...el.labels].map((l) => l.textContent).join(' ') : '';
  return (by || el.getAttribute('aria-label') || labels || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
};
const tag = (el, key) => {
  document.querySelectorAll('[data-r2-target="' + key + '"]').forEach((e) => e.removeAttribute('data-r2-target'));
  if (!el) return false;
  el.setAttribute('data-r2-target', key);
  return true;
};
const innermost = (re, root) => {
  const all = [...(root || document.body).querySelectorAll('*')].filter((e) => vis(e) && re.test(e.textContent || e.value || ''));
  return all.filter((e) => ![...e.children].some((c) => all.includes(c)))[0] || null;
};
const realButton = (el) => !!el && (el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && /^(button|submit)$/.test(el.type))
  || (el.getAttribute('role') === 'button' && el.tabIndex >= 0));
const findButton = (re) => [...document.querySelectorAll('button, input[type=button], input[type=submit], [role=button]')]
  .find((b) => vis(b) && re.test(b.textContent || b.value || '')) || null;
const idsOf = (el, attr) => (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)).filter(Boolean);
const describedBy = (el) => [...idsOf(el, 'aria-describedby'), ...idsOf(el, 'aria-errormessage')];
const linkedMsg = (el) => (el ? describedBy(el).map(txt).join(' ').trim() : '');
/* Folded text for matching wording, not format: Latin digits, no tashkeel / tatweel / bidi marks, one alef, ى→ي, ة→ه. */
const digitsLatin = (s) => String(s || '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
const fold = (s) => digitsLatin(s).replace(/[\u064B-\u0652\u0670\u0640]/g, '').replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
/* Accessible name of a control (role + name lookup): aria-labelledby, aria-label, the value of an input button, text, title. */
const accName = (el) => {
  if (!el) return '';
  const by = idsOf(el, 'aria-labelledby').map((e) => e.textContent).join(' ');
  const own = el.tagName === 'INPUT' ? el.value : (el.textContent || '');
  return (by || el.getAttribute('aria-label') || own || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
};
const CONTROL_SEL = 'button, input[type=button], input[type=submit], input[type=reset], a[href], [role=button], [role=link], [role=menuitem]';
const controls = (root) => [...(root || document).querySelectorAll(CONTROL_SEL)].filter(vis);
/* Retry, by role and name with its usual synonyms (folded): إعادة المحاولة/التحميل، أعيدي، حاولي (مجددًا)، مرة أخرى، Retry. */
const RETRY_RE = /اعاد[هت]\s*(ال)?(محاول|تحميل|طلب|جلب|اتصال)|اعيد|حاول|مر[هت] اخر|retry|try again|reload/;
const retryControl = (root) => controls(root).find((b) => RETRY_RE.test(fold(accName(b)))) || null;
/* A retry affordance that is not a control (e.g. a clickable span): still found, so a test can say it is not a button. */
const RETRY_TEXT_RE = /اعاد[هت]\s*(ال)?(محاول|تحميل)|اعيدي|retry/;
const retryLike = (root) => retryControl(root) || [...(root || document.body).querySelectorAll('*')]
  .filter((e) => vis(e) && fold(e.textContent).length <= 40 && RETRY_TEXT_RE.test(fold(e.textContent)) && ![...e.children].some((c) => RETRY_TEXT_RE.test(fold(c.textContent))))[0] || null;
const ownBox = (el) => {
  let box = el;
  while (box.parentElement && box.parentElement !== document.body && box.parentElement.querySelectorAll('input, select, textarea').length === 1) box = box.parentElement;
  return box;
};
const nearMsg = (el) => {
  if (!el) return '';
  const box = ownBox(el);
  if (box === el) return '';
  let t = txt(box);
  for (const l of box.querySelectorAll('label')) t = t.replace(txt(l), '');
  return t.trim();
};
const msgFor = (el) => linkedMsg(el) || nearMsg(el);
const overflowReport = () => {
  const root = document.documentElement;
  const vw = root.clientWidth;
  const rtl = getComputedStyle(document.body).direction === 'rtl';
  const contained = (el) => {
    for (let a = el.parentElement; a && a !== document.body && a !== root; a = a.parentElement) {
      if (getComputedStyle(a).overflowX !== 'visible') return true;
    }
    return false;
  };
  let count = 0; let worst = 0;
  for (const el of document.body.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    const over = rtl ? -r.left : r.right - vw;
    if (over > 1 && !contained(el)) { count++; worst = Math.max(worst, over); }
  }
  return { count, worst: Math.round(worst), vw };
};
const headingsOrdered = () => {
  const lv = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => Number(h.tagName[1]));
  if (!lv.length || lv[0] !== 1 || lv.filter((l) => l === 1).length !== 1) return false;
  for (let i = 1; i < lv.length; i++) if (lv[i] > lv[i - 1] + 1) return false;
  return true;
};
const hasNumber = (text, n) => {
  const t = digitsLatin(text);
  return new RegExp('(^|[^0-9])' + n + '([^0-9]|$)').test(t) || (n === 1 && /واحد|يوم(ا)? فقط/.test(fold(t))) || (n === 2 && /يومان|يومين|اثنان|اثنين/.test(fold(t)));
};
`;

/** Wraps a function body (which must `return`) as an isolated-world expression with the helpers in scope. */
export const js = (body: string, extra = ''): string => `(() => { ${DOM_LIB}\n${extra}\n${body}\n})()`;

export function q<T>(p: PageDriver, body: string, extra = ''): Promise<T> {
  return p.inspect<T>(js(body, extra));
}

export function until(p: PageDriver, body: string, ms: number, extra = ''): Promise<boolean> {
  return p.waitFor(js(body, extra), ms);
}

/** Clicks the element the isolated world tagged with `key`; false when nothing was tagged (no 10-second wait). */
export async function clickTagged(p: PageDriver, key: string): Promise<boolean> {
  const present = await p.inspect<boolean>(`Boolean(document.querySelector('[data-r2-target="${key}"]'))`);
  if (!present) return false;
  await p.click(`[data-r2-target="${key}"]`);
  return true;
}

export const pass = (noteAr?: string): TestOutcomeReport => (noteAr === undefined ? { pass: true } : { pass: true, noteAr });
export const fail = (noteAr?: string): TestOutcomeReport => (noteAr === undefined ? { pass: false } : { pass: false, noteAr });
/** The state the test needs never appeared: reported `skipped`, never pass nor fail (another test owns that defect). */
export const notApplicable = (noteAr: string): TestOutcomeReport => ({ pass: false, notApplicable: true, noteAr });

/* ───────────────────────────── static (text-only) helpers ───────────────────────────── */

export const fileAt = (files: readonly SubmittedFile[], path: string): string | undefined => files.find((f) => f.path === path)?.content;

const norm = (s: string): string[] => s.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

/** Longest common subsequence of lines: how many starter lines survive, in order. */
function lcs(a: readonly string[], b: readonly string[]): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    prev = cur;
  }
  return prev[b.length]!;
}

/** Share of the starter's non-empty lines (in the given files) still present, in order, in the submission. */
export function starterRetention(files: readonly SubmittedFile[], starter: readonly SubmittedFile[], paths: readonly string[]): { kept: number; total: number; ratio: number } {
  let kept = 0; let total = 0;
  for (const path of paths) {
    const s = fileAt(starter, path);
    if (s === undefined) continue;
    const a = norm(s);
    total += a.length;
    kept += lcs(a, norm(fileAt(files, path) ?? ''));
  }
  return { kept, total, ratio: total === 0 ? 1 : kept / total };
}

/** Environment-probing signals, plus a changed copy of a provided mock service the graduate is told not to edit. */
export function probingReport(files: readonly SubmittedFile[], starter: readonly SubmittedFile[], untouched: readonly string[] = []): TestOutcomeReport {
  // viewport_width_pinned is left to the run's gamingSignals (escalation): it concerns layout, not this criterion.
  const signals = gamingSignals(files).filter((g) => g !== 'viewport_width_pinned');
  const changed = untouched.filter((p) => {
    const s = fileAt(starter, p);
    const c = fileAt(files, p);
    return s !== undefined && c !== undefined && norm(s).join('\n') !== norm(c).join('\n');
  });
  if (signals.length === 0 && changed.length === 0) return pass();
  const parts = [signals.length ? `إشارات تحتاج نظر المراجِع: ${signals.join('، ')}` : '', changed.length ? `تغيّر ملف الخدمة الوهمية` : ''].filter(Boolean);
  return fail(parts.join(' · '));
}

export function presence(files: readonly SubmittedFile[], paths: readonly string[]): TestOutcomeReport {
  const missing = paths.filter((p) => (fileAt(files, p) ?? '').trim().length === 0);
  return missing.length === 0 ? pass() : fail(`ملفات غير موجودة: ${missing.join('، ')}`);
}
