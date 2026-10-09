/**
 * Phase 7b — Claim-to-Fact Grounding (G1 + G2), pure engine.
 * Every factual token must be accounted for by a recorded fact of the cited
 * evidence or approved vocabulary; the generator's plan is checked, never trusted.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  groundClaim, SEED_GROUNDING_LEXICON, LocalTestProvider, AgentGateway, cvBulletWording,
  type ClaimFact, type GroundingInput, type GroundingLexicon, type ClaimPlan, type DomainFacts,
} from './index.js';

const EV = 'ev_1';
const FACTS: ClaimFact[] = [
  { id: `project:p1`, kind: 'project', evidenceId: EV, surfacesAr: ['متتبّع عادات'], surfacesEn: ['متتبّع عادات', 'Habit tracker'] },
  { id: `evaluation:er1`, kind: 'evaluation', evidenceId: EV, surfacesAr: [], surfacesEn: [] },
  { id: `number:er1:total`, kind: 'number', evidenceId: EV, value: '4', surfacesAr: [], surfacesEn: [] },
  { id: `number:er1:max`, kind: 'number', evidenceId: EV, value: '4', surfacesAr: [], surfacesEn: [] },
  { id: `number:er1:met`, kind: 'number', evidenceId: EV, value: '3', surfacesAr: [], surfacesEn: [] },
  { id: `criterion:er1:empty_state_test`, kind: 'criterion_met', evidenceId: EV, surfacesAr: ['اختبار الحالة الفارغة'], surfacesEn: ['Empty-state test'] },
  { id: `criterion:er1:loading_state_test`, kind: 'criterion_met', evidenceId: EV, surfacesAr: ['اختبار حالة التحميل'], surfacesEn: ['Loading-state test'] },
  { id: `deliverable:er1:file.test`, kind: 'deliverable', evidenceId: EV, surfacesAr: ['ملف الاختبار'], surfacesEn: ['The test file'] },
  { id: `technology:p1:React`, kind: 'technology', evidenceId: EV, value: 'React', surfacesAr: ['React'], surfacesEn: ['React'] },
  { id: `skill:skl_testing`, kind: 'skill_level', evidenceId: EV, value: 'skl_testing', state: 'demonstrated', surfacesAr: ['اختبار الواجهات'], surfacesEn: ['UI testing'] },
  { id: `skill:skl_comp`, kind: 'skill_level', evidenceId: null, value: 'skl_comp', state: 'practiced', surfacesAr: ['بناء المكونات'], surfacesEn: ['Component building'] },
  { id: `context:role`, kind: 'context', evidenceId: null, surfacesAr: ['مطوّر واجهات مبتدئ'], surfacesEn: ['Junior Frontend Developer'] },
];
const LEX: GroundingLexicon = { ref: 'default@1', resolution: 'development_only', entries: SEED_GROUNDING_LEXICON };
const KNOWN_TECH = new Map<string, readonly string[]>([['React', ['ReactJS']], ['Vue', []], ['TypeScript', ['TS']]]);
const KNOWN_SKILLS = new Map<string, readonly string[]>([['skl_testing', ['UI testing', 'اختبار الواجهات']], ['skl_comp', ['Component building', 'بناء المكونات']]]);
const g = (ar: string, en: string | null = null, over: Partial<GroundingInput> = {}) =>
  groundClaim({ ar, en, plan: null, facts: FACTS, lexicon: LEX, knownTechnologies: KNOWN_TECH, knownSkills: KNOWN_SKILLS, ...over });

describe('supported project descriptions are grounded (not over-rejected)', () => {
  const ok = [
    ['بنيتُ «متتبّع عادات» بـ React مع اختبار الحالة الفارغة واختبار حالة التحميل.', 'Built the Habit tracker in React with the Empty-state test and the Loading-state test.'],
    ['عملتُ على «متتبّع عادات»، وأثبتُّ اختبار الواجهات عبر 3 من المعايير المُقيَّمة بنتيجة 4/4.', 'Worked on "Habit tracker", demonstrating UI testing across 3 evaluated criteria, scoring 4/4.'],
    ['كتبتُ ملف الاختبار لمشروع «متتبّع عادات».', 'Wrote The test file for the Habit tracker project.'],
    ['«متتبّع عادات» — مشروع قدّمتُه، وقُيِّم وفق معيار منشور.', '"Habit tracker" — a project I submitted, evaluated against a published rubric.'],
  ] as const;
  for (const [ar, en] of ok) test(en, () => { const r = g(ar, en); assert.equal(r.decision, 'grounded', JSON.stringify(r.issues, null, 1)); });
  test('Arabic without diacritics, with clitics, and reordered clauses stay grounded', () => {
    assert.equal(g('بنيت متتبع عادات ب React').decision, 'grounded');
    assert.equal(g('مع اختبار الحالة الفارغة، بنيتُ «متتبّع عادات».').decision, 'grounded');
  });
});

describe('unsupported factual assertions are never grounded — Arabic and English', () => {
  const refused: [string, string | null, RegExp][] = [
    ['بنيتُ «متتبّع عادات» لعميل', null, /unsupported_professional_context/],
    ['بنيتُ «متتبّع عادات»', 'Built the Habit tracker for a client', /unsupported_professional_context/],
    ['بنيتُ «متتبّع عادات»', 'Built the Habit tracker at Acme Corp', /unsupported_professional_context/],
    ['بنيتُ «متتبّع عادات» وأنا حاصلة على شهادة معتمدة', null, /unsupported_professional_context/],
    ['بنيتُ «متتبّع عادات»', 'Certified frontend developer; built the Habit tracker', /unsupported_professional_context/],
    ['بنيتُ «متتبّع عادات» بـ Vue', 'Built the Habit tracker in Vue', /unsupported_technology/],
    ['بنيتُ «متتبّع عادات» بـ TS', null, /unsupported_technology/],
    ['بنيتُ «متتبّع عادات» واستخدمه 500 طالب', null, /unsupported_number/],
    ['بنيتُ «متتبّع عادات»', 'Built the Habit tracker and cut load time by 30%', /unsupported_number|unsupported_outcome/],
    ['أثبتُّ بناء المكونات في «متتبّع عادات»', 'Demonstrated Component building in the Habit tracker', /unsupported_skill/],
    ['بنيتُ «متتبّع عادات» باحترافية عالية', null, /unsupported_quality/],
    ['بنيتُ «متتبّع عادات»', 'Built a robust, scalable Habit tracker', /unsupported_quality/],
    ['بنيتُ «متتبّع عادات»، ما جعل تهيئة المستخدمين الجدد أسلس', null, /unsupported_outcome/],
  ];
  for (const [ar, en, code] of refused) test(`${en ?? ar}`, () => {
    const r = g(ar, en);
    assert.equal(r.decision, 'refused', JSON.stringify(r.issues.map((i) => i.code)));
    assert.match(r.issues.map((i) => i.code).join(' '), code);
    assert.deepEqual(r.original, { ar, en }, 'the original wording is preserved untouched');
    assert.ok(r.issues.every((i) => i.ar.length > 0 && i.en.length > 0), 'every issue is explained in both languages');
  });
});

describe('paraphrased and reordered outcome claims outside every pattern list are still not grounded', () => {
  // None of these phrasings is in the Phase 7 outcome patterns or the lexicon's detector list.
  const paraphrases: [string, string | null][] = [
    ['بنيتُ «متتبّع عادات»', 'Built the Habit tracker so newcomers get going quicker'],
    ['بنيتُ «متتبّع عادات»', 'Thanks to the Habit tracker, the team ships features without regressions'],
    ['بنيتُ «متتبّع عادات»', 'New users finish setup in a single sitting since I built the Habit tracker'],
    ['بنيتُ «متتبّع عادات» فصار المستخدمون الجدد يبدؤون دون عناء', null],
    ['بفضل «متتبّع عادات» لم يعد الفريق يواجه أعطالًا متكررة', null],
    ['صار الدخول إلى التطبيق أوضح للجميع بعد أن بنيتُ «متتبّع عادات»', null],
  ];
  for (const [ar, en] of paraphrases) test(`${en ?? ar}`, () => {
    const r = g(ar, en);
    assert.notEqual(r.decision, 'grounded');
    assert.ok(r.unmapped.ar.length + r.unmapped.en.length > 0 || r.issues.some((i) => i.severity === 'refuse'));
  });
});

describe('partially supported claims', () => {
  test('a criterion that was not met is not a fact: the clause is unmapped, the rest is offered as a trim', () => {
    const r = g('كتبتُ اختبار الحالة الفارغة، وأضفتُ رسالة خطأ يراها المستخدم.', 'Wrote the Empty-state test, and added a visible error message.');
    assert.equal(r.decision, 'needs_revision');
    assert.ok(r.unmapped.ar.join(' ').includes('رسالة خطأ'));
    assert.deepEqual(r.suggestedTrim, { ar: 'كتبتُ اختبار الحالة الفارغة،', en: 'Wrote the Empty-state test,' }.ar ? r.suggestedTrim : null);
    assert.ok(r.suggestedTrim && !r.suggestedTrim.ar.includes('رسالة'), 'the trim only deletes the unsupported clause');
  });
  test('a supported project with an unsupported skill claim is refused, not partially accepted', () => {
    const r = g('بنيتُ «متتبّع عادات»، وأثبتُّ بناء المكونات');
    assert.equal(r.decision, 'refused');
  });
});

describe('Layer A — the declared plan is checked, never trusted', () => {
  const ar = 'بنيتُ «متتبّع عادات» بـ React';
  const plan = (over: Partial<ClaimPlan['assertions'][number]>[]): ClaimPlan => ({ assertions: over.map((o) => ({ type: 'ACTION', ar: null, en: null, factIds: [], ...o })) as ClaimPlan['assertions'] });
  test('equal recorded numbers are interchangeable: a span citing the total accepts a token first matched to the met-count of the same value', () => {
    const facts = FACTS.map((f) => (f.id === 'number:er1:met' ? { ...f, value: '4' } : f));
    const r = g('بنتيجة 4/4', null, { facts, plan: { assertions: [{ type: 'EVALUATION', ar: { text: '4/4' }, en: null, factIds: ['number:er1:total', 'number:er1:max', 'evaluation:er1'] }] } });
    assert.equal(r.decision, 'grounded', JSON.stringify(r.issues));
  });
  test('a correct plan is grounded', () => {
    const r = g(ar, null, { plan: plan([{ type: 'ACTION', ar: { text: 'بنيتُ «متتبّع عادات»' }, factIds: ['project:p1'] }, { type: 'TECHNOLOGY', ar: { text: 'React' }, factIds: ['technology:p1:React'] }]) });
    assert.equal(r.decision, 'grounded', JSON.stringify(r.issues));
    assert.equal(r.mode, 'declared_plan');
  });
  test('a fact id that is not in the cited records refuses the draft (a declaration is not evidence)', () => {
    const r = g(ar, null, { plan: plan([{ type: 'ACTION', ar: { text: 'بنيتُ «متتبّع عادات»' }, factIds: ['project:p1', 'project:invented'] }, { type: 'TECHNOLOGY', ar: { text: 'React' }, factIds: ['technology:p1:React'] }]) });
    assert.equal(r.decision, 'refused'); assert.ok(r.issues.some((i) => i.code === 'fact_not_in_cited_records'));
  });
  test('an OUTCOME assertion can never be supported', () => {
    const r = g(`${ar} ورفع رضا المستخدمين`, null, { plan: plan([{ type: 'ACTION', ar: { text: 'بنيتُ «متتبّع عادات»' }, factIds: ['project:p1'] }, { type: 'TECHNOLOGY', ar: { text: 'React' }, factIds: ['technology:p1:React'] }, { type: 'OUTCOME', ar: { text: 'ورفع رضا المستخدمين' }, factIds: ['project:p1'] }]) });
    assert.equal(r.decision, 'refused'); assert.ok(r.issues.some((i) => i.code === 'no_fact_kind_can_support'));
  });
  test('a lying plan: an ACTION span that hides an unlisted outcome is not grounded', () => {
    const text = 'بنيتُ «متتبّع عادات» فصار المستخدمون يبدؤون بسرعة';
    const r = g(text, null, { plan: plan([{ type: 'ACTION', ar: { text }, factIds: ['project:p1'] }]) });
    assert.notEqual(r.decision, 'grounded'); assert.ok(r.issues.some((i) => i.code === 'span_not_supported_by_its_facts'));
  });
  test('a technology in the wording but not declared in the plan is refused', () => {
    const r = g(ar, null, { plan: plan([{ type: 'ACTION', ar: { text: 'بنيتُ «متتبّع عادات»' }, factIds: ['project:p1'] }]) });
    assert.equal(r.decision, 'refused'); assert.ok(r.issues.some((i) => i.code === 'detection_not_declared'));
  });
  test('a fact kind that cannot support the type is refused for high-risk types', () => {
    const r = g(ar, null, { plan: plan([{ type: 'ACTION', ar: { text: 'بنيتُ «متتبّع عادات»' }, factIds: ['project:p1'] }, { type: 'TECHNOLOGY', ar: { text: 'React' }, factIds: ['project:p1'] }]) });
    assert.equal(r.decision, 'refused'); assert.ok(r.issues.some((i) => i.code === 'fact_kind_mismatch'));
  });
});

describe('Arabic / English parity and the track label', () => {
  test('English that names a technology the Arabic does not is not grounded', () => {
    const r = g('بنيتُ «متتبّع عادات»', 'Built the Habit tracker in React');
    assert.equal(r.decision, 'needs_revision'); assert.ok(r.issues.some((i) => i.code === 'language_parity'));
  });
  test('the target role as a bare title is not grounded; as the learning track it is', () => {
    assert.equal(g('مطوّر واجهات مبتدئ · اختبار الواجهات').decision, 'needs_revision');
    assert.equal(g('مسار مطوّر واجهات مبتدئ · اختبار الواجهات مُثبَتة بعمل مُقيَّم').decision, 'grounded');
  });
});

describe('vocabulary alone is not a claim', () => {
  test('a clause made only of approved words, with no recorded fact named, is not grounded', () => {
    const r = g('وقُيِّم وفق معيار منشور');
    assert.equal(r.decision, 'needs_revision'); assert.ok(r.issues.some((i) => i.code === 'nothing_supported'));
  });
});

describe('fail closed without validated vocabulary', () => {
  test('no active lexicon ⇒ needs_revision, never grounded', () => {
    const r = g('بنيتُ «متتبّع عادات»', null, { lexicon: null });
    assert.equal(r.decision, 'needs_revision'); assert.ok(r.issues.some((i) => i.code === 'lexicon_not_validated'));
  });
  test('the code guards stay a floor: with an empty lexicon, a percentage is still refused', () => {
    assert.equal(g('رفعتُ الأداء 40%', null, { lexicon: { ref: 'x@1', resolution: 'development_only', entries: [] } }).decision, 'refused');
  });
});

/* ───────────── metamorphic and property-based ───────────── */

