'use client';

import { useEffect, useState } from 'react';
import { api, type TrackSkillsPage } from '../../lib/api';
import { useSession, Loading, ErrorBanner, EvidenceState } from '../../components/Session';
import { JourneyNav } from '../../components/JourneyNav';
import { CompanionNudge } from '../../components/CompanionNudge';

/**
 * Skills of the current track (Phase 5). Four dimensions, side by side, never
 * merged: journey · verification level · evidence · readiness contribution.
 * Classification badges show "pending expert validation" until approved; the
 * readiness card shows the neutral owner wording until an approved rule set is active.
 */
const BADGE_AR: Record<string, string> = { must: 'إلزامية', core: 'أساسية', supporting: 'مساندة', pending_expert_validation: 'التصنيف قيد اعتماد الخبراء', disabled: 'غير مفعَّلة' };

export default function SkillsPage() {
  const { token, loading } = useSession();
  const [page, setPage] = useState<TrackSkillsPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void api<TrackSkillsPage>('/me/track-skills', { token }).then(setPage).catch((e) => setError((e as Error).message));
  }, [token]);

  if (loading) return <main className="wrap"><Loading /></main>;
  if (error) return <main className="wrap"><ErrorBanner message={error} /></main>;
  if (!page) return <main className="wrap"><Loading /></main>;
  if (!page.role) {
    return (
      <main className="wrap">
        <h1>مهاراتك</h1>
        <section className="card"><p className="body-sm">لا هدف مهني مؤكَّد بعد. <a className="link" href="/goal">اختاري الدور المستهدف ←</a></p></section>
      </main>
    );
  }
  const r = page.readiness;
  return (
    <main className="wrap">
      <JourneyNav current="/skills" />
      <CompanionNudge token={token} variant="card" />
      <h1>مهارات مسار {page.role.labelAr}</h1>

      <section className="card">
        <h2>الجاهزية</h2>
        <p className="body-sm" style={{ fontWeight: 500 }}>{r.headlineAr}</p>
        {r.status === 'evaluated' ? (
          <p className="body-sm muted">
            القواعد المعتمدة: مستوفاة <span className="num">{r.summary.satisfied}</span> من <span className="num">{r.summary.total}</span>
            {' '}· معيار <span className="term" lang="en">{r.ruleSet?.key}@{r.ruleSet?.version}</span>
          </p>
        ) : r.status === 'pending_validation' && r.ruleSet ? (
          <div className="stack" style={{ gap: 6 }}>
            <p className="micro muted">
              توجد قواعد مسودة <span className="term" lang="en">{r.ruleSet.key}@{r.ruleSet.version}</span> (DRAFT / NOT VALIDATED) تُعرض للاطّلاع فقط — لا نتيجة ولا نسبة قبل اعتمادها.
            </p>
            <div className="rows">
              {r.rules.map((rule) => (
                <div key={rule.ruleId} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <span className="grow body-sm">{rule.labelAr}{rule.nonCompensable ? ' · غير قابلة للتعويض' : ''}</span>
                  <span className="chip">{rule.outcome === 'satisfied' ? 'مستوفاة' : rule.outcome === 'not_satisfied' ? 'غير مستوفاة' : 'غير محدَّدة (تنتظر اعتماد التصنيف)'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <p className="disclaimer">
          الجاهزية تقرير على قواعد مُعدَّة لا حكم على المهارة: لا تغيّر مستوى التحقق لأي مهارة، ومستوى التحقق لا يعني بذاته جاهزية للعمل.
        </p>
      </section>

      <section className="card">
        <h2>من أين أبدأ؟</h2>
        <ol className="body-sm" style={{ margin: 0 }}>
          <li>افتحي أي مهارة لتعرفي معناها، ولماذا يحتاجها الدور، وكيف تبدو في العمل.</li>
          <li>إن كنتِ واثقة منها فانتقلي مباشرة إلى نشاط يتدرّب عليها؛ لا يلزمك أن تتعلّمي أولًا.</li>
          <li>سلّمي عملك في النشاط، فيُقيَّم ويصبح دليلًا مُقيَّمًا إن استوفى المعايير.</li>
        </ol>
        <p className="disclaimer">لا ترتيب إلزاميًا للمهارات: يمكنك البدء بأي نشاط في <a className="link" href="/activities">أنشطة دورك</a>.</p>
      </section>

      <section className="card">
        <h2>المهارات</h2>
        <div className="rows">
          {page.items.map((s) => (
            <a key={s.skillId} className="row" href={`/skills/${s.skillId}`} style={{ gap: 10, flexWrap: 'wrap', textDecoration: 'none' }}>
              <span className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="body-sm" style={{ fontWeight: 500 }}>{s.labelAr}</span>
                {s.explanation?.descriptionAr ? <span className="micro muted">{s.explanation.descriptionAr}</span> : null}
              </span>
              <span className="chip">{BADGE_AR[s.readiness.badge]}</span>
              {s.readiness.classSource === 'po_default' ? <span className="chip chip--attention">تصنيف افتراضي من مالك المنتج، غير معتمد من الخبراء</span> : null}
              <span className="chip chip--info">{s.progress ? s.progress.labelAr : 'لم تبدأ'}</span>
              <EvidenceState state={s.verification.level} />
              <span className="chip">دليل مُقيَّم <span className="num">{s.evidence.standingEvaluatedCount}</span> · ما سلّمتِه <span className="num">{s.evidence.submittedMaterialCount}</span></span>
              {s.explanation ? <span className="chip chip--info">{s.explanation.activityCount === 0 ? 'لا نشاط متاح بعد' : <>تتدرّبين عليها في <span className="num">{s.explanation.activityCount}</span> {s.explanation.activityCount === 1 ? 'نشاط' : 'أنشطة'}</>}</span> : null}
            </a>
          ))}
        </div>
        <p className="disclaimer">
          لكل مهارة أربعة أبعاد منفصلة: حالة الرحلة · مستوى التحقق · الأدلة · مساهمتها في الجاهزية. «لا يوجد دليل مُقيَّم بعد» تعني أن عملك لم يُقيَّم بعد، لا أنك تفتقدين المهارة. التصنيف (إلزامية/أساسية/مساندة) لا يُعرض قبل اعتماده، ويُذكر مصدره حين يكون افتراضيًا من مالك المنتج.
        </p>
      </section>
      <p className="body-sm"><a className="link" href="/activities">← أنشطة دورك</a> · <a className="link" href="/work">أعمالي</a></p>
    </main>
  );
}
