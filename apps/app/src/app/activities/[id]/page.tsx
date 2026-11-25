'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, isNotFound, type ActivityDetail, type Project } from '../../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../../components/Session';
import { ExperimentalNotice } from '../../../components/ExperimentalNotice';
import { Steps } from '../../../components/Steps';
import { JourneyNav, Crumbs } from '../../../components/JourneyNav';
import {
  assessmentCopy, chipClass, workStatusCopy, nextActionFor, friendlyErrorAr, afterSubmissionAr, deliverablesSummaryAr,
  AI_USAGE_AR, LEVEL_OF_ACTIVITY_AR, SUBMISSION_IS_NOT_A_LEVEL_AR, sizeLabel,
} from '../../../lib/journey';
import { STARTER_MATERIALS_MISSING_AR } from '@naqla/domain';

/**
 * U2 — one activity, learner-safe projection only (GET /me/activities/:id).
 *
 * Starting is offered only when the API says the activity is in the graduate's catalogue (`available`); the API
 * authorizes the start again (POST /projects). Missing starter materials are said plainly, never simulated.
 */
export default function ActivityDetailPage() {
  const { token, loading } = useSession();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<ActivityDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);

  useEffect(() => {
    if (!token || !params?.id) return;
    void api<ActivityDetail>(`/me/activities/${encodeURIComponent(params.id)}`, { token })
      .then(setA)
      .catch((e) => { if (isNotFound(e)) setNotFound(true); else setError((e as Error).message); });
  }, [token, params?.id]);

  async function start() {
    if (!token || !a || starting.current) return; // one start per click, however fast the clicks
    starting.current = true; setBusy(true); setError(null);
    try {
      const p = await api<Project>('/projects', { method: 'POST', token, body: { title: a.titleAr, kind: 'platform_activity', activitySpecId: a.id } });
      router.push(`/work/${encodeURIComponent(p.id)}`);
    } catch (e) {
      setError(isNotFound(e) ? 'لم يعد هذا النشاط متاحًا لك. حدّثي الصفحة.' : friendlyErrorAr((e as Error).message, 'تعذّر بدء النشاط. حاولي مجددًا.').textAr);
      starting.current = false; setBusy(false);
    }
  }

  if (loading) return <main className="wrap"><Loading /></main>;
  if (notFound) {
    return (
      <main className="wrap">
        <JourneyNav current={null} />
        <h1>هذا النشاط غير متاح</h1>
        <section className="card">
          <p className="body-sm">لا يظهر هذا النشاط ضمن أنشطة دورك. قد يكون غير منشور، أو لدور آخر، أو أن الرابط غير صحيح.</p>
          <a className="link" href="/activities">أنشطة دورك ←</a>
        </section>
      </main>
    );
  }
  if (error && !a) return <main className="wrap"><ErrorBanner message={error} /></main>;
  if (!a) return <main className="wrap"><Loading /></main>;

  const copy = assessmentCopy(a.assessment, a.isDemo);
  const existing = a.myProjects[0] ?? null;

  return (
    <main className="wrap">
      <Steps current={1} />
      <JourneyNav current={null} />
      <Crumbs items={[{ label: 'أنشطة دوري', href: '/activities' }, { label: a.titleAr }]} />
      <h1>{a.titleAr}</h1>
      <p className="body-sm muted">
        {a.estimatedMinutes ? <>≈ <span className="num">{a.estimatedMinutes}</span> دقيقة · </> : null}
        {a.level ? <>المستوى: {LEVEL_OF_ACTIVITY_AR[a.level] ?? a.level}</> : null}
        {a.isDemo ? null : <> · <span className={chipClass(copy.tone)}>{copy.chipAr}</span></>}
      </p>
      {error ? <ErrorBanner message={error} /> : null}
      {/* One notice for demo content (it already says it raises no level). */}
      {a.isDemo ? <ExperimentalNotice kind="activity" /> : null}
      {!a.available ? (
        <div className="banner banner--info" role="note">
          <span className="grow">هذا النشاط لم يعد ضمن أنشطة دورك الحالي. يمكنك مراجعة عملك السابق عليه، دون بدء عمل جديد.</span>
        </div>
      ) : null}

      <section className="card" aria-labelledby="brief" data-testid="activity-brief">
        <h2 id="brief">باختصار</h2>
        <ol className="body-sm" style={{ margin: 0, paddingInlineStart: 20, display: 'grid', gap: 6 }}>
          {a.objectiveAr ? <li><strong style={{ fontWeight: 500 }}>المطلوب منك: </strong>{a.objectiveAr}</li> : null}
          <li><strong style={{ fontWeight: 500 }}>ما تسلّمينه: </strong>{deliverablesSummaryAr(a.deliverables.length, a.deliverables.filter((d) => d.kind === 'file').length)} — التفاصيل في «المخرجات المطلوبة» أدناه.</li>
          <li><strong style={{ fontWeight: 500 }}>بعد التسليم: </strong>{afterSubmissionAr(a.assessment, a.isDemo)}</li>
        </ol>
        <p className="micro muted" style={{ margin: 0 }}>{AI_USAGE_AR[a.aiUsageMode] ?? ''}</p>
      </section>

      {a.businessContextAr ? (
        <section className="card" aria-labelledby="ctx">
          <h2 id="ctx">سياق العمل</h2>
          <p className="body-sm" style={{ margin: 0 }}>{a.businessContextAr}</p>
        </section>
      ) : null}

      <section className="card" aria-labelledby="skills">
        <h2 id="skills">المهارات التي تطوّرينها</h2>
        {a.skills.length ? (
          <div className="rows">
            {a.skills.map((s) => (
              <div key={s.id} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="grow body-sm">{s.labelAr}</span>
                <span className="chip">{s.depth === 'primary' ? 'مهارة رئيسية' : 'مهارة مساندة'}</span>
              </div>
            ))}
          </div>
        ) : <p className="body-sm muted">لا مهارة منشورة مرتبطة بهذا النشاط بعد.</p>}
      </section>

      <section className="card" aria-labelledby="deliv">
        <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h2 id="deliv">المخرجات المطلوبة</h2>
          <span className="chip push">
            <span className="num">{a.deliverables.filter((d) => d.mandatory).length}</span> إلزامية
            {a.deliverables.some((d) => !d.mandatory) ? <> · <span className="num">{a.deliverables.filter((d) => !d.mandatory).length}</span> اختيارية</> : null}
          </span>
        </div>
        <div className="rows">
          {a.deliverables.map((d) => (
            <div key={d.key} className="stack" style={{ gap: 4 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="grow body-sm" style={{ fontWeight: 500 }}>{d.descriptionAr ?? d.descriptionEn ?? d.key}</span>
                <span className="chip">{d.kind === 'file' ? 'ملف' : 'نص تكتبينه'}</span>
                <span className="chip">{d.mandatory ? 'إلزامي' : 'اختياري'}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {a.inputs.length ? (
        <section className="card" aria-labelledby="inputs">
          <h2 id="inputs">ما يُقدَّم لك في النشاط</h2>
          <div className="rows">
            {a.inputs.map((i) => (
              <p key={i.key} className="body-sm" style={{ margin: 0 }}>
                {i.descriptionWithheld ? <span className="muted">مادة تُقدَّم مع النشاط (يُكشف محتواها عند العمل عليها)</span> : (i.descriptionAr ?? i.descriptionEn)}
              </p>
            ))}
          </div>
          {a.materials && a.materials.length ? (
            <div className="rows">
              {a.materials.map((m) => (
                <div key={m.id} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <span className="grow body-sm">مواد البداية: <span className="term">{m.fileName}</span></span>
                  <span className="micro muted num">{sizeLabel(m.sizeBytes)}</span>
                </div>
              ))}
              <p className="disclaimer" style={{ margin: 0 }}>تنزّلينها من مكان العمل بعد بدء النشاط، وتعملين عليها بأدواتك. هي خاصة بك: لا تنشريها في مستودع عام.</p>
            </div>
          ) : null}
          {a.startable === false ? (
            <p className="disclaimer">{STARTER_MATERIALS_MISSING_AR}</p>
          ) : !a.materialsAvailable && !(a.materials?.length) ? (
            <p className="disclaimer">لا ملفات بداية لهذا النشاط على المنصّة؛ ما يُقدَّم لك موصوف أعلاه.</p>
          ) : null}
        </section>
      ) : null}

      <section className="card" aria-labelledby="assess">
        <h2 id="assess">كيف يُقيَّم عملك</h2>
        {a.isDemo ? null : <p className="body-sm" style={{ margin: 0 }}><span className={chipClass(copy.tone)}>{copy.chipAr}</span></p>}
        <p className="body-sm" style={{ margin: 0 }}>{copy.explanationAr}</p>
        <p className="body-sm muted" style={{ margin: 0 }}>{SUBMISSION_IS_NOT_A_LEVEL_AR}</p>
      </section>

      {a.myProjects.length ? (
        <section className="card" aria-labelledby="mine">
          <h2 id="mine">عملك على هذا النشاط</h2>
          <div className="rows">
            {a.myProjects.map((p) => {
              const st = workStatusCopy(p.workStatus);
              const next = nextActionFor({ projectId: p.id, workStatus: p.workStatus, latestSubmissionId: p.latestSubmission?.id ?? null });
              return (
                <div key={p.id} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <span className={chipClass(st.tone)}>{st.labelAr}</span>
                  <span className="micro muted">المحاولات: <span className="num">{p.attempts}</span></span>
                  <a className="link push" href={next.href}>{next.labelAr} ←</a>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {a.available ? (
        <div className="next-action">
          <span className="kicker">الخطوة التالية</span>
          {existing ? (
            <>
              <h2>تابعي عملك على هذا النشاط</h2>
              <p>لديك عمل قائم عليه. يمكنك متابعته وتسليم محاولة جديدة متى شئتِ.</p>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <a className="btn btn--on-dark" style={{ textDecoration: 'none' }} href={`/work/${encodeURIComponent(existing.id)}`}>تابعي العمل</a>
                <button className="btn btn--ghost" onClick={start} disabled={busy}>{busy ? 'جارٍ البدء…' : 'ابدئي عملًا جديدًا'}</button>
              </div>
            </>
          ) : (
            <>
              <h2>ابدئي النشاط</h2>
              {a.startable === false ? (
                <>
                  <p>{STARTER_MATERIALS_MISSING_AR}</p>
                  <div><button className="btn btn--on-dark" disabled aria-disabled="true">غير متاح بعد</button></div>
                </>
              ) : (
                <>
                  <p>يُنشأ لك مكان عمل لهذا النشاط، وتنزّلين منه مواد البداية. لا يُقيَّم شيء قبل أن تسلّمي.</p>
                  <div><button className="btn btn--on-dark" onClick={start} disabled={busy}>{busy ? 'جارٍ البدء…' : 'ابدئي النشاط'}</button></div>
                </>
              )}
            </>
          )}
        </div>
      ) : null}
    </main>
  );
}
