/**
 * Admin Track Builder governance (Phase 8, D-116).
 *
 * Pure rules the admin API and UI share. Nothing here invents a lifecycle:
 * the four stages an administrator sees are DERIVED from the states that
 * already exist (career-data review_state; governed review_status +
 * activation), with explicit annotations where they do not fit (a legacy
 * baseline in effect, a development-only draft, rejected, superseded).
 *
 * Authority is separated:
 *   track_admin    drafts and submits — never validates professional content;
 *   sme            validates professional content (a named person);
 *   product_owner  publishes and activates what was validated.
 * Editing permission is not professional authority.
 */
import { DomainError, InvariantViolation } from './errors.js';

export const ADMIN_ROLES = ['track_admin', 'sme', 'product_owner'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ACTIONS = {
  draft: ['track_admin'],            // create a draft version / change / content row; edit an unpublished draft
  submit: ['track_admin'],           // draft → pending review
  validate: ['sme'],                 // approve / reject / needs revision — professional authority
  approve_operational: ['sme', 'product_owner'], // non-professional fields only (display order, category)
  activate: ['product_owner'],       // activation of approved configuration (never a draft in production — the DB refuses)
  publish: ['product_owner'],        // career data approved → published; superseding
  read: ['track_admin', 'sme', 'product_owner'],
} as const satisfies Record<string, readonly AdminRole[]>;
export type AdminAction = keyof typeof ADMIN_ACTIONS;

/** Backend authorisation: the caller holds one of the roles the action needs. Hidden UI controls are not authorisation. */
export function assertAdminAction(action: AdminAction, roles: readonly AdminRole[]): AdminRole {
  const allowed = ADMIN_ACTIONS[action] as readonly AdminRole[];
  const role = allowed.find((r) => roles.includes(r));
  if (!role) throw new InvariantViolation('INV-3', `'${action}' needs one of [${allowed.join(', ')}]; the caller holds [${roles.join(', ') || 'none'}]`);
  return role;
}

/** Four eyes: the person who drafted something never validates it. */
export function assertFourEyes(draftedBy: string | null, decidedBy: string): void {
  if (draftedBy && draftedBy === decidedBy) throw new InvariantViolation('INV-3', 'four eyes: the person who drafted this cannot validate it; another, named reviewer must');
}

/* ───────────────────────────── stage labels (derived) ───────────────────────────── */

export type AdminStage = 'draft' | 'pending_review' | 'approved' | 'production_active';
export type StageAnnotation = 'legacy_baseline_in_effect' | 'development_only' | 'needs_revision' | 'rejected' | 'superseded' | 'inactive_after_activation' | null;

export const STAGE_AR: Readonly<Record<AdminStage, string>> = {
  draft: 'مسودة', pending_review: 'بانتظار المراجعة', approved: 'معتمدة', production_active: 'مفعّلة في الإنتاج',
};
export const ANNOTATION_AR: Readonly<Record<Exclude<StageAnnotation, null>, string>> = {
  legacy_baseline_in_effect: 'سارية كأساس توافق — غير مُراجَعة من خبير',
  development_only: 'مفعّلة لبيئة التطوير فقط',
  needs_revision: 'أُعيدت للتعديل',
  rejected: 'مرفوضة',
  superseded: 'استُبدلت بإصدار أحدث',
  inactive_after_activation: 'عُطّلت بعد تفعيل سابق (مجمّدة)',
};

/** Governed configuration (review_status + activation). */
export function governedStage(p: { reviewStatus: string; activation: string; activatedAt?: string | null }): { stage: AdminStage; annotation: StageAnnotation } {
  if (p.activation === 'production_active') return { stage: 'production_active', annotation: null };
  const annotation: StageAnnotation = p.activation === 'legacy_baseline' ? 'legacy_baseline_in_effect' : p.activation === 'development_only' ? 'development_only'
    : p.reviewStatus === 'needs_revision' ? 'needs_revision' : p.reviewStatus === 'rejected' ? 'rejected' : p.reviewStatus === 'superseded' ? 'superseded'
    : (p.activation === 'inactive' && p.activatedAt) ? 'inactive_after_activation' : null;
  const stage: AdminStage = ['approved', 'published'].includes(p.reviewStatus) ? 'approved' : ['curated', 'sme_reviewed'].includes(p.reviewStatus) ? 'pending_review' : 'draft';
  return { stage, annotation };
}

/** Career data (review_state). Published is what the product consumes — the production-active stage of content. */
export function contentStage(reviewStatus: string): { stage: AdminStage; annotation: StageAnnotation } {
  switch (reviewStatus) {
    case 'published': return { stage: 'production_active', annotation: null };
    case 'approved': return { stage: 'approved', annotation: null };
    case 'curated': case 'sme_reviewed': return { stage: 'pending_review', annotation: null };
    case 'needs_revision': return { stage: 'draft', annotation: 'needs_revision' };
    case 'rejected': return { stage: 'draft', annotation: 'rejected' };
    case 'superseded': return { stage: 'approved', annotation: 'superseded' };
    default: return { stage: 'draft', annotation: null };
  }
}

/** Track-skill change (track_skill_change.status). Applied = live through an activated track version. */
export function trackChangeStage(status: string): { stage: AdminStage; annotation: StageAnnotation } {
  switch (status) {
    case 'applied': return { stage: 'production_active', annotation: null };
    case 'approved': case 'included': return { stage: 'approved', annotation: null };
    case 'pending_review': return { stage: 'pending_review', annotation: null };
    case 'rejected': return { stage: 'draft', annotation: 'rejected' };
    case 'withdrawn': return { stage: 'draft', annotation: 'superseded' };
    default: return { stage: 'draft', annotation: null };
  }
}

/* ───────────────────────────── track-skill fields ───────────────────────────── */

/** Fields an administrator may propose on a TrackSkill. Professional ones need a named SME; the rest an SME or the product owner. */
export const TRACK_SKILL_FIELDS = {
  is_core: { professional: true }, importance: { professional: true }, expected_level: { professional: true },
  minimum_evidence_count: { professional: true }, readiness_contribution: { professional: true }, enabled: { professional: true },
  display_order: { professional: false }, category: { professional: false },
} as const;
export type TrackSkillField = keyof typeof TRACK_SKILL_FIELDS;
/** Proposing any of these resets the skill's classification to pending until a named SME approves the change. */
export const CLASSIFICATION_FIELDS: readonly TrackSkillField[] = ['is_core', 'importance'];

export function assertTrackSkillProposal(proposed: Readonly<Record<string, unknown>>): { professional: boolean } {
  const keys = Object.keys(proposed);
  if (keys.length === 0) throw new DomainError('a track-skill change proposes at least one field');
  for (const k of keys) if (!(k in TRACK_SKILL_FIELDS)) throw new DomainError(`'${k}' is not a track-skill field an administrator may propose`);
  const v = proposed;
  if ('is_core' in v && typeof v['is_core'] !== 'boolean') throw new DomainError('is_core must be true or false');
  if ('enabled' in v && typeof v['enabled'] !== 'boolean') throw new DomainError('enabled must be true or false');
  if ('importance' in v && v['importance'] !== null && !['critical', 'high', 'medium', 'low'].includes(v['importance'] as string)) throw new DomainError('importance must be critical | high | medium | low');
  if ('expected_level' in v && v['expected_level'] !== null && !['gap', 'self_reported', 'practiced', 'demonstrated', 'verified'].includes(v['expected_level'] as string)) throw new DomainError('unknown expected level');
  if ('readiness_contribution' in v && v['readiness_contribution'] !== null && !['counts', 'informational'].includes(v['readiness_contribution'] as string)) throw new DomainError('readiness_contribution must be counts | informational');
  if ('minimum_evidence_count' in v && v['minimum_evidence_count'] !== null && (!Number.isInteger(v['minimum_evidence_count']) || (v['minimum_evidence_count'] as number) < 1)) throw new DomainError('minimum_evidence_count must be a positive integer');
  if ('display_order' in v && v['display_order'] !== null && !Number.isInteger(v['display_order'])) throw new DomainError('display_order must be an integer');
  return { professional: keys.some((k) => TRACK_SKILL_FIELDS[k as TrackSkillField].professional) };
}

/* ───────────────────────────── diffs ───────────────────────────── */

export interface FieldDiff { readonly field: string; readonly before: unknown; readonly after: unknown; readonly changed: boolean }

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function diffFields(before: Readonly<Record<string, unknown>> | null, after: Readonly<Record<string, unknown>>, fields: readonly string[]): FieldDiff[] {
  return fields.map((field) => ({ field, before: before ? before[field] ?? null : null, after: after[field] ?? null, changed: !before || !same(before[field], after[field]) }));
}

export interface ChildDiff<T> { readonly added: readonly T[]; readonly removed: readonly T[]; readonly changed: readonly { readonly before: T; readonly after: T }[] }
export function diffChildren<T>(before: readonly T[], after: readonly T[], keyOf: (t: T) => string): ChildDiff<T> {
  const b = new Map(before.map((x) => [keyOf(x), x])); const a = new Map(after.map((x) => [keyOf(x), x]));
  return {
    added: [...a].filter(([k]) => !b.has(k)).map(([, v]) => v),
    removed: [...b].filter(([k]) => !a.has(k)).map(([, v]) => v),
    changed: [...a].filter(([k, v]) => b.has(k) && !same(b.get(k), v)).map(([k, v]) => ({ before: b.get(k)!, after: v })),
  };
}

/* ───────────────────────────── professional rules, in Arabic ───────────────────────────── */

export interface RuleHelp { readonly labelAr: string; readonly meaningAr: string; readonly impactAr: string; readonly expertDependent: boolean }

/** What each configurable rule means and what changing it does — for administrators, in plain Arabic. */
export const RULE_CATALOG: Readonly<Record<string, RuleHelp>> = {
  'claim_policy.min_evidence_level': { labelAr: 'أدنى مستوى دليل للصياغة', meaningAr: 'أقل مستوى تحقق يجب أن يبلغه الدليل حتى تُقترح صياغة من هذا النوع (سيرة، لينكدإن، دراسة حالة).',
    impactAr: 'رفعه يُخفي البنود المعتمدة التي لا تستوفيه وينقلها للمراجعة عند التفعيل. خفضه تحت «مُثبَتة» لادعاء مهارة غير مسموح (قرار «بند السيرة عند مُمارَسة» معلّق).', expertDependent: true },
  'claim_policy.min_evidence_count': { labelAr: 'أدنى عدد أدلة قائمة', meaningAr: 'عدد الأدلة غير المسحوبة المطلوب للمهارة.', impactAr: 'رفعه يقلّل الصياغات المؤهَّلة ويُعيد فحص البنود المعتمدة عند التفعيل.', expertDependent: true },
  'claim_policy.min_source_strength': { labelAr: 'أدنى قوة مصدر', meaningAr: 'أضعف مصدر دليل يُقبل (منصّة مُتحكَّم بها، مُلاحَظة، طرف ثالث، ذاتي).', impactAr: 'رفعه يستبعد الأدلة الأضعف من الصياغات.', expertDependent: true },
  'claim_policy.requires_verification_decision': { labelAr: 'اشتراط قرار تحقق', meaningAr: 'هل يلزم قرار تحقق مسجّل للمهارة.', impactAr: 'تفعيله يمنع الصياغة قبل قرار التحقق.', expertDependent: true },
  'assessment_context_policy.inputs': { labelAr: 'ما يراه المُقيِّم', meaningAr: 'أي المدخلات يطّلع عليها التقييم (المخرجات، الأدلة، الإفصاح…). الهوية والملف الشخصي مستبعدان دائمًا.', impactAr: 'يغيّر ما يُبنى عليه التقييم القادم فقط؛ لا يعيد حساب تقييم سابق.', expertDependent: true },
  'verification_policy.min_assessment_confidence': { labelAr: 'أدنى ثقة للتقييم', meaningAr: 'أقل ثقة مقبولة لقرار تحقق آلي.', impactAr: 'رفعه يرسل حالات أكثر للمراجعة البشرية.', expertDependent: true },
  'verification_policy.min_independent_evidence': { labelAr: 'أدنى أدلة مستقلة', meaningAr: 'عدد الأدلة المستقلة اللازم لمستوى التحقق.', impactAr: 'يؤثر في القرارات القادمة فقط.', expertDependent: true },
  'verification_policy.per_skill_evidence_derivation': { labelAr: 'اشتقاق دليل لكل مهارة (H6)', meaningAr: 'اشتقاق دليل لمهارات ثانوية من معاييرها.', impactAr: 'معطّل؛ تفعيله في الإنتاج ممنوع دون موافقة صريحة.', expertDependent: true },
  'readiness_rule_set.rules': { labelAr: 'قواعد الجاهزية', meaningAr: 'شروط تقرير الجاهزية للدور: مهارات مطلوبة (إلزامية)، غير قابلة للتعويض، عدد مهارات عند مستوى، أدلة لكل مهارة.', impactAr: 'تحدد متى يُعرض «جاهز للدور». لا عتبات معتمدة بعد؛ كل قاعدة مسودة حتى يعتمدها خبير.', expertDependent: true },
  'role_requirement.is_core': { labelAr: 'مهارة أساسية / داعمة', meaningAr: 'هل المهارة أساسية للدور.', impactAr: 'لا تُعرض «أساسية» قبل اعتماد خبير مسمّى؛ تؤثر في قواعد «كل المهارات الأساسية».', expertDependent: true },
  'role_requirement.importance': { labelAr: 'الأهمية', meaningAr: 'حرجة، عالية، متوسطة، منخفضة.', impactAr: 'تصنيف مهني يحتاج اعتماد خبير.', expertDependent: true },
  'role_requirement.expected_level': { labelAr: 'المستوى المتوقع', meaningAr: 'المستوى الذي يُتوقع بلوغه في المهارة لهذا الدور.', impactAr: 'تستخدمه قاعدة «كل المهارات عند مستواها المتوقع».', expertDependent: true },
  'role_requirement.minimum_evidence_count': { labelAr: 'أدنى عدد أدلة للمهارة', meaningAr: 'متطلب الأدلة للمهارة في هذا الدور.', impactAr: 'تصنيف مهني يحتاج اعتماد خبير.', expertDependent: true },
  'role_requirement.readiness_contribution': { labelAr: 'المساهمة في الجاهزية', meaningAr: 'هل تُحتسب المهارة في الجاهزية أم للعرض فقط.', impactAr: 'يغيّر نطاق قواعد الجاهزية.', expertDependent: true },
  'role_requirement.enabled': { labelAr: 'مفعّلة في المسار', meaningAr: 'هل المهارة جزء من المسار.', impactAr: 'تعطيلها يخرجها من التقارير والقواعد بعد تفعيل الإصدار.', expertDependent: true },
  'role_requirement.display_order': { labelAr: 'ترتيب العرض', meaningAr: 'ترتيب ظهور المهارة.', impactAr: 'عرضي فقط.', expertDependent: false },
  'role_requirement.category': { labelAr: 'الفئة', meaningAr: 'تجميع للعرض.', impactAr: 'عرضي فقط.', expertDependent: false },
  'rubric_criterion.weight': { labelAr: 'وزن المعيار', meaningAr: 'نصيب المعيار من نتيجة التقييم.', impactAr: 'تعديله يعيد حالة القيم إلى «مقترحة» حتى يعتمدها خبير.', expertDependent: true },
  'rubric_criterion.threshold_for_skill': { labelAr: 'عتبة المهارة', meaningAr: 'النسبة اللازمة ليُعدّ المعيار دليلًا للمهارة.', impactAr: 'تعديلها يعيد حالة القيم إلى «مقترحة».', expertDependent: true },
  'rubric_criterion.mandatory': { labelAr: 'معيار إلزامي', meaningAr: 'إن لم يُستوفَ لا يُعدّ التسليم ناجحًا.', impactAr: 'تعديله يعيد حالة القيم إلى «مقترحة».', expertDependent: true },
  'disclosure_questionnaire.questions': { labelAr: 'أسئلة الإفصاح عن الذكاء الاصطناعي', meaningAr: 'ما يُسأل عنه المستخدم عند التسليم. استخدام AI مسموح والإفصاح سياق لا عقوبة.', impactAr: 'الأسئلة تُجمَّد بعد التفعيل؛ كل تسليم يحفظ إصدار الأسئلة التي أجاب عنها.', expertDependent: true },
  'challenge_policy.trigger_rule': { labelAr: 'شرط تشغيل التحدي', meaningAr: 'متى يُطلب من المستخدم شرح أو تعديل عمله.', impactAr: 'يُحفظ تعريفًا فقط؛ تفعيل التحديات غير متاح في هذه المرحلة.', expertDependent: true },
  'pack_constraint_set.constraints': { labelAr: 'قيود بنية حزمة المسار', meaningAr: 'الأعداد التي يُتحقق بها من حزمة المسار عند استيرادها: عدد المهارات الأساسية، والمهام، والأنشطة، والمهارات المقيسة بعمق في كل نشاط، وأدنى عدد معايير، وأقصى موارد تعلّم لكل فجوة.',
    impactAr: 'يغيّر ما تقبله عملية الاستيراد القادمة فقط؛ لا يعيد كتابة حزمة مستوردة. القيم الحالية أساس توافق غير معتمد من خبير. أي نوع قاعدة جديد يحتاج امتدادًا صريحًا لا صفًّا.', expertDependent: true },
  'pack_constraint_set.track_id': { labelAr: 'نطاق المسار', meaningAr: 'معرّف المسار الذي تخصّه القيود، أو فارغ لكل المسارات.', impactAr: 'قيود خاصة بالمسار تتقدّم على العامة عند تفعيلها.', expertDependent: false },
  'grounding_lexicon.entries': { labelAr: 'مفردات التحقق من الصياغة', meaningAr: 'الكلمات المسموحة والعبارات المرفوضة التي يستخدمها فحص «ادعاء ← واقعة».', impactAr: 'تفعيل إصدار جديد يعيد فحص كل البنود المعتمدة في المعاملة نفسها؛ ما لا يستند لدليل يُنقل للمراجعة.', expertDependent: true },
};

/** The owner's list of expert decisions that stay pending — surfaced, never finalised by the Track Builder. */
export const PENDING_EXPERT_DECISIONS: readonly { readonly key: string; readonly labelAr: string; readonly whereAr: string }[] = [
  { key: 'mandatory_skills', labelAr: 'المهارات الإلزامية', whereAr: 'قواعد الجاهزية (مهارة مطلوبة / غير قابلة للتعويض)' },
  { key: 'core_classification', labelAr: 'تصنيف أساسية / داعمة', whereAr: 'إعداد مهارات المسار' },
  { key: 'readiness_thresholds', labelAr: 'عتبات الجاهزية', whereAr: 'قواعد الجاهزية' },
  { key: 'rubric_weights', labelAr: 'أوزان المعايير', whereAr: 'معايير التقييم' },
  { key: 'evidence_counts_strengths', labelAr: 'أعداد الأدلة وقوة مصادرها', whereAr: 'سياسات الصياغة وإعداد المهارات' },
  { key: 'verification_thresholds', labelAr: 'عتبات التحقق', whereAr: 'سياسة التحقق' },
  { key: 'cv_bullet_at_practiced', labelAr: 'بند السيرة عند «مُمارَسة»', whereAr: 'سياسة الصياغة — ممنوع التفعيل حتى يُحسم' },
  { key: 'challenge_triggers', labelAr: 'شروط تشغيل تحديات التحقق', whereAr: 'سياسة التحدي — لا تفعيل' },
  { key: 'grounding_vocabulary', labelAr: 'اعتماد مفردات التحقق من الصياغة', whereAr: 'مفردات التحقق' },
  { key: 'pack_structure_constraints', labelAr: 'قيود بنية الحزمة (عدد المهارات الأساسية، المهام، الأنشطة، المعايير، الموارد)', whereAr: 'قيود بنية حزمة المسار — أساس توافق غير معتمد' },
];
