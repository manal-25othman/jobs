# نَقْلة / NAQLA — ENG-1 P0–P2: Implementation Report

**Date:** 2026-10-12 · **Basis:** `ENG-1-PER-SKILL-ASSESSMENT-DESIGN.md` (commit `a5a252a`) · Product Owner engineering approval for P0, P1 and P2 only.

**Status:**
- P0, P1 and P2 are implemented. Per-skill verification is **not active**.
- P3–P6 are not implemented.
- H6 is unchanged and off.
- No verification policy, readiness configuration, SRS, production track, SME content, rubric threshold, CV/LinkedIn policy or graduate UI was modified.
- No LLM was connected. Nothing was deployed.

---

## 1. Commits and changed files

| Commit | Phase | Files |
|---|---|---|
| `bf35ed9` | **P0** legacy evaluation integrity | `apps/api/src/slice1/evaluation.service.ts` · `apps/api/test/eng1-p0-integrity.e2e.ts` (new) · `packages/domain/src/skill-attribution.ts` (new) · `packages/domain/src/skill-attribution.test.ts` (new) · `packages/domain/src/evaluator.ts` · `packages/domain/src/verification-policy.ts` · `packages/domain/src/index.ts` · `supabase/migrations/0025_eng1_p0_rubric_activity_binding.sql` (new) · `supabase/rollback/0025_eng1_p0_rubric_activity_binding.down.sql` (new) |
| `21a856b` | **P1** pure per-skill domain | `packages/domain/src/per-skill-assessment.ts` (new) · `packages/domain/src/per-skill-assessment.test.ts` (new) · `packages/domain/src/index.ts` |
| `4996c90` | **P2** additive inactive schema | `supabase/migrations/0026_eng1_p2_per_skill_schema.sql` (new) · `supabase/rollback/0026_eng1_p2_per_skill_schema.down.sql` (new) · `supabase/tests/per_skill_schema.sql` (new) · `scripts/db-test.sh` · `apps/api/test/eng1-p2-inactive.e2e.ts` (new) |
| *(this report)* | docs | this file · `docs/decisions/DECISIONS.md` (D-121) · `docs/architecture/ENG-1-PER-SKILL-ASSESSMENT-DESIGN.md` (status line) · `packages/agents/eval/last-run.json` (records the new ruleset version 0.19.0; 30/30 unchanged) |

`DOMAIN_RULESET_VERSION`: 0.18.0 → **0.19.0** (P0 changes a rule: attribution).

---

## 2. P0 — security and integrity fixes

| # | Approval condition | Implementation |
|---|---|---|
| 1 | No promotion of a skill not covered by applicable, valid rubric criteria | `isValidSkillEvidenceCriterion`: kind `skill_evidence`, a linked skill, maximum > 0. Coverage is computed on canonical skill ids. A claimed skill no valid criterion measures can never be the promoted skill (F-9 closed) |
| 2 | No nondeterministic primary selection, in evaluation **and** finalisation | `skillIds[0]` and `limit 1` are gone. Both paths call the same `attributeLegacyPrimarySkill` on the same pinned rubric. A test proves the result is independent of the order of every input |
| 3 | Explicit, defensible mapping, never uuid order, otherwise fail closed | **claimed by the learner ∩ declared `primary` by the activity (governed `activity_skill.depth`) ∩ measured by the rubric.** Exactly one ⇒ attributed. None or several ⇒ **unattributed**: the run is recorded with its proposal withheld; each claimed skill gets a `not_applicable` decision naming the reason; no verification row, no evidence, no transition |
| 4 | Pin to the rubric of the submission's activity version, or refuse safely | Migration 0025 adds `rubric_version.activity_spec_version`, set by trigger **at the moment of publication** and immutable afterwards. `resolveRubricVersion`: bound version → used; several bound → refused; an unbound legacy row → accepted only if it is the activity's only published version and the submission is on the current activity version; anything else → `400 [rubric_version_unresolved]` **before any row is written**. Finalisation keeps the interim result's rubric |
| 5 | Audit `threshold_for_skill`; do not change grading | **Finding:** stored on `rubric_criterion` (pack import, admin edit, reviewer payload), never loaded by the evaluator; its unit is undocumented. The stored values (0.5 against a maximum of 2; 1.0 against a maximum of 1) only make sense as a *fraction of the maximum*; every value is `proposed`. **Change:** loaded into the domain contract (`thresholdForSkill`, `thresholdStatus`) and **not read** by legacy grading. A test proves the run is byte-identical for any value or status |
| 6 | Preserve D-118 and historical records | The basis and policy decision are untouched. No existing row is modified: 0025 binds only versions published after it; a legacy row is never re-bound by an ordinary update (tested). Upgrade fingerprint: §7 |
| 7 | Regression tests: no new level is awarded | `eng1-p0-integrity.e2e.ts` (9 tests) runs under the test-only legacy-compatibility policy, where an attributed pass **would** promote. Unattributed and unresolved cases are proven to leave evidence, transitions, verification rows and claims untouched |

---

## 3. P1 — domain contracts and invariants (`per-skill-assessment.ts`; pure; imported by no service)

