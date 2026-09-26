'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';
import { Steps } from '../../components/Steps';

interface Proposal {
  id: string; agentType: string; proposalType: string; summary: string; lifecycle: string; requiresUserApproval: boolean;
  rationale: string; warnings: string[]; evidenceRefs: string[]; rejectionReason: string | null;
  structuredPayload: Record<string, unknown> & { kind: string };
}
interface Preview {
  proposalId: string; current: string | null; suggestedAr: string | null; suggestedEn: string | null; why: string; reason: string | null;
  supportingSources: { kind: string; ref: string }[]; warnings: string[]; unsupportedRisk: string | null; limitationNote: string | null; lifecycle: string;
}

const TYPE_AR: Record<string, string> = {
  cv_bullet: 'بند سيرة', recruiter_next_action: 'خطوة مهنية', technical_feedback: 'ملاحظة تقنية', rubric_explanation: 'شرح المعايير',
  technical_next_action: 'خطوة تقنية', missing_evidence: 'دليل ناقص',
};
const AGENT_AR: Record<string, string> = { recruitment: 'بعين مسؤول توظيف', technical: 'مراجعة تقنية' };
const LIFECYCLE_AR: Record<string, string> = { validated: 'مُتحقَّق منه', awaiting_user: 'ينتظر قرارك', approved: 'معتمد', rejected: 'مرفوض', superseded: 'استُبدل' };

