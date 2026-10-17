# نَقْلة / NAQLA — ENG-1: Per-Skill Assessment Integrity (Engineering Design)

**Date:** 2026-10-11 · **Status:** DESIGN FOR APPROVAL. Nothing here is implemented.

> **Implementation status (2026-10-12):**
> - P0, P1 and P2 are implemented under the Product Owner's engineering approval: `bf35ed9`, `21a856b`, `4996c90`. See `ENG-1-P0-P2-IMPLEMENTATION-REPORT.md`.
> - Implemented P0 differs from §G: an explicit primary mapping (claimed ∩ activity-primary ∩ rubric-covered) replaces a claim-position column, and rubric pinning binds `rubric_version.activity_spec_version` at publication.
> - P3 is implemented as an INACTIVE development pathway (development_only only, by explicit test opt-in, refused in production): see `ENG-1-P3-DEVELOPMENT-GATE-REPORT.md` (D-123). It is never active at rest.
> - P5 (graduate per-skill results) is implemented for the development pathway only (D-124, `ENG-1-P5-GRADUATE-PER-SKILL-RESULTS-REPORT.md`). P4 is specified in `ENG-1-P4-READINESS-EXT-2-DESIGN.md` (design only).
> - P4 is implemented as an INACTIVE, development-only pathway (D-125, `ENG-1-P4-IMPLEMENTATION-REPORT.md`), including corroborating evidence behind a per-skill policy flag. P6 is not implemented.
**Basis:** code at commit `dfa460a`.

**What this design does not do:**
- It activates no H6.
- It changes no SRS, verification policy, readiness configuration, production track or graduate UI.
- It uses no LLM and deploys nothing.

**Why it exists.** The SME requires (F1) that each skill assessed in a shared activity has *its own observable criterion and an independently justified result*. The candidate three-activity design depends on this (decision pack ENG-1 / DM-9). This document traces what the code does today, shows why it cannot meet F1, and designs a replacement in which **one skill's success never implies another's**.

**Code references** are `path:line` at `dfa460a`:

| Short name | Path |
|---|---|
| `evaluation.service` | `apps/api/src/slice1/evaluation.service.ts` |
| `evaluator` | `packages/domain/src/evaluator.ts` |
| `verification-policy` | `packages/domain/src/verification-policy.ts` |
| `verification-integrity` | `packages/domain/src/verification-integrity.ts` |
| `recorder` | `apps/api/src/assessment/assessment-recorder.service.ts` |

---

## A. Current flow and why it fails

### A.1 Flow (today, with H6 off)

```text
 Learner                         API (service role, one transaction per step)                         Records
 ───────                         ──────────────────────────────────────────────                       ───────
 POST /projects ───────────────► project (activity_spec_id, version)                                  project
 POST /submissions ────────────► submission.service:98-117                                            submission
   skillIds[]                      each skill: active, graduate-visible, mapped to the activity       submission_claimed_skill
                                   (activity_skill) ─ NO order column (PK = submission_id, skill_id)  (no position)
   files / text / links            artifacts; client verified.* / signal.* refused (D-118)            submission_artifact, upload
                                   practiced_on_submission = false in default@2 ⇒ no claim written    evidence_item (ledger)
 POST /submissions/:id/evaluate ─► evaluation.service:45 evaluateSubmission
                                   1. lock submission; one evaluation per submission (409 otherwise)
                                   2. loadPublishedRubric(activity_spec_id) ─ latest PUBLISHED version;
                                      the submission's activity_spec_version is NOT used (:535-543)
                                   3. skillIds = claimed skills (no ORDER BY) ; primary = skillIds[0] (:98)
                                   4. currentState = claim(primary)                                   ── one skill
                                   5. runDeterministicEvaluation(rubric, artifacts, specs, currentState)
                                        integrity checks → blocked_by_checks
                                        rule criteria scored; human criteria ⇒ needs_human_review
                                        concludeRun: ALL mandatory criteria (every skill) + total ≥ pass
                                        proposedState = rubric.proposesState only if > currentState(PRIMARY)
                                   6. evaluation_result + evaluation_criterion_score (skill_id per row)  evaluation_result
                                   7. assessment + assessment_criterion_result (skill_id per row)        assessment, …_criterion_result
                                   8. decideAndApply(skill = PRIMARY):                                   verification (1 per result,
                                        basis = assessmentBasis over ALL skill criteria                  no skill_id)
                                        decideWithPolicy(run.outcome, run.proposedState, basis)          verification_decision (skill)
                                        accepted ⇒ promote(PRIMARY) ⇒ evidence + skill_claim            evidence, skill_claim,
                                        [H6 if enabled: other claimed skills — see A.3]                  evidence_transition
                                   9. ledger.recordEvaluation(skillId = PRIMARY)                         evidence_item, derivation
                                  10. progress.apply(skillId = PRIMARY)                                  skill_progress
 Reviewer (blind) ─────────────► review.service: assign / open / decide per CRITERION                    review_queue_item, criterion_review
 finalize ─────────────────────► evaluation.service:244 finalizeHumanReview
                                   primary = claimed skill "limit 1" (no ORDER BY, :278)
                                   aggregateWithHumanDecisions → concludeRun (same whole-run rule)
                                   steps 6–10 again, for PRIMARY only
 GET readiness ────────────────► readiness.service:46-56 facts per role skill:
                                   verificationLevel = skill_claim.state ; standingEvidenceCount = count(evidence)
```

