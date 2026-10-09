# نَقْلة / NAQLA — PILOT READINESS REPORT
**Date:** 2026-10-09 · **Scope:** a limited pilot of the Junior Frontend Developer track · **Status:** assessment only. Nothing was implemented, deployed or run on real data.
**Basis:** code read at commit `0a7b802` (`claude/career-os-graduates-y42s9z`), test suites, migrations, seeds and earlier reports. **Automated tests are not taken as evidence that a journey works for a person.** Every step below says whether a browser path exists, and none has been exercised in a browser.

Companion documents in this folder:
- `LIVE-ENVIRONMENT-CHECKLIST.md` — environment, infrastructure and deployment checklist.
- `BROWSER-ACCEPTANCE-SCENARIOS.md` — manual browser tests for the four roles.
- `SME-REVIEW-IMPORT-CHECKLIST.md` — mapping expert feedback onto configuration.

The nine-phase plan is closed (`docs/architecture/CONFIGURABLE-TRACK-ARCHITECTURE-PLAN.md`).

---

## Verdict in one paragraph

**NO-GO for real graduates today. Conditional GO for internal technical testing**, with synthetic accounts in a non-production environment once the live environment exists.

The architecture is sound: evidence before claims, fail-closed gates, governed configuration, separation of duties. The blockers are concrete and few:
1. **The product's central claim is self-assertable today.** On the only activity the graduate interface can submit, *Demonstrated* is reached by ticking three checkboxes and uploading any two files of an allowed type, with no human review.
2. **All pilot content is DEMO / NOT SME APPROVED.** Production mode refuses to serve it.
3. **No live environment has ever been verified,** and there is no hosting or deployment configuration.
4. **No browser test has ever run.**
5. **Basic launch protections are missing:** rate limiting, restricted CORS, invite-only sign-up, consent and privacy notice, a deletion procedure.

---

## 1. Implemented and verified capabilities

"Verified" here means covered by automated API, database or unit tests. **None is browser-verified.**

| Capability | Evidence |
|---|---|
| Evidence ladder: forward-only, Verified blocked (D-102), the AI never decides | Domain unit tests, DB invariants, e2e |
| Structured evaluation with rubric, integrity checks, assessment record and verification decision (Verified never granted) | `slice1`, `assessment` e2e |
| Evidence ledger: items, withdrawal (API service moves assets to review), re-link, history kept | `withdrawal.e2e`, `evidence` e2e |
| Skill progress (journey dimension) separate from verification | e2e, domain tests |
| Readiness engine: no rule set active ⇒ "not configured yet", never a verdict | `readiness` e2e |
| AI-use disclosure questionnaire (versioned); disclosure is context, not a penalty; no AI detector | e2e |
| Human review queue: blind, named reviewer grants | `review` e2e |
| Career claims: drafts are proposals, grounded in recorded facts (G1+G2), user approval required, fail-closed presentation gate, atomic policy re-check | `claims*`, `regrounding` e2e |
| Recruiter report and share link: built from current state on every read, revocable, expiring, narrower than the private report | `slice1`, `claims-standing` e2e |
| Admin Track Builder: roles, four eyes, separation of duties on identity, versioned drafts, diff preview, audited activation | `track-admin`, `separation-of-duties` e2e |
| Governed configuration (9 tables) with legacy baselines; production refuses unvalidated rows | `configuration` e2e, DB proofs |
| Pack import with configurable constraints, equivalence-proven baseline, validation records | `career-data`, `pack-constraints` e2e |
| RLS: deny by default; owner-only rows; no self-granted roles; append-only history tables | `supabase/tests/rls.sql` (run as `authenticated` / `anon`) |
| Re-grounding deployment procedure: dry run, operator check, reconciliation | `regrounding.e2e` on a scratch database |

**Totals at `0a7b802`:** domain 237, agents 145, config 9, harness 30/30, e2e 190/190, DB proofs all passing, frozen-design and documentation checks passing.

