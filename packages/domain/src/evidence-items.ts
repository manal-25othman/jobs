/**
 * Evidence System (Configurable Track Architecture, Phase 1).
 *
 * An EVIDENCE ITEM is a typed record of material the user — or the system —
 * put forward: a repository link, a file, a note, a locked submission, an
 * automated check result, a disclosure, a previous attempt. It is NOT an
 * evaluated fact. The evaluated fact is `evidence`, written only by an
 * evaluation (INV-1), and the two are bridged by an explicit derivation.
 *
 * What is fixed here (invariants):
 *   - an item never moves a skill claim; only an evaluation does (INV-1).
 *   - an item is immutable after submission; a change is a new item that
 *     supersedes the old one (INV-6: history is never rewritten).
 *   - lifecycle is forward-only: draft → submitted → withdrawn | superseded.
 *
 * What is data (configurable, DRAFT / NOT VALIDATED until an expert approves):
 *   - the registry of evidence types, their channel and required fields.
 *   - how a URL or an activity deliverable is classified into a type.
 *   - which deliverable key a submitted file maps to (from `activity_deliverable`).
 * No weight, count or threshold is defined here; `weight` stays null.
 */

import { DomainError, IllegalTransition, MissingPrerequisite } from './errors.js';
import { assertExternalUrlValid } from './uploads.js';

export const EVIDENCE_CHANNELS = ['url', 'file', 'text', 'activity', 'system'] as const;
export type EvidenceChannel = (typeof EVIDENCE_CHANNELS)[number];

export const EVIDENCE_ITEM_STATUSES = ['draft', 'submitted', 'withdrawn', 'superseded'] as const;
export type EvidenceItemStatus = (typeof EVIDENCE_ITEM_STATUSES)[number];

export const EVIDENCE_ITEM_SOURCES = ['user_direct', 'user_submission', 'system'] as const;
export type EvidenceItemSource = (typeof EVIDENCE_ITEM_SOURCES)[number];

export const EVIDENCE_LINK_ROLES = ['primary', 'secondary'] as const;
export type EvidenceLinkRole = (typeof EVIDENCE_LINK_ROLES)[number];

/** Forward-only lifecycle. There is no way back to draft and no edit in place. */
const ITEM_TRANSITIONS: ReadonlyArray<readonly [EvidenceItemStatus, EvidenceItemStatus]> = [
  ['draft', 'submitted'],
  ['draft', 'withdrawn'],
  ['submitted', 'withdrawn'],
  ['submitted', 'superseded'],
];

export function assertEvidenceItemTransition(from: EvidenceItemStatus, to: EvidenceItemStatus): void {
  if (!ITEM_TRANSITIONS.some(([f, t]) => f === from && t === to)) {
    throw new IllegalTransition('evidence_item', from, to,
      from === to ? 'no transition to the same status' : 'the item lifecycle is forward-only (draft → submitted → withdrawn | superseded)');
  }
}

/** A row of the `evidence_item_type` registry, as the domain sees it. */
export interface EvidenceTypeSpec {
  code: string;
  channel: EvidenceChannel;
  /** Metadata keys (or well-known refs) the type needs. */
  requiredFields: readonly string[];
  /** Classification hints (data). Unknown keys are ignored. */
  matchRule: Readonly<{
    urlHostSuffixes?: readonly string[] | undefined;
    urlPathPattern?: string | undefined;
    urlFallback?: boolean | undefined;
    deliverableFormat?: string | undefined;
    fileFallback?: boolean | undefined;
    activityKind?: string | undefined;
    activityFallback?: boolean | undefined;
    contentTypePrefix?: string | undefined;
  }>;
  enabled: boolean;
  /** Expert validation state. Only 'approved'/'published' mean validated. */
  reviewStatus: string;
}

/** The shape an item must satisfy for its type. Mirrors the DB trigger; checked first in the domain so the error is named. */
export interface EvidenceItemDraft {
  typeCode: string;
  source: EvidenceItemSource;
  title: string;
  description?: string | null;
  url?: string | null;
  uploadId?: string | null;
  submissionId?: string | null;
  evaluationResultId?: string | null;
  previousItemId?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
}

export function findEvidenceType(types: readonly EvidenceTypeSpec[], code: string): EvidenceTypeSpec {
  const t = types.find((x) => x.code === code);
  if (!t) throw new MissingPrerequisite('evidence_type', `evidence type '${code}' is not in the registry`);
  return t;
}

/**
 * Validates an item against its type. Throws a named error; never returns a
 * degraded item. The DB trigger repeats these checks so a bypass cannot
 * write a malformed row.
 */
