# نَقْلة / NAQLA — ENG-1 P4: Per-Skill Evidence in Readiness (EXT-2) — Engineering Specification

**Date:** 2026-10-12 · **Status:** DESIGN ONLY at writing. **Update 2026-10-17:** implemented as an inactive, development-only pathway — see `ENG-1-P4-IMPLEMENTATION-REPORT.md` (D-125) for the as-built differences (corroborating evidence, `task_purpose`, demo never counts, legacy adapter as a rule param, EXT-1 not built).

**What this does not do:**
- No readiness policy is changed and no rule set is created or published.
- No verification policy is activated. The per-skill pathway stays development-only (D-123).
- No threshold, evidence requirement or path value is approved. Every value below is the SME candidate's *proposed* value.
- Readiness never changes a level (BR-024). `verificationEffect` stays `none`.

**Builds on:**
- `docs/sme-candidate/junior-frontend/07-ext-1-ext-2-design.md` (EXT-2 algorithm, Rev. 2);
- `05-rubrics-and-evidence.md` §2 (per-skill evidence paths);
- `ENG-1-P3-DEVELOPMENT-GATE-REPORT.md` (the per-skill records P4 reads).

**Product Owner decisions applied (post-P3):**
1. **PO-1 — unclaimed observations.** An assessment of a measured but unclaimed skill may be kept only as an internal, non-promotional observation, and never counts here. P4 counts only `skill_assessment.claimed = true`.
2. **PO-2 — `exception_granted`.** It never qualifies, in EXT-2 or in claims, until a separate claim policy and a human-override governance process are approved.
3. **PO-3 — pre-0028 claimed skills.** Audited read-only (`scripts/audit-claimed-skills.sql`). P4 excludes the anomalous classes (§9).

---

## 1. Where readiness stands today

| Element | Today |
|---|---|
| Rule types | `required_skill_at_level`, `non_compensable_skill`, `min_skills_at_level`, `all_core_skills_at_level`, `all_skills_at_expected_level`, `min_evidence_per_skill` (`packages/domain/src/readiness.ts`) |
| Facts | Per TrackSkill: the claim level (`skill_claim.state`), a **count** of standing evidence rows, and the journey state (`readiness.service.ts#facts`) |
| Rule sets | Governed (`readiness_rule_set`): draft → approved (four eyes) → activation. None is active; the learner sees «معيار الجاهزية لهذا المسار قيد الاعتماد» |
| Gap EXT-2 closes | A row count cannot say **which** criteria count, in **how many distinct tasks**, or whether two tasks reuse the same work (C3, F3) |

P4 adds two things:
- a new **fact source**: per-skill task facts built from the P3 records;
- a new **rule type**: `skill_evidence_path` (EXT-2).

Every existing rule type and fact keeps its exact behaviour.

---

## 2. The counted unit: an authorized per-skill task result

A **task result** for skill S is one (evaluation result, S) pair that passes **every** test below. These tests define provenance for readiness.

| # | Test | Source | Fails ⇒ |
|---|---|---|---|
| T1 | `skill_assessment` exists for (result, S), `claimed = true` (PO-1) | `skill_assessment` | not counted |
| T2 | `outcome = 'met'` from S's own criteria; each counted criterion met with an **approved, representable** threshold | `skill_assessment_criterion` | not counted |
| T3 | `basis_independently_verified = true` (D-118: named reviewer or platform-verified facts, SME-approved values, non-demo content) | `skill_assessment` | not counted |
| T4 | The decision citing it is `accepted` or `evidence_reestablished`. Never `exception_granted` (PO-2), `assessment_pending_validation`, `not_applicable`, `downgraded`, `rejected` or `escalated_to_human`. No later human decision overrides it (`human_override_of`) | `verification_decision.skill_assessment_id` | not counted |
| T5 | The evidence it produced (`evidence.skill_assessment_id = sa.id`) is **standing** (`withdrawn_at is null`) | `evidence` | not counted |
| T6 | Rubric version non-demo, values approved; activity non-demo. In production, demo content never counts (D-119) | `rubric_version`, `activity_spec` | not counted |
| T7 | The per-skill policy that decided it was **validated** (approved, production_active). Before P6 no such decision exists in production, so the fact set is empty there | `verification_policy` via `verification_decision.policy_id` | production: not counted; development: counted, marked `development_only` |

