/**
 * D-135 — DEVELOPMENT-ONLY graduate pilot of the Junior Frontend v2 candidate.
 *
 * A separate loader, NOT the import pipeline: `importPack` keeps refusing every format-2 pack (CHG-017 not approved).
 * What it writes, and only outside production:
 *   - one pilot role (`<role code>-v2-pilot`), labelled as an unapproved internal pilot, and its role requirements
 *     (no class written: `is_core = false`, classification `pending_expert_validation`, so no class is ever shown — CR-12);
 *   - the candidate's three activities and their rubrics, every undecided expert value left EMPTY + TBD (CR-14):
 *     criterion weights, skill thresholds, pass thresholds and durations. No number is invented;
 *   - one immutable ledger row (`pilot_content_load`) with the source file hashes, who and why.
 * Every row is a DEMO fixture: the database never shows demo content in production, refuses to publish it there, and
 * refuses to let it carry an approved value. Activities and rubrics are loaded DRAFT: the governed review path never
 * publishes a demo fixture (publication needs a named SME's approval). Making them usable for internal testing is the
 * separate, logged Product Owner operation `publishPilotDemo` (D-136, local development only) below.
 * It never writes skills (the existing ones are reused), tasks, learning resources, classifications, pack constraints,
 * readiness rules or policies, and never touches the v1 demo rows.
 */
import type { Pool } from 'pg';
import { integrityClassificationOf, pilotDemoPublicationRefusal, type IntegrityCheckType, type ReviewState } from '@naqla/domain';
import { loadCandidate, validateCandidate } from './candidate';
import { packFormatVersion, type PackCheckDef } from './pack-schema';
import { reviewTransition } from './review';
import { assertAuthorizedOperator } from '../configuration/config-admin.service';
import { emitAuditEvent } from '../infra/audit';

export const PILOT_ROLE_SUFFIX = '-v2-pilot';
export const PILOT_POLICY_DESCRIPTION = 'D-135 DEVELOPMENT PILOT ONLY: per-skill feedback for internal test accounts; unapproved draft; never production.';

export class PilotLoadError extends Error {}

export interface PilotLoadReport {
  readonly packId: string; readonly packVersion: string; readonly alreadyLoaded: boolean;
  readonly role: { readonly id: string; readonly slug: string };
  readonly activities: readonly { readonly code: string; readonly version: string; readonly activityId: string; readonly rubricId: string }[];
  readonly written: Record<string, number>;
}

export async function loadPilotCandidate(pool: Pool, opts: {
  readonly candidateDir: string; readonly canonicalRoot: string; readonly byLabel: string; readonly reason: string; readonly production: boolean;
}): Promise<PilotLoadReport> {
  if (opts.production) throw new PilotLoadError('the development pilot is never loaded in production (D-135)');
  if (!opts.byLabel.trim() || !opts.reason.trim()) throw new PilotLoadError('a pilot load names who loads it and why');
  const bundle = loadCandidate(opts.candidateDir, opts.canonicalRoot);
  const check = validateCandidate(bundle);
  if (check.problems.length) throw new PilotLoadError(`the candidate does not validate:\n  - ${check.problems.join('\n  - ')}`);
  const pack = bundle.pack; const m = pack.track.manifest;
  if (packFormatVersion(pack) !== 2 || m.status !== 'draft') throw new PilotLoadError('the pilot loads a DRAFT format-2 candidate only');

  const prior = await pool.query('select written from pilot_content_load where pack_id = $1 and pack_version = $2', [m.pack_id, m.pack_version]);
  let report: PilotLoadReport;
  if (prior.rowCount) {
    // Loaded before: nothing is rewritten (graduates may already have work on it).
    const w = prior.rows[0].written as { role: PilotLoadReport['role']; activities: PilotLoadReport['activities']; counts: Record<string, number> };
    report = { packId: m.pack_id, packVersion: m.pack_version, alreadyLoaded: true, role: w.role, activities: w.activities, written: w.counts };
  } else {
    report = await writePilot(pool, bundle, opts);
  }
  return report;
}

