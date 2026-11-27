'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../../components/Session';

/**
 * Return from GitHub after the graduate installed NAQLA's GitHub App on the repositories THEY chose. The browser
 * carries `installation_id`, `code` and our signed `state`; this page hands them to the API with the session, which
 * checks the state (started by this user) and that the installation belongs to the authorising GitHub user.
 */
function Callback() {
  const { token, loading } = useSession();
  const q = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    const body = { code: q.get('code'), installationId: q.get('installation_id'), state: q.get('state') };
    void api('/me/github/app-callback', { method: 'POST', token, body })
      .then(() => router.replace('/github'))
      .catch((e) => setError((e as Error).message.replace(/^\[[a-z_]+\]\s*/, '')));
  }, [token, q, router]);
  if (loading || (!error && token)) return <main className="wrap"><Loading /></main>;
  return <main className="wrap"><h1>ربط GitHub</h1>{error ? <ErrorBanner message={error} /> : null}<a className="link" href="/github">العودة ←</a></main>;
}

export default function GitHubCallbackPage() {
  return <Suspense fallback={<main className="wrap"><Loading /></main>}><Callback /></Suspense>;
}