### A.2 Why only the first claimed skill gets a verification update

| # | Cause | Where |
|---|---|---|
| **F-1** | The evaluation keeps **one** skill: `primarySkillId = skillIds[0]`. Every write that changes a level, plus the ledger link and the progress update, uses it alone | `evaluation.service:98, 195, 205, 209` |
| **F-2** | **"First" is undefined.** `submission_claimed_skill` has no position column; the PK is `(submission_id, skill_id)`; both queries lack `ORDER BY`. The initial path takes `rows[0]`; finalisation uses `limit 1`. In practice this is heap order on a small table, but no ordering is guaranteed, so the two paths could in principle choose different skills | `0003_slice_1.sql:45-50`; `evaluation.service:84, 278` |
| **F-3** | The legacy `verification` table is **structurally single-skill**: `evaluation_result_id` is `unique`, and it has no `skill_id` | `0003_slice_1.sql:86-88` |
| **F-4** | The run's `proposedState` is computed against the **primary's** current state. If the primary is already at the proposed level, `proposedState = null` for the whole run | `evaluator.ts` `concludeRun` |
| **F-5** | The run's **pass is whole-activity**: every mandatory criterion of every skill, plus the total threshold | `evaluator.ts` `concludeRun` |
| **F-6** | The assessment **basis is whole-run**: every skill-evidence criterion of every skill must be independently verified | `verification-integrity.ts:62-93` |
| **F-7** | A **per-skill threshold** exists in data (`rubric_criterion.threshold_for_skill`, from the pack, editable in admin) but is **not loaded** into the evaluator's `RubricCriterion`. No per-skill pass contract exists | `evaluation.service:553-557`; `evaluator.ts` `RubricCriterion` |
| **F-8** | **Unversioned context.** The rubric is the latest published version for the activity, not the one bound to the submission's `activity_spec_version` | `evaluation.service:538-543` |
| **F-9** | **Latent integrity gap.** The primary skill is promoted on the whole-run pass **even if no rubric criterion measures it**. Only the activity mapping limits which skill can be claimed, and that mapping includes secondary skills. Production is protected today only because no rubric is SME-approved, so the D-118 basis fails. **It would surface the day a rubric is approved** | `evaluation.service:192-197` (no applicable-criteria check) |
| **F-10** | **No DB-level idempotency per skill:** `evidence` has no uniqueness on `(evaluation_result_id, skill_id)`. Today's guard is "one evaluation per submission" (row lock + 409) | `0001_init.sql:438-460` |

### A.3 Why enabling H6 as it stands would propagate whole-activity outcomes

`deriveEvidencePerSkill` (`evaluation.service:391-417`) runs only if:
- `policy.perSkillEvidenceDerivation`;
- **and** the **primary's** decision was `accepted`;
- **and** `run.proposedState` is non-null.

Then, for every other claimed skill whose criteria all scored full marks (`skillsEvidencedByRun`), it calls the policy with:

