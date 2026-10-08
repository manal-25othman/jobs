/**
 * LOCAL TEST PROVIDER — TEST / NON-PRODUCTION.
 *
 * This is not fake AI pretending to be intelligent. It emits candidate
 * proposals by copying facts already present in the redacted context into the
 * proposal shapes, deterministically. Its only purpose is to prove the
 * contracts, routing, validation, storage, approval flow and orchestration.
 * It proves nothing about model quality, and the gateway refuses it when
 * NODE_ENV=production.
 */

import { CLAIM_KIND_LABEL_AR, type DraftableClaimKind } from '@naqla/domain';
import type { AgentProvider, ProviderRequest, ProviderResponse } from './provider.js';

export type TestProviderMode = 'normal' | 'malformed' | 'error' | 'invents' | 'scripted';

/** Mode B: candidates supplied verbatim by a scenario. The gateway must judge them. */
export interface ScriptedOutput { readonly candidates: readonly unknown[]; }

/** Bumped whenever a template changes, so a harness run names what it ran against. */
export const LOCAL_TEST_PROVIDER_VERSION = '0.4.0';

export class LocalTestProvider implements AgentProvider {
  readonly name = 'local-test';
  readonly version = LOCAL_TEST_PROVIDER_VERSION;
  readonly testOnly = true;
  constructor(private readonly mode: TestProviderMode = 'normal', private readonly scripted: ScriptedOutput | null = null) {}

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const started = Date.now();
    const inputBytes = Buffer.byteLength(JSON.stringify(req.context));
    const base = { provider: this.name, model: `deterministic-template/${this.version}`, inputBytes, estimatedCost: null, cacheStatus: 'n/a' as const };

    if (this.mode === 'error') throw new Error('local-test provider: injected failure');

    let candidates: unknown[];
    if (this.mode === 'scripted') {
      candidates = [...(this.scripted?.candidates ?? [])];
    } else if (this.mode === 'malformed') {
      candidates = [{ this_is: 'not a proposal' }, 'a string', 42];
    } else if (this.mode === 'invents') {
      // Fault injection: a provider that overclaims. The gateway must refuse it.
      candidates = [{
        proposalType: 'cv_bullet', subjectType: 'evidence', subjectId: String(req.context['evidenceId'] ?? ''),
        summary: 'Improved by 40% using React',
        structuredPayload: { kind: 'wording', currentValue: null,
          suggestedValueAr: 'رفعتُ الأداء بنسبة 40% باستخدام React', suggestedValueEn: 'Improved performance by 40% using React',
          supportingSources: [], reason: 'sounds good', unsupportedRisk: 'none', limitationNote: null,
          namedSkillIds: [], namedTechnologies: ['React'] },
        evidenceRefs: [], sourceRefs: [], rationale: 'invented', warnings: [], requiresUserApproval: true,
      }];
    } else if (req.agentType === 'recruitment') {
      candidates = recruitmentCandidates(req.context);
    } else if (req.agentType === 'technical') {
      candidates = technicalCandidates(req.context);
    } else {
      candidates = [];
    }
    return { ...base, candidates, outputBytes: Buffer.byteLength(JSON.stringify(candidates)), latencyMs: Date.now() - started };
  }
}

/* The templates below copy context facts; they never add a fact. */