## 2. Actual end-to-end gaps (the graduate journey)

Legend:
- **UI**: a page in `apps/app` calls the API for this step.
- **API**: the step exists only as an endpoint.
- **—**: missing.

| # | Step | API | Graduate UI | State | Gap |
|---|---|---|---|---|---|
| 1 | Target role | ✓ | `/goal` (bootstrap, target roles, confirm) | Partial | Lists every role in the database, including e2e/demo roles; no filter to the pilot track |
| 2 | Skills | ✓ | `/skills`, `/skills/[id]` | Partial | Shows classification and readiness "pending experts" honestly. Content is DEMO |
| 3 | Activities | ✓ (catalogue in DB) | **—** | **Missing** | There is no activity list or choice. The submission page is **hard-wired to the slice-1 demo activity `act_fe_003`** (seeded UUID) and one demo skill. The 3 activities of the imported pack (`act_fe_change_request` …) **cannot be submitted from the interface** |
| 4 | Submission | ✓ (signed uploads, sha256 on confirm, deliverable keys) | `/project` | **Partial — integrity blocker** | Fixed to two files (component + test). Deliverables are **checkboxes the user ticks** (`test.empty_state`, `test.loading_state`, `test.error_message`), and the page always sends `signal.tests_reference_component = true`. Those ticks **are** the rubric's rule checks |
| 5 | Evaluation | ✓ (synchronous, deterministic rules) | `/evaluation` | Partial | Works, but on the demo rubric **all four criteria are `rule` checks on user-declared facts**, and pass ⇒ proposes **Demonstrated**. No human or test-runner step. Rubric values are not SME-approved |
| 6 | Evidence | ✓ (list, withdraw, re-link) | `/project` lists items; **no withdraw or re-link UI** | Partial | Withdrawal and re-link are API-only (`/proposals` shows "withdrawn" chips) |
| 7 | Assessment | ✓ | `/evaluation` | Partial | Read-only display |
| 8 | Verification decision | ✓ (never Verified) | `/evaluation` (via assessment) | Partial | — |
| 9 | Progress | ✓ | `/evaluation` (`/me/skill-progress`) | Partial | No dedicated progress page |
| 10 | Readiness | ✓ (engine) | `/skills/[id]` | Partial (by design) | No rule set is active, so the page shows "not configured yet". **This is correct for a pilot: no unapproved verdicts** |
| 11 | Career claims | ✓ | `/proposals` (preview, grounding, approve, reject, history) | Partial | **In production mode no grounding vocabulary is active, so every draft is `needs_revision` and claims are unusable** until an SME approves the vocabulary. In non-production they run on the development-only DRAFT vocabulary |
| 12 | CV / LinkedIn draft | ✓ (wording drafts) | `/proposals` | Partial | No external publishing (correct). CV bullet only from Demonstrated (correct) |
| 13 | Report and share link | ✓ | `/report` (create and revoke link) | **Partial — user-facing blocker** | The share URL points at the **API** (`NEXT_PUBLIC_API_URL/public/reports/...`), which returns **raw JSON**. There is no recruiter-facing page |
| — | Sign-up and login | Supabase Auth | `/login` | Partial | **Open self-sign-up** (`auth.signUp`). No invite-only control, no consent or privacy notice, no account deletion or export |
| — | Human reviewer | ✓ | `/review`, `/review/[id]` | Partial | Grants are SQL-only |
| — | Track Admin / SME / PO | ✓ | `/admin/**` | Partial | Built in Phase 8; never browser-tested |

**Admin- or SME-dependent steps:**
- The track content itself (skills, role, tasks, activities, rubrics) is DEMO / draft.
- Rubric values (OPEN-043).
- Core/supporting classification.
- The grounding vocabulary.
- Every readiness rule.
- The pack-constraint baseline.

The full list is in `SME-REVIEW-IMPORT-CHECKLIST.md`.