async function writePilot(pool: Pool, bundle: ReturnType<typeof loadCandidate>, opts: { byLabel: string; reason: string }): Promise<PilotLoadReport> {
  const pack = bundle.pack; const m = pack.track.manifest; const role = pack.track.role;
  const provenance = `pilot:${m.pack_id}@${m.pack_version}`;
  const counts: Record<string, number> = {}; const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('naqla.pilot_content_load', 'on', true), set_config('naqla.config_actor', $1, true), set_config('naqla.config_reason', $2, true)`,
      [opts.byLabel, `D-135 development pilot load: ${opts.reason}`]);

    // Skills are reused, never written: the one graduate-visible, active row of each code (a canonical one first).
    const skillIds = new Map<string, string>();
    const codes = new Set<string>([...pack.track.roleSkills.map((r) => r.skill), ...pack.track.activities.flatMap((a) => a.related_skills.map((s) => s.skill)),
      ...pack.track.rubrics.flatMap((r) => r.criteria.map((x) => x.linked_skill).filter((x): x is string => !!x))]);
    for (const code of codes) {
      const r = await c.query(`select id from skill where slug = $1 and status = 'active' and graduate_content_visible(review_status, is_demo_fixture)
                                order by is_demo_fixture limit 1`, [code]);
      if (!r.rowCount) throw new PilotLoadError(`skill '${code}' has no active, graduate-visible row; the pilot reuses existing skills only`);
      skillIds.set(code, r.rows[0].id);
    }
    const skill = (code: string) => skillIds.get(code)!;

    const slug = `${role.code}${PILOT_ROLE_SUFFIX}`;
    if ((await c.query('select 1 from target_role where slug = $1 and is_demo_fixture', [slug])).rowCount) {
      throw new PilotLoadError(`a pilot role '${slug}' already exists without a ledger entry; investigate before loading again`);
    }
    const roleId = (await c.query(
      `insert into target_role (slug, label_ar, label_en, track_id, source_label, provenance_class, provenance_source, is_demo_fixture, family, level, description_ar, description_en,
         mission_statement_ar, mission_statement_en, typical_responsibilities_ar, typical_responsibilities_en, expected_outputs_ar, expected_outputs_en, expected_from_junior_ar, expected_from_junior_en,
         not_expected_from_junior_ar, not_expected_from_junior_en, region_scope, drafting_aid)
       values ($1,$2,$3,$4,$5,'curated',$6,true,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) returning id`,
      [slug, `${role.name_ar} — تجربة داخلية (نسخة ثانية غير معتمدة)`, `${role.name_en} — internal pilot (v2, unapproved)`, m.pack_id,
       `DEVELOPMENT PILOT (D-135) — ${m.dataset_label}`, provenance, role.family, role.level, role.description_ar, role.description_en,
       role.mission_statement_ar ?? null, role.mission_statement_en ?? null, role.typical_responsibilities_ar, role.typical_responsibilities_en, role.expected_outputs_ar, role.expected_outputs_en,
       role.expected_from_junior_ar, role.expected_from_junior_en, role.not_expected_from_junior_ar, role.not_expected_from_junior_en, role.region_scope ?? m.region_scope ?? null, m.drafting_aid])).rows[0].id as string;
    bump('target_role');

    // No professional class is written or shown (CR-12): is_core stays false and the classification pending.
    for (const rs of pack.track.roleSkills) {
      await c.query(
        `insert into role_requirement (target_role_id, skill_id, weight, is_core, importance, target_proficiency, why_required_ar, why_required_en, evidence_type_expected, minimum_evidence_count,
           can_be_partially_auto_evaluated, human_review_required, drafting_aid, is_demo_fixture)
         values ($1,$2,null,false,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)`,
        [roleId, skill(rs.skill), rs.importance, rs.target_proficiency, rs.why_required_ar, rs.why_required_en, rs.evidence_type_expected, rs.minimum_evidence_count,
         rs.can_be_partially_auto_evaluated, rs.human_review_required, m.drafting_aid]);
      bump('role_requirement');
    }

    const activities: { code: string; version: string; activityId: string; rubricId: string }[] = [];
    const activityIds = new Map<string, string>();
    for (const a of pack.track.activities) {
      const id = (await c.query(
        `insert into activity_spec (slug, version, title_ar, title_en, ai_usage_mode, estimated_minutes, target_role_id, level, business_context_ar, business_context_en, objective_ar, objective_en,
           can_yield_demonstrated, can_yield_verified, is_validation_activity, variant_family, drafting_aid, is_demo_fixture)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,$14,$15,$16,true) returning id`,
        [a.code, a.version, a.title_ar, a.title_en, a.ai_usage_mode, a.estimated_minutes, roleId, a.level, a.business_context_ar, a.business_context_en, a.objective_ar, a.objective_en,
         a.can_yield_demonstrated, a.is_validation_activity, a.variant_family ?? null, m.drafting_aid])).rows[0].id as string;
      activityIds.set(a.code, id); bump('activity_spec');
      // Phase B package 3 (0039): every pilot input is delivered as a starter material; the activity cannot be started until it is.
      for (const i of a.inputs) await c.query('insert into activity_input (activity_spec_id, key, description_ar, description_en, is_platform_private, contains_planted_issue, material_required) values ($1,$2,$3,$4,$5,$6,true)',
        [id, i.key, i.description_ar, i.description_en, i.is_platform_private, i.contains_planted_issue]);
      let pos = 0;
      for (const d of a.deliverables) await c.query('insert into activity_deliverable (activity_spec_id, key, format, mandatory, description_ar, description_en, position) values ($1,$2,$3,$4,$5,$6,$7)',
        [id, d.key, d.format, d.mandatory, d.description_ar, d.description_en, pos++]);
      for (const s of a.related_skills) await c.query('insert into activity_skill (activity_spec_id, skill_id, depth) values ($1,$2,$3)', [id, skill(s.skill), s.depth]);
      for (const ic of a.integrity_checks) {
        const cls = integrityClassificationOf(ic.check_type as IntegrityCheckType);
        await c.query(
          `insert into integrity_check_spec (activity_spec_id, key, classification, blocking, check_definition, user_facing_message, check_type, location_en, expected_user_behavior_en, raw_ai_output_behavior_en,
             linked_criterion_key, evaluation_mode, active, required_producer_en)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [id, ic.key, cls, ic.blocking, JSON.stringify(ic.check_definition), cls === 'user_facing' ? ic.user_facing_message_ar ?? null : null, ic.check_type, ic.location_en, ic.expected_user_behavior_en,
           ic.raw_ai_output_behavior_en ?? null, ic.linked_criterion_key ?? null, ic.evaluation_mode, ic.evaluation_mode === 'future_deterministic' ? false : ic.active ?? true, ic.required_producer_en ?? null]);
      }
    }

    for (const rb of pack.track.rubrics) {
      const actId = activityIds.get(rb.activity)!;
      // Undecided values stay undecided: the candidate's empty pass threshold is written empty, with its TBD status.
      const rid = (await c.query(
        `insert into rubric_version (activity_spec_id, version, pass_threshold, proposes_state, scoring_policy_version, drafting_aid, is_demo_fixture, pass_threshold_status)
         values ($1,$2,$3,$4,$5,$6,true,$7) returning id`,
        [actId, rb.code, rb.pass_threshold, rb.proposes_state, rb.scoring_policy_version, m.drafting_aid, rb.pass_threshold_status ?? 'TBD'])).rows[0].id as string;
      bump('rubric_version');
      let pos = 0;
      for (const cr of rb.criteria) {
        const kind = cr.criterion_kind ?? 'skill_evidence';
        const chk = toCheckColumns(cr.check);
        const row = await c.query(
          `insert into rubric_criterion (rubric_version_id, key, position, name_ar, name_en, dimension, linked_skill_id, source, weight, max_score, mandatory, threshold_for_skill, evaluator_type,
             human_review_required, check_type, check_artifact_key, check_min_value, check_min_length, check_artifact_keys, description_ar, description_en, expected_evidence_ar, expected_evidence_en,
             excerpt_guidance_en, rationale_when_met_ar, rationale_when_unmet_ar, weight_status, threshold_status, criterion_kind)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) returning id`,
          [rid, cr.key, pos++, cr.name_ar, cr.name_en, cr.dimension, kind === 'skill_evidence' ? skill(cr.linked_skill!) : null, cr.source, cr.weight, cr.max_score, cr.mandatory,
           cr.threshold_for_skill, cr.evaluator_type, cr.human_review_required, chk.type, chk.artifactKey, chk.min, chk.minLength, chk.artifactKeys, cr.description_ar, cr.description_en,
           cr.expected_evidence_ar, cr.expected_evidence_en, cr.excerpt_guidance_en ?? null, cr.rationale_when_met_ar, cr.rationale_when_unmet_ar,
           cr.weight_status ?? 'TBD', kind === 'skill_evidence' ? cr.threshold_status ?? 'TBD' : null, kind]);
        for (const l of cr.levels) await c.query('insert into rubric_criterion_level (criterion_id, level_key, score, descriptor_ar, descriptor_en, observable_evidence_en) values ($1,$2,$3,$4,$5,$6)',
          [row.rows[0].id, l.level_key, l.score, l.descriptor_ar, l.descriptor_en, l.observable_evidence_en]);
        bump('rubric_criterion');
      }
      const a = pack.track.activities.find((x) => x.code === rb.activity)!;
      activities.push({ code: a.code, version: a.version, activityId: actId, rubricId: rid });
    }

    await c.query(
      `insert into pilot_content_load (pack_id, pack_version, target_role_id, loaded_by_label, reason, files, written) values ($1,$2,$3,$4,$5,$6,$7)`,
      [m.pack_id, m.pack_version, roleId, opts.byLabel, opts.reason, JSON.stringify(bundle.files.map((f) => ({ name: f.name, sha256: f.sha256 }))),
       JSON.stringify({ role: { id: roleId, slug }, activities, counts })]);
    await c.query('commit');
    return { packId: m.pack_id, packVersion: m.pack_version, alreadyLoaded: false, role: { id: roleId, slug }, activities, written: counts };
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