**Contracts:**

| Function | What it does |
|---|---|
| `assessSkill`, `assessSkills` | For each canonical skill, from its own valid criteria only: `met`, `not_met`, `incomplete`, `not_assessed` or `blocked`. Also: per-criterion results (score, threshold, value status), a per-skill D-118 basis, confidence, the skill's **own** previous state, the proposal, the reason, and a versioned context (`per_skill@1`, rubric version id and version, activity id and version) |
| `sharedPrecondition` | A blocking integrity failure, or a gate criterion not met or not scored, blocks every skill |
| `decideSkillAssessment` | One policy decision per skill, from that skill's assessment only. Unclaimed skills and non-`met` outcomes ⇒ `not_applicable`. A policy with H6 enabled is **refused**. An llm never decides (INV-3). Verified is never reached |
| `standingEvidenceForSkill` | Withdrawn evidence never counts; one per evaluation result |
| `skillAssessmentKey` | Idempotency key per (evaluation result, skill) |
| `assertSkillAssessmentInvariants` | Runtime invariant check |

**Thresholds:**
- A fraction of the maximum, in (0, 1].
- Used **only** when its value status is `approved`, from a versioned rubric.
- **No fallback to full marks:** an unapproved, missing or invalid threshold makes the skill `incomplete`.

**Invariants (tested):**

| Invariant | Rule |
|---|---|
| INV-PS1 | A skill's assessment depends only on its own criteria, the shared precondition and its own state. Covered by a seeded **600-case property test** that mutates every other skill's scores, pending states, prior states and the activity outcome |
| INV-PS2 | No proposal unless `met` |
| INV-PS3 | A failed shared gate blocks every skill and never raises one |
| INV-PS4 | The activity's pass rule is not an input to any skill |
| INV-PS5 | One assessment per canonical skill |

**Tests:** 25. They cover:
- mixed outcomes;
- missing, pending and unapproved criteria;
- blocked evaluations;
- independent prior states;
- revoked and duplicate evidence;
- repeat evaluations;
- aliases;
- uploads, declarations and links never verifying;
- demo or unapproved content;
- the H6 refusal;
- llm refusal.

---

## 4. P2 — schema and migration (`0026_eng1_p2_per_skill_schema.sql`)

**Pre-write audit of current consumers:**
- No `select *` and no views over `evidence`, `verification` or `verification_decision`.
- Every insert names its columns.
- The 10 API files reading `evidence` and the 8 reading `verification_decision` select explicit columns.
- So nullable additions are invisible to them. The legacy `verification` table is untouched.

**Objects (additive; nothing backfilled):**

| Object | Purpose | Uniqueness / idempotency | Integrity |
|---|---|---|---|
| `skill_assessment` | per-skill outcome + versioned context (model, ruleset, rubric version, activity version, rubric resolution, track config) | `(assessment_id, skill_id)` | consistency trigger (same user, result, rubric, activity version as its assessment; canonical skill); proposal only when `met`, never Verified, above the skill's **own** state; commit-time check that the outcome matches its cited criteria; immutable |
| `skill_assessment_criterion` | the exact criterion results, thresholds and value status a skill outcome rests on | `(skill_assessment_id, criterion_key)` and `(skill_assessment_id, assessment_criterion_result_id)` | same assessment, user and canonical skill; recorded in the same transaction as its parent; `met` needs an approved threshold; immutable |
| `verification_decision.skill_assessment_id` | decision provenance | one decision per skill assessment (a human override is a new row) | must match its assessment, result, user and skill; previous state = the skill's own; `accepted` requires `met` + verified basis + proposal |
| `evidence.skill_assessment_id` | evidence provenance | one evidence row per skill assessment | must match user, skill and result; only a `met`, verified assessment; **immutable after insert, including against a user's withdraw-update** |
| `evidence` index | **F-10**: one platform evidence row per (evaluation result, skill) | partial unique index | migration pre-check aborts on historical duplicates (never deletes) |
| `verification_policy.assessment_scope` | `primary_claimed_skill` (default, every row) \| `per_skill` | — | **`verification_policy_per_skill_sealed`**: a `per_skill` row can only be `inactive`; excluded with H6 |
| RLS | — | — | forced on both tables; owner select only; no client write path; anon denied |

**Rollback** (`supabase/rollback/0026….down.sql`, `0025….down.sql`):
- It restores the prior schema exactly.
- The 0026 rollback **refuses** while any per-skill record, link or `per_skill` policy exists, so history is never deleted.

**Tests:**
- **36 database proofs** in `supabase/tests/per_skill_schema.sql`. Each "must fail" must fail **for its intended reason**: the helpers compare the error, since three proofs initially passed for the wrong reason and were tightened.
- A rollback-refusal proof.
- An **up → down → up round-trip** on a separate database: rollback removes exactly the ENG-1 objects; pre-existing rows are intact; re-applying yields an identical schema.
- All of this is wired into `scripts/db-test.sh`.

---

## 5. Test results

