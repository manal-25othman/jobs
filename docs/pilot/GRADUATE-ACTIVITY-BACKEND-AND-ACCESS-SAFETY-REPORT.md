# نَقْلة / NAQLA — Graduate Activity Backend and Access Safety Report

**Date:** 2026-10-09 · **Decision:** D-119 · **Phase:** graduate activity journey, Phase 1 (backend and API only).

**Scope:** this phase implements the audit's A1–A5, the access-rule corrections, and protection of assessment-private data.
- No graduate UI was built. One existing page changed one request field (§3).
- No starter content, notifications, deployment, real data, LLM or new SME-dependent value was added.
- D-118 is untouched: the safety baseline still decides every level.

**Basis:** `docs/pilot/GRADUATE-ACTIVITY-JOURNEY-AUDIT-AND-PROPOSAL.md`.

---

## 1. Implemented endpoints and security controls

### Endpoints

| Endpoint | What it does | Control |
|---|---|---|
| **A1** `GET /v1/me/activities` | Lists the activities of the graduate's current-role catalogue. Each item has: title, objective, level, time, AI-use mode, visible skills, deliverable counts, a derived `assessment {mode, evaluable, canSupportLevel, reasons}`, and `myLatest` work status | Filtered in the database by `graduate_activity_in_catalogue(activity, role)`. No goal gives `unavailableReason: no_career_goal`; a hidden role gives `role_unavailable` |
| **A2** `GET /v1/me/activities/:id` | Detail: brief, context, deliverables (`file` / `text`), inputs, skills, assessment, `available`, `materialsAvailable: false`, `myProjects` | **404** unless the activity is in the current catalogue, or the graduate already has a project on it (own history: readable, `available: false`, cannot be restarted). Draft, other-role, unknown and malformed ids all give the same 404 |
| **A3** `POST /v1/projects/:id/submissions` gains `files: [{uploadId, deliverableKey}]` | Binds each confirmed upload to a deliverable the **activity** declares | Required for any activity that declares a file deliverable. Refusal reasons are listed in §3 |
| **A4** `GET /v1/target-roles` | Only roles a graduate may choose. A DEMO role is listed only where demo content is visible, labelled `DEMO — not reviewed` | `graduate_role_listed(role)`: the role is visible and has consumable content |
| **A4** `PUT /v1/me/career-goal` | A goal can only name a visible role | Anything else gives 404 (no existence leak) |
| **A4** `POST /v1/projects` | Work starts only on an activity in the current-role catalogue | Previously any published spec was accepted. Now 404 |
| **A4** submission skills | A claimed skill must be visible, and on a platform activity it must be **one of the activity's skills** | `[skill_not_mapped_to_activity]` or `unknown skill`. See §8.1: this closes a real integrity gap |
| **A4** `GET /v1/me/track-skills[/:id]` | Track skills list only visible requirements on visible skills. Related activities come from the catalogue rule | Same database functions |
| **A5** `GET /v1/projects` | Adds: `activity {id, slug, titleAr, titleEn}`, `attempts`, `latestSubmission {id, evaluationState, outcome, decision, levelChanged}`, `workStatus` | Read under the graduate's own RLS. The pre-Phase-1 snake_case fields are unchanged |
| **Revisit** `GET /v1/submissions/:id/evaluation` | Read-only, valid in **every** state. It never creates or reruns anything | See §4 |
| **Revisit** `POST /v1/submissions/:id/evaluate` | The explicit, owner-only action. It is idempotent | The submission row is locked, so concurrent requests cannot create two runs |
| Admin `GET /v1/admin/content` | Now includes each activity's `inputs`, with `containsPlantedIssue` and `isPlatformPrivate` | Existing admin role model (`track_admin` / `sme` / `product_owner`). A graduate gets 403 |

### Security controls (migration `0024_graduate_content_access.sql`)

1. **One visibility rule, used by both RLS and the API** (`security definer`, stable):
   - `graduate_content_visible(review_status, is_demo)`: non-demo content only when `published`. DEMO content only where the deployment allows it, and never when `superseded` or `rejected`.
   - `graduate_activity_visible`: an activity is visible only when published, and a demo one only where demo content is visible.
   - `graduate_role_visible`, `graduate_activity_in_catalogue` and `graduate_role_listed` build on the two above.
   - A domain mirror (`contentVisibleToGraduate`, `activityVisibleToGraduate`) is unit-tested over every review state.
