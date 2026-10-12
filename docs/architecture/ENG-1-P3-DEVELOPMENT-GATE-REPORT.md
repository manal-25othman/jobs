# نَقْلة / NAQLA — ENG-1 P3 Development Gate and Integrity Hardening: Report

**Date:** 2026-10-12 · **Scope:** the Product Owner's request "ENG-1 P3 Development Gate and Integrity Hardening".
- **Phase A:** close the remaining integrity gaps.
- **Phase B:** implement P3 as an inactive development pathway.

**Status:** implemented and verified. **Waiting for Product Owner approval.**

**Restrictions held:**
- No verification policy, SME candidate content, readiness rule or automated assessment was activated.
- H6 is not enabled.
- The per-skill pathway runs only under a test-only development policy, with an explicit opt-in. It is never active at rest and cannot run in production.
- No professional threshold was approved, invented or activated. Fixture approvals in tests are test data only.
- The canonical SRS and the CV/LinkedIn policy approvals were not edited.
- No LLM was connected and nothing was deployed.
- D-118, D-119 and D-120 are preserved. RISK-GROUNDING-01/02 stay open. Verified stays blocked.
- The Graduate Activity UI was not redesigned. The P3 pathway is not exposed to the normal graduate UI.

---

## 1. Commits, migrations and files

| Commit | Content |
|---|---|
| `8e0908e` | Phase A + Phase B code, migrations, tests, ruleset version 0.20.0, eval record (see the file list below) |
| *(this commit)* | This report · `docs/decisions/DECISIONS.md` (D-123) · `docs/architecture/ENG-1-PER-SKILL-ASSESSMENT-DESIGN.md` (status line) |

### Migrations

Both migrations are additive. No row is rewritten and nothing is activated.

| Migration | Rollback | Content |
|---|---|---|
| `supabase/migrations/0028_eng1_integrity_hardening.sql` | `supabase/rollback/0028_eng1_integrity_hardening.down.sql` | A1 constraint `verification_policy_no_submission_promotion` (added NOT VALID, validated when no historical row violates it) · A3 client write revocation on `submission`, `submission_artifact`, `submission_claimed_skill` (dormant insert policies dropped) · A3 trigger `submission_claimed_skill_guard` (all roles) |
| `supabase/migrations/0029_eng1_p3_development_pathway.sql` | `supabase/rollback/0029_eng1_p3_development_pathway.down.sql` (refuses while a per_skill policy is not inactive) | Replaces the P2 seal with `verification_policy_per_skill_development_only` · test opt-in trigger `verification_policy_per_skill_dev_guard` · O-3 constraint trigger `rubric_criterion_threshold_representable` |

### Files

| Area | Files |
|---|---|
| Domain | `packages/domain/src/career-claims.ts` (CLM-1 helper) · `verification-policy.ts` (submission-promotion guard, `assessmentScope`) · `per-skill-assessment.ts` (`thresholdRepresentable`, production refusal) · `evaluator.ts` (`levelScores`) · `index.ts` (`DOMAIN_RULESET_VERSION` 0.19.0 → **0.20.0**) |
| Domain tests (new) | `packages/domain/src/eng1-phase-a.test.ts` · `eng1-p3.test.ts` |
| API | `apps/api/src/agents/claim-drafts.ts` (CLM-1) · `slice1/submission.service.ts` (A1 runtime gate) · `configuration/config-admin.service.ts` (`assertVerificationPolicyMayBe`) · `assessment/assessment-recorder.service.ts` (scope column, `skillAssessmentId` on decisions) · `evidence/evidence-ledger.service.ts` (per-skill ledger links) · `slice1/evaluation.service.ts` (per-skill writer + read model) · `slice1/activity-catalogue.service.ts` (My Work representative decision) |
| API tests | `apps/api/test/eng1-phase-a.e2e.ts` (new) · `eng1-p3-per-skill.e2e.ts` (new) · `eng1-p2-inactive.e2e.ts` (updated for P3: the per_skill policy is never validated or active at rest; the code that touches the pathway is limited to an allowlist, with My Work read-only) · `human-review.e2e.ts` (two client writes now refused by privilege instead of matching zero rows) |
| DB proofs | `supabase/tests/integrity_hardening.sql` (new, 35) · `supabase/tests/per_skill_development.sql` (new, 17) · `supabase/tests/per_skill_schema.sql` (seal proofs updated, +1) · `scripts/db-test.sh` (new proofs; round-trip now 0029 → 0025) |
| Eval record | `packages/agents/eval/last-run.json` (domain version 0.20.0; 30/30 unchanged) |

