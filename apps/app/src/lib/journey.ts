/**
 * Graduate activity journey (Phase 2) — presentation rules only.
 *
 * Everything here turns what the API ALREADY decided into words and actions.
 * Nothing here decides a level, an evaluation or an access right:
 *   - which activities exist for a graduate is decided by the database (D-119);
 *   - what an activity can do for a level is the API's derived `assessment`;
 *   - whether a level changed is the verification decision (D-118), read from
 *     `workStatus === 'level_recorded'` with a `transition` — never inferred here.
 *
 * Self-contained (no imports) so it is unit-tested directly with node --test.
 */

export type WorkStatus =
  | 'in_progress' | 'submitted' | 'evaluation_running' | 'evaluation_failed' | 'under_human_review'
  | 'blocked_by_checks' | 'pending_validation' | 'level_recorded' | 'feedback_ready';
export type AssessmentMode = 'human_reviewed' | 'formative_only' | 'automated_verified';
export type Tone = 'success' | 'info' | 'attention' | 'neutral';

/** The chip class for a tone, from the frozen component set. */
export function chipClass(tone: Tone): string {
  return tone === 'success' ? 'chip chip--success' : tone === 'info' ? 'chip chip--info' : tone === 'attention' ? 'chip chip--attention' : 'chip';
}

/* ───────────────────────────── evidence levels ───────────────────────────── */

export const LEVEL_AR: Readonly<Record<string, string>> = {
  gap: 'فجوة', self_reported: 'مُعلنة ذاتيًا', practiced: 'ظهرت في مشروع', demonstrated: 'مُثبتة بدليل', verified: 'موثّقة',
};

/* ─────────────────────────── what an activity can do ─────────────────────────── */

export interface AssessmentCopy { chipAr: string; tone: Tone; explanationAr: string }

/**
 * What the graduate is told about how their work on this activity is assessed. Derived only from the API's
 * `assessment` and `isDemo`; a mode the API does not report as able to support a level is never described as one.
 */
export function assessmentCopy(a: { mode: AssessmentMode; evaluable: boolean; canSupportLevel: boolean }, isDemo: boolean): AssessmentCopy {
  if (isDemo) {
    return { chipAr: 'تجريبي — غير مراجَع', tone: 'attention',
      explanationAr: 'نشاط تجريبي للتعرّف على طريقة العمل. يُسجَّل عملك وتصلك ملاحظات عليه، لكنه لا يرفع مستوى أي مهارة.' };
  }
  if (!a.evaluable) {
    return { chipAr: 'للتعلّم فقط', tone: 'neutral',
      explanationAr: 'لا توجد معايير تقييم منشورة لهذا النشاط بعد. يُسجَّل عملك في سجلّك، دون نتيجة تقييم.' };
  }
  if (a.mode === 'human_reviewed' && a.canSupportLevel) {
    return { chipAr: 'يُراجَع بشريًا', tone: 'success',
      explanationAr: 'بعد التسليم تُجرى فحوص آلية للتأكد من اكتمال المطلوب، ثم يراجع عملك مراجِعٌ مختص وفق معايير اعتمدها خبراء. '
        + 'إن استوفى عملك المعايير قد يرتفع مستوى المهارة إلى «مُثبتة بدليل». لا يُمنح مستوى «موثّقة» تلقائيًا.' };
  }
  // formative_only — and `automated_verified`, which the API never returns, is treated the same way here.
  return { chipAr: 'للتعلّم — لا يرفع المستوى حاليًا', tone: 'info',
    explanationAr: 'تصلك ملاحظات على عملك ويُسجَّل في سجلّك، لكن مستوى المهارة لا يتغيّر من هذا النشاط حاليًا: '
      + 'معاييره بانتظار اعتماد الخبراء أو تحقّق مستقل.' };
}

