import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { activityStartability, assertActivityStartable, assertMaterialFileName, STARTER_MATERIALS_MISSING_AR } from './activity-materials.js';

const INPUTS = [
  { key: 'repo.starter', materialRequired: true },
  { key: 'request.change', materialRequired: true },
  { key: 'brief.described', materialRequired: false },
];

describe('starter materials: the start rule (PO decision 3)', () => {
  test('an activity whose required inputs are not all covered cannot be started; the missing keys are named', () => {
    assert.deepEqual(activityStartability(INPUTS, []), { startable: false, missingInputKeys: ['repo.starter', 'request.change'] });
    assert.deepEqual(activityStartability(INPUTS, [{ audience: 'graduate', coversInputKeys: ['repo.starter'] }]), { startable: false, missingInputKeys: ['request.change'] });
  });
  test('reviewer materials never make an activity startable', () => {
    assert.equal(activityStartability(INPUTS, [{ audience: 'reviewer', coversInputKeys: ['repo.starter', 'request.change'] }]).startable, false);
  });
  test('one graduate package may cover several inputs; described-only inputs need no file', () => {
    assert.deepEqual(activityStartability(INPUTS, [{ audience: 'graduate', coversInputKeys: ['repo.starter', 'request.change'] }]), { startable: true, missingInputKeys: [] });
    assert.equal(activityStartability([{ key: 'brief.described', materialRequired: false }], []).startable, true);
    assert.equal(activityStartability([], []).startable, true, 'an activity with no inputs (legacy) is unaffected');
  });
  test('the refusal is explained in Arabic and carries the reason code', () => {
    assert.throws(() => assertActivityStartable(INPUTS, []), (e: Error) => e.message.startsWith('[starter_materials_missing]') && e.message.includes(STARTER_MATERIALS_MISSING_AR));
    assert.doesNotThrow(() => assertActivityStartable(INPUTS, [{ audience: 'graduate', coversInputKeys: ['repo.starter', 'request.change'] }]));
  });
  test('material file names are safe', () => {
    assert.doesNotThrow(() => assertMaterialFileName('team-tasks-starter.zip'));
    for (const bad of ['../x.zip', 'a/b.zip', '.hidden', 'ملف.zip', '']) assert.throws(() => assertMaterialFileName(bad));
  });
});
