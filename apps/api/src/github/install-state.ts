/**
 * CSRF `state` for the GitHub App install / authorize redirect. The API signs the NAQLA user id before sending the
 * graduate to GitHub and verifies it on the callback, so a callback can only complete an installation for the user
 * who started it, within a short window.
 *
 * Format: base64url(JSON {u, e, n}) "." base64url(HMAC-SHA256(secret, payloadPart)). `e` is the expiry in Unix
 * seconds, `n` a random nonce. Nothing secret is in the payload; the secret never leaves the server.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const MIN_SECRET_LENGTH = 32;
const MAX_STATE_LENGTH = 1024;

function requireSecret(secret: string): void {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`[github_state_secret] The install-state secret must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
}

const mac = (secret: string, payloadPart: string) => createHmac('sha256', secret).update(payloadPart, 'utf8').digest();

export function signInstallState(userId: string, secret: string, ttlSec = 600, nowMs: number = Date.now()): string {
  requireSecret(secret);
  if (typeof userId !== 'string' || userId.length === 0 || userId.length > 200) throw new Error('[github_state] Invalid user id.');
  if (!Number.isInteger(ttlSec) || ttlSec < 1 || ttlSec > 3600) throw new Error('[github_state] ttlSec must be an integer between 1 and 3600.');
  const payload = { u: userId, e: Math.floor(nowMs / 1000) + ttlSec, n: randomBytes(12).toString('base64url') };
  const payloadPart = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${payloadPart}.${mac(secret, payloadPart).toString('base64url')}`;
}

/** Returns the user id the state was signed for. Throws `[github_state]` on any tampering, malformed input or expiry. */
export function verifyInstallState(state: string, secret: string, nowMs: number = Date.now()): string {
  requireSecret(secret);
  const refuse = (why: string): never => { throw new Error(`[github_state] The install state is ${why}. Start connecting GitHub again.`); };
  if (typeof state !== 'string' || state.length === 0 || state.length > MAX_STATE_LENGTH) return refuse('invalid');
  const parts = state.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]!) || !/^[A-Za-z0-9_-]+$/.test(parts[1]!)) return refuse('invalid');
  const [payloadPart, sigPart] = parts as [string, string];
  const expected = mac(secret, payloadPart);
  const given = Buffer.from(sigPart, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return refuse('invalid');
  let payload: unknown;
  try { payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')); } catch { return refuse('invalid'); }
  const p = payload as { u?: unknown; e?: unknown };
  if (typeof p.u !== 'string' || p.u.length === 0 || typeof p.e !== 'number' || !Number.isFinite(p.e)) return refuse('invalid');
  if (Math.floor(nowMs / 1000) >= p.e) return refuse('expired');
  return p.u;
}
