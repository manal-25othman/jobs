'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * Phase C round 2 — submit from a GitHub repository the graduate SELECTED for NAQLA (read-only). The graduate picks a
 * pull request (its head commit) or a commit; on submit, that commit's files become the file deliverables and the
 * submission is pinned to it. Uploading files stays possible for activities where GitHub is optional.
 */
export interface GitHubSource { repoId: number; commitSha: string; pullRequestNumber: number | null; labelAr: string }
interface Status { mode: 'off' | 'simulated'; linked: boolean; login?: string | null; simulatedNoticeAr?: string; repositories?: { repoId: number; fullName: string; private: boolean }[] }
interface Commits { repository: string; commits: { sha: string; message: string }[]; pullRequests: { number: number; title: string; headSha: string; headRef: string; state: string }[] }

export function GitHubSourcePanel({ token, required, value, onChange, readOnly }: { token: string; required: boolean; value: GitHubSource | null; onChange: (s: GitHubSource | null) => void; readOnly: boolean }) {
  const [st, setSt] = useState<Status | null>(null);
  const [repoId, setRepoId] = useState<number | null>(null);
  const [c, setC] = useState<Commits | null>(null);
  useEffect(() => { void api<Status>('/me/github', { token }).then(setSt).catch(() => setSt(null)); }, [token]);
  useEffect(() => {
    if (repoId === null) { setC(null); return; }
    void api<Commits>(`/me/github/repos/${repoId}/commits`, { token }).then(setC).catch(() => setC(null));
  }, [token, repoId]);
  if (!st || st.mode === 'off' || readOnly) return null;
  return (
    <section className="card" aria-labelledby="gh" data-testid="github-source">
      <h2 id="gh">التسليم من GitHub {required ? <span className="chip chip--attention">مطلوب في هذا النشاط</span> : <span className="chip">اختياري</span>}</h2>
      {st.simulatedNoticeAr ? <p className="micro muted" data-testid="github-simulated">{st.simulatedNoticeAr}</p> : null}
      {!st.linked ? (
        <p className="body-sm">لم تربطي GitHub بعد. <a className="link" href="/github">اربطي مستودعًا تختارينه (قراءة فقط) ←</a></p>
      ) : (
        <>
          <label className="body-sm" htmlFor="gh-repo">المستودع (من المستودعات التي اخترتِها فقط)</label>
          <select id="gh-repo" data-testid="github-repo" value={repoId ?? ''} onChange={(e) => { onChange(null); setRepoId(e.target.value ? Number(e.target.value) : null); }}>
            <option value="">اختاري مستودعًا</option>
            {(st.repositories ?? []).map((r) => <option key={r.repoId} value={r.repoId}>{r.fullName}{r.private ? ' (خاص)' : ''}</option>)}
          </select>
          {c ? (
            <div role="radiogroup" aria-label="ما الذي تسلّمينه" style={{ marginTop: 8 }}>
              {c.pullRequests.map((p) => (
                <label key={`pr${p.number}`} className="body-sm" style={{ display: 'block' }}>
                  <input type="radio" name="gh-pick" data-testid="github-pick-pr" checked={value?.pullRequestNumber === p.number}
                    onChange={() => onChange({ repoId: repoId!, commitSha: p.headSha, pullRequestNumber: p.number, labelAr: `طلب الدمج #${p.number} عند الإيداع ${p.headSha.slice(0, 7)}` })} />
                  {' '}طلب الدمج #{p.number}: {p.title} <span className="micro muted">({p.headRef} · {p.headSha.slice(0, 7)})</span>
                </label>
              ))}
              {c.commits.map((k) => (
                <label key={k.sha} className="body-sm" style={{ display: 'block' }}>
                  <input type="radio" name="gh-pick" data-testid="github-pick-commit" checked={value?.commitSha === k.sha && value?.pullRequestNumber === null}
                    onChange={() => onChange({ repoId: repoId!, commitSha: k.sha, pullRequestNumber: null, labelAr: `الإيداع ${k.sha.slice(0, 7)}` })} />
                  {' '}<span className="micro" dir="ltr">{k.sha.slice(0, 7)}</span> {k.message}
                </label>
              ))}
            </div>
          ) : null}
          {value ? <p className="body-sm" data-testid="github-chosen">سيُثبَّت تسليمك على: {value.labelAr}. تؤخذ ملفات المخرجات من هذا الإيداع نفسه.</p> : null}
          <p className="micro muted">نقرأ فقط ما اخترتِه، ولا نكتب في مستودعك ولا ندمج ولا نحذف. عدد الإيداعات وحده لا يُثبت المهارة.</p>
        </>
      )}
    </section>
  );
}
