/**
 * Claim-to-Fact Grounding — G1 + G2 (Phase 7b, D-115).
 *
 * A professional claim is grounded only when every factual part of its wording
 * is accounted for by a RECORDED fact from the evidence it cites. The question
 * is no longer "does the text contain a forbidden phrase?" (open-ended) but
 * "is every token accounted for?" (closed): a token is covered by a fact's
 * recorded surface form, or by approved vocabulary (versioned bilingual data),
 * and some vocabulary only counts when the facts behind it exist.
 *
 *   Layer A — the generator's declared claim plan (typed assertions → fact ids
 *             → exact spans) is CHECKED, never trusted: every fact must be one
 *             of the cited records, its kind must fit the assertion type, its
 *             span must be covered by that fact, and nothing outside the
 *             declared spans may carry content.
 *   Layer B — independent detectors (the Phase 7 guards + the lexicon's
 *             detector phrases) run over the whole wording; any number,
 *             technology, skill, outcome, professional-context, credential or
 *             quality claim that no recorded fact supports refuses the draft,
 *             whatever the plan says.
 *
 * Three results: grounded · needs_revision (only low-risk text is unaccounted
 * for) · refused (a high-risk assertion is unsupported). The original wording
 * is always returned untouched; a suggested trim only ever DELETES clauses.
 *
 * Pure and deterministic. No model, no provider, no network.
 */
import { evidenceOrdinal, assertNoUnsupportedLanguage, InvariantViolation, type EvidenceState } from '@naqla/domain';
import {
  normalizeArabic, numbersIn, technologiesMentioned, skillsMentioned, outcomeClaimIn,
  PROFESSIONAL_WORK_PATTERNS, INVENTED_PATTERNS,
} from './validation.js';

export const GROUNDING_ENGINE_VERSION = 'claim-grounding@1';

/* ──────────────────────────────── facts ──────────────────────────────── */

export const FACT_KINDS = ['project', 'deliverable', 'criterion_met', 'evaluation', 'skill_level', 'technology', 'number', 'context'] as const;
export type FactKind = (typeof FACT_KINDS)[number];

/** A recorded fact, built by the application from database rows. Never from the generator. */
export interface ClaimFact {
  readonly id: string;
  readonly kind: FactKind;
  readonly evidenceId: string | null;
  /** How the fact may be written. Multi-word; matched after normalisation. */
  readonly surfacesAr: readonly string[];
  readonly surfacesEn: readonly string[];
  /** number value · technology term · skill id. */
  readonly value?: string;
  /** skill_level only. */
  readonly state?: EvidenceState;
}

/* ────────────────────────────── assertions ───────────────────────────── */

export const ASSERTION_TYPES = ['ACTION', 'ARTIFACT', 'EVALUATION', 'SKILL', 'TECHNOLOGY', 'NUMBER', 'OUTCOME', 'PROFESSIONAL_CONTEXT', 'QUALITY', 'FRAMING'] as const;
export type AssertionType = (typeof ASSERTION_TYPES)[number];

/**
 * Which fact kinds can support each assertion type, and how bad an
 * unsupported one is. OUTCOME, PROFESSIONAL_CONTEXT and QUALITY have NO fact
 * kind: nothing in the product records them, so they are never supported.
 */
export const SUPPORT_RULES: Readonly<Record<AssertionType, { readonly factKinds: readonly FactKind[]; readonly risk: 'high' | 'low' | 'none' }>> = {
  ACTION: { factKinds: ['project', 'deliverable', 'criterion_met'], risk: 'low' },
  ARTIFACT: { factKinds: ['deliverable', 'criterion_met', 'project'], risk: 'low' },
  EVALUATION: { factKinds: ['evaluation', 'criterion_met', 'number'], risk: 'high' },
  SKILL: { factKinds: ['skill_level'], risk: 'high' },
  TECHNOLOGY: { factKinds: ['technology'], risk: 'high' },
  NUMBER: { factKinds: ['number'], risk: 'high' },
  OUTCOME: { factKinds: [], risk: 'high' },
  PROFESSIONAL_CONTEXT: { factKinds: [], risk: 'high' },
  QUALITY: { factKinds: [], risk: 'high' },
  FRAMING: { factKinds: ['context'], risk: 'none' },
};

