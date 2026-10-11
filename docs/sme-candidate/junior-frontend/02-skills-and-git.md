> **DRAFT · NOT SME APPROVED · NOT PUBLISHED · NOT IMPORTED.** Candidate skill classifications and definitions.
> - Registry skills are **reused**: no new skill, synonym or alias.
> - No history is rewritten.
> - Classification values become track-skill change proposals only after PO decisions DM-1 and DM-2.

# Skills: candidate classifications and definitions

## 1. Candidate classifications

Two columns differ by alternative (DM-1). Neither alternative is chosen.

| Skill | Category, Alt. A | Category, Alt. B | `is_core` (P-1) | Junior proficiency (SME) | Min. independent evidence (SME) | Readiness rule shape | Required verification level |
|---|---|---|---|---|---|---|---|
| `skl_html_semantic` | must | must | true | working | 2 | `non_compensable_skill` | **DM-2** |
| `skl_css_responsive` | must | must | true | working | 2 | `non_compensable_skill` | DM-2 |
| `skl_js_fundamentals` | must | must | true | working | 2 | `non_compensable_skill` | DM-2 |
| `skl_frontend_debugging` | must | must | true | working | 2 | `non_compensable_skill` | DM-2 |
| `skl_code_reading` | **must** | **core** | true | working | 2 | A: `non_compensable_skill` · B: `required_skill_at_level` | DM-2 |
| `skl_version_control_basics` | must | must | true | foundation | **V-3** (1 or 2, per DM-4 placement) | `non_compensable_skill` | DM-2 |
| `skl_ui_state_interaction` | core | core | true | working | 2 | `required_skill_at_level` | DM-2 |
| `skl_api_data_states` | core | core | true | working | 2 | `required_skill_at_level` | DM-2 |
| `skl_accessibility_basics` | core | core | true | foundation | 1 | `required_skill_at_level` | DM-2 |
| `skl_forms_validation` | supporting | supporting | false | working (unchanged) | 1 (unchanged) | none | — |
| `skl_technical_explanation` | supporting | supporting | false | foundation (unchanged) | 1 (unchanged) | none | — |
| `skl_requirements_reading` | supporting | supporting | false | foundation (unchanged) | 1 (unchanged) | none | — |

**Totals:**

| | Must | Core | Supporting | `is_core` |
|---|---|---|---|---|
| Alt. A | 6 | 3 | 3 | 9 |
| Alt. B | 5 | 4 | 3 | 9 |

Under P-2, `is_core` would stay at the 0.2.1 five. P-2 is not recommended (decision pack §7.3).

## 2. Definitions: observable behaviour at the Junior minimum (for SME calibration)

These sentences go into skill definitions and level descriptors. They describe **proficiency**. They do not grant or imply a verification level.

| Skill | At `working` (Junior minimum), the person… | Not yet at the minimum if… |
|---|---|---|
| HTML (semantic) | chooses elements by meaning (landmarks, headings, lists, labelled form controls) without being told | structure is built from generic containers, or form controls have no labels |
| CSS (responsive) | builds a layout that holds at the given viewports without horizontal overflow, using flex/grid deliberately | layout breaks at a given viewport, or relies on fixed widths |
| JS fundamentals | writes correct DOM, event and array logic for the brief and handles its stated edge cases | logic works only on the happy path, or uses globals that break on re-render |
| Debugging | reproduces a reported defect, finds its root cause and fixes it there, without regressions | hides the symptom (e.g. catching and swallowing the error), or the fix breaks another behaviour |
| Code reading | explains what given code does and points to where a defect originates, from the code itself | describes the code only in general terms, or names a location without a reason |
| UI state & interaction | keeps state as the source of truth for the view; transitions are correct | the view and state drift apart, or interactions reset state by accident |
| API data & states | handles and shows loading, error, empty and success | only the success path is handled (SME-35) |
| Accessibility (foundation) | keeps interactive elements keyboard-reachable with visible focus and labels | an interactive element is unreachable by keyboard or unlabelled |
| Git (foundation) | see §3 | — |

## 3. Git: `skl_version_control_basics` evidence indicators (V-3)

Assessed **inside selected practical activities only** (decision pack §4.4). Never by a theory test (C1).

| ID | Indicator | Acceptable at Junior level (draft; SME to confirm) | Evidence the learner submits | What the reviewer records |
|---|---|---|---|---|
| G-1 | Works on a branch | A non-default branch carries the change | PR URL + head commit SHA (declared) | Branch name; the SHA actually reviewed |
| G-2 | Small, described commits | At least 2 commits, each with a message that says what changed. No single "final" commit with everything | (same) | Commit count and messages at the reviewed SHA |
| G-3 | PR with a description | The PR description states what changed and why, in 2–5 sentences | (same) | Present / adequate |
| G-4 | Explains own diff | Refers to specific changed lines and why they changed | Text deliverable `answer.git_diff_explained` | Adequate / not adequate, with a quoted line |
| G-5 | Follow-up on the same branch (optional) | A further commit for the follow-up request | Needs CAP-7 (not built) | — |

**Never evidence:**
- A repository URL alone.
- A client-declared commit count or merge status.
- A screenshot of a Git client.

**Insufficient evidence (escalate, never accuse):**
- the declared SHA differs from the reviewed one;
- the history is missing or rewritten;
- the repository is private and not shared with the review account.

**Privacy:**
- The learner chooses the repository and shares it voluntarily.
- No repository access is requested by the platform until CAP-6 has a consent and privacy review.
