import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  assertAdminAction, assertFourEyes, governedStage, contentStage, trackChangeStage, assertTrackSkillProposal, diffFields, diffChildren,
  RULE_CATALOG, PENDING_EXPERT_DECISIONS, STAGE_AR, ANNOTATION_AR, TRACK_SKILL_FIELDS, CLASSIFICATION_FIELDS, CLAIM_KIND_CLASS,
  assertClaimPolicySane, assertContextPolicySane, assertQuestionnaireSane, assertReadinessRuleSetSane, readinessRuleFromRow, resolveActiveConfig,
  evidenceOrdinal, assertPackConstraintsSane,
  type AdminRole, type AdminAction, type ClaimKind, type EvidenceState, type ConfigActivation, type ReviewState, type ReviewerRole,
} from '@naqla/domain';
import { LEXICON_CLASSES as LEXICON_CLASSES_FOR_ADMIN } from '@naqla/agents';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { approveConfigRow, setConfigActivation, withConfigActor, assertActivationPermittedInPhase8 } from '../configuration/config-admin.service';
import { governedFromRow, isProduction } from '../configuration/configuration.service';
import { reviewTransition, approveRubricValues, supersedePrevious } from '../career-data/review';

export interface AdminIdentity { readonly id: string; readonly label: string; readonly roles: readonly AdminRole[] }

/* ───────────────────────────── governed kinds the Track Builder edits ───────────────────────────── */

interface GovernedKind {
  readonly table: string;
  readonly labelAr: string;
  /** Columns that define a version family (one active row per family). */
  readonly family: readonly string[];
  /** The only fields an administrator may change in a new draft version. */
  readonly editable: readonly string[];
  readonly children?: { readonly table: string; readonly fk: string; readonly fields: readonly string[]; readonly key: (r: Record<string, unknown>) => string };
  readonly activatable: boolean;
}

/** Every kind reuses its existing table, governance columns and database guard. No new engine. */
export const GOVERNED_KINDS: Readonly<Record<string, GovernedKind>> = {
  claim_policy: { table: 'claim_policy', labelAr: 'سياسات الصياغة المهنية', family: ['key', 'claim_kind'], activatable: true,
    // lock_until_grounded is NOT editable: grounding (G1+G2) is never loosened from the Track Builder.
    editable: ['min_evidence_level', 'min_evidence_count', 'min_source_strength', 'requires_verification_decision', 'description_en'] },
  readiness_rule_set: { table: 'readiness_rule_set', labelAr: 'قواعد الجاهزية', family: ['key'], activatable: true, editable: ['label_ar', 'label_en', 'description_en'],
    children: { table: 'readiness_rule', fk: 'rule_set_id', fields: ['rule_type', 'params', 'skill_id', 'label_ar', 'label_en', 'enabled', 'position'], key: (r) => `${String(r['position'])}` } },
  assessment_context_policy: { table: 'assessment_context_policy', labelAr: 'سياق التقييم', family: ['key'], activatable: true, editable: ['inputs', 'description_en'] },
  verification_policy: { table: 'verification_policy', labelAr: 'سياسة التحقق (إعداد التقييم)', family: ['key'], activatable: true,
    editable: ['min_assessment_confidence', 'min_independent_evidence', 'description_en'] },
  disclosure_questionnaire: { table: 'disclosure_questionnaire', labelAr: 'إفصاح استخدام الذكاء الاصطناعي', family: ['key'], activatable: true,
    editable: ['label_ar', 'label_en', 'intro_ar', 'description_en'],
    children: { table: 'disclosure_question', fk: 'questionnaire_id', fields: ['key', 'position', 'prompt_ar', 'prompt_en', 'help_ar', 'answer_type', 'options', 'required', 'show_if', 'maps_to'], key: (r) => String(r['key']) } },
  challenge_policy: { table: 'challenge_policy', labelAr: 'تحديات التحقق (تعريف فقط)', family: ['key'], activatable: false,
    editable: ['description_en', 'challenge_types', 'max_challenges', 'timing', 'difficulty', 'skill_ids', 'trigger_rule'] },
  // Phase 9 (H5): the numeric pack constraints. Closed vocabulary; every type stated exactly once; a new kind of rule is an extension, not a row.
  pack_constraint_set: { table: 'pack_constraint_set', labelAr: 'قيود بنية حزمة المسار', family: ['key'], activatable: true, editable: ['label_ar', 'label_en', 'description_en', 'track_id'],
    children: { table: 'pack_constraint', fk: 'set_id', fields: ['constraint_type', 'min_value', 'max_value'], key: (r) => String(r['constraint_type']) } },
  grounding_lexicon: { table: 'grounding_lexicon', labelAr: 'مفردات التحقق من الصياغة', family: ['key'], activatable: true, editable: ['description_en'],
    children: { table: 'grounding_lexicon_entry', fk: 'lexicon_id', fields: ['language', 'cls', 'form'], key: (r) => `${String(r['language'])}|${String(r['cls'])}|${String(r['form'])}` } },
};
const GOVERNANCE_COLUMNS = new Set(['id', 'version', 'review_status', 'approved_by', 'approved_at', 'validation_note_en', 'activation', 'baseline_of', 'activated_at', 'deactivated_at',
  'created_at', 'updated_at', 'drafted_by', 'created_by']);

function kindOf(kind: string): GovernedKind {
  const k = GOVERNED_KINDS[kind];
  if (!k) throw new NotFoundException(`'${kind}' is not a configuration kind the Track Builder manages`);
  return k;
}

const stageView = (s: { stage: keyof typeof STAGE_AR; annotation: keyof typeof ANNOTATION_AR | null }) =>
  ({ stage: s.stage, stageAr: STAGE_AR[s.stage], annotation: s.annotation, annotationAr: s.annotation ? ANNOTATION_AR[s.annotation] : null });

/**
 * Admin Track Builder (Phase 8, D-116). Every act: checks the caller's role
 * here (backend authorisation), runs through the existing service and the
 * database guard, and writes an audit event in the same transaction.
 */
@Injectable()
export class AdminService {
  constructor(private readonly db: DbService) {}

  /** Active grants of the three Track Builder roles. Grants are operator acts; nobody grants themself. */
  async identity(userId: string): Promise<AdminIdentity> {
    return this.db.asService(async (c) => {
      const g = await c.query(`select role_performed::text as r from reviewer_grant where user_id = $1 and revoked_at is null and role_performed::text in ('track_admin','sme','product_owner')`, [userId]);
      const u = await c.query('select display_name from app_user where id = $1', [userId]);
      return { id: userId, label: String(u.rows[0]?.display_name ?? userId), roles: g.rows.map((r) => r.r as AdminRole) };
    });
  }

  private authorise(who: AdminIdentity, action: AdminAction): AdminRole {
    try { return assertAdminAction(action, who.roles); } catch (e) { throw new ForbiddenException((e as Error).message); }
  }

