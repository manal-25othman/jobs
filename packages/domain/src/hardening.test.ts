import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStateAvailableInProduction, HIGHEST_AVAILABLE_EVIDENCE_STATE,
  deliverableProgress, persistedPercentage, assertAssetTransition,
  InvariantViolation, MissingPrerequisite,
} from './index.js';

describe('D-059 — Verified stays blocked', () => {
  test('demonstrated is the ceiling', () => {
    assert.equal(HIGHEST_AVAILABLE_EVIDENCE_STATE, 'demonstrated');
    assert.doesNotThrow(() => assertStateAvailableInProduction('demonstrated'));
    assert.doesNotThrow(() => assertStateAvailableInProduction('practiced'));
  });
  test('verified is refused with the reason named', () => {
    const e = assert.throws(() => assertStateAvailableInProduction('verified'), InvariantViolation) as unknown;
    void e;
    try { assertStateAvailableInProduction('verified'); } catch (err) {
      assert.match((err as Error).message, /D-059/);
    }
  });
});

describe('D-058 — progress is a count, never a fabricated percentage', () => {
  test('counts required outputs only', () => {
    const p = deliverableProgress([
      { key: 'a', required: true, completed: true },
      { key: 'b', required: true, completed: false },
      { key: 'c', required: false, completed: true },
    ]);
    assert.equal(p.labelEn, '1 of 2 required outputs completed');
    assert.equal(p.allRequiredDone, false);
    assert.ok(!('percent' in p), 'the type carries no percentage');
  });
  test('a percentage needs a named persisted source', () => {
    assert.throws(() => persistedPercentage({ numerator: 2, denominator: 5, persistedIn: '' }), MissingPrerequisite);
    assert.equal(persistedPercentage({ numerator: 2, denominator: 5, persistedIn: 'work_item.status' }), 40);
  });
});

describe('D-057 — preview → optional edit → explicit approval → active', () => {
  test('no path skips preview', () => {
    assert.throws(() => assertAssetTransition('draft', 'approved', { userApprovedAt: 'x' }), MissingPrerequisite);
    assert.throws(() => assertAssetTransition('draft', 'active', { userApprovedAt: 'x' }), MissingPrerequisite);
    assert.doesNotThrow(() => assertAssetTransition('draft', 'preview', {}));
    assert.doesNotThrow(() => assertAssetTransition('preview', 'approved', { userApprovedAt: 'x' }));
  });
});
