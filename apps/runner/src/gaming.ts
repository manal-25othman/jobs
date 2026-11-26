/**
 * Static signals that code may be targeting the test environment instead of the user (metrics Q10, "detect
 * attempts to game the tests"). Text only — nothing is executed. A signal is for a PERSON to look at; it is never a
 * verdict, never shown to the graduate as an accusation, and never changes a score by itself.
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

export function gamingSignals(files: readonly SubmittedFile[]): string[] {
  const found = new Set<string>();
  for (const f of files) {
    if (!/\.(js|mjs|html)$/i.test(f.path)) continue;
    for (const s of SIGNALS) if (s.re.test(f.content)) found.add(s.code);
  }
  return [...found].sort();
}
