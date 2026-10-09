/**
 * Phase 9 — owner requirement 2: an account holding several roles cannot
 * bypass independent review. Authorization is decided on the EFFECTIVE
 * identity (the verified token's user) and its operator-granted roles — never
 * on a role the client names — and every step of an expert-dependent change is
 * checked against the people who took the previous steps:
 *   drafter ≠ professional approver ≠ activator / publisher.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { bootApp, newUser, type TestUser } from './helpers';

let app: INestApplication; let http: ReturnType<typeof request>; let pool: Pool;
const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
let omni: TestUser; let sme: TestUser; let smePo: TestUser; let po: TestUser; let admin: TestUser; let po2: TestUser;

async function person(roles: string[]): Promise<TestUser> {
  const u = await newUser();
  await http.post('/v1/me/bootstrap').set(auth(u)).send({}).expect(201);
  for (const r of roles) await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, $2, 'e2e operator')`, [u.id, r]);
  return u;
}
const get = (u: TestUser, path: string, code = 200) => http.get(`/v1/admin${path}`).set(auth(u)).expect(code);
const post = (u: TestUser, path: string, body: unknown, code = 201) => http.post(`/v1/admin${path}`).set(auth(u)).send(body as object).expect(code);
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];

before(async () => {
  app = await bootApp(); http = request(app.getHttpServer()); pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  omni = await person(['track_admin', 'sme', 'product_owner']);
  sme = await person(['sme']); smePo = await person(['sme', 'product_owner']); po = await person(['product_owner']); admin = await person(['track_admin']); po2 = await person(['product_owner', 'sme']);
});
after(async () => { await pool?.end(); await app?.close(); });

async function draftClaimPolicy(by: TestUser, family: string): Promise<string> {
  const base = (await get(by, '/config/claim_policy')).body.data.items.find((i: { key: string; family: string; version: number }) => i.key === 'default' && i.family.includes(family) && i.version === 1);
  const id = (await post(by, '/config/claim_policy/draft', { baseId: base.id, changes: { description_en: `separation e2e ${Date.now()}` }, reason: 'e2e' })).body.data.id as string;
  await post(by, `/config/claim_policy/${id}/submit`, { reason: 'ready' });
  return id;
}

describe('one account holding all three roles cannot carry its own change into effect', () => {
  test('governed configuration: draft ✓ · approve own ✗ · (another SME approves) · activate own ✗', async () => {
    const id = await draftClaimPolicy(omni, 'linkedin_headline');
    await post(omni, `/config/claim_policy/${id}/validate`, { decision: 'approve', reason: 'mine' }, 403);
    await post(sme, `/config/claim_policy/${id}/validate`, { decision: 'approve', reason: 'independent review' });
    const r = await post(omni, `/config/claim_policy/${id}/activate`, { activation: 'development_only', reason: 'mine' }, 403);
    assert.match(r.body.error.message, /separation of duties: you drafted/);
    assert.equal((await one('select activation from claim_policy where id = $1', [id])).activation, 'inactive');
  });
  test('the professional approver cannot activate what they approved, even holding the product-owner role', async () => {
    const id = await draftClaimPolicy(admin, 'professional_summary');
    await post(smePo, `/config/claim_policy/${id}/validate`, { decision: 'approve', reason: 'independent review' });
    const r = await post(smePo, `/config/claim_policy/${id}/activate`, { activation: 'development_only', reason: 'mine' }, 403);
    assert.match(r.body.error.message, /you approved/);
    // A third, independent person activates; anyone with the role may deactivate (rollback is a safety act).
    await post(po, `/config/claim_policy/${id}/activate`, { activation: 'development_only', reason: 'independent activation' });
    await post(smePo, `/config/claim_policy/${id}/activate`, { activation: 'inactive', reason: 'e2e rollback' });
    const acts = (await pool.query(`select field, new_value, actor from config_change where entity_id = $1 and field = 'activation' order by created_at`, [id])).rows;
    assert.deepEqual(acts.map((a) => a.new_value), ['development_only', 'inactive']);
    assert.match(acts[0].actor, new RegExp(po.id));
  });
  test('the database refuses it too: an activation carrying the drafter\'s or approver\'s identity', async () => {
    const id = await draftClaimPolicy(admin, 'linkedin_headline');
    await post(sme, `/config/claim_policy/${id}/validate`, { decision: 'approve', reason: 'independent review' });
    for (const actorId of [admin.id, sme.id]) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query("select set_config('naqla.config_actor', 'bypass', true), set_config('naqla.config_reason', 'bypass attempt', true), set_config('naqla.config_actor_id', $1, true)", [actorId]);
        await assert.rejects(() => c.query(`update claim_policy set activation = 'development_only' where id = $1`, [id]), /separation of duties/);
      } finally { await c.query('rollback'); c.release(); }
    }
  });
  test('a client cannot choose the role it acts in: a role named in the request is ignored; the audit records the granted role', async () => {
    const id = await draftClaimPolicy(admin, 'professional_summary');
    await http.post(`/v1/admin/config/claim_policy/${id}/validate`).set(auth(admin)).set('x-naqla-role', 'sme')
      .send({ decision: 'approve', reason: 'pretending', rolePerformed: 'sme', role: 'sme' }).expect(403);
    assert.equal((await one('select review_status::text from claim_policy where id = $1', [id])).review_status, 'curated');
    await post(sme, `/config/claim_policy/${id}/validate`, { decision: 'approve', reason: 'real review', rolePerformed: 'product_owner' });
    const a = await one(`select actor_id, role_performed::text from audit_event where subject_id = $1 and event_type = 'admin.validated_approve'`, [id]);
    assert.deepEqual([a.actor_id, a.role_performed], [sme.id, 'sme']);
  });
});

describe('track versions: whoever drafted or decided a change the version carries cannot activate it', () => {
  let versionId = ''; let roleId = '';
  before(async () => {
    // The pack role, preferring a non-demo copy (other suites create unrelated non-demo roles: never pick one of those).
    roleId = (await one(`select id from target_role where slug = 'frontend-developer-junior' order by is_demo_fixture, created_at limit 1`)).id;
    const skills = (await get(omni, `/tracks/${roleId}`)).body.data.skills;
    const rr = skills[skills.length - 1].roleRequirementId;
    const ch = (await post(omni, `/tracks/${roleId}/skill-changes`, { roleRequirementId: rr, proposed: { display_order: 97 }, reason: 'separation e2e' })).body.data.id;
    await post(omni, `/skill-changes/${ch}/pending_review`, { reason: 'ready' });
    await post(omni, `/skill-changes/${ch}/approved`, { reason: 'mine' }, 403);
    await post(po2, `/skill-changes/${ch}/approved`, { reason: 'operational ordering' }); // an operational change: a product owner may decide it
    versionId = (await post(admin, `/tracks/${roleId}/versions`, { label: 'separation e2e', reason: 'carry the change' })).body.data.id;
    await post(admin, `/track-versions/${versionId}/submit`, { reason: 'ready' });
    await post(sme, `/track-versions/${versionId}/validate`, { decision: 'approve', reason: 'reviewed' });
  });
  test('the drafter of a carried change cannot activate the version', async () => {
    const r = await post(omni, `/track-versions/${versionId}/activate`, { activation: 'development_only', reason: 'mine' }, 403);
    assert.match(r.body.error.message, /drafted or decided a change this version carries/);
  });
  test('the person who decided a carried change cannot activate the version', async () => {
    await post(po2, `/track-versions/${versionId}/activate`, { activation: 'development_only', reason: 'mine' }, 403);
  });
  test('the version\'s approver cannot activate it', async () => {
    await pool.query(`insert into reviewer_grant (user_id, role_performed, granted_by) values ($1, 'product_owner', 'e2e operator') on conflict do nothing`, [sme.id]);
    try { await post(sme, `/track-versions/${versionId}/activate`, { activation: 'development_only', reason: 'mine' }, 403); }
    finally { await pool.query(`update reviewer_grant set revoked_at = now(), revoke_reason = 'e2e' where user_id = $1 and role_performed = 'product_owner' and revoked_at is null`, [sme.id]); }
    assert.equal((await one('select activation from track_config_version where id = $1', [versionId])).activation, 'inactive', 'nothing went live');
  });
});

describe('career content: the publisher is independent of the author, editors and approvers', () => {
  test('omni creates and submits; omni cannot review it; an SME+PO who approved cannot publish; an independent product owner can', async () => {
    const id = (await post(omni, '/content/skills', { slug: `sep-e2e-${Date.now()}`, labelAr: 'مهارة فصل الصلاحيات', labelEn: 'Separation test skill', reason: 'e2e' })).body.data.id;
    await post(omni, '/content/review', { entityKind: 'skill', id, to: 'curated', reason: 'ready' });
    await post(omni, '/content/review', { entityKind: 'skill', id, to: 'sme_reviewed', reason: 'mine' }, 403);
    await post(smePo, '/content/review', { entityKind: 'skill', id, to: 'sme_reviewed', reason: 'reviewed' });
    await post(smePo, '/content/review', { entityKind: 'skill', id, to: 'approved', reason: 'approved' });
    const r1 = await post(smePo, '/content/review', { entityKind: 'skill', id, to: 'published', reason: 'mine' }, 403);
    assert.match(r1.body.error.message, /separation of duties/);
    await post(omni, '/content/review', { entityKind: 'skill', id, to: 'published', reason: 'mine' }, 403);
    await post(po, '/content/review', { entityKind: 'skill', id, to: 'published', reason: 'independent publication' });
    assert.equal((await one('select review_status::text from skill where id = $1', [id])).review_status, 'published');
  });
});
