# نَقْلة / NAQLA — Graduate Activity UI Implementation and Acceptance Report

**Date:** 2026-10-09 · **Decision:** D-120 · **Phase:** graduate activity journey, Phase 2 (graduate UI U1–U6).

**Scope:** frontend only.
- **No backend, database, policy or content change:** no new endpoint, migration, rule, LLM, starter material or notification. The Admin Track Builder and the frozen design (`apps/web`) are untouched.
- The Phase 1 access controls (D-119) and the D-118 verification safeguards are unchanged and re-proven.

**Evidence:**
- screenshots and machine-readable results in `docs/pilot/ui-acceptance/` (`results.json`: 57/57);
- the harness: `apps/app/test/browser/journey.browser.mjs`.

---

## 1. Implemented screens (U1–U6)

| # | Route | What the graduate gets |
|---|---|---|
| **U1** | `/activities` | The current role's catalogue, exactly as `GET /me/activities` returns it. Each card shows: title; objective; time; level; AI-use rule; skills (main / supporting); an honest assessment chip («يُراجَع بشريًا» / «للتعلّم — لا يرفع المستوى حاليًا» / «تجريبي — غير مراجَع»); the graduate's own work status and attempts; and actions «عرض النشاط» and «تابعي عملك». Empty states: no goal (links to goal selection), role no longer offered, no published activities |
| **U2** | `/activities/[id]` | The learner-safe detail: work context and the task; the skills developed; deliverables (file or text, required or optional); inputs (a planted-issue input shows «مادة تُقدَّم مع النشاط», never its description); a plain statement that starter materials do not exist yet; «كيف يُقيَّم عملك» with the derived mode; the sentence that **submitting is not earning a level**; the graduate's own projects on it. **Start** appears only when the API says the activity is `available`, and the API authorizes the start again. Anything outside the catalogue shows «هذا النشاط غير متاح» with no start |
| **U3** | `/work/[projectId]` | The workspace, **generated from the activity's declared deliverables**: one upload slot per file deliverable and one text field per text deliverable, with a required-deliverables count. Also: instructions; a choice of which of the activity's skills the work shows (it says this raises nothing); the AI-use questionnaire (the existing renderer, moved unchanged); a pre-submission review listing each file against its deliverable, plus what is still missing; and all attempts with a link to each one's feedback. **No checkbox claims a technical fact.** It says plainly that **nothing is saved before submission**, and warns before leaving with unsent work. Read-only when the activity is no longer offered. A personal project gets a plain message |
| **U4** | `/evaluation?submission=…` | **Reads first** (`GET /submissions/:id/evaluation`); opening or refreshing never starts a run. States: not evaluated (explicit «ابدئي التقييم» button) · evaluation pending (refresh button only) · failed (explicit retry) · **human review pending** (lists, in Arabic, what awaits the reviewer; no invented time) · **needs more evidence** (user-facing check messages, link to a new attempt) · **pending validation** (D-118 wording) · **completed with a recorded level change** (from → to, then the CV-bullet proposal) · **completed, feedback only** («لم يتغيّر مستوى المهارة»). Per-criterion feedback shows the rationale text and a result chip, with no internal keys. The skill journey, challenges and companion sections are kept. Technical decision details sit in a closed «تفاصيل» panel |
| **U5** | navigation | A journey nav (هدفي المهني · أنشطة دوري · أعمالي · مهارات المسار) on the goal, skills, catalogue and work screens. Breadcrumbs as on the frozen mission screen. Goal confirmation goes to `/activities`. Related activities on `/skills/[id]` are now links. The skills page links to activities and My Work. **`/project` (the hard-coded demo page) now redirects to `/activities`**: the URL still works and the demo dependency is gone from normal navigation |
| **U6** | `/work` | My Work: every project with its activity, skills, status, attempts, a sentence on the latest feedback, the workspace link and the next action. A summary line separates *work*, *assessed work* and *work that recorded a skill-level change*, and a note states that **completed work is not a skill level**. Empty state links to the catalogue |

**Supporting code:**
- **`apps/app/src/lib/journey.ts`:** presentation rules only. It covers:
  - copy for the assessment mode and work status;
  - the next action;
  - the evaluation-page state;
  - `levelChangeToShow`: a level is shown only with `workStatus === 'level_recorded'` **and** a transition from the decision; never Verified;
  - `buildFileMapping` / `buildTextArtifacts`: explicit keys only;
  - attempts from the ledger;
  - Arabic wording for the API's named refusals.
