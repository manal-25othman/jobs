/**
 * Integrity layer (Configurable Track Architecture, Phase 6).
 *
 * "Show that you understand the work you submitted — whether or not you used AI."
 *
 * Three things are kept apart:
 *   integrity signal      an observable FACT (structured), never a conclusion.
 *   assessment            what an evaluator observed (Phase 3); MAY take
 *                         signals as context once a context policy includes them.
 *   verification decision what a policy decided (Phase 3); never fed by signals
 *                         directly, never moved by them.
 *
 * What is fixed here (invariants):
 *   - NO AI-DETECTION THEATRE: no signal may come from writing style,
 *     formatting, token patterns, perplexity or any probabilistic "AI detector".
 *     Sources are a closed list of observable inputs; a payload carrying a
 *     detection/cheating field is refused.
 *   - a signal has no outcome: `outcome_effect` is always 'none' until a future
 *     APPROVED policy maps a signal to something.
 *   - declaring AI use is never a negative signal and never forces human review.
 *   - a challenge can be issued only for an enabled (validated) type under an
 *     active policy — and none is active in Phase 6.
 *   - a challenge result is an observation about understanding, never a
 *     verdict on honesty, never a verification effect.
 */

import { DomainError, IllegalTransition, InvariantViolation, MissingPrerequisite } from './errors.js';
import { resolveActiveConfig, type ChallengePolicy } from './configuration.js';

export const INTEGRITY_SIGNAL_SOURCES = ['disclosure', 'submitted_material', 'revision_diff', 'challenge_response', 'deterministic_check', 'explanation', 'human_reviewer'] as const;
export type IntegritySignalSource = (typeof INTEGRITY_SIGNAL_SOURCES)[number];

/** Named so a reviewer can see what is refused; none of these may ever produce a signal. */
export const FORBIDDEN_INFERENCE_METHODS = [
  'ai_text_detector', 'ai_code_detector', 'writing_style_analysis', 'formatting_fingerprint', 'token_pattern_analysis', 'perplexity_score', 'probabilistic_ai_detection',
] as const;

/** Keys that would turn a signal into a verdict or a detection claim. Refused anywhere in a signal payload. */
export const FORBIDDEN_SIGNAL_KEYS = [
  'fraud', 'is_fraud', 'cheating', 'cheating_score', 'ai_probability', 'ai_generated_probability', 'ai_generated_percent', 'ai_likelihood', 'detector_score', 'plagiarism_score', 'skill_rejected', 'verdict',
] as const;

export const SIGNAL_DIRECTIONS = ['neutral_context', 'consistent_with_understanding', 'inconsistent_with_understanding'] as const;
export type SignalDirection = (typeof SIGNAL_DIRECTIONS)[number];

export const INTEGRITY_SIGNAL_OUTCOME_EFFECT = 'none' as const;
export const INTEGRITY_VERIFICATION_EFFECT = 'none' as const;

export interface IntegritySignalType { code: string; allowedSources: readonly IntegritySignalSource[]; direction: SignalDirection }

export interface IntegritySignalDraft {
  signalType: string;
  source: IntegritySignalSource;
  observation: string;
  confidence: number | null;
  visibility: 'user_facing' | 'assessment_only';
  relatedEvidenceItemIds?: readonly string[];
  challengeInstanceId?: string | null;
  integrityCheckKey?: string | null;
  disclosureId?: string | null;
  policyKey?: string | null;
  policyVersion?: number | null;
  /** Any extra structured payload; checked for detection/verdict keys. */
  details?: Readonly<Record<string, unknown>>;
}

export function assertObservableSource(source: string): asserts source is IntegritySignalSource {
  if ((FORBIDDEN_INFERENCE_METHODS as readonly string[]).includes(source)) {
    throw new InvariantViolation('INV-3', `'${source}' is AI-detection theatre: NAQLA never infers AI authorship from style, format, tokens or probability`);
  }
  if (!(INTEGRITY_SIGNAL_SOURCES as readonly string[]).includes(source)) throw new DomainError(`'${source}' is not an observable integrity source`);
}

