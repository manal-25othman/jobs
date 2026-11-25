'use client';
import { useState } from 'react';
import { api, type GuidanceAnswer } from '../lib/api';

/**
 * R1 — progressive hints (A15 + A03) for the unmet criteria of the graduate's own result: one level at a time, on
 * request — where to look, then the concept, then a learning resource. Never code or the fix: the work stays theirs.
 * Test provider only (no real model); labelled permanently.
 */
const LEVEL_BUTTON_AR = ['أين أنظر؟', 'ما المفهوم المرتبط؟', 'مورد يساعدني'];
const LEVEL_TITLE_AR = ['التلميح الأول: أين تنظرين', 'التلميح الثاني: المفهوم', 'التلميح الثالث: مورد تعلّم'];

export function HintsPanel({ token, submissionId }: { token: string; submissionId: string }) {
  const [answers, setAnswers] = useState<GuidanceAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = answers.length + 1;
  const ask = async () => {
    setBusy(true); setError(null);
    try { setAnswers([...answers, await api<GuidanceAnswer>('/me/guidance', { method: 'POST', token, body: { capability: 'improvement_hints', submissionId, level: next } })]); }
    catch (e) { setError((e as Error).message.replace(/^\[[a-z_]+\]\s*/, '')); }
    finally { setBusy(false); }
  };
  const none = answers.find((a) => a.noneAr);
  return (
    <div className="stack" style={{ gap: 8 }} data-testid="hints-panel">
      {answers.length ? <p className="micro"><span className="chip chip--attention">{answers[0]!.noticeAr}</span></p> : null}
      {answers.map((a, i) => (
        <div key={i} className="stack" style={{ gap: 4 }} data-testid="hints-level">
          {a.noneAr ? <p className="body-sm muted">{a.noneAr}</p> : <span className="body-sm" style={{ fontWeight: 500 }}>{LEVEL_TITLE_AR[i]}</span>}
          {a.withheldAr ? <p className="body-sm muted">{a.withheldAr}</p> : null}
          <div className="rows">
            {a.proposals.map((p) => (
              <div key={p.id} className="stack" style={{ gap: 2 }} data-testid="hint-item">
                <span className="micro"><span className={p.warnings[0] === 'severity:important' ? 'chip chip--attention' : 'chip'}>{p.warnings[0] === 'severity:important' ? 'مهم' : 'تحسين'}</span></span>
                <span className="body-sm">{p.summary}</span>
                {typeof p.structuredPayload['why'] === 'string' ? <span className="body-sm muted">{p.structuredPayload['why'] as string}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ))}
      {!none && next <= 3 ? <div><button type="button" className="btn btn--secondary" onClick={() => void ask()} disabled={busy}>{busy ? 'جارٍ التحضير…' : LEVEL_BUTTON_AR[next - 1]}</button></div> : null}
      {error ? <p className="body-sm muted" role="alert">{error}</p> : null}
      <p className="disclaimer">التلميحات لا تكتب الحل ولا الكود؛ الإصلاح عملك أنتِ، ثم تُقيَّم محاولتك الجديدة كالعادة.</p>
    </div>
  );
}
