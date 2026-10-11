> **DESIGN ONLY · NOT IMPLEMENTED · NOT REGISTERED · INACTIVE** (Rev. 2).
> - EXT-1 and EXT-2 need Product Owner rows in `docs/architecture/EXPERT-RULE-EXTENSION-REGISTER.md`.
> - ENG-1 is verification behaviour, not a rule type: it needs its own PO approval (decision pack DM-9) and does **not** activate H6.
> - Each would ship with a domain type and tests, a Track Builder kind where applicable, and CHG-017.

# ENG-1, EXT-2 and EXT-1: design specifications

## Shared principles

- **Pure, deterministic domain functions** over facts the API builds from rows. Readiness rules write nothing and never change a level (BR-024).
- **Fail closed:** a missing fact ⇒ `indeterminate`, which is not satisfied in production. Demo content ⇒ not counted in production (D-119).
- **Only authorized results count** (D-118): standing, an approved non-demo rubric version, decision `accepted` (never `pending_validation`).
- **Auditable:** each outcome lists the facts it read.
- **No LLM, no similarity scoring, no inference about where work came from** (BR-025).

## ENG-1: per-skill assessment results from one evaluation (prerequisite)

**Why it is needed.**
- Today, with H6 off, an evaluation changes the claim of only the **first skill the learner claims** (`evaluation.service.ts`, `primarySkillId`).
- The H6 code, when enabled, gives every other claimed skill the **same** decision as the whole run, and only if the run passed overall.
- F1 requires each skill assessed in a shared activity to have its **own criterion and an independently justified result**. Neither behaviour meets that.

**Proposed behaviour** (behind a verification-policy field, default off):
1. After an evaluation, for each skill S that the rubric measures *and* the learner claimed:
   - **S's result** = the gate passed **and** every criterion linked to S meets its `thresholdForSkill` (an existing field).
   - Other skills' criteria do not affect S.
2. Each result goes through the active verification policy **separately**: basis (D-118), escalation, decision actors. It is recorded as its own assessment decision with the criteria it read.
3. The activity's overall pass (mandatory criteria + pass rule) is recorded separately. It matters only for EXT-1.
4. **Nothing changes when the field is off.** Today's single-skill behaviour is preserved exactly.

**Tests (when built):**
- Off ⇒ byte-for-byte today's behaviour.
- Code Reading met and Debugging not ⇒ a Code Reading result only.
- A failed CSS criterion does not block an HTML result.
- Each result has its own decision row.
- `pending_validation` basis ⇒ no level for any skill.
- Verified unreachable.

## EXT-2: `skill_evidence_path` (replaces Rev. 1 `min_independent_evidence_per_skill`)

**Expert basis:**
- C3 «مشروع عملي مع مهمة قصيرة مستقلة… ليس فقط تكرار نفس الحل»;
- F3 (evidence-path level; code + theory alone is incomplete);
- F4 (Git: one project);
- PO direction 6 (per-skill, versioned; no universal two-activity rule).

**Why no supported type fits.** `min_evidence_per_skill` counts rows. It cannot say *which* criteria count, in *how many distinct tasks*, or detect reuse.

**Params** (per skill, versioned with the rule set):
```text
{ min_distinct_tasks: int ≥ 1,
  counted_criteria: { [activity_code]: [criterion_key, ...] },   // all listed keys for an activity must be met for that task's item
  require_validation_activity: boolean,                           // only meaningful when min_distinct_tasks ≥ 2
  understanding: 'integrated_code_understanding' | 'within_criterion' | 'none' }
```

**Facts** (built by the API from `criterion_result`, `evaluation_result`, `activity_spec`, `upload`, `submission_artifact`):
```text
tasks[]: { activityCode, activityVersion, variantFamily, isValidationActivity, evaluationResultId,
           criteriaMet: {key: boolean}, standing, decision, rubricApprovedNonDemo,
           learnerUploadIds[], learnerChecksums[], normalizedTextHashes[] }
integratedCodeUnderstandingMet: boolean | null
```

**Algorithm:**
1. **Eligible tasks.** Keep tasks whose activity is in `counted_criteria` and whose listed criteria are **all** met in that evaluation (I-3), and which are standing, accepted and approved non-demo (I-4).
2. **Collapse** by `variantFamily`: the latest standing evaluation per family (I-6).
3. **Reuse.** Families sharing a learner upload, checksum or normalized text hash count as one. Platform starter files are excluded (I-5).
4. **Count** the distinct families (I-2).
5. **Validation activity.** If `min_distinct_tasks ≥ 2` and `require_validation_activity`, at least one counted family must be a validation activity (I-1).
6. **Understanding.**
   - `integrated_code_understanding` ⇒ `integratedCodeUnderstandingMet` must be true;
   - `null` (not yet assessed) ⇒ `indeterminate`.
7. **Outcome.**
   - `satisfied` when count ≥ `min_distinct_tasks` and steps 5–6 hold;
   - `indeterminate` when a needed fact is missing (e.g. no `variant_family` on a counted activity);
   - otherwise `not_satisfied`.

**Audit output:**
```text
{ counted: [...], collapsed: [...], reuseConflicts: [{a, b, sharedBy}], validationPresent, understanding, count, minDistinctTasks }
```

**Learner wording (neutral):**
- «تحتاج هذه المهارة دليلًا عمليًا من مهمتين مختلفتين؛ لديك دليل من مهمة واحدة حتى الآن».
- For reuse: «لم يُحتسب هذا الدليل مستقلًا لأنه يكرّر عملًا سابقًا».

**New data (ENG-2):**
- `activity_spec.variant_family` (content, SME-reviewed);
- a server-side normalized text hash for text deliverables.

**Tests:**

| Case | Expected |
|---|---|
| P-GIT with INT met | satisfied (1 task) |
| P-HTML with INT only | not satisfied (F3: one task + explanation is incomplete) |
| P-HTML with INT + A | satisfied |
| Two attempts on A | 1 |
| A and B sharing an uploaded file | 1 |
| Unchanged starter file in both | not a conflict |
| P-READ with B.1 met but B.2 not | B does not count |
| `pending_validation` | not counted |
| Demo content in production | not counted |
| Missing `variant_family` | indeterminate |

## EXT-1: `integrated_assessment_passed` (unchanged design)

**Expert criterion (C5 condition 3):** «اجتياز مهمة عملية متكاملة تجمع المهارات الأساسية…».

**Params:**
```text
{ activity_code, pass_rule: 'PR-1' | 'PR-2', allowed_versions: string[] }
```

**Outcome:**

| Outcome | When |
|---|---|
| **Indeterminate** | the activity is not published, or no approved non-demo version is in `allowed_versions` |
| **Satisfied** | some standing, accepted evaluation on an allowed version passes the gate and every mandatory criterion (and, for PR-1, the total), and any borderline case has a concluded human review |
| **Not satisfied** | otherwise. The result names the reason |

**Tests:**

| Case | Expected |
|---|---|
| Passed but `pending_validation` | not satisfied |
| Withdrawn | not satisfied |
| Version outside `allowed_versions` | not satisfied |
| Borderline without review | not satisfied |
| PR-2 vs PR-1 on the same result | differ as specified |
| Any claim level changed by readiness | never |
