# GitHub App Integration Research (read-only graduate repository access)

- **Fetched:** 2026-11-26
- **Scope:** Official GitHub documentation only (docs.github.com; github.com/pricing attempted). Read-only research. No GitHub App, OAuth app, token, installation, workflow or setting was created or changed.
- **Use case examined:** a graduate connects GitHub, selects one or a few repositories, grants read-only access, submits a commit SHA / pull request, and later revokes access. The platform reads code, commits, branches and PRs and tests a snapshot of a pinned commit. It never writes, deletes or merges. The graduate must not be forced to create an organization.
- **Method:** each page's Markdown body was fetched through the GitHub Docs article API, `https://docs.github.com/api/article/body?pathname=<path>`. The canonical page URL was also requested without following redirects, to record its HTTP status and any redirect. For the four REST reference pages, the per-endpoint "fine-grained access tokens" permission boxes appear only in the rendered HTML, so the canonical HTML pages were also fetched.
- **Convention:** everything in quotation marks or blockquotes is copied word for word from the cited page. Anything not confirmed on an official page is marked **UNVERIFIED**.

---

## Fetch log

"Article API" means `https://docs.github.com/api/article/body?pathname=<path>`. Every Article API request below returned HTTP 200 with the article body, except row 34. "Canonical" is the result of requesting `https://docs.github.com<path>` without following redirects.

| # | Path requested | Article API | Canonical result | Redirect target |
|---|---|---|---|---|
| 01 | `/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app` | 200 | 200 | — |
| 02 | `/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps` | 200 | 200 | — |
| 03 | `/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app` | 200 | 200 | — |
| 04 | `/en/rest/authentication/permissions-required-for-github-apps` | 200 | 200 | — |
| 05 | `/en/apps/using-github-apps/installing-a-github-app-from-a-third-party` | 200 | 200 | — |
| 06 | `/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps` | 200 | 200 | — |
| 07 | `/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app` | 200 | 200 | — |
| 08 | `/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app` | 200 | 200 | — |
| 09 | `/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens` | 200 | 200 | — |
| 10 | `/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app` | 200 | 200 | — |
| 11 | `/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps` | 200 | 200 | — |
| 12 | `/en/apps/using-github-apps/authorizing-github-apps` | 200 | 200 | — |
| 13 | `/en/webhooks/webhook-events-and-payloads` | 200 | 200 | — |
| 14 | `/en/webhooks/using-webhooks/validating-webhook-deliveries` | 200 | 200 | — |
| 15 | `/en/webhooks/using-webhooks/best-practices-for-using-webhooks` | 200 | 200 | — |
| 16 | `/en/rest/repos/contents` (Article API and HTML) | 200 | 200 | — |
| 17 | `/en/rest/commits/commits` (Article API and HTML) | 200 | 200 | — |
| 18 | `/en/rest/pulls/pulls` (Article API and HTML) | 200 | 200 | — |
| 19 | `/en/rest/branches/branches` (Article API and HTML) | 200 | 200 | — |
| 20 | `/en/apps/creating-github-apps/registering-a-github-app/rate-limits-for-github-apps` | 200 | 200 | — |
| 21 | `/en/rest/using-the-rest-api/rate-limits-for-the-rest-api` | 200 | 200 | — |
| 22 | `/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps` | 200 | 200 | — |
| 23 | `/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token` | 200 (title "Use GITHUB_TOKEN for authentication in workflows") | **301** | `https://docs.github.com/en/actions/tutorials/authenticate-with-github_token` |
| 24 | `/en/actions/security-for-github-actions/security-guides/automatic-token-authentication` | 200 (same article as 23) | **301** | `https://docs.github.com/en/actions/tutorials/authenticate-with-github_token` |
| 25 | `/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions` | 200 (title "Secure use reference") | **301** | `https://docs.github.com/en/actions/reference/security/secure-use` |
| 26 | `/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions` | 200 (title "GitHub Actions billing") | **301** | `https://docs.github.com/en/billing/concepts/product-billing/github-actions` |
| 27 | `/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows` | 200 | **301** | `https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows` |
| 28 | `/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens` | 200 | 200 | — |
| 29 | `/en/apps/using-github-apps/privileged-github-apps` | 200 | 200 | — |
| 30 | `/en/apps/github-marketplace/github-marketplace-overview/about-github-marketplace-for-apps` | 200 | 200 | — |
| 31 | `/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app` | 200 | 200 | — |
| 32 | `/en/apps/using-github-apps/reviewing-and-revoking-authorization-of-github-apps` | 200 | 200 | — |
| 33 | `/en/rest/apps/apps` | 200 | 200 | — |
| 34 | `/en/apps/creating-github-apps/writing-code-for-a-github-app/using-webhooks-with-github-apps` | **404** ("No page found") | 404 | — (wrong path; not used) |
| 35 | `/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app` | 200 | 200 | — |
| 37 | `/en/actions/reference/workflows-and-actions/workflow-syntax` | 200 | 200 | — |
| 38 | `/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private` | 200 | 200 | — |
| 39 | `https://github.com/pricing` | n/a | **403 Forbidden** (JSON body; the request was refused before any content was served) | — (**not read**, so no pricing-page fact is used here) |

