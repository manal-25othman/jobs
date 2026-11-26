/**
 * Phase B, package 5 — ONE next step (A01, FR-A-009) and the Career Snapshot (A02, FR-U-014), deterministic.
 *
 * A01 "explains and does not plan": it turns the graduate's CURRENT state into one action, says why, and names the
 * record it read. It never assigns an activity (when no work is under way it points to the role's catalogue, where
 * the graduate chooses), never changes a goal, never evaluates and never changes a level.
 *
 * The snapshot shows strengths, at most three gaps and the same next step; EVERY statement carries the source it
 * comes from. A gap exists only for a requirement of the role (FR-A-001). Gaps are never ranked by a priority nobody
 * approved: an expert-approved class orders them when one is in effect; otherwise the role's recorded order is used and
 * said to be no priority.
 */
import type { WorkStatus } from './activity-catalogue.js';

/* ───────────────────────── the action for one piece of work ───────────────────────── */

/** The next action for a piece of work (the single rule; the app's work list and activity pages use it too). */
export function workNextAction(p: { readonly projectId: string; readonly workStatus: string; readonly latestSubmissionId: string | null }): { labelAr: string; href: string } {
  const work = `/work/${encodeURIComponent(p.projectId)}`;
  const evaluation = p.latestSubmissionId ? `/evaluation?submission=${encodeURIComponent(p.latestSubmissionId)}` : null;
  switch (p.workStatus) {
    case 'in_progress': return { labelAr: 'تابعي العمل', href: work };
    case 'submitted':
    case 'evaluation_failed': return evaluation ? { labelAr: 'افتحي صفحة التقييم', href: evaluation } : { labelAr: 'تابعي العمل', href: work };
    case 'evaluation_running':
    case 'under_human_review': return { labelAr: 'اطّلعي على حالة التقييم', href: evaluation ?? work };
    case 'blocked_by_checks': return { labelAr: 'اقرئي ما ينقص', href: evaluation ?? work };
    case 'level_recorded': return { labelAr: 'اطّلعي على النتيجة', href: evaluation ?? work };
    default: return { labelAr: 'اقرئي الملاحظات', href: evaluation ?? work };
  }
}

/* ───────────────────────────────── A01: one next step ───────────────────────────────── */

export type GuidanceSource = 'career_goal' | 'project' | 'evaluation' | 'agent_proposal' | 'activity_catalogue' | 'skill_claim' | 'role_requirement' | 'self_assessment';

export interface WorkItem {
  readonly projectId: string;
  readonly title: string;
  readonly workStatus: WorkStatus | string;
  readonly latestSubmissionId: string | null;
  readonly updatedAt: string;
}

export interface NextStepInput {
  readonly hasGoal: boolean;
  readonly roleAvailable: boolean;
  readonly work: readonly WorkItem[];
  /** Proposals awaiting the graduate (validated or awaiting_user), newest first. */
  readonly pendingProposals: readonly { readonly id: string; readonly textAr: string }[];
  readonly startableActivityCount: number;
}

export interface NextStep {
  readonly code: 'choose_goal' | 'role_unavailable' | 'act_on_feedback' | 'continue_work' | 'review_proposal' | 'wait_for_review' | 'choose_activity' | 'no_activity_available' | 'review_results';
  readonly textAr: string;
  readonly whyAr: string;
  readonly href: string;
  readonly source: GuidanceSource;
  readonly sourceRef: string | null;
  readonly agent: 'A01';
}

const byRecent = (a: WorkItem, b: WorkItem) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.projectId.localeCompare(b.projectId));

