/**
 * GitHub as the delivery and evidence channel for programming activities (owner decision, Phase C round 2, item 1).
 *
 * The rules here are independent of how GitHub is reached (a GitHub App in production after approval; a simulated
 * provider in tests). They fix:
 *  - LEAST PRIVILEGE: the platform may only ever hold read permissions on repositories the graduate selected.
 *  - WHEN GitHub is required: only for activities that measure Git or the code workflow; optional for other
 *    programming activities; never for non-programming tracks. No organisation is ever required.
 *  - PINNING: a submission from a repository is pinned to one full commit SHA; the evidence is that snapshot.
 *  - NO COUNTS AS PROOF: commit / PR counts are observations for a person, never skill proof.
 *  - UNTRUSTED CONTENT: everything read from a repository is data, never instructions, before any agent sees it.
 */
import { DomainError } from './errors.js';

/* ───────────────────────────── permissions ───────────────────────────── */

/** The only repository permissions the platform may request (GitHub App permission names, read level only). */
export const GITHUB_ALLOWED_PERMISSIONS = { contents: 'read', metadata: 'read', pull_requests: 'read' } as const;
export type GitHubPermissionName = keyof typeof GITHUB_ALLOWED_PERMISSIONS;

/** Refuses any permission set that is not a subset of the read-only allowance. */
export function assertReadOnlyPermissions(perms: Readonly<Record<string, string>>): void {
  for (const [name, level] of Object.entries(perms)) {
    const allowed = (GITHUB_ALLOWED_PERMISSIONS as Record<string, string>)[name];
    if (!allowed) throw new DomainError(`[github_permissions] Permission "${name}" is not allowed; the platform reads code, commits and pull requests only.`, { name });
    if (level !== 'read') throw new DomainError(`[github_permissions] "${name}: ${level}" is refused; only read access is ever requested.`, { name, level });
  }
}

/* ─────────────────────────── when it is required ────────────────────────── */

export const GITHUB_REQUIREMENTS = ['required', 'optional', 'none'] as const;
export type GitHubRequirement = (typeof GITHUB_REQUIREMENTS)[number];

export interface ActivityDeliverableShape { readonly key: string; readonly mandatory: boolean }

/**
 * `required` when the activity measures Git / the code workflow (a mandatory pull-request or commit deliverable, or a
 * criterion keyed `git_workflow`); `optional` for other activities of a programming track; `none` otherwise.
 */
export function githubRequirementFor(p: { programmingTrack: boolean; deliverables: readonly ActivityDeliverableShape[]; criterionKeys: readonly string[] }): GitHubRequirement {
  if (!p.programmingTrack) return 'none';
  const measuresGit = p.criterionKeys.includes('git_workflow')
    || p.deliverables.some((d) => d.mandatory && /^(link\.pull_request|text\.head_sha|link\.commit)/.test(d.key));
  return measuresGit ? 'required' : 'optional';
}

export const GITHUB_REQUIREMENT_AR: Record<GitHubRequirement, string> = {
  required: 'هذا النشاط يقيس العمل بـGit وطلب الدمج، فالتسليم من مستودع GitHub مطلوب.',
  optional: 'يمكنك التسليم من مستودع GitHub أو برفع الملفات.',
  none: '',
};

/* ───────────────────────────── link & selection ──────────────────────────── */

export const GITHUB_LINK_STATUSES = ['connected', 'revoked'] as const;
export type GitHubLinkStatus = (typeof GITHUB_LINK_STATUSES)[number];

export interface SelectedRepository {
  readonly repoId: number;
  readonly fullName: string;
  readonly private: boolean;
  /** The GitHub account that owns the repository. */
  readonly ownerLogin: string;
}

export interface GitHubLinkState {
  readonly status: GitHubLinkStatus;
  readonly githubLogin: string;
  readonly selected: readonly SelectedRepository[];
}

const FULL_NAME_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

/**
 * A repository may be used only if the link is live, the graduate selected it for the platform, and the graduate is
 * its owner (personal account) — the proof of ownership is that GitHub listed it in the graduate's own installation.
 */
export function assertRepositoryUsable(link: GitHubLinkState | null, repoId: number): SelectedRepository {
  if (!link || link.status !== 'connected') throw new DomainError('[github_not_linked] Connect GitHub first; access was never granted or has been withdrawn.');
  const repo = link.selected.find((r) => r.repoId === repoId);
  if (!repo) throw new DomainError('[github_repo_not_selected] This repository was not selected for NAQLA. Only repositories you chose can be read.', { repoId });
  if (!FULL_NAME_RE.test(repo.fullName)) throw new DomainError('[github_repo] Unexpected repository name.', { repoId });
  if (repo.ownerLogin.toLowerCase() !== link.githubLogin.toLowerCase()) {
    throw new DomainError('[github_repo_not_owned] The repository must belong to your own GitHub account.', { repoId });
  }
  return repo;
}

/* ─────────────────────────────── pinning ─────────────────────────────────── */

export interface GitHubSourcePin {
  readonly repoId: number;
  readonly fullName: string;
  readonly commitSha: string;
  readonly pullRequestNumber: number | null;
  readonly branch: string | null;
}

