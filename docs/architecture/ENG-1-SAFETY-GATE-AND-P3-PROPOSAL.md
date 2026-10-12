# نَقْلة / NAQLA — ENG-1 Post-P0–P2 Safety and Compatibility Gate · P3 Decision Proposal

**Date:** 2026-10-12 · **Scope:** the Product Owner's gate after P0–P2. **P3 is not implemented.**

**Restrictions held:**
- H6 is not enabled. Per-skill verification is not activated (the database seal from 0026 is intact).
- No change to SME candidate content, readiness policies, CV/LinkedIn policies, verification policies or the canonical SRS.
- No deployment. No LLM.

---

## 1. Commits and changed files

| Commit | Item | Files |
|---|---|---|
| `f3a54f3` | **O-2** evidence history integrity (+ AP-1) | `supabase/migrations/0027_evidence_history_integrity.sql` (new) · `supabase/rollback/0027_evidence_history_integrity.down.sql` (new) · `supabase/tests/evidence_integrity.sql` (new) · `supabase/tests/rls.sql` · `supabase/tests/per_skill_schema.sql` · `scripts/db-test.sh` · `apps/api/test/evidence-integrity.e2e.ts` (new) · `apps/api/test/withdrawal.e2e.ts` |
| `52f907f` | **O-1** honest graduate feedback + browser acceptance | `apps/api/src/slice1/evaluation.service.ts` · `apps/api/test/eng1-p0-integrity.e2e.ts` · `apps/app/src/lib/journey.ts` · `apps/app/src/lib/api.ts` · `apps/app/src/app/evaluation/page.tsx` · `apps/app/test/journey.test.ts` · `apps/app/test/browser/journey.browser.mjs` · `docs/pilot/ui-acceptance/` (4 screenshots, `results.json`) |
| *(this document)* | O-3/O-4, P3 proposal, D-122 | this file · `docs/decisions/DECISIONS.md` |

---

## 2. O-2 — evidence history integrity (fixed, `f3a54f3`)

**Defect (pre-existing since 0002, reproduced earlier in a rolled-back transaction).**
- `evidence_withdraw_own` checks only the owner and the withdrawal fields.
- Together with a table-level UPDATE grant, a client could rewrite `skill_id`, `confidence`, `provenance_source`, … of its own evidence **in the same UPDATE that withdraws it**.

**Review of mutation paths:**

| Path | Finding | Action |
|---|---|---|
| API | The only server write to `evidence` is `withdrawal.service` (`update evidence set withdrawn_at, withdrawn_reason`, service role) | Unchanged |
| Un-withdraw | No product path un-withdraws | Now forbidden for every role |
| Client grants | `authenticated` held table-level INSERT/UPDATE/DELETE on `evidence`; only RLS (no insert/delete policy) stood between | Narrowed |
| **AP-1** | `project_write_own` (ALL) let a client re-point its project's activity, activity version or kind: the inputs of P0 rubric pinning | **Closed** |
| AP-2 | `submission_claimed_skill_insert_own` lets a client add claimed skills directly | **Bounded** by P0 (attribution intersects with the governed activity-primary mapping and rubric coverage). Reported in §7 |

**Fix (migration 0027, enforced at the database boundary; no row rewritten):**
1. **`evidence_history_immutable`** (all roles): the only permitted change is the withdrawal, null → set, once, with its reason. Every other attribute is immutable; a withdrawal is final and its reason is never rewritten.
2. **Column privileges:** `authenticated` may UPDATE only `(withdrawn_at, withdrawn_reason)` and holds no INSERT or DELETE on `evidence`.
3. **`project_identity_client_immutable`:** for client roles, a project's owner, kind, activity and activity version are fixed at creation. Titles stay editable; trusted server writes are unaffected.
4. Rollback script, plus a round-trip covering 0027.

**Proof:**

