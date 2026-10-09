'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAdmin, AdminShell, Loading, StageChip, Help, ReasonButton, PendingExpert, ValueInput, show, type RuleHelp, type StageView, type AdminRole } from '../../shared';

interface Skill extends StageView {
  roleRequirementId: string; skillId: string; labelAr: string; labelEn: string; values: Record<string, unknown>; classificationStatus: string; classificationPending: boolean;
}
interface Change extends StageView {
  id: string; roleRequirementId: string; proposed: Record<string, unknown>; base: Record<string, unknown>; professional: boolean; status: string; reason: string;
  draftedBy: string; decidedBy: string | null; decidedRole: string | null; decisionReason: string | null; includedIn: string | null;
}
interface Version extends StageView { id: string; version: number; label: string; appliesSkillConfig: boolean; draftedBy: string | null; inEffect: boolean }
interface Track {
  track: { id: string; slug: string; labelAr: string; labelEn: string; isDemo: boolean } & StageView;
  fieldHelp: Record<string, RuleHelp | null>; skills: Skill[]; changes: Change[]; versions: Version[];
}
interface VersionDiff extends StageView {
  versionId: string; version: number; comparedWith: { id: string | null; version: number | null; resolution: string | null };
  appliesSkillConfig: boolean; impactAr: string; skills: { roleRequirementId: string; labelAr: string | null; fields: { field: string; before: unknown; after: unknown }[] }[];
}

const FIELDS = ['is_core', 'importance', 'expected_level', 'minimum_evidence_count', 'readiness_contribution', 'enabled', 'display_order', 'category'] as const;

