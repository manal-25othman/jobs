/**
 * Track pack contracts (docs/data-foundation/29) as TypeScript types, plus a
 * structural validator that fails loudly with EVERY problem, not the first.
 * The pack is the L2 (curated draft) source of truth authored by people; the
 * importer never invents a field the pack did not state.
 */
import {
  SKILL_TYPES, AI_SUBSTITUTABILITY, SYNONYM_RELATIONS, IMPORTANCE, EVIDENCE_TYPES, RUBRIC_DIMENSIONS, EVALUATOR_TYPES,
  INTEGRITY_CHECK_TYPES, PRESENTATION_ASSET_TYPES, RESOURCE_QUALITY, assertSynonymWellFormed, assertPresentationRuleSane,
  assertLearningResourceHonest, type SynonymRelation, type PresentationAssetType, type EvidenceState,
} from '@naqla/domain';

export interface PackSource { code: string; source_type: 'official' | 'curated' | 'platform_generated' | 'market_signal'; source_name: string; publisher?: string | null; jurisdiction: string; language: string; url: string | null; url_verified?: boolean; retrieved_at: string | null; version: string; license_or_usage_notes: string; reliability: 'high' | 'medium' | 'low'; }
export interface PackFamily { code: string; name_ar: string; name_en: string; description_ar?: string; description_en?: string; }
export interface PackScale { code: string; version: string; name_ar: string; name_en: string; levels: { level_key: string; ordinal: number; label_ar: string; label_en: string; descriptor_ar: string; descriptor_en: string; observable_ar?: string[]; observable_en?: string[] }[]; }
export interface PackRecency { code: string; applies_to: string; current_window_months: number; aging_window_months: number; stale_after_months: number; refresh_method: string; rationale: string; policy_version: string; }
export interface PackSkill { code: string; name_ar: string; name_en: string; family: string; skill_type: string; description_ar: string; description_en: string; observable_indicators_ar: string[]; observable_indicators_en: string[]; common_failure_modes_ar: string[]; common_failure_modes_en: string[]; ai_substitutability: string; recency_policy: string; proficiency_scale: string; evidence_types_possible: string[]; source_refs: string[]; }
export interface PackSynonym { skill: string; relation: SynonymRelation; surface_form?: string; language?: 'ar' | 'en'; form_type?: string; related_skill?: string; source: string; decided_by?: string; decided_at?: string; confidence?: 'high' | 'medium' | 'low'; }
export interface PackCriterionLib { key: string; name_ar: string; name_en: string; dimension: string; description_ar: string; description_en: string; default_evaluator: string; }
export interface PackPresentationRule { asset_type: PresentationAssetType; evidence_level: EvidenceState; allowed: boolean; minimum_source_strength: string | null; minimum_evidence_count: number; requires_verified: boolean; allowed_claim_verbs_ar: string[]; allowed_claim_verbs_en: string[]; forbidden_phrases_ar: string[]; forbidden_phrases_en: string[]; template_pattern_en?: string; numeric_claims_policy_en?: string; ai_disclosure_handling_en?: string; recency_handling_en?: string; language_target?: 'ar' | 'en'; on_user_edit_en?: string; source_refs: string[]; }
export interface PackResource { code: string; skill: string; title_ar: string; title_en: string; provider: string; resource_type: string; language: 'ar' | 'en'; level: string; duration_minutes: number; free_or_paid: string; url: string | null; why_recommended_ar: string; why_recommended_en: string; covers_target_level: boolean; practice_activity: string; quality_status: string; last_checked: string | null; access_notes_en?: string; source_refs: string[]; }
export interface PackManifest { pack_id: string; track_id: string; pack_version: string; status: string; dataset_label: string; is_demo_fixture: boolean; drafting_aid: 'none' | 'ai_assisted'; levels_included: string[]; language_coverage: string[]; region_scope?: string; primary_source: string; sources: string[]; global_registry_versions: Record<string, string>; framework_policy?: string; contents?: Record<string, number>; }
export interface PackRole { code: string; name_ar: string; name_en: string; family: string; level: 'junior' | 'mid' | 'senior'; description_ar: string; description_en: string; mission_statement_ar?: string; mission_statement_en?: string; typical_responsibilities_ar: string[]; typical_responsibilities_en: string[]; expected_outputs_ar: string[]; expected_outputs_en: string[]; expected_from_junior_ar: string[]; expected_from_junior_en: string[]; not_expected_from_junior_ar: string[]; not_expected_from_junior_en: string[]; common_tools: { name: string; criticality: 'essential' | 'common' | 'optional'; skill?: string; note_en?: string }[]; region_scope?: string; source_refs: string[]; }
export interface PackRoleSkill { skill: string; is_core_for_role: boolean; importance: string; target_proficiency: string; why_required_ar: string; why_required_en: string; evidence_type_expected: string[]; minimum_evidence_count: number; can_be_partially_auto_evaluated: boolean; human_review_required: boolean; source_refs: string[]; }
export interface PackTask { code: string; title_ar: string; title_en: string; description_ar: string; description_en: string; frequency: string; complexity: string; expected_output_ar: string; expected_output_en: string; expected_output_kind: string; typical_inputs_en?: string[]; common_tools?: string[]; common_failure_modes_ar: string[]; common_failure_modes_en: string[]; realism_notes_en?: string; related_skills: { skill: string; involvement: 'primary' | 'secondary' }[]; source_refs: string[]; }
export interface PackCheckDef { type: 'artifact_present' | 'artifact_at_least' | 'artifact_text' | 'all_of'; artifactKey?: string; artifactKeys?: string[]; min?: number; minLength?: number; }
export interface PackIntegrityCheck { key: string; check_type: string; blocking: boolean; location_en: string; expected_user_behavior_en: string; raw_ai_output_behavior_en?: string; user_facing_message_ar?: string; linked_criterion_key?: string; check_definition: PackCheckDef; }
export interface PackActivity { code: string; version: string; level: 'junior' | 'mid' | 'senior'; title_ar: string; title_en: string; business_context_ar: string; business_context_en: string; objective_ar: string; objective_en: string; ai_usage_mode: 'ai_prohibited' | 'ai_assisted' | 'ai_expected'; estimated_minutes: number; can_yield_demonstrated: boolean; can_yield_verified: boolean; is_validation_activity: boolean; inputs: { key: string; description_ar: string; description_en: string; is_platform_private: boolean; contains_planted_issue: boolean }[]; deliverables: { key: string; format: string; mandatory: boolean; description_ar: string; description_en: string }[]; related_skills: { skill: string; depth: 'primary' | 'secondary' }[]; tasks: string[]; integrity_checks: PackIntegrityCheck[]; rubric: string; source_refs: string[]; }
export interface PackCriterion { key: string; name_ar: string; name_en: string; dimension: string; linked_skill: string; library_criterion?: string; source: 'core' | 'track' | 'activity'; weight: number; max_score: number; mandatory: boolean; threshold_for_skill: number | null; evaluator_type: string; human_review_required: boolean; check?: PackCheckDef; description_ar: string; description_en: string; expected_evidence_ar: string; expected_evidence_en: string; excerpt_guidance_en?: string; rationale_when_met_ar: string; rationale_when_unmet_ar: string; levels: { level_key: string; score: number; descriptor_ar: string; descriptor_en: string; observable_evidence_en: string }[]; }
export interface PackRubric { code: string; activity: string; pass_threshold: number; proposes_state: EvidenceState; scoring_policy_version: string; criteria: PackCriterion[]; source_refs: string[]; }

