# نَقْلة / NAQLA — Post-P4 Approval and Pre-P6 Readiness Gate — Report

**Date:** 2026-10-18 · **Scope:** the Product Owner's "Post-P4 Approval and Pre-P6 Readiness Gate" (Tasks A–D).

**Status:** implemented and documented. **Waiting for Product Owner approval.** P6 has not begun and nothing was deployed.

**Restrictions held:**
- No readiness or verification policy was activated. EXT-1 and EXT-2 are sealed and inactive by default.
- No SME candidate content was published. No professional value was filled.
- Historical decisions, the canonical SRS and career-claim approvals were not modified.
- No real LLM or provider was used.

**Product Owner decisions applied:**

| PO decision | How it is held |
|---|---|
| 1. `evidence_corroborated` is supporting evidence only | Unchanged (0031) |
| 2. It never independently authorizes a CV or LinkedIn claim | Unchanged (0031) |
| 3. It never independently causes a promotion | Unchanged (0031) |
| 4. Legacy results excluded from EXT-2 by default | Unchanged. EXT-1 also excludes results without per-skill attribution |
| 5. The production pathway stays inactive | Unchanged |
| 6. EXT-1 built as an inactive extension | §2 |

**Commits:**

| Commit | Content |
|---|---|
| `6c9539a` | Task A: versioned text fingerprint (0032), fail-closed duplicate checks, rollback rehearsal |
| `e8e2b82` | Task C: EXT-1 `integrated_assessment_passed` (0033) |
| *(this commit)* | Task B matrix, Task D Arabic SME package, this report, D-127 |

---

## 1. Task A — evidence-integrity gaps

### 1.1 The mismatch, investigated

| Side | Before | Divergence |
|---|---|---|
| DB duplicate check (0031) | `btrim(regexp_replace(lower(normalize(t, NFKC)), '\s+', ' ', 'g'))`, char length ≥ 40 | `lower()` follows the database ctype (C locale: ASCII only, e.g. "É" was not folded). `\s` follows the regex locale. Non-ASCII whitespace classes depended on configuration |
| EXT-2 reader (JS) | `normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()`, `length` ≥ 40 | Unicode-wide case and space. `length` counts UTF-16 units, so an astral character counted twice |
| Both | No Arabic handling | Harakat, tatweel, bidi marks and Arabic-Indic digits made the same Arabic text look different |

**Effect:** the two checks could disagree. One could see a reuse the other missed. Both also missed Arabic re-submissions that differ only in representation.

### 1.2 The fix — one versioned definition (`naqla-text-fp-v1`)

**`packages/domain/src/text-fingerprint.ts`** is the only normalizer. Steps:
1. NFKC.
2. Remove Arabic marks and tatweel.
3. Remove invisible formatting characters (soft hyphen, zero-width, LRM/RLM/ALM, bidi embeddings and isolates, BOM).
4. Arabic-Indic digits → ASCII.
5. Locale-independent lower case, then NFKC again.
6. A pinned Unicode White_Space set → one space per run, trimmed.
7. Fewer than **40 code points** ⇒ no fingerprint (an answer, not an artifact).

The hash input is `version + "\n" + text`. Changing any step requires a new version.

**This is orthographic identity only:**
- no letter-variant folding (hamza on alef stays a letter);
- no similarity, paraphrase or translation matching;
- no AI-content detection;
- no accusation.

**Migration 0032:**
- `artifact_text_fingerprint`: insert-only, service-only (RLS forced; no client read, not even the owner); one row per artifact and version. A guard ties each row to its artifact's own learner and submission.
- The database **no longer normalizes text** (the SQL normalizer is dropped).
- `evidence_corroboration_conflict` compares stored **current-version** fingerprints, **within one learner only**.

**Writer and reader:**
- The per-skill writer fingerprints the candidate submission and every earlier evidence submission of the skill before the check (idempotent backfill).
- EXT-2 reads the same stored fingerprints. It uses the same function read-only only when none is stored.

**Fail closed for uncertain duplicates:**

