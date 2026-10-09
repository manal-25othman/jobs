'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, isNotFound, type EvaluationView, type SkillJourney, type SkillJourneyEngine, type Assessment, type ChallengeView } from '../../lib/api';
import { useSession, Loading, ErrorBanner, EvidenceState } from '../../components/Session';
import { Steps } from '../../components/Steps';
import { JourneyNav } from '../../components/JourneyNav';
import { CompanionNudge } from '../../components/CompanionNudge';
import { evaluationPageState, levelChangeToShow, criterionResult, chipClass, friendlyErrorAr } from '../../lib/journey';

/**
 * U4 — the evaluation of one submission.
 *
 * It READS first (GET /submissions/:id/evaluation), always. Opening or refreshing this page never starts an
 * evaluation. The only thing that starts one is the explicit button shown while a submission has none; the
 * button is single-shot and the API is idempotent and locks the submission, so a double click creates nothing.
 * A level is shown only when the backend recorded one (D-118): never inferred from a pass.
 */
function EvaluationInner() {
  const { token, loading } = useSession();
  const params = useSearchParams();
  const submissionId = params.get('submission');
  const router = useRouter();
  const [view, setView] = useState<EvaluationView | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [journey, setJourney] = useState<{ items: SkillJourney[]; engine: SkillJourneyEngine } | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [challenges, setChallenges] = useState<{ introAr: string; items: ChallengeView[] } | null>(null);
  const [challengeDraft, setChallengeDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);

  const load = useCallback(async () => {
    if (!token || !submissionId) return;
    const id = encodeURIComponent(submissionId);
    try {
      const v = await api<EvaluationView>(`/submissions/${id}/evaluation`, { token });
      setView(v);
      const sub = await api<{ project_id: string }>(`/submissions/${id}`, { token });
      setProjectId(sub.project_id);
      if (v.state !== 'not_evaluated') {
        setJourney(await api<{ items: SkillJourney[]; engine: SkillJourneyEngine }>('/me/skill-progress', { token }));
        const a = await api<{ items: Assessment[] }>(`/submissions/${id}/assessment`, { token });
        setAssessment(a.items[a.items.length - 1] ?? null);
        setChallenges(await api<{ introAr: string; items: ChallengeView[] }>(`/me/challenges?submissionId=${id}`, { token }));
      }
    } catch (e) {
      if (isNotFound(e)) setNotFound(true); else setError((e as Error).message);
    }
  }, [token, submissionId]);

  useEffect(() => { void load(); }, [load]);

  /** The explicit, single-shot action. The API answers a repeat with the existing evaluation. */
  async function startEvaluation() {
    if (!token || !submissionId || starting.current) return;
    starting.current = true; setBusy(true); setError(null);
    try {
      await api(`/submissions/${encodeURIComponent(submissionId)}/evaluate`, { method: 'POST', token });
    } catch (e) {
      setError(friendlyErrorAr((e as Error).message, 'تعذّر بدء التقييم. يمكنك المحاولة مجددًا.').textAr);
    } finally {
      await load(); // re-read: what is shown is always the stored state
      starting.current = false; setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (!submissionId) {
    return (<><JourneyNav current={null} /><h1>نتيجة التقييم</h1><section className="card"><p className="body-sm">لم يُحدَّد تسليم. افتحي التقييم من «أعمالي».</p><a className="link" href="/work">أعمالي ←</a></section></>);
  }
  if (notFound) {
    return (<><JourneyNav current={null} /><h1>نتيجة التقييم</h1><section className="card"><p className="body-sm">لا نجد هذا التسليم ضمن أعمالك.</p><a className="link" href="/work">أعمالي ←</a></section></>);
  }
  if (error && !view) return <ErrorBanner message={error} />;
  if (!view) return <Loading />;

  const page = evaluationPageState(view);
  const level = levelChangeToShow(view);
  const workHref = projectId ? `/work/${encodeURIComponent(projectId)}` : '/work';
  const unmetChecks = view.integrityChecks.filter((i) => !i.passed);

  const criteriaCard = view.criteria.length ? (
    <section className="card" aria-labelledby="crit">
      <h2 id="crit">الملاحظات على كل معيار</h2>
      <div className="rows">
        {view.criteria.map((c, i) => {
          const r = criterionResult(Number(c.score), Number(c.maxScore ?? c.max_score ?? 1));
          return (
            <div key={(c.criterionId ?? c.criterion_key ?? '') + i} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <span className="grow body-sm">{c.rationale}</span>
              <span className={chipClass(r.tone)}>{r.labelAr}</span>
            </div>
          );
        })}
      </div>
    </section>
  ) : null;

  return (
    <>
      <Steps current={3} />
      <JourneyNav current={null} />
      <h1>نتيجة التقييم</h1>
      {error ? <ErrorBanner message={error} /> : null}

      {page === 'not_evaluated' ? (
        <div className="next-action">
          <span className="kicker">لم يُقيَّم بعد</span>
          <h2>سُلِّم عملك ولم يُقيَّم بعد</h2>
          <p>ابدئي التقييم حين تكونين جاهزة. يُقيَّم التسليم مرة واحدة؛ فتح هذه الصفحة أو تحديثها لا يبدأ تقييمًا.</p>
          <div><button className="btn btn--on-dark" onClick={() => void startEvaluation()} disabled={busy}>{busy ? 'جارٍ التقييم…' : 'ابدئي التقييم'}</button></div>
        </div>
      ) : null}

      {page === 'evaluation_pending' ? (
        <div className="banner banner--info" role="status">
          <span className="grow">التقييم جارٍ. حدّثي الصفحة بعد قليل لرؤية النتيجة.</span>
          <button className="btn btn--sm btn--ghost" onClick={() => void load()}>تحديث</button>
        </div>
      ) : null}

      {page === 'evaluation_failed' ? (
        <section className="card" aria-labelledby="failed">
          <h2 id="failed">تعذّر إكمال التقييم</h2>
          <p className="body-sm">لم تُسجَّل نتيجة لهذا التسليم. يمكنك إعادة المحاولة؛ لن يُنشأ أكثر من تقييم واحد.</p>
          <div><button className="btn btn--primary" onClick={() => void startEvaluation()} disabled={busy}>{busy ? 'جارٍ التقييم…' : 'أعيدي محاولة التقييم'}</button></div>
        </section>
      ) : null}

      {page === 'human_review_pending' ? (
        <>
          <div className="banner banner--info" role="status">
            <span className="grow"><strong style={{ fontWeight: 500 }}>عملك قيد المراجعة البشرية</strong>{' · '}اكتملت الفحوص الآلية، وبقيت معايير يقرّرها مراجِع مختص.</span>
          </div>
          <section className="card" aria-labelledby="awaiting">
            <h2 id="awaiting">ما ينتظر المراجعة</h2>
            <ul className="body-sm" style={{ margin: 0, paddingInlineStart: 20 }}>
              {view.humanReview?.awaiting.map((a) => <li key={a.criterionKey}>{a.nameAr}</li>)}
            </ul>
            <p className="body-sm muted" style={{ margin: 0 }}>ستظهر النتيجة هنا حين يكتمل قرار المراجعة على كل معيار. لا يوجد وقت متوقَّع معلَن بعد، ولن يتغيّر مستوى مهارتك قبل ذلك.</p>
          </section>
        </>
      ) : null}

      {page === 'needs_more_evidence' ? (
        <section className="card" aria-labelledby="more">
          <h2 id="more">يحتاج عملك إلى استكمال</h2>
          {unmetChecks.length ? (
            <ul className="body-sm" style={{ margin: 0, paddingInlineStart: 20 }}>
              {unmetChecks.map((i) => <li key={i.key}>{i.message ?? 'أحد الفحوص المطلوبة لم يكتمل.'}</li>)}
            </ul>
          ) : <p className="body-sm" style={{ margin: 0 }}>لم يستوفِ العمل كل المعايير بعد. اقرئي الملاحظات أدناه.</p>}
          <p className="body-sm muted" style={{ margin: 0 }}>«لا دليل بعد» نتيجة مشروعة. مهارتك تبقى حيث هي — لا تنزل.</p>
          <a className="link" href={workHref}>ابدئي محاولة جديدة ←</a>
        </section>
      ) : null}

      {page === 'pending_validation' ? (
        <section className="card" aria-labelledby="pending">
          <h2 id="pending">قُيِّم عملك — والمستوى بانتظار تحقق مستقل</h2>
          <p className="body-sm" style={{ margin: 0 }}>
            سُجِّل ما قدّمتِه، والملاحظات أدناه للتعلّم. لكن تسليم عمل أو الإعلان عنه لا يكفي وحده لرفع مستوى المهارة:
            يتغيّر المستوى فقط بعد تحقق مستقل — مراجعة بشرية بمعايير معتمدة.
          </p>
          <p className="body-sm muted" style={{ margin: 0 }}>مهارتك تبقى حيث هي — لا تنزل.</p>
        </section>
      ) : null}

      {page === 'completed_level' && level ? (
        <div className="next-action">
          <span className="kicker">تغيّر مستوى المهارة</span>
          <h2>{level.fromAr} ← {level.toAr}</h2>
          <p>أنتج التقييم دليلًا مرتبطًا بهذا العمل، وسجّل قرار التحقق تغيّر المستوى. الخطوة التالية: بند سيرة مشتق من هذا الدليل.</p>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <EvidenceState state={level.to} />
            <button className="btn btn--on-dark" onClick={() => router.push(`/proposals?focus=${encodeURIComponent(level.evidenceId)}`)}>اقتراح بند السيرة</button>
          </div>
        </div>
      ) : null}

      {page === 'completed_feedback' ? (
        <section className="card" aria-labelledby="done">
          <h2 id="done">اكتمل التقييم</h2>
          <p className="body-sm" style={{ margin: 0 }}>الملاحظات أدناه. لم يتغيّر مستوى المهارة بهذا التقييم.</p>
        </section>
      ) : null}

      {page !== 'not_evaluated' && page !== 'evaluation_pending' ? criteriaCard : null}

      {page !== 'not_evaluated' && unmetChecks.length === 0 && view.integrityChecks.length ? (
        <p className="disclaimer">اجتاز التسليم فحوص الاكتمال المرئية لك. فحوص التقييم الداخلية تُسجَّل ولا تُعرض، لأن عرضها يعلّم كيف تُجتاز.</p>
      ) : null}

      {challenges && challenges.items.length > 0 ? (
        <section className="card">
          <h2>{challenges.introAr}</h2>
          <div className="rows">
            {challenges.items.map((ch) => (
              <div key={ch.id} className="stack" style={{ gap: 6 }}>
                <span className="body-sm" style={{ fontWeight: 500 }}>{ch.promptAr}</span>
                {ch.status === 'issued' ? (
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <input className="input grow" aria-label={ch.promptAr} value={challengeDraft[ch.id] ?? ''} onChange={(e) => setChallengeDraft({ ...challengeDraft, [ch.id]: e.target.value })} />
                    <button className="btn" onClick={async () => {
                      if (!token) return;
                      await api(`/me/challenges/${ch.id}/response`, { method: 'POST', token, body: { text: challengeDraft[ch.id] ?? '' } });
                      setChallenges(await api<{ introAr: string; items: ChallengeView[] }>(`/me/challenges?submissionId=${encodeURIComponent(submissionId)}`, { token }));
                    }}>إرسال</button>
                  </div>
                ) : <span className="chip">{ch.status === 'answered' ? 'أُرسلت الإجابة' : ch.status === 'reviewed' ? 'رُوجعت' : ch.status}</span>}
              </div>
            ))}
          </div>
          <p className="disclaimer">هذه خطوة لتأكيد فهمك لعملك، وليست اتهامًا. استخدام أدوات الذكاء الاصطناعي مسموح.</p>
        </section>
      ) : null}

      {journey && journey.items.length > 0 ? (
        <section className="card" aria-labelledby="journey">
          <h2 id="journey">رحلة المهارة ومستواها</h2>
          <div className="rows">
            {journey.items.map((j) => (
              <div key={j.skillId} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="grow body-sm">{j.skillNameAr}</span>
                <span className="chip chip--info">{j.progress.stateLabelAr}</span>
                {j.verification ? <EvidenceState state={j.verification.state} /> : <span className="chip">لا مستوى بعد</span>}
              </div>
            ))}
          </div>
          <p className="disclaimer">
            الرحلة (أين أنتِ في العمل على المهارة) والمستوى (ما أثبته تقييم مستقل) أمران منفصلان: إكمال نشاط لا يرفع المستوى.
          </p>
        </section>
      ) : null}

      {assessment ? (
        <details className="card">
          <summary className="body-sm" style={{ cursor: 'pointer', fontWeight: 500 }}>تفاصيل التقييم وقرار التحقق</summary>
          <div className="rows">
            {assessment.criteria.map((cr) => (
              <div key={cr.key} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="grow micro muted term" lang="en">{cr.key}</span>
                <span className={`chip ${cr.status === 'met' ? 'chip--success' : cr.status === 'pending_human' ? 'chip--info' : 'chip--attention'}`}>
                  {cr.status === 'met' ? 'مستوفى' : cr.status === 'partially_met' ? 'مستوفى جزئيًا' : cr.status === 'pending_human' ? 'بانتظار مراجع' : cr.status === 'not_applicable' ? 'لا ينطبق' : 'غير مستوفى'}
                </span>
              </div>
            ))}
          </div>
          {assessment.decisions.map((d) => (
            <p key={d.id} className="micro muted">
              قرار التحقق: <span className="term" lang="en">{d.decision}</span> · قرّرته {d.decidedByKind === 'human' ? 'مراجعة بشرية' : 'سياسة التحقق'}، لا نموذج لغوي.
              {d.policy.validated ? '' : ' السياسة قيد اعتماد الخبراء.'}
            </p>
          ))}
          <p className="disclaimer">ما لوحظ (التقييم) وما تقرّر (قرار التحقق) سجلّان منفصلان. لم يُستدعَ أي نموذج لغوي.</p>
        </details>
      ) : null}

      <CompanionNudge token={token} />
      <p className="body-sm">
        <a className="link" href={workHref}>العودة إلى مكان العمل ←</a> · <a className="link" href="/work">أعمالي ←</a> · <a className="link" href="/skills">مهارات المسار ←</a>
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
