#!/usr/bin/env node
/**
 * Career data pipeline entry point (builds nothing; run `npm run build -w @naqla/api` first).
 *   node scripts/career-data.mjs import trk_frontend_junior [--dry-run]
 *   node scripts/career-data.mjs validate
 *   node scripts/career-data.mjs near-duplicates trk_frontend_junior
 *   node scripts/career-data.mjs review skill <uuid> curated --role content_author --by - --label "name" --reason "why"
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { main } = require('../apps/api/dist/src/career-data/cli.js');
process.exit(await main(process.argv.slice(2), root));