## 3. Critical blockers

Real graduates may not use the product until each of these is resolved.

| ID | Blocker | Why it blocks |
|---|---|---|
| **CB-1** | **Self-assertable Demonstrated.** The demo activity's rubric passes on user-ticked booleans and the presence of two allowed-type files (any content). No human review or test runner sits in the path | A graduate could hold an "evidence-backed" CV bullet that nobody checked. This is the product's core promise failing |
| **CB-2** | **Pilot content is DEMO / NOT SME APPROVED.** In production mode the API refuses to start with published demo content. Running real users outside production mode would bypass the production gates the architecture relies on | There is either no content or no safety net |
| **CB-3** | **No live environment verified.** Live Supabase checks: 0 of 12 run (`LIVE-SUPABASE-VERIFICATION-REPORT.md`). No hosting, CI, Dockerfile or deployment configuration in the repository | Nothing has run outside a scratch container |
| **CB-4** | **No browser acceptance.** There are zero browser tests, and the journey has never been walked in a browser | The UI paths in §2 are unproven |
| **CB-5** | **Activity gap.** The UI can only submit the hard-wired demo activity; the pack's activities are unreachable | The pilot cannot exercise the curated track |
| **CB-6** | **Launch protections.** No rate limiting (including the public report route and uploads); CORS open to every origin (`cors: true`); open self-sign-up; no consent or privacy notice; no deletion or export procedure | Unacceptable for real personal data, even for a small cohort |
| **CB-7** | **Recruiter link shows raw JSON** | The share feature is not usable by its audience |

## 4. SME-dependent decisions (summary)

The full mapping is in `SME-REVIEW-IMPORT-CHECKLIST.md`. **None was approved by me.**

| Decision | Blocks real-graduate pilot? |
|---|---|
| Pilot activity content and **rubric values** (weights, thresholds, pass threshold) | **Yes**: a Demonstrated outcome must rest on validated criteria (with CB-1) |
| **Grounding vocabulary** (`grounding_lexicon`) | **Yes for career claims** in production; otherwise the claims step must be excluded from the pilot |
| Core/supporting classification, importance | No (shown as pending) |
| Mandatory skills, readiness thresholds | No (no readiness verdict in the pilot) |
| Evidence counts and strengths, per-skill evidence count | No (legacy baselines) |
| Verification thresholds, challenge triggers | No (Verified off, challenges off) |
| CV bullet at Practiced | No (stays at Demonstrated) |
| Pack structure constraints | No (import only) |

## 5. Security and operational readiness

### 5.1 Launch-blocking for a real-graduate pilot

| Area | Current state | Gap |
|---|---|---|
| Rate limiting | **None** in the API (no throttler). Only a per-user agent budget (`AGENT_BUDGET_CALLS_PER_DAY`, required in production) | Throttle at minimum `/public/reports/:id`, upload intent/confirm, submission, evaluate, share-link creation and login (the Supabase setting) |
| CORS | `NestFactory.create(AppModule, { cors: true })` allows any origin | Restrict to `NEXT_PUBLIC_APP_URL` |
| Sign-up | Open `signUp` from `/login` | Invite-only: disable public sign-up in Supabase and use an allow-list or invites |
| Role grants | `reviewer_grant` rows are inserted by SQL; there is no grant command or dual control (the DB forbids self-grants) | A grant procedure with a second-person check and a recorded reason; review grants weekly during the pilot |
| Consent and privacy | No consent flow in UI or API, although the design exists (`docs/model/16-data-retention-privacy.md`) | A privacy notice and consent capture before first submission (at least a versioned acknowledgement) |
| Deletion / retention | No account-deletion or export endpoint. The retention policy is documented but not implemented. 39 `on delete cascade` FKs exist | A written **manual deletion and export procedure** for the pilot (operator-run, audited) and a retention period agreed for pilot data |
| Evidence integrity | See CB-1. Upload content type is client-declared (closed list, size measured at confirm), with no content sniffing or malware scan. The storage policy lets the owner write and delete objects in their own folder (`naqla_objects_own … for all`) | Human review in the Demonstrated path; confirm whether evaluation re-verifies the stored checksum; restrict owner delete/overwrite after confirmation |

