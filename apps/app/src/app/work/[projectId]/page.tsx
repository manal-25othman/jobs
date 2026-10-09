'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { questionVisible, deliverableProgress } from '@naqla/domain';
import {
  api, isNotFound, uploadEvidenceFile,
  type ActivityDetail, type ProjectStatus, type EvidenceItem, type DisclosureQuestionnaireView,
} from '../../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../../components/Session';
import { Steps } from '../../../components/Steps';
import { JourneyNav, Crumbs } from '../../../components/JourneyNav';
import { DisclosureField } from '../../../components/DisclosureField';
import {
  buildFileMapping, buildTextArtifacts, attemptsOf, workStatusCopy, chipClass, friendlyErrorAr, sizeLabel,
  assessmentCopy, AI_USAGE_AR, SUBMISSION_IS_NOT_A_LEVEL_AR,
} from '../../../lib/journey';

interface ProjectRow { id: string; title: string; kind: 'platform_activity' | 'personal_project'; activity_spec_id: string | null }
type Slot = { status: 'uploading' } | { status: 'done'; uploadId: string; name: string; size: number } | { status: 'error'; message: string; detail: string };

const dateAr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }) : '');

/**
 * U3 — the graduate workspace for one project.
 *
 * Generated from the activity's declared deliverables: one upload slot per FILE deliverable, one text field per
 * TEXT deliverable. Each uploaded file is bound to its deliverable key (explicit mapping, Phase 1 A3); nothing is
 * positional, and nothing declares a technical fact (no ticks, no signals). Submitting sends the work and starts
 * its evaluation in the same explicit click; the evaluation page only reads.
 *
 * Work in progress is NOT saved before submission (no draft API exists): said plainly, never simulated.
 */
