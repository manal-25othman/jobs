# نَقْلة / NAQLA — Phase 9 Implementation and Final Architecture Review
**Date:** 2026-10-09 · **Decision:** D-117 · **Status:** implemented, awaiting Product Owner review.
**No new phase has been started. Nothing has been deployed. The re-grounding procedure has not been run on real user data.**
**Audit before code:** `PHASE-9-PACK-CONSTRAINT-AUDIT.md`. **Runbook:** `docs/ops/GROUNDING-DEPLOYMENT-PROCEDURE.md`. **Extension register:** `EXPERT-RULE-EXTENSION-REGISTER.md`.

---

## 0. Summary

| Owner requirement | Outcome |
|---|---|
| 1 · Historical asset re-grounding | **Procedure documented and tested end to end** (8 e2e tests).<br>A **true dry run** did not exist: the old `claims-revalidate --reground` wrote immediately. It was added as the smallest safe implementation: the same code path inside a transaction that is always rolled back.<br>Execution requires an operator with a `product_owner` grant. Reconciliation must pass, or the whole run rolls back.<br>**Two exposure gaps found and closed.** (a) The case-study share link opened for any asset the user had once approved. (b) Evidence withdrawn directly by its owner through RLS left the asset presented in reports and links. |
| 2 · Role separation | Verified and **tightened on identity**: the person activating or publishing may not be the person who drafted, submitted, edited or approved the item (or a change it carries). This is enforced in the service and, for activation, **in the database**. Roles come from grants; a role named in the request is ignored. 8 negative e2e tests. |
| 3 · Configurable pack constraints (H5) | The seven profession-dependent numbers are now **governed, versioned configuration**. The baseline `legacy_pack_constraints@1` holds them exactly and is **not approved**. An equivalence proof covers an exhaustive boundary grid plus 20,000 seeded packs. Missing or conflicting configuration fails explicitly, and production never uses unvalidated sets. **H3:** the evidence count now comes from role-skill configuration. |
| 4 · Expert configuration | Supported rule types are actionable through the Track Builder. An unknown rule type is **refused, never interpreted**; it is recorded as an explicit extension in the register. |
| 5 · Existing functionality | No Admin UI redesign: one generic kind was added, using the same page and controls. No graduate page was changed. No refactor of activity or rubric versioning. All earlier safeguards are kept. One Phase 7b over-strictness was corrected (§4). |
| 6 · Remaining risks | RISK-GROUNDING-01 and RISK-GROUNDING-02 remain **open**. No LLM is connected. No unapproved vocabulary was activated. **No production readiness is claimed.** |

---

## 1. Migrated constraints and preserved invariants

### Migrated: profession-dependent numbers → `pack_constraint_set` (migration 0022)

| Constraint type | Legacy baseline | Bounds shape | Structural floor |
|---|---|---|---|
| `core_skill_count` | 4–5 | range | ≥ 1 |
| `task_count` | 10–12 | range | ≥ 1 |
| `activity_count` | 3–3 | range | ≥ 1 |
| `activity_primary_skill_count` | 2–3 | range | ≥ 1 |
| `activity_core_primary_skill_count` | 2–3 | range | ≥ 1 |
| `rubric_min_criteria` | ≥ 5 | minimum only | ≥ 1 |
| `resources_per_skill_max` | ≤ 3 | maximum only (also Q08) | ≥ 1 |

**H3:** `evidencePathStatus` reads `role_requirement.minimum_evidence_count`. A missing value returns `evidence_count_not_configured`; nothing is assumed. The shipped pack states exactly the legacy values (core 2, others 1), and a test proves the statuses are unchanged.

### Preserved in code and database
The full classification is in the audit.
- **Technical:** enums, references, formats, uniqueness, threshold ranges.
- **Security / governance:**
  - no market data;
  - packs are always draft or curated, and a pack cannot approve itself;
  - never Verified;
  - provenance on every record;
  - integrity-check invariants I1–I3 and OPEN-045;
  - rubric value approval only by a named SME.
- **Structural:** every core skill has an evidence path; criterion descriptors exist; bilingual fields; G-14 presentation coverage.
- **Owner decision:** framework independence (D-084).

The configuration itself cannot go below the structural floors, enforced in both the domain and the schema. Its vocabulary is closed: a database enum plus a domain list.

## 2. Configuration versioning and approval flow

`pack_constraint_set` reuses the existing governance unchanged:
- `review_status` + `activation`, guarded by `config_activation_guard`;
- production requires an approved row with a named approver;
- content and child constraints are frozen once activated (the baseline included);
- every change is recorded in `config_change`;
- four eyes and separation of duties apply.

**Flow:**
1. A track administrator drafts a new version in the Track Builder. It can be global or scoped to a track. There is no JSON: typed selectors and number fields.
2. The administrator submits it for review.
3. A named SME approves it, and may not be the drafter.
4. A product owner activates it, and may be neither the drafter nor the approver.