/** The one sentence every activity page carries: submitting is not earning a level. */
export const SUBMISSION_IS_NOT_A_LEVEL_AR =
  'تسليم العمل يسجّله ويمنحك ملاحظات، ولا يرفع مستوى المهارة وحده. يرتفع المستوى فقط حين يتحقّق منه تقييم مستقل — مراجعة بشرية بمعايير معتمدة — ويُظهر ذلك قرار التحقق.';

export const AI_USAGE_AR: Readonly<Record<string, string>> = {
  ai_prohibited: 'استخدام أدوات الذكاء الاصطناعي غير مسموح في هذا النشاط',
  ai_assisted: 'أدوات الذكاء الاصطناعي مسموحة للمساعدة، مع الإفصاح عن طريقة استخدامها',
  ai_expected: 'يُتوقَّع استخدام أدوات الذكاء الاصطناعي، مع الإفصاح عن طريقة استخدامها',
};

export const LEVEL_OF_ACTIVITY_AR: Readonly<Record<string, string>> = { junior: 'مبتدئ', mid: 'متوسط', senior: 'متقدّم' };

/* ───────────────────────────── work status ───────────────────────────── */

export const WORK_STATUS_COPY: Readonly<Record<WorkStatus, { labelAr: string; tone: Tone }>> = {
  in_progress: { labelAr: 'قيد العمل — لم يُسلَّم بعد', tone: 'neutral' },
  submitted: { labelAr: 'سُلِّم — لم يُقيَّم بعد', tone: 'info' },
  evaluation_running: { labelAr: 'التقييم جارٍ', tone: 'info' },
  evaluation_failed: { labelAr: 'تعذّر التقييم — يمكن إعادة المحاولة', tone: 'attention' },
  under_human_review: { labelAr: 'بانتظار المراجعة البشرية', tone: 'info' },
  blocked_by_checks: { labelAr: 'يحتاج استكمالًا', tone: 'attention' },
  pending_validation: { labelAr: 'قُيِّم — المستوى بانتظار تحقق مستقل', tone: 'info' },
  level_recorded: { labelAr: 'قُيِّم — تغيّر مستوى المهارة', tone: 'success' },
  feedback_ready: { labelAr: 'قُيِّم — الملاحظات جاهزة', tone: 'neutral' },
};

export function workStatusCopy(s: string): { labelAr: string; tone: Tone } {
  return WORK_STATUS_COPY[s as WorkStatus] ?? { labelAr: 'حالة غير معروفة', tone: 'neutral' };
}

/** "Completed work" — work that has an assessment result. Distinct from a level change, which only `level_recorded` is. */
export function isAssessedWork(s: string): boolean {
  return s === 'pending_validation' || s === 'level_recorded' || s === 'feedback_ready' || s === 'blocked_by_checks';
}

/** The next available action for a piece of work. Every target is a page that re-reads authoritative state. */
export function nextActionFor(p: { projectId: string; workStatus: string; latestSubmissionId: string | null }): { labelAr: string; href: string } {
  const evaluation = p.latestSubmissionId ? `/evaluation?submission=${encodeURIComponent(p.latestSubmissionId)}` : null;
  switch (p.workStatus) {
    case 'in_progress': return { labelAr: 'تابعي العمل', href: `/work/${encodeURIComponent(p.projectId)}` };
    case 'submitted':
    case 'evaluation_failed': return evaluation ? { labelAr: 'افتحي صفحة التقييم', href: evaluation } : { labelAr: 'تابعي العمل', href: `/work/${encodeURIComponent(p.projectId)}` };
    case 'evaluation_running':
    case 'under_human_review': return { labelAr: 'اطّلعي على حالة التقييم', href: evaluation ?? `/work/${encodeURIComponent(p.projectId)}` };
    case 'blocked_by_checks': return { labelAr: 'اقرئي ما ينقص', href: evaluation ?? `/work/${encodeURIComponent(p.projectId)}` };
    case 'level_recorded': return { labelAr: 'اطّلعي على النتيجة', href: evaluation ?? `/work/${encodeURIComponent(p.projectId)}` };
    default: return { labelAr: 'اقرئي الملاحظات', href: evaluation ?? `/work/${encodeURIComponent(p.projectId)}` };
  }
}

