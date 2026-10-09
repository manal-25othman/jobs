import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import {
  AgentGateway, LocalTestProvider, route, nudgesFor, validateAgainstDomain, assertLifecycle, assertReadyForApproval, ProposalRejected,
  WORDING_PROPOSAL_TYPES, type AgentType, type Trigger, type GatewayResult, type DomainFacts, type AgentProposal,
  type ProposalLifecycle, type InputReference, type WordingPayload, type TestProviderMode,
} from '@naqla/agents';
import {
  assertNoUnsupportedLanguage, InvariantViolation, canonicalEvidenceStates, claimKindForProposalType, claimPolicyRef,
  CLAIM_KIND_LABEL_AR, DRAFTABLE_CLAIM_KINDS, CLAIM_KINDS_WITHOUT_EVIDENCE_REF, type DraftableClaimKind,
} from '@naqla/domain';
import { groundingChecks } from '@naqla/agents';
import { loadDomainFacts, approvedTechnologiesForEvidence } from './domain-facts';
import { resolveClaimPolicy, loadClaimSubject, eligibilityFor, recordClaimEvent } from './claim-drafts';
import { loadClaimFacts, factsForProvider, groundWording, groundingVersion } from './claim-facts';
import type { GroundingResult } from '@naqla/agents';
import { loadRoleRequirements, loadActivityContext } from '../career-data/career-data.service';

export const AGENT_GATEWAY = Symbol('AGENT_GATEWAY');

/** Phase 7b: the wording to approve is not grounded in the cited records. Recorded, then surfaced as a 400; the original draft is untouched. */
class ClaimGroundingRefusal extends Error {
  constructor(readonly kind: DraftableClaimKind, readonly grounding: GroundingResult, readonly edited: boolean, readonly resolved: Awaited<ReturnType<typeof resolveClaimPolicy>>) {
    super(grounding.issues.map((x) => x.en).join('; '));
  }
}

/** The claim policy active at approval refused the draft. Recorded, then surfaced as a 400. */
class ClaimPolicyRefusal extends Error {
  constructor(readonly kind: DraftableClaimKind, readonly resolved: Awaited<ReturnType<typeof resolveClaimPolicy>>, readonly reasonsEn: string) { super(reasonsEn); }
}
/** Development convenience only — refused as a production value (D-073). */
const DEVELOPMENT_ONLY_BUDGET = 50;

export function buildGateway(db: DbService): AgentGateway {
  const providerName = process.env['AGENT_PROVIDER'] ?? 'local-test';
  if (providerName !== 'local-test') throw new Error(`no provider '${providerName}' exists; OPEN-023 is unresolved`);
  const mode = (process.env['AGENT_TEST_PROVIDER_MODE'] ?? 'normal') as TestProviderMode;
  const production = process.env['NODE_ENV'] === 'production';
  // D-073: the budget is configuration. There is no production value in code;
  // the number below exists only so a developer machine runs without .env.
  const raw = process.env['AGENT_BUDGET_CALLS_PER_DAY'];
  if (production && !raw) throw new Error('AGENT_BUDGET_CALLS_PER_DAY is required in production; no default exists (D-073)');
  const max = raw ? Number(raw) : DEVELOPMENT_ONLY_BUDGET;
  if (!Number.isInteger(max) || max <= 0) throw new Error('AGENT_BUDGET_CALLS_PER_DAY must be a positive integer');
  return new AgentGateway(
    new LocalTestProvider(mode),
    { maxCallsPerWindow: max, callsUsed: (userId) => db.asService(async (c) => {
        const { rows } = await c.query(`select count(*)::int as n from agent_invocation where user_id = $1 and created_at > now() - interval '1 day'`, [userId]);
        return rows[0].n; }) },
    { newId: () => randomUUID(), now: () => new Date().toISOString() },
    { production: process.env['NODE_ENV'] === 'production' },
  );
}

