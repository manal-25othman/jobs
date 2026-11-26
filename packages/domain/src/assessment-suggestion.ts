/**
 * A13 — a SUGGESTION per rubric criterion for the human reviewer, and the calibration metrics that decide, later and
 * per criterion, whether any of it may ever be automated (docs/evaluation/AUTOMATED-ASSESSMENT-QUALITY-METRICS.md).
 *
 *  - A suggestion is never a decision: shown to the assigned reviewer only, never to the graduate, never written as a
 *    score, evidence or level. INV-3 (verification is human) is untouched.
 *  - Layers stay separate: the inputs are layer-1 test observations and the deterministic rule result; the output is a
 *    layer-2 suggestion; skill proof and readiness are never computed here.
 *  - Grounded: every suggestion cites an excerpt that exists in its inputs (Q11).
 *  - A `human` criterion is never decided: a suggestion is offered only where automated tests observe it, capped
 *    at 0.5 (0.4 for a mandatory «met»), and is otherwise «uncertain».
 *  - Shadow stage: EVERY suggestion escalates to a person until a named calibration decision, whatever its confidence.
 *    80% agreement is an initial test indicator, never an authorisation (owner decision 4).
 */
import { DomainError } from './errors.js';
import type { CriterionTestSummary } from './test-run.js';

export const SUGGESTION_VALUES = ['met', 'unmet', 'uncertain'] as const;
export type SuggestionValue = (typeof SUGGESTION_VALUES)[number];

export const SUGGESTION_NOT_DECISION_AR = 'اقتراح آلي للمراجِع فقط، وليس قرارًا. القرار لكِ، ولا يُعرض الاقتراح على الخرّيج.';
export const CALIBRATION_NOT_APPROVED_AR = 'المعايرة غير معتمدة بعد: كل اقتراح يُحال إلى إنسان مهما كانت نسبة الثقة.';

export interface CriterionSuggestionInput {
  readonly criterionKey: string;
  readonly mandatory: boolean;
  /** The rubric's declared decider. A `human` criterion is never suggested as met/unmet. */
  readonly evaluatorType: 'rule' | 'llm' | 'human';
  /** The deterministic rule result when the criterion has a rule; null when it has none. */
  readonly ruleMet: boolean | null;
  readonly ruleExcerpt: string | null;
  /** Layer-1 observations for this criterion (from R2), or null when no run covers it. */
  readonly tests: CriterionTestSummary | null;
  /** Neutral labels of the tests behind `tests`, with their outcomes — the only excerpts a test basis may cite. */
  readonly testLabels: readonly { readonly labelAr: string; readonly outcome: string; readonly mode: string }[];
}

export interface SuggestionContext {
  readonly packApproved: boolean;
  readonly calibrationApproved: boolean;
  readonly gamingSignals: readonly string[];
  readonly injectionSuspected: boolean;
}