  private async audit(c: PoolClient, who: AdminIdentity, role: AdminRole, eventType: string, subjectTable: string, subjectId: string | null, reason: string, payload: Record<string, unknown> = {}) {
    await emitAuditEvent(c, { eventType: `admin.${eventType}`, userId: who.id, actorKind: 'user', actorId: who.id, rolePerformed: role, subjectTable, subjectId, reason, payload: { ...payload, actorLabel: who.label } });
  }

  /* ───────────────────────────── overview ───────────────────────────── */

  async overview(who: AdminIdentity) {
    this.authorise(who, 'read');
    return this.db.asService(async (c) => {
      const kinds = [];
      for (const [kind, k] of Object.entries(GOVERNED_KINDS)) {
        const rows = (await c.query(`select review_status::text, activation, activated_at from ${k.table}`)).rows;
        const counts: Record<string, number> = {};
        for (const r of rows) { const s = governedStage({ reviewStatus: r.review_status, activation: r.activation, activatedAt: r.activated_at }); counts[s.stage] = (counts[s.stage] ?? 0) + 1; }
        kinds.push({ kind, labelAr: k.labelAr, counts, activatable: k.activatable });
      }
      const tracks = (await c.query('select id, slug, label_ar, label_en, review_status::text, is_demo_fixture from target_role order by is_demo_fixture, slug')).rows
        .map((r) => ({ id: r.id, slug: r.slug, labelAr: r.label_ar, labelEn: r.label_en, isDemo: r.is_demo_fixture, ...stageView(contentStage(r.review_status)) }));
      const pendingChanges = Number((await c.query(`select count(*)::int as n from track_skill_change where status in ('draft','pending_review')`)).rows[0].n);
      return { me: { id: who.id, label: who.label, roles: who.roles }, production: isProduction(), kinds, tracks, pendingChanges,
        pendingExpertDecisions: PENDING_EXPERT_DECISIONS,
        separationAr: 'المسؤول يصوغ المسودات ويرسلها للمراجعة؛ الخبير المسمّى يعتمد المحتوى المهني؛ مالك المنتج يفعّل وينشر ما اعتُمد. صلاحية التعديل ليست صلاحية اعتماد مهني.' };
    });
  }

  /* ───────────────────────────── governed configuration ───────────────────────────── */

  async listGoverned(who: AdminIdentity, kind: string) {
    this.authorise(who, 'read');
    const k = kindOf(kind);
    return this.db.asService(async (c) => {
      const rows = (await c.query(`select * from ${k.table} order by ${k.family.join(', ')}, version`)).rows;
      const inEffect = new Map<string, string>();
      const families = new Map<string, Record<string, unknown>[]>();
      for (const r of rows) { const f = k.family.map((col) => String(r[col])).join('|'); families.set(f, [...(families.get(f) ?? []), r]); }
      for (const [f, rs] of families) { const res = resolveActiveConfig(rs.map(governedFromRow), { production: isProduction() }); if (res.row) inEffect.set(f, res.row.id); }
      return { kind, labelAr: k.labelAr, activatable: k.activatable, editable: k.editable,
        help: Object.fromEntries(Object.entries(RULE_CATALOG).filter(([key]) => key.startsWith(`${k.table}.`))),
        items: rows.map((r) => ({ id: r.id, family: k.family.map((col) => String(r[col])).join(' · '), key: r.key, version: Number(r.version), reviewStatus: r.review_status, activation: r.activation,
          baselineOf: r.baseline_of, approvedBy: r.approved_by, draftedBy: r.drafted_by, inEffect: inEffect.get(k.family.map((col) => String(r[col])).join('|')) === r.id,
          validationNote: r.validation_note_en, ...stageView(governedStage({ reviewStatus: r.review_status, activation: r.activation, activatedAt: r.activated_at })),
          values: Object.fromEntries(k.editable.map((f) => [f, r[f]])) })) };
    });
  }

  private async loadWithChildren(c: PoolClient, k: GovernedKind, id: string) {
    const row = (await c.query(`select * from ${k.table} where id = $1`, [id])).rows[0];
    if (!row) throw new NotFoundException(`${k.table} ${id} not found`);
    const children = k.children ? (await c.query(`select ${k.children.fields.join(', ')} from ${k.children.table} where ${k.children.fk} = $1 order by 1, 2`, [id])).rows : [];
    return { row, children };
  }

  /** Preview: the draft against the row in effect for its family (else its previous version) — fields and child rows. Shown before approval and before activation. */
  async diffGoverned(who: AdminIdentity, kind: string, id: string) {
    this.authorise(who, 'read');
    const k = kindOf(kind);
    return this.db.asService(async (c) => {
      const { row, children } = await this.loadWithChildren(c, k, id);
      const fam = (await c.query(`select * from ${k.table} where ${k.family.map((col, i) => `${col} = $${i + 1}`).join(' and ')}`, k.family.map((col) => row[col]))).rows;
      const res = resolveActiveConfig(fam.map(governedFromRow), { production: isProduction() });
      // Compared with the row in effect for the family; when none is in effect (e.g. a family whose first version was never
      // activated), with the previous version of the same family, so the preview still shows only what this draft changes.
      const prev = fam.filter((r) => Number(r.version) < Number(row.version)).sort((a, b) => Number(b.version) - Number(a.version))[0];
      const baseId = res.row && res.row.id !== id ? res.row.id : !res.row && prev ? String(prev.id) : null;
      const base = baseId ? await this.loadWithChildren(c, k, baseId) : null;
      return {
        kind, id, version: Number(row.version),
        comparedWith: base ? { id: base.row.id, version: Number(base.row.version), basis: res.row ? 'in_effect' : 'previous_version', resolution: res.row ? res.resolution : null } : null,
        fields: diffFields(base?.row ?? null, row, k.editable).map((d) => ({ ...d, help: RULE_CATALOG[`${k.table}.${d.field}`] ?? null })),
        children: k.children ? diffChildren(base?.children ?? [], children, k.children.key) : null,
        rows: k.children ? children : null,
        childrenHelp: k.children ? RULE_CATALOG[`${k.table}.${k.table === 'readiness_rule_set' ? 'rules' : k.table === 'disclosure_questionnaire' ? 'questions' : k.table === 'pack_constraint_set' ? 'constraints' : 'entries'}`] ?? null : null,
        ...stageView(governedStage({ reviewStatus: row.review_status, activation: row.activation, activatedAt: row.activated_at })),
      };
    });
  }

