#!/usr/bin/env node
/**
 * Enforces the architecture rule the owner set:
 *
 *   "The product's business rules must not live inside Next.js or NestJS."
 *
 * Checks, in order of importance:
 *  1. @naqla/domain imports nothing but node: builtins and its own files.
 *  2. @naqla/contracts imports only node: builtins and @naqla/domain.
 *  3. No app re-defines a domain rule name (a rough but useful drift alarm).
 *  4. The frozen prototype apps/web is not imported by production code.
 *
 * Exits non-zero on violation. Intended for CI.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const violations = [];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.next') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

function importsOf(file) {
  const src = readFileSync(file, 'utf8');
  const found = new Set();
  for (const re of [IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) found.add(m[1]);
  }
  return [...found];
}

const isRelative = (s) => s.startsWith('.') || s.startsWith('/');
const isNodeBuiltin = (s) => s.startsWith('node:');

/* 1. domain: node: builtins and relative files only. */
for (const file of walk(join(ROOT, 'packages/domain/src'))) {
  for (const spec of importsOf(file)) {
    if (isRelative(spec) || isNodeBuiltin(spec)) continue;
    violations.push(
      `[domain-purity] ${relative(ROOT, file)} imports '${spec}'. ` +
      `@naqla/domain must stay framework-independent: node: builtins only.`,
    );
  }
}

/* 2. contracts: node: builtins, relative files, and @naqla/domain only. */
for (const file of walk(join(ROOT, 'packages/contracts/src'))) {
  for (const spec of importsOf(file)) {
    if (isRelative(spec) || isNodeBuiltin(spec) || spec === '@naqla/domain') continue;
    violations.push(
      `[contracts-purity] ${relative(ROOT, file)} imports '${spec}'. ` +
      `@naqla/contracts may depend on @naqla/domain and nothing else.`,
    );
  }
}

/* 2b. agents: node: builtins, relative files, and @naqla/domain only — no model SDK. */
for (const file of walk(join(ROOT, 'packages/agents/src'))) {
  for (const spec of importsOf(file)) {
    if (isRelative(spec) || isNodeBuiltin(spec) || spec === '@naqla/domain') continue;
    violations.push(`[agents-purity] ${relative(ROOT, file)} imports '${spec}'. @naqla/agents may depend on @naqla/domain only; no model SDK.`);
  }
}
for (const dir of ['packages/domain/src', 'packages/agents/src', 'apps/api/src', 'apps/app/src']) {
  for (const file of walk(join(ROOT, dir))) {
    for (const spec of importsOf(file)) {
      if (/^(@anthropic-ai\/|openai|@google\/generative|cohere|mistral)/.test(spec)) {
        violations.push(`[no-external-ai] ${relative(ROOT, file)} imports '${spec}'. OPEN-023 is unresolved; no model SDK may be bound.`);
      }
    }
  }
}

/* 3. drift alarm: an app must not define its own copy of a domain rule. */
const GUARDED_NAMES = [
  'assertTransitionAllowed',
  'assertClaimHasEvidence',
  'assertEvaluationResultValid',
  'assessClaim',
  'computeReadiness',
  'canShare',
  'assessDisclosure',
  'EVIDENCE_STATES',
  'EVALUATION_OUTCOMES',
];
for (const app of ['apps/app', 'apps/api']) {
  for (const file of walk(join(ROOT, app))) {
    const src = readFileSync(file, 'utf8');
    for (const name of GUARDED_NAMES) {
      const declares = new RegExp(
        `(?:function|const|let|var|class|enum|type|interface)\\s+${name}\\b`,
      );
      if (declares.test(src)) {
        violations.push(
          `[rule-drift] ${relative(ROOT, file)} declares '${name}'. ` +
          `Applications consume domain rules; they never redefine them.`,
        );
      }
    }
  }
}

/* 4. the frozen prototype is a reference, never a production dependency. */
for (const app of ['apps/app', 'apps/api', 'packages/domain', 'packages/contracts', 'packages/config', 'packages/ui']) {
  for (const file of walk(join(ROOT, app))) {
    for (const spec of importsOf(file)) {
      if (spec.includes('apps/web')) {
        violations.push(
          `[frozen-prototype] ${relative(ROOT, file)} imports from apps/web. ` +
          `The frozen prototype is a visual and regression reference, not a source of production code.`,
        );
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\nArchitecture boundary violations:\n');
  for (const v of violations) console.error('  - ' + v);
  console.error(`\n${violations.length} violation(s).\n`);
  process.exit(1);
}

console.log('Architecture boundaries hold: domain is framework-independent, no rule drift, prototype untouched.');
