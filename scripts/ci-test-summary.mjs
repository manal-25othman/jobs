#!/usr/bin/env node
/** Markdown summary for CI: per suite, PASSED / FAILED / SKIPPED / TODO counts read from node:test or our harness logs. */
import { existsSync, readFileSync } from 'node:fs';
const rows = ['| suite | passed | failed | skipped | todo | status |', '|---|---|---|---|---|---|'];
for (const arg of process.argv.slice(2)) {
  const [name, file] = arg.split('=');
  if (!existsSync(file)) { rows.push(`| ${name} | – | – | – | – | NOT RUN |`); continue; }
  const t = readFileSync(file, 'utf8');
  const sum = (k) => [...t.matchAll(new RegExp(`^# ${k} (\\d+)`, 'gm'))].reduce((s, m) => s + Number(m[1]), 0);
  let pass = sum('pass'), fail = sum('fail'), skip = sum('skipped'), todo = sum('todo');
  const browser = /(\d+)\/(\d+) browser checks passed/.exec(t);
  if (browser) { pass = Number(browser[1]); fail = Number(browser[2]) - pass; }
  const dbPass = (t.match(/PASS\s/g) ?? []).length, dbFail = (t.match(/FAIL\s/g) ?? []).length;
  if (name.startsWith('db') && pass === 0) { pass = dbPass; fail = dbFail; }
  const status = fail > 0 ? 'FAILED' : pass === 0 && skip > 0 ? 'ALL SKIPPED' : skip > 0 ? 'PASSED (with skips)' : pass > 0 ? 'PASSED' : 'NO RESULT';
  rows.push(`| ${name} | ${pass} | ${fail} | ${skip} | ${todo} | ${status} |`);
}
console.log(rows.join('\n'));