  /**
   * A NEW draft version (inactive) from an existing one, with the administrator's
   * edits. The existing row is never changed. Children are copied and may be
   * replaced. The table's own sanity rules run before anything is written.
   */
  async createDraftVersion(who: AdminIdentity, kind: string, p: { baseId: string; changes: Record<string, unknown>; children?: Record<string, unknown>[] | null; reason: string }) {
    const role = this.authorise(who, 'draft');
    const k = kindOf(kind);
    if (!p.reason?.trim()) throw new BadRequestException('a draft needs a written reason');
    for (const f of Object.keys(p.changes ?? {})) if (!k.editable.includes(f)) throw new BadRequestException(`'${f}' is not editable on ${k.table} in the Track Builder`);
    if (k.children === undefined && p.children) throw new BadRequestException(`${k.table} has no child rows`);
    return this.db.asService(async (c) => {
      const base = await this.loadWithChildren(c, k, p.baseId);
      const cols = (await c.query(`select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [k.table])).rows as { column_name: string; data_type: string }[];
      const next: Record<string, unknown> = {};
      for (const col of cols) if (!GOVERNANCE_COLUMNS.has(col.column_name)) next[col.column_name] = base.row[col.column_name];
      Object.assign(next, p.changes ?? {});
      const children = p.children ?? base.children;
      this.checkGovernedRow(k, next, children);
      const famWhere = k.family.map((col, i) => `${col} = $${i + 1}`).join(' and ');
      const version = Number((await c.query(`select coalesce(max(version), 0) + 1 as v from ${k.table} where ${famWhere}`, k.family.map((col) => base.row[col]))).rows[0].v);
      next['version'] = version; next['drafted_by'] = who.id;
      if (cols.some((col) => col.column_name === 'created_by')) next['created_by'] = `${who.label} (track builder)`;
      const jsonCols = new Set(cols.filter((col) => col.data_type === 'jsonb').map((col) => col.column_name));
      const names = Object.keys(next);
      const ins = await c.query(`insert into ${k.table} (${names.join(', ')}) values (${names.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
        names.map((n) => (jsonCols.has(n) && next[n] !== null ? JSON.stringify(next[n]) : next[n])));
      const id = ins.rows[0].id as string;
      if (k.children) {
        const childJson = new Set((await c.query(`select column_name from information_schema.columns where table_name = $1 and data_type = 'jsonb'`, [k.children.table])).rows.map((r) => r.column_name));
        for (const ch of children) {
          const f = k.children.fields.filter((x) => ch[x] !== undefined);
          await c.query(`insert into ${k.children.table} (${k.children.fk}, ${f.join(', ')}) values ($1, ${f.map((_, i) => `$${i + 2}`).join(', ')})`,
            [id, ...f.map((x) => (childJson.has(x) && ch[x] !== null ? JSON.stringify(ch[x]) : ch[x]))]);
        }
      }
      await this.audit(c, who, role, 'draft_version_created', k.table, id, p.reason.trim(), { kind, baseId: p.baseId, version, changes: p.changes, childrenReplaced: !!p.children });
      return { id, kind, version, stage: 'draft' };
    });
  }

  private checkGovernedRow(k: GovernedKind, row: Record<string, unknown>, children: Record<string, unknown>[]) {
    try {
      if (k.table === 'claim_policy') {
        assertClaimPolicySane({ id: 'x', key: String(row['key']), version: 1, reviewStatus: 'draft', activation: 'inactive', baselineOf: null, approvedBy: null, claimKind: row['claim_kind'] as ClaimKind,
          minEvidenceLevel: row['min_evidence_level'] as EvidenceState, minEvidenceCount: row['min_evidence_count'] === null ? null : Number(row['min_evidence_count']),
          minSourceStrength: (row['min_source_strength'] as never) ?? null, requiresVerificationDecision: row['requires_verification_decision'] === true, requiresUserApproval: true, lockUntilGrounded: row['lock_until_grounded'] !== false });
        if (row['lock_until_grounded'] === false) throw new Error('a claim policy that does not require grounding cannot be drafted: evidence grounding is never loosened');
        if (CLAIM_KIND_CLASS[row['claim_kind'] as ClaimKind] === 'skill_assertion' && evidenceOrdinal(row['min_evidence_level'] as EvidenceState) < evidenceOrdinal('demonstrated')) {
          throw new Error(`a '${String(row['claim_kind'])}' below demonstrated is a pending expert and Product Owner decision (e.g. CV bullet at Practiced); it cannot be drafted in the Track Builder`);
        }
      }
      if (k.table === 'assessment_context_policy') assertContextPolicySane(row['inputs']);
      if (k.table === 'verification_policy') {
        const conf = row['min_assessment_confidence']; const ind = row['min_independent_evidence'];
        if (conf !== null && (typeof conf !== 'number' && typeof conf !== 'string' || Number(conf) < 0 || Number(conf) > 1)) throw new Error('min_assessment_confidence must be between 0 and 1');
        if (ind !== null && (!Number.isInteger(Number(ind)) || Number(ind) < 1)) throw new Error('min_independent_evidence must be a positive integer');
      }
      if (k.table === 'challenge_policy') {
        if (row['max_challenges'] !== null && (!Number.isInteger(Number(row['max_challenges'])) || Number(row['max_challenges']) < 1)) throw new Error('max_challenges must be a positive integer');
        if (row['trigger_rule'] !== null && (typeof row['trigger_rule'] !== 'object' || Array.isArray(row['trigger_rule']))) throw new Error('trigger_rule must be an object (it is stored, never interpreted)');
      }
      if (k.table === 'readiness_rule_set') {
        assertReadinessRuleSetSane({ id: 'x', key: String(row['key']), version: 1, reviewStatus: 'draft', activation: 'inactive', baselineOf: null, approvedBy: null, targetRoleId: (row['target_role_id'] as string | null) ?? null,
          labelAr: String(row['label_ar']), labelEn: String(row['label_en']),
          rules: children.map((r, i) => readinessRuleFromRow({ id: `r${i}`, rule_type: r['rule_type'], params: r['params'] ?? {}, skill_id: r['skill_id'] ?? null, label_ar: r['label_ar'], label_en: r['label_en'], enabled: r['enabled'] ?? true, position: r['position'] ?? i } as Parameters<typeof readinessRuleFromRow>[0])) });
      }
      if (k.table === 'disclosure_questionnaire') {
        assertQuestionnaireSane({ key: String(row['key']), version: 1, questions: children.map((q, i) => ({ id: `q${i}`, key: String(q['key']), position: Number(q['position']), promptAr: String(q['prompt_ar']),
          promptEn: String(q['prompt_en']), helpAr: (q['help_ar'] as string | null) ?? null, answerType: q['answer_type'] as never, options: (q['options'] as never) ?? [], required: q['required'] === true,
          showIf: (q['show_if'] as never) ?? {}, mapsTo: (q['maps_to'] as never) ?? null })) });
      }
      if (k.table === 'pack_constraint_set') {
        if (row['track_id'] !== null && row['track_id'] !== undefined && !String(row['track_id']).trim()) throw new Error('track_id is a track identifier, or empty for every track');
        assertPackConstraintsSane(children.map((x) => ({ type: String(x['constraint_type']), min: x['min_value'] === null || x['min_value'] === undefined ? null : Number(x['min_value']),
          max: x['max_value'] === null || x['max_value'] === undefined ? null : Number(x['max_value']) })));
      }
      if (k.table === 'grounding_lexicon') {
        for (const e of children) if (!['ar', 'en'].includes(String(e['language'])) || !(LEXICON_CLASSES_FOR_ADMIN as readonly string[]).includes(String(e['cls'])) || !String(e['form'] ?? '').trim()) {
          throw new Error(`invalid vocabulary entry ${JSON.stringify(e)}`);
        }
      }
    } catch (e) { throw new BadRequestException((e as Error).message); }
  }

  /** Draft → pending review (curated). By the drafting side. */
  async submitGoverned(who: AdminIdentity, kind: string, id: string, reason: string) {
    const role = this.authorise(who, 'submit');
    const k = kindOf(kind);
    return this.db.asService(async (c) => {
      const row = (await c.query(`select review_status::text, activation from ${k.table} where id = $1 for update`, [id])).rows[0];
      if (!row) throw new NotFoundException('not found');
      if (!['draft', 'needs_revision'].includes(row.review_status) || row.activation !== 'inactive') throw new BadRequestException(`only an inactive draft is submitted for review (this one is ${row.review_status}/${row.activation})`);
      await withConfigActor(c, `${who.label} (${who.id})`, reason, () => c.query(`update ${k.table} set review_status = 'curated' where id = $1`, [id]));
      await this.audit(c, who, role, 'submitted_for_review', k.table, id, reason);
      return { id, stage: 'pending_review' };
    });
  }

  /** SME decision: approve (named, four eyes — the database checks too), needs revision, or reject. */
  async validateGoverned(who: AdminIdentity, kind: string, id: string, p: { decision: 'approve' | 'needs_revision' | 'reject'; reason: string }) {
    const role = this.authorise(who, 'validate');
    const k = kindOf(kind);
    if (!p.reason?.trim()) throw new BadRequestException('a validation decision needs a written reason');
    return this.db.asService(async (c) => {
      const row = (await c.query(`select review_status::text, drafted_by from ${k.table} where id = $1 for update`, [id])).rows[0];
      if (!row) throw new NotFoundException('not found');
      if (!['curated', 'sme_reviewed'].includes(row.review_status)) throw new BadRequestException(`only a submitted version is validated (this one is ${row.review_status})`);
      try { assertFourEyes(row.drafted_by, who.id); } catch (e) { throw new ForbiddenException((e as Error).message); }
      if (p.decision === 'approve') {
        await approveConfigRow(c, { table: k.table, id, approvedBy: who.id, approvedByLabel: who.label, reason: p.reason });
      } else {
        await withConfigActor(c, `${who.label} (${who.id})`, p.reason, () => c.query(`update ${k.table} set review_status = $2 where id = $1`, [id, p.decision === 'reject' ? 'rejected' : 'needs_revision']));
      }
      await this.audit(c, who, role, `validated_${p.decision}`, k.table, id, p.reason);
      return { id, decision: p.decision };
    });
  }

  /**
   * Product owner: activation through the ONE activation service (and its
   * hooks: claim policies re-check approved assets, vocabulary re-grounds them,
   * Track Builder versions apply their snapshot — all in this transaction).
   * Replacing the row in effect for the family is one atomic act.
   */
  async activateGoverned(who: AdminIdentity, kind: string, id: string, p: { activation: ConfigActivation; reason: string }) {
    const role = this.authorise(who, 'activate');
    const k = kindOf(kind);
    if (!k.activatable && p.activation !== 'inactive') throw new BadRequestException(`${k.labelAr}: activation is not available in this phase`);
    return this.activateIn(who, role, k.table, id, p.activation, p.reason, kind);
  }

  private async activateIn(who: AdminIdentity, role: AdminRole, table: string, id: string, activation: ConfigActivation, reason: string, kind: string) {
    if (!reason?.trim()) throw new BadRequestException('an activation needs a written reason');
    if (!['inactive', 'development_only', 'production_active'].includes(activation)) throw new BadRequestException('activation must be inactive, development_only or production_active');
    return this.db.asService(async (c) => {
      const row = (await c.query(`select * from ${table} where id = $1 for update`, [id])).rows[0];
      if (!row) throw new NotFoundException('not found');
      const actor = `${who.label} (${who.id})`;
      let replaced: string | null = null;
      if (activation !== 'inactive') {
        // Separation of duties on the EFFECTIVE identity, whatever roles it holds: whoever drafted or approved
        // this row (or a change it carries) cannot also put it into effect. Deactivation stays open (a safety act).
        await this.assertIndependentActivator(c, who, table, row);
        await c.query("select set_config('naqla.config_actor_id', $1, true)", [who.id]); // the database checks it too
        assertActivationPermittedInPhase8(table, row, isProduction() || activation === 'production_active');
        // The row in effect for the SAME scope is replaced; a different scope (another track, or the global set) is never touched.
        const scope = table === 'track_config_version' ? ['target_role_id'] : table === 'claim_policy' ? ['key', 'claim_kind'] : table === 'pack_constraint_set' ? ['key', 'track_id']
          : table === 'readiness_rule_set' ? ['key', 'target_role_id'] : ['key'];
        const clash = (await c.query(`select id from ${table} where ${scope.map((col, i) => `${col} is not distinct from $${i + 2}`).join(' and ')} and id <> $1 and activation <> 'inactive'`, [id, ...scope.map((col) => row[col])])).rows[0];
        if (clash) { await setConfigActivation(c, { table, id: clash.id, activation: 'inactive', actor, reason: `replaced by ${id}: ${reason}` }); replaced = clash.id; }
      }
      const g = await setConfigActivation(c, { table, id, activation, actor, reason });
      await this.audit(c, who, role, 'activation_changed', table, id, reason, { kind, activation, replaced });
      return { id, activation: g.activation, replaced };
    });
  }

  private async assertIndependentActivator(c: PoolClient, who: AdminIdentity, table: string, row: Record<string, unknown>) {
    if (row['drafted_by'] && String(row['drafted_by']) === who.id) throw new ForbiddenException('separation of duties: you drafted this version; another product owner must activate it');
    if (row['approved_by'] && String(row['approved_by']) === who.id) throw new ForbiddenException('separation of duties: you approved this version; another product owner must activate it');
    if (table === 'track_config_version') {
      const mine = await c.query(`select 1 from track_skill_change where included_in_version_id = $1 and (drafted_by = $2 or decided_by = $2) limit 1`, [row['id'], who.id]);
      if (mine.rowCount) throw new ForbiddenException('separation of duties: you drafted or decided a change this version carries; another product owner must activate it');
    }
  }

  /* ───────────────────────────── track builder: track-skill changes and versions ───────────────────────────── */

  async track(who: AdminIdentity, roleId: string) {
    this.authorise(who, 'read');
    return this.db.asService(async (c) => {
      const role = (await c.query('select id, slug, label_ar, label_en, review_status::text, is_demo_fixture from target_role where id = $1', [roleId])).rows[0];
      if (!role) throw new NotFoundException('track not found');
      const skills = (await c.query(
        `select rr.id, rr.skill_id, s.label_ar, s.label_en, rr.is_core, rr.importance::text, rr.expected_level::text, rr.minimum_evidence_count, rr.readiness_contribution, rr.enabled,
                rr.display_order, rr.category, rr.classification_status, rr.review_status::text
           from role_requirement rr join skill s on s.id = rr.skill_id where rr.target_role_id = $1 order by rr.display_order nulls last, s.label_en`, [roleId])).rows;
      const changes = (await c.query(`select * from track_skill_change where target_role_id = $1 order by drafted_at desc`, [roleId])).rows;
      const versions = (await c.query(`select id, version, label, review_status::text, activation, activated_at, baseline_of, drafted_by, applies_skill_config, created_at from track_config_version where target_role_id = $1 order by version`, [roleId])).rows;
      const res = resolveActiveConfig((await c.query('select * from track_config_version where target_role_id = $1', [roleId])).rows.map(governedFromRow), { production: isProduction() });
      return {
        track: { id: role.id, slug: role.slug, labelAr: role.label_ar, labelEn: role.label_en, isDemo: role.is_demo_fixture, ...stageView(contentStage(role.review_status)) },
        fieldHelp: Object.fromEntries(Object.keys(TRACK_SKILL_FIELDS).map((f) => [f, RULE_CATALOG[`role_requirement.${f}`] ?? null])),
        skills: skills.map((s) => ({ roleRequirementId: s.id, skillId: s.skill_id, labelAr: s.label_ar, labelEn: s.label_en,
          values: { is_core: s.is_core, importance: s.importance, expected_level: s.expected_level, minimum_evidence_count: s.minimum_evidence_count, readiness_contribution: s.readiness_contribution,
            enabled: s.enabled, display_order: s.display_order, category: s.category },
          classificationStatus: s.classification_status, classificationPending: s.classification_status !== 'approved', ...stageView(contentStage(s.review_status)) })),
        changes: changes.map((ch) => ({ id: ch.id, roleRequirementId: ch.role_requirement_id, proposed: ch.proposed, base: ch.base, professional: ch.professional, status: ch.status,
          reason: ch.reason, draftedBy: ch.drafted_by, decidedBy: ch.decided_by, decidedRole: ch.decided_role, decisionReason: ch.decision_reason, includedIn: ch.included_in_version_id, ...stageView(trackChangeStage(ch.status)) })),
        versions: versions.map((v) => ({ id: v.id, version: Number(v.version), label: v.label, appliesSkillConfig: v.applies_skill_config, draftedBy: v.drafted_by, inEffect: res.row?.id === v.id,
          ...stageView(governedStage({ reviewStatus: v.review_status, activation: v.activation, activatedAt: v.activated_at })) })),
      };
    });
  }

  async proposeSkillChange(who: AdminIdentity, roleId: string, p: { roleRequirementId: string; proposed: Record<string, unknown>; reason: string }) {
    const role = this.authorise(who, 'draft');
    if (!p.reason?.trim()) throw new BadRequestException('a change needs a written reason');
    let professional: boolean;
    try { ({ professional } = assertTrackSkillProposal(p.proposed ?? {})); } catch (e) { throw new BadRequestException((e as Error).message); }
    return this.db.asService(async (c) => {
      const rr = (await c.query('select * from role_requirement where id = $1 and target_role_id = $2', [p.roleRequirementId, roleId])).rows[0];
      if (!rr) throw new NotFoundException('track skill not found on this track');
      const base = Object.fromEntries(Object.keys(p.proposed).map((f) => [f, rr[f]]));
      const r = await c.query(`insert into track_skill_change (target_role_id, role_requirement_id, proposed, base, professional, reason, drafted_by) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [roleId, p.roleRequirementId, JSON.stringify(p.proposed), JSON.stringify(base), professional, p.reason.trim(), who.id]);
      await this.audit(c, who, role, 'track_skill_change_drafted', 'track_skill_change', r.rows[0].id, p.reason.trim(), { proposed: p.proposed, base, professional });
      return { id: r.rows[0].id, professional, stage: 'draft' };
    });
  }

  async changeTransition(who: AdminIdentity, changeId: string, p: { to: 'pending_review' | 'approved' | 'rejected' | 'withdrawn'; reason: string }) {
    if (!p.reason?.trim()) throw new BadRequestException('a decision needs a written reason');
    return this.db.asService(async (c) => {
      const ch = (await c.query('select * from track_skill_change where id = $1 for update', [changeId])).rows[0];
      if (!ch) throw new NotFoundException('change not found');
      let role: AdminRole;
      if (p.to === 'pending_review' || p.to === 'withdrawn') {
        role = this.authorise(who, p.to === 'pending_review' ? 'submit' : 'draft');
        if (ch.drafted_by !== who.id) throw new ForbiddenException('only the person who drafted a change submits or withdraws it');
        await c.query('update track_skill_change set status = $2 where id = $1', [changeId, p.to]);
      } else {
        role = this.authorise(who, ch.professional ? 'validate' : 'approve_operational');
        try { assertFourEyes(ch.drafted_by, who.id); } catch (e) { throw new ForbiddenException((e as Error).message); }
        if (ch.status !== 'pending_review') throw new BadRequestException(`only a submitted change is decided (this one is ${ch.status})`);
        await c.query(`update track_skill_change set status = $2, decided_by = $3, decided_role = $4, decided_at = now(), decision_reason = $5 where id = $1`,
          [changeId, p.to, who.id, role === 'product_owner' ? 'product_owner' : 'sme', p.reason.trim()]);
      }
      await this.audit(c, who, role, `track_skill_change_${p.to}`, 'track_skill_change', changeId, p.reason.trim());
      return { id: changeId, status: p.to };
    });
  }

  /**
   * A new DRAFT track configuration version from the live TrackSkill rows with
   * every approved change overlaid. Nothing live changes here; the snapshot
   * becomes live only when a product owner activates this version (after a
   * named SME approves the version). Classification becomes "approved" only
   * where a named SME approved a change to it; everything else stays pending.
   */
  async buildTrackVersion(who: AdminIdentity, roleId: string, p: { label: string; reason: string }) {
    const role = this.authorise(who, 'draft');
    if (!p.reason?.trim()) throw new BadRequestException('a version needs a written reason');
    return this.db.asService(async (c) => {
      const changes = (await c.query(`select * from track_skill_change where target_role_id = $1 and status = 'approved' order by decided_at`, [roleId])).rows;
      if (changes.length === 0) throw new BadRequestException('there are no approved track-skill changes to build a version from');
      const snapshot = (await c.query('select track_skill_config_snapshot($1) as s', [roleId])).rows[0].s as Record<string, unknown>[];
      for (const ch of changes) {
        const el = snapshot.find((s) => s['role_requirement_id'] === ch.role_requirement_id);
        if (!el) throw new BadRequestException(`change ${ch.id}: its track skill is no longer on this track`);
        Object.assign(el, ch.proposed);
        const touchesClass = Object.keys(ch.proposed).some((f) => (CLASSIFICATION_FIELDS as readonly string[]).includes(f));
        if (touchesClass && ch.decided_role === 'sme') { el['classification_status'] = 'approved'; el['classification_reviewed_by'] = ch.decided_by; el['classification_reviewed_at'] = ch.decided_at; }
      }
      const prev = (await c.query(`select * from track_config_version where target_role_id = $1 and activation <> 'inactive' order by version desc limit 1`, [roleId])).rows[0]
        ?? (await c.query(`select * from track_config_version where target_role_id = $1 order by version desc limit 1`, [roleId])).rows[0];
      if (!prev) throw new BadRequestException('this track has no configuration version to build on');
      const next = Number((await c.query('select coalesce(max(version), 0) + 1 as v from track_config_version where target_role_id = $1', [roleId])).rows[0].v);
      const ins = await c.query(
        `insert into track_config_version (target_role_id, version, label, pack_version, verification_policy_id, assessment_context_policy_id, claim_policy_ref, challenge_policy_id, readiness_rule_set_id,
            progress_rules_version, skill_config_snapshot, notes_en, created_by, drafted_by, applies_skill_config)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true) returning id`,
        [roleId, next, p.label || `track builder v${next}`, prev.pack_version, prev.verification_policy_id, prev.assessment_context_policy_id, prev.claim_policy_ref, prev.challenge_policy_id, prev.readiness_rule_set_id,
         prev.progress_rules_version, JSON.stringify(snapshot), p.reason.trim(), `${who.label} (track builder)`, who.id]);
      const id = ins.rows[0].id as string;
      await c.query(`update track_skill_change set status = 'included', included_in_version_id = $2 where id = any($1::uuid[])`, [changes.map((ch) => ch.id), id]);
      await this.audit(c, who, role, 'track_version_built', 'track_config_version', id, p.reason.trim(), { version: next, changes: changes.map((ch) => ch.id) });
      return { id, version: next, includedChanges: changes.length };
    });
  }

  /** Preview of a track version against the version in effect (or the live rows when none is): per skill, per field. */
  async trackVersionDiff(who: AdminIdentity, versionId: string) {
    this.authorise(who, 'read');
    return this.db.asService(async (c) => {
      const v = (await c.query('select * from track_config_version where id = $1', [versionId])).rows[0];
      if (!v) throw new NotFoundException('version not found');
      const all = (await c.query('select * from track_config_version where target_role_id = $1', [v.target_role_id])).rows;
      const res = resolveActiveConfig(all.map(governedFromRow), { production: isProduction() });
      const base = res.row && res.row.id !== versionId ? all.find((r) => r.id === res.row!.id) : null;
      const baseSnap = (base?.skill_config_snapshot ?? (await c.query('select track_skill_config_snapshot($1) as s', [v.target_role_id])).rows[0].s) as Record<string, unknown>[];
      const labels = new Map((await c.query('select rr.id, s.label_ar from role_requirement rr join skill s on s.id = rr.skill_id where rr.target_role_id = $1', [v.target_role_id])).rows.map((r) => [r.id, r.label_ar]));
      const fields = [...Object.keys(TRACK_SKILL_FIELDS), 'classification_status'];
      const skills = (v.skill_config_snapshot as Record<string, unknown>[]).map((s) => {
        const b = baseSnap.find((x) => x['role_requirement_id'] === s['role_requirement_id']) ?? null;
        return { roleRequirementId: s['role_requirement_id'], labelAr: labels.get(String(s['role_requirement_id'])) ?? null, fields: diffFields(b, s, fields).filter((d) => d.changed) };
      }).filter((x) => x.fields.length > 0);
      return { versionId, version: Number(v.version), comparedWith: base ? { id: base.id, version: Number(base.version), resolution: res.row ? res.resolution : null } : { id: null, version: null, resolution: 'live rows' },
        appliesSkillConfig: v.applies_skill_config, skills, ...stageView(governedStage({ reviewStatus: v.review_status, activation: v.activation, activatedAt: v.activated_at })),
        impactAr: v.applies_skill_config ? 'عند التفعيل تصبح قيم هذا الإصدار هي القيم الحيّة لمهارات المسار (تقارير الجاهزية وقواعدها)، في المعاملة نفسها، ويُسجَّل ذلك.' : 'إصدار لا يغيّر قيم المهارات الحيّة.' };
    });
  }

  async submitTrackVersion(who: AdminIdentity, versionId: string, reason: string) {
    const role = this.authorise(who, 'submit');
    return this.db.asService(async (c) => {
      const v = (await c.query(`select review_status::text, activation, drafted_by from track_config_version where id = $1 for update`, [versionId])).rows[0];
      if (!v) throw new NotFoundException('version not found');
      if (v.review_status !== 'draft' || v.activation !== 'inactive') throw new BadRequestException('only an inactive draft version is submitted');
      await withConfigActor(c, `${who.label} (${who.id})`, reason, () => c.query(`update track_config_version set review_status = 'curated' where id = $1`, [versionId]));
      await this.audit(c, who, role, 'submitted_for_review', 'track_config_version', versionId, reason);
      return { id: versionId, stage: 'pending_review' };
    });
  }

  async validateTrackVersion(who: AdminIdentity, versionId: string, p: { decision: 'approve' | 'needs_revision' | 'reject'; reason: string }) {
    const role = this.authorise(who, 'validate');
    if (!p.reason?.trim()) throw new BadRequestException('a validation decision needs a written reason');
    return this.db.asService(async (c) => {
      const v = (await c.query(`select review_status::text, drafted_by from track_config_version where id = $1 for update`, [versionId])).rows[0];
      if (!v) throw new NotFoundException('version not found');
      if (!['curated', 'sme_reviewed'].includes(v.review_status)) throw new BadRequestException(`only a submitted version is validated (this one is ${v.review_status})`);
      try { assertFourEyes(v.drafted_by, who.id); } catch (e) { throw new ForbiddenException((e as Error).message); }
      if (p.decision === 'approve') await approveConfigRow(c, { table: 'track_config_version', id: versionId, approvedBy: who.id, approvedByLabel: who.label, reason: p.reason });
      else await withConfigActor(c, `${who.label} (${who.id})`, p.reason, () => c.query(`update track_config_version set review_status = $2 where id = $1`, [versionId, p.decision === 'reject' ? 'rejected' : 'needs_revision']));
      await this.audit(c, who, role, `validated_${p.decision}`, 'track_config_version', versionId, p.reason);
      return { id: versionId, decision: p.decision };
    });
  }

  async activateTrackVersion(who: AdminIdentity, versionId: string, p: { activation: ConfigActivation; reason: string }) {
    const role = this.authorise(who, 'activate');
    return this.activateIn(who, role, 'track_config_version', versionId, p.activation, p.reason, 'track_config_version');
  }

  /* ───────────────────────────── career content ───────────────────────────── */

  async content(who: AdminIdentity) {
    this.authorise(who, 'read');
    return this.db.asService(async (c) => {
      const skills = (await c.query(`select id, slug, label_ar, label_en, review_status::text, is_demo_fixture from skill where status = 'active' order by is_demo_fixture, slug`)).rows;
      const activities = (await c.query(`select id, slug, version, title_ar, title_en, status::text, is_demo_fixture, target_role_id from activity_spec order by slug, version`)).rows;
      const deliverables = (await c.query(`select id, activity_spec_id, key, format, mandatory, description_ar, description_en from activity_deliverable order by activity_spec_id, position`)).rows;
      // Assessment-private inputs (planted issues) are visible here, to authorised administrators only — never to graduates (0024).
      const inputs = (await c.query(`select id, activity_spec_id, key, description_ar, description_en, is_platform_private, contains_planted_issue from activity_input order by activity_spec_id, key`)).rows;
      const rubrics = (await c.query(`select id, activity_spec_id, version, status::text, is_demo_fixture, pass_threshold, pass_threshold_status::text, values_approved_by_label, values_approved_at from rubric_version order by activity_spec_id, version`)).rows;
      const criteria = (await c.query(`select id, rubric_version_id, key, name_ar, name_en, weight, weight_status::text, threshold_for_skill, threshold_status::text, mandatory, max_score from rubric_criterion order by rubric_version_id, position`)).rows;
      return {
        help: { weight: RULE_CATALOG['rubric_criterion.weight'], threshold: RULE_CATALOG['rubric_criterion.threshold_for_skill'], mandatory: RULE_CATALOG['rubric_criterion.mandatory'] },
        skills: skills.map((s) => ({ id: s.id, slug: s.slug, labelAr: s.label_ar, labelEn: s.label_en, isDemo: s.is_demo_fixture, reviewStatus: s.review_status, ...stageView(contentStage(s.review_status)) })),
        activities: activities.map((a) => ({ id: a.id, slug: a.slug, version: a.version, titleAr: a.title_ar, titleEn: a.title_en, isDemo: a.is_demo_fixture, reviewStatus: a.status, editable: ['draft', 'needs_revision', 'rejected'].includes(a.status),
          ...stageView(contentStage(a.status)),
          deliverables: deliverables.filter((d) => d.activity_spec_id === a.id).map((d) => ({ id: d.id, key: d.key, format: d.format, mandatory: d.mandatory, descriptionAr: d.description_ar, descriptionEn: d.description_en })),
          inputs: inputs.filter((i) => i.activity_spec_id === a.id).map((i) => ({ id: i.id, key: i.key, descriptionAr: i.description_ar, descriptionEn: i.description_en,
            isPlatformPrivate: i.is_platform_private, containsPlantedIssue: i.contains_planted_issue, learnerSeesDescription: !i.contains_planted_issue })),
          rubrics: rubrics.filter((r) => r.activity_spec_id === a.id).map((r) => ({ id: r.id, version: r.version, isDemo: r.is_demo_fixture, reviewStatus: r.status, editable: ['draft', 'needs_revision', 'rejected'].includes(r.status),
            passThreshold: r.pass_threshold, passThresholdStatus: r.pass_threshold_status, valuesApprovedBy: r.values_approved_by_label, valuesApprovedAt: r.values_approved_at, ...stageView(contentStage(r.status)),
            criteria: criteria.filter((x) => x.rubric_version_id === r.id).map((x) => ({ id: x.id, key: x.key, nameAr: x.name_ar, nameEn: x.name_en, weight: x.weight, weightStatus: x.weight_status,
              threshold: x.threshold_for_skill, thresholdStatus: x.threshold_status, mandatory: x.mandatory, maxScore: x.max_score, valuesPending: x.weight_status !== 'approved' })) })) })),
      };
    });
  }

  /** A new skill, born DRAFT. It is not consumed by the product until reviewed by a named SME and published by the product owner. */
  async createSkill(who: AdminIdentity, p: { slug: string; labelAr: string; labelEn: string; descriptionAr?: string | null; descriptionEn?: string | null; skillType?: string | null; reason: string }) {
    const role = this.authorise(who, 'draft');
    if (!/^[a-z][a-z0-9_-]{2,63}$/.test(p.slug ?? '')) throw new BadRequestException('slug must be lower-case letters, digits, _ or -');
    if (!p.labelAr?.trim() || !p.labelEn?.trim() || !p.reason?.trim()) throw new BadRequestException('Arabic and English labels and a reason are required');
    if (p.skillType && !['core', 'supporting', 'tool', 'behavioral'].includes(p.skillType)) throw new BadRequestException('unknown skill type');
    return this.db.asService(async (c) => {
      const r = await c.query(`insert into skill (slug, label_ar, label_en, description_ar, description_en, skill_type, provenance_class, provenance_source, review_status)
          values ($1,$2,$3,$4,$5,$6,'curated',$7,'draft') returning id`,
        [p.slug, p.labelAr.trim(), p.labelEn.trim(), p.descriptionAr ?? null, p.descriptionEn ?? null, p.skillType ?? null, `track builder: ${who.label}`]);
      await this.audit(c, who, role, 'content_created', 'skill', r.rows[0].id, p.reason.trim(), { slug: p.slug });
      return { id: r.rows[0].id, stage: 'draft' };
    });
  }

  /** Edits an UNPUBLISHED deliverable or rubric criterion in place. Published content is frozen (database triggers); a changed value goes back to "proposed". */
  async editContent(who: AdminIdentity, p: { kind: 'activity_deliverable' | 'rubric_criterion'; id: string; changes: Record<string, unknown>; reason: string }) {
    const role = this.authorise(who, 'draft');
    if (!p.reason?.trim()) throw new BadRequestException('an edit needs a written reason');
    const allowed = p.kind === 'activity_deliverable' ? ['description_ar', 'description_en', 'mandatory', 'format'] : ['name_ar', 'name_en', 'description_ar', 'description_en', 'weight', 'threshold_for_skill', 'mandatory', 'max_score'];
    for (const f of Object.keys(p.changes ?? {})) if (!allowed.includes(f)) throw new BadRequestException(`'${f}' is not editable on ${p.kind}`);
    if (Object.keys(p.changes ?? {}).length === 0) throw new BadRequestException('nothing to change');
    return this.db.asService(async (c) => {
      const parent = p.kind === 'activity_deliverable'
        ? (await c.query('select a.id, a.status::text as status from activity_deliverable d join activity_spec a on a.id = d.activity_spec_id where d.id = $1', [p.id])).rows[0]
        : (await c.query('select r.id, r.status::text as status from rubric_criterion x join rubric_version r on r.id = x.rubric_version_id where x.id = $1', [p.id])).rows[0];
      if (!parent) throw new NotFoundException('not found');
      if (!['draft', 'needs_revision', 'rejected'].includes(parent.status)) {
        throw new BadRequestException(`its ${p.kind === 'activity_deliverable' ? 'activity' : 'rubric'} is ${parent.status}: only draft or returned content is edited (an SME returns it with "needs revision"; published content needs a new version)`);
      }
      const cols = Object.keys(p.changes);
      const valueChange = p.kind === 'rubric_criterion' && cols.some((f) => ['weight', 'threshold_for_skill', 'mandatory', 'max_score'].includes(f));
      const extra = valueChange ? `, weight_status = 'proposed', threshold_status = case when threshold_status is null then null else 'proposed'::value_status end` : '';
      await c.query(`update ${p.kind} set ${cols.map((f, i) => `${f} = $${i + 2}`).join(', ')}${extra} where id = $1`, [p.id, ...cols.map((f) => p.changes[f])]);
      if (valueChange) await c.query(`update rubric_version set values_approved_by = null, values_approved_by_label = null, values_approved_at = null, values_approval_reason = null, pass_threshold_status = 'proposed' where id = $1`, [parent.id]);
      await this.audit(c, who, role, 'content_edited', p.kind, p.id, p.reason.trim(), { changes: p.changes, parentId: parent.id, valuesReset: valueChange });
      return { id: p.id, valuesReset: valueChange };
    });
  }

  /**
   * Career-data review through the existing command (domain + database guard + review_log):
   *   curated (submit) — track_admin as content author;
   *   sme_reviewed / approved / rejected / needs_revision — a named SME, never the person who submitted it;
   *   published / superseded — the product owner (publishing an activity or rubric supersedes the previous one).
   */
  async reviewContent(who: AdminIdentity, p: { entityKind: string; id: string; to: ReviewState; reason: string }) {
    const map: Record<string, { action: AdminAction; role: ReviewerRole }> = {
      curated: { action: 'submit', role: 'content_author' }, sme_reviewed: { action: 'validate', role: 'sme' }, approved: { action: 'validate', role: 'sme' },
      rejected: { action: 'validate', role: 'sme' }, needs_revision: { action: 'validate', role: 'sme' }, published: { action: 'publish', role: 'product_owner' }, superseded: { action: 'publish', role: 'product_owner' },
    };
    const m = map[p.to]; if (!m) throw new BadRequestException(`'${p.to}' is not a review decision`);
    const adminRole = this.authorise(who, m.action);
    if (p.to === 'published') {
      // Separation of duties on identity: the publisher is neither the person who submitted, edited, nor professionally approved it.
      const involved = await this.db.asService(async (c) => (await c.query(
        `select decided_by::text as id from review_log where entity_id = $1 and to_status in ('curated','sme_reviewed','approved') and decided_by is not null
         union select actor_id::text from audit_event where event_type in ('admin.content_edited','admin.content_created') and (subject_id = $1 or payload->>'parentId' = $1::text) and actor_id is not null`, [p.id])).rows.map((r) => String(r.id)));
      if (involved.includes(who.id)) throw new ForbiddenException('separation of duties: you created, submitted, edited or approved this content; another product owner must publish it');
    }
    if (m.role === 'sme') {
      const last = await this.db.asService(async (c) => (await c.query(`select decided_by from review_log where entity_id = $1 and to_status = 'curated' order by decided_at desc limit 1`, [p.id])).rows[0]);
      const edited = await this.db.asService(async (c) => (await c.query(`select 1 from audit_event where event_type = 'admin.content_edited' and actor_id = $1 and (subject_id = $2 or payload->>'parentId' = $2::text) limit 1`, [who.id, p.id])).rowCount);
      try { assertFourEyes(last?.decided_by ?? null, who.id); } catch (e) { throw new ForbiddenException((e as Error).message); }
      if (edited) throw new ForbiddenException('four eyes: you edited this content; another, named SME must validate it');
    }
    try {
      const r = await this.db.withPool((pool) => reviewTransition(pool, { entityKind: p.entityKind, entityId: p.id, to: p.to, decidedBy: who.id, decidedByLabel: who.label, rolePerformed: m.role, reason: p.reason, production: isProduction() }));
      let superseded: string[] = [];
      if (p.to === 'published' && (p.entityKind === 'activity_spec' || p.entityKind === 'rubric_version')) superseded = await this.db.withPool((pool) => supersedePrevious(pool, p.entityKind as 'activity_spec' | 'rubric_version', p.id, who.label, isProduction()));
      await this.db.asService((c) => this.audit(c, who, adminRole, 'content_reviewed', p.entityKind, p.id, p.reason, { from: r.from, to: r.to, superseded }));
      return { ...r, superseded };
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new BadRequestException((e as Error).message);
    }
  }

  /** OPEN-043 through the existing command: a named SME approves a rubric's weights, thresholds and pass threshold. Four eyes against whoever edited them. */
  async approveRubricValues(who: AdminIdentity, rubricVersionId: string, reason: string) {
    const role = this.authorise(who, 'validate');
    const edited = await this.db.asService(async (c) => (await c.query(`select 1 from audit_event where event_type = 'admin.content_edited' and actor_id = $1 and payload->>'parentId' = $2::text limit 1`, [who.id, rubricVersionId])).rowCount);
    if (edited) throw new ForbiddenException('four eyes: you edited these values; another, named SME must approve them');
    const submitted = await this.db.asService(async (c) => (await c.query(`select 1 from review_log where entity_id = $1 and to_status = 'curated' and decided_by = $2 limit 1`, [rubricVersionId, who.id])).rowCount);
    if (submitted) throw new ForbiddenException('four eyes: you submitted this rubric for review; another, named SME must approve its values');
    try {
      const r = await this.db.withPool((pool) => approveRubricValues(pool, { rubricVersionId, decidedBy: who.id, decidedByLabel: who.label, reason }));
      await this.db.asService((c) => this.audit(c, who, role, 'rubric_values_approved', 'rubric_version', rubricVersionId, reason, r));
      return r;
    } catch (e) { throw new BadRequestException((e as Error).message); }
  }
}
