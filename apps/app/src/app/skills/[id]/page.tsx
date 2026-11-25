'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, type TrackSkillDetail, type LearningPlan, type RecommendedResource } from '../../../lib/api';
import { useSession, Loading, ErrorBanner, EvidenceState } from '../../../components/Session';
import { LEVEL_AR, EVIDENCE_STEPS_AR } from '../../../lib/journey';
import { GuidancePanel } from '../../../components/GuidancePanel';

/**
 * Skill detail. Phase B, package 1: the graduate's six questions first (what it is, why the role needs it, what it
 * looks like at work, what to learn, how to practise, how to demonstrate it) from existing content; then the four
 * dimensions of their own state (Phase 5), in four cards — never softened or merged.
 */
const BADGE_AR: Record<string, string> = { must: 'إلزامية', core: 'أساسية', supporting: 'مساندة', pending_expert_validation: 'التصنيف قيد اعتماد الخبراء', disabled: 'غير مفعَّلة' };

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
      <SkillExplained d={d} token={token} />

      <h2 style={{ marginTop: 8 }}>حالتك في هذه المهارة</h2>
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
        <p className="body-sm">دليل مُقيَّم قائم: <span className="num">{s.evidence.standingEvaluatedCount}</span> · ما سلّمتِه: <span className="num">{s.evidence.submittedMaterialCount}</span></p>
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
        ) : <p className="body-sm muted">لم تسلّمي عملًا لهذه المهارة بعد.</p>}
        <p className="disclaimer">ما تسلّمينه ليس دليلًا مُقيَّمًا بذاته؛ الدليل المُقيَّم ينشأ من التقييم وحده.</p>
      </section>

      <section className="card">
        <h2>٤ · المساهمة في الجاهزية</h2>
        <p className="body-sm"><span className="chip">{BADGE_AR[s.readiness.badge]}</span>
              {s.readiness.classSource === 'po_default' ? <span className="chip chip--attention">تصنيف افتراضي من مالك المنتج، غير معتمد من الخبراء</span> : null}
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

    </main>
  );
}

/** The six graduate questions, answered only from content that exists; a missing answer is said plainly. */
function SkillExplained({ d, token }: { d: TrackSkillDetail; token: string | null }) {
  const x = d.skill.explanation;
  return (
    <>
      <section className="card">
        <h2>ما هذه المهارة؟</h2>
        {x?.descriptionAr ? <p className="body-sm">{x.descriptionAr}</p> : <p className="body-sm muted">لا يوجد وصف لهذه المهارة بعد.</p>}
        <h3 className="body-sm" style={{ fontWeight: 500, margin: '8px 0 4px' }}>لماذا يحتاجها هذا الدور؟</h3>
        {x?.whyRequiredAr ? <p className="body-sm" style={{ margin: 0 }}>{x.whyRequiredAr}</p> : <p className="body-sm muted" style={{ margin: 0 }}>لم يُكتب سبب الحاجة إليها بعد.</p>}
      </section>

      {x && (x.indicatorsAr.length || x.commonMistakesAr.length) ? (
        <section className="card">
          <h2>كيف تبدو في العمل؟</h2>
          {x.indicatorsAr.length ? (
            <>
              <p className="body-sm" style={{ fontWeight: 500, margin: 0 }}>علامات إتقانها</p>
              <ul className="body-sm">{x.indicatorsAr.map((i) => <li key={i}>{i}</li>)}</ul>
            </>
          ) : null}
          {x.commonMistakesAr.length ? (
            <>
              <p className="body-sm" style={{ fontWeight: 500, margin: 0 }}>أخطاء شائعة</p>
              <ul className="body-sm">{x.commonMistakesAr.map((i) => <li key={i}>{i}</li>)}</ul>
            </>
          ) : null}
        </section>
      ) : null}

      <LearningCard plan={d.learning} />
      {token ? (
        <section className="card">
          <h2>مرشد التعلّم</h2>
          <GuidancePanel token={token} capability="learning_guidance" skillId={d.skill.skillId} buttonAr="اقترحي عليّ كيف أتدرّب على هذه المهارة" labelFor={(id) => (id === d.skill.skillId ? d.skill.labelAr : null)} />
        </section>
      ) : null}

      <section className="card">
        <h2>كيف أتدرّب عليها؟</h2>
        {d.activities.length ? (
          <div className="rows">
            {d.activities.map((a) => (
              <div key={a.id} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <a className="link grow" href={`/activities/${encodeURIComponent(a.id)}`}>{a.titleAr}</a>
                <span className="chip">{a.depth === 'primary' ? 'رئيسية' : 'مساندة'}</span>
              </div>
            ))}
          </div>
        ) : <p className="body-sm muted">لا نشاط متاح لهذه المهارة في مسارك بعد.</p>}
        <p className="disclaimer">«رئيسية»: النشاط يقيس هذه المهارة بعمق. «مساندة»: تظهر فيه دون أن تكون محوره.</p>
      </section>

      <section className="card">
        <h2>كيف أُثبتها؟</h2>
        <ol className="body-sm" style={{ margin: 0 }}>{EVIDENCE_STEPS_AR.map((step) => <li key={step}>{step}</li>)}</ol>
      </section>
    </>
  );
}

