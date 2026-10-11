# نَقْلة / NAQLA — Junior Frontend: Revised SME Integration Decision Pack

**Revision 2 · 2026-10-11 · Status:** DECISION PACK, updated with the SME's final clarifications. Nothing here is implemented, activated, published or approved.

**Revision history:**
- **Rev. 1** (commit `2b6d72a`): options for the Product Owner.
- **Rev. 2** (this file): the SME's final clarifications **F1–F5** resolve five of those options. §13 lists exactly what changed from Rev. 1.
- The first plan (`NAQLA-JUNIOR-FRONTEND-SME-INTEGRATION-PLAN.md`, `41327f9`) stays as the record of the first proposal.

**Draft-only candidate content:** `docs/sme-candidate/junior-frontend/`.
- It is outside `data/career/`, so neither the importer nor `verify:docs` reads it.
- The package to send to the SME is `09-sme-validation-package.md` (deliverable L).

**What this pack does not do:**
- It does not edit the SRS or production track files.
- It runs no migration and activates no configuration.
- It publishes nothing and grants no verification level.
- It starts no automated assessment tool.
- It changes no CV or LinkedIn policy.
- It does not touch `apps/web` or `apps/app`.

**Still in force:**
- D-118: the safety baseline `default@2`; promotion only on an independently verified basis.
- D-119: graduates see published, role-scoped content only.
- D-120: the graduate UI.
- Verified is blocked in P1 (D-102).
- H6 is inactive. No challenge activation.
- RISK-GROUNDING-01 and RISK-GROUNDING-02 stay open.

**Sources:**

| ID | Source |
|---|---|
| **SRC-A** | The SME's filled review form (PDF), sha256 `b47b89f2…8471`. Reviewer SME-JFE-01 |
| **SRC-B** | The SME's clarifications C1–C5 |
| **SRC-C** (new) | The SME's **final clarifications F1–F5**, relayed by the Product Owner on 2026-10-11, together with the Product Owner's directions 6–9 for this revision |

**SRC-C as recorded:**
- **F1 (Code Reading):** Must. It stays a separate registry skill from Debugging. At Junior level it means reading a simple component, explaining its behaviour and tracing a basic problem. No Mid-level architectural complexity. A shared activity may assess both skills, but each needs its own observable criterion and an independently justified result.
- **F2 (Understanding submitted code):** required of every graduate, whether or not AI was used. Disclosure must create no disadvantage. A working solution alone does not prove skill without demonstrated understanding. The former "AI-output verification" criterion means general code understanding and validation. No AI-specific challenge for every graduate.
- **F3 (Explanation vs independent application):** explaining and modifying the same code is not required in every assessment.
  - A correct solution, a credible explanation and other independently assessed practical evidence can together establish competence.
  - Working code plus a theoretical explanation, with no independent practical demonstration, is incomplete.
  - Requirements are designed at the evidence-path level.
  - A live modification round is not a universal blocking condition.
- **F4 (Git):** one project can suffice for foundational Git if it shows commit, branch and pull request, and the graduate explains the changes. Git stays Must. A repository URL without inspection is submitted material, not verified evidence.
- **F5 (Activity scope):** one integrated practical assessment plus two genuinely distinct short practical tasks. Together they cover: semantic HTML and accessibility (forms, keyboard); JavaScript fundamentals without a framework; Code Reading; responsive UI with API loading, error and empty states; basic debugging; practical Git.

---

## A. Decision matrix

| # | Topic | Status | Resolution / remaining question | Decided by |
|---|---|---|---|---|
| DM-1 | Code Reading classification | ✅ **Resolved (F1)** | **Must.** Separate from Debugging. Junior scope = read a simple component, explain its behaviour, trace a basic problem. Own criterion and own result in shared activities | SME |
| DM-5 | "AI-output verification" | ✅ **Resolved (F2)** | Reframed as **`code_understanding`**: understanding of submitted code, for **every** graduate. No AI-specific challenge. Disclosure creates no disadvantage (BR-025) | SME |
| DM-3a | Explanation vs live modification | ✅ **Resolved (F3)** | **No universal live-modification round.** Competence is established per **evidence path** (§E). Code + theory alone is incomplete | SME |
| DM-4 | Git placement and count | ✅ **Resolved (F4)** | **One project** (the integrated task) with observed commit, branch and PR + explanation of the changes. No second Git activity | SME |
| DM-7a | Activity scope | ✅ **Resolved (F5)** | **Three activities:** integrated + Short Task A + Short Task B. Six-activity option dropped | SME |
| DM-3b | Per-skill evidence paths | ◐ Direction resolved; values to confirm | Per-skill, versioned requirements (§E). The SME confirms each path in the validation package (L) | SME confirmation |
| DM-2 | Required verification level for Must and Core | ⬜ **Open** | V-a: Demonstrated for both · V-b: Demonstrated for Must, Practiced for Core · V-c: deferred. **Never auto-selected** (§G) | PO with SME |
| DM-6 | Integrated pass rule | ⬜ **Open** | PR-1 (gate + all mandatory + total) or PR-2 (gate + all mandatory); mandatory set; borderline band | SME calibration + PO |
| DM-7b | Representation of Must/Core in pack data (`is_core`) | ⬜ **Open** | P-1: `is_core` = Must ∪ Core (9) through a governed track-scoped constraint set + CHG-017 · P-2: `is_core` stays the OD-2 five (§H.3) | PO |
| DM-9 | Per-skill assessment results from one evaluation (H6 revision) | ⬜ **Open** (new) | Required for the three-activity design (§I, ENG-1). Approval to *build* it inactive. H6 stays off | PO |
| DM-8 | CHG-017 text | ⬜ **Open** | §I.3. Proposed, not applied | PO |

