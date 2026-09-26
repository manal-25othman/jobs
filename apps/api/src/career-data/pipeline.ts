/**
 * Import pipeline: Source → Raw → Normalize → Deduplicate → Map → Review → Publish.
 *
 * The importer writes the CURATED layer as `draft`. It never approves, never
 * publishes, never merges two skills and never touches a record a reviewer
 * has already moved past `curated`. Review and publish are separate,
 * person-driven commands (review.ts).
 */
import type { Pool, PoolClient } from 'pg';
import {
  normalizeMatchKey, nearDuplicateCandidates, integrityClassificationOf, type IntegrityCheckType, type NearDuplicateCandidate,
} from '@naqla/domain';
import type { Pack, PackCheckDef } from './pack-schema';
import { validatePack } from './pack-schema';
import type { RawFile } from './pack-loader';

export interface ImportOptions { readonly dryRun?: boolean; readonly captureMethod?: string; }
export interface ImportReport {
  readonly packId: string; readonly packVersion: string; readonly isDemoFixture: boolean;
  readonly snapshots: { file: string; sha256: string; stored: 'new' | 'existing' }[];
  readonly normalizedRecords: number;
  readonly nearDuplicates: NearDuplicateCandidate[];
  readonly written: Record<string, number>;
  readonly skippedFrozen: string[];
  readonly unmapped: string[];
}

export class ImportError extends Error { constructor(readonly stage: string, message: string, readonly details: readonly string[] = []) { super(`[${stage}] ${message}${details.length ? `\n  - ${details.join('\n  - ')}` : ''}`); } }

const EDITABLE = ['draft', 'curated'];