**Resolution:** a track-specific set in effect wins over the global one. Within a scope the order is production_active > development_only (never in production) > legacy_baseline. Conflicts are prevented at activation (unique index per scope and level) and refused at resolution. If nothing is in effect, validation stops with an explicit error.

**Traceability:**
- `validatePack(pack, constraints)` has **no default**.
- Every non-dry-run validation writes `pack_validation_run` (append-only) with the set@version, the resolution and the outcome.
- The import report and the CLI print the set it ran under.

**Bug found and fixed during testing:** activating a track-specific version derived from the global baseline (same key) caused the Track Builder to deactivate the global baseline as a "replacement", so every other track would have lost its constraints. Replacement and uniqueness are now scoped per key and scope. A regression assertion covers it.

## 3. Backward-compatibility tests

| Proof | Where |
|---|---|
| Baseline row = frozen reference `LEGACY_PACK_CONSTRAINTS`; in effect; `draft`, approved_by null | `pack-constraints.e2e` |
| Configured checker ≡ the old hard-coded checks (`legacyPackCountViolations`): exhaustive boundary grid and 20,000 seeded random packs | `pack-constraints.test.ts` |
| The canonical pack imports exactly as before (no new snapshots); recorded under `legacy_pack_constraints@1 (global, legacy_baseline)` | `pack-constraints.e2e` |
| The same packs are refused, with the stable wording ("exactly 3 expected", "4–5", "2–3 CORE skills", "10–12") | e2e and unit tests; all existing `career-data.e2e` tests pass unchanged except their validator call |
| H3: pack values = legacy function; every status unchanged; Q06 and Q08 pass on the shipped track | `pack-constraints.e2e`, `career-data.test.ts` |
| Expert numbers act without code (resources 3→5 on one track); other tracks keep the baseline; rollback restores it | `pack-constraints.e2e` |

## 4. Deployment / re-grounding procedure

**Commands:**
- `claims-standing` gives the pre/post counts.
- `claims-reground --dry-run` produces the plan with nothing written and no notification sent.
- `claims-reground --operator <uuid> --reason` executes.
- `claims-public-freeze` is the pre-deployment step.
The full runbook, with failure and recovery steps, is `docs/ops/GROUNDING-DEPLOYMENT-PROCEDURE.md`.

**Tested on a scratch database** with simulated historical assets (one supported, one claiming a client and a percentage):
- **Before:** both are hidden everywhere.
- **Dry run:** the plan says KEEP / REVIEW with reasons, and the counts of events, notifications and public state are unchanged.
- **Refused runs:** no operator, an operator without the `product_owner` grant (SME + admin), or an empty reason. Each changes nothing.
- **Execution:**
  - the supported asset is re-grounded, with an event naming the operator;
  - the unsupported one moves to `needs_review`, with its approval and wording untouched, never marked grounded, and its owner notified;
  - reconciliation holds and the audit is recorded.
- **Exposure:**
  - the private report, the recruiter share link and the case-study share link show only the eligible asset;
  - freeze closes the case-study path, and the next completed run reopens it;
  - nothing is ever restored.
- **Direct withdrawal:** an owner withdrawing evidence through RLS, bypassing the service, closes every presentation path at once, and the next dry run names the asset.

**Corrected along the way:** the Phase 7b policy re-check counted a re-linked asset's *historical* withdrawn link (kept by D-077) as current. A claim-policy activation would therefore have pushed correctly re-linked assets back to review. The re-check now uses the current basis: withdrawals superseded by a later re-link are history.

## 5. Authorization and multi-role tests

`separation-of-duties.e2e` (8) and the existing `track-admin.e2e` (17):
- **All three roles on one account:** it may draft, but cannot approve its own work. After another SME approves, it still cannot activate its own draft.
- **SME + PO:** cannot activate what they approved. An independent product owner can. Anyone with the role may deactivate, because rollback is a safety act.
- **Database:** an activation carrying the drafter's or approver's identity (`naqla.config_actor_id`) is refused even with direct SQL.
- **Role forgery:** a role in a header or body (`x-naqla-role`, `rolePerformed`) is ignored. The audit records the granted role and the real actor.
- **Track versions:** the drafter or decider of a carried change cannot activate the version, and neither can the version's approver.
- **Content:** the author or submitter cannot review their own content, and the creator, submitter, editor or approver cannot publish it. An independent product owner publishes.
- **Rubric values:** the submitter cannot approve values (added to the existing editor check).
- **RLS proofs, run as `authenticated` / `anon`, never as postgres or service_role:**
  - no self-granted roles;
  - no reading or writing of pack constraints, validation runs, grounding state or track changes;
  - validation runs are append-only;
  - the baseline is frozen;
  - case-study links close for needs_review, withdrawn evidence, a version mismatch or a frozen state.

**Known limit:** CLI operator acts carry a name, not an identity, and are outside the database separation check. They are operator tools, which matches the existing posture, and are documented.

## 6. Remaining SME decisions (nothing finalised)

