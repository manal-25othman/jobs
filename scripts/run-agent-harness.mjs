#!/usr/bin/env node
/**
 * Runs the agent evaluation harness (LOCAL TEST provider — TEST/NON-PRODUCTION)
 * and writes packages/agents/eval/last-run.json. Exit code 1 if any scenario fails.
 *
 *   npm run eval:agents
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { runHarness, loadDataset } = require('../packages/agents/dist/index.js');

const run = await runHarness(loadDataset());
const again = await runHarness(loadDataset());
const reproducible = JSON.stringify(run) === JSON.stringify(again);
const out = { ...run, reproducible };
writeFileSync(new URL('../packages/agents/eval/last-run.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');

const { summary: s, metadata: m } = run;
console.log(`provider ${m.provider}@${m.provider_version} · dataset ${m.dataset_version} · schema ${m.proposal_schema_version} · domain ${m.domain_version} · reproducible: ${reproducible}`);
console.log(`scenarios ${s.scenarios} (recruitment ${s.recruitment}, technical ${s.technical}; A ${s.mode_a}, B ${s.mode_b}, C ${s.mode_c}) · passed ${s.passed} · failed ${s.failed} (known gaps ${s.known_gap_failures}, unexpected ${s.unexpected_failures}) · false accepts ${s.false_accepts} · false rejects ${s.false_rejects}`);
for (const [d, c] of Object.entries(s.dimensions)) console.log(`  ${d.padEnd(34)} PASS ${String(c.pass).padStart(2)}  FAIL ${String(c.fail).padStart(2)}  N/A ${String(c.na).padStart(2)}`);
for (const r of run.results) {
  const mark = r.pass ? 'PASS' : r.known_gap ? 'GAP ' : 'FAIL';
  console.log(`${mark} ${r.scenario_id} [${r.mode}] ${r.title} — accepted {${r.accepted.map((a) => a.proposalType).join(', ')}} rejected {${r.rejected.map((x) => x.code).join(', ')}}`);
  for (const d of r.dimensions.filter((x) => x.verdict === 'FAIL')) console.log(`     ✗ ${d.dimension}: ${d.detail}`);
}
process.exit(s.unexpected_failures === 0 && reproducible ? 0 : 1);
