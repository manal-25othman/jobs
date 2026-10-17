# نَقْلة / NAQLA — ENG-1 P4: Corroborating Evidence Integrity Safeguards — Report

**Date:** 2026-10-17 · **Scope:** the Product Owner's decision "Proceed with Corroborating Evidence, subject to integrity safeguards" (conditions 1–10 and the required regression tests).

**Status:** implemented in the development-only pathway. Nothing is active by default. **Waiting for Product Owner approval.** P6 has not begun and nothing was deployed.

**Restrictions held:**
- No verification policy, readiness rule set or threshold was approved or activated. H6 stays disabled. Verified stays blocked.
- No LLM, provider or model cost was used.
- Historical decisions, the canonical SRS, SME candidate content and production policies were not modified. Every existing evidence row keeps its meaning: the migration labels it `primary` through the column default and rewrites no row.
- RISK-GROUNDING-01/02 stay open. D-118, D-119 and D-120 are preserved.

---

## 1. Pre-implementation verification: is the design compatible?

I checked the decision schema, the evidence ledger and the policy vocabulary against the ten conditions before changing anything.

| Area | Finding | Verdict |
|---|---|---|
| Decision schema | `evidence_corroborated` (0030) is a separate decision kind. A trigger already enforces: per-skill only, met and verified, no proposal, previous = resulting = the skill's own state | Compatible (C1) |
| **CLM-1** | My P4 code had added `evidence_corroborated` to `POSITIVE_VERIFICATION_DECISIONS`. That **breaks condition 7** | **Fixed:** reverted to `['accepted', 'evidence_reestablished']` |
| **Evidence ledger** | A corroborating row was an ordinary `evidence` row. Nothing marked it, so every reader counted it: claim drafts (cited evidence, standing count), claim facts, the agent context, the claim request form, asset approval, the level decision count (`independentEvidenceCount`), the journey count after a withdrawal, `min_evidence_per_skill` readiness and the skills page count. That **breaks conditions 1, 4, 7 and 8** | **Fixed:** an explicit, immutable `evidence.evidence_role` |
| **Duplicates** | Every repeat or re-evaluation of an already-met skill wrote another corroborating row. EXT-2 collapsed them at read time, but the ledger did not. That **breaks condition 5** | **Fixed:** the writer and the database refuse duplicates |
| Withdrawal | `withdrawn_at` only (0027: history is immutable; a withdrawal is final). EXT-2 already excludes withdrawn rows | Compatible (C6) |
| Policy vocabulary | `record_corroborating_evidence` exists only in the `per_skill` scope. That scope can never be approved, published or production-active (0029) | Compatible (C9) |

**No invariant conflict remained.** Every gap could be closed without weakening any invariant. Following the PO's instruction for a compatible design, I implemented the minimum development-only extension.

### Design choice: an explicit role, not an inferred one

The alternative was to infer "corroborating" from the decision that cites the row. That would need an `exists (… decision = 'evidence_corroborated')` check in every reader, and the decision is written after the evidence row. An explicit role is clearer:
- It is set at insert and immutable.
- The database can check it in every place a level or claim could be attached.
- A reader cannot get it wrong by forgetting a join.

## 2. Changes

### 2.1 Migration 0031 `0031_eng1_p4_corroboration_integrity.sql` (additive; rollback refuses while any corroborating evidence exists)

