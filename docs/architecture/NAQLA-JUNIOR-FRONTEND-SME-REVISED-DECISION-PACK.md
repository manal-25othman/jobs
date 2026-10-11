# نَقْلة / NAQLA — Junior Frontend: Revised SME Integration Decision Pack

**Date:** 2026-10-11 · **Status:** DECISION PACK. Nothing here is implemented, activated, published or approved.
**Supersedes, where stated (§10):** `NAQLA-JUNIOR-FRONTEND-SME-INTEGRATION-PLAN.md` (commit `41327f9`). That plan stays in the repository as the record of the first proposal.
**Draft-only candidate content:** `docs/sme-candidate/junior-frontend/` (§8). The importer does not read it, and nothing in it is published.

**What this pack does not do:**
- It does not edit the canonical SRS.
- It activates no policy, readiness rule set, pack-constraint set or track version.
- It publishes no content, and the candidate is not exposed to graduates (§9).
- It grants no verification level and adds no production rule.
- It does not implement EXT-1, EXT-2, sandboxed runners or automated promotion.
- It creates no approval record and alters no historical result.
- It does not touch `apps/web` (frozen) or the graduate UI (`apps/app`).

**Still in force:**
- D-118: the safety baseline `default@2`; promotion only on an independently verified basis.
- D-119: graduates see published, role-scoped content only.
- D-120: the graduate UI.
- Verified stays blocked (D-102). H6 stays inactive. No challenge activation. No readiness thresholds.
- RISK-GROUNDING-01 and RISK-GROUNDING-02 stay open.

**How to read the decision status in this pack:**

| Mark | Meaning |
|---|---|
| **SME-stated** | The SME wrote it, in SRC-A (the PDF) or SRC-B (the clarifications). It is a professional input, not an authorization to publish |
| **PO decision** | A product or governance choice the Product Owner makes |
| **SME calibration** | A numeric or descriptive value the SME has to set or confirm. It is usually validated against real or golden submissions |
| **Engineering** | A capability that has to be built. Each one is its own reviewed change |

---

## 1. Decision matrix

| # | Topic | SME-stated (source) | Options in this pack | PO decision | SME confirmation / calibration | Proposal, if any (not activated) |
|---|---|---|---|---|---|---|
| **DM-1** | Code Reading classification | One table row «Code Reading/Debugging: Must · Working · 2 · Bug» (SME-12). The mandatory list names Debugging, **not** Code Reading (SME-17). The criterion «فهم الكود» is Critical and blocks Demonstrated (SME-25) | **A:** both Must · **B:** Debugging Must, Code Reading Core, assessed independently (§3) | **Choose A or B** | Confirm which reading of SME-12 / SME-17 was meant | **None.** Both alternatives are presented, neither is chosen |
| **DM-2** | Proficiency vs verification level | Proficiency per skill: Working or Familiar (SME-06…12) | The two axes are kept separate (§2). The readiness `min_level` is set per class: **V-a** Demonstrated for Must and Core · **V-b** Demonstrated for Must, Practiced for Core · **V-c** deferred until calibration | **Choose V-a, V-b or V-c**. The verification ladder is unchanged | Level descriptors that say what *Working* and *Familiar* look like in each criterion | No automatic Demonstrated. The level is reached only through the D-118 path (§2.3) |
| **DM-3** | Independence of two evidence items | «مشروع عملي مع مهمة قصيرة مستقلة… ليس فقط تكرار نفس الحل» (C3) | Auditable criteria I-1…I-6 (§5): purpose, variant, assessed behaviour, provenance, artifact reuse, resubmission | Approve the criteria and register EXT-2 (inactive) | Confirm that the task variants really differ (content review) | Different activity IDs alone are **not** proof |
| **DM-4** | Git activity placement | Git is assessed inside practical tasks, not by a theory test. Commit, Branch, PR, and understanding the change (C1) | **G-P1:** integrated task + Short Task B · **G-P2:** integrated task only · **G-P3:** integrated + Task B + `change_request` (§4) | Choose a placement. Git is not required in every activity | V-3: how many observations, and what counts as an acceptable commit, branch or PR | A repository URL alone never counts (§4.3) |
| **DM-5** | AI-output verification applicability | «التحقق من مخرجات AI»: Important, but **blocks** Demonstrated. Proven by modification + explanation (SME-25) | **R1:** understanding of submitted code, for **every** submission · **R2:** only when AI material is used (§6.4) | Choose R1 or R2. BR-025 constrains R2 | Confirm the SME meant understanding, not AI provenance | **R1** recommended. Disclosure is never a failure reason (BR-025) |
| **DM-6** | Integrated-task criteria and pass rule | Responsive UI, API with Loading/Error, a simple bug fix (C5 condition 3) | Per-skill criteria, not every criterion on every skill (§6.2). Pass rule **PR-1** gate + all mandatory + total, or **PR-2** gate + all mandatory (§6.3) | Choose PR-1 or PR-2, and which criteria are mandatory | V-4: thresholds, borderline band, duration | — |
| **DM-7** | Pack-constraint counts | The SME asked for an integrated task and a distinct short task (C3, C5). They set no counts | **K-1:** restructure to 3 activities (integrated + 2 short) · **K-2:** keep the 3 and add 3 (6). Core: **P-1** a new track-scoped set with `core_skill_count` 9 · **P-2** keep `is_core` at 5 and express Must/Core by `category` (§7) | Choose K-1 or K-2 and P-1 or P-2. Any numeric change is a **new governed version** plus CHG-017 | Confirm that 2 short tasks + 1 integrated task is enough evidence (C3) | No ad hoc bypass. The legacy global set is unchanged |
| **DM-8** | CHG-017 scope | — | §11: CR-1…CR-9 | Approve the CHG text before it is applied to the SRS | Review the professional wording (Must/Core semantics) | Proposed only. The SRS is not edited |

