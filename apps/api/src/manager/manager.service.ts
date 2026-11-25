import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  dueInterventions, managerCap, normalizeManagerMessage, PURPOSE_AR, MANAGER_LABEL_AR, MANAGER_NOT_SCORED_AR, MANAGER_CAP_REACHED_AR,
  type ManagerScenario, type TurnRecord,
} from '@naqla/domain';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { AgentService } from '../agents/agent.service';
import { loadHiddenTexts } from '../agents/hidden-texts';

const WITHHELD_AR = 'لا أستطيع الإجابة عن هذا الآن. اتخذي القرار الذي ترينه مناسبًا، واذكري سببه في ملاحظاتك.';
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * A11 Virtual Manager, M1–M2 (FR-U-026 / FR-A-002, journey S11).
 *
 *  - interventions are the scenario's own messages, delivered at their trigger, once (the contract's fallback text);
 *  - the graduate may write within the cap (A19 rule in the domain, checked HERE before any agent call);
 *  - each reply comes from A11 through the existing gateway (test provider: the scenario's clarifications only), is
 *    checked by the A11 guard at the gateway, then again here against the scenario's private never-reveal phrases and
 *    every private assessment text; anything failing is withheld and replaced by a neutral line;
 *  - the conversation is the owner's; the assigned reviewer reads the turns made before the submission; nothing is
 *    scored in P1 and nothing touches an evaluation, evidence or a level. Every step is audited.
 */
@Injectable()
export class ManagerService {
  constructor(private readonly db: DbService, private readonly agents: AgentService) {}

  private async context(c: PoolClient, userId: string, projectId: string) {
    if (!UUID.test(projectId)) throw new NotFoundException('project not found');
    const p = (await c.query('select id, user_id, activity_spec_id from project where id = $1 and deleted_at is null', [projectId])).rows[0];
    if (!p || p.user_id !== userId) throw new NotFoundException('project not found');
    const sc = p.activity_spec_id ? (await c.query(`select id, persona_ar, scenario from manager_scenario where activity_spec_id = $1 order by created_at desc limit 1`, [p.activity_spec_id])).rows[0] : null;
    return { project: p, scenario: sc ? { id: String(sc.id), personaAr: String(sc.persona_ar), body: sc.scenario as ManagerScenario } : null };
  }

  private async turns(c: PoolClient, projectId: string) {
    return (await c.query(`select id, intervention_key, author, kind, body, created_at from manager_turn where project_id = $1 order by created_at, id`, [projectId])).rows
      .map((r) => ({ id: String(r.id), interventionKey: String(r.intervention_key), author: r.author as 'manager' | 'graduate', kind: String(r.kind), body: String(r.body), createdAt: new Date(r.created_at).toISOString() }));
  }

  private present(scenario: { personaAr: string; body: ManagerScenario }, turns: Awaited<ReturnType<ManagerService['turns']>>) {
    const cap = managerCap(scenario.body, turns as TurnRecord[]);
    const delivered = new Set(turns.filter((t) => t.kind === 'intervention').map((t) => t.interventionKey));
    return {
      available: true as const, labelAr: MANAGER_LABEL_AR, notScoredAr: MANAGER_NOT_SCORED_AR, personaAr: scenario.personaAr,
      interventions: scenario.body.interventions.filter((i) => delivered.has(i.key)).map((i) => ({ key: i.key, purposeAr: PURPOSE_AR[i.purpose], remaining: cap.remainingFor(i.key) })),
      turns, cap: { used: cap.totalUsed, total: cap.totalCap, reached: cap.reached },
    };
  }

  /** The graduate's manager panel; delivers any intervention that is due (idempotent). */
  async view(userId: string, projectId: string) {
    return this.db.asService(async (c) => {
      const { project, scenario } = await this.context(c, userId, projectId);
      if (!scenario) return { available: false as const, labelAr: MANAGER_LABEL_AR, reasonAr: 'لا رسائل من مدير افتراضي في هذا النشاط.' };
      const existing = await this.turns(c, projectId);
      const draftSaved = (await c.query(`select exists (select 1 from project_draft where project_id = $1) or exists (select 1 from submission where project_id = $1) as v`, [projectId])).rows[0].v === true;
      for (const i of dueInterventions(scenario.body, { projectStarted: true, draftSaved, delivered: existing.filter((t) => t.kind === 'intervention').map((t) => t.interventionKey) })) {
        const r = await c.query(`insert into manager_turn (project_id, user_id, scenario_id, intervention_key, author, kind, body) values ($1,$2,$3,$4,'manager','intervention',$5)
                                  on conflict do nothing returning id`, [projectId, userId, scenario.id, i.key, i.messageAr]);
        if (r.rowCount) await emitAuditEvent(c, { eventType: 'manager.intervened', userId, actorKind: 'system', subjectTable: 'manager_turn', subjectId: r.rows[0].id,
          reason: `virtual-manager intervention delivered at its trigger (${i.trigger}); purpose ${i.purpose}`, payload: { projectId, interventionKey: i.key } });
      }
      void project;
      return this.present(scenario, await this.turns(c, projectId));
    });
  }

  /** The graduate writes to the manager about one delivered intervention; A11 replies once. */
  async send(userId: string, projectId: string, body: { interventionKey?: string; body?: unknown }) {
    const message = normalizeManagerMessage(body?.body);
    const pre = await this.db.asService(async (c) => {
      const { scenario } = await this.context(c, userId, projectId);
      if (!scenario) throw new ConflictException('[manager_unavailable] لا يوجد مدير افتراضي لهذا النشاط.');
      const turns = await this.turns(c, projectId);
      const key = String(body?.interventionKey ?? '');
      const iv = scenario.body.interventions.find((i) => i.key === key);
      if (!iv || !turns.some((t) => t.kind === 'intervention' && t.interventionKey === key)) throw new NotFoundException('intervention not found');
      const cap = managerCap(scenario.body, turns as TurnRecord[]);
      if (cap.remainingFor(key) <= 0) {
        if (!turns.some((t) => t.kind === 'cap_reached' && t.interventionKey === key)) {
          await c.query(`insert into manager_turn (project_id, user_id, scenario_id, intervention_key, author, kind, body) values ($1,$2,$3,$4,'manager','cap_reached',$5)`, [projectId, userId, scenario.id, key, MANAGER_CAP_REACHED_AR]);
          await emitAuditEvent(c, { eventType: 'manager.cap_reached', userId, actorKind: 'system', subjectTable: 'project', subjectId: projectId, reason: 'the A19 cap on virtual-manager messages was reached', payload: { interventionKey: key } });
        }
        return { capped: true as const, scenario };
      }
      const t = await c.query(`insert into manager_turn (project_id, user_id, scenario_id, intervention_key, author, kind, body) values ($1,$2,$3,$4,'graduate','message',$5) returning id`,
        [projectId, userId, scenario.id, key, message]);
      await emitAuditEvent(c, { eventType: 'manager.reply_received', userId, actorKind: 'user', actorId: userId, subjectTable: 'manager_turn', subjectId: t.rows[0].id,
        reason: 'the graduate wrote to the virtual manager', payload: { projectId, interventionKey: key } });
      return { capped: false as const, scenario, iv };
    });
    if (pre.capped) throw new ConflictException(`[manager_cap_reached] ${MANAGER_CAP_REACHED_AR}`);

    // A11 sees the learner-facing scenario of this intervention only — never the never-reveal list.
    const out = await this.agents.managerTurn(userId, { projectId, interventionKey: pre.iv.key, personaAr: pre.scenario.personaAr,
      clarifications: pre.iv.clarifications, graduateMessage: message });
    await this.db.asService(async (c) => {
      const hidden = [...pre.scenario.body.neverReveal, ...(await loadHiddenTexts(c))];
      const reply = out.payload?.replyAr ?? null;
      const leaked = reply ? hidden.some((h) => reply.toLowerCase().includes(h.toLowerCase())) : false;
      const kind = !reply || leaked ? 'withheld' : out.payload!.basis === 'clarification' ? 'reply' : out.payload!.basis;
      await c.query(`insert into manager_turn (project_id, user_id, scenario_id, intervention_key, author, kind, body, proposal_id) values ($1,$2,$3,$4,'manager',$5,$6,$7)`,
        [projectId, userId, pre.scenario.id, pre.iv.key, kind, kind === 'withheld' ? WITHHELD_AR : reply, kind === 'withheld' ? null : out.proposalId]);
      if (kind === 'withheld') await emitAuditEvent(c, { eventType: 'manager.reply_withheld', userId, actorKind: 'system', subjectTable: 'project', subjectId: projectId,
        reason: leaked ? 'a manager reply referred to private assessment material and was withheld' : 'no valid manager reply (gateway refusal, budget or provider error)', payload: { status: out.status, rejected: out.rejected } });
    });
    return this.view(userId, projectId);
  }

  /** The ASSIGNED reviewer reads the conversation of the work under review, up to the submission. */
  async forReviewItem(reviewerId: string, itemId: string) {
    if (!UUID.test(itemId)) throw new NotFoundException('review item not found');
    return this.db.asService(async (c) => {
      const item = (await c.query(`select q.assigned_to, s.project_id, s.created_at as submitted_at from review_queue_item q join evaluation e on e.id = q.evaluation_id
                                    join submission s on s.id = e.submission_id where q.id = $1`, [itemId])).rows[0];
      if (!item) throw new NotFoundException('review item not found');
      if (item.assigned_to !== reviewerId) throw new ForbiddenException('this item is assigned to another reviewer');
      const turns = (await this.turns(c, item.project_id)).filter((t) => t.createdAt <= new Date(item.submitted_at).toISOString());
      await emitAuditEvent(c, { eventType: 'manager.reviewer_read', userId: null, actorKind: 'human_reviewer', actorId: reviewerId, rolePerformed: 'human_reviewer',
        subjectTable: 'project', subjectId: item.project_id, reason: 'an assigned reviewer read the virtual-manager conversation of the work under review', payload: { reviewItemId: itemId, turns: turns.length } });
      return { labelAr: MANAGER_LABEL_AR, notScoredAr: MANAGER_NOT_SCORED_AR, turns };
    });
  }
}
