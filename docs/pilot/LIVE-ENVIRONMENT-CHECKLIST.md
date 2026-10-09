# نَقْلة / NAQLA — Live environment readiness checklist
**Status:** nothing provisioned or modified. Every item needs the Product Owner's approval before anyone touches live infrastructure. Never paste secret values into tickets, chat or logs; use names only.

Legend:
- ☐ — not done.
- ⚠ — finding that needs a decision.
- ✓ — exists in the repository (not yet verified live).

## A. Accounts and projects
- ☐ A **staging** Supabase project (Stage A) and, later, a separate **production** project (Stage B). Never share one project between them.
- ☐ Region chosen (`NAQLA_DEPLOY_REGION`) and the data-residency requirement written down.
- ☐ Hosting chosen for the **API** (NestJS, long-running Node process, port `API_PORT` default 3001) and the **app** (Next.js 16).
  - ⚠ There is **no Dockerfile, CI workflow or hosting configuration** in the repository. These need creating (backlog P0-2).
- ☐ A named owner for each account, with MFA on every console account.

## B. Environment variables

Contract: `packages/config/src/index.ts`; template: `.env.example`. The API fails fast on missing required variables.

| Variable | Scope | Required | Notes |
|---|---|---|---|
| `NODE_ENV` | both | ✓ | `production` turns on every production guard (demo content refused, development-only configuration refused, memory storage refused, agent budget required) |
| `NAQLA_DEPLOY_REGION` | both | ✓ | |
| `NEXT_PUBLIC_APP_URL` | app | ✓ | Also the CORS allow-list value (⚠ CORS is currently open: backlog P0-3) |
| `NEXT_PUBLIC_API_URL` | app | ✓ | Also the base of share links (⚠ they return raw JSON) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | both | ✓ | The anon key is public by design; safe only with RLS on every table |
| `SUPABASE_SERVICE_ROLE_KEY` | API | ✓ secret | API only. **Never** given a `NEXT_PUBLIC_` name or set on the app host |
| `DATABASE_URL` | API | ✓ secret | Separate, restricted credentials for operators (re-grounding runbook) |
| `SUPABASE_JWT_SECRET` | API | ✓ secret | ⚠ HS256 verification. Confirm the project still issues HS256 tokens, or plan JWKS (P1-4) |
| `AGENT_BUDGET_CALLS_PER_DAY` | API | ✓ in production | ⚠ **Missing from `.env.example`**. The API refuses to start in production without it |
| `AGENT_PROVIDER` | API | – | Must stay `local-test` (any other value throws: OPEN-023) |
| `STORAGE_DRIVER` | API | – | `supabase` (`memory` is refused in production) |
| `STORAGE_BUCKET_PREFIX`, `UPLOAD_MAX_BYTES`, `DB_POOL_MAX`, `JOB_QUEUE_DRIVER`, `API_PORT` | API | – | Defaults apply; record the chosen values |

## C. Database and migrations
- ☐ Apply `supabase/migrations/0001…0022` **in order** on staging and record the output. No migration has ever been applied to a hosted project.
- ☐ **Seeds:**
  - `supabase/seed/0001_demo_role.sql` holds the demo role, activity and rubric, and activates some configuration as development-only. **Staging only. Never on production.**
  - `0002_technology_terms.sql` holds reference terms; review before production.
- ☐ Pack import: `career:import` (writes draft or demo content). On production only non-demo, SME-reviewed content may be published (the demo guard enforces this).
- ☐ Run `supabase/tests/rls.sql` and `invariants.sql` against the staging database (they need a disposable database: `scripts/db-test.sh` drops and recreates).
- ☐ Run `npm run live:supabase` (`scripts/supabase-live-check.mjs`, 12 checks: auth, refresh, forged token, anon RLS, cross-user read/write, signed upload). Previous result: **0/12, blocked** (`LIVE-SUPABASE-VERIFICATION-REPORT.md`).
- ☐ Rollback: migrations are forward-only. Write the restore-from-backup path before production.

## D. Auth
- ☐ **Disable public sign-up**; use invites or an allow-list for the cohort (the UI currently calls `signUp`).
- ☐ Email confirmation on; password policy; leaked-password protection if available on the plan.
- ☐ Rate limits on the auth endpoints (Supabase settings).
- ☐ Redirect URLs restricted to `NEXT_PUBLIC_APP_URL`.

## E. Storage
- ☐ Confirm the private buckets exist (`naqla-cv-uploads`, `naqla-submissions`, `naqla-generated-docs`, `naqla-profile-assets`). Migration 0002 creates them only when the `storage` schema is present.
- ☐ Confirm the owner-prefix policy `naqla_objects_own`. ⚠ It allows owners to overwrite or delete their own confirmed objects (P1-6).
- ☐ Signed URL TTLs: upload 60 s, download 300 s. Max size: `UPLOAD_MAX_BYTES` (default 10 MB). Content types: a closed list, client-declared.

## F. Secrets
- ☐ All secrets live only in the hosting platform's secret store; no `.env` committed (`.gitignore` covers it). Rotate after any exposure.
- ☐ The service-role key and `DATABASE_URL` are held by named people only; access is listed in the pilot log.

## G. Backups and recovery
- ☐ Backups / PITR enabled (plan-dependent).
- ☐ **One restore drill** on staging, timed and recorded.
- ☐ Incident and pause procedure: disable sign-ups, revoke share links (`share_link.revoked_at`), set `claims-public-freeze`, take the app offline.

## H. Operations
- ☐ Health endpoints `/health` and `/ready` wired to the host's checks.
- ☐ Logging: API logs must not contain tokens, file contents or wording. ⚠ There is no structured logging or error tracking yet (P2).
- ☐ Rate limiting on the API (P0-3; none exists).
- ☐ The re-grounding runbook (`docs/ops/GROUNDING-DEPLOYMENT-PROCEDURE.md`) rehearsed on staging with synthetic approved assets.
- ☐ Monitoring queries agreed: `claims-standing`, `pack_validation_run`, the review queue backlog, `reviewer_grant` changes.
