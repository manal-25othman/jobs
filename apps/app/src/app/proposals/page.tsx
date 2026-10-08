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
interface Reason { code: string; ar: string; en: string }
interface GroundingView {
  decision: 'grounded' | 'needs_revision' | 'refused';
  assertions: { type: string; status: string; factIds: string[] }[];
  issues: { code: string; severity: string; ar: string; span: string | null }[];
  unmapped: { ar: string[]; en: string[] };
  suggestedTrim: { ar: string; en: string | null } | null;
}
interface ClaimInfo {
  kind: string; labelAr: string; grounding?: { atDrafting: GroundingView | null; now: GroundingView }; draftedUnder: { ref: string; resolution: string } | null; groundingStatus: string | null;
  groundingReport: { check: string; passed: boolean; detail: string }[] | null;
  policyNow: { ref: string; resolution: string; minEvidenceLevel: string; reviewStatus: string; validationNote: string } | null;
  eligibleNow: boolean; missing: Reason[];
  evidence: { id: string; projectTitle: string | null; skillLabelAr: string; withdrawn: boolean }[];
}
interface Preview {
  proposalId: string; current: string | null; suggestedAr: string | null; suggestedEn: string | null; why: string; reason: string | null;
  supportingSources: { kind: string; ref: string }[]; warnings: string[]; unsupportedRisk: string | null; limitationNote: string | null; lifecycle: string;
  claim: ClaimInfo | null;
}
interface Options {
  kinds: { kind: string; labelAr: string; needsEvidence: boolean; policy: { ref: string; resolution: string; minEvidenceLevel: string } | null }[];
  evidence: { id: string; projectTitle: string | null; skillLabelAr: string }[];
}

const TYPE_AR: Record<string, string> = {
  cv_bullet: 'بند في السيرة', project_description: 'وصف مشروع في السيرة', professional_summary: 'ملخّص السيرة', linkedin_headline: 'عنوان لينكدإن',
  linkedin_about: 'نبذة لينكدإن', linkedin_skill: 'مهارة في لينكدإن', linkedin_project: 'مشروع في لينكدإن', case_study: 'دراسة حالة / بورتفوليو',
  recruiter_next_action: 'خطوة مهنية', profile_gap: 'فجوة في الملف', technical_feedback: 'ملاحظة تقنية', rubric_explanation: 'شرح المعايير',
  technical_next_action: 'خطوة تقنية', missing_evidence: 'دليل ناقص',
};
const AGENT_AR: Record<string, string> = { recruitment: 'بعين مسؤول توظيف', technical: 'مراجعة تقنية' };
const LIFECYCLE_AR: Record<string, string> = { validated: 'مُتحقَّق منه', awaiting_user: 'ينتظر قرارك', approved: 'معتمد', rejected: 'مرفوض', superseded: 'استُبدل' };
const LEVEL_AR: Record<string, string> = { gap: 'بلا دليل', self_reported: 'مُعلَنة ذاتيًا', practiced: 'مُمارَسة', demonstrated: 'مُثبَتة', verified: 'مُتحقَّق منها' };
/** How the rule that judges the draft came to apply — in plain words. None of them is presented as expert-approved unless it is. */
const RESOLUTION_AR: Record<string, string> = {
  legacy_baseline: 'القاعدة المعمول بها حاليًا (لم يراجعها خبير بعد)',
  development_only: 'قاعدة تجريبية لبيئة التطوير فقط (مسودة غير معتمدة)',
  production_active: 'قاعدة معتمدة من خبير',
};
const GROUNDING_AR: Record<string, string> = {
  grounded: 'كل جملة مرتبطة بدليل', evidence_withdrawn: 'سُحب الدليل الذي يستند إليه', not_eligible: 'لم يعد يستوفي القاعدة الحالية',
};
const DECISION_AR: Record<string, { label: string; tone: string }> = {
  grounded: { label: 'كل جزء من الصياغة مرتبط بواقعة مسجّلة', tone: 'chip--success' },
  needs_revision: { label: 'جزء من الصياغة غير مرتبط بدليل — يحتاج تعديلًا', tone: 'chip--attention' },
  refused: { label: 'تتضمن الصياغة ادعاءً لا يدعمه الدليل', tone: 'chip--attention' },
};
const ASSERTION_AR: Record<string, string> = {
  ACTION: 'ما أنجزتِه', ARTIFACT: 'ما بنيتِه', EVALUATION: 'نتيجة التقييم', SKILL: 'مهارة', TECHNOLOGY: 'تقنية', NUMBER: 'رقم',
  OUTCOME: 'أثر', PROFESSIONAL_CONTEXT: 'سياق عمل', QUALITY: 'وصف جودة', FRAMING: 'سياق المسار',
};
const EVENT_AR: Record<string, string> = {
  drafted: 'اقتُرحت الصياغة', previewed: 'فتحتِ المعاينة', approved: 'اعتُمدت', rejected: 'رُفضت',
  flagged_evidence_withdrawn: 'وُسمت: سُحب دليلها', refused_not_eligible: 'رُفض اعتمادها: لا تستوفي القاعدة',
  grounding_refused: 'رُفض اعتمادها: جزء منها لا يستند إلى دليل', edit_refused: 'رُفض تعديل: لا يستند إلى دليل (بقيت الصياغة الأصلية)',
};

