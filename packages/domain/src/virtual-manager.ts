/**
 * A11 Virtual Manager (FR-U-026 / FR-A-002, CAP-17, journey S11) — the rules that are not the model.
 *
 * The manager of a work simulation: asks, clarifies PARTIALLY, changes a requirement, asks why a decision was made.
 * Its interventions are declared in the activity's scenario (content an expert reviews); each has a stated purpose and
 * a trigger. The graduate may reply within a cap that THIS module enforces (the A19 rule), never the agent. The manager
 * never gives a solution or steps, never hints at a score or criterion, never reveals what the scenario keeps private,
 * and is ALWAYS labelled as a system, not a person. Replies are kept with the work for the reviewer; in P1 they are not
 * scored (S11).
 */
import { DomainError } from './errors.js';

export const MANAGER_LABEL_AR = 'مدير افتراضي: نظام آلي، لا إنسان';
export const MANAGER_NOT_SCORED_AR = 'ردودك تُحفظ مع عملك ويطّلع عليها المراجِع، ولا تُقيَّم في هذه المرحلة.';
export const MANAGER_CAP_REACHED_AR = 'انتهى عدد الرسائل المتاحة مع المدير في هذا النشاط. اتخذي القرار الذي ترينه مناسبًا واذكري سببه في ملاحظات التسليم.';

export const INTERVENTION_TRIGGERS = ['project_started', 'first_draft_saved'] as const;
export const INTERVENTION_PURPOSES = ['ambiguity', 'requirement_change', 'decision_rationale'] as const;
export type InterventionTrigger = (typeof INTERVENTION_TRIGGERS)[number];
export type InterventionPurpose = (typeof INTERVENTION_PURPOSES)[number];

export const PURPOSE_AR: Record<InterventionPurpose, string> = {
  ambiguity: 'التعامل مع الغموض', requirement_change: 'تغيّر في المتطلبات', decision_rationale: 'شرح سبب القرار',
};

export interface ManagerClarification { readonly topicAr: string; readonly keywordsAr: readonly string[]; readonly answerAr: string }
export interface ManagerIntervention {
  readonly key: string;
  readonly trigger: InterventionTrigger;
  readonly purpose: InterventionPurpose;
  readonly messageAr: string;
  readonly clarifications: readonly ManagerClarification[];
  readonly maxReplies: number;
}
export interface ManagerScenario {
  readonly personaAr: string;
  readonly interventions: readonly ManagerIntervention[];
  /** Private to the platform: phrases the manager must never say (assessment design). Never sent to an agent. */
  readonly neverReveal: readonly string[];
  /** Total graduate messages in the activity. */
  readonly capMessages: number;
}

const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Validates an authored scenario (the loader and the database both refuse a malformed one). */
export function assertManagerScenario(s: unknown): asserts s is ManagerScenario {
  const x = s as Record<string, unknown>;
  const bad = (m: string): never => { throw new DomainError(`[manager_scenario] ${m}`); };
  if (!x || typeof x !== 'object') bad('not an object');
  if (!str(x['personaAr'], 120)) bad('personaAr is required');
  const iv = x['interventions'];
  if (!Array.isArray(iv) || iv.length < 1 || iv.length > 2) bad('one or two interventions (S11: «رسالة أو رسالتان»)');
  const keys = new Set<string>();
  for (const i of iv as Record<string, unknown>[]) {
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(String(i['key']))) bad(`bad intervention key ${String(i['key'])}`);
    if (keys.has(String(i['key']))) bad('duplicate intervention key'); keys.add(String(i['key']));
    if (!(INTERVENTION_TRIGGERS as readonly string[]).includes(String(i['trigger']))) bad(`bad trigger ${String(i['trigger'])}`);
    if (!(INTERVENTION_PURPOSES as readonly string[]).includes(String(i['purpose']))) bad('every intervention states its assessment purpose');
    if (!str(i['messageAr'], 700)) bad('messageAr is required (≤ 700 characters)');
    const mr = Number(i['maxReplies']); if (!Number.isInteger(mr) || mr < 0 || mr > 3) bad('maxReplies is 0–3');
    if (!Array.isArray(i['clarifications'])) bad('clarifications must be a list');
    for (const c of i['clarifications'] as Record<string, unknown>[]) {
      if (!str(c['topicAr'], 60) || !str(c['answerAr'], 500) || !Array.isArray(c['keywordsAr']) || (c['keywordsAr'] as unknown[]).length === 0) bad('a clarification needs a topic, keywords and an answer');
    }
  }
  if (!Array.isArray(x['neverReveal']) || (x['neverReveal'] as unknown[]).length === 0) bad('neverReveal lists what the manager must never say');
  const cap = Number(x['capMessages']); if (!Number.isInteger(cap) || cap < 1 || cap > 10) bad('capMessages is 1–10');
}

export interface TurnRecord { readonly interventionKey: string; readonly author: 'manager' | 'graduate'; readonly kind: string }

/** Interventions due now and not yet delivered, in scenario order. */
export function dueInterventions(s: ManagerScenario, state: { readonly projectStarted: boolean; readonly draftSaved: boolean; readonly delivered: readonly string[] }): ManagerIntervention[] {
  return s.interventions.filter((i) => !state.delivered.includes(i.key)
    && ((i.trigger === 'project_started' && state.projectStarted) || (i.trigger === 'first_draft_saved' && state.draftSaved)));
}

export interface CapState { readonly totalUsed: number; readonly totalCap: number; readonly remainingFor: (key: string) => number; readonly reached: boolean }

/** The A19 cap: per intervention (maxReplies) and per activity (capMessages). Counted from the graduate's own turns. */
export function managerCap(s: ManagerScenario, turns: readonly TurnRecord[]): CapState {
  const mine = turns.filter((t) => t.author === 'graduate');
  const totalUsed = mine.length;
  return {
    totalUsed, totalCap: s.capMessages, reached: totalUsed >= s.capMessages,
    remainingFor: (key) => {
      const iv = s.interventions.find((i) => i.key === key);
      if (!iv) return 0;
      return Math.max(0, Math.min(iv.maxReplies - mine.filter((t) => t.interventionKey === key).length, s.capMessages - totalUsed));
    },
  };
}

/** Normalises a graduate message (length, whitespace). */
export function normalizeManagerMessage(body: unknown): string {
  if (typeof body !== 'string' || !body.trim()) throw new DomainError('[manager_message_empty] اكتبي رسالتك أولًا');
  const t = body.trim().replace(/\s+/g, ' ');
  if (t.length > 1000) throw new DomainError('[manager_message_too_long] الرسالة أطول من 1000 حرف');
  return t;
}
