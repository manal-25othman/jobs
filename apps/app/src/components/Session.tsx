'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { accessToken } from '../lib/supabase';

/**
 * Holds the access token for the screens below it.
 *
 * Every API call carries it, and the API verifies the signature — the browser
 * is never trusted about who it is.
 */
export function useSession(): { token: string | null; loading: boolean } {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void accessToken()
      .then((t) => {
        if (cancelled) return;
        setToken(t);
        setLoading(false);
        if (!t) router.replace('/login');
      })
      .catch(() => {
        if (!cancelled) { setLoading(false); router.replace('/login'); }
      });
    return () => { cancelled = true; };
  }, [router]);

  return { token, loading };
}

export function Loading() {
  return <p className="body-sm muted">جارٍ التحميل…</p>;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="banner banner--attention" role="alert">
      <span className="grow">{message}</span>
    </div>
  );
}

/** Evidence state shown with a shape AND a label, never colour alone (§13). */
export function EvidenceState({ state }: { state: string }) {
  const label: Record<string, string> = {
    gap: 'فجوة',
    self_reported: 'مُعلنة ذاتيًا',
    practiced: 'ظهرت في مشروع',
    demonstrated: 'مُثبتة بدليل',
    verified: 'موثّقة',
  };
  const term: Record<string, string | null> = {
    gap: null, self_reported: null,
    practiced: 'Practiced', demonstrated: 'Demonstrated', verified: 'Verified',
  };
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className={`dot dot--${state}`} aria-hidden="true" />
      <span className={`state-label state-label--${state}`}>
        {label[state] ?? state}
        {term[state] ? <> · <span className="term" lang="en">{term[state]}</span></> : null}
      </span>
    </span>
  );
}
