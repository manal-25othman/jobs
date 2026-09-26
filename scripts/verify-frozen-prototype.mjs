#!/usr/bin/env node
/**
 * The frozen static prototype is the visual / content / interaction reference
 * and the responsive + RTL regression baseline. It must not drift.
 *
 * This records and checks a manifest of its files. It is intentionally simple:
 * a changed hash means someone edited the reference, which needs a decision,
 * not a silent commit.
 *
 *   node scripts/verify-frozen-prototype.mjs --write   # re-baseline (deliberate)
 *   node scripts/verify-frozen-prototype.mjs           # check
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const WEB = join(ROOT, 'apps/web');
const MANIFEST = join(ROOT, 'apps/web/FROZEN-MANIFEST.json');
const write = process.argv.includes('--write');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'FROZEN-MANIFEST.json') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const current = {};
for (const f of walk(WEB).sort()) {
  current[relative(WEB, f)] = createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);
}

if (write) {
  writeFileSync(MANIFEST, JSON.stringify({
    note: 'Frozen reference prototype. Regenerate only with a recorded decision.',
    frozenAt: new Date().toISOString().slice(0, 10),
    files: current,
  }, null, 2) + '\n');
  console.log(`Baseline written: ${Object.keys(current).length} files.`);
  process.exit(0);
}

if (!existsSync(MANIFEST)) {
  console.error('No FROZEN-MANIFEST.json. Run with --write to create the baseline.');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(MANIFEST, 'utf8')).files;
const changed = [], added = [], removed = [];
for (const [f, h] of Object.entries(current)) {
  if (!(f in baseline)) added.push(f);
  else if (baseline[f] !== h) changed.push(f);
}
for (const f of Object.keys(baseline)) if (!(f in current)) removed.push(f);

if (changed.length || added.length || removed.length) {
  console.error('\nThe frozen prototype changed. It is a reference, not the production app.\n');
  for (const f of changed) console.error(`  modified: ${f}`);
  for (const f of added)   console.error(`  added:    ${f}`);
  for (const f of removed) console.error(`  removed:  ${f}`);
  console.error('\nIf the change is deliberate, record why, then re-baseline with --write.\n');
  process.exit(1);
}

console.log(`Frozen prototype intact: ${Object.keys(current).length} files unchanged.`);
