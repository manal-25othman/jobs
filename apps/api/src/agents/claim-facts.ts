import type { PoolClient } from 'pg';
import { resolveActiveConfig, CLAIM_KINDS_WITHOUT_EVIDENCE_REF, type ClaimKind, type EvidenceState } from '@naqla/domain';
import {
  groundClaim, LEXICON_CLASSES, type ClaimFact, type ClaimPlan, type DomainFacts, type GroundingLexicon, type GroundingResult, type LexiconClass,
} from '@naqla/agents';
import { governedFromRow, isProduction } from '../configuration/configuration.service';

/**
 * Claim-to-Fact Grounding (Phase 7b, D-115) — the database side.
 *
 * Facts are built HERE, from rows, for the evidence a claim cites. A
 * generator's plan can only point at these ids; it can never add one. Nothing
 * is inferred: a project title, a met criterion's name, a submitted
 * deliverable, a recorded number, a declared technology, the skill's current
 * state, and (for headline/About/summary) the user's skills and learning track.
 */
export async function loadClaimFacts(c: PoolClient, userId: string, kind: ClaimKind, evidenceRefs: readonly string[]): Promise<ClaimFact[]> {
  const facts: ClaimFact[] = [];
  const techTerms = new Map<string, string[]>((await c.query('select term, aliases from technology_term')).rows.map((r) => [String(r.term), (r.aliases as string[]) ?? []]));
  const skillLabels = async (skillId: string) => (await c.query('select label_ar, label_en from skill where canonical_skill_id(id) = $1', [skillId])).rows;
  const stateOf = async (skillId: string): Promise<EvidenceState> =>
    ((await c.query(`select state from skill_claim where user_id = $1 and canonical_skill_id(skill_id) = $2 order by evidence_ordinal(state) desc limit 1`, [userId, skillId])).rows[0]?.state ?? 'gap') as EvidenceState;

  const ev = evidenceRefs.length === 0 ? [] : (await c.query(
    `select e.id, canonical_skill_id(e.skill_id) as skill_id, e.project_id, e.evaluation_result_id, p.title, er.rubric_version_id, er.submission_id, p.activity_spec_id
       from evidence e left join project p on p.id = e.project_id left join evaluation_result er on er.id = e.evaluation_result_id
      where e.user_id = $1 and e.id = any($2::uuid[]) and e.withdrawn_at is null`, [userId, evidenceRefs])).rows;
  for (const e of ev) {
    const eid = String(e.id);
    if (e.project_id && e.title) facts.push({ id: `project:${e.project_id}`, kind: 'project', evidenceId: eid, surfacesAr: [String(e.title)], surfacesEn: [String(e.title)] });
    if (e.evaluation_result_id) {
      const er = String(e.evaluation_result_id);
      facts.push({ id: `evaluation:${er}`, kind: 'evaluation', evidenceId: eid, surfacesAr: [], surfacesEn: [] });
      const scores = await c.query(
        `select s.criterion_key, s.score, s.max_score, rc.name_ar, rc.name_en
           from evaluation_criterion_score s left join rubric_criterion rc on rc.rubric_version_id = $2 and rc.key = s.criterion_key
          where s.evaluation_result_id = $1 order by s.criterion_key`, [er, e.rubric_version_id]);
      const total = scores.rows.reduce((a, r) => a + Number(r.score), 0);
      const max = scores.rows.reduce((a, r) => a + Number(r.max_score), 0);
      const met = scores.rows.filter((r) => Number(r.score) >= Number(r.max_score));
      if (scores.rowCount) {
        for (const [role, v] of [['total', total], ['max', max], ['met', met.length]] as const) facts.push({ id: `number:${er}:${role}`, kind: 'number', evidenceId: eid, value: String(v), surfacesAr: [], surfacesEn: [] });
      }
      for (const r of met) facts.push({ id: `criterion:${er}:${r.criterion_key}`, kind: 'criterion_met', evidenceId: eid,
        surfacesAr: r.name_ar ? [String(r.name_ar)] : [], surfacesEn: r.name_en ? [String(r.name_en)] : [] });
      if (e.submission_id && e.activity_spec_id) {
        const dl = await c.query(`select d.key, d.description_ar, d.description_en from activity_deliverable d
            where d.activity_spec_id = $1 and exists (select 1 from submission_artifact a where a.submission_id = $2 and a.key = d.key)`, [e.activity_spec_id, e.submission_id]);
        for (const d of dl.rows) facts.push({ id: `deliverable:${er}:${d.key}`, kind: 'deliverable', evidenceId: eid, surfacesAr: [String(d.description_ar)], surfacesEn: [String(d.description_en)] });
      }
    }
    const techs = await c.query(`select distinct t from (
        select unnest(p.declared_technologies) as t from project p where p.id = $1
        union all select unnest(s.declared_technologies) from submission s where s.project_id = $1 and s.user_id = $2) x`, [e.project_id, userId]);
    for (const r of techs.rows) { const t = String(r.t); facts.push({ id: `technology:${eid}:${t}`, kind: 'technology', evidenceId: eid, value: t, surfacesAr: [t, ...(techTerms.get(t) ?? [])], surfacesEn: [t, ...(techTerms.get(t) ?? [])] }); }
    const labels = await skillLabels(String(e.skill_id));
    if (!facts.some((f) => f.id === `skill:${e.skill_id}`)) {
      facts.push({ id: `skill:${e.skill_id}`, kind: 'skill_level', evidenceId: eid, value: String(e.skill_id), state: await stateOf(String(e.skill_id)),
        surfacesAr: labels.map((l) => String(l.label_ar)), surfacesEn: labels.map((l) => String(l.label_en)) });
    }
  }

  if (CLAIM_KINDS_WITHOUT_EVIDENCE_REF.has(kind)) {
    // A summary / headline / About stands on the user's skills (each at its current state) and their learning track.
    const skills = await c.query(`select canonical_skill_id(sc.skill_id) as id, max(sc.state::text) as s from skill_claim sc where sc.user_id = $1 group by 1`, [userId]);
    for (const r of skills.rows) {
      if (facts.some((f) => f.id === `skill:${r.id}`)) continue;
      const labels = await skillLabels(String(r.id));
      facts.push({ id: `skill:${r.id}`, kind: 'skill_level', evidenceId: null, value: String(r.id), state: await stateOf(String(r.id)),
        surfacesAr: labels.map((l) => String(l.label_ar)), surfacesEn: labels.map((l) => String(l.label_en)) });
    }
    const role = await c.query(`select tr.id, tr.label_ar, tr.label_en from career_goal cg join target_role tr on tr.id = cg.target_role_id where cg.user_id = $1 and cg.is_current`, [userId]);
    if (role.rows[0]) facts.push({ id: `context:${role.rows[0].id}`, kind: 'context', evidenceId: null, surfacesAr: [String(role.rows[0].label_ar)], surfacesEn: [String(role.rows[0].label_en)] });
  }
  return facts;
}

