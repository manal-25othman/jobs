# Infrastructure, Code-Isolation and Model-Provider Research (official sources)

- **Fetch date:** 2026-11-27 (all pages fetched on this date)
- **Scope:** read-only research for NAQLA's PRIVATE STAGING environment (synthetic data only), with KSA data residency as the production preference.
- **Method:** plain HTTPS GET through the session proxy (`curl -L`, converted with pandoc), plus a WebFetch pass for pages the proxy refused. No account, project, token, deployment or setting was created; no sign-in; no personal data was sent in any request.
- **Rule:** every fact below carries a short verbatim quote and its URL. Anything not confirmed on an official page in this session is marked **UNVERIFIED**. Nothing was filled in from memory.
- **Note on prices:** copied as displayed. Several pricing pages are interactive and show a default region or tier; where that applies it is noted.
- **Note on page content:** one Supabase docs page (regions `.md`) contained an embedded "Note for AI agents" asking the reader to send a feedback report. It was treated as page data and ignored.

## 1. Fetch log

### 1a. Direct fetches (curl through the session proxy)

Meaning of results: `200` = loaded; `000` = the session proxy refused the CONNECT tunnel (host not on this environment's allowlist); `403` on vercel.com/supabase.com = a "Vercel Security Checkpoint" bot challenge page; `403` on github.com = the session proxy limits github.com to repository-scoped API paths; `404` = not found.

| # | URL requested | HTTP result (curl) | Redirect / final URL |
|---|---|---|---|
| 1 | https://github.com/pricing | 403 — GitHub API-scope block from session proxy | none |
| 2 | https://supabase.com/docs/guides/auth/auth-smtp | 403 — Vercel Security Checkpoint (bot challenge); not loaded | none |
| 3 | https://supabase.com/docs/guides/platform/regions | 403 — Vercel Security Checkpoint (bot challenge); not loaded | none |
| 4 | https://docs.github.com/en/billing/concepts/product-billing/github-actions | 200 | none |
| 5 | https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning | 200 | 1 redirect(s) → https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning |
| 6 | https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection | 200 | 1 redirect(s) → https://docs.github.com/en/code-security/concepts/secret-security/push-protection |
| 7 | https://supabase.com/pricing | 200 | none |
| 8 | https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/understanding-connections-between-repositories | 200 | none |
| 9 | https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/what-happens-to-forks-when-a-repository-is-deleted-or-changes-visibility | 200 | 1 redirect(s) → https://docs.github.com/en/pull-requests/reference/forks |
| 10 | https://supabase.com/docs/guides/platform/backups | 200 | none |
| 11 | https://supabase.com/docs/guides/deployment/branching | 200 | none |
| 12 | https://supabase.com/docs/guides/platform/billing-on-supabase | 200 | none |
| 13 | https://supabase.com/docs/guides/auth/general-configuration | 200 | none |
| 14 | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility | 200 | none |
| 15 | https://supabase.com/docs/guides/platform/regions.md | 200 | none |
| 16 | https://supabase.com/docs/guides/auth/auth-smtp.md | 200 | none |
| 17 | https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail | 200 | none |
| 18 | https://supabase.com/llms/guides.txt | 404 | none |
| 19 | https://vercel.com/docs/regions | 200 | none |
| 20 | https://docs.railway.com/reference/private-networking | 200 | 1 redirect(s) → https://docs.railway.com/networking/private-networking |
| 21 | https://vercel.com/docs/plans/hobby | 200 | none |
| 22 | https://vercel.com/docs/limits/fair-use-guidelines | 200 | none |
| 23 | https://vercel.com/docs/builds/configure-a-build | 200 | none |
| 24 | https://vercel.com/docs/monorepos | 200 | none |
| 25 | https://railway.com/pricing | 200 | none |
| 26 | https://vercel.com/docs/deployment-protection | 200 | none |
| 27 | https://vercel.com/pricing | 200 | none |
| 28 | https://docs.railway.com/reference/healthchecks | 200 | 1 redirect(s) → https://docs.railway.com/deployments/healthchecks |
| 29 | https://docs.railway.com/reference/variables | 200 | 1 redirect(s) → https://docs.railway.com/variables/reference |
| 30 | https://docs.railway.com/guides/dockerfiles | 200 | 1 redirect(s) → https://docs.railway.com/builds/dockerfiles |
| 31 | https://docs.railway.com/reference/deployment-regions | 200 | 1 redirect(s) → https://docs.railway.com/deployments/regions |
| 32 | https://docs.railway.com/reference/pricing/plans | 200 | 1 redirect(s) → https://docs.railway.com/pricing/plans |
| 33 | https://vercel.com/docs/plans/hobby.md | 403 — Vercel Security Checkpoint (bot challenge); not loaded | none |
| 34 | https://vercel.com/docs/limits | 403 — Vercel Security Checkpoint (bot challenge); not loaded | none |
| 35 | https://vercel.com/docs/limits/overview | 403 — Vercel Security Checkpoint (bot challenge); not loaded | none |
| 36 | https://vercel.com/docs/plans | 403 — Vercel Security Checkpoint (bot challenge); not loaded | none |
| 37 | https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication | 403 — Vercel Security Checkpoint (bot challenge); not loaded | none |
| 38 | https://vercel.com/docs/limits/fair-use-guidelines.md | 200 | none |
| 39 | https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication.md | 403 — Vercel Security Checkpoint (bot challenge); not loaded | none |
| 40 | https://vercel.com/legal/terms | 403 — Vercel Security Checkpoint (bot challenge); not loaded | none |
| 41 | https://gvisor.dev/docs/architecture_guide/platforms/ | 200 | none |
| 42 | https://gvisor.dev/docs/architecture_guide/security/ | 200 | none |
| 43 | https://cloud.google.com/run/docs/securing/security | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://docs.cloud.google.com/run/docs/securing/security |
| 44 | https://raw.githubusercontent.com/firecracker-microvm/firecracker/main/docs/getting-started.md | 000 — proxy refused CONNECT (403 from session proxy); not loaded | none |
| 45 | https://gvisor.dev/docs/architecture_guide/performance/ | 200 | none |
| 46 | https://cloud.google.com/run/docs/about-execution-environments | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://docs.cloud.google.com/run/docs/about-execution-environments |
| 47 | https://gvisor.dev/docs/ | 200 | none |
| 48 | https://gvisor.dev/docs/user_guide/install/ | 200 | none |
| 49 | https://fly.io/docs/reference/regions/ | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://docs.fly.io/reference/regions |
| 50 | https://cloud.google.com/run/pricing | 200 | none |
| 51 | https://fly.io/docs/reference/architecture/ | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://docs.fly.io/reference/architecture |
| 52 | https://e2b.dev/pricing | 200 | none |
| 53 | https://aws.amazon.com/lambda/pricing/ | 200 | none |
| 54 | https://docs.railway.com/variables | 200 | none |
| 55 | https://docs.aws.amazon.com/whitepapers/latest/security-overview-aws-lambda/lambda-executions.html | 200 | 1 redirect(s) → https://docs.aws.amazon.com/lambda/latest/dg/lambda-security.html |
| 56 | https://fly.io/docs/about/pricing/ | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://docs.fly.io/about/pricing |
| 57 | https://firecracker-microvm.github.io/ | 200 | none |
| 58 | https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data | 000 — proxy refused CONNECT (403 from session proxy); not loaded | none |
| 59 | https://datacenters.microsoft.com/globe/explore/ | 000 — proxy refused CONNECT (403 from session proxy); not loaded | none |
| 60 | https://platform.openai.com/docs/guides/your-data | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://developers.openai.com/api/docs/guides/your-data |
| 61 | https://docs.claude.com/en/docs/build-with-claude/zero-data-retention | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://platform.claude.com/docs/en/build-with-claude/zero-data-retention |
| 62 | https://ai.google.dev/gemini-api/terms | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://aistudio.google.com/docs/terms |
| 63 | https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/models | 200 | 2 redirect(s) → https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure |
| 64 | https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/deployment-types | 200 | 1 redirect(s) → https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/deployment-types |
| 65 | https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html | 200 | none |
| 66 | https://docs.claude.com/en/docs/about-claude/pricing | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://platform.claude.com/docs/en/about-claude/pricing |
| 67 | https://platform.openai.com/docs/pricing | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://developers.openai.com/api/docs/pricing |
| 68 | https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy | 200 | 1 redirect(s) → https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy |
| 69 | https://openai.com/api/pricing/ | 200 | 1 redirect(s) → https://openai.com/business/pricing/#api |
| 70 | https://aws.amazon.com/about-aws/global-infrastructure/regions_az/ | 200 | none |
| 71 | https://aws.amazon.com/local/middle_east/ | 200 | 2 redirect(s) → https://aws.amazon.com/ |
| 72 | https://docs.claude.com/en/docs/build-with-claude/data-residency | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://platform.claude.com/docs/en/build-with-claude/data-residency |
| 73 | https://cloud.google.com/about/locations | 200 | none |
| 74 | https://ai.google.dev/gemini-api/docs/pricing | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://aistudio.google.com/docs/pricing |
| 75 | https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-5.html | 200 | none |
| 76 | https://azure.microsoft.com/en-us/explore/global-infrastructure/geographies/ | 200 | none |
| 77 | https://docs.anthropic.com/en/docs/about-claude/pricing.md | 000 — proxy refused CONNECT (403 from session proxy); not loaded | none |
| 78 | https://trust.anthropic.com/ | 000 — proxy refused CONNECT (403 from session proxy); not loaded | none |
| 79 | https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations |
| 80 | https://www.anthropic.com/legal/privacy | 200 | none |
| 81 | https://openai.com/enterprise-privacy/ | 200 | none |
| 82 | https://www.anthropic.com/pricing | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://claude.com/pricing |
| 83 | https://cloud.google.com/about/locations/dammam | 404 | none |
| 84 | https://ai.google.dev/gemini-api/docs/pricing.md.txt | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://aistudio.google.com/docs/pricing.md.txt |
| 85 | https://openai.com/index/expanding-data-residency-access-to-business-customers-worldwide/ | 200 | none |
| 86 | https://cloud.google.com/vertex-ai/generative-ai/pricing | 200 | 2 redirect(s) → https://cloud.google.com/model-garden/pricing |
| 87 | https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html | 200 | none |
| 88 | https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-4-8.html | 200 | none |
| 89 | https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html | 200 | none |
| 90 | https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5-5.html | 200 | none |
| 91 | https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html | 200 | none |
| 92 | https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html | 200 | none |
| 93 | https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-4-6.html | 200 | none |
| 94 | https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html | 200 | none |
| 95 | https://cloud.google.com/docs/dammam-region-access | 000 — proxy refused CONNECT (403 from session proxy); not loaded | 1 redirect(s) → https://docs.cloud.google.com/docs/dammam-region-access |
| 96 | https://gvisor.dev/users/ | 200 | none |
| 97 | https://fly.io/ | 200 | none |
| 98 | https://e2b.dev/docs | 403 — Vercel Security Checkpoint (bot challenge); not loaded | none |

### 1b. WebFetch pass (for pages the direct fetch could not load)

| URL | Result | Redirect / final URL |
|---|---|---|
| https://github.com/pricing | loaded (200) | none |
| https://vercel.com/docs/plans/hobby | loaded (200) | none |
| https://vercel.com/docs/limits/fair-use-guidelines | loaded (200) | none |
| https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication | loaded (200) | none |
| https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md | loaded (200) | none |
| https://docs.cloud.google.com/run/docs/about-execution-environments | NOT loaded: DNS ENOTFOUND (host not allowed) | n/a |
| https://docs.cloud.google.com/run/docs/securing/security | NOT loaded: DNS ENOTFOUND | n/a |
| https://fly.io/docs/about/pricing/ | 301 → https://docs.fly.io/about/pricing, then NOT loaded: ENOTFOUND | 301 |
| https://fly.io/docs/reference/regions/ | 301 → https://docs.fly.io/reference/regions, then NOT loaded | 301 |
| https://fly.io/docs/reference/architecture/ | 301 → https://docs.fly.io/reference/architecture, then NOT loaded | 301 |
| https://platform.claude.com/docs/en/about-claude/pricing | NOT loaded: ENOTFOUND | n/a |
| https://platform.claude.com/docs/en/build-with-claude/zero-data-retention | NOT loaded: ENOTFOUND | n/a |
| https://platform.claude.com/docs/en/build-with-claude/data-residency | NOT loaded: ENOTFOUND | n/a |
| https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data | NOT loaded: ENOTFOUND | n/a |
| https://developers.openai.com/api/docs/pricing | NOT loaded: ENOTFOUND | n/a |
| https://developers.openai.com/api/docs/guides/your-data | NOT loaded: ENOTFOUND | n/a |
| https://aistudio.google.com/docs/pricing | NOT loaded: ENOTFOUND | n/a |
| https://aistudio.google.com/docs/terms | NOT loaded: ENOTFOUND | n/a |

**Hosts unreachable from this environment:** `platform.claude.com`, `docs.anthropic.com`, `claude.com`, `privacy.claude.com`, `privacy.anthropic.com`, `trust.anthropic.com`, `developers.openai.com`, `aistudio.google.com` (the redirect target of `ai.google.dev` docs), `docs.cloud.google.com`, `docs.fly.io`, `raw.githubusercontent.com`, `datacenters.microsoft.com`. Every fact that lives only on those hosts is UNVERIFIED below. Re-running this research needs an environment whose network policy allows those hosts.

## A. GitHub

Sources:
- [GH-VIS] https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility (200, no redirect)
- [GH-FORKS] https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/what-happens-to-forks-when-a-repository-is-deleted-or-changes-visibility (301 → https://docs.github.com/en/pull-requests/reference/forks)
- [GH-ACT] https://docs.github.com/en/billing/concepts/product-billing/github-actions (200)
- [GH-SS] https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning (301 → https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)
- [GH-PP] https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection (301 → https://docs.github.com/en/code-security/concepts/secret-security/push-protection)
- [GH-CONN] https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/understanding-connections-between-repositories (200)
- [GH-PRICE] https://github.com/pricing (loaded through WebFetch only; the curl path is blocked by the session proxy)

### A1. Making a public repository private

| Topic | Official statement | Source |
|---|---|---|
| Stars and watchers | "Stars and watchers for this repository will be erased, which will affect repository rankings." | GH-VIS |
| Existing public forks | "Current forks will remain public and will be detached from this repository." | GH-VIS |
| Fork network | "GitHub will detach public forks of the public repository and put them into a new network. Public forks are not made private." | GH-VIS |
| Fork table | "A public repository is made private — Its public forks stay public in a separate network." | GH-FORKS |
| Fork visibility rule | "A fork's visibility depends on the upstream repository. Public repository forks are public, and private repository forks are private. You cannot change the visibility of a fork by itself." | GH-FORKS |
| GitHub Pages (Free) | "If you're using GitHub Free for personal accounts or organizations, some features won't be available in the repository after you change the visibility to private. Any published GitHub Pages site will be automatically unpublished. If you added a custom domain to the GitHub Pages site, you should remove or update your DNS records before making the repository private, to avoid the risk of a domain takeover." | GH-VIS |
| Code scanning / GHAS | "GitHub Advanced Security features, such as code scanning, will stop working unless the repository is owned by an organization that has access to the feature in private repositories with a GitHub Advanced Security, GitHub Code Security, or GitHub Secret Protection license…" | GH-VIS |
| Dependabot | "Custom Dependabot alert rules will be disabled unless GitHub Code Security is enabled for this repository. Dependency graph and Dependabot alerts will remain enabled with permission to perform read-only analysis on this repository." | GH-VIS |
| Actions after going private | The visibility page does not state a specific Actions change for public→private (it states for private→public: "Actions history and logs will be visible to everyone."). Billing changes follow from A2: "The use of standard GitHub-hosted runners is free: In public repositories…". Effect on already-run workflow logs when going private: **UNVERIFIED** (not stated). | GH-VIS, GH-ACT |

### A2. GitHub Actions on private repositories, GitHub Free (personal account)

| Topic | Official statement | Source |
|---|---|---|
| Included usage (docs) | Table row: "GitHub Free — 500 MB [artifact storage] — $12 USD [included compute usage per month] — 10 GB [cache storage per repository] — Not applicable [custom image storage]" | GH-ACT |
| Unit | "The included compute usage is expressed as a monetary amount, not a fixed number of minutes or other usage units." | GH-ACT |
| Rate example | "If you run a workflow on a standard Linux runner and it takes 10 minutes to complete, $0.06 USD is deducted from the repository owner's included compute usage (10 × $0.006 USD)." | GH-ACT |
| Included usage (pricing page) | Free: "$0USD"; "2,000 CI/CD minutes/month"; "500MB of Packages storage"; "Unlimited public/private repositories". Team: "$4USD" "per user / month", "3,000 CI/CD minutes/month". | GH-PRICE |
| Exhausted, no payment method | "If your account does not have a valid payment method on file, usage is blocked once you consume the included compute usage. Larger runners require a valid payment method." | GH-ACT |
| Free usage | "The use of standard GitHub-hosted runners is free: In public repositories; For GitHub Pages; For Dependabot" | GH-ACT |

Note: the docs express the Free allowance as "$12 USD" of compute; the pricing page says "2,000 CI/CD minutes/month". At the documented $0.006/min Linux rate, $12 equals 2,000 Linux minutes. That is arithmetic, not a quote. Rates for Windows/macOS runners were not captured: **UNVERIFIED**.

### A3. Secret scanning and push protection on private repos (Free)

| Topic | Official statement | Source |
|---|---|---|
| Secret scanning availability | "Public repositories: Secret scanning runs automatically for free." / "Organization-owned private and internal repositories: Available with GitHub Secret Protection enabled on GitHub Team or GitHub Enterprise Cloud." / "User-owned repositories: Available on GitHub Enterprise Cloud with Enterprise Managed Users…" | GH-SS |
| Push protection for repositories | "Requires GitHub Secret Protection to be enabled" / "Is disabled by default, and can be enabled by a repository administrator, organization owner, security manager, or enterprise owner" | GH-PP |
| Push protection for users | "Push protection for users is only available on GitHub.com, and is specific to your GitHub account. This form of push protection: Is enabled by default; Stops you from pushing secrets to public repositories on GitHub" | GH-PP |

Implication, based only on these quotes: a private repository owned by a personal account on GitHub Free gets neither repository secret scanning nor repository push protection. Per-user push protection covers pushes to public repositories only.

### A4. How an owner lists forks

"The forks page lists the forks of a repository." Steps: "1. On GitHub, navigate to the main page of the repository. 2. Under your repository name, click Insights. 3. In the left sidebar, click Forks." Filters: "You can filter the list of forks to display active, inactive, starred, or archived forks…" (GH-CONN)

### A5. Steps to change visibility (Settings path)

Quoted from GH-VIS:
1. "On GitHub, navigate to the main page of the repository."
2. "Under your repository name, click Settings. If you cannot see the "Settings" tab, select the dropdown menu, then click Settings."
3. "In the "Danger Zone" section, to the right of to "Change repository visibility", click Change visibility."
4. "Select a visibility."
5. "Click to confirm that you are changing the visibility of the correct repository."
6. "Click I have read and understand these effects."
7. "Click Make this repository public or Make this repository private."

## B. Supabase

Sources:
- [SB-PRICE] https://supabase.com/pricing (200)
- [SB-REG] https://supabase.com/docs/guides/platform/regions.md (200; the HTML URL https://supabase.com/docs/guides/platform/regions returned a 403 Vercel Security Checkpoint)
- [SB-BKP] https://supabase.com/docs/guides/platform/backups (200)
- [SB-AUTHCFG] https://supabase.com/docs/guides/auth/general-configuration (200)
- [SB-SMTP] https://supabase.com/docs/guides/auth/auth-smtp.md (200; the HTML URL returned 403 checkpoint)
- [SB-INV] https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail (200)
- [SB-BR] https://supabase.com/docs/guides/deployment/branching (200)

### B1. Free vs Pro (prices in USD as displayed)

| Item | Free | Pro | Source |
|---|---|---|---|
| Price | "$0 / month" | "From $25 / month" — "First project included. Additional from $10/mo." | SB-PRICE |
| Projects | "Limit of 2 active projects." | First project included, additional from $10/mo (compute) | SB-PRICE |
| Pausing | "Free projects are paused after 1 week of inactivity." | not stated as paused | SB-PRICE |
| Database size | "500 MB database size" / "Shared CPU • 500 MB RAM" | "8 GB disk size per project then $0.125 per GB" | SB-PRICE |
| Auth MAU | "50,000 monthly active users" | "100,000 monthly active users then $0.00325 per MAU" | SB-PRICE |
| Egress | "5 GB egress", "5 GB cached egress" | "250 GB egress then $0.09 per GB"; "250 GB cached egress then $0.03 per GB" | SB-PRICE |
| File storage | "1 GB file storage" | "100 GB file storage then $0.0213 per GB" | SB-PRICE |
| Daily backups | "Automatic backups — Not included in free" | "Daily backups stored for 7 days" | SB-PRICE |
| PITR | "Not included in" [free] | "$100 per month per 7 days retention"; add-on "Starts from $100/month" | SB-PRICE |
| Compute credit | — | "Paid plans include $10/mo in compute credits, enough to cover one Micro instance." Micro "$10" (1 GB). | SB-PRICE |
| Team plan | — | "$599" (Team: "Daily backups stored for 14 days") | SB-PRICE |

Backups doc: "We automatically back up all Pro, Team, and Enterprise Plan projects on a daily basis." and "We recommend that free tier plan projects regularly export their data using the Supabase CLI db dump command and maintain off-site backups." (SB-BKP)

### B2. Regions (is there a Middle East region?)

SB-REG lists general regions "Americas, East US (North Virginia)", "Europe, Central EU (Frankfurt)", "APAC, Southeast Asia (Singapore)" and these specific regions: us-west-1, us-west-2, us-east-1, us-east-2, ca-central-1, eu-west-1, eu-west-2, eu-west-3, eu-central-1, eu-central-2, eu-north-1, ap-south-1 (Mumbai), ap-southeast-1, ap-northeast-1, ap-northeast-2, ap-southeast-2, sa-east-1.
- **No Middle East region is listed** (no me-*, Bahrain, UAE or Saudi entry).
- "Once you select a region for your project, you cannot change it."
- "Region selection is a data-location control, not proof of regulatory compliance."

### B3. Disabling public sign-ups

"Allow new users to sign up: Users will be able to sign up. If this config is disabled, only existing users can sign in." (SB-AUTHCFG)

### B4. Custom SMTP and invite-only users on Free

- Pricing comparison row: "Custom SMTP server — Included in free" (SB-PRICE).
- Default sender without custom SMTP: "Send messages only to pre-authorized addresses." … "Currently this value is set to 2 messages per hour." (SB-SMTP)
- After custom SMTP: "…a low rate-limit of 30 messages per hour is imposed." (SB-SMTP)
- Invites: "JavaScript: inviteUserByEmail — Sends an invite link to an email address." (SB-INV). Whether this works on the Free plan is not stated on that page: **UNVERIFIED**. Combining it with B3 to get invite-only access is an inference, not a quoted statement.

### B5. Branching / staging guidance

- Pricing: "Branching — Not included in free"; Pro: "$0.01344 per branch, per hour" (SB-PRICE).
- FAQ: "You can create two projects, one for development and one for production — the Free Plan includes two free projects. You can also use Branching, available on the Pro Plan and above, to run a separate development environment off your production p[roject]" (SB-PRICE).
- "Persistent branches are long-lived and recommended for environments like staging, QA, or development. They aren't automatically paused or deleted due to inactivity…" (SB-BR)
- "Data-less by default: By default, new branches do not start with any data or storage objects from your base project." (SB-BR)
- "Auth secrets, such as OAuth provider secrets and SMTP passwords, get placeholder values instead. Set the real values with branch secrets." (SB-BR)

## C. Vercel

Sources:
- [VC-PRICE] https://vercel.com/pricing (200)
- [VC-HOBBY] https://vercel.com/docs/plans/hobby (200 on retry; the first attempt and the `.md` variant hit a 403 checkpoint)
- [VC-FAIR] https://vercel.com/docs/limits/fair-use-guidelines (200)
- [VC-DP] https://vercel.com/docs/deployment-protection (200)
- [VC-VAUTH] https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication (WebFetch 200; curl returned a 403 checkpoint)
- [VC-REG] https://vercel.com/docs/regions (200)
- [VC-MONO] https://vercel.com/docs/monorepos (200)
- [VC-BUILD] https://vercel.com/docs/builds/configure-a-build (200)

### C1. Hobby vs Pro

| Item | Hobby | Pro | Source |
|---|---|---|---|
| Price | "$0/mo." | "$20/mo." / "$20 of included usage credit"; "Developer seat … $20 / month" | VC-PRICE |
| Included (examples) | "Fast Data Transfer — First 100 GB"; "Fast Origin Transfer — First 10 GB"; "CDN Requests — First 1,000,000"; "Active CPU — 4 CPU-hrs"; "Provisioned Memory — 360 GB-hrs"; "Function Invocations — First 1,000,000" | "Flat Rate CDN with traffic spike protection"; "Team collaboration & free viewer seats" | VC-HOBBY, VC-PRICE |
| Over-limit | "In most cases, if you exceed your usage limits on the Hobby plan, you will have to wait until 30 days have passed before you can use the feature again." | billed via credit and on-demand rates | VC-HOBBY, VC-FAIR |

**Commercial use on Hobby: UNVERIFIED.** VC-HOBBY and VC-FAIR, as fetched, contain no statement restricting Hobby to personal or non-commercial use. The Vercel Terms page (https://vercel.com/legal/terms) returned a 403 checkpoint and was not read.

### C2. Deployment Protection

| Method | Official statement (plans) | Source |
|---|---|---|
| Vercel Authentication | "Vercel Authentication is available on all plans"; "Those on the Hobby plan can only have one external user per account." | VC-VAUTH |
| Password Protection | "Available on Pro for $20 per month per protected project and included on Enterprise at the team level. Not available on Hobby" (pricing page: "Password Protection — $20 / project / month") | VC-DP, VC-PRICE |
| Trusted IPs | "Restricts access to users with the correct IP address. Available on the Enterprise plan" | VC-DP |
| Passport (IdP) | "Available on the Enterprise plan" | VC-DP |
| Scope | "Standard Protection: Protects all deployments except production domains"; "All Deployments: Protects all URLs, including production domains" | VC-DP |
| Settings path | "From the dashboard, select the project … Open Settings in the sidebar and select Deployment Protection" | VC-DP |

Which plans include the "All Deployments" scope: **UNVERIFIED** (not captured).

### C3. Function regions

VC-REG region table: arn1 (Stockholm), bom1 (Mumbai), cdg1 (Paris), cle1 (Cleveland), cpt1 (Cape Town), dub1 (Dublin), fra1 (Frankfurt), gru1 (São Paulo), hkg1 (Hong Kong), hnd1 (Tokyo), iad1 (Washington, D.C.), icn1 (Seoul), kix1 (Osaka), lhr1 (London), pdx1 (Portland), sfo1 (San Francisco), sin1 (Singapore), syd1 (Sydney), yul1 (Montréal). **No Middle East region is listed** (no dxb/bah or me-* mapping).

### C4. Monorepo root directory

"For such cases, you can specify the project Root Directory." To configure: "1. Navigate to the Build and Deployment page of your Project Settings 2. Scroll down to Root Directory". "By default, your build can access files outside of that directory… If you turn off Include files outside the root directory in the Build Step … your build cannot access files outside of that directory." (VC-BUILD). On import: "Click the Edit button next to the Root Directory setting to select the directory, or project, you want to deploy." (VC-MONO)

## D. Railway

Sources:
- [RW-PRICE] https://railway.com/pricing (200)
- [RW-PLANS] https://docs.railway.com/reference/pricing/plans (301 → https://docs.railway.com/pricing/plans)
- [RW-DOCKER] https://docs.railway.com/guides/dockerfiles (301 → https://docs.railway.com/builds/dockerfiles)
- [RW-HC] https://docs.railway.com/reference/healthchecks (301 → https://docs.railway.com/deployments/healthchecks)
- [RW-REG] https://docs.railway.com/reference/deployment-regions (301 → https://docs.railway.com/deployments/regions)
- [RW-PN] https://docs.railway.com/reference/private-networking (301 → https://docs.railway.com/networking/private-networking)
- [RW-VAR] https://docs.railway.com/variables (200) and https://docs.railway.com/reference/variables (301 → https://docs.railway.com/variables/reference)

| Topic | Official statement | Source |
|---|---|---|
| Free | "$0 per month"; "Trial: higher limits and $5 in credits for your first 30 days"; "$1 of monthly usage credits, services wake on request"; "Up to 1 vCPU / 0.5 GB RAM per service, 0.5 GB volume storage"; "No credit card required" | RW-PRICE |
| Hobby | "$5 minimum usage"; "Includes $5 of monthly usage credits"; "Up to 48 vCPU / 48 GB RAM per service"; "Up to 5 GB storage"; "Single developer workspace"; "7-Day Log History". Plans doc: "Hobby $5 / month". | RW-PRICE, RW-PLANS |
| Pro | "$20 minimum usage"; "Includes $20 of monthly usage credits"; "Up to 1,000 vCPU / 1 TB RAM per service"; "Unlimited workspace seats included". Plans doc: "Pro $20 / month"; "If it exceeds $20, you'll be charged the difference on top of the subscription." | RW-PRICE, RW-PLANS |
| Usage rates | "Memory $0.00000386 per GB / sec"; "CPU $0.00000772 per vCPU / sec"; "Volumes $0.00000006 per GB / sec"; "Egress $0.05 per GB for services"; "Object Storage $0.015 per GB-month free egress" | RW-PRICE |
| Dockerfile deploys | "When building a service, Railway will look for and use a Dockerfile at the root of the source directory." / "the Dockerfile must be named Dockerfile with a capital D" | RW-DOCKER |
| Health checks | "Railway will query the endpoint until it receives a successful response (any 2xx status code). Only then will the new deployment be made active…"; "The default timeout on healthchecks is 300 seconds (5 minutes)."; "The healthcheck endpoint is currently not used for continuous monitoring as it is only called at the start of the deployment" | RW-HC |
| Regions | "US West Metal — California, USA — us-west2"; "US East Metal — Virginia, USA — us-east4-eqdc4a"; "EU West Metal — Amsterdam, Netherlands — europe-west4-drams3a"; "Southeast Asia Metal — Singapore — asia-southeast1-eqsg3a". **No Middle East region listed.** | RW-REG |
| Private networking | "Services communicate over encrypted Wireguard tunnels using internal DNS." / "No Public Exposure - Traffic stays within Railway's private network" | RW-PN |
| Variables / secrets | "When a variable is sealed, its value is provided to builds and deployments but is never visible in the UI nor can it be retrieved via the API."; shared variables: "From your Project Settings -> Shared Variables page, choose the Environment…"; references: "${{NAMESPACE.VAR}}" | RW-VAR |

## E. Code isolation

Sources:
- [GV-DOCS] https://gvisor.dev/docs/ (200)
- [GV-SEC] https://gvisor.dev/docs/architecture_guide/security/ (200)
- [GV-PLAT] https://gvisor.dev/docs/architecture_guide/platforms/ (200)
- [GV-PERF] https://gvisor.dev/docs/architecture_guide/performance/ (200)
- [GV-INST] https://gvisor.dev/docs/user_guide/install/ (200)
- [GV-USERS] https://gvisor.dev/users/ (200)
- [FC-HOME] https://firecracker-microvm.github.io/ (200)
- [FC-GS] https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md (WebFetch 200; raw.githubusercontent.com is blocked)
- [CR-PRICE] https://cloud.google.com/run/pricing (200)
- [LB-PRICE] https://aws.amazon.com/lambda/pricing/ (200)
- [FLY-HOME] https://fly.io/ (200)
- [E2B-PRICE] https://e2b.dev/pricing (200)
- [GC-LOC] https://cloud.google.com/about/locations (200)
- [AWS-REG] https://aws.amazon.com/about-aws/global-infrastructure/regions_az/ (200)
- [AZ-GEO] https://azure.microsoft.com/en-us/explore/global-infrastructure/geographies/ (200)

### E1. gVisor

| Topic | Official statement | Source |
|---|---|---|
| What it is | "It is an application kernel that implements a Linux-like interface. Unlike Linux, it is written in a memory-safe language (Go) and runs in userspace." | GV-DOCS |
| Security model | "gVisor was created in order to provide additional defense against the exploitation of kernel bugs by untrusted userspace code." / "the application's direct interactions with the host System API are intercepted by the Sentry" | GV-SEC |
| Limits of the model | "gVisor relies on the host operating system and the platform for defense against hardware-based attacks." / "gVisor similarly relies on the host resource mechanisms (cgroups) for defense against resource exhaustion and denial of service attacks. Network policy controls should be applied at the container level…" | GV-SEC |
| Platforms | "when running on bare-metal (not inside a VM), the KVM platform will provide the best performance. The systrap platform is a better choice when running inside a VM, or on a machine without virtualization support." / "systrap replaced ptrace as the default gVisor platform in mid-2023." / "systrap platform relies on seccomp's SECCOMP_RET_TRAP feature in order to intercept system calls." / nested VM: "the systrap platform will often provide better performance in such a setup, due to the overhead of nested virtualization." | GV-PLAT |
| Overhead | "gVisor imposes runtime costs over native containers. These costs come in two forms: additional cycles and memory usage, which may manifest as increased latency, reduced throughput or density, or not at all." / network stack "is less CPU efficient" / benchmarks use ptrace, which "suffers from the highest structural costs by far … users should use Systrap for best p[erformance]" | GV-PERF |
| Requirements | "gVisor supports x86_64 and ARM64, and requires Linux 5.6+." | GV-INST |
| Who uses it | "gVisor powers Google Cloud offerings GKE Sandbox, Cloud Run, App Engine, and more." | GV-USERS |

### E2. Firecracker

| Topic | Official statement | Source |
|---|---|---|
| What it is | "Firecracker runs in user space and uses the Linux Kernel-based Virtual Machine (KVM) to create microVMs." | FC-HOME |
| Boot / density | "Boot in <125ms. Create up to 150 microVMs per second per host." / "<5 MiB overhead per VM." / "Only 5 emulated devices. Minimal attack surface with KVM-based isolation." | FC-HOME |
| Host/guest OS | "Firecracker supports Linux host and guest operating systems with kernel versions 4.14 and above, as well as OSv guests." | FC-HOME |
| KVM requirement | "Firecracker requires read/write access to /dev/kvm exposed by the KVM module." | FC-GS |
| Bare metal on EC2 | "We exclusively use .metal instance types, because EC2 only supports KVM on .metal instance types." (the page's EC2 example) | FC-GS |
| Architectures | "Firecracker supports x86_64 and aarch64 Linux" | FC-GS |
| Nested virtualization | **UNVERIFIED** (not stated on the pages read) | — |

### E3. Managed options

**Google Cloud Run**
- gVisor: "gVisor powers Google Cloud offerings GKE Sandbox, Cloud Run, App Engine, and more." (GV-USERS). The Cloud Run docs pages on execution environments and security are on `docs.cloud.google.com`, which is blocked here: **UNVERIFIED** from Google Cloud's own docs.
- Pricing (as displayed for the default region Iowa us-central1, instance-based billing): "CPU (per vCPU-second) $0.000018"; "Memory (per GiB-second) $0.000002"; free tier "First 240,000 vCPU-seconds free per month", "First 450,000 GiB-seconds free per month". Request-based billing: "CPU … Active time $0.000024"; "Memory … Active time $0.0000025"; "Requests (per 1,000,000) … $0.40"; free tier "First 180,000 vCPU-seconds", "First 360,000 GiB-seconds", "2 million requests free per month". The region selector on the page includes "Doha (me-central1)" and "Dammam (me-central2)". (CR-PRICE)

**AWS Lambda**
- Firecracker: "Firecracker was built by developers at Amazon Web Services to enable services such as AWS Lambda…" and "Built on the same Firecracker virtualization powering 15 trillion+ monthly Lambda function invocations" (FC-HOME, on the Lambda MicroVMs product). The AWS Lambda security doc (https://docs.aws.amazon.com/whitepapers/latest/security-overview-aws-lambda/lambda-executions.html → 301 to https://docs.aws.amazon.com/lambda/latest/dg/lambda-security.html) has no Firecracker statement in its fetched text.
- Pricing: "Request charges: $0.20 per million requests"; "The monthly compute price is $0.0000166667 per GB-s and the free tier provides 400,000 GB-s."; "The free tier includes one million requests and 400,000 GB-seconds per month." (LB-PRICE, x86 examples)

**Fly.io Machines**
- Firecracker: "Every computer is its own Firecracker microVM. No shared kernel, and no faster mode that skips it." and "Fly Machines: fast-booting VMs for production apps, in 18 regions." (FLY-HOME). The architecture doc is on blocked docs.fly.io.
- Pricing: **UNVERIFIED** (docs.fly.io blocked).
- Regions list / Middle East region: **UNVERIFIED** (docs.fly.io blocked). Only the homepage claim "18 regions" was read.

**e2b.dev sandboxes**
- "Hobby — FREE — $100 one-time usage credit — Sessions up to 1 hour"; "pro $150 … usage billed by the second — Sessions up to 24 hours"; "Hobby · 10 concurrent", "Pro · 100 concurrent"; "Enterprise starts at a $2,000/mo commit"; "We charge per second of a running sandbox." (E2B-PRICE)
- Per-second rates: vCPU "1 — $0.000014/s", "2 [Default] — $0.000028/s"; memory "1 GiB — $0.0000045/s", "4 [Default] — $0.0000180/s" (E2B-PRICE)
- Isolation technology: FC-HOME lists e2b.dev among Firecracker users (link only). e2b's own docs returned 403: **UNVERIFIED** from e2b.

### E4. Saudi Arabia cloud regions

| Provider | Official statement | Source |
|---|---|---|
| Google Cloud | The Cloud Run pricing region selector lists "Dammam (me-central2)" and "Doha (me-central1)". The locations page footnote says: "Dammam region access is described in this document." (that document, https://cloud.google.com/docs/dammam-region-access → docs.cloud.google.com, is blocked: access conditions **UNVERIFIED**). | CR-PRICE, GC-LOC |
| AWS | "…with announced plans for 7 more Availability Zones and 2 more AWS Regions in the Kingdom of Saudi Arabia, and Chile." The page's region data shows `"name":"Kingdom of Saudi Arabia","available":false,"availabilityZones":3,"id":"me-south-2"`. Available Middle East regions: "Middle East (Bahrain)" me-south-1 (launched 2019), "Middle East (UAE)" me-central-1 (2022), "Israel (Tel Aviv)" il-central-1 (2023). | AWS-REG |
| Azure | "Azure is available or coming soon to the following geographies: … Israel, Qatar, United Arab Emirates, and Saudi Arabia." Regions list: "… Israel Central, Qatar Central, UAE North, UAE Central, and Saudi Arabia East." Whether Saudi Arabia East is generally available or "coming soon" is not separated in the fetched text: **UNVERIFIED**. | AZ-GEO |

## F. Model providers

Arabic quality is not assessed here, and no official statement about it was found on the pages that loaded.

### F1. Anthropic

- Pricing page, ZDR page, data-residency page (platform.claude.com) and API retention article (privacy.claude.com): **all UNVERIFIED**, because these hosts are not reachable from this environment (see 1b).
- Loaded: https://www.anthropic.com/legal/privacy (200). This is the general privacy policy, not API terms: "Anthropic retains your personal data for as long as reasonably necessary for the purposes and criteria outlined in this Privacy Policy and explained further in our privacy center." It does not give an API retention period.
- Claude via AWS Bedrock: see F5.

### F2. OpenAI

- API token pricing: **UNVERIFIED**. https://openai.com/api/pricing/ redirected (1 redirect) to https://openai.com/business/pricing/#api, which shows ChatGPT plans, not per-token API prices. https://platform.openai.com/docs/pricing redirected to developers.openai.com, which is blocked.
- Data retention (https://openai.com/enterprise-privacy/, 200): "OpenAI may securely retain API inputs and outputs for up to 30 days to provide the services and to identify abuse. After 30 days, API inputs and outputs are removed from our systems, unless we are legally required to retain them. You can also request zero data retention (ZDR) for eligible endp[oints]". Training: "By default, we do not use your business data for training our models."
- Data residency (https://openai.com/index/expanding-data-residency-access-to-business-customers-worldwide/, 200, page dated November 25, 2025): "Data residency is currently available in Europe, the United Kingdom, the United States, Canada, Japan, South Korea, Singapore, India, Australia, and the United Arab Emirates." and "Enterprise Customers that have been approved for advanced data controls can enable regional data residency by creating a new Project in the API Platform dashboard and selecting their preferred region." **Saudi Arabia is not in the list.** Whether the list has changed since that date: **UNVERIFIED** (the current docs page is blocked).

### F3. Google Gemini API

- Pricing and data-use terms: **UNVERIFIED**. https://ai.google.dev/gemini-api/docs/pricing and https://ai.google.dev/gemini-api/terms both redirect to aistudio.google.com, which is blocked here.

### F4. Azure OpenAI (Azure AI Foundry "models sold by Azure")

Sources: https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy (301 → https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy); https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/deployment-types (301 → …/azure/foundry/foundry-models/concepts/deployment-types); https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/models (2 redirects → …/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure).

- Data use: prompts and completions "are NOT available to OpenAI or other providers of Models sold by Azure." / "are NOT used to train any generative AI foundation models without your permission or instruction."
- Processing location: "Prompts and responses are processed within the customer-specified geography (unless you are using a Global or DataZone deployment type)…" / "For any deployment type labeled 'Global,' prompts and responses may be processed in any geography where the relevant model sold by Azure is deployed".
- Deployment types: "Global types: May be processed in any Azure region"; "Data Zone types: The service processes data only within the Microsoft-specified data zone (US, EU, or Asia Pacific (APAC))."; "Geography-based deployment types arrive last, have no guaranteed availability date…"
- Abuse monitoring: "managed customers may apply to modify abuse monitoring."
- Regions: the models page mentions "UAE North" (for example "UAE North supports Global Managed Training only for…"). The string "Saudi" does not appear anywhere in the fetched models page. Model-by-region availability in a Saudi region: **UNVERIFIED / not listed**.

### F5. AWS Bedrock: Claude by region

Sources: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5-5.html, …-claude-sonnet-5-5.html, …-claude-haiku-5-5.html (all 200). Also loaded: …-claude-sonnet-4-5.html, -opus-4-8, -sonnet-4-6, -opus-4-6, -haiku-4-5. The old https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html now says "Information previously on this page has moved."

- Lifecycle: "Model lifecycle: Active" (Opus 5.5, Sonnet 5.5, Haiku 5.5). "Claude Sonnet 4.5 is in the Legacy stage in all Regions. It has an upcoming end of life of April 8, 2027…"
- Inference options: "In-Region keeps requests within a single Region for strict compliance, Geo Cross-Region routes across Regions within a geography (such as US, EU, and APAC) while respecting data residency, and Global Cross-Region routes anywhere worldwide when there are no residency constraints."
- Middle East rows (identical on the Opus 5.5, Sonnet 5.5 and Haiku 5.5 cards; columns In-Region / Geo / Global): "me-central-1 (UAE) [not-supported] [not-supported] [supported]" and "me-south-1 (Bahrain) [not-supported] [not-supported] [supported]". For comparison: "us-east-1 (N. Virginia) [not-supported] [supported] [supported]".
- No Saudi Arabia region appears on these model cards (string "Saudi" count = 0 on the Opus 5.5 card).
- Bedrock per-token prices: not captured: **UNVERIFIED**.

## Facts that matter for NAQLA

Facts only, each traceable to a quote above.

1. **GitHub, going private:** stars and watchers are erased; existing public forks stay public in a separate network; a GitHub Pages site on Free is unpublished. (A1)
2. **GitHub Free, private repos:** Actions draws from "$12 USD" of included compute per month (pricing page: "2,000 CI/CD minutes/month"). With no payment method, "usage is blocked once you consume the included compute usage." (A2)
3. **GitHub Free, personal private repos:** repository secret scanning and repository push protection are not available (secret scanning for private repos requires Secret Protection on Team or Enterprise Cloud). User push protection only blocks pushes to public repositories. (A3)
4. **Supabase:** no Middle East region (closest listed: ap-south-1 Mumbai, eu-central-1 Frankfurt). The region cannot be changed after creation. (B2)
5. **Supabase Free:** 2 active projects, paused after 1 week of inactivity, 500 MB database, no automatic backups, no PITR, no branching. Custom SMTP is included in Free. Public sign-up can be disabled ("only existing users can sign in"). (B1, B3, B4)
6. **Supabase Pro:** from $25/month, daily backups kept 7 days, PITR from $100/month, branching $0.01344 per branch-hour. Persistent branches are "recommended for environments like staging". (B1, B5)
7. **Vercel:** no Middle East function region. Hobby is $0, Pro is $20/month. Vercel Authentication is on all plans (Hobby: one external user per account). Password Protection is Pro at $20/project/month and not on Hobby. Trusted IPs is Enterprise only. (C1–C3)
8. **Vercel Hobby commercial-use restriction:** UNVERIFIED in this session. (C1)
9. **Railway:** regions are US West, US East, EU West (Amsterdam) and Southeast Asia (Singapore); none in the Middle East. Hobby is $5/month, Pro is $20/month. Dockerfile builds are auto-detected. Health checks run only at deploy (default timeout 300 s). Private networking uses WireGuard. Sealed variables cannot be read back via the UI or API. (D)
10. **gVisor:** requires Linux 5.6+ on x86_64 or ARM64. Use systrap inside VMs and KVM on bare metal. It has runtime overhead and relies on host cgroups for DoS protection and on container-level network policy. (E1)
11. **Firecracker:** requires `/dev/kvm`. On EC2 this means `.metal` instances. Boot under 125 ms, less than 5 MiB overhead per VM. (E2)
12. **Saudi regions:** Google Cloud lists Dammam (me-central2), with access conditions in a doc not read here. AWS's Saudi region (me-south-2) shows `"available":false`, "announced plans". Azure lists "Saudi Arabia East" among regions that are "available or coming soon". (E4)
13. **Claude on Bedrock (Opus/Sonnet/Haiku 5.5):** in Bahrain and UAE, only Global cross-region inference is supported (no In-Region or Geo). No Saudi region is listed. (F5)
14. **OpenAI:** data residency list (Nov 25, 2025) includes the UAE but not Saudi Arabia. API inputs and outputs are retained up to 30 days by default, with ZDR available for eligible endpoints. Not used for training by default. (F2)
15. **Azure OpenAI:** Global deployments may process data in any geography. Data Zones are only US, EU and APAC. No Saudi entry appears on the models page. (F4)
16. **Unverified, needs network access to re-check:** Anthropic API pricing, ZDR and data residency; OpenAI API token prices; Gemini API pricing and data use; Fly.io pricing and regions; Cloud Run's own gVisor and sandbox docs; Google's Dammam access conditions. (1b)
