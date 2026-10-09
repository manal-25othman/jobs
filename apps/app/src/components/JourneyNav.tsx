'use client';

/**
 * The graduate journey's own links (Phase 2): goal → activities → work → skills. Built from the frozen
 * `.link` and `.body-sm` classes only; `aria-current` marks where the graduate is.
 */
const LINKS = [
  { href: '/goal', label: 'هدفي المهني' },
  { href: '/activities', label: 'أنشطة دوري' },
  { href: '/work', label: 'أعمالي' },
  { href: '/skills', label: 'مهارات المسار' },
] as const;

export function JourneyNav({ current }: { current: (typeof LINKS)[number]['href'] | null }) {
  return (
    <nav aria-label="رحلة الخريج" className="row body-sm" style={{ gap: 16, flexWrap: 'wrap', marginBlockEnd: 'var(--s-5)' }}>
      {LINKS.map((l) => (
        <a key={l.href} className="link" href={l.href} aria-current={current === l.href ? 'page' : undefined}
           style={current === l.href ? { textDecoration: 'underline' } : undefined}>
          {l.label}
        </a>
      ))}
    </nav>
  );
}

/** A breadcrumb trail, as on the frozen mission screen («المشاريع › … › …»). */
export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="مسار التنقّل" className="body-sm muted" style={{ marginBlockEnd: 'var(--s-3)' }}>
      {items.map((c, i) => (
        <span key={i}>
          {i > 0 ? <span aria-hidden="true"> › </span> : null}
          {c.href ? <a className="link" href={c.href}>{c.label}</a> : <span aria-current="page">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}
