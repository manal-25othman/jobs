#!/usr/bin/env node
/**
 * Graduate activity journey — Phase 2 browser acceptance (real browser, real API, real database).
 *
 *   DATABASE_URL=postgresql://…/naqla_e2e node apps/app/test/browser/journey.browser.mjs [--skip-build]
 *
 * What runs:
 *   - the NestJS API from apps/api/dist (the same AppModule the product runs), with the storage TEST DOUBLE served
 *     over HTTP so the browser can PUT to its signed URLs (test harness only — never product code);
 *   - the Next.js app, built with its public env pointing at this harness, served by `next start`;
 *   - Chromium (pre-installed) through playwright-core.
 * Authentication: a session signed with the API's test secret is placed where supabase-js keeps it; the API
 * verifies the signature exactly as in production. No Supabase project is contacted.
 *
 * Every scenario checks what the graduate SEES and, where it matters, what the DATABASE holds (no second
 * evaluation, explicit file mapping, no level).
 */
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../../..');
const APP_DIR = join(ROOT, 'apps/app');
const API_DIR = join(ROOT, 'apps/api');
const apiRequire = createRequire(join(API_DIR, 'package.json'));
const appRequire = createRequire(join(APP_DIR, 'package.json'));

const API_PORT = Number(process.env.UI_API_PORT ?? 3101);
const APP_PORT = Number(process.env.UI_APP_PORT ?? 3100);
const API = `http://localhost:${API_PORT}`;
const APP = `http://localhost:${APP_PORT}`;
const SUPABASE_URL = 'http://localhost:54321'; // never contacted: the session is read from storage
const STORAGE_KEY = 'sb-localhost-auth-token';
const SHOTS = process.env.UI_SHOTS_DIR ?? join(ROOT, '.ui-acceptance');
const CHROME = process.env.UI_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UPLOAD_MAX_BYTES = 4096; // small, so an oversize upload can be exercised
const FIXTURE = { roleId: 'b0000000-0000-4000-8000-000000000001', activityId: 'c0000000-0000-4000-8000-000000000001' };
const SME = '55555555-5555-4555-8555-555555555555';

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(2); }
mkdirSync(SHOTS, { recursive: true });

const results = [];
const openPages = new Set();
const check = (id, name, pass, detail = '') => { results.push({ id, name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id} ${name}${detail ? ` — ${detail}` : ''}`); };

/* ───────────────────────────── API (real AppModule) ───────────────────────────── */

process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret-for-e2e-only-not-a-real-key';
process.env.STORAGE_DRIVER = 'memory';
process.env.UPLOAD_MAX_BYTES = String(UPLOAD_MAX_BYTES);
const { Test } = apiRequire('@nestjs/testing');
const { SignJWT } = apiRequire('jose');
const { Pool } = apiRequire('pg');
const { AppModule } = apiRequire('./dist/src/app.module');
const { DomainExceptionFilter } = apiRequire('./dist/src/infra/domain-exception.filter');
const { STORAGE_PORT } = apiRequire('./dist/src/storage/storage.port');
const { useSafetyBaseline } = apiRequire('./dist/test/helpers');
const { promoteDemo } = apiRequire('./dist/src/career-data/promotion');
const { reviewTransition, approveRubricValues } = apiRequire('./dist/src/career-data/review');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const one = async (sql, p = []) => (await pool.query(sql, p)).rows[0];
const count = async (sql, p = []) => Number((await one(sql, p)).n);

async function startApi() {
  await useSafetyBaseline(); // D-118: the policy every real environment resolves to
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ cors: true });
  app.useGlobalFilters(new DomainExceptionFilter());
  app.setGlobalPrefix('v1', { exclude: ['health', 'ready', 'public/reports/:id'] });
  const storage = app.get(STORAGE_PORT);
  // TEST HARNESS ONLY: the memory double's signed upload URL becomes an HTTP URL the browser can PUT to.
  const original = storage.createSignedUpload.bind(storage);
  storage.createSignedUpload = async (...args) => {
    const t = await original(...args);
    return { ...t, url: t.url.replace('memory://upload/', `${API}/__test-storage/upload/`) };
  };
  app.use('/__test-storage/upload/', (req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'PUT, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { storage.put(`memory://upload/${req.url.replace(/^\//, '')}`, new Uint8Array(Buffer.concat(chunks))); res.statusCode = 200; res.end('ok'); }
      catch (e) { res.statusCode = 400; res.end(String(e)); }
    });
  });
  await app.listen(API_PORT);
  return app;
}

/* ───────────────────────────── the Next.js app ───────────────────────────── */

