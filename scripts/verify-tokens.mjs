#!/usr/bin/env node
/**
 * The production app carries a copy of the frozen design tokens. This fails if
 * the copy drifts from the source, so "the colours look slightly different"
 * becomes a build failure rather than a slow visual divergence nobody notices.
 */
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SRC = `${ROOT}/apps/web/assets/css/tokens.css`;
const COPY = `${ROOT}/apps/app/src/app/tokens.css`;

const declarations = (text) =>
  (text.match(/--[a-z0-9-]+\s*:\s*[^;]+;/gi) ?? [])
    .map((d) => d.replace(/\s+/g, ' ').trim())
    .sort();

const src = declarations(readFileSync(SRC, 'utf8'));
const copy = declarations(readFileSync(COPY, 'utf8'));

const missing = src.filter((d) => !copy.includes(d));
const extra = copy.filter((d) => !src.includes(d));

if (missing.length || extra.length) {
  console.error('\nThe production token copy has drifted from the frozen prototype.\n');
  for (const d of missing) console.error(`  missing from the copy: ${d}`);
  for (const d of extra) console.error(`  not in the source:     ${d}`);
  console.error('\nThe frozen prototype is the source. Update the copy, not the source.\n');
  process.exit(1);
}

console.log(`Design tokens match the frozen prototype: ${src.length} declarations.`);
