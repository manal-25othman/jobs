# نَقْلة / NAQLA — Critical Verification Integrity Remediation Report
**Date:** 2026-10-09 · **Decision:** D-118 · **Scope:** the self-asserted verification vulnerability only (Pilot Readiness Report, blocker CB-1). There was no deployment, no change to real data, no general pilot work, and no change to readiness, claims, grounding or Track Builder behaviour.

## 1. Root cause

There were two independent paths, both trusting what the client said.

**R1 — Evaluation.**
- The legacy baseline verification policy `default@1` accepted any *passed* evaluation's proposal.
- On the slice-1 demo activity (`act_fe_003`), the only one the graduate UI can submit, **all four criteria are `rule` checks over client-supplied artifacts**: `test.empty_state`, `test.loading_state`, `test.error_message` (booleans the user ticks) and `note.coverage` (text).
- So three ticks plus any two allowed-type files meant `passed`, which meant **Demonstrated**, with an `evidence` row and an `evidence_transition`.

**R2 — Submission.**
- `SubmissionService.ensurePracticedClaim` wrote a **Practiced** claim (`T-LINK`) for every claimed skill the moment a submission was created. Submitting files alone granted a level.

**Aggravating factors**
- The API accepted any artifact key from the client, including `signal.*` (platform facts). The UI always sent `signal.tests_reference_component = true`.
- The API also accepted **`file.*` booleans**, letting a client impersonate the upload producer: a "file present" check passed with no file.
- Uploads were never distinguished from declarations in what the evaluator saw.

## 2. Affected paths (audited)

| Layer | Path | Finding | Change |
|---|---|---|---|
| UI | `apps/app/src/app/project/page.tsx` | Sent `signal.tests_reference_component = true`; ticks presented as completion | Signal removed; a line explains that ticks are declarations and never raise a level by themselves |
| UI | `apps/app/src/app/evaluation/page.tsx` | Showed a pass as "evidence produced" only when there was a transition | New state "your work is recorded — the level awaits independent verification" when the decision is `assessment_pending_validation` |
| API | `SubmissionService.submit` | Accepted client `signal.*`, `verified.*`, `followup.*`, `file.*`, `link.*` keys | **Refused (400)**; nothing is written |
| API | `SubmissionService` → `ensurePracticedClaim` | Practiced on submission | Only if the policy in effect has `practiced_on_submission` (the safety baseline: **no**) |
| API | `EvaluationService.loadArtifacts` | No provenance | Each artifact carries its provenance: `uploaded_file` / `submitted_link` / `declared` (no artifact is `platform_verified`: no such producer exists) |
| API | `EvaluationService.decideAndApply` (rule run and human finalisation) | Promoted on any pass | Computes the **assessment basis** and passes it, with the environment, to the policy. Re-establishment of withdrawn evidence and H6 derivation are gated by the same basis |
| API | `EvaluationService.promote` | Assumed a claim row existed | Creates the claim on the first earned level (from `gap`), since a submission no longer creates one |
| Domain | `verification-integrity.ts` (new) | — | Client namespace refusal, artifact provenance, `assessmentBasis()` |
| Domain | `verification-policy.ts` `decideWithPolicy` | Accepted the rubric proposal | New decision `assessment_pending_validation` (hold; level unchanged; no legacy `verification` row) when the basis is not met, or when the legacy basis would run in production |
| Config | `config-admin.service.ts` activation guard | — | Refuses activating a legacy-basis policy in production |
| DB | `verification_policy`, `verification_decision` (0023) | — | Below |
| Unchanged, verified | Evidence ladder (`assertTransitionAllowed`), production ceiling (no Verified), RLS on `skill_claim` / `evidence` / `verification_decision` (users cannot write them) | Already sound; re-proven in tests | — |

## 3. Behaviour before and after