function Inner() {
  const { token, loading } = useSession();
  const focus = useSearchParams().get('focus');
  const [items, setItems] = useState<Proposal[]>([]);
  const [open, setOpen] = useState<Preview | null>(null);
  const [history, setHistory] = useState<{ event: string; at: string; detail: string }[]>([]);
  const [edited, setEdited] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [kind, setKind] = useState('cv_bullet');
  const [evidenceId, setEvidenceId] = useState('');
  const [requestNote, setRequestNote] = useState<Reason[] | null>(null);

  const reload = async () => {
    if (!token) return;
    const r = await api<{ items: Proposal[] }>('/me/proposals', { token }); setItems(r.items);
    const o = await api<Options>('/me/claim-drafts/options', { token }); setOptions(o);
    if (!evidenceId && o.evidence[0]) setEvidenceId(o.evidence[0].id);
  };
  useEffect(() => { void reload().catch((e) => setError((e as Error).message)); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (focus && token) void openPreview(focus); }, [focus, token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openPreview(id: string) {
    if (!token) return;
    const p = await api<Preview>(`/me/proposals/${id}`, { token }); setOpen(p); setEdited(p.suggestedAr ?? '');
    const h = p.claim ? await api<{ items: { event: string; at: string; detail: string }[] }>(`/me/claim-drafts/${id}/history`, { token }) : { items: [] };
    setHistory(h.items);
  }
  async function requestDraft() {
    if (!token || !options) return; setBusy(true); setError(null); setRequestNote(null);
    const k = options.kinds.find((x) => x.kind === kind);
    try {
      const r = await api<{ status: string; proposalIds: string[]; reasons: Reason[] }>('/me/claim-drafts', { method: 'POST', token,
        body: { claimKind: kind, evidenceId: k?.needsEvidence ? evidenceId : null } });
      await reload();
      if (r.status === 'drafted' && r.proposalIds[0]) await openPreview(r.proposalIds[0]); else setRequestNote(r.reasons);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function decide(decision: 'approve' | 'reject') {
    if (!token || !open) return; setBusy(true); setError(null);
    try {
      if (decision === 'approve') {
        await api(`/me/proposals/${open.proposalId}/approve`, { method: 'POST', token,
          body: { approved: true, ...(edited.trim() !== (open.suggestedAr ?? '').trim() ? { editedBody: edited.trim() } : {}) } });
      } else {
        const reason = window.prompt('سبب الرفض (يُحفظ مع الاقتراح):') ?? '';
        if (!reason.trim()) { setBusy(false); return; }
        await api(`/me/proposals/${open.proposalId}/reject`, { method: 'POST', token, body: { reason } });
      }
      setOpen(null); await reload();
    } catch (e) {
      const m = (e as Error).message;
      setError(/claim grounding/.test(m) ? 'لم تُعتمد الصياغة: جزء منها لا يستند إلى دليل مسجّل. صياغتك الأصلية محفوظة — عدّليها أو استخدمي الصياغة المختصرة.' : m);
    } finally { setBusy(false); }
  }

  if (loading) return <Loading />;
  const wasEdited = !!open?.suggestedAr && edited.trim() !== open.suggestedAr.trim();
  const claim = open?.claim ?? null;
  const selectedKind = options?.kinds.find((k) => k.kind === kind);
  const checksPassed = claim?.groundingReport?.filter((c) => c.passed).length ?? 0;
  const gnow = claim?.grounding?.now ?? null;
  const groundingIssues = gnow ? gnow.issues.filter((x, i, all) => all.findIndex((y) => y.ar === x.ar) === i) : [];

  return (
    <>
      <Steps current={4} />
      <h1>اقتراحات الرفيق المهني</h1>
      <p className="body-sm muted">اقتراحات لا حقائق: كل صياغة هنا تُعاين وتُعتمد أو تُرفض، ولا شيء يُطبَّق أو يُنشر من تلقاء نفسه — ولا على لينكدإن.</p>
      {error ? <ErrorBanner message={error} /> : null}

      {options ? (
        <section className="card" aria-label="طلب صياغة مهنية">
          <h2>اطلبي صياغة من أدلتك</h2>
          <p className="body-sm muted">نقترح الصياغة من أعمالك المُقيَّمة فقط: ما بنيتِه وما قُيِّم. لا نضيف نتائج أو أرقامًا أو خبرة لم تُسجَّل.</p>
          <label className="field"><span className="field__label">نوع الصياغة</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {options.kinds.map((k) => <option key={k.kind} value={k.kind}>{k.labelAr}{k.policy ? '' : ' — قيد الاعتماد'}</option>)}
            </select>
          </label>
          {selectedKind?.needsEvidence ? (
            <label className="field"><span className="field__label">الدليل</span>
              <select className="input" value={evidenceId} onChange={(e) => setEvidenceId(e.target.value)}>
                {options.evidence.length === 0 ? <option value="">لا أدلة بعد</option> : null}
                {options.evidence.map((e) => <option key={e.id} value={e.id}>{e.projectTitle ?? 'مشروع'} — {e.skillLabelAr}</option>)}
              </select>
            </label>
          ) : null}
          {selectedKind?.policy ? (
            <p className="micro muted">يحتاج هذا النوع مستوى «{LEVEL_AR[selectedKind.policy.minEvidenceLevel] ?? selectedKind.policy.minEvidenceLevel}» على الأقل — {RESOLUTION_AR[selectedKind.policy.resolution] ?? selectedKind.policy.resolution}.</p>
          ) : <p className="micro muted">معيار هذا النوع قيد الاعتماد، فلا يمكن اقتراحه بعد.</p>}
          <button className="btn btn--primary" disabled={busy || !selectedKind?.policy || (selectedKind.needsEvidence && !evidenceId)} onClick={requestDraft}>{busy ? 'جارٍ…' : 'اقترح صياغة'}</button>
          {requestNote && requestNote.length > 0 ? (
            <div className="banner banner--attention" style={{ margin: 0 }}><span>{requestNote.map((r) => r.ar).join(' · ')}</span></div>
          ) : null}
        </section>
      ) : null}

      {open ? (
        <section className="card" aria-label="معاينة الاقتراح">
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="chip chip--new">معاينة</span>
            {claim ? <span className="chip">{claim.labelAr}</span> : null}
            {claim?.groundingStatus ? <span className={`chip ${claim.groundingStatus === 'grounded' ? 'chip--success' : 'chip--attention'}`}>{GROUNDING_AR[claim.groundingStatus] ?? claim.groundingStatus}</span> : null}
            {open.unsupportedRisk && open.unsupportedRisk !== 'none' ? <span className="chip chip--attention">خطر ادعاء غير مدعوم: {open.unsupportedRisk}</span> : null}
          </div>

          <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
            <div className="stack" style={{ gap: 6, flex: '1 1 240px' }}>
              <span className="kicker">الصياغة الحالية</span>
              <p className="body-sm muted">{open.current ?? 'لا توجد صياغة معتمدة من هذا النوع بعد'}</p>
            </div>
            {open.suggestedAr !== null ? (
              <label className="field" style={{ flex: '1 1 240px' }}><span className="field__label">الصياغة المقترحة — يمكنك تعديلها</span>
                <textarea className="input" rows={3} style={{ height: 'auto', padding: '12px 14px' }} value={edited} onChange={(e) => setEdited(e.target.value)} />
              </label>
            ) : null}
          </div>
          {open.suggestedEn ? <p className="body-sm term" lang="en" dir="ltr">{open.suggestedEn}</p> : null}

          <div className="stack" style={{ gap: 6 }}><span className="kicker">لماذا نقترحها</span><p className="body-sm">{open.why}</p>{open.reason ? <p className="body-sm muted">{open.reason}</p> : null}</div>

          <div className="stack" style={{ gap: 6 }}><span className="kicker">الأدلة الداعمة</span>
            {claim && claim.evidence.length > 0 ? (
              <div className="rows">{claim.evidence.map((e) => (
                <div key={e.id} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <span className="chip">{e.projectTitle ?? 'مشروع'}</span><span className="body-sm">{e.skillLabelAr}</span>
                  {e.withdrawn ? <span className="chip chip--attention">مسحوب</span> : null}
                </div>))}</div>
            ) : claim ? <p className="body-sm muted">صياغة عامة تستند إلى المهارات المُثبَتة في ملفك، لا إلى دليل واحد.</p> : (
              <div className="rows">{open.supportingSources.map((s, i) => <div key={i} className="row" style={{ gap: 10 }}><span className="chip">{s.kind}</span><span className="body-sm term" lang="en">{s.ref}</span></div>)}</div>
            )}
          </div>

          {gnow ? (
            <div className="stack" style={{ gap: 6 }}>
              <span className="kicker">ارتباط الصياغة بالأدلة</span>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className={`chip ${DECISION_AR[gnow.decision]?.tone ?? ''}`}>{DECISION_AR[gnow.decision]?.label ?? gnow.decision}</span>
                {gnow.assertions.map((a, i) => <span key={i} className={`chip ${a.status === 'supported' ? '' : 'chip--attention'}`}>{ASSERTION_AR[a.type] ?? a.type}{a.status === 'supported' ? ' ✓' : ''}</span>)}
              </div>
              {gnow.unmapped.ar.length > 0 ? <p className="body-sm">غير مرتبط بدليل: {gnow.unmapped.ar.map((u, i) => <mark key={i} style={{ marginInlineEnd: 6 }}>{u}</mark>)}</p> : null}
              {groundingIssues.length > 0 ? <ul className="body-sm muted" style={{ margin: 0, paddingInlineStart: 18 }}>{groundingIssues.map((x, i) => <li key={i}>{x.ar}</li>)}</ul> : null}
              {gnow.suggestedTrim ? (
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <span className="body-sm">صياغة مختصرة تحذف ما لا يستند إلى دليل فقط: «{gnow.suggestedTrim.ar}»</span>
                  <button className="btn btn--ghost btn--sm" onClick={() => setEdited(gnow.suggestedTrim!.ar)}>استخدمي الصياغة المختصرة</button>
                </div>
              ) : null}
            </div>
          ) : null}

          {claim && claim.missing.length > 0 ? (
            <div className="banner banner--attention" style={{ margin: 0 }}><span>ما ينقص: {claim.missing.map((m) => m.ar).join(' · ')}</span></div>
          ) : null}
          {open.warnings.length > 0 ? <div className="banner banner--attention" style={{ margin: 0 }}><span>{open.warnings.join(' · ')}</span></div> : null}

          {claim ? (
            <div className="stack" style={{ gap: 6 }}>
              <span className="kicker">القاعدة التي تحكم هذه الصياغة</span>
              {claim.policyNow ? (
                <p className="body-sm muted">تحتاج مستوى «{LEVEL_AR[claim.policyNow.minEvidenceLevel] ?? claim.policyNow.minEvidenceLevel}» على الأقل · {RESOLUTION_AR[claim.policyNow.resolution] ?? claim.policyNow.resolution} · <span className="term" lang="en">{claim.policyNow.ref}</span></p>
              ) : <p className="body-sm muted">معيار هذا النوع قيد الاعتماد.</p>}
              {claim.groundingReport ? <p className="micro muted">فحوص الأدلة التي اجتازتها عند اقتراحها: <span className="num">{checksPassed}</span> من <span className="num">{claim.groundingReport.length}</span> (بلا نتائج مخترعة، بلا أرقام غير مسجّلة، بلا تقنيات غير مُعلَنة، بلا خبرة عمل أو عملاء).</p> : null}
            </div>
          ) : null}

          {open.limitationNote ? <p className="disclaimer">{open.limitationNote}</p> : null}
          {wasEdited ? <div className="banner banner--attention" style={{ margin: 0 }}><span>عدّلتِ الصياغة: يُعاد فحصها بالأدلة والقاعدة عند الاعتماد، ويُسقط عنها وسم «مولَّد».</span></div> : null}

          {history.length > 0 ? (
            <div className="stack" style={{ gap: 4 }}><span className="kicker">سجلّ الصياغة</span>
              {history.map((h, i) => <span key={i} className="micro muted">{EVENT_AR[h.event] ?? h.event}</span>)}
            </div>
          ) : null}

          {open.lifecycle === 'awaiting_user' ? (
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn--primary" disabled={busy || (claim !== null && !claim.eligibleNow && !wasEdited)} onClick={() => decide('approve')}>{busy ? 'جارٍ…' : 'اعتماد'}</button>
              <button className="btn btn--ghost" disabled={busy} onClick={() => decide('reject')}>رفض</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setOpen(null)}>إغلاق</button>
            </div>
          ) : <button className="btn btn--ghost btn--sm" onClick={() => setOpen(null)}>إغلاق</button>}
          {claim && !claim.eligibleNow && open.lifecycle === 'awaiting_user' ? <p className="micro muted">لا يمكن اعتمادها كما هي؛ عدّليها (يُعاد فحص التعديل بالأدلة) أو ارفضيها، وتبقى الصياغة الأصلية محفوظة في السجل.</p> : null}
        </section>
      ) : null}

      <section className="card">
        <h2>كل الاقتراحات</h2>
        {items.length === 0 ? <p className="body-sm muted">لا اقتراحات بعد. تظهر بعد تقييم، أو اطلبيها من أدلتك أعلاه.</p> : (
          <div className="rows">
            {items.map((p) => (
              <div key={p.id} className="stack" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <span className="chip chip--info">{AGENT_AR[p.agentType] ?? p.agentType}</span>
                  <span className="chip">{TYPE_AR[p.proposalType] ?? p.proposalType}</span>
                  <span className={`chip ${p.lifecycle === 'approved' ? 'chip--success' : p.lifecycle === 'rejected' ? 'chip--attention' : ''}`}>{LIFECYCLE_AR[p.lifecycle] ?? p.lifecycle}</span>
                  {p.requiresUserApproval && p.lifecycle === 'awaiting_user' ? <button className="link push" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => openPreview(p.id)}>معاينة ←</button> : null}
                </div>
                <span style={{ fontWeight: 500 }}>{p.structuredPayload.kind === 'wording' ? String((p.structuredPayload as unknown as { suggestedValueAr: string }).suggestedValueAr) : p.summary}</span>
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