| Suite | Result |
|---|---|
| Domain unit (`packages/domain`) | **309/309** (was 266: +18 P0, +25 P1) |
| Config / agents / app unit | 9/9 · 145/145 · 16/16 |
| Agent evals | **30/30** |
| API e2e (fresh DB, 0025 + 0026) | **241/241**: 228 existing + 9 P0 + 4 P2 |
| DB proofs (`db-test.sh`) | all pass, including 36 new P2 proofs, rollback refusal and the round-trip |
| `npm run verify` | passes |
| **Browser acceptance (graduate UI)** | **55/57: B7e and B7g fail. See §8, O-1.** This is the intended fail-closed effect of P0, not a defect in the UI or in P0 |

---

## 6. Proof the new pathway is inactive

1. **No reader or writer.** An e2e test scans every `apps/api/src` file for the new tables, the scope column and the per-skill domain functions: zero hits. P1 is imported by no service.
2. **No rows.** After a promoting evaluation, and after the whole suite: zero `skill_assessment` / `skill_assessment_criterion` rows; zero decisions or evidence linked to one.
3. **Database seal.** A `per_skill` policy cannot be activated, even `development_only` with an audited actor set (DB proof and e2e). `per_skill` together with H6 is refused.
4. **Scope.** Every existing policy is `primary_claimed_skill`. No policy in effect enables H6. The only H6 row is the pre-existing inactive negative-test row.

---

## 7. Legacy compatibility

| Check | Result |
|---|---|
| Existing suite on a fresh database | 228/228 unchanged. Every evaluation in it is attributed explicitly and resolves to a bound rubric |
| **Upgrade of a populated legacy database** | 1. A database at 0024 was populated by the **pre-P0 API** (commit `a5a252a`): 228/228; 101 evaluations, 67 evidence rows, 101 decisions. 2. 0025 + 0026 were applied. 3. Fingerprints (md5 over all rows) of `evidence`, `verification_decision`, `verification`, `skill_claim`, `evaluation_result`, `assessment`, `rubric_version` (pre-existing columns) and `verification_policy` were **identical before and after**. 4. The 3 legacy published rubrics stayed unbound; every new column stayed null; every scope stayed legacy |
| New code on the upgraded database | 101 evaluations resolved through the legacy-unbound rule, 5 through bound rubrics. The 23 tests that failed did so **only because the suite was re-run on its own leftover state**. Control: the **old** code re-run on a **non-upgraded** database fails the same 23 (+1). **Zero failures attributable to 0025/0026 or the new code** |
| Historical rows | never rewritten; no backfill; legacy rubric rows never re-bound |

---

## 8. Outstanding issues requiring approval before P3

| # | Issue | Evidence | Options | Recommendation |
|---|---|---|---|---|
| **O-1** | **Fail-closed meets the graduate UI's default.** The work page (D-120) preselects **all** primary skills. On `act_fe_build_interface`, that is three skills the rubric measures, so P0 cannot attribute a whole-activity result and **a reviewed pass records no level**. Before P0 one of the three was promoted arbitrarily (F-2). The page truthfully says «اكتمل التقييم — لم يتغيّر مستوى المهارة بهذا التقييم», but does not say *why* | Browser B7e/B7g (55/57); audit payload `{unattributed: ambiguous, candidates: [3]}` | (a) accept until P3 per-skill results, and update B7e/B7g plus explanatory copy in the UI track; (b) change the UI default selection (UI track); (c) revert to arbitrary attribution: **not acceptable** (F-2) | **(a)** with a short UI copy change in the Graduate UI track. P3 is the real fix. I did not modify the UI or its acceptance expectations |
| O-2 | **Pre-existing evidence-update gap** (from the original RLS, not ENG-1). The owner's withdraw policy checks only owner and withdrawal fields, so while withdrawing, a user can rewrite `skill_id`, `confidence` and `provenance_source` of their own evidence row | Reproduced in a rolled-back transaction | A guard trigger allowing a non-service role to change only `withdrawn_at` and `withdrawn_reason` | Approve a small separate fix. The new `skill_assessment_id` column is already protected |
| O-3 | **Per-skill threshold unit.** P1 reads `threshold_for_skill` as a fraction of the maximum. The data is consistent with that, but it was never documented, and every value is `proposed` | §2 row 5 | confirm "fraction of max", or define another unit | Confirm "fraction", with an SME note in the rubric guidance |
| O-4 | **Practiced-on-submission (T-LINK) is outside P0's attribution.** It is off in the `default@2` safety baseline and on only in the test-compatibility policy. It moves a claimed skill to `practiced` at submission, independent of rubric coverage | `submission.service` | gate it by coverage too, or leave it as the legacy dev-only rule | Leave as is while off in every real policy; revisit in P3 |
| O-5 | **P3 decisions still open** (design §H.2): which skills are assessed (U-1); per-skill threshold approval workflow; legacy `verification` row in per-skill scope (U-4); whole-evaluation finalisation (U-6) | design doc | — | Decide before P3 |
| O-6 | **Lifting the seal** for P3 testing requires a new migration (dev/test only), not configuration | 0026 | — | Part of the P3 approval |

**Stopped. Awaiting the Product Owner's next instruction.**
- P3, P4, P5 and P6 are not implemented.
- H6 is not enabled.
- No policy is activated.
