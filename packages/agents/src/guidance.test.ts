import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentGateway, LocalTestProvider, route, CAPABILITIES, GUIDANCE_TOOLS, assertToolAllowed, capabilitySpec, agentDefinition, type DomainFacts,
} from './index.js';

const ids = { n: 0, newId() { return `g-${++this.n}`; }, now() { return '2026-11-25T12:00:00.000Z'; } };
const facts: DomainFacts = { skillStates: {}, existingEvidence: new Set(), approvedTechnologies: new Set(), approvedTechnologiesByEvidence: new Map(),
  knownTechnologies: new Map(), knownSkills: new Map([['skl_js', ['أساسيات JavaScript']]]), numericFacts: new Set() };
const gw = () => new AgentGateway(new LocalTestProvider('normal'), { maxCallsPerWindow: 10, async callsUsed() { return 0; } }, ids, { production: false });

describe('Phase B package 5 — three capabilities on existing contracts, permission-aware read tools', () => {
  test('three capabilities, each mapped to registry contracts and an implemented agent; no new agent', () => {
    assert.deepEqual(CAPABILITIES.map((c) => c.capability), ['career_guidance', 'learning_guidance', 'assessment_feedback']);
    assert.deepEqual(capabilitySpec('career_guidance').contracts, ['A01', 'A02', 'A04']);
    assert.deepEqual(capabilitySpec('learning_guidance').contracts, ['A07', 'A03']);
    assert.deepEqual(capabilitySpec('assessment_feedback').contracts, ['A13', 'A15']);
    for (const c of CAPABILITIES) assert.equal(agentDefinition(c.agentType).implemented, true);
  });
  test('every tool only reads, and a capability may call only its own tools', () => {
    assert.ok(GUIDANCE_TOOLS.every((t) => ['own_data', 'visible_content', 'verified_registry'].includes(t.scope)));
    assert.doesNotThrow(() => assertToolAllowed('assessment_feedback', 'my_feedback'));
    assert.throws(() => assertToolAllowed('career_guidance', 'my_feedback'), /not available/);
    assert.throws(() => assertToolAllowed('assessment_feedback', 'approved_resources'), /not available/);
    assert.throws(() => assertToolAllowed('learning_guidance', 'my_feedback'), /not available/);
  });
  test('routing: R6 (claim drafts) is unchanged; the three capabilities route by request only', () => {
    assert.equal(route({ type: 'user.requested', userId: 'u', facts: { requestedClaimKind: 'cv_bullet', capability: 'career_guidance' } })?.ruleId, 'R6-claim-draft-requested-to-recruitment');
    assert.equal(route({ type: 'user.requested', userId: 'u', facts: { capability: 'career_guidance' } })?.agentType, 'recruitment');
    assert.equal(route({ type: 'user.requested', userId: 'u', facts: { capability: 'learning_guidance' } })?.agentType, 'technical');
    assert.equal(route({ type: 'user.requested', userId: 'u', facts: { capability: 'assessment_feedback' } })?.ruleId, 'R9-assessment-feedback-to-technical');
    assert.equal(route({ type: 'user.requested', userId: 'u', facts: {} }), null);
  });
  test('career guidance through the gateway: the A01 step restated and one gap per recorded gap; nothing else passes', async () => {
    const r = await gw().invoke({ agentType: 'recruitment', trigger: 'user.requested', userId: 'u', targetRoleId: 'r', capability: 'career_guidance', inputReferences: [], domainFacts: facts,
      fullContext: { guidanceRequest: { capability: 'career_guidance', roleId: 'r', nextStep: { code: 'choose_activity', textAr: 'اختاري نشاطًا من أنشطة دورك', whyAr: 'لا عمل جاريًا', href: '/activities' },
        gaps: [{ skillId: 'skl_js', labelAr: 'أساسيات JavaScript', level: 'gap' }], gapOrderAr: 'بترتيب الدور' }, privateNotes: 'secret', plantedIssues: ['x'] } });
    assert.deepEqual(r.proposals.map((p) => p.proposalType), ['recruiter_next_action', 'profile_gap'], JSON.stringify(r.rejected));
    assert.equal(r.proposals[0]!.summary, 'اختاري نشاطًا من أنشطة دورك');
    assert.ok(r.redactedPaths.includes('privateNotes') && r.redactedPaths.includes('plantedIssues'), 'anything outside the allow-list is redacted');
    assert.match(r.invocation.requestedAction, /A01\/A02/);
    assert.equal(r.invocation.modelMetadata, null, 'test provider: no model');
  });
  test('learning guidance: a practice action and self-check questions copied from the indicators; never a solution', async () => {
    const r = await gw().invoke({ agentType: 'technical', trigger: 'user.requested', userId: 'u', targetRoleId: 'r', capability: 'learning_guidance', inputReferences: [], domainFacts: facts,
      fullContext: { guidanceRequest: { capability: 'learning_guidance', skill: { skillId: 'skl_js', labelAr: 'أساسيات JavaScript', indicatorsAr: ['يعالج الأخطاء', 'يفصل المنطق'] },
        practice: { activityId: 'act-1', titleAr: 'قائمة مهام الفريق', startable: true }, resource: null }, reviewerReference: 'solution/app.js' } });
    assert.deepEqual(r.proposals.map((p) => p.proposalType), ['technical_next_action', 'followup_question'], JSON.stringify(r.rejected));
    const text = JSON.stringify(r.proposals);
    assert.ok(!text.includes('solution/app.js'), 'reviewer material never reaches the output');
    assert.ok(r.redactedPaths.includes('reviewerReference'));
    assert.ok(r.proposals.every((p) => !('score' in (p.structuredPayload as object))));
  });
  test('learning guidance with no practice: no practice action is invented', async () => {
    const r = await gw().invoke({ agentType: 'technical', trigger: 'user.requested', userId: 'u', targetRoleId: 'r', capability: 'learning_guidance', inputReferences: [], domainFacts: facts,
      fullContext: { guidanceRequest: { capability: 'learning_guidance', skill: { skillId: 'skl_js', labelAr: 'x', indicatorsAr: ['y'] }, practice: null, resource: null } } });
    assert.deepEqual(r.proposals.map((p) => p.proposalType), ['followup_question']);
  });
  test('the test provider is refused in production for every capability', () => {
    assert.throws(() => new AgentGateway(new LocalTestProvider('normal'), { maxCallsPerWindow: 1, async callsUsed() { return 0; } }, ids, { production: true }), /TEST\/NON-PRODUCTION/);
  });
});
