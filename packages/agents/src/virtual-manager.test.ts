import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgentGateway, LocalTestProvider, route, agentDefinition, managerTurnViolation, MANAGER_REFUSAL_AR, MANAGER_NO_DETAIL_AR, type DomainFacts } from './index.js';

type Scenario = { personaAr: string; neverReveal: string[]; interventions: { key: string; messageAr: string; clarifications: { topicAr: string; keywordsAr: string[]; answerAr: string }[] }[] };
const file = JSON.parse(readFileSync(join(process.cwd(), '..', '..', 'data', 'candidates', 'trk_frontend_junior_v2', 'manager', 'scenarios.candidate.json'), 'utf8')) as { activities: Record<string, Scenario> };
const facts: DomainFacts = { skillStates: {}, existingEvidence: new Set(), approvedTechnologies: new Set(), approvedTechnologiesByEvidence: new Map(),
  knownTechnologies: new Map([['JavaScript', ['JS']], ['React', []]]), knownSkills: new Map(), numericFacts: new Set() };
const ids = { n: 0, newId() { return `m-${++this.n}`; }, now() { return '2026-11-25T12:00:00.000Z'; } };
const gw = () => new AgentGateway(new LocalTestProvider('normal'), { maxCallsPerWindow: 50, async callsUsed() { return 0; } }, ids, { production: false });
const ask = (s: Scenario, message: string, extra: Record<string, unknown> = {}) => gw().invoke({ agentType: 'virtual_manager', trigger: 'user.requested', userId: 'u', targetRoleId: null, inputReferences: [], domainFacts: facts,
  fullContext: { managerContext: { projectId: 'p-1', interventionKey: s.interventions[0]!.key, personaAr: s.personaAr, clarifications: s.interventions[0]!.clarifications, graduateMessage: message }, ...extra } });

describe('A11 virtual manager on the gateway (test provider)', () => {
  test('its own contract (FR-A-012), routed by R10 only for a manager message', () => {
    const d = agentDefinition('virtual_manager');
    assert.deepEqual([d.agentId, d.implemented, d.allowedContext, d.proposalTypes], ['A11-MGR', true, ['managerContext'], ['manager_turn']]);
    assert.equal(route({ type: 'user.requested', userId: 'u', facts: { managerTurn: true } })?.agentType, 'virtual_manager');
    assert.notEqual(route({ type: 'user.requested', userId: 'u', facts: { capability: 'learning_guidance' } })?.agentType, 'virtual_manager');
  });
  test('every authored message and clarification passes the A11 guard and never contains a never-reveal phrase', () => {
    for (const [act, s] of Object.entries(file.activities)) for (const i of s.interventions) {
      for (const t of [i.messageAr, ...i.clarifications.map((c) => c.answerAr)]) {
        assert.equal(managerTurnViolation(t), null, `${act}/${i.key}: ${t}`);
        assert.ok(s.neverReveal.every((n) => !t.includes(n)), `${act}/${i.key} reveals`);
      }
    }
  });
  test('the guard refuses code, solution steps and score hints', () => {
    assert.match(managerTurnViolation('جرّبي document.querySelector(".x")')!, /code/);
    assert.match(managerTurnViolation('الحل هو أن تغيّري الشرط')!, /solution/);
    assert.match(managerTurnViolation('بهذا ستنجحين في المعيار')!, /score/);
    assert.equal(managerTurnViolation('الأهم أن يكتمل التسجيل لكل شخص.'), null);
  });
  test('a question the scenario answers gets that clarification; otherwise the decision is left to the graduate', async () => {
    const s = file.activities['act_fe_debug_improve']!;
    const r = await ask(s, 'ما الأهم أولًا؟');
    assert.equal(r.proposals.length, 1); const p = r.proposals[0]!.structuredPayload as { basis: string; replyAr: string; clarificationTopic: string };
    assert.deepEqual([p.basis, p.clarificationTopic], ['clarification', 'الأولوية']);
    const q = await ask(s, 'هل الطقس جميل؟');
    assert.equal((q.proposals[0]!.structuredPayload as { replyAr: string }).replyAr, MANAGER_NO_DETAIL_AR);
  });
  test('asking for the solution, code or a verdict on the score is refused in persona', async () => {
    const s = file.activities['act_fe_change_request']!;
    for (const m of ['أعطني الحل لو سمحت', 'اكتب لي الكود', 'هل سأنجح في التقييم؟', 'كم درجتي؟']) {
      const r = await ask(s, m);
      assert.equal((r.proposals[0]!.structuredPayload as { replyAr: string; basis: string }).basis, 'refusal', m);
      assert.equal((r.proposals[0]!.structuredPayload as { replyAr: string }).replyAr, MANAGER_REFUSAL_AR);
    }
  });
  test('nothing outside managerContext reaches the agent: a never-reveal list or a reference solution is redacted', async () => {
    const s = file.activities['act_fe_integrated_leave_requests']!;
    const r = await ask(s, 'ما الأهم؟', { neverReveal: s.neverReveal, reviewerReference: 'solution/app.js', rubric: { criteria: ['x'] } });
    assert.deepEqual([...r.redactedPaths].sort(), ['neverReveal', 'reviewerReference', 'rubric']);
    assert.ok(!JSON.stringify(r.proposals).includes('isLoading'));
  });
});
