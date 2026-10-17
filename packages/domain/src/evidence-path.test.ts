import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSkillEvidencePathParams, validateSkillEvidencePathCatalog, evaluateSkillEvidencePath, taskExclusion, understandingKey, evaluateReadiness, assertReadinessRuleSetSane,
  DomainError, type EvidenceTaskFact, type SkillEvidencePathParams, type ReadinessRuleSet, type SkillReadinessFacts,
} from './index.js';

const HTML = 'skill-html';
let n = 0;
const task = (o: Partial<EvidenceTaskFact> = {}): EvidenceTaskFact => {
  n += 1;
  return {
    evaluationResultId: `r${String(n).padStart(3, '0')}`, evaluatedAt: `2026-10-${String(10 + (n % 15)).padStart(2, '0')}T10:00:00Z`, activitySpecId: 'act-int', activityCode: 'act_int',
    activityVersion: '1.0.0', activityPublished: true, activityIsDemo: false, rubricIsDemo: false, rubricValuesApproved: true, variantFamily: 'fam_int', taskPurpose: 'integrated',
    resultFinal: true, source: 'per_skill', claimed: true, outcome: 'met', basisIndependentlyVerified: true, criteria: { int1: 'met' },
    decision: { id: `d${n}`, decision: 'accepted', overridden: false, policyValidated: false }, evidence: { id: `e${n}`, standing: true },
    legacyAttribution: null, claimAnomaly: false, skillAssessmentId: `sa${n}`, uploadChecksums: [`u${n}`], textHashes: [`t${n}`], starterChecksums: [], ...o,
  };
};
const shortTask = (o: Partial<EvidenceTaskFact> = {}) => task({ activitySpecId: 'act-a', activityCode: 'act_a', variantFamily: 'fam_a', taskPurpose: 'validation', criteria: { a1: 'met' }, ...o });
const P_HTML: SkillEvidencePathParams = parseSkillEvidencePathParams({
  min_distinct_tasks: 2, counted_criteria: { act_int: { versions: '*', criteria: ['int1'] }, act_a: { versions: ['1.0.0'], criteria: ['a1'] } },
  require_validation_activity: true, understanding: 'none',
}, 'p-html');
const P_GIT = parseSkillEvidencePathParams({ min_distinct_tasks: 1, counted_criteria: { act_int: { versions: '*', criteria: ['int8'] } }, require_validation_activity: false, understanding: 'within_criterion' }, 'p-git');
const evalHtml = (tasks: EvidenceTaskFact[], production = false, params = P_HTML) => evaluateSkillEvidencePath({ params, skillId: HTML, tasks, production });

describe('EXT-2 — independent evidence: a project plus a genuinely independent short task', () => {
  test('integrated project + independent validation task (different family, no reused artifact) ⇒ satisfied; the audit names both', () => {
    const r = evalHtml([task(), shortTask()]);
    assert.equal(r.outcome, 'satisfied'); assert.equal(r.independentTasks, 2); assert.equal(r.validationPresent, true);
    assert.deepEqual(r.counted.map((c) => c.activity).sort(), ['act_a@1.0.0', 'act_int@1.0.0']);
    assert.ok(r.counted.every((c) => c.decisionId && c.evidenceId && c.skillAssessmentId), 'every counted task is traceable');
    assert.equal(r.developmentOnly, true, 'rests on development-only decisions here');
  });
  test('the project alone is not enough for a two-task path (F3), even when it is perfect', () => {
    const r = evalHtml([task()]);
    assert.equal(r.outcome, 'not_satisfied'); assert.equal(r.independentTasks, 1);
  });
  test('no universal minimum: the path value decides (a one-task path is satisfied by one task)', () => {
    const one = parseSkillEvidencePathParams({ min_distinct_tasks: 1, counted_criteria: { act_a: { versions: '*', criteria: ['a1'] } }, require_validation_activity: false, understanding: 'none' }, 'p-a11y');
    assert.equal(evalHtml([shortTask()], false, one).outcome, 'satisfied');
  });
});

