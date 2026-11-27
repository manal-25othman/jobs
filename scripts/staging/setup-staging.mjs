#!/usr/bin/env node
/**
 * One-off STAGING setup (run by the operator from a trusted machine, never by CI). Idempotent where possible.
 *   1. applies every migration in order to the staging database (and records them in naqla_migration),
 *   2. imports the canonical career data and loads the labelled pilot (pilot-load, materials, learning, manager),
 *   3. creates the invited tester accounts in Supabase Auth (no password: they sign in by e-mail link),
 *   4. grants the review / admin roles named in the role file,
 *   5. publishes the pilot ONLY if PILOT_STAGING_DECISION names an owner decision (otherwise it stops and says so).
 * `--step container` runs 1–5 from INSIDE the staging API container (Railway pre-deploy): no psql needed, every step
 * is recorded in naqla_migration and skipped on later deploys, and testers come from STAGING_TESTERS_JSON (the same
 * shape as testers.json, set in the host's variables, never in the repository).
 *
 * Reads (never prints) from the environment: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * NAQLA_ENV=staging. Tester e-mails come from a local file you keep OUTSIDE the repository:
 *   node scripts/staging/setup-staging.mjs --testers /path/outside/repo/testers.json [--step all|migrate|data|accounts|publish]
 * testers.json: [{ "email": "...", "displayName": "...", "roles": ["product_owner", "human_reviewer"] }, ...]
 * Roles: graduate (default, none needed), human_reviewer, sme, track_admin, product_owner.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const ROOT = new URL('../..', import.meta.url).pathname;
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const need = (k) => { const v = process.env[k]; if (!v) { console.error(`missing ${k} (set it in your shell from the provider's dashboard; never commit it)`); process.exit(2); } return v; };
if (process.env.NAQLA_ENV !== 'staging') { console.error('refused: NAQLA_ENV must be staging (this script never touches production)'); process.exit(2); }
const step = arg('--step') ?? 'all';
const DB = need('DATABASE_URL');
const host = new URL(DB.replace(/^postgres(ql)?:/, 'http:')).hostname;
console.log(`staging database host: ${host}`);
const pool = new Pool({ connectionString: DB, ssl: /localhost|127\.0\.0\.1/.test(host) ? false : { rejectUnauthorized: false } });

async function migrate() {
  await pool.query(`create table if not exists naqla_migration (file text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await pool.query('select file from naqla_migration')).rows.map((r) => r.file));
  for (const dir of ['supabase/migrations', 'supabase/seed']) {
    for (const f of readdirSync(join(ROOT, dir)).filter((x) => x.endsWith('.sql')).sort()) {
      const key = `${dir}/${f}`;
      if (done.has(key)) continue;
      // psql, statement by statement (as `supabase db push` does): some migrations add an enum value and use it.
      execFileSync('psql', ['-q', '-v', 'ON_ERROR_STOP=1', DB, '-f', join(ROOT, key)], { stdio: ['ignore', 'ignore', 'inherit'] });
      await pool.query('insert into naqla_migration (file) values ($1)', [key]);
      console.log(`applied ${key}`);
    }
  }
}

function cli(args) { execFileSync('node', ['scripts/career-data.mjs', ...args], { cwd: ROOT, stdio: 'inherit', env: process.env }); }
async function once(key, fn) {
  await pool.query(`create table if not exists naqla_migration (file text primary key, applied_at timestamptz not null default now())`);
  if ((await pool.query('select 1 from naqla_migration where file = $1', [key])).rowCount) { console.log(`already done: ${key}`); return; }
  await fn();
  await pool.query('insert into naqla_migration (file) values ($1) on conflict do nothing', [key]);
}
function dataVersion() {
  const h = createHash('sha256');
  const walk = (d) => { for (const n of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = join(d, n.name); if (n.isDirectory()) walk(p); else h.update(n.name).update(readFileSync(p)); } };
  walk(join(ROOT, 'data'));
  return h.digest('hex').slice(0, 16);
}
async function data() {
  await once(`data:${dataVersion()}`, dataOnce);
}
async function dataOnce() {
  cli(['import', 'trk_frontend_junior']);
  cli(['pilot-load', '--by', 'staging setup', '--reason', 'private staging trial (synthetic data)']);
  cli(['pilot-materials', '--by', 'staging setup', '--reason', 'private staging trial (synthetic data)']);
  cli(['pilot-learning', '--by', 'staging setup', '--reason', 'private staging trial (synthetic data)']);
  cli(['pilot-manager', '--by', 'staging setup', '--reason', 'private staging trial (synthetic data)']);
}

async function accounts() {
  const file = arg('--testers');
  let testers;
  if (step === 'container') {
    if (!process.env.STAGING_TESTERS_JSON) { console.log('accounts skipped: STAGING_TESTERS_JSON is unset'); return; }
    testers = JSON.parse(process.env.STAGING_TESTERS_JSON);
  } else {
    if (!file || file.startsWith(ROOT)) { console.error('pass --testers <file OUTSIDE the repository>'); process.exit(2); }
    testers = JSON.parse(readFileSync(file, 'utf8'));
  }
  const admin = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const allowed = (process.env.STAGING_ALLOWED_EMAILS ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  for (const t of testers) {
    const email = String(t.email).toLowerCase();
    if (!allowed.some((a) => (a.startsWith('@') ? email.endsWith(a) : email === a))) { console.error(`skip ${email}: not on STAGING_ALLOWED_EMAILS`); continue; }
    let id;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: t.displayName ?? null } });
    if (created.error && !/already/i.test(created.error.message)) throw new Error(`${email}: ${created.error.message}`);
    if (created.data?.user) id = created.data.user.id;
    else { const list = await admin.auth.admin.listUsers({ perPage: 1000 }); id = list.data.users.find((u) => u.email?.toLowerCase() === email)?.id; }
    await pool.query(`insert into app_user (id, display_name) values ($1, $2) on conflict (id) do nothing`, [id, t.displayName ?? 'مختبِر']);
    for (const role of t.roles ?? []) {
      await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) select $1, $2::role_performed, 'staging setup (private trial)'
                        where not exists (select 1 from reviewer_grant where user_id = $1 and role_performed = $2::role_performed and revoked_at is null)`, [id, role]);
    }
    console.log(`account ready: ${email} (${(t.roles ?? []).join(', ') || 'graduate'})`);
  }
}

async function publish() {
  if (!process.env.PILOT_STAGING_DECISION) { console.log('pilot NOT published: PILOT_STAGING_DECISION is unset (needs the owner decision; D-136 is local-only by default)'); return; }
  const po = (await pool.query(`select user_id from reviewer_grant where role_performed = 'product_owner' and revoked_at is null limit 1`)).rows[0];
  if (!po) { console.error('no product_owner grant yet: run --step accounts first'); process.exit(1); }
  await once(`publish:${process.env.PILOT_STAGING_DECISION}:${dataVersion()}`, async () => {
    cli(['pilot-policy', '--by', 'staging setup']);
    cli(['pilot-publish', '--operator', po.user_id, '--reason', `private staging trial under ${process.env.PILOT_STAGING_DECISION}`]);
  });
}

try {
  const all = step === 'all' || step === 'container';
  if (all || step === 'migrate') await migrate();
  if (all || step === 'data') await data();
  if (all || step === 'accounts') await accounts();
  if (all || step === 'publish') await publish();
} finally { await pool.end(); }