---

## Q1. GitHub App vs OAuth App vs fine-grained personal access token

Source: Deciding when to build a GitHub App (row 01): `https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app`

> "In general, GitHub Apps are preferred over OAuth apps."

> "GitHub Apps provide more control over what the app can do. Instead of the broad scopes that OAuth apps use, GitHub Apps use fine-grained permissions. For example, if your app needs to read the contents of a repository, an OAuth app would require the `repo` scope, which would also let the app edit the repository contents and settings. A GitHub App can request read-only access to repository contents, which will not let the app take more privileged actions like editing the repository contents or settings."

> "GitHub Apps also offer more control over repository access. With a GitHub App, the user or organization owner who installed the app can decide what repositories the app can access. Conversely, an OAuth app can access every repository that the user who authorized the app can access."

> "GitHub Apps use short lived tokens. If the token is leaked, the token will be valid for a shorter amount of time, which reduces the damage that can be done. Conversely, OAuth app tokens do not expire until the person who authorized the OAuth app revokes the token."

> "If you want to access GitHub resources on behalf of a user or in an organization, or you anticipate a long-lived integration, we recommend building a GitHub App."

> "You can use personal access tokens for API testing or short-lived scripts. Since a personal access token is associated with a user, your automation could break if the user no longer has access to the resources you need."

> "GitHub supports two types of personal access tokens, but recommends that you use fine-grained personal access tokens instead of personal access tokens (classic) whenever possible."

Source: Differences between GitHub Apps and OAuth apps (row 02): `https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps`

> "In general, GitHub Apps are preferred over OAuth apps. GitHub Apps use fine-grained permissions, give the user more control over which repositories the app can access, and use short-lived tokens."

> "Installation access tokens are limited to specified repositories with the permissions chosen by the creator of the app." vs (OAuth) "An OAuth access token is limited via scopes."

> "Installation access tokens expire after a predefined amount of time (currently 1 hour)." vs (OAuth) "OAuth app tokens re long-lived by default. You can also configure your OAuth app to use user access tokens that expire after eight hours and can be renewed with a refresh token." *(the typo "re" is on the page)*

> "Unlike OAuth apps, GitHub Apps have targeted permissions that allow them to request access only to what they need. For example, a Continuous Integration (CI) GitHub App can request read access to repository content and write access to the status API. [...] OAuth apps can't use granular permissions."

> "Webhooks are automatically disabled when the GitHub App is uninstalled." vs (OAuth) "Webhooks are not automatically disabled if an OAuth app's access token is deleted, and there is no way to clean them up automatically."

Source: Best practices for creating a GitHub App (row 10): `https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app`

> "Your app should never use a personal access token or GitHub password to authenticate."

Source: Managing your personal access tokens (row 28): `https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens`

> "Each token is limited to access resources owned by a single user or organization."
> "Each token can be further limited to only access specific repositories for that user or organization."
> "Each token is granted specific, fine-grained permissions, which offer more control than the scopes granted to personal access tokens (classic)."

> "Under **Expiration**, select an expiration for the token. Infinite lifetimes are allowed but may be blocked by a maximum lifetime policy set by your organization or enterprise owner."

> "Tokens always include read-only access to all public repositories on GitHub."

> "Both fine-grained personal access tokens and personal access tokens (classic) are tied to the user who generated them and will become inactive if the user loses access to the resource."

**Comparison (from the quotes above)**

| Aspect | GitHub App | OAuth App | Fine-grained PAT |
|---|---|---|---|
| Permission granularity | Fine-grained, read or write per permission | Broad scopes (e.g. `repo`) | Fine-grained permissions |
| Repository selection | Installer chooses the repositories | Every repository the user can access | Single owner, optionally specific repositories |
| Token lifetime | Installation token 1 hour; user token 8 hours (expiring) | Long-lived by default | User-chosen; infinite allowed unless a policy blocks it |
| Official guidance | Preferred / recommended | Not preferred | For "API testing or short-lived scripts"; an app "should never use a personal access token" |

---

## Q2. Repository permissions needed for reading (Contents, Metadata, Pull requests)

Source: Permissions required for GitHub Apps (row 04): `https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps`

The page defines **Token types:** "UAT = user access token, IAT = installation access token". Rows copied from the page's tables (Endpoint | Access | Tokens | Additional permissions):

**Repository permissions for "Contents"** (read rows relevant here)