| Object | Rule |
|---|---|
| `evidence.evidence_role` | `'primary'` (default; every existing row) or `'corroborating'`. Check constraints: known value only; a corroborating row requires `skill_assessment_id` |
| `evidence_role_guard()` (insert / update, every role) | The role is **immutable**. A corroborating row needs **all** of the following:<br>• a recorded skill assessment, so a declaration or an upload alone never qualifies (C3)<br>• that assessment claimed, met, on a verified basis, with no proposal (C2)<br>• the claim at that assessment's own level, resting on **standing primary** evidence; otherwise the path is D-077 re-establishment<br>• **never in production** (C9)<br>• **no duplicate** (C5) |
| `evidence_corroboration_conflict(user, skill, result)` | Returns `null` when the result is independent. Otherwise it returns a code for the first match against **every** earlier evidence row of that user and canonical skill, **standing or withdrawn** (a withdrawal never makes a repeat independent):<br>• `same_assessment_event`<br>• `same_submission` (re-evaluation)<br>• `same_activity` (repeat or resubmission)<br>• `same_variant_family`<br>• `reused_upload` (platform starter files excluded)<br>• `reused_text` (normalized text of at least 40 characters)<br>• `unresolvable_task` (fail closed) |
| `evidence_normalized_text_hash()` | Mirrors `normalizedTextHash` in `evidence-facts.ts` |
| `verification_decision_evidence_role_consistent()` | Only `evidence_corroborated` may cite corroborating evidence, and it must cite corroborating evidence. An `accepted` or `evidence_reestablished` decision can never rest on it (C1) |
| `skill_claim_primary_evidence_role()` | Corroborating evidence can never be a claim's primary evidence (C1, C8) |
| `asset_evidence_role_guard()` | Corroborating evidence never backs a professional asset (CV / LinkedIn) (C7) |
| `agent_proposal_evidence_role_guard()` | No agent proposal (claim draft) may cite corroborating evidence (C7) |

### 2.2 Domain (`@naqla/domain`)

| File | Change |
|---|---|
| `career-claims.ts` | **CLM-1 restored unchanged:** `POSITIVE_VERIFICATION_DECISIONS = ['accepted', 'evidence_reestablished']`. The comment records that `evidence_corroborated` is excluded until a separate, explicitly approved claim-policy decision (C7) |
| `per-skill-assessment.ts` | `decideCorroboration` takes `primaryEvidenceStanding` and returns null when the primary evidence is withdrawn: that is re-establishment, never corroboration |
| `evidence-path.ts` | Unchanged: EXT-2 still treats `evidence_corroborated` with standing evidence as a counted task when the per-skill path and the independence rules hold (C4) |

`DOMAIN_RULESET_VERSION` is unchanged (0.21.0). No assessment, level or readiness rule output changes for any existing record.

### 2.3 API (`apps/api`)

| Where | Change |
|---|---|
| `slice1/evaluation.service.ts` (per-skill writer) | `decideCorroboration` gets the claim's primary-evidence standing. Before writing, the writer asks `evidence_corroboration_conflict`. On a conflict it records the policy's own non-promotional decision (`not_applicable`) and appends the reason ("no corroborating evidence: not independent of earlier evidence of this skill (same_activity)"), with no evidence row. Otherwise it writes the row with `evidence_role = 'corroborating'` |
| Same file (level decisions) | The standing count given to every level decision (legacy `decide`, H6 derivation, per-skill `standingEvidenceForSkill`) counts **primary** evidence only. Corroborating evidence never contributes to a future promotion either (C1, C8) |
| `slice1/withdrawal.service.ts` | The journey's `standing_evidence_count` after a withdrawal counts primary evidence only. Corroborating evidence never holds a level up |
| `slice1/career.service.ts` | The skills page's `evidence_count` counts the evidence the claim rests on (primary) |
| `readiness/readiness.service.ts` | `min_evidence_per_skill` counts primary evidence only. **Only EXT-2 may count corroborating evidence** (C4). The track-skill detail shows each evidence row's `role` |
| `agents/domain-facts.ts` | `existingEvidence` and technologies-per-evidence: primary only, so a draft can never cite corroborating evidence |
| `agents/claim-drafts.ts` | A cited corroborating row does not stand for a claim. The standing count is primary only. Decisions go through CLM-1 (now unchanged) |
| `agents/claim-facts.ts`, `agents/agent.service.ts` | Claim facts, the agent evidence context, the claim request form and the approval anchor: primary only |

