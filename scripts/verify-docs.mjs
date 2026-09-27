#!/usr/bin/env node
/**
 * Documentation consistency check (SRS-001 is the Single Source of Truth — D-106).
 *
 *  1. The SRS header version equals the newest row of its changelog (§22),
 *     and the traceability matrix says it is linked to that same version.
 *  2. Every file the SRS lists as STALE / SUPERSEDED / RETIRED / PHASE 0 MODE
 *     carries an explicit banner naming "SRS-001 v<version>" near its top.
 *  3. The canonical Frontend pack (data/career) matches what the SRS states:
 *     the version quoted in §3.1, DEMO fixture, exactly five core skills, three
 *     activities, no framework name in any pack text, no activity that can yield
 *     Verified, and the OPEN-039 resolution declared.
 *  4. Every "PENDING-DATA-APPLICATION" item the SRS lists is STILL pending in the
 *     data (and vice versa): the day the data changes, the SRS must change too.
 *
 * Exits non-zero on any mismatch. Intended for CI (`npm run verify`).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const problems = [];
const need = (ok, msg) => { if (!ok) problems.push(msg); };

/* 1. versions */
const srs = read('docs/srs/SRS-001-naqla-functional.md');
const headerVersion = srs.match(/\*\*الإصدار:\*\*\s*([0-9]+\.[0-9]+)/)?.[1];
const changelogVersions = [...srs.matchAll(/^\| \*\*([0-9]+\.[0-9]+)\*\* \| \d{4}-\d{2}-\d{2} \|/gm)].map((m) => m[1]);
const newest = changelogVersions.map(Number).sort((a, b) => b - a)[0];
need(headerVersion !== undefined, 'SRS: no header version found');
need(Number(headerVersion) === newest, `SRS: header says v${headerVersion} but the newest changelog row is v${newest}`);
need(srs.includes(`— v${headerVersion}`), `SRS: the status blocks do not name v${headerVersion}`);
const matrix = read('docs/srs/SRS-001-traceability-matrix.md');
need(matrix.includes(`**v${headerVersion}**`), `traceability matrix is not linked to SRS v${headerVersion}`);

/* 2. stale banners */
const staleSection = srs.split('## 0.2 ')[1]?.split('\n---')[0] ?? '';
const listed = [...staleSection.matchAll(/`((?:data|docs)\/[^`]+\.md)`/g)].map((m) => m[1]);
need(listed.length >= 8, `SRS §0.2 lists ${listed.length} stale files; expected the full list`);
for (const f of listed) {
  if (!existsSync(join(ROOT, f))) { problems.push(`SRS §0.2 lists a missing file: ${f}`); continue; }
  const head = read(f).split('\n').slice(0, 6).join('\n');
  // The banner names the SRS version that superseded the file; later SRS versions need not re-stamp it.
  need(/SUPERSEDED|STALE|RETIRED|PHASE 0 MODE/.test(head) && /SRS-001 v\d+\.\d+/.test(head), `${f}: no STALE/SUPERSEDED/RETIRED/PHASE 0 MODE banner naming an SRS-001 version in its first lines`);
}

/* 3. canonical pack */
const packDir = 'data/career/tracks/trk_frontend_junior';
const manifest = JSON.parse(read(`${packDir}/manifest.json`));
const quoted = srs.match(/trk_frontend_junior@([0-9.]+)/)?.[1];
need(manifest.pack_version === quoted, `SRS §3.1 quotes pack ${quoted} but the canonical manifest is ${manifest.pack_version}`);
need(manifest.is_demo_fixture === true, 'canonical pack must still be a DEMO fixture (not SME approved)');
need(Array.isArray(manifest.duplicate_resolutions) && manifest.duplicate_resolutions.some((r) => r.alias === 'ui-state-management' && r.canonical === 'skl_ui_state_interaction'), 'OPEN-039 resolution missing from the manifest');
const roleMap = JSON.parse(read(`${packDir}/role_skill_map.json`)).records;
const core = roleMap.filter((r) => r.is_core_for_role).map((r) => r.skill);
need(core.length === 5, `canonical pack has ${core.length} core skills; SRS §3.1 says five`);
for (const c of ['skl_html_semantic', 'skl_css_responsive', 'skl_js_fundamentals', 'skl_ui_state_interaction', 'skl_api_data_states']) need(core.includes(c), `core skill ${c} missing from the canonical pack`);
const activities = JSON.parse(read(`${packDir}/activities.json`)).records;
need(activities.length === 3, `canonical pack has ${activities.length} activities; SRS says three`);
need(activities.every((a) => a.can_yield_verified === false), 'an activity claims it can yield Verified (blocked in P1, FR-G-021)');
const FRAMEWORK = /\b(react|reactjs|vue|vuejs|angular|next\.?js|nuxt|svelte|jquery)\b/i;
for (const f of ['role.json', 'role_skill_map.json', 'tasks.json', 'activities.json', 'rubrics.json']) {
  const text = JSON.stringify(JSON.parse(read(`${packDir}/${f}`)));
  need(!FRAMEWORK.test(text), `${packDir}/${f} names a framework; the P1 role is framework-independent (SRS §3.1)`);
}
const manifestNoPolicy = { ...manifest }; delete manifestNoPolicy.framework_policy;
need(!FRAMEWORK.test(JSON.stringify(manifestNoPolicy)), 'manifest names a framework outside framework_policy');

/* 4. pending data applications named in the SRS must match the data */
const pendingOD3 = /OD-3[^\n]*\n?[^\n]*PENDING-DATA-APPLICATION/.test(srs) || srs.includes('OD-3 حذف `ui-testing` من ربط دور الحزمة | **كانوني** | **PENDING-DATA-APPLICATION**');
const hasUiTesting = roleMap.some((r) => r.skill === 'ui-testing');
need(pendingOD3 === hasUiTesting, pendingOD3 ? 'SRS says OD-3 is pending but ui-testing is already gone from the role map: update SRS §20' : 'ui-testing is still in the role map but the SRS no longer marks OD-3 pending: update SRS §20 or the data');
const pendingOD10 = srs.includes('OD-10 حذف توقُّع الدفاع الحي من P1 | **كانوني** | **PENDING-DATA-APPLICATION**');
const hasLiveDefense = roleMap.some((r) => (r.evidence_type_expected ?? []).includes('live_defense'));
need(pendingOD10 === hasLiveDefense, pendingOD10 ? 'SRS says OD-10 is pending but live_defense is already gone: update SRS §20' : 'live_defense still expected in the role map but the SRS no longer marks OD-10 pending');

/* 5. the stale pack must not be the one the importer reads */
need(!existsSync(join(ROOT, 'data/tracks/trk_frontend_junior/manifest.json')), 'data/tracks carries an importable manifest; only data/career is canonical');

if (problems.length) { console.error('Documentation consistency FAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log(`Documentation consistent: SRS-001 v${headerVersion} is the single source of truth · ${listed.length} stale files banner-marked · canonical pack trk_frontend_junior@${manifest.pack_version} matches · pending data applications: OD-3=${hasUiTesting ? 'pending' : 'applied'}, OD-10=${hasLiveDefense ? 'pending' : 'applied'}.`);
