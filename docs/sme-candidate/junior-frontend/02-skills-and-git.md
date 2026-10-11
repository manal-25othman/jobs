> **DRAFT · NOT SME APPROVED · NOT PUBLISHED · NOT IMPORTED.** Candidate skill classifications and definitions (Rev. 2, after the SME's final clarifications F1–F5).
> - Registry skills are **reused**: no new skill, synonym or alias.
> - No history is rewritten.

# Skills: classifications, Junior definitions, Git indicators

## 1. Classification

✅ = SME-confirmed (SRC-A/B/C). The open items are listed in the decision pack J-1 / J-2.

| Skill | Class | Junior proficiency | Min. distinct practical tasks | Readiness rule | Required verification level | `is_core` |
|---|---|---|---|---|---|---|
| `skl_html_semantic` | Must ✅ | working ✅ | 2 ✅ | `non_compensable_skill` | J-1 (open) | J-2 (open) |
| `skl_css_responsive` | Must ✅ | working ✅ | 2 ✅ | `non_compensable_skill` | J-1 | J-2 |
| `skl_js_fundamentals` | Must ✅ | working ✅ | 2 ✅ | `non_compensable_skill` | J-1 | J-2 |
| `skl_frontend_debugging` | Must ✅ | working ✅ | 2 ✅ | `non_compensable_skill` | J-1 | J-2 |
| `skl_code_reading` | **Must ✅ (F1)** | working, Junior scope (§2) ✅ | 2 ✅ | `non_compensable_skill` | J-1 | J-2 |
| `skl_version_control_basics` | Must ✅ | foundation ✅ | **1 ✅ (F4)** | `non_compensable_skill` | J-1 | J-2 |
| `skl_ui_state_interaction` | Core ✅ | working ✅ | 2 ✅ | `required_skill_at_level` | J-1 | J-2 |
| `skl_api_data_states` | Core ✅ | working ✅ | 2 ✅ | `required_skill_at_level` | J-1 | J-2 |
| `skl_accessibility_basics` | Core ✅ | foundation ✅ | 1 ✅ | `required_skill_at_level` | J-1 | J-2 |
| `skl_forms_validation` | Supporting | unchanged | — | none | — | false |
| `skl_technical_explanation` | Supporting | unchanged | — | none | — | false |
| `skl_requirements_reading` | Supporting | unchanged | — | none | — | false |

**Must/Core is carried by the readiness rule type**, the single authoritative source. `role_requirement.category` stays a display-only field. If it mirrors the class, a consistency check enforces agreement (ENG-6).

## 2. Junior-level definitions (proficiency, for SME calibration)

These describe **proficiency**. They do not grant or imply a verification level.

| Skill | At the Junior minimum, the person… | Not yet if… |
|---|---|---|
| HTML (semantic) | chooses elements by meaning (landmarks, headings, lists, form/label/button) without prompting | structure is generic containers, or controls are unlabelled |
| CSS (responsive) | keeps a layout usable at the given narrow and wide widths with no horizontal scroll, using flex/grid deliberately | the layout breaks at a given width or depends on fixed widths |
| JS fundamentals | writes correct DOM, event, array and validation logic without a framework; handles stated edge cases | works on the happy path only, or leaks globals |
| Debugging | fixes a reported problem **at its cause**, without breaking other behaviour | hides the symptom (e.g. swallowing the error) |
| **Code Reading (F1)** | **reads a simple component, explains its behaviour, and traces a basic problem to its location in the code** | describes code only in general terms, or names a location without a reason |
| UI state & interaction | keeps state as the source of truth; the view follows it | view and state drift apart |
| API data & states | handles and shows loading, error, empty and success | success path only (SME-35) |
| Accessibility (foundation) | labels controls, ties error messages to their fields, keeps everything keyboard-operable with visible focus | a control is unreachable by keyboard, or an error is not announced with its field |
| Git (foundation) | §3 | — |

**Code Reading excludes, at Junior level:** architecture review, cross-module design and refactoring strategy (SME-03, F1: no Mid-level complexity).

**Code Reading vs Debugging in a shared activity (F1):** separate criteria and separate results.
- **Code Reading:** "explains what the component does" and "traces the problem to where it originates".
- **Debugging:** "fixes it at that cause without regression".

A learner can meet one without the other, and each result is justified on its own.

## 3. Git: `skl_version_control_basics` (one-project exception, F4)

**Placed only in the integrated task.** No second Git activity.

| ID | Indicator | Junior acceptance (draft; SME calibration) | Learner submits | Reviewer records |
|---|---|---|---|---|
| G-1 | Works on a branch | the change lives on a non-default branch | `link.pull_request`, `text.head_sha` | branch name; SHA actually reviewed |
| G-2 | Small, described commits | **≥ 2** commits, each message says what changed; not one "everything" commit (count: SME value) | (same) | commit count and messages at the reviewed SHA |
| G-3 | Pull request with a description | says what changed and why (2–5 sentences) | (same) | present / adequate |
| G-4 | Explains own changes | refers to specific changed lines and why | `answer.git_diff_explained` | adequate / not, with a quoted line |

**Now (human-review path):**
1. A named reviewer opens the PR at the declared SHA.
2. They record the reviewed SHA and their G-1…G-3 observations in the criterion's supporting excerpt.
3. They judge G-4 against the diff.
4. Declared ≠ reviewed SHA, missing or rewritten history, or no access ⇒ **insufficient evidence**: routed to review, never an accusation.

**Later (independently verified):** CAP-6, a read-only repository-facts producer writing `verified.git.*`. It needs a consent and privacy review. Not built.

**Never evidence:**
- a repository URL without inspection (submitted material only);
- client-declared commit counts or merge state;
- screenshots;
- AI disclosure.
