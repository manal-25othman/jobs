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
import { assertNoUnsupportedLanguage, InvariantViolation } from '@naqla/domain';
import { loadDomainFacts, approvedTechnologiesForEvidence } from './domain-facts';

export const AGENT_GATEWAY = Symbol('AGENT_GATEWAY');
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
      await this.persist(event.userId, result, decision.ruleId);
      return { proposals: result.proposals.length };
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
      }
      if (facts['evaluationResultId']) {
        const crit = await c.query(`select criterion_key, score, max_score, rationale, skill_id from evaluation_criterion_score where evaluation_result_id = $1 order by criterion_key`, [facts['evaluationResultId']]);
        const blocking = await c.query(`select check_key from integrity_check where evaluation_result_id = $1 and passed = false and classification = 'user_facing' limit 1`, [facts['evaluationResultId']]);
        ctx['deterministicResults'] = { evaluationResultId: facts['evaluationResultId'], outcome: facts['outcome'], skillId: facts['skillId'],
          criteria: crit.rows.map((x) => ({ key: x.criterion_key, met: Number(x.score) >= Number(x.max_score), rationale: x.rationale })),
          blockingCheck: blocking.rows[0]?.check_key ?? null };
        ctx['aiDisclosure'] = facts['aiDisclosure'] ?? null;
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

  private async persist(userId: string, r: GatewayResult, ruleId: string): Promise<void> {
    await this.db.asService(async (c) => {
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
      for (const p of r.proposals) {
        // Gateway already validated schema + domain, so the row is born `validated`,
        // and a wording proposal moves straight to awaiting_user.
        const lifecycle: ProposalLifecycle = p.requiresUserApproval ? 'awaiting_user' : 'validated';
        await c.query(`insert into agent_proposal (id, invocation_id, user_id, agent_type, proposal_type, subject_type, subject_id, summary, structured_payload,
            evidence_refs, source_refs, rationale, warnings, requires_user_approval, lifecycle, validated_at)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())`,
          [p.proposalId, inv.invocationId, userId, p.agentType, p.proposalType, p.subjectType, p.subjectId, p.summary, JSON.stringify(p.structuredPayload),
           p.evidenceRefs, JSON.stringify(p.sourceRefs), p.rationale, p.warnings, p.requiresUserApproval, lifecycle]);
      }
      for (const rej of r.rejected) {
        await emitAuditEvent(c, { eventType: 'agent.proposal_rejected', userId, actorKind: 'system', subjectTable: 'agent_invocation', subjectId: inv.invocationId,
          reason: `${rej.code}: ${rej.reason}` });
      }
      await emitAuditEvent(c, { eventType: 'agent.invoked', userId, actorKind: 'system', subjectTable: 'agent_invocation', subjectId: inv.invocationId,
        reason: `rule ${ruleId}: ${inv.requestedAction}`, payload: { proposals: r.proposals.length, rejected: r.rejected.length, status: u.status, passedContext: inv.allowedContext } });
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

  /** Preview: current, suggested, why, evidence, warnings. Nothing changes. */
  async preview(userId: string, id: string) {
    const p = await this.get(userId, id);
    // D-057: the preview is a recorded step, not a page view. First open wins.
    await this.db.asService((c) => c.query('update agent_proposal set previewed_at = coalesce(previewed_at, now()) where id = $1 and user_id = $2', [id, userId]));
    const payload = p.structuredPayload as WordingPayload;
    return { proposalId: p.id, proposalType: p.proposalType, lifecycle: p.lifecycle,
      current: payload.kind === 'wording' ? payload.currentValue : null,
      suggestedAr: payload.kind === 'wording' ? payload.suggestedValueAr : null,
      suggestedEn: payload.kind === 'wording' ? payload.suggestedValueEn : null,
      why: p.rationale, reason: payload.kind === 'wording' ? payload.reason : null,
      supportingSources: payload.kind === 'wording' ? payload.supportingSources : [],
      evidenceRefs: p.evidenceRefs, warnings: p.warnings,
      unsupportedRisk: payload.kind === 'wording' ? payload.unsupportedRisk : null,
      limitationNote: payload.kind === 'wording' ? payload.limitationNote : null,
      requiresApproval: p.requiresUserApproval, payload: p.structuredPayload };
  }

  async approve(userId: string, id: string, editedBody?: string) {
    return this.db.asService(async (c) => {
      const cur = await c.query('select * from agent_proposal where id = $1', [id]);
      if (cur.rowCount === 0 || cur.rows[0].user_id !== userId) throw new NotFoundException('proposal not found');
      const p = cur.rows[0];
      assertReadyForApproval({ lifecycle: p.lifecycle, previewedAt: p.previewed_at ? String(p.previewed_at) : null });
      if (!WORDING_PROPOSAL_TYPES.has(p.proposal_type)) throw new BadRequestException('only a wording proposal is approved into an asset');

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

      const evidenceId = p.evidence_refs[0];
      const skill = await c.query('select skill_id, project_id, evaluation_result_id from evidence where id = $1 and user_id = $2 and withdrawn_at is null', [evidenceId, userId]);
      if (skill.rowCount === 0) throw new BadRequestException('the evidence behind this proposal was withdrawn or no longer exists');
      const userEdited = !!editedBody && editedBody.trim() !== payload.suggestedValueAr.trim();
      const approvedAt = new Date().toISOString();

      const asset = await c.query(`insert into professional_asset (user_id, kind, title, body, body_en, status, lifecycle_state, provenance_class, provenance_source,
          drafting_aid_used, skill_id, project_id, evaluation_result_id, user_approved_at)
        values ($1,'cv_bullet',$2,$3,$4,$5,'active',$6,$7,true,$8,$9,$10,$11) returning id`,
        [userId, p.summary, body, userEdited ? null : payload.suggestedValueEn, userEdited ? 'user_edited' : 'approved',
         userEdited ? 'user_generated' : 'ai_generated', `agent_proposal:${id}`, skill.rows[0].skill_id, skill.rows[0].project_id, skill.rows[0].evaluation_result_id, approvedAt]);
      const assetId = asset.rows[0].id;
      for (const ref of p.evidence_refs) await c.query('insert into asset_evidence (asset_id, evidence_id) values ($1,$2) on conflict do nothing', [assetId, ref]);
      let i = 0;
      for (const s of payload.supportingSources) await c.query('insert into asset_trace (asset_id, clause, kind, ref, position) values ($1,$2,$3,$4,$5)', [assetId, s.ref, s.kind, s.ref, i++]);

      await c.query(`update agent_proposal set lifecycle = 'approved', approved_at = $2, approved_body = $3, resulting_asset_id = $4 where id = $1`, [id, approvedAt, userEdited ? body : null, assetId]);
      await emitAuditEvent(c, { eventType: 'agent.proposal_approved', userId, actorKind: 'user', actorId: userId, subjectTable: 'agent_proposal', subjectId: id,
        reason: userEdited ? 'the user approved the proposal after editing the wording' : 'the user approved the proposal as proposed', payload: { assetId, userEdited } });
      return { proposalId: id, lifecycle: 'approved', assetId, userEdited };
    });
  }

  async reject(userId: string, id: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('a rejection needs a reason');
    return this.db.asService(async (c) => {
      const cur = await c.query('select user_id, lifecycle from agent_proposal where id = $1', [id]);
      if (cur.rowCount === 0 || cur.rows[0].user_id !== userId) throw new NotFoundException('proposal not found');
      assertLifecycle(cur.rows[0].lifecycle, 'rejected');
      await c.query(`update agent_proposal set lifecycle = 'rejected', rejected_at = now(), rejection_reason = $2 where id = $1`, [id, reason.trim()]);
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
