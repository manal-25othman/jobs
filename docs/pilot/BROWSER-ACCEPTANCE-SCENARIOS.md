# نَقْلة / NAQLA — Manual browser acceptance scenarios
**Status:** **None has been run.** There are no browser tests in the repository (no Playwright suite). **Every scenario below requires an actual browser** on the staging environment with real Supabase auth. API e2e tests show only that the endpoints behave; they do not show that the pages work.

**Setup (staging):**
- Four people, each with their own account:
  - **G** — graduate; plus **G2**, a second graduate for isolation checks;
  - **TA** — `track_admin` grant;
  - **SME** — `sme` grant;
  - **PO** — `product_owner` grant;
  - **PO2** — a second product owner, for separation-of-duties checks.
- Browsers: one desktop (Chrome) and one mobile viewport (375 px).
- For each scenario, record pass/fail, a screenshot and any console errors.

Codes: **S** = success path · **R** = rejected or refused action · **C** = incomplete-configuration behaviour · **A** = accessibility / RTL.

## 1. Graduate (G)

| # | Type | Steps | Expected |
|---|---|---|---|
| G-1 | S | Open the app → `/login` → sign in (invite account) | Arabic RTL; session persists after reload; token refreshes after 1 h idle |
| G-2 | R | Try to sign up with a non-invited email | Refused (once invite-only is configured). **Today sign-up is open: expected FAIL** |
| G-3 | S | `/goal` → choose Junior Frontend Developer → confirm | The goal is saved. ⚠ Check whether e2e or demo roles are listed (P1-3) |
| G-4 | C | `/skills` → open a skill | The classification shows "pending expert validation". Readiness shows "not configured yet". **No verdict** anywhere |
| G-5 | S | `/project` → title, two files (component, test), deliverables, coverage note, AI-disclosure questions → submit | The upload progresses, the submission is created and you land on `/evaluation` |
| G-6 | R | Upload a disallowed type (`.exe`), a file over 10 MB, and an empty file | Each is refused with a clear Arabic message; nothing is submitted |
| G-7 | **R (CB-1)** | Submit with all three deliverable boxes ticked but the files unrelated (for example two blank `.txt`) | **Today: passes and proposes Demonstrated. Expected FAIL until CB-1 is closed.** After the fix: not Demonstrated without review |
| G-8 | S | `/evaluation` → read criteria, rationale, integrity checks, assessment, skill progress | Every criterion has an Arabic rationale; Verified never appears; progress is shown as a count, not a percentage |
| G-9 | S | AI-disclosure: answer "used AI", then the explanation questions | Accepted with no penalty wording |
| G-10 | S | `/proposals` → open a CV-bullet draft → preview grounding → approve | The asset is approved and appears in `/report`. (In production with no active vocabulary: draft is `needs_revision`, see G-11) |
| G-11 | C | `/proposals` when no grounding vocabulary is active (production mode) | The draft is shown as needing revision with an explanation, never approvable |
| G-12 | R | Edit a draft to add "for a client" or "40% faster" → approve | Refused, with the unsupported part named |
| G-13 | S | `/report` → create a share link → open it in a private window | ⚠ It opens the **API JSON** (CB-7). Expected: a readable page (FAIL until P1-1). Check that only approved, presentable assets appear |
| G-14 | S | `/report` → revoke the link → reload the private window | 404 or closed immediately |
| G-15 | R | Isolation: as G2, paste G's project, evaluation or proposal URLs and ids | Nothing of G's is visible to G2 |
| G-16 | S/R | Evidence withdrawal | **No UI** (P1-2); record as a gap. Via support only |
| G-17 | A | Whole journey with keyboard only; screen reader (VoiceOver/NVDA) on `/login`, `/project`, `/evaluation` | Focus visible; labels read; errors announced (`role="alert"`); evidence state shown by shape **and** label |
| G-18 | A | Mobile 375 px, RTL | No horizontal scroll; Latin terms (React, file names) isolated LTR inside Arabic text; progress direction mirrored |
| G-19 | A | Zoom 200 % and reduced motion | Layout intact; no animation |

