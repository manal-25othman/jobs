# نَقْلة / NAQLA — Junior Frontend v2: approval package (CHG-017 · EXT-3 · open decisions)

> **For decision. Nothing here is approved, sent to the SME, activated or published.**
> CHG-017 stays 🟡 PROPOSED (`docs/changes/CHG-017-DM7B-AMENDMENTS-PROPOSED.md`). EXT-3 stays 🟡 "proposed — built inactive (development only)" (`EXPERT-RULE-EXTENSION-REGISTER.md`).
> Candidate: `data/candidates/trk_frontend_junior_v2/` (`trk_frontend_junior@0.3.0-candidate.1`, DRAFT, not importable). Reports: `JFE-V2-CANDIDATE-MILESTONE-REPORT.md` (D-131, D-132).

## 1. CHG-017 — DM-7b amendments (exact text in the proposal)

| CR | One line | Behaviour once applied with the v2 pack |
|---|---|---|
| CR-1 | Classes are carried by a **versioned professional classification** with the source of each class; the readiness rule set carries levels and pass conditions and is checked against it | Classified role: «إلزامية / أساسية / مساندة» with source; rule set refused (and never a verdict) unless every Must is non-compensable, every Core required, no Supporting blocker. Classification alone grants nothing |
| CR-8 | Track counts from a track-scoped **schema-2** constraint version; legacy `is_core` constraints stay for format-1 packs | Format-2 packs checked on class counts and Must ∪ Core primaries; no fallback between schemas |
| CR-12 | A class is shown or used for gaps only when approved (named SME, + PO for PO defaults) and activated; Supporting never blocks; a PO default is never shown as expert | Agent gaps = Must ∪ Core; PO defaults labelled «تصنيف افتراضي من مالك المنتج، غير معتمد من الخبراء» |
| CR-13 | Junior Frontend v2 = **6 Must · 3 Core · 3 Supporting** (this track's numbers only) | Supersedes OD-2 **explicitly** for the v2 pack; v1 keeps OD-2 |
| **CR-14** | In a format-2 pack an undecided expert value is **empty + `TBD`**, never a number; a pack never declares a value approved | Validator-enforced today in development |

SRS amendments at publication (proposed text in the CHG): FR-P-012 (three classes with provenance), §3.1 (format-2 pack description), OD-2 (superseded for v2). `verify-docs` format-2 checks are added in the same commit as publication.

## 2. EXT-3 — professional classification (exact row in the register)

- **What:** taxonomy `must_core_supporting@1`; versioned `skill_classification_set` / `skill_classification` with `source_kind` (sme | po_default) and `source_ref`; readiness-consistency check; version-aware readers; **pack-constraint schema 2**; **pack format 2** (class + source + reference per role skill, no `is_core_for_role`); the **unresolved-value rule** (CR-14).
- **State:** built in development (migration 0034); no production state exists; development use needs an approved version and a transaction-local opt-in; format-2 import refused.
- **Basis:** SME-JFE-01 C2, SME-17, SME-19, SME-20; PO decision D-1 (D-130).

## 3. Product Owner decisions still open

| # | Decision | Recommendation (not a decision) |
|---|---|---|
| PO-1 | Approve CHG-017 incl. CR-14 | Approve as proposed |
| PO-2 | Approve EXT-3 (with pack format 2 and CR-14) | Approve as written |
| PO-3 | **J-7 for INT `act_fe_build_interface`** — its identity changed materially (§5): keep the code as v0.2.0, or create a new code for the integrated assessment | Decide before publication; the candidate keeps the code meanwhile (nothing overwritten) |
| PO-4 | Repoint learning resource `lr_html_forms_mdn` from INT to Task A at publication (INT no longer has a form; Task A measures Forms) — a global registry change | Repoint with publication |
| PO-5 | Confirm the two PO-default classes (Forms validation, Requirements reading = Supporting) | Already your defaults (D-4); confirm at classification approval |
| PO-6 | Confirm the proposed Forms criterion `form_submission_flow` (Task A, Supporting, non-mandatory) is offered to the SME under S4 | Include under S4 (no new question) |
| PO-7 | With the SME: S13 — verification level read by readiness (V-a / V-b / V-c) | — |
| PO-8 | Later and separately: governed publication of the v2 pack, its schema-2 constraint version and the classification version; P6 | Not requested now |

Already your defaults or decisions (no new approval needed now): 6/3/3 as the track's numbers (D-5); the copied legacy values for task, activity, primary, rubric and resource counts in the candidate constraint set; `importance` unchanged from 0.2.1; keeping Task A and Task B codes (identity retained, §5).

## 4. SME items — three kinds, kept apart

**A. Already answered by SME-JFE-01 — not asked again:** F1 (Code Reading is Must, separate from Debugging); F2 (understanding required of everyone; nothing AI-specific); F3 (per-skill evidence paths; no mandatory live round); F4 / C1 (Git in one inspected project: commits, branch, PR, explained changes); F5 (three activities); C3 (no universal two-task rule); C2 (Must at its minimum, Core may vary above the Junior minimum); C4 (calibrated automation with human review of exceptions); C5 / SME-16 / SME-54 (readiness = every Must, every Core minimum, the integrated task; no count, no percentage); the classification, Junior levels and minimum distinct tasks per skill (SME-06…12: 2, Git and Accessibility 1); SME-25 (basis of the proposed mandatory criteria).

**B. Product Owner defaults or proposals the SME may comment on, but which are not expert decisions:** Forms validation and Requirements reading as Supporting (SME silent; PO default); the content of the new Forms criterion (proposed; reviewed under S4); keeping activity codes (J-7).

**C. Genuinely unanswered — need the SME's approval (all already in the final package; no new question):**
S1 INT text, planted retry bug, brief/API conflict · S2 Task A text and faults · S3 Task B text and fault · S4 criteria per activity, skill mapping and proposed mandatory flags (now including `form_submission_flow`) · S5 path wording · S6 distinctness of the three activities · S7 Git: minimum described commits and PR description · S8 integrated pass rule (PR-1 / PR-2 and its threshold) · S9 borderline band · S10 durations · S11 weights, thresholds, level descriptors · S12 calibration method · S13 (with the PO) verification level read by readiness.

## 5. J-7 — activity identity (PO direction: keep the code when identity and educational purpose are retained; new immutable version for changed content)

| Activity | 0.1.0 (in 0.2.1 pack) → candidate 0.2.0 | Identity retained? |
|---|---|---|
| Task A `act_fe_debug_improve` | Same page, same four planted faults, same complaints, same purpose (repair an existing page without rewriting it); adds a forms/keyboard accessibility focus, the Forms criterion and its role as a validation task | **Yes** — keep the code, new version 0.2.0 |
| Task B `act_fe_change_request` | Same team-tasks code base, same planted empty-as-error bug, same filter change request, same purpose (change existing code); adds an explicit "read and explain first" step; primaries shift to Code Reading, Debugging, JS; becomes a validation task | **Yes** — keep the code, new version 0.2.0 |
| INT `act_fe_build_interface` | Same leave-requests domain, but: the four-field **form and `fields.spec` are removed**; the learner now starts from a **starter with a planted bug** (was: build from a brief); adds Git/PR delivery and a bug trace; primaries change (UI state, API, HTML → CSS, API, Debugging); and it becomes **the integrated assessment whose pass is a readiness condition** (EXT-1 reads its code) | **Materially changed** — **PO-3 decision requested before any code change**. The candidate keeps the code meanwhile |

In every case: 0.2.0 is a new version (no existing version is overwritten; checked against the database); every global learning-resource link still resolves (checked); no historical evidence, evaluation or claim is touched (format-2 import refused; dry run writes nothing).
