'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { questionVisible, deliverableProgress } from '@naqla/domain';
import {
  api, isNotFound, uploadEvidenceFile, materialDownloadUrl,
  type ActivityDetail, type ActivityMaterial, type ProjectStatus, type EvidenceItem, type DisclosureQuestionnaireView,
} from '../../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../../components/Session';
import { ExperimentalNotice } from '../../../components/ExperimentalNotice';
import { Steps } from '../../../components/Steps';
import { JourneyNav, Crumbs } from '../../../components/JourneyNav';
import { DisclosureField } from '../../../components/DisclosureField';
import { ManagerPanel } from '../../../components/ManagerPanel';
import {
  buildFileMapping, buildTextArtifacts, attemptsOf, workStatusCopy, chipClass, friendlyErrorAr, sizeLabel,
  assessmentCopy, AI_USAGE_AR, SUBMISSION_IS_NOT_A_LEVEL_AR,
} from '../../../lib/journey';

interface ProjectRow { id: string; title: string; kind: 'platform_activity' | 'personal_project'; activity_spec_id: string | null }
type Slot = { status: 'uploading' } | { status: 'done'; uploadId: string; name: string; size: number } | { status: 'error'; message: string; detail: string };
type SaveState = { kind: 'idle' } | { kind: 'pending' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'error'; attempts: number } | { kind: 'conflict' } | { kind: 'off'; reason: string };
interface DraftView { texts: Record<string, string>; files: Record<string, { uploadId: string; name: string; size: number | null }>; skillIds: string[]; disclosure: Record<string, unknown>; revision: number; updatedAt: string }
const timeAr = (d: Date) => d.toLocaleTimeString('ar-u-nu-latn', { hour: '2-digit', minute: '2-digit' });

const dateAr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }) : '');

