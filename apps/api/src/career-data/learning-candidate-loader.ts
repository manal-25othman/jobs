/**
 * Phase B, package 2 (PO decision 2) — loads the CANDIDATE learning resources of the development pilot into the
 * existing registry (`learning_resource`), as draft, unverified, demo-fixture rows. No parallel registry.
 *
 *  - development only: refused in production (D-135 scope); pilot skills and activities only;
 *  - every record is born draft + unverified, with its provenance (one research source) and how its link was
 *    checked (`search_index` — seen in a search result, never opened). No duration is written without a basis;
 *  - each record names a practice activity of the pilot that exercises the skill (FR-A-011); the loader refuses one
 *    that does not;
 *  - the global pack constraint `resources_per_skill_max` is respected, never changed: a skill is filled up to it in the
 *    research's priority order (existing rows count); the remaining candidates stay in the file, reported as not loaded;
 *  - idempotent: a row already past draft review is never touched; a draft row is refreshed;
 *  - a later direct check (verification/direct-check-*.json, produced in a separate research session) is applied
 *    only as recorded facts: link_check = direct, last_checked, usage terms. A failed check flags the row.
 *    Nothing here reviews, approves or publishes a resource: that stays the human review workflow.
 * The load is audited.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { resolvePackConstraints } from '@naqla/domain';
import { loadPackConstraintSets } from './pack-constraints';

export class LearningCandidateLoadError extends Error { override readonly name = 'LearningCandidateLoadError'; }

interface CandidateRecord {
  code: string; skill: string; title_en: string; title_ar: string; provider: string; url: string; host: string; resource_type: string;
  language: string; level: string; free_or_paid: string; duration_minutes: null; duration_note_en: string | null;
  why_recommended_en: string; why_recommended_ar: string; practice_activity: string; link_check: 'search_index'; link_checked_on: string;
}
interface CandidateFile { version: string; source: string; records: CandidateRecord[] }
interface DirectCheckFile {
  resources: { code: string; opened: boolean; http_status?: number | null; title_matches?: boolean | 'partial' | null; checked_at?: string | null; notes?: string | null }[];
  hosts: { host: string; opened: boolean; licence_as_stated?: string | null; linking_allowed_note?: string | null; terms_url?: string | null; checked_at?: string | null }[];
}

export interface LearningCandidateLoadReport {
  readonly version: string;
  readonly written: number;
  readonly refreshed: number;
  readonly skippedReviewed: string[];
  /** Candidates not loaded because their skill already holds `resources_per_skill_max` resources. */
  readonly overLimit: string[];
  readonly perSkillMax: number;
  readonly directChecksApplied: number;
  readonly flagged: string[];
}

const EDITABLE = ['draft', 'curated', 'needs_revision'];
const SOURCE_NOTES = 'Candidate list prepared on 2026-11-25 from web search results (domain-restricted). Links only: no content is copied or redistributed. Each provider\'s own usage terms must be checked directly before a resource is reviewed (PO decision 2).';