export interface CriterionSuggestion {
  readonly criterionKey: string;
  readonly suggestion: SuggestionValue;
  /** 0..1, two decimals. A statement about the inputs' agreement, not about the graduate. */
  readonly confidence: number;
  readonly excerptAr: string;
  readonly basis: readonly ('tests' | 'rule')[];
  readonly escalate: boolean;
  readonly escalationReasons: readonly string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function suggestCriterion(i: CriterionSuggestionInput, ctx: SuggestionContext): CriterionSuggestion {
  const reasons: string[] = [];
  if (!ctx.calibrationApproved) reasons.push('calibration_not_approved');
  if (!ctx.packApproved && i.tests) reasons.push('pack_not_approved');
  if (ctx.gamingSignals.length) reasons.push('gaming_signals');
  if (ctx.injectionSuspected) reasons.push('injection_suspected');

  const failedLabel = i.testLabels.find((t) => t.mode === 'automated' && t.outcome === 'fail')?.labelAr ?? null;
  const anyLabel = i.testLabels.find((t) => t.mode === 'automated')?.labelAr ?? i.testLabels[0]?.labelAr ?? null;

  // A criterion the rubric gives to a person is never decided here. Where automated tests observe it, a suggestion is
  // still offered — that is where the reviewer most needs help — with confidence capped; with no automated
  // observation it stays uncertain.
  const human = i.evaluatorType === 'human';
  if (human) {
    reasons.push('human_criterion');
    const automated = i.testLabels.some((t) => t.mode === 'automated');
    if (!automated || !i.tests || i.tests.observation === 'human_only') {
      return { criterionKey: i.criterionKey, suggestion: 'uncertain', confidence: 0, excerptAr: anyLabel ?? i.ruleExcerpt ?? 'بند يقرره إنسان', basis: i.tests ? ['tests'] : [], escalate: true, escalationReasons: reasons };
    }
  }

  const testView = i.tests && i.tests.observation !== 'human_only' ? i.tests.observation : null;
  const fromTests: SuggestionValue | null = testView === 'all_passed' ? 'met' : testView === 'some_failed' ? 'unmet' : testView === 'inconclusive' ? 'uncertain' : null;
  const fromRule: SuggestionValue | null = i.ruleMet === null ? null : i.ruleMet ? 'met' : 'unmet';

  let suggestion: SuggestionValue; let confidence: number; const basis: ('tests' | 'rule')[] = [];
  if (fromTests && fromRule) {
    basis.push('tests', 'rule');
    if (fromTests === fromRule) { suggestion = fromTests; confidence = 0.9; }
    else { suggestion = 'uncertain'; confidence = 0.3; reasons.push('signals_conflict'); }
  } else if (fromTests) { basis.push('tests'); suggestion = fromTests; confidence = fromTests === 'uncertain' ? 0.2 : 0.75; }
  else if (fromRule) { basis.push('rule'); suggestion = fromRule; confidence = 0.6; }
  else { suggestion = 'uncertain'; confidence = 0; reasons.push('no_signal'); }

  if (suggestion === 'uncertain') reasons.push('inconclusive');
  if (!ctx.packApproved && basis.includes('tests')) confidence = Math.min(confidence, 0.7);
  if (ctx.gamingSignals.length || ctx.injectionSuspected) confidence = Math.min(confidence, 0.3);
  // A met suggestion on a mandatory criterion is the costly error (Q3): it is never more confident than the rule allows.
  if (suggestion === 'met' && i.mandatory && !basis.includes('rule')) confidence = Math.min(confidence, 0.65);
  if (human) confidence = Math.min(confidence, suggestion === 'met' && i.mandatory ? 0.4 : 0.5);

  const excerptAr = (suggestion === 'unmet' && failedLabel) || (basis.includes('tests') ? anyLabel : null) || i.ruleExcerpt || 'لا مقتطف';
  return { criterionKey: i.criterionKey, suggestion, confidence: round2(confidence), excerptAr, basis, escalate: reasons.length > 0, escalationReasons: [...new Set(reasons)] };
}

/** Q11: the excerpt must be one of the inputs' own texts; an invented excerpt is refused. */
export function assertSuggestionGrounded(s: CriterionSuggestion, i: CriterionSuggestionInput): void {
  const allowed = new Set<string>([...i.testLabels.map((t) => t.labelAr), ...(i.ruleExcerpt ? [i.ruleExcerpt] : []), 'بند يقرره إنسان', 'لا مقتطف']);
  if (!allowed.has(s.excerptAr)) throw new DomainError('[a13_ungrounded] A suggestion cites an excerpt that is not in its inputs.', { criterionKey: s.criterionKey });
  if (s.confidence < 0 || s.confidence > 1) throw new DomainError('[a13_confidence] Confidence must be within 0..1.');
  if (!s.escalate) throw new DomainError('[a13_not_escalated] Before calibration is approved every suggestion goes to a person.');
}

/* ─────────────────────────── calibration metrics ─────────────────────────── */

export interface CalibrationPair {
  readonly criterionKey: string;
  readonly suggested: SuggestionValue;
  /** The independent judgment (expert, or — for pipeline tests only — a labelled candidate expectation). */
  readonly reference: 'met' | 'unmet';
  readonly mandatory: boolean;
  readonly escalated: boolean;
}

export interface CalibrationReport {
  readonly n: number;
  /** Share of pairs with a met/unmet suggestion (the rest were left to a person as uncertain). */
  readonly decidedShare: number;
  /** Q1 on decided pairs. */
  readonly rawAgreement: number | null;
  /** Q2 Cohen's kappa on decided pairs. */
  readonly cohenKappa: number | null;
  /** Q3: suggested met while the reference is unmet, per mandatory / other. */
  readonly falseAcceptMandatory: number | null;
  readonly falseAcceptOther: number | null;
  /** Q4: reference unmet → suggested unmet (sensitivity to non-conforming work). */
  readonly trueRejectRate: number | null;
  /** Q5: reference met → suggested unmet. */
  readonly falseRejectRate: number | null;
  /** Q6: wrong (or uncertain) AND not escalated. Must be 0 in the shadow stage. */
  readonly unescalatedErrorRate: number;
  /** Q7. */
  readonly escalationRate: number;
  readonly noticeAr: string;
}

const ratio = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 1000) / 1000);

export function calibrationMetrics(pairs: readonly CalibrationPair[]): CalibrationReport {
  const decided = pairs.filter((p) => p.suggested !== 'uncertain');
  const agree = decided.filter((p) => p.suggested === p.reference).length;
  // Cohen's kappa for two raters over {met, unmet}.
  let kappa: number | null = null;
  if (decided.length > 0) {
    const n = decided.length;
    const po = agree / n;
    const sMet = decided.filter((p) => p.suggested === 'met').length / n;
    const rMet = decided.filter((p) => p.reference === 'met').length / n;
    const pe = sMet * rMet + (1 - sMet) * (1 - rMet);
    kappa = pe === 1 ? (po === 1 ? 1 : 0) : Math.round(((po - pe) / (1 - pe)) * 1000) / 1000;
  }
  const refUnmet = pairs.filter((p) => p.reference === 'unmet');
  const refMet = pairs.filter((p) => p.reference === 'met');
  const wrongOrUncertain = pairs.filter((p) => p.suggested !== p.reference);
  return {
    n: pairs.length,
    decidedShare: ratio(decided.length, pairs.length) ?? 0,
    rawAgreement: ratio(agree, decided.length),
    cohenKappa: kappa,
    falseAcceptMandatory: ratio(refUnmet.filter((p) => p.mandatory && p.suggested === 'met').length, refUnmet.filter((p) => p.mandatory).length),
    falseAcceptOther: ratio(refUnmet.filter((p) => !p.mandatory && p.suggested === 'met').length, refUnmet.filter((p) => !p.mandatory).length),
    trueRejectRate: ratio(refUnmet.filter((p) => p.suggested === 'unmet').length, refUnmet.length),
    falseRejectRate: ratio(refMet.filter((p) => p.suggested === 'unmet').length, refMet.length),
    unescalatedErrorRate: ratio(wrongOrUncertain.filter((p) => !p.escalated).length, pairs.length) ?? 0,
    escalationRate: ratio(pairs.filter((p) => p.escalated).length, pairs.length) ?? 0,
    noticeAr: 'هذه أرقام اختبار للمسار. لا تمنح اعتمادًا آليًا؛ العتبات تُعتمد بقرار مسمّى بعد مجموعة ذهبية بحكم خبير.',
  };
}
