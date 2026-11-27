#!/usr/bin/env node
/**
 * Records R2 results for the SIMULATED GitHub snapshots (local development machine only; needs the development
 * sandbox). Staging serves them with R2_MODE=recorded, labelled as recorded — no code ever runs on a deployed host.
 *   npm run build -w @naqla/runner -w @naqla/api && node scripts/r2-record-simulated.mjs
 * Keyed by `<activity>:<snapshotHash>`; the commit SHA is filled in at serve time (it depends on the simulated login).
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url).pathname;
const runner = require('../apps/runner/dist/index.js');
const domain = require('../packages/domain/dist/index.js');
const { SimulatedGitHub, SIMULATED_REPO_TEMPLATES } = require('../apps/api/dist/src/github/simulated-github.js');
const ACT = { 'leave-requests': 'act_fe_integrated_leave_requests', 'workshop-registration': 'act_fe_debug_improve', 'team-tasks': 'act_fe_change_request' };
const tree = (dir) => { const out = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.push({ path: relative(dir, p), content: readFileSync(p, 'utf8') }); } }; walk(dir); return out; };
const SAFE = /^(?!.*(^|\/)\.)[A-Za-z0-9_\-./]{1,160}\.(html|css|js|mjs|json|md|txt|svg)$/i;

const gh = new SimulatedGitHub();
const login = 'sim-recorder';
const grant = await gh.completeInstallation({ code: 'simulated', installationId: 1, requestedLogin: login, selectRepositories: SIMULATED_REPO_TEMPLATES.map((t) => `${login}/${t}`) });
const results = {};
for (const repo of grant.repositories) {
  const template = repo.fullName.split('/')[1];
  const activity = ACT[template];
  const pr = await gh.getPullRequest(1, repo.fullName, 1);
  const starter = tree(join(ROOT, 'data/candidates/trk_frontend_junior_v2/materials', activity, 'graduate')).filter((f) => SAFE.test(f.path));
  for (const c of await gh.listCommits(1, repo.fullName, pr.headSha, 10)) {
    const files = (await gh.snapshot(1, repo.fullName, c.sha)).filter((f) => SAFE.test(f.path));
    const key = `${activity}:${domain.snapshotHash(files)}`;
    if (results[key]) continue;
    const r = await runner.runAttempt({ pack: runner.packFor(activity), files, starterFiles: starter, commitSha: null, origin: 'synthetic' });
    results[key] = r;
    const auto = r.tests.filter((t) => t.mode === 'automated');
    console.log(`${activity} ${c.message.slice(0, 40).padEnd(40)} ${auto.filter((t) => t.outcome === 'pass').length}/${auto.length} ${r.status}`);
  }
}
const dir = join(ROOT, 'data/candidates/trk_frontend_junior_v2/r2-recorded');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'results.json'), JSON.stringify({ _label: 'RECORDED by the development runner for the SIMULATED GitHub snapshots — candidate packs, synthetic code. Served in staging with R2_MODE=recorded.', recordedAt: new Date().toISOString(), results }, null, 1) + '\n');
console.log(`recorded ${Object.keys(results).length} snapshots`);