### 5.2 Must verify on the live project (not blocking design, blocking go)

| Area | Note |
|---|---|
| JWT verification | The API verifies HS256 with `SUPABASE_JWT_SECRET`. New Supabase projects default to asymmetric signing keys, so confirm compatibility or plan JWKS verification |
| Tenant and user isolation | Proven on a scratch database (`rls.sql`). It must be re-run against the hosted project with the real anon key (`npm run live:supabase`) |
| Storage buckets | Created by migration 0002 only "when running on Supabase". Verify they exist, are private, and that the prefix policy holds |
| Service-role key | API-only by design (never `NEXT_PUBLIC_`); confirm in hosting configuration |
| Backups | Supabase plan backup / PITR not yet chosen; restore never tested |

### 5.3 Improvements that can wait (post-pilot)

- Malware scanning of uploads.
- Account self-deletion and export in the UI.
- An admin UI for role grants.
- A **database-level append-only trigger on `audit_event`**. Today only `authenticated`/`anon` have update/delete revoked, so the API's own connection could still rewrite it, despite the comment saying otherwise. Several later history tables do have immutability triggers.
- Retention automation.
- Indexability review of share links (`share_link_not_indexable` exists).
- Structured logging and error tracking.

### 5.4 Already sound

- Withdrawal through the API moves dependent assets to review.
- **Direct owner withdrawal through RLS is now caught at read time** (Phase 9).
- Share links are hashed, expiring, revocable, and rebuilt from current state.
- The case-study anon path requires a presentable asset.
- Audit or history tables are append-only for clients, with immutability triggers on `config_change`, `asset_standing_event`, `grounding_public_state_log` and `pack_validation_run`.
- Agents run the **local deterministic provider only**. Any other `AGENT_PROVIDER` throws (OPEN-023). Providers see fact ids and kinds, not identity. The assessment context always excludes identity and profile.

### 5.5 Re-grounding deployment procedure: review (`docs/ops/GROUNDING-DEPLOYMENT-PROCEDURE.md`)

| Check | Finding |
|---|---|
| Dry run | ✓ It is a true dry run: the same code inside a transaction that is always rolled back; events, notifications and public state are unchanged (tested). **Note:** it takes `FOR UPDATE` locks on every active asset for its duration, so run it in a quiet window. Its `--json` output contains asset ids and reasons that may quote user wording, so treat it as personal data |
| Operator authorization | ✓ It refuses without an active `product_owner` grant (tested). **Limit:** the CLI connects with database credentials and the operator id is *asserted*, not authenticated, so anyone holding the database URL can name a product owner's id. The real control is who holds production database credentials. Use a restricted credential, and the two-person review in step 5 |
| Reconciliation | ✓ In-transaction. A failure rolls back everything (logic unit-tested; the full path e2e-tested) |
| Recovery | ✓ Documented for each failure mode. Re-running is idempotent. Nothing is restored in bulk |
| Unsupported assets | ✓ They move to `needs_review` with wording and approval intact, the owner is notified, and nothing is marked grounded without being grounded (tested) |
| No unauthorized operation on real data | ✓ **It has never been run on real data**; the runbook requires your written approval (step 0). It is only relevant once there are approved assets in a live database |

## 6. Minimal pilot scope (proposal)

### Stage A — internal technical testing (no real graduates)
- **Who:** 3–5 internal or synthetic accounts, plus one person per admin role (Track Admin, named SME, Product Owner).
- **Where:** a dedicated staging Supabase project and hosting (`NODE_ENV` not production). Demo content and development-only configuration are allowed **because no real person's data or career claim is involved**.
- **What:** every scenario in `BROWSER-ACCEPTANCE-SCENARIOS.md`, the live checks (`live:supabase`), RLS proofs against the hosted project, and the re-grounding runbook on synthetic data.
- **Exit:** all browser scenarios pass or have accepted deviations; live checks are 12/12; no launch-blocking security item is open.

