/**
 * Static signals that code may be targeting the test environment instead of the user (metrics Q10, "detect
 * attempts to game the tests"). Text only — nothing is executed. A signal is for a PERSON to look at; it is never a
 * verdict, never shown to the graduate as an accusation, and never changes a score by itself.
 * `viewport_width_pinned` (0.3.0 packs): a media query or script branch that matches one exact viewport width.
 */
import type { SubmittedFile } from '@naqla/domain';

const SIGNALS: readonly { readonly code: string; readonly re: RegExp }[] = [
  { code: 'automation_probe', re: /navigator\s*\.\s*webdriver|HeadlessChrome|__playwright|__puppeteer|cdc_[a-z0-9]{6,}|callPhantom|_phantom/i },
  { code: 'test_host_probe', re: /submission\.test|location\s*\.\s*(host|hostname|origin)\s*[!=]==?/i },
  { code: 'environment_probe', re: /navigator\s*\.\s*(plugins|languages)\s*\.\s*length\s*[=!<>]|matchMedia\(\s*['"]\(\s*prefers-reduced-motion/i },
  { code: 'prototype_patch', re: /(Element|HTMLElement|Node|Document|Window|CSSStyleDeclaration|EventTarget)\s*\.\s*prototype\s*\.\s*\w+\s*=|Object\s*\.\s*defineProperty\(\s*(window|document|navigator|Element\.prototype|HTMLElement\.prototype)/ },
  { code: 'computed_style_override', re: /(window\s*\.\s*)?getComputedStyle\s*=|getBoundingClientRect\s*=/ },
  { code: 'timing_probe', re: /performance\s*\.\s*now\(\)\s*[<>]|Date\.now\(\)\s*-\s*\w+\s*[<>]\s*\d{1,3}\b/ },
];

/* ───────────── viewport_width_pinned: layout written for one exact width (e.g. the width a test uses) ───────────── */

const PX: Record<string, number> = { px: 1, em: 16, rem: 16 };
const toPx = (n: string, unit: string): number => Number(n) * (PX[unit.toLowerCase()] ?? 1);
const LEN = String.raw`(\d+(?:\.\d+)?)\s*(px|em|rem)`;

/** Media conditions in a file: `@media …{`, `@import … ;`, `media="…"`, and the argument of `matchMedia(…)`. */
function mediaConditions(f: SubmittedFile): string[] {
  const src = f.content.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out: string[] = [];
  const isCss = /\.css$/i.test(f.path); const isHtml = /\.html$/i.test(f.path);
  if (isCss || isHtml) {
    for (const m of src.matchAll(/@media([^{;]+)[{;]/gi)) out.push(m[1]!);
    for (const m of src.matchAll(/@import[^;]+?\)\s*([^;]+);/gi)) out.push(m[1]!);
  }
  if (isHtml) for (const m of src.matchAll(/\smedia\s*=\s*("([^"]*)"|'([^']*)')/gi)) out.push(m[2] ?? m[3] ?? '');
  if (!isCss) for (const m of src.matchAll(/matchMedia\(\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g)) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  return out;
}

/** One query (no commas) that only matches a single width: `(width: N)`, or lower and upper width bounds ≤ 2px apart. */
function pinnedQuery(q: string): boolean {
  if (new RegExp(String.raw`\(\s*(device-)?width\s*:\s*${LEN}\s*\)`, 'i').test(q)) return true;
  const lo: number[] = []; const hi: number[] = [];
  for (const m of q.matchAll(new RegExp(String.raw`\(\s*min-(?:device-)?width\s*:\s*${LEN}\s*\)`, 'gi'))) lo.push(toPx(m[1]!, m[2]!));
  for (const m of q.matchAll(new RegExp(String.raw`\(\s*max-(?:device-)?width\s*:\s*${LEN}\s*\)`, 'gi'))) hi.push(toPx(m[1]!, m[2]!));
  // Range syntax: (width >= N), (N <= width), (N <= width <= M), and the strict forms.
  for (const m of q.matchAll(new RegExp(String.raw`width\s*(>=?|<=?)\s*${LEN}`, 'gi'))) (m[1]!.startsWith('>') ? lo : hi).push(toPx(m[2]!, m[3]!));
  for (const m of q.matchAll(new RegExp(String.raw`${LEN}\s*(>=?|<=?)\s*width`, 'gi'))) (m[3]!.startsWith('<') ? lo : hi).push(toPx(m[1]!, m[2]!));
  if (!lo.length || !hi.length) return false;
  return Math.min(...hi) - Math.max(...lo) <= 2 && Math.min(...hi) >= Math.max(...lo) - 2;
}

/** Script that branches on the viewport being exactly N pixels wide. */
const PINNED_SCRIPT = /\b(innerWidth|outerWidth|clientWidth|screen\s*\.\s*width|visualViewport\s*\.\s*width)\s*===?\s*\d{3,4}\b|\b\d{3,4}\s*===?\s*(window\s*\.\s*)?(innerWidth|outerWidth|document\s*\.\s*documentElement\s*\.\s*clientWidth|screen\s*\.\s*width)\b/;

/**
 * A layout rule or a script branch that applies at ONE exact viewport width — the shape of code written for the widths
 * a test uses rather than for screens in general. A real breakpoint is a lower OR an upper bound (or a range of real
 * width); this signal is for a person to look at, never a verdict.
 */
export function pinnedViewportWidth(files: readonly SubmittedFile[]): boolean {
  for (const f of files) {
    if (!/\.(css|html|js|mjs)$/i.test(f.path)) continue;
    for (const cond of mediaConditions(f)) if (cond.split(',').some(pinnedQuery)) return true;
    if (/\.(js|mjs|html)$/i.test(f.path) && PINNED_SCRIPT.test(f.content)) return true;
  }
  return false;
}

export function gamingSignals(files: readonly SubmittedFile[]): string[] {
  const found = new Set<string>();
  for (const f of files) {
    if (!/\.(js|mjs|html)$/i.test(f.path)) continue;
    for (const s of SIGNALS) if (s.re.test(f.content)) found.add(s.code);
  }
  if (pinnedViewportWidth(files)) found.add('viewport_width_pinned');
  return [...found].sort();
}