Notes:
- **Evidence is a pointer, not a count.** EXT-2 counts **task results** (T1–T7), never rows of `evidence`.
- **The existing `min_evidence_per_skill` count is unchanged.** It keeps counting standing rows, as today.
- **CLM-1 uses the same "positive decision" definition** (T4 + T5), so claims and readiness never disagree on what a recorded decision proves.

---

## 3. Activity and task-variant independence (I-1 … I-6)

Independence matters only when a path needs `min_distinct_tasks ≥ 2`.

| Rule | Meaning | Mechanism | Missing data ⇒ |
|---|---|---|---|
| I-1 Purpose | When required, one counted task is a **validation activity** | `activity_spec.is_validation_activity` (ENG-2, content, SME-reviewed) | `indeterminate` |
| I-2 Variant family | Two tasks count as two only if their activities belong to **different variant families** | `activity_spec.variant_family` (ENG-2, content, SME-reviewed) | `indeterminate` (never "assume distinct") |
| I-3 Own criteria, own evaluation | The task's counted criteria for S were met **in that evaluation**, by S's own `skill_assessment_criterion` rows | P3 records | not counted |
| I-4 Authorized basis | T1–T7 | §2 | not counted |
| I-5 No reused learner artifact | Two families that share a learner upload (`upload.checksum_sha256`) or a normalized text hash (ENG-2) count as **one** | `submission_artifact.upload_id → upload`, plus a server-side hash | Hash missing ⇒ `indeterminate` (reuse cannot be ruled out) |
| I-6 Resubmissions | Several evaluations in one family collapse to the **latest standing** one | `evaluation_result.evaluated_at` | — |

Additional rules:
- **Starter files are excluded from I-5.** Each activity's platform starter files get a server-computed checksum list (ENG-2). An unchanged starter file is never a reuse conflict.
- **Checksums and hashes are compared server-side only, within one learner.** They are never returned to a client.
- **ENG-2 (schema + content), prerequisite for I-1, I-2 and I-5:**
  - `activity_spec.variant_family text` and `activity_spec.is_validation_activity boolean` (nullable; set by content review);
  - `submission_artifact.normalized_text_sha256` (server-computed at submission for text deliverables);
  - `activity_starter_file(activity_spec_id, checksum_sha256)`.
  - Additive, nullable columns, with a rollback.

---

## 4. Per-skill evidence requirements (EXT-2 params, versioned)

**Rule type:** `skill_evidence_path`. `skill_id` is required, with one rule per skill. Params:

```text
{ min_distinct_tasks: int ≥ 1,
  counted_criteria: { [activity_code]: { versions: string[] | '*', criteria: string[] } },   // ALL listed keys met in that task
  require_validation_activity: boolean,          // allowed true only when min_distinct_tasks ≥ 2
  understanding: 'integrated_code_understanding' | 'within_criterion' | 'none' }
```

**Validation when a rule set is approved** (a domain function, called by `approveConfigRow` and refused by the database through a constraint trigger):
- `min_distinct_tasks ≥ 1`.
- Every `activity_code` resolves to a published, non-demo activity version listed in `versions`.
- Every criterion key exists on that version's rubric, is a `skill_evidence` criterion, and is linked to **this** skill (canonical). A key of another skill is refused: a task cannot count for S through another skill's criterion.
- `require_validation_activity` is refused when `min_distinct_tasks = 1`.
- Unknown keys are refused.