**What the SME has professionally approved:** the inputs in SRC-A and SRC-B, as recorded verbatim in the first plan §1.
- Professional direction: Must + minimum Core + an integrated practical assessment, instead of a count or a percentage.
- Git assessed in practice (C1).
- Project + distinct short task (C3).
- Automated assessment with human review for exceptions (C4).

**What the SME has not approved:** none of the following has been signed off yet. All are still SME values (V-1…V-8, §13.2):
- rubric values;
- level descriptors;
- the briefs;
- the task variants;
- thresholds;
- the borderline band;
- the calibration set;
- any wording in `docs/sme-candidate/`.

---

## 2. Proficiency is not the verification level

### 2.1 Two independent axes

| Axis | Question it answers | Where it lives today | Who sets it |
|---|---|---|---|
| **Professional proficiency** (`foundation` = SME «Familiar», `working` = SME «Working») | *How well* must a Junior do this? | `role_requirement.target_proficiency` (text, descriptive), `proficiency_scale@1.0.0` level descriptors, and rubric level descriptors | SME (V-1, V-2) |
| **Verification level** (evidence ladder: `gap → self_reported → practiced → demonstrated → verified`) | *How strongly* is the user's claim supported, and on what basis? | The claim state, moved only by an evaluation under the active verification policy (D-118) | The system, under governed policy. Never set by configuration |

**Rules this pack keeps:**
1. **The verification ladder is unchanged.** No new state, no rename, no change to transition rules.
2. **Proficiency never moves a claim, and a claim never implies a proficiency** beyond what the criteria that produced it measured.
3. **Demonstrated is never assigned automatically.** It is reached only when an approved, non-demo rubric is evaluated through the authorized basis:
   - today, that is a named human reviewer (blind review, the D-118 path);
   - later, possibly a separately approved `platform_verified` basis (§12, S6).

   Configuration, readiness rules and this candidate grant no level.
4. **Readiness reads verification levels only** (BR-024: a report, never a change of level).

**The gap.** The platform does not record which proficiency an evaluation established. A Demonstrated claim at Junior level is only as "Working" as the rubric thresholds that produced it.

| Option | How proficiency is carried | Cost | Status |
|---|---|---|---|
| **PF-1** | Through calibration. Mandatory-criterion thresholds and level descriptors are calibrated by the SME so that *meeting them* means `working` or `foundation` | Content and calibration only | Recommended starting point |
| **PF-2** | As a fact. The evaluation records `proficiency_observed` per skill from the rubric descriptor band; readiness reads it | New column, domain change, rule parameter. **Engineering + CHG** | Not proposed for now. Listed so it is not lost |

### 2.2 Per-skill mapping

The *required level for readiness* is the DM-2 option the Product Owner chooses, so it is not filled in. "Route" is how a claim can move up under today's rules.

| Skill (registry) | SME proficiency (Junior minimum) | What the evidence must show at that proficiency (indicators, for SME calibration) | Evidence route to Practiced / Demonstrated (unchanged ladder) | Readiness implication if Must (non-compensable) | If Core (required minimum) |
|---|---|---|---|---|---|
| `skl_html_semantic` | Working | Correct landmarks, headings and form semantics without prompting; chooses elements by meaning | Practiced: not awarded on submission under `default@2`. Demonstrated: approved rubric, named reviewer, mandatory criterion met | Missing ⇒ `not_satisfied`, and nothing offsets it | — |
| `skl_css_responsive` | Working | Layout holds at the configured viewports with no horizontal overflow; uses flex or grid deliberately | same | same | — |
| `skl_js_fundamentals` | Working | Correct DOM, event and array logic; handles the edge cases in the brief | same | same | — |
| `skl_frontend_debugging` | Working | Finds the root cause and fixes it at the cause, not the symptom; no regression | same | same | — |
| `skl_code_reading` | Working | Explains what the given code does and where the defect is, from the code itself | same | **Alt. A** | **Alt. B** (§3) |
| `skl_version_control_basics` | Familiar (SME: «Git الأساسي») | Small described commits, a branch, a PR description, and explains their own diff (§4.2) | same, and only where Git is placed (§4.4) | Must per SME-17 / C1 | — |
| `skl_ui_state_interaction` | Working | State drives the view; transitions are correct and not reset by accident | same | — | Must reach the minimum. Variation above it is accepted (C2) |
| `skl_api_data_states` | Working | Loading, error, empty and success are each handled and visible | same | — | same |
| `skl_accessibility_basics` | Familiar | Keyboard reachable, labels present, focus visible | same | — | same. Its absence does not block Demonstrated in **other** skills (SME-25) |
| `skl_forms_validation` | (SME silent) | — | same | Supporting: no readiness rule | — |
| `skl_technical_explanation` | (SME silent; explanation is an evaluator input, SME-26) | — | same | Supporting: no readiness rule. Explanation stays a criterion inside activities | — |
| `skl_requirements_reading` | (SME silent) | — | same | Supporting: no readiness rule | — |

