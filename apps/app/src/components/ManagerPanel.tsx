'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * A11 Virtual Manager (FR-U-026 / FR-A-002, journey S11): the manager of the work simulation, inside the workspace.
 * Always labelled as a system. One or two messages arrive at their moment; the graduate may answer or ask within a
 * cap; replies never give a solution or hint at a score. The conversation is kept with the work for the reviewer and
 * is not scored in this phase.
 */
interface ManagerView {
  available: boolean; labelAr: string; reasonAr?: string; notScoredAr?: string; personaAr?: string;
  interventions?: { key: string; purposeAr: string; remaining: number }[];
  turns?: { id: string; interventionKey: string; author: 'manager' | 'graduate'; kind: string; body: string; createdAt: string }[];
  cap?: { used: number; total: number; reached: boolean };
}

export function ManagerPanel({ token, projectId, refreshKey, readOnly }: { token: string; projectId: string; refreshKey: string | null; readOnly: boolean }) {
  const [v, setV] = useState<ManagerView | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api<ManagerView>(`/projects/${encodeURIComponent(projectId)}/manager`, { token }).then(setV).catch(() => setV(null));
  }, [token, projectId, refreshKey]);
  if (!v || !v.available) return null;
  const send = async (key: string) => {
    const body = (draft[key] ?? '').trim();
    if (!body) return;
    setBusy(key); setError(null);
    try {
      setV(await api<ManagerView>(`/projects/${encodeURIComponent(projectId)}/manager/messages`, { method: 'POST', token, body: { interventionKey: key, body } }));
      setDraft({ ...draft, [key]: '' });
    } catch (e) { setError((e as Error).message.replace(/^\[[a-z_]+\]\s*/, '')); }
    finally { setBusy(null); }
  };
  return (
    <section className="card" aria-labelledby="manager" data-testid="manager-panel">
      <h2 id="manager">رسائل المدير</h2>
      <p className="body-sm" style={{ margin: 0 }}><span className="chip chip--attention" data-testid="manager-label">{v.labelAr}</span> <span className="muted">· {v.personaAr}</span></p>
      {(v.interventions ?? []).map((i) => (
        <div key={i.key} className="stack" style={{ gap: 6, marginTop: 12 }} data-testid="manager-thread">
          <span className="micro muted">الغرض من هذه الرسالة: {i.purposeAr}</span>
          {(v.turns ?? []).filter((t) => t.interventionKey === i.key).map((t) => (
            <div key={t.id} className={t.author === 'manager' ? 'bubble bubble--manager' : 'bubble bubble--me'} data-testid="manager-turn" data-kind={t.kind}>
              <span className="micro muted">{t.author === 'manager' ? 'المدير (نظام آلي)' : 'أنتِ'}</span>
              <p className="body-sm" style={{ margin: 0 }}>{t.body}</p>
            </div>
          ))}
          {!readOnly && i.remaining > 0 ? (
            <div className="stack" style={{ gap: 6 }}>
              <textarea className="input" rows={2} maxLength={1000} aria-label="ردّك على المدير" placeholder="ردّك أو سؤالك للمدير (اختياري)"
                value={draft[i.key] ?? ''} onChange={(e) => setDraft({ ...draft, [i.key]: e.target.value })} />
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn--secondary btn--sm" disabled={busy === i.key || !(draft[i.key] ?? '').trim()} onClick={() => void send(i.key)}>{busy === i.key ? 'جارٍ الإرسال…' : 'أرسلي'}</button>
                <span className="micro muted">متبقٍّ لهذه الرسالة: <span className="num">{i.remaining}</span></span>
              </div>
            </div>
          ) : null}
        </div>
      ))}
      {error ? <p className="field__error" role="alert">{error}</p> : null}
      <p className="disclaimer">{v.notScoredAr} المدير لا يعطي حلولًا ولا يقيّم عملك.</p>
    </section>
  );
}