export function nextStep(s: NextStepInput): NextStep {
  const A01 = { agent: 'A01' as const };
  if (!s.hasGoal) return { ...A01, code: 'choose_goal', textAr: 'اختاري هدفك المهني', whyAr: 'لا هدف مهنيًا مسجّلًا بعد؛ كل ما بعده يُبنى عليه.', href: '/goal', source: 'career_goal', sourceRef: null };
  if (!s.roleAvailable) return { ...A01, code: 'role_unavailable', textAr: 'راجعي هدفك المهني', whyAr: 'الدور الذي اخترتِه غير متاح الآن؛ أعمالك السابقة محفوظة.', href: '/goal', source: 'career_goal', sourceRef: null };
  const work = [...s.work].sort(byRecent);
  const needsYou = work.find((w) => ['blocked_by_checks', 'evaluation_failed', 'submitted'].includes(w.workStatus));
  if (needsYou) {
    const a = workNextAction(needsYou);
    return { ...A01, code: 'act_on_feedback', textAr: `${a.labelAr}: «${needsYou.title}»`, whyAr: 'عمل سلّمتِه ينتظر خطوة منك قبل أن يتقدّم.', href: a.href, source: 'evaluation', sourceRef: needsYou.projectId };
  }
  const inProgress = work.find((w) => w.workStatus === 'in_progress');
  if (inProgress) {
    const a = workNextAction(inProgress);
    return { ...A01, code: 'continue_work', textAr: `${a.labelAr}: «${inProgress.title}»`, whyAr: 'لديك عمل بدأتِه ولم تسلّميه بعد؛ مسودتك محفوظة.', href: a.href, source: 'project', sourceRef: inProgress.projectId };
  }
  const proposal = s.pendingProposals[0];
  if (proposal) return { ...A01, code: 'review_proposal', textAr: proposal.textAr, whyAr: 'اقتراح جاهز ينتظر معاينتك؛ لا يُعتمد شيء دون موافقتك.', href: `/proposals?focus=${encodeURIComponent(proposal.id)}`, source: 'agent_proposal', sourceRef: proposal.id };
  const ready = work.find((w) => ['feedback_ready', 'level_recorded', 'pending_validation'].includes(w.workStatus));
  const waiting = work.find((w) => ['under_human_review', 'evaluation_running'].includes(w.workStatus));
  if (s.startableActivityCount > 0 && !ready) {
    return { ...A01, code: 'choose_activity', textAr: 'اختاري نشاطًا من أنشطة دورك',
      whyAr: waiting ? 'عملك الآخر قيد المراجعة؛ يمكنك البدء بنشاط آخر في أثناء ذلك. الاختيار لك، ولا ترتيب إلزاميًا.' : 'لا عمل جاريًا الآن. الأنشطة هي الطريق إلى دليل مُقيَّم، والاختيار لك.',
      href: '/activities', source: 'activity_catalogue', sourceRef: null };
  }
  if (ready) {
    const a = workNextAction(ready);
    return { ...A01, code: 'review_results', textAr: `${a.labelAr}: «${ready.title}»`, whyAr: 'نتيجة عمل جاهزة، وفيها ملاحظات لكل معيار.', href: a.href, source: 'evaluation', sourceRef: ready.projectId };
  }
  if (waiting) {
    const a = workNextAction(waiting);
    return { ...A01, code: 'wait_for_review', textAr: `${a.labelAr}: «${waiting.title}»`, whyAr: 'عملك قيد التقييم؛ لا خطوة مطلوبة منك الآن.', href: a.href, source: 'project', sourceRef: waiting.projectId };
  }
  return { ...A01, code: 'no_activity_available', textAr: 'اطّلعي على مهارات دورك', whyAr: 'لا نشاط متاح للبدء الآن في دورك.', href: '/skills', source: 'activity_catalogue', sourceRef: null };
}

/* ───────────────────────────── A02: the Career Snapshot (FR-U-014) ───────────────────────────── */

export interface SnapshotSkill {
  readonly skillId: string;
  readonly labelAr: string;
  /** The verification level (skill_claim): gap | practiced | demonstrated | verified. */
  readonly level: string;
  readonly standingEvaluatedCount: number;
  /** An expert-approved professional class in effect, else null. */
  readonly approvedClass: 'must' | 'core' | 'supporting' | null;
  readonly roleOrder: number;
  /** FR-U-013: the graduate's latest self-rating, in Arabic, if any — shown apart, never a strength or a level. */
  readonly selfRatingAr?: string | null;
}

export interface SourcedStatement { readonly textAr: string; readonly source: GuidanceSource; readonly sourceRef: string | null }

export interface CareerSnapshot {
  readonly kind: 'CareerSnapshot';
  readonly agent: 'A02';
  readonly mode: 'deterministic';
  readonly role: SourcedStatement | null;
  readonly strengths: readonly SourcedStatement[];
  readonly gaps: readonly SourcedStatement[];
  /** FR-U-013 / BR-001: self-assessments, labelled as such; Observed only, never strengths. */
  readonly selfAssessed: readonly SourcedStatement[];
  readonly gapOrderAr: string;
  readonly nextStep: NextStep;
  readonly limitsAr: readonly string[];
  /**
   * A02 template phrasing (FR-A-001 fallback; plan §2 row 4): ONE paragraph built only from the facts above — the role,
   * the evaluated strengths, the first gap in the stated order, the next step. Self-assessment is never phrased as a
   * strength; no level or readiness is stated. Model phrasing replaces this only after OPEN-023.
   */
  readonly summaryAr: string;
}

