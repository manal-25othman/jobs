/**
 * Phase B, package 3 (PO decision 4) — loads the ORIGINAL starter and reviewer materials of the development pilot's
 * activities into private storage, and records them (0039 `activity_material`).
 *
 *  - development only: refused in production, like the pilot loader (D-135); pilot activities only
 *  - for each activity in materials/manifest.json:
 *      graduate — the graduate folder as one deterministic ZIP covering the declared inputs;
 *      reviewer — the reviewer folder (reference, solution) as one ZIP, audience `reviewer`, covering nothing;
 *  - every graduate file's SHA-256 is recorded as a platform starter file (0030 `activity_starter_checksum`), so a
 *    graduate who hands back an unchanged starter file never creates a reuse conflict between tasks (I-5);
 *  - materials are content: added while the activity is draft / curated (the database refuses later — 0039);
 *  - idempotent: a material already recorded with the same checksum is skipped; a different one is refused (a new
 *    material version is required — nothing is overwritten).
 * Nothing here changes an objective, a skill relation, a deliverable, a rubric or an assessment criterion.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Pool } from 'pg';
import { assertMaterialFileName } from '@naqla/domain';
import type { StoragePort } from '../storage/storage.port';
import { createZip, type ZipEntry } from './zip';

export class MaterialLoadError extends Error { override readonly name = 'MaterialLoadError'; }

export interface MaterialLoadOptions {
  readonly materialsRoot: string;
  readonly byLabel: string;
  readonly reason: string;
  readonly production: boolean;
  readonly bucket?: string;
}
export interface MaterialLoadReport {
  readonly version: string;
  readonly written: { activity: string; audience: 'graduate' | 'reviewer'; fileName: string; sizeBytes: number; checksum: string; files: number }[];
  readonly skipped: { activity: string; audience: string; fileName: string; reason: string }[];
  readonly starterChecksums: number;
}

interface Manifest {
  version: string;
  activities: Record<string, { graduate: { archive: string; dir: string; covers: string[] }; reviewer?: { archive: string; dir: string } }>;
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

function filesOf(dir: string): ZipEntry[] {
  const out: ZipEntry[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (name.startsWith('.')) continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push({ path: relative(dir, full).split(sep).join('/'), bytes: new Uint8Array(readFileSync(full)) });
    }
  };
  walk(dir);
  if (out.length === 0) throw new MaterialLoadError(`material folder is empty: ${dir}`);
  return out;
}

export function defaultMaterialsBucket(): string {
  return `${process.env['STORAGE_BUCKET_PREFIX'] ? `${process.env['STORAGE_BUCKET_PREFIX']}-` : ''}activity-materials`;
}

export async function loadPilotMaterials(pool: Pool, storage: StoragePort, opts: MaterialLoadOptions): Promise<MaterialLoadReport> {
  if (opts.production) throw new MaterialLoadError('pilot materials are never loaded in production (D-135 scope)');
  if (!opts.byLabel?.trim() || !opts.reason?.trim()) throw new MaterialLoadError('a material load needs a name and a reason');
  const manifest = JSON.parse(readFileSync(join(opts.materialsRoot, 'manifest.json'), 'utf8')) as Manifest;
  const bucket = opts.bucket ?? defaultMaterialsBucket();
  await storage.ensureBucket(bucket);
  const written: MaterialLoadReport['written'] = []; const skipped: MaterialLoadReport['skipped'] = [];
  let starterChecksums = 0;

  for (const [code, entry] of Object.entries(manifest.activities)) {
    const act = (await pool.query(
      `select a.id, a.status::text as status from activity_spec a
        where a.slug = $1 and exists (select 1 from pilot_content_load l where l.target_role_id = a.target_role_id)
        order by a.created_at desc limit 1`, [code])).rows[0];
    if (!act) throw new MaterialLoadError(`no pilot activity '${code}' is loaded; run the pilot loader first`);
    const inputs = (await pool.query('select key from activity_input where activity_spec_id = $1 and material_required', [act.id])).rows.map((r) => String(r.key));
    for (const k of entry.graduate.covers) if (!inputs.includes(k)) throw new MaterialLoadError(`${code}: the manifest covers '${k}', which is not a material-required input`);
    const uncovered = inputs.filter((k) => !entry.graduate.covers.includes(k));
    if (uncovered.length) throw new MaterialLoadError(`${code}: required inputs not covered by the graduate package: ${uncovered.join(', ')}`);

    const parts: { audience: 'graduate' | 'reviewer'; archive: string; dir: string; covers: string[] }[] = [
      { audience: 'graduate', archive: entry.graduate.archive, dir: entry.graduate.dir, covers: entry.graduate.covers },
      ...(entry.reviewer ? [{ audience: 'reviewer' as const, archive: entry.reviewer.archive, dir: entry.reviewer.dir, covers: [] as string[] }] : []),
    ];
    for (const part of parts) {
      assertMaterialFileName(part.archive);
      const files = filesOf(join(opts.materialsRoot, part.dir));
      const zip = createZip(files);
      const checksum = sha256(zip);
      const existing = (await pool.query(
        'select checksum_sha256 from activity_material where activity_spec_id = $1 and audience = $2 and file_name = $3 and material_version = $4',
        [act.id, part.audience, part.archive, manifest.version])).rows[0];
      if (existing) {
        if (existing.checksum_sha256 !== checksum) throw new MaterialLoadError(`${code} ${part.audience}: version ${manifest.version} is already recorded with different content; bump the material version`);
        skipped.push({ activity: code, audience: part.audience, fileName: part.archive, reason: 'already recorded (same checksum)' });
        continue;
      }
      if (!['draft', 'curated', 'needs_revision', 'rejected'].includes(act.status)) {
        throw new MaterialLoadError(`${code}: the activity is ${act.status}; materials are content fixed from SME review on — load them before publication`);
      }
      const objectPath = `${act.id}/${manifest.version}/${part.audience}/${part.archive}`;
      await storage.putObject(bucket, objectPath, zip, 'application/zip');
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query(
          `insert into activity_material (activity_spec_id, audience, covers_input_keys, file_name, content_type, bucket, object_path, size_bytes, checksum_sha256, material_version, is_demo_fixture, created_by_label, reason)
           values ($1, $2, $3, $4, 'application/zip', $5, $6, $7, $8, $9, true, $10, $11)`,
          [act.id, part.audience, part.covers, part.archive, bucket, objectPath, zip.byteLength, checksum, manifest.version, opts.byLabel, opts.reason]);
        if (part.audience === 'graduate') {
          for (const f of files) {
            const r = await c.query(`insert into activity_starter_checksum (activity_spec_id, checksum_sha256, label) values ($1, $2, $3) on conflict do nothing`,
              [act.id, sha256(f.bytes), `starter ${manifest.version}: ${f.path}`]);
            starterChecksums += r.rowCount ?? 0;
          }
        }
        await c.query('commit');
      } catch (e) {
        await c.query('rollback').catch(() => undefined);
        await storage.remove(bucket, objectPath).catch(() => undefined);
        throw e;
      } finally { c.release(); }
      written.push({ activity: code, audience: part.audience, fileName: part.archive, sizeBytes: zip.byteLength, checksum, files: files.length });
    }
  }
  return { version: manifest.version, written, skipped, starterChecksums };
}