| Input to skill S2's decision | Source | Consequence |
|---|---|---|
| `evaluationOutcome` | **whole run** (`run.outcome`) | S2's own criteria all met, but a CSS mandatory criterion failed ⇒ outcome `below_threshold` ⇒ S2 gets nothing. S2's eligibility depends on other skills |
| gate on the primary | **primary's decision** | S2 is assessed only if S1 was accepted. S1 already at `demonstrated` ⇒ `run.proposedState = null` (F-4) ⇒ H6 never runs, so S2 at `gap` is never considered |
| `proposedState` | **rubric-wide**, gated by S1's state | S2's proposal is computed for S1 |
| `basis` | **whole run** (F-6) | one unverified criterion of S3 makes S2 `pending_validation`. Conversely, nothing checks S2 *per se* |
| `assessmentConfidence` | **minimum over all criteria** | S2's confidence is lowered by S3's criteria |
| `reason` | `acceptedReason` = "evaluation met every mandatory criterion (total/max)" | S2's decision is **justified by other skills' criteria and the total**: a provenance error |
| verification row, ledger link, progress | **not written** for S2 (`verificationId: null`; ledger and progress use the primary only) | S2's level moves without a ledger item or a journey record |
| "met" test | **all criteria at full marks** (`skillsEvidencedByRun`) | ignores the approved `threshold_for_skill` (F-7) |

**In one sentence:** H6 derives each other skill's *decision* from the whole activity's outcome, the primary skill's state and decision, and every skill's basis and confidence. It filters only on that skill's own full marks. So it both blocks skills that met their criteria and justifies promotions with evidence that belongs to other skills.

**Keeping H6 off is correct.** The existing production guard (`config-admin.service.ts:134`) stays.

---

## B. Proposed per-skill evaluation model

### B.1 Seven separated layers (never merged)

| Layer | Question it answers | Record | Who writes | Can move a level? |
|---|---|---|---|---|
| 1. **Activity completion** | Was the work submitted? | `submission`, `submission_artifact`, `evidence_item` | learner (validated) | **No** (D-118: `practiced_on_submission = false`) |
| 2. **Activity evaluation** | What did the evaluator observe on the whole activity? | `evaluation_result`, `evaluation_criterion_score`, `integrity_check` | service | No |
| 3. **Activity outcome** | Did the activity pass its own pass rule? | `evaluation_result.outcome` | service | No. It is used only for EXT-1 (the integrated task) |
| 4. **Per-skill assessment** (new) | For skill S, what do **S's criteria alone** show? | **`skill_assessment`** (new, immutable) | domain → service | No |
| 5. **Per-skill decision** | Does the policy accept S's assessment? | `verification_decision` (+ `skill_assessment_id`) | policy or named human | Proposes only |
| 6. **Verification level** | The claim state of S | `skill_claim`, `evidence`, `evidence_transition` | `promote()` only (`assertTransitionAllowed`) | **Yes, only here** |
| 7. **Readiness** | Does the user meet the role's rules? | `readiness_report` | readiness engine | **Never** (BR-024) |

### B.2 Per-skill assessment: definition (pure domain)

