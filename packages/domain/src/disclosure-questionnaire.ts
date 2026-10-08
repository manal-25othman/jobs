/**
 * AI-usage disclosure questionnaire (Configurable Track Architecture, Phase 6).
 *
 * AI use is allowed. The questionnaire exists so an assessment can understand
 * how the user worked — what AI helped with, what they changed, rejected,
 * verified and debugged themselves. It is CONTEXT, never evidence of
 * competence, never a reason to fail, never a trigger for mandatory review.
 *
 * What is fixed here (invariants):
 *   - a disclosure never lowers a score (`DISCLOSURE_SCORE_EFFECT = 'none'`,
 *     and `assertDisclosureDidNotLowerScore` in ai-disclosure.ts still holds).
 *   - declaring AI use never requires human review by itself.
 *   - answers are validated against the exact questionnaire version shown;
 *     that version is recorded with every submission.
 *   - an `ai_prohibited` activity still refuses declared AI authoring (INV-7,
 *     `assertModeRespected`), now fed from the mapped answers.
 *
 * What is data (DRAFT / NOT VALIDATED until an expert approves): every
 * question, its wording, order, answer type, options, required flag and
 * show-if condition, and the number of questions.
 */

import { DomainError, MissingPrerequisite } from './errors.js';
import type { GovernedConfig } from './configuration.js';

export const DISCLOSURE_ANSWER_TYPES = ['yes_no', 'single_choice', 'multi_choice', 'free_text', 'text_list'] as const;
export type DisclosureAnswerType = (typeof DISCLOSURE_ANSWER_TYPES)[number];

export const DISCLOSURE_MAPPINGS = ['declared_use', 'explanation', 'ai_use_declared'] as const;
export type DisclosureMapping = (typeof DISCLOSURE_MAPPINGS)[number];

/** A formal input limit (not an expert value): one answer cannot exceed this many characters. */
export const MAX_DISCLOSURE_TEXT_LENGTH = 4000;
export const MAX_DISCLOSURE_LIST_ITEMS = 50;

export const DISCLOSURE_SCORE_EFFECT = 'none' as const;
export const DISCLOSURE_REQUIRES_HUMAN_REVIEW = false as const;

export interface DisclosureOption { value: string; labelAr: string; labelEn: string }
export interface DisclosureQuestion {
  id: string;
  key: string;
  position: number;
  promptAr: string;
  promptEn: string;
  helpAr: string | null;
  answerType: DisclosureAnswerType;
  options: readonly DisclosureOption[];
  required: boolean;
  /** Equality conditions on earlier answers, e.g. { used_ai: true }. Empty = always shown. */
  showIf: Readonly<Record<string, string | boolean>>;
  mapsTo: DisclosureMapping | null;
}
export interface DisclosureQuestionnaire extends GovernedConfig {
  labelAr: string;
  introAr: string;
  questions: readonly DisclosureQuestion[];
}

export type DisclosureAnswerValue = boolean | string | readonly string[];

export function assertQuestionnaireSane(q: Pick<DisclosureQuestionnaire, 'key' | 'version' | 'questions'>): void {
  const keys = new Set<string>(); const positions = new Set<number>();
  const ordered = [...q.questions].sort((a, b) => a.position - b.position);
  let aiUseMapped = 0;
  for (const question of ordered) {
    if (keys.has(question.key)) throw new DomainError(`questionnaire ${q.key}@${q.version}: duplicate question key '${question.key}'`);
    if (positions.has(question.position)) throw new DomainError(`questionnaire ${q.key}@${q.version}: duplicate position ${question.position}`);
    if (!(DISCLOSURE_ANSWER_TYPES as readonly string[]).includes(question.answerType)) throw new DomainError(`question '${question.key}': unknown answer type '${question.answerType}'`);
    if ((question.answerType === 'single_choice' || question.answerType === 'multi_choice') && question.options.length === 0) throw new DomainError(`question '${question.key}': a choice question needs options`);
    if (question.answerType !== 'single_choice' && question.answerType !== 'multi_choice' && question.options.length > 0) throw new DomainError(`question '${question.key}': only choice questions carry options`);
    const values = new Set<string>();
    for (const o of question.options) { if (values.has(o.value)) throw new DomainError(`question '${question.key}': duplicate option '${o.value}'`); values.add(o.value); }
    for (const dep of Object.keys(question.showIf)) {
      if (!keys.has(dep)) throw new DomainError(`question '${question.key}': show_if must refer to an EARLIER question ('${dep}' is not one)`);
    }
    if (question.mapsTo === 'ai_use_declared') { aiUseMapped++; if (question.answerType !== 'yes_no') throw new DomainError(`question '${question.key}': ai_use_declared maps a yes/no question only`); }
    if (question.mapsTo === 'declared_use' && question.answerType === 'yes_no') throw new DomainError(`question '${question.key}': declared_use cannot map a yes/no question`);
    keys.add(question.key); positions.add(question.position);
  }
  if (aiUseMapped > 1) throw new DomainError(`questionnaire ${q.key}@${q.version}: at most one question may map ai_use_declared`);
}

