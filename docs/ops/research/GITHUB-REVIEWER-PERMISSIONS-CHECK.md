# GitHub reviewer permissions check

Read-only research, fetched 2026-11-25 directly from docs.github.com. No account, invitation, setting or permission was created or changed.

## Fetch log

| # | Requested URL | Result |
|---|---|---|
| S1 | https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-user-account-settings/permission-levels-for-a-personal-account-repository | HTTP 200 **after redirect** to https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository (page moved; content read from the new URL) |
| S2 | https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization | HTTP 200, no redirect |
| S3 | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/removing-a-collaborator-from-a-personal-repository (linked from S1) | HTTP 200 |
| S4 | https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-outside-collaborators/adding-outside-collaborators-to-repositories-in-your-organization (linked from S2) | HTTP 200 |
| S5 | https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-outside-collaborators/removing-an-outside-collaborator-from-an-organization-repository (linked from S2) | HTTP 200 |

## (a) Collaborators on a personal-account repository

- "A repository owned by a personal account has two permission levels: the repository owner and collaborators." — S1
- "Collaborators on a personal repository can pull (read) the contents of the repository and push (write) changes to the repository." — S1
- Read-only option: "In a private repository, repository owners can only grant write access to collaborators. Collaborators can't have read-only access to repositories owned by a personal account." — S1
- Push: yes (quote above). Merge: the collaborator action list includes "Create, merge, and close pull requests in the repository" and "Submit a review on a pull request that affects the mergeability of the pull request". — S1
- Settings: owner-only actions listed include "Invite collaborators", "Change the visibility of the repository", "Delete the repository", "Manage deploy keys", "Manage webhooks", "Manage security and analysis settings for the repository" and "Merge a pull request on a protected branch, even if there are no approving reviews". These are described as actions the owner can perform "In addition to the actions that any collaborator can perform". — S1
- "If you require more granular access to a repository owned by your personal account, consider transferring the repository to an organization." — S1

## (b) Organization-owned repositories: roles and the Read role

- "From least access to most access, the roles for an organization repository are:" Read, Triage, Moderate, Write, Maintain, Admin. — S2
- "Read: Recommended for non-code contributors who want to view or discuss your project" — S2
- Roles can be given to "organization members, outside collaborators, and teams". — S2
- Read role, rows marked ✓ in the permissions table (S2), among others: "Pull from the person or team's assigned repositories"; "Fork the person or team's assigned repositories"; "Edit and delete their own comments"; "Open issues"; "Submit reviews on pull requests"; "View published releases"; "View GitHub Actions workflow runs"; "Create new discussions and comment on existing discussions"; "View code scanning alerts on pull requests"; "View rulesets for a repository".
- Read role, rows marked ✗ (S2), among others: "Merge a pull request"; "Push to (write) the person or team's assigned repositories"; "Approve or request changes to a pull request with required reviews"; "Apply suggested changes to pull requests"; "Change a repository's settings"; "Manage webhooks and deploy keys"; "Create, edit, run, re-run, and cancel GitHub Actions workflows"; "Create, update, and delete GitHub Actions secrets on GitHub.com"; "Manage outside collaborator access to a repository".
- Note: S2's table has no row literally worded "view pull requests" or "comment on pull requests". The closest rows are "Pull from …" (✓), "Submit reviews on pull requests" (✓) and "Edit and delete their own comments" (✓).

## (c) Removal and time-limited access

- Personal repo: "You can remove a collaborator from your personal repository at any time." Steps: Settings → "Collaborators & teams" (Access section) → "To the right of the collaborator you want to remove, click Remove." — S3
- Effect: "When you remove a collaborator from your project, they lose read/write access to your repository. If the repository is private and the person has created a fork, then that fork is also deleted." and "the person will still retain any local clones of your repository." — S1
- Organization repo: "Owners and repository admins can remove an outside collaborator's access to a repository." Either "Remove from all repositories" or, per repository, "Remove access to this repository". — S5
- "You are responsible for ensuring that people who have lost access to a repository delete any confidential information or intellectual property." — S5
- Time-limited access: none of S1–S5 mentions time-limited, expiring or temporary collaborator access. Removal is described only as a manual action. (This records an absence in these five pages, not a statement that GitHub has no such feature elsewhere.)

## (d) Outside collaborators and private repositories

- "An outside collaborator is a person who is not a member of your organization, but has access to one or more of your organization's repositories. You can choose the level of access to grant for each outside collaborator." — S4
- "Unless you are on a free plan, adding an outside collaborator to a private repository will use one of your paid licenses." — S4
- "If your organization requires two-factor authentication, all outside collaborators must enable two-factor authentication before accepting your invitation" — S4
- "When removing an outside collaborator from a private repository, the paid license count does not automatically downgrade." — S5
- "While forks of private repositories are deleted when a collaborator is removed, the person will still retain any local clones of your repository." — S5
- "When someone adds a deploy key to a repository, any user who has the private key can read from or write to the repository (depending on the key settings), even if they're later removed from the organization." — S2

## What this means for a read-only reviewer account

- On a repository owned by a **personal account**, a reviewer cannot be given read-only access: "Collaborators can't have read-only access to repositories owned by a personal account" (S1). Any collaborator invited there can push and can "Create, merge, and close pull requests" (S1).
- A read-only reviewer role exists only for **organization-owned** repositories: the Read role, which the docs say can be given to outside collaborators (S2). With Read the reviewer can pull, submit PR reviews and edit/delete their own comments, but cannot push, merge, approve required reviews, run Actions workflows, or change settings (S2).
- The docs offer "transferring the repository to an organization" as the route to more granular access (S1).
- Access ends only when an owner/admin removes it manually; local clones remain with the person (S1, S5). The pages read do not document automatic expiry.
- Outside collaborators on a private organization repository may use a paid license unless the org is on a free plan (S4).