## 2. Track Admin (TA)

| # | Type | Steps | Expected |
|---|---|---|---|
| TA-1 | S | `/admin` | Roles shown as "Track Admin"; the separation statement and the **10** pending expert decisions are listed |
| TA-2 | S | Configuration → a claim policy → "new draft from this version" → change the evidence count → save with a reason | A new draft version; the original is unchanged; the diff shows the one change with Arabic impact text |
| TA-3 | R | Try to draft a CV-bullet policy at Practiced | Refused with the pending-decision message |
| TA-4 | R | Try to validate or activate any draft | No button; a forced request is refused (403) |
| TA-5 | S | Track page → propose a change to "core" for a skill → submit | Shown as "professional — SME approves"; nothing live changes |
| TA-6 | S | After SME approval → build a track version → submit | Version preview lists the per-skill changes |
| TA-7 | S | Content → create a draft skill → submit for review | Draft → pending review |
| TA-8 | R | Try to edit deliverables of a published activity | Refused; message explains that it needs a new version |
| TA-9 | C | Pack constraints → draft a set with a missing constraint or an unknown type | Refused; the message names the extension register |
| TA-10 | A | All admin pages in RTL, keyboard only, at 375 px | Forms usable; reason prompts focusable; no JSON needed (except the challenge trigger) |

## 3. Named SME (SME)

| # | Type | Steps | Expected |
|---|---|---|---|
| SME-1 | S | Validate TA's claim-policy draft (approve, with a reason) | Approved by SME name; stage "Approved" |
| SME-2 | R | As an account holding TA + SME, draft and then try to validate the same draft | Refused (four eyes) |
| SME-3 | S | Approve a professional track-skill change | Approved; classification becomes "approved" only after the version is activated |
| SME-4 | S | Content review: pending → professional review → approved for a non-demo item | `review_log` records the SME by name |
| SME-5 | R | Try to approve a **demo** item | Refused (demo is never SME-approved) |
| SME-6 | S/R | Rubric values: return the rubric for revision; TA edits a weight; the same SME then a different SME approves the values | The editor cannot approve; a different SME can |
| SME-7 | R | Try to activate anything | No button / 403 |
| SME-8 | S | Human review queue `/review` → take an item → decide with a rationale | Blind (no identity); rationale required (≥ 12 characters) |

## 4. Product Owner (PO)

| # | Type | Steps | Expected |
|---|---|---|---|
| PO-1 | S | Activate an approved policy (development-only on staging) | Activated; the previous version replaced atomically; history recorded |
| PO-2 | R | Try to activate a non-approved draft in production mode | Refused by the database guard |
| PO-3 | R | As PO + SME: activate something you approved | Refused (separation of duties); PO2 succeeds |
| PO-4 | R | Activate a challenge policy; activate a CV bullet at Practiced | Both refused |
| PO-5 | S | Publish SME-approved content that someone else submitted | Published; the previous version superseded |
| PO-6 | R | Publish content you created or edited | Refused |
| PO-7 | S | Deactivate (roll back) a policy you did not draft | Allowed (safety act) |
| PO-8 | S | Activate a grounding vocabulary version that removes a word an approved bullet uses | The bullet moves to review immediately; G sees a notification; `/report` no longer shows it |
| PO-9 | C | Track pack constraints: activate a track-specific set on staging, then roll back | Other tracks keep the baseline; the import shows which set applied |

## Which scenarios need actual browser testing
**All of them.** API coverage exists for most rule outcomes (R types). It does not cover rendering, navigation, the Arabic/RTL layout, keyboard and screen-reader behaviour, upload UX, session refresh, or the share-link experience.

Expected failures today, already known:
- **G-2:** sign-up is open.
- **G-7:** Demonstrated is self-assertable (CB-1).
- **G-13:** the share link returns raw JSON.
- **G-16:** no evidence withdrawal UI.
- Possibly **G-3:** extra roles listed.