/** One track: its skills as they are live, proposed changes, and the versions that carry approved changes into effect. */
export default function TrackPage() {
  const { roleId } = useParams<{ roleId: string }>();
  const { data, error, loading, act } = useAdmin<Track>(`/tracks/${roleId}`);
  const me = useAdmin<{ me: { id: string; roles: AdminRole[] } }>('/overview').data?.me;
  const [editing, setEditing] = useState<{ rr: string; proposed: Record<string, unknown> } | null>(null);
  const [versionSel, setVersionSel] = useState<string | null>(null);
  const vdiff = useAdmin<VersionDiff>(versionSel ? `/track-versions/${versionSel}/diff` : null);
  const has = (r: AdminRole) => me?.roles.includes(r) ?? false;

  if (loading || (!data && !error)) return <AdminShell title="المسار"><Loading /></AdminShell>;
  const label = (rr: string) => data?.skills.find((s) => s.roleRequirementId === rr)?.labelAr ?? rr;

  return (
    <AdminShell title={data ? data.track.labelAr : 'المسار'} error={error ?? vdiff.error}>
      {data ? (
        <>
          <section className="card">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><span className="term">{data.track.slug}</span><StageChip s={data.track} />{data.track.isDemo ? <span className="chip">بيانات عرض</span> : null}</div>
            <p className="body-sm">القيم أدناه هي القيم الحيّة. أي تعديل يُقترح كتغيير منفصل، ويُعتمد (مهنيًا من خبير مسمّى، أو إداريًا لترتيب العرض والفئة)، ثم يُجمَّع في إصدار جديد للمسار لا يسري إلا عند تفعيله من مالك المنتج.</p>
            <p className="body-sm muted">التصنيف «أساسية/داعمة» والأهمية لا يصيران «معتمدين» إلا إذا اعتمد خبير مسمّى التغيير. عتبات الجاهزية غير معتمدة بعد.</p>
          </section>

          <section className="card">
            <h2>مهارات المسار</h2>
            <ul className="rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.skills.map((s) => (
                <li key={s.roleRequirementId} className="stack" style={{ gap: 6 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <strong className="grow" style={{ fontWeight: 500 }}>{s.labelAr} <span className="term">{s.labelEn}</span></strong>
                    {s.classificationPending ? <PendingExpert /> : <span className="chip chip--info">تصنيف معتمد</span>}
                  </div>
                  <span className="body-sm muted">
                    {FIELDS.map((f) => `${data.fieldHelp[f]?.labelAr ?? f}: ${show(s.values[f])}`).join(' · ')}
                  </span>
                  {has('track_admin') ? <button className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing({ rr: s.roleRequirementId, proposed: {} })}>اقتراح تغيير</button> : null}
                  {editing?.rr === s.roleRequirementId ? (
                    <div className="stack" style={{ gap: 10 }}>
                      {FIELDS.map((f) => (
                        <div key={f} className="field">
                          <Help help={data.fieldHelp[f]} />
                          <label className="check-row"><input type="checkbox" checked={f in editing.proposed} onChange={(e) => {
                            const p = { ...editing.proposed }; if (e.target.checked) p[f] = s.values[f]; else delete p[f]; setEditing({ ...editing, proposed: p });
                          }} /><span className="body-sm">اقتراح تغيير هذا الحقل</span></label>
                          {f in editing.proposed ? <ValueInput field={f} value={editing.proposed[f]} onChange={(v) => setEditing({ ...editing, proposed: { ...editing.proposed, [f]: v } })} /> : null}
                        </div>
                      ))}
                      <div className="row" style={{ gap: 8 }}>
                        <ReasonButton label="حفظ الاقتراح كمسودة" kind="primary" onSubmit={async (reason) => {
                          const r = await act(`/tracks/${roleId}/skill-changes`, { roleRequirementId: s.roleRequirementId, proposed: editing.proposed, reason }); if (r) setEditing(null);
                        }} />
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditing(null)}>إلغاء</button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>التغييرات المقترحة</h2>
            {data.changes.length === 0 ? <p className="body-sm muted">لا تغييرات.</p> : null}
            <ul className="rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.changes.map((c) => (
                <li key={c.id} className="stack" style={{ gap: 6 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <strong className="grow" style={{ fontWeight: 500 }}>{label(c.roleRequirementId)}</strong>
                    <span className={c.professional ? 'chip chip--attention' : 'chip'}>{c.professional ? 'مهني — يعتمده خبير' : 'إداري — عرض فقط'}</span>
                    <StageChip s={c} />
                  </div>
                  {Object.keys(c.proposed).map((f) => (
                    <span key={f} className="body-sm">{data.fieldHelp[f]?.labelAr ?? f}: <span className="term">{show(c.base[f])}</span> ← <span className="term">{show(c.proposed[f])}</span></span>
                  ))}
                  <span className="body-sm muted">السبب: {c.reason}{c.decisionReason ? ` · القرار: ${c.decisionReason}` : ''}</span>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {c.status === 'draft' && c.draftedBy === me?.id ? <ReasonButton label="إرسال للمراجعة" onSubmit={(reason) => act(`/skill-changes/${c.id}/pending_review`, { reason })} /> : null}
                    {['draft', 'pending_review'].includes(c.status) && c.draftedBy === me?.id ? <ReasonButton label="سحب" kind="ghost" onSubmit={(reason) => act(`/skill-changes/${c.id}/withdrawn`, { reason })} /> : null}
                    {c.status === 'pending_review' && (c.professional ? has('sme') : has('sme') || has('product_owner')) ? (
                      <>
                        <ReasonButton label={c.professional ? 'اعتماد مهني' : 'اعتماد'} kind="primary" onSubmit={(reason) => act(`/skill-changes/${c.id}/approved`, { reason })} />
                        <ReasonButton label="رفض" kind="ghost" onSubmit={(reason) => act(`/skill-changes/${c.id}/rejected`, { reason })} />
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {has('track_admin') && data.changes.some((c) => c.status === 'approved')
              ? <ReasonButton label="بناء إصدار جديد للمسار من التغييرات المعتمدة" kind="primary" onSubmit={(reason) => act(`/tracks/${roleId}/versions`, { label: '', reason })} /> : null}
          </section>

          <section className="card">
            <h2>إصدارات إعداد المسار</h2>
            <ul className="rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.versions.map((v) => (
                <li key={v.id} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => setVersionSel(v.id)}><span className="num">v{v.version}</span> · {v.label}</button>
                  <span className="grow" />
                  {v.appliesSkillConfig ? <span className="chip">يغيّر قيم المهارات</span> : null}
                  {v.inEffect ? <span className="chip chip--success">الساري الآن</span> : null}
                  <StageChip s={v} />
                </li>
              ))}
            </ul>
            {versionSel && vdiff.data && vdiff.data.versionId === versionSel ? (() => {
              const v = data.versions.find((x) => x.id === versionSel)!;
              const d = vdiff.data;
              return (
                <div className="stack" style={{ gap: 8 }}>
                  <h3 style={{ fontWeight: 500, margin: 0 }}>معاينة الإصدار <span className="num">v{d.version}</span></h3>
                  <p className="body-sm muted">{d.comparedWith.version ? `مقارنةً بالإصدار الساري v${d.comparedWith.version}` : 'مقارنةً بالقيم الحيّة'} · {d.impactAr}</p>
                  {d.skills.length === 0 ? <p className="body-sm muted">لا فروق في قيم المهارات.</p> : null}
                  {d.skills.map((s) => (
                    <div key={s.roleRequirementId} className="stack" style={{ gap: 2 }}>
                      <strong style={{ fontWeight: 500 }}>{s.labelAr}</strong>
                      {s.fields.map((f) => <span key={f.field} className="body-sm">{data.fieldHelp[f.field]?.labelAr ?? (f.field === 'classification_status' ? 'حالة التصنيف' : f.field)}: <span className="term">{show(f.before)}</span> ← <span className="term">{show(f.after)}</span></span>)}
                    </div>
                  ))}
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {has('track_admin') && v.stage === 'draft' && !v.annotation ? <ReasonButton label="إرسال للمراجعة" onSubmit={(reason) => act(`/track-versions/${v.id}/submit`, { reason })} /> : null}
                    {has('sme') && v.stage === 'pending_review' ? (
                      <>
                        <ReasonButton label="اعتماد مهني" kind="primary" onSubmit={(reason) => act(`/track-versions/${v.id}/validate`, { decision: 'approve', reason })} />
                        <ReasonButton label="إعادة للتعديل" onSubmit={(reason) => act(`/track-versions/${v.id}/validate`, { decision: 'needs_revision', reason })} />
                      </>
                    ) : null}
                    {has('product_owner') && v.stage === 'approved' ? <ReasonButton label="تفعيل في الإنتاج" kind="primary" confirmAr={d.impactAr} onSubmit={(reason) => act(`/track-versions/${v.id}/activate`, { activation: 'production_active', reason })} /> : null}
                  </div>
                </div>
              );
            })() : versionSel ? <Loading /> : null}
          </section>
        </>
      ) : null}
    </AdminShell>
  );
}
