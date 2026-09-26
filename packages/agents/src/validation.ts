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
  /** The technology vocabulary (data, seeded from track packs), with aliases. */
  readonly knownTechnologies: ReadonlyMap<string, readonly string[]>;
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

const INVENTED_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\b(at|for)\s+[A-Z][A-Za-z]+\s+(Inc|Ltd|LLC|Corp|Company|Bank|Group)\b/, 'an employer'],
  [/\bcertif(ied|ication|icate)\b/i, 'a certification'],
  [/(^|[\s،,.؛;:'"«»(])(شهادة|معتمد|معتمدة)($|[\s،,.؛;:'"«»)])/, 'a certification'],
  [/\b(senior|lead|principal|head of|manager)\b/i, 'seniority'],
  [/(^|[\s،,.؛;:'"«»(])(كبير|كبيرة|قائد|قائدة|رئيس|رئيسة|مدير|مديرة)($|[\s،,.؛;:'"«»)])/, 'seniority'],
  [/\b\d+\+?\s*(years?|yrs)\b/i, 'years of experience'],
  [/\bworked at\b/i, 'employment'],
];

export function validateAgainstDomain(
  p: Pick<AgentProposal, 'proposalType' | 'structuredPayload' | 'evidenceRefs'> & Partial<Pick<AgentProposal, 'summary' | 'rationale'>>,
  facts: DomainFacts,
): void {
  const payload = p.structuredPayload;

  // D-076 for EVERY proposal, wording or not: a technology term anywhere in
  // the text needs an approved source. Technical feedback that says "your
  // React component" infers a framework the user never declared.
  const everywhere = [p.summary ?? '', p.rationale ?? '', JSON.stringify(payload)].join(' ');
  for (const t of technologiesMentioned(everywhere, facts.knownTechnologies)) {
    if (!facts.approvedTechnologies.has(t)) throw new ProposalRejected('domain', `technology '${t}' has no approved source (user-declared, project metadata, artifact, or evidence metadata); it may not be inferred`);
  }

  if (payload.kind === 'wording') {
    // Every claim needs evidence that exists.
    if (WORDING_PROPOSAL_TYPES.has(p.proposalType) && p.proposalType !== 'linkedin_headline' && p.proposalType !== 'professional_summary' && p.proposalType !== 'linkedin_about') {
      if (p.evidenceRefs.length === 0) throw new ProposalRejected('domain', 'a wording proposal with no evidence reference is an unsupported claim');
      for (const ref of p.evidenceRefs) {
        if (!facts.existingEvidence.has(ref)) throw new ProposalRejected('domain', `evidence '${ref}' does not exist or was withdrawn`);
      }
    }
    // No skill presented above its state.
    for (const skillId of payload.namedSkillIds) {
      const state = facts.skillStates[skillId] ?? 'gap';
      if (evidenceOrdinal(state) < evidenceOrdinal('demonstrated')) {
        throw new ProposalRejected('domain', `skill '${skillId}' is '${state}'; it cannot be presented as a supported claim`);
      }
    }
    // D-076: a technology may appear only with an approved source. Named ones
    // and ones merely written into the text are checked the same way, against
    // the data-driven vocabulary — no hard-coded blacklist.
    const mentioned = new Set([
      ...payload.namedTechnologies,
      ...technologiesMentioned(payload.suggestedValueAr, facts.knownTechnologies),
      ...technologiesMentioned(payload.suggestedValueEn ?? '', facts.knownTechnologies),
    ]);
    for (const t of mentioned) {
      if (!facts.approvedTechnologies.has(t)) throw new ProposalRejected('domain', `technology '${t}' has no approved source (user-declared, project metadata, artifact, or evidence metadata); it may not be inferred`);
    }
    // Invented employer, title, years or certification: none of these has an
    // evidence path in this product, so any such assertion is unsupported.
    for (const [re, what] of INVENTED_PATTERNS) {
      if (re.test(payload.suggestedValueAr) || re.test(payload.suggestedValueEn ?? '')) throw new ProposalRejected('domain', `the wording asserts ${what}, which no evidence records`);
    }
    // No invented metric, no mastery language — the domain's own guard.
    try {
      assertNoUnsupportedLanguage(payload.suggestedValueAr, payload.suggestedValueEn ?? '');
    } catch (e) {
      if (e instanceof InvariantViolation) throw new ProposalRejected('domain', e.message);
      throw e;
    }
    // INV-4, generically: a number is a metric. A wording may carry only
    // numbers that are recorded facts — not "2x faster", not "from 3s to 1s".
    for (const n of new Set([...numbersIn(payload.suggestedValueAr), ...numbersIn(payload.suggestedValueEn ?? '')])) {
      if (!facts.numericFacts.has(n)) throw new ProposalRejected('domain', `the wording contains the number ${n}, which no recorded fact supports; a metric needs a measured source`);
    }
  }

  if (payload.kind === 'validation_activity' && payload.wouldPropose) {
    // A recommendation only. It may not name a state above the ceiling, and
    // it is never executed here — the domain's transition guard decides later.
    if (payload.wouldPropose.to === 'verified') throw new ProposalRejected('domain', 'an agent may not recommend Verified (D-059)');
  }
}