**Candidate paths** (SME candidate Rev. 2; **proposed, not approved**):

| Path | Skill | Distinct tasks | Counted criteria (per task) | Validation activity | Understanding |
|---|---|---|---|---|---|
| P-HTML | html | 2 | INT.1 · A.1 | yes | INT.7 |
| P-CSS | css | 2 | INT.2 · A.3 | yes | INT.7 |
| P-JS | js | 2 | A.4 · B.6 | yes | INT.7 |
| P-DBG | debugging | 2 | INT.6 · B.3 (A.5 may replace one) | yes | within criteria |
| P-READ | code_reading | 2 | INT.5 · (B.1 **and** B.2) | yes | within criteria |
| **P-GIT** | version_control | **1** | INT.8 | no | G-4 within INT.8 |
| P-UI | ui_state | 2 | INT.4 · B.4 | yes | INT.7 |
| P-API | api_states | 2 | INT.3 · B.5 | yes | INT.7 |
| P-A11Y | accessibility | **1** | A.2 (or INT.11) | no | INT.7 |

**The SME-confirmed one-project Git exception (F4):**
- P-GIT has `min_distinct_tasks = 1` and `require_validation_activity = false`. One INT task whose INT.8 criteria are met satisfies it. I-2 and I-5 do not apply because there is nothing to compare.
- It is still subject to T1–T7: a pending, withdrawn, demo or unauthorized result never satisfies it.
- The exception is a **per-path value**, not a code branch. A later rule-set version may change it only through approval.
- Test: P-GIT with INT met ⇒ satisfied with exactly one task; P-HTML with INT only ⇒ not satisfied (F3).

**Understanding:**
- `integrated_code_understanding` requires the INT.7 task result (T1–T7) for the same learner. Without it ⇒ `indeterminate`.
- `within_criterion` means the understanding element is one of the counted criteria.

---

## 5. Withdrawn and duplicate evidence

| Case | Behaviour |
|---|---|
| Evidence withdrawn | Its task result fails T5 and is not counted. If it was the only task in its family, the family drops out. The rule re-evaluates on the next read, and the readiness report history keeps the earlier report unchanged |
| Re-established evidence (D-077) | A new skill assessment with new evidence. Counted as the latest standing task of its family (I-6). Never counted twice |
| Two evidence rows for one (result, skill) | Impossible: unique index `evidence_one_platform_row_per_result_skill` (0026). A defensive `distinct (result, skill)` is used anyway |
| Two attempts on the same activity | One family ⇒ one task (I-6) |
| Same upload or text in two activities | One task (I-5) |
| Human override of an accepted decision | Not counted (T4) |

---

## 6. Multi-skill evaluations and separate decisions

- **One evaluation, several skills.** One evaluation may yield one task result for **each** skill whose own assessment passes T1–T7. A task counted for S never counts for another skill R unless R's own assessment, criteria and decision pass on their own.
- **`counted_criteria` is per skill.** P-READ lists B.1 and B.2 for code_reading; the same activity B lists B.3 for debugging. A B evaluation where B.1 and B.2 are met but B.3 is not counts for P-READ only.
- **The activity's overall pass is not an input** (INV-PS4). It is read only by EXT-1 (`integrated_assessment_passed`).
- **Each task fact carries its own provenance:** `skillAssessmentId`, `decisionId`, `evidenceId`, `rubricVersionId`, `activityCode@version`, `variantFamily`, the counted criterion keys and their stored statuses.
- **Unclaimed observations (PO-1) are invisible to P4.** The fact builder filters `claimed = true` in SQL, and the domain function asserts it.

---

## 7. Versioned readiness rules

- **New rule types** `skill_evidence_path` (EXT-2) and `integrated_assessment_passed` (EXT-1):
  - added to `READINESS_RULE_TYPES` only after their rows in `EXPERT-RULE-EXTENSION-REGISTER.md` are approved by the PO;
  - each with a Track Builder kind and CHG-017.