function toCheckColumns(check: PackCheckDef | undefined): { type: string; artifactKey: string | null; min: number | null; minLength: number | null; artifactKeys: string[] | null } {
  if (!check) return { type: 'none', artifactKey: null, min: null, minLength: null, artifactKeys: null };
  return { type: check.type, artifactKey: check.artifactKey ?? null, min: check.min ?? null, minLength: check.minLength ?? null, artifactKeys: check.artifactKeys ?? null };
}

/**
 * D-135 decision 3: per-skill feedback inside the controlled development pilot. Makes a per_skill DRAFT policy
 * development_only with the explicit opt-in of migration 0029 (the database refuses it in production, refuses approval,
 * publication and any baseline, and requires the independently_verified basis — demo content never qualifies, so no
 * level moves). `restoreSafetyBaseline` puts the D-118 default back.
 */
export async function usePilotPerSkillPolicy(pool: Pool, opts: { byLabel: string; production: boolean }): Promise<string> {
  if (opts.production) throw new PilotLoadError('the per-skill pilot policy is never used in production (D-135)');
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('naqla.config_actor', $1, true), set_config('naqla.config_reason', 'D-135 development pilot: per-skill feedback', true),
                          set_config('naqla.per_skill_dev_activation', 'on', true)`, [opts.byLabel]);
    let id = (await c.query(`select id from verification_policy where key = 'default' and description_en = $1`, [PILOT_POLICY_DESCRIPTION])).rows[0]?.id as string | undefined;
    if (!id) {
      const v = Math.max(980, Number((await c.query(`select coalesce(max(version), 0) + 1 as v from verification_policy where key = 'default'`)).rows[0].v));
      id = (await c.query(`insert into verification_policy (key, version, description_en, promotion_basis, practiced_on_submission, assessment_scope)
                           values ('default', $1, $2, 'independently_verified', false, 'per_skill') returning id`, [v, PILOT_POLICY_DESCRIPTION])).rows[0].id as string;
    }
    await c.query(`update verification_policy set activation = 'inactive' where key = 'default' and activation <> 'inactive' and id <> $1`, [id]);
    await c.query(`update verification_policy set activation = 'development_only' where id = $1 and activation <> 'development_only'`, [id]);
    await c.query('commit');
    return id;
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

export async function restoreSafetyBaseline(pool: Pool, opts: { byLabel: string }): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('naqla.config_actor', $1, true), set_config('naqla.config_reason', 'restore the D-118 safety baseline after the development pilot', true)`, [opts.byLabel]);
    await c.query(`update verification_policy set activation = 'inactive' where key = 'default' and activation <> 'inactive' and not (version = 2 and baseline_of is not null)`);
    await c.query(`update verification_policy set activation = 'legacy_baseline' where key = 'default' and version = 2 and baseline_of is not null and activation <> 'legacy_baseline'`);
    await c.query('commit');
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
}