**What the SME has now professionally confirmed (SRC-A, SRC-B, SRC-C):**
- the skill classes (§B);
- the Junior proficiencies;
- the minimum evidence counts per skill (SME table);
- Git by one project;
- three activities;
- code understanding for everyone;
- evidence paths instead of identical challenges.

**What the SME has still not approved (calibration):**
- rubric weights, thresholds and level descriptors;
- the borderline band;
- the briefs and planted issues as written;
- the per-skill path wording;
- the variant distinctness of the three tasks.

The package in L asks for exactly these.

---

## B. Final proposed skill classification

| Skill (registry, unchanged) | Class | Junior proficiency | Min. distinct practical tasks | Evidence path (§E) | Readiness rule | Required verification level | `is_core` | Thresholds / descriptors |
|---|---|---|---|---|---|---|---|---|
| `skl_html_semantic` | **Must** · SME ✅ | working · SME ✅ | 2 · SME ✅ | P-HTML | `non_compensable_skill` | **DM-2** (PO) | DM-7b (PO) | calibration |
| `skl_css_responsive` | **Must** · SME ✅ | working · SME ✅ | 2 · SME ✅ | P-CSS | `non_compensable_skill` | DM-2 | DM-7b | calibration |
| `skl_js_fundamentals` | **Must** · SME ✅ | working · SME ✅ | 2 · SME ✅ | P-JS | `non_compensable_skill` | DM-2 | DM-7b | calibration |
| `skl_frontend_debugging` | **Must** · SME ✅ | working · SME ✅ | 2 · SME ✅ | P-DBG | `non_compensable_skill` | DM-2 | DM-7b | calibration |
| `skl_code_reading` | **Must** · SME ✅ (F1) | working, **Junior scope per F1** · SME ✅ | 2 · SME ✅ | P-READ | `non_compensable_skill` | DM-2 | DM-7b | calibration |
| `skl_version_control_basics` | **Must** · SME ✅ (C1, F4) | foundation ("Git الأساسي") · SME ✅ | **1** · SME ✅ (F4) | P-GIT | `non_compensable_skill` | DM-2 | DM-7b | calibration (G-1…G-4 acceptance) |
| `skl_ui_state_interaction` | **Core** · SME ✅ | working · SME ✅ | 2 · SME ✅ | P-UI | `required_skill_at_level` | DM-2 | DM-7b | calibration |
| `skl_api_data_states` | **Core** · SME ✅ | working · SME ✅ | 2 · SME ✅ | P-API | `required_skill_at_level` | DM-2 | DM-7b | calibration |
| `skl_accessibility_basics` | **Core** · SME ✅ | foundation ("Familiar") · SME ✅ | 1 · SME ✅ | P-A11Y | `required_skill_at_level` | DM-2 | DM-7b | calibration |
| `skl_forms_validation` | Supporting (SME silent; PO default) | unchanged | — | — | none | — | false | — |
| `skl_technical_explanation` | Supporting (SME-25: "decision clarity" does not block) | unchanged | — | — | none | — | false | — |
| `skl_requirements_reading` | Supporting (SME silent; PO default) | unchanged | — | — | none | — | false | — |

**Where Must/Core is recorded (role-classification semantics).**
- `role_requirement.category` exists today as a **display-only, non-professional** field ("تجميع للعرض · عرضي فقط", approvable operationally).
- Using it for Must/Core would silently turn it into a professional field.
- **Proposal:** the **readiness rule set** is the single authoritative carrier of Must/Core:
  - `non_compensable_skill` = Must;
  - `required_skill_at_level` = Core.

  It is professional, SME-approved, versioned and governed.
- `category` may mirror it as a display label only, with a new consistency check (ENG-6) so the two cannot disagree.
- `is_core` is DM-7b (§H.3).