/* ───────────────────────────── evaluation page ───────────────────────────── */

export type EvaluationPageState =
  | 'not_evaluated' | 'evaluation_pending' | 'evaluation_failed' | 'human_review_pending'
  | 'needs_more_evidence' | 'pending_validation' | 'completed_level' | 'completed_feedback';

/** Which of the evaluation page's states to show, from the read view only. */
export function evaluationPageState(v: { state: string; workStatus: string; outcome: string | null }): EvaluationPageState {
  if (v.state === 'not_evaluated') return 'not_evaluated';
  switch (v.workStatus) {
    case 'evaluation_running': return 'evaluation_pending';
    case 'evaluation_failed': return 'evaluation_failed';
    case 'under_human_review': return 'human_review_pending';
    case 'blocked_by_checks': return 'needs_more_evidence';
    case 'pending_validation': return 'pending_validation';
    case 'level_recorded': return 'completed_level';
    default: return v.outcome === 'below_threshold' ? 'needs_more_evidence' : 'completed_feedback';
  }
}

/**
 * O-1 (ENG-1 P0): why a completed evaluation recorded no level, when the reason is attribution, in plain Arabic.
 * Never says a skill was failed: the work WAS assessed (criterion by criterion); no level moved because a
 * whole-activity result cannot yet be attributed to one skill. Null when there is nothing to explain.
 */
export type LevelAttribution = 'attributed' | 'ambiguous' | 'no_candidate' | 'per_skill' | null | undefined;
export function attributionNoticeAr(a: LevelAttribution, page: EvaluationPageState): { titleAr: string; bodyAr: string; noteAr: string } | null {
  if (a !== 'ambiguous' && a !== 'no_candidate') return null;
  if (page === 'human_review_pending') {
    return { titleAr: '', bodyAr: '', noteAr: a === 'ambiguous'
      ? 'لأنك اخترتِ أكثر من مهارة رئيسية لهذا العمل، لن يُسجَّل مستوى لأي مهارة من هذا التقييم حتى بعد اكتمال المراجعة. ستصلك الملاحظات على كل معيار.'
      : 'المهارات التي اخترتِها ليست من المهارات الرئيسية التي يقيسها هذا النشاط، فلن يُسجَّل لها مستوى من هذا التقييم حتى بعد اكتمال المراجعة. ستصلك الملاحظات على كل معيار.' };
  }
  if (page !== 'completed_feedback' && page !== 'needs_more_evidence') return null;
  const assessed = 'اكتمل النشاط وقُيِّم عملك على كل معيار — الملاحظات أدناه.';
  return a === 'ambiguous'
    ? { titleAr: 'اكتمل التقييم — ولم يُسجَّل مستوى لأي مهارة', bodyAr: assessed,
        noteAr: 'اخترتِ أكثر من مهارة رئيسية لهذا العمل، والمنصّة لا تسجّل بعدُ نتيجة مستقلة لكل مهارة من تقييم واحد، لذلك لم يتغيّر مستوى أي منها. هذا ليس إخفاقًا في أي مهارة، ومستوياتك تبقى كما هي.' }
    : { titleAr: 'اكتمل التقييم — ولم يُسجَّل مستوى لأي مهارة', bodyAr: assessed,
        noteAr: 'المهارات التي اخترتِها ليست من المهارات الرئيسية التي يقيسها هذا النشاط، لذلك لا يُنسب إليها مستوى من هذا التقييم. هذا ليس إخفاقًا فيها، ومستوياتك تبقى كما هي.' };
}

