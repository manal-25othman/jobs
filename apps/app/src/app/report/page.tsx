'use client';

import { useEffect, useState } from 'react';
import { api, type EvidenceReport } from '../../lib/api';
import { useSession, Loading, ErrorBanner, EvidenceState } from '../../components/Session';
import { Steps } from '../../components/Steps';

/**
 * Career Evidence Report.
 *
 * Built by the domain from a whitelist of fields. Nothing private can reach
 * this page, because nothing private reaches the object it renders.
 */
export default function ReportPage() {
  const { token, loading } = useSession();
  const [report, setReport] = useState<EvidenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    void api<EvidenceReport>('/me/evidence-report', { method: 'POST', token })
      .then(setReport)
      .catch((e) => setError((e as Error).message));
  }, [token]);

  async function share() {
    if (!token || !report) return;
    setBusy(true);
    try {
      const l = await api<{ token: string }>('/share-links', {
        method: 'POST', token,
        body: { resourceKind: 'recruiter_report', resourceId: report.id, expiresInDays: 7 },
      });
      const base = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
      setLink(`${base}/public/reports/${report.id}?token=${l.token}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="wrap"><Loading /></main>;
  if (error) return <main className="wrap"><ErrorBanner message={error} /></main>;
  if (!report) return <main className="wrap"><Loading /></main>;

  return (
    <main className="wrap">
      <Steps current={5} />
      <h1>تقرير الأدلة المهنية</h1>
      <p className="body-sm muted">
        الدور المستهدف: <span className="term" lang="en">{report.targetRole.label}</span>
        {report.targetRole.reviewStatus !== 'reviewed' ? (
          <> · <span className="chip chip--attention">تعريف الدور غير مُراجَع بعد</span></>
        ) : null}
      </p>

      <div className="banner banner--info" role="note">
        <span className="grow">{report.scopeNote}</span>
      </div>

      {report.skills.map((s) => (
        <section className="card" key={s.skillLabel}>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <h2 className="grow">{s.skillLabel}</h2>
            <EvidenceState state={s.evidenceState} />
          </div>
          <p className="body-sm muted">{s.stateReason}</p>

          <hr className="divider" />

          <div className="stack" style={{ gap: 6 }}>
            <span className="kicker">المصدر</span>
            <span className="body-sm">
              {s.source.projectTitle} ·{' '}
              {s.source.kind === 'platform_activity' ? 'نشاط منصة' : 'مشروع شخصي'}
            </span>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <span className="kicker">ملخّص التقييم</span>
            <span className="body-sm">
              <span className="num">{s.evaluationSummary.score}/{s.evaluationSummary.maxScore}</span>
              {' · '}
              <span className="term" lang="en">{s.evaluationSummary.rubricVersion}</span>
            </span>
            <div className="rows" style={{ marginBlockStart: 4 }}>
              {s.evaluationSummary.criteria.map((c) => (
                <div key={c.label} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <span className={`dot ${c.met ? 'dot--demonstrated' : 'dot--gap'}`} aria-hidden="true" />
                  <span className="grow body-sm term" lang="en">{c.label}</span>
                  <span className="body-sm muted" style={{ flexBasis: '100%' }}>{c.rationale}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <span className="kicker">فحوص السلامة</span>
            <span className={`chip ${s.integrityResult.allPassed ? 'chip--success' : 'chip--attention'}`}>
              {s.integrityResult.allPassed ? 'اجتازت جميعها' : 'فحص لم يجتز'}
            </span>
          </div>
        </section>
      ))}

      <section className="card">
        <h2>الأصول المهنية المعتمدة</h2>
        {report.professionalAssets.length === 0 ? (
          <p className="body-sm muted">
            لا أصل معتمد بعد. البند المولَّد يبقى مسودة حتى تعتمديه، ولا يظهر هنا قبل ذلك.
          </p>
        ) : (
          <div className="rows">
            {report.professionalAssets.map((a, i) => (
              <div key={i} className="stack" style={{ gap: 4 }}>
                <span className="chip chip--success">بند سيرة · معتمد</span>
                <p className="body-sm">{a.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>إفصاح الذكاء الاصطناعي</h2>
        <p className="body-sm term" lang="en" dir="ltr">{report.aiDisclosure}</p>
        <p className="disclaimer">
          لم يُستدعَ أي نموذج لغوي في التقييم ولا في توليد الأصل. كل جملة مشتقة من قاعدة حتمية.
        </p>
      </section>

      <section className="card">
        <h2>مشاركة التقرير</h2>
        <p className="body-sm muted">
          الرابط ينتهي خلال <span className="num">٧</span> أيام، وغير قابل للفهرسة، ويمكنك إلغاؤه في أي وقت.
          ويُظهر إسقاطًا أضيق من هذه الصفحة: لا تفاصيل تقييم ولا فحوص سلامة.
        </p>
        <button className="btn btn--secondary" onClick={share} disabled={busy}>
          {busy ? 'جارٍ…' : 'إنشاء رابط مشاركة'}
        </button>
        {link ? (
          <div className="stack" style={{ gap: 6 }}>
            <span className="field__label">الرابط — يُعرض مرة واحدة</span>
            <input className="input term" dir="ltr" readOnly value={link} onFocus={(e) => e.target.select()} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