---

## C. Three-activity coverage matrix

**Candidate activities:**

| ID | Code | Derived from | Variant family | Validation activity? |
|---|---|---|---|---|
| **INT** | `act_fe_integrated_leave_requests` (integrated) | `act_fe_build_interface@0.1.0` | `leave_requests_list` | no ("the project") |
| **A** | `act_fe_short_accessible_registration` | `act_fe_debug_improve@0.1.0` | `workshop_registration_form` | **yes** |
| **B** | `act_fe_short_read_and_fix` | `act_fe_change_request@0.1.0` | `team_tasks_change` | **yes** |

**Every Must and Core skill maps to exact criteria and observable evidence.** M = mandatory (proposed, on the basis of SME-25). "Extra" = assessed and recorded, not needed for the path.

| Skill | INT criterion → observable evidence | A criterion → observable evidence | B criterion → observable evidence | Path needs |
|---|---|---|---|---|
| HTML (Must) | `semantic_structure` (M) → `file.index_html`: landmarks, heading order, list semantics | `semantic_fixed` (M) → `file.index_html`: real buttons, ordered headings, form/label | — | INT + A |
| CSS (Must) | `responsive_layout` (M) → `file.styles_css` at 360 px / 1024 px, no horizontal scroll | `responsive_fixed` (M) → `file.styles_css`: no overflow at 360 px; sidebar at 1024 px | — | INT + A |
| JS (Must) | `code_understanding` (M) → `note.data_flow`: explains own code (understanding element) | `validation_fixed` (M) → `file.app_js`: invalid email rejected beside the field; error not swallowed | `js_correctness` (M) → `file.app_js`: no accidental globals, rejection handled | A + B, and INT `code_understanding` |
| Debugging (Must) | `root_cause_fixed` (M) → `file.app_js`: planted retry bug fixed at its cause | `root_cause_note` (M) → `note.root_causes` (extra) | `root_cause_fixed` (M) → `file.app_js`: empty-list condition fixed at its cause, not hidden | INT + B |
| Code Reading (Must) | `problem_traced` (M) → `note.bug_trace`: names the location in the starter code and how it produced the symptom | `scope_discipline` → changes in place (extra) | `component_explained` (M) → `answer.component_explained`: what `renderTasks` does with a given state · `problem_traced` (M) → `note.decision`: where and why | INT + B (B item = both criteria) |
| Git (Must) | `git_workflow` (M) → `link.pull_request`, `text.head_sha`, `answer.git_diff_explained` (G-1…G-4) | — | — | INT only (F4) |
| UI state (Core) | `state_transitions` (M) → `file.app_js`: state drives the view; retry resets state | — | `filter_in_state` (M) → `file.app_js`: the filter changes state, the view follows | INT + B |
| API states (Core) | `data_states` (M) → loading, error with retry, empty, success visible | — | `empty_state_correct` (M) → empty list and empty filter show a state message, not an error | INT + B |
| Accessibility (Core) | `a11y_basics` → keyboard path, visible focus (extra) | `a11y_keyboard_forms` → labels, errors tied to fields, keyboard operation, visible focus | — | A (1) |
| Forms (Supporting) | — | (validation is assessed for JS via `validation_fixed`) | — | — |
| Technical explanation (Supporting) | `decision_clarity` | — | `decision_explained` | — |
| Requirements reading (Supporting) | `judgment_assumption_check` | — | — | — |

**Coverage of F5:**

| F5 area | Covered by |
|---|---|
| Semantic HTML + accessibility (forms, keyboard) | A, plus INT HTML |
| JS fundamentals without a framework | A, B, INT |
| Code Reading of existing code | INT starter, B |
| Responsive UI + API loading/error/empty | INT, plus A responsive, plus B empty |
| Basic debugging | INT, B |
| Practical Git | INT |

No standalone test is added.

---

## D. Git evidence requirements (one-project exception)

