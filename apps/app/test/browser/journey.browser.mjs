#!/usr/bin/env node
/**
 * Graduate activity journey — Phase 2 browser acceptance (real browser, real API, real database).
 *
 *   DATABASE_URL=postgresql://…/naqla_e2e node apps/app/test/browser/journey.browser.mjs [--skip-build] [--only B14]
 *
 * What runs:
 *   - the NestJS API from apps/api/dist (the same AppModule the product runs), with the storage TEST DOUBLE served
 *     over HTTP so the browser can PUT to its signed URLs (test harness only — never product code);
 *   - the Next.js app, built with its public env pointing at this harness, served by `next start`;
 *   - Chromium (pre-installed) through playwright-core.
 * Authentication: a session signed with the API's test secret is placed where supabase-js keeps it; the API
 * verifies the signature exactly as in production. No Supabase project is contacted.
 *
 * B14 covers the Junior Frontend v2 candidate's classification labels (learner + admin), development only.
 * B15 is the D-135/D-136 development pilot: the v2 candidate loaded and published as DEMO pilot content by an authorized
 * (TEST FIXTURE) Product Owner, then one complete graduate journey: role → activities → Task B → submission → human
 * review → an undetermined, experimental result with per-skill feedback. Can run alone: --only B15.
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
/** `--only B14`: the v2 scenario alone, intended for a freshly built database (a clean, deterministic fixture). */
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
/** `--only B14 --existing-db`: the same scenario on an existing (non-clean) database, e.g. after the API e2e suites. */
const ISOLATED = ONLY === 'B14' && !process.argv.includes('--existing-db');
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
const { useSafetyBaseline, useCandidateClassification } = apiRequire('./dist/test/helpers');
const { loadCandidate } = apiRequire('./dist/src/career-data/candidate');
const { roleSkillVisibility } = apiRequire('./dist/src/career-data/publication-safety');
const { promoteDemo } = apiRequire('./dist/src/career-data/promotion');
const { reviewTransition, approveRubricValues } = apiRequire('./dist/src/career-data/review');
const { loadPilotCandidate, publishPilotDemo, usePilotPerSkillPolicy } = apiRequire('./dist/src/career-data/pilot-loader');
const { loadPilotMaterials } = apiRequire('./dist/src/career-data/material-loader');
const { loadLearningCandidates } = apiRequire('./dist/src/career-data/learning-candidate-loader');
const { loadPilotManagerScenarios } = apiRequire('./dist/src/career-data/manager-scenario-loader');
const { readZip } = apiRequire('./dist/src/career-data/zip');
let apiStorage = null;

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
  apiStorage = storage;
  // TEST HARNESS ONLY: the memory double's signed download URL becomes an HTTP URL the browser can GET (Phase B package 3).
  const originalDownload = storage.createSignedDownload.bind(storage);
  storage.createSignedDownload = async (...args) => (await originalDownload(...args)).replace('memory://download/', `${API}/__test-storage/download/`);
  app.use('/__test-storage/download/', (req, res) => {
    try {
      const bytes = storage.get(`memory://download/${req.url.replace(/^\//, '')}`);
      res.setHeader('content-type', 'application/zip'); res.setHeader('content-disposition', 'attachment'); res.end(Buffer.from(bytes));
    } catch (e) { res.statusCode = 404; res.end(String(e)); }
  });
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

/* ───────────────────────────── B14 (can run alone: --only B14) ───────────────────────────── */