/**
 * U3 — the graduate workspace for one project.
 *
 * Generated from the activity's declared deliverables: one upload slot per FILE deliverable, one text field per
 * TEXT deliverable. Each uploaded file is bound to its deliverable key (explicit mapping, Phase 1 A3); nothing is
 * positional, and nothing declares a technical fact (no ticks, no signals). Submitting sends the work and starts
 * its evaluation in the same explicit click; the evaluation page only reads.
 *
 * Phase B, package 4 (FR-U-025): work in progress is saved automatically as a private DRAFT (texts, file references,
 * selected skills, work-method answers) and restored on return. The save state is always shown; a failed save is
 * retried and can be retried by hand; a save from a stale window is refused rather than overwriting newer work. A draft
 * is never evidence — the submission is still built from what is sent on «تسليم», and it removes the draft.
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
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const revision = useRef<number | null>(null);
  const restored = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string | null>(null);
  const [materials, setMaterials] = useState<ActivityMaterial[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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
          // Phase B package 3: the starter packages of this project's activity (names only; each download is a fresh signed URL).
          setMaterials((await api<{ items: ActivityMaterial[] }>(`/projects/${id}/materials`, { token })).items);
          // FR-U-025: restore the private draft, if any; otherwise start from the activity's primary skills.
          const draft = await api<DraftView | null>(`/projects/${id}/draft`, { token });
          if (draft) {
            revision.current = draft.revision;
            setTexts(draft.texts);
            setSlots(Object.fromEntries(Object.entries(draft.files).map(([k, f]) => [k, { status: 'done' as const, uploadId: f.uploadId, name: f.name, size: f.size ?? 0 }])));
            setSkills(draft.skillIds.length ? draft.skillIds : a.skills.filter((s) => s.depth === 'primary').map((s) => s.id));
            setAnswers(draft.disclosure);
            setSave({ kind: 'saved', at: new Date(draft.updatedAt) });
            lastSaved.current = JSON.stringify([draft.texts, Object.fromEntries(Object.entries(draft.files).map(([k, f]) => [k, f.uploadId])),
              draft.skillIds.length ? draft.skillIds : a.skills.filter((s) => s.depth === 'primary').map((s) => s.id), draft.disclosure]);
          } else {
            setSkills(a.skills.filter((s) => s.depth === 'primary').map((s) => s.id));
          }
          if (!a.available) setSave({ kind: 'off', reason: 'unavailable' });
          restored.current = true;
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
  const unsaved = anyUploading || save.kind === 'pending' || save.kind === 'saving' || save.kind === 'error' || save.kind === 'conflict';
  const draftFiles = Object.fromEntries(Object.entries(slots).flatMap(([k, sl]) => (sl.status === 'done' ? [[k, sl.uploadId]] : [])));
  const draftKey = JSON.stringify([texts, draftFiles, skills, answers]);

  async function saveDraft(attempt = 0): Promise<void> {
    if (!token || !project || submitting.current) return;
    const key = draftKey;
    setSave({ kind: 'saving' });
    try {
      const d = await api<DraftView>(`/projects/${encodeURIComponent(project.id)}/draft`, {
        method: 'PUT', token, body: { texts, files: draftFiles, skillIds: skills, disclosure: answers, revision: revision.current },
      });
      revision.current = d.revision; lastSaved.current = key;
      setSave({ kind: 'saved', at: new Date(d.updatedAt) });
    } catch (e) {
      const msg = (e as Error).message;
      if (/draft_conflict/.test(msg)) { setSave({ kind: 'conflict' }); return; }
      if (/activity_unavailable/.test(msg)) { setSave({ kind: 'off', reason: 'unavailable' }); return; }
      // Transient failure: retry with backoff (2s, 4s, 8s), then wait for the graduate's own retry.
      if (attempt < 3) { setSave({ kind: 'error', attempts: attempt + 1 }); saveTimer.current = setTimeout(() => void saveDraft(attempt + 1), 2000 * 2 ** attempt); return; }
      setSave({ kind: 'error', attempts: attempt + 1 });
    }
  }

  // Autosave: one second after the last change (never while uploading, submitting, or for a read-only activity).
  useEffect(() => {
    if (!restored.current || !activity?.available || submitting.current || anyUploading) return;
    if (save.kind === 'conflict' || save.kind === 'off') return;
    if (draftKey === lastSaved.current) return; // nothing changed since the last save (or the restore)
    const meaningful = Object.values(texts).some((t) => t.trim() !== '') || Object.keys(draftFiles).length > 0 || Object.keys(answers).length > 0;
    if (revision.current === null && !meaningful) return; // opening a workspace never creates an empty draft
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSave((s) => (s.kind === 'saving' ? s : { kind: 'pending' }));
    saveTimer.current = setTimeout(() => void saveDraft(), 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, anyUploading]);

  // Warn before leaving only while something is NOT yet saved (an upload, a pending or failed save).
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

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

  async function downloadMaterial(m: ActivityMaterial) {
    if (!token || !project) return;
    setDownloadError(null);
    try {
      const d = await materialDownloadUrl(project.id, m.id, token);
      window.location.assign(d.url);
    } catch (e) {
      setDownloadError(friendlyErrorAr((e as Error).message, 'تعذّر تجهيز رابط التنزيل. حاولي مجددًا.').textAr);
    }
  }

  async function submit() {
    if (!token || !project || submitting.current || problems.length) return;
    submitting.current = true; setSubmitError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
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
      // The submission removed the draft (same transaction); nothing local is kept either.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      revision.current = null; setSlots({}); setTexts({});
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
      {activity.isDemo ? <ExperimentalNotice kind="activity" /> : null}
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
        {!materials.length && activity.inputs.length && !activity.materialsAvailable ? (
          <p className="disclaimer">لا ملفات بداية لهذا النشاط على المنصّة؛ ما يُقدَّم لك موصوف في تفاصيل النشاط.</p>
        ) : null}
        <a className="link" href={`/activities/${encodeURIComponent(activity.id)}`}>تفاصيل النشاط وطريقة التقييم ←</a>
      </section>

      {materials.length ? (
        <section className="card" aria-labelledby="starter">
          <h2 id="starter">مواد البداية</h2>
          <p className="body-sm" style={{ margin: 0 }}>نزّلي الملفات، واقرئي <span className="term">README.md</span> أولًا ففيه طريقة التشغيل وما تسلّمينه. اعملي بأدواتك المعتادة، ثم ارفعي ما يُطلب هنا.</p>
          <div className="rows">
            {materials.map((m) => (
              <div key={m.id} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="grow body-sm"><span className="term">{m.fileName}</span> <span className="micro muted num">{sizeLabel(m.sizeBytes)}</span></span>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => void downloadMaterial(m)}>نزّلي الملفات</button>
              </div>
            ))}
          </div>
          {downloadError ? <p className="field__error" role="alert">{downloadError}</p> : null}
          <p className="disclaimer">هذه المواد خاصة بك ولهذا النشاط: لا تنشريها في مستودع عام ولا على الإنترنت. رابط التنزيل مؤقت ويُنشأ عند كل نقرة.</p>
        </section>
      ) : null}

      {token && params?.projectId ? (
        <ManagerPanel token={token} projectId={params.projectId} readOnly={readOnly} refreshKey={save.kind === 'saved' ? String(revision.current) : null} />
      ) : null}

      {!readOnly ? (
        <>
          <section className="card" aria-labelledby="outputs">
            <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h2 id="outputs">المخرجات المطلوبة</h2>
              <span className="chip push" aria-live="polite">{progress.labelAr}</span>
              <SaveIndicator state={save} onRetry={() => void saveDraft()} />
            </div>
            <div className="rows">
              {activity.deliverables.map((d) => {
                const label = d.descriptionAr ?? d.descriptionEn ?? d.key;
                const slot = slots[d.key];
                const inputId = `deliverable-${d.key.replace(/[^a-z0-9]+/gi, '-')}`;
                return (
                  <div key={d.key} className="field">
                    <label className="field__label" htmlFor={inputId}>
                      {label} <span className={d.mandatory ? 'chip chip--info' : 'chip'} style={{ marginInlineStart: 6 }}>{d.mandatory ? 'إلزامي' : 'اختياري'}</span>
                    </label>
                    {d.kind === 'file' ? (
                      <>
                        <span className="file-pick">
                          <input id={inputId} className="file-pick__input" type="file" disabled={slot?.status === 'uploading' || !!busy}
                                 aria-describedby={`${inputId}-state`}
                                 onChange={(e) => { void onFile(d.key, e.target.files?.[0] ?? null); e.target.value = ''; }} />
                          <label htmlFor={inputId} className="btn btn--secondary btn--sm file-pick__button" aria-hidden="true">
                            {slot?.status === 'done' ? 'استبدلي الملف' : 'اختاري ملفًا'}
                          </label>
                          {!slot ? <span className="micro muted">لم يُختر ملف بعد</span> : null}
                        </span>
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
              يُحفظ عملك تلقائيًا مسودةً خاصة بك، فتجدينه كما تركتِه حين تعودين. المسودة ليست تسليمًا ولا دليلًا، ولا يراها أحد غيرك؛ وتُحذف عند التسليم.
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

/** The draft save state, in words and never by colour alone (FR-U-025). */
function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const body = (() => {
    switch (state.kind) {
      case 'idle': return <span className="micro muted">يُحفظ عملك تلقائيًا</span>;
      case 'pending': return <span className="micro muted">تغييرات لم تُحفظ بعد…</span>;
      case 'saving': return <span className="micro muted">جارٍ الحفظ…</span>;
      case 'saved': return <span className="chip chip--success">تم الحفظ · <span className="num">{timeAr(state.at)}</span></span>;
      case 'error': return (
        <>
          <span className="field__error">تعذّر الحفظ{state.attempts <= 3 ? '، نعيد المحاولة…' : ''}</span>
          {state.attempts > 3 ? <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>أعيدي المحاولة</button> : null}
        </>
      );
      case 'conflict': return (
        <>
          <span className="field__error">حُفظ هذا العمل من نافذة أخرى.</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.location.reload()}>اعرضي أحدث نسخة</button>
        </>
      );
      case 'off': return <span className="micro muted">لا يُحفظ عمل جديد لنشاط لم يعد ضمن أنشطتك</span>;
    }
  })();
  return <span className="save-state" role="status" aria-live="polite" data-testid="draft-save-state">{body}</span>;
}
