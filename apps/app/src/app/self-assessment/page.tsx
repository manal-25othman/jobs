'use client';

import { useEffect, useState } from 'react';
import { api, type SelfAssessmentView } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';
import { JourneyNav } from '../../components/JourneyNav';

/**
 * FR-U-013 / BR-001 (journey S06) — the graduate rates themself on the skills of their role. The rating is a starting
 * point at confidence Observed only: never evidence, never a level, never shown to anyone else. A change is a new entry
 * (the history is kept). Over-rating is not corrected here; evaluated work shows the real picture later.
 */
export default function SelfAssessmentPage() {
  const { token, loading } = useSession();
  const [v, setV] = useState<SelfAssessmentView | null>(null);
  const [draft, setDraft] = useState<Record<string, { rating: string; note: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = (x: SelfAssessmentView) => {
    setV(x);
    setDraft(Object.fromEntries(x.items.map((i) => [i.skillId, { rating: i.latest?.rating ?? '', note: i.latest?.note ?? '' }])));
  };
  useEffect(() => { if (!token) return; void api<SelfAssessmentView>('/me/self-assessment', { token }).then(load).catch((e) => setError((e as Error).message)); }, [token]);
  if (loading) return <main className="wrap"><Loading /></main>;
  if (error) return <main className="wrap"><ErrorBanner message={error} /></main>;
  if (!v || !token) return <main className="wrap"><Loading /></main>;
  if (!v.role) return <main className="wrap"><h1>تقييمك الذاتي</h1><section className="card"><p className="body-sm">اختاري هدفك المهني أولًا. <a className="link" href="/goal">هدفي المهني ←</a></p></section></main>;
  const save = async () => {
    setBusy(true); setSaved(null); setError(null);
    try {
      const items = Object.entries(draft).filter(([, d]) => d.rating).map(([skillId, d]) => ({ skillId, rating: d.rating, note: d.note.trim() || null }));
      if (!items.length) { setSaved('لم تختاري تقديرًا لأي مهارة بعد.'); return; }
      const r = await api<SelfAssessmentView>('/me/self-assessment', { method: 'PUT', token, body: { items } });
      const n = r.recorded ?? 0;
      load(r); setSaved(n ? `حُفظ تقديرك ${n === 1 ? 'لمهارة واحدة' : n === 2 ? 'لمهارتين' : n <= 10 ? `لـ${n} مهارات` : `لـ${n} مهارة`}. لم يتغيّر أي مستوى.` : 'لا تغيير لحفظه.');
    } catch (e) { setError((e as Error).message.replace(/^\[[a-z_]+\]\s*/, '')); }
    finally { setBusy(false); }
  };
  return (
    <main className="wrap">
      <JourneyNav current={null} />
      <h1>تقييمك الذاتي</h1>
      <p className="body-sm">{v.noticeAr}</p>
      <div className="banner banner--info" role="note" data-testid="self-assessment-notice"><span className="grow">{v.notEvidenceAr}</span></div>
      <section className="card">
        <h2>مهارات {v.role.labelAr}</h2>
        <p className="micro muted">اختاري لكل مهارة ما يصفك الآن. «لست متأكدة» إجابة مقبولة.</p>
        <div className="rows">
          {v.items.map((i) => (
            <fieldset key={i.skillId} className="stack" style={{ gap: 6, border: 0, padding: 0, margin: 0 }} data-testid="self-assessment-skill">
              <legend className="body-sm" style={{ fontWeight: 500 }}>{i.labelAr}</legend>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                {v.scale.map((s) => (
                  <label key={s.key} className="body-sm row" style={{ gap: 4 }} title={s.descriptorAr || undefined}>
                    <input type="radio" name={`r-${i.skillId}`} value={s.key} checked={draft[i.skillId]?.rating === s.key}
                      onChange={() => setDraft({ ...draft, [i.skillId]: { rating: s.key, note: draft[i.skillId]?.note ?? '' } })} />
                    {s.labelAr}
                  </label>
                ))}
              </div>
              <input className="input" type="text" maxLength={500} placeholder="ملاحظة لك وحدك (اختيارية)" aria-label={`ملاحظة عن ${i.labelAr}`}
                value={draft[i.skillId]?.note ?? ''} onChange={(e) => setDraft({ ...draft, [i.skillId]: { rating: draft[i.skillId]?.rating ?? '', note: e.target.value } })} />
              {i.latest ? <span className="micro muted">آخر تقدير: {i.latest.ratingAr}{i.latest.count > 1 ? ` · ${i.latest.count} تقديرات محفوظة` : ''}</span> : null}
            </fieldset>
          ))}
        </div>
        <div className="row" style={{ gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => void save()} disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'احفظي تقديري'}</button>
          {saved ? <span className="body-sm" role="status" data-testid="self-assessment-saved">{saved}</span> : null}
        </div>
      </section>
      <p className="disclaimer">يبقى تقديرك محفوظًا لك وحدك، ولا يظهر في السيرة ولا في أي رابط مشاركة. مستوى المهارة يتغيّر بالعمل المُقيَّم فقط.</p>
    </main>
  );
}