/**
 * A level change to show, or null. Shown ONLY when the API reports a recorded level change AND carries the
 * transition read from the decision that made it. Verified is never shown as a level change (production ceiling).
 */
export function levelChangeToShow(v: { workStatus: string; transition: { from: string; to: string; evidenceId: string } | null }):
  { fromAr: string; toAr: string; to: string; evidenceId: string } | null {
  if (v.workStatus !== 'level_recorded' || !v.transition) return null;
  if (v.transition.to !== 'practiced' && v.transition.to !== 'demonstrated') return null;
  return { fromAr: LEVEL_AR[v.transition.from] ?? v.transition.from, toAr: LEVEL_AR[v.transition.to] ?? v.transition.to, to: v.transition.to, evidenceId: v.transition.evidenceId };
}

/** A criterion's result in words. */
export function criterionResult(score: number, max: number): { labelAr: string; tone: Tone } {
  if (max > 0 && score >= max) return { labelAr: 'مستوفى', tone: 'success' };
  if (score > 0) return { labelAr: 'مستوفى جزئيًا', tone: 'info' };
  return { labelAr: 'غير مستوفى بعد', tone: 'attention' };
}

/* ───────────────────────── per-skill results (ENG-1 P5, development pathway) ───────────────────────── */

/**
 * One assessed skill, as the API's additive `skills[]` reports it. Only what the graduate may see: the skill's own
 * criteria by NAME and status — never thresholds, rubric levels, descriptors, checks or reviewer notes.
 */
export interface SkillResultView {
  skillId: string; skillLabelAr: string | null; outcome: string; currentState: string;
  criteria: { key: string; nameAr: string | null; status: string; evaluatorKind?: string }[];
  decision: { decision: string; previousState: string; resultingState: string } | null;
  evidence: { id: string; withdrawn: boolean } | null;
}

/** Whether this evaluation carries per-skill results. A legacy evaluation (every real user today) carries none. */
export function hasPerSkillResults(v: { skills?: readonly unknown[] | null }): boolean {
  return Array.isArray(v.skills) && v.skills.length > 0;
}

/**
 * What the ASSESSMENT found for one skill, in words a learner can act on. This is never a level: whether the level
 * changed is `skillLevelLine`, read from the verification decision. `not_assessed`, `blocked` and `incomplete` are
 * never described as a failure.
 */
export function skillOutcomeCopy(s: Pick<SkillResultView, 'outcome' | 'criteria'>): { labelAr: string; tone: Tone; explanationAr: string } {
  switch (s.outcome) {
    case 'met':
      return { labelAr: 'استوفت معاييرها', tone: 'success', explanationAr: 'استوفى عملك كل معايير هذه المهارة كما قرّرها التقييم.' };
    case 'not_met':
      return { labelAr: 'لم تُستوفَ معاييرها بعد', tone: 'attention',
        explanationAr: 'معيار واحد على الأقل من معايير هذه المهارة لم يُستوفَ في هذا العمل. هذه نتيجة هذا العمل وحده، ومستواك فيها لا ينزل.' };
    case 'incomplete':
      return s.criteria.some((c) => c.status === 'pending')
        ? { labelAr: 'بانتظار المراجِع', tone: 'info', explanationAr: 'يقرّر مراجِع مختص معايير هذه المهارة؛ تظهر نتيجتها حين يكتمل قراره.' }
        : { labelAr: 'لم تُحسم — بانتظار اعتماد الخبراء', tone: 'info',
            explanationAr: 'قُيِّمت معايير هذه المهارة، لكن حدّ الاستيفاء الخاص بها لم يعتمده الخبراء بعد، فلا تُحسم نتيجتها ولا يُسجَّل لها مستوى. هذا ليس إخفاقًا.' };
    case 'not_assessed':
      return { labelAr: 'لم تُقيَّم في هذا النشاط', tone: 'neutral',
        explanationAr: 'لا يقيس هذا النشاط هذه المهارة بمعيار خاص بها، لذلك لم تُقيَّم هنا. هذا ليس إخفاقًا، ومستواك فيها كما هو.' };
    case 'blocked':
      return { labelAr: 'لم تُقيَّم — ينقص العمل ما يلزم', tone: 'attention',
        explanationAr: 'لم يكتمل فحص عام للعمل كله، فلم تُقيَّم أي مهارة منه. أكملي ما ينقص ثم أعيدي التسليم. هذا ليس حكمًا على المهارة.' };
    default:
      return { labelAr: 'نتيجة غير معروفة', tone: 'neutral', explanationAr: 'لم نتمكّن من عرض نتيجة هذه المهارة.' };
  }
}

