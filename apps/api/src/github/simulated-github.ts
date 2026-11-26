/**
 * SIMULATED GitHub — a TEST double. It makes no network request and holds no credential. Synthetic repositories are
 * built from the pilot's own starter materials and reference solutions, so the flow (install on selected repositories,
 * pin a commit, read a PR, snapshot, revoke) can be exercised end to end. Refused in production by configuration and
 * again here.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { CommitShape, SubmittedFile } from '@naqla/domain';
import type { GitHubPort, GitHubRepoInfo, InstallationGrant, PullRequestInfo } from './github.port';

function repoRoot(): string {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const p = join(d, 'package.json');
    if (existsSync(p) && /"name":\s*"naqla"/.test(readFileSync(p, 'utf8'))) return d;
    d = dirname(d);
  }
  throw new Error('repository root not found');
}

const SAFE = /^(?!.*(^|\/)\.)[A-Za-z0-9_\-./]{1,160}\.(html|css|js|mjs|json|md|txt|svg)$/i;
function readTree(dir: string): SubmittedFile[] {
  const out: SubmittedFile[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else { const rel = relative(dir, p); if (SAFE.test(rel)) out.push({ path: rel, content: readFileSync(p, 'utf8') }); } } };
  walk(dir);
  return out;
}

interface SimCommit extends CommitShape { readonly files: readonly SubmittedFile[] }
interface SimRepo { readonly info: GitHubRepoInfo; readonly commits: readonly SimCommit[]; readonly pulls: readonly PullRequestInfo[] }

const sha = (s: string) => createHash('sha1').update(s).digest('hex');
let nextRepoId = 9000;

export const SIMULATED_REPO_TEMPLATES = ['leave-requests', 'workshop-registration', 'team-tasks'] as const;
const MATERIALS: Record<(typeof SIMULATED_REPO_TEMPLATES)[number], string> = {
  'leave-requests': 'act_fe_integrated_leave_requests', 'workshop-registration': 'act_fe_debug_improve', 'team-tasks': 'act_fe_change_request',
};

export class SimulatedGitHub implements GitHubPort {
  readonly mode = 'simulated' as const;
  private readonly repos = new Map<string, SimRepo>();
  private readonly installations = new Map<number, { login: string; userId: number; repoNames: string[] }>();

  constructor() {
    if (process.env['NODE_ENV'] === 'production') throw new Error('[github_simulated_refused] The simulated GitHub double is refused in production.');
  }

  private materials(name: (typeof SIMULATED_REPO_TEMPLATES)[number]) {
    const base = join(repoRoot(), 'data', 'candidates', 'trk_frontend_junior_v2', 'materials', MATERIALS[name]);
    return { starter: readTree(join(base, 'graduate')), solution: readTree(join(base, 'reviewer', 'solution')) };
  }

  /** Synthetic repositories for a synthetic login: three activity repositories it owns, and one it does not. */
  private ensureAccount(login: string): void {
    for (const t of SIMULATED_REPO_TEMPLATES) {
      const fullName = `${login}/${t}`;
      if (this.repos.has(fullName)) continue;
      const { starter, solution } = this.materials(t);
      const merged = [...starter.filter((f) => !solution.some((s) => s.path === f.path)), ...solution];
      const c1 = sha(`${fullName}:1`), c2 = sha(`${fullName}:2`), c3 = sha(`${fullName}:3`);
      const commits: SimCommit[] = [
        { sha: c1, message: 'Add the starter project as received', parents: 0, files: starter },
        { sha: c2, message: 'fix', parents: 1, files: starter },
        { sha: c3, message: 'Fix the root causes and keep the change small', parents: 1, files: merged },
      ];
      this.repos.set(fullName, {
        info: { repoId: ++nextRepoId, fullName, ownerLogin: login, private: true, defaultBranch: 'main' }, commits,
        pulls: [{ number: 1, title: 'Fix reported problems', body: 'Fixes the reported problems at their cause. See notes in the submission.', headRef: 'fix/reported-problems', baseRef: 'main', commits: 2, headSha: c3, state: 'open' }],
      });
    }
    const shared = 'sim-other/shared-project';
    if (!this.repos.has(shared)) {
      const { starter } = this.materials('team-tasks');
      this.repos.set(shared, { info: { repoId: ++nextRepoId, fullName: shared, ownerLogin: 'sim-other', private: false, defaultBranch: 'main' }, commits: [{ sha: sha(`${shared}:1`), message: 'Initial commit', parents: 0, files: starter }], pulls: [] });
    }
  }

  async completeInstallation(p: { code: string; installationId: number; requestedLogin: string; selectRepositories: readonly string[] }): Promise<InstallationGrant> {
    if (p.code !== 'simulated') throw new Error('[github_code] invalid authorization code');
    if (!/^sim-[a-z0-9-]{2,30}$/.test(p.requestedLogin)) throw new Error('[github_simulated_login] simulated logins start with sim-');
    this.ensureAccount(p.requestedLogin);
    const names = p.selectRepositories.filter((n) => this.repos.has(n));
    this.installations.set(p.installationId, { login: p.requestedLogin, userId: 100000 + p.installationId, repoNames: names });
    return {
      githubUserId: 100000 + p.installationId, login: p.requestedLogin, installationId: p.installationId,
      permissions: { contents: 'read', metadata: 'read', pull_requests: 'read' },
      repositories: names.map((n) => this.repos.get(n)!.info),
    };
  }

  private repo(installationId: number, fullName: string): SimRepo | null {
    const inst = this.installations.get(installationId);
    if (!inst || !inst.repoNames.includes(fullName)) return null; // GitHub answers 404 outside the installation
    return this.repos.get(fullName) ?? null;
  }

  async listInstallationRepos(installationId: number) { return (this.installations.get(installationId)?.repoNames ?? []).map((n) => this.repos.get(n)!.info); }
  async getCommit(i: number, fullName: string, s: string) { const c = this.repo(i, fullName)?.commits.find((x) => x.sha === s); return c ? { sha: c.sha, message: c.message, parents: c.parents } : null; }
  async listCommits(i: number, fullName: string, headSha: string, max: number) {
    const r = this.repo(i, fullName); if (!r) return [];
    const idx = r.commits.findIndex((c) => c.sha === headSha);
    return r.commits.slice(0, idx + 1).reverse().slice(0, max).map((c) => ({ sha: c.sha, message: c.message, parents: c.parents }));
  }
  async getPullRequest(i: number, fullName: string, n: number) { return this.repo(i, fullName)?.pulls.find((p) => p.number === n) ?? null; }
  async snapshot(i: number, fullName: string, s: string) {
    const c = this.repo(i, fullName)?.commits.find((x) => x.sha === s);
    if (!c) throw new Error('[github_commit_not_found] commit not found in the selected repository');
    return c.files;
  }

  /** Test hook: simulates the graduate removing a repository from the installation on GitHub. */
  removeRepositoryFromInstallation(installationId: number, fullName: string): void {
    const inst = this.installations.get(installationId);
    if (inst) inst.repoNames = inst.repoNames.filter((n) => n !== fullName);
  }
}