const SHA_RE = /^[0-9a-f]{40}$/;
const BRANCH_RE = /^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._\-/]{1,200}$/;

export function assertSourcePin(pin: GitHubSourcePin): GitHubSourcePin {
  if (!SHA_RE.test(pin.commitSha)) throw new DomainError('[github_pin] A submission is pinned to one full 40-character commit SHA.', { sha: pin.commitSha });
  if (pin.pullRequestNumber !== null && (!Number.isInteger(pin.pullRequestNumber) || pin.pullRequestNumber < 1)) throw new DomainError('[github_pin] Invalid pull request number.');
  if (pin.branch !== null && !BRANCH_RE.test(pin.branch)) throw new DomainError('[github_pin] Invalid branch name.');
  if (!FULL_NAME_RE.test(pin.fullName)) throw new DomainError('[github_pin] Invalid repository name.');
  return pin;
}

/** The PR head must be the commit the graduate declared; otherwise the reviewer would inspect different code. */
export function assertPinMatchesPullRequest(pin: GitHubSourcePin, pr: { readonly headSha: string; readonly headRef: string; readonly state: string }): void {
  if (pr.headSha !== pin.commitSha) {
    throw new DomainError('[github_pin_mismatch] The pull request head is a different commit from the one you declared. Submit the current head SHA, or the commit you want reviewed.', { declared: pin.commitSha, head: pr.headSha });
  }
}

/* ─────────────────────── Git workflow observations ───────────────────────── */

export interface CommitShape { readonly sha: string; readonly message: string; readonly parents: number }
export interface PullRequestShape { readonly number: number; readonly title: string; readonly body: string; readonly headRef: string; readonly baseRef: string; readonly commits: number }

const GENERIC_MESSAGE = /^(update|updates|fix|fixes|wip|changes?|commit|test|asdf|\.|-|edit|done|final|misc)\b[\s.!]*$/i;

/** What a person can look at for the `git_workflow` criterion. Descriptive only — never a score or skill proof. */
export interface GitWorkflowObservation {
  readonly commitCount: number;
  readonly describedCommits: number;
  readonly genericCommits: number;
  readonly mergeCommits: number;
  readonly workedOnBranch: boolean;
  readonly pullRequestOpened: boolean;
  readonly pullRequestDescriptionChars: number;
  readonly noticeAr: string;
}

export const GIT_COUNTS_NOT_PROOF_AR = 'هذه أعداد وملاحظات عن سجل العمل لتساعد المراجِع. عدد الإيداعات أو طلبات الدمج لا يُثبت المهارة وحده.';

export function observeGitWorkflow(commits: readonly CommitShape[], pr: PullRequestShape | null, defaultBranch: string): GitWorkflowObservation {
  const nonMerge = commits.filter((c) => c.parents < 2);
  const generic = nonMerge.filter((c) => GENERIC_MESSAGE.test(c.message.split('\n')[0]!.trim()) || c.message.trim().length < 8);
  return {
    commitCount: commits.length,
    describedCommits: nonMerge.length - generic.length,
    genericCommits: generic.length,
    mergeCommits: commits.length - nonMerge.length,
    workedOnBranch: pr !== null && pr.headRef !== defaultBranch,
    pullRequestOpened: pr !== null,
    pullRequestDescriptionChars: pr ? pr.body.trim().length : 0,
    noticeAr: GIT_COUNTS_NOT_PROOF_AR,
  };
}

/* ──────────────────────── untrusted repository content ───────────────────── */

const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore (all |any )?(previous|prior|above) (instructions|prompts?)/i,
  /disregard (the )?(system|previous|above)/i,
  /\b(system|assistant|developer)\s*:/i,
  /you are (now )?(an?|the) (ai|assistant|reviewer|grader|evaluator|model)/i,
  /(give|award|assign|mark) (me |this )?(full|maximum|top|perfect) (marks|score|points)/i,
  /(approve|pass|accept) (this|my) (submission|work|pull request|pr)\b/i,
  /<\/?(system|instructions?|prompt)>/i,
  /تجاهل (كل |جميع )?(التعليمات|الأوامر) (السابقة|أعلاه)/,
  /(امنح|أعط|اعط)(ني)? (الدرجة|العلامة) (الكاملة|النهائية)/,
  /(اعتمد|وافق على) (هذا|عملي|التسليم)/,
];

export interface UntrustedText {
  /** Always true: this text came from a repository and is data, never instructions. */
  readonly untrusted: true;
  readonly source: string;
  readonly text: string;
  readonly truncated: boolean;
  /** True when the text tries to address an agent or steer an evaluation. For a person to look at, never a verdict. */
  readonly injectionSuspected: boolean;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

/** Wraps repository text (commit messages, PR bodies, README, code comments) before any agent or page sees it. */
export function asUntrustedRepoText(source: string, raw: string, maxChars = 4000): UntrustedText {
  const clean = raw.replace(CONTROL, '');
  const truncated = clean.length > maxChars;
  const text = truncated ? clean.slice(0, maxChars) : clean;
  return { untrusted: true, source, text, truncated, injectionSuspected: INJECTION_PATTERNS.some((re) => re.test(clean)) };
}
