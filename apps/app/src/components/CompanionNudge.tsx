'use client';
import { useEffect, useState } from 'react';
import { api, type NextStep } from '../lib/api';

/**
 * The Companion (A01) as presentation: ONE next step, explained, from the single A01 rule (`/me/next-step`, Phase B
 * package 5). It includes the companion's proposal nudge as one of its inputs; it never assigns an activity,
 * changes a goal, evaluates or changes a level (FR-A-009).
 */
export function CompanionNudge({ token, variant = 'banner' }: { token: string | null; variant?: 'banner' | 'card' }) {
  const [step, setStep] = useState<NextStep | null>(null);
  useEffect(() => { if (!token) return; void api<NextStep>('/me/next-step', { token }).then(setStep).catch(() => setStep(null)); }, [token]);
  if (!step) return null;
  if (variant === 'card') {
    return (
      <section className="card" data-testid="a01-next-step">
        <span className="kicker">خطوتك التالية</span>
        <p className="body-sm" style={{ fontWeight: 500, margin: '4px 0' }}>{step.textAr}</p>
        <p className="micro muted" style={{ margin: '0 0 8px' }}>{step.whyAr}</p>
        <a className="link" href={step.href}>انتقلي إليها</a>
      </section>
    );
  }
  return (
    <div className="banner banner--info" role="status" aria-live="polite" data-testid="a01-next-step">
      <span className="dot dot--demonstrated" aria-hidden="true" />
      <span className="grow">{step.textAr} <span className="micro muted">· {step.whyAr}</span></span>
      <a className="link" href={step.href}>انتقلي إليها</a>
    </div>
  );
}
