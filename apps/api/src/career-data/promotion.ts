/**
 * Demo → canonical promotion (OPEN-040).
 *
 * A DEMO row is never mutated into approved content. `promote` creates a
 * non-demo REVIEW COPY (new id, same code, `promoted_from_id` → demo row,
 * review_status = curated) plus its children, and opens a content_promotion
 * record. The copy then walks the ordinary review workflow (content author →
 * SME → product owner). When it publishes, `completePromotion` marks the demo
 * row superseded and closes the record with reviewer, decisions, corrections,
 * approval time and the canonical id/version. The demo row stays demo, readable
 * for ever.
 */
import type { Pool, PoolClient } from 'pg';
import { assertPromotionAllowed } from '@naqla/domain';

interface KindSpec { table: string; status: string; code: string; children: { table: string; fk: string; remap?: Record<string, string> }[] }
const KINDS: Record<string, KindSpec> = {
  skill: { table: 'skill', status: 'review_status', code: 'slug', children: [] },
  skill_family: { table: 'skill_family', status: 'review_status', code: 'code', children: [] },
  recency_policy: { table: 'recency_policy', status: 'review_status', code: 'code', children: [] },
  proficiency_scale: { table: 'proficiency_scale', status: 'review_status', code: 'code', children: [{ table: 'proficiency_level', fk: 'scale_id' }] },
  criterion_library: { table: 'criterion_library', status: 'review_status', code: 'key', children: [] },
  data_source: { table: 'data_source', status: 'review_status', code: 'code', children: [] },
  target_role: { table: 'target_role', status: 'review_status', code: 'slug', children: [{ table: 'role_tool', fk: 'target_role_id', remap: { skill_id: 'skill' } }, { table: 'role_requirement', fk: 'target_role_id', remap: { skill_id: 'skill' } }] },
  task: { table: 'task', status: 'review_status', code: 'code', children: [{ table: 'task_skill', fk: 'task_id', remap: { skill_id: 'skill' } }] },
  activity_spec: { table: 'activity_spec', status: 'status', code: 'slug', children: [
    { table: 'activity_input', fk: 'activity_spec_id' }, { table: 'activity_deliverable', fk: 'activity_spec_id' }, { table: 'activity_skill', fk: 'activity_spec_id', remap: { skill_id: 'skill' } },
    { table: 'activity_task', fk: 'activity_spec_id', remap: { task_id: 'task' } }, { table: 'integrity_check_spec', fk: 'activity_spec_id' }, { table: 'rubric_version', fk: 'activity_spec_id' } ] },
  learning_resource: { table: 'learning_resource', status: 'review_status', code: 'code', children: [] },
  career_presentation_rule: { table: 'career_presentation_rule', status: 'review_status', code: 'asset_type', children: [] },
};
const SKIP_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'review_status', 'status', 'reviewed_by', 'reviewed_at', 'published_at', 'sme_approved_by', 'sme_approved_at', 'is_demo_fixture', 'promoted_from_id', 'version']);

async function columns(c: PoolClient, table: string): Promise<string[]> {
  const { rows } = await c.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [table]);
  return rows.map((r) => r.column_name as string);
}

/** Prefers the CANONICAL row with the same code; falls back to the demo id (flagged by quality rule Q19). */
async function canonicalOf(c: PoolClient, kind: string, demoId: string): Promise<string> {
  const spec = KINDS[kind]!;
  const { rows } = await c.query(`select c.id from ${spec.table} d join ${spec.table} c on c.${spec.code} = d.${spec.code} and c.is_demo_fixture = false and c.${spec.status} <> 'superseded' where d.id = $1`, [demoId]);
  return rows[0]?.id ?? demoId;
}

