'use client';

import { useState } from 'react';
import { useAdmin, AdminShell, Loading, StageChip, Help, ReasonButton, PendingExpert, ValueInput, show, type RuleHelp, type StageView, type AdminRole } from '../shared';

interface Criterion { id: string; key: string; nameAr: string; nameEn: string; weight: string | null; weightStatus: string; threshold: string | null; thresholdStatus: string | null; mandatory: boolean; maxScore: string; valuesPending: boolean }
interface Rubric extends StageView { id: string; version: number; isDemo: boolean; reviewStatus: string; editable: boolean; passThreshold: string | null; passThresholdStatus: string; valuesApprovedBy: string | null; valuesApprovedAt: string | null; criteria: Criterion[] }
interface Deliverable { id: string; key: string; format: string; mandatory: boolean; descriptionAr: string; descriptionEn: string }
interface Activity extends StageView { id: string; slug: string; version: string; titleAr: string; titleEn: string; isDemo: boolean; reviewStatus: string; editable: boolean; deliverables: Deliverable[]; rubrics: Rubric[] }
interface Skill extends StageView { id: string; slug: string; labelAr: string; labelEn: string; isDemo: boolean; reviewStatus: string }
interface Content { help: Record<'weight' | 'threshold' | 'mandatory', RuleHelp>; skills: Skill[]; activities: Activity[] }

const VALUE_AR: Record<string, string> = { proposed: 'مقترحة', approved: 'معتمدة', draft: 'مسودة' };

/** Review buttons offered for the caller's roles; the API (domain rule + database guard) decides. */
function ReviewActions({ kind, id, status, isDemo, roles, act }: { kind: string; id: string; status: string; isDemo: boolean; roles: AdminRole[]; act: (p: string, b: unknown) => Promise<unknown> }) {
  const go = (to: string) => (reason: string) => act('/content/review', { entityKind: kind, id, to, reason });
  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      {roles.includes('track_admin') && ['draft', 'needs_revision', 'rejected'].includes(status) ? <ReasonButton label="إرسال للمراجعة" onSubmit={go('curated')} /> : null}
      {roles.includes('sme') && !isDemo && status === 'curated' ? <ReasonButton label="مراجعة مهنية" kind="primary" onSubmit={go('sme_reviewed')} /> : null}
      {roles.includes('sme') && !isDemo && status === 'sme_reviewed' ? <ReasonButton label="اعتماد مهني" kind="primary" onSubmit={go('approved')} /> : null}
      {roles.includes('sme') && ['curated', 'sme_reviewed', 'approved'].includes(status) ? <ReasonButton label="إعادة للتعديل" onSubmit={go('needs_revision')} /> : null}
      {roles.includes('sme') && ['curated', 'sme_reviewed'].includes(status) ? <ReasonButton label="رفض" kind="ghost" onSubmit={go('rejected')} /> : null}
      {roles.includes('product_owner') && status === 'approved' ? <ReasonButton label="نشر" kind="primary" confirmAr="النشر يستبدل الإصدار المنشور السابق." onSubmit={go('published')} /> : null}
      {isDemo && roles.includes('sme') ? <span className="body-sm muted">بيانات العرض لا تُعتمد مهنيًا أبدًا.</span> : null}
    </div>
  );
}