function recruitmentCandidates(ctx: Readonly<Record<string, unknown>>): unknown[] {
  const claimRequest = ctx['claimRequest'] as ClaimRequest | undefined;
  if (claimRequest) return claimDraftCandidates(claimRequest);
  // Mode C — ambiguity: incomplete or conflicting input yields a limitation
  // and a request for clarification, never wording.
  const amb = ctx['ambiguity'] as { kind: string; detail: string } | undefined;
  if (amb) {
    return [{
      proposalType: 'profile_gap', subjectType: 'career_goal', subjectId: String((ctx['targetRole'] as { id?: string } | undefined)?.id ?? 'unknown'),
      summary: `لا يمكن اقتراح صياغة الآن: ${amb.detail}`,
      structuredPayload: { kind: 'gap', skillId: String(ctx['skillId'] ?? 'unknown'), explanation: `limitation: ${amb.detail}. No wording is proposed until this is resolved.`, currentState: String(ctx['skillState'] ?? 'unknown') },
      evidenceRefs: [], sourceRefs: [], rationale: 'the input is incomplete or conflicting; proposing wording would fabricate certainty',
      warnings: [`clarification needed: ${amb.kind}`], requiresUserApproval: false,
    }, {
      proposalType: 'recruiter_next_action', subjectType: 'career_goal', subjectId: 'next',
      summary: 'وضّحي المعلومة الناقصة قبل أي صياغة',
      structuredPayload: { kind: 'action', action: `resolve: ${amb.kind}`, why: 'a professional claim needs an unambiguous support path', estimatedMinutes: 5 },
      evidenceRefs: [], sourceRefs: [], rationale: 'conservative handling of ambiguity', warnings: [], requiresUserApproval: false,
    }];
  }
  // R4 — a claim the user made that nothing supports: explain the gap and the
  // way to close it. Never a rewrite that keeps the claim.
  const unsupported = ctx['unsupportedClaims'] as { claim: string; skillId: string; currentState: string }[] | undefined;
  if (unsupported && unsupported.length > 0) {
    return unsupported.flatMap((u) => [{
      proposalType: 'profile_gap', subjectType: 'skill_claim', subjectId: u.skillId,
      summary: `ادعاء غير مدعوم: «${u.claim}»`,
      structuredPayload: { kind: 'gap', skillId: u.skillId, explanation: `the profile states "${u.claim}" but the claim's state is '${u.currentState}'; nothing evaluated supports presenting it`, currentState: u.currentState },
      evidenceRefs: [], sourceRefs: [], rationale: 'a self-description is not evidence; the gap is stated, not papered over',
      warnings: [`unsupported claim: ${u.claim}`], requiresUserApproval: false,
    }, {
      proposalType: 'recruiter_next_action', subjectType: 'skill_claim', subjectId: u.skillId,
      summary: 'أثبتي المهارة بنشاط مُقيَّم قبل عرضها',
      structuredPayload: { kind: 'action', action: `complete an evaluated activity for skill ${u.skillId}, or remove the claim from the profile`, why: 'a claim needs an evidence path before a recruiter sees it', estimatedMinutes: 45 },
      evidenceRefs: [], sourceRefs: [], rationale: 'the only two honest options', warnings: [], requiresUserApproval: false,
    }]);
  }
  const ev = ctx['evidence'] as { id: string; skillId: string; skillLabelAr: string; skillLabelEn: string; state: string;
    projectTitle: string; evaluationResultId: string; criteriaMet: string[]; totalScore: number; maxScore: number } | undefined;
  if (!ev) return [];
  const met = ev.criteriaMet.length;
  // Career Data Foundation: role requirements are READ, never invented. Unpublished
  // or missing role data becomes a stated limitation, not a guess.
  const rr = ctx['roleRequirements'] as { status: 'published' | 'unpublished' | 'missing'; roleLabelEn: string | null;
    requirements: { skillId: string; labelAr: string; labelEn: string; isCore: boolean; whyRequiredAr: string | null }[] } | undefined;
  const states = (ctx['evidenceStates'] as Record<string, string> | undefined) ?? { [ev.skillId]: ev.state };
  const roleWarnings: string[] = rr && rr.status !== 'published' ? [`role requirements ${rr.status}: readiness against the role cannot be stated`] : [];
  const gaps: unknown[] = rr && rr.status === 'published'
    ? rr.requirements.filter((r) => r.isCore && !['demonstrated', 'verified'].includes(states[r.skillId] ?? 'gap')).map((r) => ({
        proposalType: 'profile_gap', subjectType: 'skill_claim', subjectId: r.skillId,
        summary: `مهارة أساسية للدور بلا دليل بعد: «${r.labelAr}»`,
        structuredPayload: { kind: 'gap', skillId: r.skillId, explanation: `${rr.roleLabelEn ?? 'the role'} lists "${r.labelEn}" as a core requirement${r.whyRequiredAr ? ` (${r.whyRequiredAr})` : ''}; the current state is '${states[r.skillId] ?? 'gap'}'`, currentState: states[r.skillId] ?? 'gap' },
        evidenceRefs: [], sourceRefs: [{ kind: 'target_role', id: String((ctx['targetRole'] as { id?: string } | undefined)?.id ?? '') }],
        rationale: 'a published role requirement with no qualifying evidence is a gap the user should see, not a claim', warnings: [], requiresUserApproval: false,
      }))
    : [];
  return [...gaps, {
    proposalType: 'cv_bullet', subjectType: 'evidence', subjectId: ev.id,
    summary: `بند سيرة جديد من دليل «${ev.skillLabelAr}»`,
    structuredPayload: {
      kind: 'wording', currentValue: null,
      suggestedValueAr: `عملتُ على «${ev.projectTitle}»، وأثبتُّ ${ev.skillLabelAr} عبر ${met} من المعايير المُقيَّمة بنتيجة ${ev.totalScore}/${ev.maxScore}.`,
      suggestedValueEn: `Worked on "${ev.projectTitle}", demonstrating ${ev.skillLabelEn} across ${met} evaluated criteria, scoring ${ev.totalScore}/${ev.maxScore}.`,
      supportingSources: [
        { kind: 'evidence', ref: ev.id }, { kind: 'project', ref: ev.projectTitle }, { kind: 'skill', ref: ev.skillId },
        ...ev.criteriaMet.map((c) => ({ kind: 'criterion', ref: c })),
      ],
      reason: 'the evaluation met every mandatory criterion; each clause maps to a recorded fact',
      unsupportedRisk: 'none', limitationNote: 'wording only; substance comes from the evaluation record',
      namedSkillIds: [ev.skillId], namedTechnologies: [...((ctx['approvedTechnologies'] as string[] | undefined) ?? [])],
    },
    evidenceRefs: [ev.id],
    sourceRefs: [{ kind: 'evidence', id: ev.id }, { kind: 'evaluation_result', id: ev.evaluationResultId }],
    rationale: 'a demonstrated skill with no CV bullet is a claim the user has earned and not yet made',
    warnings: [], requiresUserApproval: true,
  }, {
    proposalType: 'recruiter_next_action', subjectType: 'evidence', subjectId: ev.id,
    summary: 'أضيفي البند إلى السيرة بعد معاينته',
    structuredPayload: { kind: 'action', action: 'review and approve the proposed CV bullet', why: 'it is the only evidence-backed claim not yet on the CV', estimatedMinutes: 2 },
    evidenceRefs: [ev.id], sourceRefs: [{ kind: 'evidence', id: ev.id }],
    rationale: 'smallest step with the largest profile effect', warnings: roleWarnings, requiresUserApproval: false,
  }];
}

