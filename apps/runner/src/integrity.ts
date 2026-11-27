/**
 * Integrity signals that do NOT depend on functional tests passing (Phase C round 3, item 4). They compare the
 * submission with the starter the graduate received — text only, nothing is executed:
 *  - `provided_service_modified`: the provided service (the mock API) was changed. Tests that pass against a modified
 *    mock prove nothing about the graduate's code.
 *  - `provided_data_changed`: a provided data file was changed (can be legitimate, e.g. trying an empty list): escalates
 *    only, never blocks.
 *  - `shipped_data_embedded`: the page's own scripts contain several values of the shipped data verbatim — output
 *    hard-coded for the known data instead of computed from what the service returns.
 * Like the static gaming signals, these are for a PERSON: they block an automated «met» suggestion and escalate;
 * they never accuse, never fail the graduate on their own and never change a score.
 */
import type { SubmittedFile } from '@naqla/domain';

const SERVICE = /(^|\/)(mock-api|mock_api|mockApi|api-mock)\.js$/;
const DATA = /^data\/.+\.json$/;
const PROVIDED = { test: (p: string) => SERVICE.test(p) || DATA.test(p) };
const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();

/**
 * Values of the shipped data that would only appear in code if the output were hard-coded: free text (names, titles,
 * descriptions — with a space or non-Latin letters, ≥ 6 characters). Enum-like identifiers (`annual`, `sick`,
 * `in_progress`) are excluded: correct code maps them to labels. So is anything already present in the starter's own
 * code (vocabulary the graduate was given).
 */
function dataStrings(starter: readonly SubmittedFile[]): string[] {
  const out = new Set<string>();
  const starterCode = starter.filter((f) => /\.(js|mjs|html)$/i.test(f.path) && !SERVICE.test(f.path)).map((f) => f.content).join('\n');
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      const t = v.trim();
      const freeText = t.length >= 6 && (/\s/.test(t) || /[^\x00-\x7F]/.test(t)) && !/^[a-z0-9_-]+$/i.test(t) && !/^\d{4}-\d{2}-\d{2}/.test(t);
      if (freeText && !starterCode.includes(t)) out.add(t);
    }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  for (const f of starter) if (/^data\/.+\.json$/.test(f.path)) { try { walk(JSON.parse(f.content)); } catch { /* not JSON */ } }
  return [...out];
}

export function integritySignals(files: readonly SubmittedFile[], starter: readonly SubmittedFile[]): string[] {
  const signals = new Set<string>();
  for (const s of starter) {
    if (!PROVIDED.test(s.path)) continue;
    const mine = files.find((f) => f.path === s.path);
    if (mine && norm(mine.content) !== norm(s.content)) signals.add(SERVICE.test(s.path) ? 'provided_service_modified' : 'provided_data_changed');
  }
  const values = dataStrings(starter);
  if (values.length >= 3) {
    for (const f of files) {
      if (!/\.(js|mjs|html)$/i.test(f.path) || PROVIDED.test(f.path)) continue;
      const hits = values.filter((v) => f.content.includes(v)).length;
      if (hits >= 3) { signals.add('shipped_data_embedded'); break; }
    }
  }
  return [...signals].sort();
}