For a published rubric version R (bound to the submission's `activity_spec_version`, fixing F-8), a run, and a skill S (canonical id):

```text
applicable(S)  = R.criteria where kind = 'skill_evidence' and skillId = S
precondition   = run not blocked_by_checks  ∧  every gate criterion met          (activity-level, shared)
criterionMet(c)= score(c) ≥ threshold(c)  where threshold(c) = c.thresholdForSkill (APPROVED) ?? c.maxScore
outcome(S) =
  'blocked'      if ¬precondition                         — shared precondition failed; no skill succeeds
  'not_assessed' if applicable(S) = ∅                     — closes F-9: no criterion ⇒ never eligible
  'incomplete'   if ∃c∈applicable(S): no score or pending human decision
  'met'          if ∀c∈applicable(S): criterionMet(c)
  'not_met'      otherwise
basis(S)       = assessmentBasis restricted to applicable(S): rubric approved ∧ non-demo ∧ each c∈applicable(S)
                 human-decided by a named reviewer OR resting only on platform_verified artifacts    (D-118 per skill)
confidence(S)  = min confidence over applicable(S)
proposed(S)    = R.proposesState if outcome(S)='met' and > currentState(S), else null              (fixes F-4)
justification  = { criteria: applicable(S) with score/threshold/evaluator/reviewer ref, basis reasons }
```

**Properties, each stated as a tested invariant:**
- **INV-PS1 (no implication).** `outcome(S)`, `basis(S)`, `proposed(S)` and `confidence(S)` are functions **only** of `applicable(S)`, the shared precondition and `currentState(S)`. Changing any score of a criterion not in `applicable(S)` cannot change S's assessment. This is checked by a property test over random rubrics and scores.
- **INV-PS2 (no criterion, no level).** `not_assessed` and `incomplete` never yield a proposal.
- **INV-PS3 (shared precondition only lowers).** A failed gate or blocking integrity check makes every skill `blocked`. Nothing at activity level can *raise* a skill.
- **INV-PS4 (activity pass is not skill success).** The activity outcome (F-5) is not an input to any skill outcome. A skill can be `met` in a `below_threshold` activity, and `not_met` in a `passed` one.
- **INV-PS5 (one result per skill per assessment).** At most one `skill_assessment`, one decision and one platform evidence row per `(evaluation_result, skill)`.

### B.3 Per-skill decision

`decideSkillWithPolicy(policy, skillAssessment)`:
1. It reuses `decideWithPolicy` with per-skill inputs:
   - `evaluationOutcome` = `'passed'` iff `outcome(S) = 'met'`, else `'below_threshold'`;
   - `proposedState(S)`, `basis(S)`, `confidence(S)`;
   - `independentEvidenceCount` = standing evidence of S.
2. The reason names S's own criteria only.
3. All D-118 rules apply unchanged:
   - `independently_verified` basis;
   - `assessment_pending_validation`;
   - the legacy basis never runs in production;
   - Verified is unreachable (INV-9, the production ceiling).
4. **A per-skill decision writes no legacy `verification` row** (F-3: that table is one-per-result).
   - `verification_decision.verification_id` stays null, as it already may.
   - In the new scope, readers use `verification_decision` (the view already does).

### B.4 Scope of skills

| Option | Behaviour |
|---|---|
| **S-a (recommended)** | Record a `skill_assessment` for **every skill with applicable criteria** in the rubric (facts). Decide and promote **only claimed skills**. An unclaimed skill's assessment is recorded with `claimed = false` and no decision. The claim stays the learner's statement of intent, and the record stays complete for later review |
| S-b | Assess and decide only claimed skills |
| S-c | Decide all skills with criteria, claimed or not |

S-c moves levels the learner did not put forward. Not recommended.

### B.5 Gating and coexistence

- New policy field **`assessment_scope`**: `primary_claimed_skill` (today's behaviour, default) | `per_skill`.
- A check constraint forbids `per_skill` together with `per_skill_evidence_derivation = true`. **H6 stays false**, and it is never a route to per-skill results.
- The config-admin guard refuses `per_skill` at a production-like activation without explicit approval, mirroring the H6 guard.
- **Under `primary_claimed_skill`, behaviour is byte-for-byte today's** (equivalence test, §F). The only exception is the separately approved determinism fix for F-2 (§G, phase P0).

### B.6 Human review

- Queue items are already **per criterion** (`review_queue_item.criterion_key`), so reviewers do not change.
- Finalisation stays whole-evaluation: all pending criteria are decided, then every skill assessment is computed from the same final scores in one transaction.
- A reviewer's per-skill override is a new `verification_decision` row with `human_override_of` and `skill_assessment_id`. It is immutable, as today.

---

## C. Schema and API impact

### C.1 Can the current schema express per-skill outcomes?

| Need | Current support | Gap |
|---|---|---|
| Criterion → skill link | ✅ `rubric_criterion.linked_skill_id`; `evaluation_criterion_score.skill_id`; `assessment_criterion_result.skill_id` | — |
| Per-skill threshold | ◐ `rubric_criterion.threshold_for_skill` + `threshold_status` | **not in the evaluator contract** (F-7) |
| Per-skill decision | ◐ `verification_decision.skill_id`; several per assessment allowed | no link to the skill's criteria or outcome; no per-skill basis record; **no uniqueness** `(assessment_id, skill_id)` |
| Legacy verification | ✗ one per result, no skill | cannot express it. Not written in the new scope |
| Per-skill outcome and justification | ✗ | **new record needed** |
| Evidence ↔ decision provenance | ◐ `evidence.evaluation_result_id` | no reference to *which skill assessment*; no per-skill uniqueness (F-10) |
| Pinned evaluation context | ◐ `evaluation_result.rubric_version_id`, `activity_spec_version` | rubric selection ignores the version (F-8) |
| Primary determinism (legacy scope) | ✗ | no claim position (F-2) |

**Conclusion: an explicit, versioned extension is necessary.** Reusing existing columns would hide the per-skill model inside rows designed for one skill (F-3), and would leave no auditable justification per skill.

### C.2 Proposed migration (additive, inactive by default; text only)

```text
skill_assessment (new, immutable; RLS: owner select; insert service-only; update/delete refused by trigger)
  id, assessment_id → assessment, evaluation_result_id → evaluation_result, user_id → app_user, skill_id → skill (canonical),
  model_version text ('per_skill@1'), domain_ruleset_version text,
  rubric_version_id, activity_spec_id, activity_spec_version, track_config_version_id null,
  claimed boolean, outcome text check in ('met','not_met','incomplete','not_assessed','blocked'),
  applicable_criteria text[], criteria_met text[], criteria_unmet text[], criteria_pending text[],
  thresholds jsonb  -- {criterion_key: {threshold, status}} as used
  basis_independently_verified boolean, basis_reasons text[], confidence numeric(4,3) null,
  current_state_at_assessment evidence_state, proposed_state evidence_state null, reason text not null, created_at
  unique (assessment_id, skill_id)
  check: proposed_state is null unless outcome = 'met' and basis_independently_verified          (INV-PS2, D-118)
  check: user_id equals assessment.user_id (trigger)                                            (tenant consistency)

verification_decision  + skill_assessment_id uuid null → skill_assessment
                       + unique (skill_assessment_id) where skill_assessment_id is not null and human_override_of is null
evidence               + skill_assessment_id uuid null → skill_assessment
                       + unique (evaluation_result_id, skill_id) where source_strength = 'platform_controlled' and withdrawn_at is null
                         (pre-check in the migration: abort with a report if any historical duplicate exists — never delete)
verification_policy    + assessment_scope text not null default 'primary_claimed_skill' check in ('primary_claimed_skill','per_skill')
                       + check not (assessment_scope = 'per_skill' and per_skill_evidence_derivation)
submission_claimed_skill + position smallint null (P0 determinism; filled from the request order; legacy rows null ⇒ uuid order)
```

### C.3 Domain contract changes

- `RubricCriterion` gains `thresholdForSkill: number | null` and `thresholdApproved: boolean`. They are loaded from `rubric_criterion`.
- New pure functions:
  - `applicableCriteria`;
  - `assessSkills(rubric, run, scope, currentStates)` → `SkillAssessment[]`;
  - `assessmentBasisForSkill`;
  - `decideSkillWithPolicy`.
- `skillsEvidencedByRun` stays only for the H6 path. It is not used by the new model.
- `DOMAIN_RULESET_VERSION` bumps.
- `loadPublishedRubric` selects the rubric bound to the submission's `activity_spec_version`. If no published rubric exists for that version: `MissingPrerequisite`, never "latest".

### C.4 API impact (additive only)

| Surface | Change |
|---|---|
| `POST /submissions/:id/evaluate`, finalize | Unchanged in the legacy scope. In the per-skill scope the response **adds** `skills: [{ skillId, outcome, claimed, decision, transition, criteria }]` |
| `GET /submissions/:id/evaluation` | Adds `skills[]`. The top-level `transition` / `verificationDecision` keep their meaning in the legacy scope. In the per-skill scope they are defined as the **first moved / first pending decision in claim position order**: deterministic, but incomplete |
| `GET /submissions/:id/assessment` | Adds `skillAssessments[]` |
| Readiness | **No change.** It already reads per-skill claim levels and evidence. EXT-2 will later read `skill_assessment` |
| Admin / Track Builder | `assessment_scope` shown with an Arabic explanation and the production guard |
| Graduate UI | **No change in ENG-1.** Showing several skill results is a separate, approved UI phase **before** any activation (§G, P5) |

---

## D. Security and provenance boundaries

| Boundary | Rule | Enforced by |
|---|---|---|
| Only `promote()` changes a level | Unchanged. Per-skill decisions call `promote()` per skill; `assertTransitionAllowed`, DB transition constraints, `claim_requires_evidence` | domain + DB |
| Uploads and declarations never earn a level | `basis(S)` uses D-118 `artifactProvenance`: `declared` / `uploaded_file` / `submitted_link` ⇒ not independently verified ⇒ `assessment_pending_validation` | domain (per skill) |
| Self-ticked criteria | No client path writes a criterion score. Scores come from the deterministic evaluator or a named reviewer's `criterion_review` (assigned, conflict-of-interest guarded, blind). Per-skill assessment **reads** only those | DB grants + RLS (scores are service-only); review service |
| Forged client signals | `verified.*` / `signal.*` artifact keys refused at submission (400). Unchanged | submission service |
| Claimed skill must belong to the activity | Unchanged (`activity_skill` check). Per-skill decisions are limited to claimed skills (S-a) **and** require applicable criteria (closes F-9) | service + domain |
| No LLM decides | `decideWithPolicy` refuses an llm evaluator (INV-3); `decided_by_kind ∈ {policy, human}` (DB) | domain + DB |
| Verified unreachable | INV-9 / production ceiling; rubric cannot propose Verified | domain + DB |
| Demo and draft content | `basis(S)` fails on a demo rubric or unapproved values; graduates cannot start unpublished activities (D-119) | domain + DB functions |
| Tenant isolation | `skill_assessment` RLS (owner select only); writes service-only; `user_id` consistency trigger; evaluation still checks ownership under the service role (`evaluation.service:59`) | DB + service |
| Immutability and provenance | `skill_assessment` and `verification_decision` immutable. Each decision names policy key/version/status, ruleset, model version, rubric version, activity version, track config, and the exact criteria. Overrides are new rows | DB triggers |
| H6 | Stays off; guarded in production; mutually exclusive with `per_skill` (DB check) | DB + config admin |

---

## E. Compatibility

| Item | Plan |
|---|---|
| Default behaviour | `assessment_scope = primary_claimed_skill` for every existing policy row (column default). **No behaviour change** until a new, approved policy version selects `per_skill`. Equivalence test (§F, T-COMPAT-1) |
| Historical results | **Never rewritten.** No backfill of `skill_assessment` for old evaluations. Old `verification_decision` rows (no `skill_assessment_id`) are read as legacy-scope decisions. Old evidence keeps its meaning; readiness facts are unchanged |
| Optional insight | A read-only dry-run report may compute what the per-skill model *would* conclude for past evaluations: informational, never written as decisions, never shown as a level |
| Demonstrations | Demo pack, browser acceptance harness (57/57), API e2e (228/228) and DB proofs run under the legacy scope and must pass unchanged |
| D-118 | Basis rules unchanged; per-skill basis is strictly a restriction of the whole-run basis to S's criteria. No path to a level exists that does not already exist today with an approved rubric |
| F-2 determinism fix (P0) | Changes *which* skill is primary only where today's choice is undefined. New submissions record `position`; legacy rows fall back to an explicit, documented order. A separate approval, because it alters today's behaviour |
| Evidence uniqueness | The migration aborts with a report if historical duplicates exist; nothing is deleted. Expected: none (H6 never ran in production) |
| Verification policies | Untouched by ENG-1. Selecting `per_skill` is a future policy version with its own approval |

---

## F. Tests and acceptance criteria

### F.1 Domain (unit and property)

| ID | Case | Expected |
|---|---|---|
| T-MIX-1 | One run: HTML criteria met, CSS mandatory criterion failed | HTML `met`, CSS `not_met`; activity `below_threshold`; HTML proposal present |
| T-MIX-2 | Activity `passed`, but one claimed skill's criterion below its threshold | that skill `not_met` despite the activity pass |
| T-MIX-3 | Property: random rubric and scores; mutate any criterion outside `applicable(S)` | S's assessment unchanged (INV-PS1) |
| T-MISS-1 | Claimed skill with **no** applicable criterion | `not_assessed`, no proposal (closes F-9) |
| T-MISS-2 | One applicable criterion unscored or pending human | `incomplete`, no proposal |
| T-MISS-3 | Gate failed / blocking integrity check | every skill `blocked` |
| T-THR-1 | Approved `threshold_for_skill` below max; score between threshold and max | `met`. With the threshold unapproved ⇒ max required and basis fails (D-118) |
| T-BASIS-1 | S's criteria all human-decided; another skill's criterion is a rule over an uploaded file | S basis verified; the other skill `assessment_pending_validation` |
| T-BASIS-2 | Demo rubric, or values unapproved | every skill pending validation |
| T-PROP-1 | S1 already `demonstrated`, S2 at `gap` | S2 proposal present (fixes F-4) |
| T-LLM-1 | Assessment kind llm | refused (INV-3) |

### F.2 API / e2e (dev/test policy with `per_skill`; real DB)

| ID | Case | Expected |
|---|---|---|
| T-E2E-MIX | Shared activity: HTML met, CSS not, human-reviewed, approved non-demo test rubric | HTML promoted with its own decision, evidence (`skill_assessment_id`), ledger link and progress; CSS unchanged with a `not_met` assessment; no legacy `verification` row in this scope |
| T-E2E-JUST | Each decision's reason and justification | cite only that skill's criteria and reviewer refs |
| T-E2E-UNVER | Same activity with criteria resting on uploaded files / declared artifacts | `assessment_pending_validation` per skill; no claim row created; no evidence |
| T-E2E-FORGE | `verified.*` / `signal.*` keys; self-written criterion score via a user session; user insert into `skill_assessment` / `verification_decision` | 400 / RLS rejection / RLS rejection |
| T-E2E-DEMO | Demo or draft activity | not startable by a graduate (D-119); under test seeding, every skill pending validation |
| T-E2E-DUP | Evaluate the same submission twice (concurrent and sequential) | one evaluation; 409 / existing view; exactly one assessment, decision and evidence per skill (unique indexes hold under a race) |
| T-E2E-REEVAL | Correction = new submission | new assessments. Earlier ones untouched; standing count per skill = distinct results |
| T-E2E-WD | Withdraw S's evidence | S's standing count drops; a re-establishing pass restores evidence for S only; other skills unaffected |
| T-E2E-WD2 | Withdrawn evidence and a later pass of another skill in the same activity | no re-establishment of S from another skill's result |
| T-E2E-HR | Human finalisation with per-criterion decisions | per-skill outcomes from final scores; reviewer override creates a new decision with `human_override_of` for one skill only |
| T-E2E-TENANT | User B reads A's `skill_assessment`, evaluation, assessment | 404 / zero rows; reviewer payload stays blind (no identity) |
| T-E2E-VER | Rubric v2 published after the submission on v1 | evaluation uses v1's rubric (fixes F-8); missing ⇒ explicit error |
| T-E2E-READY | Readiness after mixed results | claim levels reflect only skills promoted; report never changes a level (BR-024) |

### F.3 Compatibility and DB proofs

| ID | Case | Expected |
|---|---|---|
| T-COMPAT-1 | Legacy scope: full regression (e2e 228, browser 57, DB proofs, eval 30) + snapshot of the writes of one evaluation before and after the change | identical |
| T-COMPAT-2 | Historical rows (no `skill_assessment_id`) | readable; views unchanged; readiness unchanged |
| T-H6-1 | Policy with both `per_skill` and H6 | DB check rejects |
| T-H6-2 | Production-like activation of `per_skill` without approval | refused (guard) |
| T-DB-1 | `skill_assessment` update/delete, including by the service role | refused (immutable trigger) |
| T-DB-2 | `skill_assessment.user_id` ≠ `assessment.user_id` | refused |
| T-DB-3 | Second platform evidence for the same `(result, skill)` | refused (partial unique) |

### F.4 Acceptance criteria

1. All of F.1–F.3 pass.
2. INV-PS1…INV-PS5 hold as tested invariants.
3. Legacy scope is byte-for-byte equivalent.
4. No new path to Practiced or Demonstrated from uploads, declarations, self-scored criteria or client signals.
5. H6 is unchanged and off.
6. No policy is activated.

---

## G. Minimal implementation phases

| Phase | Content | Depends on | Activates anything? |
|---|---|---|---|
| **P0 · Determinism fix (F-2)** | `submission_claimed_skill.position`; both paths order by it (legacy rows: explicit fallback). Test that the initial and finalise paths choose the same primary | PO approval (it changes undefined current behaviour into a defined one) | No |
| **P1 · Domain** | Rubric contract (`thresholdForSkill`, approval flag); `assessSkills`, `assessmentBasisForSkill`, `decideSkillWithPolicy`; INV-PS1…5; F.1 tests | PO approval of this design | No (pure code, unused) |
| **P2 · Schema** | C.2 migration: `skill_assessment`, FKs, partial uniques (with pre-check), `assessment_scope` + H6 exclusivity + guard; DB proofs T-DB-*, T-H6-* | P1 | No (default = legacy scope) |
| **P3 · API (scope-gated)** | Evaluate and finalize branch on `assessment_scope`; per-skill writes (assessment → decision → promote → ledger → progress) in the existing transaction; versioned rubric selection (F-8); additive response fields; F.2 + T-COMPAT tests with a dev/test-only policy row | P2 | No (only dev/test policy rows in tests) |
| **P4 · Readiness consumers** | EXT-2 reads `skill_assessment` (separate decision-pack item) | P3, EXT-2 approval | No |
| **P5 · Graduate UI** | Show per-skill results honestly (copy, no inference); browser acceptance | P3; Graduate UI track approval | No |
| **P6 · Activation** | New `verification_policy` version with `assessment_scope = per_skill`, approved (four eyes, separation of duties), only with SME-approved non-demo rubric values; staging validation | P3, P5, rubric approval, PO | **Yes**, by PO only |
| later | Retire the H6 derivation code path (keep the column, assert false) | P6 stable | — |

P1 and P2 can be reviewed independently of the candidate SME content. Nothing in P0–P3 touches the graduate UI.

---

## H. Risks, unresolved decisions, recommendation

### H.1 Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | **More levels per evaluation.** A wrongly linked criterion → skill would promote the wrong skill | Criterion links are SME-approved rubric content; per-skill basis needs approved values; F-9 closed; tests T-MIX-3 / T-MISS-1 |
| R-2 | The current UI shows **one** transition; several promotions would be under-reported | P5 before P6. The per-skill scope cannot be activated before the UI shows all skills |
| R-3 | Two scopes coexist | The scope is explicit per policy version, and an equivalence test guards the legacy scope. Retire the legacy scope after P6 is stable |
| R-4 | F-9 is latent today | Closed only in the per-skill scope. **Recommend P0 + an F-9 guard in the legacy scope** (refuse to promote a primary with no applicable criteria) as part of P0's approval, since it would otherwise surface with the first approved rubric |
| R-5 | Migration uniqueness | Pre-check aborts with a report; never deletes |
| R-6 | Rubric version pinning (F-8) may expose submissions whose version has no published rubric | Explicit error ("this version is no longer assessable"), never a silent "latest" |
| R-7 | Confidence semantics | Per-skill minimum. No threshold is set (all policy confidence floors remain null) |

### H.2 Unresolved decisions (Product Owner)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| U-1 | Skill scope | S-a · S-b · S-c | **S-a**: assess all skills with criteria, decide claimed only |
| U-2 | Per-skill met rule | all applicable criteria ≥ approved `threshold_for_skill` (else max) · an SME-defined subset | **All applicable**; a subset rule only as a later versioned rubric feature |
| U-3 | Shared precondition | gate and blocking integrity block every skill · per-skill gates | **Shared block** (fail-closed; never a raise) |
| U-4 | Legacy `verification` row in the per-skill scope | not written · write one for the first skill | **Not written**; `verification_decision` is authoritative |
| U-5 | P0 scope | determinism fix only · plus the F-9 guard in the legacy scope | **Both**, as one small, separately approved correctness change |
| U-6 | Human finalisation granularity | whole evaluation · per skill as soon as its criteria are decided | **Whole evaluation** for now |

### H.3 Recommendation

1. **Approve this design.** Authorise **P0** (determinism + F-9 guard), **P1** (domain) and **P2** (schema, inactive) for implementation.
2. **P3** (scope-gated API) follows on review of P1/P2.
3. **Keep H6 disabled permanently.** Its derivation is not a valid route to per-skill results (§A.3).
4. **Do not activate `per_skill`** until the graduate UI can show every skill's result (P5), SME-approved non-demo rubric values exist, and the PO approves a new verification policy version.

**Stopped. Awaiting Product Owner approval.**
- ENG-1 is not implemented.
- H6 is untouched and off.
- No SRS, policy, readiness configuration, production track or graduate UI change.
- No LLM, no deployment.