/** Whether a question is shown, given the answers so far (show_if is plain equality). */
export function questionVisible(question: Pick<DisclosureQuestion, 'showIf'>, answers: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(question.showIf).every(([k, v]) => answers[k] === v);
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
}

function normalizeAnswer(question: DisclosureQuestion, raw: unknown): DisclosureAnswerValue {
  switch (question.answerType) {
    case 'yes_no':
      if (typeof raw !== 'boolean') throw new DomainError(`question '${question.key}': a yes/no answer must be true or false`);
      return raw;
    case 'single_choice':
      if (typeof raw !== 'string' || !question.options.some((o) => o.value === raw)) throw new DomainError(`question '${question.key}': '${String(raw)}' is not one of the options`);
      return raw;
    case 'multi_choice': {
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) throw new DomainError(`question '${question.key}': a multi-choice answer is a list of option values`);
      const bad = (raw as string[]).filter((x) => !question.options.some((o) => o.value === x));
      if (bad.length) throw new DomainError(`question '${question.key}': not options: ${bad.join(', ')}`);
      return [...new Set(raw as string[])];
    }
    case 'free_text': {
      if (typeof raw !== 'string') throw new DomainError(`question '${question.key}': a free-text answer must be text`);
      const t = raw.trim();
      if (t.length > MAX_DISCLOSURE_TEXT_LENGTH) throw new DomainError(`question '${question.key}': answer exceeds ${MAX_DISCLOSURE_TEXT_LENGTH} characters`);
      return t;
    }
    case 'text_list': {
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) throw new DomainError(`question '${question.key}': a list answer is a list of texts`);
      const items = (raw as string[]).map((x) => x.trim()).filter((x) => x.length > 0);
      if (items.length > MAX_DISCLOSURE_LIST_ITEMS) throw new DomainError(`question '${question.key}': at most ${MAX_DISCLOSURE_LIST_ITEMS} items`);
      if (items.some((x) => x.length > MAX_DISCLOSURE_TEXT_LENGTH)) throw new DomainError(`question '${question.key}': an item exceeds ${MAX_DISCLOSURE_TEXT_LENGTH} characters`);
      return items;
    }
  }
}

export interface ValidatedDisclosure {
  answers: { question: DisclosureQuestion; answer: DisclosureAnswerValue }[];
  /** Mapped onto the legacy columns so existing consumers keep reading the same facts. */
  declaredUse: string[];
  explanation: string | null;
  aiUseDeclared: boolean | null;
  scoreEffect: typeof DISCLOSURE_SCORE_EFFECT;
  requiresHumanReview: typeof DISCLOSURE_REQUIRES_HUMAN_REVIEW;
}

/**
 * Pure: validates answers against the exact questionnaire version. Unknown
 * keys are refused; answers to questions hidden by show_if are dropped (the
 * user did not see them); a required, visible, unanswered question is a named
 * error. Nothing here scores or judges the answers.
 */
