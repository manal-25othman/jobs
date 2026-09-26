'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type CvBulletAsset } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';
import { Steps } from '../../components/Steps';

function AssetInner() {
  const { token, loading } = useSession();
  const params = useSearchParams();
  const evidenceId = params.get('evidence');
  const [asset, setAsset] = useState<CvBulletAsset | null>(null);
  const [preview, setPreview] = useState<{ evidenceBasis: { clause: string; kind: string; ref: string }[] } | null>(null);
  const [edited, setEdited] = useState<string>('');
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!token || !evidenceId) return;
    void (async () => {
      try {
        const a = await api<CvBulletAsset>(`/evidence/${evidenceId}/cv-bullet`, {
          method: 'POST', token,
        });
        setAsset(a);
        setEdited(a.bodyAr);
        const p = await api<{ evidenceBasis: { clause: string; kind: string; ref: string }[] }>(
          `/me/assets/${a.id}/preview`, { method: 'POST', token },
        );
        setPreview(p);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [token, evidenceId]);

  async function approve() {
    if (!token || !asset) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/me/assets/${asset.id}/approve`, {
        method: 'POST', token,
        body: {
          approved: true,
          ...(edited.trim() !== asset.bodyAr.trim() ? { editedBody: edited.trim() } : {}),
        },
      });
      setApproved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!asset) return <Loading />;

  const wasEdited = edited.trim() !== asset.bodyAr.trim();

  return (
    <>
      <Steps current={4} />
      <h1>بند سيرة — معاينة قبل الاعتماد</h1>

      <section className="card">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span className="chip chip--new">مسودة</span>
          <span className="micro muted">
            مُولَّد حتميًا من التقييم · <span className="term" lang="en">no model used</span>
          </span>
        </div>

        <label className="field">
          <span className="field__label">البند المقترح</span>
          <textarea
            className="input" rows={3} style={{ height: 'auto', padding: '12px 14px', resize: 'vertical' }}
            value={edited} onChange={(e) => setEdited(e.target.value)}
          />
        </label>

        {asset.bodyEn ? (
          <div className="stack" style={{ gap: 4 }}>
            <span className="field__label">الصيغة الإنجليزية</span>
            <p className="body-sm term" lang="en" dir="ltr">{asset.bodyEn}</p>
          </div>
        ) : null}

        {wasEdited ? (
          <div className="banner banner--attention" role="status" style={{ margin: 0 }}>
            <span className="grow">
              عدّلتِ الصياغة. التعديل خارج ما أثبته التقييم يُسقط وسم التوثيق عن البند.
            </span>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>على ماذا يستند كل جزء</h2>
        <div className="rows">
          {(preview?.evidenceBasis ?? asset.traces).map((t, i) => (
            <div key={`${t.ref}-${i}`} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className="chip">{t.kind}</span>
              <span className="grow body-sm">{t.clause}</span>
              <span className="micro muted term" lang="en">{t.ref}</span>
            </div>
          ))}
        </div>
        <p className="disclaimer">
          لا جملة بلا مصدر. ولا تظهر تقنية لم تُصرّحي بها: المنصة نفسها مبنية بـ
          <span className="term" lang="en"> React</span>، وهذا لا يقول شيئًا عنك.
        </p>
      </section>

      {approved ? (
        <div className="banner banner--success" role="status">
          <span className="grow">تمّ الاعتماد. صار البند فعّالًا ويظهر في تقرير الأدلة.</span>
          <button className="link" style={{ background: 'none', border: 0, cursor: 'pointer' }}
                  onClick={() => router.push('/report')}>
            عرض التقرير ←
          </button>
        </div>
      ) : (
        <div className="next-action">
          <span className="kicker">لا يُطبَّق شيء قبل اعتمادك</span>
          <h2>اعتمدي البند ليصبح فعّالًا</h2>
          <p>لا تُضاف أي صياغة يولّدها النظام إلى مخرجاتك المهنية دون اعتماد صريح منك.</p>
          <div>
            <button className="btn btn--on-dark" onClick={approve} disabled={busy}>
              {busy ? 'جارٍ…' : 'اعتماد البند'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function AssetPage() {
  return (
    <main className="wrap">
      <Suspense fallback={<Loading />}>
        <AssetInner />
      </Suspense>
    </main>
  );
}