export default function WorkspacePage() {
  const { token, loading } = useSession();
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [ledger, setLedger] = useState<EvidenceItem[]>([]);
  const [questionnaire, setQuestionnaire] = useState<DisclosureQuestionnaireView['questionnaire']>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [skills, setSkills] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<{ textAr: string; detail: string } | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (!token || !params?.projectId) return;
    const id = encodeURIComponent(params.projectId);
    void (async () => {
      try {
        const p = await api<ProjectRow>(`/projects/${id}`, { token });
        setProject(p);
        const [all, items, q] = await Promise.all([
          api<{ items: ProjectStatus[] }>('/projects', { token }),
          api<{ items: EvidenceItem[] }>(`/me/evidence?projectId=${id}`, { token }),
          api<DisclosureQuestionnaireView>('/disclosure-questionnaire', { token }),
        ]);
        setStatus(all.items.find((x) => x.id === p.id) ?? null);
        setLedger(items.items);
        setQuestionnaire(q.questionnaire);
        if (p.activity_spec_id) {
          const a = await api<ActivityDetail>(`/me/activities/${encodeURIComponent(p.activity_spec_id)}`, { token });
          setActivity(a);
          setSkills(a.skills.filter((s) => s.depth === 'primary').map((s) => s.id));
        }
      } catch (e) {
        if (isNotFound(e)) setNotFound(true); else setError((e as Error).message);
      }
    })();
  }, [token, params?.projectId]);

  const deliverables = useMemo(() => (activity?.deliverables ?? []).map((d) => ({ key: d.key, kind: d.kind, mandatory: d.mandatory })), [activity]);
  const uploaded = Object.fromEntries(Object.entries(slots).map(([k, s]) => [k, s.status === 'done' ? s.uploadId : null]));
  const fileMap = buildFileMapping(deliverables, uploaded);
  const textMap = buildTextArtifacts(deliverables, texts);
  const visibleQuestions = questionnaire ? questionnaire.questions.filter((q) => questionVisible(q, answers)) : [];
  const unanswered = visibleQuestions.filter((q) => q.required && (answers[q.key] === undefined || answers[q.key] === '' || (Array.isArray(answers[q.key]) && (answers[q.key] as unknown[]).length === 0)));
  const anyUploading = Object.values(slots).some((s) => s.status === 'uploading');
  const descOf = (key: string) => { const d = activity?.deliverables.find((x) => x.key === key); return d?.descriptionAr ?? d?.descriptionEn ?? key; };
  const problems: string[] = [
    ...fileMap.missing.map((k) => `أرفقي: ${descOf(k)}`),
    ...textMap.missing.map((k) => `اكتبي: ${descOf(k)}`),
    ...(skills.length === 0 ? ['اختاري مهارة واحدة على الأقل يُظهرها هذا العمل'] : []),
    ...(unanswered.length ? ['أجيبي عن الأسئلة المطلوبة في «طريقة عملك»'] : []),
    ...(anyUploading ? ['انتظري اكتمال رفع الملفات'] : []),
  ];
  const progress = deliverableProgress(deliverables.map((d) => ({
    key: d.key, required: d.mandatory, completed: d.kind === 'file' ? !!uploaded[d.key] : (texts[d.key] ?? '').trim().length > 0,
  })));
  const dirty = Object.keys(slots).length > 0 || Object.values(texts).some((t) => t.trim().length > 0);

  // No draft is saved anywhere: warn before leaving with unsent work rather than pretend it is kept.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function onFile(key: string, file: File | null) {
    if (!token) return;
    if (!file) { setSlots((s) => { const n = { ...s }; delete n[key]; return n; }); return; }
    setSlots((s) => ({ ...s, [key]: { status: 'uploading' } }));
    try {
      const uploadId = await uploadEvidenceFile(file, token);
      setSlots((s) => ({ ...s, [key]: { status: 'done', uploadId, name: file.name, size: file.size } }));
    } catch (e) {
      const f = friendlyErrorAr((e as Error).message, 'تعذّر رفع الملف. تأكّدي من نوعه وحجمه ثم حاولي مجددًا.');
      setSlots((s) => ({ ...s, [key]: { status: 'error', message: f.textAr, detail: f.detail } }));
    }
  }

  async function submit() {
    if (!token || !project || submitting.current || problems.length) return;
    submitting.current = true; setSubmitError(null);
    try {
      setBusy('جارٍ التسليم…');
      const sub = await api<{ id: string }>(`/projects/${encodeURIComponent(project.id)}/submissions`, {
        method: 'POST', token,
        body: {
          skillIds: skills,
          artifacts: textMap.artifacts,
          files: fileMap.files, // explicit: each upload bound to its declared deliverable key
          aiDisclosure: questionnaire
            ? { questionnaireId: questionnaire.id, answers: Object.fromEntries(Object.entries(answers).filter(([k]) => visibleQuestions.some((q) => q.key === k))) }
            : { declaredUse: [], explanation: null },
        },
      });
      setBusy('جارٍ بدء التقييم…');
      // The explicit act of submitting also asks for the evaluation. If that request fails, the evaluation page
      // offers the same explicit action; it never starts one by itself.
      await api(`/submissions/${encodeURIComponent(sub.id)}/evaluate`, { method: 'POST', token }).catch(() => undefined);
      setSlots({}); setTexts({});
      router.push(`/evaluation?submission=${encodeURIComponent(sub.id)}`);
    } catch (e) {
      setSubmitError(friendlyErrorAr((e as Error).message, 'تعذّر التسليم. لم يُرسل شيء؛ راجعي المخرجات ثم حاولي مجددًا.'));
      submitting.current = false; setBusy(null);
    }
  }

  if (loading) return <main className="wrap"><Loading /></main>;
  if (notFound) {
    return (
      <main className="wrap">
        <JourneyNav current="/work" />
        <h1>مكان العمل غير متاح</h1>
        <section className="card"><p className="body-sm">لا نجد هذا العمل ضمن أعمالك. قد يكون الرابط غير صحيح.</p><a className="link" href="/work">أعمالي ←</a></section>
      </main>
    );
  }
  if (error) return <main className="wrap"><ErrorBanner message={error} /></main>;
  if (!project || (project.activity_spec_id && !activity)) return <main className="wrap"><Loading /></main>;

  if (!activity) {
    return (
      <main className="wrap">
        <JourneyNav current="/work" />
        <h1>{project.title}</h1>
        <section className="card"><p className="body-sm">هذا مشروع شخصي. مكان العمل هذا مخصّص لأنشطة الدور؛ المشاريع الشخصية لا تُقيَّم هنا.</p><a className="link" href="/work">أعمالي ←</a></section>
      </main>
    );
  }

  const st = status ? workStatusCopy(status.workStatus) : null;
  const attempts = attemptsOf(ledger, project.id);
  const copy = assessmentCopy(activity.assessment, activity.isDemo);
  const readOnly = !activity.available;

  return (
    <main className="wrap">
      <Steps current={2} />
      <JourneyNav current="/work" />
      <Crumbs items={[{ label: 'أعمالي', href: '/work' }, { label: activity.titleAr }]} />
      <h1>{activity.titleAr}</h1>
      <p className="body-sm muted">
        {st ? <span className={chipClass(st.tone)}>{st.labelAr}</span> : null}{' '}
        <span className={chipClass(copy.tone)}>{copy.chipAr}</span>{' '}
        {activity.estimatedMinutes ? <>· ≈ <span className="num">{activity.estimatedMinutes}</span> دقيقة</> : null}
      </p>
      {readOnly ? (
        <div className="banner banner--info" role="note"><span className="grow">هذا النشاط لم يعد ضمن أنشطة دورك الحالي. يمكنك مراجعة محاولاتك، دون تسليم جديد.</span></div>
      ) : null}
      {status?.workStatus === 'under_human_review' ? (
        <div className="banner banner--info" role="status"><span className="grow">محاولتك الأخيرة قيد المراجعة البشرية. يمكنك تسليم محاولة جديدة، ولا يلغي ذلك المراجعة الجارية.</span></div>
      ) : null}

      <section className="card" aria-labelledby="brief">
        <h2 id="brief">التعليمات</h2>
        {activity.businessContextAr ? <p className="body-sm" style={{ margin: 0 }}>{activity.businessContextAr}</p> : null}
        {activity.objectiveAr ? <p className="body-sm" style={{ margin: 0 }}><strong style={{ fontWeight: 500 }}>المطلوب منك: </strong>{activity.objectiveAr}</p> : null}
        <p className="micro muted" style={{ margin: 0 }}>{AI_USAGE_AR[activity.aiUsageMode] ?? ''}</p>
        {!activity.materialsAvailable && activity.inputs.length ? (
          <p className="disclaimer">مواد البداية لهذا النشاط غير متاحة على المنصّة بعد؛ لا نعرض موادّ غير موجودة.</p>
        ) : null}
        <a className="link" href={`/activities/${encodeURIComponent(activity.id)}`}>تفاصيل النشاط وطريقة التقييم ←</a>
      </section>

      {!readOnly ? (
        <>
          <section className="card" aria-labelledby="outputs">
            <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h2 id="outputs">المخرجات المطلوبة</h2>
              <span className="chip push" aria-live="polite">{progress.labelAr}</span>
            </div>
            <div className="rows">
              {activity.deliverables.map((d) => {
                const label = d.descriptionAr ?? d.descriptionEn ?? d.key;
                const slot = slots[d.key];
                const inputId = `deliverable-${d.key.replace(/[^a-z0-9]+/gi, '-')}`;
                return (
                  <div key={d.key} className="field">
                    <label className="field__label" htmlFor={inputId}>
                      {label} <span className="chip" style={{ marginInlineStart: 6 }}>{d.mandatory ? 'إلزامي' : 'اختياري'}</span>
                    </label>
                    {d.kind === 'file' ? (
                      <>
                        <input id={inputId} className="input" type="file" disabled={slot?.status === 'uploading' || !!busy}
                               aria-describedby={`${inputId}-state`}
                               onChange={(e) => void onFile(d.key, e.target.files?.[0] ?? null)} />
                        <span id={`${inputId}-state`} className="micro" aria-live="polite">
                          {slot?.status === 'uploading' ? <span className="muted">جارٍ الرفع…</span> : null}
                          {slot?.status === 'done' ? <span className="chip chip--success">مرفوع: <span className="term">{slot.name}</span> · <span className="num">{sizeLabel(slot.size)}</span></span> : null}
                          {slot?.status === 'error' ? <span className="field__error" role="alert">{slot.message}</span> : null}
                        </span>
                      </>
                    ) : (
                      <textarea id={inputId} className="input" rows={4} style={{ height: 'auto', minHeight: 96, padding: 12, lineHeight: 1.6 }}
                                value={texts[d.key] ?? ''} disabled={!!busy} onChange={(e) => setTexts({ ...texts, [d.key]: e.target.value })} />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="disclaimer">
              كل ملف يُربط بالمخرج الذي رفعتِه فيه، لا بترتيب الرفع. الملفات تُرفع إلى تخزين خاص برابط موقّع قصير العمر، ولا يظهر مسارها لأحد.
              لا توجد هنا مربّعات تؤشّرين فيها على أن شيئًا «مكتمل»: يُقيَّم ما تقدّمينه فعلًا.
            </p>
          </section>

          {activity.skills.length ? (
            <section className="card" role="group" aria-labelledby="skills-title" aria-describedby="skills-help">
              <h2 id="skills-title">المهارات التي يُظهرها هذا العمل</h2>
              <p id="skills-help" className="body-sm muted" style={{ margin: 0 }}>اختاري ما يُظهره عملك من مهارات هذا النشاط. اختيارك لا يرفع مستوى أي مهارة؛ التقييم وحده يفعل.</p>
              {activity.skills.map((s) => (
                <label key={s.id} className="check-row">
                  <input type="checkbox" checked={skills.includes(s.id)} disabled={!!busy}
                         onChange={(e) => setSkills(e.target.checked ? [...skills, s.id] : skills.filter((x) => x !== s.id))} />
                  <span className="grow">{s.labelAr} <span className="micro muted">· {s.depth === 'primary' ? 'رئيسية' : 'مساندة'}</span></span>
                </label>
              ))}
            </section>
          ) : null}

          <section className="card" aria-labelledby="howwork">
            <h2 id="howwork">{questionnaire?.labelAr ?? 'طريقة عملك'}</h2>
            <p className="body-sm" style={{ margin: 0 }}>{questionnaire?.introAr ?? 'استخدام أدوات الذكاء الاصطناعي مسموح ما لم يُذكر غير ذلك.'}</p>
            {visibleQuestions.map((q) => (
              <DisclosureField key={q.key} q={q} value={answers[q.key]} onChange={(v) => setAnswers({ ...answers, [q.key]: v })} />
            ))}
            <p className="disclaimer">الإجابة بأنك استخدمتِ الذكاء الاصطناعي لا تخفض تقييمك. نقيّم فهمك ومساهمتك، ولا نستخدم أي «كاشف ذكاء اصطناعي».</p>
          </section>

          <section className="card" aria-labelledby="review">
            <h2 id="review">مراجعة قبل التسليم</h2>
            {Object.values(slots).some((s) => s.status === 'done') ? (
              <div className="rows">
                {activity.deliverables.filter((d) => d.kind === 'file').map((d) => {
                  const s = slots[d.key];
                  return s?.status === 'done' ? (
                    <div key={d.key} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                      <span className="grow body-sm">{d.descriptionAr ?? d.key}</span>
                      <span className="term body-sm">{s.name}</span><span className="num micro muted">{sizeLabel(s.size)}</span>
                    </div>
                  ) : null;
                })}
              </div>
            ) : <p className="body-sm muted" style={{ margin: 0 }}>لم ترفعي ملفات بعد.</p>}
            {problems.length ? (
              <div role="status">
                <p className="body-sm" style={{ margin: 0, fontWeight: 500 }}>قبل التسليم:</p>
                <ul className="body-sm" style={{ margin: 0, paddingInlineStart: 20 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            ) : <p className="body-sm" style={{ margin: 0 }}>كل المطلوب جاهز للتسليم.</p>}
            <p className="disclaimer">
              لا يُحفظ عملك قبل التسليم: إن غادرتِ الصفحة أو أعدتِ تحميلها فستحتاجين إلى إعادة رفع الملفات وكتابة النصوص.
            </p>
          </section>

          {submitError ? (
            <div className="banner banner--attention" role="alert">
              <span className="grow">{submitError.textAr}<span className="micro muted term" style={{ display: 'block' }}>{submitError.detail}</span></span>
            </div>
          ) : null}

          <div className="next-action">
            <span className="kicker">التسليم</span>
            <h2>سلّمي عملك للتقييم</h2>
            <p>يُقفَل التسليم ولا يُعدَّل؛ التصحيح يكون بمحاولة جديدة مرتبطة بالسابقة. {SUBMISSION_IS_NOT_A_LEVEL_AR}</p>
            <div>
              <button className="btn btn--on-dark" onClick={() => void submit()} disabled={!!busy || problems.length > 0} aria-disabled={!!busy || problems.length > 0}>
                {busy ?? (problems.length ? 'أكملي المطلوب أولًا' : 'تسليم للتقييم')}
              </button>
            </div>
          </div>
        </>
      ) : null}

      <section className="card" aria-labelledby="attempts">
        <h2 id="attempts">محاولاتك</h2>
        {attempts.length ? (
          <div className="rows">
            {attempts.map((t) => (
              <div key={t.submissionId} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="grow body-sm">المحاولة <span className="num">{t.attemptNumber}</span>{t.submittedAt ? <> · {dateAr(t.submittedAt)}</> : null}</span>
                {status?.latestSubmission?.id === t.submissionId && st ? <span className={chipClass(st.tone)}>{st.labelAr}</span> : null}
                <a className="link" href={`/evaluation?submission=${encodeURIComponent(t.submissionId)}`}>الملاحظات ←</a>
              </div>
            ))}
          </div>
        ) : <p className="body-sm muted" style={{ margin: 0 }}>لم تسلّمي هذا العمل بعد.</p>}
      </section>
    </main>
  );
}