async function scenarioB14(browser) {
  // B14 · Junior Frontend v2 CANDIDATE (DEVELOPMENT ONLY). A classification built from data/candidates/trk_frontend_junior_v2
  // (TEST FIXTURE approvals) is made development_only for the Junior Frontend role, then switched off again. What the
  // learner and the track admin SEE: «إلزامية / أساسية / مساندة», the PO-default provenance, the read-only class in the
  // Track Builder with no is_core edit, and the legacy labels back once the classification is off.
  {
    const jfeRole = (await one(`select id from target_role where slug = 'frontend-developer-junior' and is_demo_fixture`)).id;
    const { pack } = loadCandidate(join(ROOT, 'data/candidates/trk_frontend_junior_v2'), join(ROOT, 'data/career'));
    const classOf = new Map(pack.track.roleSkills.map((r) => [r.skill, r]));
    const BADGE = { must: 'إلزامية', core: 'أساسية', supporting: 'مساندة' };
    const PO_NOTE = 'تصنيف افتراضي من مالك المنتج، غير معتمد من الخبراء';
    const learner = await newUser();
    await apiCall(learner, 'PUT', '/me/career-goal', { targetRoleId: jfeRole, confirmed: true });
    const admin = await newUser();
    await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'track_admin', 'UI acceptance operator')`, [admin.id]);
    const isCoreLabel = (await apiCall(admin, 'GET', `/admin/tracks/${jfeRole}`)).fieldHelp.is_core?.labelAr ?? 'is_core';
    // Publication safety: a role whose requirement references a superseded / learner-invisible skill cannot be classified
    // (Q25 gate). On a database where that state exists (e.g. after the OPEN-040 promotion suite) the scenario proves the
    // refusal; on a clean fixture (--only B14) it proves the v2 labels.
    const offenders = (await roleSkillVisibility(pool, jfeRole)).filter((r) => r.hidden || r.unusable);
    if (offenders.length) {
      const refusal = await useCandidateClassification(pool, jfeRole).then(() => null, (e) => e.message);
      check('B14-gate', `the classification is refused while a requirement references a superseded or learner-invisible skill (${offenders.map((o) => o.skill).join(', ')})`,
        !ISOLATED && /\(Q25\)/.test(refusal ?? '') && offenders.every((o) => refusal.includes(o.skill)), refusal ?? 'not refused');
      return;
    }
    const cls = await useCandidateClassification(pool, jfeRole);
    try {
      const page = await pageFor(browser, learner);
      await page.goto(`${APP}/skills`); await page.getByRole('heading', { name: 'المهارات' }).waitFor(); await page.waitForLoadState('networkidle');
      const rows = await page.locator('a.row[href^="/skills/"]').evaluateAll((as) => as.map((a) => ({ id: a.getAttribute('href').split('/').pop(), text: a.innerText })));
      const slug = new Map((await pool.query('select id::text, slug from skill where id = any($1)', [rows.map((r) => r.id)])).rows.map((r) => [r.id, r.slug]));
      // Expected rows come from the visibility rule itself (0024 graduate_content_visible), not from a count.
      const vis = (await pool.query(`select s.id::text, s.slug, graduate_content_visible(s.review_status, s.is_demo_fixture) as visible from role_requirement rr join skill s on s.id = rr.skill_id
          where rr.target_role_id = $1 and s.status = 'active' and graduate_content_visible(rr.review_status, rr.is_demo_fixture)`, [jfeRole])).rows;
      const expectedIds = vis.filter((v) => v.visible).map((v) => v.id).sort();
      const hidden = vis.filter((v) => !v.visible).map((v) => v.slug).sort();
      check('B14-vis', `visibility follows rule 0024 exactly: the rows are the role's graduate-visible skills (${expectedIds.length} of ${vis.length}); hidden: ${hidden.join(', ') || 'none'}`,
        JSON.stringify(rows.map((r) => r.id).sort()) === JSON.stringify(expectedIds) && (!ISOLATED || (rows.length === 12 && hidden.length === 0 && [...slug.values()].includes('skl_forms_validation'))),
        `${rows.length} rows${ISOLATED ? ' (isolated, clean fixture: all 12 expected, Forms validation included)' : ''}`);
      const wrong = rows.filter((r) => { const c = classOf.get(slug.get(r.id)); return !c || !r.text.includes(BADGE[c.professional_class]); });
      check('B14a', 'v2 learner labels: every skill shows its candidate class in Arabic (إلزامية / أساسية / مساندة); six are Must',
        rows.length === expectedIds.length && wrong.length === 0 && rows.filter((r) => r.text.includes('إلزامية')).length === 6, `${rows.length} rows; wrong: ${wrong.map((r) => slug.get(r.id)).join(',')}`);
      const provenanceWrong = rows.filter((r) => (classOf.get(slug.get(r.id))?.class_source === 'po_default') !== r.text.includes(PO_NOTE));
      check('B14b', 'provenance: exactly the PO-default classes carry «افتراضي من مالك المنتج، غير معتمد من الخبراء»; expert classes do not',
        provenanceWrong.length === 0 && rows.filter((r) => r.text.includes(PO_NOTE)).length === rows.filter((r) => classOf.get(slug.get(r.id))?.class_source === 'po_default').length && rows.some((r) => r.text.includes(PO_NOTE)),
        `${rows.filter((r) => r.text.includes(PO_NOTE)).length} PO-default rows${provenanceWrong.length ? `; wrong: ${provenanceWrong.map((r) => slug.get(r.id)).join(',')}` : ''}`);
      await shot(page, 'B14-skills-v2');
      const idOf = (s) => [...slug].find(([, v]) => v === s)?.[0];
      await page.goto(`${APP}/skills/${idOf('skl_version_control_basics')}`); await page.locator('h1').first().waitFor(); await page.waitForLoadState('networkidle');
      const git = await bodyText(page);
      await page.goto(`${APP}/skills/${idOf('skl_requirements_reading')}`); await page.locator('h1').first().waitFor(); await page.waitForLoadState('networkidle');
      const reqs = await bodyText(page);
      check('B14c', 'skill detail: Git reads «إلزامية» with no PO note; Requirements reading reads «مساندة» with the PO-default note',
        git.includes('إلزامية') && !git.includes(PO_NOTE) && reqs.includes('مساندة') && reqs.includes(PO_NOTE));
      check('B14d', 'no Verified, no percentage and no readiness verdict is implied by a class', !/موثّقة|%|جاهز للعمل/.test(git + reqs));
      if (idOf('skl_forms_validation')) {
        await page.goto(`${APP}/skills/${idOf('skl_forms_validation')}`); await page.locator('h1').first().waitFor(); await page.waitForLoadState('networkidle');
        const forms = await bodyText(page);
        check('B14c-forms', 'Forms validation detail: «مساندة» with the PO-default note', forms.includes('مساندة') && forms.includes(PO_NOTE));
      } else if (ISOLATED) check('B14c-forms', 'Forms validation detail: «مساندة» with the PO-default note', false, 'Forms validation is not visible on the clean fixture');
      await shot(page, 'B14-skill-detail-po-default');
      await page.context().close();
      for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
        const p2 = await pageFor(browser, learner, viewport);
        await p2.goto(`${APP}/skills`); await p2.locator('h1').first().waitFor(); await p2.waitForLoadState('networkidle');
        const issues = await a11yBasics(p2);
        check(`B14-a11y-${viewport.width}`, `v2 skills page at ${viewport.width}px: RTL, Arabic, labelled controls, named links, no horizontal scroll`, issues.length === 0, issues.join('; '));
        await p2.context().close();
      }
      const ap = await pageFor(browser, admin);
      await ap.goto(`${APP}/admin/tracks/${jfeRole}`); await ap.getByRole('heading', { name: 'مهارات المسار' }).waitFor(); await ap.waitForLoadState('networkidle');
      const at = await bodyText(ap);
      check('B14e', 'admin Track Builder: the classification-in-effect notice is shown; classes are read-only with their source (6 expert Must, 2 PO defaults)',
        await ap.locator('[data-testid="classification-in-effect"]').count() === 1 && (at.match(/إلزامية · قرار خبير \(للتطوير فقط\)/g) ?? []).length === 6
          && (at.match(/افتراضي من مالك المنتج، غير معتمد من الخبراء \(للتطوير فقط\)/g) ?? []).length === 2, `${(at.match(/إلزامية · قرار خبير/g) ?? []).length} Must chips`);
      await ap.getByRole('button', { name: 'اقتراح تغيير' }).first().click();
      const offered = await ap.getByText('اقتراح تغيير هذا الحقل').count();
      check('B14f', `admin: the proposal editor of a classified track offers 7 of the 8 fields — no «${isCoreLabel}» (is_core); the class changes only by a new classification version`, offered === 7, `${offered} fields offered`);
      const issues = await a11yBasics(ap);
      check('B14-admin-a11y', 'admin track page: RTL, Arabic, labelled controls, named buttons, no horizontal scroll', issues.length === 0, issues.join('; '));
      await shot(ap, 'B14-admin-track-v2');
      await ap.context().close();
    } finally {
      await cls.off();
    }
    {
      const page = await pageFor(browser, learner);
      await page.goto(`${APP}/skills`); await page.getByRole('heading', { name: 'المهارات' }).waitFor(); await page.waitForLoadState('networkidle');
      const after = (await page.locator('a.row[href^="/skills/"]').allInnerTexts()).join('\n');
      check('B14g', 'classification off ⇒ the legacy labels are back on every skill row: no «إلزامية», no PO-default note', after.length > 0 && !after.includes('إلزامية') && !after.includes(PO_NOTE));
      await page.context().close();
      const ap = await pageFor(browser, admin);
      await ap.goto(`${APP}/admin/tracks/${jfeRole}`); await ap.getByRole('heading', { name: 'مهارات المسار' }).waitFor(); await ap.waitForLoadState('networkidle');
      check('B14h', 'classification off ⇒ no notice and no class chips in the Track Builder',
        await ap.locator('[data-testid="classification-in-effect"]').count() === 0 && !(await bodyText(ap)).includes('(للتطوير فقط)'));
      await ap.context().close();
    }
    check('B14i', 'nothing stays in effect: no active classification for the role', await count(`select count(*)::int n from skill_classification_set where target_role_id = $1 and activation <> 'inactive'`, [jfeRole]) === 0);
  }
}