/** The type a matched fact implies when the wording comes without a plan (a user's own edit, a pre-7b draft). */
const TYPE_OF_FACT: Readonly<Record<FactKind, AssertionType>> = {
  project: 'ACTION', deliverable: 'ARTIFACT', criterion_met: 'EVALUATION', evaluation: 'EVALUATION',
  skill_level: 'SKILL', technology: 'TECHNOLOGY', number: 'NUMBER', context: 'FRAMING',
};

export interface PlanSpan { readonly text: string; readonly start?: number }
export interface ClaimPlanAssertion { readonly type: AssertionType; readonly ar: PlanSpan | null; readonly en: PlanSpan | null; readonly factIds: readonly string[] }
/** Declared by the generator. Checked, never trusted. */
export interface ClaimPlan { readonly assertions: readonly ClaimPlanAssertion[] }

/* ─────────────────────────────── lexicon ─────────────────────────────── */

/**
 * Coverage vocabulary (allow-list) and detector phrases (additional deny-list).
 *   framing          connectives and neutral words — always allowed
 *   action           what the user did — only with a project/deliverable/criterion fact cited
 *   skill_verb       "demonstrated" — only next to a skill fact at demonstrated or above
 *   evaluation_term  "evaluated", "rubric" — only with an evaluation (or demonstrated-skill) fact
 *   technology_term  "declared technologies" — only next to a technology fact
 *   context_term     "track", "learning" — only with a context fact
 *   detect_*         phrases that are claims no fact supports — refuse
 * The code guards (validation.ts) are a floor the data cannot remove; data can only ADD detectors.
 */
export const LEXICON_CLASSES = ['framing', 'action', 'skill_verb', 'evaluation_term', 'technology_term', 'context_term',
  'detect_outcome', 'detect_professional', 'detect_credential', 'detect_quality'] as const;
export type LexiconClass = (typeof LEXICON_CLASSES)[number];
export interface GroundingLexiconEntry { readonly language: 'ar' | 'en'; readonly cls: LexiconClass; readonly form: string }
export interface GroundingLexicon { readonly ref: string; readonly resolution: string; readonly entries: readonly GroundingLexiconEntry[] }

const DETECT_TYPE: Readonly<Record<string, AssertionType>> = {
  detect_outcome: 'OUTCOME', detect_professional: 'PROFESSIONAL_CONTEXT', detect_credential: 'PROFESSIONAL_CONTEXT', detect_quality: 'QUALITY',
};

/* ───────────────────────────── normalisation ─────────────────────────── */

type Lang = 'ar' | 'en';

/** Matching form: Arabic diacritics/tatweel removed, alef/ya/ta-marbuta folded, digits ASCII, Latin lower-cased. */
export function normalizeForGrounding(s: string): string {
  return normalizeArabic(s).replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).toLowerCase();
}