---

## 2. Phase A — integrity fixes

### A1 — submission-based promotion can never be validated or active

**Rule:** `practiced_on_submission = true` may exist only on an inactive or development_only draft. That covers the pre-0023 history row `default@1` and the e2e compatibility policy `default@900`. It is never allowed on an approved or published policy, nor on one that is production_active or the legacy baseline.

| Boundary | Enforcement |
|---|---|
| Database (0028) | Constraint `verification_policy_no_submission_promotion`. Historical rows are preserved: the constraint is added NOT VALID, then validated when nothing violates it (validated on every database we have). Any later INSERT or UPDATE must satisfy it, including approval and activation. |
| Policy validation | `assertSubmissionPromotionNotEnabled` (domain), called by `approveConfigRow` and `setConfigActivation` through `assertVerificationPolicyMayBe` (config-admin; covers the CLI, the admin API and anything else that approves or activates). |
| Runtime | `submissionPromotionInEffect(policy, {production})`: the submission service records Practiced on submission only outside production, and only under an unvalidated policy that enables it. |

**Tests:**
- DB: 10 proofs, among them approve / publish / insert-approved / baseline / production_active refused, an approved row cannot switch it on, and `default@1` is unchanged.
- Unit: 3 tests.
- e2e: 4 tests (config-admin approve refused, activation refused, the database refuses a bypass, no validated or active row has it).

### A2 — CLM-1: only a positive verification decision supports a claim

**Before:** any `verification_decision` row for a skill satisfied "requires a recorded verification decision", including `not_applicable`, pending, rejected and blocked decisions.

**Now:** the domain helper `isPositiveVerificationDecision` counts a decision only when all of the following hold:
- the decision is `accepted` or `evidence_reestablished`;
- it produced an evidence row, for the same canonical skill, and that evidence is still standing (not withdrawn);
- no later human decision overrides it;
- the resulting state is above `gap`.

`exception_granted` is excluded (fail closed) until its claim semantics are an approved expert decision.

`claim-drafts.ts` loads each decision with its evidence and override facts and builds the set with `skillsWithPositiveVerificationDecision`. The grounding and claim-approval requirements are unchanged. No claim policy sets `requires_verification_decision` today, so there was no live impact.

**Tests:**
- Unit: 12, including the CLM-1 reproduction through `claimEligibility`.
- e2e: 3. A real `not_applicable` decision does not count; an accepted decision counts until its evidence is withdrawn, while the decision history stays unchanged; pending / rejected / escalated / downgraded decisions never count.

### A3 — claimed skills cannot be manipulated by direct database writes

**Audit:**

| Input | Before | After |
|---|---|---|
| `submission_claimed_skill` | Client INSERT policy (owner only), no activity-mapping check, insertable after evaluation (finalize re-reads claims) | Client roles hold no INSERT, UPDATE or DELETE |
| `submission_artifact` | Client INSERT policy, bypassing the D-118 platform-only namespaces (`verified.*`, `signal.*`) | Client writes revoked (a forged `verified.*` artifact is refused) |
| `submission` | Client INSERT policy | Client writes revoked |
| `activity_skill` | SELECT only | Unchanged (proved) |
| `verification_decision`, `audit_event` | Write grants, but no write policy, so RLS denies | Unchanged (proved: RLS refuses forgery) |

The API writes these tables only as the trusted server. This was verified: no client-role writer exists.

**For every role**, trigger `submission_claimed_skill_guard` enforces that a claimed skill:
- belongs to the submission owner;
- is an active, canonical skill (aliases are refused);
- on a platform activity, is one of the activity's mapped skills (`[skill_not_mapped_to_activity]`);
- is recorded before the submission is evaluated;
- is never updated;
- is never removed from an evaluated submission.

Account and submission deletion still cascade. Historical rows are not re-checked (a notice reports any outside the mapping).

**Legitimate workflows preserved:** API submission with mapped skills (primary and secondary), personal projects, deletion of an unevaluated claim by the server, and tenant isolation (another user sees and adds nothing).

**Tests:**
- DB: 25 proofs (client, other tenant, anon, service_role, owner, cascade).
- e2e: 2 tests (API plus direct client, after evaluation, cross-tenant).

---

## 3. Phase B — P3 as an inactive development pathway