- **Components:** `JourneyNav` and `Crumbs`; `DisclosureField` (moved from the old page, unchanged).
- **`api.ts`:** `ApiError` carries the HTTP status, so "not found" is told apart from failures.

**Design system:**
- Only the frozen classes and tokens are used (`card`, `chip--*`, `banner--*`, `next-action`, `rows`, `field`, `link`, `btn--*`). No CSS file, token or colour changed.
- The workspace follows the frozen mission screen (N3): breadcrumbs, context card, deliverables card, one dark next-action block.
- Catalogue and detail chips follow the skills screen (N4).

## 2. Reused backend endpoints (no backend change)

| Screen | Endpoints |
|---|---|
| U1 | `POST /me/bootstrap`, `GET /me/activities` |
| U2 | `GET /me/activities/:id`, `POST /projects` (start) |
| U3 | `GET /projects/:id`, `GET /projects`, `GET /me/activities/:id`, `GET /me/evidence?projectId=` (attempts), `GET /disclosure-questionnaire`, `POST /uploads` → signed PUT → `POST /uploads/:id/confirm`, `POST /projects/:id/submissions` with **`files: [{uploadId, deliverableKey}]`**, `POST /submissions/:id/evaluate` (the same explicit click) |
| U4 | `GET /submissions/:id/evaluation`, `GET /submissions/:id`, `POST /submissions/:id/evaluate` (explicit button only), `GET /submissions/:id/assessment`, `GET /me/skill-progress`, `GET /me/challenges` |
| U5 | `GET /target-roles`, `PUT /me/career-goal`, `GET /me/track-skills[/:id]` |
| U6 | `GET /projects`, `GET /me/activities`, `GET /me/activities/:id` (history only) |

## 3. User journey before and after

| Step | Before Phase 2 | After |
|---|---|---|
| Goal → next | «التالي» went to `/project` (one demo activity) | Goes to `/activities`, the role's catalogue |
| Find an activity | Not possible; skill pages listed activities as plain text | A catalogue with honest chips; skill pages link to activities |
| Understand it | The `/project` page hard-coded a demo brief | Detail from data: context, task, skills, deliverables, inputs (private ones withheld), how it is assessed, and submitting ≠ level |
| Do the work | Two fixed file pickers, three "I did it" ticks, one note | Slots and fields generated from declared deliverables, explicit mapping, no ticks; missing items named; nothing simulated as saved |
| Submit | Demo only | Any catalogue activity; one explicit click submits and asks for evaluation; double clicks create nothing |
| Feedback | The page **POSTed evaluate on every load** and showed an error on revisit | Reads first; every state explained; refresh starts nothing; a level appears only when the backend recorded one |
| Progress | `/project` listed projects with a raw status | `/work`: status, attempts, latest feedback, next action; completed work separated from a skill level |

## 4. Browser-tested versus build-only

**Browser-tested (57 checks, 3 consecutive passing runs; the last after the final code change).** The setup:
- real Chromium (headless);
- the real Next.js production build;
- the real NestJS `AppModule` and PostgreSQL with all migrations, under the D-118 safety baseline.

The harness differs from production in two places:
- **Auth:** a session signed with the API's test secret is placed where supabase-js stores it. The API verifies it as in production; Supabase itself is not contacted.
- **Storage:** the in-memory test double is served over HTTP so the browser can PUT to its signed URLs. This is test-only and never product code.

Proven in the browser:

