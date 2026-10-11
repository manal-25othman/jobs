> **DRAFT · NOT SME APPROVED · NOT PUBLISHED · NOT IMPORTED.** Proposed rubrics and evidence requirements.
> - **Every weight, threshold, max score and level descriptor is blank on purpose.** They are SME values (V-2, OPEN-043), approved only by a named SME on non-demo content.

# Rubrics and evidence requirements (candidate)

## 1. Rubric template (per activity)

Weights and thresholds are blank (—):

| Activity | Criterion | Skill | Mandatory (proposed) | Evaluator today | Weight | Threshold | Level descriptor (working / foundation) |
|---|---|---|---|---|---|---|---|
| integrated | `semantic_structure` | html | yes | human | — | — | — |
| integrated | `responsive_layout` | css | yes | human (CAP-2 later) | — | — | — |
| integrated | `data_states` | api_states | yes | human (CAP-4 + CAP-2 later) | — | — | — |
| integrated | `state_transitions` | ui_state | yes | human | — | — | — |
| integrated | `root_cause_fixed` | debugging | yes | human (CAP-1 later) | — | — | — |
| integrated | `cause_located_in_code` | code_reading | yes | human (CAP-8 later, no LLM) | — | — | — |
| integrated | `code_understanding` | js | yes under R1 (OI-1) | human | — | — | — |
| integrated | `git_workflow` | version_control | yes | human (CAP-6 later) | — | — | — |
| integrated | `decision_clarity` | technical_explanation | no | human | — | — | — |
| integrated | `a11y_basics` | accessibility | no | human (CAP-5 subset later) | — | — | — |
| integrated | `no_regression` | debugging | no | human checklist (CAP-1 later) | — | — | — |
| integrated | `deliverables_complete` | — | gate | rule (presence only) | — | — | — |
| A | `semantic_structure` | html | yes | human | — | — | — |
| A | `responsive_layout` | css | yes | human | — | — | — |
| A | `data_states` | api_states | yes | human | — | — | — |
| A | `state_transitions` | ui_state | yes | human | — | — | — |
| A | `js_correctness` | js | yes | human | — | — | — |
| A | `a11y_keyboard` | accessibility | no | human | — | — | — |
| A | `deliverables_complete` | — | gate | rule | — | — | — |
| B | `root_cause_fixed` | debugging | yes | human | — | — | — |
| B | `cause_located_in_code` | code_reading | yes | human | — | — | — |
| B | `code_explained` | code_reading | yes | human | — | — | — |
| B | `no_regression` | debugging | no | human checklist | — | — | — |
| B | `git_workflow` | version_control | yes where placed (DM-4) | human | — | — | — |
| B | `fix_explained` | technical_explanation | no | human | — | — | — |
| B | `deliverables_complete` | — | gate | rule | — | — | — |

**Every activity keeps the existing pack rules:**
- **I1:** at least one platform-private input.
- **I2:** at least one assessment-only integrity check.
- **I3:** an explanation question.
- `can_yield_verified = false`.
- An OPEN-045 `evaluation_mode` per check.

Checks whose producer does not exist stay `future_deterministic` and **inactive** (Q22).

## 2. Evidence requirements per skill (K-1 structure)

Independence follows EXT-2, I-1…I-6. "Integrated" is the project; A and B are validation tasks.

| Skill | Min. independent items (SME) | Item 1 | Item 2 | Counted only if (beyond I-1…I-6) |
|---|---|---|---|---|
| html | 2 | integrated `semantic_structure` | A `semantic_structure` | both criteria meet threshold |
| css | 2 | integrated `responsive_layout` | A `responsive_layout` | same |
| js | 2 | integrated `code_understanding` (R1) | A `js_correctness` | same |
| debugging | 2 | integrated `root_cause_fixed` | B `root_cause_fixed` | same |
| code_reading | 2 | integrated `cause_located_in_code` | B `cause_located_in_code` **or** `code_explained` | one criterion result per item (I-3) |
| ui_state | 2 | integrated `state_transitions` | A `state_transitions` | same |
| api_states | 2 | integrated `data_states` | A `data_states` | same |
| accessibility | 1 | integrated `a11y_basics` or A `a11y_keyboard` | — | — |
| version_control | V-3: 1 or 2 | integrated `git_workflow` | B `git_workflow` (G-P1 only) | reviewed SHA recorded |

**Coverage check:** every Must and Core skill has item 1 from the project and item 2 from a validation task of a different variant family ✓.

**Under K-2 (6 activities):** the three 0.2.1 activities add more evidence paths. They are not validation activities (`is_validation_activity = false`), so they can provide item 1 but never satisfy I-1 alone.

## 3. What is not evidence (unchanged, D-118)

| Not evidence | Why |
|---|---|
| Presence or length checks (`deliverables_complete`, `artifact_text`) | Proves submission, not content |
| A repository URL alone | `submitted_link` |
| AI disclosure, in either direction | Context only (BR-025) |
| A second attempt at the same activity or variant family | I-6 |
| Any artifact reused from another submission (same `upload_id` or checksum) | I-5 |
| Demo-content results, in production | D-119 |
