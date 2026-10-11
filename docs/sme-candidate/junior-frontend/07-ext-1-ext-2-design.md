> **DESIGN ONLY · NOT IMPLEMENTED · NOT REGISTERED.**
> - EXT-1 and EXT-2 are proposed readiness rule types.
> - Implementation needs: a PO entry in `docs/architecture/EXPERT-RULE-EXTENSION-REGISTER.md`, CHG-017 (CR-5, CR-6), a domain type with tests, and a Track Builder kind.
> - Both ship **inactive**.

# EXT-1 and EXT-2: design specifications

## Shared principles

- **Pure, deterministic domain functions.** They read facts the API builds from rows. They write nothing and never change a level (BR-024).
- **Fail closed:**
  - a fact that cannot be established ⇒ `indeterminate`;
  - in production, `indeterminate` is not satisfied;
  - demo content ⇒ not counted in production (D-119).
- **Only authorized results count** (D-118): a standing evaluation, an approved non-demo rubric version, and a verification decision that is accepted (never `pending_validation`).
- **Auditable:** every outcome carries the facts it read (ids, versions, checksums compared) in the readiness report.
- **No LLM and no similarity scoring.** No inference about the source of work (BR-025).

## EXT-2: `min_independent_evidence_per_skill`

**Expert criterion (C3):** «يكفي مشروع عملي مع مهمة قصيرة مستقلة، بشرط أن تكون المهمة مختلفة وتثبت أن المتقدم قادر على تطبيق المهارة بنفسه، وليس فقط تكرار نفس الحل.»

**Why no supported type fits:** `min_evidence_per_skill` counts standing rows. It cannot tell a resubmission or a reused artifact from independent work.

**Params:**
```text
{ min_count: int ≥ 1, require_validation_activity: boolean }   skill_id required
```

**Facts per skill (built by the API):**
```text
items[]: { evidenceId, evaluationResultId, criterionResultId, criterionKey,
           activitySpecId, activityVersion, variantFamily, isValidationActivity,
           standing, decision, rubricApprovedNonDemo,
           learnerArtifactChecksums[], learnerUploadIds[], normalizedTextHashes[] }
```

**Algorithm:**
1. **Eligible items.** Keep items that are `standing`, have `decision = accepted`, are `rubricApprovedNonDemo`, and whose criterion met its threshold (I-3, I-4).
2. **Collapse resubmissions.** Group by `variantFamily` (which also covers one `activitySpecId` across versions). Keep the latest standing item per group (I-6).
3. **Reuse.** Two groups conflict if they share any `learnerUploadId`, learner-artifact checksum or normalized text hash (I-5).
   - Platform-provided input files are excluded before hashing.
   - Conflicting groups count as **one**.
4. **Count** the remaining independent groups. Every criterion result is counted at most once (I-3).
5. **Validation requirement.** If `require_validation_activity` and `min_count ≥ 2`, at least one counted group must have `isValidationActivity` (I-1).
6. **Outcome:**
   - `satisfied` if count ≥ `min_count` (and step 5 holds);
   - otherwise `not_satisfied`;
   - `indeterminate` if any needed fact is missing (e.g. no `variantFamily` declared on an activity).

**Audit output:**
```text
{ counted: [groupIds], collapsed: [{group, items}], reuseConflicts: [{a, b, sharedBy: 'upload'|'checksum'|'text'}],
  validationPresent: boolean, count, minCount }
```

**Learner-facing wording (neutral, never an accusation):** «تحتاج المهارة دليلين مستقلين: نشاطًا ومهمة قصيرة مختلفة. لم يُحتسب أحد الأدلة مستقلًا لأنه يكرّر عملًا سابقًا.»

**New data needed:**
- `activity_spec.variant_family` (text, content-declared, reviewed by the SME).
- A normalized-text hash for text deliverables, computed server-side.
- Upload checksums already exist and are measured server-side.

**Tests (when built):**

| Case | Expected |
|---|---|
| Two attempts on one activity | 1 |
| Same family, two versions | 1 |
| Integrated + Task A for css | 2 ✓ |
| Integrated + Task A sharing an uploaded file (same checksum) | 1 |
| Unchanged starter file in both | not a conflict |
| Item with decision `pending_validation` | not counted |
| Withdrawn item | not counted |
| Demo content in production | not counted |
| Missing `variant_family` | indeterminate |
| No validation activity among two items | not satisfied |

## EXT-1: `integrated_assessment_passed`

**Expert criterion (C5, condition 3):** «اجتياز مهمة عملية متكاملة تجمع المهارات الأساسية، مثل بناء واجهة Responsive، والتعامل مع API وحالات Loading وError، وإصلاح Bug بسيط.»

**Why no supported type fits:** readiness facts are per-skill claim states and counts. No type reads the outcome of a specific assessment.

**Params:**
```text
{ activity_code: string, pass_rule: 'PR-1' | 'PR-2', allowed_versions: string[] }   skill_id null
```

**Facts (built by the API):** the user's evaluations on `activity_code`, each with:
- version and `standing`;
- `decision` and `rubricApprovedNonDemo`;
- gate outcome;
- mandatory criteria met (boolean per criterion);
- total vs pass threshold;
- whether the result is inside the borderline band and, if so, whether human review has concluded.

**Algorithm:**
1. **Indeterminate** when the activity is not published, or has no approved non-demo version in `allowed_versions`.
2. **Satisfied** when some evaluation:
   - is standing, `accepted`, on an allowed version;
   - passes the gate;
   - meets every mandatory criterion;
   - for PR-1, also has total ≥ the pass threshold;
   - and, if it was in the borderline band, has a concluded human review.
3. **Otherwise not satisfied.**

The result names the reason (gate · a named mandatory criterion · total · review pending · version not allowed).

**Guards against "pass once, ready forever":**
- Withdrawn or superseded results stop counting.
- Recency follows the existing `recency_policy` of the skills involved (V7 for Verified stays a future concern).
- `allowed_versions` removes retired versions explicitly.

**Tests (when built):**

| Case | Expected |
|---|---|
| Unpublished or demo activity | indeterminate |
| Passed but `pending_validation` | not satisfied |
| Withdrawn | not satisfied |
| Version outside `allowed_versions` | not satisfied |
| Borderline without concluded review | not satisfied |
| PR-2 with total below threshold but all mandatory met | satisfied |
| PR-1, same case | not satisfied |
| Readiness never changes any claim level | holds |
