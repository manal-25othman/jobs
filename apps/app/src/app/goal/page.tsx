'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type TargetRole, type CareerGoal } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';
import { Steps } from '../../components/Steps';

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
        if (g) setSelected(g.targetRoleId);
        else if (r[0]) setSelected(r[0].id);
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
      router.push('/project');
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
      <h1>هدفك المهني</h1>
      {error ? <ErrorBanner message={error} /> : null}

      <section className="card">
        <h2>اختاري الدور المستهدف</h2>
        <div className="rows">
          {roles.map((r) => (
            <label key={r.id} className="check-row">
              <input
                type="radio" name="role" value={r.id}
                checked={selected === r.id}
                onChange={() => setSelected(r.id)}
              />
              <span className="grow stack" style={{ gap: 4 }}>
                <span style={{ fontWeight: 500 }}>{r.label_ar}</span>
                <span className="body-sm muted term" lang="en">{r.label_en}</span>
                {r.review_status !== 'published' ? (
                  <span className="chip chip--attention">البيانات غير مكتملة بعد</span>
                ) : null}
                {r.is_demo_fixture ? (
                  <span className="micro muted">بيانات تجريبية · ليست تعريف دور مُراجَعًا</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>

        <p className="disclaimer">
          إن كان تعريف الدور غير مكتمل تُعرض متطلباته كما هي ناقصة — ولا تُخترع متطلبات.
        </p>

        <button className="btn btn--primary" onClick={confirm} disabled={busy || !selected}>
          {busy ? 'جارٍ…' : 'هذا هو هدفي المهني الأساسي الآن'}
        </button>
      </section>

      {goal ? (
        <div className="banner banner--success" role="status">
          <span className="grow">
            هدفك الحالي: <strong style={{ fontWeight: 500 }} className="term" lang="en">{goal.roleLabel}</strong>
          </span>
          <a className="link" href="/project">التالي ←</a>
        </div>
      ) : null}
    </main>
  );
}
