'use client';

import { useEffect, useState } from 'react';
import { api, type CareerSnapshot, type TrackSkillsPage } from '../../lib/api';
import { useSession, Loading, ErrorBanner } from '../../components/Session';
import { JourneyNav } from '../../components/JourneyNav';
import { GuidancePanel } from '../../components/GuidancePanel';

/**
 * Phase B package 5 — the Career Snapshot (FR-U-014, A02, deterministic): one page with the strengths, at most three
 * gaps and the one next step (A01), every statement tagged with the record it comes from. Then the career guidance
 * capability on request (test provider only). Nothing here grants a level or judges readiness.
 */
const SOURCE_AR: Record<string, string> = {
  career_goal: 'المصدر: هدفك المهني', skill_claim: 'المصدر: سجل التحقق', role_requirement: 'المصدر: متطلبات الدور', project: 'المصدر: أعمالك',
  evaluation: 'المصدر: نتيجة التقييم', agent_proposal: 'المصدر: اقتراح ينتظرك', activity_catalogue: 'المصدر: أنشطة دورك', self_assessment: 'المصدر: تقييمك الذاتي',
};

export default function SnapshotPage() {
  const { token, loading } = useSession();
  const [s, setS] = useState<CareerSnapshot | null>(null);
  const [skills, setSkills] = useState<TrackSkillsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    void api<CareerSnapshot>('/me/career-snapshot', { token }).then(setS).catch((e) => setError((e as Error).message));
    void api<TrackSkillsPage>('/me/track-skills', { token }).then(setSkills).catch(() => setSkills(null));
  }, [token]);
  if (loading) return <main className="wrap"><Loading /></main>;
  if (error) return <main className="wrap"><ErrorBanner message={error} /></main>;
  if (!s || !token) return <main className="wrap"><Loading /></main>;
  const labelFor = (id: string) => skills?.items.find((x) => x.skillId === id)?.labelAr ?? null;
  const Source = ({ x }: { x: { source: string } }) => <span className="micro muted" data-testid="statement-source">{SOURCE_AR[x.source] ?? x.source}</span>;
  return (
    <main className="wrap">
      <JourneyNav current="/snapshot" />
      <h1>لقطة مساري</h1>
      <p className="body-sm muted">صفحة واحدة: ما أثبتِّه، وأين الفجوات، وخطوتك التالية. كل عبارة تذكر مصدرها.</p>

      <section className="card" data-testid="snapshot-role">
        <h2>الدور المستهدف</h2>
        {s.role ? <p className="body-sm" style={{ margin: 0 }}>{s.role.textAr} <Source x={s.role} /></p> : <p className="body-sm">لم تختاري دورًا بعد. <a className="link" href="/goal">اختاري هدفك المهني</a></p>}
      </section>

      <section className="card" data-testid="snapshot-strengths">
        <h2>نقاط القوة المُثبتة</h2>
        {s.strengths.length ? <ul className="body-sm">{s.strengths.map((x) => <li key={x.sourceRef}>{x.textAr} <Source x={x} /></li>)}</ul>
          : <p className="body-sm muted">لا توجد بعد. نقطة القوة هنا مهارة أثبتها دليل مُقيَّم.</p>}
      </section>

      <section className="card" data-testid="snapshot-gaps">
        <h2>ثلاث فجوات</h2>
        <p className="micro muted">{s.gapOrderAr}</p>
        <ul className="body-sm">{s.gaps.map((x) => <li key={x.sourceRef}><a className="link" href={`/skills/${x.sourceRef}`}>{x.textAr}</a> <Source x={x} /></li>)}</ul>
      </section>

      <section className="card" data-testid="snapshot-self">
        <h2>تقديرك الذاتي</h2>
        <p className="micro muted">تقدير ذاتي لا يُحتسب دليلًا ولا نقطة قوة، ولا يظهر لغيرك.</p>
        {s.selfAssessed.length ? <ul className="body-sm">{s.selfAssessed.map((x) => <li key={x.sourceRef}>{x.textAr} <Source x={x} /></li>)}</ul>
          : <p className="body-sm muted">لم تقيّمي نفسك بعد.</p>}
        <a className="link" href="/self-assessment">قيّمي نفسك</a>
      </section>

      <section className="card" data-testid="snapshot-next">
        <h2>خطوتك التالية</h2>
        <p className="body-sm" style={{ fontWeight: 500, margin: 0 }}>{s.nextStep.textAr} <Source x={s.nextStep} /></p>
        <p className="micro muted">{s.nextStep.whyAr}</p>
        <a className="link" href={s.nextStep.href}>انتقلي إليها</a>
      </section>

      <section className="card">
        <h2>إرشاد مهني</h2>
        <GuidancePanel token={token} capability="career_guidance" buttonAr="اشرحي لي وضعي وخطوتي التالية" labelFor={labelFor} />
      </section>

      <ul className="disclaimer">{s.limitsAr.map((l) => <li key={l}>{l}</li>)}</ul>
    </main>
  );
}