### Design as implemented

**Policy scope.**
- `verification_policy.assessment_scope` (`primary_claimed_skill` | `per_skill`) is now read into the domain policy (`assessmentScope`).
- A `per_skill` policy must use the `independently_verified` basis, never promote on submission, and never enable H6. Both the domain and the database enforce this.

**Branch.**
- The evaluation service resolves the policy in effect (`policyScope`) before running.
- Under `per_skill`, the legacy P0 attribution is not used.
- The run-level proposal is withheld: the whole-activity result moves no level by itself.
- `applyPerSkill` runs after the structured assessment, in both the initial evaluation and the human-review finalisation, in the same transaction.

**The per-skill writer** handles every claimed canonical skill independently. Claims are guaranteed mapped by A3, so every claimed skill is eligible; nothing unclaimed is assessed. For each skill:
1. `assessSkills` (P1 domain) uses only that skill's own criteria, its own previous state, and an independent-verification basis restricted to its criteria.
2. It records `skill_assessment` (the pinned rubric version and its resolution, model `per_skill@1`, ruleset 0.20.0) and one `skill_assessment_criterion` per criterion. Each criterion row links the exact `assessment_criterion_result` with the threshold and value status used.
3. `decideSkillAssessment` decides from that assessment alone. The skill's own standing evidence counts distinct results; withdrawn evidence never counts.
4. On `accepted`, `promote` moves that skill alone, and its evidence carries `skill_assessment_id`. On a met skill whose own evidence was withdrawn, the skill is re-established (D-077) with evidence citing its new assessment.
5. `verification_decision` is recorded with `skill_assessment_id`.
6. One ledger item links every assessed skill and each skill's evidence. The journey (`skill_progress`) is applied per skill, with that skill's own `produced_evidence`.

**Not written:** no legacy `verification` row (no dual-write of a single-skill result).

**Required behaviours:**

| Requirement | Behaviour |
|---|---|
| Missing criteria | `not_assessed`, never a promotion |
| Global integrity failure | A blocking check or an unmet gate ⇒ every skill `blocked` |
| Rubric version | Evaluation uses the rubric bound to the submission's activity version (P0 pinning); the skill assessment records it |
| Human findings | Each criterion decision is linked to the skill it measures, then to the reviewer's `criterion_review`; finalisation stays per evaluation |
| Idempotency | A repeated evaluate answers the existing evaluation; finalisation runs once per evaluation (state check); the database refuses a second assessment per (assessment, skill), a second decision per assessment, a second evidence per assessment, and a second platform evidence per (result, skill) |
| Provenance | The per-skill records are immutable (0026 triggers); evidence history is immutable (0027) |

### Threshold semantics (O-3), as instructed

- `threshold_for_skill` is a fraction of the criterion's maximum score in (0, 1].
- A threshold is usable only when its value status is `approved` **and** it is representable: t × max is an integer and, when the criterion has scoring levels, the score of one of them.
- Enforced in the domain (`thresholdRepresentable`) and in the database (0029 constraint trigger, at commit).
- An approved but unrepresentable value, or an unapproved one, leaves the criterion `threshold_unapproved` and the skill `incomplete`. There is no full-marks fallback.
- No threshold value was approved, changed or invented. The canonical values remain *proposed*, so on canonical content every skill is `incomplete` and **no level is awarded**.

**Without approved thresholds and evidence requirements, no level is awarded:**
- A skill is `met` only with approved, representable thresholds on all its criteria.
- A decision is `accepted` only when the skill's basis is independently verified. That requires SME-approved rubric values, non-demo content, and named-reviewer or platform-verified criteria.
- Otherwise the outcome is recorded as a test-only record (`incomplete` / `assessment_pending_validation` / `not_applicable`) and no level moves.

### Test mechanism (development seal)

- 0029 replaces the P2 seal ("per_skill ⇒ inactive") with a development seal: a `per_skill` policy is an **unapproved draft**, either inactive or development_only. It is never approved, published, production_active or a baseline.
- Making a `per_skill` policy development_only additionally requires the transaction-local opt-in `naqla.per_skill_dev_activation = 'on'`, and is refused when `naqla.production = 'on'`.
- The opt-in authorises nothing else.

---

## 4. API contracts and compatibility

All changes are **additive**. Legacy-scope responses are unchanged except for one new field: `skills: []`.

**`POST /v1/submissions/:id/evaluate`, the finalisation result, and `GET /v1/submissions/:id/evaluation`:**

