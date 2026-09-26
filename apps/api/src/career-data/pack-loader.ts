import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Pack } from './pack-schema';

export interface RawFile { readonly name: string; readonly sha256: string; readonly content: unknown; }

/** Reads /global and /tracks/<packId>. Every file is kept as an L0 raw snapshot. */
export function loadPack(root: string, packId: string): { pack: Pack; files: RawFile[] } {
  const files: RawFile[] = [];
  const read = (rel: string): unknown => {
    const text = readFileSync(join(root, rel), 'utf8');
    files.push({ name: rel, sha256: createHash('sha256').update(text).digest('hex'), content: JSON.parse(text) });
    return JSON.parse(text);
  };
  const recs = (v: unknown) => (v as { records: unknown[] }).records;
  const g = (f: string) => read(`global/${f}`);
  const t = (f: string) => read(`tracks/${packId}/${f}`);
  for (const f of readdirSync(join(root, 'global'))) if (!f.endsWith('.json')) throw new Error(`unexpected file in global/: ${f}`);
  const pack: Pack = {
    global: {
      sources: recs(g('sources.json')) as Pack['global']['sources'],
      families: recs(g('skill_families.json')) as Pack['global']['families'],
      scale: g('proficiency_scale.json') as Pack['global']['scale'],
      recency: recs(g('recency_policies.json')) as Pack['global']['recency'],
      skills: recs(g('skills.json')) as Pack['global']['skills'],
      synonyms: recs(g('skill_synonyms.json')) as Pack['global']['synonyms'],
      criteriaLibrary: recs(g('criteria_library.json')) as Pack['global']['criteriaLibrary'],
      presentationRules: recs(g('presentation_rules.json')) as Pack['global']['presentationRules'],
      resources: recs(g('learning_resources.json')) as Pack['global']['resources'],
    },
    track: {
      manifest: t('manifest.json') as Pack['track']['manifest'],
      role: t('role.json') as Pack['track']['role'],
      roleSkills: recs(t('role_skill_map.json')) as Pack['track']['roleSkills'],
      tasks: recs(t('tasks.json')) as Pack['track']['tasks'],
      activities: recs(t('activities.json')) as Pack['track']['activities'],
      rubrics: recs(t('rubrics.json')) as Pack['track']['rubrics'],
    },
  };
  return { pack, files };
}