| Endpoint | Access | Tokens | Additional |
|---|---|---|---|
| `GET /repos/{owner}/{repo}/branches` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/branches/{branch}` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/commits` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/commits/{ref}` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/compare/{basehead}` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/contents/{path}` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/git/commits/{commit_sha}` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/git/trees/{tree_sha}` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/git/blobs/{file_sha}` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/pulls/{pull_number}` | read | UAT, IAT | ✓ |
| `GET /repos/{owner}/{repo}/tarball/{ref}` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/zipball/{ref}` | read | UAT, IAT | ✗ |

The same "Contents" table lists write rows such as `PUT /repos/{owner}/{repo}/contents/{path}` | write, and `POST /repos/{owner}/{repo}/branches/{branch}/rename` | write.

**Repository permissions for "Pull requests"** (read rows)

| Endpoint | Access | Tokens | Additional |
|---|---|---|---|
| `GET /repos/{owner}/{repo}/pulls` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/pulls/{pull_number}` | read | UAT, IAT | ✓ |
| `GET /repos/{owner}/{repo}/pulls/{pull_number}/commits` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/pulls/{pull_number}/files` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls` | read | UAT, IAT | ✗ |

**Repository permissions for "Metadata"** (first rows)

| Endpoint | Access | Tokens | Additional |
|---|---|---|---|
| `GET /repos/{owner}/{repo}` | read | UAT, IAT | ✗ |
| `GET /repos/{owner}/{repo}/collaborators` | read | UAT, IAT | ✗ |

**Can Contents be read-only?** Yes.
- Row 01: "A GitHub App can request read-only access to repository contents, which will not let the app take more privileged actions like editing the repository contents or settings."
- Registering a GitHub App (row 35), `https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app`: "Under "Permissions", choose the permissions that your app needs. For each permission, select the dropdown menu and click **Read-only**, **Read & write**, or **No access**. You should select the minimum permissions necessary for your app."
- Row 03: "GitHub Apps don't have any permissions by default. [...] You should select the minimum permissions required for the app."

**Is Metadata mandatory?**
- **UNVERIFIED.** None of the fetched pages contains an explicit statement that "Metadata" is mandatory or auto-selected for a GitHub App.
- Related facts that were found:
  - Row 05 shows an install screenshot with the caption: "The app requests read access to metadata and write access to issues."
  - Row 13 states for several events: "To subscribe to this event, a GitHub App must have at least read-level access for the "Metadata" repository permission."
  - Row 28's fine-grained PAT permission table lists `metadata` with only the `read` level.

Row 03 also notes: "If your app makes a REST API request with insufficient permissions, the API will return a `403` response." and "you will receive the `X-Accepted-GitHub-Permissions` header in the REST API response. The header will tell you what permissions are required in order to access the endpoint."

---

## Q3. "Only select repositories" on a personal account; changing the selection later; access to repositories not selected

Source: Installing a GitHub App from a third party (row 05): `https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party`

> "Anyone can install GitHub Apps on their personal account."

> "Select the location where you want to install the GitHub App. You can select your personal account or an organization that you are a member of."

> "If the app requires repository permissions, select **All repositories** or **Only select repositories**. The app will always have at least read-only access to all public repositories on GitHub."

> "If you selected **Only select repositories** in the previous step, under the **Select repositories** dropdown, select the repositories that you want the app to access. If the app creates any repositories, the app will automatically be granted access to those repositories as well."

> "You can install a GitHub App without authorizing the app. Similarly, you can authorize the app without installing the app."

Source: Reviewing and modifying installed GitHub Apps (row 06): `https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps`

> For a personal account: "In the upper-right corner of any page, click your profile picture, then click **Settings**." → "Under "Integrations," click **Applications**." → "Click **Installed GitHub Apps**." → "Next to the GitHub App you want to review or modify, click **Configure**."

> "Modifying repository access [...] Under "Repository access," select **All repositories** or **Only select repositories**. If you selected **Only select repositories** in the previous step, under the **Select repositories** dropdown, select the repositories that you want the GitHub App to access."

Access to repositories that were not selected:
- Row 02: "The installation token from a GitHub App loses access to resources if an admin removes repositories from the installation."
- Row 07: "The installation access token cannot be granted access to repositories that the installation was not granted access to."
- Row 12 (user tokens), `https://docs.github.com/en/apps/using-github-apps/authorizing-github-apps`: "if you have access to repositories `A` and `B`, and the GitHub App has access to repositories `B` and `C`, then the app can only access repository `B` when acting on your behalf."
- Row 03: "Although GitHub Apps don't have any permissions by default, they do have implicit permissions to read public resources when acting on behalf of a user."

Source: Making a GitHub App public or private (row 38): `https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private`

> "If you set your GitHub App registration to public, any user on GitHub can install it and authorize it. If you set your GitHub App registration to private, it can only be installed on the account that owns the app."

