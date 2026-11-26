import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { nextStep, careerSnapshot, type NextStep, type CareerSnapshot } from '@naqla/domain';
import { capabilitySpec, technologiesMentioned, GUIDANCE_CAPABILITIES, GUIDANCE_TEST_PROVIDER_NOTICE_AR, type GuidanceCapability } from '@naqla/agents';
import { loadDomainFacts } from '../agents/domain-facts';
import { loadHiddenTexts } from '../agents/hidden-texts';
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

  async ask(userId: string, body: { capability?: string; skillId?: string; submissionId?: string; level?: number }) {
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
    } else if (capability === 'improvement_hints') {
      const built = await this.improvementHints(userId, body, safe, toolsUsed);
      if ('noneAr' in built) return { capability, labelAr: spec.labelAr, contracts: spec.contracts, toolsUsed, noticeAr: GUIDANCE_TEST_PROVIDER_NOTICE_AR, withheldAr: null, noneAr: built.noneAr, level: built.level, proposals: [] };
      request = built.request;
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
    return { capability, labelAr: spec.labelAr, contracts: spec.contracts, toolsUsed, noticeAr: GUIDANCE_TEST_PROVIDER_NOTICE_AR, withheldAr,
      ...(capability === 'improvement_hints' ? { level: (request as { level: number }).level } : {}), ...out };
  }

  /**
   * R1 — progressive hints for the unmet criteria of the graduate's OWN result (A15 + A03). One level per request:
   *   1 · where to look (the criterion and what the evaluation recorded), 2 · the concept (the linked skill's recorded
   *   indicators and common mistakes), 3 · a resource (A07: a verified one, or a labelled candidate in the internal preview).
   * At most three criteria, mandatory first. Text that would name an undeclared technology is left out (D-076). Never code.
   */
  private async improvementHints(userId: string, body: { submissionId?: string; level?: number }, safe: (t: string) => boolean, toolsUsed: string[]) {
    if (!body.submissionId || !/^[0-9a-f-]{36}$/i.test(body.submissionId)) throw new BadRequestException('submissionId is required');
    const level = (Number(body.level ?? 1) as 1 | 2 | 3);
    if (![1, 2, 3].includes(level)) throw new BadRequestException('level is 1, 2 or 3');
    const view = await this.tools.myFeedback('improvement_hints', userId, body.submissionId) as unknown as
      { resultId: string | null; rubricVersion: string | null; criteria: { criterion_key: string; score: number | string | null; max_score: number | string; rationale: string | null; nameAr: string | null }[] } | null;
    toolsUsed.push('my_feedback');
    if (!view || !view.resultId) throw new ConflictException('[no_result_yet] لا توجد نتيجة تقييم لهذا العمل بعد؛ التلميحات تأتي بعد النتيجة.');
    // Phase C round 2: failed automated tests on the pinned commit (neutral labels only) are a second source of "where
    // to look". They are observations, not a score; the criterion's own result is unchanged.
    const run = await this.db.asService(async (c) => (await c.query(`select t.result from test_run t join submission s on s.id = t.submission_id
      where t.submission_id = $1 and s.user_id = $2 order by t.created_at desc limit 1`, [body.submissionId, userId])).rows[0]?.result as { tests: { criterionKey: string; labelAr: string; outcome: string; mode: string }[] } | undefined);
    const failedTests = (run?.tests ?? []).filter((t) => t.mode === 'automated' && t.outcome === 'fail' && safe(t.labelAr));
    if (run) toolsUsed.push('my_test_results');
    const unmet = view.criteria.filter((c) => (c.score !== null && Number(c.score) < Number(c.max_score)) || failedTests.some((t) => t.criterionKey === c.criterion_key));
    if (unmet.length === 0) return { noneAr: 'كل البنود مستوفاة في هذه النتيجة؛ لا تلميحات.', level };
    const meta = await this.db.asService(async (c) => (await c.query(
      `select rc.key, rc.mandatory, rc.linked_skill_id from rubric_criterion rc join evaluation_result er on er.rubric_version_id = rc.rubric_version_id where er.id = $1`, [view.resultId])).rows);
    const ordered = unmet.map((c) => ({ c, m: meta.find((x) => x.key === c.criterion_key) }))
      .sort((a, b) => Number(b.m?.mandatory === true) - Number(a.m?.mandatory === true) || a.c.criterion_key.localeCompare(b.c.criterion_key)).slice(0, 3);
    const items = [];
    for (const { c, m } of ordered) {
      const name = c.nameAr && safe(c.nameAr) ? c.nameAr : 'هذا البند';
      let hint: string;
      if (level === 1) {
        const ft = failedTests.filter((t) => t.criterionKey === c.criterion_key).map((t) => `«${t.labelAr}»`).slice(0, 2);
        hint = `انظري في عملك إلى ما يقيسه «${name}».${c.rationale && safe(c.rationale) ? ` ما سجّله التقييم: ${c.rationale}` : ' اقرئي ملاحظة التقييم على هذا البند في صفحة النتيجة.'}`
          + (ft.length ? ` اختبار آلي لم ينجح في هذه النسخة: ${ft.join('، ')}. جرّبي السلوك نفسه بنفسك.` : '');
      } else {
        let skill: Awaited<ReturnType<GuidanceTools['skill']>> | null = null;
        if (m?.linked_skill_id) {
          try { skill = await this.tools.skill('improvement_hints', userId, String(m.linked_skill_id), level === 2 ? ['skill_explanation'] : ['approved_resources']); } catch { skill = null; }
        }
        if (level === 2) {
          const tip = [...(skill?.explanation?.commonMistakesAr ?? []), ...(skill?.explanation?.indicatorsAr ?? [])].find(safe);
          hint = tip ? `المفهوم المرتبط بهذا البند: راجعي «${tip}» وتحققي منه في عملك.` : 'راجعي علامات إتقان المهارة المرتبطة بهذا البند في صفحة المهارة، ثم قارنيها بعملك.';
        } else {
          const r = skill?.learning?.resource;
          hint = r && safe(r.titleAr) ? `مورد قد يساعدك: «${r.titleAr}»${r.exposure === 'candidate' ? ' (مرشّح لم يُتحقَّق منه بعد)' : ''}. اقرئي الجزء المتعلق ثم أعيدي المحاولة بنفسك.`
            : (skill?.learning?.fallbackAr ?? 'لا يوجد بعد مورد متحقَّق منه لهذا البند؛ أعيدي المحاولة مستعينة بملاحظة التقييم وعلامات الإتقان.');
        }
        if (!toolsUsed.includes(level === 2 ? 'skill_explanation' : 'approved_resources')) toolsUsed.push(level === 2 ? 'skill_explanation' : 'approved_resources');
      }
      items.push({ criterionKey: c.criterion_key, severity: m?.mandatory === true ? 'important' : 'improvement', questionAr: `ما الذي ينقص «${name}» في عملك؟`, hintAr: hint });
    }
    return { request: { capability: 'improvement_hints', level, items }, level };
  }

  private hiddenTexts(): Promise<string[]> { return this.db.asService((c) => loadHiddenTexts(c)); }

  /** For tests and the report: the capability map (registry contracts, agent, tools). */
  capabilities() { return GUIDANCE_CAPABILITIES.map((c) => capabilitySpec(c)); }
}