2. **Deployment flag `platform_deployment.demo_content_visible`:**
   - It is a singleton row and is **off by default**, so the database fails closed.
   - Only the demo seed (`supabase/seed/0001_demo_role.sql`) or an audited operator act turns it on. Each change needs `naqla.config_actor` and `naqla.config_reason` and writes a `config_change` row. The row cannot be deleted.
   - **The API refuses to start in production while it is on**, in the same guard as published demo content.
3. **Row policies** on `target_role`, `skill`, `role_requirement`, `learning_resource`, `activity_spec`, `activity_deliverable`, `activity_skill` and `activity_task`:
   - They apply to `authenticated` only, and use the rule above.
   - Requirements are visible only when they, their role and their skill are visible, and the requirement is `enabled`.
   - **Own-history exception:** a user still reads the role of their own goal, the skills of their own claims, progress, submissions and evidence, and the activities of their own projects.
4. **anon** loses SELECT on all of these tables. Unused client write grants on content tables are revoked; no write policy ever existed.
5. **Assessment-private data, served by the database only to the service role:**
   - `activity_input` is **service-only**: no client policy, SELECT revoked.
   - `activity_spec` is granted to clients **by column**. Learner columns only: no `spec` document, no reviewer identities, no validation or authoring metadata.
   - `role_requirement` is granted by column. Not granted: `weight`, demand data, `minimum_evidence_count`, `human_review_required`, `can_be_partially_auto_evaluated`, `readiness_contribution`, reviewer identity.
   - Rubric criteria and integrity-check specifications were already unreadable and still are.
6. **The API's learner projection** of activity inputs:
   - It returns the key always.
   - It returns the description **only for inputs without a planted issue**. Planted inputs return `descriptionWithheld: true`.
   - The planted flag itself never leaves the service.
7. **Assessment mode is derived, never chosen** (`activityAssessmentMode`, domain):
   - It calls the D-118 `assessmentBasis` rule with "every human criterion decided". So `human_reviewed` exists exactly when a reviewed run *could* support a level: SME-approved values, non-demo content, every skill criterion human.
   - Everything else is `formative_only`, with reasons.
   - `automated_verified` is reserved: `AUTOMATED_VERIFICATION_ENABLED = false`, and it is never returned, even for a rubric over `verified.*` facts only.
   - The mode is informational. A development-only legacy policy in effect is flagged (`policy.developmentLegacyPolicy`).
8. `canonical_skill_id()` became `security definer`. It returns only an id, and an alias must resolve to the same skill whatever the caller may read.

## 2. Before/after authorization behaviour

| Who / path | Before | After |
|---|---|---|
| anon, direct DB: `target_role`, `skill`, `role_requirement`, `learning_resource` | Every row, drafts and test rows included | **Permission denied** |
| anon, direct DB: `activity_spec`, `activity_input`, `activity_deliverable`, `activity_skill`, `activity_task` | Published rows, including `contains_planted_issue` and "four planted defects" | **Permission denied** |
| graduate, direct DB: draft / test role, skill or mapping, even by id | Readable | **0 rows** |
| graduate, direct DB: DEMO content where demo is hidden (production) | Readable | 0 rows, except the graduate's own history |
| graduate, direct DB: `activity_input` (any column) | Readable for published activities | **Permission denied** |
| graduate, direct DB: `activity_spec.spec`, `reviewed_by`, `sme_approved_by`; `role_requirement.weight`, `minimum_evidence_count` … | Readable | **Permission denied** (column grants) |
| graduate, direct DB: published, non-demo content and learner columns | Readable | Readable (unchanged) |
| `GET /target-roles` | Every role (draft, demo, e2e test roles) | Visible roles with content; demo labelled; nothing demo where hidden |
| `PUT /me/career-goal` on a draft role | Accepted | 404 |
| `POST /projects` on another role's / a draft / a hidden-demo activity | Accepted if published; a draft gave 400 "must be published" (an existence leak) | 404 for all |
| `GET /me/activities/:id` on anything outside the catalogue | (endpoint did not exist) | 404 |
| Submission claiming a skill the activity does not cover | Accepted. A human-reviewed pass would have promoted **that** skill | 400 `[skill_not_mapped_to_activity]` |
| Track skills with an unreviewed requirement on a visible role | Listed | Hidden |
| Admin (`track_admin` / `sme` / `product_owner`) | No view of inputs | `GET /admin/content` shows inputs and their planted flags |
| Internal paths: evaluation, review queue, Track Builder, readiness computation, promotion | Service role | Service role (unchanged). Nothing was reopened to graduates to make them work |

## 3. Deliverable-mapping changes (A3)