function technicalCandidates(ctx: Readonly<Record<string, unknown>>): unknown[] {
  const r = ctx['deterministicResults'] as { evaluationResultId: string; outcome: string; skillId: string;
    criteria: { key: string; met: boolean; rationale: string }[]; blockingCheck: string | null } | undefined;
  if (!r) return [];
  const failed = r.criteria.filter((c) => !c.met);
  const passed = r.criteria.filter((c) => c.met);
  // Career Data Foundation: the structured activity (deliverables, rubric criteria with
  // linked skills). Missing structure is a stated limitation; nothing is inferred.
  const act = ctx['activityContext'] as { status: 'structured' | 'legacy_snapshot' | 'missing'; slug: string | null;
    deliverables: { key: string; mandatory: boolean; descriptionEn: string }[]; rubric: { criteria: { key: string; nameEn: string; linkedSkillId: string }[] } | null } | undefined;
  const actWarnings: string[] = act && act.status !== 'structured' ? [`activity structure ${act.status}: criteria are explained from the evaluation record only`] : [];
  const linkedSkill = (key: string) => act?.rubric?.criteria.find((c) => c.key === key)?.linkedSkillId ?? null;
  const out: unknown[] = [{
    proposalType: 'rubric_explanation', subjectType: 'evaluation_result', subjectId: r.evaluationResultId,
    summary: `${passed.length} من ${r.criteria.length} معايير مستوفاة`,
    structuredPayload: { kind: 'rubric_explanation', criteria: r.criteria.map((c) => ({ criterion: c.key, met: c.met, likelyWhy: c.rationale, ...(linkedSkill(c.key) ? { linkedSkillId: linkedSkill(c.key) } : {}) })) },
    evidenceRefs: [], sourceRefs: [{ kind: 'evaluation_result', id: r.evaluationResultId }],
    rationale: 'each line restates the recorded rationale of the deterministic evaluator', warnings: actWarnings, requiresUserApproval: false,
  }];
  const amb = ctx['ambiguity'] as { kind: string; detail: string } | undefined;
  if (amb) {
    out.push({
      proposalType: 'followup_question', subjectType: 'submission', subjectId: r.evaluationResultId,
      summary: `سؤال متابعة: ${amb.detail}`,
      structuredPayload: { kind: 'followup_question', questions: [`Can you explain: ${amb.detail}?`], purpose: `limitation: ${amb.kind}; confidence is insufficient to conclude` },
      evidenceRefs: [], sourceRefs: [{ kind: 'evaluation_result', id: r.evaluationResultId }],
      rationale: 'the explanation and the output do not line up; a question is safer than a judgement', warnings: [`clarification needed: ${amb.kind}`], requiresUserApproval: false,
    });
  }
  if (failed.length > 0 && passed.length > 0 && !r.blockingCheck) {
    // Partial: say what is missing and how to prove it — never a professional claim.
    out.push({
      proposalType: 'missing_evidence', subjectType: 'skill_claim', subjectId: r.skillId,
      summary: `دليل ناقص: ${failed.map((c) => c.key).join('، ')}`,
      structuredPayload: { kind: 'missing_evidence', skillId: r.skillId, whatIsMissing: failed.map((c) => c.key).join(', '),
        howToProvide: act && act.status === 'structured' && act.deliverables.length
          ? `cover the unmet criteria in a new submission of ${act.slug}; mandatory deliverables: ${act.deliverables.filter((d) => d.mandatory).map((d) => d.key).join(', ')}`
          : 'cover the unmet criteria in a new submission' },
      evidenceRefs: [], sourceRefs: [{ kind: 'evaluation_result', id: r.evaluationResultId }],
      rationale: 'distinguishes failed criteria from missing evidence', warnings: [], requiresUserApproval: false,
    }, {
      proposalType: 'validation_activity', subjectType: 'skill_claim', subjectId: r.skillId,
      summary: 'تحقق قصير يغطّي المعايير الناقصة',
      structuredPayload: { kind: 'validation_activity', skillId: r.skillId, description: `a short check covering ${failed.map((c) => c.key).join(', ')}`, wouldPropose: { from: 'practiced', to: 'demonstrated' } },
      evidenceRefs: [], sourceRefs: [{ kind: 'evaluation_result', id: r.evaluationResultId }],
      rationale: 'a recommendation only; the domain decides any transition', warnings: [], requiresUserApproval: false,
    });
  }
  if (failed.length > 0 || r.blockingCheck) {
    out.push({
      proposalType: 'technical_feedback', subjectType: 'evaluation_result', subjectId: r.evaluationResultId,
      summary: r.blockingCheck ? `أوقف التقييمَ فحصُ السلامة: ${r.blockingCheck}` : `${failed.length} معيار لم يُستوفَ`,
      structuredPayload: { kind: 'technical_feedback',
        strengths: passed.map((c) => c.key),
        weaknesses: failed.map((c) => ({ criterion: c.key, observation: c.rationale })),
        suggestions: failed.map((c) => `address '${c.key}' and resubmit as a new submission`) },
      evidenceRefs: [], sourceRefs: [{ kind: 'evaluation_result', id: r.evaluationResultId }],
      rationale: 'derived from the criteria the deterministic evaluator recorded as unmet', warnings: [], requiresUserApproval: false,
    }, {
      proposalType: 'technical_next_action', subjectType: 'skill_claim', subjectId: r.skillId,
      summary: 'تسليم جديد يغطّي المعايير الناقصة',
      structuredPayload: { kind: 'action', action: failed[0] ? `cover '${failed[0].key}' in a new submission` : 'attach the required files and resubmit', why: 'a correction is a new submission; the original stays locked', estimatedMinutes: 20 },
      evidenceRefs: [], sourceRefs: [{ kind: 'evaluation_result', id: r.evaluationResultId }],
      rationale: 'the shortest path to a passing evaluation', warnings: [], requiresUserApproval: false,
    });
  }
  return out;
}