/** A criterion of ONE skill, in words. */
export function skillCriterionCopy(status: string): { labelAr: string; tone: Tone } {
  switch (status) {
    case 'met': return { labelAr: 'مستوفى', tone: 'success' };
    case 'not_met': return { labelAr: 'غير مستوفى بعد', tone: 'attention' };
    case 'pending': return { labelAr: 'بانتظار المراجِع', tone: 'info' };
    case 'threshold_unapproved': return { labelAr: 'الحدّ بانتظار الاعتماد', tone: 'info' };
    default: return { labelAr: 'غير محسوم', tone: 'neutral' };
  }
}

export type SkillLevelKind = 'raised' | 'raised_withdrawn' | 'reestablished' | 'corroborated' | 'pending_validation' | 'unchanged' | 'not_decided';

/**
 * What the VERIFICATION DECISION did to this skill's level — separate from the assessment outcome. A level change is
 * shown only when the decision recorded one with evidence; Verified is never shown as granted (production ceiling).
 */
export function skillLevelLine(s: Pick<SkillResultView, 'decision' | 'evidence' | 'currentState'> & Partial<Pick<SkillResultView, 'outcome' | 'criteria'>>):
  { kind: SkillLevelKind; labelAr: string; tone: Tone; evidenceId: string | null; to: string | null } {
  const d = s.decision;
  if (s.outcome === 'incomplete' && (s.criteria ?? []).some((c) => c.status === 'pending')) {
    return { kind: 'not_decided', labelAr: 'لا يُحسم المستوى قبل اكتمال المراجعة', tone: 'neutral', evidenceId: null, to: null };
  }
  if (!d) return { kind: 'not_decided', labelAr: 'لم يُتَّخذ قرار بشأن المستوى بعد', tone: 'neutral', evidenceId: null, to: null };
  const moved = d.decision !== 'assessment_pending_validation' && d.resultingState !== d.previousState && !!s.evidence
    && (d.resultingState === 'practiced' || d.resultingState === 'demonstrated');
  if (moved && s.evidence!.withdrawn) {
    return { kind: 'raised_withdrawn', labelAr: `سُجِّل مستوى «${LEVEL_AR[d.resultingState] ?? d.resultingState}» ثم سُحب دليله`, tone: 'attention', evidenceId: null, to: d.resultingState };
  }
  if (moved) {
    return { kind: 'raised', labelAr: `تغيّر المستوى: ${LEVEL_AR[d.previousState] ?? d.previousState} ← ${LEVEL_AR[d.resultingState] ?? d.resultingState}`, tone: 'success', evidenceId: s.evidence!.id, to: d.resultingState };
  }
  if (d.decision === 'evidence_reestablished' && s.evidence && !s.evidence.withdrawn) {
    return { kind: 'reestablished', labelAr: `أُعيد تثبيت دليل مستواك «${LEVEL_AR[d.resultingState] ?? d.resultingState}»`, tone: 'info', evidenceId: s.evidence.id, to: d.resultingState };
  }
  if (d.decision === 'evidence_corroborated' && s.evidence && !s.evidence.withdrawn) {
    // ENG-1 P4 (development pathway): an independent task on a skill already at this level — supporting evidence, no level change.
    return { kind: 'corroborated', labelAr: `لم يتغيّر المستوى «${LEVEL_AR[d.resultingState] ?? d.resultingState}» — سُجِّل دليل داعم إضافي`, tone: 'info', evidenceId: null, to: null };
  }
  if (d.decision === 'assessment_pending_validation') {
    return { kind: 'pending_validation', labelAr: 'المستوى بانتظار تحقق مستقل', tone: 'info', evidenceId: null, to: null };
  }
  return { kind: 'unchanged', labelAr: `لم يتغيّر المستوى بهذا التقييم (${LEVEL_AR[d.resultingState] ?? d.resultingState})`, tone: 'neutral', evidenceId: null, to: null };
}