describe('EXT-2 — the SME-confirmed one-project Git exception', () => {
  const git = (o: Partial<EvidenceTaskFact> = {}) => task({ criteria: { int8: 'met' }, ...o });
  test('one independently verified practical project satisfies P-GIT', () => {
    const r = evaluateSkillEvidencePath({ params: P_GIT, skillId: 'git', tasks: [git()], production: false });
    assert.equal(r.outcome, 'satisfied'); assert.equal(r.independentTasks, 1);
  });
  test('but never through a pending, withdrawn, demo, unverified or ineligible result', () => {
    for (const [why, f] of [
      ['pending', git({ decision: { id: 'd', decision: 'assessment_pending_validation', overridden: false, policyValidated: false } })],
      ['withdrawn', git({ evidence: { id: 'e', standing: false } })],
      ['demo', git({ activityIsDemo: true })],
      ['unverified', git({ basisIndependentlyVerified: false })],
      ['criterion not met', git({ criteria: { int8: 'not_met' } })],
    ] as const) assert.equal(evaluateSkillEvidencePath({ params: P_GIT, skillId: 'git', tasks: [f], production: false }).outcome, 'not_satisfied', why);
  });
});

describe('EXT-2 — duplicates, repeated submissions and artifact reuse', () => {
  test('repeated submissions of the SAME activity collapse to one task (the latest standing)', () => {
    const a = task({ evaluatedAt: '2026-10-01T00:00:00Z' }); const b = task({ evaluatedAt: '2026-10-05T00:00:00Z' });
    const r = evalHtml([a, b, shortTask()]);
    assert.equal(r.independentTasks, 2); assert.deepEqual(r.collapsed, [{ group: 'family:fam_int', kept: b.evaluationResultId, dropped: [a.evaluationResultId] }]);
  });
  test('different activity ids in the SAME variant family count once', () => {
    const r = evalHtml([task(), shortTask({ variantFamily: 'fam_int' })]);
    assert.equal(r.independentTasks, 1); assert.equal(r.outcome, 'not_satisfied');
  });
  test('different activity ids alone do not establish independence: an unknown family ⇒ indeterminate', () => {
    const r = evalHtml([task(), shortTask({ variantFamily: null })]);
    assert.equal(r.outcome, 'indeterminate'); assert.match(r.reasons.join(' '), /variant family unknown/);
  });
  test('a learner upload reused in two tasks ⇒ one task; the audit carries ids only', () => {
    const r = evalHtml([task({ uploadChecksums: ['same'] }), shortTask({ uploadChecksums: ['same'] })]);
    assert.equal(r.independentTasks, 1); assert.equal(r.reuseConflicts[0]!.sharedBy, 'upload');
    assert.doesNotMatch(JSON.stringify(r), /"same"/, 'no checksum in the audit');
  });
  test('reused text (normalized hash) ⇒ one task', () => {
    assert.equal(evalHtml([task({ textHashes: ['h'] }), shortTask({ textHashes: ['h'] })]).independentTasks, 1);
  });
  test('an unchanged platform starter file in both tasks is not a reuse conflict', () => {
    const r = evalHtml([task({ uploadChecksums: ['starter', 'u-x'], starterChecksums: ['starter'] }), shortTask({ uploadChecksums: ['starter', 'u-y'], starterChecksums: ['starter'] })]);
    assert.equal(r.independentTasks, 2); assert.equal(r.reuseConflicts.length, 0);
  });
  test('a duplicate candidate for the same result is counted once', () => {
    const a = task();
    assert.equal(evalHtml([a, { ...a }, shortTask()]).independentTasks, 2);
  });
});

