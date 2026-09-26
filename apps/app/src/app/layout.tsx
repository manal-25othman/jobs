import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './tokens.css';
import './slice.css';

/**
 * Root layout.
 *
 * Arabic and RTL are the default, set here rather than toggled later: the
 * frozen design's §5 rules (logical properties, isolated LTR terms, mirrored
 * progress direction) only hold if direction is the starting point.
 */
export const metadata: Metadata = {
  title: 'نَقْلة · NAQLA',
  description: 'من المهارة إلى الدليل. / From skill to evidence.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