export function validateDisclosureAnswers(questionnaire: DisclosureQuestionnaire, raw: Readonly<Record<string, unknown>>): ValidatedDisclosure {
  assertQuestionnaireSane(questionnaire);
  const byKey = new Map(questionnaire.questions.map((q) => [q.key, q]));
  for (const k of Object.keys(raw)) if (!byKey.has(k)) throw new DomainError(`'${k}' is not a question of ${questionnaire.key}@${questionnaire.version}`);
  const ordered = [...questionnaire.questions].sort((a, b) => a.position - b.position);
  const accepted: Record<string, DisclosureAnswerValue> = {};
  const answers: ValidatedDisclosure['answers'] = [];
  for (const question of ordered) {
    if (!questionVisible(question, accepted)) continue;
    const value = raw[question.key];
    if (isBlank(value)) {
      if (question.required) throw new MissingPrerequisite(question.key, `question '${question.key}' is required in ${questionnaire.key}@${questionnaire.version}`);
      continue;
    }
    const normalized = normalizeAnswer(question, value);
    if (isBlank(normalized)) { if (question.required) throw new MissingPrerequisite(question.key, `question '${question.key}' is required`); continue; }
    accepted[question.key] = normalized;
    answers.push({ question, answer: normalized });
  }
  const mapped = (m: DisclosureMapping) => answers.find((a) => a.question.mapsTo === m);
  const aiUse = mapped('ai_use_declared');
  const aiUseDeclared = aiUse ? (aiUse.answer as boolean) : null;
  const du = mapped('declared_use');
  let declaredUse: string[] = du ? (Array.isArray(du.answer) ? [...(du.answer as string[])] : [String(du.answer)]) : [];
  if (aiUseDeclared === false) declaredUse = [];
  const ex = mapped('explanation');
  return { answers, declaredUse, explanation: ex ? String(ex.answer) : null, aiUseDeclared: aiUseDeclared ?? (declaredUse.length > 0 ? true : null),
    scoreEffect: DISCLOSURE_SCORE_EFFECT, requiresHumanReview: DISCLOSURE_REQUIRES_HUMAN_REVIEW };
}

/**
 * The pre-Phase-6 API shape ({ declaredUse, explanation }) expressed as answers
 * to the legacy baseline questionnaire, whose questions map exactly those two
 * fields. Keeps old clients working and still records a questionnaire version.
 */
export function legacyFieldsToAnswers(baseline: DisclosureQuestionnaire, fields: { declaredUse?: readonly string[] | null; explanation?: string | null }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const q of baseline.questions) {
    if (q.mapsTo === 'declared_use' && fields.declaredUse && fields.declaredUse.length) out[q.key] = q.answerType === 'free_text' ? fields.declaredUse.join('، ') : [...fields.declaredUse];
    if (q.mapsTo === 'explanation' && fields.explanation && fields.explanation.trim()) out[q.key] = fields.explanation;
  }
  return out;
}

export function disclosureQuestionFromRow(r: { id: string; key: string; position: number | string; prompt_ar: string; prompt_en: string; help_ar: string | null; answer_type: string;
  options: unknown; required: boolean; show_if: unknown; maps_to: string | null }): DisclosureQuestion {
  if (!(DISCLOSURE_ANSWER_TYPES as readonly string[]).includes(r.answer_type)) throw new DomainError(`unknown answer type '${r.answer_type}'`);
  if (r.maps_to !== null && !(DISCLOSURE_MAPPINGS as readonly string[]).includes(r.maps_to)) throw new DomainError(`unknown mapping '${r.maps_to}'`);
  const opts = Array.isArray(r.options) ? r.options as Record<string, unknown>[] : [];
  return {
    id: r.id, key: r.key, position: Number(r.position), promptAr: r.prompt_ar, promptEn: r.prompt_en, helpAr: r.help_ar, answerType: r.answer_type as DisclosureAnswerType,
    options: opts.map((o) => ({ value: String(o['value']), labelAr: String(o['label_ar'] ?? o['value']), labelEn: String(o['label_en'] ?? o['value']) })),
    required: r.required, showIf: (r.show_if && typeof r.show_if === 'object' ? r.show_if : {}) as Record<string, string | boolean>, mapsTo: r.maps_to as DisclosureMapping | null,
  };
}

/** What the user saw, frozen with the answer. */
export function questionSnapshot(q: DisclosureQuestion): Record<string, unknown> {
  return { key: q.key, position: q.position, prompt_ar: q.promptAr, prompt_en: q.promptEn, answer_type: q.answerType, options: q.options, required: q.required, show_if: q.showIf, maps_to: q.mapsTo };
}
