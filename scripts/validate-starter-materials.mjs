#!/usr/bin/env node
/**
 * Phase B, package 3 — proves each pilot activity can be COMPLETED from its graduate materials alone.
 *
 *   node scripts/validate-starter-materials.mjs
 *
 * For each activity: the graduate folder is served as-is (the way a graduate runs it with a static server), opened in
 * Chromium, and the reported faults are shown to EXIST; then the reviewer's reference solution — written from the
 * graduate materials only — is overlaid on a copy of the same folder and every fault is shown to be GONE, with the
 * behaviour the activity asks for. Nothing here touches the database, the API or any assessment rule.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, cpSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAT = join(ROOT, 'data', 'candidates', 'trk_frontend_junior_v2', 'materials');
const appRequire = createRequire(join(ROOT, 'apps', 'app', 'package.json'));
const { chromium } = appRequire('playwright-core');
const CHROME = process.env.UI_CHROME ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

let failures = 0; let passes = 0;
const check = (id, label, ok, detail = '') => { if (ok) passes++; else failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} ${label}${detail ? ` — ${detail}` : ''}`); };

function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = join(dir, path === '/' ? 'index.html' : path);
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) { res.statusCode = 404; res.end('not found'); return; }
      res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream'); res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}
function withSolution(activity) {
  const dir = mkdtempSync(join(tmpdir(), `${activity}-solution-`));
  cpSync(join(MAT, activity, 'graduate'), dir, { recursive: true });
  cpSync(join(MAT, activity, 'reviewer', 'solution'), dir, { recursive: true });
  return dir;
}
const hasHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

const browser = await chromium.launch({ executablePath: CHROME });
try {
  // ───────────── act_fe_change_request: team tasks ─────────────
  {
    const starter = await serve(join(MAT, 'act_fe_change_request', 'graduate'));
    const page = await browser.newPage();
    await page.goto(`${starter.base}/?scenario=empty`); await page.waitForTimeout(800);
    const emptyText = await page.locator('#tasks').innerText();
    check('T1', 'starter: an empty task list shows the error message (the reported bug exists)', /تعذّر تحميل المهام/.test(emptyText) && !/لا مهام/.test(emptyText), emptyText.trim());
    await page.goto(`${starter.base}/?scenario=ok`); await page.waitForTimeout(800);
    check('T2', 'starter: the six tasks render with their status, and there is no filter yet', (await page.locator('.task').count()) === 6 && (await page.locator('select').count()) === 0);
    await page.goto(`${starter.base}/?scenario=error`); await page.waitForTimeout(800);
    check('T3', 'starter: a real server error shows the error message with a retry button', /تعذّر تحميل المهام/.test(await page.locator('#tasks').innerText()) && (await page.getByRole('button', { name: 'إعادة المحاولة' }).count()) === 1);
    const st = JSON.parse(readFileSync(join(MAT, 'act_fe_change_request', 'graduate', 'state-example.json'), 'utf8'));
    check('T4', 'the attached state is exactly what the page holds after an empty answer', st.status === 'error' && Array.isArray(st.tasks) && st.tasks.length === 0
      && await page.goto(`${starter.base}/?scenario=empty`).then(() => page.waitForTimeout(800)).then(() => page.evaluate(() => JSON.stringify({ status: state.status, tasks: state.tasks }))) === JSON.stringify({ status: 'error', tasks: [] }));
    starter.server.close();

    const sol = await serve(withSolution('act_fe_change_request'));
    await page.goto(`${sol.base}/?scenario=empty`); await page.waitForTimeout(800);
    check('T5', 'solution: an empty list shows «لا مهام بعد», no error', /لا مهام بعد/.test(await page.locator('#tasks').innerText()) && !/تعذّر/.test(await page.locator('#tasks').innerText()));
    await page.goto(`${sol.base}/?scenario=ok`); await page.waitForTimeout(800);
    await page.getByLabel('عرض المهام:').selectOption('done');
    const done = await page.locator('.task').allInnerTexts();
    check('T6', 'solution: filtering by status shows only that status, with its count', done.length === 2 && done.every((t) => t.includes('منجزة')) && /2 مهمة/.test(await page.locator('#tasks').innerText()));
    await page.goto(`${sol.base}/?scenario=error`); await page.waitForTimeout(800);
    check('T7', 'solution: a real error still shows the error and retry (only the empty case changed)', /تعذّر تحميل المهام/.test(await page.locator('#tasks').innerText()));
    sol.server.close(); await page.close();
  }

  // ───────────── act_fe_debug_improve: workshop registration ─────────────
  {
    const starter = await serve(join(MAT, 'act_fe_debug_improve', 'graduate'));
    const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
    await page.goto(`${starter.base}/`);
    const clipped = await page.evaluate(() => { const t = document.querySelector('.schedule'); return t.getBoundingClientRect().width > document.documentElement.clientWidth && getComputedStyle(document.body).overflowX === 'hidden'; });
    check('W1', 'starter: at 360 px the schedule is wider than the screen and the overflow is hidden by a mask (planted)', clipped);
    await page.fill('#name', 'سارة'); await page.fill('#email', 'sara@gmail');
    await page.click('text=سجّليني الآن');
    check('W2', 'starter: «سجّليني الآن» does nothing — no handler is attached (planted)', (await page.locator('#result').innerText()).trim() === '');
    check('W3', 'starter: the email check accepts «sara@gmail» (planted)', await page.evaluate(() => isValidEmail('sara@gmail')) === true);
    check('W4', 'starter: non-semantic controls — no form, no labels, no real button, headings skip', await page.evaluate(() =>
      !document.querySelector('form') && document.querySelectorAll('label').length === 0 && !document.querySelector('button') && !!document.querySelector('h4') && !document.querySelector('h2')));
    starter.server.close();

    const sol = await serve(withSolution('act_fe_debug_improve'));
    await page.goto(`${sol.base}/`);
    check('W5', 'solution: no horizontal page scroll at 360 px, without hiding overflow', !(await hasHorizontalScroll(page)) && await page.evaluate(() => getComputedStyle(document.body).overflowX !== 'hidden'));
    await page.getByLabel('الاسم الكامل').fill('سارة'); await page.getByLabel('البريد الإلكتروني').fill('sara@gmail');
    await page.getByRole('button', { name: 'سجّليني الآن' }).focus(); await page.keyboard.press('Enter');
    const err = await page.locator('#email-error').innerText();
    check('W6', 'solution: by keyboard, an invalid email is refused with a message tied to its field; the input is kept',
      /غير صالح/.test(err) && await page.getByLabel('البريد الإلكتروني').getAttribute('aria-invalid') === 'true' && await page.getByLabel('البريد الإلكتروني').inputValue() === 'sara@gmail'
      && (await page.getByLabel('البريد الإلكتروني').getAttribute('aria-describedby')) === 'email-error' && !/تم تسجيلك/.test(await page.locator('#result').innerText()));
    await page.getByLabel('البريد الإلكتروني').fill('sara@gmail.com'); await page.getByRole('button', { name: 'سجّليني الآن' }).click();
    check('W7', 'solution: a valid form is accepted', /تم تسجيلك بنجاح/.test(await page.locator('#result').innerText()));
    await page.setViewportSize({ width: 1024, height: 800 }); await page.goto(`${sol.base}/`);
    const side = await page.evaluate(() => { const a = document.querySelector('aside').getBoundingClientRect(); const m = document.querySelector('main').getBoundingClientRect(); return Math.abs(a.top - m.top) < 5; });
    check('W8', 'solution: at 1024 px the sidebar sits beside the content', side);
    sol.server.close(); await page.close();
  }

  // ───────────── act_fe_integrated_leave_requests: leave requests ─────────────
  {
    const starter = await serve(join(MAT, 'act_fe_integrated_leave_requests', 'graduate'));
    const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
    await page.goto(`${starter.base}/?scenario=flaky`); await page.waitForTimeout(900);
    check('L1', 'starter: the first load fails with an error and a retry control', /تعذّر تحميل الطلبات/.test(await page.locator('#app').innerText()));
    await page.click('.retry'); await page.waitForTimeout(900);
    const after = await page.locator('#app').innerText();
    check('L2', 'starter: after retry the requests appear AND the loading indicator stays (the reported bug exists)', /جارٍ تحميل الطلبات/.test(after) && (await page.locator('.request-row').count()) === 5);
    await page.goto(`${starter.base}/?scenario=ok`); await page.waitForTimeout(900);
    const firstTwo = await page.locator('.request-row').allInnerTexts();
    check('L3', 'starter: the service returns oldest first, which conflicts with the brief (deliberate)', /2026-02-08/.test(firstTwo[0] ?? ''));
    check('L4', 'starter: the colleague\'s rows overflow a 360 px screen', await hasHorizontalScroll(page));
    starter.server.close();

    const sol = await serve(withSolution('act_fe_integrated_leave_requests'));
    await page.goto(`${sol.base}/?scenario=flaky`); await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'إعادة المحاولة' }).click(); await page.waitForTimeout(900);
    const fixed = await page.locator('#app').innerText();
    check('L5', 'solution: after retry the requests appear and the loading indicator is gone', !/جارٍ تحميل الطلبات/.test(fixed) && (await page.locator('.request').count()) === 5);
    const order = await page.locator('.request').allInnerTexts();
    check('L6', 'solution: newest first, as the brief asks', /2026-12-20/.test(order[0] ?? '') && /2026-02-08/.test(order[4] ?? ''));
    check('L7', 'solution: no horizontal scroll at 360 px', !(await hasHorizontalScroll(page)));
    await page.goto(`${sol.base}/?scenario=empty`); await page.waitForTimeout(900);
    check('L8', 'solution: an empty list shows «لا طلبات إجازة سابقة»', /لا طلبات إجازة سابقة/.test(await page.locator('#app').innerText()));
    await page.goto(`${sol.base}/?scenario=error`); await page.waitForTimeout(900);
    check('L9', 'solution: a server error shows the message and a real retry button', (await page.getByRole('button', { name: 'إعادة المحاولة' }).count()) === 1);
    await page.goto(`${sol.base}/?scenario=slow`); await page.waitForTimeout(300);
    check('L10', 'solution: while loading, the indicator is shown', /جارٍ تحميل الطلبات/.test(await page.locator('#app').innerText()));
    sol.server.close(); await page.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${passes}/${passes + failures} starter-material checks passed.`);
process.exit(failures ? 1 : 0);
