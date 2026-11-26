'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * R2 (layer 1) — the automated test results of THIS submission, on the exact commit it is pinned to. Neutral labels
 * only (never the tests, the expected values or a solution); shadow stage: they do not change the evaluation and never
 * prove a skill on their own. The graduate fixes the work themselves and submits again: a new attempt.
 */
interface Runs { mode: 'off' | 'synthetic_dev'; runs: { id: string; status: string; commitSha: string | null; packStatus: string; noticeAr: string; shadowAr: string;
  tests: { testId: string; labelAr: string; outcome: string; mode: string; noteAr: string | null }[] }[] }
const OUTCOME_AR: Record<string, string> = { pass: 'نجح', fail: 'لم ينجح', error: 'تعذّر التحقق', timeout: 'تجاوز الوقت', skipped: 'لم يُشغَّل' };

export function TestRunsPanel({ token, submissionId }: { token: string; submissionId: string }) {
  const [r, setR] = useState<Runs | null>(null);
  useEffect(() => { void api<Runs>(`/submissions/${encodeURIComponent(submissionId)}/test-runs`, { token }).then(setR).catch(() => setR(null)); }, [token, submissionId]);
  const run = r?.runs[r.runs.length - 1];
  if (!run) return null;
  const auto = run.tests.filter((t) => t.mode === 'automated');
  return (
    <section className="card" aria-labelledby="tests" data-testid="test-runs">
      <h2 id="tests">الاختبارات الآلية على نسختك</h2>
      <p className="body-sm" style={{ margin: 0 }}>
        {run.commitSha ? <>على الإيداع <span dir="ltr" className="micro">{run.commitSha.slice(0, 7)}</span>. </> : null}
        نجح {auto.filter((t) => t.outcome === 'pass').length} من {auto.length} اختبارًا آليًا.
        {run.packStatus !== 'approved' ? <span className="chip" style={{ marginInlineStart: 6 }}>اختبارات مرشّحة لم يعتمدها خبير</span> : null}
      </p>
      <ul className="body-sm" data-testid="test-run-list">
        {run.tests.map((t) => (
          <li key={t.testId} data-outcome={t.outcome}>
            {t.labelAr}: <strong>{OUTCOME_AR[t.outcome] ?? t.outcome}</strong>{t.mode === 'supports_human' ? <span className="micro muted"> (ملاحظة تساعد المراجِع)</span> : null}
            {t.noteAr ? <span className="micro muted"> · {t.noteAr}</span> : null}
          </li>
        ))}
      </ul>
      <p className="disclaimer">{run.noticeAr} {run.shadowAr}</p>
    </section>
  );
}
