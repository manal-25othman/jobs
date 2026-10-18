// ENG-1 (0032): stores the current-version text fingerprint of every text deliverable that has none, with the ONE
// definition (apps/api text-fingerprints.ts → @naqla/domain). Idempotent, insert-only. Development / recovery use.
//   DATABASE_URL=… node scripts/backfill-text-fingerprints.mjs
import pg from 'pg';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { ensureTextFingerprints } = require('../apps/api/dist/src/readiness/text-fingerprints.js');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
let n = 0;
try {
  const { rows } = await c.query(`select user_id::text as u, array_agg(distinct submission_id::text) as subs from submission_artifact where kind = 'text' group by 1`);
  for (const r of rows) n += await ensureTextFingerprints(c, r.u, r.subs);
} finally { c.release(); await pool.end(); }
console.log(`fingerprinted ${n} text deliverable(s)`);