export async function loadLearningCandidates(pool: Pool, opts: { candidatesDir: string; byLabel: string; reason: string; production: boolean }): Promise<LearningCandidateLoadReport> {
  if (opts.production) throw new LearningCandidateLoadError('candidate learning resources are never loaded in production (PO decision 2)');
  if (!opts.byLabel?.trim() || !opts.reason?.trim()) throw new LearningCandidateLoadError('a candidate load needs a name and a reason');
  const file = JSON.parse(readFileSync(join(opts.candidatesDir, 'resources.candidate.json'), 'utf8')) as CandidateFile;
  const checks = readDirectChecks(join(opts.candidatesDir, 'verification'));

  const role = (await pool.query(`select r.id from target_role r join pilot_content_load l on l.target_role_id = r.id order by l.loaded_at desc limit 1`)).rows[0];
  if (!role) throw new LearningCandidateLoadError('no development pilot is loaded; run the pilot loader first');

  const c = await pool.connect();
  let written = 0, refreshed = 0, directChecksApplied = 0; let perSkillMax: number | null = null; const skippedReviewed: string[] = []; const flagged: string[] = []; const overLimit: string[] = [];
  try {
    await c.query('begin');
    perSkillMax = resolvePackConstraints(await loadPackConstraintSets(c), '', { production: false }).constraints.find((x) => x.type === 'resources_per_skill_max')?.max ?? null;
    if (perSkillMax == null) throw new LearningCandidateLoadError('pack constraints: resources_per_skill_max is not configured; no candidate is loaded');
    const sourceId = await ensureSource(c, file);
    for (const r of file.records) {
      if (!/^lrc_[a-z0-9_]+$/.test(r.code)) throw new LearningCandidateLoadError(`bad candidate code '${r.code}'`);
      if (!/^https:\/\/[^\s]+$/.test(r.url)) throw new LearningCandidateLoadError(`${r.code}: a candidate needs an https URL`);
      if (r.duration_minutes !== null) throw new LearningCandidateLoadError(`${r.code}: no duration without a stated basis`);
      const skill = (await c.query(`select rr.skill_id from role_requirement rr join skill s on s.id = rr.skill_id where rr.target_role_id = $1 and s.slug = $2`, [role.id, r.skill])).rows[0];
      if (!skill) throw new LearningCandidateLoadError(`${r.code}: '${r.skill}' is not a skill of the pilot role`);
      const act = (await c.query(`select a.id from activity_spec a join activity_skill k on k.activity_spec_id = a.id and k.skill_id = $3 where a.target_role_id = $1 and a.slug = $2`,
        [role.id, r.practice_activity, skill.skill_id])).rows[0];
      if (!act) throw new LearningCandidateLoadError(`${r.code}: '${r.practice_activity}' is not a pilot activity that exercises ${r.skill} (a recommendation without practice is refused)`);

      const cur = (await c.query('select id, review_status::text as status from learning_resource where code = $1 and is_demo_fixture', [r.code])).rows[0];
      if (cur && !EDITABLE.includes(cur.status)) { skippedReviewed.push(r.code); continue; }
      if (!cur) {
        // Counted per skill slug, exactly as quality rule Q08 counts (a demo and a canonical skill can share a slug).
        const n = Number((await c.query('select count(*)::int n from learning_resource lr join skill s on s.id = lr.skill_id where s.slug = $1', [r.skill])).rows[0].n);
        if (n >= perSkillMax) { overLimit.push(r.code); continue; }
      }
      const notes = [`Seen verbatim in a web search result on ${r.link_checked_on}; the page was not opened and the provider's usage terms were not checked.`,
        r.duration_note_en ? `Duration not recorded: "${r.duration_note_en}" (not stated on the page).` : null].filter(Boolean).join(' ');
      const row = (await c.query(
        `insert into learning_resource (code, skill_id, title, title_ar, url, language, provenance_class, provenance_source, provider, resource_type, level, duration_minutes, free_or_paid,
           why_recommended_ar, why_recommended_en, covers_target_level, quality_status, review_status, link_check, last_checked, practice_activity_spec_id, access_notes_en, drafting_aid, is_demo_fixture)
         values ($1,$2,$3,$4,$5,$6,'curated',$7,$8,$9,$10,null,$11,$12,$13,true,'unverified','draft','search_index',$14,$15,$16,'ai_assisted',true)
         on conflict (code) where is_demo_fixture = true do update set skill_id = excluded.skill_id, title = excluded.title, title_ar = excluded.title_ar, url = excluded.url, language = excluded.language,
           provider = excluded.provider, resource_type = excluded.resource_type, level = excluded.level, free_or_paid = excluded.free_or_paid, why_recommended_ar = excluded.why_recommended_ar,
           why_recommended_en = excluded.why_recommended_en, practice_activity_spec_id = excluded.practice_activity_spec_id, access_notes_en = excluded.access_notes_en
         returning id, (xmax = 0) as inserted`,
        [r.code, skill.skill_id, r.title_en, r.title_ar, r.url, r.language, `NAQLA resource research ${file.version} (search index)`, r.provider, r.resource_type, r.level, r.free_or_paid,
         r.why_recommended_ar, r.why_recommended_en, r.link_checked_on, act.id, notes])).rows[0];
      if (row.inserted) written++; else refreshed++;
      await c.query('insert into source_ref (entity_kind, entity_id, source_id, note_en) values ($1,$2,$3,$4) on conflict do nothing', ['learning_resource', row.id, sourceId, `candidate ${file.version}`]);

      const check = checks?.resources.find((x) => x.code === r.code);
      if (check?.opened) {
        const host = checks!.hosts.find((h) => h.host === r.host);
        const ok = (check.http_status ?? 0) >= 200 && (check.http_status ?? 0) < 400 && check.title_matches !== false;
        const licence = host?.opened && host.licence_as_stated && !/^unclear/i.test(host.licence_as_stated.trim()) ? host.licence_as_stated : null;
        const termsChecked = licence ? (host!.checked_at ?? check.checked_at)?.slice(0, 10) ?? null : null;
        await c.query(
          `update learning_resource set link_check = 'direct', last_checked = $2, usage_terms_checked = $3, usage_terms_note = $4, quality_status = $5,
             access_notes_en = $6 where id = $1`,
          [row.id, (check.checked_at ?? r.link_checked_on).slice(0, 10), termsChecked,
           licence ? `${licence}${host!.linking_allowed_note ? ` — ${host!.linking_allowed_note}` : ''}${host!.terms_url ? ` (${host!.terms_url})` : ''}` : null,
           ok ? 'unverified' : 'flagged',
           `Opened directly on ${(check.checked_at ?? '').slice(0, 10)} (HTTP ${check.http_status ?? '?'}). ${ok ? 'Reachable and matching.' : 'FAILED the direct check: flagged.'} ${check.notes ?? ''} Not reviewed: still a candidate.`.trim()]);
        directChecksApplied++; if (!ok) flagged.push(r.code);
      }
    }
    await c.query(`insert into audit_event (event_type, user_id, actor_kind, subject_table, subject_id, reason, payload) values ('learning_resource.candidates_loaded', null, 'system', 'learning_resource', null, $1, $2)`,
      [opts.reason, JSON.stringify({ by: opts.byLabel, version: file.version, written, refreshed, skippedReviewed, overLimit, perSkillMax, directChecksApplied, flagged })]);
    await c.query('commit');
  } catch (e) { await c.query('rollback').catch(() => undefined); throw e; } finally { c.release(); }
  return { version: file.version, written, refreshed, skippedReviewed, overLimit, perSkillMax: perSkillMax!, directChecksApplied, flagged };
}

async function ensureSource(c: PoolClient, file: CandidateFile): Promise<string> {
  const row = (await c.query(
    `insert into data_source (code, source_type, source_name, publisher, jurisdiction, language, url, url_verified, retrieved_at, version, license_or_usage_notes, reliability, is_demo_fixture)
     values ($1, 'curated', 'NAQLA learning-resource research (candidate list, search index)', 'NAQLA', 'global', 'en', null, false, null, $2, $3, 'low', true)
     on conflict (code) where is_demo_fixture = true do update set version = excluded.version, license_or_usage_notes = excluded.license_or_usage_notes
     returning id`, [file.source, file.version, SOURCE_NOTES])).rows[0];
  return String(row.id);
}

function readDirectChecks(dir: string): DirectCheckFile | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^direct-check-.*\.json$/.test(f)).sort();
  if (files.length === 0) return null;
  return JSON.parse(readFileSync(join(dir, files[files.length - 1]!), 'utf8')) as DirectCheckFile;
}