/** The headline over the per-skill list. Counts only what the decisions recorded; never infers from the activity's result. */
export function perSkillSummaryAr(skills: readonly Pick<SkillResultView, 'decision' | 'evidence' | 'currentState' | 'outcome' | 'criteria'>[]):
  { titleAr: string; bodyAr: string; raised: number; total: number } {
  const raised = skills.filter((s) => skillLevelLine(s).kind === 'raised').length;
  const awaiting = skills.some((s) => s.outcome === 'incomplete' && s.criteria.some((c) => c.status === 'pending'));
  const titleAr = awaiting ? 'نتيجة كل مهارة — بعضها بانتظار المراجعة'
    : raised > 0 ? `تغيّر مستوى ${raised} من ${skills.length} ${skills.length === 1 ? 'مهارة' : 'مهارات'}`
    : 'قُيِّمت كل مهارة على حدة — ولم يتغيّر مستوى أي منها';
  return { titleAr, raised, total: skills.length,
    bodyAr: 'قُيِّمت كل مهارة اخترتِها من معاييرها هي وحدها. اكتمال النشاط لا يعني استيفاء كل مهارة، ونتيجة التقييم شيء وتغيّر المستوى شيء آخر: لا يتغيّر المستوى إلا حين يسجّله قرار التحقق.' };
}

/** My Work: the per-skill line for the latest attempt, or null for a legacy result. */
export function perSkillWorkLineAr(skills: readonly { outcome: string; levelChanged: boolean }[] | null | undefined): string | null {
  if (!skills || skills.length === 0) return null;
  const raised = skills.filter((s) => s.levelChanged).length;
  return raised > 0
    ? `قُيِّمت آخر محاولة مهارةً مهارة: تغيّر مستوى ${raised} من ${skills.length}.`
    : `قُيِّمت آخر محاولة مهارةً مهارة: لم يتغيّر مستوى أي منها بعد.`;
}

/** My Work chip for one skill of the latest attempt. */
export function workSkillChip(s: { labelAr: string | null; outcome: string; levelChanged: boolean }): { textAr: string; tone: Tone } {
  const o = skillOutcomeCopy({ outcome: s.outcome, criteria: [] });
  const name = s.labelAr ?? 'مهارة';
  if (s.levelChanged) return { textAr: `${name}: تغيّر المستوى`, tone: 'success' };
  if (s.outcome === 'incomplete') return { textAr: `${name}: لم تُحسم بعد`, tone: 'info' };
  return { textAr: `${name}: ${o.labelAr}`, tone: o.tone === 'success' ? 'info' : o.tone };
}

/* ───────────────────────── workspace: deliverables → request ───────────────────────── */

export interface DeliverableView { key: string; kind: 'file' | 'text'; mandatory: boolean }

/**
 * The explicit file mapping for a submission (Phase 1, A3). Each slot is keyed by the deliverable it belongs to;
 * the order of uploads carries no meaning, and only deliverables the activity declares as files are sent.
 */
