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
