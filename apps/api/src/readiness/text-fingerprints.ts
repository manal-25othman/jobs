import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { fingerprintInput, TEXT_FINGERPRINT_VERSION } from '@naqla/domain';

/**
 * ENG-1 (0032): the ONE versioned text fingerprint (packages/domain text-fingerprint.ts), hashed here and stored in
 * artifact_text_fingerprint. The database duplicate check compares the stored values only; EXT-2 reads the same ones.
 * Fingerprints never leave the server.
 */
export function textFingerprint(text: string): { version: string; normalizedLength: number; fingerprint: string | null } {
  const f = fingerprintInput(text);
  return { version: f.version, normalizedLength: f.normalizedLength, fingerprint: f.hashInput === null ? null : createHash('sha256').update(f.hashInput, 'utf8').digest('hex') };
}

/**
 * Stores the current-version fingerprint of every text deliverable of these submissions of ONE learner that has none
 * yet (idempotent; insert-only; service connection). Called by the per-skill writer before any duplicate check, so a
 * submission made before 0032 is fingerprinted on demand from its immutable artifacts.
 */
export async function ensureTextFingerprints(c: PoolClient, userId: string, submissionIds: readonly string[]): Promise<number> {
  if (submissionIds.length === 0) return 0;
  const { rows } = await c.query(
    `select sa.id, sa.submission_id, sa.value_text from submission_artifact sa
      where sa.user_id = $1 and sa.submission_id = any($2::uuid[]) and sa.kind = 'text' and sa.value_text is not null
        and not exists (select 1 from artifact_text_fingerprint f where f.submission_artifact_id = sa.id and f.fingerprint_version = $3)`,
    [userId, submissionIds, TEXT_FINGERPRINT_VERSION]);
  for (const r of rows) {
    const f = textFingerprint(String(r.value_text));
    await c.query(
      `insert into artifact_text_fingerprint (submission_artifact_id, fingerprint_version, user_id, submission_id, fingerprint, normalized_length, runtime_unicode)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict do nothing`,
      [r.id, f.version, userId, r.submission_id, f.fingerprint, f.normalizedLength, process.versions.unicode ?? 'unknown']);
  }
  return rows.length;
}