/* ───────────────────────────── B15 (can run alone: --only B15) ───────────────────────────── */

async function scenarioB15(browser) {
  // B15 · D-135/D-136 DEVELOPMENT PILOT of the Junior Frontend v2 candidate. Loaded as DEMO pilot content (undecided values
  // empty + TBD), published by an authorized TEST FIXTURE Product Owner (local development only; never an SME approval),
  // with the per-skill pilot policy on for the journey and the D-118 safety baseline restored afterwards.
  const LABEL = 'محتوى تجريبي غير معتمد مهنيًا';
  const report = await loadPilotCandidate(pool, { candidateDir: join(ROOT, 'data/candidates/trk_frontend_junior_v2'), canonicalRoot: join(ROOT, 'data/career'),
    byLabel: 'UI acceptance (D-135 pilot)', reason: 'B15 browser journey', production: false });
  // Phase B package 3: the original starter and reviewer materials, loaded while the activities are still draft.
  const mat = await loadPilotMaterials(pool, apiStorage, { materialsRoot: join(ROOT, 'data/candidates/trk_frontend_junior_v2/materials'), byLabel: 'UI acceptance (Phase B materials)', reason: 'B15 browser journey', production: false });
  await loadPilotManagerScenarios(pool, { scenariosFile: join(ROOT, 'data/candidates/trk_frontend_junior_v2/manager/scenarios.candidate.json'), byLabel: 'UI acceptance (A11 M1)', reason: 'B15 browser journey', production: false });
  const po = await newUser();
  await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'product_owner', 'UI acceptance (TEST FIXTURE Product Owner — not a governance decision)')`, [po.id]);
  await publishPilotDemo(pool, { operatorId: po.id, reason: 'B15 browser journey', nodeEnv: 'test', databaseUrl: process.env.DATABASE_URL });
  check('B15a', 'the pilot is published as DEMO content by the authorized Product Owner operation, with no SME approval and undecided values still empty',
    await count(`select count(*)::int n from activity_spec where target_role_id = $1 and status = 'published' and is_demo_fixture and sme_approved_by is null`, [report.role.id]) === 3
    && await count(`select count(*)::int n from rubric_version rv join activity_spec a on a.id = rv.activity_spec_id where a.target_role_id = $1 and rv.status = 'published' and rv.pass_threshold is null and rv.values_approved_at is null`, [report.role.id]) === 3
    && await count(`select count(*)::int n from review_log where role_performed = 'sme' and entity_id in (select id from activity_spec where target_role_id = $1)`, [report.role.id]) === 0);
  await usePilotPerSkillPolicy(pool, { byLabel: 'UI acceptance (D-136)', production: false });
  try {
    const u = await newUser(); const page = await pageFor(browser, u);
    // Role selection, in the UI.
    await page.goto(`${APP}/goal`); await page.getByRole('heading', { name: 'هدفك المهني' }).waitFor();
    await page.locator(`input[type=radio][value="${report.role.id}"]`).waitFor();
    const goalText = await bodyText(page);
    // Phase B package 1 (PO decision 1): the pilot is the role offered on its track; nothing is pre-selected; its profile is shown.
    const offered = await page.locator('input[type=radio][name=role]').evaluateAll((xs) => xs.map((x) => ({ v: x.value, c: x.checked })));
    const legacyOnTrack = (await pool.query(`select id::text from target_role where track_id = (select track_id from target_role where id = $1) and is_demo_fixture and id <> $1`, [report.role.id])).rows.map((r) => r.id);
    check('B16a', 'goal page: the pilot is offered and the older DEMO roles of its track are not; no role is pre-selected',
      offered.some((o) => o.v === report.role.id) && offered.every((o) => !legacyOnTrack.includes(o.v)) && offered.every((o) => !o.c), `${offered.length} offered`);
    await page.getByText('ما الذي يفعله صاحب هذا الدور؟').first().click();
    const profileText = await bodyText(page);
    check('B16b', 'goal page: the role profile shows its purpose, responsibilities, junior expectations, skill areas and an honest source line, marked as a draft',
      /الغاية من الدور/.test(profileText) && /مسؤوليات العمل المعتادة/.test(profileText) && /المتوقع من المبتدئ/.test(profileText) && /مجالات المهارة الرئيسية/.test(profileText)
      && /لم يُرفق مصدر موثَّق بهذا الوصف بعد/.test(profileText) && /وصف مسودة لم يعتمده خبير بعد/.test(profileText));
    await shot(page, 'B16-goal-profile-desktop');
    await page.setViewportSize({ width: 390, height: 844 }); await shot(page, 'B16-goal-profile-mobile'); await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator(`input[type=radio][value="${report.role.id}"]`).check();
    await page.getByRole('button', { name: /هذا هو هدفي المهني/ }).click();
    await page.waitForURL(`${APP}/activities`); await page.locator('article').first().waitFor();
    check('B15b', 'the pilot role is offered on the goal page as an unapproved internal pilot', /تجربة داخلية \(نسخة ثانية غير معتمدة\)/.test(goalText));
    const cards = page.locator('article');
    const cardTexts = await cards.allInnerTexts();
    check('B15c', 'the internal graduate sees all three pilot activities, each marked «محتوى تجريبي غير معتمد مهنيًا»',
      cardTexts.length === 3 && cardTexts.every((t) => t.includes(LABEL)) && await page.locator('[data-testid="experimental-chip"]').count() === 3, `${cardTexts.length} cards`);
    await shot(page, 'B15-pilot-activities-desktop');
    // Phase B package 1: the skill map explains each skill, uses accurate wording, and the detail answers the graduate's questions.
    await page.goto(`${APP}/skills`); await page.getByRole('heading', { name: 'المهارات' }).waitFor(); await page.waitForLoadState('networkidle');
    const skillRows = await page.locator('a.row[href^="/skills/"]').allInnerTexts();
    const skillsText = await bodyText(page);
    check('B16c', 'skill map: 12 skills, each with its short description and how many activities practise it; «لا يوجد دليل مُقيَّم بعد» and «ما سلّمتِه» replace «فجوة» and «مادة»',
      skillRows.length === 12 && skillRows.every((t) => t.split('\n').length >= 3 && /تتدرّبين عليها في|لا نشاط متاح بعد/.test(t) && t.includes('لا يوجد دليل مُقيَّم بعد') && t.includes('ما سلّمتِه'))
      && !/فجوة|مادة/.test(skillsText) && /من أين أبدأ؟/.test(skillsText), `${skillRows.length} rows`);
    await shot(page, 'B16-skill-map-desktop');
    await page.locator('a.row[href^="/skills/"]').first().click(); await page.locator('h1').first().waitFor(); await page.waitForLoadState('networkidle');
    await page.getByRole('heading', { name: 'كيف أُثبتها؟' }).waitFor();
    const detailText = await bodyText(page);
    check('B16d', 'skill detail answers: what it is, why the role needs it, how it looks at work, what to learn, how to practise, how to demonstrate it — then the four state cards',
      ['ما هذه المهارة؟', 'لماذا يحتاجها هذا الدور؟', 'كيف تبدو في العمل؟', 'ماذا أتعلّم وأين؟', 'كيف أتدرّب عليها؟', 'كيف أُثبتها؟', 'حالتك في هذه المهارة', '١ · رحلة المهارة'].every((h) => detailText.includes(h))
      && /لا يرفع المستوى وحده/.test(detailText) && !/فجوة|مادة مُقدَّمة|%|جاهز للعمل/.test(detailText));
    await shot(page, 'B16-skill-detail-desktop');
    await page.setViewportSize({ width: 390, height: 844 }); await shot(page, 'B16-skill-detail-mobile'); await page.setViewportSize({ width: 1280, height: 900 });
    // B19 · Phase B package 2 (PO decision 2): «ماذا أتعلّم وأين؟» — a graduate never sees an unverified resource; the
    // internal preview shows candidates, each labelled; the mandatory practice always follows.
    const skillUrl = page.url();
    const card = page.locator('[data-testid="learning-card"]');
    const plain = await card.innerText();
    check('B19a', 'learning card (ordinary graduate): the need, the honest fallback and the practice link; no candidate resource is shown',
      /لا يوجد بعد دليل مُقيَّم/.test(plain) && await page.locator('[data-testid="learning-fallback"]').count() === 1
      && await page.locator('[data-testid="learning-practice"] a[href^="/activities/"]').count() === 1 && await page.locator('[data-testid="learning-resource"]').count() === 0
      && /لا يغيّر مستواك/.test(plain));
    await loadLearningCandidates(pool, { candidatesDir: join(ROOT, 'data/candidates/trk_frontend_junior_v2/learning'), byLabel: 'UI acceptance (Phase B learning)', reason: 'B19 browser journey', production: false });
    process.env.LEARNING_CANDIDATE_PREVIEW = 'internal';
    try {
      await page.goto(skillUrl); await page.locator('[data-testid="learning-preview-label"]').waitFor();
      const items = page.locator('[data-testid="learning-resource"]');
      const n = await items.count();
      const exposures = await items.evaluateAll((xs) => xs.map((x) => x.getAttribute('data-exposure')));
      const itemTexts = await items.allInnerTexts();
      const links = await card.locator('a[target="_blank"]').evaluateAll((xs) => xs.map((x) => ({ rel: x.getAttribute('rel') ?? '', href: x.getAttribute('href') ?? '' })));
      check('B19b', 'internal preview: one candidate and at most two ranked alternatives, each labelled unverified, external links isolated, the practice after them',
        n >= 1 && n <= 3 && exposures.every((e) => e === 'candidate') && itemTexts.every((t) => /لم يُتحقَّق منه بعد/.test(t) && /المدة غير محددة/.test(t))
        && links.length >= 1 && links.every((l) => l.rel.includes('noopener') && l.href.startsWith('https://'))
        && await page.locator('[data-testid="learning-practice"]').count() === 1, `${n} items`);
      const dir = await card.evaluate((el) => getComputedStyle(el).direction);
      await shot(page, 'B19-learning-preview-desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await shot(page, 'B19-learning-preview-mobile'); await page.setViewportSize({ width: 1280, height: 900 });
      check('B19c', 'learning card is right-to-left and fits a 390px phone without horizontal scrolling', dir === 'rtl' && overflow <= 0, `dir=${dir} overflow=${overflow}`);
    } finally { delete process.env.LEARNING_CANDIDATE_PREVIEW; }
    // B20 · Phase B package 5: A01 next step, the Career Snapshot (FR-U-014) and two guidance capabilities (test provider only).
    await page.goto(skillUrl); await page.getByRole('heading', { name: 'مرشد التعلّم' }).waitFor();
    await page.locator('[data-testid="guidance-learning_guidance"] button').click();
    await page.locator('[data-testid="guidance-answer"]').waitFor();
    const learnTypes = await page.locator('[data-testid="guidance-learning_guidance"] [data-testid="guidance-item"]').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-type')));
    const learnText = await page.locator('[data-testid="guidance-learning_guidance"]').innerText();
    check('B20a', 'learning mentor (A07/A03): the practice and self-check questions, with the permanent test-provider notice; no solution',
      learnTypes.includes('followup_question') && /لا يعمل نموذج ذكاء اصطناعي حقيقي/.test(learnText) && !/REFERENCE|solution\//.test(learnText), learnTypes.join(','));
    await shot(page, 'B20-learning-mentor-desktop');
    await page.goto(`${APP}/skills`); await page.locator('[data-testid="a01-next-step"]').waitFor();
    const stepText = await page.locator('[data-testid="a01-next-step"]').innerText();
    const stepHref = await page.locator('[data-testid="a01-next-step"] a').getAttribute('href');
    check('B20b', 'A01: one next step on the skills page, explained; with no work started it points to the catalogue (it never assigns an activity)',
      /خطوتك التالية/.test(stepText) && /اختاري نشاطًا من أنشطة دورك/.test(stepText) && stepHref === '/activities', stepHref ?? '');
    await page.goto(`${APP}/snapshot`); await page.locator('[data-testid="snapshot-gaps"] li').first().waitFor();
    const gapsN = await page.locator('[data-testid="snapshot-gaps"] li').count();
    const sources = await page.locator('[data-testid="statement-source"]').allInnerTexts();
    const snapText = await bodyText(page);
    check('B20c', 'Career Snapshot: role, proven strengths (none yet, said plainly), three gaps with no invented priority, the next step — every statement names its source',
      gapsN === 3 && sources.length >= 5 && sources.every((x) => x.startsWith('المصدر:')) && /لا أولوية معتمدة/.test(snapText) && /لا توجد بعد/.test(snapText) && /لا تمنح مستوى/.test(snapText) && !/%|جاهز للعمل/.test(snapText), `${gapsN} gaps, ${sources.length} sources`);
    await page.locator('[data-testid="guidance-career_guidance"] button').click();
    await page.locator('[data-testid="guidance-career_guidance"] [data-testid="guidance-item"]').first().waitFor();
    const careerTypes = await page.locator('[data-testid="guidance-career_guidance"] [data-testid="guidance-item"]').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-type')));
    check('B20d', 'career guidance (A01/A02/A04, test provider): the same next step and the gaps, labelled as a test template, not real AI',
      careerTypes[0] === 'recruiter_next_action' && careerTypes.filter((t) => t === 'profile_gap').length === 3 && /لا يعمل نموذج ذكاء اصطناعي حقيقي/.test(await page.locator('[data-testid="guidance-career_guidance"]').innerText()), careerTypes.join(','));
    await shot(page, 'B20-snapshot-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    const snapOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const snapDir = await page.locator('main').evaluate((el) => getComputedStyle(el).direction);
    await shot(page, 'B20-snapshot-mobile'); await page.setViewportSize({ width: 1280, height: 900 });
    check('B20e', 'snapshot and guidance are right-to-left and fit a 390px phone', snapDir === 'rtl' && snapOverflow <= 0, `dir=${snapDir} overflow=${snapOverflow}`);
    // B21 · FR-U-013: self-assessment is a private starting point (Observed only) — never evidence, a level or a strength.
    await page.goto(`${APP}/self-assessment`); await page.locator('[data-testid="self-assessment-skill"]').first().waitFor();
    const saSkills = page.locator('[data-testid="self-assessment-skill"]');
    const saCount = await saSkills.count();
    const saNotice = await page.locator('[data-testid="self-assessment-notice"]').innerText();
    await saSkills.nth(0).getByLabel('متقدم').check();
    await saSkills.nth(1).getByLabel('لست متأكدة').check();
    await page.getByRole('button', { name: 'احفظي تقديري' }).click();
    await page.locator('[data-testid="self-assessment-saved"]').waitFor();
    const savedText = await page.locator('[data-testid="self-assessment-saved"]').innerText();
    check('B21a', 'self-assessment page: the 12 skills of the role, the scale plus «لست متأكدة», a notice that it is not evidence; saving says no level changed',
      saCount === 12 && /لا يُحتسب دليلًا/.test(saNotice) && /لم يتغيّر أي مستوى/.test(savedText), `${saCount} skills · ${savedText}`);
    await shot(page, 'B21-self-assessment-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    const saOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await shot(page, 'B21-self-assessment-mobile'); await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${APP}/skills`); await page.locator('a.row[href^="/skills/"]').first().waitFor();
    const rowsAfter = await page.locator('a.row[href^="/skills/"]').allInnerTexts();
    check('B21b', 'after self-rating «متقدم», every skill still reads «لا يوجد دليل مُقيَّم بعد» — a self-assessment never raises a level; the page fits a phone',
      rowsAfter.length === 12 && rowsAfter.every((t) => t.includes('لا يوجد دليل مُقيَّم بعد')) && saOverflow <= 0, `overflow=${saOverflow}`);
    await page.goto(`${APP}/snapshot`); await page.locator('[data-testid="snapshot-self"]').waitFor();
    const selfItems = await page.locator('[data-testid="snapshot-self"] li').count();
    const strengthsText = await page.locator('[data-testid="snapshot-strengths"]').innerText();
    check('B21c', 'snapshot: the self-assessment appears in its own section with its source; strengths stay empty',
      selfItems === 2 && /لا توجد بعد/.test(strengthsText) && /المصدر: تقييمك الذاتي/.test(await page.locator('[data-testid="snapshot-self"]').innerText()), `${selfItems} self-assessed`);
    await page.goto(`${APP}/activities`); await page.locator('article').first().waitFor();
    check('B15p', 'UX: each card says, in three short lines, what to do, what to hand in and what happens after — with one experimental label and no second demo chip',
      cardTexts.every((t) => /المطلوب/.test(t) && /تسلّمين/.test(t) && /بعد التسليم/.test(t) && !t.includes('تجريبي — غير مراجَع') && t.split(LABEL).length === 2));
    // Every activity page carries the notice.
    let allDetails = true;
    for (const a of report.activities) {
      await page.goto(`${APP}/activities/${a.activityId}`); await page.getByRole('heading', { name: 'كيف يُقيَّم عملك' }).waitFor();
      allDetails = allDetails && await page.locator('[data-testid="experimental-notice"]').count() === 1 && (await bodyText(page)).includes(LABEL);
    }
    check('B15d', 'each of the three activity pages shows the experimental notice', allDetails);
    // Task B: start, deliver, submit.
    const taskB = report.activities.find((a) => a.code === 'act_fe_change_request');
    await page.goto(`${APP}/activities/${taskB.activityId}`); await page.getByRole('heading', { name: 'كيف يُقيَّم عملك' }).waitFor();
    const brief = await page.locator('[data-testid="activity-brief"]').innerText();
    check('B15q', 'UX: the activity opens with a three-point brief (what to do, what to hand in, what happens after) and one notice, not two',
      /المطلوب منك/.test(brief) && /ما تسلّمينه: ملفان و3 إجابات مكتوبة/.test(brief) && /بعد التسليم/.test(brief) && /مراجِع مختص/.test(brief) && /لا يتغيّر مستوى أي مهارة/.test(brief)
      && await page.locator('.banner').count() === 1, brief.replace(/\n/g, ' | '));
    await shot(page, 'B15-pilot-activity-detail-desktop');
    // B18 · Phase B package 3: the activity lists its starter package; the workspace delivers it through a signed link.
    const detailBody = await bodyText(page);
    check('B18a', 'activity detail: the starter package is listed by name and size, to be downloaded after starting; no reviewer file is named',
      /مواد البداية: team-tasks-starter\.zip/.test(detailBody) && !/reviewer|REFERENCE|solution/i.test(detailBody) && !/غير متاح بعد/.test(detailBody));
    await page.getByRole('button', { name: 'ابدئي النشاط' }).click();
    await page.waitForURL(/\/work\//); await page.getByRole('heading', { name: 'المخرجات المطلوبة' }).waitFor();
    await page.getByRole('heading', { name: 'مواد البداية' }).waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'نزّلي الملفات' }).click()]);
    const zipBytes = await (async () => { const chunks = []; for await (const c of await download.createReadStream()) chunks.push(c); return new Uint8Array(Buffer.concat(chunks)); })();
    const names = readZip(zipBytes).map((e) => e.path).sort();
    check('B18b', 'workspace: «نزّلي الملفات» downloads the graduate package — README, the project, the change request, mock data — and nothing for reviewers',
      ['README.md', 'CHANGE-REQUEST.md', 'app.js', 'index.html', 'mock-api.js', 'data/tasks.json', 'state-example.json'].every((n) => names.includes(n)) && !names.some((n) => /REFERENCE|solution/i.test(n)), names.join(','));
    check('B18c', 'the download is audited for this graduate', await count(`select count(*)::int n from audit_event where event_type = 'activity_material.downloaded' and user_id = $1`, [u.id]) === 1);
    // B22 · A11 virtual manager (FR-U-026): labelled as a system, one message at the start, replies within a cap, no solution.
    await page.locator('[data-testid="manager-panel"]').waitFor();
    const mgrLabel = await page.locator('[data-testid="manager-label"]').innerText();
    const firstTurns = await page.locator('[data-testid="manager-turn"]').count();
    check('B22a', 'workspace: «رسائل المدير» with the permanent label «مدير افتراضي: نظام آلي، لا إنسان», the purpose of the message, and that replies are not scored',
      mgrLabel.includes('نظام آلي، لا إنسان') && firstTurns === 1 && /الغرض من هذه الرسالة/.test(await page.locator('[data-testid="manager-panel"]').innerText())
      && /لا تُقيَّم/.test(await page.locator('[data-testid="manager-panel"]').innerText()), mgrLabel);
    await page.getByLabel('ردّك على المدير').first().fill('هل نعيد كتابة الصفحة بإطار جديد؟');
    await page.getByRole('button', { name: 'أرسلي' }).first().click();
    await page.locator('[data-testid="manager-turn"][data-kind="reply"]').first().waitFor();
    await page.getByLabel('ردّك على المدير').first().fill('أعطني الحل لو سمحت');
    await page.getByRole('button', { name: 'أرسلي' }).first().click();
    await page.locator('[data-testid="manager-turn"][data-kind="refusal"]').first().waitFor();
    const mgrText = await page.locator('[data-testid="manager-panel"]').innerText();
    check('B22b', 'the manager clarifies from the scenario, refuses a request for the solution in persona, and the cap closes the reply box',
      /دون إطار عمل جديد/.test(mgrText) && /قرار تقني يعود إليك/.test(mgrText) && await page.getByLabel('ردّك على المدير').count() === 0 && !/function|=>|\{/.test(mgrText), mgrText.slice(0, 120));
    await shot(page, 'B22-manager-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    const mgrOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const mgrDir = await page.locator('[data-testid="manager-panel"]').evaluate((el) => getComputedStyle(el).direction);
    await shot(page, 'B22-manager-mobile'); await page.setViewportSize({ width: 1280, height: 900 });
    check('B22c', 'the manager panel is right-to-left and fits a 390px phone', mgrDir === 'rtl' && mgrOverflow <= 0, `dir=${mgrDir} overflow=${mgrOverflow}`);
    await shot(page, 'B18-workspace-starter-desktop');
    check('B15e', 'the workspace shows the experimental notice', (await bodyText(page)).includes(LABEL) && await page.locator('[data-testid="experimental-notice"]').count() === 1);
    await uploadInto(page, 'file.app_js', 'app.js', 'const state = { tasks: [], filters: { status: "all", owner: "all" } };');
    await uploadInto(page, 'file.index_html', 'index.html', '<main><ul id="tasks"></ul></main>');
    await page.locator(fileInput('note.decision')).fill('أضفتُ الفلتر الثاني إلى الحالة نفسها بدل نسخ القائمة، ليبقى للبيانات مصدر واحد.');
    await page.locator(fileInput('answer.explanation')).fill('يقرأ التغيير الفلترين معًا، وتظهر القائمة الفارغة رسالةً لا خطأً.');
    await page.locator(fileInput('answer.component_explained')).fill('المكوّن يستقبل القائمة المفلترة ويعرض العناصر أو حالة الفراغ.');
    await answerQuestionnaire(page);
    await shot(page, 'B15-pilot-workspace-ready-desktop');
    await page.getByRole('button', { name: 'تسليم للتقييم' }).click();
    await page.waitForURL(/\/evaluation\?submission=/); await page.getByText('عملك قيد المراجعة البشرية').waitFor();
    const sid = new URL(page.url()).searchParams.get('submission');
    check('B15f', 'submitted and awaiting human review; the pending result already carries the experimental notice', (await bodyText(page)).includes(LABEL));
    // Human review by a named reviewer (every criterion at its top level, to prove nothing becomes a pass).
    const reviewer = await newUser();
    await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'human_reviewer', 'UI acceptance operator (D-136 pilot)')`, [reviewer.id]);
    const evId = (await one('select id from evaluation where submission_id = $1', [sid])).id;
    const items = (await pool.query(`select q.id, q.criterion_key, (select l.level_key from rubric_criterion_level l where l.criterion_id = q.criterion_id order by l.score desc limit 1) as top
      from review_queue_item q where q.evaluation_id = $1 order by q.criterion_key`, [evId])).rows;
    for (const it of items) {
      await apiCall(reviewer, 'POST', `/review/queue/${it.id}/assign`, {});
      await apiCall(reviewer, 'GET', `/review/items/${it.id}`);
      await apiCall(reviewer, 'POST', `/review/items/${it.id}/decision`, { levelKey: it.top, rationale: 'لاحظتُ في الملفات المسلّمة ما يصفه هذا المعيار بوضوح.' });
    }
    await page.reload(); await page.locator('[data-testid="result-undetermined"]').waitFor();
    const result = await bodyText(page);
    check('B15g', 'the overall result reads «لم يُحدَّد بعد» — no pass, no fail, no level change — under the experimental notice',
      /النتيجة الإجمالية: لم يُحدَّد بعد/.test(result) && result.includes(LABEL) && !/اجتزتِ|نجحتِ|رسبتِ|أخفقتِ|فشلتِ|راسب|تغيّر مستوى المهارة/.test(result));
    const outcomes = await page.locator('[data-testid="skill-outcome"]').allInnerTexts();
    const levels = await page.locator('[data-testid="skill-level"]').allInnerTexts();
    check('B15h', 'per-skill feedback: every assessed skill reads «not yet decided» (threshold awaiting expert approval), none raised',
      outcomes.length > 0 && outcomes.every((t) => /لم تُحسم — بانتظار اعتماد الخبراء/.test(t)) && !levels.some((t) => /ارتفع|←/.test(t)), outcomes.join(' | '));
    check('B15i', "the reviewer's written observations are shown criterion by criterion", items.length > 0 && result.includes('لاحظتُ في الملفات المسلّمة'));
    check('B15j', 'no internal value is shown (weights, thresholds, TBD, null, model versions)', !/weight|threshold|TBD|null|per_skill@|عتبة/i.test(result));
    check('B15k', 'the database holds an undetermined result with no evidence, no level, no readiness evaluation and no claim',
      (await one(`select r.outcome::text as o from evaluation_result r join evaluation e on e.id = r.evaluation_id where e.submission_id = $1 and not exists (select 1 from evaluation_result n where n.supersedes_result_id = r.id)`, [sid])).o === 'undetermined'
      && await count('select count(*)::int n from evidence where user_id = $1', [u.id]) === 0
      && await count(`select count(*)::int n from skill_claim where user_id = $1 and state::text in ('practiced','demonstrated','verified')`, [u.id]) === 0
      && await count('select count(*)::int n from readiness_evaluation where user_id = $1', [u.id]) === 0
      && await count('select count(*)::int n from claim_draft_event where user_id = $1', [u.id]) === 0);
    const critNames = await page.locator('[data-testid="criterion-row"]').allInnerTexts();
    const decisions = await page.locator('[data-testid="criterion-decision"]').allInnerTexts();
    check('B15r', 'UX: every criterion is named in Arabic, says who decided it, and no raw identifier (snake_case key) is shown anywhere',
      critNames.length === items.length + 1 && decisions.filter((d) => d === 'المراجِع: مستوفى').length === items.length && decisions.includes('فحص آلي: مستوفى')
      && !/\b[a-z]+_[a-z_]+\b/.test(result), decisions.join(' | '));
    const judgements = await page.locator('[data-testid="three-judgements"]').innerText();
    check('B15s', 'UX: criteria met, the undetermined overall result and the unverified skill level are three separate lines; what was achieved and the next step are stated',
      /المعايير/.test(judgements) && /النتيجة الإجمالية/.test(judgements) && /مستوى المهارات/.test(judgements) && /لا يُتحقَّق من مستوى أي مهارة مهنيًا/.test(judgements)
      && /سلّمتِ النشاط كاملًا/.test(result) && await page.locator('[data-testid="next-step"]').count() === 1 && !/%/.test(result), judgements.replace(/\n/g, ' | '));
    const explanation = 'لكن حدّ الاستيفاء الخاص بها لم يعتمده الخبراء بعد';
    check('B15t', 'UX: the "awaiting expert approval" explanation is said once for all skills, not repeated under each skill or criterion',
      result.split(explanation).length === 2 && (result.match(/الحدّ بانتظار الاعتماد/g) ?? []).length === 1);
    await shot(page, 'B15-pilot-result-undetermined-desktop');
    await page.setViewportSize({ width: 375, height: 800 }); await page.reload(); await page.locator('[data-testid="result-undetermined"]').waitFor();
    check('B15l', 'the experimental result is readable at 375 px (RTL, no horizontal overflow)', (await a11yBasics(page)).length === 0, (await a11yBasics(page)).join('; '));
    await shot(page, 'B15-pilot-result-undetermined-mobile');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${APP}/work`); await page.locator('article').first().waitFor();
    check('B15m', 'My Work marks the pilot work as experimental', (await page.locator('article').first().innerText()).includes(LABEL));
    await page.context().close();
    // Tenant isolation: another graduate cannot open this result.
    const other = await newUser(); const op = await pageFor(browser, other);
    await op.goto(`${APP}/evaluation?submission=${sid}`); await op.getByText('لا نجد هذا التسليم ضمن أعمالك').waitFor();
    check('B15n', "another graduate cannot see this graduate's pilot result", !(await bodyText(op)).includes('لاحظتُ في الملفات المسلّمة'));
    await op.context().close();
  } finally {
    await useSafetyBaseline();
  }
  check('B15o', 'afterwards the D-118 safety baseline is in effect again', await count(`select count(*)::int n from verification_policy where key = 'default' and activation = 'legacy_baseline' and version = 2`) === 1
    && await count(`select count(*)::int n from verification_policy where key = 'default' and activation <> 'inactive'`) === 1);
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
    check('B2i', 'the workspace states that work is saved automatically as a private draft that is not evidence', /يُحفظ عملك تلقائيًا مسودةً خاصة بك/.test(ws) && /ليست تسليمًا ولا دليلًا/.test(ws));
    check('B17a', 'opening a workspace creates no draft, and the file controls are in Arabic', await count('select count(*)::int n from project_draft where project_id = $1', [demoProjectId]) === 0
      && (await page.locator('.file-pick__button').allInnerTexts()).every((t) => t.trim() === 'اختاري ملفًا') && !/Choose File|No file chosen/.test(ws));
    check('B2j', 'submit is disabled until the mandatory deliverables are present', await page.getByRole('button', { name: /أكملي المطلوب أولًا/ }).isDisabled());
    await shot(page, 'U3-workspace-empty-desktop');

    // B3 · upload in REVERSE order; the mapping follows the slot, not the order.
    await uploadInto(page, 'file.test', 'HabitList.test.jsx', 'test("empty", () => {});');
    await uploadInto(page, 'file.component', 'HabitList.jsx', 'export function HabitList() {}');
    await page.locator(fileInput('note.coverage')).fill('غطّت الاختبارات الحالة الفارغة والتحميل والخطأ؛ لم تغطِّ التقسيم إلى صفحات.');
    await answerQuestionnaire(page);
    // B17 · FR-U-025: the work is saved as a private draft and comes back after a reload — then the submission removes it.
    await page.locator('[data-testid="draft-save-state"]').getByText('تم الحفظ').waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500); await page.locator('[data-testid="draft-save-state"]').getByText('تم الحفظ').waitFor({ timeout: 15000 });
    const draftRow = (await pool.query('select texts, files, user_id from project_draft where project_id = $1', [demoProjectId])).rows[0];
    check('B17b', 'the draft is saved: the written answer and both file references, owned by the graduate, with no submission or evidence created',
      draftRow && draftRow.user_id === u.id && Object.keys(draftRow.files).sort().join(',') === 'file.component,file.test' && /الحالة الفارغة/.test(draftRow.texts['note.coverage'] ?? '')
      && await count('select count(*)::int n from submission where project_id = $1', [demoProjectId]) === 0 && await count('select count(*)::int n from evidence where user_id = $1', [u.id]) === 0);
    await page.reload(); await page.getByRole('heading', { name: 'المخرجات المطلوبة' }).waitFor();
    await page.locator(`${fileInput('file.component')}-state`).getByText('مرفوع').waitFor();
    const restored = await bodyText(page);
    check('B17c', 'after a reload the work is restored: file names, the written answer and the saved state are shown',
      /HabitList\.jsx/.test(restored) && /HabitList\.test\.jsx/.test(restored) && (await page.locator(fileInput('note.coverage')).inputValue()).includes('الحالة الفارغة')
      && /تم الحفظ/.test(restored) && (await page.locator('.file-pick__button').allInnerTexts()).every((t) => t.trim() === 'استبدلي الملف'));
    await shot(page, 'B17-workspace-restored-desktop');
    await page.setViewportSize({ width: 390, height: 844 }); await shot(page, 'B17-workspace-restored-mobile'); await page.setViewportSize({ width: 1280, height: 900 });
    await answerQuestionnaire(page);
    await shot(page, 'U3-workspace-ready-desktop');
    const submit = page.getByRole('button', { name: 'تسليم للتقييم' });
    check('B3a', 'submit becomes available once every mandatory deliverable is present', await submit.isEnabled());
    await submit.dblclick(); // a double click must not submit twice
    await page.waitForURL(/\/evaluation\?submission=/); await page.getByRole('heading', { name: 'نتيجة التقييم' }).waitFor();
    await page.locator('section.card, .next-action, .banner').first().waitFor();
    demoSubmissionId = new URL(page.url()).searchParams.get('submission');
    const files = (await pool.query(`select a.key, u.declared_name from submission_artifact a join upload u on u.id = a.upload_id where a.submission_id = $1 order by a.key`, [demoSubmissionId])).rows;
    check('B17d', 'submitting removed the draft (same transaction)', await count('select count(*)::int n from project_draft where project_id = $1', [demoProjectId]) === 0);
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
        /استوفت معاييرها/.test(htmlText) && /تغيّر المستوى: بلا دليل مُقيَّم ← مُثبتة بدليل/.test(htmlText) && /لم تُستوفَ معاييرها بعد/.test(formsText) && /لم يتغيّر المستوى/.test(formsText), `${htmlText} || ${formsText}`);
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
      const { page, sid } = await reviewedSubmission(u, HTML_AR, demo.id, 'محتوى تجريبي غير معتمد مهنيًا'); // UX pass: the one experimental notice replaces the second demo chip
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

  await scenarioB14(browser);
  await scenarioB15(browser);

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
  if (ONLY === 'B14') await scenarioB14(browser); else if (ONLY === 'B15') await scenarioB15(browser); else await run(browser);
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
