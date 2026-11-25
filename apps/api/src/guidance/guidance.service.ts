import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { nextStep, careerSnapshot, type NextStep, type CareerSnapshot } from '@naqla/domain';
import { capabilitySpec, technologiesMentioned, GUIDANCE_CAPABILITIES, GUIDANCE_TEST_PROVIDER_NOTICE_AR, type GuidanceCapability } from '@naqla/agents';
import { loadDomainFacts } from '../agents/domain-facts';
import { DbService } from '../infra/db.service';
import { AgentService } from '../agents/agent.service';
import { GuidanceTools } from './guidance.tools';

/**
 * Phase B, package 5 (PO decision 6) — the graduate's guidance:
 *
 *   A01 next step (deterministic, FR-A-009) · A02 Career Snapshot (deterministic, FR-U-014)
 *   and three capabilities on request — career_guidance, learning_guidance, assessment_feedback — each a fixed
 *   workflow: permission-aware read tools → context → the existing gateway (test provider only) → proposals.
 *
 * Safeguards kept: nothing here writes evidence, a claim, a level, an evaluation, readiness or a publication; the
 * outputs are proposals the graduate reads or rejects. Assessment-design data never enters a context, and every
 * output is checked against it again before it is returned.
 */
@Injectable()
export class GuidanceService {
  constructor(private readonly db: DbService, private readonly tools: GuidanceTools, private readonly agents: AgentService) {}

  async nextStep(userId: string): Promise<NextStep> {
    const p = await this.tools.myProgress('career_guidance', userId);
    return nextStep({ hasGoal: p.hasGoal, roleAvailable: p.roleAvailable, work: p.work, pendingProposals: p.pendingProposals, startableActivityCount: p.startableActivityCount });
  }

  async snapshot(userId: string): Promise<CareerSnapshot> {
    const p = await this.tools.myProgress('career_guidance', userId);
    const step = nextStep({ hasGoal: p.hasGoal, roleAvailable: p.roleAvailable, work: p.work, pendingProposals: p.pendingProposals, startableActivityCount: p.startableActivityCount });
    return careerSnapshot({ roleLabelAr: p.role?.labelAr ?? null, roleId: p.role?.id ?? null, skills: p.skills, nextStep: step });
  }

