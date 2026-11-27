# GitHub App manifest — NAQLA STAGING

`naqla-staging.manifest.json` describes the STAGING GitHub App: three read-only permissions, no extra webhook events,
private, user authorization requested during installation. The owner's step-by-step guide (Arabic) is
`docs/ops/GITHUB-APP-STAGING-SETUP.md`.

## Values the owner replaces before use

| Field | Placeholder | Replace with |
|---|---|---|
| `name` | `NAQLA Staging` | Any name not already taken on GitHub (GitHub app names are global). Keep "Staging" in it. |
| `url` | `https://STAGING-WEB.example` | The staging web app address. |
| `hook_attributes.url` | `https://STAGING-API.example/v1/webhooks/github` | The staging API host + `/v1/webhooks/github` (this route exists: `GitHubWebhookController`). |
| `callback_urls[0]` | `https://STAGING-APP.example/github/callback` | The staging API host + the install/authorize callback route. **The route is not wired yet**; use the path the lead wires. |
| `setup_url` | same as the callback | Same value as the callback. |
| `redirect_url` | `https://STAGING-API.example/v1/github/manifest-redirect` | Only used by the manifest flow (see below). No handler exists in the API; if you create the App manually, ignore it. |

Nothing secret is in this file, and nothing secret may ever be added to it. The App ID, client ID/secret, private
key and webhook secret are created on GitHub and go straight into the hosting secret store.

## Fields and what is verified

Facts verified in `docs/ops/research/GITHUB-APP-INTEGRATION-RESEARCH.md`:
- `default_permissions`: Contents / Metadata / Pull requests can each be read-only (Q2); these three cover every read
  endpoint the adapter calls (Q7).
- `default_events: []`: `installation`, `installation_repositories` and `github_app_authorization` are delivered to
  every GitHub App by default and cannot be unsubscribed (Q5), so no event needs to be listed.
- `public: false`: a private App "can only be installed on the account that owns the app" (Q3). Fine for staging,
  where only the owner's own test account installs it. A pilot with graduates needs `public: true` later.

**ASSUMPTIONS (UNVERIFIED — the research did not fetch the manifest-flow page):**
- The manifest field names and shapes themselves (`hook_attributes`, `redirect_url`, `callback_urls`, `setup_url`,
  `setup_on_update`, `request_oauth_on_install`, `default_permissions`, `default_events`, `public`).
- That the manifest is submitted as a form POST to `https://github.com/settings/apps/new` and that GitHub then
  redirects to `redirect_url` with a one-time code that must be converted (with `POST /app-manifests/{code}/conversions`)
  into the App's ID, private key, client secret and webhook secret. That conversion would put secrets into an API
  response, so **creating the App manually from these values is the recommended path**.
- That with `request_oauth_on_install: true` GitHub sends the user to the callback URL (with `code` and
  `installation_id`) after installation, and that `setup_url` is then not used.
- That the webhook secret is set on the App page (it is not a manifest field).