### 2.3 DM-2 options, compared

| Option | Must rule `min_level` | Core rule `min_level` | Implication today (D-118: no Practiced on submission) | Risk |
|---|---|---|---|---|
| **V-a** | demonstrated | demonstrated | Every Must and Core skill needs a reviewed result. Readiness is reachable only with reviewer capacity | Reviewer load. This is the honest reading of C5 ("passed at the required level") |
| **V-b** | demonstrated | practiced | Under `default@2`, Practiced also needs an independently verified basis, so in practice it is **no easier** than V-a today. It differs only once a future policy defines Practiced differently | Looks lighter than it is. Could be misread as "Core is optional" |
| **V-c** | not set | not set | The readiness set stays without values; readiness reports `not_yet_configured` | Delays the pilot's readiness report. No false signal |

**C2** («يمكن قبول تفاوت في مستوى إتقانها، بشرط الوصول إلى الحد الأدنى») is about *proficiency* above the Junior minimum, not about a weaker verification basis. V-a and V-b both honour it. The choice is the Product Owner's.

---

## 3. Code Reading and Debugging: two alternatives (not chosen)

**Common to both alternatives:**
- Two registry skills stay two skills. No merge, no alias.
- No history is rewritten: existing claims, evidence and results stay as recorded.
- Each skill has **its own criterion and its own evidence count**. A debugging result never stands in for a code-reading result, or the other way round.

| | **Alternative A: both Must** | **Alternative B: Debugging Must, Code Reading Core (assessed independently)** |
|---|---|---|
| SME basis | SME-12 (one row: Must · Working · 2 · Bug); SME-25 «فهم الكود» Critical and blocking | SME-17 mandatory list names Debugging, not Code Reading; C2 Core semantics |
| `category` | both `must` | debugging `must`, code reading `core` |
| Readiness rules | `non_compensable_skill` ×2 | `non_compensable_skill` (debugging) + `required_skill_at_level` (code reading) |
| Evidence | Each needs 2 independent items (§5). One bug-fix run can carry both criteria, but each criterion is counted for its own skill only | Debugging: 2 independent items. Code reading: its own items, from a **reading** criterion (explain the given code, locate the defect) that is assessed even when the fix fails |
| Readiness report | Two non-compensable lines. A user who fixes bugs but cannot explain the code is **not ready**, and the report names code reading | Code reading shows as a Core minimum. Same not-ready outcome **below the minimum**. Above it, variation is accepted (C2) |
| Product meaning | "A Junior who cannot read unfamiliar code is not employable." Strict and simple | "Reading code is required at a minimum and can vary above it." Matches C2 |
| Graduate UI (copy only, later) | Both labelled «مهارة إلزامية» | Debugging «إلزامية», code reading «أساسية» |
| Pack counts | `is_core` count is the same in both (§7) | same |
| Risk | Two blocking skills fed by the same activity family. A weak code-reading item design blocks many users | The reading criterion must be designed to stand alone, otherwise "independent" is nominal |

**Practical difference today:** under DM-2 V-a the readiness outcome is the same. Both alternatives need the code-reading minimum. They differ in:
- the report's wording (non-compensable vs minimum);
- future policy flexibility.

---

## 4. Git

### 4.1 One skill, reused

`skl_version_control_basics` is the only Git skill. There is no new skill, synonym or alias. Its definition gains the indicators in §4.2, through content review.

### 4.2 Observable indicators (draft, for SME calibration, V-3)

| ID | Indicator | Observable from | Today's assessor |
|---|---|---|---|
| G-1 | Work done on a **branch** other than the default | The repository's branch list / the PR's head branch | Human reviewer, from the link at a recorded commit |
| G-2 | **Small, described commits.** Each message says what changed; no single "final" commit holding everything | The commit list on the PR | Human reviewer |
| G-3 | A **PR** whose description states what changed and why | The PR page | Human reviewer |
| G-4 | **Explains their own diff**: one answer in the activity's text deliverables that refers to specific changed lines | A text deliverable (`answer.git_diff_explained`) | Human reviewer (later CAP-8, structured) |
| G-5 | **Resolves a small follow-up on the same branch** (optional, integrated task only) | Follow-up round | Needs CAP-7 |

### 4.3 What never counts