describe('EXT-2 — only standing, valid, traceable, authorized task results count (T1–T7)', () => {
  const cases: [string, Partial<EvidenceTaskFact>, string][] = [
    ['withdrawn evidence', { evidence: { id: 'e', standing: false } }, 'withdrawn'],
    ['no evidence', { evidence: null }, 'no_evidence'],
    ['blocked outcome', { outcome: 'blocked' }, 'not_met'],
    ['incomplete (unapproved threshold)', { outcome: 'incomplete' }, 'not_met'],
    ['not met', { outcome: 'not_met' }, 'not_met'],
    ['unverified basis', { basisIndependentlyVerified: false }, 'unverified_basis'],
    ['unclaimed observation (PO-1)', { claimed: false }, 'not_claimed'],
    ['pending validation', { decision: { id: 'd', decision: 'assessment_pending_validation', overridden: false, policyValidated: false } }, 'decision_not_positive'],
    ['not applicable', { decision: { id: 'd', decision: 'not_applicable', overridden: false, policyValidated: false } }, 'decision_not_positive'],
    ['exception granted (PO-2)', { decision: { id: 'd', decision: 'exception_granted', overridden: false, policyValidated: true } }, 'decision_not_positive'],
    ['overridden by a human', { decision: { id: 'd', decision: 'accepted', overridden: true, policyValidated: false } }, 'overridden'],
    ['no decision', { decision: null }, 'decision_not_positive'],
    ['interim (superseded) result', { resultFinal: false }, 'not_final'],
    ['demo activity', { activityIsDemo: true }, 'demo'],
    ['demo rubric', { rubricIsDemo: true }, 'demo'],
    ['unpublished activity', { activityPublished: false }, 'unpublished'],
    ['rubric values not SME-approved', { rubricValuesApproved: false }, 'values_unapproved'],
    ['activity not in the path', { activityCode: 'act_other' }, 'activity_not_counted'],
    ['claim anomaly (audit C1–C3/C5/C6)', { claimAnomaly: true }, 'claim_anomaly'],
    ['counted criterion not met in THIS evaluation', { criteria: { int1: 'not_met' } }, 'criteria_not_met'],
    ['counted criterion not this skill\'s', { criteria: {} }, 'criteria_not_met'],
  ];
  for (const [name, o, reason] of cases) {
    test(`${name} ⇒ excluded (${reason})`, () => {
      const f = task(o);
      assert.equal(taskExclusion(f, P_HTML, { production: false }), reason);
      const r = evalHtml([f, shortTask()]);
      assert.notEqual(r.outcome, 'satisfied'); assert.ok(r.excluded.some((x) => x.evaluationResultId === f.evaluationResultId && x.reason === reason));
    });
  }
  test('a version the rule does not list ⇒ excluded', () => {
    assert.equal(taskExclusion(shortTask({ activityVersion: '2.0.0' }), P_HTML, { production: false }), 'version_not_listed');
  });
  test('production: a decision of an unvalidated (development-only) policy never counts; development counts it and says so', () => {
    assert.equal(evalHtml([task(), shortTask()], true).outcome, 'not_satisfied');
    assert.ok(evalHtml([task(), shortTask()], true).excluded.every((x) => x.reason === 'policy_unvalidated'));
    const validated = (o: Partial<EvidenceTaskFact> = {}) => ({ decision: { id: 'dv', decision: 'accepted', overridden: false, policyValidated: true }, ...o });
    const r = evalHtml([task(validated()), shortTask(validated())], true);
    assert.equal(r.outcome, 'satisfied'); assert.equal(r.developmentOnly, false);
  });
});

describe('EXT-2 — mixed per-skill results from one activity: separation of outcome, decision, evidence and readiness', () => {
  test('one evaluation: HTML met + accepted with standing evidence counts for HTML; JS not met from the same result does not count for JS', () => {
    const shared = 'r-shared';
    const htmlTask = task({ evaluationResultId: shared });
    const jsTask = task({ evaluationResultId: shared, outcome: 'not_met', criteria: { int1: 'not_met' }, evidence: null, decision: { id: 'dj', decision: 'not_applicable', overridden: false, policyValidated: false } });
    assert.equal(taskExclusion(htmlTask, P_HTML, { production: false }), null);
    assert.equal(taskExclusion(jsTask, P_HTML, { production: false }), 'not_met');
  });
  test('met is not enough: met with no level change (pending) or no evidence never satisfies the rule', () => {
    const met = task({ decision: { id: 'd', decision: 'assessment_pending_validation', overridden: false, policyValidated: false }, evidence: null });
    assert.equal(evalHtml([met, shortTask()]).outcome, 'not_satisfied');
  });
});