/** Refuses any payload that would smuggle a verdict or a detection score into a signal. */
export function assertNoDetectionTheatre(payload: unknown, path = 'signal'): void {
  if (Array.isArray(payload)) { payload.forEach((v, i) => assertNoDetectionTheatre(v, `${path}[${i}]`)); return; }
  if (payload && typeof payload === 'object') {
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      if ((FORBIDDEN_SIGNAL_KEYS as readonly string[]).includes(k)) throw new InvariantViolation('INV-3', `'${path}.${k}' is a verdict or a detection score; a signal records an observable fact only`);
      if ((FORBIDDEN_INFERENCE_METHODS as readonly string[]).includes(k)) throw new InvariantViolation('INV-3', `'${path}.${k}' is AI-detection theatre`);
      assertNoDetectionTheatre(v, `${path}.${k}`);
    }
  }
}

export function assertSignalWellFormed(type: IntegritySignalType, draft: IntegritySignalDraft): void {
  if (draft.signalType !== type.code) throw new DomainError(`signal type '${draft.signalType}' does not match '${type.code}'`);
  assertObservableSource(draft.source);
  if (!type.allowedSources.includes(draft.source)) throw new DomainError(`signal type '${type.code}' does not accept source '${draft.source}'`);
  if (!draft.observation || draft.observation.trim() === '') throw new MissingPrerequisite('observation', 'a signal states what was observed');
  if (draft.confidence !== null && (draft.confidence < 0 || draft.confidence > 1)) throw new DomainError('signal confidence must be within [0,1]');
  if (draft.source === 'challenge_response' && !draft.challengeInstanceId) throw new MissingPrerequisite('challengeInstanceId', 'a challenge signal names its challenge');
  if (draft.source === 'deterministic_check' && !draft.integrityCheckKey) throw new MissingPrerequisite('integrityCheckKey', 'a deterministic-check signal names its check');
  assertNoDetectionTheatre(draft);
}

/* ───────────── producers: observable facts only ───────────── */

/** Disclosure is context. Declaring AI use is recorded neutrally; it is never a negative signal. */
export function signalFromDisclosure(p: { disclosureId: string; questionnaireRef: string; aiUseDeclared: boolean | null; answeredCount: number }): IntegritySignalDraft {
  const used = p.aiUseDeclared === null ? 'not stated' : p.aiUseDeclared ? 'yes' : 'no';
  return { signalType: 'disclosure_recorded', source: 'disclosure', visibility: 'user_facing', confidence: null, disclosureId: p.disclosureId,
    observation: `disclosure answered with ${p.questionnaireRef} (${p.answeredCount} answer(s)); AI use declared: ${used}` };
}

export function signalFromResubmission(p: { attemptNumber: number; previousItemId: string; submissionItemId: string }): IntegritySignalDraft {
  return { signalType: 'resubmission_recorded', source: 'revision_diff', visibility: 'user_facing', confidence: null, relatedEvidenceItemIds: [p.submissionItemId, p.previousItemId],
    observation: `attempt ${p.attemptNumber} submitted; the previous attempt is kept for comparison` };
}

/** One signal per deterministic check that did not pass. Visibility follows the check's own classification. */
export function signalsFromIntegrityChecks(checks: readonly { key: string; passed: boolean; classification: 'user_facing' | 'assessment_only' }[]): IntegritySignalDraft[] {
  return checks.filter((c) => !c.passed).map((c) => ({ signalType: 'deterministic_check_unmet', source: 'deterministic_check' as const, visibility: c.classification, confidence: null,
    integrityCheckKey: c.key, observation: `deterministic check '${c.key}' did not pass over the submitted artifacts` }));
}

/* ───────────── challenges ───────────── */

