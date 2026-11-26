'use client';
import { useState } from 'react';
import { api, type GuidanceAnswer, type GuidanceCapability } from '../lib/api';

/**
 * Phase B package 5 — one guidance capability on request (career, learning, assessment feedback). The answer is a set
 * of proposals from the existing gateway with the TEST provider only (no real model, OPEN-023): fixed templates that
 * copy recorded facts. Shown with its permanent notice; a withheld answer says so. It never changes a level.
 */
const TYPE_AR: Record<string, string> = {
  recruiter_next_action: 'الخطوة التالية', profile_gap: 'مهارة بلا دليل مُقيَّم', technical_next_action: 'التطبيق', followup_question: 'أسئلة للتحقق من فهمك',
  rubric_explanation: 'شرح المعايير', technical_feedback: 'ملاحظة تقنية', missing_evidence: 'ما ينقص الدليل', improvement_action: 'خطوة تحسين', validation_activity: 'تحقق قصير',
};

export function GuidancePanel({ token, capability, buttonAr, skillId, submissionId, labelFor }: {
  token: string; capability: GuidanceCapability; buttonAr: string; skillId?: string; submissionId?: string;
  /** Names the page already shows (skill, criterion), looked up by id — the answer itself never names a technology the graduate did not declare. */
  labelFor?: (id: string) => string | null;
}) {
  const [answer, setAnswer] = useState<GuidanceAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = async () => {
    setBusy(true); setError(null);
    try { setAnswer(await api<GuidanceAnswer>('/me/guidance', { method: 'POST', token, body: { capability, skillId, submissionId } })); }
    catch (e) { setError((e as Error).message.replace(/^\[[a-z_]+\]\s*/, '')); }
    finally { setBusy(false); }
  };
  return (
    <div className="stack" style={{ gap: 8 }} data-testid={`guidance-${capability}`}>
      <div><button type="button" className="btn btn--secondary" onClick={() => void ask()} disabled={busy}>{busy ? 'جارٍ التحضير…' : buttonAr}</button></div>
      {error ? <p className="body-sm muted" role="alert">{error}</p> : null}
      {answer ? (
        <div className="stack" style={{ gap: 6 }} data-testid="guidance-answer" aria-live="polite">
          <p className="micro"><span className="chip chip--attention">{answer.noticeAr}</span></p>
          {answer.withheldAr ? <p className="body-sm muted" data-testid="guidance-withheld">{answer.withheldAr}</p> : null}
          <div className="rows">
            {answer.proposals.map((p) => <ProposalLine key={p.id} p={p} labelFor={labelFor} />)}
          </div>
          <p className="micro muted" style={{ margin: 0 }}>العقود: <span className="term" lang="en">{answer.contracts.join(' · ')}</span> · الأدوات (قراءة فقط): <span className="term" lang="en">{answer.toolsUsed.join(' · ')}</span></p>
        </div>
      ) : null}
    </div>
  );
}

function ProposalLine({ p, labelFor }: { p: GuidanceAnswer['proposals'][number]; labelFor?: (id: string) => string | null }) {
  const pl = p.structuredPayload as Record<string, unknown>;
  const skillName = typeof pl['skillId'] === 'string' && labelFor ? labelFor(pl['skillId'] as string) : null;
  return (
    <div className="stack" style={{ gap: 2 }} data-testid="guidance-item" data-type={p.proposalType}>
      <span className="micro muted">{TYPE_AR[p.proposalType] ?? p.proposalType}{skillName ? ` · ${skillName}` : ''}</span>
      <span className="body-sm">{p.summary}</span>
      {pl['kind'] === 'action' && typeof pl['why'] === 'string' && /[\u0600-\u06FF]/.test(pl['why'] as string) ? <span className="micro muted">{pl['why'] as string}</span> : null}
      {pl['kind'] === 'followup_question' && Array.isArray(pl['questions']) ? <ul className="body-sm" style={{ margin: 0 }}>{(pl['questions'] as string[]).map((q) => <li key={q}>{q}</li>)}</ul> : null}
      {pl['kind'] === 'rubric_explanation' && Array.isArray(pl['criteria']) ? (
        <ul className="body-sm" style={{ margin: 0 }}>{(pl['criteria'] as { criterion: string; met: boolean; likelyWhy: string }[]).map((c) => (
          <li key={c.criterion}>{labelFor?.(c.criterion) ?? c.criterion}: {c.met ? 'مستوفى' : 'غير مستوفى'}{c.likelyWhy ? ` — ${c.likelyWhy}` : ''}</li>))}</ul>
      ) : null}
    </div>
  );
}
