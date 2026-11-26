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
const describedBy = (el) => (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
  .map((id) => document.getElementById(id)).filter(Boolean);
const linkedMsg = (el) => (el ? describedBy(el).map(txt).join(' ').trim() : '');
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
  const ar = String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  return new RegExp('(^|[^0-9٠-٩])(' + n + '|' + ar + ')([^0-9٠-٩]|$)').test(text) || (n === 1 && /واحد/.test(text));
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
  const signals = gamingSignals(files);
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