describe('EXT-2 — legacy and historical results', () => {
  const legacy = (o: Partial<EvidenceTaskFact> = {}) => task({ source: 'legacy', outcome: null, basisIndependentlyVerified: null, skillAssessmentId: null, legacyAttribution: 'attributed', ...o });
  const withAdapter = { ...P_HTML, legacy_results: 'adapter' as const };
  test('default: legacy results are excluded (fail closed until the PO decides B4-4)', () => {
    assert.equal(P_HTML.legacy_results, 'exclude');
    assert.equal(taskExclusion(legacy(), P_HTML, { production: false }), 'legacy_excluded');
  });
  test('with the adapter: an attributed legacy result with the counted criteria met counts', () => {
    assert.equal(taskExclusion(legacy(), withAdapter, { production: false }), null);
    assert.equal(evaluateSkillEvidencePath({ params: withAdapter, skillId: HTML, tasks: [legacy(), shortTask()], production: false }).outcome, 'satisfied');
  });
  test('with the adapter: unattributable or criterion-less legacy results never count', () => {
    assert.equal(taskExclusion(legacy({ legacyAttribution: 'unverifiable' }), withAdapter, { production: false }), 'legacy_attribution_unverifiable');
    assert.equal(taskExclusion(legacy({ criteria: {} }), withAdapter, { production: false }), 'legacy_criteria_unavailable');
  });
});

describe('EXT-2 — validation activity and understanding element', () => {
  test('required validation activity missing ⇒ not satisfied; unknown purpose ⇒ indeterminate', () => {
    assert.equal(evalHtml([task(), shortTask({ taskPurpose: 'practice' })]).outcome, 'not_satisfied');
    assert.equal(evalHtml([task(), shortTask({ taskPurpose: null })]).outcome, 'indeterminate');
  });
  test('integrated code understanding: never assessed ⇒ indeterminate; not met ⇒ not satisfied; met ⇒ satisfied', () => {
    const params = parseSkillEvidencePathParams({ min_distinct_tasks: 2, counted_criteria: { act_int: { versions: '*', criteria: ['int1'] }, act_a: { versions: '*', criteria: ['a1'] } },
      require_validation_activity: true, understanding: 'integrated_code_understanding', understanding_source: { activity: 'act_int', versions: '*', criteria: ['int7'] } }, 'p');
    const run = (u: boolean | null) => evaluateSkillEvidencePath({ params, skillId: HTML, tasks: [task(), shortTask()], production: false, understandingMet: u }).outcome;
    assert.equal(run(null), 'indeterminate'); assert.equal(run(false), 'not_satisfied'); assert.equal(run(true), 'satisfied');
    assert.equal(understandingKey(params.understanding_source!), 'act_int|*|int7');
  });
});