| Item | Requirement |
|---|---|
| Skill | `skl_version_control_basics` (existing). **Must** · foundation |
| Where | **INT only** (F4). A and B do not ask for Git. A learner may still use Git in them; it is not assessed there |
| Path | **One** project with all of G-1…G-4 met |
| G-1 | Work on a non-default branch |
| G-2 | At least 2 small commits, each message saying what changed. Not a single "everything" commit (count: SME calibration) |
| G-3 | A pull request whose description says what changed and why |
| G-4 | Explains own changes, referring to specific changed lines (`answer.git_diff_explained`) |
| Submitted material | `link.pull_request` (through the existing `externalUrls`) + `text.head_sha` (a text deliverable). **Submitted, not verified:** a URL without inspection proves nothing (D-118) |
| **Now: human-review path** | 1. A named reviewer opens the PR **at the declared SHA**. 2. They record the SHA actually reviewed, and G-1…G-3 observations, in the criterion's supporting excerpt. 3. They read G-4 against the diff. 4. Declared ≠ reviewed SHA, missing or rewritten history, or no access ⇒ **insufficient evidence**: routed to review, never an accusation. This needs **no code**: the criterion, reviewer prompt and existing `criterion_result.supporting_excerpt` carry it |
| **Later: independently verified producer** | CAP-6: read-only repository-facts producer writing `verified.git.*` (branch, commits, PR, head SHA) with recorded provenance. Needs a consent and privacy review. Not built. Client-sent `verified.*` stays refused (400) |
| Never evidence | A URL alone · client-declared commit counts or merge state · a screenshot of a Git client · AI disclosure in either direction |

---

## E. Independent-evidence design (per skill, no universal two-activity rule)

### E.1 Model

Each skill has a **versioned evidence-path requirement**. It is part of the readiness rule set version, SME-approved, and never activated automatically:

```text
skill_evidence_path {
  skill, version,
  min_distinct_tasks,                 // SME value per skill (2, or 1 for Git and accessibility)
  counted_criteria: [activity.criterion | activity.criterion+criterion, ...],   // the only criteria that count, per task
  require_validation_activity,        // true only when min_distinct_tasks ≥ 2
  understanding: 'integrated_code_understanding' | 'within_criterion' | 'none'
}
```

### E.2 Paths

| Path | Skill | Tasks | Counted criteria (one item per task) | Validation activity required | Understanding element |
|---|---|---|---|---|---|
| P-HTML | html | 2 | INT `semantic_structure` · A `semantic_fixed` | yes | INT `code_understanding` met |
| P-CSS | css | 2 | INT `responsive_layout` · A `responsive_fixed` | yes | INT `code_understanding` |
| P-JS | js | 2 | A `validation_fixed` · B `js_correctness` | yes | INT `code_understanding` (this criterion feeds JS) |
| P-DBG | debugging | 2 | INT `root_cause_fixed` · B `root_cause_fixed` (A `root_cause_note` allowed as the second item) | yes | within criterion (fix at cause + note) |
| P-READ | code_reading | 2 | INT `problem_traced` · B `component_explained` **+** `problem_traced` | yes | within criterion (explain / trace) |
| P-GIT | version_control | **1** | INT `git_workflow` | no | within criterion (G-4) |
| P-UI | ui_state | 2 | INT `state_transitions` · B `filter_in_state` | yes | INT `code_understanding` |
| P-API | api_states | 2 | INT `data_states` · B `empty_state_correct` | yes | INT `code_understanding` |
| P-A11Y | accessibility | **1** | A `a11y_keyboard_forms` (INT `a11y_basics` allowed) | no | INT `code_understanding` |

**F3 encoded:**
- For a 2-task skill, one task's working code plus an explanation is **incomplete**. The path needs a second, independently assessed practical task.
- For Git and accessibility, the SME's minimum is one *practical* observation, not a theoretical one.
- No path requires a live modification round. CAP-7 is downgraded to an **optional** tool a reviewer may use in an exception case.

### E.3 Independence conditions (apply when a path needs 2 tasks)

| ID | Condition | Fact |
|---|---|---|
| I-1 Purpose | One counted item comes from a validation activity (`is_validation_activity`) | exists |
| I-2 Variant | The two items come from **different `variant_family`** values. Versions of one activity share a family | new content field (ENG-2) |
| I-3 Behaviour | Each item is the listed criterion (or criteria) for that task, met in **its own** evaluation. A criterion result counts once | `criterion_result` (exists) |
| I-4 Provenance | Standing, accepted (not `pending_validation`), approved non-demo rubric version; no demo content in production | exists (D-118 / D-119) |
| I-5 Reuse | No shared `upload_id` or confirmed `checksum_sha256` of learner-authored files; no identical normalized text deliverables. Starter files excluded | checksum exists; text hash new (ENG-2) |
| I-6 Resubmission | All attempts on one activity or family count as one item | exists |

- Different activity IDs alone are not proof (I-2, I-3). Duplicated files do not count (I-5).
- There is no similarity scoring and no inference about where work came from (BR-025).
- A non-counted item gets a neutral message, never an accusation.

### E.4 Per-skill results (prerequisite, DM-9)

**Today, with H6 off, an evaluation moves only the first skill the learner claims** (`evaluation.service.ts`: `primarySkillId`).
- The H6 code, when enabled, gives secondary skills the **same** decision as the whole run. That is not the "independently justified result" F1 requires.
- **ENG-1 proposes per-skill results instead:**
  - one evaluation yields, for each skill its rubric measures, an outcome based **only** on that skill's criteria (the existing `thresholdForSkill` field), plus the gate;
  - each outcome goes through the verification policy separately;
  - it is policy-gated, inactive, and needs its own PO approval;
  - it does **not** activate H6.
