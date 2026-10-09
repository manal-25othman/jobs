'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAdmin, AdminShell, Loading, StageChip, Help, ReasonButton, DiffTable, ValueInput, show, type RuleHelp, type StageView, type FieldDiff, type AdminRole } from '../../shared';

interface Item extends StageView {
  id: string; family: string; key: string; version: number; reviewStatus: string; activation: string; baselineOf: string | null;
  approvedBy: string | null; draftedBy: string | null; inEffect: boolean; validationNote: string | null; values: Record<string, unknown>;
}
interface List { kind: string; labelAr: string; activatable: boolean; editable: string[]; help: Record<string, RuleHelp>; items: Item[] }
type Row = Record<string, unknown>;
interface Diff extends StageView {
  id: string; version: number; comparedWith: { id: string; version: number; basis: 'in_effect' | 'previous_version'; resolution: string | null } | null;
  fields: FieldDiff[]; children: { added: Row[]; removed: Row[]; changed: { before: Row; after: Row }[] } | null; rows: Row[] | null; childrenHelp: RuleHelp | null;
}

const CONSTRAINT_AR: Record<string, string> = {
  core_skill_count: 'عدد المهارات الأساسية للدور', task_count: 'عدد مهام المسار', activity_count: 'عدد أنشطة المسار', activity_primary_skill_count: 'المهارات المقيسة بعمق في كل نشاط',
  activity_core_primary_skill_count: 'المهارات الأساسية المقيسة بعمق في كل نشاط', rubric_min_criteria: 'أدنى عدد معايير في الرُبريك', resources_per_skill_max: 'أقصى موارد تعلّم لكل فجوة',
};
const FIELD_AR: Record<string, string> = {
  constraint_type: 'القيد', min_value: 'الحد الأدنى', max_value: 'الحد الأقصى', track_id: 'نطاق المسار (فارغ = كل المسارات)',
  description_en: 'وصف داخلي (إنجليزي)', label_ar: 'الاسم بالعربية', label_en: 'الاسم بالإنجليزية', intro_ar: 'مقدّمة الاستبيان', lock_until_grounded: 'إخفاء حتى يُتحقق من الصياغة',
  challenge_types: 'أنواع التحدي', max_challenges: 'أقصى عدد تحديات', timing: 'التوقيت', difficulty: 'الصعوبة', skill_ids: 'المهارات', trigger_rule: 'شرط التشغيل (تعريف فقط)',
  language: 'اللغة', cls: 'الصنف', form: 'الصيغة', rule_type: 'نوع القاعدة', params: 'المعاملات', skill_id: 'المهارة', enabled: 'مفعّلة', position: 'الترتيب',
  key: 'المفتاح', prompt_ar: 'السؤال بالعربية', prompt_en: 'السؤال بالإنجليزية', help_ar: 'توضيح', answer_type: 'نوع الإجابة', options: 'الخيارات', required: 'إلزامي',
  show_if: 'يظهر إذا', maps_to: 'يرتبط بـ',
};
const RULE_TYPE_AR: Record<string, string> = {
  required_skill_at_level: 'مهارة مطلوبة عند مستوى (إلزامية)', non_compensable_skill: 'مهارة غير قابلة للتعويض', min_skills_at_level: 'عدد أدنى من المهارات عند مستوى',
  all_core_skills_at_level: 'كل المهارات الأساسية عند مستوى',
};
const LEXICON_CLASS_AR: Record<string, string> = {
  framing: 'صياغة إطارية', action: 'فعل مسنود بسجل', skill_verb: 'فعل مهارة', evaluation_term: 'مصطلح تقييم', technology_term: 'تقنية', context_term: 'سياق',
  detect_outcome: 'كشف: نتيجة/أثر', detect_professional: 'كشف: خبرة مهنية', detect_credential: 'كشف: شهادة', detect_quality: 'كشف: وصف جودة',
};
const BASIS_AR = { in_effect: 'مقارنةً بالإصدار الساري', previous_version: 'لا إصدار ساريًا لهذه العائلة — مقارنةً بالإصدار السابق' };

function childLabel(r: Row): string {
  if (r['cls']) return `${r['language'] === 'ar' ? 'عربي' : 'إنجليزي'} · ${LEXICON_CLASS_AR[String(r['cls'])] ?? r['cls']} · «${String(r['form'])}»`;
  if (r['constraint_type']) return `${CONSTRAINT_AR[String(r['constraint_type'])] ?? r['constraint_type']}: ${r['min_value'] ?? '—'} – ${r['max_value'] ?? '—'}`;
  if (r['rule_type']) return `${RULE_TYPE_AR[String(r['rule_type'])] ?? r['rule_type']} — ${String(r['label_ar'] ?? '')} ${show(r['params'])}`;
  return `${String(r['prompt_ar'] ?? r['key'] ?? '')}`;
}