const appEnv = { ...process.env, NEXT_PUBLIC_API_URL: API, NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key', NEXT_TELEMETRY_DISABLED: '1' };
function buildApp() { execFileSync('npx', ['next', 'build'], { cwd: APP_DIR, env: appEnv, stdio: 'inherit' }); }
async function startApp() {
  // A server left on the port would serve another build: refuse rather than test the wrong app.
  const busy = await fetch(`${APP}/`).then(() => true).catch(() => false);
  if (busy) throw new Error(`port ${APP_PORT} is already serving something; stop it first`);
  // Own process group, so the whole server (npx → next-server) is stopped at the end.
  const child = spawn('npx', ['next', 'start', '-p', String(APP_PORT)], { cwd: APP_DIR, env: appEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${APP}/`)).ok) return child; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  stopApp(child); throw new Error('the Next.js app did not start');
}

function stopApp(child) { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); } }

/* ───────────────────────────── users and sessions ───────────────────────────── */

async function newUser() {
  const id = crypto.randomUUID();
  const token = await new SignJWT({ email: `${id.slice(0, 8)}@example.test`, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(id).setIssuedAt().setExpirationTime('2h')
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));
  await apiCall({ id, token }, 'POST', '/me/bootstrap', {});
  return { id, token };
}
async function apiCall(u, method, path, body) {
  const r = await fetch(`${API}/v1${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${u.token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!j?.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j?.error)}`);
  return j.data;
}
async function pageFor(browser, u, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: 'ar' });
  const session = { access_token: u.token, token_type: 'bearer', expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, refresh_token: 'not-used',
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: `${u.id.slice(0, 8)}@example.test`, app_metadata: {}, user_metadata: {} } };
  await ctx.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } }, [STORAGE_KEY, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => console.log(`  [page error] ${e.message}`));
  openPages.add(page);
  return page;
}
const shot = async (page, name) => { await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }); };
const bodyText = (page) => page.evaluate(() => document.body.innerText);

/* ───────────────────────────── fixtures ───────────────────────────── */

/** A reviewed, SME-approved, NON-demo copy of a pack activity (human criteria), as the API e2e suites build it. */
async function reviewedActivity() {
  const demo = await one(`select id, target_role_id from activity_spec where slug = 'act_fe_build_interface' and is_demo_fixture`);
  const existing = await one(`select canonical_entity_id from content_promotion where entity_kind = 'activity_spec' and demo_entity_id = $1 order by created_at desc limit 1`, [demo.id]);
  const activityId = existing?.canonical_entity_id ?? (await promoteDemo(pool, 'activity_spec', demo.id, 'content author', 'UI acceptance')).canonicalId;
  const rubricId = (await one(`select id from rubric_version where activity_spec_id = $1 and not is_demo_fixture order by created_at desc limit 1`, [activityId])).id;
  const walk = async (kind, id) => {
    const st = async () => (await one(`select status::text as s from ${kind} where id = $1`, [id])).s;
    if ((await st()) === 'draft') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'curated', decidedBy: null, decidedByLabel: 'author', rolePerformed: 'content_author', reason: 'submitted', production: false });
    if ((await st()) === 'curated') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'sme_reviewed', decidedBy: SME, decidedByLabel: 'Named SME', rolePerformed: 'sme', reason: 'reviewed', production: false });
    if ((await st()) === 'sme_reviewed') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'approved', decidedBy: SME, decidedByLabel: 'Named SME', rolePerformed: 'sme', reason: 'approved', production: false });
    if ((await st()) === 'approved') await reviewTransition(pool, { entityKind: kind, entityId: id, to: 'published', decidedBy: null, decidedByLabel: 'Product Owner', rolePerformed: 'product_owner', reason: 'publish', production: false });
  };
  if (!(await one('select values_approved_at from rubric_version where id = $1', [rubricId])).values_approved_at) {
    await approveRubricValues(pool, { rubricVersionId: rubricId, decidedBy: SME, decidedByLabel: 'Named SME', reason: 'UI acceptance: values reviewed' });
  }
  await walk('activity_spec', activityId); await walk('rubric_version', rubricId);
  return { activityId, roleId: demo.target_role_id };
}

const LEVELS = { semantic_structure: 'solid', form_validation: 'solid', data_states: 'solid', state_transitions: 'solid', responsive_layout: 'solid', explanation_clarity: 'solid', judgment_assumption_check: 'met' };
async function reviewEverything(evaluationId, levels = LEVELS) {
  const reviewer = await newUser();
  await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'human_reviewer', 'UI acceptance operator')`, [reviewer.id]);
  const items = (await pool.query(`select id, criterion_key from review_queue_item where evaluation_id = $1 order by criterion_key`, [evaluationId])).rows;
  for (const it of items) {
    await apiCall(reviewer, 'POST', `/review/queue/${it.id}/assign`, {});
    await apiCall(reviewer, 'GET', `/review/items/${it.id}`);
    await apiCall(reviewer, 'POST', `/review/items/${it.id}/decision`, { levelKey: levels[it.criterion_key] ?? LEVELS[it.criterion_key], rationale: `لاحظتُ في الملفات المسلّمة أن ${it.criterion_key} يستوفي الوصف.` });
  }
}

/**
 * ENG-1 P5 — TEST ONLY: makes a per_skill draft policy development_only with the explicit opt-in that migration 0029
 * requires (refused in production by the database). `useSafetyBaseline` restores the real default afterwards.
 */
const P5_POLICY = 'ENG-1 P5 UI ACCEPTANCE ONLY: per-skill development pathway; unapproved draft; never production.';
async function usePerSkillDevelopmentPolicy() {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('naqla.config_actor', 'UI acceptance harness', true), set_config('naqla.config_reason', 'P5 development-only per-skill UI acceptance', true), set_config('naqla.per_skill_dev_activation', 'on', true)");
    let id = (await c.query(`select id from verification_policy where key = 'default' and description_en = $1`, [P5_POLICY])).rows[0]?.id;
    if (!id) {
      const v = Math.max(970, Number((await c.query(`select max(version) + 1 as v from verification_policy where key = 'default'`)).rows[0].v));
      id = (await c.query(`insert into verification_policy (key, version, description_en, promotion_basis, practiced_on_submission, assessment_scope) values ('default', $1, $2, 'independently_verified', false, 'per_skill') returning id`, [v, P5_POLICY])).rows[0].id;
    }
    await c.query(`update verification_policy set activation = 'inactive' where key = 'default' and activation <> 'inactive' and id <> $1`, [id]);
    await c.query(`update verification_policy set activation = 'development_only' where id = $1 and activation <> 'development_only'`, [id]);
    await c.query('commit');
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

/* ───────────────────────────── page helpers ───────────────────────────── */

async function answerQuestionnaire(page) {
  // The active questionnaire's only required unconditional question is yes/no ("did you use AI?"): answer "no".
  const no = page.getByRole('radio', { name: 'لا', exact: true });
  if (await no.count()) await no.first().check();
}
const fileInput = (key) => `#deliverable-${key.replace(/[^a-z0-9]+/gi, '-')}`;
async function uploadInto(page, key, name, content) {
  await page.setInputFiles(fileInput(key), { name, mimeType: 'text/plain', buffer: Buffer.from(content) });
  await page.locator(`${fileInput(key)}-state`).getByText('مرفوع').waitFor();
}
async function a11yBasics(page) {
  return page.evaluate(() => {
    const issues = [];
    for (const el of document.querySelectorAll('input:not([type=hidden]), textarea, select')) {
      const id = el.getAttribute('id');
      const labelled = el.closest('label') || (id && document.querySelector(`label[for="${id}"]`)) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
      if (!labelled) issues.push(`unlabelled ${el.tagName.toLowerCase()}${id ? '#' + id : ''}`);
    }
    for (const b of document.querySelectorAll('button, a')) if (!(b.textContent || '').trim() && !b.getAttribute('aria-label')) issues.push(`nameless ${b.tagName.toLowerCase()}`);
    if (document.documentElement.getAttribute('dir') !== 'rtl') issues.push('dir is not rtl');
    if (document.documentElement.getAttribute('lang') !== 'ar') issues.push('lang is not ar');
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) issues.push(`horizontal overflow ${document.documentElement.scrollWidth}>${document.documentElement.clientWidth}`);
    if (!document.querySelector('h1')) issues.push('no h1');
    return issues;
  });
}

/* ───────────────────────────── scenarios ───────────────────────────── */

async function run(browser) {
  const reviewed = await reviewedActivity();

  // B1 · empty states: no goal → the catalogue says why; My Work is empty and points to activities.
  {
    const u = await newUser(); const page = await pageFor(browser, u);
    await page.goto(`${APP}/activities`); await page.getByText('اختاري هدفك المهني أولًا').waitFor();
    check('B1a', 'catalogue without a goal explains and links to goal selection', await page.getByRole('link', { name: /اختيار الهدف المهني/ }).count() === 1);
    await page.goto(`${APP}/work`); await page.getByText('لم تبدئي أي نشاط بعد').waitFor();
    check('B1b', 'My Work empty state links to the catalogue', await page.getByRole('link', { name: /أنشطة دورك/ }).count() >= 1);
    await page.context().close();
  }

  // B2 · goal → catalogue → detail → start → workspace (demo role), with what must and must not be shown.
  let demoUser, demoProjectId, demoSubmissionId;
  {
    const u = demoUser = await newUser(); const page = await pageFor(browser, u);
    await page.goto(`${APP}/goal`); await page.getByRole('heading', { name: 'هدفك المهني' }).waitFor();
    await page.locator(`input[type=radio][value="${FIXTURE.roleId}"]`).check();
    await page.getByRole('button', { name: /هذا هو هدفي المهني/ }).click();
    await page.waitForURL(`${APP}/activities`); await page.getByRole('heading', { name: 'أنشطة دورك' }).waitFor();
    await page.locator('article').first().waitFor();
    const catalogue = await bodyText(page);
    check('B2a', 'goal confirmation leads to the activity catalogue', page.url().endsWith('/activities'));
    check('B2b', 'the demo activity is listed and labelled DEMO', /تجريبي — غير مراجَع/.test(catalogue));
    check('B2c', 'no private rubric or assessment detail is shown in the catalogue', !/planted|مزروع|weight|threshold|عتبة|pass_threshold|rubric/i.test(catalogue));
    const listed = await page.locator('article').count();
    const allowed = (await apiCall(u, 'GET', '/me/activities')).items.length;
    check('B2d', 'the catalogue shows exactly the authorized activities', listed === allowed, `${listed} cards, API ${allowed}`);
    await shot(page, 'U1-activities-desktop');
    await page.getByRole('link', { name: /عرض النشاط/ }).first().click();
    await page.waitForURL(/\/activities\/[0-9a-f-]{36}$/); await page.getByRole('heading', { name: 'كيف يُقيَّم عملك' }).waitFor();
    const detail = await bodyText(page);
    check('B2e', 'detail shows deliverables, skills, assessment and the submission-is-not-a-level sentence',
      /المخرجات المطلوبة/.test(detail) && /المهارات التي تطوّرينها/.test(detail) && /لا يرفع مستوى المهارة وحده/.test(detail));
    check('B2f', 'detail carries no private assessment wording', !/planted|مزروع|weight|threshold|عتبة/i.test(detail));
    await shot(page, 'U2-activity-detail-desktop');
    await page.getByRole('button', { name: 'ابدئي النشاط' }).click();
    await page.waitForURL(/\/work\/[0-9a-f-]{36}$/); await page.getByRole('heading', { name: 'المخرجات المطلوبة' }).waitFor();
    demoProjectId = page.url().split('/').pop();
    check('B2g', 'starting the activity creates a project authorized by the API and opens its workspace', await count('select count(*)::int n from project where id = $1 and user_id = $2', [demoProjectId, u.id]) === 1);
    const ws = await bodyText(page);
    check('B2h', 'the workspace has no tick-boxes claiming technical facts', !(await page.locator('input[type=checkbox]').evaluateAll((els) => els.some((e) => !e.closest('[aria-labelledby="skills-title"]')))));
    check('B2i', 'the workspace states that nothing is saved before submission', /لا يُحفظ عملك قبل التسليم/.test(ws));
    check('B2j', 'submit is disabled until the mandatory deliverables are present', await page.getByRole('button', { name: /أكملي المطلوب أولًا/ }).isDisabled());
    await shot(page, 'U3-workspace-empty-desktop');

    // B3 · upload in REVERSE order; the mapping follows the slot, not the order.
    await uploadInto(page, 'file.test', 'HabitList.test.jsx', 'test("empty", () => {});');
    await uploadInto(page, 'file.component', 'HabitList.jsx', 'export function HabitList() {}');
    await page.locator(fileInput('note.coverage')).fill('غطّت الاختبارات الحالة الفارغة والتحميل والخطأ؛ لم تغطِّ التقسيم إلى صفحات.');
    await answerQuestionnaire(page);
    await shot(page, 'U3-workspace-ready-desktop');
    const submit = page.getByRole('button', { name: 'تسليم للتقييم' });
    check('B3a', 'submit becomes available once every mandatory deliverable is present', await submit.isEnabled());
    await submit.dblclick(); // a double click must not submit twice
    await page.waitForURL(/\/evaluation\?submission=/); await page.getByRole('heading', { name: 'نتيجة التقييم' }).waitFor();
    await page.locator('section.card, .next-action, .banner').first().waitFor();
    demoSubmissionId = new URL(page.url()).searchParams.get('submission');
    const files = (await pool.query(`select a.key, u.declared_name from submission_artifact a join upload u on u.id = a.upload_id where a.submission_id = $1 order by a.key`, [demoSubmissionId])).rows;
    check('B3b', 'files sent in reverse order are bound to the deliverables of their slots', JSON.stringify(files) === JSON.stringify([{ key: 'file.component', declared_name: 'HabitList.jsx' }, { key: 'file.test', declared_name: 'HabitList.test.jsx' }]), JSON.stringify(files));
    check('B3c', 'a double click created exactly one submission', await count('select count(*)::int n from submission where project_id = $1', [demoProjectId]) === 1);
    const keys = (await pool.query(`select key from submission_artifact where submission_id = $1 order by key`, [demoSubmissionId])).rows.map((r) => r.key);
    check('B3d', 'no declared tick, signal or file marker was sent — only files and declared text deliverables', keys.every((k) => /^(file\.(component|test)|note\.coverage)$/.test(k)), keys.join(','));

    // B4 · the evaluation page: refresh never re-runs; the demo never shows a level.
    const evals = async () => count('select count(*)::int n from evaluation where submission_id = $1', [demoSubmissionId]);
    check('B4a', 'submitting started exactly one evaluation', await evals() === 1);
    for (let i = 0; i < 3; i++) { await page.reload(); await page.getByRole('heading', { name: 'نتيجة التقييم' }).waitFor(); await page.locator('section.card').first().waitFor(); }
    check('B4b', 'three refreshes started no further evaluation', await evals() === 1);
    const ev = await bodyText(page);
    check('B4c', 'the demo result shows no level change (D-118)', !/تغيّر مستوى المهارة/.test(ev) && !/مُثبتة بدليل|ظهرت في مشروع/.test(ev));
    check('B4d', 'no evaluate button is offered once evaluated', await page.getByRole('button', { name: /ابدئي التقييم/ }).count() === 0);
    check('B4e', 'no skill level was granted in the database', await count('select count(*)::int n from skill_claim where user_id = $1', [u.id]) === 0);
    await shot(page, 'U4-evaluation-demo-desktop');
    await page.context().close();
  }

  // B5 · not-yet-evaluated: reading never starts a run; the explicit button does, once.
  {
    const u = demoUser; const page = await pageFor(browser, u);
    const up = async (name, content) => {
      const intent = await apiCall(u, 'POST', '/uploads', { declaredName: name, contentType: 'text/plain', declaredSize: content.length });
      await fetch(intent.target.url, { method: 'PUT', headers: intent.target.headers, body: content });
      await apiCall(u, 'POST', `/uploads/${intent.uploadId}/confirm`, {});
      return intent.uploadId;
    };
    const sub = await apiCall(u, 'POST', `/projects/${demoProjectId}/submissions`, { skillIds: ['a0000000-0000-4000-8000-000000000002'], artifacts: [],
      files: [{ uploadId: await up('a.jsx', 'x'), deliverableKey: 'file.component' }, { uploadId: await up('a.test.jsx', 'y'), deliverableKey: 'file.test' }], aiDisclosure: { declaredUse: [] } });
    await page.goto(`${APP}/evaluation?submission=${sub.id}`); await page.getByRole('button', { name: 'ابدئي التقييم' }).waitFor();
    await page.reload(); await page.getByRole('button', { name: 'ابدئي التقييم' }).waitFor();
    const evals = async () => count('select count(*)::int n from evaluation where submission_id = $1', [sub.id]);
    check('B5a', 'opening and refreshing a not-yet-evaluated submission starts nothing', await evals() === 0);
    await shot(page, 'U4-evaluation-not-evaluated-desktop');
    await page.getByRole('button', { name: 'ابدئي التقييم' }).dblclick();
    await page.getByRole('button', { name: /ابدئي التقييم|جارٍ التقييم/ }).waitFor({ state: 'detached' });
    check('B5b', 'the explicit button (double-clicked) started exactly one evaluation', await evals() === 1);

    // B6 · multiple attempts: the project shows both, My Work counts them, each attempt's feedback is reachable.
    await page.goto(`${APP}/work/${demoProjectId}`); await page.getByRole('heading', { name: 'محاولاتك' }).waitFor();
    const attempts = await page.getByRole('link', { name: /الملاحظات/ }).count();
    check('B6a', 'the workspace lists every attempt with a link to its feedback', attempts === 2, `${attempts}`);
    await page.goto(`${APP}/work`); await page.locator('article').first().waitFor();
    const work = await bodyText(page);
    check('B6b', 'My Work shows the attempts count and a next action', /المحاولات: 2/.test(work) && await page.getByRole('link', { name: /اقرئي|اطّلعي|افتحي|تابعي/ }).count() >= 1);
    check('B6c', 'My Work separates completed work from a skill level', /اكتمال العمل وتقييمه ليس مستوى مهارة/.test(work) && /سجّل تغيّرًا في مستوى مهارة: 0/.test(work));
    await shot(page, 'U6-my-work-desktop');
    await page.context().close();
  }

  // B7 / B11 / B12 · human-reviewed activity, SME-approved non-demo content. ENG-1 P0 (D-121): the legacy evaluator moves
  // ONE skill per evaluation and only when exactly one claimed skill is primary for the activity AND measured by the
  // rubric; otherwise no level is recorded and the graduate is told why (O-1). Each journey states one fact.
  const HTML_AR = 'بنية HTML الدلالية'; const CSS_AR = 'تنسيق CSS والتصميم المتجاوب';
  const reSkill = (label) => new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  async function reviewedSubmission(u, keepOnly /* null = the work page's default selection; a label or a list of labels */, activityId = reviewed.activityId, chip = 'يُراجَع بشريًا') {
    await apiCall(u, 'PUT', '/me/career-goal', { targetRoleId: reviewed.roleId, confirmed: true });
    const page = await pageFor(browser, u);
    await page.goto(`${APP}/activities/${activityId}`); await page.getByText(chip).first().waitFor();
    const activityText = await bodyText(page);
    await page.getByRole('button', { name: 'ابدئي النشاط' }).click();
    await page.waitForURL(/\/work\//); await page.getByRole('heading', { name: 'المخرجات المطلوبة' }).waitFor();
    const projectId = page.url().split('/').pop();
    await uploadInto(page, 'file.app_js', 'app.js', 'const state = {};');
    await uploadInto(page, 'file.index_html', 'index.html', '<form></form>');
    await uploadInto(page, 'file.styles_css', 'styles.css', 'form { display: grid; }');
    await page.locator(fileInput('note.data_flow')).fill('تُحفظ الحالة في كائن واحد، وتُعرض القائمة منه؛ التحميل والخطأ والفراغ حالات صريحة.');
    await page.locator(fileInput('answer.clarification')).fill('الوصف يذكر أربعة حقول والمواصفة خمسة؛ نفّذتُ الأربعة وطرحتُ الخامس سؤالًا.');
    const group = page.locator('[aria-labelledby="skills-title"]');
    const defaultChecked = await group.locator('input[type=checkbox]:checked').count();
    if (keepOnly) {
      for (const box of await group.getByRole('checkbox').all()) await box.setChecked(false);
      for (const label of [keepOnly].flat()) await group.getByRole('checkbox', { name: reSkill(label) }).setChecked(true);
    }
    await answerQuestionnaire(page);
    await page.getByRole('button', { name: 'تسليم للتقييم' }).click();
    await page.waitForURL(/\/evaluation\?submission=/); await page.getByText('عملك قيد المراجعة البشرية').waitFor();
    const sid = new URL(page.url()).searchParams.get('submission');
    return { page, sid, projectId, activityText, defaultChecked };
  }
  async function finishReview(page, sid, levels) {
    await reviewEverything((await one('select id from evaluation where submission_id = $1', [sid])).id, levels);
    await page.reload(); await page.locator('#crit').waitFor();
    return bodyText(page);
  }

  // B7 · the work page's DEFAULT selection (every primary skill of the activity): pending review reads as pending and
  // says no level will follow; after every criterion is decided, the work is reported as assessed, no level is
  // recorded for ANY skill (no arbitrary pick — F-2), and nothing says a skill was failed.
  {
    const u = await newUser();
    const { page, sid, projectId, activityText, defaultChecked } = await reviewedSubmission(u, null);
    check('B7a', 'a human-reviewed activity explains that a reviewed pass may raise the level, never to Verified automatically', /قد يرتفع مستوى المهارة/.test(activityText) && /لا يُمنح مستوى «موثّقة» تلقائيًا/.test(activityText));
    const pending = await bodyText(page);
    check('B7b', 'a pending human review reads as pending, naming what awaits review, without an error', /ما ينتظر المراجعة/.test(pending) && !/request failed|already|خطأ/.test(pending));
    check('B7h', 'with several primary skills selected (the default: ' + defaultChecked + '), the pending page already says no level will follow', defaultChecked > 1 && /لن يُسجَّل مستوى لأي مهارة من هذا التقييم/.test(pending));
    await page.reload(); await page.getByText('عملك قيد المراجعة البشرية').waitFor();
    check('B7c', 'refreshing a pending review starts nothing', await count('select count(*)::int n from evaluation where submission_id = $1', [sid]) === 1);
    check('B7d', 'no level while review is pending', !/تغيّر مستوى المهارة/.test(await bodyText(page)) && await count('select count(*)::int n from skill_claim where user_id = $1', [u.id]) === 0);
    await shot(page, 'U4-evaluation-human-review-pending-desktop');
    const after = await finishReview(page, sid);
    const claims = await count('select count(*)::int n from skill_claim where user_id = $1', [u.id]);
    const evidence = await count('select count(*)::int n from evidence where user_id = $1', [u.id]);
    check('B7e', 'after every criterion is decided: the work is reported as completed and assessed, NO level is recorded for any skill (no arbitrary pick), and the reason is given',
      claims === 0 && evidence === 0 && /اكتمل النشاط وقُيِّم عملك/.test(after) && /أكثر من مهارة رئيسية/.test(after) && !/مُثبتة بدليل/.test(after), `claims=${claims} evidence=${evidence}`);
    check('B7i', 'nothing tells the graduate a skill was failed; criteria are shown as assessed', /ليس إخفاقًا/.test(after) && !/أخفقتِ|رسبتِ|فشلتِ/.test(after) && /الملاحظات على كل معيار/.test(after));
    check('B7f', 'Verified is never shown as granted', !/← موثّقة/.test(after) && await count(`select count(*)::int n from skill_claim where user_id = $1 and state = 'verified'`, [u.id]) === 0);
    await shot(page, 'U4-evaluation-assessed-no-attribution-desktop');
    await page.goto(`${APP}/work`); await page.locator('article').first().waitFor();
    const myWork = await bodyText(page);
    check('B7g', 'My Work reports that work as assessed, and does NOT report a level change', /قُيِّم — الملاحظات جاهزة/.test(myWork) && !/تغيّر مستوى المهارة/.test(myWork));
    await page.goto(`${APP}/work/${projectId}`); await page.getByRole('heading', { name: 'محاولاتك' }).waitFor();
    await page.context().close();
  }

  // B11 · the legitimate path is intact: ONE primary skill selected ⇒ after the named review, the level the backend
  // recorded (Demonstrated, never Verified) is shown, and My Work reports it for that work only.
  {
    const u = await newUser();
    const { page, sid } = await reviewedSubmission(u, HTML_AR);
    const after = await finishReview(page, sid);
    const claim = await one('select state from skill_claim where user_id = $1', [u.id]);
    const nClaims = await count('select count(*)::int n from skill_claim where user_id = $1', [u.id]);
    check('B11a', 'one primary skill selected: after a named reviewer decided on SME-approved, non-demo content, the level change the backend recorded is shown', claim?.state === 'demonstrated' && nClaims === 1 && /مُثبتة بدليل/.test(after), `${claim?.state}/${nClaims}`);
    check('B11b', 'no attribution notice beside a recorded level', !/لم يُسجَّل مستوى لأي مهارة/.test(after));
    check('B11c', 'Verified is never shown as granted', !/← موثّقة/.test(after));
    check('B11e', 'P5: a legacy (single-skill) evaluation renders exactly as before — no per-skill section', await page.locator('[data-testid="per-skill-results"]').count() === 0 && !/نتيجة كل مهارة/.test(after));
    await shot(page, 'U4-evaluation-level-recorded-desktop');
    await page.goto(`${APP}/work`); await page.locator('article').first().waitFor();
    check('B11d', 'My Work reports the recorded level change for that work only', /قُيِّم — تغيّر مستوى المهارة/.test(await bodyText(page)));
    await page.context().close();
  }

  // B12 · a skill the activity measures only as SECONDARY is never promoted by the whole-activity result; the
  // graduate is told the work was assessed and why no level was recorded.
  {
    const u = await newUser();
    const { page, sid } = await reviewedSubmission(u, CSS_AR);
    const after = await finishReview(page, sid);
    check('B12a', 'only a secondary skill selected: no level is recorded', await count('select count(*)::int n from skill_claim where user_id = $1', [u.id]) === 0 && await count('select count(*)::int n from evidence where user_id = $1', [u.id]) === 0);
    check('B12b', 'the graduate is told the work was assessed and why no level was recorded, without a claim of failure', /اكتمل النشاط وقُيِّم عملك/.test(after) && /ليست من المهارات الرئيسية/.test(after) && /ليس إخفاقًا/.test(after));
    await shot(page, 'U4-evaluation-secondary-only-desktop');
    await page.context().close();
  }

  // B13 · ENG-1 P5 — per-skill results (DEVELOPMENT PATHWAY ONLY). The harness switches to a test-only per_skill policy with the
  // explicit opt-in (migration 0029) for these scenarios and restores the D-118 safety baseline right after.
  await usePerSkillDevelopmentPolicy();
  try {
    // Skills are identified through the activity's own rubric (canonical ids), never by slug: other suites may leave same-slug rows.
    const crit = async (key) => (await one(`select canonical_skill_id(rc.linked_skill_id) as id from rubric_criterion rc join rubric_version rv on rv.id = rc.rubric_version_id
      where rv.activity_spec_id = $1 and not rv.is_demo_fixture and rc.key = $2 order by rv.created_at desc limit 1`, [reviewed.activityId, key])).id;
    const HTML_ID = await crit('semantic_structure'); const FORMS_ID = await crit('form_validation');
    const FORMS_AR = (await one(`select label_ar from skill where id = $1`, [FORMS_ID])).label_ar;
    const NO_FAILURE = (t) => !/أخفقتِ|رسبتِ|فشلتِ|راسب/.test(t);
    const NO_INTERNALS = (t) => !/threshold|0\.5|per_skill@|basis|descriptor/i.test(t);
    // B13a–f · mixed: HTML met, form validation not met, within one activity; pending review first.
    {
      const u = await newUser();
      const { page, sid } = await reviewedSubmission(u, [HTML_AR, FORMS_AR]);
      await page.locator('[data-testid="per-skill-results"]').waitFor();
      const pending = await bodyText(page);
      const pendingSkills = await page.locator('[data-testid="skill-result"]').count();
      check('B13a', 'pending human review: each selected skill is listed as awaiting the reviewer, and no level is decided yet',
        pendingSkills === 2 && (pending.match(/بانتظار المراجِع/g) ?? []).length >= 2 && /لا يُحسم المستوى قبل اكتمال المراجعة/.test(pending) && /عملك قيد المراجعة البشرية/.test(pending));
      await shot(page, 'P5-evaluation-pending-review-desktop');
      const after = await finishReview(page, sid, { form_validation: 'missing' });
      const html = page.locator('[data-testid="skill-result"]', { hasText: HTML_AR });
      const forms = page.locator('[data-testid="skill-result"]', { hasText: FORMS_AR });
      const htmlText = await html.innerText(); const formsText = await forms.innerText();
      check('B13b', 'mixed result in ONE activity: HTML met with a recorded level change; form validation not met with no level change',
        /استوفت معاييرها/.test(htmlText) && /تغيّر المستوى: فجوة ← مُثبتة بدليل/.test(htmlText) && /لم تُستوفَ معاييرها بعد/.test(formsText) && /لم يتغيّر المستوى/.test(formsText), `${htmlText} || ${formsText}`);
      check('B13c', 'assessment outcome and level change are shown as two separate lines per skill, under a summary that counts recorded changes only',
        (await html.locator('[data-testid="skill-outcome"]').count()) === 1 && (await html.locator('[data-testid="skill-level"]').count()) === 1 && /تغيّر مستوى 1 من 2/.test(after) && /اكتمال النشاط لا يعني استيفاء كل مهارة/.test(after));
      check('B13d', 'no failure wording, no reviewer-only rubric values or internals, never Verified', NO_FAILURE(after) && NO_INTERNALS(after) && !/← موثّقة/.test(after));
      check('B13e', 'each skill lists only ITS OWN criteria by name', (await html.locator('li').count()) === 1 && (await forms.locator('li').count()) === 1 && !/التحقق|النموذج/.test(await html.locator('li').innerText()));
      check('B13f', 'the database agrees: HTML demonstrated, form validation not', (await one('select state from skill_claim where user_id = $1 and skill_id = $2', [u.id, HTML_ID]))?.state === 'demonstrated'
        && !(await one('select state from skill_claim where user_id = $1 and skill_id = $2', [u.id, FORMS_ID])));
      await shot(page, 'P5-evaluation-mixed-desktop');
      for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
        const p2 = await pageFor(browser, u, viewport);
        await p2.goto(`${APP}/evaluation?submission=${sid}`); await p2.locator('[data-testid="per-skill-results"]').waitFor(); await p2.waitForLoadState('networkidle');
        const issues = await a11yBasics(p2);
        check(`B13-a11y-${viewport.width}`, `per-skill evaluation at ${viewport.width}px: RTL, Arabic, labelled controls, named links, no horizontal scroll`, issues.length === 0, issues.join('; '));
        if (viewport.width === 375) await shot(p2, 'P5-evaluation-mixed-mobile');
        await p2.context().close();
      }
      // My Work: one chip per skill; the level change is attributed to HTML only.
      await page.goto(`${APP}/work`); await page.locator('[data-testid="work-skill-results"]').first().waitFor();
      const chips = await page.locator('[data-testid="work-skill-results"]').first().innerText();
      check('B13g', 'My Work shows the latest attempt skill by skill: HTML level changed, form validation not', new RegExp(`${HTML_AR}: تغيّر المستوى`).test(chips) && new RegExp(`${FORMS_AR}: لم تُستوفَ`).test(chips) && /تغيّر مستوى 1 من 2/.test(await bodyText(page)), chips);
      await shot(page, 'P5-my-work-per-skill-desktop');
      // Withdrawn evidence: the history stays; the level line says the evidence was withdrawn; no CV proposal from it.
      const ev = await one(`select e.id from evidence e where e.user_id = $1 and canonical_skill_id(e.skill_id) = $2`, [u.id, HTML_ID]);
      await apiCall(u, 'POST', `/evidence/${ev.id}/withdraw`, { reason: 'لم يكن العمل عملي بالكامل' });
      await page.goto(`${APP}/evaluation?submission=${sid}`); await page.locator('[data-testid="per-skill-results"]').waitFor();
      const w = await page.locator('[data-testid="skill-result"]', { hasText: HTML_AR }).innerText();
      check('B13h', 'withdrawn evidence: HTML still shows it was assessed and met, the recorded level is marked as withdrawn, and no CV proposal is offered from it',
        /استوفت معاييرها/.test(w) && /ثم سُحب دليله/.test(w) && !/اقتراح بند السيرة/.test(w), w);
      await shot(page, 'P5-evaluation-withdrawn-desktop');
      await page.context().close();
    }
    // B13i · thresholds not approved (DEMO content, values proposed): outcomes recorded as not decided; no level; nothing reads as failure.
    {
      const demo = await one(`select id from activity_spec where slug = 'act_fe_build_interface' and is_demo_fixture`);
      const demoRubric = await one(`select id, status from rubric_version where activity_spec_id = $1`, [demo.id]);
      if (demoRubric.status !== 'published') { // DEMO shortcut outside production, as the API e2e suites do
        await pool.query(`update rubric_version set status = 'curated' where id = $1 and status = 'draft'`, [demoRubric.id]); await pool.query(`update rubric_version set status = 'published' where id = $1`, [demoRubric.id]);
        await pool.query(`update activity_spec set status = 'curated' where id = $1 and status = 'draft'`, [demo.id]); await pool.query(`update activity_spec set status = 'published' where id = $1`, [demo.id]);
      }
      const u = await newUser();
      const { page, sid } = await reviewedSubmission(u, HTML_AR, demo.id, 'تجريبي — غير مراجَع');
      const after = await finishReview(page, sid);
      const t = await page.locator('[data-testid="skill-result"]').first().innerText();
      check('B13i', 'unapproved thresholds: the skill is shown as not decided (awaiting expert approval), no level, not a failure',
        /بانتظار اعتماد الخبراء/.test(t) && /لم يتغيّر المستوى/.test(t) && NO_FAILURE(after) && NO_INTERNALS(after)
        && await count('select count(*)::int n from evidence where user_id = $1', [u.id]) === 0, t);
      await shot(page, 'P5-evaluation-unapproved-thresholds-desktop');
      await page.context().close();
    }
  } finally {
    await useSafetyBaseline();
  }
  // B13j · after the development scenarios, a legacy evaluation again carries no per-skill section (the pathway is off at rest).
  check('B13j', 'the per-skill policy is inactive again after the scenarios', await count(`select count(*)::int n from verification_policy where assessment_scope = 'per_skill' and activation <> 'inactive'`) === 0);

  // B8 · unauthorized navigation: other users' work, unpublished activities, unknown ids; the old URL redirects.
  {
    const u = await newUser(); await apiCall(u, 'PUT', '/me/career-goal', { targetRoleId: FIXTURE.roleId, confirmed: true });
    const page = await pageFor(browser, u);
    const draft = (await one(`select id from activity_spec where status <> 'published' limit 1`)).id;
    for (const [id, label] of [[draft, 'draft'], [reviewed.activityId, "another role's"], ['00000000-0000-4000-8000-00000000abcd', 'unknown']]) {
      await page.goto(`${APP}/activities/${id}`); await page.getByRole('heading', { name: 'هذا النشاط غير متاح' }).waitFor();
      check(`B8-${label}`, `a ${label} activity id shows "not available" and offers no start`, await page.getByRole('button', { name: /ابدئي/ }).count() === 0);
    }
    await page.goto(`${APP}/work/${demoProjectId}`); await page.getByRole('heading', { name: 'مكان العمل غير متاح' }).waitFor();
    check('B8-work', "another graduate's workspace is not available", true);
    await page.goto(`${APP}/evaluation?submission=${demoSubmissionId}`); await page.getByText('لا نجد هذا التسليم ضمن أعمالك').waitFor();
    check('B8-eval', "another graduate's evaluation is not available, and opening it started nothing", await count('select count(*)::int n from evaluation where submission_id = $1', [demoSubmissionId]) === 1);
    await page.goto(`${APP}/project`); await page.waitForURL(`${APP}/activities`);
    check('B8-project', 'the former /project URL redirects to the catalogue', page.url().endsWith('/activities'));
    await page.context().close();
  }

  // B9 · upload errors: an oversize file is refused in words; submission stays blocked.
  {
    const u = await newUser(); await apiCall(u, 'PUT', '/me/career-goal', { targetRoleId: FIXTURE.roleId, confirmed: true });
    const p = await apiCall(u, 'POST', '/projects', { title: 'x', kind: 'platform_activity', activitySpecId: FIXTURE.activityId });
    const page = await pageFor(browser, u);
    await page.goto(`${APP}/work/${p.id}`); await page.getByRole('heading', { name: 'المخرجات المطلوبة' }).waitFor();
    await page.setInputFiles(fileInput('file.component'), { name: 'big.jsx', mimeType: 'text/plain', buffer: Buffer.alloc(UPLOAD_MAX_BYTES * 3, 97) });
    await page.locator(`${fileInput('file.component')}-state`).getByRole('alert').waitFor();
    const msg = await page.locator(`${fileInput('file.component')}-state`).innerText();
    check('B9a', 'an oversize upload is refused with an Arabic message in its slot', /تعذّر رفع الملف/.test(msg), msg);
    check('B9b', 'submission stays blocked while a mandatory file is missing', await page.getByRole('button', { name: /أكملي المطلوب أولًا/ }).isDisabled());
    check('B9c', 'nothing was submitted', await count('select count(*)::int n from submission where user_id = $1', [u.id]) === 0);
    await page.context().close();
  }

  // B10 · RTL, responsive (375 px) and basic accessibility on every journey screen.
  {
    const u = demoUser;
    const pages = [['/activities', 'U1-activities'], [`/activities/${FIXTURE.activityId}`, 'U2-activity-detail'], [`/work/${demoProjectId}`, 'U3-workspace'],
      [`/evaluation?submission=${demoSubmissionId}`, 'U4-evaluation'], ['/work', 'U6-my-work'], ['/goal', 'goal'], ['/skills', 'skills']];
    for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
      const page = await pageFor(browser, u, viewport);
      for (const [path, name] of pages) {
        await page.goto(`${APP}${path}`); await page.locator('h1').first().waitFor(); await page.waitForLoadState('networkidle');
        const issues = await a11yBasics(page);
        check(`B10-${viewport.width}-${name}`, `${name} at ${viewport.width}px: RTL, Arabic, labelled controls, named links/buttons, no horizontal scroll`, issues.length === 0, issues.join('; '));
        if (viewport.width === 375) await shot(page, `${name}-mobile`);
      }
      await page.context().close();
    }
    // Keyboard: the workspace controls are reachable with Tab in a sensible order.
    const page = await pageFor(browser, u);
    await page.goto(`${APP}/work/${demoProjectId}`); await page.getByRole('heading', { name: 'المخرجات المطلوبة' }).waitFor();
    const reached = new Set();
    for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); reached.add(await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)); }
    check('B10-keyboard', 'every workspace deliverable control is reachable by keyboard', ['deliverable-file-component', 'deliverable-file-test', 'deliverable-note-coverage'].every((id) => reached.has(id)), [...reached].join(','));
    await page.context().close();
  }
}

/* ───────────────────────────── main ───────────────────────────── */

let api, next, browser;
try {
  if (!process.argv.includes('--skip-build')) buildApp();
  api = await startApi();
  next = await startApp();
  const { chromium } = appRequire('playwright-core');
  browser = await chromium.launch({ executablePath: CHROME });
  await run(browser);
} catch (e) {
  check('HARNESS', 'the run completed', false, (e && e.stack) || String(e));
  for (const p of openPages) { if (!p.isClosed()) await p.screenshot({ path: join(SHOTS, `FAILURE-${Date.now()}.png`), fullPage: true }).catch(() => undefined); }
} finally {
  await browser?.close().catch(() => undefined);
  if (next) stopApp(next);
  await api?.close().catch(() => undefined);
  await pool.end().catch(() => undefined);
}
const failed = results.filter((r) => !r.pass);
writeFileSync(join(SHOTS, 'results.json'), JSON.stringify({ at: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed. Screenshots and results: ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