export const CHALLENGE_STATUSES = ['issued', 'answered', 'reviewed', 'expired', 'withdrawn'] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];
const CHALLENGE_TRANSITIONS: ReadonlyArray<readonly [ChallengeStatus, ChallengeStatus]> = [
  ['issued', 'answered'], ['issued', 'expired'], ['issued', 'withdrawn'], ['answered', 'reviewed'], ['answered', 'withdrawn'],
];
export function assertChallengeTransition(from: ChallengeStatus, to: ChallengeStatus): void {
  if (!CHALLENGE_TRANSITIONS.some(([f, t]) => f === from && t === to)) throw new IllegalTransition('challenge', from, to, 'challenge lifecycle is issued → answered → reviewed (or expired / withdrawn)');
}

export const CHALLENGE_OUTCOMES = ['understanding_shown', 'understanding_not_shown', 'inconclusive'] as const;
export type ChallengeOutcome = (typeof CHALLENGE_OUTCOMES)[number];
export const CHALLENGE_EVALUATOR_KINDS = ['human', 'deterministic'] as const;
export type ChallengeEvaluatorKind = (typeof CHALLENGE_EVALUATOR_KINDS)[number];

export interface ChallengeTypeSpec { code: string; enabled: boolean; reviewStatus: string; approvedBy: string | null }

/**
 * A challenge may be issued only for an enabled, validated type, and — when a
 * policy issues it — only under a policy active in this environment. In Phase 6
 * nothing is enabled, so this always refuses in the product.
 */
export function assertChallengeIssuable(p: { type: ChallengeTypeSpec; issuedBy: 'policy' | 'human_reviewer'; policy: ChallengePolicy | null; production: boolean }): void {
  const t = p.type;
  if (!t.enabled || (t.reviewStatus !== 'approved' && t.reviewStatus !== 'published') || !t.approvedBy) {
    throw new MissingPrerequisite('challenge_type', `challenge type '${t.code}' is not enabled (DRAFT / NOT VALIDATED); no challenge can be issued`);
  }
  if (p.issuedBy === 'policy') {
    if (!p.policy) throw new MissingPrerequisite('challenge_policy', 'a policy-issued challenge names its policy');
    if (!p.policy.challengeTypes.includes(t.code)) throw new DomainError(`challenge policy ${p.policy.key}@${p.policy.version} does not list type '${t.code}'`);
    if (resolveActiveConfig([p.policy], { production: p.production }).row === null) throw new MissingPrerequisite('challenge_policy', `challenge policy ${p.policy.key}@${p.policy.version} is not active in this environment`);
  }
}

/** A result becomes a signal about understanding — never a verdict, never a verification effect. */
export function signalFromChallengeResult(p: { challengeInstanceId: string; outcome: ChallengeOutcome; observations: string; confidence: number | null; policyKey: string | null; policyVersion: number | null }): IntegritySignalDraft {
  if (!(CHALLENGE_OUTCOMES as readonly string[]).includes(p.outcome)) throw new DomainError(`unknown challenge outcome '${p.outcome}'`);
  const code = p.outcome === 'understanding_shown' ? 'challenge_understanding_shown' : p.outcome === 'understanding_not_shown' ? 'challenge_understanding_not_shown' : 'challenge_inconclusive';
  return { signalType: code, source: 'challenge_response', visibility: 'user_facing', confidence: p.confidence, challengeInstanceId: p.challengeInstanceId,
    policyKey: p.policyKey, policyVersion: p.policyVersion, observation: p.observations };
}

/** User-facing wording (owner). A challenge is a short verification step, never an accusation. */
export const CHALLENGE_INTRO_AR = 'خطوة تحقق قصيرة تساعدنا على تأكيد فهمك للعمل';
export const DISCLOSURE_INTRO_AR = 'استخدام أدوات الذكاء الاصطناعي مسموح. تساعدنا هذه الأسئلة على فهم طريقة عملك وما الذي أنجزته وراجعته بنفسك.';
