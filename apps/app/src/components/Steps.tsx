'use client';

/**
 * The slice's progress, as steps. The word form "الخطوة N من ٦" rather than
 * "N/6", per the frozen design §1.
 */
const STEPS = ['الهدف', 'المشروع', 'التسليم', 'التقييم', 'بند السيرة', 'التقرير'] as const;

export function Steps({ current }: { current: number }) {
  return (
    <nav className="steps" aria-label="خطوات المسار">
      {STEPS.map((label, i) => (
        <span
          key={label}
          className={`step ${i < current ? 'is-done' : ''} ${i === current ? 'is-current' : ''}`}
          aria-current={i === current ? 'step' : undefined}
        >
          {label}
        </span>
      ))}
    </nav>
  );
}