| Situation | Before | After (safety baseline `default@2`) |
|---|---|---|
| Submit claiming a skill | Claim → **Practiced** immediately | Submission, files, ledger items and the skill journey are recorded. **No level** |
| Tick 3 boxes + upload 2 files → evaluate | `passed` → **Demonstrated**; evidence + transition + `claim.promoted` | `passed` shown as formative feedback; decision **`assessment_pending_validation`**; no evidence, no transition, no promotion |
| Two blank files, boxes ticked | Demonstrated | Pending; no level |
| Client sends `signal.*` / `verified.*` / `followup.*` / `file.*` / `link.*` | Stored and evaluated | **400**, nothing stored |
| Extra fields in the request (`state`, `verification`, `decision`, `basis` …) | Ignored | Ignored (proven) |
| Already Demonstrated, then a pending, below-threshold or blocked run | — | Level, primary evidence and reason unchanged |
| Human review of every skill criterion, on **SME-approved, non-demo** rubric values | Demonstrated | **Demonstrated** (unchanged: the authorised path) |
| The same human review on **DEMO** content | Demonstrated | Pending: demo rubric values are never SME-approved |
| Production, any legacy-basis policy | n/a | Never in effect (the DB refuses it). If one were somehow resolved, the decision is pending |

## 4. Policy and configuration changes (migration `0023_verification_integrity.sql`)

**New governed fields on `verification_policy`:**
- `promotion_basis` is `independently_verified` or `legacy_any_pass`.
  - `independently_verified`: every `skill_evidence` criterion is decided by a named human reviewer, or rests on platform-verified artifacts; the rubric values are SME-approved; the content is not demo.
  - Existing rows keep `legacy_any_pass`, which is what they did. **New rows default to `independently_verified`.**
- `practiced_on_submission`: existing rows `true`; new rows `false`.

**`default@1` (the legacy behaviour) retired:** deactivated, audited in `config_change`, and kept as history. Its content is untouched.

**`default@2` — safety baseline (migration-created):** in effect, `independently_verified`, no Practiced on submission.
- It is **restrictive, not SME-validated**, and labelled so.
- Automatic Practiced/Demonstrated can be re-enabled only through a **later, SME-approved, product-owner-activated** policy. That applies once criteria are independently verifiable (for example, a platform test runner writing `verified.*`) and calibrated.
- The restriction is **data, versioned**, not a hard-coded human-review requirement.

**Database guard `verification_policy_legacy_basis`:** a legacy-basis row can never be `production_active` or a baseline. It can only be `development_only`, which the existing guard already refuses in production.

**`verification_decision.decision`** gains `assessment_pending_validation`.

**Verified** stays blocked (code ceiling, unchanged).

## 5. Negative-test results

**New suite `apps/api/test/verification-integrity.e2e.ts`: 17/17.** It runs under the safety baseline.

| # | Proof | Result |
|---|---|---|
| 0 | `default@2` in effect; `default@1` retired; both acts audited | ✅ |
| 1 | **Three checked boxes** (+ a note + two files) ⇒ `assessment_pending_validation`; no claim, evidence, transition, promotion or verification row | ✅ |
| 2 | **Two arbitrary (blank) files** + ticks ⇒ no level | ✅ |
| 2b | Two arbitrary files alone ⇒ no level | ✅ |
| 3 | **Forged signals** and impersonation (`signal.*`, `verified.*`, `followup.*`, `file.*`, `link.*`) ⇒ 400; no submission created | ✅ |
| 4 | **Missing** (a mandatory box unticked), **malformed** (checkbox sent as text), **unrelated** artifacts ⇒ no level | ✅ |
| 5 | **Direct API calls:** extra state/decision/basis fields ignored; re-evaluation refused; another user's submission 404; direct `skill_claim` / `verification_decision` writes as `authenticated` refused | ✅ |
| 6 | **Current level preserved** through a pending pass, a below-threshold run and a blocked run (state, primary evidence, reason, counts) | ✅ |
| 7 | **Valid path:** named reviewer decides every skill criterion on SME-approved, non-demo content ⇒ accepted, **Demonstrated**, never Verified | ✅ |
| 7b | The same review on DEMO content ⇒ pending | ✅ |
| 8 | DB refuses a legacy-basis row as `production_active` and as a baseline; `development_only` refused in production | ✅ |
| 8b | **Production mode** (`NODE_ENV=production`): a declared pass is pending | ✅ |
| 9 | **History unchanged:** evaluation results, decisions, transitions, verification rows and audit events written before the runs are byte-for-byte identical (hash); earlier accepted decisions still present | ✅ |

