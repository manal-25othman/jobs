import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertPackConstraintsSaneV2, parseSkillEvidencePathParams, type PackConstraintV2, type PackConstraintTypeV2, type SkillEvidencePathParams } from '@naqla/domain';
import { loadPack, type RawFile } from './pack-loader';
import { validatePack, packFormatVersion, PackValidationError, type Pack } from './pack-schema';

/**
 * A track CANDIDATE (data/candidates/<name>/): a draft pack plus its text-only governed configuration (schema-2 pack
 * constraints, per-skill evidence paths). Validated here without a database and without importing anything: a
 * candidate is never written, and a format-2 pack is not importable until CHG-017 and publication.
 */
export interface CandidatePath { path: string; skill: string; class: 'must' | 'core'; params: Record<string, unknown>; sme_basis: string }
export interface CandidateBundle {
  pack: Pack; files: RawFile[];
  constraints: { ref: string; constraints: []; schemaVersion: 2; constraintsV2: PackConstraintV2[] };
  paths: CandidatePath[];
}
export interface CoverageRow {
  skill: string; cls: string; source: string; sourceRef: string; minDistinctTasks: number | null;
  measuredBy: { activity: string; criteria: string[]; primary: boolean; validation: boolean }[]; path: string | null;
}
export interface CandidateReport { packId: string; packVersion: string; format: 1 | 2; problems: string[]; advisories: string[]; coverage: CoverageRow[]; importable: false }

export function loadCandidate(candidateDir: string, canonicalRoot: string, packId = 'trk_frontend_junior'): CandidateBundle {
  const { pack, files } = loadPack(candidateDir, packId, canonicalRoot);
  const c = JSON.parse(readFileSync(join(candidateDir, 'pack_constraints_v2.candidate.json'), 'utf8')) as { key: string; version: number; constraints: { type: string; min: number | null; max: number | null }[] };
  const p = JSON.parse(readFileSync(join(candidateDir, 'evidence_paths.candidate.json'), 'utf8')) as { paths: CandidatePath[] };
  return { pack, files, paths: p.paths,
    constraints: { ref: `${c.key}@${c.version} (candidate text)`, constraints: [], schemaVersion: 2, constraintsV2: c.constraints.map((x) => ({ type: x.type as PackConstraintTypeV2, min: x.min, max: x.max })) } };
}

/** The per-skill paths agree with the pack: one per Must/Core skill (none for Supporting), real criteria of that skill, enough distinct activities. */
export function validateCandidatePaths(pack: Pack, paths: readonly CandidatePath[]): string[] {
  const out: string[] = [];
  const role = new Map(pack.track.roleSkills.map((r) => [r.skill, r]));
  const acts = new Map(pack.track.activities.map((a) => [a.code, a]));
  const rubricOf = (code: string) => pack.track.rubrics.find((r) => r.activity === code);
  const seen = new Set<string>();
  for (const x of paths) {
    const o = `path ${x.path} (${x.skill})`;
    if (seen.has(x.skill)) out.push(`${o}: a second path for the same skill`); seen.add(x.skill);
    const rs = role.get(x.skill);
    if (!rs) { out.push(`${o}: not a skill of this role`); continue; }
    if (rs.professional_class !== x.class) out.push(`${o}: declared ${x.class} but the pack classifies it ${rs.professional_class ?? 'unclassified'}`);
    let params: SkillEvidencePathParams;
    try { params = parseSkillEvidencePathParams(x.params, x.path); } catch (e) { out.push(`${o}: ${(e as Error).message}`); continue; }
    if (params.min_distinct_tasks !== rs.minimum_evidence_count) out.push(`${o}: min_distinct_tasks ${params.min_distinct_tasks} differs from the role skill's minimum_evidence_count ${rs.minimum_evidence_count}`);
    const counted = Object.entries(params.counted_criteria);
    if (counted.length < params.min_distinct_tasks) out.push(`${o}: needs ${params.min_distinct_tasks} distinct tasks but counts only ${counted.length} activit${counted.length === 1 ? 'y' : 'ies'}`);
    for (const [code, spec] of counted) {
      const a = acts.get(code); const rb = rubricOf(code);
      if (!a || !rb) { out.push(`${o}: counts unknown activity '${code}'`); continue; }
      if (spec.versions !== '*' && !spec.versions.includes(a.version)) out.push(`${o}: counts ${code} at ${spec.versions.join(',')} but the candidate is ${a.version}`);
      for (const k of spec.criteria) {
        const c = rb.criteria.find((y) => y.key === k);
        if (!c) out.push(`${o}: ${code} has no criterion '${k}'`);
        else if ((c.criterion_kind ?? 'skill_evidence') !== 'skill_evidence' || c.linked_skill !== x.skill) out.push(`${o}: ${code}.${k} does not measure ${x.skill}`);
      }
    }
    if (params.require_validation_activity && !counted.some(([code]) => acts.get(code)?.is_validation_activity)) out.push(`${o}: requires a validation activity but counts none`);
    if (params.understanding_source) {
      const rb = rubricOf(params.understanding_source.activity);
      for (const k of params.understanding_source.criteria) if (!rb?.criteria.some((y) => y.key === k)) out.push(`${o}: understanding source ${params.understanding_source.activity}.${k} does not exist`);
    }
  }
  for (const rs of pack.track.roleSkills) {
    const required = rs.professional_class === 'must' || rs.professional_class === 'core';
    if (required && !seen.has(rs.skill)) out.push(`${rs.professional_class} skill '${rs.skill}' has no explicit evidence path`);
    if (!required && seen.has(rs.skill)) out.push(`supporting skill '${rs.skill}' has an evidence path: a Supporting skill never blocks`);
  }
  return out;
}

