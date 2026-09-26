import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoUnsupportedLanguage, InvariantViolation } from './index.js';

describe('assertNoUnsupportedLanguage — metrics in words and digits', () => {
  test('quantified outcomes in words are metrics (INV-4)', () => {
    for (const en of ['cut support tickets in half', 'doubled test coverage', 'made the suite twice as fast', 'a tenfold reduction', 'a three-fold gain']) {
      assert.throws(() => assertNoUnsupportedLanguage('', en), InvariantViolation, en);
    }
    for (const ar of ['خفّضتُ الأخطاء إلى النصف', 'ضاعفتُ التغطية ضعفين', 'أسرع مرتين']) {
      assert.throws(() => assertNoUnsupportedLanguage(ar, ''), InvariantViolation, ar);
    }
  });
  test('an outcome without a quantity is not a metric', () => {
    assert.doesNotThrow(() => assertNoUnsupportedLanguage('غطّيتُ حالات الفراغ والتحميل والخطأ باختبارات', 'Covered the empty, loading and error states with tests so the list never renders blank'));
  });
  test('Arabic-Indic percentage is a percentage', () => {
    assert.throws(() => assertNoUnsupportedLanguage('رفعتُ الأداء بنسبة ٤٠٪', ''), InvariantViolation);
  });
});