The UI (P5) is unchanged: «لم يتغيّر المستوى «…» — سُجِّل دليل داعم إضافي». No CV proposal. `api.ts` gains an optional `role` on track-skill evidence.

### 2.4 How the ten conditions are met

| # | Condition | Where it is enforced |
|---|---|---|
| 1 | Distinct, non-promotional; never changes the level | Decision trigger (previous = resulting = own state). Role trigger. Never a claim's primary evidence. Never in a level count |
| 2 | Eligible, authorized, independently assessed skill; standing basis; approved criteria | Domain gates (policy flag, per-skill, verified basis, rubric values approved, confidence floor, standing primary evidence) **and** the DB evidence trigger |
| 3 | Never a whole-activity pass, upload, self-declaration, unapproved threshold or client signal | Assessment required (DB check + trigger). `promotion_basis` must be `independently_verified`. An unapproved threshold makes the basis unverified. Clients cannot insert evidence (0027) |
| 4 | EXT-2 counts it only per the path and independence | `evidence-path.ts` (T1–T7, I-1…I-5). It is the only reader that counts it |
| 5 | No duplicates from repeats, resubmissions, reused artifacts or the same event | `evidence_corroboration_conflict`, called by the writer and enforced by the trigger. Unique indexes (one row per skill assessment, and per result + skill) |
| 6 | Withdrawal ends standing; history kept | `withdrawn_at` (0027 immutable history). EXT-2 excludes withdrawn rows. Conflicts consider withdrawn rows too |
| 7 | Not eligible for CV / LinkedIn; CLM-1 unchanged | CLM-1 reverted. Claim readers primary-only. DB guards on `asset_evidence` and `agent_proposal` |
| 8 | Assessment success ≠ evidence standing ≠ level ≠ readiness | Separate records: `skill_assessment` (success), `evidence.withdrawn_at` and `evidence_role` (standing), `skill_claim.state` (level), readiness report (`pending_validation`, never `evaluated` for a sealed set) |
| 9 | Development-only, inactive by default; production guards and H6 preserved | Flag default false; `per_skill` never approvable or production-active (0029); domain throws in production; DB refuses corroborating rows in production; H6 excludes corroboration |
| 10 | No historical decision, SRS, SME content or production policy modified | Additive migration; no row rewritten (proved at rest) |

## 3. Tests

### 3.1 Required regression tests (PO list)

| Required test | Where | Result |
|---|---|---|
| A first valid assessment may establish a level under an authorized test policy | e2e P4 #1 (`accepted`, `demonstrated`, one transition, primary row) | pass |
| A second independent assessment may create corroborating evidence without changing that level | e2e P4 #1 (`evidence_corroborated`, previous = resulting, role `corroborating`, claim's primary evidence unchanged) | pass |
| Repeating the same assessment does not create additional independent evidence | e2e P4 #4 (`same_activity`, `same_variant_family`: no row, reason recorded), #5 (`reused_upload`), S1 (direct DB insert of a duplicate refused; `same_assessment_event`), #6b (repeat after withdrawal: no new corroboration) | pass |
| Withdrawn or invalid evidence does not count | e2e P4 #6, #6b (EXT-2 `withdrawn`; history unchanged); domain: withdrawn primary evidence ⇒ no corroboration; DB: no assessment / not met / production ⇒ refused | pass |
| Corroborating evidence cannot independently grant a career claim | e2e P4 #6b (primary withdrawn, only corroborating stands): not offered, draft refused, not standing, not counted, no positive decision ⇒ `not_eligible`. Domain: CLM-1 unit test and `claimEligibility` test. DB S1: asset and proposal guards | pass |
| No unapproved readiness or verification policy can activate in production | e2e P4 #9b (sealed EXT-2 set) and S4 (the corroboration policy cannot be approved or production-activated through the service or SQL; a corroborating row is refused when `naqla.production = 'on'`); DB proofs 0029/0030/0031 | pass |