/** Career content: new skills, unpublished deliverables and rubric criteria, and their review — all through the existing review workflow. */
export default function ContentPage() {
  const { data, error, loading, act } = useAdmin<Content>('/content');
  const roles = useAdmin<{ me: { roles: AdminRole[] } }>('/overview').data?.me.roles ?? [];
  const [newSkill, setNewSkill] = useState<{ slug: string; labelAr: string; labelEn: string } | null>(null);
  const [edit, setEdit] = useState<{ kind: 'activity_deliverable' | 'rubric_criterion'; id: string; changes: Record<string, unknown>; base: Record<string, unknown> } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  if (loading || (!data && !error)) return <AdminShell title="المحتوى المهني"><Loading /></AdminShell>;

  const editor = (fields: string[]) => edit ? (
    <div className="stack" style={{ gap: 8 }}>
      {fields.map((f) => (
        <div key={f} className="field">
          {f === 'weight' ? <Help help={data?.help.weight} /> : f === 'threshold_for_skill' ? <Help help={data?.help.threshold} /> : f === 'mandatory' ? <Help help={data?.help.mandatory} /> : <span className="field__label">{f}</span>}
          <ValueInput field={f} value={f in edit.changes ? edit.changes[f] : edit.base[f]} onChange={(v) => setEdit({ ...edit, changes: { ...edit.changes, [f]: v } })} />
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <ReasonButton label="حفظ" kind="primary" confirmAr={edit.kind === 'rubric_criterion' ? 'تعديل وزن أو عتبة يعيد القيم إلى «مقترحة» حتى يعتمدها خبير آخر.' : undefined}
          onSubmit={async (reason) => { const r = await act('/content/edit', { kind: edit.kind, id: edit.id, changes: edit.changes, reason }); if (r) setEdit(null); }} />
        <button className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>إلغاء</button>
      </div>
    </div>
  ) : null;

  return (
    <AdminShell title="المحتوى المهني" error={error}>
      {data ? (
        <>
          <section className="card">
            <p className="body-sm">المحتوى المنشور مجمَّد. يُعدَّل المحتوى غير المنشور فقط (مسودة، أو ما أعاده خبير للتعديل). الأوزان والعتبات تبقى «مقترحة» حتى يعتمدها خبير مسمّى غير من عدّلها.</p>
          </section>

          <section className="card">
            <h2>المهارات</h2>
            <ul className="rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.skills.map((s) => (
                <li key={s.id} className="stack" style={{ gap: 6 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span className="grow">{s.labelAr} <span className="term">{s.slug}</span></span>
                    {s.isDemo ? <span className="chip">بيانات عرض</span> : null}
                    <StageChip s={s} />
                  </div>
                  <ReviewActions kind="skill" id={s.id} status={s.reviewStatus} isDemo={s.isDemo} roles={roles} act={act} />
                </li>
              ))}
            </ul>
            {roles.includes('track_admin') ? (newSkill ? (
              <div className="stack" style={{ gap: 8 }}>
                <label className="field"><span className="field__label">المعرّف (بالإنجليزية)</span><input className="input" value={newSkill.slug} onChange={(e) => setNewSkill({ ...newSkill, slug: e.target.value })} /></label>
                <label className="field"><span className="field__label">الاسم بالعربية</span><input className="input" value={newSkill.labelAr} onChange={(e) => setNewSkill({ ...newSkill, labelAr: e.target.value })} /></label>
                <label className="field"><span className="field__label">الاسم بالإنجليزية</span><input className="input" value={newSkill.labelEn} onChange={(e) => setNewSkill({ ...newSkill, labelEn: e.target.value })} /></label>
                <ReasonButton label="إنشاء كمسودة" kind="primary" onSubmit={async (reason) => { const r = await act('/content/skills', { ...newSkill, reason }); if (r) setNewSkill(null); }} />
              </div>
            ) : <button className="btn btn--secondary btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setNewSkill({ slug: '', labelAr: '', labelEn: '' })}>مهارة جديدة (مسودة)</button>) : null}
          </section>

          <section className="card">
            <h2>الأنشطة ومعايير التقييم</h2>
            <ul className="rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.activities.map((a) => (
                <li key={a.id} className="stack" style={{ gap: 8 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn--ghost btn--sm" onClick={() => setOpen(open === a.id ? null : a.id)}>{a.titleAr}</button>
                    <span className="term grow">{a.slug} · {a.version}</span>
                    {a.isDemo ? <span className="chip">بيانات عرض</span> : null}
                    <StageChip s={a} />
                  </div>
                  {open === a.id ? (
                    <div className="stack" style={{ gap: 10 }}>
                      <ReviewActions kind="activity_spec" id={a.id} status={a.reviewStatus} isDemo={a.isDemo} roles={roles} act={act} />
                      <h3 style={{ fontWeight: 500, margin: 0 }}>المخرجات المطلوبة</h3>
                      {a.deliverables.map((d) => (
                        <div key={d.id} className="stack" style={{ gap: 4 }}>
                          <span className="body-sm">{d.descriptionAr} <span className="term">{d.key}</span> {d.mandatory ? <span className="chip">إلزامي</span> : null}</span>
                          {a.editable && roles.includes('track_admin') && edit?.id !== d.id
                            ? <button className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ kind: 'activity_deliverable', id: d.id, changes: {}, base: { description_ar: d.descriptionAr, description_en: d.descriptionEn, mandatory: d.mandatory } })}>تعديل</button> : null}
                          {edit?.id === d.id ? editor(['description_ar', 'description_en', 'mandatory']) : null}
                        </div>
                      ))}
                      {!a.editable ? <span className="body-sm muted">النشاط في مرحلة «{a.stageAr}»: لا يُعدَّل إلا بعد إعادته للتعديل.</span> : null}
                      {a.rubrics.map((r) => (
                        <div key={r.id} className="stack" style={{ gap: 8 }}>
                          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                            <h3 className="grow" style={{ fontWeight: 500, margin: 0 }}>معيار التقييم <span className="num">v{r.version}</span></h3>
                            <StageChip s={r} />
                          </div>
                          <span className="body-sm">عتبة النجاح: <span className="num">{show(r.passThreshold)}</span> ({VALUE_AR[r.passThresholdStatus] ?? r.passThresholdStatus})
                            {r.valuesApprovedBy ? ` · اعتمد القيم: ${r.valuesApprovedBy}` : ''}</span>
                          {r.criteria.map((x) => (
                            <div key={x.id} className="stack" style={{ gap: 4 }}>
                              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                                <span className="grow body-sm">{x.nameAr} <span className="term">{x.key}</span></span>
                                <span className="body-sm">الوزن <span className="num">{show(x.weight)}</span> · العتبة <span className="num">{show(x.threshold)}</span></span>
                                {x.valuesPending ? <PendingExpert /> : <span className="chip chip--info">قيم معتمدة</span>}
                              </div>
                              {r.editable && roles.includes('track_admin') && edit?.id !== x.id
                                ? <button className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ kind: 'rubric_criterion', id: x.id, changes: {}, base: { name_ar: x.nameAr, weight: x.weight === null ? null : Number(x.weight), threshold_for_skill: x.threshold === null ? null : Number(x.threshold), mandatory: x.mandatory } })}>تعديل</button> : null}
                              {edit?.id === x.id ? editor(['name_ar', 'weight', 'threshold_for_skill', 'mandatory']) : null}
                            </div>
                          ))}
                          <ReviewActions kind="rubric_version" id={r.id} status={r.reviewStatus} isDemo={r.isDemo} roles={roles} act={act} />
                          {roles.includes('sme') && !r.isDemo && r.criteria.some((x) => x.valuesPending) && ['curated', 'sme_reviewed', 'approved'].includes(r.reviewStatus)
                            ? <ReasonButton label="اعتماد الأوزان والعتبات" kind="primary" confirmAr="اعتماد مهني باسمك لأوزان هذا المعيار وعتباته. لا يمكنك اعتماد قيم عدّلتها بنفسك." onSubmit={(reason) => act(`/content/rubrics/${r.id}/approve-values`, { reason })} /> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </AdminShell>
  );
}