- **Without ENG-1:** the three-activity design cannot move nine skills, so readiness stays unreachable. That is fail-closed, never satisfied without proof.

---

## F. Rubric specifications

Full tables are in `05-rubrics-and-evidence.md` and `09-sme-validation-package.md`. **All weights, thresholds, max scores and level descriptors are blank and unapproved** (OPEN-043; a named SME decides on non-demo content).

| Activity | Criteria (incl. gate) | Mandatory (proposed) | Reused / adapted / new | Primary skills |
|---|---|---|---|---|
| INT | 12 | 8 (html, css, api, ui, read, debug, js-understanding, git) | 4 reused · 3 adapted · 5 new | css, api_states, debugging |
| A | 7 | 4 (html, css, js-validation, debugging note). Accessibility not mandatory: it never blocks other skills (SME-25), and its own path reads its criterion directly | 6 reused · 1 adapted | html, css, js |
| B | 8 | 6 | 6 reused · 1 adapted · 1 new | code_reading, debugging, js |

**Common to all three:**
- `can_yield_verified = false`.
- I1 (a platform-private input), I2 (an assessment-only check) and I3 (an explanation question) are kept.
- Checks without a producer stay `future_deterministic` and inactive.
- Every skill criterion is **human-scored today** by a named reviewer (the D-118 authorized basis).

---

## G. Readiness configuration proposal

Rule set `junior_frontend_readiness` v1. Candidate text only; not created.

| Condition | Rules | Status |
|---|---|---|
| **1. Every Must skill meets its approved required level** | R-M1…R-M6 `non_compensable_skill` (html, css, js, debugging, code_reading, version_control), `min_level` = **DM-2 value** · R-P (EXT-2) path rule for each | rule types exist (R-M); EXT-2 not built |
| **2. Every Core skill meets its approved Junior minimum** | R-C1…R-C3 `required_skill_at_level` (ui_state, api_states, accessibility), `min_level` = **DM-2 value** · R-P (EXT-2) per skill | same |
| **3. The integrated practical assessment is passed** | R-I1 `integrated_assessment_passed` (EXT-1) `{activity_code: act_fe_integrated_leave_requests, pass_rule: DM-6, allowed_versions}` | EXT-1 not built |

**The two axes stay separate.**
- *Proficiency* (`foundation` / `working`) is carried by SME-calibrated thresholds and level descriptors (PF-1).
- *Verification level* (Practiced / Demonstrated) is the claim state the rules read.
- **No threshold is auto-selected (DM-2):**

| Option | Meaning |
|---|---|
| V-a | Demonstrated for Must and Core |
| V-b | Demonstrated for Must, Practiced for Core. Under `default@2`, Practiced also needs an independently verified basis, so it is no easier today |
| V-c | Set not created; readiness reports `not_yet_configured` |

**Assessment basis:**
- **Human review is the interim basis:** named, blind, approved non-demo rubric (D-118).
- **Later it becomes the exception path** (borderline, conflicting signals, ambiguous results, calibration sample, C4) once an automated basis exists.
- **Automated promotion stays unavailable** until runners (CAP-1/2/4/5/6) are built, calibrated (golden set, agreement) and approved in a new verification-policy version.
- Verified stays disabled. BR-024 holds: readiness never changes a level.

---

## H. Existing three activities vs proposed three: reuse

### H.1 Comparison

| | `act_fe_build_interface` → **INT** | `act_fe_debug_improve` → **A** | `act_fe_change_request` → **B** |
|---|---|---|---|
| Scenario kept | «طلب إجازة»: list of previous requests from an internal service | «تسجيل في ورشة»: existing page with complaints (breaks on mobile, no keyboard, accepts a bad e-mail) | «مهام الفريق»: existing list, filter by status, empty-list-as-error report |
| Role in the SME model | Integrated practical assessment (C5 condition 3) | Distinct short task: semantic HTML, accessibility (forms, keyboard), responsive, JS validation | Distinct short task: reading existing code, tracing and fixing a basic problem |
| Main change | Adds a small **starter** with a planted retry bug, Git (branch, commits, PR) and `code_understanding`; responsive becomes mandatory. **Form part moves to A** (forms assessed there) | Accessibility criterion sharpened for forms and keyboard; `is_validation_activity` → true | Adds `component_explained`; splits tracing (code reading) from fixing (debugging); primaries become code_reading, debugging, js; `is_validation_activity` → true |
| Recommendation | **Adapt** | **Adapt** (nearly as-is) | **Adapt** |

