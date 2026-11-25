/**
 * Phase B, package 4 — workspace drafts (SRS FR-U-025).
 *
 * A draft is the graduate's UNSENT work for one workspace: written answers keyed by the activity's text deliverables,
 * upload references keyed by its file deliverables, the skills they selected, and their work-method answers. It is
 * never a submission, an artifact, evidence or a claim — the submission is still built from what the graduate sends
 * when they submit. This module decides only what a draft may contain; the database enforces ownership and upload
 * ownership again (0038).
 */
import { DomainError } from './errors.js';
import { FILE_DELIVERABLE_FORMAT } from './evidence-items.js';

export const DRAFT_TEXT_MAX_CHARS = 20_000;
export const DRAFT_DISCLOSURE_MAX_KEYS = 50;
export const DRAFT_DISCLOSURE_MAX_CHARS = 4_000;

export interface DraftDeliverable { readonly key: string; readonly format: string }
export interface WorkspaceDraftInput {
  readonly texts?: Readonly<Record<string, unknown>>;
  readonly files?: Readonly<Record<string, unknown>>;
  readonly skillIds?: readonly unknown[];
  readonly disclosure?: Readonly<Record<string, unknown>>;
}
export interface WorkspaceDraft {
  readonly texts: Record<string, string>;
  readonly files: Record<string, string>;
  readonly skillIds: string[];
  readonly disclosure: Record<string, string | boolean | string[]>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validates and normalizes a draft against the activity it belongs to. Unknown deliverable keys, a text under a file
 * deliverable (or the reverse), a skill not mapped to the activity, or oversized content are refused with a reason.
 * Empty texts are dropped (an empty answer is "not written yet", not an answer).
 */
export function normalizeWorkspaceDraft(input: WorkspaceDraftInput, activity: { deliverables: readonly DraftDeliverable[]; skillIds: readonly string[] }): WorkspaceDraft {
  const fileKeys = new Set(activity.deliverables.filter((d) => d.format === FILE_DELIVERABLE_FORMAT).map((d) => d.key));
  const textKeys = new Set(activity.deliverables.filter((d) => d.format !== FILE_DELIVERABLE_FORMAT).map((d) => d.key));

  const texts: Record<string, string> = {};
  if (input.texts !== undefined) {
    if (!isObject(input.texts)) throw new DomainError('[draft_malformed] texts must be an object keyed by deliverable');
    for (const [k, v] of Object.entries(input.texts)) {
      if (!textKeys.has(k)) throw new DomainError(`[draft_unknown_deliverable] '${k}' is not a written deliverable of this activity`, { key: k });
      if (typeof v !== 'string') throw new DomainError(`[draft_malformed] the draft of '${k}' must be text`, { key: k });
      if (v.length > DRAFT_TEXT_MAX_CHARS) throw new DomainError(`[draft_too_large] '${k}' is longer than ${DRAFT_TEXT_MAX_CHARS} characters`, { key: k });
      if (v.trim() !== '') texts[k] = v;
    }
  }

  const files: Record<string, string> = {};
  if (input.files !== undefined) {
    if (!isObject(input.files)) throw new DomainError('[draft_malformed] files must be an object keyed by deliverable');
    for (const [k, v] of Object.entries(input.files)) {
      if (!fileKeys.has(k)) throw new DomainError(`[draft_unknown_deliverable] '${k}' is not a file deliverable of this activity`, { key: k });
      if (v === null) continue;
      if (typeof v !== 'string' || !UUID.test(v)) throw new DomainError(`[draft_malformed] the file of '${k}' must be an upload id`, { key: k });
      files[k] = v;
    }
  }

  const allowed = new Set(activity.skillIds);
  const skillIds: string[] = [];
  if (input.skillIds !== undefined) {
    if (!Array.isArray(input.skillIds)) throw new DomainError('[draft_malformed] skillIds must be a list');
    for (const s of input.skillIds) {
      if (typeof s !== 'string' || !allowed.has(s)) throw new DomainError('[draft_skill_not_mapped] a selected skill is not a skill of this activity');
      if (!skillIds.includes(s)) skillIds.push(s);
    }
  }

  const disclosure: Record<string, string | boolean | string[]> = {};
  if (input.disclosure !== undefined) {
    if (!isObject(input.disclosure)) throw new DomainError('[draft_malformed] disclosure must be an object');
    const entries = Object.entries(input.disclosure);
    if (entries.length > DRAFT_DISCLOSURE_MAX_KEYS) throw new DomainError('[draft_too_large] too many work-method answers');
    for (const [k, v] of entries) {
      if (typeof v === 'boolean') disclosure[k] = v;
      else if (typeof v === 'string') {
        if (v.length > DRAFT_DISCLOSURE_MAX_CHARS) throw new DomainError(`[draft_too_large] the answer '${k}' is too long`, { key: k });
        disclosure[k] = v;
      } else if (Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length <= DRAFT_DISCLOSURE_MAX_CHARS)) disclosure[k] = v as string[];
      else throw new DomainError(`[draft_malformed] the answer '${k}' must be text, yes/no or a list of choices`, { key: k });
    }
  }
  return { texts, files, skillIds, disclosure };
}
