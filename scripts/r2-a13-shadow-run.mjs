#!/usr/bin/env node
/**
 * Phase C round 2 — shadow pipeline run (SYNTHETIC cases only): R2 on every synthetic case → A13 suggestion rules per
 * criterion → compared with the CANDIDATE expected judgments (not an expert's) → calibration metrics Q1–Q7.
 * This tests the pipeline. It is NOT calibration and authorises nothing (owner decision 4).
 *   node scripts/r2-a13-shadow-run.mjs [--json out.json]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const runner = require('../apps/runner/dist/index.js');
const domain = require('../packages/domain/dist/index.js');
const ROOT = new URL('..', import.meta.url).pathname;
const CAND = join(ROOT, 'data/candidates/trk_frontend_junior_v2');
const rubrics = JSON.parse(readFileSync(join(CAND, 'tracks/trk_frontend_junior/rubrics.json'), 'utf8')).records;
const tree = (dir) => { const out = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (!n.endsWith('.candidate.json')) out.push({ path: relative(dir, p), content: readFileSync(p, 'utf8') }); } }; walk(dir); return out; };

const pairs = []; const perCase = [];
for (const activity of ['act_fe_debug_improve', 'act_fe_change_request', 'act_fe_integrated_leave_requests']) {
  const rubric = rubrics.find((r) => r.activity === activity);
  const starter = tree(join(CAND, 'materials', activity, 'graduate'));
  for (const c of readdirSync(join(CAND, 'r2', activity)).sort()) {
    const dir = join(CAND, 'r2', activity, c);
    const expected = JSON.parse(readFileSync(join(dir, 'expected.candidate.json'), 'utf8'));
    const result = await runner.runAttempt({ pack: runner.packFor(activity), files: tree(dir), starterFiles: starter, commitSha: null, origin: 'synthetic' });
    const summaries = domain.summarizeByCriterion(result);
    let agree = 0, decided = 0;
    for (const crit of rubric.criteria) {
      const ref = expected.criteria[crit.key];
      if (ref !== 'met' && ref !== 'unmet') continue; // human-judged: no reference here
      const input = { criterionKey: crit.key, mandatory: crit.mandatory === true, evaluatorType: crit.evaluator_type === 'human' ? 'human' : 'rule', ruleMet: null, ruleExcerpt: null,
        tests: summaries.find((s) => s.criterionKey === crit.key) ?? null,
        testLabels: result.tests.filter((t) => t.criterionKey === crit.key).map((t) => ({ labelAr: t.labelAr, outcome: t.outcome, mode: t.mode })) };
      const s = domain.suggestCriterion(input, { packApproved: false, calibrationApproved: false, gamingSignals: result.gamingSignals, injectionSuspected: false });
      domain.assertSuggestionGrounded(s, input);
      pairs.push({ criterionKey: `${activity}/${c}/${crit.key}`, suggested: s.suggestion, reference: ref, mandatory: input.mandatory, escalated: s.escalate });
      if (s.suggestion !== 'uncertain') { decided++; if (s.suggestion === ref) agree++; }
    }
    perCase.push({ activity, case: c, status: result.status, durationMs: result.durationMs, gaming: result.gamingSignals, decided, agree });
  }
}
const report = domain.calibrationMetrics(pairs);
const out = { generatedAt: new Date().toISOString(), synthetic: true, referenceIs: 'CANDIDATE expected judgments, not expert', report, perCase, pairs };
const i = process.argv.indexOf('--json'); if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 2));
console.log(JSON.stringify({ report, perCase }, null, 2));
