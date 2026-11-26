import type { CommitShape, PullRequestShape, SubmittedFile } from '@naqla/domain';

/** What GitHub reports about one repository the graduate selected. */
export interface GitHubRepoInfo { readonly repoId: number; readonly fullName: string; readonly ownerLogin: string; readonly private: boolean; readonly defaultBranch: string }

export interface InstallationGrant {
  readonly githubUserId: number;
  readonly login: string;
  readonly installationId: number;
  /** The permissions the installation actually carries (checked against the read-only allowance). */
  readonly permissions: Readonly<Record<string, string>>;
  readonly repositories: readonly GitHubRepoInfo[];
}

export interface PullRequestInfo extends PullRequestShape { readonly headSha: string; readonly state: 'open' | 'closed' | 'merged' }

/**
 * The only way the API reaches GitHub. Two implementations are planned: the simulated TEST double (now), and a GitHub
 * App adapter after the owner approves the design (not implemented; GITHUB_MODE has no value for it yet).
 * Every call is scoped to ONE installation; an adapter mints a short-lived installation token per call and never
 * stores it.
 */
export interface GitHubPort {
  readonly mode: 'simulated';
  completeInstallation(p: { code: string; installationId: number; requestedLogin: string; selectRepositories: readonly string[] }): Promise<InstallationGrant>;
  listInstallationRepos(installationId: number): Promise<readonly GitHubRepoInfo[]>;
  getCommit(installationId: number, fullName: string, sha: string): Promise<CommitShape | null>;
  listCommits(installationId: number, fullName: string, headSha: string, max: number): Promise<readonly CommitShape[]>;
  getPullRequest(installationId: number, fullName: string, n: number): Promise<PullRequestInfo | null>;
  /** The files of one commit. The adapter downloads the archive at that SHA; only allowed paths are returned. */
  snapshot(installationId: number, fullName: string, sha: string): Promise<readonly SubmittedFile[]>;
}

export const GITHUB_PORT = Symbol('GITHUB_PORT');
