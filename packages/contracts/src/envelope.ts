/**
 * Transport envelope, error model and versioning.
 *
 * Defined before any endpoint exists, so the first endpoint cannot invent its
 * own shape and set a precedent by accident.
 */

/** Every response body is one of these two. No bare payloads. */
export type ApiResponse<T> =
  | { readonly ok: true; readonly data: T; readonly meta: ResponseMeta }
  | { readonly ok: false; readonly error: ApiError; readonly meta: ResponseMeta };

export interface ResponseMeta {
  /** Correlates a response with its audit events and logs. */
  readonly requestId: string;
  /** Contract version that produced it. */
  readonly apiVersion: ApiVersion;
  readonly servedAt: string;
}

/* ─────────────────────────────── versioning ─────────────────────────────── */

/**
 * URL-path versioning: /v1/... .
 *
 * Rules:
 *  - Additive changes (a new optional field, a new endpoint) do NOT bump it.
 *  - Removing a field, renaming one, narrowing a type, or changing the meaning
 *    of an existing value DOES bump it.
 *  - Two versions run side by side during a migration window; a version is
 *    retired only after its last consumer is gone.
 *  - A domain rule change never silently changes a contract: it goes through a
 *    CHG record first (SRS §21).
 */
export const API_VERSIONS = ['v1'] as const;
export type ApiVersion = (typeof API_VERSIONS)[number];
export const CURRENT_API_VERSION: ApiVersion = 'v1';

/* ──────────────────────────────── errors ───────────────────────────────── */

/**
 * Error codes are a closed set. A client can branch on them; a message is for
 * a human and may change without a version bump.
 */
export const ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation_failed',
  'conflict',
  'invariant_violation',
  'illegal_transition',
  'missing_prerequisite',
  'not_eligible',
  'rate_limited',
  'unavailable',
  'internal',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  readonly code: ErrorCode;
  /** Safe to show a user. Never contains another user's data or a stack. */
  readonly message: string;
  /** Per-field problems for `validation_failed`. */
  readonly fields?: Readonly<Record<string, string>>;
  /**
   * Set when a domain invariant refused the operation. Surfacing the code lets
   * the UI explain *which* rule stopped it instead of a generic failure.
   */
  readonly invariant?: string;
  /** Present on retryable errors only. */
  readonly retryAfterSeconds?: number;
}

export const HTTP_STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  conflict: 409,
  invariant_violation: 422,
  illegal_transition: 409,
  missing_prerequisite: 422,
  not_eligible: 409,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
};
