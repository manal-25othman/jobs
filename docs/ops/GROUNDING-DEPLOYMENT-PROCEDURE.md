# نَقْلة / NAQLA — Deployment procedure · grounding-version change (re-grounding historical assets)
**Status:** procedure documented and tested end to end on a scratch database (`apps/api/test/regrounding.e2e.ts`, 8 tests).
**It has NOT been run against real user data.** Doing so needs the Product Owner's explicit approval for that specific run.

## When it applies
- Deploying migration `0020` or later for the first time. Assets approved before `0020` have no `grounding_version`, so they are hidden until re-grounded (fail closed).
- Any change to the grounding **engine** version (`GROUNDING_ENGINE_VERSION`). A change to the grounding **vocabulary** is handled by its activation, which re-grounds atomically; this procedure is not needed for it.

## Principles
- **Nothing is marked grounded without being grounded.** An asset gets the new version only when the engine accepts its approved wording against its cited records **now**. There is no bulk update and no flag.
- **Historical approvals are never rewritten.** A database trigger enforces this. Unsupported assets move to `needs_review`, keep their wording and approval, and their owner is notified.
- **Fail closed.** Until the run completes, the API hides assets whose version does not match, and the direct public path (case-study share links) is frozen.

## Roles
- **Operator:** a person with an active `product_owner` grant in `reviewer_grant`. A name alone is refused.
- A second person reviews the dry-run output before execution. This is recommended; the tool does not enforce it.

## Steps

All commands use `DATABASE_URL` from the environment. Never print its value.

| # | Step | Command | Expected / check |
|---|---|---|---|
| 0 | **Approval** | The Product Owner approves this run in writing (ticket / decision log) | No approval ⇒ stop |
| 1 | **Pre-deployment count** | `node scripts/career-data.mjs claims-standing` | Save the JSON: `activeApproved`, `activeClaimKinds`, `underCurrentVersion`, `withoutVersion`, `presentableNow`, `needsReview`, `byVersion`, `publicVersion` |
| 2 | **Freeze direct public paths** | `node scripts/career-data.mjs claims-public-freeze --operator <uuid> --reason "deploying <version>"` | `grounding_public_state.version` is null; case-study links open nothing. Recruiter links are already gated by the API |
| 3 | **Deploy** | Normal deployment (migrations, then API) | After deploy, the API hides every asset not grounded under the new version. This is expected |
| 4 | **Dry run** | `node scripts/career-data.mjs claims-reground --dry-run` (`--json` for the full plan) | Same code path, rolled back: per asset `KEEP` or `REVIEW` with the reason; policy re-check moves; `reconciliation OK`. **Nothing is written and no notification is sent** |
| 5 | **Review the plan** | A second person reads the `REVIEW` list | An unexpected volume (for example a large share moving to review) ⇒ stop and investigate before executing |
| 6 | **Execute** | `node scripts/career-data.mjs claims-reground --operator <uuid> --reason "<ticket ref>"` | Runs in **one transaction**: re-check, re-ground, snapshot, reconcile. **If reconciliation fails, everything rolls back**. On success it declares the public version and writes audit `grounding.reground_run` |
| 7 | **Post-execution reconciliation** | `node scripts/career-data.mjs claims-standing` again | `underOtherVersion = 0` and `withoutVersion = 0`. `underCurrentVersion` = grounded. `needsReview` grew by exactly the moved count. `publicVersion` = new version |
| 8 | **Exposure check** | Open one recruiter-report share link and one case-study share link of a sampled `KEEP` asset and a sampled `REVIEW` asset | `KEEP` presented; `REVIEW` absent from both |
| 9 | **Record** | Attach steps 1, 4, 6 and 7 outputs to the ticket | `asset_standing_event` rows (cause `grounding_revalidation`) and `grounding_public_state_log` hold the history |

## What "exposes only currently eligible assets" means (tested)
An asset appears in the private report, a recruiter-report share link or a case-study share link only if all of these hold:
- it is `active`;
- it is approved;
- it is evidence-backed;
- it is still eligible under the claim policy in effect;
- it is grounded under the version in effect;
- it cites no evidence withdrawn after its standing was last established.

The last condition was added in Phase 9. Evidence can be withdrawn by its owner directly through RLS, without the API service; presentation re-checks this at read time. A re-link supersedes an earlier withdrawal, as in D-077.

## Failure and recovery

| Situation | What happens | Recovery |
|---|---|---|
| Execution refused (no or invalid operator, no reason) | Nothing is written | Fix the parameters; re-run |
| Reconciliation fails during execution | The whole transaction rolls back; nothing changed; assets stay hidden (fail closed) | Run the dry run (`--json`), read `reconciliation.problems`, fix the cause (for example a concurrent write), re-run |
| Process killed or connection lost mid-run | Postgres rolls back the open transaction | Re-run from step 4. The run is idempotent: already-grounded assets stay grounded |
| More assets move to review than expected *after* execution | They are `needs_review`; owners notified; approvals intact | **Never restore them in bulk.** Each owner re-approves or re-links through the normal flow, which grounds again. If the engine itself is wrong, roll back the deployment; assets grounded under the old version are presented again only after a new completed run under that version |
| Need to roll back the engine | Deploy the previous version | Run steps 4–7 again under the previous version. Assets moved to review stay there (nothing is restored automatically) |
| Direct public paths stay closed | `grounding_public_state.version` is null or old | Complete step 6; only a completed run (or a vocabulary activation) declares it |

## What this procedure does not do
- It does not approve, restore or rewrite any asset.
- It does not change any grounding vocabulary or claim policy.
- It does not connect a real LLM.