interface Token { readonly raw: string; readonly norm: string; readonly start: number; readonly end: number }

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    const norm = normalizeForGrounding(m[0]);
    if (norm.length === 0) continue;
    out.push({ raw: m[0], norm, start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

const AR_PREFIXES = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ل', 'ك'];
const AR_SUFFIXES = ['ها', 'هم', 'هن', 'نا', 'كم', 'ه', 'ي', 'ك'];

/** Clitic variants of a token: Arabic proclitics/enclitics, English plural/possessive. Never more than one layer each side. */
export function tokenVariants(norm: string): string[] {
  const out = new Set<string>([norm]);
  if (/[؀-ۿ]/.test(norm) || /^[وفبلك]/.test(norm)) {
    const stems = new Set<string>([norm]);
    for (const p of AR_PREFIXES) if (norm.startsWith(p) && norm.length - p.length >= 2) stems.add(norm.slice(p.length));
    for (const st of [...stems]) { out.add(st); if (st.startsWith('ال') && st.length > 3) out.add(st.slice(2)); }
    for (const st of [...out]) for (const sfx of AR_SUFFIXES) if (st.endsWith(sfx) && st.length - sfx.length >= 3) out.add(st.slice(0, -sfx.length));
  }
  if (/^[a-z]+$/.test(norm) && norm.length > 3 && norm.endsWith('s')) out.add(norm.slice(0, -1));
  return [...out];
}

const sameToken = (textTok: Token, form: string): boolean => textTok.norm === form || tokenVariants(textTok.norm).includes(form);

/** Finds a normalised multi-token phrase starting at token i. */
function phraseAt(tokens: readonly Token[], i: number, phrase: readonly string[]): boolean {
  if (i + phrase.length > tokens.length) return false;
  for (let k = 0; k < phrase.length; k++) if (!sameToken(tokens[i + k]!, phrase[k]!)) return false;
  return true;
}

const phraseTokens = (s: string): string[] => tokenize(s).map((t) => t.norm);

/* ──────────────────────────────── coverage ───────────────────────────── */

type Cover = { readonly by: 'fact'; readonly factId: string } | { readonly by: 'lex'; readonly cls: LexiconClass } | { readonly by: 'number'; readonly factId: string } | null;

interface Coverage { readonly tokens: readonly Token[]; readonly cover: readonly Cover[]; readonly matchedFacts: ReadonlySet<string> }

function coverText(text: string, lang: Lang, facts: readonly ClaimFact[], lexicon: GroundingLexicon | null): Coverage {
  const tokens = tokenize(text);
  const cover: Cover[] = tokens.map(() => null);
  const matched = new Set<string>();
  // 1 · fact surfaces, longest first
  const surfaces = facts.flatMap((f) => (lang === 'ar' ? f.surfacesAr : f.surfacesEn).map((s) => ({ f, toks: phraseTokens(s) })))
    .filter((x) => x.toks.length > 0 && x.f.kind !== 'number').sort((a, b) => b.toks.length - a.toks.length);
  for (const { f, toks } of surfaces) {
    for (let i = 0; i < tokens.length; i++) {
      if (cover.slice(i, i + toks.length).some((c) => c !== null)) continue;
      if (phraseAt(tokens, i, toks)) { for (let k = 0; k < toks.length; k++) cover[i + k] = { by: 'fact', factId: f.id }; matched.add(f.id); }
    }
  }
  // 2 · numbers: only a recorded number covers a number
  for (let i = 0; i < tokens.length; i++) {
    if (cover[i] || !/^\d+(\.\d+)?$/.test(tokens[i]!.norm)) continue;
    const f = facts.find((x) => x.kind === 'number' && x.value === String(Number(tokens[i]!.norm)));
    if (f) { cover[i] = { by: 'number', factId: f.id }; matched.add(f.id); }
  }
  // 3 · vocabulary, gated by the facts it needs
  if (lexicon) {
    const factsHere = facts.filter((f) => matched.has(f.id));
    const has = (k: FactKind) => facts.some((f) => f.kind === k);
    const gate: Readonly<Record<string, boolean>> = {
      framing: true,
      action: has('project') || has('deliverable') || has('criterion_met'),
      skill_verb: factsHere.some((f) => f.kind === 'skill_level' && f.state !== undefined && evidenceOrdinal(f.state) >= evidenceOrdinal('demonstrated')),
      evaluation_term: has('evaluation') || facts.some((f) => f.kind === 'skill_level' && f.state !== undefined && evidenceOrdinal(f.state) >= evidenceOrdinal('demonstrated')),
      technology_term: factsHere.some((f) => f.kind === 'technology'),
      context_term: has('context'),
    };
    const vocab = lexicon.entries.filter((e) => e.language === lang && !e.cls.startsWith('detect_') && gate[e.cls])
      .map((e) => ({ cls: e.cls, toks: phraseTokens(e.form) })).filter((x) => x.toks.length > 0).sort((a, b) => b.toks.length - a.toks.length);
    for (const { cls, toks } of vocab) {
      for (let i = 0; i < tokens.length; i++) {
        if (cover.slice(i, i + toks.length).some((c) => c !== null)) continue;
        if (phraseAt(tokens, i, toks)) for (let k = 0; k < toks.length; k++) cover[i + k] = { by: 'lex', cls };
      }
    }
  }
  return { tokens, cover, matchedFacts: matched };
}

/* ──────────────────────────────── result ─────────────────────────────── */

export type GroundingDecision = 'grounded' | 'needs_revision' | 'refused';

export interface GroundingIssue {
  readonly code: string;
  readonly severity: 'refuse' | 'revise';
  readonly language: Lang | null;
  readonly span: string | null;
  readonly en: string;
  readonly ar: string;
  /** What recorded fact would support it, when one could. */
  readonly missingFact: string | null;
}

export interface GroundedAssertion {
  readonly type: AssertionType;
  readonly spanAr: string | null;
  readonly spanEn: string | null;
  readonly factIds: readonly string[];
  readonly status: 'supported' | 'unsupported' | 'unmapped';
  readonly declared: boolean;
}

export interface GroundingResult {
  readonly decision: GroundingDecision;
  readonly engineVersion: string;
  readonly lexiconRef: string | null;
  readonly mode: 'declared_plan' | 'inferred';
  readonly original: { readonly ar: string; readonly en: string | null };
  readonly assertions: readonly GroundedAssertion[];
  readonly issues: readonly GroundingIssue[];
  readonly unmapped: { readonly ar: readonly string[]; readonly en: readonly string[] };
  readonly suggestedTrim: { readonly ar: string; readonly en: string | null } | null;
  readonly factsUsed: readonly string[];
}

export interface GroundingInput {
  readonly ar: string;
  readonly en: string | null;
  readonly plan: ClaimPlan | null;
  /** Facts from the CITED records only (plus, for evidence-free kinds, the user's demonstrated skills and track). */
  readonly facts: readonly ClaimFact[];
  readonly lexicon: GroundingLexicon | null;
  readonly knownTechnologies: ReadonlyMap<string, readonly string[]>;
  readonly knownSkills: ReadonlyMap<string, readonly string[]>;
}

const I = (code: string, severity: 'refuse' | 'revise', language: Lang | null, span: string | null, en: string, ar: string, missingFact: string | null = null): GroundingIssue =>
  ({ code, severity, language, span, en, ar, missingFact });

/* ──────────────────────────────── detectors ──────────────────────────── */

interface Detection { readonly type: AssertionType; readonly value: string; readonly language: Lang; readonly span: string }

/** Layer B: independent of any plan. The Phase 7 guards are the floor; lexicon detector phrases add to it. */
function detect(text: string, lang: Lang, input: GroundingInput): Detection[] {
  const out: Detection[] = [];
  for (const n of new Set(numbersIn(text))) out.push({ type: 'NUMBER', value: String(Number(n)), language: lang, span: n });
  for (const t of technologiesMentioned(text, input.knownTechnologies)) out.push({ type: 'TECHNOLOGY', value: t, language: lang, span: t });
  for (const s of skillsMentioned(text, input.knownSkills, input.knownTechnologies)) out.push({ type: 'SKILL', value: s, language: lang, span: s });
  const outcome = outcomeClaimIn(text);
  if (outcome) out.push({ type: 'OUTCOME', value: outcome, language: lang, span: outcome });
  const norm = normalizeArabic(text);
  for (const [re, what] of PROFESSIONAL_WORK_PATTERNS) { const m = re.exec(norm); if (m) out.push({ type: 'PROFESSIONAL_CONTEXT', value: what, language: lang, span: m[0].trim() }); }
  for (const [re, what] of INVENTED_PATTERNS) { const m = re.exec(text); if (m) out.push({ type: 'PROFESSIONAL_CONTEXT', value: what, language: lang, span: m[0].trim() }); }
  try { assertNoUnsupportedLanguage(lang === 'ar' ? text : '', lang === 'en' ? text : ''); } catch (e) {
    if (!(e instanceof InvariantViolation)) throw e;
    out.push({ type: /mastery|seniority/.test(e.message) ? 'QUALITY' : 'OUTCOME', value: e.message, language: lang, span: e.message });
  }
  if (input.lexicon) {
    const tokens = tokenize(text);
    for (const e of input.lexicon.entries) {
      if (e.language !== lang || !e.cls.startsWith('detect_')) continue;
      const toks = phraseTokens(e.form);
      for (let i = 0; i < tokens.length; i++) if (toks.length > 0 && phraseAt(tokens, i, toks)) { out.push({ type: DETECT_TYPE[e.cls]!, value: e.form, language: lang, span: tokens.slice(i, i + toks.length).map((t) => t.raw).join(' ') }); break; }
    }
  }
  return out;
}

const AR_TYPE: Readonly<Record<AssertionType, string>> = {
  ACTION: 'وصف لما أنجزتِه', ARTIFACT: 'وصف لما بنيتِه', EVALUATION: 'نتيجة تقييم', SKILL: 'ادعاء مهارة', TECHNOLOGY: 'ذكر تقنية',
  NUMBER: 'رقم', OUTCOME: 'أثر أو نتيجة على مستخدمين أو عمل', PROFESSIONAL_CONTEXT: 'سياق عمل مهني (جهة عمل · عميل · إنتاج · شهادة · سنوات)',
  QUALITY: 'وصف جودة أو إتقان', FRAMING: 'صياغة رابطة',
};

/** Is a detection supported by a recorded fact? Outcome, professional context and quality never are. */
function detectionSupport(d: Detection, facts: readonly ClaimFact[]): ClaimFact | null {
  if (d.type === 'NUMBER') return facts.find((f) => f.kind === 'number' && f.value === d.value) ?? null;
  if (d.type === 'TECHNOLOGY') return facts.find((f) => f.kind === 'technology' && f.value === d.value) ?? null;
  if (d.type === 'SKILL') return facts.find((f) => f.kind === 'skill_level' && f.value === d.value && f.state !== undefined && evidenceOrdinal(f.state) >= evidenceOrdinal('demonstrated')) ?? null;
  return null;
}

function detectionIssue(d: Detection, facts: readonly ClaimFact[]): GroundingIssue {
  switch (d.type) {
    case 'NUMBER': return I('unsupported_number', 'refuse', d.language, d.span, `the number ${d.value} is not a recorded fact of the cited evidence`, `الرقم ${d.value} غير مسجّل في الدليل المستشهَد به.`, 'a recorded score, maximum or criterion count');
    case 'TECHNOLOGY': return I('unsupported_technology', 'refuse', d.language, d.span, `technology '${d.value}' is not declared on the cited work`, `التقنية «${d.value}» غير مُعلَنة على العمل المستشهَد به.`, 'the technology declared on this project or its submission');
    case 'SKILL': {
      const f = facts.find((x) => x.kind === 'skill_level' && x.value === d.value);
      return I('unsupported_skill', 'refuse', d.language, d.span, `skill '${d.value}' is '${f?.state ?? 'not in the cited evidence'}'; a skill claim needs demonstrated evidence`,
        'تذكر الصياغة مهارة لم تُثبَت بعد بعمل مُقيَّم؛ وصف المشروع مسموح، لكن ادعاء المهارة يحتاج مستوى «مُثبَتة».', 'demonstrated evidence for this skill');
    }
    case 'OUTCOME': return I('unsupported_outcome', 'refuse', d.language, d.span, `the wording claims an unsupported outcome ("${d.span}"): no recorded fact measures an effect on users, a team or a business`,
      'تذكر الصياغة أثرًا أو نتيجة على مستخدمين أو عمل، ولا يوجد قياس مسجّل لذلك. صِفي ما بنيتِه وما قُيِّم فقط.', null);
    case 'PROFESSIONAL_CONTEXT': return I('unsupported_professional_context', 'refuse', d.language, d.span, `the wording asserts ${d.value}, which no evidence records`,
      'تقدّم الصياغة نشاط تعلّم كعمل مهني (جهة عمل · عميل · استخدام فعلي · شهادة · سنوات خبرة)، ولا يسجّل الدليل ذلك.', null);
    default: return I('unsupported_quality', 'refuse', d.language, d.span, `the wording asserts quality or mastery ("${d.span}") that no criterion records`,
      'تصف الصياغة جودة أو إتقانًا لا يذكره أي معيار مُقيَّم.', null);
  }
}

/* ──────────────────────────────── engine ─────────────────────────────── */

function unmappedSpans(cov: Coverage, text: string): string[] {
  const spans: string[] = []; let start = -1; let end = -1;
  cov.tokens.forEach((t, i) => {
    if (cov.cover[i] === null) { if (start < 0) start = t.start; end = t.end; }
    else if (start >= 0) { spans.push(text.slice(start, end)); start = -1; }
  });
  if (start >= 0) spans.push(text.slice(start, end));
  return spans;
}

function spanRange(text: string, span: PlanSpan): [number, number] | null {
  if (span.start !== undefined && text.slice(span.start, span.start + span.text.length) === span.text) return [span.start, span.start + span.text.length];
  const at = text.indexOf(span.text);
  return at < 0 ? null : [at, at + span.text.length];
}

export function groundClaim(input: GroundingInput): GroundingResult {
  const texts: [Lang, string][] = [['ar', input.ar]];
  if (input.en !== null && input.en.trim() !== '') texts.push(['en', input.en]);
  const factById = new Map(input.facts.map((f) => [f.id, f]));
  const issues: GroundingIssue[] = [];
  const assertions: GroundedAssertion[] = [];
  const cov = new Map<Lang, Coverage>(texts.map(([l, t]) => [l, coverText(t, l, input.facts, input.lexicon)]));

  if (!input.lexicon) issues.push(I('lexicon_not_validated', 'revise', null, null,
    'no grounding vocabulary is active in this environment; wording cannot be confirmed as grounded',
    'مفردات التحقق من الصياغة قيد الاعتماد في هذه البيئة، فلا يمكن تأكيد ارتباط الصياغة بالأدلة بعد.'));

  // Layer B — independent detectors over the whole wording.
  const detections = texts.flatMap(([l, t]) => detect(t, l, input));
  for (const d of detections) if (!detectionSupport(d, input.facts)) issues.push(detectionIssue(d, input.facts));

  if (input.plan) {
    // Layer A — the declared plan, checked against the cited records.
    const inSpans = new Map<Lang, boolean[]>(texts.map(([l]) => [l, cov.get(l)!.tokens.map(() => false)]));
    for (const a of input.plan.assertions) {
      const rule = SUPPORT_RULES[a.type];
      if (!rule) { issues.push(I('unknown_assertion_type', 'refuse', null, null, `unknown assertion type '${String(a.type)}'`, 'نوع ادعاء غير معروف في خطة الصياغة.')); continue; }
      const sev: 'refuse' | 'revise' = rule.risk === 'high' ? 'refuse' : 'revise';
      let status: GroundedAssertion['status'] = 'supported';
      const facts = a.factIds.map((id) => factById.get(id));
      if (facts.some((f) => !f)) {
        status = 'unsupported';
        issues.push(I('fact_not_in_cited_records', 'refuse', null, a.ar?.text ?? a.en?.text ?? null,
          `the plan cites fact(s) ${a.factIds.filter((id) => !factById.has(id)).join(', ')} that are not recorded for the cited evidence; a generator's declaration is not evidence`,
          'تستند الصياغة إلى وقائع غير موجودة في الدليل المستشهَد به.'));
      }
      if (rule.factKinds.length === 0) {
        status = 'unsupported';
        issues.push(I('no_fact_kind_can_support', 'refuse', null, a.ar?.text ?? a.en?.text ?? null, `${a.type} has no recorded fact kind in this product`, `${AR_TYPE[a.type]}: لا يسجّل المنتج وقائع من هذا النوع، فلا يمكن دعمه.`));
      } else if (a.type !== 'FRAMING' && a.factIds.length === 0) {
        status = 'unsupported';
        issues.push(I('no_supporting_fact', sev, null, a.ar?.text ?? a.en?.text ?? null, `${a.type} declares no supporting fact`, `${AR_TYPE[a.type]} بلا واقعة مسجّلة تدعمه.`, rule.factKinds.join(' | ')));
      }
      for (const f of facts) if (f && !rule.factKinds.includes(f.kind)) {
        status = 'unsupported';
        issues.push(I('fact_kind_mismatch', sev, null, a.ar?.text ?? a.en?.text ?? null, `${a.type} cannot be supported by a '${f.kind}' fact`, `${AR_TYPE[a.type]} لا تدعمه واقعة من نوع «${f.kind}».`));
      }
      for (const [l, t] of texts) {
        const span = l === 'ar' ? a.ar : a.en;
        if (!span) {
          if (a.type !== 'FRAMING') { status = status === 'supported' ? 'unmapped' : status; issues.push(I('language_parity', 'revise', l, null, `the ${l === 'ar' ? 'Arabic' : 'English'} wording lacks the ${a.type} assertion the other language makes`, 'النسختان العربية والإنجليزية لا تقولان الشيء نفسه.')); }
          continue;
        }
        const range = spanRange(t, span);
        if (!range) { status = 'unmapped'; issues.push(I('span_not_in_text', sev, l, span.text, 'a declared span does not appear in the wording', 'جزء مُعلَن في خطة الصياغة غير موجود في النص.')); continue; }
        const c = cov.get(l)!;
        c.tokens.forEach((tok, i) => {
          if (tok.start < range[0] || tok.end > range[1]) return;
          inSpans.get(l)![i] = true;
          const cv = c.cover[i] ?? null;
          // A number is the same fact whichever recorded number carries that value (a total and a met-count can both be 4).
          const sameNumber = cv !== null && cv.by === 'number' && a.factIds.some((id) => factById.get(id)?.kind === 'number' && factById.get(id)?.value === factById.get(cv.factId)?.value);
          const ok = cv !== null && (cv.by === 'lex' || sameNumber || a.factIds.includes(cv.factId));
          if (!ok) {
            if (status === 'supported') status = 'unmapped';
            issues.push(I('span_not_supported_by_its_facts', sev, l, tok.raw, `"${tok.raw}" in a ${a.type} span is not accounted for by the facts it cites`, `«${tok.raw}» غير مرتبطة بالواقعة التي يستند إليها هذا الجزء.`));
          }
        });
      }
      assertions.push({ type: a.type, spanAr: a.ar?.text ?? null, spanEn: a.en?.text ?? null, factIds: a.factIds, status, declared: true });
    }
    // Content outside every declared span must be plain framing.
    for (const [l, t] of texts) {
      const c = cov.get(l)!;
      c.tokens.forEach((tok, i) => {
        if (inSpans.get(l)![i]) return;
        const cv = c.cover[i];
        if (cv && cv.by === 'lex' && cv.cls === 'framing') return;
        if (cv && cv.by === 'lex') return; // gated vocabulary is legitimate glue
        if (cv) issues.push(I('outside_declared_assertions', 'revise', l, tok.raw, `"${tok.raw}" refers to a fact outside any declared assertion`, `«${tok.raw}» خارج أجزاء الصياغة المُعلَنة.`));
      });
      void t;
    }
    // A detection must be declared by an assertion of the matching type citing the supporting fact.
    for (const d of detections) {
      const f = detectionSupport(d, input.facts);
      if (!f) continue;
      const cites = (a: ClaimPlanAssertion) => a.factIds.includes(f.id) || (f.kind === 'number' && a.factIds.some((id) => factById.get(id)?.kind === 'number' && factById.get(id)?.value === f.value));
      const declared = input.plan.assertions.some((a) => cites(a) && (a.type === d.type || (d.type === 'NUMBER' && a.type === 'EVALUATION')));
      if (!declared) issues.push(I('detection_not_declared', 'refuse', d.language, d.span, `${d.type} '${d.value}' appears in the wording but no declared assertion of that type cites it`, `${AR_TYPE[d.type]} «${d.span}» غير مُعلَن في خطة الصياغة.`));
    }
  } else {
    // Without a plan, assertions are what the recorded facts account for.
    const seen = new Set<string>();
    for (const [, c] of cov) for (const id of c.matchedFacts) {
      if (seen.has(id)) continue; seen.add(id);
      const f = factById.get(id)!;
      assertions.push({ type: TYPE_OF_FACT[f.kind], spanAr: null, spanEn: null, factIds: [id], status: 'supported', declared: false });
    }
  }

  // Coverage: every token accounted for.
  const unmapped = { ar: [] as string[], en: [] as string[] };
  for (const [l, t] of texts) {
    const spans = unmappedSpans(cov.get(l)!, t);
    unmapped[l].push(...spans);
    for (const s of spans) issues.push(I('unmapped_clause', 'revise', l, s, `"${s}" is not accounted for by any recorded fact or approved wording`, `«${s}» غير مرتبطة بأي واقعة مسجّلة.`, 'a recorded fact, or removing this part'));
  }

  // Parity: both languages must rest on the same recorded facts.
  if (texts.length === 2) {
    const kinds: FactKind[] = ['project', 'technology', 'number', 'skill_level', 'criterion_met', 'deliverable'];
    const pick = (l: Lang) => new Set([...cov.get(l)!.matchedFacts].filter((id) => kinds.includes(factById.get(id)!.kind)));
    const a = pick('ar'); const e = pick('en');
    const diff = [...a].filter((x) => !e.has(x)).concat([...e].filter((x) => !a.has(x)));
    if (diff.length > 0) issues.push(I('language_parity', 'revise', null, diff.join(', '), `the Arabic and English wording rest on different facts (${diff.join(', ')})`, 'النسختان العربية والإنجليزية تستندان إلى وقائع مختلفة.'));
  }

  // Context (the learning track) only as "the … track", never as a job title.
  for (const [l] of texts) {
    const c = cov.get(l)!;
    const usesContext = [...c.matchedFacts].some((id) => factById.get(id)?.kind === 'context');
    const hasTerm = c.cover.some((cv) => cv?.by === 'lex' && cv.cls === 'context_term');
    if (usesContext && !hasTerm) issues.push(I('role_label_without_track', 'revise', l, null, 'the target role is named without saying it is the learning track; that reads as a job title',
      'يُذكر الدور المستهدف دون أنه مسار تعلّم، فيُقرأ كمسمّى وظيفي.'));
  }

  const supportedFacts = new Set([...cov.values()].flatMap((c) => [...c.matchedFacts]).filter((id) => factById.get(id)?.kind !== 'context'));
  if (supportedFacts.size === 0) issues.push(I('nothing_supported', 'revise', null, null, 'the wording states nothing a recorded fact supports', 'لا تذكر الصياغة شيئًا يستند إلى واقعة مسجّلة.'));

  const decision: GroundingDecision = issues.some((x) => x.severity === 'refuse') ? 'refused' : issues.length > 0 ? 'needs_revision' : 'grounded';
  const dedup = issues.filter((x, i) => issues.findIndex((y) => y.code === x.code && y.span === x.span && y.language === x.language) === i);
  return {
    decision, engineVersion: GROUNDING_ENGINE_VERSION, lexiconRef: input.lexicon?.ref ?? null, mode: input.plan ? 'declared_plan' : 'inferred',
    original: { ar: input.ar, en: input.en }, assertions, issues: dedup, unmapped,
    suggestedTrim: decision === 'grounded' ? null : suggestTrim(input),
    factsUsed: [...supportedFacts],
  };
}

/** Deletes clauses that are not fully accounted for; offered only if what remains is itself grounded. Never adds a word. */
function suggestTrim(input: GroundingInput): { ar: string; en: string | null } | null {
  const trim = (text: string, lang: Lang): string => {
    const parts = text.split(/(?<=[،,;؛.:])\s+|\s+[—–·-]\s+/);
    return parts.filter((p) => {
      const c = coverText(p, lang, input.facts, input.lexicon);
      if (c.cover.some((x) => x === null)) return false;
      return detect(p, lang, input).every((d) => detectionSupport(d, input.facts));
    }).join(' ').replace(/[،,;؛:—–·-]\s*$/, '').trim();
  };
  const ar = trim(input.ar, 'ar');
  const en = input.en ? trim(input.en, 'en') : null;
  if (!ar || ar === input.ar.trim()) return null;
  const again = groundClaim({ ...input, ar, en: en || null, plan: null });
  return again.decision === 'grounded' ? { ar, en: en || null } : null;
}