function Inner() {
  const { token, loading } = useSession();
  const focus = useSearchParams().get('focus');
  const [items, setItems] = useState<Proposal[]>([]);
  const [open, setOpen] = useState<Preview | null>(null);
  const [edited, setEdited] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!token) return;
    const r = await api<{ items: Proposal[] }>('/me/proposals', { token }); setItems(r.items);
  };
  useEffect(() => { void reload().catch((e) => setError((e as Error).message)); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (focus && token) void openPreview(focus); }, [focus, token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openPreview(id: string) {
    if (!token) return;
    const p = await api<Preview>(`/me/proposals/${id}`, { token }); setOpen(p); setEdited(p.suggestedAr ?? '');
  }
  async function decide(kind: 'approve' | 'reject') {
    if (!token || !open) return; setBusy(true); setError(null);
    try {
      if (kind === 'approve') {
        await api(`/me/proposals/${open.proposalId}/approve`, { method: 'POST', token,
          body: { approved: true, ...(edited.trim() !== (open.suggestedAr ?? '').trim() ? { editedBody: edited.trim() } : {}) } });
      } else {
        const reason = window.prompt('سبب الرفض (يُحفظ مع الاقتراح):') ?? '';
        if (!reason.trim()) { setBusy(false); return; }
        await api(`/me/proposals/${open.proposalId}/reject`, { method: 'POST', token, body: { reason } });
      }
      setOpen(null); await reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (loading) return <Loading />;
  const wasEdited = !!open?.suggestedAr && edited.trim() !== open.suggestedAr.trim();

  return (
    <>
      <Steps current={4} />
      <h1>اقتراحات الرفيق المهني</h1>
      <p className="body-sm muted">اقتراحات لا حقائق: كل بند هنا يُعاين ويُعتمد أو يُرفض، ولا شيء يُطبَّق من تلقاء نفسه.</p>
      {error ? <ErrorBanner message={error} /> : null}

      {open ? (
        <section className="card" aria-label="معاينة الاقتراح">
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="chip chip--new">معاينة</span>
            {open.unsupportedRisk && open.unsupportedRisk !== 'none' ? <span className="chip chip--attention">خطر ادعاء غير مدعوم: {open.unsupportedRisk}</span> : null}
          </div>
          <div className="stack" style={{ gap: 6 }}><span className="kicker">الحالي</span><p className="body-sm muted">{open.current ?? 'لا شيء بعد'}</p></div>
          {open.suggestedAr !== null ? (
            <label className="field"><span className="field__label">المقترح — يمكنك تعديله</span>
              <textarea className="input" rows={3} style={{ height: 'auto', padding: '12px 14px' }} value={edited} onChange={(e) => setEdited(e.target.value)} />
            </label>
          ) : null}
          {open.suggestedEn ? <p className="body-sm term" lang="en" dir="ltr">{open.suggestedEn}</p> : null}
          <div className="stack" style={{ gap: 6 }}><span className="kicker">لماذا</span><p className="body-sm">{open.why}</p>{open.reason ? <p className="body-sm muted">{open.reason}</p> : null}</div>
          <div className="stack" style={{ gap: 6 }}><span className="kicker">الدليل الداعم</span>
            <div className="rows">{open.supportingSources.map((s, i) => <div key={i} className="row" style={{ gap: 10 }}><span className="chip">{s.kind}</span><span className="body-sm term" lang="en">{s.ref}</span></div>)}</div>
          </div>
          {open.warnings.length > 0 ? <div className="banner banner--attention" style={{ margin: 0 }}><span>{open.warnings.join(' · ')}</span></div> : null}
          {open.limitationNote ? <p className="disclaimer">{open.limitationNote}</p> : null}
          {wasEdited ? <div className="banner banner--attention" style={{ margin: 0 }}><span>عدّلتِ الصياغة: يُعاد فحصها بقواعد النطاق عند الاعتماد، ويُسقط عنها وسم «مولَّد».</span></div> : null}
          {open.lifecycle === 'awaiting_user' ? (
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn--primary" disabled={busy} onClick={() => decide('approve')}>{busy ? 'جارٍ…' : 'اعتماد'}</button>
              <button className="btn btn--ghost" disabled={busy} onClick={() => decide('reject')}>رفض</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setOpen(null)}>إغلاق</button>
            </div>
          ) : <button className="btn btn--ghost btn--sm" onClick={() => setOpen(null)}>إغلاق</button>}
        </section>
      ) : null}

      <section className="card">
        <h2>كل الاقتراحات</h2>
        {items.length === 0 ? <p className="body-sm muted">لا اقتراحات بعد. تظهر بعد تقييم.</p> : (
          <div className="rows">
            {items.map((p) => (
              <div key={p.id} className="stack" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <span className="chip chip--info">{AGENT_AR[p.agentType] ?? p.agentType}</span>
                  <span className="chip">{TYPE_AR[p.proposalType] ?? p.proposalType}</span>
                  <span className={`chip ${p.lifecycle === 'approved' ? 'chip--success' : p.lifecycle === 'rejected' ? 'chip--attention' : ''}`}>{LIFECYCLE_AR[p.lifecycle] ?? p.lifecycle}</span>
                  {p.requiresUserApproval && p.lifecycle === 'awaiting_user' ? <button className="link push" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => openPreview(p.id)}>معاينة ←</button> : null}
                </div>
                <span style={{ fontWeight: 500 }}>{p.summary}</span>
                {p.structuredPayload.kind === 'technical_feedback' ? (
                  <ul className="body-sm muted" style={{ margin: 0, paddingInlineStart: 18 }}>
                    {((p.structuredPayload as unknown as { weaknesses: { criterion: string; observation: string }[] }).weaknesses).map((w) => <li key={w.criterion}><span className="term" lang="en">{w.criterion}</span> — {w.observation}</li>)}
                  </ul>
                ) : null}
                {p.structuredPayload.kind === 'rubric_explanation' ? (
                  <ul className="body-sm muted" style={{ margin: 0, paddingInlineStart: 18 }}>
                    {((p.structuredPayload as unknown as { criteria: { criterion: string; met: boolean; likelyWhy: string }[] }).criteria).map((c) => <li key={c.criterion}>{c.met ? '✓' : '✗'} <span className="term" lang="en">{c.criterion}</span> — {c.likelyWhy}</li>)}
                  </ul>
                ) : null}
                {p.structuredPayload.kind === 'action' ? <span className="body-sm muted">{(p.structuredPayload as unknown as { why: string }).why}</span> : null}
                {p.rejectionReason ? <span className="micro muted">سبب الرفض: {p.rejectionReason}</span> : null}
              </div>
            ))}
          </div>
        )}
        <p className="disclaimer">المزوّد الحالي اختباري غير إنتاجي: يثبت الحوكمة والتوجيه لا جودة النموذج. لا استدعاء لأي نموذج خارجي.</p>
      </section>
    </>
  );
}
export default function ProposalsPage() { return <main className="wrap"><Suspense fallback={<Loading />}><Inner /></Suspense></main>; }