| Area | Checks |
|---|---|
| Empty states | No goal (catalogue explains, links to goal); empty My Work |
| Catalogue and detail | Goal → catalogue; demo labelled; card count equals what the API authorizes; **no private wording** (planted, weight, threshold, rubric) in the catalogue or detail; detail sections and the submitting-≠-level sentence |
| Start and workspace | Start creates a project and opens the workspace; no tick-boxes for technical facts; nothing-saved notice; submit disabled until mandatory deliverables exist |
| **Deliverable mapping** | Files uploaded **in reverse order** are stored against the deliverables of their slots (checked in the database); a **double click created one submission**; only file and declared text deliverable keys reached the database (no tick, signal or file marker) |
| **Refresh** | Three refreshes after evaluation started no run; a not-yet-evaluated submission opened and refreshed started nothing; the explicit button, double-clicked, started **exactly one** run |
| Multiple attempts | The workspace lists both attempts with feedback links; My Work shows the attempt count and next action |
| **Pending human review** | Reads as pending, names what awaits review, shows no error; refresh starts nothing; no level |
| **Level accuracy** | Demo: no level shown and none in the database. Human-reviewed, SME-approved, non-demo activity: after a named reviewer decided every criterion, and only then, the page shows «فجوة ← مُثبتة بدليل», matching `skill_claim = demonstrated`. Verified is never shown or granted. My Work marks only that work as a level change |
| Unauthorized navigation | Draft, other-role and unknown activity ids show «غير متاح» with no start; another graduate's workspace and evaluation are unavailable, and opening them started nothing; `/project` redirects |
| Upload errors | An oversize file is refused in Arabic inside its slot; submit stays blocked; nothing is submitted |
| RTL / responsive / a11y | Seven screens at 375 px and 1280 px (14 checks); keyboard reach (1 check) — see §6 |

**Not browser-tested** (built, type-checked and unit-tested where pure):
- real Supabase sign-in and token refresh;
- real Supabase Storage signed URLs;
- the `evaluation_pending` and `evaluation_failed` states (no committed "running" or "failed" evaluation can be produced through the API today; their logic is unit-tested);
- the `role_unavailable` catalogue state in the browser (proven at API level in Phase 1);
- the personal-project workspace message;
- the challenge-response section (no challenges are issued in this phase);
- the CV-bullet proposal page after a level (an existing page, unchanged);
- Safari and Firefox;
- slow or offline networks;
- a screen reader.

## 5. Automated test results

| Suite | Before | After |
|---|---|---|
| Domain unit | 266 | 266 |
| Config | 9 | 9 |
| Agents | 145 | 145 |
| **App presentation rules** (`apps/app/test/journey.test.ts`, new, part of `npm test`) | — | **16 / 16** |
| Agent harness | 30/30 | 30/30 |
| API e2e | 228 | **228 / 228** (unchanged backend) |
| DB proofs | pass | pass |
| **Browser acceptance** (`journey.browser.mjs`, new) | — | **57 / 57** (3 consecutive runs, fresh database each time) |
| `npm run verify` (boundaries, frozen prototype, tokens, docs) | pass | pass |
| `next build` | pass | pass (new routes: `/activities`, `/activities/[id]`, `/work`, `/work/[projectId]`) |

**Tooling added:**
- `playwright-core@1.56.1` as a dev dependency of `@naqla/app`. It drives the pre-installed Chromium; no browser download.
- `allowImportingTsExtensions` in the app tsconfig, so the unit tests run with Node's built-in type stripping. No new test framework.

## 6. Accessibility and RTL findings

**Checked automatically on seven screens** (catalogue, detail, workspace, evaluation, My Work, goal, skills) at **375 px and 1280 px**:
- `dir="rtl"` and `lang="ar"`;
- every input, textarea and select has a label;
- every link and button has a name;
- one `h1`;
- **no horizontal scroll at 375 px**.

**Keyboard:** every workspace deliverable control is reachable with Tab in reading order.

**Semantics added:**
- landmarks and labelled sections (`aria-labelledby`);
- `aria-current` on the journey nav and breadcrumbs;
- `aria-live` on upload state and the deliverables count;
- `role="alert"` on refusals and `role="status"` on pending states.

English file names and numbers stay in isolated LTR runs (`.term`, `.num`).

**Found and fixed:**
- The skills group's `<legend>` sat on the card border. It is now a labelled group with a heading.
- A button-styled link was underlined.

**Open:**
- The native file picker's button text ("Choose File") comes from the browser's own language. On an Arabic-language browser it is Arabic; a custom Arabic picker would need a design decision.
- There is no automated contrast or axe audit; the tokens are the frozen, previously reviewed ones.
- There has been no screen-reader pass.
- Link focus relies on the browser's default ring; the frozen CSS defines focus only for inputs.

## 7. Remaining functional gaps

1. **No saved drafts.** The backend has no draft API, so nothing is kept before submission; the UI says so.
   - Uploads are stored server-side on upload, but there is no endpoint to list them for a project.
   - **Proposed smallest extension, for approval:** `GET/PUT /projects/:id/draft`, owner-only. It would store `{ texts: {deliverableKey: text}, files: {deliverableKey: uploadId} }` in one RLS-protected table, re-validated against the declared deliverables. It would not be evaluated or linked to evidence before submission.
