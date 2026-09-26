import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentGateway, LocalTestProvider, validateSchema, validateAgainstDomain, ProposalRejected,
  route, nudgesFor, redactForAgent, AGENTS, agentDefinition, assertLifecycle,
  type DomainFacts, type AgentProposal, type ProposalLifecycle,
} from './index.js';

const ids = { n: 0, newId() { return `id-${++this.n}`; }, now() { return '2026-09-26T12:00:00.000Z'; } };
const budget = { maxCallsPerWindow: 10, async callsUsed() { return 0; } };
const facts: DomainFacts = {
  skillStates: { skl_testing: 'demonstrated', skl_css: 'self_reported', skl_comp: 'practiced' },
  existingEvidence: new Set(['ev_1']), approvedTechnologies: new Set(),
  knownTechnologies: new Map([['React', ['ReactJS']], ['Vue', []], ['Next.js', ['NextJS']]]),
  numericFacts: new Set(['2', '4']),
};
const evidenceCtx = { evidence: { id: 'ev_1', skillId: 'skl_testing', skillLabelAr: 'اختبار الواجهات', skillLabelEn: 'UI testing',
  state: 'demonstrated', projectTitle: 'متتبّع عادات', evaluationResultId: 'er_1', criteriaMet: ['a', 'b'], totalScore: 4, maxScore: 4 },
  email: 'sara@example.test', objectPath: 'u/x/y', privateNotes: 'secret', projects: [{ title: 'p', kind: 'personal_project', description: 'private detail' }] };

function gw(mode: 'normal' | 'malformed' | 'error' | 'invents' = 'normal') {
  return new AgentGateway(new LocalTestProvider(mode), budget, ids, { production: false });
}
const wording = (over: Partial<Record<string, unknown>> = {}) => ({
  proposalType: 'cv_bullet', subjectType: 'evidence', subjectId: 'ev_1', summary: 's', rationale: 'r',
  evidenceRefs: ['ev_1'], sourceRefs: [], warnings: [], requiresUserApproval: true,
  structuredPayload: { kind: 'wording', currentValue: null, suggestedValueAr: 'عملتُ على المشروع', suggestedValueEn: 'Worked on it',
    supportingSources: [{ kind: 'evidence', ref: 'ev_1' }], reason: 'x', unsupportedRisk: 'none', limitationNote: null,
    namedSkillIds: ['skl_testing'], namedTechnologies: [], ...over },
});

describe('1 — the Recruitment Agent cannot create final CV content directly', () => {
  test('its only output is a Proposal that requires approval and domain validation', async () => {
    const r = await gw().invoke({ agentType: 'recruitment', trigger: 'evidence.demonstrated', userId: 'u', targetRoleId: null,
      fullContext: evidenceCtx, inputReferences: [{ kind: 'evidence', id: 'ev_1' }], domainFacts: facts });
    const cv = r.proposals.find((p) => p.proposalType === 'cv_bullet')!;
    assert.ok(cv); assert.equal(cv.requiresUserApproval, true); assert.equal(cv.requiresDomainValidation, true);
    assert.ok(!('activate' in cv) && !('publish' in cv), 'no action verb exists on the envelope');
  });
});

describe('2 — a wording proposal always requires explicit approval', () => {
  test('requiresUserApproval is forced true for wording types even if the candidate says false', () => {
    const shaped = validateSchema('recruitment', { ...wording(), requiresUserApproval: false });
    assert.equal(shaped.requiresUserApproval, true);
  });
});

