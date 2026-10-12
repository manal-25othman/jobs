/**
 * Graduate activity journey (Phase 2) — presentation rules.
 * Run: node --experimental-strip-types --test apps/app/test/journey.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessmentCopy, workStatusCopy, nextActionFor, evaluationPageState, levelChangeToShow, buildFileMapping, buildTextArtifacts,
  attemptsOf, criterionResult, isAssessedWork, WORK_STATUS_COPY, SUBMISSION_IS_NOT_A_LEVEL_AR, friendlyErrorAr, attributionNoticeAr,
} from '../src/lib/journey.ts';

describe('assessment copy never promises more than the API reports', () => {
  test('only a human_reviewed activity that can support a level is described as able to raise one', () => {
    const human = assessmentCopy({ mode: 'human_reviewed', evaluable: true, canSupportLevel: true }, false);
    assert.equal(human.chipAr, 'يُراجَع بشريًا'); assert.match(human.explanationAr, /قد يرتفع/);
    assert.match(human.explanationAr, /لا يُمنح مستوى «موثّقة» تلقائيًا/);
    for (const a of [
      { mode: 'formative_only' as const, evaluable: true, canSupportLevel: false },
      { mode: 'human_reviewed' as const, evaluable: true, canSupportLevel: false },
      { mode: 'automated_verified' as const, evaluable: true, canSupportLevel: true }, // reserved: never returned; never promised
    ]) {
      const c = assessmentCopy(a, false);
      assert.doesNotMatch(c.explanationAr, /قد يرتفع/, JSON.stringify(a));
      assert.match(c.chipAr, /لا يرفع المستوى/);
    }
  });
  test('demo content is labelled and never described as raising a level, whatever the mode says', () => {
    const c = assessmentCopy({ mode: 'human_reviewed', evaluable: true, canSupportLevel: true }, true);
    assert.equal(c.chipAr, 'تجريبي — غير مراجَع'); assert.match(c.explanationAr, /لا يرفع مستوى أي مهارة/);
  });
  test('an activity with no published rubric says so', () => {
    assert.match(assessmentCopy({ mode: 'formative_only', evaluable: false, canSupportLevel: false }, false).explanationAr, /لا توجد معايير تقييم منشورة/);
  });
  test('the submission-is-not-a-level sentence states both halves', () => {
    assert.match(SUBMISSION_IS_NOT_A_LEVEL_AR, /لا يرفع مستوى المهارة وحده/); assert.match(SUBMISSION_IS_NOT_A_LEVEL_AR, /قرار التحقق/);
  });
});

describe('work status', () => {
  test('every backend work status has Arabic copy; only level_recorded reads as a level change', () => {
    for (const s of ['in_progress', 'submitted', 'evaluation_running', 'evaluation_failed', 'under_human_review', 'blocked_by_checks', 'pending_validation', 'level_recorded', 'feedback_ready']) {
      assert.ok(WORK_STATUS_COPY[s as keyof typeof WORK_STATUS_COPY], s);
      assert.equal(/تغيّر مستوى/.test(workStatusCopy(s).labelAr), s === 'level_recorded', s);
    }
    assert.equal(workStatusCopy('something_new').labelAr, 'حالة غير معروفة');
  });
  test('completed work is distinct from a level change', () => {
    assert.equal(isAssessedWork('pending_validation'), true); assert.equal(isAssessedWork('feedback_ready'), true);
    assert.equal(isAssessedWork('in_progress'), false); assert.equal(isAssessedWork('under_human_review'), false);
  });
  test('next actions point at pages that re-read state; nothing starts an evaluation from a link', () => {
    assert.deepEqual(nextActionFor({ projectId: 'p1', workStatus: 'in_progress', latestSubmissionId: null }), { labelAr: 'تابعي العمل', href: '/work/p1' });
    assert.equal(nextActionFor({ projectId: 'p1', workStatus: 'submitted', latestSubmissionId: 's1' }).href, '/evaluation?submission=s1');
    assert.equal(nextActionFor({ projectId: 'p1', workStatus: 'under_human_review', latestSubmissionId: 's1' }).href, '/evaluation?submission=s1');
    assert.equal(nextActionFor({ projectId: 'p/1', workStatus: 'in_progress', latestSubmissionId: null }).href, '/work/p%2F1', 'ids are encoded');
    for (const s of Object.keys(WORK_STATUS_COPY)) assert.doesNotMatch(nextActionFor({ projectId: 'p', workStatus: s, latestSubmissionId: 's' }).href, /evaluate/);
  });
});

describe('evaluation page state', () => {
  const v = (state: string, workStatus: string, outcome: string | null = null) => evaluationPageState({ state, workStatus, outcome });
  test('the six required states (and a failed run) are distinguished from the read view', () => {
    assert.equal(v('not_evaluated', 'submitted'), 'not_evaluated');
    assert.equal(v('running', 'evaluation_running'), 'evaluation_pending');
    assert.equal(v('failed', 'evaluation_failed'), 'evaluation_failed');
    assert.equal(v('queued_for_human', 'under_human_review', 'needs_human_review'), 'human_review_pending');
    assert.equal(v('completed', 'blocked_by_checks', 'blocked_by_checks'), 'needs_more_evidence');
    assert.equal(v('completed', 'feedback_ready', 'below_threshold'), 'needs_more_evidence');
    assert.equal(v('completed', 'pending_validation', 'passed'), 'pending_validation');
    assert.equal(v('completed', 'level_recorded', 'passed'), 'completed_level');
    assert.equal(v('completed', 'feedback_ready', 'passed'), 'completed_feedback');
  });
});

describe('a level is shown only when the backend recorded one', () => {
  const t = { from: 'gap', to: 'demonstrated', evidenceId: 'e1' };
  test('level_recorded with a transition: shown', () => {
    assert.deepEqual(levelChangeToShow({ workStatus: 'level_recorded', transition: t }), { fromAr: 'فجوة', toAr: 'مُثبتة بدليل', to: 'demonstrated', evidenceId: 'e1' });
  });
  test('a pass that is pending validation, feedback, a missing transition, or Verified: never shown', () => {
    for (const ws of ['pending_validation', 'feedback_ready', 'under_human_review', 'submitted']) assert.equal(levelChangeToShow({ workStatus: ws, transition: t }), null, ws);
    assert.equal(levelChangeToShow({ workStatus: 'level_recorded', transition: null }), null);
    assert.equal(levelChangeToShow({ workStatus: 'level_recorded', transition: { ...t, to: 'verified' } }), null);
  });
  test('criterion results in words', () => {
    assert.equal(criterionResult(2, 2).labelAr, 'مستوفى'); assert.equal(criterionResult(1, 2).labelAr, 'مستوفى جزئيًا'); assert.equal(criterionResult(0, 1).labelAr, 'غير مستوفى بعد');
  });
});

describe('workspace request building: explicit mapping, no declarations', () => {
  const D = [
    { key: 'file.index_html', kind: 'file' as const, mandatory: true }, { key: 'file.styles_css', kind: 'file' as const, mandatory: true },
    { key: 'file.extra', kind: 'file' as const, mandatory: false }, { key: 'note.data_flow', kind: 'text' as const, mandatory: true },
    { key: 'answer.optional', kind: 'text' as const, mandatory: false },
  ];
  test('files are mapped by the deliverable key of their slot, whatever order they were uploaded in', () => {
    const a = buildFileMapping(D, { 'file.styles_css': 'u2', 'file.index_html': 'u1' });
    const b = buildFileMapping(D, { 'file.index_html': 'u1', 'file.styles_css': 'u2' });
    const byKey = (x: { files: { uploadId: string; deliverableKey: string }[] }) => Object.fromEntries(x.files.map((f) => [f.deliverableKey, f.uploadId]));
    assert.deepEqual(byKey(a), { 'file.index_html': 'u1', 'file.styles_css': 'u2' }); assert.deepEqual(byKey(a), byKey(b));
    assert.deepEqual(a.missing, []);
  });
  test('missing mandatory files are named; undeclared slots and text deliverables are never sent as files', () => {
    const r = buildFileMapping(D, { 'file.index_html': 'u1', 'file.made_up': 'u9', 'note.data_flow': 'u8' });
    assert.deepEqual(r.files, [{ uploadId: 'u1', deliverableKey: 'file.index_html' }]);
    assert.deepEqual(r.missing, ['file.styles_css']);
  });
  test('text deliverables become text artifacts under their declared keys only; blank mandatory text is named', () => {
    const r = buildTextArtifacts(D, { 'note.data_flow': '  explained  ', 'answer.optional': '   ', 'test.empty_state': 'true', 'signal.x': 'y' });
    assert.deepEqual(r.artifacts, [{ key: 'note.data_flow', kind: 'text', valueText: 'explained' }]);
    assert.deepEqual(buildTextArtifacts(D, {}).missing, ['note.data_flow']);
    for (const a of r.artifacts) assert.doesNotMatch(a.key, /^(signal|verified|followup|file|link|test)\./, 'no platform namespace and no declared ticks');
  });
});

describe('attempts', () => {
  test('one attempt per submission item of the project, newest first', () => {
    const items = [
      { channel: 'activity', parentItemId: null, projectId: 'p', submissionId: 's1', attemptNumber: 1, submittedAt: 'a', status: 'superseded' },
      { channel: 'activity', parentItemId: null, projectId: 'p', submissionId: 's2', attemptNumber: 2, submittedAt: 'b', status: 'submitted' },
      { channel: 'file', parentItemId: 'x', projectId: 'p', submissionId: 's2', attemptNumber: 2, submittedAt: 'b', status: 'submitted' },
      { channel: 'activity', parentItemId: null, projectId: 'other', submissionId: 's3', attemptNumber: 1, submittedAt: 'c', status: 'submitted' },
    ];
    assert.deepEqual(attemptsOf(items, 'p').map((a) => a.submissionId), ['s2', 's1']);
  });
});

describe('refusals in words', () => {
  test('a named API refusal becomes an actionable Arabic sentence; unknown ones keep the fallback; detail is kept', () => {
    const r = friendlyErrorAr('[missing_mandatory_deliverable] mandatory file deliverable(s) missing: file.test', 'تعذّر التسليم');
    assert.match(r.textAr, /ينقص ملف إلزامي/); assert.match(r.detail, /file\.test/);
    assert.equal(friendlyErrorAr('[skill_not_mapped_to_activity] x', 'f').textAr, 'إحدى المهارات المختارة ليست من مهارات هذا النشاط.');
    assert.equal(friendlyErrorAr('upload u not confirmed', 'تعذّر التسليم').textAr, 'تعذّر التسليم');
    assert.equal(friendlyErrorAr('[something_else] x', 'fallback').textAr, 'fallback');
  });
});

describe('O-1 — honest feedback when no level could be attributed (ENG-1 P0)', () => {
  test('ambiguous / no_candidate on a completed evaluation: says it was assessed, no level changed, why — and never that a skill failed', () => {
    for (const a of ['ambiguous', 'no_candidate'] as const) {
      const n = attributionNoticeAr(a, 'completed_feedback')!;
      assert.ok(n, a);
      assert.match(n.bodyAr, /اكتمل النشاط وقُيِّم عملك/);
      assert.match(n.titleAr, /لم يُسجَّل مستوى/);
      assert.match(n.noteAr, /ليس إخفاقًا/);
      assert.doesNotMatch(`${n.titleAr} ${n.bodyAr} ${n.noteAr}`, /أخفقتِ|رسبتِ|فشلتِ|لم تنجحي/);
    }
    assert.match(attributionNoticeAr('ambiguous', 'completed_feedback')!.noteAr, /أكثر من مهارة رئيسية/);
    assert.match(attributionNoticeAr('no_candidate', 'completed_feedback')!.noteAr, /ليست من المهارات الرئيسية/);
  });
  test('during human review: a note that no level will follow; nothing for attributed or older results', () => {
    assert.match(attributionNoticeAr('ambiguous', 'human_review_pending')!.noteAr, /لن يُسجَّل مستوى/);
    assert.equal(attributionNoticeAr('attributed', 'completed_feedback'), null);
    assert.equal(attributionNoticeAr(null, 'completed_feedback'), null);
    assert.equal(attributionNoticeAr(undefined, 'completed_feedback'), null);
    assert.equal(attributionNoticeAr('ambiguous', 'completed_level'), null, 'never beside a recorded level');
    assert.equal(attributionNoticeAr('ambiguous', 'not_evaluated'), null);
  });
});

/* ───────────── ENG-1 P5: per-skill results (development pathway) ───────────── */
import {
  hasPerSkillResults, skillOutcomeCopy, skillCriterionCopy, skillLevelLine, perSkillSummaryAr, perSkillWorkLineAr, workSkillChip, type SkillResultView,
} from '../src/lib/journey.ts';