describe('EXT-2 — params and catalog validation (versioned, per skill)', () => {
  const ok = { min_distinct_tasks: 2, counted_criteria: { act_int: { versions: '*', criteria: ['int1'] } }, require_validation_activity: false, understanding: 'none' };
  test('the shape is strict', () => {
    for (const bad of [
      { ...ok, extra: 1 }, { ...ok, min_distinct_tasks: 0 }, { ...ok, min_distinct_tasks: 1.5 }, { ...ok, counted_criteria: {} },
      { ...ok, counted_criteria: { act_int: { versions: ['x'], criteria: ['int1'] } } }, { ...ok, counted_criteria: { act_int: { versions: '*', criteria: [] } } },
      { ...ok, min_distinct_tasks: 1, require_validation_activity: true }, { ...ok, understanding: 'integrated_code_understanding' },
      { ...ok, understanding_source: { activity: 'act_int', versions: '*', criteria: ['x'] } }, { ...ok, legacy_results: 'maybe' },
      { ...ok, counted_criteria: { act_int: { versions: '*', criteria: ['int1', 'int1'] } } },
    ]) assert.throws(() => parseSkillEvidencePathParams(bad as Record<string, unknown>, 'r'), DomainError, JSON.stringify(bad));
    assert.equal(parseSkillEvidencePathParams(ok, 'r').legacy_results, 'exclude');
  });
  const catalog = [
    { code: 'act_int', version: '1.0.0', published: true, isDemo: false, criteria: [{ key: 'int1', kind: 'skill_evidence', canonicalSkillId: HTML }, { key: 'int2', kind: 'skill_evidence', canonicalSkillId: 'css' }, { key: 'gate', kind: 'gate', canonicalSkillId: null }] },
    { code: 'act_demo', version: '1.0.0', published: true, isDemo: true, criteria: [{ key: 'x', kind: 'skill_evidence', canonicalSkillId: HTML }] },
  ];
  const v = (cc: Record<string, unknown>) => () => validateSkillEvidencePathCatalog(parseSkillEvidencePathParams({ ...ok, counted_criteria: cc }, 'r'), HTML, catalog, 'r');
  test('keys must exist on a published, non-demo version and measure THIS skill', () => {
    assert.doesNotThrow(v({ act_int: { versions: '*', criteria: ['int1'] } }));
    assert.throws(v({ act_int: { versions: '*', criteria: ['int2'] } }), /measures another skill/);
    assert.throws(v({ act_int: { versions: '*', criteria: ['gate'] } }), /not skill evidence/);
    assert.throws(v({ act_int: { versions: '*', criteria: ['nope'] } }), /does not exist/);
    assert.throws(v({ act_int: { versions: ['2.0.0'], criteria: ['int1'] } }), /no published, non-demo version/);
    assert.throws(v({ act_demo: { versions: '*', criteria: ['x'] } }), /no published, non-demo version/);
  });
});

describe('EXT-2 in readiness — inactive, separate, fail closed', () => {
  const facts: SkillReadinessFacts[] = [{ skillId: HTML, labelAr: 'h', labelEn: 'html', verificationLevel: 'demonstrated', standingEvidenceCount: 5, progressState: null, config: null }];
  const set = (o: Partial<ReadinessRuleSet> = {}): ReadinessRuleSet => ({ id: 's', key: 'k', version: 1, reviewStatus: 'approved', activation: 'production_active', baselineOf: null, approvedBy: 'po',
    targetRoleId: null, labelAr: 'x', labelEn: 'x', rules: [{ id: 'r1', type: 'skill_evidence_path', params: { ...P_HTML }, skillId: HTML, labelAr: 'h', labelEn: 'h', enabled: true, position: 0 }], ...o });
  test('a set with an EXT-2 rule is never `evaluated` and never meets, even if configured approved + production_active', () => {
    const r = evaluateReadiness({ ruleSet: set(), resolution: 'production_active', facts, evidence: { tasks: { [HTML]: [task(), shortTask()] }, understanding: {}, production: false } });
    assert.equal(r.status, 'pending_validation'); assert.equal(r.overall, null);
    assert.equal(r.rules[0]!.outcome, 'satisfied', 'the rule itself is computed (development read)');
  });
  test('a demonstrated level and five standing evidence rows do not satisfy EXT-2 without authorized independent tasks', () => {
    const r = evaluateReadiness({ ruleSet: set(), resolution: 'development_only', facts, evidence: { tasks: { [HTML]: [] }, understanding: {}, production: false } });
    assert.equal(r.rules[0]!.outcome, 'not_satisfied');
  });
  test('facts not loaded ⇒ indeterminate, never satisfied; a skill outside the track ⇒ indeterminate', () => {
    assert.equal(evaluateReadiness({ ruleSet: set(), resolution: 'development_only', facts }).rules[0]!.outcome, 'indeterminate');
    assert.equal(evaluateReadiness({ ruleSet: set(), resolution: 'development_only', facts: [], evidence: { tasks: {}, understanding: {}, production: false } }).rules[0]!.outcome, 'indeterminate');
  });
  test('no rule set ⇒ not_yet_configured; the rule needs a skill and valid params', () => {
    assert.equal(evaluateReadiness({ ruleSet: null, resolution: 'none', facts }).status, 'not_yet_configured');
    assert.throws(() => assertReadinessRuleSetSane(set({ rules: [{ id: 'r', type: 'skill_evidence_path', params: { ...P_HTML }, skillId: null, labelAr: 'x', labelEn: 'x', enabled: true, position: 0 }] })), /needs a skill_id/);
    assert.throws(() => assertReadinessRuleSetSane(set({ rules: [{ id: 'r', type: 'skill_evidence_path', params: { min_distinct_tasks: 0 }, skillId: HTML, labelAr: 'x', labelEn: 'x', enabled: true, position: 0 }] })), DomainError);
  });
  test('determinism: the order of candidates never changes the outcome or the audit', () => {
    const ts = [task(), shortTask(), task({ evaluatedAt: '2026-01-01T00:00:00Z' }), shortTask({ uploadChecksums: ['z'] }), task({ evidence: { id: 'w', standing: false } })];
    const base = JSON.stringify(evalHtml(ts));
    for (let i = 0; i < 25; i++) {
      const shuffled = [...ts].sort(() => Math.random() - 0.5);
      assert.equal(JSON.stringify(evalHtml(shuffled)), base);
    }
  });
});

