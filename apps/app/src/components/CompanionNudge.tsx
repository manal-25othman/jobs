'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * The Companion as presentation layer: one nudge, from validated proposals
 * only, with fixed template text. It invents nothing (frozen design §11).
 */
export function CompanionNudge({ token }: { token: string | null }) {
  const [nudge, setNudge] = useState<{ proposalId: string; textAr: string; actionHref: string } | null>(null);
  useEffect(() => { if (!token) return; void api<Array<{ proposalId: string; textAr: string; actionHref: string }>>('/me/companion', { token }).then((n) => setNudge(n[0] ?? null)).catch(() => setNudge(null)); }, [token]);
  if (!nudge) return null;
  return (
    <div className="banner banner--info" role="status" aria-live="polite">
      <span className="dot dot--demonstrated" aria-hidden="true" />
      <span className="grow">{nudge.textAr}</span>
      <a className="link" href={nudge.actionHref}>أريني</a>
    </div>
  );
}