Row 03: "There are no additional restrictions on which organizations or personal accounts an app can be installed on."

---

## Q4. Tokens: lifetimes, scoping down, refresh tokens, secure storage

### Installation access token

Source: Generating an installation access token (row 07): `https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app`

> "Send a REST API `POST` request to `/app/installations/INSTALLATION_ID/access_tokens`. Include your JSON web token in the `Authorization` header of your request."

> "Optionally, you can use the `repositories` or `repository_ids` body parameters to specify individual repositories that the installation access token can access. If you don't use `repositories` or `repository_ids` to grant access to specific repositories, the installation access token will have access to all repositories that the installation was granted access to. The installation access token cannot be granted access to repositories that the installation was not granted access to. You can list up to 500 repositories."

> "Optionally, use the `permissions` body parameter to specify the permissions that the installation access token should have. If `permissions` is not specified, the installation access token will have all of the permissions that were granted to the app. The installation access token cannot be granted permissions that the app was not granted."

> "The installation access token will expire after 1 hour."

> "Starting April 27, 2026, GitHub began a staged rollout of a stateless format (`ghs_APPID_JWT`) to all newly minted GitHub App installation tokens [...] If your application expects or relies on installation tokens being exactly 40 characters long, it may not handle this new token format correctly."

### User access token and refresh token

Source: Generating a user access token (row 08): `https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app`

> "By default, the user access token expires after 8 hours. You can use a refresh token to regenerate a user access token."

> `expires_in`: "The value will always be `28800` (8 hours)." / `refresh_token`: "The token starts with `ghr_`." / `refresh_token_expires_in`: "The value will always be `15897600` (6 months)."

> "User access tokens that expire are currently an optional feature and are subject to change."

Source: Refreshing user access tokens (row 09): `https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens`

> "The user access token expires after eight hours, and the refresh token expires after six months."

> "Once you use a refresh token, that refresh token and the old user access token will no longer work."

> "When you create your app, expiration of user access tokens is enabled unless you opt out."

> "The `scope` parameter does not grant permissions to a GitHub App. The only supported value is `offline_access`, which forces the user access token to expire."

Row 03: "The success of an API request with a user access token depends on the user's permissions as well as the app's permissions. [...] The success of an API request with an installation access token only depends on the app's permissions."

### Storage and handling recommendations

Source: Best practices for creating a GitHub App (row 10)

> "You must store private keys, tokens, and client secrets securely, when possible. [...] In general, you should use a storage mechanism that is intended to store sensitive data on the platform that you are using."

> "The private key for your GitHub App grants access to every account that the app is installed on. It **must** be stored securely and never shared broadly."

> "Consider storing your GitHub App's private key in a key vault, such as Azure Key Vault, and making it sign-only."

> "Alternatively, you can store the key as an environment variable. However, this is not as strong as storing the key in a key vault."

> "You should never hard code your private key in your app, even if your code is stored in a private repository."

> "You should not generate more private keys than you need. You should delete private keys that are no longer in use."

> "If your app is a website or web app, you should encrypt the tokens on your back end and ensure there is security around the systems that can access the tokens. Consider storing refresh tokens in a separate place from active access tokens."

> "if your GitHub App takes an action on behalf of a user, it should always use a user access token instead of an installation access token. Otherwise, your app might allow a user to see or do things that they shouldn't be able to see or do."

> "GitHub strongly encourages you to use user access tokens that expire."

> "Installation access tokens expire after one hour, expiring user access tokens expire after eight hours, and refresh tokens expire after six months. However, you can also revoke tokens as soon as you no longer need them. For more information, see `DELETE /installation/token` [...] to revoke an installation access token and `DELETE /applications/{client_id}/token` [...] to revoke a user access token."

> "User access tokens and installation access tokens are meant to be used until they expire. You should cache tokens that you create."

> "In the event that your app's private key or secret is compromised, you will need to generate a new key or secret, update your app to use the new key or secret, and delete your old key or secret."

> "It is preferable to use the authorization code with PKCE over the device flow [...] do not enable the device flow for your application unless you are using the app in a constrained environment (CLIs, IoT devices, or headless systems)."

> "If your GitHub App is available to other users or organizations, you should give users and organization owners a way to delete their data. Users should not need to email or call a support person in order to delete their data."

Row 11 (Managing private keys) was fetched. No sentences from it are quoted here beyond the row 10 guidance.

---

## Q5. Revocation: uninstall vs de-authorize, webhook events, expected app behaviour

### How the user revokes access

Source: Reviewing and modifying installed GitHub Apps (row 06)

> "To keep the GitHub App installed for future use but temporarily block it from accessing resources owned by your account, click **Suspend**."