/** What a provider may see of the facts: ids, kinds, values — enough to declare a plan, nothing private. */
export function factsForProvider(facts: readonly ClaimFact[]) {
  return facts.map((f) => ({ id: f.id, kind: f.kind, value: f.value, evidenceId: f.evidenceId }));
}

/** The grounding vocabulary in effect: validated production row, else (outside production) a development-only draft. Never an inactive draft. */
export async function resolveGroundingLexicon(c: PoolClient): Promise<GroundingLexicon | null> {
  const { rows } = await c.query('select * from grounding_lexicon');
  const r = resolveActiveConfig(rows.map(governedFromRow), { production: isProduction() });
  if (!r.row) return null;
  const entries = await c.query('select language, cls, form from grounding_lexicon_entry where lexicon_id = $1 order by cls, language, form', [r.row.id]);
  return { ref: `${r.row.key}@${r.row.version}`, resolution: r.resolution,
    entries: entries.rows.filter((e) => (LEXICON_CLASSES as readonly string[]).includes(e.cls)).map((e) => ({ language: e.language as 'ar' | 'en', cls: e.cls as LexiconClass, form: String(e.form) })) };
}

/** Grounds a wording against the facts of the records it cites, as they stand now. */
export async function groundWording(c: PoolClient, userId: string, kind: ClaimKind, w: { ar: string; en: string | null; plan: ClaimPlan | null }, evidenceRefs: readonly string[],
  domainFacts: Pick<DomainFacts, 'knownTechnologies' | 'knownSkills'>): Promise<GroundingResult> {
  const facts = await loadClaimFacts(c, userId, kind, evidenceRefs);
  const lexicon = await resolveGroundingLexicon(c);
  return groundClaim({ ar: w.ar, en: w.en, plan: w.plan, facts, lexicon, knownTechnologies: domainFacts.knownTechnologies, knownSkills: domainFacts.knownSkills });
}

export function groundingVersion(r: GroundingResult): string { return `${r.engineVersion}+${r.lexiconRef ?? 'no-lexicon'}`; }
