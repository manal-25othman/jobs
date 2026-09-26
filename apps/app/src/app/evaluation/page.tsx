'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type EvaluationResult } from '../../lib/api';
import { useSession, Loading, ErrorBanner, EvidenceState } from '../../components/Session';
import { Steps } from '../../components/Steps';

function EvaluationInner() {
  const { token, loading } = useSession();
  const params = useSearchParams();
  const submissionId = params.get('submission');
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!token || !submissionId) return;
    void (async () => {
      try {
        const r = await api<EvaluationResult>(`/submissions/${submissionId}/evaluate`, {
          method: 'POST', token,
        });
        setResult(r);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [token, submissionId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!result) return <Loading />;

  const passed = result.outcome === 'passed';
  const outcomeLabel: Record<string, string> = {
    passed: 'اجتاز',
    below_threshold: 'دون العتبة',
    blocked_by_checks: 'أوقفه فحص سلامة',
    undetermined: 'غير محدَّد',
    needs_human_review: 'يحتاج مراجعة بشرية',
  };

  return (
    <>
      <Steps current={3} />
      <h1>نتيجة التقييم</h1>

      <div className={`banner ${passed ? 'banner--success' : 'banner--attention'}`} role="status">
        <span className="grow">
          <strong style={{ fontWeight: 500 }}>{outcomeLabel[result.outcome] ?? result.outcome}</strong>
          {' · '}{result.reason}
        </span>
      </div>

      <section className="card">
        <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h2>المعايير</h2>
          <span className="body-sm muted push">
            <span className="num">{result.totalScore}/{result.maxScore}</span>
          </span>
        </div>
        {result.criteria.length === 0 ? (
          <p className="body-sm muted">
            لم يُصَحَّح أي معيار: أوقف فحصُ سلامة حاجب الخطَّ قبل التصحيح.
          </p>
        ) : (
          <div className="rows">
            {result.criteria.map((c) => {
              const key = c.criterionId ?? c.criterion_key ?? '';
              const score = Number(c.score);
              const max = Number(c.maxScore ?? c.max_score ?? 1);
              const met = score >= max;
              return (
                <div key={key} className="stack" style={{ gap: 4 }}>
                  <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                    <span className={`dot ${met ? 'dot--demonstrated' : 'dot--gap'}`} aria-hidden="true" />
                    <span className="grow term" lang="en" style={{ fontWeight: 500 }}>{key}</span>
                    <span className={`chip ${met ? 'chip--success' : 'chip--attention'}`}>
                      <span className="num">{score}/{max}</span>
                    </span>
                  </div>
                  <span className="body-sm muted">{c.rationale}</span>
                  {(c.supportingExcerpt ?? c.supporting_excerpt) ? (
                    <span className="micro muted term" lang="en">
                      {c.supportingExcerpt ?? c.supporting_excerpt}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2>فحوص السلامة</h2>
        <div className="rows">
          {result.integrityChecks.map((i) => (
            <div key={i.key} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className={`dot ${i.passed ? 'dot--demonstrated' : 'dot--gap'}`} aria-hidden="true" />
              <span className="grow body-sm term" lang="en">{i.key}</span>
              <span className={`chip ${i.passed ? 'chip--success' : 'chip--attention'}`}>
                {i.passed ? 'اجتاز' : 'لم يجتز'}
              </span>
              {!i.passed && i.message ? (
                <span className="body-sm muted" style={{ flexBasis: '100%' }}>{i.message}</span>
              ) : null}
            </div>
          ))}
        </div>
        <p className="disclaimer">
          تُعرض الفحوص المرئية للمستخدم فقط. فحوص التقييم الداخلية تُسجَّل ولا تُعرض،
          لأن عرضها يعلّم كيف تُجتاز.
        </p>
      </section>

      {result.transition ? (
        <div className="next-action">
          <span className="kicker">تغيّرت حالة الدليل</span>
          <h2>
            <span className="transition" lang="en">
              {result.transition.from} → {result.transition.to}
            </span>
          </h2>
          <p>
            أنتج التقييم دليلًا مرتبطًا بهذا المشروع. الخطوة التالية: بند سيرة مشتق من هذا الدليل.
          </p>
          <div>
            <button
              className="btn btn--on-dark"
              onClick={() => router.push(`/asset?evidence=${result.transition!.evidenceId}`)}
            >
              توليد بند السيرة
            </button>
          </div>
        </div>
      ) : (
        <section className="card">
          <h2>لم يُنتَج دليل</h2>
          <p className="body-sm">
            «لا دليل» نتيجة مشروعة، وتُعرض كما هي. مهارتك تبقى حيث هي —
            لا تنزل، ولا ترتفع بلا استيفاء المعايير.
          </p>
          <div className="row" style={{ gap: 10 }}>
            <EvidenceState state="practiced" />
          </div>
          <a className="link" href="/project">ابدئي تسليمًا جديدًا</a>
        </section>
      )}

      <p className="disclaimer">
        هذا التقييم حتمي بالكامل: نفس المدخلات تعطي نفس النتيجة، ولم يُستدعَ أي نموذج لغوي.
      </p>
    </>
  );
}

export default function EvaluationPage() {
  return (
    <main className="wrap">
      <Suspense fallback={<Loading />}>
        <EvaluationInner />
      </Suspense>
    </main>
  );
}