> "To uninstall a GitHub App and block it from accessing resources owned by your account, click **Uninstall**. When you uninstall a GitHub App from an account, the app will lose access to the resources in just that account. The app might still be authorized to access other accounts on your behalf, if it has installations in those accounts."

> "If you want to stop an app from acting on your behalf anywhere on GitHub, also de-authorize the app in the "Authorized GitHub Apps" tab of your user account. This will fully deactivate any tokens issued to the app on your behalf."

Source: Reviewing and revoking authorization of GitHub Apps (row 32): `https://docs.github.com/en/apps/using-github-apps/reviewing-and-revoking-authorization-of-github-apps`

> Steps: Settings → "In the "Integrations" section of the sidebar, click **Applications**." → "Click the **Authorized GitHub Apps** tab." → "click **Revoke**. To revoke your authorization for all GitHub Apps, click **Revoke all**."

> "The authorization can only be revoked by the person who authorized the GitHub App."

Row 02: "You must be an organization owner, personal repository owner, or have admin permissions in a repository to uninstall a GitHub App and remove its access."

### Webhook events

Source: Webhook events and payloads (row 13): `https://docs.github.com/en/webhooks/webhook-events-and-payloads`

**`installation`**
> "This event occurs when there is activity relating to a GitHub App installation. All GitHub Apps receive this event by default. You cannot manually subscribe to this event."
> "**Action type:** `created`, `deleted`, `new_permissions_accepted`, `suspend`, `unsuspend`"
> `deleted`: "Someone uninstalled a GitHub App from their user or organization account."
> `suspend`: "Someone blocked access by a GitHub App to their user or organization account."

**`installation_repositories`**
> "This event occurs when there is activity relating to which repositories a GitHub App installation can access. All GitHub Apps receive this event by default. You cannot manually subscribe to this event."
> "**Action type:** `added`, `removed`"
> `added`: "A GitHub App installation was granted access to one or more repositories."
> `removed`: "Access to one or more repositories was revoked for a GitHub App installation."

**`github_app_authorization`**
> "This event occurs when a user revokes their authorization of a GitHub App."
> "A GitHub App receives this webhook by default and cannot unsubscribe from this event."
> "Anyone can revoke their authorization of a GitHub App from their GitHub account settings page. Revoking the authorization of a GitHub App does not uninstall the GitHub App. You should program your GitHub App so that when it receives this webhook, it stops calling the API on behalf of the person who revoked the token. If your GitHub App continues to use a revoked access token, it will receive the 401 Bad Credentials error."

### What the app should do (only what the docs state)
- On `github_app_authorization`: "stops calling the API on behalf of the person who revoked the token" (row 13).
- Row 02: "Webhooks are automatically disabled when the GitHub App is uninstalled."
- Row 10: revoke tokens "as soon as you no longer need them", and give users a way "to delete their data".
- **UNVERIFIED:** no fetched page prescribes specific app behaviour on `installation.deleted` or `installation_repositories.removed` beyond the event descriptions above.

---

## Q6. Webhook delivery validation

Source: Validating webhook deliveries (row 14): `https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries`

> "To ensure that your server only processes webhook deliveries that were sent by GitHub and to ensure that the delivery was not tampered with, you should validate the webhook signature before processing the delivery further."

> "When creating a secret token, you should choose a random string of text with high entropy."

> "Never hardcode a token into an application or push a token to any repository."

> "GitHub will use your secret token to create a hash signature that's sent to you with each payload. The hash signature will appear in each delivery as the value of the `X-Hub-Signature-256` header."

> "GitHub uses an HMAC hex digest to compute the hash."
> "The hash signature always starts with `sha256=`."
> "The hash signature is generated using your webhook's secret token and the payload contents."
> "If your language and server implementation specifies a character encoding, ensure that you handle the payload as UTF-8."
> "Never use a plain `==` operator. Instead consider using a method like `secure_compare` or `crypto.timingSafeEqual`, which performs a "constant time" string comparison [...]"

> Test vector: `secret`: "It's a Secret to Everybody", `payload`: "Hello, World!" → "X-Hub-Signature-256: `sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17`"

Row 13 (delivery headers):
> "`X-Hub-Signature`: [...] generated using the SHA-1 hash function [...] provided for compatibility with existing integrations. We recommend that you use the more secure `X-Hub-Signature-256` instead."

Source: Best practices for using webhooks (row 15): `https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks`

> "do **not** include sensitive information in your payload URL."
> "You should ensure that your server uses an HTTPS connection. By default, GitHub will verify SSL certificates when delivering webhooks. GitHub recommends that you leave SSL verification enabled."
> "Your server should respond with a 2XX response within 10 seconds of receiving a webhook delivery. If your server takes longer than that to respond, then GitHub terminates the connection and considers the delivery a failure."
> "Your application should check the event type and action of a webhook payload before processing the payload."
> "To protect against replay attacks, you can use the `X-GitHub-Delivery` header to ensure that each delivery is unique per event." / "If you request a redelivery, the `X-GitHub-Delivery` header will be the same as in the original delivery."
> "You can use the `GET /meta` endpoint to find the current list of GitHub's IP addresses."