export function buildFileMapping(deliverables: readonly DeliverableView[], slots: Readonly<Record<string, string | null | undefined>>):
  { files: { uploadId: string; deliverableKey: string }[]; missing: string[] } {
  const files: { uploadId: string; deliverableKey: string }[] = [];
  const missing: string[] = [];
  for (const d of deliverables) {
    if (d.kind !== 'file') continue;
    const uploadId = slots[d.key];
    if (uploadId) files.push({ uploadId, deliverableKey: d.key });
    else if (d.mandatory) missing.push(d.key);
  }
  return { files, missing };
}

/** Text deliverables become text artifacts under their declared keys. Nothing else is sent: no ticks, no signals. */
export function buildTextArtifacts(deliverables: readonly DeliverableView[], texts: Readonly<Record<string, string | undefined>>):
  { artifacts: { key: string; kind: 'text'; valueText: string }[]; missing: string[] } {
  const artifacts: { key: string; kind: 'text'; valueText: string }[] = [];
  const missing: string[] = [];
  for (const d of deliverables) {
    if (d.kind !== 'text') continue;
    const t = (texts[d.key] ?? '').trim();
    if (t) artifacts.push({ key: d.key, kind: 'text', valueText: t });
    else if (d.mandatory) missing.push(d.key);
  }
  return { artifacts, missing };
}

/* ───────────────────────────── attempts ───────────────────────────── */

export interface LedgerItem { channel: string; parentItemId: string | null; projectId: string | null; submissionId: string | null; attemptNumber: number; submittedAt: string | null; status: string }

/** A project's attempts, newest first, from the evidence ledger's submission items (one per attempt). */
export function attemptsOf(items: readonly LedgerItem[], projectId: string): { attemptNumber: number; submissionId: string; submittedAt: string | null }[] {
  return items
    .filter((i) => i.channel === 'activity' && i.parentItemId === null && i.projectId === projectId && i.submissionId)
    .map((i) => ({ attemptNumber: i.attemptNumber, submissionId: i.submissionId as string, submittedAt: i.submittedAt }))
    .sort((a, b) => b.attemptNumber - a.attemptNumber);
}

/** Human-readable file size. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ───────────────────────────── refusals in words ───────────────────────────── */

const REASON_AR: Readonly<Record<string, string>> = {
  missing_mandatory_deliverable: 'ينقص ملف إلزامي. أرفقي كل الملفات المطلوبة ثم أعيدي التسليم.',
  duplicate_deliverable: 'رُبط أكثر من ملف بالمخرج نفسه. اختاري ملفًا واحدًا لكل مخرج.',
  duplicate_upload: 'رُبط الملف نفسه بأكثر من مخرج. لكل مخرج ملفه.',
  unexpected_deliverable: 'أحد الملفات مربوط بمخرج لا يطلبه هذا النشاط.',
  deliverable_format_mismatch: 'أحد المخرجات أُرسل بغير صيغته المطلوبة.',
  malformed_file_mapping: 'تعذّرت قراءة ربط الملفات بالمخرجات. أعيدي تحميل الصفحة ثم حاولي مجددًا.',
  deliverable_mapping_required: 'يجب ربط كل ملف بالمخرج الذي يمثّله.',
  ambiguous_file_mapping: 'تعذّرت قراءة الملفات المرسلة. أعيدي تحميل الصفحة ثم حاولي مجددًا.',
  no_file_deliverables: 'هذا العمل لا يطلب ملفات.',
  skill_not_mapped_to_activity: 'إحدى المهارات المختارة ليست من مهارات هذا النشاط.',
};

/**
 * A refusal from the API, in words a graduate can act on. The API names its refusals (`[reason] …`); known
 * reasons get a sentence, anything else keeps the fallback. The original message stays available as detail.
 */
export function friendlyErrorAr(message: string, fallbackAr: string): { textAr: string; detail: string } {
  const m = /^\[([a-z_]+)\]/.exec(message.trim());
  const known = m ? REASON_AR[m[1] as string] : undefined;
  return { textAr: known ?? fallbackAr, detail: message };
}
