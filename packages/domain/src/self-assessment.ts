/**
 * FR-U-013 / BR-001 — the graduate's self-assessment (journey S06 `SelfAssessment`).
 *
 * A self-assessment is a starting point the graduate states about themself. It is `Observed` only: never evidence,
 * never a skill claim, never a level, never shown publicly, and never a reason for any transition (standard 07:
 * "self-assessment is not verified evidence"; A02/A14 contracts: no skill is confirmed from a self-assessment).
 * Over-rating is not corrected here; the gap shows in evaluated work later (journey S06, failure case).
 */
import { DomainError } from './errors.js';

/** Ratings beyond the proficiency scale's own level keys. */
export const SELF_ASSESSMENT_EXTRA_RATINGS = ['not_tried', 'unsure'] as const;
export const SELF_ASSESSMENT_NOTE_MAX = 500;

export const SELF_ASSESSMENT_NOTICE_AR = 'ما تكتبينه هنا نقطة انطلاق، وليس مهارة مُثبتة بعد. الإثبات يأتي من العمل المُقيَّم.';
export const SELF_ASSESSMENT_NOT_EVIDENCE_AR = 'تقدير ذاتي: لا يُحتسب دليلًا، ولا يغيّر مستوى التحقق، ولا يظهر لأي جهة خارجية.';
export const EXTRA_RATING_AR: Record<(typeof SELF_ASSESSMENT_EXTRA_RATINGS)[number], string> = { not_tried: 'لم أجرّبها بعد', unsure: 'لست متأكدة' };

/** The internal claim level a self-assessment carries — always and only Observed (BR-001). */
export const SELF_ASSESSMENT_CONFIDENCE = 'observed' as const;

export interface SelfAssessmentInput { readonly skillId: string; readonly rating: string; readonly note?: string | null }

/** Validates a submitted set against the role's skills and the scale. Returns the cleaned items. */
export function normalizeSelfAssessment(items: unknown, ctx: { readonly skillIds: readonly string[]; readonly levelKeys: readonly string[] }): SelfAssessmentInput[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > 60) throw new DomainError('[self_assessment_malformed] items must be a non-empty list');
  const ratings = new Set<string>([...ctx.levelKeys, ...SELF_ASSESSMENT_EXTRA_RATINGS]);
  const seen = new Set<string>();
  return items.map((raw) => {
    const it = raw as Record<string, unknown>;
    const skillId = String(it?.['skillId'] ?? ''); const rating = String(it?.['rating'] ?? '');
    if (!ctx.skillIds.includes(skillId)) throw new DomainError('[self_assessment_unknown_skill] the skill is not part of your current role', { skillId });
    if (seen.has(skillId)) throw new DomainError('[self_assessment_malformed] a skill appears twice', { skillId });
    seen.add(skillId);
    if (!ratings.has(rating)) throw new DomainError('[self_assessment_bad_rating] not a level of the proficiency scale', { rating });
    const noteRaw = it?.['note'];
    const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : null;
    if (note && note.length > SELF_ASSESSMENT_NOTE_MAX) throw new DomainError('[self_assessment_note_too_long] the note is too long', { max: SELF_ASSESSMENT_NOTE_MAX });
    return { skillId, rating, note };
  });
}

/** Only what changed is recorded (the history is append-only). */
export function changedSelfAssessments(next: readonly SelfAssessmentInput[], latest: ReadonlyMap<string, { rating: string; note: string | null }>): SelfAssessmentInput[] {
  return next.filter((n) => { const l = latest.get(n.skillId); return !l || l.rating !== n.rating || (l.note ?? null) !== (n.note ?? null); });
}