**Domain unit tests:** +16 (`verification-integrity.test.ts`), covering namespace refusal, provenance, basis rules, pending decisions, legacy-in-production refusal, and fail-closed defaults for rows read without the new columns.

| Full suite | Before | After |
|---|---|---|
| Domain unit | 237 | **253** |
| Agents | 145 | 145 |
| Config | 9 | 9 |
| Harness | 30/30 | 30/30 |
| API e2e | 190 | **203 / 203** |
| DB proofs | pass | pass |
| `verify` | pass | pass |
| `next build` | pass | pass |

## 6. Backward compatibility

- **Historical records are not rewritten.** Earlier evaluations, decisions, transitions, claims, evidence and audit rows are untouched (test 9). `default@1` is unchanged apart from its audited deactivation.
- **Pre-remediation test suites** describe flows that *start* from a Demonstrated level (claims, re-grounding, withdrawal and so on).
  - They now run under an explicit **test-only compatibility row**: `default@900`, legacy basis, development-only, created by `test/helpers.ts::useLegacyVerificationCompat`. **It is not in any seed or migration.**
  - Staging and production resolve to the safety baseline.
  - The DB refuses this row in production in two ways.
  - Six assertions that described the old configuration state ("`default@1` is the baseline in effect") were updated to the new truth.
  - The human-review fixture now uploads its three files instead of sending `file.*` booleans.
- **API contract:**
  - Client artifacts in `signal.` / `verified.` / `followup.` / `file.` / `link.` are now 400. Only test fixtures and the removed UI signal used them.
  - Evaluation responses add `verification: { decision, reason }`.
- **Behaviour change by design:** under the safety baseline the demo activity (`act_fe_003`) can no longer produce any level. Its criteria are declarations by construction.

## 7. Remaining risks

1. **No level is reachable from the current graduate UI.** The UI submits only the demo activity, whose criteria are declarations. Levels now require a human-reviewed activity on SME-approved, non-demo content. This depends on CB-2 (SME review), CB-5 (activity selection) and reviewer grants. The pilot can collect submissions and give formative feedback today, but cannot award levels until those land.
2. **No platform-verified producer exists.** Automatic decisions stay impossible until, for example, a test runner writes `verified.*` with its own provenance. That needs a provenance column and its own review.
3. **Uploads are unverified content.** A human reviewer sees them. There is no content sniffing or malware scan, and owners can still overwrite their own storage objects (Pilot report P1-6).
4. **Human review depends on grants made by SQL** with no dual control (Pilot report P1-5).
5. **Claims earned under the legacy basis earlier are kept.** This is correct, since history is never rewritten, and no real-user data exists. If any environment had real users, those levels would need a reviewed re-assessment procedure. None was built.
6. **The test-only compatibility row** relies on discipline: it must never be added to a seed. It is guarded by the DB, but noted.
7. **Browser confirmation outstanding.** Scenario G-7 (`BROWSER-ACCEPTANCE-SCENARIOS.md`) must still be run on staging.

## 8. Is blocker CB-1 closed?

**Yes in code, proven by automated tests. Final acceptance is pending a browser check.**

No declaration, upload, forged signal or crafted request can grant Practiced or Demonstrated in any environment that resolves to the safety baseline. In production no other basis can be in effect. Browser scenario G-7 on staging is the remaining acceptance step.

**Stopped. Awaiting approval.** No staging deployment, no real graduates.
