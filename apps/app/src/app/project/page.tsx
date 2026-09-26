'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Project } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';
import { Steps } from '../../components/Steps';

/** The seeded demo activity. One activity, one rubric — nothing more. */
const DEMO_ACTIVITY = 'c0000000-0000-4000-8000-000000000001';
const DEMO_SKILL = 'a0000000-0000-4000-8000-000000000002';

/**
 * The submission form's deliverables, mirroring the seeded rubric.
 *
 * These are checkboxes because the deterministic evaluator checks structured
 * facts, not prose. A real submission would attach files; this slice proves
 * the pipeline, and the artifact shape is the same either way.
 */
const DELIVERABLES = [
  { key: 'test.empty_state',   label: 'اختبار الحالة الفارغة', mandatory: true },
  { key: 'test.loading_state', label: 'اختبار حالة التحميل',   mandatory: true },
  { key: 'test.error_message', label: 'اختبار حالة الخطأ + رسالة يراها المستخدم', mandatory: true },
];

export default function ProjectPage() {
  const { token, loading } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState('متتبّع عادات');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [componentFile, setComponentFile] = useState('HabitList.jsx');
  const [testFile, setTestFile] = useState('HabitList.test.jsx');
  const [note, setNote] = useState('');
  const [aiUse, setAiUse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    void api<{ items: Project[] }>('/projects', { token })
      .then((p) => setProjects(p.items))
      .catch((e) => setError((e as Error).message));
  }, [token]);

  async function submit() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const project = await api<Project>('/projects', {
        method: 'POST', token,
        body: { title, kind: 'platform_activity', activitySpecId: DEMO_ACTIVITY },
      });

      const artifacts: Record<string, unknown>[] = [
        { key: 'file.component', kind: 'file', valueText: componentFile, locator: componentFile },
        { key: 'file.test', kind: 'file', valueText: testFile, locator: testFile },
        { key: 'signal.tests_reference_component', kind: 'boolean', valueBool: true },
      ];
      for (const d of DELIVERABLES) {
        if (checked[d.key]) {
          artifacts.push({ key: d.key, kind: 'boolean', valueBool: true, locator: testFile });
        }
      }
      if (note.trim()) {
        artifacts.push({ key: 'note.coverage', kind: 'text', valueText: note.trim(), locator: 'notes.md' });
      }

      const submission = await api<{ id: string }>(`/projects/${project.id}/submissions`, {
        method: 'POST', token,
        body: {
          skillIds: [DEMO_SKILL],
          artifacts,
          aiDisclosure: {
            declaredUse: aiUse.trim() ? [aiUse.trim()] : [],
            explanation: null,
          },
        },
      });

      router.push(`/evaluation?submission=${submission.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="wrap"><Loading /></main>;

  return (
    <main className="wrap">
      <Steps current={1} />
      <h1>اختبار الواجهات — تحقق قصير</h1>
      <p className="body-sm muted">
        ≈ <span className="num">٢٠</span> دقيقة ·{' '}
        <span className="chip chip--info">
          سياسة <span className="term" lang="en">AI</span>: مسموح للشرح، ممنوع لكتابة الاختبارات
        </span>
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
        <h2>المشروع</h2>
        <label className="field">
          <span className="field__label">اسم المشروع</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <label className="field grow">
            <span className="field__label">ملف المكوّن</span>
            <input className="input term" dir="ltr" value={componentFile}
                   onChange={(e) => setComponentFile(e.target.value)} />
          </label>
          <label className="field grow">
            <span className="field__label">ملف الاختبار</span>
            <input className="input term" dir="ltr" value={testFile}
                   onChange={(e) => setTestFile(e.target.value)} />
          </label>
        </div>
        <p className="disclaimer">
          كلا الملفين مطلوب: فحص سلامة حاجب يوقف التقييم قبل أي درجة إن نقص أحدهما.
        </p>
      </section>

      <section className="card">
        <h2>المخرجات المطلوبة · <span className="num">٣</span></h2>
        <div>
          {DELIVERABLES.map((d) => (
            <label key={d.key} className="check-row">
              <input
                type="checkbox"
                checked={!!checked[d.key]}
                onChange={(e) => setChecked({ ...checked, [d.key]: e.target.checked })}
              />
              <span className="grow">
                {d.label}
                {d.mandatory ? <span className="chip" style={{ marginInlineStart: 8 }}>إلزامي</span> : null}
              </span>
            </label>
          ))}
        </div>
        <label className="field">
          <span className="field__label">ملاحظة قصيرة: ماذا غطّت الاختبارات وماذا لم تغطِّ</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder="غطّت الحالة الفارغة والتحميل والخطأ؛ لم تغطِّ التقسيم إلى صفحات." />
        </label>
      </section>

      <section className="card">
        <h2>إقرار استخدام الذكاء الاصطناعي</h2>
        <label className="field">
          <span className="field__label">بماذا ساعدك الذكاء الاصطناعي؟ (اتركيه فارغًا إن لم تستعيني به)</span>
          <input className="input" value={aiUse} onChange={(e) => setAiUse(e.target.value)} />
        </label>
        <p className="disclaimer">
          الإفصاح لا يخفض درجتك. المهم ما فعلتِه، وبماذا ساعدك، وهل تستطيعين شرح عملك والدفاع عنه.
        </p>
      </section>

      <div className="next-action">
        <span className="kicker">التسليم</span>
        <h2>عند التسليم يُقيَّم على <span className="num">٤</span> معايير — بلا نموذج لغوي</h2>
        <p>
          التسليم يُقفَل ولا يُعدَّل. التصحيح يُنشئ تسليمًا جديدًا مرتبطًا بالأول.
        </p>
        <div>
          <button className="btn btn--on-dark" onClick={submit} disabled={busy}>
            {busy ? 'جارٍ…' : 'تسليم للتقييم'}
          </button>
        </div>
      </div>

      {projects.length > 0 ? (
        <section className="card">
          <h2>مشاريعك</h2>
          <div className="rows">
            {projects.map((p) => (
              <div key={p.id} className="row" style={{ gap: 10 }}>
                <span className="grow body-sm">{p.title}</span>
                <span className="chip">{p.status}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
