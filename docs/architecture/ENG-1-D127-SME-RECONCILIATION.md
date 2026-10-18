# نَقْلة / NAQLA — Reconciling D-127 With the SME's Existing Decisions (D-128)

**Date:** 2026-10-18 · **Status:** documentation only. No live policy was changed, nothing was activated, and P6 has not begun.

**Sources** (the professional source of truth; the SME was not contacted):
- **SRC-A:** the filled review form (SME-JFE-01).
- **SRC-B:** clarifications C1–C5.
- **SRC-C:** final clarifications F1–F5.
- The revised decision pack (Rev. 2) and the candidate content under `docs/sme-candidate/junior-frontend/`.

**What D-128 changes:**
- **SME-Q1 is withdrawn** (D-127 matrix §4, the gate report, and package 10 Rev. 2).
- L-1 is the provisional architecture.
- No resolved professional question is reopened.

---

## 1. Already answered by the SME (not asked again)

| Decision | Source |
|---|---|
| No universal two-project or two-task rule. Evidence is designed per skill: «لا أرى ضرورة لطلب مشروعين منفصلين لكل مهارة» | C3; decision pack §E |
| Per-skill minimum practical tasks: 2 for HTML, CSS, JS, Debugging, Code Reading, UI state, API states; 1 for accessibility | SME table (SME-06…12, SME-11) |
| Git: one sufficiently verified project (commit, branch, PR, explanation of the changes). A URL without inspection is submitted material, not evidence | C1, F4 |
| Independent practical application matters. Code plus theory alone is incomplete. No universal live-modification round | C3, F3 |
| No verification or readiness from counts of files, rows or skills | SME-16, SME-54, C5 |
| Readiness = every Must skill at the required level + every Core skill at its Junior minimum + a passed integrated practical assessment | C5, SME-18 |
| Automated assessment is acceptable under clear, reliable (approved, calibrated) criteria, with human review for exceptional cases | C4 |
| Skill classes (Must/Core/Supporting), Junior proficiencies, Code Reading as Must, code understanding for everyone, three activities | F1, F2, F5; decision pack §A |
| Which criteria block Demonstrated within an assessment (the basis of the proposed mandatory set) | SME-25 |

## 2. Supported provisional architecture (PO, not SME approval of values)

| Element | Status |
|---|---|
| **L-1:** verification-level requirements and job-readiness requirements are separate and independently configurable. Today one independently verified, met assessment may award the rubric's proposed level; readiness reads the level **plus** per-skill evidence paths (EXT-2) **plus** the integrated pass (EXT-1) | Built, inactive. **Not** SME approval of any Demonstrated threshold |
| Per-skill assessment results (ENG-1), independence by variant family, artifact reuse by checksum and the versioned text fingerprint `naqla-text-fp-v1`; corroborating evidence is supporting only | Built, development-only (D-123…D-127) |
| Git and accessibility as one-task paths; other paths with the SME's per-skill counts | Representable as EXT-2 path values; no rule set is created |
| Human review as the interim basis; automation only after runners, calibration and a new approved verification-policy version | Policy direction (decision pack §G) |
| L-2 / L-3 (independence-aware level rules) | Not built. Possible only through a separately approved change request |

## 3. Actual remaining blockers

### 3.1 Calibration values the SME has not yet given

1. Rubric weights, per-criterion thresholds and level descriptors (Working / Familiar), on non-demo content (V-2, OPEN-043).
2. The integrated pass rule PR-1 or PR-2, and the borderline band. Also sign-off of the mandatory set as mapped from SME-25 onto the final rubric (V-4, DM-6).
3. Git acceptance: the G-2 minimum commit count and the minimum PR description (S7).
4. Per-skill path wording, and the variant distinctness of INT, A and B (S5, S6).
5. The briefs and planted issues as written, and the durations (S1–S3, S9; V-6).
6. Calibration protocol: anchor submissions per criterion level, agreement target, blind double-review sample, escalation triggers before any automation (V-5, V-8).

### 3.2 Decisions for the PO (with the SME where marked) — not reopened SME questions

- DM-2: the level readiness reads, V-a / V-b / V-c (PO with SME).
- A-1b: whether a CV/LinkedIn claim may follow a level reached before readiness (K-2), whether corroborating evidence may ever support a claim, and what replaces the unreachable `min_evidence_count = 2` idea (K-3).
- DM-7b (`is_core`), DM-8 (CHG-017), J-7 (activity identity).
- Extension-register rows for EXT-1 and EXT-2.
- Legacy results: excluded by default.

### 3.3 Activation blockers (engineering and governance)

- Candidate content authored and published through the review flow: INT, A, B as non-demo; rubric values approved and bound; `variant_family`, `task_purpose` and starter checksums set before SME review.
- A validated per-skill verification policy, and the readiness rule set `junior_frontend_readiness` drafted from the approved values.
- The separately authorized **P6** migration replacing the 0029, 0030/0033 and 0031 production seals for approved versions only, with four-eyes approval.
- Staging validation, a rollback rehearsal on staging data, named reviewers with grants, pilot consent and privacy notice.
- For automated assessment (C4): runners, the provenance column, calibration and a new policy version. Not built.

**Stop.** No live policy was changed, nothing was activated or deployed, and P6 has not begun.