/**
 * Phase B package 2 — «ماذا أتعلّم وأين؟»: one ranked resource from the registry, its reason, and the practice that
 * must follow (A07, deterministic). An unverified candidate appears only in the internal preview, always labelled.
 */
function LearningCard({ plan }: { plan: LearningPlan | undefined }) {
  return (
    <section className="card" data-testid="learning-card">
      <h2>ماذا أتعلّم وأين؟</h2>
      {plan ? (
        <>
          <p className="body-sm">{plan.need.textAr}</p>
          {plan.candidatePreview ? <p className="body-sm"><span className="chip chip--attention" data-testid="learning-preview-label">معاينة داخلية: موارد مرشّحة غير متحقَّق منها</span></p> : null}
          {plan.resource ? <ResourceItem r={plan.resource} primary /> : null}
          {plan.alternatives.length ? (
            <>
              <p className="body-sm" style={{ fontWeight: 500, margin: '10px 0 4px' }}>بديلان بالترتيب، إن لم يناسبك الأول</p>
              <div className="rows">{plan.alternatives.map((r) => <ResourceItem key={r.id} r={r} />)}</div>
            </>
          ) : null}
          {plan.fallbackAr ? <p className="body-sm muted" data-testid="learning-fallback">{plan.fallbackAr}</p> : null}
          {plan.practice ? (
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }} data-testid="learning-practice">
              <span className="body-sm" style={{ fontWeight: 500 }}>ثم طبّقي:</span>
              <a className="link grow" href={`/activities/${encodeURIComponent(plan.practice.activityId)}`}>{plan.practice.titleAr}</a>
              {!plan.practice.startable ? <span className="chip">غير متاح بعد</span> : null}
            </div>
          ) : null}
          {plan.practice ? <p className="micro muted" style={{ margin: '4px 0 0' }}>{plan.practice.whyAr}</p> : null}
        </>
      ) : <p className="body-sm muted">لا تتوفر توصية تعلّم لهذه المهارة الآن.</p>}
      <p className="disclaimer">التعلّم اختياري ولا يغيّر مستواك: المستوى يثبته التقييم وحده. المورد من سجل منسّق، لا من بحث حر.</p>
    </section>
  );
}

function ResourceItem({ r, primary }: { r: RecommendedResource; primary?: boolean }) {
  return (
    <div className={primary ? 'resource resource--primary' : 'resource'} data-testid="learning-resource" data-exposure={r.exposure}>
      <p className="body-sm" style={{ margin: 0, fontWeight: primary ? 500 : 400 }}>
        {r.url ? <a className="link" href={r.url} target="_blank" rel="noopener noreferrer">{r.titleAr}</a> : r.titleAr}
        {r.provider ? <span className="muted"> · {r.provider}</span> : null}
      </p>
      <p className="micro muted" style={{ margin: '2px 0' }}>
        <span className="chip">{r.typeAr}</span> <span className="chip">{r.languageAr}</span> <span className="chip">{r.costAr}</span> <span className="chip">{r.durationAr}</span>
      </p>
      {r.whyAr ? <p className="body-sm" style={{ margin: '2px 0' }}>لماذا هذا المورد؟ {r.whyAr}</p> : null}
      {r.labelAr ? <p className="micro" style={{ margin: '2px 0' }}><span className="chip chip--attention">{r.labelAr}</span></p> : null}
      <p className="micro muted" style={{ margin: 0 }}>{r.linkStatusAr}{r.url ? ' · يفتح في موقع خارجي' : ''}</p>
    </div>
  );
}
