/**
 * Phase B, package 2 (PO decision 2) — the deterministic A07 learning recommendation (contract A07, FR-A-011, FR-P-017).
 *
 *   Skill gap → learning need → ONE ranked resource from the registry (with its reason) → MANDATORY practice.
 *
 * No model, no free web search, no invented link: a resource is chosen only from the curated registry
 * (`learning_resource`). Exposure is decided here, once:
 *   verified  — published, quality sme_reviewed/approved, a URL that was opened directly, and the provider's usage
 *               terms checked. Only these ever reach an ordinary graduate.
 *   candidate — an unverified draft, shown ONLY when the internal candidate preview is on (development only, audited,
 *               and labelled on every item). Never shown to an ordinary graduate.
 *   hidden    — everything else.
 * A recommendation without a practice activity is refused structurally (no resource is returned). A recommendation
 * never grants, raises or predicts a skill level, and a duration is shown only when it has a stated basis.
 */

export type ResourceExposure = 'verified' | 'candidate' | 'hidden';
export type LinkCheck = 'none' | 'search_index' | 'direct';

export interface RegistryResource {
  readonly id: string;
  readonly code: string;
  readonly titleAr: string | null;
  readonly titleEn: string;
  readonly provider: string | null;
  readonly resourceType: string | null;
  readonly language: string | null;
  readonly freeOrPaid: 'free' | 'paid' | 'freemium' | null;
  readonly url: string | null;
  readonly whyRecommendedAr: string | null;
  readonly coversTargetLevel: boolean | null;
  readonly durationMinutes: number | null;
  readonly durationBasis: string | null;
  readonly qualityStatus: string;
  readonly reviewStatus: string;
  readonly linkCheck: LinkCheck;
  readonly lastChecked: string | null;
  readonly usageTermsChecked: string | null;
  /** The practice activity the registry names for this resource (slug), if any. */
  readonly practiceActivitySlug: string | null;
}

export interface PracticeOption {
  readonly activityId: string;
  readonly slug: string;
  readonly titleAr: string;
  readonly startable: boolean;
}

export interface LearningContext {
  /** The graduate's verification level for the skill (never changed here). */
  readonly level: 'gap' | 'practiced' | 'demonstrated' | 'verified' | string;
  readonly preferFree?: boolean;
  readonly candidatePreview: boolean;
}

export interface RecommendedResource {
  readonly id: string;
  readonly code: string;
  readonly titleAr: string;
  readonly titleEn: string;
  readonly provider: string | null;
  readonly typeAr: string;
  readonly languageAr: string;
  readonly costAr: string;
  readonly url: string | null;
  readonly whyAr: string;
  readonly durationMinutes: number | null;
  readonly durationAr: string;
  readonly exposure: Exclude<ResourceExposure, 'hidden'>;
  /** Present on every candidate item: the graduate-facing label that it is NOT verified. */
  readonly labelAr: string | null;
  readonly linkStatusAr: string;
}

export interface LearningPlanProposal {
  readonly kind: 'LearningPlanProposal';
  readonly agent: 'A07';
  readonly mode: 'deterministic';
  readonly need: { readonly code: 'no_evidence' | 'practiced_not_demonstrated' | 'strengthen'; readonly textAr: string };
  readonly resource: RecommendedResource | null;
  /** At most two, in rank order; never an unordered list. */
  readonly alternatives: readonly RecommendedResource[];
  readonly practice: (PracticeOption & { readonly whyAr: string }) | null;
  /** Shown when no resource can be recommended (contract fallback: go straight to practice, and say so). */
  readonly fallbackAr: string | null;
  readonly candidatePreview: boolean;
  /** Structural: a recommendation never changes a level. */
  readonly grantsLevel: false;
}

export const CANDIDATE_RESOURCE_LABEL_AR = 'مورد مرشّح لم يُتحقَّق منه بعد: يظهر في بيئة الاختبار الداخلية فقط، ولم يراجعه خبير.';
export const NO_PRACTICE_AR = 'لا يوجد الآن نشاط تطبيقي متاح لهذه المهارة في مسارك، لذلك لا نرشّح موردًا: التعلّم دون تطبيق لا يُحتسب.';
export const NO_RESOURCE_AR = 'لا يوجد بعد مورد تعلّم متحقَّق منه لهذه المهارة. يمكنك البدء مباشرة بالنشاط التطبيقي أدناه.';

const VERIFIED_QUALITY = new Set(['sme_reviewed', 'approved']);
const CANDIDATE_REVIEW = new Set(['draft', 'curated', 'needs_revision']);

export function resourceExposure(r: RegistryResource, opts: { readonly candidatePreview: boolean }): ResourceExposure {
  const verified = VERIFIED_QUALITY.has(r.qualityStatus) && r.reviewStatus === 'published' && !!r.url
    && r.linkCheck === 'direct' && !!r.lastChecked && !!r.usageTermsChecked;
  if (verified) return 'verified';
  if (opts.candidatePreview && r.qualityStatus === 'unverified' && CANDIDATE_REVIEW.has(r.reviewStatus)) return 'candidate';
  return 'hidden';
}

const TYPE_AR: Record<string, string> = {
  tutorial: 'درس تطبيقي', course: 'دورة', exercise: 'تمرين تفاعلي', documentation: 'توثيق ومرجع', article: 'مقال إرشادي', video: 'فيديو', project: 'مشروع',
};
const TYPE_RANK = ['tutorial', 'course', 'exercise', 'documentation', 'article', 'video', 'project'];
const LANG_AR: Record<string, string> = { ar: 'بالعربية', en: 'بالإنجليزية' };
const COST_AR: Record<string, string> = { free: 'مجاني', paid: 'مدفوع', freemium: 'مجاني جزئيًا' };

