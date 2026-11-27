import { Injectable, NotFoundException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  TESTS_ARE_NOT_SKILL_PROOF_AR, TEST_RUN_SHADOW_AR, assertTestRunResult, snapshotHash, needsHumanEscalation, summarizeByCriterion,
  type SubmittedFile, type TestRunResult,
} from '@naqla/domain';
import { DbService } from '../infra/db.service';
import { isProduction } from '../configuration/configuration.service';
import { emitAuditEvent } from '../infra/audit';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * synthetic_dev: run the development sandbox (local machines only — never on a deployed host, NODE_ENV=production).
 * recorded: serve results recorded earlier by that runner for the simulated GitHub snapshots (staging); no code runs.
 */
export function r2Mode(): 'off' | 'synthetic_dev' | 'recorded' {
  const m = process.env['R2_MODE'];
  if (m === 'synthetic_dev' && process.env['NODE_ENV'] !== 'production') return 'synthetic_dev';
  if (m === 'recorded' && !isProduction()) return 'recorded';
  return 'off';
}

export const RECORDED_AR = 'نتيجة مسجّلة مسبقًا من مشغّل التطوير لهذه النسخة الاصطناعية نفسها؛ لا يُشغَّل أي كود في هذه البيئة.';

let recordedCache: Record<string, TestRunResult> | null = null;
function recordedResults(): Record<string, TestRunResult> {
  if (recordedCache) return recordedCache;
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const p = join(d, 'data', 'candidates', 'trk_frontend_junior_v2', 'r2-recorded', 'results.json');
    if (existsSync(p)) { recordedCache = (JSON.parse(readFileSync(p, 'utf8')) as { results: Record<string, TestRunResult> }).results; return recordedCache; }
    d = dirname(d);
  }
  recordedCache = {};
  return recordedCache;
}

function runnerCli(): string {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const p = join(d, 'apps', 'runner', 'dist', 'cli.js');
    if (existsSync(p)) return p;
    d = dirname(d);
  }
  throw new Error('[r2_runner_missing] build apps/runner first');
}

/**
 * R2 in SHADOW mode (Phase C round 2, item 2): runs the activity's candidate test pack on a pinned SYNTHETIC snapshot
 * in the development sandbox (a separate process: apps/runner), stores the result bound to the commit and snapshot
 * hash, and never changes an evaluation, evidence or level. Off unless R2_MODE=synthetic_dev (refused in production).
 */
@Injectable()
export class TestRunService {
  constructor(private readonly db: DbService) {}