| Field | Legacy scope (every real user) | Per-skill development scope |
|---|---|---|
| `outcome`, `criteria`, `totalScore`, `maxScore`, `integrityChecks`, `reason`, `rubricVersion`, … | Unchanged | Unchanged (whole-activity facts) |
| `transition` | Unchanged | The first level change among the skills (sorted by skill id), or null |
| `verification` | The legacy row plus `decision` | No legacy row exists, so the representative decision `{decision, reason}` is used. That is the decision that moved a level, else a re-establishment, else pending, else the first |
| `verificationDecision` | Unchanged | The representative decision |
| `levelAttribution` | `attributed` / `ambiguous` / `no_candidate` / null | `per_skill` (new value) |
| `skills` *(new)* | `[]` | One entry per assessed skill (schema below) |
| `workStatus` | Unchanged | From the representative decision; `level_recorded` when any skill moved |

**`skills[]` entry:**
- identity: `skillId`, `skillSlug`, `skillLabelAr`, `skillAssessmentId`, `claimed`;
- outcome: `outcome` (`met | not_met | incomplete | not_assessed | blocked`), `currentState`, `proposedState`, `reason`;
- basis: `basisIndependentlyVerified`, `basisReasons[]`;
- rubric: `rubricVersion`, `rubricResolution`;
- `criteria[]`: `{key, status, score, maxScore, threshold, thresholdStatus, evaluatorKind}`;
- `decision`: `{decision, previousState, resultingState, reason}`;
- `evidence`: `{id, withdrawn}` or null.

The evaluate response carries the same data with `decision` and `evidenceId`/`transition` inline.

**`GET /v1/projects` (My Work):**
- Unchanged for legacy results.
- For a per-skill result, the representative decision follows the same rule as the view (test 9 proves they agree).
- Decisions are now read in `decided_at` order, which is deterministic.

**Compatibility evidence:** e2e test P3-9 checks every legacy field on a per-skill view. It also checks a legacy evaluation under the compatibility policy: `transition`, the legacy `verification.outcome`, `levelAttribution: 'attributed'`, `skills: []`, and no `skill_assessment` rows. The full regression below shows every pre-existing suite unchanged.

**Read-model changes needed to display all per-skill results (P5 UI, not implemented):**
1. The evaluation page must render `skills[]` (one card per skill: outcome, own criteria with reviewer-decided levels, decision, evidence or withdrawn), instead of the single `transition`/`verification`.
2. `attributionNoticeAr` must handle `levelAttribution = 'per_skill'`. Today it shows no notice for that value, and the type `LevelAttribution` in `apps/app/src/lib/journey.ts` needs the value.
3. My Work must show a per-skill summary (for example "HTML recorded · form validation not yet"). A single `decision` cannot express mixed outcomes, so `latestSubmission` needs an additive `skills: [{skillId, outcome, decision}]`.
4. Copy for `incomplete` (no approved threshold), `not_assessed` (no criterion measures the skill) and `blocked` must never imply the graduate failed a skill they were not assessed on (the O-1 rule).
5. The Skills / Evidence pages already read per skill; they need the `skill_assessment_id` provenance link only if the PO wants it shown.

---

## 5. Security, RLS and idempotency results

| Property | Proof |
|---|---|
| Direct client claim insertion (outside coverage / mapped / after evaluation / delete / re-point) | DB 6 proofs + e2e: `permission denied` |
| Every role: unmapped, alias, after evaluation, wrong owner, update, delete-after-evaluation | DB 6 proofs: refused by `submission_claimed_skill_guard` |
| Forged platform artifact, forged submission | DB + e2e: `permission denied` |
| Forged decision / audit event (attribution records) | DB: RLS refuses |
| Client write on `skill_assessment` / `skill_assessment_criterion` / evidence provenance | e2e P3-8 + 0026/0027 proofs: `permission denied` |
| Client update of a decision | Touches 0 rows (no update policy) |
| Cross-tenant | Another user reads 0 per-skill rows; `GET` / `POST` on someone else's submission returns 404; anon has no access |
| Idempotency | e2e P3-6: a repeated evaluate returns the same evaluation (`alreadyEvaluated`); row counts unchanged; duplicate assessment / evidence refused by unique constraints |
| Evidence withdrawal | e2e P3-7: the evidence keeps `skill_id`, `skill_assessment_id` and `evaluation_result_id`; the assessment and decision are byte-identical; the view marks the evidence withdrawn; only that skill re-establishes, from its own new assessment |
| Not exposed to the normal graduate UI | No UI code changed. Real users run under the legacy scope (`skills: []`) |