Row 10: "You should set a webhook secret for your GitHub App and verify that the signature of incoming webhook events matches the secret."

---

## Q7. REST endpoints and the permission each requires

Sources: the rendered HTML of rows 16–19 (per-endpoint "Fine-grained access tokens" box), cross-checked against row 04.
- `https://docs.github.com/en/rest/repos/contents`
- `https://docs.github.com/en/rest/commits/commits`
- `https://docs.github.com/en/rest/pulls/pulls`
- `https://docs.github.com/en/rest/branches/branches`

Every endpoint below says: "This endpoint works with the following fine-grained token types: GitHub App user access tokens, GitHub App installation access tokens, Fine-grained personal access tokens". Every endpoint below also says: "This endpoint can be used without authentication or the aforementioned permissions if only public resources are requested."

| Endpoint (doc title) | Method / path | Required permission (quoted) |
|---|---|---|
| Download a repository archive (tar) | `GET /repos/{owner}/{repo}/tarball/{ref}` | "Contents" repository permissions (read) |
| Download a repository archive (zip) | `GET /repos/{owner}/{repo}/zipball/{ref}` | "Contents" repository permissions (read) |
| Get repository content | `GET /repos/{owner}/{repo}/contents/{path}` | "Contents" repository permissions (read) |
| List commits | `GET /repos/{owner}/{repo}/commits` | "Contents" repository permissions (read) |
| Get a commit | `GET /repos/{owner}/{repo}/commits/{ref}` | "Contents" repository permissions (read) |
| Compare two commits | `GET /repos/{owner}/{repo}/compare/{basehead}` | "Contents" repository permissions (read) |
| List branches | `GET /repos/{owner}/{repo}/branches` | "Contents" repository permissions (read) |
| Get a branch | `GET /repos/{owner}/{repo}/branches/{branch}` | "Contents" repository permissions (read) |
| Get a pull request | `GET /repos/{owner}/{repo}/pulls/{pull_number}` | "at least one of the following permission sets: "Pull requests" repository permissions (read) "Contents" repository permissions (read)" |
| List commits on a pull request | `GET /repos/{owner}/{repo}/pulls/{pull_number}/commits` | "Pull requests" repository permissions (read) |
| List pull requests files | `GET /repos/{owner}/{repo}/pulls/{pull_number}/files` | "Pull requests" repository permissions (read) |
| List pull requests | `GET /repos/{owner}/{repo}/pulls` | "Pull requests" repository permissions (read) |
| List pull requests associated with a commit | `GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls` | "Pull requests" repository permissions (read) |

For contrast, write endpoints on the same pages:
- "Merge a pull request" → "Contents" repository permissions (write)
- "Create a pull request" → "Pull requests" repository permissions (write)
- "Create or update file contents" / "Delete a file" → "Contents" repository permissions (write)
- "Rename a branch" / "Merge a branch" → "Contents" repository permissions (write)

Archive endpoint behaviour (row 16, Markdown body):
> "Gets a redirect URL to download a tar archive for a repository. If you omit :ref, the repository's default branch (usually main) will be used. Please make sure your HTTP framework is configured to follow redirects or you will need to use the Location header to make a second GET request."
> "For private repositories, these links are temporary and expire after five minutes."
> Response: "**302** - Found"

---

## Q8. Rate limits

Source: Rate limits for the REST API (row 21): `https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api`

> "GitHub Apps authenticating with an installation access token use the installation's minimum rate limit of 5,000 requests per hour. If the installation is on a GitHub Enterprise Cloud organization, the installation has a rate limit of 15,000 requests per hour."

> "For installations that are not on a GitHub Enterprise Cloud organization, the rate limit for the installation will scale with the number of users and repositories. Installations that have more than 20 repositories receive another 50 requests per hour for each repository. Installations that are on an organization that have more than 20 users receive another 50 requests per hour for each user. The rate limit cannot increase beyond 12,500 requests per hour."

> "Primary rate limits for GitHub App user access tokens (as opposed to installation access tokens) are dictated by the primary rate limits for the authenticated user. This rate limit is combined with any requests that another GitHub App or OAuth app makes on that user's behalf and any requests that the user makes with a personal access token."

> "All of these requests count towards your personal rate limit of 5,000 requests per hour."

> "The rate limit for `GITHUB_TOKEN` is 1,000 requests per hour per repository."

Secondary limits (same page):
> "No more than 100 concurrent requests are allowed."
> "No more than 900 points per minute are allowed for REST API endpoints"
> "No more than 2,000 OAuth access token requests per hour are allowed for GitHub Apps and OAuth apps."
> "These secondary rate limits are subject to change without notice."

