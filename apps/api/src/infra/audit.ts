import type { PoolClient } from 'pg';

/**
 * INV-8 — every meaningful act emits an event, with a reason.
 *
 * Written inside the SAME transaction as the act it records. An audit row that
 * can be committed separately from the act is an audit row that can disagree
 * with reality.
 */
export async function emitAuditEvent(
  client: PoolClient,
  e: {
    eventType: string;
    userId: string | null;
    actorKind: 'user' | 'human_reviewer' | 'system';
    actorId?: string | null;
    rolePerformed?: 'sme' | 'human_reviewer' | null;
    subjectTable: string;
    subjectId: string | null;
    reason: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `insert into audit_event
       (event_type, user_id, actor_kind, actor_id, role_performed,
        subject_table, subject_id, reason, payload)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      e.eventType, e.userId, e.actorKind, e.actorId ?? null, e.rolePerformed ?? null,
      e.subjectTable, e.subjectId, e.reason, JSON.stringify(e.payload ?? {}),
    ],
  );
}