describe('3, 4, 5 — unsupported skill, invented metric, inferred framework are rejected', () => {
  test('a skill at self_reported cannot be presented', () => {
    const p = validateSchema('recruitment', wording({ namedSkillIds: ['skl_css'] }));
    assert.throws(() => validateAgainstDomain(p, facts), (e: Error) => e instanceof ProposalRejected && /skl_css/.test(e.message));
  });
  test('a percentage is an invented metric', () => {
    const p = validateSchema('recruitment', wording({ suggestedValueAr: 'رفعتُ الأداء 40%', suggestedValueEn: 'Improved 40%' }));
    assert.throws(() => validateAgainstDomain(p, facts), (e: Error) => e instanceof ProposalRejected && /percentage/.test(e.message));
  });
  test('an undeclared framework is refused, whether named or written', () => {
    assert.throws(() => validateAgainstDomain(validateSchema('recruitment', wording({ namedTechnologies: ['React'] })), facts), ProposalRejected);
    assert.throws(() => validateAgainstDomain(validateSchema('recruitment', wording({ suggestedValueEn: 'Built it in React' })), facts), ProposalRejected);
    assert.throws(() => validateAgainstDomain(validateSchema('recruitment', wording({ suggestedValueEn: 'Built it with ReactJS' })), facts), ProposalRejected, 'aliases count');
    const declared = { ...facts, approvedTechnologies: new Set(['React']) };
    assert.doesNotThrow(() => validateAgainstDomain(validateSchema('recruitment', wording({ namedTechnologies: ['React'], suggestedValueEn: 'Built it in React' })), declared));
  });
  test('mastery language is refused', () => {
    assert.throws(() => validateAgainstDomain(validateSchema('recruitment', wording({ suggestedValueAr: 'أتقنت الاختبار' })), facts), ProposalRejected);
  });
  test('a provider that overclaims is refused end to end', async () => {
    const r = await gw('invents').invoke({ agentType: 'recruitment', trigger: 'evidence.demonstrated', userId: 'u', targetRoleId: null,
      fullContext: evidenceCtx, inputReferences: [], domainFacts: facts });
    assert.equal(r.proposals.length, 0); assert.equal(r.usage.status, 'rejected_invalid_output'); assert.ok(r.rejected.length > 0);
  });
});

describe('6, 7 — the Technical Agent cannot touch EvaluationResult or evidence state', () => {
  test('a payload carrying an action key is refused as forbidden_action', () => {
    for (const key of ['evaluationResultPatch', 'newState', 'promote', 'overrideChecks', 'outcome', 'score']) {
      assert.throws(() => validateSchema('technical', { proposalType: 'technical_feedback', subjectType: 'evaluation_result', subjectId: 'er', summary: 's', rationale: 'r',
        evidenceRefs: [], sourceRefs: [], warnings: [], structuredPayload: { kind: 'technical_feedback', strengths: [], weaknesses: [], suggestions: [], [key]: 'x' } }),
        (e: Error) => e instanceof ProposalRejected && e.code === 'forbidden_action', key);
    }
  });
  test('a validation_activity may only recommend, and never Verified', () => {
    const p = validateSchema('technical', { proposalType: 'validation_activity', subjectType: 'skill_claim', subjectId: 'c', summary: 's', rationale: 'r',
      evidenceRefs: [], sourceRefs: [], warnings: [], structuredPayload: { kind: 'validation_activity', skillId: 'skl_comp', description: 'd', wouldPropose: { from: 'demonstrated', to: 'verified' } } });
    assert.throws(() => validateAgainstDomain(p, facts), (e: Error) => e instanceof ProposalRejected && /D-059/.test(e.message));
  });
  test('the technical agent may not emit recruitment types and vice versa', () => {
    assert.throws(() => validateSchema('technical', wording()), ProposalRejected);
    assert.throws(() => validateSchema('recruitment', { proposalType: 'technical_feedback', subjectType: 'evaluation_result', subjectId: 'x', summary: 's', rationale: 'r', evidenceRefs: [], sourceRefs: [], warnings: [], structuredPayload: { kind: 'technical_feedback', strengths: [], weaknesses: [], suggestions: [] } }), ProposalRejected);
  });
});

