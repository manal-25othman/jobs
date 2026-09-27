'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ReviewQueueItem } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';

/** A. Review queue — blind: activity, criterion and state only. */
export default function ReviewQueuePage() {
  const { token, loading } = useSession();
  const [items, setItems] = useState<ReviewQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!token) return;
    void api<{ items: ReviewQueueItem[] }>('/review/queue', { token }).then((r) => setItems(r.items)).catch((e: Error) => setError(e.message));
  }, [token]);
  async function take(id: string) {
    if (!token) return;
    try { await api(`/review/queue/${id}/assign`, { method: 'POST', token, body: {} }); router.push(`/review/${id}`); } catch (e) { setError((e as Error).message); }
  }
  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!items) return <Loading />;
  return (
    <>
      <p className="kicker">مراجعة بشرية</p>
      <h1>قائمة المراجعة</h1>
      <p className="body-sm muted">تُعرض المهمة والمعيار فقط. لا اسم ولا هوية لصاحب التسليم — المراجعة عمياء افتراضيًا.</p>
      {items.length === 0 && <div className="banner banner--info">لا معايير تنتظر المراجعة الآن.</div>}
      <ul className="stack" style={{ gap: 10 }}>
        {items.map((it) => (
          <li key={it.id} className="card row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div className="grow stack" style={{ gap: 4 }}>
              <strong style={{ fontWeight: 500 }}>{it.criterion.nameAr}</strong>
              <span className="body-sm muted">{it.activity.titleAr} · <span className="term">{it.criterionKey}</span> · {it.criterion.dimension}</span>
            </div>
            <span className={`chip ${it.state === 'pending' ? 'chip--new' : 'chip--info'}`}>{it.state === 'pending' ? 'بانتظار مراجع/ة' : it.state === 'assigned' ? 'مُسنَد إليك' : 'قيد المراجعة'}</span>
            {it.assignedToMe
              ? <button className="btn btn--secondary btn--sm" onClick={() => router.push(`/review/${it.id}`)}>افتحي</button>
              : <button className="btn btn--primary btn--sm" onClick={() => take(it.id)}>خذيها</button>}
          </li>
        ))}
      </ul>
    </>
  );
}
