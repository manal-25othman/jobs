'use client';

import Link from 'next/link';
import { useAdmin, AdminShell, Loading, StageChip, ROLE_AR, type AdminRole, type StageView } from './shared';

interface Overview {
  me: { id: string; label: string; roles: AdminRole[] };
  production: boolean;
  kinds: { kind: string; labelAr: string; counts: Record<string, number>; activatable: boolean }[];
  tracks: ({ id: string; slug: string; labelAr: string; labelEn: string; isDemo: boolean } & StageView)[];
  pendingChanges: number;
  pendingExpertDecisions: { key: string; labelAr: string; whereAr: string }[];
  separationAr: string;
}

const COUNT_AR: Record<string, string> = { draft: 'مسودة', pending_review: 'بانتظار المراجعة', approved: 'معتمدة', production_active: 'مفعّلة في الإنتاج' };

/** Admin Track Builder — overview: who I am here, what is pending, and what stays an expert decision. */
export default function AdminOverviewPage() {
  const { data, error, loading } = useAdmin<Overview>('/overview');
  if (loading || (!data && !error)) return <AdminShell title="منشئ المسارات"><Loading /></AdminShell>;
  return (
    <AdminShell title="منشئ المسارات" error={error}>
      {data ? (
        <>
          <section className="card">
            <h2>أدوارك هنا</h2>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {data.me.roles.map((r) => <span key={r} className="chip chip--info">{ROLE_AR[r]}</span>)}
            </div>
            <p className="body-sm">{data.separationAr}</p>
            <p className="body-sm muted">لا أحد يعتمد ما صاغه بنفسه (مبدأ العينين الأربع)، والخادم يتحقق من ذلك وكذلك قاعدة البيانات. البيئة الحالية: {data.production ? 'إنتاج' : 'تطوير'}.</p>
          </section>

          <section className="card">
            <h2>قرارات مهنية معلّقة — لا يحسمها منشئ المسارات</h2>
            <p className="body-sm muted">تُعرض هذه القيم كما هي «بانتظار اعتماد خبير». تعديلها هنا يُنشئ مسودة فقط؛ الاعتماد المهني لخبير مسمّى، والتفعيل لمالك المنتج.</p>
            <ul className="rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.pendingExpertDecisions.map((d) => (
                <li key={d.key} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <span className="grow">{d.labelAr}</span>
                  <span className="body-sm muted">{d.whereAr}</span>
                  <span className="chip chip--attention">بانتظار التحقق</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>الإعدادات المهنية</h2>
            <ul className="rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.kinds.map((k) => (
                <li key={k.kind} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <Link className="link grow" href={`/admin/config/${k.kind}`}>{k.labelAr}</Link>
                  {Object.entries(k.counts).map(([s, n]) => <span key={s} className="chip">{COUNT_AR[s] ?? s}: <span className="num">{n}</span></span>)}
                  {!k.activatable ? <span className="chip chip--attention">تعريف فقط — لا تفعيل</span> : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>المسارات</h2>
            <p className="body-sm muted">تغييرات مهارات المسار المعلّقة: <span className="num">{data.pendingChanges}</span></p>
            <ul className="rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.tracks.map((t) => (
                <li key={t.id} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <Link className="link grow" href={`/admin/tracks/${t.id}`}>{t.labelAr} <span className="term">{t.slug}</span></Link>
                  {t.isDemo ? <span className="chip">بيانات عرض</span> : null}
                  <StageChip s={t} />
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </AdminShell>
  );
}