describe('8, 9 — output is schema validated; invalid proposals are rejected', () => {
  test('a blob, a string, a number and a missing field are each refused', () => {
    for (const bad of [{ this_is: 'blob' }, 'string', 42, null, { ...wording(), summary: '' }, { ...wording(), structuredPayload: { text: 'no kind' } }]) {
      assert.throws(() => validateSchema('recruitment', bad), ProposalRejected);
    }
  });
  test('malformed provider output yields zero proposals and a rejected usage status', async () => {
    const r = await gw('malformed').invoke({ agentType: 'recruitment', trigger: 'evidence.demonstrated', userId: 'u', targetRoleId: null, fullContext: evidenceCtx, inputReferences: [], domainFacts: facts });
    assert.equal(r.proposals.length, 0); assert.equal(r.rejected.length, 3); assert.equal(r.usage.status, 'rejected_invalid_output');
  });
});

describe('10 — source references are preserved', () => {
  test('evidenceRefs and sourceRefs survive validation and carry the input references', async () => {
    const r = await gw().invoke({ agentType: 'recruitment', trigger: 'evidence.demonstrated', userId: 'u', targetRoleId: null, fullContext: evidenceCtx,
      inputReferences: [{ kind: 'evidence', id: 'ev_1' }], domainFacts: facts });
    const cv = r.proposals.find((p) => p.proposalType === 'cv_bullet')!;
    assert.deepEqual([...cv.evidenceRefs], ['ev_1']);
    assert.ok(cv.sourceRefs.some((s) => s.kind === 'evaluation_result' && s.id === 'er_1'));
    assert.deepEqual([...r.invocation.inputReferences], [{ kind: 'evidence', id: 'ev_1' }]);
    assert.equal(r.invocation.provenance.class, 'ai_generated');
  });
});

describe('12 — lifecycle: approved history is never rewritten', () => {
  test('approved and rejected are terminal; rejected is kept, not deleted', () => {
    assert.doesNotThrow(() => assertLifecycle('generated', 'validated'));
    assert.doesNotThrow(() => assertLifecycle('awaiting_user', 'rejected'));
    assert.throws(() => assertLifecycle('approved', 'awaiting_user'));
    assert.throws(() => assertLifecycle('rejected', 'approved'));
    assert.throws(() => assertLifecycle('generated', 'approved'), /not permitted/);
  });
});

describe('14, 15 — the orchestrator routes deterministically', () => {
  test('demonstrated evidence → recruitment; failed evaluation → technical; passed-clean → nobody', () => {
    assert.equal(route({ type: 'evidence.demonstrated', userId: 'u', facts: {} })?.agentType, 'recruitment');
    assert.equal(route({ type: 'evaluation.completed', userId: 'u', facts: { outcome: 'below_threshold' } })?.agentType, 'technical');
    assert.equal(route({ type: 'evaluation.completed', userId: 'u', facts: { outcome: 'blocked_by_checks' } })?.agentType, 'technical');
    assert.equal(route({ type: 'evaluation.completed', userId: 'u', facts: { outcome: 'passed', anyCriterionUnmet: false } }), null);
    assert.equal(route({ type: 'claim.unsupported_found', userId: 'u', facts: {} })?.agentType, 'recruitment');
    assert.equal(route({ type: 'criterion.failed', userId: 'u', facts: {} })?.ruleId, 'R5-criterion-failed-to-technical');
  });
  test('the same event always yields the same rule', () => {
    const a = route({ type: 'evaluation.completed', userId: 'u', facts: { outcome: 'below_threshold' } });
    const b = route({ type: 'evaluation.completed', userId: 'u', facts: { outcome: 'below_threshold' } });
    assert.deepEqual(a, b);
  });
});