export interface Pack {
  readonly global: { sources: PackSource[]; families: PackFamily[]; scale: PackScale; recency: PackRecency[]; skills: PackSkill[]; synonyms: PackSynonym[]; criteriaLibrary: PackCriterionLib[]; presentationRules: PackPresentationRule[]; resources: PackResource[] };
  readonly track: { manifest: PackManifest; role: PackRole; roleSkills: PackRoleSkill[]; tasks: PackTask[]; activities: PackActivity[]; rubrics: PackRubric[] };
}

export class PackValidationError extends Error {
  constructor(readonly problems: readonly string[]) { super(`pack validation failed with ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`); }
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

/** Structural + cross-reference validation. Every problem is reported. */
export function validatePack(p: Pack): void {
  const problems: string[] = [];
  const need = (cond: boolean, msg: string) => { if (!cond) problems.push(msg); };
  const codes = new Set<string>();
  const uniq = (kind: string, code: string) => { const k = `${kind}:${code}`; need(!codes.has(k), `duplicate ${kind} code '${code}'`); codes.add(k); };
  const sources = new Set(p.global.sources.map((s) => s.code));
  const families = new Set(p.global.families.map((f) => f.code));
  const policies = new Set(p.global.recency.map((r) => r.code));
  const skillCodes = new Set(p.global.skills.map((s) => s.code));
  const libKeys = new Set(p.global.criteriaLibrary.map((c) => c.key));
  const taskCodes = new Set(p.track.tasks.map((t) => t.code));
  const activityCodes = new Set(p.track.activities.map((a) => a.code));
  const rubricCodes = new Set(p.track.rubrics.map((r) => r.code));
  const refsOk = (owner: string, refs: string[] | undefined) => {
    need(isArr(refs) && refs.length > 0, `${owner}: source_refs must name at least one source (provenance)`);
    for (const r of refs ?? []) need(sources.has(r), `${owner}: unknown source '${r}'`);
  };
  const bilingual = (owner: string, o: Record<string, unknown>, base: string) => {
    need(isStr(o[`${base}_ar`]), `${owner}: ${base}_ar is required`); need(isStr(o[`${base}_en`]), `${owner}: ${base}_en is required`);
  };

  for (const s of p.global.sources) {
    uniq('source', s.code); need(/^src_[a-z0-9_]+$/.test(s.code), `source '${s.code}': code must be src_snake_case`);
    need(isStr(s.license_or_usage_notes), `source '${s.code}': license_or_usage_notes is required (a source without a clear license does not enter the raw layer)`);
    need(['official', 'curated', 'platform_generated', 'market_signal'].includes(s.source_type), `source '${s.code}': bad source_type`);
  }
  need(p.global.sources.every((s) => s.source_type !== 'market_signal'), 'no market_signal source may be imported in this phase');
  for (const f of p.global.families) { uniq('family', f.code); bilingual(`family '${f.code}'`, f as never, 'name'); }
  need(isStr(p.global.scale.code) && p.global.scale.levels.length >= 3, 'proficiency scale needs a code and at least three levels');
  const levelKeys = new Set(p.global.scale.levels.map((l) => l.level_key));
  for (const r of p.global.recency) { uniq('recency_policy', r.code); need(r.current_window_months <= r.aging_window_months && r.aging_window_months <= r.stale_after_months, `recency '${r.code}': windows must be non-decreasing`); }

  for (const s of p.global.skills) {
    const o = `skill '${s.code}'`; uniq('skill', s.code);
    need(/^[a-z][a-z0-9_-]+$/.test(s.code), `${o}: code must be ASCII`);
    bilingual(o, s as never, 'name'); bilingual(o, s as never, 'description');
    need(families.has(s.family), `${o}: unknown family '${s.family}'`);
    need((SKILL_TYPES as readonly string[]).includes(s.skill_type), `${o}: bad skill_type '${s.skill_type}'`);
    need((AI_SUBSTITUTABILITY as readonly string[]).includes(s.ai_substitutability), `${o}: bad ai_substitutability`);
    need(policies.has(s.recency_policy), `${o}: unknown recency policy '${s.recency_policy}'`);
    need(s.proficiency_scale === p.global.scale.code, `${o}: unknown proficiency scale`);
    need(s.observable_indicators_en.length > 0 && s.observable_indicators_ar.length > 0, `${o}: observable indicators are required in both languages (a skill without indicators is not measurable)`);
    for (const e of s.evidence_types_possible) need((EVIDENCE_TYPES as readonly string[]).includes(e), `${o}: bad evidence type '${e}'`);
    refsOk(o, s.source_refs);
  }
  // Duplicate canonical names within the pack (exact key match).
  const seenEn = new Map<string, string>(); const seenAr = new Map<string, string>();
  for (const s of p.global.skills) {
    const en = s.name_en.trim().toLowerCase(); const ar = s.name_ar.trim();
    if (seenEn.has(en)) problems.push(`skills '${seenEn.get(en)}' and '${s.code}' share the canonical English name`); seenEn.set(en, s.code);
    if (seenAr.has(ar)) problems.push(`skills '${seenAr.get(ar)}' and '${s.code}' share the canonical Arabic name`); seenAr.set(ar, s.code);
  }
  for (const y of p.global.synonyms) {
    const o = `synonym for '${y.skill}' (${y.relation}${y.surface_form ? ` "${y.surface_form}"` : ''}${y.related_skill ? ` → ${y.related_skill}` : ''})`;
    need((SYNONYM_RELATIONS as readonly string[]).includes(y.relation), `${o}: bad relation`);
    need(sources.has(y.source), `${o}: unknown source`);
    try { assertSynonymWellFormed({ skillId: y.skill, relation: y.relation, surfaceForm: y.surface_form ?? null, relatedSkillId: y.related_skill ?? null }); }
    catch (e) { problems.push(`${o}: ${(e as Error).message}`); }
    if (y.surface_form) need(y.language === 'ar' || y.language === 'en', `${o}: language is required for a surface form`);
  }
  for (const c of p.global.criteriaLibrary) { uniq('criterion_library', c.key); need((RUBRIC_DIMENSIONS as readonly string[]).includes(c.dimension), `library '${c.key}': bad dimension`); need((EVALUATOR_TYPES as readonly string[]).includes(c.default_evaluator), `library '${c.key}': bad evaluator`); }
  const ruleKeys = new Set<string>();
  for (const r of p.global.presentationRules) {
    const o = `presentation rule ${r.asset_type}@${r.evidence_level}`;
    need((PRESENTATION_ASSET_TYPES as readonly string[]).includes(r.asset_type), `${o}: bad asset type`);
    need(!ruleKeys.has(`${r.asset_type}@${r.evidence_level}`), `${o}: duplicate`); ruleKeys.add(`${r.asset_type}@${r.evidence_level}`);
    try { assertPresentationRuleSane({ assetType: r.asset_type, evidenceLevel: r.evidence_level, allowed: r.allowed, mustCiteEvidence: true, allowedVerbsEn: r.allowed_claim_verbs_en, forbiddenPhrasesEn: r.forbidden_phrases_en }); }
    catch (e) { problems.push(`${o}: ${(e as Error).message}`); }
    refsOk(o, r.source_refs);
  }
  for (const a of PRESENTATION_ASSET_TYPES) for (const l of ['practiced', 'demonstrated', 'verified']) need(ruleKeys.has(`${a}@${l}`), `presentation rules: missing ${a}@${l} (G-14)`);
  const perSkill = new Map<string, number>();
  for (const r of p.global.resources) {
    const o = `resource '${r.code}'`; uniq('resource', r.code);
    need(skillCodes.has(r.skill) || /^[a-z-]+$/.test(r.skill), `${o}: unknown skill '${r.skill}'`);
    bilingual(o, r as never, 'title'); bilingual(o, r as never, 'why_recommended');
    need(activityCodes.has(r.practice_activity), `${o}: practice_activity '${r.practice_activity}' is not an activity in this pack (a recommendation without practice is refused)`);
    need((RESOURCE_QUALITY as readonly string[]).includes(r.quality_status), `${o}: bad quality_status`);
    need(levelKeys.has(r.level), `${o}: level '${r.level}' is not on the proficiency scale`);
    try { assertLearningResourceHonest({ url: r.url, qualityStatus: r.quality_status, practiceActivityRef: r.practice_activity }); } catch (e) { problems.push(`${o}: ${(e as Error).message}`); }
    perSkill.set(r.skill, (perSkill.get(r.skill) ?? 0) + 1);
    refsOk(o, r.source_refs);
  }
  for (const [s, n] of perSkill) need(n <= 3, `skill '${s}' has ${n} resources; at most 3 per gap`);

  const m = p.track.manifest;
  need(isStr(m.pack_id) && isStr(m.pack_version), 'manifest: pack_id and pack_version are required');
  need(m.dataset_label === 'DEMO / DRAFT / NOT SME APPROVED' || m.is_demo_fixture === false, 'manifest: a demo pack must carry the label DEMO / DRAFT / NOT SME APPROVED');
  need(sources.has(m.primary_source), `manifest: unknown primary_source '${m.primary_source}'`);
  need(m.status === 'draft' || m.status === 'curated', `manifest: an imported pack is draft or curated, never '${m.status}' (review happens in the database)`);
  const role = p.track.role;
  bilingual('role', role as never, 'name'); bilingual('role', role as never, 'description');
  need(role.expected_from_junior_en.length > 0 && role.not_expected_from_junior_en.length > 0, 'role: what is and is not expected from a junior must both be stated');
  refsOk('role', role.source_refs);
  const forbiddenFrameworks = /\b(react|vue|angular|next\.js|svelte)\b/i;
  const roleText = JSON.stringify([role.description_en, role.typical_responsibilities_en, role.expected_from_junior_en, role.common_tools.map((t) => t.name)]);
  need(!forbiddenFrameworks.test(roleText), 'role: no framework may appear in the role definition, its responsibilities or its tools (framework-independent track)');
  const mapped = new Set<string>(); let core = 0;
  for (const rs of p.track.roleSkills) {
    const o = `role_skill '${rs.skill}'`;
    need(!mapped.has(rs.skill), `${o}: mapped twice`); mapped.add(rs.skill);
    need((IMPORTANCE as readonly string[]).includes(rs.importance), `${o}: bad importance`);
    need(levelKeys.has(rs.target_proficiency), `${o}: target_proficiency not on the scale`);
    bilingual(o, rs as never, 'why_required'); refsOk(o, rs.source_refs);
    if (rs.is_core_for_role) core++;
  }
  need(core >= 4 && core <= 5, `role: core skills must be 4–5, found ${core}`);
  for (const t of p.track.tasks) {
    const o = `task '${t.code}'`; uniq('task', t.code); bilingual(o, t as never, 'title'); bilingual(o, t as never, 'description'); bilingual(o, t as never, 'expected_output');
    need(t.related_skills.length > 0, `${o}: related skills required`);
    for (const r of t.related_skills) need(skillCodes.has(r.skill) || mapped.has(r.skill), `${o}: unknown skill '${r.skill}'`);
    need(t.common_failure_modes_en.length > 0, `${o}: common failure modes are required (they seed integrity checks)`);
    refsOk(o, t.source_refs);
  }
  need(p.track.tasks.length >= 10 && p.track.tasks.length <= 12, `tasks: 10–12 expected, found ${p.track.tasks.length}`);
  need(p.track.activities.length === 3, `activities: exactly 3 expected in the first track, found ${p.track.activities.length}`);
  const allCheckTypes = [...INTEGRITY_CHECK_TYPES.user_facing, ...INTEGRITY_CHECK_TYPES.assessment_only] as readonly string[];
  for (const a of p.track.activities) {
    const o = `activity '${a.code}'`; uniq('activity', a.code);
    bilingual(o, a as never, 'title'); bilingual(o, a as never, 'business_context'); bilingual(o, a as never, 'objective');
    need(a.can_yield_verified === false, `${o}: can_yield_verified must stay false until SME approval and a verification policy exist`);
    need(rubricCodes.has(a.rubric), `${o}: rubric '${a.rubric}' not in pack`);
    const primaries = a.related_skills.filter((s) => s.depth === 'primary');
    need(primaries.length >= 2 && primaries.length <= 3, `${o}: an activity measures 2–3 skills deeply (primary), found ${primaries.length}`);
    for (const s of a.related_skills) need(skillCodes.has(s.skill) || mapped.has(s.skill), `${o}: unknown skill '${s.skill}'`);
    for (const t of a.tasks) need(taskCodes.has(t), `${o}: unknown task '${t}'`);
    need(a.inputs.some((i) => i.is_platform_private), `${o}: at least one platform-private input (I1)`);
    const userFacing = a.integrity_checks.filter((c) => (INTEGRITY_CHECK_TYPES.user_facing as readonly string[]).includes(c.check_type));
    const assessment = a.integrity_checks.filter((c) => (INTEGRITY_CHECK_TYPES.assessment_only as readonly string[]).includes(c.check_type));
    need(assessment.length >= 1, `${o}: at least one assessment-only integrity check (I2)`);
    need(userFacing.some((c) => c.check_type === 'explanation_question'), `${o}: an explanation question is required (I3)`);
    for (const c of a.integrity_checks) {
      need(allCheckTypes.includes(c.check_type), `${o}/${c.key}: bad check_type`);
      const uf = (INTEGRITY_CHECK_TYPES.user_facing as readonly string[]).includes(c.check_type);
      need(!uf || isStr(c.user_facing_message_ar), `${o}/${c.key}: a user-facing check needs its Arabic message`);
      need(uf || !c.user_facing_message_ar, `${o}/${c.key}: an assessment-only check carries no user-facing message`);
      need(!c.raw_ai_output_behavior_en || !uf, `${o}/${c.key}: raw_ai_output_behavior belongs to assessment-only checks`);
    }
    refsOk(o, a.source_refs);
  }
  for (const r of p.track.rubrics) {
    const o = `rubric '${r.code}'`; uniq('rubric', r.code);
    need(activityCodes.has(r.activity), `${o}: unknown activity`);
    need(r.proposes_state !== 'verified', `${o}: a rubric never proposes verified (D-059)`);
    need(r.pass_threshold > 0 && r.pass_threshold <= 1, `${o}: pass_threshold in (0,1]`);
    need(r.criteria.length >= 5, `${o}: at least five criteria`);
    const keys = new Set<string>();
    for (const c of r.criteria) {
      const co = `${o}/${c.key}`; need(!keys.has(c.key), `${co}: duplicate key`); keys.add(c.key);
      need(skillCodes.has(c.linked_skill) || mapped.has(c.linked_skill), `${co}: linked_skill '${c.linked_skill}' unknown (a criterion without a linked skill produces no evidence)`);
      need((RUBRIC_DIMENSIONS as readonly string[]).includes(c.dimension), `${co}: bad dimension`);
      need((EVALUATOR_TYPES as readonly string[]).includes(c.evaluator_type), `${co}: bad evaluator_type`);
      need(c.evaluator_type !== 'rule' || !!c.check, `${co}: a rule-evaluated criterion needs a deterministic check`);
      need(c.evaluator_type === 'rule' || !c.check, `${co}: a human/llm criterion carries no deterministic check`);
      need(c.evaluator_type !== 'human' || c.human_review_required, `${co}: a human criterion requires human review`);
      need(c.levels.length >= 2, `${co}: level definitions are required (a criterion without descriptors is rejected, G-8)`);
      need(c.levels.some((l) => l.score === c.max_score) && c.levels.some((l) => l.score === 0), `${co}: levels must span 0..max_score`);
      if (c.library_criterion) need(libKeys.has(c.library_criterion), `${co}: unknown library criterion '${c.library_criterion}'`);
      bilingual(co, c as never, 'name'); bilingual(co, c as never, 'description'); bilingual(co, c as never, 'expected_evidence');
    }
    refsOk(o, r.source_refs);
    // integrity checks that name a criterion must name one that exists
    const act = p.track.activities.find((a) => a.code === r.activity)!;
    for (const c of act.integrity_checks) if (c.linked_criterion_key) need(keys.has(c.linked_criterion_key), `${o}: integrity check '${c.key}' links unknown criterion '${c.linked_criterion_key}'`);
  }
  // Every core skill: covered by ≥1 activity through a linked criterion (evidence path).
  for (const rs of p.track.roleSkills.filter((x) => x.is_core_for_role)) {
    const acts = new Set<string>();
    for (const r of p.track.rubrics) if (r.criteria.some((c) => c.linked_skill === rs.skill)) acts.add(r.activity);
    need(acts.size >= 1, `core skill '${rs.skill}' has no evidence path: no activity measures it through a linked criterion`);
  }
  if (problems.length) throw new PackValidationError(problems);
}
