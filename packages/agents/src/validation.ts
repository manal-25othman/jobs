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
  /** Technologies the user has explicitly declared. */
  readonly declaredTechnologies: ReadonlySet<string>;
}

export function validateAgainstDomain(
  p: Pick<AgentProposal, 'proposalType' | 'structuredPayload' | 'evidenceRefs'>,
  facts: DomainFacts,
): void {
  const payload = p.structuredPayload;

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
    // No technology the user did not declare (no framework inference).
    for (const t of payload.namedTechnologies) {
      if (!facts.declaredTechnologies.has(t)) throw new ProposalRejected('domain', `technology '${t}' was not declared by the user; it may not be inferred`);
    }
    // No invented metric, no mastery language — the domain's own guard.
    try {
      assertNoUnsupportedLanguage(payload.suggestedValueAr, payload.suggestedValueEn ?? '');
    } catch (e) {
      if (e instanceof InvariantViolation) throw new ProposalRejected('domain', e.message);
      throw e;
    }
    // Undeclared technology names appearing in the text itself.
    for (const tech of ['React', 'Vue', 'Angular', 'Next.js', 'Django', 'Spring']) {
      const inText = payload.suggestedValueAr.includes(tech) || (payload.suggestedValueEn ?? '').includes(tech);
      if (inText && !facts.declaredTechnologies.has(tech)) throw new ProposalRejected('domain', `'${tech}' appears in the wording but was not declared`);
    }
  }

  if (payload.kind === 'validation_activity' && payload.wouldPropose) {
    // A recommendation only. It may not name a state above the ceiling, and
    // it is never executed here — the domain's transition guard decides later.
    if (payload.wouldPropose.to === 'verified') throw new ProposalRejected('domain', 'an agent may not recommend Verified (D-059)');
  }
}
