/**
 * DM-7b / P-3 (D-130): agent gap proposals are version-aware. With a classification in effect the required set is
 * Must ∪ Core (worded by class); without one the legacy is_core flag applies exactly as before.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalTestProvider } from './local-test-provider.js';

const evidence = { id: 'ev1', skillId: 'html', skillLabelAr: 'HTML', skillLabelEn: 'HTML', state: 'demonstrated', projectTitle: 'p', evaluationResultId: 'er1', criteriaMet: ['a'], totalScore: 3, maxScore: 4 };
const R = (skillId: string, isCore: boolean, extra: Record<string, unknown> = {}) => ({ skillId, labelAr: skillId, labelEn: skillId, isCore, whyRequiredAr: null, ...extra });
const gaps = async (requirements: unknown[]) => {
  const res = await new LocalTestProvider().complete({ agentType: 'recruitment', trigger: 'evidence.demonstrated', requestedAction: 'x', expectedProposalTypes: ['profile_gap', 'cv_bullet'],
    context: { evidence, evidenceStates: { html: 'demonstrated' }, roleRequirements: { status: 'published', roleLabelEn: 'Junior Frontend', requirements } } });
  return (res.candidates as { proposalType: string; subjectId: string; summary: string }[]).filter((c) => c.proposalType === 'profile_gap');
};

test('legacy (no classification): gaps are the is_core skills, worded as before', async () => {
  const g = await gaps([R('html', true), R('css', true), R('debug', false)]);
  assert.deepEqual(g.map((x) => x.subjectId), ['css']);
  assert.match(g[0]!.summary, /مهارة أساسية للدور/);
});

test('classified: gaps are Must ∪ Core whatever is_core says; Supporting is never a gap; Must is worded as Must', async () => {
  const g = await gaps([
    R('html', true, { requiredForRole: true, professionalClass: 'must' }),
    R('debug', false, { requiredForRole: true, professionalClass: 'must' }),
    R('a11y', false, { requiredForRole: true, professionalClass: 'core' }),
    R('api', true, { requiredForRole: false, professionalClass: 'supporting' }),
  ]);
  assert.deepEqual(g.map((x) => x.subjectId).sort(), ['a11y', 'debug']);
  assert.match(g.find((x) => x.subjectId === 'debug')!.summary, /مهارة إلزامية للدور/);
  assert.match(g.find((x) => x.subjectId === 'a11y')!.summary, /مهارة أساسية للدور/);
});