### Stage B — invited real-graduate pilot (only after Stage A exits and every go criterion in §8 holds)
- **Cohort:** 5–10 invited graduates, invite-only sign-up, consent recorded.
- **Track:** Junior Frontend Developer only, in **production mode**, with SME-reviewed (promoted, non-demo) content for the activities in scope.
- **Included:**
  - activity submission and structured feedback;
  - evidence ledger;
  - **Practiced and Demonstrated only, where the rubric values are SME-approved and the Demonstrated path includes human review**;
  - skill progress;
  - the readiness page in its "not configured" state;
  - a private report.
- **Excluded or disabled:**
  - Verified;
  - readiness verdicts;
  - challenges;
  - H6;
  - external LinkedIn publishing (never);
  - real LLM;
  - public recruiter links, until a recruiter-facing page exists (or they are shared only with consenting internal reviewers);
  - **career-claim drafts unless the grounding vocabulary is SME-approved and activated**. Otherwise hide `/proposals` for the pilot cohort.
- **Monitoring:** `claims-standing`, `pack_validation_run`, review-queue latency, a weekly grants review.
- **Feedback:** session notes plus a short structured survey after each submission.

## 7. Prioritised actionable backlog (not implemented)

| P | Item | Depends on | Owner |
|---|---|---|---|
| **P0-1** | **Close CB-1.** Route Demonstrated for the pilot activity through human review of the deliverables (the review queue exists), **or** cap the pilot at Practiced. Remove the hard-coded `signal.tests_reference_component = true` from the UI | Product decision | PO → dev |
| **P0-2** | **Staging environment.** A Supabase project, hosting for API and app, secrets in the platform store, migrations 0001–0022, storage buckets. Then `live:supabase` and the RLS proofs against it | PO approval and accounts | Ops |
| **P0-3** | **Launch protections.** Rate limiting, CORS allow-list, invite-only sign-up, consent acknowledgement, a written manual deletion and export procedure | — | Dev / PO |
| **P0-4** | **Activity selection.** Submit any published activity of the target track, with deliverable keys from `activity_deliverable` (H7 in the plan inventory) | P0-1 | Dev |
| **P0-5** | **Browser acceptance** run (all four roles) on staging | P0-2 | QA / PO |
| **P0-6** | **SME engagement.** Review and promotion of the pilot activities and rubrics, approval of rubric values, a decision on the grounding vocabulary | An SME named | PO / SME |
| P1-1 | A recruiter-facing report page (replacing raw JSON) | P0-5 | Dev |
| P1-2 | Withdraw and re-link UI for evidence | — | Dev |
| P1-3 | Filter `/goal` to published pilot roles only | P0-6 | Dev |
| P1-4 | JWT verification compatible with the project's signing keys (JWKS) if needed | P0-2 finding | Dev |
| P1-5 | A grant procedure with dual control (CLI command + second approver) | — | Dev / Ops |
| P1-6 | Restrict owner overwrite/delete of confirmed upload objects; re-verify the checksum at evaluation | — | Dev |
| P1-7 | Append-only trigger on `audit_event` | — | Dev |
| P1-8 | Backups / PITR plan and one restore drill | P0-2 | Ops |
| P2-1 | G3 grounding corpus and RISK-GROUNDING-02 action-grounding design (§7 below) | — | Dev / SME |
| P2-2 | Malware scanning, retention automation, self-service deletion and export, structured logging | — | Dev |

### Grounding and AI: smallest safe path (RISK-GROUNDING-01 and -02 stay open)

