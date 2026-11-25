import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertManagerScenario, dueInterventions, managerCap, normalizeManagerMessage, type ManagerScenario } from './virtual-manager.js';

const file = JSON.parse(readFileSync(join(process.cwd(), '..', '..', 'data', 'candidates', 'trk_frontend_junior_v2', 'manager', 'scenarios.candidate.json'), 'utf8')) as { activities: Record<string, ManagerScenario> };
const s = file.activities['act_fe_debug_improve']!;

describe('A11 virtual manager — scenario, triggers and the A19 cap', () => {
  test('the three candidate scenarios are well formed: 1–2 interventions, a stated purpose, a private never-reveal list', () => {
    assert.deepEqual(Object.keys(file.activities).sort(), ['act_fe_change_request', 'act_fe_debug_improve', 'act_fe_integrated_leave_requests']);
    for (const sc of Object.values(file.activities)) assert.doesNotThrow(() => assertManagerScenario(sc));
  });
  test('a scenario without a purpose, with three interventions or with no never-reveal list is refused', () => {
    assert.throws(() => assertManagerScenario({ ...s, interventions: [{ ...s.interventions[0]!, purpose: 'chat' }] }), /purpose/);
    assert.throws(() => assertManagerScenario({ ...s, interventions: [s.interventions[0]!, s.interventions[1]!, { ...s.interventions[0]!, key: 'third' }] }), /one or two/);
    assert.throws(() => assertManagerScenario({ ...s, neverReveal: [] }), /neverReveal/);
  });
  test('interventions arrive at their trigger, once', () => {
    assert.deepEqual(dueInterventions(s, { projectStarted: true, draftSaved: false, delivered: [] }).map((i) => i.key), ['kickoff']);
    assert.deepEqual(dueInterventions(s, { projectStarted: true, draftSaved: true, delivered: ['kickoff'] }).map((i) => i.key), ['change']);
    assert.deepEqual(dueInterventions(s, { projectStarted: true, draftSaved: true, delivered: ['kickoff', 'change'] }), []);
  });
  test('the cap is per intervention and per activity, counted from the graduate turns only', () => {
    const g = (k: string) => ({ interventionKey: k, author: 'graduate' as const, kind: 'reply' });
    const m = (k: string) => ({ interventionKey: k, author: 'manager' as const, kind: 'reply' });
    assert.equal(managerCap(s, []).remainingFor('kickoff'), 2);
    assert.equal(managerCap(s, [g('kickoff'), m('kickoff'), g('kickoff')]).remainingFor('kickoff'), 0);
    const full = managerCap(s, [g('kickoff'), g('kickoff'), g('change'), g('change')]);
    assert.equal(full.reached, true); assert.equal(full.remainingFor('change'), 0);
    assert.equal(managerCap(s, []).remainingFor('unknown'), 0);
  });
  test('messages are trimmed and bounded', () => {
    assert.equal(normalizeManagerMessage('  ما الأهم   أولًا؟ '), 'ما الأهم أولًا؟');
    assert.throws(() => normalizeManagerMessage(' '), /empty/); assert.throws(() => normalizeManagerMessage('x'.repeat(1001)), /too_long/);
  });
});
