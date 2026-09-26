/**
 * Upload rules — what may be stored, and what a submission may reference.
 */

import { DomainError, MissingPrerequisite } from './errors.js';

export const UPLOAD_MAX_BYTES_DEFAULT = 10 * 1024 * 1024;

/** Content types a submission may carry. A closed list: unknown means refused. */
export const ALLOWED_UPLOAD_CONTENT_TYPES: readonly string[] = [
  'application/pdf', 'application/zip', 'application/x-zip-compressed',
  'text/plain', 'text/markdown', 'text/javascript', 'text/x-python',
  'application/json', 'image/png', 'image/jpeg',
];

const SIGNED_URL_TTL = { upload: 60, download: 300 } as const;
export function signedUrlTtlSeconds(kind: keyof typeof SIGNED_URL_TTL): number {
  return SIGNED_URL_TTL[kind];
}

export function assertUploadIntentValid(intent: {
  readonly declaredName: string; readonly contentType: string; readonly declaredSize: number;
  readonly maxBytes?: number;
}): void {
  if (!intent.declaredName?.trim()) throw new MissingPrerequisite('declaredName', 'an upload needs a name');
  if (/[\\/]/.test(intent.declaredName) || intent.declaredName.includes('..')) {
    throw new DomainError('an upload name may not contain path separators');
  }
  if (!ALLOWED_UPLOAD_CONTENT_TYPES.includes(intent.contentType)) {
    throw new DomainError(`content type '${intent.contentType}' is not accepted for evidence uploads`);
  }
  const max = intent.maxBytes ?? UPLOAD_MAX_BYTES_DEFAULT;
  if (!(intent.declaredSize > 0) || intent.declaredSize > max) {
    throw new DomainError(`declared size must be between 1 and ${max} bytes`);
  }
}

/** Object paths are owner-prefixed so storage policies are a prefix check. */
export function objectPathFor(userId: string, uploadId: string, declaredName: string): string {
  const safe = declaredName.replace(/[^A-Za-z0-9._؀-ۿ-]/g, '_').slice(0, 120);
  return `${userId}/${uploadId}/${safe}`;
}

export function assertExternalUrlValid(url: string): URL {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new DomainError('an external evidence URL must be absolute'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new DomainError('an external evidence URL must use http or https');
  }
  if (parsed.username || parsed.password) throw new DomainError('credentials in a URL are refused');
  return parsed;
}