/* ───────────── ENG-1 P4: corroborating evidence (development pathway, policy flag) ───────────── */
import { assessSkill, decideCorroboration, isPositiveVerificationDecision, POSITIVE_VERIFICATION_DECISIONS, skillsWithPositiveVerificationDecision, assertVerificationPolicySane, type VerificationPolicy, type SkillAssessmentInput, type PublishedRubric, type EvaluationRun } from './index.js';

describe('P4 — corroborating evidence: an independent task on an already-demonstrated skill leaves evidence, never a level change', () => {
  const rubric: PublishedRubric = { rubricVersionId: 'rv', version: 'rub@1', activitySpecId: 'a', activitySpecVersion: '1.0.0', status: 'published', passThreshold: 0.75, proposesState: 'demonstrated',
    criteria: [{ key: 'h1', label: 'h1', maxScore: 2, kind: 'skill_evidence', skillId: HTML, mandatory: true, evaluatorType: 'human', check: null, rationaleWhenMet: '-', rationaleWhenUnmet: '-', thresholdForSkill: 0.5, thresholdStatus: 'approved', levelScores: [0, 1, 2] }] };
  const run = (score: number): EvaluationRun => ({ outcome: 'passed', rubricVersion: 'rub@1', activitySpecVersion: '1.0.0', criteria: [{ criterionId: 'h1', score, maxScore: 2, rationale: '-', supportingExcerpt: null, skillId: null, confidence: 1 }],
    integrityChecks: [], totalScore: score, maxScore: 2, proposedState: null, reason: 'r', pendingHumanCriteria: [], deferredChecks: [] });
  const input = (o: Partial<SkillAssessmentInput> = {}): SkillAssessmentInput => ({ rubric, run: run(2), skillIds: [HTML], claimedSkillIds: [HTML], currentStates: { [HTML]: 'demonstrated' }, artifacts: [],
    humanDecidedCriteria: ['h1'], rubricValuesApproved: true, rubricIsDemo: false, ...o });
  const policy = (o: Partial<VerificationPolicy> = {}): VerificationPolicy => ({ id: 'p', key: 'default', version: 980, reviewStatus: 'draft', appliesOutcomes: ['passed'], acceptRubricProposal: true,
    maxResultingState: null, minAssessmentConfidence: null, minIndependentEvidence: null, escalateOn: {}, blockingRule: 'mandatory_criteria_unmet_blocks', perSkillEvidenceDerivation: false,
    decisionActors: ['policy', 'human'], promotionBasis: 'independently_verified', practicedOnSubmission: false, assessmentScope: 'per_skill', recordCorroboratingEvidence: true, ...o });
  const ctx = { rubricProposesState: 'demonstrated' as const, production: false, evaluatorKind: 'human' as const, primaryEvidenceStanding: true };
  test('met, verified, claimed, already Demonstrated ⇒ evidence_corroborated with previous = resulting (no level change)', () => {
    const d = decideCorroboration(policy(), assessSkill(input(), HTML), ctx)!;
    assert.equal(d.decision, 'evidence_corroborated'); assert.equal(d.previousState, 'demonstrated'); assert.equal(d.resultingState, 'demonstrated');
  });
  test('never: flag off, not per-skill, not met, unverified basis, unclaimed, confidence floor, a promotion case, or production', () => {
    assert.equal(decideCorroboration(policy({ recordCorroboratingEvidence: false }), assessSkill(input(), HTML), ctx), null);
    assert.equal(decideCorroboration(policy({ assessmentScope: 'primary_claimed_skill' }), assessSkill(input(), HTML), ctx), null);
    assert.equal(decideCorroboration(policy(), assessSkill(input({ run: run(0) }), HTML), ctx), null, 'not met');
    assert.equal(decideCorroboration(policy(), assessSkill(input({ rubricValuesApproved: false }), HTML), ctx), null, 'unverified basis');
    assert.equal(decideCorroboration(policy(), assessSkill(input({ claimedSkillIds: [] }), HTML), ctx), null, 'unclaimed observation (PO-1)');
    assert.equal(decideCorroboration(policy({ minAssessmentConfidence: 0.99 }), assessSkill(input({ run: { ...run(2), criteria: [{ ...run(2).criteria[0]!, confidence: 0.5 }] } }), HTML), ctx), null, 'confidence floor');
    assert.equal(decideCorroboration(policy(), assessSkill(input({ currentStates: {} }), HTML), ctx), null, 'from gap it is a promotion, not a corroboration');
    assert.equal(decideCorroboration(policy(), assessSkill(input(), HTML), { ...ctx, primaryEvidenceStanding: false }), null, 'withdrawn primary evidence: re-establishment, not corroboration');
    assert.equal(decideCorroboration(policy(), assessSkill(input({ humanDecidedCriteria: [] }), HTML), ctx), null, 'a human-only criterion without a human decision is not a verified basis');
    assert.equal(decideCorroboration(policy({ promotionBasis: 'legacy_any_pass' }), assessSkill(input(), HTML), ctx), null, 'a whole-activity pass basis never corroborates');
    assert.equal(decideCorroboration(policy({ perSkillEvidenceDerivation: true }), assessSkill(input(), HTML), ctx), null, 'H6 stays excluded');
    assert.equal(decideCorroboration(policy(), assessSkill(input(), HTML), { ...ctx, evaluatorKind: 'llm' }), null, 'an LLM evaluator never corroborates');
    assert.throws(() => decideCorroboration(policy(), assessSkill(input(), HTML), { ...ctx, production: true }), DomainError);
  });
  test('a corroborated decision NEVER qualifies a career claim (CLM-1 unchanged, condition 7); EXT-2 may count it', () => {
    const fact = { skillId: HTML, decision: 'evidence_corroborated', resultingState: 'demonstrated' as const, evidenceId: 'e', evidenceSkillId: HTML, evidenceStanding: true, overridden: false };
    assert.equal(isPositiveVerificationDecision(fact), false);
    assert.deepEqual([...POSITIVE_VERIFICATION_DECISIONS], ['accepted', 'evidence_reestablished']);
    assert.equal(skillsWithPositiveVerificationDecision([fact]).size, 0, 'a skill with only a corroborated decision has no positive decision for claims');
    assert.equal(taskExclusion(task({ decision: { id: 'd', decision: 'evidence_corroborated', overridden: false, policyValidated: false } }), P_HTML, { production: false }), null);
  });
  test('the policy flag exists only in the per-skill scope', () => {
    assert.throws(() => assertVerificationPolicySane(policy({ assessmentScope: 'primary_claimed_skill' })), /per-skill scope/);
  });
});
