# نَقْلة / NAQLA — Phase 9 pre-implementation audit · Pack validator constraints
**Date:** 2026-10-09 · Written **before** the Phase 9 code, as the owner's brief requires. It covers every check in `validatePack` (`apps/api/src/career-data/pack-schema.ts`), plus the numeric quality rules (`quality-rules.ts`) and H3 (`career-data.ts` `minimumEvidenceCount`).

## Classes used

| Class | Meaning | Where it lives after Phase 9 |
|---|---|---|
| **T**: technical invariant | A shape, an enum, a reference or a format the code and the schema depend on | Code + schema (unchanged) |
| **S**: security / governance invariant | It protects the evidence model, review or production (no self-approval, never Verified, provenance, no market data) | Code + database (unchanged) |
| **R**: structural integrity rule | Without it a pack is meaningless or unusable (an evidence path exists, descriptors exist, ≥ 1) | Code (unchanged); floors also apply to the configuration |
| **P**: professional / content policy | A number an expert may reasonably set differently for another profession or level | **Governed configuration** (`pack_constraint_set`) |
| **D**: owner product decision | A recorded decision, not a professional number | Code (unchanged; changing it needs a decision, not configuration) |

## 1. Numeric profession-dependent constraints: the only ones moved

| # | Check (pre-Phase 9) | Class | Phase 9 |
|---|---|---|---|
| H5-a | `role: core skills must be 4–5` | **P** | `core_skill_count` 4–5 |
| H5-b | `tasks: 10–12 expected` | **P** | `task_count` 10–12 |
| H5-c | `activities: exactly 3 expected in the first track` | **P** | `activity_count` 3–3 |
| H5-d | `an activity measures 2–3 skills deeply (primary)` | **P** | `activity_primary_skill_count` 2–3 |
| H5-e | `an activity measures 2–3 CORE skills deeply` | **P** | `activity_core_primary_skill_count` 2–3 |
| H5-f | `rubric: at least five criteria` | **P** | `rubric_min_criteria` ≥ 5 |
| H5-g | `at most 3 resources per gap` (validator) and Q08 `> 3` (quality rule) | **P** | `resources_per_skill_max` ≤ 3 (validator; Q08 reads the global set) |
| H3 | `minimumEvidenceCount(isCore) = core ? 2 : 1` (paths needed for "verified_possible") | **P** | Read from `role_requirement.minimum_evidence_count` (already per role-skill, pending SME). Missing ⇒ `evidence_count_not_configured`, never assumed |

Each of these is pending SME validation. The baseline `legacy_pack_constraints@1` holds the old numbers, is **not approved**, and is marked as such.

## 2. Kept in code: technical invariants (T)

- Codes are unique per kind; `src_` / ASCII formats.
- Enums: `source_type`, `skill_type`, `ai_substitutability`, synonym relation, importance, evidence types, rubric dimensions, evaluator types, criterion kinds, integrity check types, evaluation modes, resource quality, presentation asset types.
- Cross-references: a family, recency policy, scale, source, skill, task, activity, rubric, library criterion or linked criterion must exist.
- Recency windows are non-decreasing. `pass_threshold` is in (0, 1]. Levels span 0..max_score.
- Synonym well-formedness, presentation-rule sanity, duplicate-resolution well-formedness, criterion-kind shape.
- Proficiency scale has ≥ 3 levels (the evidence ladder needs them).

## 3. Kept in code and database: security and governance invariants (S)

- No `market_signal` source may be imported in this phase.
- A demo pack carries `DEMO / DRAFT / NOT SME APPROVED`. An imported pack is `draft` or `curated`, never approved.
- `can_yield_verified` is false. A rubric never proposes `verified` (D-059).
- A pack cannot declare its own weights, thresholds or pass threshold approved (OPEN-043).
- Provenance: every record names ≥ 1 source, and the source has license notes.
- Integrity checks:
  - I1 platform-private input;
  - I2 assessment-only check;
  - I3 explanation question;
  - a user-facing check has an Arabic message and an assessment-only one has none;
  - OPEN-045 evaluation modes: an active deterministic check must have a producer, a human-observable check never blocks, and a future check is inactive.
- A rule-evaluated criterion has a deterministic check; a human criterion requires human review.
- Gate and quality criteria carry no skill threshold (OPEN-044).

## 4. Kept in code: structural integrity rules (R)

- Every core skill has an evidence path, meaning ≥ 1 activity measures it through a linked criterion. This is existence, not a professional count, and Q06 says the same.
- A criterion has ≥ 2 level descriptors (G-8).
- A skill has observable indicators in both languages.
- Bilingual required fields.
- Presentation rules cover every asset type × level (G-14).
- A learning resource links to a practice activity in the pack.
- What is and is not expected from a junior is stated.
- **Floors on the configuration:** every configured count is an integer ≥ 1, ranges are ordered, and each type carries the bounds its shape requires. These are enforced by the domain (`assertPackConstraintsSane`) and by the schema (check constraints and the closed enum).

## 5. Kept in code: owner product decisions (D)

- **Framework independence** (D-084): no framework or library name anywhere in the role, tasks, activities, rubrics, skills, presentation rules or resources. This is a recorded product decision about what NAQLA measures, not a professional number. Changing it needs a decision.
- "No market data in this phase" (also S).

## 6. What was checked and is not affected

- Q01–Q24 are unchanged except Q06 (H3 input; the "no path" verdict is identical) and Q08 (H5-g bound).
- The H1, H2, H4, H6–H11 rows of the plan's inventory were handled earlier or stay in code by decision.