export function assertEvidenceItemShape(type: EvidenceTypeSpec, item: EvidenceItemDraft): void {
  if (item.typeCode !== type.code) throw new DomainError(`item type '${item.typeCode}' does not match registry type '${type.code}'`);
  if (!type.enabled) throw new DomainError(`evidence type '${type.code}' is disabled`);
  if (!item.title || item.title.trim().length === 0) throw new DomainError('an evidence item needs a title');
  switch (type.channel) {
    case 'url':
      if (!item.url) throw new MissingPrerequisite('url', `evidence type '${type.code}' needs a url`);
      assertExternalUrlValid(item.url);
      break;
    case 'file':
      if (!item.uploadId) throw new MissingPrerequisite('uploadId', `evidence type '${type.code}' needs a confirmed upload`);
      break;
    case 'text':
      if (!item.description || item.description.trim().length === 0) {
        throw new MissingPrerequisite('description', `evidence type '${type.code}' needs a description`);
      }
      break;
    case 'activity':
      if (!item.submissionId) throw new MissingPrerequisite('submissionId', `evidence type '${type.code}' needs a submission`);
      break;
    case 'system':
      if (item.source !== 'system') throw new DomainError(`evidence type '${type.code}' is system-created only; a user cannot add it`);
      break;
  }
  const meta = item.metadata ?? {};
  for (const f of type.requiredFields) {
    const satisfied = f in meta
      || (f === 'submission_id' && !!item.submissionId)
      || (f === 'evaluation_result_id' && !!item.evaluationResultId)
      || (f === 'previous_item_id' && !!item.previousItemId);
    if (!satisfied) throw new MissingPrerequisite(f, `evidence type '${type.code}' requires field '${f}'`);
  }
}

/** A user may only add items of user-addable channels; system items come from the system. */
export function userMayCreateType(type: EvidenceTypeSpec): boolean {
  return type.enabled && type.channel !== 'system' && type.channel !== 'activity';
}

/**
 * Classifies an external URL into a registry type using the types' match rules.
 * The order is: the most specific rule that matches (host suffix + path pattern),
 * then host suffix alone, then the registry's declared fallback. No fallback
 * row ⇒ a named error, not a silent default.
 */
export function classifyUrlEvidenceType(types: readonly EvidenceTypeSpec[], url: string): EvidenceTypeSpec {
  const parsed = assertExternalUrlValid(url);
  const host = parsed.hostname.toLowerCase();
  const urlTypes = types.filter((t) => t.enabled && t.channel === 'url');
  const hostMatches = (t: EvidenceTypeSpec) =>
    (t.matchRule.urlHostSuffixes ?? []).some((s) => host === s.toLowerCase() || host.endsWith(`.${s.toLowerCase()}`));
  const pathMatches = (t: EvidenceTypeSpec) =>
    t.matchRule.urlPathPattern ? new RegExp(t.matchRule.urlPathPattern, 'i').test(parsed.pathname) : false;

  const specific = urlTypes.find((t) => t.matchRule.urlPathPattern && hostMatches(t) && pathMatches(t));
  if (specific) return specific;
  const byHost = urlTypes.find((t) => !t.matchRule.urlPathPattern && hostMatches(t));
  if (byHost) return byHost;
  const fallback = urlTypes.find((t) => t.matchRule.urlFallback === true);
  if (!fallback) throw new MissingPrerequisite('evidence_type.url_fallback', 'no enabled url evidence type declares url_fallback; the registry cannot classify this link');
  return fallback;
}

/** The type a platform submission is recorded as, by the activity's declared kind (data), else the declared activity fallback. */
export function classifyActivityEvidenceType(types: readonly EvidenceTypeSpec[], activityKind: string | null): EvidenceTypeSpec {
  const activityTypes = types.filter((t) => t.enabled && t.channel === 'activity');
  if (activityKind) {
    const byKind = activityTypes.find((t) => t.matchRule.activityKind === activityKind);
    if (byKind) return byKind;
  }
  const fallback = activityTypes.find((t) => t.matchRule.activityFallback === true);
  if (!fallback) throw new MissingPrerequisite('evidence_type.activity_fallback', 'no enabled activity evidence type declares activity_fallback');
  return fallback;
}

/** The type an uploaded file is recorded as: by content type prefix (data) when one matches, else the declared file fallback. */
export function classifyFileEvidenceType(types: readonly EvidenceTypeSpec[], contentType: string | null): EvidenceTypeSpec {
  const fileTypes = types.filter((t) => t.enabled && t.channel === 'file');
  if (contentType) {
    const byPrefix = fileTypes.find((t) => t.matchRule.contentTypePrefix && contentType.toLowerCase().startsWith(t.matchRule.contentTypePrefix.toLowerCase()));
    if (byPrefix) return byPrefix;
  }
  const fallback = fileTypes.find((t) => t.matchRule.fileFallback === true);
  if (!fallback) throw new MissingPrerequisite('evidence_type.file_fallback', 'no enabled file evidence type declares file_fallback');
  return fallback;
}

/** An activity deliverable as declared in content (data), ordered by position. */
export interface DeliverableSpec { key: string; format: string; mandatory: boolean; position: number }