### H.2 Criterion by criterion

| 0.2.1 criterion | Disposition | Candidate |
|---|---|---|
| build_interface `semantic_structure` | **reuse** | INT `semantic_structure` |
| build_interface `form_validation` | **superseded in INT**; forms assessed in A | A `validation_fixed` |
| build_interface `data_states` | **reuse** | INT `data_states` |
| build_interface `state_transitions` | **reuse** | INT `state_transitions` |
| build_interface `responsive_layout` (non-mandatory) | **adapt** → mandatory (CSS is Must) | INT `responsive_layout` |
| build_interface `explanation_clarity` | **adapt** → `code_understanding` (F2), linked to JS | INT `code_understanding` |
| build_interface `judgment_assumption_check` | **adapt**: conflict now between brief and API data, not form fields | INT `judgment_assumption_check` |
| build_interface `deliverables_complete` | **reuse** | INT gate |
| debug_improve `responsive_fixed`, `semantic_fixed`, `validation_fixed`, `root_cause_note`, `scope_discipline`, `deliverables_complete` | **reuse** | A, same keys |
| debug_improve `a11y_basics_fixed` | **adapt** → `a11y_keyboard_forms` (labels, errors tied to fields, keyboard path) | A |
| change_request `root_cause_fixed`, `filter_in_state`, `js_correctness`, `empty_state_correct`, `decision_explained`, `deliverables_complete` | **reuse** | B, same keys |
| change_request `code_reading` ("change in the right place") | **adapt** → `problem_traced` (F1: trace a basic problem) | B |
| — | **new** | INT `problem_traced`, `root_cause_fixed`, `git_workflow`, `decision_clarity`, `a11y_basics` · B `component_explained` |

**Inputs, deliverables, checks and tasks:**
- **Reused** wherever the scenario is kept: all integrity checks, all planted issues, `api.mock_*`, `note.*`, `answer.*`.
- **New:**
  - INT `repo.starter` (private, planted bug), `note.bug_trace`, `link.pull_request`, `text.head_sha`, `answer.git_diff_explained`, `answer.decisions`;
  - B `answer.component_explained`;
  - task `tsk_fe_version_control_flow` (tasks 11 → 12).

### H.3 Identity, preservation, constraints and document checks

**Identity (recommended, PO to confirm):** **new activity codes** with `source_refs` naming the 0.2.1 activity each derives from, plus a `CHANGES.md` entry.
- **Why not new versions of the old codes?** The purpose changes (validation flag, readiness gate), and EXT-1 / EXT-2 must not count 0.2.1 attempts.
- **What is preserved:**
  - the 0.2.1 pack stays canonical and unchanged until the candidate is published;
  - its activities, rubrics and every result on them stay as history;
  - nothing is deleted or rewritten.

**Pack constraints in effect** (`legacy_pack_constraints@1`, global; **not modified**):

| Constraint | Value | Candidate (3 activities) |
|---|---|---|
| `activity_count` | exactly 3 | 3 ✓ |
| `task_count` | 10–12 | 12 ✓ |
| `activity_primary_skill_count` | 2–3 | 3 / 3 / 3 ✓ |
| `rubric_min_criteria` | ≥ 5 | 12 / 7 / 8 ✓ |
| `resources_per_skill_max` | ≤ 3 | unchanged ✓ |
| `core_skill_count` | 4–5 | **P-1: 9 ✗** · P-2: 5 ✓ |
| `activity_core_primary_skill_count` | 2–3 | P-1: 3 / 3 / 3 ✓ · **P-2: B = 1 ✗** (only js is in the OD-2 five) unless B's primaries become js, ui_state, code_reading, which understates debugging |

**DM-7b options (PO):**
- **P-1:** `is_core` = Must ∪ Core.
  - Explicit, not silent: track-skill changes + a **new track-scoped** `pack_constraint_set` `trk_frontend_junior_constraints` v1 with `core_skill_count` 9–9 (everything else copied).
  - Draft → four eyes → separate activator. The global set is untouched.
  - Plus CHG-017.
  - **Recommended:** it states the SME model honestly in the data.
- **P-2:** `is_core` stays the OD-2 five. No numeric change.
  - "core" then means "OD-2 structural set", unrelated to SME "Core".
  - Task B's primaries must be bent to pass. Debugging, Code Reading and Git (all Must) would read `is_core = false`.

**SRS and document checks that conflict at publication (not now):**

