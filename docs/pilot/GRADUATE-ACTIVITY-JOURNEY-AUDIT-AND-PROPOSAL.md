# نَقْلة / NAQLA — Graduate Activity Journey: Audit and Implementation Proposal
**Date:** 2026-10-09 · **Status:** audit and proposal. **Phase 1 (backend and access safety) implemented — D-119, see `GRADUATE-ACTIVITY-BACKEND-AND-ACCESS-SAFETY-REPORT.md`.** **Phase 2 (graduate UI U1–U6) implemented — D-120, see `GRADUATE-ACTIVITY-UI-IMPLEMENTATION-AND-ACCEPTANCE-REPORT.md`.** Phases 3–4 not started.
**Basis:** code at `d3754e7`.
**Constraints honoured:** the D-118 guarantees are preserved, and no new promotion rule, assessment engine, LLM, SME threshold, deployment or redesign is proposed.

---

## 1. Current user journey (as implemented)

Legend:
- **UI**: a page calls the API.
- **API-only**: an endpoint exists, but no page uses it.
- **—**: missing.

| # | Step | API | UI | What actually happens today |
|---|---|---|---|---|
| 1 | Select a target role | `GET /target-roles`, `PUT /me/career-goal` | `/goal` | Lists **every** `target_role` row. RLS on `target_role`, `skill` and `role_requirement` is `using (true)`, so draft, demo and e2e test roles appear. "Next" links to `/project` (the demo submission) |
| 2 | View available skills | `GET /me/track-skills` | `/skills` | Works. Classification is shown as "pending expert validation" and readiness as "not configured" (correct) |
| 3 | Open a skill | `GET /me/track-skills/:id` | `/skills/[id]` | Shows materials, evidence, decisions, journey events and **the related published activities as plain text, with no links** |
| 4 | View relevant activities | — (only inside step 3's response) | — | **There is no activity catalogue endpoint or page** |
| 5 | Select an activity | `POST /projects {activitySpecId}` (requires `published`) | `/project` | **Hard-wired** to `DEMO_ACTIVITY = c0000000-…-0001` (`act_fe_003`) and `DEMO_SKILL = a0000000-…-0002`. There is no choice |
| 6 | Read instructions and deliverables | Fields exist in the DB (`objective_*`, `business_context_*`, `activity_deliverable`, `activity_input`, `ai_usage_mode`, `estimated_minutes`) | `/project` | **Not read from the DB.** The page hard-codes three deliverable checkboxes, two file pickers ("component", "test") and a coverage note |
| 7 | Start and save work | `POST /projects`; draft evidence items (`POST /me/evidence`, status `draft`) | `/project` | The project is created **only at submit time**. Nothing is saved before submitting; a reload loses typed text |
| 8 | Upload evidence | `POST /uploads` → signed PUT → `POST /uploads/:id/confirm` (sha256 measured) | `/project` (2 fixed files) | Works. The API maps uploads to deliverable keys **by position** (`assignFileArtifactKeys`) |
| 9 | Submit for assessment | `POST /projects/:id/submissions` | `/project` | Works for the demo activity. D-118 rejects platform-owned keys |
| 10 | Receive feedback | `POST /submissions/:id/evaluate`, `GET /submissions/:id/evaluation`, `GET /submissions/:id/assessment` | `/evaluation` | **The page POSTs `evaluate` on every load.** A revisit, or a return after human review finalises, fails with "already has a completed evaluation". `GET …/evaluation` is never used. Human-review results are therefore never visible in the UI |
| 11 | Progress and next steps | `GET /me/skill-progress`, `GET /me/companion`, `GET /me/proposals` | `/evaluation` (journey + companion nudge), `/skills`, `/proposals` | Partially. There is no "my work" list with attempt status; `/project` lists projects and ledger items only |

**Effect today (after D-118):**
- A graduate can submit only the demo activity, whose criteria are declarations, so **no level can ever result**.
- The three curated pack activities are unreachable.
- Human-reviewed feedback cannot be reopened.

## 2. Existing reusable components

| Layer | Reusable as-is |
|---|---|
| Content model | `activity_spec` (title, objective, business context, level, minutes, `ai_usage_mode`, `can_yield_demonstrated`, `target_role_id`, review status, `is_demo_fixture`), `activity_deliverable` (key, format `source file` / `text`, mandatory, description), `activity_input`, `activity_skill` (depth), `activity_task`, `rubric_version` / `rubric_criterion` (evaluator type, kind, `values_approved_at`) |
| Governance | Review workflow (published only), the production demo guard, SME rubric-value approval (OPEN-043), Track Builder |
| Work and evidence | `project`, `submission` (attempts), uploads (signed, owner-prefixed, sha256), `submission_artifact` with provenance (D-118), the evidence ledger (`evidence_item`, drafts, attempts), the disclosure questionnaire (versioned) |
| Assessment | `runDeterministicEvaluation`, the review queue (blind, granted reviewers, finalisation), `aggregateWithHumanDecisions`, structured assessment, verification policy with `assessmentBasis` (D-118), the evidence ladder, skill progress (journey) |
| Read APIs | `GET /me/track-skills[/:id]` (already returns related published activities), `GET /submissions/:id/evaluation`, `GET /submissions/:id/assessment`, `GET /me/skill-progress`, `GET /projects`, `GET /disclosure-questionnaire`, `GET /me/companion` |
| UI | Frozen classes and tokens; `Steps`, `Session`, `CompanionNudge`; `/evaluation` sections (criteria, integrity, journey, assessment, the D-118 pending state), the `/project` questionnaire renderer |

## 3. Hard-coded dependencies

| Where | What | Consequence |
|---|---|---|
| `apps/app/src/app/project/page.tsx` | `DEMO_ACTIVITY`, `DEMO_SKILL` (seed UUIDs) | Only `act_fe_003` can be submitted |
| same | `DELIVERABLES` array (3 test checkboxes + coverage note); two fixed file inputs; order component → test | The form ignores `activity_deliverable` |
| `apps/app/src/app/goal/page.tsx` | "Next" → `/project` | Bypasses skills and activities |
| `apps/app/src/app/evaluation/page.tsx` | `POST evaluate` on load | Feedback cannot be revisited |
| `apps/api/test/helpers.ts` `FIXTURE` | Demo ids (tests only) | Acceptable: tests only |
| `apps/api/src/evidence` `assignFileArtifactKeys` | Positional file → deliverable mapping, with a `LEGACY_FILE_KEYS` fallback | Fragile: the client must send files in deliverable order |
| RLS `target_role`, `skill`, `role_requirement` | `using (true)` | Draft, demo and test roles are listed to graduates |

## 4. Missing interfaces and integrations

1. **Activity catalogue API.** List the activities of the current target role, filtered server-side to approved content, with what each can and cannot do for the graduate's level.
2. **Activity detail API.** Brief, objective, context, public inputs, deliverables, AI-use mode, time estimate, the graduate's own attempts.
3. **Explicit file ↔ deliverable mapping** on submission (`files: [{ uploadId, deliverableKey }]`), keeping `uploadIds` for backward compatibility.
4. **Read-or-evaluate on the evaluation page.** GET if an evaluation exists; POST only for a submission not yet evaluated.
5. **"My work" view.** Projects with activity title, attempts and latest state (submitted / under human review / pending validation / evidence produced).
6. **Saving work in progress.** Nothing is saved before submission today.
7. **Activity input materials (content dependency).** The pack's activities rely on platform-provided inputs ("a small existing project", "a mock endpoint", "a brief and a rough sketch"). **Only one-line descriptions exist. No material is stored anywhere**, and there is no delivery mechanism. Without them, `act_fe_change_request` and `act_fe_debug_improve` cannot be done honestly.
8. **Result notification.** When human review finalises, the graduate is not told. A `notification` table exists, but no UI reads it.
9. **Role filtering.** Only roles with consumable content should be listed.

## 5. Minimal changes required (no new engine, no new promotion rule)

### API (small, additive)

**A1 · `GET /v1/me/activities`.** For the current goal's role: activities where `status = 'published'` and they are linked to the role (`target_role_id`, or `activity_skill ∩ role_requirement`).
- **Demo rule:**
  - in production nothing demo is published (the existing guard);
  - outside production, demo items are returned only flagged `isDemo` and labelled "DEMO — not reviewed".
- **Fields per item:** `id`, `slug`, `version`, `titleAr/En`, `objectiveAr`, `level`, `estimatedMinutes`, `aiUsageMode`, `skills[{ id, labelAr, depth }]`, `deliverableCount`.
- **`assessmentMode`**, computed by a new pure domain helper `activityAssessmentMode(rubric, valuesApproved, isDemo)`, the static half of `assessmentBasis`:
  - **`human_reviewed`**: non-demo, values SME-approved, and every skill-evidence criterion is human;
  - **`formative_only`**: anything else, with the reasons;
  - **`automated_verified`**: reserved for platform-verified rule criteria (none today).
- It is informational only: **it never decides a level**; D-118 still decides at evaluation time.

**A2 · `GET /v1/me/activities/:id`.** Detail:
- `businessContextAr`, `objectiveAr`, public `inputs[{ key, descriptionAr }]`, **without** the `contains_planted_issue` flag;
- `deliverables[{ key, format, mandatory, descriptionAr }]`, `aiUsageMode`;
- `myProjects[{ id, latestSubmission: { id, state, evaluationOutcome, decision } }]`.

Never returned: rubric weights, thresholds, criteria text, integrity checks, private assessment design.

**A3 · Submission.** Accept `files: [{ uploadId, deliverableKey }]`. Validate that `deliverableKey` belongs to the activity's `source file` deliverables, is unique, and that the upload is owned and confirmed. `uploadIds` stays (positional legacy). D-118 namespace refusal is unchanged; `file.*` keys still come only from uploads.

**A4 · `GET /target-roles` filter.** Return only roles with at least one published activity or published role content. Demo roles appear outside production only, labelled.

**A5 · `GET /projects`.** Add the activity title and the latest submission's state, evaluation outcome and verification decision (read-only join).

### UI (frozen classes, no redesign of existing pages)

**U1 · `/activities`.** The catalogue for the current role: cards with title, time, AI-use mode, skills, and an honest chip:
- «تُراجَع بشريًا وقد ترفع المستوى» — human-reviewed, may raise the level;
- «للتعلّم — لا ترفع المستوى حاليًا» — for learning, does not raise the level now;
- «تجريبي — غير مراجَع» — demo, not reviewed (outside production only).

**U2 · `/activities/[id]`.** Brief, context, inputs, deliverables, AI-use rules, the assessment statement, a "Start" button (`POST /projects`), and "my attempts".

**U3 · `/work/[projectId]`.** A workspace **generated from `activity_deliverable`**:
- one upload slot per `source file` deliverable (explicit key);
- one text field per `text` deliverable (`note.*` / `answer.*`);
- the disclosure questionnaire (the existing renderer, moved, not rewritten);
- local draft autosave (§7 Phase 2);
- submit.

No checkboxes that assert technical facts: a declaration is shown as a declaration, never as a rubric pass.

**U4 · `/evaluation`.** Read via `GET /submissions/:id/evaluation`. Evaluate only when the submission has no evaluation, through an explicit "submit for assessment" step. States shown:
- under human review (no time estimate);
- pending validation (D-118 copy);
- evidence produced;
- blocked by checks (which deliverable is missing).

**U5 · Links.**
- `/skills/[id]` activities become links to `/activities/[id]`;
- `/goal` "Next" goes to `/skills`;
- `/project` becomes a redirect to `/activities`; outside production the demo activity stays reachable from the catalogue, labelled.

**U6 · `/work`.** "My work": projects, attempts and status, from A5.

### Not changed
- Evaluation, review queue, aggregation, verification policy and evidence ladder.
- The D-118 guarantees.
- Readiness, claims, grounding and the Admin Track Builder.

## 6. Proposed UI flow

```
/login → /goal (only roles with consumable content)
       → /skills (track skills; "pending expert validation" kept)
         → /skills/[id] → related activities (links)
       → /activities (catalogue for the role, honest assessment chips)
         → /activities/[id] (brief, context, inputs, deliverables, AI-use mode, what this activity can and cannot do for your level)
           → [Start] → /work/[projectId] (deliverable-driven workspace; local draft; disclosure)
             → [Submit] → /evaluation?submission=… (read-or-evaluate)
                 · blocked: which mandatory deliverable is missing → back to /work
                 · under human review: what was checked, what a person is reviewing
                 · pending validation: your work is recorded; the level awaits independent verification
                 · evidence produced: level change (human-reviewed path only, today)
               → journey progress, companion next step, /work (my work)
```

**Display rules (formative learning, D-118):**
- Never show a level, or "you proved this skill", unless the verification decision is `accepted` with a transition.
- Submitted material, journey events and feedback are always shown.
- The words used are "recorded", "under review" and "pending validation", never "proven".

## 7. Assessment and evidence compatibility

**Human-reviewed path (today).**
- Pack activities have human `skill_evidence` criteria and a rule gate.
- Evaluate → `needs_human_review` → queue → granted reviewers → finalise → `assessmentBasis` (D-118) → accepted only on SME-approved, non-demo rubric values.
- The journey above needs no change to this path. It only (a) lets graduates reach these activities, (b) maps files to the right deliverable keys, and (c) lets them reopen the final result.

**Future automated path.** The `verified.*` namespace is reserved and refused from clients. When a platform producer exists (for example a test runner writing verified facts with recorded provenance), a rule criterion over `verified.*` satisfies `assessmentBasis` and `activityAssessmentMode` reports `automated_verified`.
- No UI change is needed beyond the chip.
- **No promotion rule is activated by this proposal**; enabling automatic levels stays an SME-approved, PO-activated policy change.

**Evidence ledger.** Unchanged: submission items, file, text and link children, disclosure, attempts and supersession. Explicit file mapping makes the ledger's `artifact_key` exact rather than positional.

**Formative feedback where technically supported.**
- *Deterministic:* gate results (missing deliverables) and user-facing integrity checks (explanation questions).
- *Human:* reviewer rationales per criterion after finalisation.
- *Agents (local deterministic provider):* technical-feedback and next-action proposals, as today.
- No LLM.

## 8. Security considerations

1. **Content exposure.**
   - The catalogue is filtered **server-side**: published only, and demo never in production (existing guard).
   - Rubric weights, thresholds and criteria text, integrity checks and planted-issue flags are never returned (`rubric_version` RLS is already `read_none`; `integrity_check_spec` has no client policy).
2. **Finding, an existing RLS issue.** `activity_input` is readable by `authenticated` and `anon` for published activities **including `contains_planted_issue` and descriptions such as "four planted defects"**. A graduate could read the assessment design through the Supabase client directly.
   - **Proposal:** revoke column `contains_planted_issue` from `authenticated`/`anon` (or serve inputs only through A2), and have an SME review input descriptions.
3. **Finding.** `target_role`, `skill` and `role_requirement` are readable `using (true)` by `anon` as well, which exposes draft, demo and test content.
   - **Proposal:** restrict to published (plus demo outside production) once A4 lands. Check readiness reads first, because it uses the service path.
4. **Uploads.** Explicit mapping is validated server-side (owned, confirmed, valid deliverable, no duplicates). D-118 namespace refusal is kept. Content stays unverified until a reviewer sees it; owner overwrite of stored objects is still open (Pilot P1-6).
5. **Starter materials** (when added), served the same way as uploads:
   - a private bucket;
   - short-lived signed download;
   - access only to authenticated users with a current goal on that role;
   - the download recorded;
   - versioned with the activity (frozen once published).
6. **No new write path to levels.** New endpoints are read-only except the additive `files` mapping.
7. **Rate limiting** is still absent platform-wide (Pilot CB-6) and is required before real users.
8. **Local drafts** (Phase 2) live in the graduate's browser only. Clear them on sign-out, and never put them in URLs.

## 9. Browser acceptance scenarios (staging, real auth; none run yet)

| # | Scenario | Expected |
|---|---|---|
| J-1 | Choose a role on `/goal` | Only roles with consumable content; demo roles labelled (staging); test roles absent |
| J-2 | `/skills` → open a skill → related activity link | Navigates to `/activities/[id]` |
| J-3 | `/activities` | Activities of the role only; chips: human-reviewed, formative, or demo (staging); no rubric details anywhere |
| J-4 | Activity detail | Brief, context, inputs (no planted-issue wording), deliverables, AI-use mode, time estimate, assessment statement |
| J-5 | Start → workspace | One upload slot per file deliverable, one field per text deliverable; **no checkbox claiming technical facts** |
| J-6 | Leave and return to the workspace | Draft text restored (Phase 2); uploaded files listed |
| J-7 | Submit with a mandatory file missing | Blocked by checks; the message names the missing deliverable; no review queued |
| J-8 | Submit a complete human-reviewed activity | "Under human review"; nothing about a level |
| J-9 | Reviewer finalises → graduate reopens `/evaluation` | Final feedback with reviewer rationales; if non-demo and SME-approved: level change shown; otherwise "pending validation" |
| J-10 | **G-7 (D-118):** demo activity with all boxes ticked (staging) | "Pending validation"; no level anywhere (skills page, report, proposals) |
| J-11 | Revisit any past evaluation | Opens read-only; never "already evaluated" |
| J-12 | `/work` | Every project with attempts and current state |
| J-13 | Crafted request: `files` mapping to another user's upload or an unknown deliverable | Refused |
| J-14 | Production-mode staging check | No demo activity listed; `/project` redirects to `/activities` |
| J-15 | Accessibility and RTL | Keyboard-only path through J-2…J-9; screen reader labels on upload slots; mobile 375 px; Latin file names isolated LTR |

## 10. Estimated implementation phases (each needs approval)

| Phase | Content | Size |
|---|---|---|
| **1 — Read-side API and correctness fixes** | A1, A2, A4, A5; `activityAssessmentMode` (pure, tested); A3 explicit file mapping; e2e tests (catalogue filtering, demo exclusion in production mode, no assessment-design leakage, mapping validation, D-118 suite still green) | ~3–4 dev days |
| **2 — Graduate UI on the frozen system** | U1–U6; evaluation read-or-evaluate; local draft autosave; links; `/project` redirect. Browser scenarios J-1…J-15 run on staging | ~4–5 dev days |
| **3 — Activity input materials (content + delivery)** | SME/content authoring of the starter repo, mock data and briefs per activity. Private bucket, versioned attachment to the activity (small migration), signed download. RLS tightening (§8.2, §8.3). Needs SME and PO approval; the content effort is outside engineering | ~2–3 dev days + content time |
| **4 — Notifications and polish** | Show review-finalised notifications; "my work" status refinements | ~1–2 dev days |

**Dependencies.**
- Phases 1–2 can run on staging with demo content (labelled).
- A real level for a real graduate additionally requires all of:
  - SME-reviewed, published non-demo activity content;
  - approved rubric values;
  - reviewer grants;
  - Phase 3 materials for activities that need inputs;
  - the remaining pilot blockers (staging verification, launch protections).

**Recommended first step:** Phase 1. It is read-mostly, low-risk and removes the demo-ID dependency at the API level, with its own tests, before any UI work.

**Stopped. Awaiting Product Owner approval.**