- **Rule sets keep the governed lifecycle:** draft → approved (four eyes, separation of duties) → development_only or production_active. Content is frozen after first activation. A change is a new version.
- **Every readiness report records** the rule set id and version, `DOMAIN_RULESET_VERSION`, and the **fact snapshot** it read: for EXT-2, the counted / collapsed / conflicts audit output (§10).
- **Rubric and activity versions:**
  - `counted_criteria[activity].versions` pins which activity versions count.
  - A new activity version counts only after a new rule-set version lists it.
  - Rubric pinning (ENG-1 P0) guarantees each task was assessed on the rubric bound to its version.
- **Rule-set evolution:** old task results stay valid under a new rule-set version only if their activity version is listed. This avoids silently re-scoring history under new criteria.

---

## 8. Historical compatibility

| History | Treatment |
|---|---|
| Existing rule types and readiness reports | Unchanged. Stored reports are never recomputed or rewritten |
| Legacy evidence (`skill_assessment_id is null`, primary-skill scope) | Still counts for the existing rule types (level, standing count). For EXT-2 it counts **only** through the legacy adapter below |
| **Legacy adapter (EXT-2)** | A legacy result counts for skill S only if all hold: (a) its decision for S is `accepted` / `evidence_reestablished` with standing evidence for S; (b) the audit payload attributed it to S (`attribution.skillId = S`, recorded since ENG-1 P0) or, for pre-P0 results, the submission claimed exactly one primary skill (no C4 ambiguity); (c) its structured assessment (0013+) has `assessment_criterion_result` rows for the counted keys, all `met`; (d) T6. Otherwise the result is excluded with the reason `legacy_attribution_unverifiable` or `legacy_criteria_unavailable`. It is never guessed |
| Pre-0013 evidence (no structured assessment) | No criterion facts, so not counted for EXT-2 (reason recorded). Still counted by the existing rule types |
| Pre-0028 claimed-skill anomalies (audit C1–C5) | Results whose claim falls in C1, C2, C3 or C5 are excluded from EXT-2 (`claim_anomaly`). C4 results follow P0 (no attribution, no evidence), so nothing is counted |

---

## 9. Fail-closed behaviour

| Situation | Outcome |
|---|---|
| Any fact a path needs is missing (variant family, validation flag, text hash, INT.7 result) | `indeterminate` (never satisfied) |
| Production with no validated per-skill policy (today, until P6) | Per-skill fact set empty, so EXT-2 is `not_satisfied` or `indeterminate`. The report keeps status `pending_validation` while the rule set is unvalidated |
| Unapproved or unrepresentable threshold | Outcome `incomplete` (P3), so not counted |
| Demo content in production | Not counted |
| Unknown or invalid params | Rule set refused at approval (domain + database) |
| Rule set not active | `not_yet_configured` / `pending_validation` headline. No readiness claim is shown (the existing `READINESS_PENDING_HEADLINE_AR`) |
| Non-compensable rule `indeterminate` | Overall is never `meets_rule_set` |
| Error while building facts | The report is not produced (no partial report); the error is logged with ids only |

---

## 10. Audit output (per rule, stored with the report)

```text
{ skillId, path, minDistinctTasks,
  counted:   [{ family, activity@version, evaluationResultId, skillAssessmentId, decisionId, evidenceId, criteria: {key: status} }],
  collapsed: [{ family, kept, dropped: [...] }],
  excluded:  [{ evaluationResultId, reason: 'withdrawn'|'pending_validation'|'not_claimed'|'exception_granted'|'overridden'|'demo'|'unapproved_threshold'|
                'legacy_attribution_unverifiable'|'legacy_criteria_unavailable'|'claim_anomaly'|'version_not_listed' }],
  reuseConflicts: [{ a, b, sharedBy: 'upload'|'text_hash' }],   // ids only, never checksums
  validationPresent, understanding, count, outcome }
```