| Where | States | Candidate |
|---|---|---|
| SRS §3.1 | `trk_frontend_junior@0.2.1`, "5 مهارات أساسية", "11 مهمة", "3 أنشطة" with the three 0.2.1 codes, "22 بند رُبريك (19 + 3 بوابات)" | new version, 12 tasks, new codes, 27 criteria (24 + 3 gates), core 9 (P-1) |
| SRS scope | "3 أنشطة فقط" | **holds** |
| OD-2 | "المجموعة الأساسية الخمس مضبوطة؛ SME يوصي ولا يستبدل بصمت" | amended by CHG-017 (the SME recommendation is the non-silent route OD-2 requires) |
| `scripts/verify-docs.mjs` §3 | (a) manifest version = the version quoted in §3.1; (b) **`is_demo_fixture === true`**; (c) exactly 5 core skills; (d) 3 activities | (a) and (b) **must change** at publication of an SME-approved non-demo pack; (c) changes under P-1; (d) holds. Updated **in the same commit** as CHG-017's application and the publication, never before |

The drafts in `docs/sme-candidate/` do not trip any check today. `npm run verify` passes.

---

## I. Engineering dependencies and extension-register items

### I.1 Needed for a human-reviewed pilot of the candidate

| ID | Item | Kind | Notes |
|---|---|---|---|
| **ENG-1** | Per-skill assessment results from one evaluation (§E.4) | verification-policy behaviour + code | **Critical path.** Policy-gated, inactive, separate PO approval (DM-9). H6 stays off. **Engineering design:** `ENG-1-PER-SKILL-ASSESSMENT-DESIGN.md` |
| **EXT-2** | `skill_evidence_path` readiness rule (§E) | **extension register** | Replaces Rev. 1's `min_independent_evidence_per_skill`: per-skill, versioned, `counted_criteria`, `min_distinct_tasks` |
| **EXT-1** | `integrated_assessment_passed` readiness rule | **extension register** | Unchanged design (`07-…`) |
| ENG-2 | `activity_spec.variant_family` content field + server-side normalized text hash | content schema + code | Used by EXT-2 (I-2, I-5) |
| ENG-3 | Starter materials delivery (private, versioned) | capability (CAP-14) | All three activities need starter material. The graduate UI already says "materials unavailable" honestly (D-120). No UI change |
| ENG-4 | Mock API scenarios (200 / 500 / empty / slow) | capability (CAP-4) | INT and B |
| ENG-5 | `verify-docs` update at publication | docs check | §H.3, with CHG-017 |
| ENG-6 | Category ↔ readiness-rule consistency check | quality rule | §B. Only if `category` mirrors Must/Core |
| — | Git human-review path | **none** | Reviewer prompt + `supporting_excerpt` (§D) |

### I.2 Later: automation only (not needed for the pilot; each with its own security and privacy review)

| CAP | What |
|---|---|
| CAP-10 | `platform_verified` provenance |
| CAP-1 | Test runner |
| CAP-2 | Rendering runner |
| CAP-3 | Static analysis |
| CAP-5 | Accessibility checks |
| CAP-6 | Git facts |
| CAP-8 | Structured explanation capture |
| CAP-13 | Calibration tooling |
| CAP-7 | Follow-up round: **optional**, no longer a dependency (F3) |

### I.3 CHG-017 (proposed requirements, not applied)

| CR | Requirement | Change from Rev. 1 |
|---|---|---|
| CR-1 | Must / Core / Supporting classification and semantics (C2). The readiness rule set is the authoritative carrier | carrier stated |
| CR-2 | Professional proficiency ≠ verification level. Configuration never assigns a level. Ladder unchanged | — |
| CR-3 | Readiness = all Must at the approved level + all Core at the approved Junior minimum + the integrated assessment passed. Never a percentage or count. BR-024 unchanged | — |
| CR-4 | Git is assessed in practice. **One project suffices** when commit, branch and PR are observed and the changes explained. A link alone is not evidence | **F4** |
| CR-5 | **Per-skill, versioned evidence paths.** Where a path needs more than one task, the tasks are independent (variant, assessed behaviour, authorized basis, no reuse, no resubmission). **No universal two-activity minimum** | **F3, item 6** |
| CR-6 | The integrated assessment is a readiness condition. Only a standing, accepted result on an approved version counts | — |
| CR-7 | **Understanding of submitted code is required of every graduate**, through the evidence path. Not a universal live-modification round, not an AI-specific challenge. Disclosure never disadvantages (BR-025 unchanged) | **F2, F3** |
| CR-8 | The P1 Frontend track's counts follow the SME-reviewed configuration, recorded as a governed track-scoped constraint version. **3 activities kept.** Amends §3.1 and OD-2 | **F5** |
| CR-9 | Human review is the interim authorized basis and, once an automated basis is approved, the exception mechanism. It is not a permanent requirement | item 8 |
| CR-10 | Each skill assessed in a shared activity has its own criterion and its own result | **F1** (new) |

---

## J. Remaining decisions (genuinely unresolved only)