### 3.2 New and changed tests

**Domain** (385, +1):
- The corroboration gates now also cover: withdrawn primary evidence, a human criterion with no human decision, a whole-activity (`legacy_any_pass`) basis, H6, and an LLM evaluator.
- CLM-1 excludes `evidence_corroborated`. The P4 test that asserted the opposite was corrected.
- `claimEligibility` with only a corroborated decision is `not_eligible`.

**DB proofs** `supabase/tests/corroboration_integrity.sql` (10):
- Existing rows are primary.
- The role is immutable.
- A declaration cannot be corroborating; an unknown role is refused.
- Refused in production; refused without a real assessment.
- An untraceable result is a conflict.
- Text normalization works.
- All five guards are installed and enabled.
- No corroborating evidence exists at rest.

The migration round-trip now covers 0031 → 0025 and back.

**API e2e** `eng1-p4-evidence.e2e.ts` (13; was 10):
- #1 extended (role, primary unchanged).
- #4 and #5 rewritten (no row is written; reason recorded).
- New S1: DB guards against the writer's real row.
- New #6b: claims, EXT-2, repeat after withdrawal.
- New S4: policy seal.

## 4. Full regression (fresh database: migrations 0001–0031, seed, import)

| Suite | Result |
|---|---|
| Unit (domain / config / agents / app) | 385 / 9 / 145 / 26 — all pass |
| Agent evals | 30/30 |
| Docs (`npm run verify`) | consistent |
| API e2e (fresh DB, 0001–0031 + seed + import) | **282/282** (was 279; +3 in the P4 suite) |
| DB proofs (`scripts/db-test.sh`) | **276 PASS** (was 266; +10 for 0031). Round-trip 0031 → 0025 → up gives an identical schema |
| Browser acceptance | **78/78** |

## 5. Remaining P6 blockers

The approvals list from the P4 report (§9), updated for this decision:

| # | Needed | Owner | Status |
|---|---|---|---|
| A-1 | Corroborating-evidence semantics | PO | **Approved with safeguards** (this decision). Implemented in the development pathway |
| A-1b | **Claim policy for corroborating evidence:** whether `evidence_corroborated` may ever support a CV or LinkedIn claim. Today it cannot (CLM-1 unchanged, DB guards) | PO | Open (separate, explicit claim-policy decision) |
| A-1c | **Corroborating evidence in level decisions:** whether it may ever count toward a future promotion's independent-evidence minimum. Today it does not | PO + SME | Open |
| A-2 | EXT-2 and EXT-1 rows in the extension register, CHG-017, approval to implement EXT-1 | PO | Open |
| A-3 | Per-skill path values (incl. the P-GIT and A11Y one-project exceptions) | SME | Open |
| A-4 | Content facts on real activities: `variant_family`, `task_purpose`, starter checksums | SME + content | Open |
| A-5 | Per-skill thresholds and rubric values; DM-6 integrated pass rule | SME + PO | Open |
| A-6 | Legacy results: `exclude` (default) or the adapter | PO | Open |
| A-7 | The readiness rule set `junior_frontend_readiness` as a draft | SME + PO | Open |
| A-8 | P6 itself: migrations replacing the per-skill, EXT-2 **and corroborating-evidence (0031 production refusal)** seals for approved versions only; four-eyes approval; staging validation; a production read-only audit; a rollback rehearsal | PO only | Open |
| — | Text-normalization parity: the DB hash uses PostgreSQL `lower`/`\s`, while EXT-2 uses JavaScript. They can differ only for unusual Unicode whitespace or casing. EXT-2 re-checks at read time, so the effect is only a missed collapse at write time | Engineering | Note for P6 staging validation |

**Stop.** P4 is complete. P6 has not begun. Nothing was deployed or activated. Waiting for Product Owner approval.