export async function importPack(pool: Pool, pack: Pack, files: readonly RawFile[], opts: ImportOptions = {}): Promise<ImportReport> {
  validatePack(pack);
  const m = pack.track.manifest;
  const c = await pool.connect();
  try {
    await c.query('begin');
    const provenanceSource = `pack:${m.pack_id}@${m.pack_version}`;
    const demo = m.is_demo_fixture; const aid = m.drafting_aid;
    const written: Record<string, number> = {}; const skippedFrozen: string[] = [];
    const bump = (k: string) => { written[k] = (written[k] ?? 0) + 1; };

    /* ── Source ── */
    const sourceIds = new Map<string, string>();
    for (const s of pack.global.sources) {
      const cur = await c.query('select id, review_status from data_source where code = $1', [s.code]);
      if (cur.rowCount && !EDITABLE.includes(cur.rows[0].review_status)) { skippedFrozen.push(`data_source ${s.code} (${cur.rows[0].review_status})`); sourceIds.set(s.code, cur.rows[0].id); continue; }
      const r = await c.query(
        `insert into data_source (code, source_type, source_name, publisher, jurisdiction, language, url, url_verified, retrieved_at, version, license_or_usage_notes, reliability, is_demo_fixture)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (code) do update set source_type = excluded.source_type, source_name = excluded.source_name, publisher = excluded.publisher, jurisdiction = excluded.jurisdiction,
           language = excluded.language, url = excluded.url, url_verified = excluded.url_verified, retrieved_at = excluded.retrieved_at, version = excluded.version,
           license_or_usage_notes = excluded.license_or_usage_notes, reliability = excluded.reliability
         returning id`,
        [s.code, s.source_type, s.source_name, s.publisher ?? null, s.jurisdiction, s.language, s.url, s.url_verified ?? false, s.retrieved_at, s.version, s.license_or_usage_notes, s.reliability, demo]);
      sourceIds.set(s.code, r.rows[0].id); bump('data_source');
    }
    const primarySource = sourceIds.get(m.primary_source)!;

    /* ── Raw (L0): immutable snapshots, one per file, deduplicated by hash ── */
    const snapshots: ImportReport['snapshots'] = []; let snapshotId: string | null = null;
    for (const f of files) {
      const existing = await c.query('select id from raw_snapshot where pack_id = $1 and pack_version = $2 and file_name = $3 and sha256 = $4', [m.pack_id, m.pack_version, f.name, f.sha256]);
      if (existing.rowCount) { snapshots.push({ file: f.name, sha256: f.sha256, stored: 'existing' }); if (f.name.endsWith('skills.json')) snapshotId = existing.rows[0].id; continue; }
      const r = await c.query(
        `insert into raw_snapshot (source_id, pack_id, pack_version, file_name, sha256, capture_method, content) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [primarySource, m.pack_id, m.pack_version, f.name, f.sha256, opts.captureMethod ?? 'file import', JSON.stringify(f.content)]);
      snapshots.push({ file: f.name, sha256: f.sha256, stored: 'new' }); if (f.name.endsWith('skills.json')) snapshotId = r.rows[0].id;
    }

    /* ── Normalize (L1): regenerable match keys, no semantic decision ── */
    let normalized = 0;
    if (snapshotId) {
      await c.query('delete from normalized_record where snapshot_id = $1', [snapshotId]);
      const rows: [string, string, string, string][] = [];
      for (const s of pack.global.skills) { rows.push(['skill', s.code, 'en', s.name_en]); rows.push(['skill', s.code, 'ar', s.name_ar]); }
      for (const y of pack.global.synonyms) if (y.surface_form) rows.push(['skill_synonym', y.skill, y.language!, y.surface_form]);
      for (const t of pack.track.tasks) { rows.push(['task', t.code, 'en', t.title_en]); rows.push(['task', t.code, 'ar', t.title_ar]); }
      rows.push(['target_role', pack.track.role.code, 'en', pack.track.role.name_en]); rows.push(['target_role', pack.track.role.code, 'ar', pack.track.role.name_ar]);
      for (const [kind, code, lang, text] of rows) {
        await c.query('insert into normalized_record (snapshot_id, entity_kind, code, language, surface_text, match_key) values ($1,$2,$3,$4,$5,$6)',
          [snapshotId, kind, code, lang, text, normalizeMatchKey(text)]);
        normalized++;
      }
    }

    /* ── Deduplicate: PROPOSE near-duplicates across DB ∪ pack; never merge ── */
    const dbSkills = await c.query(`select slug as code, label_en as name_en, label_ar as name_ar from skill where status = 'active'`);
    const universe = new Map<string, { code: string; nameEn: string; nameAr: string }>();
    for (const r of dbSkills.rows) universe.set(r.code, { code: r.code, nameEn: r.name_en, nameAr: r.name_ar });
    for (const s of pack.global.skills) universe.set(s.code, { code: s.code, nameEn: s.name_en, nameAr: s.name_ar });
    const nearDuplicates = nearDuplicateCandidates([...universe.values()]);
    for (const d of nearDuplicates) {
      await c.query(
        `insert into dedup_candidate (snapshot_id, a_code, b_code, similarity, on_field) values ($1,$2,$3,$4,$5)
         on conflict (a_code, b_code) do update set similarity = excluded.similarity, on_field = excluded.on_field where dedup_candidate.decision = 'proposed'`,
        [snapshotId, d.aCode, d.bCode, d.similarity, d.onField]);
    }

    /* ── Map: resolve every reference to an internal id; unmapped stops the import ── */
    const unmapped: string[] = [];
    const skillIds = new Map<string, string>();
    const existingSkills = await c.query('select id, slug, review_status from skill');
    for (const r of existingSkills.rows) skillIds.set(r.slug, r.id);
    const familyIds = new Map<string, string>(); const policyIds = new Map<string, string>();

    /* ── Write curated layer (draft) — global registries first ── */
    for (const f of pack.global.families) {
      const r = await c.query(`insert into skill_family (code, name_ar, name_en, description_ar, description_en, drafting_aid, is_demo_fixture) values ($1,$2,$3,$4,$5,$6,$7)
        on conflict (code) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, description_ar = excluded.description_ar, description_en = excluded.description_en
        where skill_family.review_status in ('draft','curated') returning id`, [f.code, f.name_ar, f.name_en, f.description_ar ?? null, f.description_en ?? null, aid, demo]);
      const id = r.rows[0]?.id ?? (await c.query('select id from skill_family where code = $1', [f.code])).rows[0].id;
      familyIds.set(f.code, id); bump('skill_family');
    }
    const sc = pack.global.scale;
    const scaleRow = await c.query(`insert into proficiency_scale (code, version, name_ar, name_en, drafting_aid, is_demo_fixture) values ($1,$2,$3,$4,$5,$6)
      on conflict (code) do update set version = excluded.version, name_ar = excluded.name_ar, name_en = excluded.name_en where proficiency_scale.review_status in ('draft','curated') returning id`,
      [sc.code, sc.version, sc.name_ar, sc.name_en, aid, demo]);
    const scaleId: string = scaleRow.rows[0]?.id ?? (await c.query('select id from proficiency_scale where code = $1', [sc.code])).rows[0].id;
    for (const l of sc.levels) {
      await c.query(`insert into proficiency_level (scale_id, level_key, ordinal, label_ar, label_en, descriptor_ar, descriptor_en, observable_at_this_level_ar, observable_at_this_level_en)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (scale_id, level_key) do update set ordinal = excluded.ordinal, label_ar = excluded.label_ar, label_en = excluded.label_en,
        descriptor_ar = excluded.descriptor_ar, descriptor_en = excluded.descriptor_en, observable_at_this_level_ar = excluded.observable_at_this_level_ar, observable_at_this_level_en = excluded.observable_at_this_level_en`,
        [scaleId, l.level_key, l.ordinal, l.label_ar, l.label_en, l.descriptor_ar, l.descriptor_en, l.observable_ar ?? [], l.observable_en ?? []]);
    }
    bump('proficiency_scale');
    for (const p of pack.global.recency) {
      const r = await c.query(`insert into recency_policy (code, applies_to, current_window_months, aging_window_months, stale_after_months, refresh_method, rationale, policy_version, drafting_aid, is_demo_fixture)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (code) do update set applies_to = excluded.applies_to, current_window_months = excluded.current_window_months,
        aging_window_months = excluded.aging_window_months, stale_after_months = excluded.stale_after_months, refresh_method = excluded.refresh_method, rationale = excluded.rationale,
        policy_version = excluded.policy_version where recency_policy.review_status in ('draft','curated') returning id`,
        [p.code, p.applies_to, p.current_window_months, p.aging_window_months, p.stale_after_months, p.refresh_method, p.rationale, p.policy_version, aid, demo]);
      policyIds.set(p.code, r.rows[0]?.id ?? (await c.query('select id from recency_policy where code = $1', [p.code])).rows[0].id); bump('recency_policy');
    }
    for (const s of pack.global.skills) {
      const cur = existingSkills.rows.find((r) => r.slug === s.code);
      if (cur && !EDITABLE.includes(cur.review_status)) { skippedFrozen.push(`skill ${s.code} (${cur.review_status})`); continue; }
      const r = await c.query(
        `insert into skill (slug, label_ar, label_en, family, skill_family_id, skill_type, description_ar, description_en, observable_indicators_ar, observable_indicators_en,
           common_failure_modes_ar, common_failure_modes_en, ai_substitutability, recency_policy_id, proficiency_scale_id, evidence_types_possible, provenance_class, provenance_source, drafting_aid, is_demo_fixture)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'curated',$17,$18,$19)
         on conflict (slug) do update set label_ar = excluded.label_ar, label_en = excluded.label_en, family = excluded.family, skill_family_id = excluded.skill_family_id, skill_type = excluded.skill_type,
           description_ar = excluded.description_ar, description_en = excluded.description_en, observable_indicators_ar = excluded.observable_indicators_ar, observable_indicators_en = excluded.observable_indicators_en,
           common_failure_modes_ar = excluded.common_failure_modes_ar, common_failure_modes_en = excluded.common_failure_modes_en, ai_substitutability = excluded.ai_substitutability,
           recency_policy_id = excluded.recency_policy_id, proficiency_scale_id = excluded.proficiency_scale_id, evidence_types_possible = excluded.evidence_types_possible,
           provenance_source = excluded.provenance_source, version = skill.version + 1
         returning id`,
        [s.code, s.name_ar, s.name_en, s.family, familyIds.get(s.family), s.skill_type, s.description_ar, s.description_en, s.observable_indicators_ar, s.observable_indicators_en,
         s.common_failure_modes_ar, s.common_failure_modes_en, s.ai_substitutability, policyIds.get(s.recency_policy), scaleId, s.evidence_types_possible, provenanceSource, aid, demo]);
      skillIds.set(s.code, r.rows[0].id); bump('skill');
    }
    const skillId = (code: string, owner: string): string | null => { const id = skillIds.get(code); if (!id) unmapped.push(`${owner}: skill '${code}'`); return id ?? null; };
    for (const y of pack.global.synonyms) {
      const sid = skillId(y.skill, 'synonym'); const rid = y.related_skill ? skillId(y.related_skill, 'synonym') : null;
      if (!sid || (y.related_skill && !rid)) continue;
      await c.query(`insert into skill_synonym (skill_id, relation, surface_form, language, form_type, related_skill_id, source_id, decided_by, decided_at, confidence, drafting_aid, is_demo_fixture)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict do nothing`,
        [sid, y.relation, y.surface_form ?? null, y.language ?? null, y.form_type ?? null, rid, sourceIds.get(y.source), y.decided_by ?? null, y.decided_at ?? null, y.confidence ?? 'medium', aid, demo]);
      bump('skill_synonym');
    }
    const libIds = new Map<string, string>();
    for (const l of pack.global.criteriaLibrary) {
      const r = await c.query(`insert into criterion_library (key, name_ar, name_en, dimension, description_ar, description_en, default_evaluator, drafting_aid, is_demo_fixture) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        on conflict (key) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, dimension = excluded.dimension, description_ar = excluded.description_ar, description_en = excluded.description_en,
        default_evaluator = excluded.default_evaluator where criterion_library.review_status in ('draft','curated') returning id`, [l.key, l.name_ar, l.name_en, l.dimension, l.description_ar, l.description_en, l.default_evaluator, aid, demo]);
      libIds.set(l.key, r.rows[0]?.id ?? (await c.query('select id from criterion_library where key = $1', [l.key])).rows[0].id); bump('criterion_library');
    }
    const ruleIds: string[] = [];
    for (const r of pack.global.presentationRules) {
      const row = await c.query(`insert into career_presentation_rule (asset_type, evidence_level, allowed, minimum_source_strength, minimum_evidence_count, requires_verified, allowed_claim_verbs_ar, allowed_claim_verbs_en,
          forbidden_phrases_ar, forbidden_phrases_en, template_pattern_en, numeric_claims_policy_en, ai_disclosure_handling_en, recency_handling_en, language_target, on_user_edit_en, drafting_aid, is_demo_fixture)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        on conflict (asset_type, evidence_level) do update set allowed = excluded.allowed, minimum_source_strength = excluded.minimum_source_strength, minimum_evidence_count = excluded.minimum_evidence_count,
          requires_verified = excluded.requires_verified, allowed_claim_verbs_ar = excluded.allowed_claim_verbs_ar, allowed_claim_verbs_en = excluded.allowed_claim_verbs_en, forbidden_phrases_ar = excluded.forbidden_phrases_ar,
          forbidden_phrases_en = excluded.forbidden_phrases_en, template_pattern_en = excluded.template_pattern_en, numeric_claims_policy_en = excluded.numeric_claims_policy_en,
          ai_disclosure_handling_en = excluded.ai_disclosure_handling_en, recency_handling_en = excluded.recency_handling_en, language_target = excluded.language_target, on_user_edit_en = excluded.on_user_edit_en
        where career_presentation_rule.review_status in ('draft','curated') returning id`,
        [r.asset_type, r.evidence_level, r.allowed, r.minimum_source_strength, r.minimum_evidence_count, r.requires_verified, r.allowed_claim_verbs_ar, r.allowed_claim_verbs_en, r.forbidden_phrases_ar, r.forbidden_phrases_en,
         r.template_pattern_en ?? null, r.numeric_claims_policy_en ?? 'no number unless it appears in the submission itself', r.ai_disclosure_handling_en ?? null, r.recency_handling_en ?? null, r.language_target ?? 'en',
         r.on_user_edit_en ?? 'an edit outside the evidence drops the verified tag', aid, demo]);
      if (row.rows[0]) { ruleIds.push(row.rows[0].id); bump('career_presentation_rule'); for (const s of r.source_refs) await sourceRef(c, 'career_presentation_rule', row.rows[0].id, sourceIds.get(s)!); }
    }

    /* ── track: role ── */
    const role = pack.track.role;
    const roleCur = await c.query('select id, review_status from target_role where slug = $1', [role.code]);
    let roleId: string;
    if (roleCur.rowCount && !EDITABLE.includes(roleCur.rows[0].review_status)) { skippedFrozen.push(`target_role ${role.code} (${roleCur.rows[0].review_status})`); roleId = roleCur.rows[0].id; }
    else {
      const r = await c.query(
        `insert into target_role (slug, label_ar, label_en, track_id, source_label, provenance_class, provenance_source, is_demo_fixture, family, level, description_ar, description_en, mission_statement_ar, mission_statement_en,
           typical_responsibilities_ar, typical_responsibilities_en, expected_outputs_ar, expected_outputs_en, expected_from_junior_ar, expected_from_junior_en, not_expected_from_junior_ar, not_expected_from_junior_en, region_scope, drafting_aid)
         values ($1,$2,$3,$4,$5,'curated',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         on conflict (slug) do update set label_ar = excluded.label_ar, label_en = excluded.label_en, track_id = excluded.track_id, source_label = excluded.source_label, provenance_source = excluded.provenance_source,
           family = excluded.family, level = excluded.level, description_ar = excluded.description_ar, description_en = excluded.description_en, mission_statement_ar = excluded.mission_statement_ar, mission_statement_en = excluded.mission_statement_en,
           typical_responsibilities_ar = excluded.typical_responsibilities_ar, typical_responsibilities_en = excluded.typical_responsibilities_en, expected_outputs_ar = excluded.expected_outputs_ar, expected_outputs_en = excluded.expected_outputs_en,
           expected_from_junior_ar = excluded.expected_from_junior_ar, expected_from_junior_en = excluded.expected_from_junior_en, not_expected_from_junior_ar = excluded.not_expected_from_junior_ar,
           not_expected_from_junior_en = excluded.not_expected_from_junior_en, region_scope = excluded.region_scope, version = target_role.version + 1
         returning id`,
        [role.code, role.name_ar, role.name_en, m.pack_id, `${m.dataset_label} — ${provenanceSource}`, provenanceSource, demo, role.family, role.level, role.description_ar, role.description_en,
         role.mission_statement_ar ?? null, role.mission_statement_en ?? null, role.typical_responsibilities_ar, role.typical_responsibilities_en, role.expected_outputs_ar, role.expected_outputs_en,
         role.expected_from_junior_ar, role.expected_from_junior_en, role.not_expected_from_junior_ar, role.not_expected_from_junior_en, role.region_scope ?? m.region_scope ?? null, aid]);
      roleId = r.rows[0].id; bump('target_role');
      await c.query('delete from role_tool where target_role_id = $1', [roleId]);
      for (const t of role.common_tools) {
        await c.query('insert into role_tool (target_role_id, name, criticality, skill_id, note_en) values ($1,$2,$3,$4,$5)', [roleId, t.name, t.criticality, t.skill ? skillId(t.skill, `role tool ${t.name}`) : null, t.note_en ?? null]);
      }
      for (const s of role.source_refs) await sourceRef(c, 'target_role', roleId, sourceIds.get(s)!);
    }
    for (const rs of pack.track.roleSkills) {
      const sid = skillId(rs.skill, 'role_skill_map'); if (!sid) continue;
      const cur = await c.query('select id, review_status from role_requirement where target_role_id = $1 and skill_id = $2', [roleId, sid]);
      if (cur.rowCount && !EDITABLE.includes(cur.rows[0].review_status)) { skippedFrozen.push(`role_requirement ${rs.skill} (${cur.rows[0].review_status})`); continue; }
      const r = await c.query(
        `insert into role_requirement (target_role_id, skill_id, weight, is_core, importance, target_proficiency, why_required_ar, why_required_en, evidence_type_expected, minimum_evidence_count,
           can_be_partially_auto_evaluated, human_review_required, drafting_aid, is_demo_fixture)
         values ($1,$2,null,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (target_role_id, skill_id) do update set is_core = excluded.is_core, importance = excluded.importance, target_proficiency = excluded.target_proficiency, why_required_ar = excluded.why_required_ar,
           why_required_en = excluded.why_required_en, evidence_type_expected = excluded.evidence_type_expected, minimum_evidence_count = excluded.minimum_evidence_count,
           can_be_partially_auto_evaluated = excluded.can_be_partially_auto_evaluated, human_review_required = excluded.human_review_required, version = role_requirement.version + 1
         returning id`,
        [roleId, sid, rs.is_core_for_role, rs.importance, rs.target_proficiency, rs.why_required_ar, rs.why_required_en, rs.evidence_type_expected, rs.minimum_evidence_count, rs.can_be_partially_auto_evaluated, rs.human_review_required, aid, demo]);
      bump('role_requirement'); for (const s of rs.source_refs) await sourceRef(c, 'role_requirement', r.rows[0].id, sourceIds.get(s)!);
    }
    /* ── tasks ── */
    const taskIds = new Map<string, string>();
    for (const t of pack.track.tasks) {
      const cur = await c.query('select id, review_status from task where code = $1', [t.code]);
      if (cur.rowCount && !EDITABLE.includes(cur.rows[0].review_status)) { skippedFrozen.push(`task ${t.code}`); taskIds.set(t.code, cur.rows[0].id); continue; }
      const r = await c.query(
        `insert into task (code, target_role_id, title_ar, title_en, description_ar, description_en, frequency, complexity, expected_output_ar, expected_output_en, expected_output_kind, typical_inputs_en, common_tools,
           common_failure_modes_ar, common_failure_modes_en, realism_notes_en, drafting_aid, is_demo_fixture)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         on conflict (code) do update set title_ar = excluded.title_ar, title_en = excluded.title_en, description_ar = excluded.description_ar, description_en = excluded.description_en, frequency = excluded.frequency,
           complexity = excluded.complexity, expected_output_ar = excluded.expected_output_ar, expected_output_en = excluded.expected_output_en, expected_output_kind = excluded.expected_output_kind,
           typical_inputs_en = excluded.typical_inputs_en, common_tools = excluded.common_tools, common_failure_modes_ar = excluded.common_failure_modes_ar, common_failure_modes_en = excluded.common_failure_modes_en,
           realism_notes_en = excluded.realism_notes_en, version = task.version + 1
         returning id`,
        [t.code, roleId, t.title_ar, t.title_en, t.description_ar, t.description_en, t.frequency, t.complexity, t.expected_output_ar, t.expected_output_en, t.expected_output_kind, t.typical_inputs_en ?? [], t.common_tools ?? [],
         t.common_failure_modes_ar, t.common_failure_modes_en, t.realism_notes_en ?? null, aid, demo]);
      taskIds.set(t.code, r.rows[0].id); bump('task');
      await c.query('delete from task_skill where task_id = $1', [r.rows[0].id]);
      for (const s of t.related_skills) { const sid = skillId(s.skill, `task ${t.code}`); if (sid) await c.query('insert into task_skill (task_id, skill_id, involvement) values ($1,$2,$3)', [r.rows[0].id, sid, s.involvement]); }
      for (const s of t.source_refs) await sourceRef(c, 'task', r.rows[0].id, sourceIds.get(s)!);
    }
    /* ── activities ── */
    const activityIds = new Map<string, string>();
    for (const a of pack.track.activities) {
      const cur = await c.query('select id, status from activity_spec where slug = $1 and version = $2', [a.code, a.version]);
      if (cur.rowCount && !EDITABLE.includes(cur.rows[0].status)) { skippedFrozen.push(`activity_spec ${a.code}@${a.version} (${cur.rows[0].status})`); activityIds.set(a.code, cur.rows[0].id); continue; }
      const r = await c.query(
        `insert into activity_spec (slug, version, title_ar, title_en, ai_usage_mode, estimated_minutes, target_role_id, level, business_context_ar, business_context_en, objective_ar, objective_en,
           can_yield_demonstrated, can_yield_verified, is_validation_activity, drafting_aid, is_demo_fixture)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,$14,$15,$16)
         on conflict (slug, version) do update set title_ar = excluded.title_ar, title_en = excluded.title_en, ai_usage_mode = excluded.ai_usage_mode, estimated_minutes = excluded.estimated_minutes, target_role_id = excluded.target_role_id,
           level = excluded.level, business_context_ar = excluded.business_context_ar, business_context_en = excluded.business_context_en, objective_ar = excluded.objective_ar, objective_en = excluded.objective_en,
           can_yield_demonstrated = excluded.can_yield_demonstrated, is_validation_activity = excluded.is_validation_activity
         returning id`,
        [a.code, a.version, a.title_ar, a.title_en, a.ai_usage_mode, a.estimated_minutes, roleId, a.level, a.business_context_ar, a.business_context_en, a.objective_ar, a.objective_en, a.can_yield_demonstrated, a.is_validation_activity, aid, demo]);
      const aid_ = r.rows[0].id as string; activityIds.set(a.code, aid_); bump('activity_spec');
      await c.query('delete from activity_input where activity_spec_id = $1', [aid_]);
      await c.query('delete from activity_deliverable where activity_spec_id = $1', [aid_]);
      await c.query('delete from activity_skill where activity_spec_id = $1', [aid_]);
      await c.query('delete from activity_task where activity_spec_id = $1', [aid_]);
      for (const i of a.inputs) await c.query('insert into activity_input (activity_spec_id, key, description_ar, description_en, is_platform_private, contains_planted_issue) values ($1,$2,$3,$4,$5,$6)', [aid_, i.key, i.description_ar, i.description_en, i.is_platform_private, i.contains_planted_issue]);
      let pos = 0; for (const d of a.deliverables) await c.query('insert into activity_deliverable (activity_spec_id, key, format, mandatory, description_ar, description_en, position) values ($1,$2,$3,$4,$5,$6,$7)', [aid_, d.key, d.format, d.mandatory, d.description_ar, d.description_en, pos++]);
      for (const s of a.related_skills) { const sid = skillId(s.skill, `activity ${a.code}`); if (sid) await c.query('insert into activity_skill (activity_spec_id, skill_id, depth) values ($1,$2,$3)', [aid_, sid, s.depth]); }
      for (const t of a.tasks) await c.query('insert into activity_task (activity_spec_id, task_id) values ($1,$2)', [aid_, taskIds.get(t)]);
      for (const ic of a.integrity_checks) {
        const cls = integrityClassificationOf(ic.check_type as IntegrityCheckType);
        await c.query(
          `insert into integrity_check_spec (activity_spec_id, key, classification, blocking, check_definition, user_facing_message, check_type, location_en, expected_user_behavior_en, raw_ai_output_behavior_en, linked_criterion_key)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           on conflict (activity_spec_id, key) do update set classification = excluded.classification, blocking = excluded.blocking, check_definition = excluded.check_definition, user_facing_message = excluded.user_facing_message,
             check_type = excluded.check_type, location_en = excluded.location_en, expected_user_behavior_en = excluded.expected_user_behavior_en, raw_ai_output_behavior_en = excluded.raw_ai_output_behavior_en, linked_criterion_key = excluded.linked_criterion_key`,
          [aid_, ic.key, cls, ic.blocking, JSON.stringify(ic.check_definition), cls === 'user_facing' ? ic.user_facing_message_ar ?? null : null, ic.check_type, ic.location_en, ic.expected_user_behavior_en, ic.raw_ai_output_behavior_en ?? null, ic.linked_criterion_key ?? null]);
      }
      for (const s of a.source_refs) await sourceRef(c, 'activity_spec', aid_, sourceIds.get(s)!);
    }
    /* ── rubrics ── */
    for (const rb of pack.track.rubrics) {
      const actId = activityIds.get(rb.activity)!;
      const cur = await c.query('select id, status from rubric_version where activity_spec_id = $1 and version = $2', [actId, rb.code]);
      if (cur.rowCount && !EDITABLE.includes(cur.rows[0].status)) { skippedFrozen.push(`rubric_version ${rb.code} (${cur.rows[0].status})`); continue; }
      const r = await c.query(
        `insert into rubric_version (activity_spec_id, version, pass_threshold, proposes_state, scoring_policy_version, drafting_aid, is_demo_fixture) values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (activity_spec_id, version) do update set pass_threshold = excluded.pass_threshold, proposes_state = excluded.proposes_state, scoring_policy_version = excluded.scoring_policy_version returning id`,
        [actId, rb.code, rb.pass_threshold, rb.proposes_state, rb.scoring_policy_version, aid, demo]);
      const rid = r.rows[0].id as string; bump('rubric_version');
      // Criteria are re-created from the pack; their provenance rows go with them (no dangling refs).
      await c.query(`delete from source_ref where entity_kind = 'rubric_criterion' and entity_id in (select id from rubric_criterion where rubric_version_id = $1)`, [rid]);
      await c.query('delete from rubric_criterion where rubric_version_id = $1', [rid]);
      let pos = 0;
      for (const cr of rb.criteria) {
        const sid = skillId(cr.linked_skill, `rubric ${rb.code}/${cr.key}`); if (!sid) continue;
        const chk = toCheckColumns(cr.check);
        const row = await c.query(
          `insert into rubric_criterion (rubric_version_id, key, position, name_ar, name_en, dimension, linked_skill_id, library_criterion_id, source, weight, max_score, mandatory, threshold_for_skill, evaluator_type, human_review_required,
             check_type, check_artifact_key, check_min_value, check_min_length, check_artifact_keys, description_ar, description_en, expected_evidence_ar, expected_evidence_en, excerpt_guidance_en, rationale_when_met_ar, rationale_when_unmet_ar)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) returning id`,
          [rid, cr.key, pos++, cr.name_ar, cr.name_en, cr.dimension, sid, cr.library_criterion ? libIds.get(cr.library_criterion) : null, cr.source, cr.weight, cr.max_score, cr.mandatory, cr.threshold_for_skill, cr.evaluator_type, cr.human_review_required,
           chk.type, chk.artifactKey, chk.min, chk.minLength, chk.artifactKeys, cr.description_ar, cr.description_en, cr.expected_evidence_ar, cr.expected_evidence_en, cr.excerpt_guidance_en ?? null, cr.rationale_when_met_ar, cr.rationale_when_unmet_ar]);
        for (const l of cr.levels) await c.query('insert into rubric_criterion_level (criterion_id, level_key, score, descriptor_ar, descriptor_en, observable_evidence_en) values ($1,$2,$3,$4,$5,$6)', [row.rows[0].id, l.level_key, l.score, l.descriptor_ar, l.descriptor_en, l.observable_evidence_en]);
        bump('rubric_criterion');
        for (const s of rb.source_refs) await sourceRef(c, 'rubric_criterion', row.rows[0].id, sourceIds.get(s)!);
      }
      for (const s of rb.source_refs) await sourceRef(c, 'rubric_version', rid, sourceIds.get(s)!);
    }
    /* ── learning resources (metadata only) ── */
    for (const lr of pack.global.resources) {
      const sid = skillId(lr.skill, `resource ${lr.code}`); const act = activityIds.get(lr.practice_activity); if (!sid || !act) { if (!act) unmapped.push(`resource ${lr.code}: activity '${lr.practice_activity}'`); continue; }
      const cur = await c.query('select id, review_status from learning_resource where code = $1', [lr.code]);
      if (cur.rowCount && !EDITABLE.includes(cur.rows[0].review_status)) { skippedFrozen.push(`learning_resource ${lr.code}`); continue; }
      const r = await c.query(
        `insert into learning_resource (code, skill_id, title, title_ar, url, language, provenance_class, provenance_source, provider, resource_type, level, duration_minutes, free_or_paid, why_recommended_ar, why_recommended_en,
           covers_target_level, quality_status, last_checked, practice_activity_spec_id, access_notes_en, drafting_aid, is_demo_fixture)
         values ($1,$2,$3,$4,$5,$6,'curated',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         on conflict (code) do update set skill_id = excluded.skill_id, title = excluded.title, title_ar = excluded.title_ar, url = excluded.url, language = excluded.language, provider = excluded.provider, resource_type = excluded.resource_type,
           level = excluded.level, duration_minutes = excluded.duration_minutes, free_or_paid = excluded.free_or_paid, why_recommended_ar = excluded.why_recommended_ar, why_recommended_en = excluded.why_recommended_en,
           covers_target_level = excluded.covers_target_level, quality_status = excluded.quality_status, last_checked = excluded.last_checked, practice_activity_spec_id = excluded.practice_activity_spec_id, access_notes_en = excluded.access_notes_en
         returning id`,
        [lr.code, sid, lr.title_en, lr.title_ar, lr.url, lr.language, provenanceSource, lr.provider, lr.resource_type, lr.level, lr.duration_minutes, lr.free_or_paid, lr.why_recommended_ar, lr.why_recommended_en,
         lr.covers_target_level, lr.quality_status, lr.last_checked, act, lr.access_notes_en ?? null, aid, demo]);
      bump('learning_resource'); for (const s of lr.source_refs) await sourceRef(c, 'learning_resource', r.rows[0].id, sourceIds.get(s)!);
    }
    /* ── provenance for global registries ── */
    for (const s of pack.global.skills) { const id = skillIds.get(s.code); if (id) for (const src of s.source_refs) await sourceRef(c, 'skill', id, sourceIds.get(src)!); }
    for (const [, id] of familyIds) await sourceRef(c, 'skill_family', id, primarySource);
    for (const [, id] of policyIds) await sourceRef(c, 'recency_policy', id, primarySource);
    await sourceRef(c, 'proficiency_scale', scaleId, primarySource);
    for (const [, id] of libIds) await sourceRef(c, 'criterion_library', id, primarySource);
    const syn = await c.query('select id from skill_synonym where is_demo_fixture = $1', [demo]); for (const r of syn.rows) await sourceRef(c, 'skill_synonym', r.id, primarySource);

    if (unmapped.length) throw new ImportError('map', 'unmapped references; nothing was written', unmapped);
    if (opts.dryRun) await c.query('rollback'); else await c.query('commit');
    return { packId: m.pack_id, packVersion: m.pack_version, isDemoFixture: demo, snapshots, normalizedRecords: normalized, nearDuplicates, written, skippedFrozen, unmapped };
  } catch (e) {
    await c.query('rollback').catch(() => undefined);
    throw e;
  } finally { c.release(); }
}

async function sourceRef(c: PoolClient, kind: string, entityId: string, sourceId: string): Promise<void> {
  await c.query('insert into source_ref (entity_kind, entity_id, source_id) values ($1,$2,$3) on conflict do nothing', [kind, entityId, sourceId]);
}

function toCheckColumns(check: PackCheckDef | undefined): { type: string; artifactKey: string | null; min: number | null; minLength: number | null; artifactKeys: string[] | null } {
  if (!check) return { type: 'none', artifactKey: null, min: null, minLength: null, artifactKeys: null };
  return { type: check.type, artifactKey: check.artifactKey ?? null, min: check.min ?? null, minLength: check.minLength ?? null, artifactKeys: check.artifactKeys ?? null };
}

/** Near-Duplicate Report as Markdown. Proposals only; decisions belong to a person. */
export function renderNearDuplicateReport(cands: readonly NearDuplicateCandidate[], packId: string, packVersion: string, decided: readonly { a_code: string; b_code: string; decision: string; decision_reason: string | null }[] = []): string {
  const lines = [`# Near-Duplicate Report — ${packId}@${packVersion}`, '', 'Proposed by the import pipeline from normalised match keys (domain: `nearDuplicateCandidates`). **Nothing here was merged.** A person decides: merge (`status = merged_into`, never a delete), link (a `skill_synonym` relation), keep separate, or reject.', '',
    '| A | B | similarity | on | decision |', '|---|---|---|---|---|'];
  for (const c of cands) { const d = decided.find((x) => x.a_code === c.aCode && x.b_code === c.bCode); lines.push(`| \`${c.aCode}\` | \`${c.bCode}\` | ${c.similarity} | ${c.onField} | ${d ? `${d.decision}${d.decision_reason ? ` — ${d.decision_reason}` : ''}` : 'proposed'} |`); }
  if (cands.length === 0) lines.push('| — | — | — | — | no candidates above threshold |');
  return lines.join('\n') + '\n';
}