Row 20 (Rate limits for GitHub Apps) only says: "The rate limit for GitHub Apps depends on whether the app authenticates with a user access token or an installation access token." It points to row 21 for the numbers.

---

## Q9. Cost of a GitHub App; Marketplace requirement

- **Registration/usage price: UNVERIFIED.** No fetched official page states in words that registering or using a GitHub App is free of charge. The pricing page (`https://github.com/pricing`) returned **403** and was not read.
- Related facts that were found:
  - Row 35: "A user or organization can register up to 100 GitHub Apps, but there is no limit to how many GitHub Apps can be installed on an account."
  - Row 05: "There is no limit to how many apps you can install."
  - Row 38: a **public** app can be installed by "any user on GitHub". The page attaches no Marketplace condition to that.
  - Row 05 describes installing "directly from the app owner instead of from GitHub Marketplace", via a URL like `https://github.com/apps/APP-NAME/installations/new`.

Source: About GitHub Marketplace for apps (row 30): `https://docs.github.com/en/apps/github-marketplace/github-marketplace-overview/about-github-marketplace-for-apps`

> "Anyone can share their apps with other users for free on GitHub Marketplace but only apps owned by organizations can sell their app."
> "To publish paid plans for your app and display a marketplace badge, you must complete the publisher verification process."
> "To publish apps with free plans, you only need to meet the general requirements for listing any app."

---

## Q10. GitHub Actions for a test-only CI

### `permissions:` and least privilege

Source: Workflow syntax (row 37): `https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax`

> "You can use `permissions` to modify the default permissions granted to the `GITHUB_TOKEN`, adding or removing access as required, so that you only allow the minimum required access."
> "You can use `permissions` either as a top-level key, to apply to all jobs in the workflow, or within specific jobs."
> "For each of the available permissions [...] you can assign one of the access levels: `read` (if applicable), `write`, or `none`. `write` includes `read`. If you specify the access for any of these permissions, all of those that are not specified are set to `none`."
> `contents`: "Work with the contents of the repository. For example, `contents: read` permits an action to list the commits, and `contents: write` allows the action to create a release."
> "When a workflow is triggered by the `pull_request_target` event, the `GITHUB_TOKEN` is granted read/write repository permission, even when it is triggered from a public fork."

Source: Use GITHUB_TOKEN for authentication in workflows (rows 23/24 → `https://docs.github.com/en/actions/tutorials/authenticate-with-github_token`)

> "An action can access the `GITHUB_TOKEN` through the `github.token` context even if the workflow does not explicitly pass the `GITHUB_TOKEN` to the action. As a good security practice, you should always make sure that actions only have the minimum access they require by limiting the permissions granted to the `GITHUB_TOKEN`."
> "As a good security practice, you should grant the `GITHUB_TOKEN` the least required access."

Source: Secure use reference (row 25 → `https://docs.github.com/en/actions/reference/security/secure-use`)

> "It's good security practice to set the default permission for the `GITHUB_TOKEN` to read access only for repository contents. The permissions can then be increased, as required, for individual jobs within the workflow file."
> "Any user with write access to your repository has read access to all secrets configured in your repository."
> "Pin references to actions to a commit SHA in your workflow files."
> "Avoid using the `pull_request_target` and `workflow_run` workflow triggers with untrusted pull requests or code content. Workflows that use these triggers must not explicitly check out untrusted code, including from pull request forks or from repositories that are not under your control."
> "self-hosted runners should almost never be used for public repositories on GitHub, because any user can open pull requests against the repository and compromise the environment."

### `pull_request` from forks and secrets

Source: Events that trigger workflows (row 27 → `https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows`)

> "With the exception of `GITHUB_TOKEN`, secrets are not passed to the runner when a workflow is triggered from a forked repository. The `GITHUB_TOKEN` has read-only permissions in pull requests from forked repositories."
> "Workflows don't run in forked repositories by default. You must enable GitHub Actions in the **Actions** tab of the forked repository."
> "Running untrusted code on the `pull_request_target` trigger may lead to security vulnerabilities. These vulnerabilities include cache poisoning and granting unintended access to write privileges or secrets."
> `pull_request_target`: "Avoid using this event if you need to build or run code from the pull request."

### Billing

Source: GitHub Actions billing (row 26 → `https://docs.github.com/en/billing/concepts/product-billing/github-actions`)

The current page expresses included usage as a **monetary amount**, not as minutes:

| Plan | Artifact storage | Included compute usage (per month) | Cache storage (per repository) |
|---|---|---|---|
| GitHub Free | 500 MB | $12 USD | 10 GB |
| GitHub Pro | 1 GB | $18 USD | 10 GB |
| GitHub Free for organizations | 500 MB | $12 USD | 10 GB |