| Actor | Result |
|---|---|
| **Owner** | The reproduced attack (skill, confidence, provenance or source strength rewritten while withdrawing) is refused (`permission denied`). Insert and delete are refused. **Withdrawal through the API still works** and is final. A direct client withdrawal of the withdrawal fields only is still permitted. Re-withdrawal through the API returns 400 |
| **Other tenant** | 0 rows changed (RLS); the API returns 404 |
| **Anonymous** | Denied |
| **Authorized internal actor** | `service_role` (bypasses RLS) can withdraw, but cannot rewrite or un-withdraw. The owning role (API/migrations) cannot rewrite history either |

- Untouched and withdrawn rows are byte-identical except for the withdrawal fields.
- **Tests:** 24 database proofs (`evidence_integrity.sql`; each must fail at the layer it names) and 5 API e2e tests (`evidence-integrity.e2e.ts`).
- **Two existing tests adjusted to the stricter boundary, not weakened:**
  - `rls.sql`: the "share-link check is live" proof now removes the withdrawn citation instead of un-withdrawing evidence, which no product path ever did.
  - `withdrawal.e2e.ts` and one P2 proof: a client DELETE or provenance detach is now *refused* (`permission denied`) instead of being silently filtered to 0 rows.

---

## 3. O-1 — honest graduate feedback (`52f907f`)

**Cause.** The work page preselects every primary skill (three on the reviewed activity). P0 cannot attribute a whole-activity result to one of them, so it correctly records **no level**. **The P0 guard is unchanged; nothing is selected arbitrarily.**

**Change (minimal; existing card and banner styles; no new component):**
- **API (additive, read-only):** the evaluation view gains `levelAttribution` (`attributed` | `ambiguous` | `no_candidate` | `null`). It is read from the attribution P0 records on the result's audit event; `null` for history before P0.
- **Evaluation page, completed:**
  - «اكتمل التقييم — ولم يُسجَّل مستوى لأي مهارة»
  - «اكتمل النشاط وقُيِّم عملك على كل معيار — الملاحظات أدناه.»
  - The reason: several primary skills chosen while per-skill results are not yet recorded, **or** the chosen skills are not primary for the activity.
  - «هذا ليس إخفاقًا في أي مهارة، ومستوياتك تبقى كما هي.»
  - Criterion feedback is shown as before.
- **During human review:** a note that no level will follow.
- **Never shown beside a recorded level.** Never states a skill was failed.
- **My Work:** keeps «قُيِّم — الملاحظات جاهزة», which is accurate. It never says "level changed" for such work.

**Evidence:**
- `docs/pilot/ui-acceptance/U4-evaluation-assessed-no-attribution-desktop.png` (default selection, after review)
- `…/U4-evaluation-human-review-pending-desktop.png` (pending, with the note)
- `…/U4-evaluation-secondary-only-desktop.png` (secondary only)
- `…/U4-evaluation-level-recorded-desktop.png` (one primary skill: level shown)

---

## 4. Browser acceptance — **65/65** (`docs/pilot/ui-acceptance/results.json`)

**B7e and B7g investigation:** they asserted that the *default* selection produces a level change. That was the pre-P0 behaviour: one of three skills promoted in undefined order (F-2). They now state the approved safe behaviour, and the legitimate path keeps its own journey.

| Journey | Checks | Proves |
|---|---|---|
| **B7** (default: 3 primary skills) | B7a–d (unchanged) · **B7h** pending note · **B7e** assessed, 0 claims, 0 evidence, reason given · **B7i** no failure claimed, criteria shown · B7f no Verified · **B7g** My Work says "assessed", not "level changed" | **no arbitrary promotion**; learner informed accurately |
| **B11** (one primary skill: HTML) | **B11a** Demonstrated recorded and shown (the old B7e assertion) · B11b no notice beside it · B11c no Verified · **B11d** My Work reports the level change (the old B7g assertion) | **the legitimate approval path is intact** |
| **B12** (secondary only: CSS) | **B12a** no claim, no evidence · **B12b** assessed + reason + no failure claim | **no unmeasured / non-primary skill promoted** |
| B1–B6, B8–B10 | unchanged, all pass | — |

---

## 5. O-3 and O-4 findings

### O-3 — `threshold_for_skill`