- **A repository URL alone.** A link is a `submitted_link` (D-118 provenance). It proves the user typed a URL, not that the user did the work.
- **Client-supplied facts.** Commit counts, branch names or "PR merged" sent by the client are refused (`verified.*` / `signal.*` → 400, unchanged).
- **The criterion's evidence is the reviewer's observation of G-1…G-4 at a recorded commit, together with G-4.**
  - The submission records the PR URL and the **head commit SHA** the user declares.
  - The reviewer records the SHA they actually reviewed.
  - If the two differ, or the history is missing or rewritten, the result is "insufficient evidence" (an escalation case, never an accusation).
- **Automated Git evidence (`verified.git.*`) needs CAP-6.** That is a read-only repository-facts producer with consent and a privacy review. **Not built.**

### 4.4 Placement (DM-4): selected activities only, not every activity

| Activity (candidate) | Commit | Branch | PR | Explains diff | Git criterion? |
|---|---|---|---|---|---|
| Integrated task | ✓ | ✓ | ✓ | ✓ | **yes** in G-P1, G-P2, G-P3 |
| Short Task B (bug fix) | ✓ (fix commit) | ✓ (fix branch) | ✓ (fix PR) | ✓ | yes in **G-P1** and G-P3 |
| `change_request` (existing; K-2 only) | ✓ | ✓ | ✓ | ✓ | yes in **G-P3** only |
| Short Task A (component + fetch) | possible | — | — | — | no (keeps the task short) |
| `build_interface`, `debug_improve` (K-2 only) | — | — | — | — | no |

- **G-P1** gives Git two independent observations (integrated + Task B), which matters if V-3 sets the minimum at 2.
- **G-P2** gives one observation; enough only if V-3 sets the minimum at 1.

**Fail-closed today:**
- without a `git_workflow` criterion on a published, approved rubric, the Git Must rule cannot be satisfied;
- readiness stays unattainable rather than satisfied without proof.

---

## 5. Independent evidence: an auditable definition (EXT-2 design, inactive)

**The problem.** `min_evidence_per_skill` counts standing evidence rows. Two submissions of the same solution would count twice, and two different activity IDs could still hold the same work.

### 5.1 Definition

Two evidence items E1 and E2 for skill S are **independent** only if **all** of I-1…I-6 hold:

| ID | Criterion | Fact used (existing unless marked) | Why |
|---|---|---|---|
| **I-1 Purpose** | At least one of E1, E2 comes from an activity whose purpose is **validation** (`activity_spec.is_validation_activity = true`); the other from a different activity | `is_validation_activity` (exists) | C3: "a distinct short task" |
| **I-2 Task variant** | The two activities belong to **different variant families**. They have different starter material and a different defect, data or brief, declared in content as `variant_family`. Two versions of one activity are the same family | **new content field** `activity_spec.variant_family` (EXT-2) | Different IDs are not proof (PO item 4) |
| **I-3 Assessed behaviour** | Each item rests on **its own** criterion result for S that meets its threshold in its own evaluation. A criterion result is counted at most once | `criterion_result` per `evaluation_result` (exists) | The behaviour must be shown twice, not inferred twice from one result |
| **I-4 Provenance** | Each evaluation is standing (not withdrawn or superseded), uses an approved non-demo rubric version, and has an accepted verification decision under the active policy (D-118: not `pending_validation`). In production, no demo content | Exists (D-118, D-119) | Only authorized results count |
| **I-5 No artifact reuse** | The two submissions share **no** `upload_id`, and no confirmed `checksum_sha256` **of a learner-authored file** relevant to S. Text deliverables are compared by a normalized hash. Platform-provided starter files are excluded from the comparison (their hash is the same by design) | `upload.checksum_sha256` (exists, measured server-side); normalized text hash (**new**, EXT-2) | Resubmitting the same solution must not count (PO item 4) |
| **I-6 Not a resubmission** | All attempts on the same `activity_spec` (any version) or the same variant family count as **one** item (the latest standing one) | `project.activity_spec_id`, `evidence_item.attempt_number` (exist) | Repetition is not independent application (C3) |

### 5.2 What I-5 is and is not

- It detects an **identical** artifact reused across tasks.
- It does **not** try to detect near-copies, similarity or "AI-generated" work. That would be guessing the source, which BR-025 forbids.
- Near-copies are prevented by I-2. When the variants differ, the same solution cannot meet the second task's criteria.
- **A reuse finding is never an integrity accusation.**
  - The item simply does not count as independent.
  - The user sees a neutral message: «تحتاج المهمة الثانية حلًّا خاصًا بها؛ لم يُحتسب هذا الدليل دليلًا مستقلًا».

### 5.3 Audit record

Each EXT-2 evaluation emits an **independence report** with:
- the pairs considered;
- for each pair, the I-1…I-6 outcome and the facts it read (ids, variant families, checksums compared);
- the count it produced.

The report is stored with the readiness report, so every "2 independent items" is reconstructible.

### 5.4 Status

**Design only.** It needs:
- an extension-register row (PO);
- the `variant_family` content field;
- a domain rule type with tests;
- a Track Builder kind;
- CHG-017 CR-5.