function needFor(level: string): LearningPlanProposal['need'] {
  if (level === 'gap') return { code: 'no_evidence', textAr: 'لا يوجد بعد دليل مُقيَّم على هذه المهارة. ابدئي بفهم الأساس، ثم طبّقيه في نشاط يُقيَّم.' };
  if (level === 'practiced') return { code: 'practiced_not_demonstrated', textAr: 'مارستِ هذه المهارة، ولم يُثبتها دليل مُقيَّم بعد. راجعي النقطة التي تحتاجها ثم طبّقيها في نشاط.' };
  return { code: 'strengthen', textAr: 'لديك دليل مُقيَّم على هذه المهارة. هذا مورد للتعمّق إن أردتِ، ولا يغيّر مستواك.' };
}

function rankKey(r: RegistryResource, exposure: ResourceExposure, preferFree: boolean): (number | string)[] {
  return [
    exposure === 'verified' ? 0 : 1,
    r.url ? 0 : 1,
    r.coversTargetLevel === true ? 0 : 1,
    preferFree ? (r.freeOrPaid === 'free' ? 0 : 1) : 0,
    r.language === 'ar' ? 0 : 1,
    TYPE_RANK.indexOf(r.resourceType ?? '') === -1 ? TYPE_RANK.length : TYPE_RANK.indexOf(r.resourceType ?? ''),
    r.code,
  ];
}
function compareKeys(a: (number | string)[], b: (number | string)[]): number {
  for (let i = 0; i < a.length; i++) { const x = a[i]!, y = b[i]!; if (x < y) return -1; if (x > y) return 1; }
  return 0;
}

function present(r: RegistryResource, exposure: Exclude<ResourceExposure, 'hidden'>): RecommendedResource {
  const hasBasis = r.durationMinutes != null && !!r.durationBasis;
  return {
    id: r.id, code: r.code, titleAr: r.titleAr ?? r.titleEn, titleEn: r.titleEn, provider: r.provider,
    typeAr: TYPE_AR[r.resourceType ?? ''] ?? 'مورد', languageAr: LANG_AR[r.language ?? ''] ?? 'لغة غير محددة', costAr: COST_AR[r.freeOrPaid ?? ''] ?? 'التكلفة غير محددة',
    url: r.url, whyAr: r.whyRecommendedAr ?? '',
    durationMinutes: hasBasis ? r.durationMinutes : null,
    durationAr: hasBasis ? `نحو ${r.durationMinutes} دقيقة` : 'المدة غير محددة',
    exposure, labelAr: exposure === 'candidate' ? CANDIDATE_RESOURCE_LABEL_AR : null,
    linkStatusAr: exposure === 'verified' ? `رابط فُتح وتُحقِّق منه في ${r.lastChecked}` : (r.linkCheck === 'search_index' ? 'رابط ظهر في نتائج البحث ولم يُفتح للتحقق بعد' : 'رابط لم يُتحقَّق منه'),
  };
}

function choosePractice(options: readonly PracticeOption[], preferredSlug: string | null): PracticeOption | null {
  if (options.length === 0) return null;
  const sorted = [...options].sort((a, b) => a.slug.localeCompare(b.slug));
  return sorted.find((o) => o.slug === preferredSlug && o.startable)
    ?? sorted.find((o) => o.startable)
    ?? sorted.find((o) => o.slug === preferredSlug)
    ?? sorted[0]!;
}

/**
 * The A07 deterministic recommendation for ONE skill. `practiceOptions` are the activities of the graduate's current
 * role that exercise the skill (the caller resolves them from the catalogue).
 */
export function recommendLearning(input: {
  readonly resources: readonly RegistryResource[];
  readonly practiceOptions: readonly PracticeOption[];
  readonly context: LearningContext;
}): LearningPlanProposal {
  const need = needFor(input.context.level);
  const base = { kind: 'LearningPlanProposal' as const, agent: 'A07' as const, mode: 'deterministic' as const, need, candidatePreview: input.context.candidatePreview, grantsLevel: false as const };
  const ranked = input.resources
    .map((r) => ({ r, e: resourceExposure(r, { candidatePreview: input.context.candidatePreview }) }))
    .filter((x): x is { r: RegistryResource; e: Exclude<ResourceExposure, 'hidden'> } => x.e !== 'hidden')
    .sort((a, b) => compareKeys(rankKey(a.r, a.e, !!input.context.preferFree), rankKey(b.r, b.e, !!input.context.preferFree)));

  const top = ranked[0];
  const practice = choosePractice(input.practiceOptions, top?.r.practiceActivitySlug ?? null);
  if (!practice) {
    // FR-A-011: learning without practice is refused structurally — no resource at all.
    return { ...base, resource: null, alternatives: [], practice: null, fallbackAr: NO_PRACTICE_AR };
  }
  const practiceView = {
    ...practice,
    whyAr: practice.startable ? 'طبّقي ما تعلّمتِه في هذا النشاط: التقييم فيه هو ما يُنتج الدليل، لا قراءة المورد.' : 'هذا هو النشاط الذي تُطبَّق فيه المهارة، وهو غير متاح للبدء بعد.',
  };
  if (!top) return { ...base, resource: null, alternatives: [], practice: practiceView, fallbackAr: NO_RESOURCE_AR };
  return {
    ...base,
    resource: present(top.r, top.e),
    alternatives: ranked.slice(1, 3).map((x) => present(x.r, x.e)),
    practice: practiceView,
    fallbackAr: null,
  };
}
