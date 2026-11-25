import { Injectable } from '@nestjs/common';
import { assertToolAllowed, nudgesFor, type GuidanceCapability, type AgentProposal, type ProposalLifecycle } from '@naqla/agents';
import { DbService } from '../infra/db.service';
import { CareerService } from '../slice1/career.service';
import { ActivityCatalogueService } from '../slice1/activity-catalogue.service';
import { EvaluationService } from '../slice1/evaluation.service';
import { ReadinessService } from '../readiness/readiness.service';

/**
 * Phase B, package 5 — the permission-aware READ tools behind the three guidance capabilities.
 *
 * Each tool wraps a read the product already serves to the graduate (no new data path), so it inherits that read's
 * permissions: own data under row security (`my_progress`, `my_feedback`), and visible / verified content only
 * (`occupation_profile`, `skill_explanation`, `skill_activities`, `approved_resources`). A capability calls only its
 * own tools (`assertToolAllowed`). No tool writes, and none returns assessment-design data (planted defects,
 * reviewer references, reference solutions) — those are never in the reads it wraps.
 */
@Injectable()
export class GuidanceTools {
  constructor(
    private readonly db: DbService,
    private readonly career: CareerService,
    private readonly catalogue: ActivityCatalogueService,
    private readonly evaluations: EvaluationService,
    private readonly readiness: ReadinessService,
  ) {}

  /** occupation_profile — the graduate's current role, as the goal page shows it (visible content only). */
  async occupationProfile(cap: GuidanceCapability, userId: string) {
    assertToolAllowed(cap, 'occupation_profile');
    const goal = await this.db.asUser(userId, async (c) => (await c.query('select target_role_id from career_goal where user_id = $1 and is_current', [userId])).rows[0] ?? null);
    if (!goal) return null;
    const role = (await this.career.listTargetRoles(userId)).find((r) => r.id === goal.target_role_id);
    return role ? { id: String(role.id), labelAr: String(role.label_ar), isDemo: role.isDemo, isPilot: role.isPilot, profile: role.profile } : null;
  }

  /** skill_explanation + skill_activities + approved_resources — one skill of the current role, as the skill page shows it. */
  async skill(cap: GuidanceCapability, userId: string, skillId: string, tools: readonly ('skill_explanation' | 'skill_activities' | 'approved_resources')[]) {
    for (const t of tools) assertToolAllowed(cap, t);
    const d = await this.readiness.trackSkill(userId, skillId);
    return {
      skillId: d.skill.skillId, labelAr: d.skill.labelAr, level: d.skill.verification.level,
      explanation: tools.includes('skill_explanation') ? d.skill.explanation ?? null : null,
      activities: tools.includes('skill_activities') ? d.activities : [],
      learning: tools.includes('approved_resources') ? d.learning : null,
    };
  }

  /** my_progress — the graduate's own skills, work and pending proposals (row security; never another user's). */
  async myProgress(cap: GuidanceCapability, userId: string) {
    assertToolAllowed(cap, 'my_progress');
    const [skills, work, catalogue, pending] = await Promise.all([
      this.readiness.trackSkills(userId),
      this.catalogue.projectStatuses(userId, null),
      this.catalogue.list(userId),
      this.pendingProposals(userId),
    ]);
    return {
      hasGoal: catalogue.unavailableReason !== 'no_career_goal',
      roleAvailable: catalogue.unavailableReason !== 'role_unavailable',
      role: skills.role,
      skills: skills.items.map((s, i) => ({ skillId: s.skillId, labelAr: s.labelAr, level: s.verification.level, standingEvaluatedCount: s.evidence.standingEvaluatedCount,
        approvedClass: s.readiness.expertApproved === true && s.readiness.professionalClass ? s.readiness.professionalClass : null, roleOrder: s.readiness.displayOrder ?? i })),
      work: work.map((w) => ({ projectId: String(w.id), title: String(w.activity?.titleAr ?? w.title), workStatus: w.workStatus, latestSubmissionId: w.latestSubmission?.id ?? null, updatedAt: new Date(w.updatedAt as string | Date).toISOString() })),
      startableActivityCount: catalogue.items.filter((a) => a.startable && !a.myLatest).length,
      pendingProposals: pending,
    };
  }

  /** my_feedback — the owner's evaluation view of one submission (404 for anyone else, from the existing read). */
  async myFeedback(cap: GuidanceCapability, userId: string, submissionId: string) {
    assertToolAllowed(cap, 'my_feedback');
    return this.evaluations.getEvaluationForSubmission(userId, submissionId);
  }

  /** Proposals awaiting the graduate, as the companion phrases them — excluding guidance answers themselves (R7–R9). */
  private async pendingProposals(userId: string): Promise<{ id: string; textAr: string }[]> {
    // agent_invocation is service-read only; the user filter below scopes it to the graduate.
    const rows = await this.db.asService(async (c) => (await c.query(
      `select p.id, p.proposal_type, p.subject_type, p.subject_id, p.summary, p.structured_payload, p.lifecycle, p.created_at
         from agent_proposal p where p.user_id = $1 and p.lifecycle in ('validated', 'awaiting_user')
          and not exists (select 1 from agent_invocation i where i.id = p.invocation_id and i.orchestration_rule ~ '^R[789]-')
        order by p.created_at desc limit 20`, [userId])).rows);
    const proposals = rows.map((r) => ({ proposalId: String(r.id), invocationId: '', agentType: 'recruitment', proposalType: r.proposal_type, subjectType: r.subject_type, subjectId: r.subject_id,
      summary: r.summary, structuredPayload: r.structured_payload, evidenceRefs: [], sourceRefs: [], rationale: '', warnings: [], requiresUserApproval: false, requiresDomainValidation: true,
      createdAt: String(r.created_at), lifecycle: r.lifecycle as ProposalLifecycle } as AgentProposal & { lifecycle: ProposalLifecycle }));
    return nudgesFor(proposals).map((n) => ({ id: n.proposalId, textAr: n.textAr }));
  }
}