const sk = (o: Partial<SkillResultView>): SkillResultView => ({
  skillId: 's', skillLabelAr: 'مهارة', outcome: 'met', currentState: 'gap', criteria: [{ key: 'k', nameAr: 'معيار', status: 'met' }],
  decision: { decision: 'not_applicable', previousState: 'gap', resultingState: 'gap' }, evidence: null, ...o,
});
const FAIL_WORDS = /أخفقتِ|رسبتِ|فشلتِ|راسب/;

describe('P5 — per-skill results are shown skill by skill, assessment apart from level', () => {
  test('a legacy evaluation (no skills[] or empty) is not a per-skill one', () => {
    assert.equal(hasPerSkillResults({}), false); assert.equal(hasPerSkillResults({ skills: [] }), false); assert.equal(hasPerSkillResults({ skills: null }), false);
    assert.equal(hasPerSkillResults({ skills: [sk({})] }), true);
  });
  test('every outcome has learner-facing words; not_assessed / blocked / incomplete never read as a failure', () => {
    for (const outcome of ['met', 'not_met', 'incomplete', 'not_assessed', 'blocked']) {
      const c = skillOutcomeCopy(sk({ outcome }));
      assert.ok(c.labelAr && c.explanationAr, outcome); assert.doesNotMatch(c.labelAr + c.explanationAr, FAIL_WORDS, outcome);
    }
    assert.match(skillOutcomeCopy(sk({ outcome: 'not_assessed', criteria: [] })).explanationAr, /ليس إخفاقًا/);
    assert.match(skillOutcomeCopy(sk({ outcome: 'blocked' })).explanationAr, /ليس حكمًا على المهارة/);
    assert.match(skillOutcomeCopy(sk({ outcome: 'incomplete', criteria: [{ key: 'k', nameAr: null, status: 'threshold_unapproved' }] })).labelAr, /اعتماد الخبراء/);
    assert.match(skillOutcomeCopy(sk({ outcome: 'incomplete', criteria: [{ key: 'k', nameAr: null, status: 'pending' }] })).labelAr, /المراجِع/);
    assert.match(skillOutcomeCopy(sk({ outcome: 'not_met' })).explanationAr, /لا ينزل/);
  });
  test('the outcome copy never claims a level; a met skill is not a level change', () => {
    assert.doesNotMatch(skillOutcomeCopy(sk({ outcome: 'met' })).labelAr, /مستوى|مُثبتة|موثّقة/);
    assert.equal(skillLevelLine(sk({ outcome: 'met' })).kind, 'unchanged', 'met without a recorded decision moves nothing');
  });
  test('a level change is shown only from a decision that recorded one with standing evidence — never Verified', () => {
    const raised = skillLevelLine(sk({ decision: { decision: 'accepted', previousState: 'gap', resultingState: 'demonstrated' }, evidence: { id: 'e1', withdrawn: false } }));
    assert.equal(raised.kind, 'raised'); assert.equal(raised.evidenceId, 'e1'); assert.match(raised.labelAr, /فجوة ← مُثبتة بدليل/);
    assert.equal(skillLevelLine(sk({ decision: { decision: 'accepted', previousState: 'gap', resultingState: 'demonstrated' }, evidence: null })).kind, 'unchanged', 'no evidence, no change shown');
    assert.equal(skillLevelLine(sk({ decision: { decision: 'accepted', previousState: 'demonstrated', resultingState: 'verified' }, evidence: { id: 'e', withdrawn: false } })).kind, 'unchanged');
    const w = skillLevelLine(sk({ decision: { decision: 'accepted', previousState: 'gap', resultingState: 'demonstrated' }, evidence: { id: 'e1', withdrawn: true } }));
    assert.equal(w.kind, 'raised_withdrawn'); assert.equal(w.evidenceId, null, 'no CV proposal from withdrawn evidence');
    assert.equal(skillLevelLine(sk({ decision: { decision: 'evidence_reestablished', previousState: 'demonstrated', resultingState: 'demonstrated' }, evidence: { id: 'e2', withdrawn: false } })).kind, 'reestablished');
    assert.equal(skillLevelLine(sk({ decision: { decision: 'assessment_pending_validation', previousState: 'gap', resultingState: 'gap' } })).kind, 'pending_validation');
    assert.equal(skillLevelLine(sk({ outcome: 'incomplete', criteria: [{ key: 'k', nameAr: null, status: 'pending' }] })).kind, 'not_decided', 'pending review decides nothing yet');
    assert.equal(skillLevelLine(sk({ decision: null })).kind, 'not_decided');
  });
  test('mixed results: the summary counts recorded changes only, and says completing the activity is not proving every skill', () => {
    const html = sk({ skillId: 'h', decision: { decision: 'accepted', previousState: 'gap', resultingState: 'demonstrated' }, evidence: { id: 'e', withdrawn: false } });
    const js = sk({ skillId: 'j', outcome: 'not_met', criteria: [{ key: 'f', nameAr: 'التحقق من النموذج', status: 'not_met' }] });
    const sum = perSkillSummaryAr([html, js]);
    assert.equal(sum.raised, 1); assert.equal(sum.total, 2); assert.match(sum.titleAr, /1 من 2/); assert.match(sum.bodyAr, /اكتمال النشاط لا يعني استيفاء كل مهارة/);
    assert.match(perSkillSummaryAr([js]).titleAr, /لم يتغيّر مستوى أي منها/);
    assert.match(perSkillSummaryAr([sk({ outcome: 'incomplete', criteria: [{ key: 'k', nameAr: null, status: 'pending' }] })]).titleAr, /بانتظار المراجعة/);
  });
  test('criterion statuses have words; nothing exposes a threshold value', () => {
    for (const st of ['met', 'not_met', 'pending', 'threshold_unapproved', 'other']) assert.ok(skillCriterionCopy(st).labelAr);
    assert.doesNotMatch(JSON.stringify([skillCriterionCopy('threshold_unapproved'), skillOutcomeCopy(sk({ outcome: 'incomplete', criteria: [{ key: 'k', nameAr: null, status: 'threshold_unapproved' }] }))]), /0\.\d|%/);
  });
  test('My Work: a per-skill line and one chip per skill; legacy results keep the existing line', () => {
    assert.equal(perSkillWorkLineAr([]), null); assert.equal(perSkillWorkLineAr(undefined), null);
    assert.match(perSkillWorkLineAr([{ outcome: 'met', levelChanged: true }, { outcome: 'not_met', levelChanged: false }])!, /1 من 2/);
    assert.match(perSkillWorkLineAr([{ outcome: 'not_assessed', levelChanged: false }])!, /لم يتغيّر/);
    assert.equal(workSkillChip({ labelAr: 'HTML', outcome: 'met', levelChanged: true }).tone, 'success');
    assert.equal(workSkillChip({ labelAr: 'HTML', outcome: 'met', levelChanged: false }).tone, 'info', 'met without a level is not shown as success');
    assert.doesNotMatch(workSkillChip({ labelAr: 'JS', outcome: 'not_assessed', levelChanged: false }).textAr, FAIL_WORDS);
  });
});
