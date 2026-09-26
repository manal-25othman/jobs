'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, uploadEvidenceFile, type Project } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';
import { Steps } from '../../components/Steps';
import { deliverableProgress } from '@naqla/domain';

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
  const [title, setTitle] = useState('متتبّع عادات');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [componentFile, setComponentFile] = useState<File | null>(null);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [note, setNote] = useState('');
  const [aiUse, setAiUse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    void api<{ items: Project[] }>('/projects', { token })
      .then((p) => setProjects(p.items))
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

      const artifacts: Record<string, unknown>[] = [
        { key: 'signal.tests_reference_component', kind: 'boolean', valueBool: true },
      ];
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
          aiDisclosure: { declaredUse: aiUse.trim() ? [aiUse.trim()] : [], explanation: null },
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
        <h2>إقرار استخدام الذكاء الاصطناعي</h2>
        <label className="field">
          <span className="field__label">بماذا ساعدك الذكاء الاصطناعي؟ (اتركيه فارغًا إن لم تستعيني به)</span>
          <input className="input" value={aiUse} onChange={(e) => setAiUse(e.target.value)} />
        </label>
        <p className="disclaimer">الإفصاح لا يخفض درجتك. المهم ما فعلتِه، وبماذا ساعدك، وهل تستطيعين شرح عملك والدفاع عنه.</p>
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
