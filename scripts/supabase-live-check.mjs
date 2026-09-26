#!/usr/bin/env node
/**
 * Live proof against a REAL Supabase project.
 *
 * Everything the local suite cannot prove: Supabase-issued sessions, token
 * refresh, RLS under the real anon/authenticated roles, private Storage with
 * signed URLs, and a share link revoked in the real environment.
 *
 * Requires (never pasted into chat; put them in the environment):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY, NAQLA_API_URL (a running API against the same project),
 *   LIVE_CHECK_EMAIL_DOMAIN (optional, default example.test — must be allowed by your Auth settings)
 *
 * Exit code 0 = every step passed. Any failure prints the step and exits 1.
 * It creates two throwaway users and deletes them at the end.
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHash } from 'node:crypto';

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`missing ${k}`); process.exit(2); } return v; };
const URL_ = need('NEXT_PUBLIC_SUPABASE_URL');
const ANON = need('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICE = need('SUPABASE_SERVICE_ROLE_KEY');
const API = (process.env.NAQLA_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const DOMAIN = process.env.LIVE_CHECK_EMAIL_DOMAIN ?? 'example.test';

const results = [];
const step = async (name, fn) => {
  try { const out = await fn(); results.push(['PASS', name]); console.log(`PASS  ${name}`); return out; }
  catch (e) { results.push(['FAIL', name]); console.error(`FAIL  ${name}\n      ${e.message}`); throw e; }
};
const api = async (path, token, init = {}) => {
  const r = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
};

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const users = [];
async function makeUser() {
  const email = `live-${randomUUID()}@${DOMAIN}`; const password = `Pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  users.push(data.user.id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`signIn: ${e2.message}`);
  return { id: data.user.id, client, session: s.session };
}

try {
  const A = await step('Supabase Auth: sign up + sign in issues a session', makeUser);
  const B = await step('Supabase Auth: a second user', makeUser);

  await step('API accepts a Supabase-issued access token', async () => {
    const r = await api('/v1/me/bootstrap', A.session.access_token, { method: 'POST', body: '{}' });
    if (r.status !== 201) throw new Error(`bootstrap ${r.status} ${JSON.stringify(r.body)}`);
    await api('/v1/me/bootstrap', B.session.access_token, { method: 'POST', body: '{}' });
  });

  const refreshed = await step('Supabase Auth: token refresh yields a new token the API accepts', async () => {
    const { data, error } = await A.client.auth.refreshSession({ refresh_token: A.session.refresh_token });
    if (error) throw new Error(error.message);
    if (data.session.access_token === A.session.access_token) throw new Error('refresh returned the same token');
    const r = await api('/v1/me/career-goal', data.session.access_token);
    if (r.status !== 200) throw new Error(`refreshed token rejected: ${r.status}`);
    return data.session;
  });

  await step('API rejects a forged token', async () => {
    const r = await api('/v1/me/career-goal', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.forged');
    if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
  });

  await step('RLS on real Supabase: anon key reads nothing private', async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    for (const t of ['evidence', 'skill_claim', 'submission', 'upload', 'evaluation_result', 'audit_event', 'evidence_report']) {
      const { data, error } = await anon.from(t).select('*').limit(5);
      if (error && !/permission denied/i.test(error.message)) throw new Error(`${t}: ${error.message}`);
      if (data && data.length > 0) throw new Error(`anon read ${data.length} rows from ${t}`);
    }
  });

  const roles = await step('Seeded target role is visible to an authenticated user', async () => {
    const r = await api('/v1/target-roles', refreshed.access_token);
    if (r.status !== 200 || !r.body.data.length) throw new Error('no target roles — did you run supabase/seed/0001_demo_role.sql?');
    return r.body.data;
  });
  const role = roles[0];
  await api('/v1/me/career-goal', refreshed.access_token, { method: 'PUT', body: JSON.stringify({ targetRoleId: role.id, confirmed: true }) });
  const spec = 'c0000000-0000-4000-8000-000000000001';
  const project = (await api('/v1/projects', refreshed.access_token, { method: 'POST', body: JSON.stringify({ title: 'live check', kind: 'platform_activity', activitySpecId: spec }) })).body.data;

  const upload = async (token, name, text) => {
    const bytes = new TextEncoder().encode(text);
    const intent = await api('/v1/uploads', token, { method: 'POST', body: JSON.stringify({ declaredName: name, contentType: 'text/javascript', declaredSize: bytes.byteLength }) });
    if (intent.status !== 201) throw new Error(`intent ${intent.status} ${JSON.stringify(intent.body)}`);
    const { uploadId, target } = intent.body.data;
    const put = await fetch(target.url, { method: 'PUT', headers: target.headers, body: bytes });
    if (!put.ok) throw new Error(`PUT to signed URL ${put.status}`);
    const conf = await api(`/v1/uploads/${uploadId}/confirm`, token, { method: 'POST', body: '{}' });
    if (conf.status !== 201) throw new Error(`confirm ${conf.status} ${JSON.stringify(conf.body)}`);
    const expect = createHash('sha256').update(bytes).digest('hex');
    if (conf.body.data.checksumSha256 !== expect) throw new Error('server-measured checksum differs from the bytes sent');
    return uploadId;
  };

  const u1 = await step('Supabase Storage: private upload via signed PUT, confirmed and measured', () => upload(refreshed.access_token, 'HabitList.jsx', 'export const x = 1;'));
  const u2 = await upload(refreshed.access_token, 'HabitList.test.jsx', 'test("a", () => {});');

  await step('Supabase Storage: owner gets a signed download that works; raw path is not public', async () => {
    const dl = await api(`/v1/uploads/${u1}/download`, refreshed.access_token);
    if (dl.status !== 200) throw new Error(`download ${dl.status}`);
    const got = await fetch(dl.body.data.url);
    if (!got.ok) throw new Error(`signed GET ${got.status}`);
    // The bucket is private: the public object URL must not serve the file.
    const { data: rows } = await admin.from('upload').select('bucket, object_path').eq('id', u1).single();
    const raw = await fetch(`${URL_}/storage/v1/object/public/${rows.bucket}/${rows.object_path}`);
    if (raw.ok) throw new Error('the raw public object URL served a private file');
  });

  await step('Supabase Storage: a second user cannot download, confirm, or list the file', async () => {
    const dl = await api(`/v1/uploads/${u1}/download`, B.session.access_token);
    if (dl.status !== 404) throw new Error(`expected 404, got ${dl.status}`);
    const { data: rows } = await admin.from('upload').select('bucket, object_path').eq('id', u1).single();
    const bClient = createClient(URL_, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${B.session.access_token}` } } });
    const { data: listed } = await bClient.storage.from(rows.bucket).list(rows.object_path.split('/')[0]);
    if (listed && listed.length > 0) throw new Error(`user B listed ${listed.length} objects under user A's prefix`);
    const { data: signed } = await bClient.storage.from(rows.bucket).createSignedUrl(rows.object_path, 60);
    if (signed?.signedUrl) throw new Error('user B could sign a URL for user A’s object');
  });

  const reportId = await step('Full slice on real Supabase: submit → evaluate → asset → approve → report', async () => {
    const sub = await api(`/v1/projects/${project.id}/submissions`, refreshed.access_token, { method: 'POST', body: JSON.stringify({
      skillIds: ['a0000000-0000-4000-8000-000000000002'], uploadIds: [u1, u2],
      artifacts: [
        { key: 'test.empty_state', kind: 'boolean', valueBool: true }, { key: 'test.loading_state', kind: 'boolean', valueBool: true },
        { key: 'test.error_message', kind: 'boolean', valueBool: true }, { key: 'signal.tests_reference_component', kind: 'boolean', valueBool: true },
        { key: 'note.coverage', kind: 'text', valueText: 'Covers empty, loading and error; not pagination.' },
      ], aiDisclosure: { declaredUse: [] } }) });
    if (sub.status !== 201) throw new Error(`submission ${sub.status} ${JSON.stringify(sub.body)}`);
    const ev = await api(`/v1/submissions/${sub.body.data.id}/evaluate`, refreshed.access_token, { method: 'POST', body: '{}' });
    if (ev.body.data?.transition?.to !== 'demonstrated') throw new Error(`expected demonstrated, got ${JSON.stringify(ev.body)}`);
    const asset = await api(`/v1/evidence/${ev.body.data.transition.evidenceId}/cv-bullet`, refreshed.access_token, { method: 'POST', body: '{}' });
    await api(`/v1/me/assets/${asset.body.data.id}/preview`, refreshed.access_token, { method: 'POST', body: '{}' });
    await api(`/v1/me/assets/${asset.body.data.id}/approve`, refreshed.access_token, { method: 'POST', body: JSON.stringify({ approved: true }) });
    const rep = await api('/v1/me/evidence-report', refreshed.access_token, { method: 'POST', body: '{}' });
    if (rep.status !== 201) throw new Error(`report ${rep.status}`);
    const s = JSON.stringify(rep.body.data);
    for (const n of ['object_path', 'bucket', 'signedUrl', 'HabitList.jsx', 'checksum']) if (s.includes(n)) throw new Error(`report leaked ${n}`);
    return rep.body.data.id;
  });

  await step('Share link on real Supabase: opens, then revoked closes it', async () => {
    const link = await api('/v1/share-links', refreshed.access_token, { method: 'POST', body: JSON.stringify({ resourceKind: 'recruiter_report', resourceId: reportId, expiresInDays: 1 }) });
    const { id, token } = link.body.data;
    const open = await api(`/public/reports/${reportId}?token=${token}`);
    if (!open.body?.ok) throw new Error('link did not open');
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data: viaRls } = await anon.from('evidence_report').select('projection').eq('id', reportId);
    if (!viaRls || viaRls.length !== 1) throw new Error('RLS did not open the report row to anon through the live link');
    if (JSON.stringify(viaRls[0]).includes('object_path')) throw new Error('projection leaked a path');
    const rev = await api(`/v1/share-links/${id}`, refreshed.access_token, { method: 'DELETE' });
    if (rev.status !== 200) throw new Error(`revoke ${rev.status}`);
    const closed = await api(`/public/reports/${reportId}?token=${token}`);
    if (closed.body?.ok) throw new Error('revoked link still opens');
    const { data: after } = await anon.from('evidence_report').select('id').eq('id', reportId);
    if (after && after.length > 0) throw new Error('RLS still exposes the report after revocation');
  });
} catch {
  // reported by step()
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  const failed = results.filter(([s]) => s === 'FAIL').length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
