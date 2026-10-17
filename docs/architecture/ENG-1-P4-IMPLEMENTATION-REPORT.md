# نَقْلة / NAQLA — ENG-1 P4: Independent Evidence and Readiness Integration — Implementation Report

**Date:** 2026-10-17 · **Scope:** the Product Owner's conditional approval "ENG-1 P4: Independent Evidence and Readiness Integration".

**Status:** implemented as an INACTIVE, development-only pathway. **Waiting for Product Owner approval.** P6 has not begun.

**Restrictions held:**
- Every new rule is inactive. A readiness rule set containing `skill_evidence_path` is **sealed**: it can never be approved, published or production-activated.
- No verification policy was activated in production. D-118 and the verification ladder are preserved. H6 stays disabled.
- Historical decisions and evidence are unchanged. RLS, tenant isolation, immutable provenance and idempotency are preserved.
- SME candidate content and the canonical SRS were not modified.
- No threshold, path value, variant family or task purpose was set on real content. Test clones carry test values only.
- No LLM, no deployment.

---

## 1. Pre-coding audit (P4 design vs. the current system)

| # | Finding | Kind | Resolution |
|---|---|---|---|
| **AC-1** | **Evidence is written only when a level changes or is re-established.** Once HTML reaches Demonstrated from the project, a genuinely independent second task was recorded as "already at Demonstrated" with **no evidence**, so every two-task path was unsatisfiable | **Architectural conflict** | **Reported to the PO before proceeding.** The PO chose *corroborating evidence*: a per-skill policy flag `record_corroborating_evidence` (default off, per-skill scope only, so development-only) records `evidence_corroborated` plus a standing evidence row citing the skill assessment. **No level change, no claim change.** The legacy path never writes it (§3) |
| AC-2 | `activity_spec.is_validation_activity` already exists as `not null default false`, so it cannot say "not reviewed" | Conflict | Added a nullable `task_purpose` (practice / validation / integrated); null ⇒ indeterminate. It must agree with `is_validation_activity` (DB check). The old column is unchanged |
| AC-3 | No `variant_family` exists | Gap | Added a nullable `variant_family`; null ⇒ indeterminate for any path needing ≥ 2 tasks. Both are governed content, immutable from SME review on, for every role |
| AC-4 | The activity "code" (slug) is shared by a demo row and its canonical copy | Ambiguity | Demo rows never count, in any environment (stricter than the design's "production only"). Catalog validation needs a published, non-demo version |
| AC-5 | `readiness_rule.rule_type` is a DB check listing six types | Gap | Extended with `skill_evidence_path` only. EXT-1 is **not** added (§5) |
| AC-6 | `min_evidence_per_skill` counts standing evidence **rows**, with no eligibility or independence | Finding | Unchanged, for historical compatibility. **It must not be used to express an independence requirement.** It now also counts corroborating rows in development |
| AC-7 | No stored text hash; no starter-file list | Gap | Text hashes are computed server-side at fact-build time (NFKC, lower-case, whitespace collapsed; texts under 40 characters are answers, not artifacts, and are not hashed). `activity_starter_checksum` is added and empty. Without starter checksums, a shared starter file counts as reuse (**undercounts, never overcounts**) |
| AC-8 | Interim (needs-human-review) results carry per-skill rows too | Finding | Only final (non-superseded) results count (`not_final`) |
| AC-9 | Readiness rule sets can reach production through ordinary governance | Conflict | A DB seal plus a config-admin guard, mirroring 0029 (§2.4) |
| AC-10 | The legacy-adapter decision (B4-4) was not made | Open decision | Per-rule param `legacy_results: 'exclude' \| 'adapter'`, **default exclude**. The adapter is implemented and tested; choosing it is a rule-set (versioned) decision |
| AC-11 | The SME's condition 3 (integrated assessment) cannot be expressed | Dependency | EXT-1 recommendation (§5). It cannot be configured today, so nothing bypasses it silently |

---

## 2. What was built

### 2.1 Rule schema — `skill_evidence_path` (readiness rule type; `skill_id` required, canonical)

```text
params = {
  min_distinct_tasks: int ≥ 1,                       // per skill; no universal minimum
  counted_criteria: { <activity slug>: { versions: '*' | ['x.y.z', …], criteria: [<key>, …] } },   // ALL listed keys met in that task
  require_validation_activity: boolean,              // allowed only when min_distinct_tasks ≥ 2
  understanding: 'none' | 'within_criterion' | 'integrated_code_understanding',
  understanding_source?: { activity, versions, criteria },   // required for integrated_code_understanding
  legacy_results?: 'exclude' (default) | 'adapter'
}
```

**Validation:**
- **Shape (domain):** unknown keys are refused, along with malformed versions and duplicate keys.
- **Catalog (at rule-set creation):** every counted activity has a published, non-demo version matching `versions`. Every key exists there, is a `skill_evidence` criterion, and **measures this skill** (canonical). A task can never count for HTML through another skill's criterion.

### 2.2 Eligibility of a task result

One (final evaluation result × skill) pair. A pair that fails a check is excluded, and the first failing reason is recorded in the audit.

| Order | Check | Exclusion reason |
|---|---|---|
| 1 | Final (not superseded) | `not_final` |
| 2 | Not demo (activity or rubric) | `demo` |
| 3 | Published | `unpublished` |
| 4 | SME-approved rubric values | `values_unapproved` |
| 5 | Activity listed in the path | `activity_not_counted` |
| 6 | Version listed in the path | `version_not_listed` |
| 7 | No claim anomaly (audit C1–C3) | `claim_anomaly` |
| 8 | Legacy rows only: the rule allows the adapter | `legacy_excluded` |
| 9 | Legacy rows only: the result is attributed to this skill | `legacy_attribution_unverifiable` |
| 10 | Per-skill rows only: claimed (PO-1) | `not_claimed` |
| 11 | Per-skill rows only: `met` | `not_met` (also covers `blocked` and `incomplete`, e.g. an unapproved threshold) |
| 12 | Per-skill rows only: independently verified basis | `unverified_basis` |
| 13 | Decision is `accepted` / `evidence_reestablished` / `evidence_corroborated` — never `exception_granted` (PO-2), pending, `not_applicable` and the like | `decision_not_positive` |
| 14 | Not overridden by a human | `overridden` |
| 15 | In production: the deciding policy is validated | `policy_unvalidated` |
| 16 | Evidence exists | `no_evidence` |
| 17 | Evidence is standing | `withdrawn` |
| 18 | Every counted criterion is `met` in **this** evaluation | `criteria_not_met` / `legacy_criteria_unavailable` |

### 2.3 Independence

Steps, in order:
1. **Collapse by variant family.** Repeated attempts of one activity always collapse (latest standing kept). Different activities in the same family collapse.
2. **Unknown family.** If a ≥ 2-task path counts a task whose activity has no variant family, the outcome is `indeterminate`. **Different activity ids alone never establish independence.**
3. **Artifact reuse.** Tasks sharing a learner upload checksum or a normalized text hash count **once**. Starter files are excluded.
4. **Validation activity**, when required: no validation task ⇒ `not_satisfied`; unknown purpose ⇒ `indeterminate`.
5. **Understanding**, when required: never assessed ⇒ `indeterminate`; not met ⇒ `not_satisfied`.

**Audit output** (ids only, never a checksum or hash):
- `counted` (with `decisionId`, `evidenceId`, `skillAssessmentId`), `collapsed`, `excluded` (with reasons), `reuseConflicts`;
- `independentTasks`, `validationPresent`, `understanding`, `outcome`, `reasons`;
- `developmentOnly`: true when any counted task rests on an unvalidated policy.

### 2.4 Readiness integration (development-only)

**Separation is preserved:**
- **Activity completion:** `evaluation_result.outcome` is never read.
- **Per-skill outcome:** read only as one test of eligibility.
- **Decision and level:** a met assessment does **not** count unless its decision is positive and its evidence stands.
- **Standing evidence:** the rule reads a pointer, never a row count.
- **Readiness:** a set containing `skill_evidence_path` is **never `evaluated`**. Its status is `pending_validation` with `overall: null`, even if it were somehow approved and production-active. Readiness never writes a level (tested).

**Loading.** EXT-2 facts are loaded **only** when the resolved rule set has such a rule, and only for the caller's own user id.

**The seal (migration 0030 plus config-admin):**
- A set with an EXT-2 rule can never be approved, published or production-activated.
- `development_only` requires the transaction-local opt-in `naqla.readiness_ext_dev_activation = on`, and is refused in production.
- An EXT-2 rule can never be added to, or re-typed into, an approved or active set.

**Production:** a development-only set never resolves, so the learner sees `not_yet_configured` (tested).

### 2.5 Corroborating evidence (the AC-1 resolution)

| Element | Rule |
|---|---|
| Policy flag | `verification_policy.record_corroborating_evidence` (default false). A DB check allows it only with `assessment_scope = 'per_skill'`, which can never be approved or production-active (0029) |
| When | The skill is claimed, `met`, on an independently verified basis, with no proposal (already at the level this rubric proposes); the policy accepts rubric proposals; any confidence floor is met. **Never easier than a promotion** |
| Records | Decision `evidence_corroborated` (previous = resulting state). An evidence row with `skill_assessment_id`. Audit event `evidence.corroborated` with `levelChange: false` |
| Never | Changes a level, the claim or its primary evidence. Never runs on the legacy path (DB trigger: a skill assessment is required). Never runs in production (domain throws) |
| Claims (CLM-1) | Positive, with standing evidence of the same skill (the same definition as EXT-2) |
| UI (P5) | «لم يتغيّر المستوى «…» — سُجِّل دليل داعم إضافي». Not counted as a level change; no CV proposal from it |

### 2.6 Migration 0030 (additive; rollback refuses while any EXT-2 rule, corroborated decision, starter checksum or content fact exists)

| Object | Purpose |
|---|---|
| `activity_spec.variant_family`, `activity_spec.task_purpose` (+ format and agreement checks, immutability trigger) | Independence facts (governed content; null = not reviewed) |
| `activity_starter_checksum` (forced RLS, no client grant, content-governed) | Starter files, never a reuse conflict |
| `readiness_rule.rule_type` + `skill_evidence_path`; `readiness_rule_evidence_path_has_skill` | The rule type |
| `readiness_rule_set_evidence_path_seal`, `readiness_rule_evidence_path_seal` | The seal |
| `verification_policy.record_corroborating_evidence` (+ per-skill-only check); decision kind `evidence_corroborated`; `verification_decision_corroboration_consistent` | Corroborating evidence |

### 2.7 API changes

| Surface | Change |
|---|---|
| `GET /v1/me/readiness`, `POST /v1/me/readiness/evaluations`, `GET /v1/me/track-skills` | Additive: a `skill_evidence_path` rule result carries `audit` (ids only). Unchanged for every non-EXT-2 set. The recorded snapshot stores the audit immutably |
| `createReadinessRuleSet` (CLI/admin) | Validates EXT-2 params and catalog; refuses a non-canonical skill |
| `approveConfigRow` / `setConfigActivation` | Refuse to approve an EXT-2 set or activate it other than `development_only` outside production (`assertReadinessSetMayBe`) |
| Evaluation responses / view | `decision: 'evidence_corroborated'` can appear on per-skill (development) results only |
| New read-only module | `apps/api/src/readiness/evidence-facts.ts` (allowlisted by the source-scan test as read-only) |

`DOMAIN_RULESET_VERSION` 0.20.0 → **0.21.0**. The eval record was updated: 30/30 unchanged.

---

## 3. Commits and files

| Commit | Content |
|---|---|
| `28d3b6e` | Code, migration 0030 with rollback, DB proofs, unit and e2e tests, eval record |
| *(this commit)* | This report · `docs/decisions/DECISIONS.md` (D-125) · design-doc status lines |

**Files:**
- `packages/domain/src/evidence-path.ts` (new) and `evidence-path.test.ts` (new)
- `readiness.ts`, `verification-policy.ts`, `per-skill-assessment.ts` (`decideCorroboration`), `career-claims.ts`, `index.ts`, `readiness.test.ts`
- `apps/api/src/readiness/evidence-facts.ts` (new), `readiness.service.ts`
- `configuration/config-admin.service.ts`, `assessment/assessment-recorder.service.ts`, `slice1/evaluation.service.ts`
- `apps/api/test/eng1-p4-evidence.e2e.ts` (new), `eng1-p2-inactive.e2e.ts`
- `apps/app/src/lib/journey.ts`, `apps/app/test/journey.test.ts`
- `supabase/migrations/0030_eng1_p4_independent_evidence.sql`, `supabase/rollback/0030_…down.sql`, `supabase/tests/independent_evidence.sql`, `scripts/db-test.sh`
- `packages/agents/eval/last-run.json`

---

## 4. Tests (the PO's list)

| Required test | Where | Result |
|---|---|---|
| Project plus a genuinely independent short task | e2e P4-1 (API + DB; the second task corroborates, one level change only); unit | ✅ satisfied, 2 tasks, readiness `pending_validation` / `overall: null` |
| Git one-project exception | e2e P4-2/3 (a one-task path satisfied by one project); unit (pending / withdrawn / demo / unverified / criterion not met ⇒ not satisfied) | ✅ |
| Duplicate artifacts and repeated submissions | e2e P4-4 (same family, no family ⇒ indeterminate, retry collapse), P4-5 (shared upload ⇒ 1); unit (text hash, starter file, duplicate candidate) | ✅ |
| Withdrawn evidence | e2e P4-6 (excluded `withdrawn`; decision byte-identical; level unchanged); unit | ✅ |
| Mixed per-skill results from one activity | e2e P4-7 (HTML counts, UI state `not_met` from the same result does not); unit | ✅ |
| Unapproved thresholds and policies | unit (`incomplete` ⇒ `not_met`; `values_unapproved`; production `policy_unvalidated`); e2e P4-8a (demo, proposed thresholds) | ✅ |
| Historical and legacy evaluations | e2e P4-8b (a legacy accepted result: excluded by default, counted only via the adapter rule when attributed); unit (unattributable, criterion-less) | ✅ |
| Unpublished or demo activities | e2e P4-8a (demo run excluded `demo`; a rule naming an unpublished activity is refused at creation); unit | ✅ |
| Cross-tenant access | e2e P4-9a (facts never cross users; a client cannot insert rules, re-family an activity or read starter checksums); DB proofs | ✅ |
| Readiness unconfigured or inactive until approval | e2e P4-9b (approve / production-activate refused; production ⇒ `not_yet_configured`; deactivated ⇒ unconfigured; opt-in required; a snapshot changes no level); DB seal proofs | ✅ |

**DB proofs (`independent_evidence.sql`, 26):**
- content facts: governed, immutable after review, agreement check;
- starter table: governed, no client access;
- rule type: EXT-2 needs a skill; EXT-1 is not a type;
- the seal: approve / publish / production refused; development needs the opt-in; production refused even with it; no slipping or re-typing into an approved set; nothing active at rest;
- corroboration: per-skill only; never on the legacy path; off by default.

---

## 5. EXT-1 (`integrated_assessment_passed`) — dependency audit and recommendation

**Audit.** The SME's three-condition model (decision pack §G):
1. Must skills at the required level. Existing types (`non_compensable_skill`), plus the EXT-2 paths.
2. Core skills at the Junior minimum. `required_skill_at_level`, plus EXT-2.
3. **The integrated practical assessment is passed.** No existing rule type expresses it.

**EXT-1 is necessary.** Without it, a rule set built from conditions 1 and 2 alone would silently drop condition 3.

**Today nothing can bypass it:**
- EXT-1 is not a rule type (DB check plus domain list), so the SME model cannot be configured.
- Every set containing EXT-2 is sealed and never `evaluated`.
- Readiness for this track therefore stays `not_yet_configured` for real users.

**Recommendation (to implement as a separate, sealed step after approval):**

| Item | Recommendation |
|---|---|
| Rule type | `integrated_assessment_passed`. `skill_id` null. Sealed like EXT-2 (never approved/production before P6) |
| Params | `{ activity_code, allowed_versions: [...], pass_rule: 'PR-1' \| 'PR-2', require_concluded_review: true }` — the PR choice is DM-6 (SME + PO) |
| Pass rule — **no new threshold** | **PR-2:** every gate criterion met and every mandatory criterion met (`rubric_criterion.mandatory`), from the final assessment. **PR-1:** PR-2 plus the total ≥ `rubric_version.pass_threshold` **only when `pass_threshold_status = 'approved'`**. Otherwise `indeterminate`. The SME's borderline band is applied only once DM-6 defines it; until then, borderline cases require a concluded human review |
| Eligible result | Final, non-demo, published, values-approved, on an allowed version. Integrity checks passed. Evidence derived from it not withdrawn (a withdrawal "not my own work" voids the pass). The per-skill decisions on it rest on a validated policy in production |
| Outcomes | `indeterminate` (activity unpublished, no approved non-demo allowed version, PR-1 threshold not approved, review pending); `satisfied`; `not_satisfied` with the reason |
| Separation | EXT-1 reads the activity's overall pass (the only rule that does); EXT-2 never does. Neither changes a level |
| Tests | Passed-but-pending; withdrawn; version outside allowed; PR-1 vs PR-2 on the same result; unapproved pass threshold ⇒ indeterminate; demo ⇒ not counted; readiness never moves a level |
| Dependencies | DM-6 (pass rule and mandatory set), the integrated activity's content (`act_fe_integrated_leave_requests`) reviewed and published, its rubric values approved |

---

## 6. Security and provenance results

| Property | Proof |
|---|---|
| Traceability | Every counted task names its decision, evidence and skill assessment (P4-1). Provenance is immutable (0026/0027 unchanged) |
| No client influence | Inputs are server rows (claims and artifacts locked by 0028; content facts governed by 0030). Facts are built for the caller's id only. Checksums never leave the server (asserted on the readiness response) |
| Tenant isolation | P4-9a; RLS unchanged; the starter table has no client access |
| Idempotency | Unique (result, skill) per platform evidence and per skill assessment (0026); duplicate candidates de-duplicated; deterministic audit (property test with 25 shuffles) |
| History | Decisions and assessments byte-identical after withdrawal (P4-6). `verification-integrity` history test (unchanged) passes. Rollbacks refuse to delete history |
| Production | §7 |

---

## 7. Proof that production readiness and verification remain unchanged

| Layer | What holds | Test |
|---|---|---|
| Verification | Corroboration exists only under a per_skill policy (DB check), which can never be approved or production-active (0029). The domain throws in production. The legacy path is refused by a DB trigger. The production safety baseline `default@2` is unchanged (`record_corroborating_evidence = false`) | DB proofs; unit; `verification-integrity.e2e` (production mode) passes unchanged |
| Readiness | No rule set was created by any migration. An EXT-2 set: never approved, published or production-active (DB + config-admin); development requires an opt-in and is refused in production; a development set never resolves in production (`not_yet_configured`, P4-9b); and the engine never reports `evaluated` for a set containing EXT-2 | DB proofs; P4-9b; unit |
| Existing readiness | The six rule types and their outcomes are unchanged. `readiness.e2e` and `configuration.e2e` pass unchanged | Full regression |
| Content | No activity received a variant family, task purpose or starter checksum from the migration (DB proof). Published activities cannot be re-familied | DB proofs |

---

## 8. Full regression (fresh database: migrations 0001–0030, seed, import)

| Suite | Result |
|---|---|
| Unit — domain / config / agents / app | **384** (+53) / 9 / 145 / **26** |
| Agent evals | 30/30 (domain version 0.21.0) |
| Docs check | OK |
| API e2e | **279/279** (+10 P4) |
| DB proofs | **266 PASS, 0 FAIL** (+26), including round-trip 0030 → 0025 → up |
| Browser acceptance | **78/78** |

---

## 9. Approvals needed before P6

| # | Needed | Owner |
|---|---|---|
| A-1 | **Approve or adjust the corroborating-evidence behaviour** as a verification semantics change. It is a new decision kind; claims and readiness treat it as positive evidence | PO |
| A-2 | **EXT-2 and EXT-1 rows** in `EXPERT-RULE-EXTENSION-REGISTER.md`, CHG-017, and approval to implement EXT-1 per §5 | PO |
| A-3 | **Path values per skill** (min tasks, counted criteria per activity version, validation requirement, understanding element), including confirmation of the one-project Git (P-GIT) and A11Y exceptions | SME |
| A-4 | **Content facts on the real activities:** `variant_family`, `task_purpose`, starter-file checksums, reviewed during content review (before SME review; immutable after) | SME + content |
| A-5 | **Per-skill thresholds and rubric values** approved and representable (0029); DM-6 integrated pass rule and mandatory set | SME + PO |
| A-6 | **Legacy results:** keep `exclude` (default) or allow the adapter, per rule-set version (B4-4) | PO |
| A-7 | **The readiness rule set** `junior_frontend_readiness` (DM-2 levels V-a/V-b/V-c) authored as a draft after A-2…A-6 | SME + PO |
| A-8 | **P6 itself:** migrations replacing the per-skill and EXT-2 seals for approved versions; four-eyes approval; staging validation; a production read-only claimed-skill audit; a rollback rehearsal | PO only |

**Stop.** P6 has not begun, and no new rule is active. Waiting for Product Owner approval.
