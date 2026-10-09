'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';

/**
 * Admin Track Builder — shared pieces (Phase 8).
 *
 * The interface never decides who may do what: every button calls the API,
 * and the API checks the caller's role, four eyes and the activation guard.
 * A button shown to the wrong role is refused there; hiding it here is only
 * a convenience.
 */

export type AdminRole = 'track_admin' | 'sme' | 'product_owner';
export const ROLE_AR: Record<AdminRole, string> = { track_admin: 'مسؤول المسار', sme: 'خبير مسمّى (SME)', product_owner: 'مالك المنتج' };

export interface RuleHelp { labelAr: string; meaningAr: string; impactAr: string; expertDependent: boolean }
export interface StageView { stage: 'draft' | 'pending_review' | 'approved' | 'production_active'; stageAr: string; annotation: string | null; annotationAr: string | null }

/** Loads an admin resource with the session token; `reload` re-reads it after an act. */
export function useAdmin<T>(path: string | null) {
  const { token, loading } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!token || !path) return;
    try { setData(await api<T>(`/admin${path}`, { token })); setError(null); } catch (e) { setError((e as Error).message); }
  }, [token, path]);
  useEffect(() => { void reload(); }, [reload]);
  const act = useCallback(async (p: string, body: unknown): Promise<unknown> => {
    if (!token) return null;
    try { const r = await api(`/admin${p}`, { method: 'POST', token, body }); setError(null); await reload(); return r; } catch (e) { setError((e as Error).message); return null; }
  }, [token, reload]);
  return { data, error, setError, loading, reload, act };
}

export function AdminShell({ title, kicker, children, error }: { title: string; kicker?: string; children: ReactNode; error?: string | null }) {
  return (
    <main className="wrap">
      <nav className="row" style={{ gap: 14, flexWrap: 'wrap', marginBlockEnd: 18 }} aria-label="منشئ المسارات">
        <Link className="link" href="/admin">نظرة عامة</Link>
        <Link className="link" href="/admin/content">المحتوى المهني</Link>
      </nav>
      <p className="kicker">{kicker ?? 'منشئ المسارات · للإدارة'}</p>
      <h1>{title}</h1>
      {error ? <ErrorBanner message={error} /> : null}
      {children}
    </main>
  );
}

export { Loading };

const STAGE_CHIP: Record<StageView['stage'], string> = { draft: 'chip', pending_review: 'chip chip--new', approved: 'chip chip--info', production_active: 'chip chip--success' };

/** The four labels map the EXISTING states; annotations say what the label alone would hide (legacy baseline, development only, returned…). */
export function StageChip({ s }: { s: StageView }) {
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      <span className={STAGE_CHIP[s.stage]}>{s.stageAr}</span>
      {s.annotationAr ? <span className="chip chip--attention">{s.annotationAr}</span> : null}
    </span>
  );
}

export function PendingExpert() {
  return <span className="chip chip--attention">بانتظار اعتماد خبير — غير معتمد</span>;
}

/** What a professional rule means and what changing it does — in Arabic, next to the control. */
export function Help({ help }: { help: RuleHelp | null | undefined }) {
  if (!help) return null;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontWeight: 500 }}>{help.labelAr}</strong>
        {help.expertDependent ? <PendingExpert /> : <span className="chip">إداري (غير مهني)</span>}
      </span>
      <span className="body-sm">{help.meaningAr}</span>
      <span className="body-sm muted">أثر التغيير: {help.impactAr}</span>
    </div>
  );
}