It ships **inactive**. Until then, R-E1 does not exist, and readiness says so instead of counting rows.

---

## 6. Integrated practical task (draft)

The full specification is in `docs/sme-candidate/junior-frontend/03-integrated-task.md`. This section records the decisions.

### 6.1 Scope (C5 condition 3)

- A responsive view.
- Consuming a mock API with loading, error and empty states.
- A planted bug to fix.
- A short explanation of two decisions.
- Git (branch, commits, PR).
- An optional follow-up modification (needs CAP-7; the task is valid without it).

### 6.2 Criteria per skill: not every criterion on every skill

Each criterion feeds **only** the skill it measures. A skill the task does not assess is not affected by it.

| Criterion | Skill it feeds | Mandatory (proposed) | Blocks Demonstrated of *that* skill (SME-25) |
|---|---|---|---|
| `semantic_structure` | html | yes | yes |
| `responsive_layout` | css | yes | yes |
| `data_states` (loading / error / empty / success) | api_states | yes | yes |
| `state_transitions` | ui_state | yes | yes |
| `root_cause_fixed` | debugging | yes | yes |
| `cause_located_in_code` | code_reading | yes | yes |
| `code_understanding` (§6.4) | the skill of the code explained (js) | yes under R1 | yes (SME: blocks) |
| `git_workflow` (G-1…G-4) | version_control | yes | yes |
| `decision_clarity` | technical_explanation | no | no |
| `a11y_basics` | accessibility | no | **no**, and never blocks other skills |
| `no_regression` | debugging | no (needs CAP-1 to be fair) | no |
| `deliverables_complete` (gate) | — | gate | — |

**Primary skills declared on the activity** (for pack constraints): css, api_states and debugging = 3, within `activity_primary_skill_count` 2–3. The other skills are secondary, and their criteria still feed them.

### 6.3 Pass rule (DM-6)

The integrated task's **pass** is the fact EXT-1 reads. It is separate from per-skill evidence.

| Option | Rule |
|---|---|
| **PR-1** | The gate passes **and** every mandatory criterion meets its threshold **and** the weighted total meets the rubric pass threshold |
| **PR-2** | The gate passes **and** every mandatory criterion meets its threshold (no total) |

- The thresholds, weights and borderline band are SME calibration (V-4).
- A result inside the borderline band goes to human review (C4), never to an automatic pass or fail.

### 6.4 AI-output verification (DM-5)

**SME wording:** «التحقق من مخرجات AI»: Important, but it blocks Demonstrated. Proven by modification + explanation.

| Reading | Applies to | Consequence |
|---|---|---|
| **R1 (recommended): understanding of the submitted code** | **Every** submission, whether or not AI was used | The user explains and modifies their own submitted code. The SME's evidence method (modification + explanation) is exactly an understanding check. Consistent with BR-025 («النزاهة تُقاس بإثبات المستخدم فهمَه للعمل الذي قدّمه وتحقّقَه منه وتعديلَه») |
| **R2: only when AI material is used** | Only users who disclose AI use | Disclosure would trigger an extra blocking criterion. That makes disclosure a **cost**, which contradicts BR-025 (disclosure is context, not a penalty, and does not by itself route work to review). It also rewards non-disclosure |

**Under either reading:**
- **AI disclosure is never a reason for failure** (BR-025 · D-113).
- No inference of AI origin from style or patterns.
- No "cheating score".
- Disclosure is context for the reviewer only (assessment context: optional input).

Under R1, the criterion is named `code_understanding`, not "AI verification". **The SME must confirm R1** (§13.1).

---

## 7. Pack constraints: audit and interaction with the counts

### 7.1 What is in effect

`legacy_pack_constraints@1`: global scope, `legacy_baseline`. Frozen once active. Four eyes. Separation of duties.

| Constraint | Value | Candidate K-1 (3 activities) | Candidate K-2 (6 activities) |
|---|---|---|---|
| `core_skill_count` | 4–5 | **9** under P-1 (Must ∪ Core, both A and B) ✗ · 5 under P-2 ✓ | same |
| `task_count` | 10–12 | 11–12 (one Git task added at most) ✓ | ✓ |
| `activity_count` | exactly 3 | **3** ✓ | **6** ✗ |
| `activity_primary_skill_count` | 2–3 | integrated 3 · A 2 · B 2 ✓ | ✓ |
| `activity_core_primary_skill_count` | 2–3 | P-1: integrated 3, A 2, B 2 ✓ · **P-2: Task B (debugging, code reading) = 0** ✗ | same |
| `rubric_min_criteria` | ≥ 5 (gates included) | A: 6 · B: 6 (drafted to fit) ✓ | ✓ |
| `resources_per_skill_max` | ≤ 3 | unchanged ✓ | ✓ |

### 7.2 Constraints outside `pack_constraint_set`

These fix the same numbers. Any change to them is CHG-017, not configuration.

