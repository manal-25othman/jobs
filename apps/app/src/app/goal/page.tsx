'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type TargetRole, type CareerGoal, type RoleProfile } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';
import { Steps } from '../../components/Steps';
import { JourneyNav } from '../../components/JourneyNav';

/**
 * Minimal career goal context.
 *
 * Confirming a goal is an explicit act, not a dropdown change — step 3 of the
 * frozen onboarding. Full settings and multi-goal management are not built.
 */
export default function GoalPage() {
  const { token, loading } = useSession();
  const [roles, setRoles] = useState<TargetRole[]>([]);
  const [goal, setGoal] = useState<CareerGoal | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        await api('/me/bootstrap', { method: 'POST', body: {}, token });
        const [r, g] = await Promise.all([
          api<TargetRole[]>('/target-roles', { token }),
          api<CareerGoal | null>('/me/career-goal', { token }),
        ]);
        setRoles(r);
        setGoal(g);
        // Nothing is pre-selected for a new choice (walkthrough finding 1): the graduate picks a role explicitly.
        if (g) setSelected(g.targetRoleId);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [token]);

  async function confirm() {
    if (!token || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const g = await api<CareerGoal>('/me/career-goal', {
        method: 'PUT', body: { targetRoleId: selected, confirmed: true }, token,
      });
      setGoal(g);
      router.push('/activities');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="wrap"><Loading /></main>;

  return (
    <main className="wrap">
      <Steps current={0} />
      <JourneyNav current="/goal" />
      <h1>هدفك المهني</h1>
      {error ? <ErrorBanner message={error} /> : null}

      <section className="card">
        <h2>اختاري الدور المستهدف</h2>
        <div className="rows">
          {roles.map((r) => (
            <div key={r.id} className="stack" style={{ gap: 8 }}>
              <label className="check-row">
                <input
                  type="radio" name="role" value={r.id}
                  checked={selected === r.id}
                  onChange={() => setSelected(r.id)}
                />
                <span className="grow stack" style={{ gap: 4 }}>
                  <span style={{ fontWeight: 500 }}>{r.label_ar}</span>
                  <span className="body-sm muted term" lang="en">{r.label_en}</span>
                  {r.profile?.descriptionAr ? <span className="body-sm">{r.profile.descriptionAr}</span> : null}
                  {r.review_status !== 'published' ? (
                    <span className="chip chip--attention">البيانات غير مكتملة بعد</span>
                  ) : null}
                  {r.offered === false ? (
                    <span className="micro muted">مسارك السابق: لم يعد يُعرض للاختيار الجديد، ويبقى متاحًا لك بكل ما أنجزتِه فيه.</span>
                  ) : null}
                  {r.isDemo ?? r.is_demo_fixture ? (
                    <span className="micro muted">{r.isPilot ? 'تجربة داخلية · محتوى تجريبي غير معتمد مهنيًا' : 'بيانات تجريبية · ليست تعريف دور مُراجَعًا'}</span>
                  ) : null}
                </span>
              </label>
              {r.profile ? <RoleProfileDetails profile={r.profile} /> : null}
            </div>
          ))}
        </div>

        <p className="disclaimer">
          إن كان تعريف الدور غير مكتمل تُعرض متطلباته كما هي ناقصة — ولا تُخترع متطلبات.
        </p>

        <button className="btn btn--primary" onClick={confirm} disabled={busy || !selected}>
          {busy ? 'جارٍ…' : 'هذا هو هدفي المهني الأساسي الآن'}
        </button>
      </section>

      {roles.length === 0 && !error ? (
        <p className="body-sm muted">لا أدوار متاحة للاختيار بعد. تُضاف الأدوار بعد مراجعة محتواها ونشره.</p>
      ) : null}

      {goal ? (
        <div className="banner banner--success" role="status">
          <span className="grow">
            هدفك الحالي: <strong style={{ fontWeight: 500 }}>{goal.roleLabelAr ?? goal.roleLabel}</strong>
          </span>
          <a className="link" href="/activities">أنشطة دورك ←</a>
        </div>
      ) : null}
    </main>
  );
}

/**
 * Phase B, package 1: what the role actually involves, from the existing role definition — shown as recorded, with
 * its sources (or the plain statement that none is attached yet). Nothing here is presented as expert-approved.
 */
function RoleProfileDetails({ profile }: { profile: RoleProfile }) {
  const has = profile.missionAr || profile.responsibilitiesAr.length || profile.expectedFromJuniorAr.length || profile.skillAreasAr.length;
  if (!has) return null;
  return (
    <details className="role-profile" style={{ marginInlineStart: 28 }}>
      <summary className="link body-sm">ما الذي يفعله صاحب هذا الدور؟</summary>
      <div className="stack" style={{ gap: 10, marginTop: 8 }}>
        {profile.missionAr ? <p className="body-sm" style={{ margin: 0 }}><strong style={{ fontWeight: 500 }}>الغاية من الدور:</strong> {profile.missionAr}</p> : null}
        <ProfileList title="مسؤوليات العمل المعتادة" items={profile.responsibilitiesAr} />
        <ProfileList title="ما يسلّمه في العمل" items={profile.outputsAr} />
        <ProfileList title="المتوقع من المبتدئ" items={profile.expectedFromJuniorAr} />
        <ProfileList title="غير متوقع من المبتدئ" items={profile.notExpectedFromJuniorAr} />
        {profile.skillAreasAr.length ? (
          <div className="stack" style={{ gap: 4 }}>
            <span className="body-sm" style={{ fontWeight: 500 }}>مجالات المهارة الرئيسية</span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{profile.skillAreasAr.map((x) => <span key={x} className="chip">{x}</span>)}</div>
          </div>
        ) : null}
        <div className="stack" style={{ gap: 4 }}>
          <span className="body-sm" style={{ fontWeight: 500 }}>مصادر هذا الوصف</span>
          {profile.sources.length ? (
            <ul className="body-sm" style={{ margin: 0 }}>
              {profile.sources.map((src) => (
                <li key={src.name}>
                  {src.url && src.urlVerified ? <a className="link" href={src.url} target="_blank" rel="noopener noreferrer">{src.name}</a> : <span>{src.name}</span>}
                  {src.publisher ? <span className="muted"> · {src.publisher}</span> : null}
                  {!src.urlVerified ? <span className="micro muted"> · لم يُتحقَّق من الرابط بعد</span> : null}
                </li>
              ))}
            </ul>
          ) : <p className="body-sm muted" style={{ margin: 0 }}>لم يُرفق مصدر موثَّق بهذا الوصف بعد.</p>}
        </div>
        <p className="disclaimer" style={{ margin: 0 }}>
          {profile.reviewed ? 'وصف دور مُراجَع.' : 'وصف مسودة لم يعتمده خبير بعد: يساعدك على فهم الدور، ولا يُعدّ متطلبات معتمدة.'}
        </p>
      </div>
    </details>
  );
}

function ProfileList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="body-sm" style={{ fontWeight: 500 }}>{title}</span>
      <ul className="body-sm" style={{ margin: 0 }}>{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}