/**
 * Assigns artifact keys to the uploaded files of a submission from the
 * activity's declared deliverables (format 'source file', by position).
 *
 * Backward-compatibility rule: a submission that names ANY declared file
 * deliverable explicitly as a structured fact owns those keys itself; its
 * uploads then follow the legacy convention — file 0 = `file.component`,
 * file 1 = `file.test`, then `file.extra_N` — exactly as before Phase 1. The
 * same legacy convention applies when the activity declares no file
 * deliverable. The result says which path was taken so a reviewer can see it.
 */
export const LEGACY_FILE_KEYS: readonly string[] = ['file.component', 'file.test'];
export const FILE_DELIVERABLE_FORMAT = 'source file';

export interface AssignedFileKey { key: string; resolvedFrom: 'activity_deliverable' | 'legacy_convention' }

export function assignFileArtifactKeys(
  deliverables: readonly DeliverableSpec[], fileCount: number, reservedKeys: Iterable<string> = [],
): AssignedFileKey[] {
  if (fileCount < 0 || !Number.isInteger(fileCount)) throw new DomainError('file count must be a non-negative integer');
  const taken = new Set(reservedKeys);
  const declaredAll = [...deliverables].filter((d) => d.format === FILE_DELIVERABLE_FORMAT).sort((a, b) => a.position - b.position).map((d) => d.key);
  // The submitter states the file facts explicitly: uploads keep the legacy keys.
  const declared = declaredAll.some((k) => taken.has(k)) ? [] : declaredAll;
  const out: AssignedFileKey[] = [];
  let legacyIndex = 0;
  for (let i = 0; i < fileCount; i++) {
    const free = declared.find((k) => !taken.has(k));
    if (free) { taken.add(free); out.push({ key: free, resolvedFrom: 'activity_deliverable' }); continue; }
    let key: string;
    do { key = LEGACY_FILE_KEYS[legacyIndex] ?? `file.extra_${legacyIndex}`; legacyIndex++; } while (taken.has(key));
    taken.add(key);
    out.push({ key, resolvedFrom: 'legacy_convention' });
  }
  return out;
}

/**
 * The attempt number of a new submission on a project: one more than the
 * attempts already recorded. The count is a fact the caller reads; nothing
 * here decides whether another attempt is allowed (that is policy, later).
 */
export function nextAttemptNumber(previousAttempts: number): number {
  if (previousAttempts < 0 || !Number.isInteger(previousAttempts)) throw new DomainError('previous attempt count must be a non-negative integer');
  return previousAttempts + 1;
}

/**
 * INV-1 stated for the ledger: creating or linking an evidence item has no
 * effect on any skill claim. The function exists so the rule has a name a
 * test and a service can cite; it returns the only permitted effect.
 */
export const EVIDENCE_ITEM_CLAIM_EFFECT = 'none' as const;
export function claimEffectOfEvidenceItem(): typeof EVIDENCE_ITEM_CLAIM_EFFECT { return EVIDENCE_ITEM_CLAIM_EFFECT; }

/** Maps a registry row (snake_case jsonb) into the domain spec. Pure; no DB. */
export function evidenceTypeFromRow(row: {
  code: string; channel: string; required_fields: unknown; match_rule: unknown; enabled: boolean; review_status: string;
}): EvidenceTypeSpec {
  if (!(EVIDENCE_CHANNELS as readonly string[]).includes(row.channel)) throw new DomainError(`unknown evidence channel '${row.channel}' on type '${row.code}'`);
  const mr = (row.match_rule && typeof row.match_rule === 'object' ? row.match_rule : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof mr[k] === 'string' ? (mr[k] as string) : undefined);
  const bool = (k: string) => (mr[k] === true ? true : undefined);
  return {
    code: row.code,
    channel: row.channel as EvidenceChannel,
    requiredFields: Array.isArray(row.required_fields) ? row.required_fields.filter((x): x is string => typeof x === 'string') : [],
    matchRule: {
      urlHostSuffixes: Array.isArray(mr['url_host_suffixes']) ? (mr['url_host_suffixes'] as unknown[]).filter((x): x is string => typeof x === 'string') : undefined,
      urlPathPattern: str('url_path_pattern'),
      urlFallback: bool('url_fallback'),
      deliverableFormat: str('deliverable_format'),
      fileFallback: bool('file_fallback'),
      activityKind: str('activity_kind'),
      activityFallback: bool('activity_fallback'),
      contentTypePrefix: str('content_type_prefix'),
    },
    enabled: row.enabled,
    reviewStatus: row.review_status,
  };
}

/** True only when a named expert approved the type. Seeded rows are draft. */
export function evidenceTypeIsValidated(type: EvidenceTypeSpec): boolean {
  return type.reviewStatus === 'approved' || type.reviewStatus === 'published';
}