  private invoke(activityId: string, files: readonly SubmittedFile[], commitSha: string | null): Promise<{ ok: true; result: TestRunResult } | { ok: false; error: string }> {
    let cli: string;
    try { cli = runnerCli(); } catch { return Promise.resolve({ ok: false, error: 'runner not built' }); }
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [cli], { stdio: ['pipe', 'pipe', 'ignore'], env: { NODE_ENV: process.env['NODE_ENV'] ?? 'development', PATH: '/usr/bin:/bin' } });
      let out = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), 180_000);
      child.stdout.on('data', (d: Buffer) => { if (out.length < 512 * 1024) out += d.toString('utf8'); });
      child.on('close', () => {
        clearTimeout(timer);
        try { resolve(JSON.parse(out)); } catch { resolve({ ok: false, error: 'runner produced no result' }); }
      });
      child.stdin.end(JSON.stringify({ activityId, files, commitSha, origin: 'synthetic' }));
    });
  }

  /** Runs and records. Returns the graduate-facing view, or null when R2 is off or the activity has no pack. */
  async runForSubmission(userId: string, submissionId: string, activityKey: string, files: readonly SubmittedFile[], commitSha: string | null) {
    const mode = r2Mode();
    if (mode === 'off') return null;
    let r: { ok: true; result: TestRunResult } | { ok: false; error: string };
    if (mode === 'recorded') {
      const rec = recordedResults()[`${activityKey}:${snapshotHash(files)}`];
      r = rec ? { ok: true, result: { ...rec, commitSha, backend: 'recorded-dev' } } : { ok: false, error: '[r2_not_recorded] no recorded result for this snapshot' };
    } else {
      r = await this.invoke(activityKey, files, commitSha);
    }
    if (!r.ok) {
      await this.db.asService((c) => emitAuditEvent(c, { eventType: 'test_run.refused', userId, actorKind: 'system', subjectTable: 'submission', subjectId: submissionId, reason: 'R2 did not run', payload: { error: r.error } }));
      return { ran: false as const, reasonAr: /r2_pack/.test(r.error) ? 'لا توجد اختبارات آلية لهذا النشاط بعد.'
        : /r2_not_recorded/.test(r.error) ? 'لا تُشغَّل الاختبارات الآلية في بيئة التجربة إلا لنسخ المستودعات المحاكاة؛ سيراجع عملك إنسان.'
        : 'تعذّر تشغيل الاختبارات الآلية الآن؛ سيراجع عملك إنسان.' };
    }
    const result = assertTestRunResult(r.result);
    const id = await this.db.asService(async (c) => {
      const row = (await c.query(`insert into test_run (submission_id, user_id, activity_key, pack_version, pack_status, commit_sha, snapshot_hash, origin, backend, status, result)
                                   values ($1,$2,$3,$4,$5,$6,$7,'synthetic',$8,$9,$10) returning id`,
        [submissionId, userId, activityKey, result.packVersion, result.packStatus, result.commitSha, result.snapshotHash, result.backend, result.status, JSON.stringify(result)])).rows[0];
      const esc = needsHumanEscalation(result);
      await emitAuditEvent(c, { eventType: 'test_run.recorded', userId, actorKind: 'system', subjectTable: 'test_run', subjectId: row.id,
        reason: 'R2 shadow run on a pinned synthetic snapshot; observation only, no evaluation change',
        payload: { activityKey, commitSha: result.commitSha, snapshotHash: result.snapshotHash, status: result.status, escalate: esc.escalate, reasons: esc.reasons } });
      return String(row.id);
    });
    return { ran: true as const, id, ...this.present(result) };
  }

  /** The graduate's view: neutral labels and outcomes per test; never test source, expected values or scores. */
  present(result: TestRunResult) {
    return {
      status: result.status, commitSha: result.commitSha, snapshotHash: result.snapshotHash, packStatus: result.packStatus,
      recorded: result.backend === 'recorded-dev', recordedAr: result.backend === 'recorded-dev' ? RECORDED_AR : null,
      noticeAr: TESTS_ARE_NOT_SKILL_PROOF_AR, shadowAr: TEST_RUN_SHADOW_AR,
      tests: result.tests.map((t) => ({ testId: t.testId, labelAr: t.labelAr, outcome: t.outcome, mode: t.mode, noteAr: t.noteAr })),
      byCriterion: summarizeByCriterion(result),
    };
  }

  async forSubmission(userId: string, submissionId: string) {
    if (!UUID.test(submissionId)) throw new NotFoundException('submission not found');
    return this.db.asService(async (c) => {
      const s = (await c.query(`select user_id from submission where id = $1`, [submissionId])).rows[0];
      if (!s || s.user_id !== userId) throw new NotFoundException('submission not found');
      const rows = (await c.query(`select id, result, created_at from test_run where submission_id = $1 order by created_at`, [submissionId])).rows;
      return { mode: r2Mode(), runs: rows.map((r) => ({ id: String(r.id), createdAt: new Date(r.created_at).toISOString(), ...this.present(r.result as TestRunResult) })) };
    });
  }

  /** For the reviewer and A13: the full observation plus escalation reasons (still no expected values). */
  async forReview(submissionId: string) {
    return this.db.asService(async (c) => {
      const r = (await c.query(`select result from test_run where submission_id = $1 order by created_at desc limit 1`, [submissionId])).rows[0];
      if (!r) return null;
      const result = r.result as TestRunResult;
      return { ...this.present(result), escalation: needsHumanEscalation(result), gamingSignals: result.gamingSignals, blockedRequests: result.blockedRequests };
    });
  }

}

