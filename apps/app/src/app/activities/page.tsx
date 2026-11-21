'use client';

import { useEffect, useState } from 'react';
import { api, type ActivityCatalogue } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';
import { ExperimentalChip } from '../../components/ExperimentalNotice';
import { Steps } from '../../components/Steps';
import { JourneyNav } from '../../components/JourneyNav';
import { assessmentCopy, chipClass, workStatusCopy, afterSubmissionAr, deliverablesSummaryAr, AI_USAGE_AR, LEVEL_OF_ACTIVITY_AR, SUBMISSION_IS_NOT_A_LEVEL_AR } from '../../lib/journey';

/**
 * U1 — the activity catalogue of the graduate's current role.
 *
 * The list is exactly what GET /me/activities returns: the database decides what a graduate may see (D-119),
 * so nothing is filtered, added or hidden here. No rubric detail exists in the payload to show.
 */
export default function ActivitiesPage() {
  const { token, loading } = useSession();
  const [data, setData] = useState<ActivityCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        await api('/me/bootstrap', { method: 'POST', body: {}, token });
        setData(await api<ActivityCatalogue>('/me/activities', { token }));
      } catch (e) { setError((e as Error).message); }
    })();
  }, [token]);

  if (loading) return <main className="wrap"><Loading /></main>;

  return (
    <main className="wrap">
      <Steps current={1} />
      <JourneyNav current="/activities" />
      <h1>أنشطة دورك</h1>
      {error ? <ErrorBanner message={error} /> : null}
      {!data && !error ? <Loading /> : null}

      {data?.unavailableReason === 'no_career_goal' ? (
        <section className="card" aria-labelledby="no-goal">
          <h2 id="no-goal">اختاري هدفك المهني أولًا</h2>
          <p className="body-sm">الأنشطة مرتبطة بالدور الذي تستهدفينه. حين تختارين هدفك تظهر هنا أنشطته.</p>
          <a className="link" href="/goal">اختيار الهدف المهني ←</a>
        </section>
      ) : null}

      {data?.unavailableReason === 'role_unavailable' ? (
        <section className="card" aria-labelledby="role-off">
          <h2 id="role-off">الدور الذي اخترتِه لم يعد متاحًا</h2>
          <p className="body-sm">عملك السابق محفوظ ويمكنك مراجعته في «أعمالي». لبدء أنشطة جديدة اختاري دورًا متاحًا.</p>
          <p className="body-sm"><a className="link" href="/goal">تغيير الهدف المهني ←</a> · <a className="link" href="/work">أعمالي ←</a></p>
        </section>
      ) : null}

      {data?.role ? (
        <p className="body-sm muted">
          الدور: <strong style={{ fontWeight: 500 }}>{data.role.labelAr}</strong>
          {data.role.isDemo ? <> <span className="chip chip--attention">تجريبي — غير مراجَع</span></> : null}
        </p>
      ) : null}

      {data && !data.unavailableReason && data.items.length === 0 ? (
        <section className="card">
          <h2>لا أنشطة منشورة لهذا الدور بعد</h2>
          <p className="body-sm">تُضاف الأنشطة بعد مراجعتها ونشرها. لا نعرض أنشطة لم تكتمل مراجعتها.</p>
          <a className="link" href="/skills">مهارات المسار ←</a>
        </section>
      ) : null}

      {data?.items.map((a) => {
        const copy = assessmentCopy(a.assessment, a.isDemo);
        const status = a.myLatest ? workStatusCopy(a.myLatest.workStatus) : null;
        return (
          <article key={a.id} className="card" aria-labelledby={`act-${a.id}`}>
            <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h2 id={`act-${a.id}`} className="grow">{a.titleAr}</h2>
              {/* One label per card: demo content carries the experimental label instead of a second demo chip. */}
              {a.isDemo ? <ExperimentalChip /> : <span className={chipClass(copy.tone)}>{copy.chipAr}</span>}
            </div>
            <dl className="activity-summary body-sm" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
              {a.objectiveAr ? <><dt className="muted">المطلوب</dt><dd style={{ margin: 0 }}>{a.objectiveAr}</dd></> : null}
              <dt className="muted">تسلّمين</dt><dd style={{ margin: 0 }}>{deliverablesSummaryAr(a.deliverableCount, a.fileDeliverableCount)}</dd>
              <dt className="muted">بعد التسليم</dt><dd style={{ margin: 0 }}>{afterSubmissionAr(a.assessment, a.isDemo)}</dd>
            </dl>
            <p className="micro muted" style={{ margin: 0 }}>
              {a.estimatedMinutes ? <>≈ <span className="num">{a.estimatedMinutes}</span> دقيقة · </> : null}
              {a.level ? <>المستوى: {LEVEL_OF_ACTIVITY_AR[a.level] ?? a.level} · </> : null}
              {AI_USAGE_AR[a.aiUsageMode] ?? ''}
            </p>
            {a.skills.length ? (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} aria-label="المهارات الرئيسية">
                {a.skills.filter((s) => s.depth === 'primary').map((s) => <span key={s.id} className="chip">{s.labelAr}</span>)}
                {a.skills.some((s) => s.depth !== 'primary')
                  ? <span className="micro muted">{supportingCountAr(a.skills.filter((s) => s.depth !== 'primary').length)} — في صفحة النشاط</span> : null}
              </div>
            ) : null}
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <span className={status ? chipClass(status.tone) : 'chip'}>{status ? status.labelAr : 'لم تبدئيه بعد'}</span>
              {a.myLatest && a.myLatest.attempts > 0 ? <span className="micro muted">المحاولات: <span className="num">{a.myLatest.attempts}</span></span> : null}
              <span className="push row" style={{ gap: 12 }}>
                {a.myLatest ? <a className="link" href={`/work/${encodeURIComponent(a.myLatest.projectId)}`}>تابعي عملك ←</a> : null}
                <a className="link" href={`/activities/${encodeURIComponent(a.id)}`} aria-label={`عرض النشاط: ${a.titleAr}`}>عرض النشاط ←</a>
              </span>
            </div>
          </article>
        );
      })}

      {data && data.items.length > 0 ? <p className="disclaimer">{SUBMISSION_IS_NOT_A_LEVEL_AR}</p> : null}
    </main>
  );
}

/** "and N supporting skills", with Arabic number agreement. */
function supportingCountAr(n: number): string {
  return n === 1 ? 'ومهارة مساندة واحدة' : n === 2 ? 'ومهارتان مساندتان' : `و${n} مهارات مساندة`;
}
