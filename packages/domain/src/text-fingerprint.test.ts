import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForFingerprint, fingerprintInput, TEXT_FINGERPRINT_VERSION, MIN_FINGERPRINT_CODEPOINTS } from './index.js';

const AR = 'يرسل النموذج البيانات إلى كائن الحالة ثم ت\u064Fعرض القائمة من جديد وحالات التحميل والخطأ واضحة';
const EN = 'The form submits to a state object; the list is re-rendered from state; loading and error are explicit.';
const same = (a: string, b: string) => assert.equal(fingerprintInput(a).hashInput, fingerprintInput(b).hashInput, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
const differ = (a: string, b: string) => assert.notEqual(fingerprintInput(a).hashInput, fingerprintInput(b).hashInput, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

describe('text fingerprint naqla-text-fp-v1 — orthographic identity only', () => {
  test('the version is pinned and is part of the hash input (different versions can never collide)', () => {
    assert.equal(TEXT_FINGERPRINT_VERSION, 'naqla-text-fp-v1'); assert.equal(MIN_FINGERPRINT_CODEPOINTS, 40);
    assert.ok(fingerprintInput(EN).hashInput!.startsWith('naqla-text-fp-v1\n'));
  });
  test('English: case, whitespace runs, tabs, newlines and Unicode spaces are representation, not content', () => {
    same(EN, EN.toUpperCase());
    same(EN, `  ${EN.replace(/ /g, '\t \n')}  `);
    same(EN, EN.replace(/ /g, '\u00A0')); same(EN, EN.replace(/ /g, '\u3000')); same(EN, EN.replace(/ /g, '\u2009')); same(EN, EN.replace(/ /g, '\u202F'));
  });
  test('Unicode equivalence: composed vs decomposed, compatibility forms, full-width letters, ligatures', () => {
    same('Café crème: the form validates every field before it submits', 'Cafe\u0301 cre\u0300me: the form validates every field before it submits');
    same('The \uFB01rst field is validated before the form submits to the server', 'The first field is validated before the form submits to the server');
    same('\uFF34\uFF28\uFF25 form validates every field before it submits to the server', 'the form validates every field before it submits to the server');
  });
  test('Arabic: diacritics (harakat), tatweel, presentation forms, Arabic-Indic digits and invisible marks are representation', () => {
    same(AR, 'ي\u064Fرس\u0650ل\u064F الن\u064E\u0651موذج\u064F البيانات\u0650 إلى كائن\u0650 الحالة\u0650 ثم\u0651 ت\u064Fعر\u064Eض القائمة\u064F من جديد\u064D وحالات\u064F التحميل\u0650 والخطأ\u0650 واضحة');
    same(AR, AR.replace('النموذج', 'النم\u0640\u0640\u0640وذج'));
    same(AR, AR.replace(/ /g, '\u200F '));  // RLM
    same(AR, AR.replace('الحالة', 'ال\u200Cحالة'));  // ZWNJ
    same(`${AR} في ٣ خطوات`, `${AR} في 3 خطوات`); same(`${AR} في ۳ خطوات`, `${AR} في 3 خطوات`);
    same(AR, AR.replace('لا', '\uFEFB').replace('لا', 'لا'));  // a presentation-form lam-alef ligature
  });
  test('no similarity judgment: a different word, a paraphrase, a letter variant or a translation is a DIFFERENT text', () => {
    differ(EN, EN.replace('explicit', 'explicitly handled'));
    differ(AR, AR.replace('واضحة', 'ظاهرة'));
    differ(AR, AR.replace('إلى', 'الى'), );  // hamza on alef is a letter, not a mark: v1 folds no letters
    differ(EN, 'Le formulaire envoie vers un objet état; la liste est rendue à nouveau; chargement et erreur explicites.');
  });
  test('short answers (< 40 code points after normalization) never get a fingerprint; counting is by code point', () => {
    assert.equal(fingerprintInput('نعم، أوافق على ذلك').hashInput, null);
    assert.equal(fingerprintInput('  yes  ').hashInput, null);
    const ar40 = 'ب'.repeat(40); assert.notEqual(fingerprintInput(ar40).hashInput, null); assert.equal(fingerprintInput('ب'.repeat(39)).hashInput, null);
    assert.equal(fingerprintInput('ب'.repeat(39) + '\u064E'.repeat(5)).hashInput, null, 'diacritics do not pad a short answer');
    assert.equal(fingerprintInput('😀'.repeat(40)).normalizedLength, 40, 'astral characters count once');
  });
  test('normalization is idempotent', () => {
    for (const t of [EN, AR, '\uFF34\uFF45\uFF53\uFF54  ٣ \uFB01']) assert.equal(normalizeForFingerprint(normalizeForFingerprint(t)), normalizeForFingerprint(t));
  });
});