| # | Decision | Who | Options |
|---|---|---|---|
| J-1 | Required verification level for Must and for Core (DM-2) | PO with SME | V-a · V-b · V-c |
| J-2 | `is_core` representation (DM-7b) | PO | P-1 (recommended) · P-2 |
| J-3 | Approve building ENG-1, EXT-1, EXT-2 and ENG-2 (all inactive) (DM-9) | PO | yes / no / later |
| J-4 | Integrated pass rule and mandatory set (DM-6) | SME + PO | PR-1 · PR-2 |
| J-5 | Calibration values: weights, thresholds, level descriptors, borderline band, durations, Git acceptance (G-2 count) | SME | in L |
| J-6 | Per-skill path wording and variant distinctness of INT / A / B | SME | in L |
| J-7 | New activity codes with `source_refs` (recommended), or new versions of the 0.2.1 codes | PO | — |
| J-8 | CHG-017 text (CR-1…CR-10) | PO | approve / change |

**No longer open:** Code Reading class · AI-output criterion · live modification · Git count · activity scope · six activities.

---

## K. Minimal implementation sequence

Compatible with the separately ongoing Graduate Activity UI work: **no step touches `apps/app` until the last one, and that is copy only.**

| Step | What | Depends on | Touches |
|---|---|---|---|
| K0 | PO approves this pack; the validation package (L) goes to the SME | — | docs |
| K1 | SME returns L (J-4…J-6) | K0 | docs |
| K2 | CHG-017 drafted → PO approves → applied to the SRS **together with** `verify-docs` (ENG-5), at publication time | K1, J-8 | SRS, `scripts/` |
| K3 | Content authored as **non-demo draft** via the promotion flow, plus starter materials and mock-API scenarios | K1, J-7 | candidate content (draft), review records |
| K4 | Backend extensions, **inactive**: ENG-1, ENG-2, EXT-2, EXT-1 (+ register rows, tests, Track Builder kinds) | J-3 | `packages/domain`, API readiness/evaluation, admin |
| K5 | Governed drafts, inactive: track-skill changes, constraint set (P-1), readiness set (J-1 values) | K2, K4, J-1, J-2 | governed config (draft) |
| K6 | SME approves rubric values on non-demo content; staging validation with human review (§13 tests of the first plan + EXT/ENG tests) | K3, K5 | review records |
| K7 | PO activation and publication (separation of duties). Graduate UI copy for Must/Core labels (read from the readiness rules) | K6, pilot blockers | activation records, `apps/app` copy |
| later | Automation: CAP-10 → CAP-4/1/2/3/5/6/8 → calibration → automated-basis policy | separate approvals | new services |

---

## L. SME validation package

`docs/sme-candidate/junior-frontend/09-sme-validation-package.md`. It is self-contained and ready to send:
- the three task briefs (Arabic, learner-facing);
- the reviewer-only notes (planted issues);
- the three rubrics (blank values);
- the per-skill evidence paths;
- the Git acceptance questions;
- a short answer sheet.

---

## 13. Changes from Rev. 1

| Rev. 1 | Rev. 2 | Source |
|---|---|---|
| DM-1 Code Reading: alternatives A / B | **Must**; Junior scope defined; own criterion and result | F1 |
| DM-5 AI verification: R1 / R2 | **`code_understanding` for all**, no AI-specific challenge | F2 |
| OI-1 / CAP-7 follow-up round as possible blocker | **Not universal**; evidence paths; CAP-7 optional | F3 |
| Git in 1–3 activities (G-P1/2/3); V-3 count open | **INT only, one project** | F4 |
| K-1 (3 activities) vs K-2 (6) | **K-1** | F5 |
| Rev. 1 short tasks: profile card (A), cart bug (B), new integrated scenario | **Adapted from the 0.2.1 activities** (§H): A ← debug_improve, B ← change_request, INT ← build_interface | item 7 |
| EXT-2 `min_independent_evidence_per_skill` with `min_count` | **EXT-2 `skill_evidence_path`**: per-skill, versioned, counted criteria, distinct-task count | item 6 |
| H6 noted as a capability "behind a flag" | **ENG-1 per-skill results**, a prerequisite; H6 stays off | F1, code audit |
| `category` assumed to carry Must/Core | **The readiness rule set carries Must/Core**; `category` stays display-only | item 7, code audit |
| `verify-docs` conflict: 5 core / 3 activities | **Adds the DEMO-fixture and version checks** | item 7, audit |
| Readiness `min_level` options | Unchanged (DM-2 open); human review interim, not permanent | item 8 |

---

**Stopped. Awaiting Product Owner approval.**
- No SRS edit, no production track file change, no migration.
- No configuration activated, nothing published.
- No automated assessment tool started.
- CV and LinkedIn policies unchanged.