2. **A new attempt on a project whose activity is no longer offered.** The UI makes that workspace read-only, but the **API still accepts** such a submission; Phase 1 checked only project creation.
   - **Proposed smallest extension, for approval:** one condition in `SubmissionService`, so a platform-activity submission requires `graduate_activity_in_catalogue(activity, current goal role)`.
3. **The demo activity always reads "needs more evidence".**
   - Its rubric (`act_fe_003`) scores **declared ticks** (`test.*`), which the new workspace deliberately no longer collects (D-118: a declaration is not evidence).
   - The demo therefore always returns formative "not yet" feedback and never a level, as before.
   - **Owner decision:** keep the demo as is, or retire or replace its rubric through the content review flow.
4. Starter materials (Phase 3), and learner-safe wording for withheld inputs (SME), are still missing; the UI states this rather than inventing them.
5. **No notifications** (Phase 4). A graduate learns a human review has finished only by reopening the evaluation or My Work.
6. Graduates cannot download their own submitted files from the workspace; only names and sizes are shown. Not built.
7. The six-step progress bar (`Steps`) is the slice's existing component, reused as is.

## 8. Security and verification safeguards

**No new endpoint, no backend change, no new mutation path.** Every action goes through endpoints the backend authorizes:
- the start (`POST /projects`, catalogue-checked);
- uploads (owner, signed, measured);
- submission (explicit mapping, named refusals, skills limited to the activity);
- evaluation (owner-only, idempotent, locked).

**The UI never sends:** a client signal, a `verified.*` / `followup.*` / `file.*` / `link.*` artifact, or a "done" tick. This is proven in the database (B3d). Files are always explicitly mapped, never positional (B3b).

**Refresh and double clicks** create no evaluation or submission (B3c, B4b, B5a–b, B7c).

**A level** is shown only from the backend's recorded decision (B4c/e, B7d–f; unit tests). The demo and pending-validation results never show one, and Verified never appears.

**Phase 1 access rules** are re-proven from the UI:
- unauthorized activities, workspaces and evaluations are unavailable (B8);
- the catalogue equals the authorized list (B2d);
- no assessment-private wording on any screen (B2c, B2f).

**Unchanged:** D-118 (safety baseline, no level on submission or declaration, no forged signals, Verified blocked, no automatic pathway), D-119.

## 9. Readiness for staging browser acceptance

**Ready to run on staging once staging exists:**
- the screens, flows and wording are complete;
- the J-1…J-15 scenarios (and G-7) map onto the B-checks below;
- the local harness runs every flow end-to-end against the real API and database.

| Staging scenario | Local coverage |
|---|---|
| J-1 goal, roles | B2a (+ Phase 1 API tests for role filtering) |
| J-2 skill → activity link | built; link markup verified by build only |
| J-3 catalogue | B2b–d |
| J-4 detail | B2e–f |
| J-5 workspace | B2h–j, B3a |
| J-6 leave and return | **gap 1: no drafts** (stated in the UI) |
| J-7 missing mandatory | B2j, B9b |
| J-8 human-reviewed submit | B7b |
| J-9 reviewer finalises → reopen | B7e–g |
| J-10 / G-7 demo, all deliverables | B4c, B4e |
| J-11 revisit | B4b, B5a, B7c |
| J-12 My Work | B6b–c, B7g |
| J-13 crafted mapping | Phase 1 API tests; the UI cannot express one (B3b, B3d) |
| J-14 production mode | Phase 1 API tests (demo hidden) |
| J-15 accessibility / RTL | B10 (automated basics); a manual screen-reader and mobile-device pass remains |

**What staging needs** (none of it done here, and all of it requires your approval):
- a staging deployment with real Supabase Auth and Storage;
- the demo-visibility flag decided for staging;
- reviewer grants for the human-review scenario;
- SME-approved, non-demo content, so that a level can be earned at all.

The harness's two test-only substitutions (session injection and HTTP storage double) must be replaced on staging by real sign-in and real signed URLs.

**Stopped after Phase 2.** Phase 3 has not started, nothing is deployed, and no graduate is invited. Approval is requested for the two smallest backend extensions in §7 (draft API, submission catalogue check), and for an owner decision on the demo rubric (§7.3).
