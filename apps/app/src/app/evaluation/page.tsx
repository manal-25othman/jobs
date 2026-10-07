'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type EvaluationResult, type SkillJourney, type SkillJourneyEngine, type Assessment } from '../../lib/api';
import { useSession, Loading, ErrorBanner, EvidenceState } from '../../components/Session';
import { Steps } from '../../components/Steps';
import { CompanionNudge } from '../../components/CompanionNudge';

function EvaluationInner() {
  const { token, loading } = useSession();
  const params = useSearchParams();
  const submissionId = params.get('submission');
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [journey, setJourney] = useState<{ items: SkillJourney[]; engine: SkillJourneyEngine } | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
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
        // Phase 2: the journey dimension, read after the evaluation committed. Shown beside the level, never merged with it.
        setJourney(await api<{ items: SkillJourney[]; engine: SkillJourneyEngine }>('/me/skill-progress', { token }));
        // Phase 3: the structured assessment and the policy decision, read after the evaluation committed.
        const a = await api<{ items: Assessment[] }>(`/submissions/${submissionId}/assessment`, { token });
        setAssessment(a.items[a.items.length - 1] ?? null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [token, submissionId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!result) return <Loading />;

  if (result.outcome === 'needs_human_review') {
    // D-057-style honesty: what was checked, what awaits a person, and no invented time.
    return (
      <>
        <Steps current={3} />
        <h1>نتيجة التقييم</h1>
        <div className="banner banner--info" role="status">
          <span className="grow"><strong style={{ fontWeight: 500 }}>التقييم قيد المراجعة</strong>{' · '}الفحوص الآلية اكتملت، وبقيت معايير يقرّرها مراجع/ة.</span>
        </div>
        <section className="card">
          <h2>ما تحقّق آليًا</h2>
          <ul className="stack" style={{ gap: 6 }}>
            {result.criteria.map((c) => (
              <li key={c.criterionId ?? c.criterion_key} className="row" style={{ gap: 10 }}>
                <span className="term">{c.criterionId ?? c.criterion_key}</span>
                <span className="num push">{String(c.score)} / {String(c.maxScore ?? c.max_score)}</span>
              </li>
            ))}
            {result.integrityChecks.map((i) => (
              <li key={i.key} className="row" style={{ gap: 10 }}><span className="term">{i.key}</span><span className={`chip push ${i.passed ? 'chip--success' : 'chip--attention'}`}>{i.passed ? 'مستوفى' : 'غير مستوفى'}</span></li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>ما ينتظر مراجعة بشرية</h2>
          <ul className="stack" style={{ gap: 6 }}>
            {result.humanReview?.pendingCriteria.map((k) => <li key={k} className="term">{k}</li>)}
          </ul>
          <p className="body-sm muted">ستظهر النتيجة هنا حين يكتمل قرار المراجعة على كل معيار. لا يوجد وقت متوقَّع معلَن بعد.</p>
        </section>
      </>
    );
  }

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
              onClick={() => router.push(`/proposals?focus=${result.transition!.evidenceId}`)}
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

      {assessment ? (
        <section className="card">
          <h2>ما لوحظ وما تقرّر</h2>
          <div className="rows">
            {assessment.criteria.map((cr) => (
              <div key={cr.key} className="stack" style={{ gap: 4 }}>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <span className="grow term" lang="en" style={{ fontWeight: 500 }}>{cr.key}</span>
                  <span className={`chip ${cr.status === 'met' ? 'chip--success' : cr.status === 'pending_human' ? 'chip--info' : 'chip--attention'}`}>
                    {cr.status === 'met' ? 'مستوفى' : cr.status === 'partially_met' ? 'مستوفى جزئيًا' : cr.status === 'pending_human' ? 'بانتظار مراجع' : cr.status === 'not_applicable' ? 'لا ينطبق' : 'غير مستوفى'}
                  </span>
                </div>
                {cr.evidenceUsed.length ? <span className="micro muted">الدليل المستخدم: <span className="term" lang="en">{cr.evidenceUsed.join(' · ')}</span></span> : null}
                {cr.evidenceMissing.length ? <span className="micro muted">ما ينقص: <span className="term" lang="en">{cr.evidenceMissing.join(' · ')}</span></span> : null}
                {cr.recommendedNextAction ? <span className="body-sm">الخطوة التالية: <span className="term" lang="en">{cr.recommendedNextAction}</span></span> : null}
              </div>
            ))}
          </div>
          {assessment.decisions.map((d) => (
            <p key={d.id} className="body-sm">
              قرار التحقق: <span className="term" lang="en">{d.decision}</span> · من <span className="term" lang="en">{d.previousState}</span> إلى <span className="term" lang="en">{d.resultingState}</span>
              {' '}· السياسة <span className="term" lang="en">{d.policy.key}@{d.policy.version}</span> {d.policy.resolution === 'legacy_baseline' ? '(LEGACY BASELINE — غير مُصادَق عليها من الخبراء)' : d.policy.validated ? '' : '(DRAFT / NOT VALIDATED)'} · قرّرتها {d.decidedByKind === 'human' ? 'مراجِع مُسمّى' : 'السياسة'}، لا نموذج لغوي.
            </p>
          ))}
          <p className="micro muted">
            إعداد المسار: {assessment.versions.trackConfigVersion !== null ? <>الإصدار <span className="num">{assessment.versions.trackConfigVersion}</span> ({assessment.versions.configResolution})</> : 'لا إعداد مفعَّل مُسجَّل'}
            {' '}· سياسة السياق <span className="term" lang="en">{assessment.versions.contextPolicy ?? '—'}</span> · الهوية مستبعدة من مدخلات التقييم.
          </p>
          <p className="disclaimer">
            ما لوحظ (التقييم) وما تقرّر (قرار التحقق) سجلّان منفصلان. القرار يذكر السياسة وإصدارها وإعداد المسار الذي أنتجه دائمًا، ولا يغيّر أهلية السيرة أو لينكدإن تلقائيًا.
          </p>
        </section>
      ) : null}

      {journey && journey.items.length > 0 ? (
        <section className="card">
          <h2>رحلة المهارة</h2>
          <div className="rows">
            {journey.items.map((j) => (
              <div key={j.skillId} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="grow body-sm">{j.skillNameAr}</span>
                <span className="chip chip--info">{j.progress.stateLabelAr}</span>
                {j.verification ? <EvidenceState state={j.verification.state} /> : <span className="chip">لا ادعاء بعد</span>}
              </div>
            ))}
          </div>
          <p className="disclaimer">
            حالة الرحلة (أين أنتِ في العمل على المهارة) ومستوى التحقق (ما أثبته التقييم) بُعدان منفصلان:
            إكمال نشاط لا يرفع مستوى التحقق. قواعد الرحلة قيد التحقق من الخبراء (DRAFT / NOT VALIDATED)
            {journey.engine.active ? null : <> — وهي غير مفعَّلة حاليًا: {journey.engine.reason}</>}.
          </p>
        </section>
      ) : null}

      <CompanionNudge token={token} />
      <p className="body-sm"><a className="link" href="/proposals">اقتراحات الرفيق المهني ←</a> · <a className="link" href="/skills">مهارات المسار ←</a></p>
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