---

## 6. Fresh full regression (after the final change)

The database was rebuilt from scratch: all migrations 0001–0029, then seed, then import of `trk_frontend_junior`.

| Suite | Result |
|---|---|
| Unit — domain | **331/331** (was 309; +15 Phase A, +7 P3) |
| Unit — config / agents / app | 9/9 · 145/145 · 18/18 |
| Agent evals | **30/30** (domain version 0.20.0) |
| Docs consistency (`npm run verify`) | OK |
| DB proofs (`scripts/db-test.sh`) | **239 PASS, 0 FAIL** (invariants 42 · rls 81 · per_skill_schema 37 · evidence_integrity 24 · integrity_hardening 35 · per_skill_development 17 · rollback/round-trip 3), including round-trip 0029 → 0025 → up |
| API e2e (`dist/test/*.e2e.js`) | **268/268** (was 248; +9 Phase A, +11 P3) |
| Browser acceptance | **65/65** |

---

## 7. Proof that no production pathway can activate per-skill verification

Each layer is independent, and each is tested:

| # | Layer | What it refuses | Test |
|---|---|---|---|
| 1 | DB constraint `verification_policy_per_skill_development_only` | A per_skill row that is approved, published, production_active, a baseline, legacy-basis or submission-promoting, **whatever the session settings** | per_skill_development.sql (6) · per_skill_schema.sql · e2e P2 |
| 2 | DB trigger `verification_policy_per_skill_dev_guard` | development_only without the explicit opt-in; development_only when `naqla.production = on`, even with the opt-in | per_skill_development.sql (3) · e2e P2 · P3-10a |
| 3 | DB `config_activation_guard` (0014) | Any development_only activation in production | P3-10a |
| 4 | `resolveActiveConfig` | In production only production_active or the baseline resolve; a development_only row is invisible | P3-10a (evaluate in production mode is refused; nothing is written) |
| 5 | `policyScope` (evaluation service) | A per_skill scope resolved in production (fail closed) | Source assertion, e2e P2 |
| 6 | `applyPerSkill` | Any call in production | Source assertion, e2e P2 |
| 7 | Domain `decideSkillAssessment` | `production: true` | Unit eng1-p3 |
| 8 | config-admin `assertVerificationPolicyMayBe` | Approving a per_skill policy; activating it as anything but development_only; any per_skill activation in production | P3-10a (approve and production_active refused) |
| 9 | At rest | No per_skill policy is active after the suites (the P3 suite restores the legacy policy); no decision rests on a validated per_skill policy | e2e P2 |

The only way to change layer 1 is a new migration, which needs Product Owner approval.

---

## 8. Remaining requirements for P4–P6

| Phase | Requirement | Owner |
|---|---|---|
| **P4 · Readiness consumers** | EXT-2 reads `skill_assessment` (per-skill outcomes and provenance) for readiness. Needs the EXT-2 decision-pack approval. Readiness thresholds stay unactivated. | PO + SME |
| **P5 · Graduate UI** | The read-model changes in §4 (evaluation page `skills[]`, `per_skill` notice, My Work per-skill summary, honest copy for `incomplete` / `not_assessed` / `blocked`), plus browser acceptance. Required **before** any activation (R-2). | Graduate UI track + PO |
| **P6 · Activation** | **(a)** SME approval of per-skill thresholds and rubric values on non-demo rubrics (B-3); every approved value must be representable (0029 enforces it). **(b)** A new migration replacing the development seal, allowing an approved per_skill policy version. **(c)** Four-eyes approval and separation of duties for that version. **(d)** Staging validation on SME-approved content. **(e)** PO decision. | PO only |
| Open decisions | U-1 confirmed as implemented: claimed (and mapped) skills only; unclaimed skills are not assessed. Whether skills measured but not claimed should be recorded "for the record" is open. `exception_granted` claim semantics (CLM-1 excludes it). Whether historical claimed skills outside the activity mapping (pre-0028) need review (0028 reports a count; none in our databases). | PO |
| Later | Retire the H6 derivation path (keep the column, assert false) once P6 is stable. Retire the legacy scope after P6 is stable (R-3). | Engineering |

**Stop.** Waiting for Product Owner approval.