1. **G3 corpus, offline, no LLM.** 150–300 wording/fact pairs built from the shipped pack and synthetic submissions only: supported, partially supported, and unsupported (including the action-verb cases), in Arabic and English. Labelled by two people, at least one of them the SME. Run the existing engine and report false-accept and false-reject rates per assertion type. The PO and SME set target thresholds. No production data and no model.
2. **Action grounding, design first.** Split the `action` vocabulary into verbs a record type can support ("submitted" → submission; "wrote tests" → a test deliverable or criterion; "built" → an evaluated project), and verbs no record supports ("fixed", "optimised", "refactored", «أصلحتُ», «حسّنتُ»), which are refused unless a record type for them is added later. This is a vocabulary-class change plus a fact check, with tests that flip the pinned RISK-GROUNDING-02 cases. Propose before implementing.
3. **Privacy gate before any real LLM.**
   - A DPA or contract with the provider.
   - Data residency.
   - No identity or profile data, ever.
   - Prompt and response logging policy.
   - A per-user budget.
   - An LLM output still passes through the same grounding gate, and the corpus false-accept rate stays under the agreed threshold.

## 8. Explicit go / no-go criteria

### Stage A (internal technical testing)

**GO when all hold:**
1. A staging environment exists, approved by the PO.
2. Migrations 0001–0022 are applied cleanly.
3. Secrets are only in the platform store.
4. `live:supabase` passes 12 of 12.
5. `rls.sql` passes against the hosted project.
6. Synthetic accounts only.

### Stage B (real graduates)

**GO only when ALL hold:**
1. Stage A has exited: all browser scenarios pass, or each deviation is accepted in writing.
2. **CB-1 is closed.** No Demonstrated without human-reviewed or machine-verified evidence, and a negative test proves self-ticked facts cannot reach Demonstrated.
3. Pilot activity content is SME-reviewed and published as non-demo, and its rubric values are approved by a named SME (OPEN-043). **Production mode**, with the demo guard active.
4. **No readiness verdicts.** Verified, challenges and H6 are off, confirmed by checking the configuration in effect.
5. Career claims are either disabled for the cohort, **or** the grounding vocabulary is SME-approved and activated by a different product owner.
6. Rate limiting, the CORS allow-list and invite-only sign-up are live. Consent is captured. The deletion and export procedure is written and rehearsed once.
7. Grants are reviewed by two people. Backups are enabled and one restore drill is done.
8. The re-grounding runbook has been rehearsed on staging. Any run on production data has your written approval.
9. An incident contact and a pause procedure (disable sign-ups, revoke share links) are documented.

**NO-GO, or pause immediately, if any of these happen:**
- any cross-user data exposure;
- a Demonstrated or claim that is not traceable to reviewed evidence;
- an unapproved configuration found in production;
- a live check regression;
- any request to connect a real LLM before §7.3 is satisfied.

---

## Recommended first three actions (ranked by risk and dependency)

1. **Decide and close CB-1 (self-assertable Demonstrated).**
   - **Your decision:** either the pilot's Demonstrated goes through human review of the submitted files (the review queue and blind reviewer UI already exist), or the pilot is capped at Practiced.
   - **Then:** a small change removing the client-asserted signal, plus a negative test.
   - **Why first:** highest risk (it falsifies the product's core promise), and it shapes the scope of everything else. It needs no infrastructure.
2. **Approve and provision a staging environment, then run the live verification.**
   - Covers P0-2, P0-3 and the Stage A criteria.
   - **Why second:** CB-3, CB-4 and CB-6 cannot be closed without a real environment, and it is the critical path for the browser acceptance tests.
3. **Name the SME and start content review of the pilot activity and rubric values,** using `SME-REVIEW-IMPORT-CHECKLIST.md`.
   - **Why third:** it is the longest external dependency (CB-2), and it can run in parallel with action 2 once action 1 has fixed the pilot scope.

**Stopped. Waiting for Product Owner approval.** No backlog item has been implemented, no infrastructure touched, no real data accessed.