/**
 * D-136 (conditional PO approval, Option B): the DEVELOPMENT-ONLY publication of every loaded pilot activity and rubric,
 * solely to test the graduate journey. NOT a professional approval, an SME sign-off or a production publication.
 *   - an authorized Product Owner operation: the operator holds an active product_owner grant (checked here AND by the
 *     database trigger of 0036, which also refuses production and requires the transaction-local opt-in);
 *   - local development only: NODE_ENV development/test and a database on this machine (staging and production refuse);
 *   - pilot DEMO content only (rows of a role in the pilot-load ledger); the real SME workflow is not used or changed:
 *     draft → curated is the ordinary authoring step; curated → published is this separate, logged exception;
 *   - logged twice (review_log as product_owner with the D-136 wording, and an audit event); no SME approval field is
 *     written (the database refuses one on pilot rows).
 */
export async function publishPilotDemo(pool: Pool, opts: {
  readonly operatorId: string; readonly reason: string; readonly nodeEnv: string | undefined; readonly databaseUrl: string;
  /** Phase C round 3: staging only under a named owner decision (see pilotDemoPublicationRefusal). */
  readonly deployment?: 'development' | 'staging' | 'production'; readonly stagingDecision?: string | null;
}): Promise<{ operator: string; published: { kind: 'activity_spec' | 'rubric_version'; id: string }[]; alreadyPublished: number }> {
  const host = databaseHost(opts.databaseUrl);
  const envRefusal = pilotDemoPublicationRefusal({ nodeEnv: opts.nodeEnv, databaseHost: host, isDemoFixture: true, isPilotContent: true, from: 'curated', reason: opts.reason, deployment: opts.deployment ?? 'development', stagingDecision: opts.stagingDecision ?? null });
  if (envRefusal) throw new PilotLoadError(envRefusal);
  const operator = await withClient(pool, (c) => assertAuthorizedOperator(c, opts.operatorId));
  const rows = (await pool.query(`select 'activity_spec' as kind, a.id, a.status::text as status, a.is_demo_fixture from activity_spec a join pilot_content_load l on l.target_role_id = a.target_role_id
      union all select 'rubric_version', rv.id, rv.status::text, rv.is_demo_fixture from rubric_version rv join activity_spec a on a.id = rv.activity_spec_id join pilot_content_load l on l.target_role_id = a.target_role_id
      order by 1, 2`)).rows as { kind: 'activity_spec' | 'rubric_version'; id: string; status: ReviewState; is_demo_fixture: boolean }[];
  if (rows.length === 0) throw new PilotLoadError('no pilot content is loaded (run pilot-load first)');
  const published: { kind: 'activity_spec' | 'rubric_version'; id: string }[] = []; let already = 0;
  // Activities first: a rubric is bound to its activity version when it is published.
  for (const r of [...rows.filter((x) => x.kind === 'activity_spec'), ...rows.filter((x) => x.kind === 'rubric_version')]) {
    if (r.status === 'published') { already++; continue; }
    if (r.status === 'draft') {
      await reviewTransition(pool, { entityKind: r.kind, entityId: r.id, to: 'curated', decidedBy: null, decidedByLabel: operator, rolePerformed: 'content_author',
        reason: `D-136 development pilot: DEMO pilot content complete for internal testing (${opts.reason})`, production: false });
    }
    const refusal = pilotDemoPublicationRefusal({ nodeEnv: opts.nodeEnv, databaseHost: host, isDemoFixture: r.is_demo_fixture, isPilotContent: true, from: 'curated', reason: opts.reason, deployment: opts.deployment ?? 'development', stagingDecision: opts.stagingDecision ?? null });
    if (refusal) throw new PilotLoadError(`${r.kind} ${r.id}: ${refusal}`);
    await withClient(pool, async (c) => {
      await c.query('begin');
      try {
        await c.query(`select set_config('naqla.pilot_demo_publication', 'on', true), set_config('naqla.pilot_publication_operator', $1, true)`, [opts.operatorId]);
        const u = await c.query(`update ${r.kind} set status = 'published' where id = $1 and status = 'curated' and is_demo_fixture returning id`, [r.id]);
        if (u.rowCount !== 1) throw new PilotLoadError(`${r.kind} ${r.id} is not curated DEMO pilot content`);
        const why = `D-136 DEVELOPMENT PILOT DEMO PUBLICATION — local development only; not an SME approval, not a professional approval, not a production publication (${opts.reason})`;
        await c.query(`insert into review_log (entity_kind, entity_id, from_status, to_status, decided_by, decided_by_label, role_performed, reason)
                       values ($1, $2, 'curated', 'published', $3, $4, 'product_owner', $5)`, [r.kind, r.id, opts.operatorId, operator, why]);
        await emitAuditEvent(c, { eventType: 'pilot.demo_published', userId: null, actorKind: 'user', actorId: opts.operatorId, rolePerformed: 'product_owner',
          subjectTable: r.kind, subjectId: r.id, reason: why, payload: { decision: 'D-136', environment: 'local development' } });
        await c.query('commit');
      } catch (e) { await c.query('rollback').catch(() => undefined); throw e; }
    });
    published.push({ kind: r.kind, id: r.id });
  }
  return { operator, published, alreadyPublished: already };
}

async function withClient<T>(pool: Pool, fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { return await fn(c); } finally { c.release(); }
}

/** The host a connection string points at (a socket directory for a host-less local URL). */
export function databaseHost(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname) return u.hostname;
    return u.searchParams.get('host') ?? '/var/run/postgresql';
  } catch { return null; }
}