async function copyRow(c: PoolClient, table: string, sourceId: string, overrides: Record<string, unknown>, remap: Record<string, string> = {}): Promise<string> {
  const cols = (await columns(c, table)).filter((col) => !SKIP_COLUMNS.has(col));
  const src = await c.query(`select * from ${table} where id = $1`, [sourceId]);
  const row = src.rows[0];
  const values: unknown[] = []; const names: string[] = [];
  for (const col of cols) {
    let v = row[col];
    if (remap[col] && v) v = await canonicalOf(c, remap[col]!, v);
    if (col in overrides) v = overrides[col];
    names.push(col); values.push(Array.isArray(v) ? v : (v && typeof v === 'object' ? JSON.stringify(v) : v));
  }
  for (const [k, v] of Object.entries(overrides)) if (!names.includes(k)) { names.push(k); values.push(v); }
  const r = await c.query(`insert into ${table} (${names.join(', ')}) values (${names.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, values);
  return r.rows[0].id;
}

export async function promoteDemo(pool: Pool, kind: string, demoId: string, by: string, note: string | null): Promise<{ promotionId: string; canonicalId: string; copied: Record<string, number> }> {
  const spec = KINDS[kind]; if (!spec) throw new Error(`unknown kind '${kind}'`);
  const c = await pool.connect();
  try {
    await c.query('begin');
    const src = await c.query(`select id, is_demo_fixture, ${spec.status} as status from ${spec.table} where id = $1 for update`, [demoId]);
    if (src.rowCount === 0) throw new Error(`${kind} ${demoId} not found`);
    const open = await c.query(`select 1 from content_promotion where entity_kind = $1 and demo_entity_id = $2 and step not in ('published','abandoned')`, [kind, demoId]);
    assertPromotionAllowed({ sourceIsDemo: src.rows[0].is_demo_fixture, sourceStatus: src.rows[0].status, alreadyPromoted: (open.rowCount ?? 0) > 0 });
    const copied: Record<string, number> = {};
    const canonicalId = await copyRow(c, spec.table, demoId, { is_demo_fixture: false, [spec.status]: 'curated', promoted_from_id: demoId, ...(spec.table === 'activity_spec' ? { can_yield_verified: false } : {}) });
    copied[spec.table] = 1;
    for (const ch of spec.children) {
      const kids = await c.query(`select id from ${ch.table} where ${ch.fk} = $1`, [demoId]);
      for (const k of kids.rows) {
        const hasDemoFlag = (await columns(c, ch.table)).includes('is_demo_fixture');
        const hasStatus = (await columns(c, ch.table)).includes('review_status') || (await columns(c, ch.table)).includes('status');
        const statusCol = (await columns(c, ch.table)).includes('review_status') ? 'review_status' : 'status';
        const hasPromoted = (await columns(c, ch.table)).includes('promoted_from_id');
        const overrides: Record<string, unknown> = { [ch.fk]: canonicalId, ...(hasDemoFlag ? { is_demo_fixture: false } : {}), ...(hasStatus ? { [statusCol]: 'curated' } : {}), ...(hasPromoted ? { promoted_from_id: k.id } : {}) };
        const newId = await copyRow(c, ch.table, k.id, overrides, ch.remap ?? {});
        copied[ch.table] = (copied[ch.table] ?? 0) + 1;
        if (ch.table === 'rubric_version') {
          const crits = await c.query('select id from rubric_criterion where rubric_version_id = $1', [k.id]);
          for (const cr of crits.rows) {
            const newCrit = await copyRow(c, 'rubric_criterion', cr.id, { rubric_version_id: newId }, { linked_skill_id: 'skill', library_criterion_id: 'criterion_library' });
            const lv = await c.query('select id from rubric_criterion_level where criterion_id = $1', [cr.id]);
            for (const l of lv.rows) await copyRow(c, 'rubric_criterion_level', l.id, { criterion_id: newCrit });
            copied['rubric_criterion'] = (copied['rubric_criterion'] ?? 0) + 1;
          }
          await c.query(`insert into source_ref (entity_kind, entity_id, source_id) select 'rubric_version', $2, source_id from source_ref where entity_kind = 'rubric_version' and entity_id = $1 on conflict do nothing`, [k.id, newId]);
        }
      }
    }
    // Provenance travels with the copy: the same sources, plus the demo origin recorded on the promotion.
    await c.query(`insert into source_ref (entity_kind, entity_id, source_id) select entity_kind, $2, source_id from source_ref where entity_kind = $3 and entity_id = $1 on conflict do nothing`, [demoId, canonicalId, kind]);
    const promo = await c.query(`insert into content_promotion (entity_kind, demo_entity_id, canonical_entity_id, created_by, note) values ($1,$2,$3,$4,$5) returning id`, [kind, demoId, canonicalId, by, note]);
    await c.query('commit');
    return { promotionId: promo.rows[0].id, canonicalId, copied };
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

/** Records a field-level correction made on the review copy (the copy itself is edited through the ordinary content path). */
export async function recordCorrection(pool: Pool, promotionId: string, correction: { field: string; from: unknown; to: unknown; by: string; reason: string }): Promise<void> {
  await pool.query(`update content_promotion set corrections = corrections || $2::jsonb, step = case when step = 'review_copy_created' then 'corrected'::promotion_step else step end where id = $1 and step not in ('published','abandoned')`,
    [promotionId, JSON.stringify([{ ...correction, at: new Date().toISOString() }])]);
}

/**
 * Closes the promotion once the canonical copy is PUBLISHED through the review
 * workflow: the demo row becomes superseded (still demo), and the record keeps
 * reviewer, review-log ids, approval time and the canonical version.
 */
export async function completePromotion(pool: Pool, promotionId: string): Promise<{ demoSuperseded: boolean; reviewLogIds: string[] }> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const p = await c.query('select * from content_promotion where id = $1 for update', [promotionId]);
    if (p.rowCount === 0) throw new Error('promotion not found');
    const promo = p.rows[0]; const spec = KINDS[promo.entity_kind]!;
    const canon = await c.query(`select ${spec.status} as status, reviewed_by, reviewed_at, version from ${spec.table} where id = $1`, [promo.canonical_entity_id]);
    if (canon.rows[0].status !== 'published') throw new Error(`the canonical copy is ${canon.rows[0].status}; publish it through the review workflow first`);
    const log = await c.query(`select id, decided_by, decided_by_label, to_status, decided_at from review_log where entity_kind = $1 and entity_id = $2 order by decided_at`, [promo.entity_kind, promo.canonical_entity_id]);
    const approval = log.rows.find((r) => r.to_status === 'approved');
    if (!approval) throw new Error('no SME approval is recorded for the canonical copy');
    await c.query(`update ${spec.table} set ${spec.status} = 'superseded' where id = $1 and ${spec.status} <> 'superseded'`, [promo.demo_entity_id]);
    await c.query(`update content_promotion set step = 'published', reviewer_id = $2, reviewer_label = $3, review_log_ids = $4, approved_at = $5, published_at = now(), canonical_version = $6 where id = $1`,
      [promotionId, approval.decided_by, approval.decided_by_label, log.rows.map((r) => r.id), approval.decided_at, canon.rows[0].version ?? 1]);
    await c.query('commit');
    return { demoSuperseded: true, reviewLogIds: log.rows.map((r) => r.id) };
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}