/* ───────────── Phase 7: user-requested claim drafts (facts only) ───────────── */

interface ClaimRequest {
  readonly kind: string;
  readonly current: string | null;
  readonly evidence: { id: string; skillId: string; skillLabelAr: string; skillLabelEn: string; state: string; projectTitle: string;
    evaluationResultId: string | null; criteriaMet: string[]; totalScore: number; maxScore: number } | null;
  readonly demonstratedSkills: readonly { skillId: string; labelAr: string; labelEn: string }[];
  readonly roleLabelAr: string | null;
  readonly roleLabelEn: string | null;
  readonly approvedTechnologies: readonly string[];
}

const PROPOSAL_TYPE_FOR_KIND: Readonly<Record<string, string>> = {
  cv_bullet: 'cv_bullet', project_description: 'project_description', professional_summary: 'professional_summary', linkedin_headline: 'linkedin_headline',
  linkedin_about: 'linkedin_about', linkedin_skill: 'linkedin_skill', linkedin_project: 'linkedin_project', case_study: 'case_study',
};

/**
 * One template per claim kind. Each clause copies a fact from the request:
 * the project title, the skill label, the met-criterion count and recorded
 * score, the user-declared technologies, the demonstrated skills. Nothing is
 * added — no outcome, no employer, no number that was not recorded.
 */
