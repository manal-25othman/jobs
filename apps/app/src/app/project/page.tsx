'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, uploadEvidenceFile, type Project, type EvidenceItem, type DisclosureQuestionnaireView, type DisclosureQuestionView } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';
import { Steps } from '../../components/Steps';
import { deliverableProgress, questionVisible } from '@naqla/domain';

/** The seeded demo activity. One activity, one rubric — nothing more. */
const DEMO_ACTIVITY = 'c0000000-0000-4000-8000-000000000001';
const DEMO_SKILL = 'a0000000-0000-4000-8000-000000000002';

const DELIVERABLES = [
  { key: 'test.empty_state',   label: 'اختبار الحالة الفارغة', mandatory: true },
  { key: 'test.loading_state', label: 'اختبار حالة التحميل',   mandatory: true },
  { key: 'test.error_message', label: 'اختبار حالة الخطأ + رسالة يراها المستخدم', mandatory: true },
  { key: 'note.coverage',      label: 'ملاحظة التغطية', mandatory: false },
];

export default function ProjectPage() {
  const { token, loading } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [title, setTitle] = useState('متتبّع عادات');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [componentFile, setComponentFile] = useState<File | null>(null);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [note, setNote] = useState('');
  // Phase 6: the disclosure questionnaire is configuration, fetched — never hard-coded here.
  const [questionnaire, setQuestionnaire] = useState<DisclosureQuestionnaireView['questionnaire']>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    void api<{ items: Project[] }>('/projects', { token })
      .then((p) => setProjects(p.items))
      .catch((e) => setError((e as Error).message));
    void api<DisclosureQuestionnaireView>('/disclosure-questionnaire', { token })
      .then((q) => setQuestionnaire(q.questionnaire))
      .catch((e) => setError((e as Error).message));
    // Phase 1: what the ledger holds for this user. Material, not proof.
    void api<{ items: EvidenceItem[] }>('/me/evidence', { token })
      .then((r) => setEvidenceItems(r.items))
      .catch((e) => setError((e as Error).message));
  }, [token]);

  // D-058: progress is a count of required outputs, never a percentage.
  const progress = deliverableProgress(
    DELIVERABLES.map((d) => ({
      key: d.key, required: d.mandatory,
      completed: d.key === 'note.coverage' ? note.trim().length >= 20 : !!checked[d.key],
    })),
  );
  const filesReady = !!componentFile && !!testFile;

  async function submit() {
    if (!token || !componentFile || !testFile) return;
    setError(null);
    try {
      setBusy('إنشاء المشروع…');
      const project = await api<Project>('/projects', {
        method: 'POST', token,
        body: { title, kind: 'platform_activity', activitySpecId: DEMO_ACTIVITY },
      });

      // Files go straight to private storage over signed URLs; the API only
      // ever sees an opaque upload id.
      setBusy('رفع الملفات…');
      const componentUpload = await uploadEvidenceFile(componentFile, token);
      const testUpload = await uploadEvidenceFile(testFile, token);

      // D-118: the ticks below are the user's DECLARATIONS (recorded as such, formative only). No platform signal is
      // ever sent from here — `signal.tests_reference_component` was, and the API now refuses any client-written signal.
      const artifacts: Record<string, unknown>[] = [];
      for (const d of DELIVERABLES) {
        if (d.key !== 'note.coverage' && checked[d.key]) {
          artifacts.push({ key: d.key, kind: 'boolean', valueBool: true, locator: testFile.name });
        }
      }
      if (note.trim()) artifacts.push({ key: 'note.coverage', kind: 'text', valueText: note.trim(), locator: 'notes.md' });

      setBusy('التسليم…');
      const submission = await api<{ id: string }>(`/projects/${project.id}/submissions`, {
        method: 'POST', token,
        body: {
          skillIds: [DEMO_SKILL],
          artifacts,
          uploadIds: [componentUpload, testUpload],
          externalUrls: repoUrl.trim() ? [repoUrl.trim()] : [],
          // Answers to the exact questionnaire version shown; questions hidden by show-if are not sent.
          aiDisclosure: questionnaire
            ? { questionnaireId: questionnaire.id, answers: Object.fromEntries(Object.entries(answers).filter(([k]) => { const q = questionnaire.questions.find((x) => x.key === k); return q ? questionVisible(q, answers) : false; })) }
            : { declaredUse: [], explanation: null },
        },
      });
      router.push(`/evaluation?submission=${submission.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <main className="wrap"><Loading /></main>;

  return (
    <main className="wrap">
      <Steps current={1} />
      <h1>اختبار الواجهات — تحقق قصير</h1>
      <p className="body-sm muted">
        ≈ <span className="num">٢٠</span> دقيقة ·{' '}
        <span className="chip chip--info">سياسة <span className="term" lang="en">AI</span>: مسموح للشرح، ممنوع لكتابة الاختبارات</span>
      </p>
      {error ? <ErrorBanner message={error} /> : null}

      <section className="card">
        <h2>سياق العمل</h2>
        <p className="body-sm">
          فريق صغير يستعد لإطلاق متتبّع العادات. المديرة تريد ثقة أن مكوّن «قائمة العادات»
          لا ينكسر عند الحالات الفارغة والخطأ والتحميل. مهمتك إثبات ذلك بالاختبارات، لا بالوصف.
        </p>
      </section>

      <section className="card">
        <h2>المشروع والملفات</h2>
        <label className="field">
          <span className="field__label">اسم المشروع</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <label className="field grow">
            <span className="field__label">ملف المكوّن</span>
            <input className="input" type="file" onChange={(e) => setComponentFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="field grow">
            <span className="field__label">ملف الاختبار</span>
            <input className="input" type="file" onChange={(e) => setTestFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <label className="field">
          <span className="field__label">رابط المستودع (اختياري)</span>
          <input className="input term" dir="ltr" placeholder="https://github.com/…" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
        </label>
        <p className="disclaimer">
          الملفات تُرفع مباشرة إلى تخزين خاص برابط موقّع قصير العمر. لا يُعرض مسارها أبدًا، ولا تصل إلى أي تقرير.
          كلا الملفين مطلوب: فحص سلامة حاجب يوقف التقييم قبل أي درجة إن نقص أحدهما.
        </p>
      </section>

      <section className="card">
        <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h2>المخرجات المطلوبة</h2>
          <span className="chip push" aria-live="polite">{progress.labelAr}</span>
        </div>
        <p className="body-sm muted">ما تؤشّرين عليه هنا إعلان منكِ يُسجَّل كما هو ويفيد في الملاحظات، لكنه لا يرفع مستوى المهارة وحده.</p>
        <div>
          {DELIVERABLES.filter((d) => d.key !== 'note.coverage').map((d) => (
            <label key={d.key} className="check-row">
              <input type="checkbox" checked={!!checked[d.key]}
                     onChange={(e) => setChecked({ ...checked, [d.key]: e.target.checked })} />
              <span className="grow">{d.label}{d.mandatory ? <span className="chip" style={{ marginInlineStart: 8 }}>إلزامي</span> : null}</span>
            </label>
          ))}
        </div>
        <label className="field">
          <span className="field__label">ملاحظة قصيرة: ماذا غطّت الاختبارات وماذا لم تغطِّ (اختياري)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder="غطّت الحالة الفارغة والتحميل والخطأ؛ لم تغطِّ التقسيم إلى صفحات." />
        </label>
        <p className="disclaimer">لا نسبة مئوية قبل التسليم: التقدّم عدّ للمخرجات، لا تقدير.</p>
      </section>

      <section className="card">
        <h2>{questionnaire?.labelAr ?? 'طريقة عملك'}</h2>
        <p className="body-sm">{questionnaire?.introAr ?? 'استخدام أدوات الذكاء الاصطناعي مسموح.'}</p>
        {questionnaire ? questionnaire.questions.filter((q) => questionVisible(q, answers)).map((q) => (
          <DisclosureField key={q.key} q={q} value={answers[q.key]} onChange={(v) => setAnswers({ ...answers, [q.key]: v })} />
        )) : null}
        <p className="disclaimer">
          الإجابة بأنك استخدمتِ الذكاء الاصطناعي لا تخفض درجتك ولا تُحيل عملك إلى مراجعة بشرية بذاتها.
          نقيّم فهمك ومساهمتك في العمل؛ ولا نستخدم أي «كاشف ذكاء اصطناعي» ولا نخمّن مصدر الكود من أسلوبه.
          {questionnaire && !questionnaire.validated ? <> صيغة الأسئلة قيد اعتماد الخبراء.</> : null}
        </p>
      </section>

      <div className="next-action">
        <span className="kicker">التسليم</span>
        <h2>عند التسليم يُقيَّم على <span className="num">٤</span> معايير — بلا نموذج لغوي</h2>
        <p>التسليم يُقفَل ولا يُعدَّل. التصحيح يُنشئ تسليمًا جديدًا مرتبطًا بالأول.</p>
        <div>
          <button className="btn btn--on-dark" onClick={submit} disabled={!!busy || !filesReady}>
            {busy ?? (filesReady ? 'تسليم للتقييم' : 'أرفقي الملفين أولًا')}
          </button>
        </div>
      </div>

      {evidenceItems.length > 0 ? (
        <section className="card">
          <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <h2>الأدلة المسجّلة</h2>
            <span className="chip push"><span className="num">{evidenceItems.length}</span> عنصر</span>
          </div>
          <div className="rows">
            {evidenceItems.filter((i) => i.parentItemId === null).map((i) => (
              <div key={i.id} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="grow body-sm">{i.title}</span>
                <span className="chip">{i.typeLabelAr}</span>
                {i.attemptNumber > 1 ? <span className="chip chip--info">محاولة <span className="num">{i.attemptNumber}</span></span> : null}
                <span className="chip">{i.status === 'submitted' ? 'مُسجَّل' : i.status === 'superseded' ? 'استُبدل' : i.status === 'withdrawn' ? 'مسحوب' : 'مسودة'}</span>
              </div>
            ))}
          </div>
          <p className="disclaimer">
            هذه مادة مسجّلة، لا إثبات: لا يغيّر أي عنصر هنا حالة مهارة قبل التقييم.
            وأنواع الأدلة قيد التحقق من الخبراء (DRAFT / NOT VALIDATED).
          </p>
        </section>
      ) : null}

      {projects.length > 0 ? (
        <section className="card">
          <h2>مشاريعك</h2>
          <div className="rows">
            {projects.map((p) => (
              <div key={p.id} className="row" style={{ gap: 10 }}>
                <span className="grow body-sm">{p.title}</span><span className="chip">{p.status}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

/** One configured question. Rendering follows the answer type from configuration; nothing is hard-coded per question. */
function DisclosureField({ q, value, onChange }: { q: DisclosureQuestionView; value: unknown; onChange: (v: unknown) => void }) {
  const label = <span className="field__label">{q.promptAr}{q.required ? <span className="chip" style={{ marginInlineStart: 8 }}>مطلوب</span> : null}</span>;
  const help = q.helpAr ? <span className="micro muted">{q.helpAr}</span> : null;
  switch (q.answerType) {
    case 'yes_no':
      return (
        <div className="field">{label}
          <div className="row" style={{ gap: 12 }}>
            {[{ v: true, t: 'نعم' }, { v: false, t: 'لا' }].map((o) => (
              <label key={String(o.v)} className="check-row"><input type="radio" name={q.key} checked={value === o.v} onChange={() => onChange(o.v)} /> <span>{o.t}</span></label>
            ))}
          </div>{help}
        </div>
      );
    case 'single_choice':
      return (
        <div className="field">{label}
          {q.options.map((o) => <label key={o.value} className="check-row"><input type="radio" name={q.key} checked={value === o.value} onChange={() => onChange(o.value)} /> <span>{o.labelAr}</span></label>)}{help}
        </div>
      );
    case 'multi_choice': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="field">{label}
          {q.options.map((o) => (
            <label key={o.value} className="check-row">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((x) => x !== o.value))} /> <span>{o.labelAr}</span>
            </label>
          ))}{help}
        </div>
      );
    }
    case 'text_list':
      return (
        <label className="field">{label}
          <input className="input" value={Array.isArray(value) ? (value as string[]).join('، ') : ''} onChange={(e) => onChange(e.target.value.split(/[،,]/).map((x) => x.trim()).filter(Boolean))} />{help}
        </label>
      );
    default:
      return (
        <label className="field">{label}
          <input className="input" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />{help}
        </label>
      );
  }
}
