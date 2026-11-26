/**
 * Attack tests for the development sandbox (R2 design §7.1). Every attack is SYNTHETIC code written for this test.
 * Each must fail safely: no network, no secrets, no host files, no database, bounded processes, memory, disk and time,
 * and nothing left behind after teardown.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_R2_LIMITS, calibrateLimits } from '@naqla/domain';
import { sweepStaleAttempts, assertBackendAllowed, cleanupAttempt, prepareAttempt, probeBackend, runInSandbox, attemptOomKilled } from './sandbox.js';

const probe = probeBackend();
const skip = probe.available ? false : `development backend unavailable here: ${probe.reasons.join('; ')}`;
const NODE = process.execPath;

async function inSandbox(code: string, limits = DEFAULT_R2_LIMITS, timeoutMs?: number) {
  const a = prepareAttempt([{ path: 'attack.js', content: code }], limits, 'node');
  try {
    const r = await runInSandbox(a, [NODE, '/tmp/work/attack.js'], { timeoutMs });
    return { ...r, oom: attemptOomKilled(a), attempt: a };
  } finally {
    cleanupAttempt(a);
  }
}

test('the development backend is refused in production', () => {
  assert.throws(() => assertBackendAllowed({ NODE_ENV: 'production' }), /r2_backend/);
  assert.doesNotThrow(() => assertBackendAllowed({ NODE_ENV: 'test' }));
});

test('no network: the platform database, loopback services and DNS are unreachable', { skip }, async () => {
  const r = await inSandbox(`
    const net = require('net'); const out = {};
    const tryConnect = (port, host) => new Promise((res) => { const s = net.connect(port, host); s.on('connect', () => { s.destroy(); res('CONNECTED'); }); s.on('error', (e) => res(e.code)); setTimeout(() => res('TIMEOUT'), 2000); });
    (async () => {
      out.db = await tryConnect(55432, '127.0.0.1');
      out.api = await tryConnect(3000, '127.0.0.1');
      out.external = await tryConnect(443, '1.1.1.1');
      out.dns = await new Promise((res) => require('dns').lookup('example.com', (e) => res(e ? e.code : 'RESOLVED')));
      console.log(JSON.stringify(out));
    })();`);
  const out = JSON.parse(r.stdout.trim());
  for (const k of ['db', 'api', 'external']) assert.notEqual(out[k], 'CONNECTED', k);
  assert.notEqual(out.dns, 'RESOLVED');
});

test('no secrets: an empty environment, no host home, no repository, no other attempts, no platform files', { skip }, async () => {
  const other = prepareAttempt([{ path: 'secret.txt', content: 'OTHER-ATTEMPT' }], DEFAULT_R2_LIMITS, 'node');
  try {
    const r = await inSandbox(`
      const fs = require('fs'); const tryRead = (p) => { try { fs.readFileSync(p); return 'READ'; } catch (e) { return e.code; } };
      const tryList = (p) => { try { return fs.readdirSync(p).length; } catch (e) { return e.code; } };
      console.log(JSON.stringify({
        env: Object.keys(process.env).sort(),
        repo: tryRead('/home/user/jobs/package.json'),
        dotenv: tryRead('/home/user/jobs/.env'),
        rootHome: tryList('/root'),
        other: tryRead(${JSON.stringify(other.workDir + '/secret.txt')}),
        attempts: tryList('/var/lib/naqla-r2'),
        hostProcs: fs.readdirSync('/proc').filter((x) => /^\\d+$/.test(x)).length,
        hostEnviron: tryRead('/proc/1/environ').length,
      }));`);
    const out = JSON.parse(r.stdout.trim());
    assert.deepEqual(out.env, ['HOME', 'LANG', 'PATH']);
    assert.equal(out.repo, 'ENOENT');
    assert.equal(out.dotenv, 'ENOENT');
    assert.equal(out.rootHome, 0);
    assert.equal(out.other, 'ENOENT');
    assert.ok(out.attempts === 'ENOENT' || out.attempts === 0);
    assert.ok(out.hostProcs <= 3, `sees ${out.hostProcs} processes`);
  } finally { cleanupAttempt(other); }
});

test('least privilege: user nobody, no capabilities, read-only system, submission read-only', { skip }, async () => {
  const r = await inSandbox(`
    const fs = require('fs'); const w = (p) => { try { fs.writeFileSync(p, 'x'); return 'WROTE'; } catch (e) { return e.code; } };
    const status = fs.readFileSync('/proc/self/status', 'utf8');
    console.log(JSON.stringify({ uid: process.getuid(), gid: process.getgid(), capEff: /CapEff:\\s*(\\w+)/.exec(status)[1], noNewPrivs: /NoNewPrivs:\\s*(\\d)/.exec(status)[1],
      etc: w('/etc/naqla'), usr: w('/usr/naqla'), work: w('/tmp/work/attack.js'), tmp: w('/tmp/ok') }));`);
  const out = JSON.parse(r.stdout.trim());
  assert.equal(out.uid, 65534); assert.equal(out.gid, 65534);
  assert.equal(out.capEff, '0000000000000000');
  assert.equal(out.noNewPrivs, '1');
  assert.equal(out.etc, 'EROFS'); assert.equal(out.usr, 'EROFS'); assert.equal(out.work, 'EROFS');
  assert.equal(out.tmp, 'WROTE');
});

test('resource limit: a process bomb is capped by the pids limit', { skip }, async () => {
  const limits = calibrateLimits({ maxProcesses: 16 });
  const r = await inSandbox(`
    const { spawn } = require('child_process'); let ok = 0, refused = 0;
    for (let i = 0; i < 60; i++) { try { const c = spawn('/bin/sleep', ['5']); c.on('error', () => refused++); if (c.pid) ok++; } catch { refused++; } }
    setTimeout(() => { console.log(JSON.stringify({ ok, refused })); process.exit(0); }, 800);`, limits, 15000);
  const out = JSON.parse(r.stdout.trim() || '{"ok":0,"refused":0}');
  assert.ok(out.ok < 16, `started ${out.ok} processes with a cap of 16`);
  assert.ok(out.refused > 0);
});

test('resource limit: memory exhaustion is stopped by the memory cgroup', { skip }, async () => {
  const limits = calibrateLimits({ memoryMiB: 128 });
  const r = await inSandbox(`const a = []; for (;;) a.push(Buffer.alloc(8 * 1024 * 1024, 1));`, limits, 20000);
  assert.ok(r.signal === 'SIGKILL' || r.code !== 0, 'the process must not survive');
  assert.equal(r.timedOut, false, 'stopped by the memory limit, not the clock');
});

test('resource limit: disk exhaustion stops at the scratch-space size', { skip }, async () => {
  const limits = calibrateLimits({ diskMiB: 16 });
  const r = await inSandbox(`
    const fs = require('fs'); let written = 0; const chunk = Buffer.alloc(1024 * 1024, 1);
    try { for (let i = 0; i < 64; i++) { fs.appendFileSync('/tmp/fill', chunk); written++; } console.log(JSON.stringify({ written, err: null })); }
    catch (e) { console.log(JSON.stringify({ written, err: e.code })); }`, limits);
  const out = JSON.parse(r.stdout.trim());
  assert.equal(out.err, 'ENOSPC');
  assert.ok(out.written <= 16);
});

test('time limit: an endless loop is killed from outside; teardown leaves nothing behind', { skip }, async () => {
  const limits = calibrateLimits({ wallSeconds: 10, perTestSeconds: 2 });
  const a = prepareAttempt([{ path: 'attack.js', content: `require('child_process').spawn('/bin/sleep', ['600']); for (;;) {}` }], limits, 'node');
  const r = await runInSandbox(a, [NODE, '/tmp/work/attack.js'], { timeoutMs: 1500 });
  assert.equal(r.timedOut, true);
  cleanupAttempt(a);
  assert.equal(existsSync(a.dir), false, 'attempt directory removed');
  for (const cg of a.cgroups) assert.equal(existsSync(cg), false, `cgroup ${cg} removed`);
});

test('isolation per attempt: two attempts never share files', { skip }, async () => {
  const a = prepareAttempt([{ path: 'attack.js', content: `require('fs').writeFileSync('/tmp/mark', 'A'); console.log('ok')` }], DEFAULT_R2_LIMITS, 'node');
  const b = prepareAttempt([{ path: 'attack.js', content: `try { console.log(require('fs').readFileSync('/tmp/mark', 'utf8')); } catch (e) { console.log(e.code); }` }], DEFAULT_R2_LIMITS, 'node');
  try {
    assert.equal((await runInSandbox(a, [NODE, '/tmp/work/attack.js'])).stdout.trim(), 'ok');
    assert.equal((await runInSandbox(b, [NODE, '/tmp/work/attack.js'])).stdout.trim(), 'ENOENT');
  } finally { cleanupAttempt(a); cleanupAttempt(b); }
});

test('the platform repository and its environment file are not inside the attempt directory', { skip }, () => {
  const a = prepareAttempt([{ path: 'index.html', content: '<h1>x</h1>' }], DEFAULT_R2_LIMITS, 'browser');
  try {
    const script = readFileSync(a.wrapper, 'utf8');
    assert.match(script, /--net --pid --ipc --uts --mount/);
    assert.match(script, /--no-new-privs --inh-caps=-all --bounding-set=-all/);
    assert.doesNotMatch(script, /DATABASE_URL|SUPABASE|SECRET|TOKEN/);
  } finally { cleanupAttempt(a); }
});

test('a killed runner leaves no orphan: stale attempts are swept at start', { skip }, () => {
  sweepStaleAttempts();
  const a = prepareAttempt([{ path: 'index.html', content: 'x' }], DEFAULT_R2_LIMITS, 'node');
  assert.equal(sweepStaleAttempts(), 0, 'a fresh attempt is never swept');
  assert.ok(sweepStaleAttempts(-1) >= 1);
  assert.equal(existsSync(a.dir), false);
  for (const cg of a.cgroups) assert.equal(existsSync(cg), false);
});