/** One configuration kind: its versions, a diff preview, a no-JSON draft editor, and the acts each role may take. */
export default function ConfigKindPage() {
  const { kind } = useParams<{ kind: string }>();
  const { data, error, loading, act } = useAdmin<List>(`/config/${kind}`);
  const me = useAdmin<{ me: { roles: AdminRole[] } }>('/overview').data?.me;
  const [selected, setSelected] = useState<string | null>(null);
  const diff = useAdmin<Diff>(selected ? `/config/${kind}/${selected}/diff` : null);
  const [draft, setDraft] = useState<{ baseId: string; changes: Record<string, unknown>; rows: Row[] | null } | null>(null);
  const has = (r: AdminRole) => me?.roles.includes(r) ?? false;

  if (loading || (!data && !error)) return <AdminShell title="الإعدادات"><Loading /></AdminShell>;
  const sel = data?.items.find((i) => i.id === selected) ?? null;
  const d = diff.data && diff.data.id === selected ? diff.data : null;

  return (
    <AdminShell title={data?.labelAr ?? 'الإعدادات'} error={error ?? diff.error}>
      {data ? (
        <>
          <section className="card">
            <h2>ما الذي تضبطه هذه الإعدادات</h2>
            {Object.entries(data.help).map(([k, h]) => <Help key={k} help={h} />)}
            {!data.activatable ? <div className="banner banner--attention">التعريف يُحفظ ويُراجَع فقط. التفعيل غير متاح في هذه المرحلة، والخادم يرفضه.</div> : null}
            <p className="body-sm muted">المراحل: مسودة ← بانتظار المراجعة ← معتمدة (خبير مسمّى) ← مفعّلة في الإنتاج (مالك المنتج). أي تعديل ينشئ إصدارًا جديدًا؛ الإصدار المفعَّل لا يُعدَّل.</p>
          </section>

          <section className="card">
            <h2>الإصدارات</h2>
            <ul className="rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.items.map((i) => (
                <li key={i.id} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => { setSelected(i.id); setDraft(null); }} aria-pressed={selected === i.id}>
                    {i.family} · <span className="num">v{i.version}</span>
                  </button>
                  <span className="grow" />
                  {i.inEffect ? <span className="chip chip--success">السارية الآن</span> : null}
                  <StageChip s={i} />
                </li>
              ))}
            </ul>
          </section>

          {sel ? (
            <section className="card">
              <h2>{sel.family} · <span className="num">v{sel.version}</span></h2>
              <StageChip s={sel} />
              {sel.validationNote ? <p className="body-sm muted">{sel.validationNote}</p> : null}
              <h3 style={{ fontWeight: 500, margin: 0 }}>معاينة الفروق قبل الاعتماد أو التفعيل</h3>
              {d ? (
                <>
                  <p className="body-sm muted">{d.comparedWith ? `${BASIS_AR[d.comparedWith.basis]} (v${d.comparedWith.version})` : 'لا إصدار للمقارنة — كل الحقول جديدة.'}</p>
                  <DiffTable fields={d.fields} />
                  {d.children ? (
                    <div className="stack" style={{ gap: 6 }}>
                      <Help help={d.childrenHelp} />
                      <span className="body-sm">أُضيف: <span className="num">{d.children.added.length}</span> · حُذف: <span className="num">{d.children.removed.length}</span> · تغيّر: <span className="num">{d.children.changed.length}</span></span>
                      <ul className="body-sm" style={{ margin: 0 }}>
                        {d.children.added.map((r, n) => <li key={`a${n}`}>+ {childLabel(r)}</li>)}
                        {d.children.removed.map((r, n) => <li key={`r${n}`}>− {childLabel(r)}</li>)}
                        {d.children.changed.map((c, n) => <li key={`c${n}`}>~ {childLabel(c.before)} ← {childLabel(c.after)}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : <Loading />}

              <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {has('track_admin') ? <button className="btn btn--secondary btn--sm" onClick={() => setDraft({ baseId: sel.id, changes: {}, rows: d?.rows ? d.rows.map((r) => ({ ...r })) : null })}>مسودة جديدة من هذا الإصدار</button> : null}
                {has('track_admin') && sel.activation === 'inactive' && ['draft', 'needs_revision'].includes(sel.reviewStatus)
                  ? <ReasonButton label="إرسال للمراجعة" onSubmit={(reason) => act(`/config/${kind}/${sel.id}/submit`, { reason })} /> : null}
                {has('sme') && ['curated', 'sme_reviewed'].includes(sel.reviewStatus) ? (
                  <>
                    <ReasonButton label="اعتماد مهني" kind="primary" confirmAr="اعتمادك المهني يُسجَّل باسمك. لا يمكنك اعتماد ما صغته بنفسك." onSubmit={(reason) => act(`/config/${kind}/${sel.id}/validate`, { decision: 'approve', reason })} />
                    <ReasonButton label="إعادة للتعديل" onSubmit={(reason) => act(`/config/${kind}/${sel.id}/validate`, { decision: 'needs_revision', reason })} />
                    <ReasonButton label="رفض" kind="ghost" onSubmit={(reason) => act(`/config/${kind}/${sel.id}/validate`, { decision: 'reject', reason })} />
                  </>
                ) : null}
                {has('product_owner') && data.activatable && sel.reviewStatus === 'approved' && sel.activation !== 'production_active'
                  ? <ReasonButton label="تفعيل في الإنتاج" kind="primary" confirmAr="يحلّ محل الإصدار الساري في المعاملة نفسها، ويُعاد فحص البنود المعتمدة عند الحاجة." onSubmit={(reason) => act(`/config/${kind}/${sel.id}/activate`, { activation: 'production_active', reason })} /> : null}
                {has('product_owner') && data.activatable && sel.activation === 'inactive' && sel.reviewStatus !== 'rejected'
                  ? <ReasonButton label="تفعيل لبيئة التطوير فقط" onSubmit={(reason) => act(`/config/${kind}/${sel.id}/activate`, { activation: 'development_only', reason })} /> : null}
                {has('product_owner') && ['production_active', 'development_only'].includes(sel.activation)
                  ? <ReasonButton label="إيقاف" kind="ghost" onSubmit={(reason) => act(`/config/${kind}/${sel.id}/activate`, { activation: 'inactive', reason })} /> : null}
              </div>
            </section>
          ) : null}

          {draft ? (
            <section className="card">
              <h2>مسودة جديدة</h2>
              <p className="body-sm muted">لا يتغيّر الإصدار الأصلي. تُحفظ المسودة غير مفعّلة، وتحتاج مراجعة خبير ثم تفعيلًا من مالك المنتج.</p>
              {data.editable.map((f) => {
                const base = data.items.find((i) => i.id === draft.baseId)?.values[f];
                const cur = f in draft.changes ? draft.changes[f] : base;
                return (
                  <div key={f} className="field">
                    {data.help[`${data.kind}.${f}`] ? <Help help={data.help[`${data.kind}.${f}`]} /> : <span className="field__label">{FIELD_AR[f] ?? f}</span>}
                    <ValueInput field={f} value={cur} onChange={(v) => setDraft({ ...draft, changes: { ...draft.changes, [f]: v } })} />
                  </div>
                );
              })}
              {draft.rows ? (
                <div className="stack" style={{ gap: 8 }}>
                  <h3 style={{ fontWeight: 500, margin: 0 }}>العناصر</h3>
                  <ul className="rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {draft.rows.map((r, n) => (
                      <li key={n} className="stack" style={{ gap: 6 }}>
                        <span className="body-sm">{childLabel(r)}</span>
                        {Object.keys(r).filter((f) => r['cls'] !== undefined || !['key', 'position', 'rule_type', 'skill_id', 'answer_type'].includes(f)).map((f) => (
                          <label key={f} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                            <span className="body-sm muted" style={{ minWidth: 140 }}>{FIELD_AR[f] ?? f}</span>
                            <span className="grow"><ValueInput field={f} value={r[f]} onChange={(v) => { const rows = [...draft.rows!]; rows[n] = { ...r, [f]: v }; setDraft({ ...draft, rows }); }} /></span>
                          </label>
                        ))}
                        <button className="btn btn--ghost btn--sm" onClick={() => setDraft({ ...draft, rows: draft.rows!.filter((_, i) => i !== n) })}>حذف من المسودة</button>
                      </li>
                    ))}
                  </ul>
                  {data.kind === 'grounding_lexicon'
                    ? <button className="btn btn--secondary btn--sm" onClick={() => setDraft({ ...draft, rows: [...draft.rows!, { language: 'ar', cls: 'framing', form: '' }] })}>إضافة مفردة</button> : null}
                </div>
              ) : null}
              <div className="row" style={{ gap: 10 }}>
                <ReasonButton label="حفظ المسودة" kind="primary" onSubmit={async (reason) => {
                  const r = await act(`/config/${kind}/draft`, { baseId: draft.baseId, changes: draft.changes, children: draft.rows, reason }) as { id: string } | null;
                  if (r) { setDraft(null); setSelected(r.id); }
                }} />
                <button className="btn btn--ghost btn--sm" onClick={() => setDraft(null)}>إلغاء</button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </AdminShell>
  );
}