| Situation | DB duplicate check | EXT-2 |
|---|---|---|
| A text deliverable without a current-version fingerprint | Conflict `text_fingerprint_missing` ⇒ no corroborating evidence | — |
| A learner upload without a server-measured checksum | Conflict `upload_checksum_missing` | The task is `artifactsVerifiable: false` ⇒ a ≥2-task path is `indeterminate`, never satisfied |
| A fingerprint of another version | Not compared ⇒ missing | — |

### 1.3 Tests

**Unit** (`text-fingerprint.test.ts`, 7) — the following are the same text:
- English: case and Unicode spaces;
- composed vs decomposed letters, ligatures, full-width letters;
- Arabic: harakat, tatweel, RLM, ZWNJ, Arabic-Indic and Persian digits, the lam-alef presentation form.

The following are different texts:
- a paraphrase;
- a different Arabic word;
- hamza vs bare alef;
- a translation.

Also: short answers get no fingerprint; astral characters count once; normalization is idempotent.

**EXT-2 unit:** an uncomparable artifact makes a ≥2-task path indeterminate.

**API e2e** (`eng1-p4-evidence.e2e.ts` A1–A6):

| Test | Proves |
|---|---|
| A1 | Version parity between the database and TypeScript; every stored fingerprint equals the TypeScript definition; no SQL normalizer remains |
| A2 | Arabic re-submission (marks, tatweel, RLM, digit, NBSP) ⇒ `reused_text`, no corroborating evidence, EXT-2 agrees |
| A3 | English case and spacing variant ⇒ reused. A genuine paraphrase ⇒ corroborated (no false accusation) |
| A4 | **Cross-tenant:** another learner's identical text is never compared. A learner cannot read fingerprints |
| A5 | **Withdrawn evidence:** a withdrawal never makes a re-used artifact independent |
| A6 | **Fail closed:** a missing fingerprint, or one of another version ⇒ `text_fingerprint_missing` |

**Repeated submissions:** P4 #4 (`same_activity`, `same_variant_family`).

**DB proofs** (+8):
- the SQL normalizer is gone;
- fingerprints are immutable and undeletable;
- only text deliverables carry one;
- each carries its own learner;
- the v1 threshold is consistent;
- learners and anon cannot read them;
- the migration computes none.

### 1.4 Rollback and forward recovery with corroborating evidence present

**New: `scripts/rollback-rehearsal.sh`.** It runs on a **clone** of a populated database; the source is never touched. The figures below are from the first run (12 corroborating rows, 92 fingerprints); the final regression run is in §5.