- **Domain function `resolveDeliverableFileMapping(deliverables, files)`.**
  - It binds each `uploadId` to the `deliverableKey` the client names. The key must be a deliverable **the activity declares in the database**.
  - Upload order carries no meaning: proven by sending files in reverse order and getting the same binding, in `submission_artifact` and in the evidence ledger.
  - The audit event records `fileMapping: 'explicit'`.
- **Refusals.** Each is a 400 with a named reason, and **nothing is stored**: no submission, artifact or ledger row.

| Reason | When |
|---|---|
| `missing_mandatory_deliverable` | A mandatory **file** deliverable has no file. The error names it |
| `duplicate_deliverable` / `duplicate_upload` | The same key twice, or the same upload twice |
| `unexpected_deliverable` | A key the activity does not declare (including another activity's key) |
| `deliverable_format_mismatch` | A file mapped to a `text` deliverable, or a text artifact using a file deliverable's key |
| `malformed_file_mapping` | Not a list, or an entry without a string `uploadId` and `deliverableKey` |
| `deliverable_mapping_required` | Positional `uploadIds` sent for an activity that declares file deliverables |
| `ambiguous_file_mapping` | Both `files` and `uploadIds` sent |
| `no_file_deliverables` | `files` sent for work that declares no file deliverable |

- **Unchanged.** These still apply exactly as before, after the mapping:
  - upload ownership (another user's upload: **404**);
  - confirmation (stored object measured, sha256);
  - D-118 namespace refusal (`file.*` / `link.*` / `signal.*` / `verified.*` / `followup.*` from a client: **400**).
- **Compatibility.**
  - Positional `uploadIds` remains **only** for work with no declared file deliverable (a personal project), with the same legacy keys as before.
  - Stored submissions and their keys are never rewritten.
  - The existing `/project` page (frozen design) now sends `files` with the two keys it already hard-coded. That is a one-field request change, with no markup or style change.
- **Behaviour change by design.** A submission missing a mandatory **file** is now refused at the door, naming the file. Before, it was accepted and then stopped by the blocking `files_present` check (`blocked_by_checks`).
  - That check remains as defence in depth.
  - It still runs for stored historical submissions; this is proven.
  - Missing **text** deliverables are still judged at evaluation (formative feedback), as before.

## 4. Evaluation revisit behaviour

**`GET /submissions/:id/evaluation`** is a pure read in every state.

| State | Response |
|---|---|
| Not evaluated yet | `200`, `state: 'not_evaluated'`, `workStatus: 'submitted'`, `actions.evaluate: true`. Before: **404 "no evaluation"** |
| Under human review | `state: 'queued_for_human'`, `workStatus: 'under_human_review'`, `humanReview {pending, completed, awaiting[], pendingCriteria[], completedCriteria[]}`. No invented time, no "failed" |
| Completed | Same fields as a fresh evaluate response (`totalScore`, `maxScore`, `reason`, `criteria`, user-facing `integrityChecks` **with their messages**, `transition` from the decision that moved the level, `verification.decision`) plus `verificationDecision` (D-118). So a reopened result renders like a fresh one |

Other properties of the read:
- It never shows a level that no decision supports: `transition` is read from a `verification_decision` that changed the state, never inferred from the outcome.
- `pending_validation` reads as pending.
- The legacy fields (`verification` = legacy row, `criteria` rows, `humanReview.pending`) are kept for existing callers.
- *Fixed on the way:* user-facing integrity results were always empty on this read path, because `integrity_check` has no client policy. They are now read for the owner's own result, user-facing only.

**`POST /submissions/:id/evaluate`** is the explicit, authorized action.
- **Never evaluated:** it runs once (201) and adds `alreadyEvaluated: false` and `workStatus`.
- **Already evaluated, or awaiting human review:** it returns the current read view with `alreadyEvaluated: true` (200). It creates **no run, no result, no review item and no audit event, and no agent runs again** (all proven).
  - Before, this was a 400 error, which the current `/evaluation` page hit on every revisit.
- **Concurrent duplicates:** the submission row is locked (`for update`). Three simultaneous requests gave exactly one evaluation (one 201; the others 200 or 409).
- **Retry:** a submission is evaluated once. A correction is a new submission, as before.

**Work status** (`workStatus`, domain, from records only):
- `in_progress`, `submitted`, `evaluation_running`, `evaluation_failed`, `under_human_review`, `blocked_by_checks`, `pending_validation`, `level_recorded`, `feedback_ready`.
- `level_recorded` is the only status that reflects a level change, and it requires a decision that changed the state.

## 5. Full regression and negative-test results

| Suite | Before | After |
|---|---|---|
| Domain unit | 253 | **266** (+13: visibility over every review state; assessment mode, including equivalence with `assessmentBasis`; `automated_verified` never returned; mapping order independence and every refusal; work status) |
| Config | 9 | 9 |
| Agents | 145 | 145 |
| Agent harness | 30/30 | **30/30** |
| API e2e | 203 | **228 / 228** (+25 new in `graduate-activity.e2e.ts`) |
| DB proofs (`scripts/db-test.sh`) | pass | **pass** (+21 access-model proofs; 1 changed, §5) |
| `npm run verify` | pass | pass |
| `next build` | pass | pass |

**New e2e suite `apps/api/test/graduate-activity.e2e.ts` (25 tests).** It runs under the D-118 safety baseline.

- **Roles (A4)**
  - Listing excludes draft and test roles and empty shells, and labels demo roles.
  - A draft role id cannot be set as a goal.
  - An unreviewed mapping on a visible role is hidden from track skills.
  - A draft skill is unknown; an unmapped skill is refused.
- **Activities (A1/A2)**
  - No goal gives an empty catalogue with a reason.
  - Demo: formative only, labelled.
  - The SME-approved, non-demo copy is `human_reviewed`, with no reasons. Drafts are absent.
  - Detail withholds planted-input descriptions. There is no planted flag, rubric, weight, threshold, `spec` or reviewer identity in any response (pattern-checked).
  - Direct ids (draft, other role, unknown, malformed) give 404 on read and on project creation.
  - Own history stays readable but cannot be restarted.
  - **Production-like (demo hidden):** no demo role, goal, catalogue or project; the goal is kept as `roleAvailable: false`; projects stay listed; flag changes are audited; the production start guard trips while the flag is on.
- **Direct DB** (as `authenticated` via `set role`, and as `anon`)
  - Every private column and table is denied.
  - Draft rows are invisible by id.
  - Learner columns are readable.
  - A user cannot publish content.
  - anon is denied every content table.
  - Own-goal history works with demo hidden.
  - Admins see planted flags; a graduate gets 403.
- **A3**
  - Reverse-order mapping lands correctly (artifacts and ledger).
  - All 11 refusal cases store nothing.
  - Forged mappings are refused: another user's upload (404), an unconfirmed upload, a client `file.*` value.
  - A personal project keeps the legacy form.
- **A5 / revisit**
  - The full lifecycle `in_progress → submitted → pending_validation`.
  - Three reopenings and three repeated POSTs create 1 evaluation, 1 result, no new agent invocation and no new audit event.
  - D-118: no level.
  - A pending human review reads as pending, and a repeat gives no duplicate review items.
  - Concurrent POSTs give one run.
  - Another user gets 404 on read and on evaluate.
- **History**
  - A stored pre-Phase-1 submission missing a file still evaluates (`blocked_by_checks`, with its user-facing message).
  - Results, decisions, artifacts and goals written before the suite are **byte-for-byte unchanged** (hash).

**Existing tests changed, and why.** All changes follow behaviour approved in this phase; none weakens an assertion about D-118.

- **17 suites:** `uploadIds` became `files: filesFor([...])` (explicit keys, via a test helper).
- **`human-review`, `verification-integrity`, `career-data`:** they set the goal to the activity's role before starting work (A4). `career-data` then switches the goal to the role under test.
- **Refused at submission (A3), was `blocked_by_checks` at evaluation:**
  - `slice1` "a missing mandatory file …" and `human-review` "10 — …".
  - `assessment` "blocked by a gate", `integrity` "an unmet check …" and `verification-integrity` 6 now reproduce a stored **historical** submission without the file (test helper `asHistoricalWithoutFile`, test-only). The blocked path stays covered.
  - `verification-integrity` 4 and 6 upload both files, so they test declarations alone, as intended.
- **Repeat evaluate:** `slice1` "re-evaluating …", `human-review` "4, 5, 12" and `verification-integrity` 5 now expect 200 with `alreadyEvaluated`, and assert exactly one run (was 400).
- **`slice1` "a platform activity records its published spec version":** a project without a goal is now 404; the test sets the goal first.
- **`hardening` intruder test:** it maps a complete file set, so ownership (404) is what refuses it.
- **`separation-of-duties`:** its role fallback picked "any non-demo role", which became ambiguous once test roles exist. It now picks the pack role deterministically.
- **DB proof `rls.sql`:** "anon may read the skill catalogue" is now "anon reads no skill catalogue". This is the behaviour this phase closes.

## 6. Database migrations and historical compatibility

**`0024_graduate_content_access.sql`** is additive apart from policy and grant changes.
- It adds one table (`platform_deployment`).
- It adds six SQL functions.
- It replaces nine row policies with graduate policies.
- It revokes anon SELECT on nine content tables, and unused client writes on five.
- It makes `activity_input` service-only.
- It adds column grants on `activity_spec` and `role_requirement`.
- It changes `canonical_skill_id` to `security definer`.

**Seed:** `0001_demo_role.sql` sets `demo_content_visible = true`, audited. It is the demo content itself and is never loaded in production.

**Not a major schema or RLS refactor:**
- No table structure changed.
- No data was migrated.
- The service-role paths are untouched.
- Existing RLS on personal data (submissions, evidence, claims, decisions, uploads) is unchanged.

**Historical compatibility:**
- **Stored records are never rewritten.** Proven by hash over artifacts, results, decisions and goals.
- **Stored submissions keep evaluating**, including pre-Phase-1 ones missing a file (blocked, as before) and positional keys.
- **Goals set earlier on a role that is no longer visible** remain the user's own (`roleAvailable: false`). The role row stays readable to that user only.
- **API contract changes, all additive or intended:**
  - New fields on `GET /projects`, the evaluate response and the evaluation read.
  - `GET evaluation` before evaluation is 200 (was 404).
  - A repeat evaluate is 200 (was 400).
  - A missing mandatory file is 400 at submission (was accepted, then blocked).
  - Positional `uploadIds` is 400 for activities with file deliverables.
  - Project and goal creation outside the catalogue is 404.
  - An unmapped claimed skill is 400.
  - `GET /target-roles` rows add `isDemo` and `label`. The order is non-demo first, then by label.
- **D-118 is unchanged:**
  - The safety baseline decides.
  - Declarations and uploads earn nothing.
  - Client platform namespaces are refused.
  - Verified is blocked.
  - The legacy basis is never production.
  - The 17 D-118 tests pass.

## 7. Remaining browser and UI tasks (Phase 2, not started)

- **U1–U6** on the frozen design system:
  - `/activities` catalogue with honest chips;
  - `/activities/[id]`;
  - a deliverable-driven workspace `/work/[projectId]`, one upload slot per declared file deliverable sending `files`;
  - `/evaluation` reading `GET …/evaluation` first and evaluating only on an explicit "submit for assessment" step (today the page still POSTs on its first load — now harmless, because repeats are idempotent);
  - links from `/skills/[id]` to activities;
  - the `/project` redirect;
  - `/work` built from `GET /projects`.
- **Display rules:**
  - Show `isDemo` labels.
  - Show `descriptionWithheld` inputs as "provided with the activity materials".
  - Show `materialsAvailable: false` plainly.
  - Show a level only on `workStatus: 'level_recorded'`.
- **Browser scenarios** J-1…J-15 and **G-7** (D-118) on staging. None has been run.

## 8. Outstanding risks and blockers

1. **A finding closed by this phase (pre-existing):** on a platform activity, a graduate could claim **any** active skill. A human-reviewed pass would then have promoted the first claimed skill, even one the activity does not assess. Claims are now restricted to the activity's mapped skills. No real data exists, so no stored claim needs review.
2. **Learner-facing input wording is missing.**
   - Planted-input descriptions are withheld completely (`descriptionWithheld`).
   - Graduates see only the input key for those inputs until an SME writes learner-safe wording.
   - Starter materials (Phase 3) are still missing, so the pack activities cannot yet be done honestly.
3. **The demo flag is operational.**
   - Staging must decide whether demo content is visible, and set the flag through an audited act.
   - Production refuses to start with it on.
   - The flag lives in the database, so a production database restored from a demo dump would trip the start guard rather than leak.
4. **Assessment mode is static.** `human_reviewed` says a reviewed run *can* support a level. It does not say reviewers are granted or available; there is still no reviewer-availability signal or service level.
5. **Upload purpose is not checked at mapping.** A confirmed `cv_upload` owned by the same user could be mapped to a deliverable. This is pre-existing and low impact (same owner), but should be closed with a purpose check.
6. **Concurrent duplicate evaluate requests** may answer 409 (conflict) rather than 200. No second run is ever created.
7. **Own-history RLS exceptions** use per-row `exists` subqueries over the user's own tables. That is fine at pilot scale; it should be revisited with query plans before large volumes.
8. **Still open from the pilot report:**
   - staging environment and live verification;
   - browser acceptance (J-1…J-15, G-7);
   - SME review of content and rubric values, and reviewer grants with dual control;
   - launch protections (rate limiting, CORS, invite-only sign-up, consent, deletion procedure);
   - storage overwrite by owners (P1-6);
   - notifications.

**Stopped after this bounded phase. Awaiting approval before the graduate UI (Phase 2).** No deployment, no real users or data, no LLM, no new SME-dependent value.