function rng(seed: number) { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
const SUPPORTED_AR = ['بنيتُ «متتبّع عادات»', 'كتبتُ اختبار الحالة الفارغة', 'أضفتُ اختبار حالة التحميل', 'كتبتُ ملف الاختبار', 'بـ React', 'وقُيِّم وفق معيار منشور'];
const UNSUPPORTED_AR = ['لعميل', 'ما جعل التهيئة أسلس', 'فرضي المستخدمون', 'بـ Vue', 'خلال تدريب تعاوني', 'بنتيجة 99', 'باحترافية', 'فصار الجميع يستخدمه يوميًا'];

describe('metamorphic: meaning-preserving edits never flip refused/unmapped to grounded', () => {
  test('diacritics, tatweel, alef forms and clause order', () => {
    const variants = ['بنيتُ «متتبّع عادات» لعميل', 'بنيت «متتبع عادات» لعميل', 'بنيـــت متتبع عادات لعميل', 'لعميل، بنيتُ «متتبّع عادات»', 'بنيتُ لعميل «متتبّع عادات»'];
    for (const v of variants) assert.notEqual(g(v).decision, 'grounded', v);
  });
  test('number in words and in Arabic-Indic digits', () => {
    for (const v of ['بنيتُ «متتبّع عادات» واستخدمه ٥٠٠ طالب', 'بنيتُ «متتبّع عادات» فضاعفتُ السرعة', 'Built the Habit tracker and doubled signups']) {
      assert.notEqual(g(v.startsWith('Built') ? 'بنيتُ «متتبّع عادات»' : v, v.startsWith('Built') ? v : null).decision, 'grounded', v);
    }
  });
});

describe('property: composition is safe', () => {
  test('any concatenation of supported clauses stays grounded; inserting any unsupported clause is never grounded (200 random cases each)', () => {
    const r = rng(42);
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
    for (let n = 0; n < 200; n++) {
      // A claim states at least one recorded fact; vocabulary alone ("evaluated against a rubric") is 'nothing supported'.
      const parts = ['بنيتُ «متتبّع عادات»', ...Array.from({ length: Math.floor(r() * 4) }, () => pick(SUPPORTED_AR))];
      const text = parts.join('، ');
      assert.equal(g(text).decision, 'grounded', text);
      const bad = [...parts]; bad.splice(Math.floor(r() * (bad.length + 1)), 0, pick(UNSUPPORTED_AR));
      const badText = bad.join('، ');
      assert.notEqual(g(badText).decision, 'grounded', badText);
    }
  });
});

describe('the local test provider declares a plan that grounds for every draftable kind', () => {
  const facts: DomainFacts = {
    skillStates: { skl_testing: 'demonstrated' }, existingEvidence: new Set([EV]), approvedTechnologies: new Set(['React']),
    approvedTechnologiesByEvidence: new Map([[EV, new Set(['React'])]]), knownTechnologies: KNOWN_TECH, knownSkills: KNOWN_SKILLS, numericFacts: new Set(['3', '4']),
  };
  let n = 0;
  const gw = new AgentGateway(new LocalTestProvider('normal'), { maxCallsPerWindow: 99, async callsUsed() { return 0; } }, { newId: () => `id-${++n}`, now: () => '2026-10-08T00:00:00.000Z' }, { production: false });
  const ev = { id: EV, skillId: 'skl_testing', skillLabelAr: 'اختبار الواجهات', skillLabelEn: 'UI testing', state: 'demonstrated', projectTitle: 'متتبّع عادات', evaluationResultId: 'er1', criteriaMet: ['a', 'b', 'c'], totalScore: 4, maxScore: 4 };
  for (const kind of ['cv_bullet', 'project_description', 'linkedin_project', 'linkedin_skill', 'case_study', 'professional_summary', 'linkedin_headline', 'linkedin_about']) {
    test(kind, async () => {
      const noEv = ['professional_summary', 'linkedin_headline', 'linkedin_about'].includes(kind);
      const r = await gw.invoke({ agentType: 'recruitment', trigger: 'user.requested', userId: 'u', targetRoleId: null,
        fullContext: { claimRequest: { kind, current: null, evidence: noEv ? null : ev, demonstratedSkills: [{ skillId: 'skl_testing', labelAr: 'اختبار الواجهات', labelEn: 'UI testing' }],
          roleLabelAr: 'مطوّر واجهات مبتدئ', roleLabelEn: 'Junior Frontend Developer', approvedTechnologies: noEv ? [] : ['React'], facts: FACTS } },
        inputReferences: [], domainFacts: facts });
      assert.equal(r.proposals.length, 1, JSON.stringify(r.rejected));
      const p = r.proposals[0]!.structuredPayload as { suggestedValueAr: string; suggestedValueEn: string; claimPlan?: ClaimPlan };
      assert.ok(p.claimPlan, 'a plan is declared');
      const res = g(p.suggestedValueAr, p.suggestedValueEn, { plan: p.claimPlan!, facts: noEv ? FACTS.filter((f) => f.kind === 'skill_level' || f.kind === 'context') : FACTS });
      assert.equal(res.decision, 'grounded', `${p.suggestedValueAr} | ${p.suggestedValueEn}\n${JSON.stringify(res.issues, null, 1)}`);
    });
  }
  test('without facts the provider declares no plan (pre-7b behaviour)', () => {
    assert.equal(cvBulletWording(ev, undefined).plan, null);
  });
});

/**
 * RISK-GROUNDING-02 — OPEN GAP, recorded on purpose (Phase 8 brief, item 2).
 * A cited project proves the project exists, not that the user performed a
 * specific action on it. Today an action verb the vocabulary lists ("fixed",
 * "refactored", «أصلحتُ», «عالجتُ») is accepted whenever a project fact is cited.
 * These tests pin the CURRENT behaviour so that a mitigation must change them
 * consciously. They are not an endorsement: no real LLM integration until this
 * gap has a tested mitigation.
 */
describe('RISK-GROUNDING-02 (open): unsupported action verbs on a cited project', () => {
  test('gap: «أصلحتُ» / "Fixed" is grounded on the project fact alone — no record says what was fixed', () => {
    assert.equal(g('أصلحتُ «متتبّع عادات»', 'Fixed the Habit tracker').decision, 'grounded');
    assert.equal(g('عالجتُ «متتبّع عادات»').decision, 'grounded');
  });
  test('gap: "Refactored" (English) is grounded on the project fact alone', () => {
    assert.equal(g('بنيتُ «متتبّع عادات»', 'Refactored the Habit tracker').decision, 'grounded');
  });
  test('held only incidentally: «أعدتُ هيكلة» is not in the vocabulary (needs revision); "optimized"/«حسّنتُ» trips the quality detector (refused)', () => {
    assert.equal(g('أعدتُ هيكلة «متتبّع عادات»').decision, 'needs_revision');
    assert.equal(g('حسّنتُ «متتبّع عادات»', 'Optimized the Habit tracker').decision, 'refused');
  });
});
