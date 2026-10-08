/**
 * Two gates every candidate passes before it is a proposal.
 *
 *   1. Schema validation — is this shaped like a proposal at all?
 *   2. Domain validation — does what it claims survive the domain's rules?
 *
 * Neither gate is bypassable: the gateway calls both, and the approval path
 * calls the second again, because a proposal can age past its evidence.
 */
import {
  assertNoUnsupportedLanguage, evidenceOrdinal, type EvidenceState, InvariantViolation,
} from '@naqla/domain';
import {
  PROPOSAL_TYPES, WORDING_PROPOSAL_TYPES, agentDefinition,
  type AgentProposal, type AgentType, type ProposalPayload, type ProposalType,
} from './contracts.js';

export class ProposalRejected extends Error {
  override readonly name = 'ProposalRejected';
  constructor(readonly code: 'schema' | 'domain' | 'forbidden_action', message: string) { super(message); }
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

/** Keys whose presence means the agent tried to act rather than propose. */
const FORBIDDEN_ACTION_KEYS = [
  'evidenceState', 'newState', 'setState', 'promote', 'transition', 'evaluationResultPatch',
  'evaluation_result', 'overrideChecks', 'publish', 'markDemonstrated', 'markVerified', 'score', 'outcome',
];

export function validateSchema(agentType: AgentType, raw: unknown): Omit<AgentProposal, 'proposalId' | 'invocationId' | 'createdAt' | 'agentType' | 'requiresDomainValidation'> {
  if (!raw || typeof raw !== 'object') throw new ProposalRejected('schema', 'candidate is not an object');
  const c = raw as Record<string, unknown>;
  const def = agentDefinition(agentType);

  if (!isStr(c['proposalType']) || !(PROPOSAL_TYPES as readonly string[]).includes(c['proposalType'])) {
    throw new ProposalRejected('schema', `unknown proposalType '${String(c['proposalType'])}'`);
  }
  const proposalType = c['proposalType'] as ProposalType;
  if (!def.proposalTypes.includes(proposalType)) {
    throw new ProposalRejected('schema', `agent '${agentType}' may not emit '${proposalType}'`);
  }
  for (const k of ['subjectType', 'subjectId', 'summary', 'rationale']) {
    if (!isStr(c[k]) || (c[k] as string).trim() === '') throw new ProposalRejected('schema', `missing '${k}'`);
  }
  if (!isArr(c['evidenceRefs']) || !isArr(c['sourceRefs']) || !isArr(c['warnings'])) {
    throw new ProposalRejected('schema', 'evidenceRefs, sourceRefs and warnings must be arrays');
  }
  const payload = c['structuredPayload'];
  if (!payload || typeof payload !== 'object' || !isStr((payload as Record<string, unknown>)['kind'])) {
    throw new ProposalRejected('schema', 'structuredPayload must be a typed payload, not a blob');
  }
  // An agent that tries to act, anywhere in its payload, is refused outright.
  const flat = JSON.stringify(payload) + JSON.stringify(c['summary']);
  for (const k of FORBIDDEN_ACTION_KEYS) {
    if (new RegExp(`"${k}"\\s*:`).test(flat)) {
      throw new ProposalRejected('forbidden_action', `payload carries '${k}': agents propose, they never act`);
    }
  }
  const p = payload as ProposalPayload;
  if (WORDING_PROPOSAL_TYPES.has(proposalType)) {
    if (p.kind !== 'wording') throw new ProposalRejected('schema', `'${proposalType}' needs a wording payload`);
    if (!isStr(p.suggestedValueAr) || !isArr(p.supportingSources) || !isArr(p.namedSkillIds) || !isArr(p.namedTechnologies) || !isStr(p.reason)) {
      throw new ProposalRejected('schema', 'wording payload is incomplete');
    }
    if (!['none', 'low', 'high'].includes(p.unsupportedRisk)) throw new ProposalRejected('schema', 'unsupportedRisk must be set');
    // Phase 7b: a declared claim plan is structure, not evidence; malformed ⇒ refused here, its content is checked by grounding.
    const plan = (p as { claimPlan?: unknown }).claimPlan;
    if (plan !== undefined) {
      const as = (plan as { assertions?: unknown } | null)?.assertions;
      const span = (x: unknown) => x === null || (!!x && typeof x === 'object' && isStr((x as Record<string, unknown>)['text']));
      if (!isArr(as) || !as.every((a) => !!a && typeof a === 'object' && isStr((a as Record<string, unknown>)['type']) && isArr((a as Record<string, unknown>)['factIds'])
          && span((a as Record<string, unknown>)['ar']) && span((a as Record<string, unknown>)['en']))) {
        throw new ProposalRejected('schema', 'claimPlan must be { assertions: [{ type, ar: {text}|null, en: {text}|null, factIds: [] }] }');
      }
    }
  }
  const requiresUserApproval = WORDING_PROPOSAL_TYPES.has(proposalType) ? true : c['requiresUserApproval'] === true;

  return {
    proposalType, subjectType: c['subjectType'] as AgentProposal['subjectType'], subjectId: c['subjectId'] as string,
    summary: c['summary'] as string, structuredPayload: p,
    evidenceRefs: (c['evidenceRefs'] as unknown[]).filter(isStr),
    sourceRefs: (c['sourceRefs'] as unknown[]).filter((r) => r && typeof r === 'object') as AgentProposal['sourceRefs'],
    rationale: c['rationale'] as string, warnings: (c['warnings'] as unknown[]).filter(isStr),
    requiresUserApproval,
  };
}

/** What the domain-validation gate needs to know about the world. */
export interface DomainFacts {
  /** skillId → current evidence state. Missing = gap. */
  readonly skillStates: Readonly<Record<string, EvidenceState>>;
  /** Evidence ids that exist and are not withdrawn. */
  readonly existingEvidence: ReadonlySet<string>;
  /**
   * D-076: technologies with an APPROVED source — user-declared, project
   * metadata, project artifact, or evidence metadata. Anything else is
   * unsupported, whatever the wording implies.
   */
  readonly approvedTechnologies: ReadonlySet<string>;
  /**
   * Phase 7: the approved technologies behind EACH piece of evidence (its
   * project and that project's submissions). A wording that cites evidence may
   * name only technologies declared for the work it cites — a technology
   * declared on another project is not evidence for this claim.
   */
  readonly approvedTechnologiesByEvidence: ReadonlyMap<string, ReadonlySet<string>>;
  /** The technology vocabulary (data, seeded from track packs), with aliases. */
  readonly knownTechnologies: ReadonlyMap<string, readonly string[]>;
  /**
   * Phase 7: the skill vocabulary (skillId → labels), so a skill written into
   * the wording counts as asserted even when the proposal does not name it.
   * Labels that are also technology terms are governed by D-076 instead.
   */
  readonly knownSkills: ReadonlyMap<string, readonly string[]>;
  /**
   * Numbers a wording may contain, as strings: recorded scores, maxima and
   * met-criterion counts of the user's evaluations. Any other number in a
   * professional wording is an invented metric (INV-4), whatever its unit.
   */
  readonly numericFacts: ReadonlySet<string>;
}

/** Every number in a text, Arabic-Indic digits normalised to ASCII. */
export function numbersIn(text: string): string[] {
  const ascii = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return ascii.match(/\d+(?:\.\d+)?/g) ?? [];
}

/** Arabic matching form: no diacritics or tatweel, alef variants folded, ta marbuta/alef maqsura kept. */
export function normalizeArabic(text: string): string {
  return text.replace(/[ً-ْٰـ]/g, '').replace(/[أإآ]/g, 'ا');
}

/** Finds vocabulary terms present in the text, by term or alias, word-bounded. */
export function technologiesMentioned(text: string, known: ReadonlyMap<string, readonly string[]>): string[] {
  const found: string[] = [];
  for (const [term, aliases] of known) {
    for (const t of [term, ...aliases]) {
      const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`, 'i').test(text)) { found.push(term); break; }
    }
  }
  return found;
}

/**
 * Skills whose label is written into the text (Arabic normalised, English
 * word-bounded). A label that is also a technology term is skipped: naming a
 * declared technology is D-076's question, not a skill assertion.
 */
export function skillsMentioned(text: string, skills: ReadonlyMap<string, readonly string[]>, technologies: ReadonlyMap<string, readonly string[]>): string[] {
  const techTerms = new Set([...technologies].flatMap(([t, a]) => [t, ...a]).map((x) => x.toLowerCase()));
  // Longest label first, and a matched span is consumed: "إدارة حالة الواجهة والتفاعل"
  // is one skill, not also the shorter "إدارة حالة الواجهة" it begins with.
  const labels = [...skills].flatMap(([skillId, ls]) => ls.map((l) => ({ skillId, label: normalizeArabic(l.trim()) })))
    .filter((x) => x.label.length >= 3 && !techTerms.has(x.label.toLowerCase()))
    .sort((a, b) => b.label.length - a.label.length);
  let rest = normalizeArabic(text);
  const found = new Set<string>();
  for (const { skillId, label } of labels) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^A-Za-z0-9\\u0600-\\u06FF])${esc}(?=[^A-Za-z0-9\\u0600-\\u06FF]|$)`, 'gi');
    if (re.test(rest)) { found.add(skillId); rest = rest.replace(re, (_m, pre: string) => `${pre} `); }
  }
  return [...found];
}

const AR_B = '(^|[\\s،,.؛;:\'"«»(])';
const AR_E = '($|[\\s،,.؛;:\'"«»)])';

export const INVENTED_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\b(at|for)\s+[A-Z][A-Za-z]+\s+(Inc|Ltd|LLC|Corp|Company|Bank|Group)\b/, 'an employer'],
  [/\bcertif(ied|ication|icate)\b/i, 'a certification'],
  [/(^|[\s،,.؛;:'"«»(])(شهادة|معتمد|معتمدة)($|[\s،,.؛;:'"«»)])/, 'a certification'],
  [/\b(senior|lead|principal|head of|manager)\b/i, 'seniority'],
  [/(^|[\s،,.؛;:'"«»(])(كبير|كبيرة|قائد|قائدة|رئيس|رئيسة|مدير|مديرة)($|[\s،,.؛;:'"«»)])/, 'seniority'],
  [/\b\d+\+?\s*(years?|yrs)\b/i, 'years of experience'],
  [/\bworked at\b/i, 'employment'],
];

/**
 * Phase 7 — a completed learning activity is not professional work. Clients,
 * production use, real users and employment have no evidence path in this
 * product, so a wording that asserts them is unsupported. Matched on the
 * normalised text; the list is reviewable data, not a model.
 */
export const PROFESSIONAL_WORK_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\b(for|with)\s+(a|an|the|our|my|their)?\s*(clients?|customers?|employers?)\b/i, 'a client or employer'],
  [new RegExp(`${AR_B}(لعميل|للعميل|للعملاء|لعملاء|لصالح\\s+(شركة|عميل|جهة))`), 'a client or employer'],
  [/\b(in|to|into|for)\s+production\b|\bproduction (users|traffic|environment)\b/i, 'production use'],
  [/(بيئة\s+الانتاج|في\s+الانتاج|للانتاج)/, 'production use'],
  [/\b(real|paying|active|live)\s+(users|customers|clients)\b/i, 'real users'],
  [/(مستخدمين\s+حقيقيين|مستخدمون\s+حقيقيون|عملاء\s+حقيقيين|عملاء\s+فعليين)/, 'real users'],
  [/\b(internship|intern at|employed (at|by)|full-time|part-time|freelanc\w*|professional experience|work experience)\b/i, 'employment'],
  [new RegExp(`${AR_B}(تدريب\\s+(تعاوني|ميداني)|متدربة?\\s+في|عملت\\s+في\\s+شركة|موظفة?\\s+في|خبرة\\s+(مهنية|عملية|وظيفية)|عمل\\s+حر)`), 'employment'],
];

/**
 * Phase 7 / REC-006 — outcome claims. No recorded fact in this product
 * measures an effect on users, a team or a business, so a wording that claims
 * one ("which made onboarding smoother", "ما جعل … أسلس") is unsupported with
 * or without a number. Deterministic and provider-independent: the lexicon is
 * reviewable data. Its limit is a paraphrase outside the lexicon (reported).
 */
export const OUTCOME_PATTERNS: readonly RegExp[] = [
  // connective + effect verb: "which made", "that helped", "thereby reduced". Functional
  // descriptions of the artefact ("a form that lets users add habits") are not matched.
  /\b(which|that|this|thereby|so that)\s+(\w+\s+){0,2}?(made|led|resulted|helped|improved|improves|reduced|reduces|increased|increases|cut|boosted|boosts|saved|lowered|raised|drove|eased)\b/i,
  /\b(resulting in|leading to|led to|contributed to|helping to|which means)\b/i,
  // effect verb + business/user object
  /\b(improv|reduc|increas|boost|cut|sav|lower|rais|optimi[sz]|streamlin|accelerat|enhanc|doubl|halv|minimi[sz]|maximi[sz])\w*\b[^.;]{0,40}\b(performance|speed|load(ing)? times?|efficiency|conversions?|engagement|retention|satisfaction|revenue|sales|costs?|tickets|complaints|churn|onboarding|productivity|user experience|bounce|traffic|downloads|adoption|errors? rates?)\b/i,
  // comparative outcome adjectives
  /\b(smoother|faster|easier|more (efficient|intuitive|engaging|reliable|stable|performant|user-friendly|productive))\b/i,
  // reactions of people who are not in the evidence
  /\b(users?|customers?|clients?|stakeholders?|visitors?|the team)\s+(\w+\s+)?(loved|liked|praised|adopted|preferred|appreciated|reported|found it)\b/i,
  // Arabic: connective + effect verb ("ما جعل", "مما أدى")
  new RegExp(`${AR_B}(ما|مما)\\s+(جعل|جعلت|ادى|ادت|ساعد|ساعدت|ساهم|ساهمت|اسهم|اسهمت|حسن|حسنت|قلل|قللت|خفض|خفضت|زاد|زادت|رفع|رفعت|سرع|سرعت|وفر|وفرت|سهل|سهلت)${AR_E}`),
  /(ادى|ادت|ادي)\s+(ذلك\s+)?الى/,
  /(ساهم|ساهمت|اسهم|اسهمت)\s+في\s+(تحسين|تقليل|زيادة|رفع|خفض|تسريع|تسهيل|توفير)/,
  // Arabic: comparative outcome adjectives
  new RegExp(`${AR_B}(اسلس|اسرع|اسهل|اكثر\\s+(سلاسة|كفاءة|سهولة|موثوقية|استقرارا|فعالية|انتاجية))${AR_E}`),
  // Arabic: effect verb + business/user object
  /(حسنت|حسن|تحسين|قللت|قلل|تقليل|خفضت|خفض|تخفيض|زدت|زاد|زيادة|رفعت|رفع|سرعت|تسريع|وفرت|توفير|ضاعفت|مضاعفة)\s+(\S+\s+){0,2}?(الاداء|الكفاءة|السرعة|التحويل|التفاعل|الاحتفاظ|الرضا|الايرادات|المبيعات|التكاليف|التكلفة|التذاكر|تذاكر|الشكاوى|الانتاجية|تجربة\s+المستخدم|الزيارات|التنزيلات|زمن\s+التحميل|وقت\s+التحميل)/,
  // Arabic: reactions
  /(المستخدمون|المستخدمين|العملاء|الفريق)\s+(\S+\s+)?(احبوا|اشادوا|فضلوا|تبنوا|استحسنوا)/,
];

export function outcomeClaimIn(text: string): string | null {
  const t = normalizeArabic(text);
  for (const re of OUTCOME_PATTERNS) { const m = re.exec(t); if (m) return m[0].trim(); }
  return null;
}

/** One named grounding check and its result, recorded with a claim draft so the user sees what was checked. */
export interface GroundingCheck { readonly check: string; readonly passed: boolean; readonly detail: string }

type Check = readonly [string, () => string | null];

function domainChecks(
  p: Pick<AgentProposal, 'proposalType' | 'structuredPayload' | 'evidenceRefs'> & Partial<Pick<AgentProposal, 'summary' | 'rationale'>>,
  facts: DomainFacts,
): Check[] {
  const payload = p.structuredPayload;
  const checks: Check[] = [];

  // D-076 for EVERY proposal, wording or not: a technology term anywhere in
  // the text needs an approved source. Technical feedback that says "your
  // React component" infers a framework the user never declared.
  checks.push(['technology_sources', () => {
    const everywhere = [p.summary ?? '', p.rationale ?? '', JSON.stringify(payload)].join(' ');
    for (const t of technologiesMentioned(everywhere, facts.knownTechnologies)) {
      if (!facts.approvedTechnologies.has(t)) return `technology '${t}' has no approved source (user-declared, project metadata, artifact, or evidence metadata); it may not be inferred`;
    }
    return null;
  }]);

  if (payload.kind !== 'wording') return checks;
  const texts = [payload.suggestedValueAr, payload.suggestedValueEn ?? ''];

  // Every claim needs evidence that exists.
  checks.push(['evidence_exists', () => {
    if (WORDING_PROPOSAL_TYPES.has(p.proposalType) && p.proposalType !== 'linkedin_headline' && p.proposalType !== 'professional_summary' && p.proposalType !== 'linkedin_about') {
      if (p.evidenceRefs.length === 0) return 'a wording proposal with no evidence reference is an unsupported claim';
      for (const ref of p.evidenceRefs) {
        if (!facts.existingEvidence.has(ref)) return `evidence '${ref}' does not exist or was withdrawn`;
      }
    }
    return null;
  }]);
  // No skill presented above its state — named by id OR written into the text
  // (Phase 7: a submitted project is not a demonstrated skill, however worded).
  checks.push(['skill_levels', () => {
    const asserted = new Set([...payload.namedSkillIds, ...texts.flatMap((t) => skillsMentioned(t, facts.knownSkills, facts.knownTechnologies))]);
    for (const skillId of asserted) {
      const state = facts.skillStates[skillId] ?? 'gap';
      if (evidenceOrdinal(state) < evidenceOrdinal('demonstrated')) {
        return `skill '${skillId}' is '${state}'; it cannot be presented as a supported claim`;
      }
    }
    return null;
  }]);
  // D-076: a technology may appear only with an approved source. Named ones
  // and ones merely written into the text are checked the same way, against
  // the data-driven vocabulary — no hard-coded blacklist. Phase 7: when the
  // wording cites evidence, the source must be the cited work itself.
  checks.push(['technology_grounding', () => {
    const mentioned = new Set([...payload.namedTechnologies, ...texts.flatMap((t) => technologiesMentioned(t, facts.knownTechnologies))]);
    for (const t of mentioned) {
      if (!facts.approvedTechnologies.has(t)) return `technology '${t}' has no approved source (user-declared, project metadata, artifact, or evidence metadata); it may not be inferred`;
      if (p.evidenceRefs.length > 0 && !p.evidenceRefs.some((ref) => facts.approvedTechnologiesByEvidence.get(ref)?.has(t))) {
        return `technology '${t}' is not declared on the work behind the cited evidence; a technology declared elsewhere is not evidence for this claim`;
      }
    }
    return null;
  }]);
  // Invented employer, title, years or certification: none of these has an
  // evidence path in this product, so any such assertion is unsupported.
  checks.push(['no_invented_credentials', () => {
    for (const [re, what] of INVENTED_PATTERNS) {
      if (texts.some((t) => re.test(t))) return `the wording asserts ${what}, which no evidence records`;
    }
    return null;
  }]);
  // Phase 7: a completed activity is not a professional achievement.
  checks.push(['no_professional_work_claim', () => {
    for (const [re, what] of PROFESSIONAL_WORK_PATTERNS) {
      if (texts.some((t) => re.test(normalizeArabic(t)))) return `the wording presents a learning activity as professional work (${what}), which no evidence records`;
    }
    return null;
  }]);
  // No invented metric, no mastery language — the domain's own guard.
  checks.push(['no_mastery_or_metric_language', () => {
    try { assertNoUnsupportedLanguage(payload.suggestedValueAr, payload.suggestedValueEn ?? ''); return null; } catch (e) {
      if (e instanceof InvariantViolation) return e.message;
      throw e;
    }
  }]);
  // INV-4, generically: a number is a metric. A wording may carry only
  // numbers that are recorded facts — not "2x faster", not "from 3s to 1s".
  checks.push(['numbers_are_recorded_facts', () => {
    for (const n of new Set(texts.flatMap((t) => numbersIn(t)))) {
      if (!facts.numericFacts.has(n)) return `the wording contains the number ${n}, which no recorded fact supports; a metric needs a measured source`;
    }
    return null;
  }]);
  // REC-006: an outcome without a number is still an outcome claim.
  checks.push(['no_unsupported_outcome', () => {
    for (const t of texts) {
      const hit = outcomeClaimIn(t);
      if (hit) return `the wording claims an unsupported outcome ("${hit}"): no recorded fact measures an effect on users, a team or a business; describe what was built and evaluated instead`;
    }
    return null;
  }]);
  return checks;
}

/** Runs every check and reports each; used to record what a claim draft was grounded against. */
export function groundingChecks(
  p: Pick<AgentProposal, 'proposalType' | 'structuredPayload' | 'evidenceRefs'> & Partial<Pick<AgentProposal, 'summary' | 'rationale'>>,
  facts: DomainFacts,
): GroundingCheck[] {
  return domainChecks(p, facts).map(([check, run]) => { const fail = run(); return { check, passed: fail === null, detail: fail ?? 'passed' }; });
}

export function validateAgainstDomain(
  p: Pick<AgentProposal, 'proposalType' | 'structuredPayload' | 'evidenceRefs'> & Partial<Pick<AgentProposal, 'summary' | 'rationale'>>,
  facts: DomainFacts,
): void {
  const payload = p.structuredPayload;
  for (const [, run] of domainChecks(p, facts)) {
    const fail = run();
    if (fail) throw new ProposalRejected('domain', fail);
  }

  if (payload.kind === 'validation_activity' && payload.wouldPropose) {
    // A recommendation only. It may not name a state above the ceiling, and
    // it is never executed here — the domain's transition guard decides later.
    if (payload.wouldPropose.to === 'verified') throw new ProposalRejected('domain', 'an agent may not recommend Verified (D-059)');
  }
}