  async ask(userId: string, body: { capability?: string; skillId?: string; submissionId?: string }) {
    const capability = body.capability as GuidanceCapability;
    if (!(GUIDANCE_CAPABILITIES as readonly string[]).includes(String(body.capability))) throw new BadRequestException(`capability must be one of ${GUIDANCE_CAPABILITIES.join(', ')}`);
    const spec = capabilitySpec(capability);
    let request: Record<string, unknown>; let facts: Record<string, unknown> = {}; const toolsUsed: string[] = [];
    // D-076 holds for every agent output: a technology the graduate never declared may not be named. Guidance input
    // text that would name one is replaced by neutral wording (the page shows the skill and activity names itself).
    const df = await this.db.asService((c) => loadDomainFacts(c, userId));
    const safe = (t: string) => technologiesMentioned(t, df.knownTechnologies).every((x) => df.approvedTechnologies.has(x));

    if (capability === 'career_guidance') {
      const p = await this.tools.myProgress(capability, userId); toolsUsed.push('my_progress');
      const step = nextStep({ hasGoal: p.hasGoal, roleAvailable: p.roleAvailable, work: p.work, pendingProposals: p.pendingProposals, startableActivityCount: p.startableActivityCount });
      const snap = careerSnapshot({ roleLabelAr: p.role?.labelAr ?? null, roleId: p.role?.id ?? null, skills: p.skills, nextStep: step });
      const role = await this.tools.occupationProfile(capability, userId); toolsUsed.push('occupation_profile');
      request = { capability, roleId: role?.id ?? null, gapOrderAr: snap.gapOrderAr,
        nextStep: safe(snap.nextStep.textAr) ? snap.nextStep : { ...snap.nextStep, textAr: snap.nextStep.textAr.split(':')[0]! },
        gaps: snap.gaps.map((g) => p.skills.find((x) => x.skillId === g.sourceRef)!).map((x) => ({ skillId: x.skillId, labelAr: safe(x.labelAr) ? x.labelAr : 'مهارة في دورك', level: x.level })) };
    } else if (capability === 'learning_guidance') {
      if (!body.skillId || !/^[0-9a-f-]{36}$/i.test(body.skillId)) throw new BadRequestException('skillId is required');
      const sk = await this.tools.skill(capability, userId, body.skillId, ['skill_explanation', 'skill_activities', 'approved_resources']);
      toolsUsed.push('skill_explanation', 'skill_activities', 'approved_resources');
      const plan = sk.learning;
      request = { capability, skill: { skillId: sk.skillId, labelAr: safe(sk.labelAr) ? sk.labelAr : 'هذه المهارة', indicatorsAr: (sk.explanation?.indicatorsAr ?? []).filter(safe) },
        practice: plan?.practice ? { activityId: plan.practice.activityId, titleAr: safe(plan.practice.titleAr) ? plan.practice.titleAr : 'النشاط التطبيقي المرتبط بها', startable: plan.practice.startable } : null,
        // A07 exposure is decided upstream: only a verified resource (or a labelled candidate in the internal preview) is named.
        resource: plan?.resource && safe(plan.resource.titleAr) ? { code: plan.resource.code, titleAr: plan.resource.titleAr } : null };
    } else {
      if (!body.submissionId || !/^[0-9a-f-]{36}$/i.test(body.submissionId)) throw new BadRequestException('submissionId is required');
      const view = await this.tools.myFeedback(capability, userId, body.submissionId); toolsUsed.push('my_feedback');
      const v = view as unknown as { resultId: string | null; outcome: string | null; criteria?: { criterionKey?: string }[] } | null;
      if (!v || !v.resultId) throw new ConflictException('[no_result_yet] لا توجد نتيجة تقييم لهذا العمل بعد؛ الشرح يأتي بعد النتيجة.');
      request = { capability, submissionId: body.submissionId };
      facts = { evaluationResultId: v.resultId, outcome: v.outcome };
    }

    const out = await this.agents.guidance(userId, capability, request, facts, []);
    // Defence in depth: no output may carry assessment-design text (planted defects, reviewer material names).
    const hidden = await this.hiddenTexts();
    const leaked = out.proposals.filter((p) => { const t = JSON.stringify(p); return hidden.some((h) => t.includes(h)); });
    if (leaked.length) throw new ConflictException('[guidance_withheld] a guidance output was withheld: it referred to private assessment material');
    const withheldAr = out.proposals.length === 0 && (out.refused.length > 0 || out.rejected.length > 0)
      ? 'لم يُعرض الإرشاد: لم يجتز فحوص الدقة (مثل ذكر تقنية لم تُصرّحي باستخدامها). ملاحظات التقييم نفسها تبقى في صفحة التقييم.' : null;
    return { capability, labelAr: spec.labelAr, contracts: spec.contracts, toolsUsed, noticeAr: GUIDANCE_TEST_PROVIDER_NOTICE_AR, withheldAr, ...out };
  }

  /** Assessment-design strings that must never reach a graduate (planted-input descriptions, reviewer material names). */
  private async hiddenTexts(): Promise<string[]> {
    return this.db.asService(async (c) => {
      const rows = (await c.query(`select description_en as t from activity_input where contains_planted_issue and description_en is not null
                                    union all select description_ar from activity_input where contains_planted_issue and description_ar is not null
                                    union all select file_name from activity_material where audience = 'reviewer'`)).rows;
      return rows.map((r) => String(r.t)).filter((t) => t.trim().length >= 12);
    });
  }

  /** For tests and the report: the capability map (registry contracts, agent, tools). */
  capabilities() { return GUIDANCE_CAPABILITIES.map((c) => capabilitySpec(c)); }
}