**Learner wording (neutral, Arabic):**
- «تحتاج هذه المهارة دليلًا عمليًا من مهمتين مختلفتين؛ لديك دليل من مهمة واحدة حتى الآن».
- For reuse: «لم يُحتسب هذا الدليل مستقلًا لأنه يكرّر عملًا سابقًا».
- `indeterminate` never reads as a failure.
- No readiness verdict is shown while the rule set is unvalidated.

---

## 11. Architecture (when approved)

| Layer | Component |
|---|---|
| Domain (pure) | `evaluateSkillEvidencePath(params, facts) → {outcome, audit}` · `assertSkillEvidencePathParams(params, catalog)` · `taskResultCounts(fact)` (T1–T7) |
| API (read-only) | `ReadinessService.taskFacts(c, userId, skillIds)`: one SQL pass over `skill_assessment` ⋈ `skill_assessment_criterion` ⋈ `verification_decision` ⋈ `evidence` ⋈ `rubric_version` ⋈ `activity_spec` (+ legacy adapter). It runs as the service with an explicit `user_id` filter; no client parameter selects whose facts are read |
| DB | ENG-2 columns (§3). No writes from readiness except the existing `readiness_report` record |
| Admin | Track Builder kind for `skill_evidence_path`, showing the validation of keys against rubric versions |

---

## 12. Security and audit tests (to be written with P4)

| Area | Test |
|---|---|
| Provenance | Each of T1–T7 failing alone ⇒ not counted (one test per row) |
| PO-1 | An unclaimed met observation never counts, even with otherwise valid facts |
| PO-2 | `exception_granted` never counts |
| Independence | Two attempts on A ⇒ 1; A and B sharing an upload ⇒ 1; an unchanged starter file in both ⇒ not a conflict; missing `variant_family` ⇒ indeterminate; missing text hash ⇒ indeterminate |
| Git exception | P-GIT with INT met ⇒ satisfied with exactly 1 task; P-GIT pending / withdrawn / demo ⇒ not satisfied |
| F3 | P-HTML with INT only ⇒ not satisfied |
| Multi-skill | B with B.1 + B.2 met and B.3 not ⇒ counts for P-READ, not P-DBG |
| Withdrawal | Withdrawing the only task ⇒ the path drops; an earlier stored report is unchanged |
| Versions | An activity version not listed ⇒ not counted; the rule set refuses another skill's criterion key |
| History | Legacy adapter cases (a)–(d); pre-0013 ⇒ excluded with reason; audit C1–C3/C5 ⇒ excluded |
| Fail closed | Production with no validated per-skill policy ⇒ empty facts; demo in production ⇒ not counted |
| Tenant / RLS | Facts never include another user's rows; reuse comparison never crosses users; checksums never leave the server; a client cannot write any input (0026–0028 privileges) |
| No side effects | Readiness evaluation writes no claim, evidence or decision (BR-024); level unchanged before and after |
| Determinism | Same facts ⇒ same outcome and audit (property test) |

---

## 13. Blockers before P4 can be implemented

| # | Blocker | Owner |
|---|---|---|
| B4-1 | PO approval of the EXT-2 (and EXT-1) rows in `EXPERT-RULE-EXTENSION-REGISTER.md`, and of CHG-017 | PO |
| B4-2 | ENG-2 approval: `variant_family`, `is_validation_activity`, text hash, starter-file checksums; SME-reviewed values on the candidate activities | PO + SME |
| B4-3 | SME approval of path values (min tasks, counted criteria, validation flag, understanding element), including confirmation that the P-GIT and P-A11Y one-task exceptions stand as written | SME |
| B4-4 | Decision on the legacy adapter: count legacy results under (a)–(d), or count per-skill (P3+) results only | PO |
| B4-5 | P6 activation of a validated per-skill policy; until then production facts are empty by design | PO |
