/**
 * GitHubAppAdapter against a LOCAL mock GitHub (node:http on 127.0.0.1). No database, no real GitHub, no real
 * credential: the RSA key pair is generated here. The mock verifies the App JWT with the test public key and refuses
 * (and records as a violation) any installation-token request that is not scoped to ONE repository with read-only
 * permissions.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync, randomBytes, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { assertReadOnlyPermissions } from '@naqla/domain';
import { DEFAULT_SNAPSHOT_LIMITS, GitHubAppAdapter, GitHubHttpError, parseRepositoryTarball, type SnapshotLimits } from './github-app.adapter';
import { signInstallState, verifyInstallState } from './install-state';

/* ───────────────────────────── tar builder ───────────────────────────── */

function header(name: string, size: number, type: string, linkname = '', prefix = ''): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136);
  h.fill(0x20, 148, 156);
  h.write(type, 156);
  h.write(linkname, 157, 100, 'utf8');
  h.write('ustar\0', 257); h.write('00', 263);
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}
const pad = (b: Buffer) => (b.length % 512 ? Buffer.concat([b, Buffer.alloc(512 - (b.length % 512))]) : b);
function paxData(rec: Record<string, string>): Buffer {
  return Buffer.concat(Object.entries(rec).map(([k, v]) => {
    const body = ` ${k}=${v}\n`;
    let len = Buffer.byteLength(body) + 1;
    while (String(len).length + Buffer.byteLength(body) !== len) len = String(len).length + Buffer.byteLength(body);
    return Buffer.from(`${len}${body}`, 'utf8');
  }));
}

type Entry =
  | { file: string; body: string | Buffer; prefix?: string }
  | { dir: string }
  | { symlink: string; target: string }
  | { hardlink: string; target: string }
  | { paxFile: string; body: string }
  | { gnuFile: string; body: string }
  | { globalComment: string };

function tar(entries: Entry[]): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    if ('file' in e) { const b = Buffer.from(e.body); parts.push(header(e.file, b.length, '0', '', e.prefix ?? ''), pad(b)); }
    else if ('dir' in e) parts.push(header(e.dir, 0, '5'));
    else if ('symlink' in e) parts.push(header(e.symlink, 0, '2', e.target));
    else if ('hardlink' in e) parts.push(header(e.hardlink, 0, '1', e.target));
    else if ('paxFile' in e) { const p = paxData({ path: e.paxFile }); const b = Buffer.from(e.body); parts.push(header('PaxHeader/x', p.length, 'x'), pad(p), header('truncated-name', b.length, '0'), pad(b)); }
    else if ('gnuFile' in e) { const n = Buffer.from(e.gnuFile + '\0'); const b = Buffer.from(e.body); parts.push(header('././@LongLink', n.length, 'L'), pad(n), header('truncated-gnu', b.length, '0'), pad(b)); }
    else { const p = paxData({ comment: e.globalComment }); parts.push(header('pax_global_header', p.length, 'g'), pad(p)); }
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

/* ───────────────────────────── fixtures ───────────────────────────── */

