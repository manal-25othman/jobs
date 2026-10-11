> **DRAFT · NOT SME APPROVED · NOT CREATED · NOT ACTIVATED.** Text-only candidates for governed configuration (Rev. 2).
> - Nothing here is inserted into `readiness_rule_set`, `pack_constraint_set` or `track_config_version`.
> - Each would be born **draft / inactive** through the Track Builder: four eyes, separation of duties.

# Candidate readiness configuration and pack constraints

## 1. Readiness rule set: `junior_frontend_readiness` v1

**Three conditions** (C5). No percentage, no skill count, no `min_skills_at_level`.

`«J-1»` = the approved `min_level` for that class: V-a or V-b. It is **not** auto-selected. Under V-c the set is not created and readiness stays `not_yet_configured`.

### Condition 1: every Must skill meets its approved required level

| Rule | Type | Skill | Params |
|---|---|---|---|
| R-M1 | `non_compensable_skill` | `skl_html_semantic` | `{ min_level: «J-1 Must» }` |
| R-M2 | `non_compensable_skill` | `skl_css_responsive` | same |
| R-M3 | `non_compensable_skill` | `skl_js_fundamentals` | same |
| R-M4 | `non_compensable_skill` | `skl_frontend_debugging` | same |
| R-M5 | `non_compensable_skill` | `skl_code_reading` | same |
| R-M6 | `non_compensable_skill` | `skl_version_control_basics` | same |

### Condition 2: every Core skill meets its approved Junior minimum

| Rule | Type | Skill | Params |
|---|---|---|---|
| R-C1 | `required_skill_at_level` | `skl_ui_state_interaction` | `{ min_level: «J-1 Core» }` |
| R-C2 | `required_skill_at_level` | `skl_api_data_states` | same |
| R-C3 | `required_skill_at_level` | `skl_accessibility_basics` | same |

### Evidence paths for conditions 1 and 2 (EXT-2, inactive until built and approved)

| Rule | Type | Skill | Params |
|---|---|---|---|
| R-P1…R-P9 | `skill_evidence_path` | one per Must/Core skill | the path from `05-rubrics-and-evidence.md` §2 (`min_distinct_tasks`, `counted_criteria`, `require_validation_activity`, `understanding`) |

### Condition 3: the integrated practical assessment is passed (EXT-1, inactive until built and approved)

| Rule | Type | Params |
|---|---|---|
| R-I1 | `integrated_assessment_passed` | `{ activity_code: act_fe_integrated_leave_requests, pass_rule: «J-4», allowed_versions: [approved] }` |

### States and basis

| Readiness state | When |
|---|---|
| `not_yet_configured` | before activation |
| `pending_validation` | development-only activation |
| `evaluated` | only when validated and `production_active` |

- The engine never changes a level (BR-024).
- **Proficiency** (`foundation` / `working`) is carried by calibrated thresholds and descriptors.
- **Verification level** is what the rules read.
- **Human review is the interim basis**, and the exception path once an automated basis is approved (C4). It is not a permanent requirement.
- Automated promotion stays unavailable until runners are built, calibrated and approved.

## 2. Pack constraints (J-2)

The design keeps **3 activities**, so `activity_count` needs no change. Only `core_skill_count` depends on J-2.

| Constraint | `legacy_pack_constraints@1` (global, **unchanged**) | Candidate under P-1 | Candidate under P-2 |
|---|---|---|---|
| `core_skill_count` | 4–5 | 9 ✗ → needs the track-scoped set below | 5 ✓ |
| `task_count` | 10–12 | 12 ✓ | 12 ✓ |
| `activity_count` | 3–3 | 3 ✓ | 3 ✓ |
| `activity_primary_skill_count` | 2–3 | 3/3/3 ✓ | 3/3/3 ✓ |
| `activity_core_primary_skill_count` | 2–3 | 3/3/3 ✓ | INT 2 ✓ · A 3 ✓ · **B 1 ✗** (only js among the OD-2 five) |
| `rubric_min_criteria` | ≥ 5 | 12/7/8 ✓ | ✓ |
| `resources_per_skill_max` | ≤ 3 | ✓ | ✓ |

**Under P-1:** a new **track-scoped** set (text only; not created).

```text
pack_constraint_set  key trk_frontend_junior_constraints · version 1 · scope track (trk_frontend_junior)
                     core_skill_count 9–9 · every other value copied from legacy_pack_constraints@1
                     review_status draft · activation none
                     rationale: SME-JFE-01 (SRC-A/B/C) · CHG-017 CR-8 · J-2
```

Path: drafted → approved by another person → activated by a third role at `development_only` for staging, and at `production_active` only with publication.

**Under P-2:** no constraint change, but:
- Task B's primaries must become js, ui_state, code_reading, which understates debugging;
- Debugging, Code Reading and Git (all Must) read `is_core = false`.

**Neither option touches the global set or redefines `is_core` silently.** P-1 is an explicit governed change with CHG-017.

## 3. `track_config_version` v2

- Label: «SME-JFE-01 candidate».
- `applies_skill_config = true`.
- **Track-skill changes:** one per skill in `02-skills-and-git.md` §1, each proposed by track_admin and decided by the SME. Fields:
  - `is_core` (J-2);
  - `minimum_evidence_count` (the path's distinct-task count);
  - `readiness_contribution` (`counts` for Must/Core, `informational` for Supporting);
  - `expected_level` (= J-1; **not set** until decided);
  - `category` (display mirror only, if used; ENG-6 consistency check).
- The 0.2.1 configuration and every earlier version stay as history.
