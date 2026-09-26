import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

/**
 * Root layout.
 *
 * Arabic and RTL are the default, set here rather than toggled later, because
 * retrofitting direction is how RTL products end up with mirrored bugs. The
 * frozen prototype's §5 rules (logical properties, isolated LTR terms,
 * mirrored progress direction) carry over when the screens are rebuilt.
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