export function candidateCoverage(pack: Pack, paths: readonly CandidatePath[]): CoverageRow[] {
  return pack.track.roleSkills.map((rs) => ({
    skill: rs.skill, cls: rs.professional_class ?? '—', source: rs.class_source ?? '—', sourceRef: rs.class_source_ref ?? '—',
    minDistinctTasks: paths.find((p) => p.skill === rs.skill) ? rs.minimum_evidence_count : null,
    path: paths.find((p) => p.skill === rs.skill)?.path ?? null,
    measuredBy: pack.track.activities.map((a) => ({
      activity: a.code, primary: a.related_skills.some((s) => s.skill === rs.skill && s.depth === 'primary'), validation: a.is_validation_activity,
      criteria: (pack.track.rubrics.find((r) => r.activity === a.code)?.criteria ?? []).filter((c) => c.linked_skill === rs.skill).map((c) => c.key),
    })).filter((m) => m.criteria.length > 0),
  }));
}

/**
 * Advisories (not problems): a global learning resource whose practice activity no longer measures the resource's skill
 * in the candidate. The link still resolves (the code is kept, J-7), but its meaning is stale; repointing it is a change
 * to the global registry, decided at publication — never made by a candidate.
 */
export function candidateAdvisories(pack: Pack): string[] {
  const measures = (activity: string, skill: string) => pack.track.rubrics.some((r) => r.activity === activity && r.criteria.some((c) => c.linked_skill === skill));
  const links = new Map((pack.track.resourceLinks ?? []).map((l) => [l.resource, l.practice_activity]));
  return pack.global.resources.map((r) => ({ r, practice: links.get(r.code) ?? r.practice_activity }))
    .filter(({ r, practice }) => pack.track.activities.some((a) => a.code === practice) && !measures(practice, r.skill))
    .map(({ r, practice }) => `learning resource '${r.code}' (${r.skill}) practises in ${practice}, which does not measure that skill; ${pack.track.activities.filter((a) => measures(a.code, r.skill)).map((a) => a.code).join(' or ') || 'no activity'} does (name it in resource_links.json)`);
}

/** Validation only. Never imports, never writes, never resolves anything from a database. */
export function validateCandidate(b: CandidateBundle): CandidateReport {
  const problems: string[] = [];
  const m = b.pack.track.manifest;
  if (packFormatVersion(b.pack) !== 2) problems.push('a v2 candidate declares pack_format_version 2');
  if (m.status !== 'draft') problems.push(`a candidate stays draft (found '${m.status}')`);
  try { assertPackConstraintsSaneV2(b.constraints.constraintsV2); } catch (e) { problems.push(`candidate constraints: ${(e as Error).message}`); }
  try { validatePack(b.pack, b.constraints); } catch (e) { if (e instanceof PackValidationError) problems.push(...e.problems); else throw e; }
  problems.push(...validateCandidatePaths(b.pack, b.paths));
  return { packId: m.pack_id, packVersion: m.pack_version, format: packFormatVersion(b.pack), problems, advisories: candidateAdvisories(b.pack), coverage: candidateCoverage(b.pack, b.paths), importable: false };
}