- **SRS §3.1:** "5 مهارات أساسية … 11 مهمة … 3 أنشطة".
- **SRS scope:** "3 أنشطة فقط".
- **OD-2:** "المجموعة الأساسية الخمس مضبوطة؛ SME يوصي ولا يستبدل بصمت". The SME recommendation is exactly the non-silent route OD-2 requires.
- **`scripts/verify-docs.mjs` §3** asserts that the canonical pack has exactly 5 core skills and 3 activities. It must change **in the same commit** that publishes a canonical pack with other counts, and only after CHG-017 is applied. The drafts in `docs/sme-candidate/` are not the canonical pack and do not trip it.

### 7.3 How one integrated task plus two short tasks interacts with the counts

- **K-1 (restructure, 3 activities): the integrated task is the "project" and Tasks A and B are the "distinct short tasks" (C3).**
  - The candidate version replaces `build_interface`, `debug_improve` and `change_request` with **integrated + A + B**.
  - The earlier activities and every result on them stay as history (versioned, never rewritten).
  - `activity_count` = 3 holds, with **no numeric change**.
  - Each Must or Core skill gets project + distinct-task coverage, provided A and B together cover HTML, CSS, JS, UI state and API states, and B covers debugging, code reading and Git (see `05-rubrics-and-evidence.md`, coverage table).
- **K-2 (additive, 6 activities):** more practice and more evidence paths. It needs `activity_count` 6 via a new governed version **and** a CHG-017 change to "3 أنشطة فقط".
- **Core count (both):**
  - **P-1:** `is_core` = Must ∪ Core = 9. Needs `core_skill_count` 9 (or a range covering it) in a new governed version, plus CHG-017 (§3.1, OD-2).
  - **P-2:** keep `is_core` = the current 5 and carry Must/Core in `category`. No numeric change. However:
    - "core" would then mean two things;
    - Task B would fail `activity_core_primary_skill_count`;
    - `all_core_skills_at_level` would silently cover the wrong set.

  **P-2 is listed, not recommended.**

### 7.4 Proposed governed version (draft text only, not created)

```text
pack_constraint_set  key trk_frontend_junior_constraints · version 1 · scope track (trk_frontend_junior)
                     review_status draft · activation none
                     values — only those the chosen options need; every other value copied from legacy_pack_constraints@1:
                       core_skill_count            9–9   (P-1)                ← SME/PO value
                       activity_count              3–3   (K-1, unchanged) | 6–6 (K-2) ← PO value
                       task_count                  10–12 (unchanged)
                       activity_primary_skill_count 2–3, activity_core_primary_skill_count 2–3,
                       rubric_min_criteria ≥5, resources_per_skill_max ≤3 (unchanged)
                     rationale: SME-JFE-01 (SRC-A/B) · CHG-017 · DM-7
```

**Path:**
1. Drafted by track_admin.
2. Approved by a different person (four eyes).
3. Activated by a third role (separation of duties) at `development_only`, for staging validation of the candidate pack.
4. Then `production_active` only with the candidate's publication (S7).

- The global `legacy_pack_constraints@1` is not touched.
- Resolution picks the track-scoped set once it is in effect. Until then the candidate **fails validation**, which is correct: fail-closed, never bypassed.

---

## 8. Safe parallel drafts (produced, draft-only)

`docs/sme-candidate/junior-frontend/`. Markdown only, outside `data/career/`, so neither the importer nor `verify:docs` reads it. Every file opens with a **DRAFT / NOT SME APPROVED / NOT PUBLISHED** banner.

| File | Content (PO item 7) |
|---|---|
| `README.md` | Status, index, and what must happen before any of it becomes content |
| `01-role-description.md` | Updated role description (SME-03, SME-05, SME-15) |
| `02-skills-and-git.md` | Skill definitions, candidate classifications (both Code Reading alternatives) and Git evidence indicators |
| `03-integrated-task.md` | Integrated-task specification and learner-facing brief |
| `04-short-tasks.md` | Short Task A and Short Task B specifications and learner-facing briefs |
| `05-rubrics-and-evidence.md` | Proposed rubrics (criteria, mandatory, linked skill; **values blank**), evidence requirements and the coverage table |
| `06-readiness-and-constraints-candidate.md` | Candidate readiness configuration (per DM option) and the candidate pack-constraint set |
| `07-ext-1-ext-2-design.md` | EXT-1 and EXT-2 design specifications |
| `08-sme-review-checklist.md` | SME review and approval checklist |

---

## 9. Graduate UI: independent and unchanged

- **No change to `apps/app` in this pack.** The Phase 2 screens read the API's catalogue and evaluation views and adapt to whatever is published (data-driven, D-120).
- **The candidate cannot reach a graduate before approval:**
  1. It exists only as Markdown.
  2. When later authored as content, it is created **non-demo, draft** through the promotion and review flow. Graduates see only `published` activities of their role (`graduate_content_visible`, D-119). Draft, curated and sme_reviewed content is invisible.
  3. Pack import validates against the constraint set in effect. The candidate fails until §7.4 is approved and in effect.
  4. The readiness set stays inactive. Readiness reports `not_yet_configured`.
