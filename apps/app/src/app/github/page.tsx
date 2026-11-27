'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';
import { JourneyNav } from '../../components/JourneyNav';

/**
 * Phase C round 2 — linking GitHub. The graduate installs NAQLA's GitHub App on the repositories THEY choose, with
 * read-only permissions, and can unlink at any time. Only the simulated mode exists before approval: synthetic
 * repositories, no request to GitHub. Linking is never required for non-programming tracks, nor an organisation.
 */
interface Status { mode: 'off' | 'simulated' | 'app'; installUrl?: string | null; linked: boolean; login?: string | null; simulatedNoticeAr?: string; permissionsAr?: string[]; neverAr?: string[];
  repositories?: { repoId: number; fullName: string; private: boolean }[] }
const TEMPLATES = ['leave-requests', 'workshop-registration', 'team-tasks'];

export default function GitHubPage() {
  const { token, loading } = useSession();
  const [st, setSt] = useState<Status | null>(null);
  const [login, setLogin] = useState('sim-');
  const [pick, setPick] = useState<Record<string, boolean>>({ 'leave-requests': true });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = () => { if (token) void api<Status>('/me/github', { token }).then(setSt).catch((e) => setError((e as Error).message)); };
  useEffect(load, [token]);
  if (loading || (!st && !error)) return <main className="wrap"><Loading /></main>;
  if (!token) return <main className="wrap"><Loading /></main>;
  const clean = (m: string) => m.replace(/^\[[a-z_]+\]\s*/, '');
  const connect = async () => {
    setError(null);
    try {
      await api('/me/github/simulated-install', { method: 'POST', token, body: { login, repositories: TEMPLATES.filter((t) => pick[t]).map((t) => `${login}/${t}`) } });
      setNotice('تم الربط بالمستودعات التي اخترتِها فقط.'); load();
    } catch (e) { setError(clean((e as Error).message)); }
  };
  const unlink = async () => {
    setError(null);
    try { const r = await api<{ noticeAr: string }>('/me/github', { method: 'DELETE', token }); setNotice(r.noticeAr); load(); } catch (e) { setError(clean((e as Error).message)); }
  };
  return (
    <main className="wrap">
      <JourneyNav current={null} />
      <h1>ربط GitHub</h1>
      {error ? <ErrorBanner message={error} /> : null}
      {notice ? <p className="body-sm" role="status" data-testid="github-notice">{notice}</p> : null}
      {st?.mode === 'off' ? <section className="card"><p className="body-sm">ربط GitHub غير مفعَّل في هذه البيئة. يمكنك التسليم برفع الملفات.</p></section> : st ? (
        <>
          {st.simulatedNoticeAr ? <p className="micro muted" data-testid="github-simulated">{st.simulatedNoticeAr}</p> : null}
          <section className="card" data-testid="github-permissions">
            <h2>ما الذي نطلبه</h2>
            <ul className="body-sm">{(st.permissionsAr ?? []).map((p) => <li key={p}>{p}</li>)}</ul>
            <h2>ما لا نفعله أبدًا</h2>
            <ul className="body-sm">{(st.neverAr ?? []).map((p) => <li key={p}>{p}</li>)}</ul>
            <p className="micro muted">لا يُشترط إنشاء منظمة. GitHub مطلوب فقط في الأنشطة التي تقيس العمل بـGit، واختياري في غيرها.</p>
          </section>
          {st.linked ? (
            <section className="card" data-testid="github-linked">
              <h2>مرتبط بحساب {st.login}</h2>
              <ul className="body-sm">{(st.repositories ?? []).map((r) => <li key={r.repoId}>{r.fullName}{r.private ? ' (خاص)' : ''}</li>)}</ul>
              <button type="button" className="btn btn--secondary" data-testid="github-unlink" onClick={() => void unlink()}>إلغاء الربط وسحب الصلاحيات</button>
            </section>
          ) : st.mode === 'app' ? (
            <section className="card" data-testid="github-connect-app">
              <h2>اربطي عبر GitHub</h2>
              <p className="body-sm">ستنتقلين إلى GitHub لتختاري «Only select repositories» ثم المستودعات التي تريدينها فقط، ثم تعودين إلى هنا.</p>
              {st.installUrl ? <a className="btn btn--primary" href={st.installUrl} data-testid="github-install-app">المتابعة إلى GitHub (قراءة فقط)</a> : null}
            </section>
          ) : (
            <section className="card" data-testid="github-connect">
              <h2>اختاري المستودعات (محاكاة)</h2>
              <label className="body-sm" htmlFor="gh-login">اسم الحساب الاصطناعي</label>
              <input id="gh-login" dir="ltr" value={login} onChange={(e) => setLogin(e.target.value)} />
              {TEMPLATES.map((t) => (
                <label key={t} className="body-sm" style={{ display: 'block' }}>
                  <input type="checkbox" checked={!!pick[t]} onChange={(e) => setPick({ ...pick, [t]: e.target.checked })} /> <span dir="ltr">{login}/{t}</span>
                </label>
              ))}
              <button type="button" className="btn btn--primary" data-testid="github-install" onClick={() => void connect()}>ربط المستودعات المختارة (قراءة فقط)</button>
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
