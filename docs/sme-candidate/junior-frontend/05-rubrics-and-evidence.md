> **DRAFT · NOT SME APPROVED · NOT PUBLISHED · NOT IMPORTED.** Rubric specifications and per-skill evidence paths (Rev. 2).
> - **Every weight, threshold, max score and level descriptor is blank and unapproved** (OPEN-043; decided only by a named SME on non-demo content).

# Rubrics and evidence paths (candidate)

## 1. Rubric specification: all three activities

| Activity | # | Criterion | Kind | Skill | Mandatory (proposed) | Evaluator today | Weight | Threshold | Threshold for skill | Max | Level descriptor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| INT | 1 | `semantic_structure` | skill_evidence | html | yes | human | — | — | — | — | — |
| INT | 2 | `responsive_layout` | skill_evidence | css | yes | human | — | — | — | — | — |
| INT | 3 | `data_states` | skill_evidence | api_states | yes | human | — | — | — | — | — |
| INT | 4 | `state_transitions` | skill_evidence | ui_state | yes | human | — | — | — | — | — |
| INT | 5 | `problem_traced` | skill_evidence | code_reading | yes | human | — | — | — | — | — |
| INT | 6 | `root_cause_fixed` | skill_evidence | debugging | yes | human | — | — | — | — | — |
| INT | 7 | `code_understanding` | skill_evidence | js | yes | human | — | — | — | — | — |
| INT | 8 | `git_workflow` | skill_evidence | version_control | yes | human (reviewed SHA) | — | — | — | — | — |
| INT | 9 | `decision_clarity` | skill_evidence | technical_explanation | no | human | — | — | — | — | — |
| INT | 10 | `judgment_assumption_check` | skill_evidence | requirements_reading | no | human | — | — | — | — | — |
| INT | 11 | `a11y_basics` | skill_evidence | accessibility | no | human | — | — | — | — | — |
| INT | 12 | `deliverables_complete` | gate | — | gate | rule | — | — | n/a | — | n/a |
| A | 1 | `semantic_fixed` | skill_evidence | html | yes | human | — | — | — | — | — |
| A | 2 | `a11y_keyboard_forms` | skill_evidence | accessibility | no | human | — | — | — | — | — |
| A | 3 | `responsive_fixed` | skill_evidence | css | yes | human | — | — | — | — | — |
| A | 4 | `validation_fixed` | skill_evidence | js | yes | human | — | — | — | — | — |
| A | 5 | `root_cause_note` | skill_evidence | debugging | yes | human | — | — | — | — | — |
| A | 6 | `scope_discipline` | skill_evidence | code_reading | no | human | — | — | — | — | — |
| A | 7 | `deliverables_complete` | gate | — | gate | rule | — | — | n/a | — | n/a |
| B | 1 | `component_explained` | skill_evidence | code_reading | yes | human | — | — | — | — | — |
| B | 2 | `problem_traced` | skill_evidence | code_reading | yes | human | — | — | — | — | — |
| B | 3 | `root_cause_fixed` | skill_evidence | debugging | yes | human | — | — | — | — | — |
| B | 4 | `filter_in_state` | skill_evidence | ui_state | yes | human | — | — | — | — | — |
| B | 5 | `empty_state_correct` | skill_evidence | api_states | yes | human | — | — | — | — | — |
| B | 6 | `js_correctness` | skill_evidence | js | yes | human | — | — | — | — | — |
| B | 7 | `decision_explained` | skill_evidence | technical_explanation | no | human | — | — | — | — | — |
| B | 8 | `deliverables_complete` | gate | — | gate | rule | — | — | n/a | — | n/a |

**Notes:**
- **"Threshold for skill"** is the existing per-criterion field that ENG-1 (per-skill results) would use. Each skill's result reads only its own criteria (F1).
- **"Mandatory"** governs the activity's overall pass. For INT, that pass is the readiness fact (EXT-1). For A and B, only the per-skill results matter.
- **Every skill criterion is human-scored today** by a named, blind reviewer (D-118 authorized basis). Automation is later and separate (CAP-1/2/4/5/6).
- **Pack rules kept on every activity:**
  - I1 (a private input);
  - I2 (an assessment-only check);
  - I3 (an explanation question);
  - `can_yield_verified = false`;
  - OPEN-045 evaluation modes.
- **Counts:** 27 criteria in all (24 skill + 3 gates), against 22 in 0.2.1.

## 2. Per-skill evidence paths (versioned; EXT-2 `skill_evidence_path`)

| Path | Skill | Distinct tasks | Counted (one item per task) | Validation activity needed | Understanding element | SME basis |
|---|---|---|---|---|---|---|
| P-HTML | html | 2 | INT.1 · A.1 | yes | INT.7 met | SME-06 (2) |
| P-CSS | css | 2 | INT.2 · A.3 | yes | INT.7 | SME-07 (2) |
| P-JS | js | 2 | A.4 · B.6 | yes | INT.7 (feeds js) | SME-08 (2), F2 |
| P-DBG | debugging | 2 | INT.6 · B.3 (A.5 may replace one) | yes | within criteria | SME-12 (2) |
| P-READ | code_reading | 2 | INT.5 · (B.1 **and** B.2) | yes | within criteria | SME-12 (2), F1 |
| P-GIT | version_control | **1** | INT.8 | no | G-4 within INT.8 | **F4** |
| P-UI | ui_state | 2 | INT.4 · B.4 | yes | INT.7 | SME-09 (2) |
| P-API | api_states | 2 | INT.3 · B.5 | yes | INT.7 | SME-10 (2) |
| P-A11Y | accessibility | **1** | A.2 (or INT.11) | no | INT.7 | SME-11 (1) |

**F3 applied:**
- A 2-task path with only one task met is **incomplete**, even when the explanation is good.
- No path requires a live modification round.
- No path requires anything AI-specific.

**Independence (only where 2 tasks are needed):** I-1 purpose · I-2 variant family · I-3 own criterion in its own evaluation · I-4 authorized basis · I-5 no reused learner artifact · I-6 resubmissions count once. See `07-ext-1-ext-2-design.md`.

## 3. Not evidence (unchanged, D-118)

- Presence or length checks.
- A repository URL without inspection.
- AI disclosure, either way.
- A second attempt at the same activity or variant family.
- A reused learner artifact (same upload or checksum).
- Demo-content results in production.
