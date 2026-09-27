'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, type ReviewItem } from '../../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../../components/Session';

/** B–E. Review detail → criterion decision → rationale → submit. Blind: no identity anywhere in the payload. */
export default function ReviewDetailPage() {
  const { token, loading } = useSession();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ReviewItem | null>(null);
  const [level, setLevel] = useState('');
  const [rationale, setRationale] = useState('');
  const [disagree, setDisagree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ pendingItems: number; finalized: unknown } | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    void api<ReviewItem>(`/review/items/${id}`, { token }).then(setItem).catch((e: Error) => setError(e.message));
  }, [token, id]);

  async function submit() {
    if (!token || !item) return;
    setBusy(true); setError(null);
    try {
      const last = item.previousDecisions[item.previousDecisions.length - 1];
      const r = await api<{ pendingItems: number; finalized: unknown }>(`/review/items/${item.itemId}/decision`, { method: 'POST', token,
        body: { levelKey: level, rationale, disagreementWithAutomated: disagree, ...(last ? { supersedesReviewId: last.reviewId } : {}) } });
      setDone(r);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (loading) return <Loading />;
  if (error && !item) return <ErrorBanner message={error} />;
  if (!item) return <Loading />;
  const c = item.criterion;

  if (done) {
    return (
      <>
        <h1>سُجِّل القرار</h1>
        <div className="banner banner--success" role="status">
          قرارك على «{c.nameAr}» محفوظ ولا يُعدَّل؛ أي تغيير لاحق يُسجَّل قرارًا جديدًا.
          {done.finalized ? ' اكتملت مراجعة كل المعايير، وجُمِّعت النتيجة وفق قواعد النطاق.' : ` بقي ${done.pendingItems} معيارًا ينتظر المراجعة.`}
        </div>
        <button className="btn btn--secondary" onClick={() => router.push('/review')}>عودة إلى القائمة</button>
      </>
    );
  }

  return (
    <>
      <p className="kicker">مراجعة بشرية · معيار واحد</p>
      <h1>{c.nameAr}</h1>
      <section className="card stack" style={{ gap: 8 }}>
        <h2>سياق المهمة</h2>
        <p><strong style={{ fontWeight: 500 }}>{item.activity.titleAr}</strong></p>
        <p className="body-sm">{item.activity.businessContextAr}</p>
        <p className="body-sm muted">{item.activity.objectiveAr}</p>
        <p className="micro muted">نمط استخدام AI في هذا النشاط: <span className="term">{item.activity.aiUsageMode}</span> · الإفصاح المُعلَن: {item.submission.aiDisclosure.declaredUse.join('، ') || 'لا شيء'} — الإفصاح لا يخفض الدرجة.</p>
      </section>
      <section className="card stack" style={{ gap: 8 }}>
        <h2>المعيار</h2>
        <p className="body-sm">{c.descriptionAr}</p>
        <p className="body-sm muted">الدليل المتوقَّع: {c.expectedEvidenceAr} · {c.mandatory ? 'إلزامي' : 'اختياري'} · الحد الأقصى <span className="num">{c.maxScore}</span></p>
      </section>
      <section className="card stack" style={{ gap: 8 }}>
        <h2>التسليم</h2>
        <ul className="stack" style={{ gap: 4 }}>
          {item.submission.files.map((f) => <li key={f.name} className="row" style={{ gap: 8 }}><a className="term" href={f.downloadUrl} target="_blank" rel="noreferrer">{f.name}</a><span className="micro muted num push">{f.sizeBytes} B</span></li>)}
          {item.submission.artifacts.filter((a) => !/^(note|answer)\./.test(a.key)).map((a) => <li key={a.key} className="row" style={{ gap: 8 }}><span className="term">{a.key}</span><span className="micro muted push">{a.valueText ?? (a.valueBool === null ? a.valueNumber : String(a.valueBool))}{a.locator ? ` · ${a.locator}` : ''}</span></li>)}
        </ul>
        {item.submission.userExplanation.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <h3 className="body-sm" style={{ fontWeight: 500 }}>شرح صاحب/ة التسليم</h3>
            {item.submission.userExplanation.map((e) => <blockquote key={e.key} className="body-sm" style={{ margin: 0 }}><span className="term micro muted">{e.key}</span><br />{e.text}</blockquote>)}
          </div>
        )}
      </section>
      <section className="card stack" style={{ gap: 8 }}>
        <h2>ما قرّرته القواعد سلفًا</h2>
        <ul className="stack" style={{ gap: 4 }}>
          {item.deterministic.criteria.map((d) => <li key={d.key} className="row" style={{ gap: 8 }}><span className="term">{d.key}</span><span className="num push">{d.score}/{d.maxScore}</span></li>)}
          {item.deterministic.integrityChecks.map((i) => <li key={i.key} className="row" style={{ gap: 8 }}><span className="term">{i.key}</span><span className={`chip push ${i.passed ? 'chip--success' : 'chip--attention'}`}>{i.passed ? 'مستوفى' : 'غير مستوفى'}</span></li>)}
        </ul>
        <p className="micro muted">هذه النتائج نهائية؛ المراجعة البشرية لا تتجاوزها.</p>
      </section>
      <section className="card stack" style={{ gap: 10 }}>
        <h2>القرار</h2>
        <div className="stack" style={{ gap: 8 }} role="radiogroup" aria-label="مستوى المعيار">
          {c.levels.map((l) => (
            <label key={l.levelKey} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <input type="radio" name="level" value={l.levelKey} checked={level === l.levelKey} onChange={() => setLevel(l.levelKey)} />
              <span className="stack"><span><strong style={{ fontWeight: 500 }}>{l.descriptorAr}</strong> <span className="num muted">({l.score})</span></span><span className="micro muted term">{l.observableEvidenceEn}</span></span>
            </label>
          ))}
        </div>
        <label className="stack" style={{ gap: 4 }}>
          <span className="body-sm">المبرّر (إلزامي — ما الذي لاحظتِه في التسليم؟)</span>
          <textarea className="input" rows={4} value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={disagree} onChange={(e) => setDisagree(e.target.checked)} /><span className="body-sm">قراري يختلف عمّا تقترحه النتائج الآلية</span></label>
        {error && <ErrorBanner message={error} />}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--primary" disabled={!level || rationale.trim().length < 12 || busy} onClick={submit}>{item.previousDecisions.length ? 'تسجيل قرار جديد (يتجاوز السابق)' : 'تسجيل القرار'}</button>
          <button className="btn btn--ghost" onClick={() => router.push('/review')}>رجوع</button>
        </div>
        {item.previousDecisions.length > 0 && <p className="micro muted">قرارات سابقة على هذا البند: {item.previousDecisions.map((d) => `${d.decision} (${d.score})`).join(' → ')} — كلها محفوظة.</p>}
      </section>
    </>
  );
}
