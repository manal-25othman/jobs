/**
 * Phase 7 — grounding of career claim drafts, independent of any provider.
 * Unsupported skills, fabricated metrics, outcome claims (REC-006), activity
 * presented as professional work, and technologies outside the cited work.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema, validateAgainstDomain, groundingChecks, outcomeClaimIn, skillsMentioned, ProposalRejected, type DomainFacts } from './index.js';

const facts: DomainFacts = {
  skillStates: { skl_testing: 'demonstrated', skl_comp: 'practiced', skl_css: 'self_reported' },
  existingEvidence: new Set(['ev_1', 'ev_2']),
  approvedTechnologies: new Set(['React', 'CSS']),
  approvedTechnologiesByEvidence: new Map([['ev_1', new Set(['CSS'])], ['ev_2', new Set(['React'])]]),
  knownTechnologies: new Map([['React', ['ReactJS']], ['CSS', []]]),
  knownSkills: new Map([['skl_testing', ['UI testing', 'اختبار الواجهات']], ['skl_comp', ['Component design', 'تصميم المكوّنات']], ['skl_css', ['CSS']]]),
  numericFacts: new Set(['4']),
};
const wording = (ar: string, en: string | null, over: Record<string, unknown> = {}, type = 'cv_bullet', refs = ['ev_1']) => validateSchema('recruitment', {
  proposalType: type, subjectType: 'evidence', subjectId: 'ev_1', summary: 's', rationale: 'r', evidenceRefs: refs, sourceRefs: [], warnings: [], requiresUserApproval: true,
  structuredPayload: { kind: 'wording', currentValue: null, suggestedValueAr: ar, suggestedValueEn: en, supportingSources: [{ kind: 'evidence', ref: refs[0] ?? 'none' }],
    reason: 'x', unsupportedRisk: 'none', limitationNote: null, namedSkillIds: [], namedTechnologies: [], ...over },
});
const rejects = (p: ReturnType<typeof wording>, re: RegExp) =>
  assert.throws(() => validateAgainstDomain(p, facts), (e: Error) => e instanceof ProposalRejected && re.test(e.message), `expected ${re}`);

describe('REC-006 — outcome claims without a number are refused', () => {
  test('the documented case, Arabic and English', () => {
    rejects(wording('تولّيتُ حالات القائمة، ما جعل تهيئة المستخدمين الجدد أسلس', null), /unsupported outcome/);
    rejects(wording('تولّيتُ حالات القائمة', 'Maintained the list states, which made onboarding smoother for new users'), /unsupported outcome/);
  });
  test('paraphrases inside the lexicon', () => {
    for (const en of ['Built the list, which helped new users get started', 'Refactored the form, resulting in fewer support requests',
      'Improved the onboarding experience for the team', 'Made the habit list faster', 'Users loved the new empty state']) {
      rejects(wording('بنيتُ القائمة', en), /unsupported outcome/);
    }
    for (const ar of ['بنيتُ القائمة مما أدّى إلى رضا المستخدمين', 'حسّنتُ تجربة المستخدم في القائمة', 'أصبحت القائمة أكثر سلاسة', 'ساهمتُ في تحسين الأداء']) {
      rejects(wording(ar, null), /unsupported outcome|percentage|mastery/);
      assert.notEqual(outcomeClaimIn(ar), null, `the outcome guard itself sees: ${ar}`);
    }
  });
  test('functional descriptions of the artefact are not outcome claims', () => {
    for (const en of ['Covered the empty, loading and error states of the habit list with tests',
      'Built a form that lets users add habits', 'Shipped the empty states so it never renders a blank screen', 'Wrote tests for the list states']) {
      assert.doesNotThrow(() => validateAgainstDomain(wording('غطّيتُ حالات القائمة باختبارات', en), facts), en);
    }
    assert.equal(outcomeClaimIn('ساهمتُ في بناء القائمة'), null, 'contributing to building is participation, not an outcome');
  });
});

describe('fabricated metrics and unsupported skills', () => {
  test('a number that is not a recorded fact is refused; a recorded one passes', () => {
    rejects(wording('غطّيتُ 12 حالة', 'Covered 12 states'), /number 12/);
    assert.doesNotThrow(() => validateAgainstDomain(wording('غطّيتُ 4 معايير', 'Met 4 criteria'), facts));
  });
  test('a practiced skill written into the text is asserted, even when the proposal does not name it', () => {
    rejects(wording('بنيتُ القائمة وأثبتُّ تصميم المكوّنات', 'Built the list, demonstrating Component design'), /'skl_comp' is 'practiced'/);
    // the demonstrated one passes
    assert.doesNotThrow(() => validateAgainstDomain(wording('أثبتُّ اختبار الواجهات', 'Demonstrated UI testing'), facts));
  });
  test('the longest skill label wins: a label that begins another is not asserted twice', () => {
    const skills = new Map([['long', ['إدارة حالة الواجهة والتفاعل']], ['short', ['إدارة حالة الواجهة']]]);
    assert.deepEqual(skillsMentioned('أثبتُّ إدارة حالة الواجهة والتفاعل', skills, new Map()), ['long']);
    assert.deepEqual(skillsMentioned('أثبتُّ إدارة حالة الواجهة', skills, new Map()), ['short']);
  });
  test('a label that is also a technology term is a technology question, not a skill assertion', () => {
    assert.doesNotThrow(() => validateAgainstDomain(wording('نسّقتُ القائمة بـ CSS', 'Styled the list with CSS'), facts));
  });
});

describe('a completed activity is not professional work', () => {
  test('client, production, real users and employment are refused', () => {
    rejects(wording('بنيتُ القائمة', 'Built the habit list for a client'), /professional work \(a client or employer\)/);
    rejects(wording('بنيتُ القائمة لعميل', null), /professional work/);
    rejects(wording('بنيتُ القائمة', 'Deployed the list to production'), /production use/);
    rejects(wording('بنيتُ القائمة لمستخدمين حقيقيين', null), /real users/);
    rejects(wording('بنيتُ القائمة خلال تدريب تعاوني', null), /employment/);
    rejects(wording('بنيتُ القائمة', 'Built it during my internship'), /employment/);
  });
  test('certifications and employers stay refused (existing guard)', () => {
    rejects(wording('سكرم ماستر معتمد', null), /certification/);
  });
});

describe('a technology must be declared on the work the claim cites', () => {
  test('React declared on another project is not evidence for this claim', () => {
    rejects(wording('بنيتُ القائمة بـ React', 'Built the list in React', {}, 'cv_bullet', ['ev_1']), /not declared on the work behind the cited evidence/);
    assert.doesNotThrow(() => validateAgainstDomain(wording('بنيتُ القائمة بـ React', 'Built the list in React', {}, 'cv_bullet', ['ev_2']), facts));
  });
});

describe('the grounding report names every check', () => {
  test('a grounded claim records each check as passed; a failed one names the failure', () => {
    const ok = groundingChecks(wording('غطّيتُ حالات القائمة باختبارات', 'Covered the list states with tests'), facts);
    assert.ok(ok.length >= 8 && ok.every((c) => c.passed));
    assert.ok(ok.some((c) => c.check === 'no_unsupported_outcome'));
    const bad = groundingChecks(wording('ما جعل القائمة أسلس', null), facts);
    assert.equal(bad.find((c) => c.check === 'no_unsupported_outcome')?.passed, false);
  });
});

import { AgentGateway, LocalTestProvider, route } from './index.js';

describe('claim drafts from the local test provider — every kind is grounded, none is invented', () => {
  let n = 0;
  const gw = new AgentGateway(new LocalTestProvider('normal'), { maxCallsPerWindow: 50, async callsUsed() { return 0; } },
    { newId: () => `id-${++n}`, now: () => '2026-10-08T00:00:00.000Z' }, { production: false });
  const evidence = (state: string, skillId = 'skl_testing') => ({ id: 'ev_2', skillId, skillLabelAr: skillId === 'skl_testing' ? 'اختبار الواجهات' : 'تصميم المكوّنات',
    skillLabelEn: skillId === 'skl_testing' ? 'UI testing' : 'Component design', state, projectTitle: 'متتبّع عادات', evaluationResultId: 'er_1', criteriaMet: ['a', 'b', 'c', 'd'], totalScore: 4, maxScore: 4 });
  const ask = (kind: string, ev: ReturnType<typeof evidence> | null) => gw.invoke({ agentType: 'recruitment', trigger: 'user.requested', userId: 'u', targetRoleId: null,
    fullContext: { claimRequest: { kind, current: null, evidence: ev, demonstratedSkills: [{ skillId: 'skl_testing', labelAr: 'اختبار الواجهات', labelEn: 'UI testing' }],
      roleLabelAr: 'مطوّر واجهات مبتدئ', roleLabelEn: 'Junior Frontend Developer', approvedTechnologies: ['React'] } },
    inputReferences: ev ? [{ kind: 'evidence', id: ev.id }] : [], domainFacts: facts });

  test('R6 routes a requested claim kind to the Recruitment Agent', () => {
    assert.equal(route({ type: 'user.requested', userId: 'u', facts: { requestedClaimKind: 'case_study' } })?.agentType, 'recruitment');
    assert.equal(route({ type: 'user.requested', userId: 'u', facts: {} }), null);
  });
  test('each draftable kind yields one grounded wording proposal that needs the user', async () => {
    for (const kind of ['cv_bullet', 'project_description', 'linkedin_project', 'linkedin_skill', 'case_study', 'professional_summary', 'linkedin_headline', 'linkedin_about']) {
      const r = await ask(kind, ['professional_summary', 'linkedin_headline', 'linkedin_about'].includes(kind) ? null : evidence('demonstrated'));
      assert.equal(r.rejected.length, 0, `${kind}: ${JSON.stringify(r.rejected)}`);
      assert.equal(r.proposals.length, 1, kind);
      assert.equal(r.proposals[0]!.requiresUserApproval, true);
      assert.equal(r.proposals[0]!.structuredPayload.kind, 'wording');
    }
  });
  test('practiced evidence: a project description is drafted, a CV bullet naming the skill is refused', async () => {
    assert.equal((await ask('project_description', evidence('practiced', 'skl_comp'))).proposals.length, 1);
    const bullet = await ask('cv_bullet', evidence('practiced', 'skl_comp'));
    assert.equal(bullet.proposals.length, 0);
    assert.match(bullet.rejected[0]!.reason, /'skl_comp' is 'practiced'/);
  });
  test('no evidence, no draft: the agent says what is missing instead', async () => {
    const r = await ask('case_study', null);
    assert.deepEqual(r.proposals.map((p) => p.proposalType), ['recruiter_next_action']);
  });
});