| Aspect | Finding |
|---|---|
| Storage | `rubric_criterion.threshold_for_skill numeric(4,3)`, **DB check `> 0 and ≤ 1`** (0007); `threshold_status value_status` (`TBD`/`proposed`/`approved`); shape check: only `skill_evidence` criteria carry one (0010) |
| Stated meaning | Admin rule catalogue: «النسبة اللازمة ليُعدّ المعيار دليلًا للمهارة» (*the ratio required for the criterion to count as evidence for the skill*); expert-dependent; editing resets the status to `proposed` |
| Historical values | Canonical pack: 0.5 on max 2 (×17), 1.0 on max 1 (×2), gates null (×3). **All `proposed`; none approved in canonical data.** Seed fixture: 1.0 / max 1 `proposed`; one `TBD`. (`approved` rows exist only where test fixtures approve values on non-demo copies) |
| Contracts | Pack schema: shape check, and refuses a pack that declares values `approved` (OPEN-043). Domain `assertCriterionKindShape`. Loaded into `RubricCriterion` since P0; **not read by legacy grading** (tested: byte-identical runs) |
| Readers | Admin rubric view and edit; reviewer payload (display); P1 per-skill domain (inactive) |

**Recommended semantics** (for PO and SME confirmation; nothing activated):
- `threshold_for_skill = t ∈ (0, 1]`, **a fraction of the criterion's `max_score`**.
- A criterion counts as met for its skill when `score ≥ t × max_score`.
- It is used only when `threshold_status = 'approved'`, by a named SME, on that rubric version.
- **No fallback to full marks.** P1 already implements exactly this.

**Recommended validation (future, with SME approval):**
1. `t × max_score` must equal the score of an existing level descriptor (so the threshold names a level the reviewer can choose, e.g. 0.5 × 2 = 1 = "partial").
2. A pack-import check for (1).
3. A column `COMMENT` stating the unit.
4. The admin edit form shows the computed score.

**Consequence for P3:** with today's data **every** per-skill outcome would be `incomplete` (no approved thresholds), so P3 would record assessments and promote **nothing** until an SME approves thresholds. This is the intended fail-closed behaviour.

### O-4 — submission-based promotion (T-LINK)

- **Confirmed disabled in every active policy.**
  - A fresh database (migrations + seed + pack) resolves only to `default@2` (`legacy_baseline`): `practiced_on_submission = false`, `promotion_basis = independently_verified`.
  - The only row with it `true` is `default@1`, which is inactive.
  - The e2e harness activates a test-only `default@900` with it `true` (development only, never production).
- **Guard gap.** The database already refuses a `legacy_any_pass` basis as `production_active` or baseline (0023). There is **no structural guard on `practiced_on_submission` itself**: an approved `independently_verified` policy could, through the governed four-eyes flow, set it `true`, moving claimed skills to Practiced at submission, outside rubric coverage.
- **Recommendation:** a check making `practiced_on_submission = true` valid only with `activation in ('inactive', 'development_only')`. It is not implemented, because verification policies are out of scope for this gate.

### Additional finding — claim policy "requires a verification decision" (CLM-1)

- `claim-drafts` treats a skill as having a verification decision if **any** `verification_decision` row exists, including `not_applicable` and `assessment_pending_validation`.
- P0 records `not_applicable` decisions for every claimed skill when a result is unattributed, which widens that pre-existing looseness.
- **No current impact:** no claim policy (any activation) sets `requires_verification_decision`, and every active claim policy also requires a Demonstrated or Practiced *claim level*, which a `not_applicable` decision never grants.
- **Recommendation:** before any policy uses the flag, count only decisions that moved or re-established a level (`accepted` / `evidence_reestablished` with evidence).

---

## 6. P3 decision-gate proposal (updated; not implemented)

