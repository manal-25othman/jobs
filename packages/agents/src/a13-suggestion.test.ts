import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AgentGateway, LocalTestProvider, route, agentDefinition, reviewSuggestionViolation, validateSchema, type DomainFacts } from './index.js';

const facts: DomainFacts = { skillStates: {}, existingEvidence: new Set(), approvedTechnologies: new Set(), approvedTechnologiesByEvidence: new Map(),
  knownTechnologies: new Map(), knownSkills: new Map(), numericFacts: new Set() };
const ids = { n: 0, newId() { return `s-${++this.n}`; }, now() { return '2026-11-26T12:00:00.000Z'; } };
const gw = () => new AgentGateway(new LocalTestProvider('normal'), { maxCallsPerWindow: 50, async callsUsed() { return 0; } }, ids, { production: false });
const reviewContext = { capability: 'review_suggestion', items: [
  { criterionKey: 'responsive_fixed', labelAr: 'السلوك المتجاوب', suggestion: 'unmet', confidence: 0.7, excerptAr: 'لا تمرير أفقي على عرض 360', basis: ['tests'], escalationReasons: ['calibration_not_approved'] },
  { criterionKey: 'root_cause_note', labelAr: 'ملاحظة الأسباب', suggestion: 'uncertain', confidence: 0, excerptAr: 'بند يقرره إنسان', basis: [], escalationReasons: ['calibration_not_approved', 'human_criterion'] },
] };

describe('A13 reviewer suggestions on the gateway (test provider)', () => {
  test('on the existing technical agent (no new agent), routed by R12 only for a review suggestion', () => {
    const d = agentDefinition('technical');
    assert.ok(d.proposalTypes.includes('criterion_suggestion')); assert.ok(d.allowedContext.includes('reviewContext'));
    assert.equal(route({ type: 'user.requested', userId: 'r', facts: { capability: 'review_suggestion' } })?.ruleId, 'R12-review-suggestion-to-technical');
  });
  test('one suggestion per criterion, each escalated, grounded in its excerpt, needing the reviewer', async () => {
    const r = await gw().invoke({ agentType: 'technical', trigger: 'user.requested', userId: 'reviewer', targetRoleId: null, inputReferences: [], domainFacts: facts,
      fullContext: { reviewContext, referenceSolution: 'MUST NOT PASS', plantedDefects: ['x'] } });
    assert.equal(r.proposals.length, 2); assert.equal(r.rejected.length, 0);
    for (const p of r.proposals) {
      const s = p.structuredPayload as { kind: string; escalate: boolean; excerptAr: string };
      assert.equal(s.kind, 'criterion_suggestion'); assert.equal(s.escalate, true); assert.equal(p.requiresUserApproval, true);
    }
    assert.deepEqual(r.invocation.allowedContext, ['reviewContext'], 'only the review context passes; the reference solution and planted defects are redacted');
  });
  test('a suggestion that is not escalated, or speaks of approval, levels or readiness, is refused', () => {
    const base = { proposalType: 'criterion_suggestion', subjectType: 'submission', subjectId: 'c', summary: 'x', rationale: 'y', evidenceRefs: [], sourceRefs: [], warnings: [], requiresUserApproval: true,
      structuredPayload: { kind: 'criterion_suggestion', criterionKey: 'c', suggestion: 'met', confidence: 0.9, excerptAr: 'e', basis: ['tests'], explanationAr: 'z', escalate: false, escalationReasons: [] } };
    assert.throws(() => validateSchema('technical', base), /escalated/);
    assert.match(reviewSuggestionViolation('تم اعتماد البند')!, /decision/);
    assert.match(reviewSuggestionViolation('الخرّيج جاهز للعمل')!, /decision/);
    assert.match(reviewSuggestionViolation('this criterion is approved')!, /decision/);
    assert.equal(reviewSuggestionViolation('اعتمادًا على الاختبارات الآلية: «لا تمرير أفقي». القرار للمراجِع.'), null);
  });
});