- **UI work that would follow later is copy only:**
  - Must and Core labels on skill pages;
  - the readiness report naming non-compensable lines;
  - the integrated-task chip.

  It is a separate, later change.

---

## 10. Precise diff against the first plan (`41327f9`)

| First plan | It said | Revised | Why (PO item) |
|---|---|---|---|
| §3 table, "required level" column = `demonstrated` for every Must and Core skill | Demonstrated as the default required level | **Removed.** The column is replaced by the per-skill proficiency → evidence → readiness mapping (§2.2). The required level is a PO option (DM-2: V-a / V-b / V-c) | 1 |
| §5.4 (D-1) | Proposed "required level = demonstrated", proficiency carried by calibration | **Replaced** by §2: two axes, ladder unchanged, no automatic Demonstrated, PF-1 / PF-2 | 1 |
| §3 row `skl_code_reading` = Must; §5.2 D-6 | Both Must, shared evidence path | **Two alternatives, not chosen** (§3). Each skill has its own criterion and evidence count | 2 |
| §4 Git | `link.repository` + `git_workflow` added to **each** practical activity and the integrated task | **Selected activities only** (§4.4, DM-4). Indicators G-1…G-5. Declared + reviewed SHA. URL alone never counts | 3 |
| §5.3, EXT-2 | Independence = different activities + one validation activity | **Auditable I-1…I-6** (§5). Adds `variant_family`, artifact checksum and normalized-text reuse, and resubmission collapse. Audit report. Inactive | 4 |
| §8.4 rubric | Every SME criterion on the integrated task; AI verification as a follow-up criterion linked to js (D-8) | **Per-skill criteria** (§6.2). AI verification **reframed as `code_understanding`** (R1 vs R2, DM-5). Disclosure never a failure reason | 5 |
| §8.4 pass rule (V-4) | Gate + all mandatory + total | **Two options**, PR-1 / PR-2 (DM-6) | 5 |
| §6.1 activities | Keep 3, add 2 short + 1 integrated (6) | **K-1 (restructure to 3) or K-2 (6)**. Pack-constraint, SRS §3.1, OD-2 and `verify-docs` conflicts made explicit (§7) | 6 |
| §3 net effect, `is_core` = 9 | Stated without a constraint check | Core count conflicts with `core_skill_count` 4–5 → **P-1 (new governed track-scoped version) or P-2** (§7.3) | 6 |
| §12.3 D-4 (CHG-017) | Outline | **CR-1…CR-9** with affected SRS sections (§11) | 9 |
| §14 stages S0–S7 | Order | **Re-prioritized** (§12). Drafts produced now. Engineering waits for DM decisions | 7, 10 |
| — | — | **New:** draft-only candidate files (§8); decision matrix (§1); SME checklist | 7, 9 |
| §7 rules R-M / R-C | `min_level: demonstrated` | `min_level` = the DM-2 option; rule shapes otherwise unchanged; R-M5 vs R-C4 per DM-1 | 1, 2 |
| §9, §10, §11 | Assessment boundaries, CAP-1…15, claims unchanged | **Unchanged**, except CAP-6 is now "required only for automated Git" and the Git placement follows DM-4 | — |

---

## 11. Proposed CHG-017 requirements (not applied)

**CHG-017 — Junior Frontend expert model (SME-JFE-01).** Functional level only. To be drafted against SRS v1.11 and applied **only after** PO approval.

