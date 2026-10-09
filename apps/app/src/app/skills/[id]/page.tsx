'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, type TrackSkillDetail } from '../../../lib/api';
import { useSession, Loading, ErrorBanner, EvidenceState } from '../../../components/Session';

/** Skill detail (Phase 5): the four dimensions in four cards; the true state is never softened or merged. */
const BADGE_AR: Record<string, string> = { core: 'أساسية', supporting: 'مساندة', pending_expert_validation: 'التصنيف قيد اعتماد الخبراء', disabled: 'غير مفعَّلة' };
const LEVEL_AR: Record<string, string> = { gap: 'فجوة', self_reported: 'مُعلنة ذاتيًا', practiced: 'ظهرت في مشروع', demonstrated: 'مُثبتة بدليل', verified: 'موثّقة' };

export default function SkillDetailPage() {
  const { token, loading } = useSession();
  const params = useParams<{ id: string }>();
  const [d, setD] = useState<TrackSkillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !params?.id) return;
    void api<TrackSkillDetail>(`/me/track-skills/${params.id}`, { token }).then(setD).catch((e) => setError((e as Error).message));
  }, [token, params?.id]);

  if (loading) return <main className="wrap"><Loading /></main>;
  if (error) return <main className="wrap"><ErrorBanner message={error} /></main>;
  if (!d) return <main className="wrap"><Loading /></main>;
  const s = d.skill;
  return (
    <main className="wrap">
      <p className="body-sm"><a className="link" href="/skills">← مهارات المسار</a></p>
      <h1>{s.labelAr} <span className="term muted" lang="en">{s.labelEn}</span></h1>

      <section className="card">
        <h2>١ · رحلة المهارة</h2>
        <p className="body-sm"><span className="chip chip--info">{s.progress ? s.progress.labelAr : 'لم تبدأ'}</span></p>
        {d.journeyEvents.length ? (
          <div className="rows">
            {d.journeyEvents.slice(0, 6).map((e, i) => (
              <div key={i} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="grow micro muted term" lang="en">{e.trigger}: {e.from} → {e.to ?? '—'} ({e.outcome})</span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="disclaimer">أين أنتِ في العمل على هذه المهارة. إكمال نشاط يحرّك الرحلة ولا يرفع مستوى التحقق.</p>
      </section>

      <section className="card">
        <h2>٢ · مستوى التحقق</h2>
        <div className="row" style={{ gap: 10 }}><EvidenceState state={s.verification.level} /></div>
        {s.verification.stateReason ? <p className="micro muted">{s.verification.stateReason}</p> : null}
        {d.decisions.length ? (
          <div className="rows">
            {d.decisions.slice(0, 5).map((x) => (
              <p key={x.id} className="micro muted">
                قرار <span className="term" lang="en">{x.decision}</span>: {LEVEL_AR[x.previousState] ?? x.previousState} ← {LEVEL_AR[x.resultingState] ?? x.resultingState} · سياسة <span className="term" lang="en">{x.policy}</span>{x.policyResolution === 'legacy_baseline' ? ' (أساس توافق غير مُصادَق عليه)' : ''}
              </p>
            ))}
          </div>
        ) : null}
        <p className="disclaimer">ما أثبته التقييم فقط. لا يُشتق من الرحلة ولا من الجاهزية، ولا يعني بذاته جاهزية للعمل.</p>
      </section>

      <section className="card">
        <h2>٣ · الأدلة</h2>
        <p className="body-sm">دليل مُقيَّم قائم: <span className="num">{s.evidence.standingEvaluatedCount}</span> · مادة مُقدَّمة: <span className="num">{s.evidence.submittedMaterialCount}</span></p>
        {d.materials.length ? (
          <div className="rows">
            {d.materials.slice(0, 8).map((m) => (
              <div key={m.id} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="grow body-sm">{m.title}</span><span className="chip">{m.typeLabelAr}</span>
                {m.attemptNumber > 1 ? <span className="chip chip--info">محاولة <span className="num">{m.attemptNumber}</span></span> : null}
                <span className="chip">{m.status === 'submitted' ? 'مُسجَّلة' : m.status === 'superseded' ? 'استُبدلت' : m.status}</span>
              </div>
            ))}
          </div>
        ) : <p className="body-sm muted">لا مادة مُقدَّمة لهذه المهارة بعد.</p>}
        <p className="disclaimer">المادة المُقدَّمة ليست دليلًا مُقيَّمًا؛ الدليل المُقيَّم ينشأ من التقييم وحده.</p>
      </section>

      <section className="card">
        <h2>٤ · المساهمة في الجاهزية</h2>
        <p className="body-sm"><span className="chip">{BADGE_AR[s.readiness.badge]}</span>
          {s.readiness.category ? <> <span className="chip">{s.readiness.category}</span></> : null}
        </p>
        <p className="body-sm muted">
          المستوى المتوقع: {s.readiness.expectedLevel ? <>{LEVEL_AR[s.readiness.expectedLevel] ?? s.readiness.expectedLevel} {s.readiness.expectedLevelStatus === 'approved' ? '' : '(قيد اعتماد الخبراء)'}</> : 'غير محسوم بعد'}
          {' '}· الاحتساب في الجاهزية: {s.readiness.readinessContribution === 'undecided' ? 'غير محسوم بعد' : s.readiness.readinessContribution === 'counts' ? 'يُحتسب' : 'للاطّلاع'}
        </p>
        {!s.readiness.configured ? <p className="body-sm" style={{ fontWeight: 500 }}>{d.readinessHeadlineAr}</p> : (
          <div className="rows">
            {s.readiness.rulesNamingSkill.length === 0 ? <p className="body-sm muted">لا قاعدة {d.ruleSetValidated ? 'معتمدة' : 'مسودة'} تسمّي هذه المهارة.</p> : s.readiness.rulesNamingSkill.map((r) => (
              <div key={r.ruleId} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="grow body-sm">{r.labelAr}{r.nonCompensable ? ' · غير قابلة للتعويض' : ''}{d.ruleSetValidated ? '' : ' (مسودة)'}</span>
                <span className="chip">{r.outcome === 'satisfied' ? 'مستوفاة' : r.outcome === 'not_satisfied' ? 'غير مستوفاة' : 'غير محدَّدة'}</span>
              </div>
            ))}
          </div>
        )}
        <p className="disclaimer">تظهر هنا قواعد الإعداد التي تسمّي هذه المهارة كما هي؛ لا نسبة ولا حكم قبل اعتماد معيار الجاهزية.</p>
      </section>

      {d.activities.length ? (
        <section className="card">
          <h2>الأنشطة المرتبطة</h2>
          <div className="rows">{d.activities.map((a) => <div key={a.id} className="row" style={{ gap: 10 }}><a className="link grow" href={`/activities/${encodeURIComponent(a.id)}`}>{a.titleAr}</a><span className="chip">{a.depth === 'primary' ? 'رئيسية' : 'مساندة'}</span></div>)}</div>
        </section>
      ) : null}
    </main>
  );
}