describe('16 — the Companion surfaces validated proposals only, one at a time', () => {
  const mk = (lifecycle: ProposalLifecycle, proposalType: AgentProposal['proposalType'] = 'cv_bullet') => ({
    proposalId: `p-${lifecycle}`, invocationId: 'i', agentType: 'recruitment' as const, proposalType, subjectType: 'evidence' as const, subjectId: 'e',
    summary: 's', structuredPayload: { kind: 'action' as const, action: 'a', why: 'w', estimatedMinutes: null }, evidenceRefs: [], sourceRefs: [],
    rationale: 'r', warnings: [], requiresUserApproval: true, requiresDomainValidation: true as const, createdAt: 'now', lifecycle,
  });
  test('generated, rejected and superseded produce no nudge', () => {
    assert.deepEqual(nudgesFor([mk('generated'), mk('rejected'), mk('superseded')]), []);
  });
  test('validated produces one nudge with template text, and never more than one', () => {
    const n = nudgesFor([mk('validated'), mk('awaiting_user')]);
    assert.equal(n.length, 1); assert.match(n[0]!.textAr, /بند جديد/);
  });
});

describe('17 — agent failure changes nothing and degrades gracefully', () => {
  test('a provider error returns an empty result with a usage record, and throws nothing', async () => {
    const r = await gw('error').invoke({ agentType: 'technical', trigger: 'evaluation.completed', userId: 'u', targetRoleId: null, fullContext: {}, inputReferences: [], domainFacts: facts });
    assert.equal(r.proposals.length, 0); assert.equal(r.usage.status, 'provider_error'); assert.equal(r.usage.errorType, 'Error');
  });
  test('a budget breach is recorded, not thrown', async () => {
    const g = new AgentGateway(new LocalTestProvider(), { maxCallsPerWindow: 1, async callsUsed() { return 1; } }, ids, { production: false });
    const r = await g.invoke({ agentType: 'technical', trigger: 'evaluation.completed', userId: 'u', targetRoleId: null, fullContext: {}, inputReferences: [], domainFacts: facts });
    assert.equal(r.usage.status, 'budget_exceeded');
  });
});

describe('governance — provider, privacy, extension contracts', () => {
  test('the test provider is refused in production', () => {
    assert.throws(() => new AgentGateway(new LocalTestProvider(), budget, ids, { production: true }), /TEST\/NON-PRODUCTION/);
  });
  test('cost is null for the test provider — never fabricated', async () => {
    const r = await gw().invoke({ agentType: 'recruitment', trigger: 'evidence.demonstrated', userId: 'u', targetRoleId: null, fullContext: evidenceCtx, inputReferences: [], domainFacts: facts });
    assert.equal(r.usage.estimatedCost, null); assert.equal(r.invocation.modelMetadata, null);
  });
  test('redaction: the recruitment agent never sees email, paths, private notes, or project descriptions', () => {
    const r = redactForAgent('recruitment', evidenceCtx);
    assert.ok(!('email' in r.context) && !('objectPath' in r.context) && !('privateNotes' in r.context));
    assert.deepEqual(r.context['projects'], [{ title: 'p', kind: 'personal_project' }]);
    assert.ok(r.redactedPaths.includes('email') && r.passedPaths.includes('evidence') && r.passedPaths.includes('projects.title'));
  });
  test('the technical agent never sees CV or LinkedIn data', () => {
    const r = redactForAgent('technical', { cv: { summary: 'x' }, linkedin: {}, rubric: {}, artifacts: [] });
    assert.ok(!('cv' in r.context) && !('linkedin' in r.context) && 'rubric' in r.context);
  });
  test('the invocation records exactly the paths that were passed', async () => {
    const r = await gw().invoke({ agentType: 'recruitment', trigger: 'evidence.demonstrated', userId: 'u', targetRoleId: null, fullContext: evidenceCtx, inputReferences: [], domainFacts: facts });
    assert.deepEqual([...r.invocation.allowedContext], ['evidence', 'projects.title', 'projects.kind']);
  });
  test('learning, personal_branding and business are extension contracts the gateway refuses', async () => {
    for (const t of ['learning', 'personal_branding', 'business'] as const) {
      assert.equal(agentDefinition(t).implemented, false);
      await assert.rejects(() => gw().invoke({ agentType: t, trigger: 'user.requested', userId: 'u', targetRoleId: null, fullContext: {}, inputReferences: [], domainFacts: facts }), /extension contract/);
    }
    assert.equal(AGENTS.filter((a) => a.implemented).length, 2);
  });
});