| Step | Result |
|---|---|
| 0032 + 0031 down in one transaction | **Refused** (corroborating evidence exists). Everything is rolled back: history snapshot (evidence, roles, withdrawals, decisions, claims), guards and fingerprints identical |
| 0032 down alone | Succeeds. The 0031 check is restored. Evidence, decisions and claims identical (fingerprints are derived data) |
| Forward recovery: 0032 up on the populated data | Succeeds. History identical. With no fingerprint the check **fails closed** (`text_fingerprint_missing`) |
| Backfill (`scripts/backfill-text-fingerprints.mjs`, the writer's own function) | Recomputes **every** earlier fingerprint identically (92 before; 120 after, adding ones never computed). History identical |

The migration round-trip in `scripts/db-test.sh` now covers 0033 → 0025 → up.

---

## 2. Task C — EXT-1 `integrated_assessment_passed` (inactive, sealed)

| Requirement | Implementation |
|---|---|
| Explicitly approved integrated activity and version | Params `{ activity_code, allowed: [{ activity_version, rubric_version }], pass_rule, require_concluded_review: true }`. Explicit pins, no wildcard, unknown parameters refused. At creation, config-admin requires each pin to be a **published, non-demo** activity version with a **published, non-demo, bound, values-approved** rubric that names at least one gate or mandatory criterion (a demo twin of the same slug@version is ignored) |
| Only the approved, pinned rubric and its approved pass criteria | **PR-2:** every gate and every mandatory criterion of the pinned rubric `met` on the final assessment. **PR-1:** PR-2 + total/max ≥ `pass_threshold` **only when `pass_threshold_status = approved`**, else `indeterminate`. No pass over an empty required set |
| No invented thresholds | None. The PR choice is DM-6, named in the rule |
| Legitimate final result with standing evidence | Excluded, in order: `not_final` (interim), `demo`, `unpublished`, `values_unapproved`, `version_not_allowed`, `rubric_not_pinned`, `claim_anomaly`, `legacy_no_per_skill`, `incomplete` (undetermined), `review_pending`, `integrity_failed`, `evidence_withdrawn` (any withdrawal voids the pass), `no_standing_evidence` |
| Completion ≠ assessment success ≠ readiness | Audit `completion { submitted, finalResults, passed }`. The rule outcome is one input of a sealed set that stays `pending_validation` with `overall: null` |
| Per-skill attribution | Each skill's own outcome and decision on the counted result, **unmerged**. A skill not met in a passed integrated result is reported as not met. The rule never reads or moves a level |
| Tenant isolation, immutable history, idempotency | Facts are read by the service-established user id only. The fact builder is read-only (asserted by source test). Results and decisions are unchanged by readiness. A recorded readiness snapshot changes no level |
| Fail closed when approval is missing | At creation: refused. At evaluation: excluded or `indeterminate`. Missing facts ⇒ `indeterminate` |
| No production approval or activation before P6 | **0033** extends the 0030 seal to EXT-1: never approved, published, production_active or baseline; `development_only` only with `naqla.readiness_ext_dev_activation = on`, never with `naqla.production = on`; no EXT rule in an approved or active set; no skill on an EXT-1 rule. config-admin has the same check at the service boundary |

**Tests:**
- **Unit** (`integrated-assessment.test.ts`, 28): params; catalog (incl. demo twin); every exclusion; PR-1/PR-2 incl. unapproved threshold; outcome separation; per-skill unmerged; sealed set never `evaluated`.
- **DB proofs** (+7): no skill; approved, production and development without opt-in refused; production with opt-in refused; no EXT-1 in an approved set; at rest none active. The superseded 0030 proof that EXT-1 does not exist was replaced.

**API e2e C1–C7:**

| Test | Proves |
|---|---|
| C1 | Creation refuses: wildcard, unpinned rubric, demo or unpublished content, unknown parameter, optional review, a skill |
| C2 | Not attempted ⇒ not satisfied (completion 0); no verdict |
| C3 | Concluded eligible result ⇒ PR-2 satisfied, with a skill not met listed unmerged. PR-1 on the **same** result ⇒ not satisfied (11/15 below the approved threshold). Readiness moves no level |
| C4 | Pending review ⇒ indeterminate (completed, not passed). One missed mandatory criterion ⇒ not satisfied |
| C5 | Withdrawn evidence voids the pass; decisions unchanged |
| C6 | Tenant isolation; a client cannot write rules |
| C7 | The full seal through the service and SQL; production sees it unconfigured |

**Not done (by instruction):** no EXT-1 or EXT-2 set was activated outside the test harness; the integrated candidate activity `act_fe_integrated_leave_requests` is not authored or published. EXT-1 cannot be configured for it until it is.

---

## 3. Task B — verification vs readiness

See `ENG-1-VERIFICATION-VS-READINESS-DECISION-MATRIX.md`.

**Answer:** yes, the model awards Demonstrated from one assessment, while the two-task path is a readiness rule only. Also:
- the policy knob `min_independent_evidence` is not independence-aware;
- Practiced is unreachable for this track;
- a claim policy with `min_evidence_count = 2` could never be met by the two-task path after D-126.

**The exact SME decision (SME-Q1):** does "two independent tasks" define readiness (L-1, current), the award of Demonstrated (L-2), or both (L-3)? No level semantics were changed.

## 4. Task D — Arabic SME calibration package

See `docs/sme-candidate/junior-frontend/10-sme-calibration-and-p6-decision-package.md` (draft, values blank). It covers:
1. per-skill thresholds;
2. level vs readiness evidence (SME-Q1, DM-2);
3. the integrated pass rule (PR-1/PR-2, mandatory set, borderline band);
4. the Git and A11Y one-task exceptions;
5. the final three-activity coverage matrix and independence;
6. anchor submissions and reviewer calibration (a proposed protocol, all numbers blank);
7. the remaining professional decisions.

It complements `09-sme-validation-package.md`.

---

## 5. Full regression (fresh database: migrations 0001–0033, seed, import)

| Suite | Result |
|---|---|
| Unit (domain / config / agents / app) | 421 / 9 / 145 / 26 |
| Agent evals | 30/30 |
| Docs | consistent |
| API e2e (fresh DB) | **295/295** (was 282; +13: A1–A6, C1–C7) |
| DB proofs (`scripts/db-test.sh`) | **291 PASS** (was 276; +8 for 0032, +7 for 0033). Round-trip 0033 → 0025 → up gives an identical schema |
| Rollback / forward-recovery rehearsal (clone of the e2e database after the full run) | **pass**: 6 corroborating rows; refused rollback changed nothing; 0032 down/up with history identical; backfill recomputed all 46 earlier fingerprints identically (241 after) |
| Browser acceptance | **78/78** |

---

## 6. Remaining blockers

### 6.1 For P6 (separately authorized migration replacing the seals for approved versions only)

| # | Blocker | Owner |
|---|---|---|
| B-1 | **SME-Q1** (level vs readiness meaning of "two tasks"), then DM-2 (V-a/V-b/V-c) | SME, then PO |
| B-2 | DM-6 integrated pass rule, mandatory set, borderline band; if PR-1, an approved pass threshold | SME + PO |
| B-3 | Per-skill thresholds and level descriptors, approved and representable | SME |
| B-4 | Per-skill path values, incl. P-GIT and A11Y one-task confirmation | SME |
| B-5 | Content facts on the real activities (`variant_family`, `task_purpose`, starter checksums) during content review | SME + content |
| B-6 | Candidate content authored and published through the review flow: INT, A, B as non-demo, rubric values approved, rubric bound to its version | Content, SME, PO |
| B-7 | Claim-policy decision A-1b (corroborating evidence and claims; replaces the unreachable `min_evidence_count = 2` idea, K-3) | PO |
| B-8 | Extension-register rows for EXT-1 and EXT-2, CHG-017 | PO |
| B-9 | The P6 migration itself: replaces the per-skill (0029), EXT (0030/0033) and corroboration (0031 production refusal) seals for **approved versions only**; four-eyes approval; rollback rehearsal on staging data (the script now exists) | PO |
| B-10 | A validated per-skill verification policy (approved, production_active) to replace the development-only test policy | PO + SME |

### 6.2 For the first staging pilot (after P6)

| # | Blocker | Owner |
|---|---|---|
| S-1 | Anchor submissions per criterion level, reviewer training, agreement target, blind double-review sample (package §6) | SME + PO |
| S-2 | Named, trained human reviewers with grants. Every skill criterion is human-scored today | PO |
| S-3 | Staging environment with migrations 0001–0033 and the approved configuration only. A read-only claimed-skill audit on staging data (`scripts/audit-claimed-skills.sql`) | Engineering + PO |
| S-4 | Pilot consent and privacy notice for real learner data (repository links, uploads, fingerprints as derived data) | PO |
| S-5 | Git review path G-1…G-4 exercised by reviewers (declared vs reviewed SHA) | SME + reviewers |
| S-6 | Unicode version note: `runtime_unicode` is recorded per fingerprint; a Node/ICU upgrade on staging must re-run the backfill comparison before trusting the old fingerprints | Engineering |
| S-7 | Monitoring of `text_fingerprint_missing` / `upload_checksum_missing` conflicts (they withhold corroboration; they never accuse) | Engineering |

**Stop.** P6 has not begun. No readiness or verification policy is active. Waiting for Product Owner approval.
