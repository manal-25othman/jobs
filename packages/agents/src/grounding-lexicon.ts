/**
 * Seed vocabulary for Claim-to-Fact Grounding (Phase 7b, G2).
 *
 * DRAFT / NOT VALIDATED. This is the content of `grounding_lexicon default@1`
 * (migration 0018), kept here so the pure engine can be unit-tested; the e2e
 * suite proves the database rows equal this list. The database is the source
 * the product reads; an SME edits it as a new version, not here.
 *
 * Allow-list classes are deliberately small: a word that is not here and not a
 * recorded fact leaves the wording "needs revision" — never "grounded".
 */
import type { GroundingLexiconEntry, LexiconClass } from './claim-grounding.js';

const E = (language: 'ar' | 'en', cls: LexiconClass, forms: string): GroundingLexiconEntry[] =>
  forms.split('|').map((f) => f.trim()).filter(Boolean).map((form) => ({ language, cls, form }));

export const SEED_GROUNDING_LEXICON: readonly GroundingLexiconEntry[] = [
  // ── framing: connectives and neutral words, always allowed ──
  ...E('en', 'framing', 'a|an|the|and|or|of|in|on|at|to|for|with|across|using|by|as|from|its|their|my|i|this|these|is|was|were|are|it|each|every|all|both|part|within|through|via|into|per|s|also|against|one|here|project|projects|work|case|study|skill|skills|evidence|links|linked'),
  ...E('ar', 'framing', 'في|من|على|الى|عن|مع|و|او|ثم|عبر|ضمن|خلال|ل|ب|ك|كل|هذا|هذه|ذلك|التي|الذي|ان|قد|تم|بين|حول|كما|مثل|داخل|هو|هي|انا|ايضا|عند|وفق|مشروع|مشاريع|دراسه|حاله|مهارات|مهاره|عمل|اعمال|دليل|مرتبطه|يمكن|الرجوع|اليه|هنا'),
  // ── action: what the user did (needs a cited project / deliverable / criterion) ──
  ...E('en', 'action', 'built|build|building|wrote|write|writing|written|implemented|implementing|developed|developing|created|creating|designed|designing|tested|testing|test|tests|covered|covering|worked|working|fixed|fixing|refactored|refactoring|added|adding|completed|submitted|handled|handling|structured|styled|documented|debugged|reviewed|organised|organized|maintained'),
  ...E('ar', 'action', 'بنيت|بناء|بني|كتبت|كتابه|نفذت|تنفيذ|طورت|تطوير|انشات|انشاء|صممت|تصميم|اختبرت|اختبار|اختبارات|غطيت|تغطيه|عملت|اصلحت|اصلاح|اضفت|اضافه|اكملت|اكمال|قدمت|تقديم|عالجت|معالجه|وثقت|توثيق|توليت'),
  // ── skill_verb: only next to a skill fact at demonstrated or above ──
  ...E('en', 'skill_verb', 'demonstrated|demonstrating|demonstrates|demonstrate'),
  ...E('ar', 'skill_verb', 'اثبت|اثبتت|اثبات|مثبته|المثبته'),
  // ── evaluation_term: only with an evaluation (or demonstrated-skill) fact ──
  ...E('en', 'evaluation_term', 'evaluated|evaluation|criteria|criterion|rubric|published|scoring|scored|score|met|assessed'),
  ...E('ar', 'evaluation_term', 'قيم|مقيم|مقيمه|تقييم|معيار|معايير|منشور|نتيجه|مستوفاه|مستوفي|استوفيت'),
  // ── technology_term: only next to a declared technology fact ──
  ...E('en', 'technology_term', 'declared technologies|declared technology|technologies|technology'),
  ...E('ar', 'technology_term', 'التقنيات المعلنه|تقنيات|تقنيه|المعلنه'),
  // ── context_term: only with the learning-track fact ──
  ...E('en', 'context_term', 'track|learning'),
  ...E('ar', 'context_term', 'مسار|اتعلم|تعلم'),
  // ── detector phrases (refuse); the code guards remain the floor ──
  ...E('en', 'detect_outcome', 'user satisfaction|customer satisfaction|conversion rate|retention|engagement|time savings|saved time|cost savings|business value|positive feedback|well received|seamless|smoothly'),
  ...E('ar', 'detect_outcome', 'رضا المستخدمين|رضا العملاء|تجربه افضل|توفير الوقت|توفير التكلفه|قيمه تجاريه|ردود فعل ايجابيه|بسلاسه'),
  ...E('en', 'detect_professional', 'stakeholders|client|clients|end users|real world users|at work|my employer|company project|team lead'),
  ...E('ar', 'detect_professional', 'اصحاب المصلحه|عميل|العملاء|المستخدمين النهائيين|شركتي|جهه عملي'),
  ...E('en', 'detect_credential', 'certified|certificate|licensed|accredited'),
  ...E('ar', 'detect_credential', 'شهاده|مرخص'),
  ...E('en', 'detect_quality', 'robust|scalable|production ready|enterprise grade|best practices|expert|advanced|high performance|optimized|optimised|cutting edge'),
  ...E('ar', 'detect_quality', 'احترافي|احترافيه|قابل للتوسع|متقدم|خبير|افضل الممارسات|عالي الاداء'),
];

export const SEED_GROUNDING_LEXICON_REF = 'default@1';