| CR | Proposed requirement (functional wording) | SRS area affected |
|---|---|---|
| **CR-1** | A role's skills are classified **Must**, **Core** or **Supporting**. Must: no readiness without the proven minimum, never compensated. Core: the minimum is required; variation above it is accepted. Supporting: no readiness effect | §3.1, new BR |
| **CR-2** | **Professional proficiency** (expected Junior level per skill) is distinct from the **verification level** of a claim. Configuration never assigns a verification level. The ladder is unchanged | new BR (with BR-024, D-118) |
| **CR-3** | Readiness for a role = all Must at the required level + all Core minimums + a passed integrated practical assessment. **Never a percentage or a count of skills** | readiness BRs. **BR-024 unchanged** (a report, never a level change) |
| **CR-4** | Git is assessed inside selected practical activities through observable behaviour (branch, commits, PR, explaining one's own diff). A repository link alone is not evidence | evidence rules |
| **CR-5** | Where a skill requires two evidence items, they must be **independent**: a distinct validation task of a different variant, its own assessed behaviour, an authorized basis, no reused artifact, no resubmission. Independence is recorded and auditable | evidence rules, DR |
| **CR-6** | An integrated practical assessment is a readiness condition. Only a standing, accepted result on an approved activity version satisfies it | readiness BRs |
| **CR-7** | Understanding of submitted code (modification + explanation) is assessed for every submission. AI disclosure remains context and never a failure reason | consistent with BR-025 (unchanged) |
| **CR-8** | The P1 Frontend track's core set and activity count follow the SME-reviewed configuration. They are recorded as a governed track-scoped constraint version, not as fixed numbers in the SRS | §3.1 counts, scope "3 أنشطة فقط", OD-2 (amended, not removed) |
| **CR-9** | Human review is the exception mechanism (borderline, conflicting signals, ambiguous results, calibration sample) **once** an automated basis is approved. Until then, human review is the authorized basis | consistent with §2.7 / D-101 (unchanged) |

**Unchanged by CHG-017:**
- BR-024 · BR-025 · BR-026;
- D-101, D-102 (Verified blocked), D-118, D-119;
- claim policies.

---

## 12. Prioritized implementation sequence

| Priority | Step | Depends on | Who | Touches | Parallel-safe now? |
|---|---|---|---|---|---|
| **P0** | PO decisions DM-1…DM-8 · SME answers in `08-sme-review-checklist.md` | this pack | PO, SME | docs | — |
| **P1** | SME review of the drafts in `docs/sme-candidate/`; V-1, V-3, V-6, V-7 | P0 (DM-1, DM-4, DM-5, DM-7) | SME | docs | **yes**, already drafted |
| **P2** | CHG-017 text drafted → PO approval → applied to the SRS, with `verify-docs` updated in the same change | P0 | PO | SRS, `scripts/verify-docs.mjs` | after P0 |
| **P3** | Candidate content authored as **non-demo draft** via the promotion flow (K-1 or K-2) | P1, P2 | content author → SME | `data/career` candidate dir, review records (draft) | after P2 |
| **P4** | Governed drafts: pack-constraint set §7.4, `track_config_version` v2 (track-skill changes), readiness set (R-M / R-C per DM-1 / DM-2) | P0, P2 | track_admin → approver → activator | governed config (draft, inactive) | after P2 |
| **P5** | EXT-2 then EXT-1: register rows, `variant_family`, domain types + tests, Track Builder kinds. Inactive | P0 (register), P2 (CR-5, CR-6) | engineering | `packages/domain`, readiness API, admin only | after P2 |
| **P6** | Rubric values (V-2, V-4) approved by a named SME on non-demo content; human-reviewed pilot path possible from here (D-118) | P3, P4 | SME, PO | review records | — |
| **P7** | Producers in order CAP-10 → CAP-4 → CAP-1 → CAP-2 → CAP-3 → CAP-5 → CAP-7 → CAP-6 → CAP-8, each with its own security/privacy review | separate PO approval (D-10) | engineering | new services | no |
| **P8** | Calibration (golden set, agreement, borderline band) → new verification policy draft for automated basis (C4) | P7 | SME, reviewers, PO | config (draft) | no |
| **P9** | Activation: content published, constraint set + v2 + readiness set validated and activated, staging tests (first plan §13 + EXT tests), UI copy change | P3–P6 (P7/P8 only for automation), staging, pilot blockers | PO | activation records | no |

**Independent of all of the above:** the graduate UI. No step before P9 changes it, and P9's UI change is copy only.

---

## 13. Open items for the SME and the Product Owner

### 13.1 Questions for the SME (also in `08-sme-review-checklist.md`)

1. SME-12 vs SME-17: is Code Reading **Must** (A) or **Core, assessed on its own** (B)?
2. «التحقق من مخرجات AI»: did you mean understanding of the submitted code for **everyone** (R1)?
3. Git: in how many practical activities must it be observed (1 or 2)? What makes a commit, branch or PR acceptable at Junior level?
4. Is one integrated task plus two short tasks (K-1) enough evidence, or do you want the three existing activities kept as well (K-2)?
5. Integrated task: which criteria are mandatory? What are the duration and the borderline band?
6. Are the short-task variants different enough that the same solution cannot pass both (I-2)?
7. Testing (C-4), forms validation and requirements reading (C-5): confirm Supporting.

### 13.2 SME values (carried from the first plan, still open)

- V-1: confirm each skill row: category, proficiency, evidence composition.
- V-2: rubric weights, thresholds and level descriptors (OPEN-043).
- V-3: Git observations and acceptance criteria.
- V-4: integrated-task pass rule, mandatory criteria, borderline band.
- V-5: escalation triggers and calibration sample.
- V-6: integrated and short-task content (brief, planted bugs, mock-API scenarios, variants).
- V-7: item bank and learner-safe wording of private inputs.
- V-8: golden set.

### 13.3 Risks (additions to the first plan §12.4)

1. **K-1 retires the three existing activities from the candidate version.** Their history stays, but a pilot user's earlier work on them would not count towards the new readiness set unless mapped. Since there are no real users, nothing is lost today.
2. **The `variant_family` discipline is content-dependent.** If two variants are too close, I-2 is nominal. SME review of each variant pair is the control.
3. **Declared vs reviewed SHA (Git)** depends on reviewer diligence until CAP-6.
4. **P-1 makes "core" mean 9 skills.** Every place that reads `is_core` must be checked: UI chips, `all_core_skills_at_level`, the claim summaries. This check is part of P4.

---

**Stopped. Awaiting Product Owner approval.**
- The canonical SRS is not modified.
- No policy or configuration is created or activated.
- The candidate track is not published or imported.
- No verification level is granted.
- No production deployment.
- EXT-1, EXT-2, runners and automated promotion are not implemented.