/** The A02 template. Pure: the same snapshot facts always give the same text. */
export function snapshotSummaryAr(p: { readonly role: SourcedStatement | null; readonly strengths: readonly SourcedStatement[]; readonly gaps: readonly SourcedStatement[]; readonly nextStep: NextStep }): string {
  if (!p.role) return `لم تختاري دورًا مهنيًا بعد، فلا يمكن تشخيص الفجوات. الخطوة التالية: ${p.nextStep.textAr}`;
  const strip = (t: string) => t.split('»')[0]!.replace('«', '');
  const strengths = p.strengths.length === 0 ? 'لا توجد بعد مهارة مُثبتة بدليل مُقيَّم'
    : `مهارات مُثبتة بدليل مُقيَّم: ${p.strengths.length}${p.strengths.length ? ` (${p.strengths.slice(0, 2).map((s) => `«${strip(s.textAr)}»`).join('، ')})` : ''}`;
  const gap = p.gaps[0] ? `أول مهارة بلا دليل مُقيَّم في الترتيب المعروض: «${strip(p.gaps[0].textAr)}»` : 'لا فجوات ظاهرة في مهارات الدور المسجّلة';
  return `هدفك: ${p.role.textAr}. ${strengths}. ${gap}. الخطوة التالية: ${p.nextStep.textAr}`;
}

const CLASS_RANK: Record<string, number> = { must: 0, core: 1, supporting: 2 };

export function careerSnapshot(input: { readonly roleLabelAr: string | null; readonly roleId: string | null; readonly skills: readonly SnapshotSkill[]; readonly nextStep: NextStep }): CareerSnapshot {
  const strengths = input.skills
    .filter((s) => (s.level === 'demonstrated' || s.level === 'verified') && s.standingEvaluatedCount > 0)
    .map((s) => ({ textAr: `«${s.labelAr}»: ${s.level === 'verified' ? 'مُتحقَّق منها' : 'مُثبتة بدليل مُقيَّم'} (دليل مُقيَّم: ${s.standingEvaluatedCount})`, source: 'skill_claim' as const, sourceRef: s.skillId }));
  const open = input.skills.filter((s) => s.level !== 'demonstrated' && s.level !== 'verified');
  const classed = open.length > 0 && open.every((s) => s.approvedClass !== null);
  const ordered = [...open].sort((a, b) => classed
    ? (CLASS_RANK[a.approvedClass!]! - CLASS_RANK[b.approvedClass!]!) || a.roleOrder - b.roleOrder
    : a.roleOrder - b.roleOrder);
  const gaps = ordered.slice(0, 3).map((s) => ({
    textAr: `«${s.labelAr}»: ${s.level === 'practiced' ? 'مارستِها ولم يُثبتها دليل مُقيَّم بعد' : 'لا دليل مُقيَّم بعد'}`, source: 'role_requirement' as const, sourceRef: s.skillId }));
  const limitsAr: string[] = [];
  if (!classed && open.length > 3) limitsAr.push(`هذه أول ثلاث مهارات بلا دليل مُقيَّم بترتيب الدور، وليست أولوية معتمدة: تصنيف الأهمية لم يعتمده خبير بعد. المهارات الأخرى بلا دليل: ${open.length - 3}.`);
  if (strengths.length === 0) limitsAr.push('لا نقاط قوة مُثبتة بعد: نقطة القوة هنا مهارة أثبتها دليل مُقيَّم، لا تقييم ذاتي.');
  limitsAr.push('اللقطة لا تمنح مستوى ولا تحكم بالجاهزية للعمل.');
  return {
    kind: 'CareerSnapshot', agent: 'A02', mode: 'deterministic',
    role: input.roleLabelAr ? { textAr: input.roleLabelAr, source: 'career_goal', sourceRef: input.roleId } : null,
    strengths, gaps,
    selfAssessed: input.skills.filter((s) => s.selfRatingAr).map((s) => ({ textAr: `«${s.labelAr}»: قدّرتِها «${s.selfRatingAr}»`, source: 'self_assessment' as const, sourceRef: s.skillId })),
    gapOrderAr: classed ? 'مرتّبة حسب تصنيف معتمد من الخبراء' : 'بترتيب الدور كما سُجّل، لا أولوية معتمدة',
    nextStep: input.nextStep, limitsAr,
    summaryAr: snapshotSummaryAr({ role: input.roleLabelAr ? { textAr: input.roleLabelAr, source: 'career_goal', sourceRef: input.roleId } : null, strengths, gaps, nextStep: input.nextStep }),
  };
}
