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

import type { AgentProvider, ProviderRequest, ProviderResponse } from './provider.js';

export type TestProviderMode = 'normal' | 'malformed' | 'error' | 'invents' | 'scripted';

/** Mode B: candidates supplied verbatim by a scenario. The gateway must judge them. */
export interface ScriptedOutput { readonly candidates: readonly unknown[]; }

/** Bumped whenever a template changes, so a harness run names what it ran against. */
export const LOCAL_TEST_PROVIDER_VERSION = '0.3.0';

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
