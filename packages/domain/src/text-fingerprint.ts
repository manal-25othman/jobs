/**
 * ENG-1 P4 — versioned text fingerprint for artifact-reuse detection (I-5, condition 5).
 *
 * ONE definition, used everywhere a text deliverable is compared for reuse: the per-skill writer stores the
 * fingerprint (artifact_text_fingerprint), the database duplicate check compares stored fingerprints only, and the
 * EXT-2 reader uses the stored fingerprint (or this same function, read-only, when none is stored). The database never
 * normalizes text itself, so a locale or regex difference between PostgreSQL and JavaScript cannot split the semantics.
 *
 * This is ORTHOGRAPHIC identity, never similarity: two texts match only when they are the same text after removing
 * representation differences (Unicode compatibility forms, Arabic diacritics and tatweel, invisible formatting
 * characters, digit scripts, letter case, whitespace). No paraphrase, translation, AI-content or "similar wording"
 * judgment is made, and a short answer (< 40 code points after normalization) is never treated as an artifact.
 *
 * Version `naqla-text-fp-v1` (changing ANY step requires a new version; fingerprints of different versions are
 * never compared — a missing current-version fingerprint is "uncertain", which fails closed):
 *   1. NFKC (compatibility forms, Arabic presentation forms → base letters, full-width → ASCII).
 *   2. Remove Arabic tatweel U+0640 and Arabic combining marks (harakat, Quranic annotation marks).
 *   3. Remove invisible formatting characters (soft hyphen, zero-width space/joiners, LRM/RLM/ALM, bidi embeddings,
 *      overrides and isolates, word joiner, BOM).
 *   4. Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits → ASCII digits.
 *   5. Lower case (String.prototype.toLowerCase: locale-independent), then NFKC again (case mapping can denormalize).
 *   6. Every Unicode White_Space character → one U+0020 per run; trimmed.
 *   7. Fewer than 40 code points ⇒ no fingerprint (an answer, not an artifact).
 * The hash input is `${version}\n${normalized}` (UTF-8, SHA-256), so different versions can never collide.
 */
export const TEXT_FINGERPRINT_VERSION = 'naqla-text-fp-v1';
export const MIN_FINGERPRINT_CODEPOINTS = 40;

const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0640]/g;
const INVISIBLE = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
// Unicode White_Space (explicit, not \s, so the definition is pinned to this list).
const WHITESPACE = /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g;

export function normalizeForFingerprint(text: string): string {
  let t = text.normalize('NFKC');
  t = t.replace(ARABIC_MARKS, '').replace(INVISIBLE, '');
  t = t.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  t = t.toLowerCase().normalize('NFKC');
  return t.replace(WHITESPACE, ' ').replace(/^ | $/g, '');
}

export interface FingerprintInput {
  readonly version: typeof TEXT_FINGERPRINT_VERSION;
  /** Length of the normalized text in code points. */
  readonly normalizedLength: number;
  /** The exact string to hash, or null when the text is too short to be an artifact. */
  readonly hashInput: string | null;
}

export function fingerprintInput(text: string): FingerprintInput {
  const n = normalizeForFingerprint(text);
  const len = [...n].length;
  return { version: TEXT_FINGERPRINT_VERSION, normalizedLength: len, hashInput: len < MIN_FINGERPRINT_CODEPOINTS ? null : `${TEXT_FINGERPRINT_VERSION}\n${n}` };
}