/** A button that asks for the written reason every act records. */
export function ReasonButton({ label, kind = 'secondary', onSubmit, confirmAr }: { label: string; kind?: 'primary' | 'secondary' | 'ghost'; onSubmit: (reason: string) => Promise<unknown>; confirmAr?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return <button className={`btn btn--${kind} btn--sm`} onClick={() => setOpen(true)}>{label}</button>;
  return (
    <div className="stack" style={{ gap: 6, minWidth: 260 }}>
      {confirmAr ? <span className="body-sm muted">{confirmAr}</span> : null}
      <label className="field">
        <span className="field__label">السبب (يُسجَّل باسمك)</span>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="row" style={{ gap: 8 }}>
        <button className={`btn btn--${kind === 'ghost' ? 'secondary' : kind} btn--sm`} disabled={busy || !reason.trim()}
          onClick={async () => { setBusy(true); await onSubmit(reason.trim()); setBusy(false); setOpen(false); setReason(''); }}>{label}</button>
        <button className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>إلغاء</button>
      </div>
    </div>
  );
}

export function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export interface FieldDiff { field: string; before: unknown; after: unknown; changed: boolean; help?: RuleHelp | null }

/** Before → after, changed fields first. Shown before every approval and activation. */
export function DiffTable({ fields, labels }: { fields: FieldDiff[]; labels?: Record<string, RuleHelp | null> }) {
  const changed = fields.filter((f) => f.changed);
  if (changed.length === 0) return <p className="body-sm muted">لا فروق في الحقول.</p>;
  return (
    <ul className="rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {changed.map((f) => {
        const h = f.help ?? labels?.[f.field] ?? null;
        return (
          <li key={f.field} className="stack" style={{ gap: 4 }}>
            <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontWeight: 500 }}>{h?.labelAr ?? f.field}</strong> <span className="term">{f.field}</span>
              {h?.expertDependent ? <PendingExpert /> : null}
            </span>
            <span className="body-sm"><span className="muted">قبل:</span> <span className="term">{show(f.before)}</span> ← <span className="muted">بعد:</span> <span className="term">{show(f.after)}</span></span>
            {h ? <span className="body-sm muted">أثر التغيير: {h.impactAr}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

/* Typed controls so routine configuration needs no JSON. The API validates every value again. */
const ENUMS: Record<string, { value: string; ar: string }[]> = {
  // Below «مُثبتة» is refused by the API for skill-asserting kinds (CV bullet at Practiced is a pending decision).
  min_evidence_level: [{ value: 'self_reported', ar: 'مُعلنة ذاتيًا' }, { value: 'practiced', ar: 'ظهرت في مشروع (Practiced)' }, { value: 'demonstrated', ar: 'مُثبتة بدليل (Demonstrated)' },
    { value: 'verified', ar: 'موثّقة (Verified) — التحقق غير متاح حاليًا' }],
  expected_level: [{ value: 'practiced', ar: 'ظهرت في مشروع (Practiced)' }, { value: 'demonstrated', ar: 'مُثبتة بدليل (Demonstrated)' }, { value: 'verified', ar: 'موثّقة (Verified)' }],
  min_source_strength: [{ value: '', ar: 'بلا حد' }, { value: 'platform_controlled', ar: 'منصّة مُتحكَّم بها' }, { value: 'platform_observed', ar: 'مُلاحَظة على المنصّة' },
    { value: 'third_party_asserted', ar: 'طرف ثالث' }, { value: 'self_reported', ar: 'ذاتي' }],
  importance: [{ value: 'critical', ar: 'حرجة' }, { value: 'high', ar: 'عالية' }, { value: 'medium', ar: 'متوسطة' }, { value: 'low', ar: 'منخفضة' }],
  readiness_contribution: [{ value: 'counts', ar: 'تُحتسب في الجاهزية' }, { value: 'informational', ar: 'للعرض فقط' }],
  language: [{ value: 'ar', ar: 'عربي' }, { value: 'en', ar: 'إنجليزي' }],
  cls: [['framing', 'صياغة إطارية'], ['action', 'فعل مسنود بسجل'], ['skill_verb', 'فعل مهارة'], ['evaluation_term', 'مصطلح تقييم'], ['technology_term', 'تقنية'], ['context_term', 'سياق'],
    ['detect_outcome', 'كشف: نتيجة/أثر'], ['detect_professional', 'كشف: خبرة مهنية'], ['detect_credential', 'كشف: شهادة'], ['detect_quality', 'كشف: وصف جودة']].map(([value, ar]) => ({ value: value!, ar: ar! })),
  context_input: [{ value: 'required', ar: 'مطلوب' }, { value: 'optional', ar: 'اختياري' }, { value: 'excluded', ar: 'مستبعد' }],
};
const BOOLEAN_FIELDS = new Set(['requires_verification_decision', 'lock_until_grounded', 'is_core', 'enabled', 'mandatory']);
const NUMBER_FIELDS = new Set(['min_evidence_count', 'min_independent_evidence', 'max_challenges', 'minimum_evidence_count', 'min_assessment_confidence', 'display_order', 'weight', 'threshold_for_skill', 'max_score']);
const CONTEXT_LABEL_AR: Record<string, string> = {
  user_profile: 'الملف الشخصي', user_identity: 'هوية المستخدم', ai_disclosure: 'إفصاح الذكاء الاصطناعي', evidence_items: 'الأدلة', previous_attempts: 'المحاولات السابقة',
  submission_artifacts: 'مخرجات التسليم', human_review_decisions: 'قرارات المراجعة البشرية',
};
const LOCKED_CONTEXT = new Set(['user_profile', 'user_identity']);

export function ValueInput({ field, value, onChange }: { field: string; value: unknown; onChange: (v: unknown) => void }) {
  if (field === 'inputs' && value && typeof value === 'object') {
    const v = value as Record<string, string>;
    return (
      <div className="stack" style={{ gap: 6 }}>
        {Object.entries(v).map(([k, cur]) => (
          <label key={k} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="grow body-sm">{CONTEXT_LABEL_AR[k] ?? k}</span>
            {LOCKED_CONTEXT.has(k)
              ? <span className="chip">مستبعد دائمًا</span>
              : <select className="input" style={{ width: 'auto' }} value={cur} onChange={(e) => onChange({ ...v, [k]: e.target.value })}>
                  {ENUMS['context_input']!.map((o) => <option key={o.value} value={o.value}>{o.ar}</option>)}
                </select>}
          </label>
        ))}
      </div>
    );
  }
  if (ENUMS[field]) {
    return (
      <select className="input" value={value === null || value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
        {ENUMS[field]!.map((o) => <option key={o.value} value={o.value}>{o.ar}</option>)}
      </select>
    );
  }
  if (BOOLEAN_FIELDS.has(field)) {
    return <label className="check-row"><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /><span className="body-sm">{value === true ? 'نعم' : 'لا'}</span></label>;
  }
  if (NUMBER_FIELDS.has(field)) {
    return <input className="input num" type="number" step="any" value={value === null || value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
  }
  if (Array.isArray(value)) {
    return <input className="input" value={(value as unknown[]).join('، ')} placeholder="قيم مفصولة بفاصلة" onChange={(e) => onChange(e.target.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean))} />;
  }
  if (value && typeof value === 'object') {
    // Rare: a structured definition (e.g. a challenge trigger, stored and never interpreted). Shown as text, validated by the API.
    return <textarea className="input" rows={3} defaultValue={JSON.stringify(value)} onBlur={(e) => { try { onChange(JSON.parse(e.target.value)); } catch { /* the API reports it */ } }} />;
  }
  return <input className="input" value={value === null || value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value)} />;
}
