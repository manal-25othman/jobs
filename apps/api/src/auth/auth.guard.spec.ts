import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair, UnsecuredJWT } from 'jose';
import { verifySupabaseToken } from './auth.guard';

const SECRET = 'local-jwt-secret-for-the-spec-only-000000';

test('auth: HS256 with the secret, ES256 against a configured local JWKS; wrong key, alg none and missing JWKS refused', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const other = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
  const srv = createServer((_q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  const jwks = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/auth/v1/.well-known/jwks.json`;
  try {
    const hs = await new SignJWT({ email: 'a@x.test' }).setProtectedHeader({ alg: 'HS256' }).setSubject('u-hs').setExpirationTime('5m').sign(new TextEncoder().encode(SECRET));
    assert.equal((await verifySupabaseToken(hs, SECRET, jwks)).sub, 'u-hs');
    await assert.rejects(verifySupabaseToken(hs, SECRET + 'x'));

    const es = await new SignJWT({ email: 'b@x.test' }).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setSubject('u-es').setExpirationTime('5m').sign(privateKey);
    assert.equal((await verifySupabaseToken(es, SECRET, jwks)).sub, 'u-es');
    await assert.rejects(verifySupabaseToken(es, SECRET), /unsupported signing algorithm/); // no JWKS configured

    const forged = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setSubject('u-es').setExpirationTime('5m').sign(other.privateKey);
    await assert.rejects(verifySupabaseToken(forged, SECRET, jwks));

    const none = new UnsecuredJWT({ sub: 'u-none' }).encode();
    await assert.rejects(verifySupabaseToken(none, SECRET, jwks), /unsupported signing algorithm/);
  } finally { srv.close(); }
});