function claimDraftCandidates(r: ClaimRequest): unknown[] {
  const proposalType = PROPOSAL_TYPE_FOR_KIND[r.kind];
  if (!proposalType) return [];
  const ev = r.evidence;
  const skillsAr = r.demonstratedSkills.map((x) => x.labelAr).join('، ');
  const skillsEn = r.demonstratedSkills.map((x) => x.labelEn).join(', ');
  const techs = [...r.approvedTechnologies];
  const needsEvidence = !['professional_summary', 'linkedin_headline', 'linkedin_about'].includes(r.kind);
  if (needsEvidence && !ev) return [nothingToDraft(r.kind, 'this claim kind needs a piece of evidence and none was given')];
  if (!needsEvidence && r.demonstratedSkills.length === 0) return [nothingToDraft(r.kind, 'no demonstrated skill exists yet, so a summary would have nothing to stand on')];

  let ar: string; let en: string; let namedSkillIds: string[] = []; let namedTechnologies: string[] = [];
  const sources: { kind: string; ref: string }[] = [];
  if (ev) sources.push({ kind: 'evidence', ref: ev.id }, { kind: 'project', ref: ev.projectTitle });
  switch (r.kind) {
    case 'cv_bullet':
      ar = `عملتُ على «${ev!.projectTitle}»، وأثبتُّ ${ev!.skillLabelAr} عبر ${ev!.criteriaMet.length} من المعايير المُقيَّمة بنتيجة ${ev!.totalScore}/${ev!.maxScore}.`;
      en = `Worked on "${ev!.projectTitle}", demonstrating ${ev!.skillLabelEn} across ${ev!.criteriaMet.length} evaluated criteria, scoring ${ev!.totalScore}/${ev!.maxScore}.`;
      namedSkillIds = [ev!.skillId]; namedTechnologies = techs;
      sources.push({ kind: 'skill', ref: ev!.skillId }, ...ev!.criteriaMet.map((c) => ({ kind: 'criterion', ref: c })));
      break;
    case 'project_description':
      ar = techs.length ? `«${ev!.projectTitle}» — مشروع قدّمتُه وقُيِّم وفق معيار منشور (التقنيات المُعلَنة: ${techs.join('، ')}).` : `«${ev!.projectTitle}» — مشروع قدّمتُه وقُيِّم وفق معيار منشور.`;
      en = techs.length ? `"${ev!.projectTitle}" — a project I submitted, evaluated against a published rubric (declared technologies: ${techs.join(', ')}).` : `"${ev!.projectTitle}" — a project I submitted, evaluated against a published rubric.`;
      namedTechnologies = techs;
      break;
    case 'linkedin_project':
      ar = `مشروع «${ev!.projectTitle}»: عمل قدّمتُه وقُيِّم وفق معيار منشور.`;
      en = `Project "${ev!.projectTitle}": work I submitted, evaluated against a published rubric.`;
      break;
    case 'linkedin_skill':
      ar = ev!.skillLabelAr; en = ev!.skillLabelEn; namedSkillIds = [ev!.skillId];
      sources.push({ kind: 'skill', ref: ev!.skillId });
      break;
    case 'case_study':
      ar = `دراسة حالة: «${ev!.projectTitle}». المهارة المُثبَتة: ${ev!.skillLabelAr} — ${ev!.criteriaMet.length} من المعايير المُقيَّمة مستوفاة.`;
      en = `Case study: "${ev!.projectTitle}". Demonstrated skill: ${ev!.skillLabelEn} — ${ev!.criteriaMet.length} evaluated criteria met.`;
      namedSkillIds = [ev!.skillId];
      sources.push({ kind: 'skill', ref: ev!.skillId }, ...ev!.criteriaMet.map((c) => ({ kind: 'criterion', ref: c })));
      break;
    case 'professional_summary':
      ar = `مهارات أثبتُّها بأعمال مُقيَّمة: ${skillsAr}.`; en = `Skills I demonstrated through evaluated work: ${skillsEn}.`;
      namedSkillIds = r.demonstratedSkills.map((x) => x.skillId);
      sources.push(...r.demonstratedSkills.map((x) => ({ kind: 'skill', ref: x.skillId })));
      break;
    case 'linkedin_headline':
      ar = r.roleLabelAr ? `مسار ${r.roleLabelAr} · ${skillsAr} مُثبَتة بعمل مُقيَّم` : `${skillsAr} مُثبَتة بعمل مُقيَّم`;
      en = r.roleLabelEn ? `${r.roleLabelEn} track · ${skillsEn} demonstrated in evaluated work` : `${skillsEn} demonstrated in evaluated work`;
      namedSkillIds = r.demonstratedSkills.map((x) => x.skillId);
      sources.push(...r.demonstratedSkills.map((x) => ({ kind: 'skill', ref: x.skillId })));
      break;
    default: // linkedin_about
      ar = `${r.roleLabelAr ? `أتعلّم في مسار ${r.roleLabelAr}. ` : ''}مهارات أثبتُّها بأعمال مُقيَّمة: ${skillsAr}. كل مهارة هنا مرتبطة بدليل يمكن الرجوع إليه.`;
      en = `${r.roleLabelEn ? `Learning in the ${r.roleLabelEn} track. ` : ''}Skills I demonstrated through evaluated work: ${skillsEn}. Each one links to evidence.`;
      namedSkillIds = r.demonstratedSkills.map((x) => x.skillId);
      sources.push(...r.demonstratedSkills.map((x) => ({ kind: 'skill', ref: x.skillId })));
  }
  return [{
    proposalType, subjectType: ev ? 'evidence' : 'career_goal', subjectId: ev ? ev.id : 'profile',
    summary: `صياغة مقترحة — ${CLAIM_KIND_LABEL_AR[r.kind as DraftableClaimKind]}`,
    structuredPayload: { kind: 'wording', currentValue: r.current, suggestedValueAr: ar, suggestedValueEn: en, supportingSources: sources,
      reason: ev ? 'every clause copies a recorded fact: the project, the evaluated criteria, the declared technologies' : 'every clause names a skill that is demonstrated by evaluated work',
      unsupportedRisk: 'none', limitationNote: 'wording only; it says what was built and evaluated, not an effect on users or a business',
      namedSkillIds, namedTechnologies },
    evidenceRefs: ev ? [ev.id] : [],
    sourceRefs: ev ? [{ kind: 'evidence', id: ev.id }, ...(ev.evaluationResultId ? [{ kind: 'evaluation_result', id: ev.evaluationResultId }] : [])] : [],
    rationale: 'the user asked for this claim; the draft uses existing evidence only and waits for the user\'s preview and approval',
    warnings: [], requiresUserApproval: true,
  }];
}

function nothingToDraft(kind: string, why: string): unknown {
  return {
    proposalType: 'recruiter_next_action', subjectType: 'career_goal', subjectId: 'claim-request',
    summary: 'لا توجد أدلة كافية لهذه الصياغة بعد',
    structuredPayload: { kind: 'action', action: `complete an evaluated activity before drafting a ${kind}`, why, estimatedMinutes: null },
    evidenceRefs: [], sourceRefs: [], rationale: 'no wording without a support path', warnings: [], requiresUserApproval: false,
  };
}