All are shown as pending in the Track Builder.
1. Mandatory skills.
2. Core/supporting classification.
3. Readiness thresholds.
4. Rubric weights.
5. Evidence counts and source strengths.
6. Verification thresholds.
7. CV bullet at Practiced.
8. Challenge triggers.
9. Grounding vocabulary approval.
10. **New:** pack structure constraints (all seven baseline numbers).
11. **New:** the per-skill evidence count used by H3.

Production uses the unapproved baselines only because they **are** the pre-existing behaviour. Each is labelled "legacy baseline — not SME validated".

## 7. Remaining security and production blockers

| # | Blocker | Status |
|---|---|---|
| B1 | **Live Supabase verification** (auth, RLS on the hosted project, storage) | Blocked; required before production acceptance |
| B2 | **Browser walkthrough** of the graduate flow and the Admin Track Builder with real auth | Not done; required |
| B3 | **RISK-GROUNDING-01** (no G3 corpus or measured error rates; relations not checked; vocabulary unvalidated) and **RISK-GROUNDING-02** (unsupported action verbs) | Open; block any real LLM and production claim generation |
| B4 | **SME validation** of every value in §6 and of the grounding vocabulary. Production claims need a validated vocabulary (fail closed today) | Not started (no SME engaged) |
| B5 | **Independent security review** (ACCESS-CONTROL-MODEL §7) | Not done; required before launch |
| B6 | **First real deployment of 0020–0022** must follow the runbook, with explicit approval for the run on real data | Pending approval |
| B7 | Role grants have no UI or second-person check. A mis-grant is the main human risk | Operator process; grants are audited and revocable |
| B8 | Rate limiting and the export path (ACCESS-CONTROL §7) | Not built |
| B9 | Verified stays blocked; H6 is blocked in production; challenges are not activatable | Intended (not blockers to a pilot) |

## 8. Final architecture review

**What holds**

1. **One configuration engine.** All nine governed tables share one guard, one activation service, one audit trail and one resolution model, from verification policy to pack constraints. The Track Builder is a view over it.
2. **Evidence before claims.**
   - The evidence ladder is forward-only, Verified is blocked, and the AI is never the judge.
   - Claims are grounded in recorded facts (G1+G2).
   - Presentation is decided at read time by a single gate: active, approved, evidence-backed, eligible under the policy in effect, grounded under the version in effect, and citing no later-withdrawn evidence. The direct public path repeats the gate in the database.
3. **History is never rewritten.** This covers approvals, `config_change`, review logs, standing events, grounding public-state logs and pack validation runs.
4. **Fail closed** wherever configuration is missing, ambiguous or unvalidated: claim policy, grounding vocabulary, grounding version, pack constraints and the public grounding state.
5. **Separation of duties on identity**, enforced in the service and the database.

**Known weak points (accepted for now, documented)**

- **Grounding is lexical.** It is safe to over-reject, but it cannot detect unsupported action verbs (RISK-GROUNDING-02) or relations.
- **Unvalidated baselines in production.** The legacy baselines carry the pre-existing behaviour and stay in production until SMEs validate them.
- **Gaps outside the governed config model:**
  - a new version of a published activity or rubric is not supported (needs a refactor; approval required);
  - published skill labels cannot be edited;
  - there is no level scope for pack constraints.
- **Mixed-scope families in the Track Builder:** when a track-specific set shares its key with the global baseline, the "in effect" label in the version list is computed per key, not per scope. Resolution itself is correct and tested.

## 9. Prioritised plan for pilot readiness

None of these steps is started. Each needs the owner's approval.

1. **Live environment verification (B1):** the hosted Supabase project, migrations 0001–0022 applied, RLS proofs re-run against it, auth flows. Then the **first runbook run on real data** (B6), with explicit approval.
2. **Browser walkthrough (B2):** graduate flow end to end; Admin Track Builder with three real people in the three roles; record the findings.
3. **SME engagement (B4):** one named frontend SME validates the 11 pending decision groups and the grounding vocabulary through the Track Builder. This is the first real use of the extension register.
4. **Grounding G3 (B3, RISK-GROUNDING-01):** a gold corpus and measured false-accept / false-reject rates; then a tested **mitigation for RISK-GROUNDING-02**, a small design proposal first. Only after both may a real-LLM integration be proposed.
5. **Security review (B5)**, a grant procedure with a second-person check (B7), and rate limiting (B8).
6. **Pilot scope decision:** a small cohort, the one track, demo-free production data, CV bullets only, Verified off. Monitor `claims-standing` and `pack_validation_run`.

## 10. Test results (this commit)

| Suite | Result |
|---|---|
| Domain unit | **237 / 237** (+11: pack constraints with the equivalence proof, H3, withdrawn-evidence gate) |
| Agents unit | 145 / 145 |
| Config | 9 / 9 |
| Agent harness | **30 / 30** (0 false accepts, 0 false rejects) |
| API end-to-end | **190 / 190** (+25: re-grounding 8, separation of duties 8, pack constraints 9) |
| Database proofs | All pass, including the new Phase 9 proofs, run as `authenticated` / `anon` |
| `verify` (boundaries, frozen prototype, tokens, docs) | Pass |
| `next build` | Pass |