/**
 * Persists what the gateway returns and runs the approval path.
 *
 * Nothing here writes evidence, claims or evaluation history. Approval creates
 * a professional asset through the same table and constraints a user-made
 * asset uses, after re-running domain validation against current facts.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  constructor(private readonly db: DbService, @Inject(AGENT_GATEWAY) private readonly gateway: AgentGateway) {}

  /** Deterministic orchestration entry point. Never throws into the caller. */
  async onEvent(event: { type: Trigger; userId: string; facts: Record<string, unknown>; refs: InputReference[] }): Promise<{ proposals: number } | null> {
    try {
      const decision = route({ type: event.type, userId: event.userId, facts: event.facts });
      if (!decision) return null;
      const fullContext = await this.buildContext(event.userId, decision.agentType, event.facts);
      const domainFacts = await this.domainFacts(event.userId);
      const targetRoleId = (fullContext['targetRole'] as { id?: string } | undefined)?.id ?? null;
      const result = await this.gateway.invoke({ agentType: decision.agentType, trigger: event.type, userId: event.userId,
        targetRoleId, fullContext, inputReferences: event.refs, domainFacts });
      const persisted = await this.persist(event.userId, result, decision.ruleId);
      return { proposals: persisted.stored.length };
    } catch (e) {
      // Agent failure must not break the product (§14).
      this.logger.warn(`agent orchestration failed and was ignored: ${(e as Error).message}`);
      return null;
    }
  }

  private async buildContext(userId: string, agentType: AgentType, facts: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.db.asService(async (c) => {
      const goal = await c.query(`select tr.id, tr.label_en, tr.review_status from career_goal cg join target_role tr on tr.id = cg.target_role_id where cg.user_id = $1 and cg.is_current`, [userId]);
      const ctx: Record<string, unknown> = { targetRole: goal.rows[0] ? { id: goal.rows[0].id, label: goal.rows[0].label_en } : null };
      // Career Data Foundation: role requirements come from the PUBLISHED layer, or are reported missing.
      const roleReq = await loadRoleRequirements(c, goal.rows[0]?.id ?? null);
      ctx['roleRequirements'] = { status: roleReq.status, roleLabelEn: roleReq.roleLabelEn, reviewStatus: roleReq.reviewStatus,
        requirements: roleReq.requirements.map((r) => ({ skillId: r.skillId, labelAr: r.labelAr, labelEn: r.labelEn, isCore: r.isCore, importance: r.importance, targetProficiency: r.targetProficiency, whyRequiredAr: r.whyRequiredAr })) };
      // OPEN-039: a claim on an alias skill is reported under its canonical skill (the higher state wins).
      const claims = await c.query('select canonical_skill_id(skill_id) as skill_id, state from skill_claim where user_id = $1', [userId]);
      ctx['evidenceStates'] = canonicalEvidenceStates([], claims.rows.map((r) => ({ skillId: r.skill_id, state: r.state })));
      // Full context is built once; the gateway redacts it per agent and records what passed.
      const user = await c.query('select display_name from app_user where id = $1', [userId]);
      ctx['email'] = null; ctx['displayName'] = user.rows[0]?.display_name;

      if (facts['evidenceId']) {
        const ev = await c.query(`select e.id, e.skill_id, sk.label_ar, sk.label_en, sc.state, p.title, e.evaluation_result_id
          from evidence e join skill sk on sk.id = e.skill_id join skill_claim sc on sc.user_id = e.user_id and sc.skill_id = e.skill_id
          left join project p on p.id = e.project_id where e.id = $1 and e.user_id = $2`, [facts['evidenceId'], userId]);
        const r = ev.rows[0];
        if (r) {
          const crit = await c.query(`select criterion_key, score, max_score from evaluation_criterion_score where evaluation_result_id = $1`, [r.evaluation_result_id]);
          ctx['evidence'] = { id: r.id, skillId: r.skill_id, skillLabelAr: r.label_ar, skillLabelEn: r.label_en, state: r.state, projectTitle: r.title ?? 'مشروع',
            evaluationResultId: r.evaluation_result_id, criteriaMet: crit.rows.filter((x) => Number(x.score) >= Number(x.max_score)).map((x) => x.criterion_key),
            totalScore: crit.rows.reduce((s, x) => s + Number(x.score), 0), maxScore: crit.rows.reduce((s, x) => s + Number(x.max_score), 0) };
        }
        const assets = await c.query('select id, kind, lifecycle_state from professional_asset where user_id = $1', [userId]);
        ctx['professionalAssets'] = assets.rows;
        // D-076: only technologies with an approved source reach the agent as facts.
        ctx['approvedTechnologies'] = await approvedTechnologiesForEvidence(c, userId, String(facts['evidenceId']));
        // Phase 7b: the recorded facts behind this evidence (ids, kinds, values), so a draft can declare its plan.
        ctx['claimFacts'] = factsForProvider(await loadClaimFacts(c, userId, 'cv_bullet', [String(facts['evidenceId'])]));
      }
      if (facts['evaluationResultId']) {
        const crit = await c.query(`select criterion_key, score, max_score, rationale, skill_id from evaluation_criterion_score where evaluation_result_id = $1 order by criterion_key`, [facts['evaluationResultId']]);
        const blocking = await c.query(`select check_key from integrity_check where evaluation_result_id = $1 and passed = false and classification = 'user_facing' limit 1`, [facts['evaluationResultId']]);
        ctx['deterministicResults'] = { evaluationResultId: facts['evaluationResultId'], outcome: facts['outcome'], skillId: facts['skillId'],
          criteria: crit.rows.map((x) => ({ key: x.criterion_key, met: Number(x.score) >= Number(x.max_score), rationale: x.rationale })),
          blockingCheck: blocking.rows[0]?.check_key ?? null };
        ctx['aiDisclosure'] = facts['aiDisclosure'] ?? null;
        const spec = await c.query('select s.activity_spec_id from evaluation_result er join submission sub on sub.id = er.submission_id join project s on s.id = sub.project_id where er.id = $1', [facts['evaluationResultId']]);
        const actCtx = await loadActivityContext(c, spec.rows[0]?.activity_spec_id ?? null);
        ctx['activityContext'] = actCtx;
        // Private technical notes and CV data exist in the full context on purpose:
        // the test proves the gateway redacts them for the wrong agent.
        ctx['cv'] = { summary: '(cv data)' };
      }
      ctx['privateNotes'] = '(never passed)';
      void agentType;
      return ctx;
    });
  }

  private async domainFacts(userId: string): Promise<DomainFacts> {
    return this.db.asService((c) => loadDomainFacts(c, userId));
  }

  /**
   * Stores what the gateway returned. Phase 7: a wording proposal is a CLAIM
   * DRAFT — before it is stored, the claim policy active for its kind judges
   * it against current evidence. A draft the policy refuses (or a kind with no
   * active policy) is not stored as awaiting the user; the refusal is audited
   * like any other rejected candidate. Returns the stored proposal ids.
   */
  private async persist(userId: string, r: GatewayResult, ruleId: string): Promise<{ stored: string[]; refused: { en: string; ar: string }[] }> {
    return this.db.asService(async (c) => {
      const inv = r.invocation;
      await c.query(`insert into agent_invocation (id, agent_id, agent_type, trigger, user_id, target_role_id, allowed_context, redacted_context,
          requested_action, input_references, output_types, provenance_source, provider, model, orchestration_rule)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [inv.invocationId, inv.agentId, inv.agentType, inv.trigger, userId, inv.targetRoleId, inv.allowedContext, r.redactedPaths,
         inv.requestedAction, JSON.stringify(inv.inputReferences), inv.outputProposalTypes, inv.provenance.source, r.usage.provider, r.usage.model, ruleId]);
      const u = r.usage;
      await c.query(`insert into agent_usage (invocation_id, user_id, agent_type, provider, model, input_bytes, output_bytes, latency_ms, estimated_cost, status, cache_status, error_type)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [inv.invocationId, userId, u.agentType, u.provider, u.model, u.inputBytes, u.outputBytes, u.latencyMs, u.estimatedCost, u.status, u.cacheStatus, u.errorType]);
      const facts = await loadDomainFacts(c, userId);
      const stored: string[] = [];
      const refused: { en: string; ar: string }[] = [];
      for (const p of r.proposals) {
        const kind = WORDING_PROPOSAL_TYPES.has(p.proposalType) ? claimKindForProposalType(p.proposalType) : null;
        let claim: { kind: DraftableClaimKind; policyId: string; ref: string; resolution: string; report: unknown; resolved: Awaited<ReturnType<typeof resolveClaimPolicy>>; grounding: GroundingResult } | null = null;
        if (kind) {
          const payload = p.structuredPayload as WordingPayload;
          const resolved = await resolveClaimPolicy(c, kind);
          const verdict = eligibilityFor(kind, resolved, await loadClaimSubject(c, userId, kind, payload, p.evidenceRefs, facts));
          if (verdict.status !== 'eligible' || !resolved) {
            const why = verdict.status === 'eligible' ? 'no policy' : verdict.reasons.map((x) => x.en).join('; ');
            refused.push({ en: `${p.proposalType}: ${why}`, ar: verdict.status === 'eligible' ? 'لا قاعدة فعّالة لهذا النوع.' : verdict.reasons.map((x) => x.ar).join(' ') });
            await emitAuditEvent(c, { eventType: 'agent.proposal_rejected', userId, actorKind: 'system', subjectTable: 'agent_invocation', subjectId: inv.invocationId,
              reason: `claim_policy: ${why}`, payload: { proposalType: p.proposalType, claimKind: kind, policyRef: verdict.policyRef } });
            continue;
          }
          // Phase 7b: Claim-to-Fact grounding against the cited records. A refused draft is not offered;
          // its original wording and the reasons are kept in the audit record.
          const grounding = await groundWording(c, userId, kind, { ar: payload.suggestedValueAr, en: payload.suggestedValueEn, plan: payload.claimPlan ?? null }, p.evidenceRefs, facts);
          if (grounding.decision === 'refused') {
            refused.push({ en: `${p.proposalType}: ${grounding.issues.filter((x) => x.severity === 'refuse').map((x) => x.en).join('; ')}`,
              ar: grounding.issues.filter((x) => x.severity === 'refuse').map((x) => x.ar).join(' ') });
            await emitAuditEvent(c, { eventType: 'agent.proposal_rejected', userId, actorKind: 'system', subjectTable: 'agent_invocation', subjectId: inv.invocationId,
              reason: 'claim_grounding: refused — an assertion is not supported by the cited records', payload: { proposalType: p.proposalType, claimKind: kind, grounding } });
            continue;
          }
          claim = { kind, policyId: resolved.policy.id, ref: claimPolicyRef(resolved.policy), resolution: resolved.resolution,
            report: [...groundingChecks(p, facts), ...verdict.checked.map((ch) => ({ check: `policy:${ch}`, passed: true, detail: `${claimPolicyRef(resolved.policy)} (${resolved.resolution})` }))], resolved, grounding };
        }
        // Gateway already validated schema + domain, so the row is born `validated`,
        // and a wording proposal moves straight to awaiting_user.
        const lifecycle: ProposalLifecycle = p.requiresUserApproval ? 'awaiting_user' : 'validated';
        await c.query(`insert into agent_proposal (id, invocation_id, user_id, agent_type, proposal_type, subject_type, subject_id, summary, structured_payload,
            evidence_refs, source_refs, rationale, warnings, requires_user_approval, lifecycle, validated_at,
            claim_kind, claim_policy_id, claim_policy_ref, claim_policy_resolution, grounding_status, grounding_report, grounding_result, grounding_version)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now(), $16,$17,$18,$19,$20,$21,$22,$23)`,
          [p.proposalId, inv.invocationId, userId, p.agentType, p.proposalType, p.subjectType, p.subjectId, p.summary, JSON.stringify(p.structuredPayload),
           p.evidenceRefs, JSON.stringify(p.sourceRefs), p.rationale, p.warnings, p.requiresUserApproval, lifecycle,
           claim?.kind ?? null, claim?.policyId ?? null, claim?.ref ?? null, claim?.resolution ?? null, claim ? claim.grounding.decision : null, claim ? JSON.stringify(claim.report) : null,
           claim ? JSON.stringify(claim.grounding) : null, claim ? groundingVersion(claim.grounding) : null]);
        if (claim) await recordClaimEvent(c, { proposalId: p.proposalId, userId, event: 'drafted', claimKind: claim.kind, policy: claim.resolved, actorKind: 'system', grounding: claim.grounding,
          detail: claim.grounding.decision === 'grounded'
            ? 'drafted from existing evidence; every assertion is supported by a cited record and the claim policy passed; waiting for the user'
            : 'drafted, but part of the wording is not accounted for by a cited record (needs revision); it cannot be approved as evidence-backed until revised' });
        stored.push(p.proposalId);
      }
      for (const rej of r.rejected) {
        await emitAuditEvent(c, { eventType: 'agent.proposal_rejected', userId, actorKind: 'system', subjectTable: 'agent_invocation', subjectId: inv.invocationId,
          reason: `${rej.code}: ${rej.reason}` });
      }
      await emitAuditEvent(c, { eventType: 'agent.invoked', userId, actorKind: 'system', subjectTable: 'agent_invocation', subjectId: inv.invocationId,
        reason: `rule ${ruleId}: ${inv.requestedAction}`, payload: { proposals: stored.length, rejected: r.rejected.length + refused.length, status: u.status, passedContext: inv.allowedContext } });
      return { stored, refused: [...r.rejected.map((x) => ({ en: `${x.code}: ${x.reason}`, ar: 'لم يجتز الاقتراح فحوص الأدلة، فلم يُعرض عليك.' })), ...refused] };
    });
  }

  /* ───────────────────────── claim drafts (Phase 7) ───────────────────── */

  /**
   * The user asks for a claim draft of one kind, optionally from one piece of
   * evidence. The policy is checked FIRST (no agent call when the kind cannot
   * be drafted); the agent then proposes from facts only; the stored draft
   * waits for the user's preview and approval. Nothing is applied.
   */
  async requestClaimDraft(userId: string, kindRaw: string, evidenceId: string | null) {
    if (!(DRAFTABLE_CLAIM_KINDS as readonly string[]).includes(kindRaw)) throw new BadRequestException(`unknown claim kind '${kindRaw}'`);
    const kind = kindRaw as DraftableClaimKind;
    if (!CLAIM_KINDS_WITHOUT_EVIDENCE_REF.has(kind) && !evidenceId) throw new BadRequestException(`a '${kind}' draft needs an evidence id`);
    const pre = await this.db.asService(async (c) => {
      const facts = await loadDomainFacts(c, userId);
      if (evidenceId && !facts.existingEvidence.has(evidenceId)) throw new BadRequestException('the evidence does not exist, is not yours, or was withdrawn');
      const resolved = await resolveClaimPolicy(c, kind);
      const ev = evidenceId ? (await c.query('select canonical_skill_id(skill_id) as skill_id from evidence where id = $1', [evidenceId])).rows[0] : null;
      const verdict = eligibilityFor(kind, resolved, await loadClaimSubject(c, userId, kind,
        { namedSkillIds: ev ? [String(ev.skill_id)] : [], suggestedValueAr: '', suggestedValueEn: null }, evidenceId ? [evidenceId] : [], facts));
      return { verdict };
    });
    if (pre.verdict.status !== 'eligible') {
      return { status: pre.verdict.status, proposalIds: [] as string[], reasons: pre.verdict.reasons.map((x) => ({ code: x.code, ar: x.ar, en: x.en })) };
    }
    const decision = route({ type: 'user.requested', userId, facts: { requestedClaimKind: kind } });
    if (!decision) throw new BadRequestException('no agent handles this request');
    const fullContext = await this.buildContext(userId, decision.agentType, evidenceId ? { evidenceId } : {});
    fullContext['claimRequest'] = await this.db.asService((c) => this.claimRequestContext(c, userId, kind, evidenceId));
    const domainFacts = await this.domainFacts(userId);
    const result = await this.gateway.invoke({ agentType: decision.agentType, trigger: 'user.requested', userId,
      targetRoleId: (fullContext['targetRole'] as { id?: string } | null)?.id ?? null, fullContext,
      inputReferences: evidenceId ? [{ kind: 'evidence', id: evidenceId }] : [], domainFacts });
    const { stored, refused } = await this.persist(userId, result, decision.ruleId);
    const drafts = await this.db.asService(async (c) => (await c.query(`select id from agent_proposal where id = any($1::uuid[]) and claim_kind is not null`, [stored])).rows.map((x) => String(x.id)));
    return { status: drafts.length > 0 ? 'drafted' as const : 'nothing_drafted' as const, proposalIds: drafts,
      reasons: drafts.length > 0 ? [] : refused.map((x) => ({ code: 'refused', en: x.en, ar: x.ar })) };
  }

  /** What the agent may use for a claim draft: facts only, including the CURRENT wording of the same kind, for the comparison. */
  private async claimRequestContext(c: PoolClient, userId: string, kind: DraftableClaimKind, evidenceId: string | null) {
    let evidence: Record<string, unknown> | null = null;
    if (evidenceId) {
      const r = (await c.query(`select e.id, canonical_skill_id(e.skill_id) as skill_id, sk.label_ar, sk.label_en, p.title, e.evaluation_result_id
          from evidence e join skill sk on sk.id = canonical_skill_id(e.skill_id) left join project p on p.id = e.project_id where e.id = $1 and e.user_id = $2`, [evidenceId, userId])).rows[0];
      const crit = r?.evaluation_result_id ? (await c.query('select criterion_key, score, max_score from evaluation_criterion_score where evaluation_result_id = $1', [r.evaluation_result_id])).rows : [];
      const states = canonicalEvidenceStates([], (await c.query('select canonical_skill_id(skill_id) as skill_id, state from skill_claim where user_id = $1', [userId])).rows.map((x) => ({ skillId: x.skill_id, state: x.state })));
      if (r) evidence = { id: r.id, skillId: r.skill_id, skillLabelAr: r.label_ar, skillLabelEn: r.label_en, state: states[r.skill_id] ?? 'gap', projectTitle: r.title ?? 'مشروع',
        evaluationResultId: r.evaluation_result_id, criteriaMet: crit.filter((x) => Number(x.score) >= Number(x.max_score)).map((x) => x.criterion_key),
        totalScore: crit.reduce((a, x) => a + Number(x.score), 0), maxScore: crit.reduce((a, x) => a + Number(x.max_score), 0) };
    }
    const demonstrated = await c.query(`select distinct sk.id, sk.label_ar, sk.label_en from skill_claim sc join skill sk on sk.id = canonical_skill_id(sc.skill_id)
        where sc.user_id = $1 and sc.state in ('demonstrated','verified') order by sk.label_en`, [userId]);
    const role = await c.query(`select tr.label_ar, tr.label_en from career_goal cg join target_role tr on tr.id = cg.target_role_id where cg.user_id = $1 and cg.is_current`, [userId]);
    return { kind, current: await this.currentWording(c, userId, kind, (evidence?.['skillId'] as string | undefined) ?? null), evidence,
      facts: factsForProvider(await loadClaimFacts(c, userId, kind, evidenceId ? [evidenceId] : [])),
      demonstratedSkills: demonstrated.rows.map((x) => ({ skillId: x.id, labelAr: x.label_ar, labelEn: x.label_en })),
      roleLabelAr: role.rows[0]?.label_ar ?? null, roleLabelEn: role.rows[0]?.label_en ?? null,
      approvedTechnologies: evidenceId ? await approvedTechnologiesForEvidence(c, userId, evidenceId) : [] };
  }

  /** The user's current ACTIVE wording of the same kind (and skill, when there is one). Null when there is none. */
  private async currentWording(c: PoolClient, userId: string, kind: string, skillId: string | null): Promise<string | null> {
    const r = await c.query(`select body from professional_asset where user_id = $1 and kind = $2 and lifecycle_state = 'active'
        and ($3::uuid is null or skill_id = $3::uuid) order by user_approved_at desc nulls last limit 1`, [userId, kind, skillId]);
    return r.rows[0]?.body ?? null;
  }

  /** Append-only history of one claim draft. */
  async claimHistory(userId: string, proposalId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(`select event, claim_kind, claim_policy_ref, actor_kind, detail, asset_id, created_at from claim_draft_event where proposal_id = $1 order by created_at, id`, [proposalId]);
      return rows.map((r) => ({ event: r.event, claimKind: r.claim_kind, policyRef: r.claim_policy_ref, actorKind: r.actor_kind, detail: r.detail, assetId: r.asset_id, at: r.created_at }));
    });
  }

  /** What the request form shows: each kind, whether a policy is active for it here, and the user's standing evidence. */
  async claimDraftOptions(userId: string) {
    return this.db.asService(async (c) => {
      const kinds = [];
      for (const kind of DRAFTABLE_CLAIM_KINDS) {
        const r = await resolveClaimPolicy(c, kind);
        kinds.push({ kind, labelAr: CLAIM_KIND_LABEL_AR[kind], needsEvidence: !CLAIM_KINDS_WITHOUT_EVIDENCE_REF.has(kind),
          policy: r ? { ref: claimPolicyRef(r.policy), resolution: r.resolution, minEvidenceLevel: r.policy.minEvidenceLevel, reviewStatus: r.policy.reviewStatus, validationNote: r.validationNote } : null });
      }
      const ev = await c.query(`select e.id, p.title, sk.label_ar, sk.label_en from evidence e join skill sk on sk.id = canonical_skill_id(e.skill_id)
          left join project p on p.id = e.project_id where e.user_id = $1 and e.withdrawn_at is null order by e.created_at desc`, [userId]);
      return { kinds, evidence: ev.rows.map((r) => ({ id: r.id, projectTitle: r.title, skillLabelAr: r.label_ar, skillLabelEn: r.label_en })) };
    });
  }

  /* ───────────────────────── read / approve / reject ───────────────────── */

  async list(userId: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(`select id, agent_type, proposal_type, subject_type, subject_id, summary, structured_payload, evidence_refs, source_refs,
        rationale, warnings, requires_user_approval, lifecycle, version, previewed_at, approved_at, approved_body, rejected_at, rejection_reason, superseded_by, resulting_asset_id, created_at
        from agent_proposal order by created_at desc`);
      return rows.map(this.row);
    });
  }

  async get(userId: string, id: string) {
    return this.db.asUser(userId, async (c) => {
      const { rows } = await c.query(`select * from agent_proposal where id = $1`, [id]);
      if (rows.length === 0) throw new NotFoundException('proposal not found');
      return this.row(rows[0]);
    });
  }

  /**
   * Preview: current vs suggested wording, why, the evidence behind it, what
   * is missing, and the policy that judges it. Nothing changes except the
   * recorded first preview (D-057). Eligibility is re-evaluated live, read-only.
   */
  async preview(userId: string, id: string) {
    const p = await this.get(userId, id);
    const payload = p.structuredPayload as WordingPayload;
    const isWording = payload.kind === 'wording';
    const claim = await this.db.asService(async (c) => {
      // D-057: the preview is a recorded step, not a page view. First open wins.
      const first = await c.query('update agent_proposal set previewed_at = now() where id = $1 and user_id = $2 and previewed_at is null returning claim_kind', [id, userId]);
      const kind = isWording ? claimKindForProposalType(p.proposalType) : null;
      if (!kind) return null;
      const row = (await c.query('select claim_kind, claim_policy_ref, claim_policy_resolution, grounding_status, grounding_report, grounding_result from agent_proposal where id = $1', [id])).rows[0];
      const facts = await loadDomainFacts(c, userId);
      const resolved = await resolveClaimPolicy(c, kind);
      const now = eligibilityFor(kind, resolved, await loadClaimSubject(c, userId, kind, payload, p.evidenceRefs, facts));
      if ((first.rowCount ?? 0) > 0) await recordClaimEvent(c, { proposalId: id, userId, event: 'previewed', claimKind: kind, policy: resolved, actorKind: 'user', detail: 'the user opened the preview' });
      const ev = p.evidenceRefs.length === 0 ? [] : (await c.query(`select e.id, e.withdrawn_at is not null as withdrawn, p.title, sk.label_ar, sk.label_en
          from evidence e join skill sk on sk.id = canonical_skill_id(e.skill_id) left join project p on p.id = e.project_id
         where e.user_id = $1 and e.id = any($2::uuid[])`, [userId, p.evidenceRefs])).rows;
      // Phase 7b: grounding as recorded at drafting, and as it stands now against the cited records (read-only).
      const groundingNow = await groundWording(c, userId, kind, { ar: payload.suggestedValueAr, en: payload.suggestedValueEn, plan: payload.claimPlan ?? null }, p.evidenceRefs, facts);
      return {
        kind, labelAr: CLAIM_KIND_LABEL_AR[kind],
        grounding: { atDrafting: (row.grounding_result as GroundingResult | null) ?? null, now: groundingNow },
        draftedUnder: row.claim_policy_ref ? { ref: row.claim_policy_ref, resolution: row.claim_policy_resolution } : null,
        groundingStatus: row.grounding_status ?? null, groundingReport: row.grounding_report ?? null,
        policyNow: resolved ? { ref: claimPolicyRef(resolved.policy), resolution: resolved.resolution, minEvidenceLevel: resolved.policy.minEvidenceLevel,
          reviewStatus: resolved.policy.reviewStatus, validationNote: resolved.validationNote } : null,
        eligibleNow: now.status === 'eligible' && groundingNow.decision === 'grounded',
        policyEligibleNow: now.status === 'eligible',
        missing: now.status === 'eligible' ? [] : now.reasons.map((x) => ({ code: x.code, ar: x.ar, en: x.en })),
        evidence: ev.map((e) => ({ id: e.id, projectTitle: e.title, skillLabelAr: e.label_ar, skillLabelEn: e.label_en, withdrawn: e.withdrawn })),
        current: payload.currentValue ?? await this.currentWording(c, userId, kind, null),
      };
    });
    return { proposalId: p.id, proposalType: p.proposalType, lifecycle: p.lifecycle,
      current: isWording ? (claim?.current ?? payload.currentValue) : null,
      suggestedAr: isWording ? payload.suggestedValueAr : null,
      suggestedEn: isWording ? payload.suggestedValueEn : null,
      why: p.rationale, reason: isWording ? payload.reason : null,
      supportingSources: isWording ? payload.supportingSources : [],
      evidenceRefs: p.evidenceRefs, warnings: p.warnings,
      unsupportedRisk: isWording ? payload.unsupportedRisk : null,
      limitationNote: isWording ? payload.limitationNote : null,
      requiresApproval: p.requiresUserApproval, payload: p.structuredPayload, claim };
  }

  async approve(userId: string, id: string, editedBody?: string) {
    try {
      return await this.approveIn(userId, id, editedBody);
    } catch (e) {
      if (e instanceof ClaimGroundingRefusal) {
        await this.db.asService(async (c) => {
          if (!e.edited) await c.query(`update agent_proposal set grounding_status = $2, grounding_result = $3, grounding_version = $4 where id = $1 and claim_kind is not null and lifecycle = 'awaiting_user'`,
            [id, e.grounding.decision, JSON.stringify(e.grounding), groundingVersion(e.grounding)]);
          await recordClaimEvent(c, { proposalId: id, userId, event: e.edited ? 'edit_refused' : 'grounding_refused', claimKind: e.kind, policy: e.resolved, actorKind: 'system', grounding: e.grounding,
            detail: e.edited ? 'the edited wording is not accounted for by the cited records; the original draft is kept unchanged' : 'the wording is not accounted for by the cited records as they stand now' });
        });
        const label = e.grounding.decision === 'refused' ? 'refused' : 'needs revision';
        throw new BadRequestException(`approval refused by claim grounding (${label}): ${e.grounding.issues.map((x) => x.en).join('; ')}`);
      }
      if (!(e instanceof ClaimPolicyRefusal)) throw e;
      // Recorded in its own transaction: the refusal is history even though the approval did not happen.
      await this.db.asService(async (c) => {
        await c.query(`update agent_proposal set grounding_status = 'not_eligible' where id = $1 and claim_kind is not null and lifecycle = 'awaiting_user'`, [id]);
        await recordClaimEvent(c, { proposalId: id, userId, event: 'refused_not_eligible', claimKind: e.kind, policy: e.resolved, actorKind: 'system', detail: e.reasonsEn });
      });
      throw new BadRequestException(`approval refused by the claim policy${e.resolved ? ` ${claimPolicyRef(e.resolved.policy)}` : ''}: ${e.reasonsEn}`);
    }
  }

  private async approveIn(userId: string, id: string, editedBody?: string) {
    return this.db.asService(async (c) => {
      const cur = await c.query('select * from agent_proposal where id = $1', [id]);
      if (cur.rowCount === 0 || cur.rows[0].user_id !== userId) throw new NotFoundException('proposal not found');
      const p = cur.rows[0];
      assertReadyForApproval({ lifecycle: p.lifecycle, previewedAt: p.previewed_at ? String(p.previewed_at) : null });
      if (!WORDING_PROPOSAL_TYPES.has(p.proposal_type)) throw new BadRequestException('only a wording proposal is approved into an asset');
      const kind = claimKindForProposalType(p.proposal_type);
      if (!kind) throw new BadRequestException(`'${p.proposal_type}' drafts no claim kind`);

      // Domain validation runs AGAIN at approval, against current facts: a
      // proposal can age past its evidence.
      const payload = p.structured_payload as WordingPayload;
      const facts = await this.domainFactsIn(c, userId);
      const body = (editedBody?.trim() || payload.suggestedValueAr).trim();
      const checked: WordingPayload = { ...payload, suggestedValueAr: body };
      try {
        validateAgainstDomain({ proposalType: p.proposal_type, structuredPayload: checked, evidenceRefs: p.evidence_refs }, facts);
        assertNoUnsupportedLanguage(body, editedBody ? '' : (payload.suggestedValueEn ?? ''));
      } catch (e) {
        if (e instanceof ProposalRejected || e instanceof InvariantViolation) throw new BadRequestException(`approval refused by domain validation: ${e.message}`);
        throw e;
      }
      // Phase 7: the claim policy active NOW decides — not the one the draft was made under.
      const resolved = await resolveClaimPolicy(c, kind);
      const verdict = eligibilityFor(kind, resolved, await loadClaimSubject(c, userId, kind, checked, p.evidence_refs, facts));
      if (verdict.status !== 'eligible' || !resolved) throw new ClaimPolicyRefusal(kind, resolved, verdict.status === 'eligible' ? 'no active policy' : verdict.reasons.map((x) => x.en).join('; '));
      // Phase 7b: every assertion must be accounted for by the cited records as they stand now. An edit has no plan: it is grounded as written.
      const editedNow = !!editedBody && editedBody.trim() !== payload.suggestedValueAr.trim();
      const grounding = await groundWording(c, userId, kind, { ar: body, en: editedNow ? null : payload.suggestedValueEn, plan: editedNow ? null : (payload.claimPlan ?? null) }, p.evidence_refs, facts);
      if (grounding.decision !== 'grounded') throw new ClaimGroundingRefusal(kind, grounding, editedNow, resolved);

      let anchor: { skill_id: string | null; project_id: string | null; evaluation_result_id: string | null } = { skill_id: null, project_id: null, evaluation_result_id: null };
      if (p.evidence_refs.length > 0) {
        const ev = await c.query('select skill_id, project_id, evaluation_result_id from evidence where id = $1 and user_id = $2 and withdrawn_at is null', [p.evidence_refs[0], userId]);
        if (ev.rowCount === 0) throw new BadRequestException('the evidence behind this proposal was withdrawn or no longer exists');
        anchor = ev.rows[0];
      } else if (!CLAIM_KINDS_WITHOUT_EVIDENCE_REF.has(kind)) {
        throw new BadRequestException(`a '${kind}' claim needs evidence`);
      }
      const userEdited = !!editedBody && editedBody.trim() !== payload.suggestedValueAr.trim();
      const approvedAt = new Date().toISOString();
      const policyRef = `${claimPolicyRef(resolved.policy)} (${resolved.resolution})`;

      const asset = await c.query(`insert into professional_asset (user_id, kind, title, body, body_en, status, lifecycle_state, provenance_class, provenance_source,
          drafting_aid_used, skill_id, project_id, evaluation_result_id, user_approved_at, claim_policy_id, claim_policy_ref)
        values ($1,$2,$3,$4,$5,$6,'active',$7,$8,true,$9,$10,$11,$12,$13,$14) returning id`,
        [userId, kind, p.summary, body, userEdited ? null : payload.suggestedValueEn, userEdited ? 'user_edited' : 'approved',
         userEdited ? 'user_generated' : 'ai_generated', `agent_proposal:${id}`, anchor.skill_id, anchor.project_id, anchor.evaluation_result_id, approvedAt, resolved.policy.id, policyRef]);
      const assetId = asset.rows[0].id;
      for (const ref of p.evidence_refs) await c.query('insert into asset_evidence (asset_id, evidence_id) values ($1,$2) on conflict do nothing', [assetId, ref]);
      let i = 0;
      for (const s of payload.supportingSources) await c.query('insert into asset_trace (asset_id, clause, kind, ref, position) values ($1,$2,$3,$4,$5)', [assetId, s.ref, s.kind, s.ref, i++]);

      // A draft refused earlier under a stricter policy is grounded again once the policy active now accepts it.
      await c.query(`update agent_proposal set lifecycle = 'approved', approved_at = $2, approved_body = $3, resulting_asset_id = $4,
          grounding_status = case when claim_kind is null then null else 'grounded' end where id = $1`, [id, approvedAt, userEdited ? body : null, assetId]);
      // The asset was verified under the policy in effect now: that is its current standing.
      await c.query('update professional_asset set standing_policy_id = $2, standing_checked_at = now(), grounding_version = $3 where id = $1', [assetId, resolved.policy.id, groundingVersion(grounding)]);
      await recordClaimEvent(c, { proposalId: id, userId, event: 'approved', claimKind: kind, policy: resolved, actorKind: 'user', assetId, grounding,
        detail: userEdited ? 'the user approved an edited wording; it was re-checked against the evidence and the policy' : 'the user approved the wording as proposed' });
      await emitAuditEvent(c, { eventType: 'agent.proposal_approved', userId, actorKind: 'user', actorId: userId, subjectTable: 'agent_proposal', subjectId: id,
        reason: userEdited ? 'the user approved the proposal after editing the wording' : 'the user approved the proposal as proposed', payload: { assetId, userEdited, claimKind: kind, policyRef } });
      return { proposalId: id, lifecycle: 'approved', assetId, userEdited, claimKind: kind, policyRef };
    });
  }

  async reject(userId: string, id: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('a rejection needs a reason');
    return this.db.asService(async (c) => {
      const cur = await c.query('select user_id, lifecycle, proposal_type from agent_proposal where id = $1', [id]);
      if (cur.rowCount === 0 || cur.rows[0].user_id !== userId) throw new NotFoundException('proposal not found');
      assertLifecycle(cur.rows[0].lifecycle, 'rejected');
      await c.query(`update agent_proposal set lifecycle = 'rejected', rejected_at = now(), rejection_reason = $2 where id = $1`, [id, reason.trim()]);
      const kind = WORDING_PROPOSAL_TYPES.has(cur.rows[0].proposal_type) ? claimKindForProposalType(cur.rows[0].proposal_type) : null;
      if (kind) await recordClaimEvent(c, { proposalId: id, userId, event: 'rejected', claimKind: kind, policy: null, actorKind: 'user', detail: reason.trim() });
      await emitAuditEvent(c, { eventType: 'agent.proposal_rejected_by_user', userId, actorKind: 'user', actorId: userId, subjectTable: 'agent_proposal', subjectId: id, reason: reason.trim() });
      return { proposalId: id, lifecycle: 'rejected' };
    });
  }

  async companion(userId: string) {
    const all = await this.list(userId);
    return nudgesFor(all.map((p) => ({ ...this.toProposal(p), lifecycle: p.lifecycle as ProposalLifecycle })));
  }

  private domainFactsIn(c: PoolClient, userId: string): Promise<DomainFacts> { return loadDomainFacts(c, userId); }

  private row = (r: Record<string, unknown>) => ({
    id: r['id'], agentType: r['agent_type'], proposalType: r['proposal_type'], subjectType: r['subject_type'], subjectId: r['subject_id'],
    summary: r['summary'], structuredPayload: r['structured_payload'], evidenceRefs: r['evidence_refs'], sourceRefs: r['source_refs'],
    rationale: r['rationale'], warnings: r['warnings'], requiresUserApproval: r['requires_user_approval'], lifecycle: r['lifecycle'], version: r['version'],
    previewedAt: r['previewed_at'] ?? null, approvedAt: r['approved_at'], approvedBody: r['approved_body'], rejectedAt: r['rejected_at'], rejectionReason: r['rejection_reason'],
    supersededBy: r['superseded_by'], resultingAssetId: r['resulting_asset_id'], createdAt: r['created_at'],
  }) as {
    id: string; agentType: AgentType; proposalType: AgentProposal['proposalType']; subjectType: AgentProposal['subjectType']; subjectId: string; summary: string;
    structuredPayload: AgentProposal['structuredPayload']; evidenceRefs: string[]; sourceRefs: InputReference[]; rationale: string; warnings: string[];
    requiresUserApproval: boolean; lifecycle: string; version: number; previewedAt: string | null; approvedAt: string | null; approvedBody: string | null; rejectedAt: string | null;
    rejectionReason: string | null; supersededBy: string | null; resultingAssetId: string | null; createdAt: string;
  };

  private toProposal(p: ReturnType<AgentService['row']>): AgentProposal {
    return { proposalId: p.id, invocationId: '', agentType: p.agentType, proposalType: p.proposalType, subjectType: p.subjectType, subjectId: p.subjectId,
      summary: p.summary, structuredPayload: p.structuredPayload, evidenceRefs: p.evidenceRefs, sourceRefs: p.sourceRefs, rationale: p.rationale,
      warnings: p.warnings, requiresUserApproval: p.requiresUserApproval, requiresDomainValidation: true, createdAt: p.createdAt };
  }
}