> "The included compute usage is expressed as a monetary amount, not a fixed number of minutes or other usage units."
> Rate table: "Linux 2-core (x64) | `actions_linux` | $0.006" per minute; "Linux 1-core (x64) | `actions_linux_slim` | $0.002".
> "The use of standard GitHub-hosted runners is free: In public repositories; For GitHub Pages; For Dependabot"
> "The following usage remains free independently and does not reduce the included compute usage: Standard GitHub-hosted runners in public repositories. [...] Self-hosted runners."
> "Larger runners are billed for public repositories."
> "Usage is charged to the repository owner, not the person who triggered the workflow runs."
> "Anyone with write access to a repository can run actions. Any costs of running the actions are billed to the repository owner."
> "If your account does not have a valid payment method on file, usage is blocked once you consume the included compute usage. Larger runners require a valid payment method."
> "If you have a valid payment method on file, spending may be limited by one or more budgets."
> "You can also receive email notifications when your included GitHub Actions usage reaches 90% and 100% during a billing period."
> "The included amount resets at the start of each billing cycle."

- **Minutes figure: UNVERIFIED.** No fetched page states an included **minutes** figure for GitHub Free (e.g. "2,000 minutes").
- The page's own guide figure is: "$300 USD covers 50,000 minutes on a standard Linux runner at $0.006 USD per minute". By that same rate, $12 corresponds to 2,000 standard Linux minutes. That is arithmetic, not a quoted statement.
- **UNVERIFIED:** the specific behaviour of a "zero spending limit" setting. The page speaks only of "budgets" and of usage being "blocked" without a valid payment method.

---

## Implications (facts only)

1. Official GitHub guidance prefers a GitHub App over an OAuth app for this use case. Read-only "Contents" access is possible, repository selection is chosen by the installer, and installation tokens expire after 1 hour. OAuth apps use broad scopes such as `repo`, which "would also let the app edit the repository contents and settings". GitHub says apps "should never use a personal access token".
2. A personal-account user can install a GitHub App ("Anyone can install GitHub Apps on their personal account"). They can choose "Only select repositories" and change the selection later under Settings → Applications → Installed GitHub Apps → Configure. No organization is required.
3. Every read endpoint the platform needs works with installation and user access tokens:
   - "Contents" (read): tarball, zipball, contents, list commits, get commit, compare, list branches, get branch.
   - "Pull requests" (read): list PR commits, list PR files.
   - "Pull requests" (read) **or** "Contents" (read): get a pull request.
   - Merge, create-PR and file-write endpoints need write-level permissions, which a read-only app would not hold.
4. An installation token can be narrowed at creation to listed repositories (up to 500) and to a subset of permissions. It cannot exceed what the installation was granted. Private-repository archive download links "expire after five minutes".
5. The app holds read-only access to all public repositories regardless of selection ("The app will always have at least read-only access to all public repositories on GitHub").
6. Revocation paths and signals:
   - Uninstall emits `installation` / `deleted`.
   - Suspend emits `installation` / `suspend`.
   - De-selecting repositories emits `installation_repositories` / `removed`.
   - De-authorizing emits `github_app_authorization`. After that, the app should stop using that user's token, and a revoked token returns 401.
   - All three events are delivered by default and cannot be unsubscribed.
7. Webhook deliveries should be verified using HMAC-SHA256 over the raw payload with a high-entropy secret, using a constant-time compare against `X-Hub-Signature-256`. The endpoint should answer 2XX within 10 seconds. `X-GitHub-Delivery` can be used against replays.
8. Rate limits:
   - Installation token on a non-Enterprise-Cloud account: base 5,000 requests/hour, plus 50 per repository beyond 20, capped at 12,500.
   - User access tokens share the user's 5,000 requests/hour.
   - `GITHUB_TOKEN`: 1,000 requests/hour per repository.
9. Credential handling: the private key grants access to every installation. It should be kept in a key vault (sign-only) rather than hard-coded. Tokens should be encrypted at rest on the back end, and refresh tokens stored separately. Users should get a self-service way to delete their data.
10. Marketplace listing is optional for distribution. Public apps install directly from `https://github.com/apps/APP-NAME/installations/new`. Selling requires an organization owner and publisher verification. Whether registering an app costs anything is not stated on the fetched pages (UNVERIFIED).
11. GitHub Actions:
    - Standard GitHub-hosted runners are free in public repositories.
    - Private repositories on GitHub Free draw from $12 USD/month of included compute.
    - Without a valid payment method, usage is blocked once that amount is consumed.
    - Costs are billed to the repository owner.
    - Fork-originated `pull_request` runs get no secrets and a read-only `GITHUB_TOKEN`.
    - `pull_request_target` grants read/write and must not check out untrusted code.
    - Setting any `permissions:` entry sets all unspecified permissions to `none`.
