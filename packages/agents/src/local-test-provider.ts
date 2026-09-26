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

export type TestProviderMode = 'normal' | 'malformed' | 'error' | 'invents';

export class LocalTestProvider implements AgentProvider {
  readonly name = 'local-test';
  readonly testOnly = true;
  constructor(private readonly mode: TestProviderMode = 'normal') {}

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const started = Date.now();
    const inputBytes = Buffer.byteLength(JSON.stringify(req.context));
    const base = { provider: this.name, model: 'deterministic-template/0', inputBytes, estimatedCost: null, cacheStatus: 'n/a' as const };

    if (this.mode === 'error') throw new Error('local-test provider: injected failure');

    let candidates: unknown[];
    if (this.mode === 'malformed') {
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
  const ev = ctx['evidence'] as { id: string; skillId: string; skillLabelAr: string; skillLabelEn: string; state: string;
    projectTitle: string; evaluationResultId: string; criteriaMet: string[]; totalScore: number; maxScore: number } | undefined;
  if (!ev) return [];
  const met = ev.criteriaMet.length;
  return [{
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
      namedSkillIds: [ev.skillId], namedTechnologies: [],
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
    rationale: 'smallest step with the largest profile effect', warnings: [], requiresUserApproval: false,
  }];
}

function technicalCandidates(ctx: Readonly<Record<string, unknown>>): unknown[] {
  const r = ctx['deterministicResults'] as { evaluationResultId: string; outcome: string; skillId: string;
    criteria: { key: string; met: boolean; rationale: string }[]; blockingCheck: string | null } | undefined;
  if (!r) return [];
  const failed = r.criteria.filter((c) => !c.met);
  const passed = r.criteria.filter((c) => c.met);
  const out: unknown[] = [{
    proposalType: 'rubric_explanation', subjectType: 'evaluation_result', subjectId: r.evaluationResultId,
    summary: `${passed.length} من ${r.criteria.length} معايير مستوفاة`,
    structuredPayload: { kind: 'rubric_explanation', criteria: r.criteria.map((c) => ({ criterion: c.key, met: c.met, likelyWhy: c.rationale })) },
    evidenceRefs: [], sourceRefs: [{ kind: 'evaluation_result', id: r.evaluationResultId }],
    rationale: 'each line restates the recorded rationale of the deterministic evaluator', warnings: [], requiresUserApproval: false,
  }];
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