const SHA1 = 'a'.repeat(40), SHA2 = 'b'.repeat(40), SHA3 = 'c'.repeat(40), MISSING = 'd'.repeat(40);
const TOP = `grad-one-site-${SHA3.slice(0, 7)}`;
const LONG_DIR = 'deep/' + 'nested-directory-name/'.repeat(6);
const NORMAL_ARCHIVE = tar([
  { globalComment: SHA3 },
  { dir: `${TOP}/` },
  { file: `${TOP}/index.html`, body: '<!doctype html><title>ok</title>' },
  { dir: `${TOP}/src/` },
  { file: 'app.js', prefix: `${TOP}/src`, body: 'console.log(1);' },
  { paxFile: `${TOP}/${LONG_DIR}notes.md`, body: '# long pax path' },
  { gnuFile: `${TOP}/${LONG_DIR}gnu-long.txt`, body: 'gnu long name' },
  { file: `${TOP}/.env`, body: 'SECRET=should-not-be-read' },
  { file: `${TOP}/.github/workflows/ci.json`, body: '{}' },
  { file: `${TOP}/src/.hidden.js`, body: 'hidden' },
  { symlink: `${TOP}/link.js`, target: '/etc/passwd' },
  { hardlink: `${TOP}/hard.js`, target: `${TOP}/index.html` },
  { file: `${TOP}/logo.png`, body: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  { file: `${TOP}/name with space.js`, body: 'skipped' },
  { file: `${TOP}/styles/site.css`, body: 'body{}' },
]);
const EXPECTED_FILES = ['index.html', 'src/app.js', `${LONG_DIR}notes.md`, `${LONG_DIR}gnu-long.txt`, 'styles/site.css'];

/* ───────────────────────────── mock GitHub ───────────────────────────── */

interface Issued { installationId: number; repositories: string[] | null; permissions: Record<string, string> }
interface MockRepo { id: number; installationId: number; commits: { sha: string; message: string; parents: number }[]; pulls: Record<number, object>; archive: Buffer }

class MockGitHub {
  readonly appId = '123456';
  readonly clientId = 'Iv1.testclientid';
  readonly clientSecret = 'test-client-secret-' + randomBytes(8).toString('hex');
  readonly userToken = 'ghu_user_' + randomBytes(12).toString('hex');
  readonly user = { id: 777, login: 'grad-one' };
  violations: string[] = [];
  tokenRequests: { installationId: number; body: { repositories?: string[]; permissions?: Record<string, string> } }[] = [];
  issued = new Map<string, Issued>();
  jwts: string[] = [];
  downloadAuth: (string | undefined)[] = [];
  explode: false | 'mint' | 'repo' = false;
  clockOffsetMs = 0;
  /** installation id → account id and granted permissions */
  installations = new Map<number, { accountId: number; login: string; permissions: Record<string, string> }>([
    [42, { accountId: 777, login: 'grad-one', permissions: { contents: 'read', metadata: 'read', pull_requests: 'read' } }],
    [44, { accountId: 777, login: 'grad-one', permissions: { contents: 'write', metadata: 'read', pull_requests: 'read' } }],
    [45, { accountId: 9001, login: 'some-org', permissions: { contents: 'read', metadata: 'read', pull_requests: 'read' } }],
    [46, { accountId: 777, login: 'grad-one', permissions: { metadata: 'read' } }],
    [99, { accountId: 555, login: 'someone-else', permissions: { contents: 'read', metadata: 'read', pull_requests: 'read' } }],
  ]);
  /** installations the authorized user can see (99 is someone else's) */
  userInstallationIds = [42, 44, 45, 46];
  repos = new Map<string, MockRepo>();
  server!: Server;
  base = '';

  constructor(readonly publicKey: KeyObject) {
    this.repos.set('grad-one/site', {
      id: 501, installationId: 42,
      commits: [{ sha: SHA3, message: 'Fix the root causes', parents: 1 }, { sha: SHA2, message: 'fix', parents: 1 }, { sha: SHA1, message: 'Initial commit', parents: 0 }],
      pulls: {
        1: { number: 1, title: 'Fix problems', body: null, head: { ref: 'fix/problems', sha: SHA3 }, base: { ref: 'main' }, commits: 2, state: 'open', merged: false },
        2: { number: 2, title: 'Merged one', body: 'done', head: { ref: 'feat/x', sha: SHA2 }, base: { ref: 'main' }, commits: 1, state: 'closed', merged: true },
      },
      archive: gzipSync(NORMAL_ARCHIVE),
    });
    this.repos.set('grad-one/blog', { id: 502, installationId: 42, commits: [{ sha: SHA1, message: 'blog', parents: 0 }], pulls: {}, archive: gzipSync(tar([{ dir: 'grad-one-blog-x/' }, { file: 'grad-one-blog-x/../../evil.js', body: 'x' }])) });
    this.repos.set('grad-one/not-selected', { id: 503, installationId: -1, commits: [{ sha: SHA1, message: 'x', parents: 0 }], pulls: {}, archive: gzipSync(tar([])) });
    this.repos.set('grad-one/huge', { id: 504, installationId: 42, commits: [], pulls: {}, archive: gzipSync(tar([{ dir: 'h/' }, { file: 'h/big.js', body: 'x'.repeat(600 * 1024) }])) });
    for (let i = 0; i < 150; i++) this.repos.set(`grad-one/many-${i}`, { id: 10_000 + i, installationId: 46, commits: [], pulls: {}, archive: gzipSync(tar([])) });
  }

  nowSec() { return Math.floor((Date.now() + this.clockOffsetMs) / 1000); }

  async start() {
    this.server = createServer((req, res) => { this.handle(req, res).catch(() => { res.statusCode = 500; res.end(); }); });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  async stop() { await new Promise<void>((r) => this.server.close(() => r())); }

  private verifyJwt(auth: string | undefined): boolean {
    const m = /^Bearer ([^.]+)\.([^.]+)\.([^.]+)$/.exec(auth ?? '');
    if (!m) return false;
    const [, h, p, s] = m as unknown as [string, string, string, string];
    const hdr = JSON.parse(Buffer.from(h, 'base64url').toString());
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    const sigOk = cryptoVerify('RSA-SHA256', Buffer.from(`${h}.${p}`), this.publicKey, Buffer.from(s, 'base64url'));
    const now = this.nowSec();
    const ok = sigOk && hdr.alg === 'RS256' && claims.iss === this.appId && typeof claims.iat === 'number' && typeof claims.exp === 'number'
      && claims.iat <= now && claims.exp > now && claims.exp - claims.iat <= 600;
    if (ok) this.jwts.push(`${h}.${p}.${s}`);
    else this.violations.push('invalid app JWT');
    return ok;
  }

  private bearer(req: IncomingMessage): string | null { return /^(?:Bearer|token) (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? null; }

  private send(res: ServerResponse, status: number, body?: unknown) {
    res.statusCode = status;
    if (body !== undefined) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); } else res.end();
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', this.base);
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString();
    const path = url.pathname;
    let m: RegExpExecArray | null;

    if (req.method === 'POST' && path === '/login/oauth/access_token') {
      const b = JSON.parse(raw);
      if (req.headers.accept !== 'application/json') this.violations.push('oauth exchange without Accept: application/json');
      if (b.client_id !== this.clientId || b.client_secret !== this.clientSecret) return this.send(res, 200, { error: 'incorrect_client_credentials' });
      if (b.code !== 'good-code') return this.send(res, 200, { error: 'bad_verification_code', error_description: `The code passed is incorrect; secret=${this.clientSecret}` });
      return this.send(res, 200, { access_token: this.userToken, token_type: 'bearer', scope: '' });
    }
    if (req.method === 'GET' && path === '/user') {
      if (this.bearer(req) !== this.userToken) return this.send(res, 401, { message: 'Bad credentials' });
      return this.send(res, 200, this.user);
    }
    if (req.method === 'GET' && path === '/user/installations') {
      if (this.bearer(req) !== this.userToken) return this.send(res, 401, { message: 'Bad credentials' });
      const list = this.userInstallationIds.map((id) => ({ id, account: { id: this.installations.get(id)!.accountId, login: this.installations.get(id)!.login } }));
      return this.send(res, 200, { total_count: list.length, installations: list });
    }
    if ((m = /^\/app\/installations\/(\d+)$/.exec(path)) && req.method === 'GET') {
      if (!this.verifyJwt(req.headers.authorization)) return this.send(res, 401, { message: 'jwt' });
      const inst = this.installations.get(Number(m[1]));
      if (!inst) return this.send(res, 404, { message: 'Not Found' });
      return this.send(res, 200, { id: Number(m[1]), account: { id: inst.accountId, login: inst.login }, permissions: inst.permissions });
    }
    if ((m = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(path)) && req.method === 'POST') {
      if (!this.verifyJwt(req.headers.authorization)) return this.send(res, 401, { message: 'jwt' });
      if (this.explode === 'mint') return this.send(res, 500, { message: `boom ${req.headers.authorization}` });
      const installationId = Number(m[1]);
      const body = JSON.parse(raw || '{}') as { repositories?: string[]; permissions?: Record<string, string> };
      this.tokenRequests.push({ installationId, body });
      const perms = JSON.stringify(Object.entries(body.permissions ?? {}).sort());
      const READ3 = JSON.stringify(Object.entries({ contents: 'read', metadata: 'read', pull_requests: 'read' }).sort());
      const LIST = JSON.stringify([['metadata', 'read']]);
      let repositories: string[] | null;
      if (Array.isArray(body.repositories)) {
        if (body.repositories.length !== 1) { this.violations.push(`token not scoped to ONE repository: ${body.repositories.length}`); return this.send(res, 400, { message: 'scope' }); }
        if (perms !== READ3) { this.violations.push(`repository token permissions not read-only three: ${perms}`); return this.send(res, 400, { message: 'perms' }); }
        const name = body.repositories[0]!;
        const repo = [...this.repos.entries()].find(([fn, r]) => fn.split('/')[1] === name && r.installationId === installationId);
        if (!repo) return this.send(res, 422, { message: 'There is at least one repository that does not exist or is not accessible to the parent installation.' });
        repositories = [name];
      } else {
        if (perms !== LIST) { this.violations.push(`unscoped token must be metadata:read only, got ${perms}`); return this.send(res, 400, { message: 'perms' }); }
        repositories = null;
      }
      const token = 'ghs_' + randomBytes(18).toString('hex');
      this.issued.set(token, { installationId, repositories, permissions: body.permissions ?? {} });
      return this.send(res, 201, { token, expires_at: new Date((this.nowSec() + 3600) * 1000).toISOString(), permissions: body.permissions, repository_selection: 'selected' });
    }
    if (req.method === 'GET' && path === '/installation/repositories') {
      const t = this.issued.get(this.bearer(req) ?? '');
      if (!t) return this.send(res, 401, { message: 'Bad credentials' });
      if (t.repositories !== null) this.violations.push('listing used a repository-scoped token');
      const all = [...this.repos.entries()].filter(([, r]) => r.installationId === t.installationId);
      const per = Number(url.searchParams.get('per_page') ?? 30), page = Number(url.searchParams.get('page') ?? 1);
      const slice = all.slice((page - 1) * per, page * per).map(([fn, r]) => ({ id: r.id, full_name: fn, owner: { login: fn.split('/')[0] }, private: true, default_branch: 'main' }));
      return this.send(res, 200, { total_count: all.length, repositories: slice });
    }
    if ((m = /^\/download\/([\w.-]+)\/([\w.-]+)$/.exec(path))) {
      this.downloadAuth.push(req.headers.authorization);
      const repo = this.repos.get(`${m[1]}/${m[2]}`)!;
      res.setHeader('content-type', 'application/x-gzip');
      res.statusCode = 200;
      return res.end(repo.archive);
    }
    if ((m = /^\/repos\/([\w-]+)\/([\w.-]+)\/(.+)$/.exec(path))) {
      const [, owner, name, rest] = m as unknown as [string, string, string, string];
      const tok = this.bearer(req);
      const t = this.issued.get(tok ?? '');
      if (!t) return this.send(res, 401, { message: 'Bad credentials' });
      if (t.repositories === null || t.repositories.length !== 1 || t.repositories[0] !== name) { this.violations.push(`repository call with a token not scoped to ${name}`); return this.send(res, 404, { message: 'Not Found' }); }
      if (this.explode === 'repo') return this.send(res, 500, { message: `internal error for token ${tok} secret ${this.clientSecret}` });
      const repo = this.repos.get(`${owner}/${name}`);
      if (!repo || repo.installationId !== t.installationId) return this.send(res, 404, { message: 'Not Found' });
      let mm: RegExpExecArray | null;
      if ((mm = /^commits\/([0-9a-f]{40})$/.exec(rest))) {
        const c = repo.commits.find((x) => x.sha === mm![1]);
        if (!c) return this.send(res, 404, { message: 'Not Found' });
        return this.send(res, 200, { sha: c.sha, commit: { message: c.message }, parents: Array.from({ length: c.parents }, () => ({ sha: SHA1 })) });
      }
      if (rest === 'commits') {
        const head = url.searchParams.get('sha'); const per = Number(url.searchParams.get('per_page') ?? 30);
        const idx = repo.commits.findIndex((c) => c.sha === head);
        if (idx === -1) return this.send(res, 404, { message: 'Not Found' });
        return this.send(res, 200, repo.commits.slice(idx, idx + per).map((c) => ({ sha: c.sha, commit: { message: c.message }, parents: Array.from({ length: c.parents }, () => ({})) })));
      }
      if ((mm = /^pulls\/(\d+)$/.exec(rest))) {
        const pr = repo.pulls[Number(mm[1])];
        return pr ? this.send(res, 200, pr) : this.send(res, 404, { message: 'Not Found' });
      }
      if ((mm = /^tarball\/([0-9a-f]{40})$/.exec(rest))) {
        res.statusCode = 302;
        res.setHeader('location', `${this.base}/download/${owner}/${name}`);
        return res.end();
      }
    }
    this.violations.push(`unexpected ${req.method} ${path}`);
    return this.send(res, 404, { message: 'Not Found' });
  }
}

/* ───────────────────────────── tests ───────────────────────────── */

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
let gh: MockGitHub;

function adapter(extra: Partial<ConstructorParameters<typeof GitHubAppAdapter>[0]> = {}) {
  return new GitHubAppAdapter({
    appId: gh.appId, privateKeyPem: PRIVATE_PEM, clientId: gh.clientId, clientSecret: gh.clientSecret,
    apiBase: gh.base, webBase: gh.base, now: () => Date.now() + gh.clockOffsetMs, ...extra,
  });
}

before(async () => { gh = new MockGitHub(publicKey); await gh.start(); });
after(async () => { await gh.stop(); });
beforeEach(() => { gh.violations = []; gh.tokenRequests = []; gh.jwts = []; gh.downloadAuth = []; gh.explode = false; gh.clockOffsetMs = 0; });

describe('App JWT', () => {
  test('RS256, iat = now-60, exp = now+540, iss = App ID; verified by the mock with the public key', async () => {
    const a = adapter();
    const t0 = Math.floor(Date.now() / 1000);
    const jwt = a.appJwt();
    const [h, p, s] = jwt.split('.') as [string, string, string];
    assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' });
    const c = JSON.parse(Buffer.from(p, 'base64url').toString());
    assert.equal(c.iss, gh.appId);
    assert.ok(Math.abs(c.iat - (t0 - 60)) <= 1 && c.exp - c.iat === 600);
    assert.ok(cryptoVerify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url')));
    await a.getCommit(42, 'grad-one/site', SHA3);
    assert.equal(gh.jwts.length, 1);
    assert.deepEqual(gh.violations, []);
  });

  test('constructor refuses a non-numeric App ID or an unusable key without echoing it', () => {
    assert.throws(() => adapter({ appId: 'abc' }), /\[github_app_config\]/);
    const bogus = '-----BEGIN PRIVATE KEY-----\nnot-a-key-SENTINEL\n-----END PRIVATE KEY-----';
    assert.throws(() => adapter({ privateKeyPem: bogus }), (e: Error) => /\[github_app_config\]/.test(e.message) && !e.message.includes('SENTINEL'));
    const a = adapter();
    assert.ok(!JSON.stringify(a).includes(gh.clientSecret) && !JSON.stringify(a).includes('PRIVATE KEY'));
  });
});

describe('installation tokens', () => {
  test('every repository call mints a token scoped to ONE repository with read-only permissions', async () => {
    const a = adapter();
    assert.deepEqual(await a.getCommit(42, 'grad-one/site', SHA3), { sha: SHA3, message: 'Fix the root causes', parents: 1 });
    assert.equal(await a.getPullRequest(42, 'grad-one/blog', 1), null);
    assert.equal(gh.tokenRequests.length, 2);
    assert.deepEqual(gh.tokenRequests.map((r) => r.body.repositories), [['site'], ['blog']]);
    for (const r of gh.tokenRequests) assert.deepEqual(r.body.permissions, { contents: 'read', metadata: 'read', pull_requests: 'read' });
    assert.deepEqual(gh.violations, []);
  });

  test('cached in memory per installation+repository until expires_at minus 60 s, then re-minted', async () => {
    const a = adapter();
    await a.getCommit(42, 'grad-one/site', SHA3);
    await a.listCommits(42, 'grad-one/site', SHA3, 10);
    assert.equal(gh.tokenRequests.length, 1);
    gh.clockOffsetMs = (3600 - 59) * 1000;
    await a.getCommit(42, 'grad-one/site', SHA3);
    assert.equal(gh.tokenRequests.length, 2);
    assert.deepEqual(gh.violations, []);
  });

  test('a repository outside the installation reads as absent (token mint refused)', async () => {
    const a = adapter();
    assert.equal(await a.getCommit(42, 'grad-one/not-selected', SHA1), null);
    assert.equal(await a.getPullRequest(42, 'grad-one/not-selected', 1), null);
    assert.deepEqual(await a.listCommits(42, 'grad-one/not-selected', SHA1, 5), []);
    await assert.rejects(a.snapshot(42, 'grad-one/not-selected', SHA1), /\[github_commit_not_found\]/);
  });
});

describe('completeInstallation', () => {
  test('exchanges the code, proves ownership, returns GitHub-granted permissions and the GitHub selection', async () => {
    const g = await adapter().completeInstallation({ code: 'good-code', installationId: 42, requestedLogin: 'Grad-One', selectRepositories: ['grad-one/not-selected'] });
    assert.equal(g.githubUserId, 777);
    assert.equal(g.login, 'grad-one');
    assert.equal(g.installationId, 42);
    assert.deepEqual(g.permissions, { contents: 'read', metadata: 'read', pull_requests: 'read' });
    assert.deepEqual(g.repositories.map((r) => r.fullName).sort(), ['grad-one/blog', 'grad-one/huge', 'grad-one/site']);
    assert.deepEqual(g.repositories.find((r) => r.fullName === 'grad-one/site'), { repoId: 501, fullName: 'grad-one/site', ownerLogin: 'grad-one', private: true, defaultBranch: 'main' });
    assertReadOnlyPermissions(g.permissions);
    assert.ok(!JSON.stringify(g).includes(gh.userToken), 'the user token is not returned');
    assert.deepEqual(gh.violations, []);
  });

  test('refuses an installation that is not among the user\'s installations', async () => {
    await assert.rejects(adapter().completeInstallation({ code: 'good-code', installationId: 99 }), /\[github_installation_not_yours\]/);
    assert.equal(gh.tokenRequests.filter((r) => r.installationId === 99).length, 0, 'no token minted for a foreign installation');
  });

  test('refuses an installation on another account (organization) and a login mismatch', async () => {
    await assert.rejects(adapter().completeInstallation({ code: 'good-code', installationId: 45 }), /\[github_installation_not_personal\]/);
    await assert.rejects(adapter().completeInstallation({ code: 'good-code', installationId: 42, requestedLogin: 'someone' }), /\[github_login_mismatch\]/);
  });

  test('write permissions granted on GitHub are returned as granted, so assertReadOnlyPermissions refuses', async () => {
    const g = await adapter().completeInstallation({ code: 'good-code', installationId: 44 });
    assert.deepEqual(g.permissions, { contents: 'write', metadata: 'read', pull_requests: 'read' });
    assert.throws(() => assertReadOnlyPermissions(g.permissions), /\[github_permissions\].*contents: write/);
  });

  test('a refused code fails without echoing the client secret or GitHub\'s description', async () => {
    await assert.rejects(adapter().completeInstallation({ code: 'bad-code', installationId: 42 }), (e: Error) => {
      assert.match(e.message, /\[github_code\].*bad_verification_code/);
      assert.ok(!e.message.includes(gh.clientSecret));
      return true;
    });
  });

  test('repository listing paginates and is capped at 100', async () => {
    const repos = await adapter().listInstallationRepos(46);
    assert.equal(repos.length, 100);
    assert.equal(new Set(repos.map((r) => r.repoId)).size, 100);
    const listing = gh.tokenRequests.filter((r) => r.installationId === 46);
    assert.equal(listing.length, 1);
    assert.deepEqual(listing[0]!.body, { permissions: { metadata: 'read' } });
    assert.deepEqual(gh.violations, []);
  });
});

describe('reads', () => {
  test('getCommit / getPullRequest map 404 to null; PR fields and merged state', async () => {
    const a = adapter();
    assert.equal(await a.getCommit(42, 'grad-one/site', MISSING), null);
    assert.equal(await a.getPullRequest(42, 'grad-one/site', 7), null);
    assert.deepEqual(await a.getPullRequest(42, 'grad-one/site', 1), { number: 1, title: 'Fix problems', body: '', headRef: 'fix/problems', baseRef: 'main', commits: 2, headSha: SHA3, state: 'open' });
    assert.equal((await a.getPullRequest(42, 'grad-one/site', 2))!.state, 'merged');
  });

  test('listCommits returns newest-first from the head, at most max', async () => {
    const list = await adapter().listCommits(42, 'grad-one/site', SHA3, 2);
    assert.deepEqual(list, [{ sha: SHA3, message: 'Fix the root causes', parents: 1 }, { sha: SHA2, message: 'fix', parents: 1 }]);
  });

  test('HTTP errors carry the status only: no token, JWT, secret or response body', async () => {
    const a = adapter();
    const cases: ['mint' | 'repo', () => Promise<unknown>][] = [
      ['repo', () => a.getCommit(42, 'grad-one/site', SHA3)], ['repo', () => a.snapshot(42, 'grad-one/site', SHA3)],
      ['mint', () => a.getPullRequest(42, 'grad-one/site', 1)], ['mint', () => a.listInstallationRepos(42)],
    ];
    for (const [mode, call] of cases) {
      gh.explode = mode;
      a['tokens'].clear(); // a fresh mint on every call
      await assert.rejects(call(), (e: Error) => {
        assert.ok(e instanceof GitHubHttpError);
        assert.equal(e.status, 500);
        for (const secret of [...gh.issued.keys(), gh.clientSecret, gh.userToken, ...gh.jwts, PRIVATE_PEM.split('\n')[1]!]) assert.ok(!e.message.includes(secret), 'secret leaked into the error');
        assert.ok(!/boom|internal error/.test(e.message));
        assert.ok(!(e.stack ?? '').includes('ghs_'));
        return true;
      });
    }
    const unreachable = adapter({ apiBase: 'http://127.0.0.1:1' });
    await assert.rejects(unreachable.getCommit(42, 'grad-one/site', SHA3), (e: Error) => /\[github_unreachable\]/.test(e.message) && !e.message.includes('127.0.0.1'));
  });
});

describe('snapshot', () => {
  test('downloads via the redirect WITHOUT the token, strips the top directory, keeps only safe allowed files', async () => {
    const files = await adapter().snapshot(42, 'grad-one/site', SHA3);
    assert.deepEqual(files.map((f) => f.path).sort(), [...EXPECTED_FILES].sort());
    assert.equal(files.find((f) => f.path === 'index.html')!.content, '<!doctype html><title>ok</title>');
    assert.equal(files.find((f) => f.path === 'src/app.js')!.content, 'console.log(1);');
    assert.deepEqual(gh.downloadAuth, [undefined], 'the installation token is never sent to the download host');
    assert.ok(!files.some((f) => f.content.includes('should-not-be-read') || f.path === 'link.js' || f.path === 'hard.js'));
    assert.deepEqual(gh.violations, []);
  });

  test('path traversal in the archive refuses the whole snapshot', async () => {
    await assert.rejects(adapter().snapshot(42, 'grad-one/blog', SHA1), /\[github_archive_unsafe_path\]/);
  });

  test('an over-cap file in the archive refuses the snapshot; unknown commits are not found', async () => {
    await assert.rejects(adapter().snapshot(42, 'grad-one/huge', SHA1), /\[github_archive_file_too_large\]/);
    await assert.rejects(adapter({ snapshotLimits: { maxArchiveBytes: 64 } }).snapshot(42, 'grad-one/site', SHA3), /\[github_archive_too_large\]/);
  });

  const reject = (entries: Entry[], re: RegExp, limits?: Partial<SnapshotLimits>) =>
    assert.throws(() => parseRepositoryTarball(tar(entries), { ...DEFAULT_SNAPSHOT_LIMITS, ...limits }), re);

  test('traversal and absolute paths are refused in every name form (plain, ustar prefix, pax, GNU, links)', () => {
    reject([{ dir: 'top/' }, { file: 'top/../x.js', body: '' }], /unsafe_path/);
    reject([{ file: '/etc/x.js', body: '' }], /unsafe_path/);
    reject([{ dir: 'top/' }, { file: 'x.js', prefix: 'top/a/../..', body: '' }], /unsafe_path/);
    reject([{ dir: 'top/' }, { paxFile: 'top/../../x.js', body: '' }], /unsafe_path/);
    reject([{ dir: 'top/' }, { gnuFile: 'top/a/../../../x.js', body: '' }], /unsafe_path/);
    reject([{ dir: 'top/' }, { symlink: 'top/../link', target: 'x' }], /unsafe_path/);
    reject([{ dir: 'top/' }, { file: 'top/a\\..\\x.js', body: '' }], /unsafe_path/);
    reject([{ dir: 'top/' }, { file: 'other/x.js', body: '' }], /unexpected layout/);
  });

  test('symlinks / hard links are ignored even with an allowed name, and a symlink to outside does not leak', () => {
    const files = parseRepositoryTarball(tar([{ dir: 't/' }, { symlink: 't/a.js', target: '../../etc/passwd' }, { hardlink: 't/b.js', target: '/etc/shadow' }, { file: 't/c.js', body: 'c' }]));
    assert.deepEqual(files, [{ path: 'c.js', content: 'c' }]);
  });

  test('caps: per file, total and file count', () => {
    reject([{ dir: 't/' }, { file: 't/big.js', body: 'x'.repeat(512 * 1024 + 1) }], /file_too_large/);
    reject([{ dir: 't/' }, ...Array.from({ length: 5 }, (_, i) => ({ file: `t/f${i}.js`, body: 'x'.repeat(500 * 1024) }))], /github_archive_too_large/);
    reject([{ dir: 't/' }, ...Array.from({ length: 201 }, (_, i) => ({ file: `t/f${i}.txt`, body: 'x' }))], /too_many_files/);
    assert.equal(parseRepositoryTarball(tar([{ dir: 't/' }, ...Array.from({ length: 200 }, (_, i) => ({ file: `t/f${i}.txt`, body: 'x' }))])).length, 200);
    // filtered-out files do not count toward the caps
    assert.deepEqual(parseRepositoryTarball(tar([{ dir: 't/' }, { file: 't/photo.png', body: Buffer.alloc(900 * 1024) }, { file: 't/a.md', body: 'a' }])), [{ path: 'a.md', content: 'a' }]);
  });

  test('a corrupted header checksum or a duplicate path refuses the archive', () => {
    const t = tar([{ dir: 't/' }, { file: 't/a.js', body: 'a' }]);
    t[512 + 10] = 0x41;
    assert.throws(() => parseRepositoryTarball(t), /malformed/);
    reject([{ dir: 't/' }, { file: 't/a.js', body: 'a' }, { file: 't/a.js', body: 'b' }], /repeats a path/);
  });
});

describe('install state (CSRF)', () => {
  const SECRET = 's'.repeat(40);
  test('round-trips the user id', () => {
    assert.equal(verifyInstallState(signInstallState('user-123', SECRET), SECRET), 'user-123');
  });
  test('expires after ttl', () => {
    const t0 = Date.now();
    const s = signInstallState('u1', SECRET, 600, t0);
    assert.equal(verifyInstallState(s, SECRET, t0 + 599_000), 'u1');
    assert.throws(() => verifyInstallState(s, SECRET, t0 + 600_000), /\[github_state\].*expired/);
  });
  test('refuses tampering, a wrong secret, garbage and a short secret', () => {
    const s = signInstallState('u1', SECRET);
    const [p, sig] = s.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), u: 'admin' })).toString('base64url');
    assert.throws(() => verifyInstallState(`${forged}.${sig}`, SECRET), /\[github_state\]/);
    assert.throws(() => verifyInstallState(`${p}.${sig.slice(0, -2)}AA`, SECRET), /\[github_state\]/);
    assert.throws(() => verifyInstallState(s, 'x'.repeat(40)), /\[github_state\]/);
    for (const g of ['', 'abc', 'a.b.c', `${p}.`, '..']) assert.throws(() => verifyInstallState(g, SECRET), /\[github_state\]/);
    assert.throws(() => signInstallState('u1', 'short'), /\[github_state_secret\]/);
  });
});
