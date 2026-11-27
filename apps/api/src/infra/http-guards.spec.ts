import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, securityHeaders } from './http-guards';
import { stagingAllows } from '../auth/auth.guard';

const res = () => { const h: Record<string, string> = {}; const r = { statusCode: 200, body: null as unknown, setHeader: (k: string, v: string) => { h[k] = v; }, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; }, h }; return r; };
const req = (path = '/v1/me', ip = '1.1.1.1', auth = 'Bearer a') => ({ path, ip, headers: { authorization: auth } }) as never;

test('rate limit: 429 with Retry-After after the per-minute allowance; per client; probes exempt; off in tests', () => {
  const mw = rateLimit({ RATE_LIMIT_PER_MINUTE: '3' });
  let passed = 0; const r = res();
  for (let i = 0; i < 5; i++) mw(req(), r as never, () => { passed++; });
  assert.equal(passed, 3); assert.equal(r.statusCode, 429); assert.ok(r.h['Retry-After']);
  let other = 0; mw(req('/v1/me', '1.1.1.1', 'Bearer b'), res() as never, () => { other++; });
  assert.equal(other, 1, 'another user behind the same address has their own allowance');
  let probes = 0; for (let i = 0; i < 10; i++) mw(req('/health'), res() as never, () => { probes++; });
  assert.equal(probes, 10);
  let off = 0; const none = rateLimit({ NODE_ENV: 'test' }); for (let i = 0; i < 500; i++) none(req(), res() as never, () => { off++; });
  assert.equal(off, 500);
  let deployed = 0; const prod = rateLimit({ NODE_ENV: 'production' }); for (let i = 0; i < 130; i++) prod(req('/v1/x', '2.2.2.2'), res() as never, () => { deployed++; });
  assert.equal(deployed, 120, 'deployed hosts default to 120/min');
});

test('security headers; staging is kept out of search engines', () => {
  const r = res(); securityHeaders({ NAQLA_ENV: 'staging' })(req() as never, r as never, () => undefined);
  assert.equal(r.h['X-Content-Type-Options'], 'nosniff'); assert.equal(r.h['X-Frame-Options'], 'DENY'); assert.match(r.h['X-Robots-Tag']!, /noindex/);
  const p = res(); securityHeaders({ NAQLA_ENV: 'production' })(req() as never, p as never, () => undefined);
  assert.equal(p.h['X-Robots-Tag'], undefined);
});

test('staging allow-list: invited e-mails and @domains only; every address outside staging', () => {
  const env = { NAQLA_ENV: 'staging', STAGING_ALLOWED_EMAILS: 'owner@example.org, @testers.example.org' };
  assert.equal(stagingAllows('Owner@Example.org', env), true);
  assert.equal(stagingAllows('t1@testers.example.org', env), true);
  assert.equal(stagingAllows('someone@gmail.com', env), false);
  assert.equal(stagingAllows('evil@testers.example.org.attacker.com', env), false);
  assert.equal(stagingAllows(null, env), false);
  assert.equal(stagingAllows('anyone@x.com', { NAQLA_ENV: 'development' }), true);
});