| Area | Proposal |
|---|---|
| **API integration boundary** | One branch point: after `recordAssessment`, the evaluation and finalisation paths switch on the resolved policy's `assessment_scope`. `primary_claimed_skill` runs today's code untouched (byte-equivalence test). `per_skill` calls a new `PerSkillDecisionWriter`: per canonical skill, it writes `skill_assessment` + criterion links, the decision (`decideSkillAssessment`), the promotion via the existing `promote()`, the ledger link and the progress update, in the **same transaction**. No new endpoint. Evaluate and view responses gain `skills[]`; `levelAttribution = 'per_skill'` |
| **Independent per-skill human review** | Queue items stay per criterion; reviewers and the blind payload are unchanged. Finalisation stays whole-evaluation (U-6): every skill outcome comes from the same final scores. A per-skill reviewer override is a new decision row with `human_override_of` + `skill_assessment_id` (schema ready). Optional later: finalise a skill as soon as its own criteria are decided |
| **Historical compatibility** | No backfill. Legacy results keep their legacy decisions (`skill_assessment_id` null). A user can hold claims from both scopes. The unique platform-evidence index (result, skill) holds for both. An optional read-only dry-run report only |
| **Legacy `verification` table consumers** | One reader: the evaluation view's `verification` field. In per-skill scope no legacy row is written (U-4); the view already falls back to the decision. **Must be fixed with P3:** the view (`decisions[0]` / `pending ??`) and My Work (`ds[0]`, `levelChanged = any`) pick one decision per result; with several per-skill decisions they need a defined order (claim position / skill slug) and per-skill fields. Readiness and the claim-draft readers are per skill already (but see CLM-1) |
| **Schema activation guard** | Migration 0028 (P3) replaces the 0026 seal with *development_only allowed, production refused*. Production needs a further migration plus PO approval, four eyes and P5 (UI) done. Add the O-4 guard in the same migration if approved |
| **Readiness and evidence** | Readiness keeps reading claim levels and standing evidence per skill (unchanged); EXT-2 later reads `skill_assessment`. More claims per evaluation is the expected effect, bounded by approved thresholds, D-118 basis, claimed skills and the rubric's criterion links. Standing evidence per skill counts one row per result (`standingEvidenceForSkill`, unique index) |
| **Acceptance tests to add** | Equivalence: legacy scope byte-identical. Mixed outcomes in one activity (HTML met, CSS not) ⇒ separate decisions, evidence and ledger. Unapproved thresholds ⇒ `incomplete`, no level. Basis per skill (uploads never verify). Re-evaluation and concurrency idempotency (unique indexes). Withdrawal per skill. Tenant isolation. Per-skill override. Readiness after mixed results. The view and My Work with several decisions. Browser B13: per-skill results shown (with P5) |
| **Rollback and deployment** | Activation is a governed policy version (development_only first); deactivation returns to the legacy scope immediately, with data kept. 0028 rollback refuses while per-skill rows exist. Staging only. No production activation without SME-approved thresholds, P5, PO approval and a staging sign-off |

**Recommendation:** P3 is **ready to start as development-only work** once the decisions in §7 are made. Its first observable effect in development will be `incomplete` per-skill outcomes until SME thresholds are approved. That is correct, and it lets P3 be validated end to end without awarding any level.

---

## 7. Remaining blockers requiring Product Owner approval

| # | Blocker | Needed for |
|---|---|---|
| B-1 | P3 design decisions: **U-1** which skills are assessed (recommended: all skills with criteria; decide claimed only); **U-4** no legacy `verification` row in per-skill scope; **U-6** whole-evaluation finalisation | P3 start |
| B-2 | **Threshold semantics (O-3):** confirm "fraction of `max_score`, approved only"; approve the extra validation | P3 start |
| B-3 | **SME approval of per-skill thresholds** on non-demo rubrics. Without it, P3 promotes nothing | any per-skill level |
| B-4 | **O-4 guard:** practiced-on-submission only in inactive / development policies (verification-policy schema change) | before any new policy activation |
| B-5 | **CLM-1:** tighten "has a verification decision" before any claim policy uses it | before such a policy |
| B-6 | **AP-2:** decide whether clients may insert claimed skills directly (bounded today by P0), or route them through the API only | P3 (claims feed per-skill decisions) |
| B-7 | **P5 Graduate UI:** show per-skill results before any non-development activation | P6 |
| B-8 | Graduate-UI track sign-off on the O-1 copy and the B7/B11/B12 expectations | merge to the UI track |

**Stopped. Awaiting Product Owner approval.**
