'use client';

import { useEffect, useState } from 'react';
import { api, type ProjectStatus, type ActivityCatalogue, type ActivityDetail, type ActivitySkill } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';
import { Steps } from '../../components/Steps';
import { JourneyNav } from '../../components/JourneyNav';
import { workStatusCopy, chipClass, nextActionFor, isAssessedWork } from '../../lib/journey';

const LATEST_AR: Record<string, string> = {
  submitted: 'سُلِّمت آخر محاولة ولم تُقيَّم بعد.',
  evaluation_running: 'تقييم آخر محاولة جارٍ.',
  evaluation_failed: 'تعذّر تقييم آخر محاولة؛ يمكن إعادة المحاولة من صفحة التقييم.',
  under_human_review: 'آخر محاولة قيد المراجعة البشرية.',
  blocked_by_checks: 'آخر محاولة ينقصها ما يلزم لإكمال التقييم.',
  pending_validation: 'قُيِّمت آخر محاولة؛ الملاحظات جاهزة، والمستوى بانتظار تحقق مستقل.',
  level_recorded: 'قُيِّمت آخر محاولة وسُجِّل تغيّر في مستوى المهارة.',
  feedback_ready: 'قُيِّمت آخر محاولة؛ الملاحظات جاهزة، ولم يتغيّر المستوى.',
};

/**
 * U6 — My Work: every project with its activity, skills, attempts, latest feedback and next action, from
 * GET /projects (authoritative work status). Completed work is shown apart from a recorded skill level.
 */
export default function MyWorkPage() {
  const { token, loading } = useSession();
  const [items, setItems] = useState<ProjectStatus[] | null>(null);
  const [skillsByActivity, setSkillsByActivity] = useState<Record<string, ActivitySkill[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        await api('/me/bootstrap', { method: 'POST', body: {}, token });
        const [projects, catalogue] = await Promise.all([
          api<{ items: ProjectStatus[] }>('/projects', { token }),
          api<ActivityCatalogue>('/me/activities', { token }),
        ]);
        setItems(projects.items);
        const map: Record<string, ActivitySkill[]> = Object.fromEntries(catalogue.items.map((a) => [a.id, a.skills]));
        // Activities no longer in the catalogue are still the graduate's own history: read them one by one.
        const missing = [...new Set(projects.items.map((p) => p.activitySpecId).filter((x): x is string => !!x && !map[x]))];
        for (const id of missing) {
          try { map[id] = (await api<ActivityDetail>(`/me/activities/${encodeURIComponent(id)}`, { token })).skills; } catch { map[id] = []; }
        }
        setSkillsByActivity(map);
      } catch (e) { setError((e as Error).message); }
    })();
  }, [token]);

  if (loading) return <main className="wrap"><Loading /></main>;
  const levels = (items ?? []).filter((p) => p.workStatus === 'level_recorded').length;
  const assessed = (items ?? []).filter((p) => isAssessedWork(p.workStatus)).length;

  return (
    <main className="wrap">
      <Steps current={2} />
      <JourneyNav current="/work" />
      <h1>أعمالي</h1>
      {error ? <ErrorBanner message={error} /> : null}
      {!items && !error ? <Loading /> : null}

      {items && items.length === 0 ? (
        <section className="card">
          <h2>لم تبدئي أي نشاط بعد</h2>
          <p className="body-sm" style={{ margin: 0 }}>ابدئي بنشاط من أنشطة دورك؛ يظهر عملك هنا مع حالته ومحاولاته.</p>
          <a className="link" href="/activities">أنشطة دورك ←</a>
        </section>
      ) : null}

      {items && items.length > 0 ? (
        <p className="body-sm muted">
          أعمال: <span className="num">{items.length}</span> · قُيِّم منها: <span className="num">{assessed}</span> · سجّل تغيّرًا في مستوى مهارة: <span className="num">{levels}</span>
        </p>
      ) : null}

      {items?.map((p) => {
        const st = workStatusCopy(p.workStatus);
        const next = nextActionFor({ projectId: p.id, workStatus: p.workStatus, latestSubmissionId: p.latestSubmission?.id ?? null });
        const skills = p.activitySpecId ? skillsByActivity[p.activitySpecId] ?? [] : [];
        const title = p.activity?.titleAr ?? p.title;
        return (
          <article key={p.id} className="card" aria-labelledby={`w-${p.id}`}>
            <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h2 id={`w-${p.id}`} className="grow">{title}</h2>
              <span className={chipClass(st.tone)}>{st.labelAr}</span>
            </div>
            {p.kind === 'personal_project' ? <p className="micro muted" style={{ margin: 0 }}>مشروع شخصي</p> : null}
            {skills.length ? (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} aria-label="المهارات المرتبطة">
                {skills.map((s) => <span key={s.id} className="chip">{s.labelAr}</span>)}
              </div>
            ) : null}
            <p className="body-sm" style={{ margin: 0 }}>
              المحاولات: <span className="num">{p.attempts}</span>
              {p.latestSubmission ? <> · {LATEST_AR[p.workStatus] ?? ''}</> : <> · لم يُسلَّم بعد.</>}
            </p>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              {p.kind === 'platform_activity' ? <a className="link" href={`/work/${encodeURIComponent(p.id)}`}>مكان العمل ←</a> : null}
              <a className="link push" href={next.href}>{next.labelAr} ←</a>
            </div>
          </article>
        );
      })}

      {items && items.length > 0 ? (
        <p className="disclaimer">
          اكتمال العمل وتقييمه ليس مستوى مهارة. المستوى يتغيّر فقط حين يسجّل قرار التحقق ذلك بعد تقييم مستقل،
          ويظهر في <a className="link" href="/skills">مهارات المسار</a>.
        </p>
      ) : null}
    </main>
  );
}
