> **DRAFT · NOT SME APPROVED · NOT CREATED · NOT ACTIVATED.** Text-only candidates for governed configuration.
> - Nothing here is inserted into `readiness_rule_set`, `pack_constraint_set` or `track_config_version`.
> - Each would be born **draft / inactive** through the Track Builder: four eyes, separation of duties.

# Candidate readiness configuration and pack constraints

## 1. Readiness rule set: `junior_frontend_readiness` v1 (candidate)

- **Target role:** `frontend-developer-junior`.
- **No** `min_skills_at_level`, **no** percentage, **no** skill count (SME-16, SME-51, C5).
- `«DM-2»` = the PO's chosen `min_level` for that class (V-a / V-b). Under V-c the set is not created and readiness stays `not_yet_configured`.

### Alternative A (Code Reading Must)

| Rule | Type | Skill | Params |
|---|---|---|---|
| R-M1 | `non_compensable_skill` | `skl_html_semantic` | `{ min_level: «DM-2 Must» }` |
| R-M2 | `non_compensable_skill` | `skl_css_responsive` | same |
| R-M3 | `non_compensable_skill` | `skl_js_fundamentals` | same |
| R-M4 | `non_compensable_skill` | `skl_frontend_debugging` | same |
| R-M5 | `non_compensable_skill` | `skl_code_reading` | same |
| R-M6 | `non_compensable_skill` | `skl_version_control_basics` | same |
| R-C1 | `required_skill_at_level` | `skl_ui_state_interaction` | `{ min_level: «DM-2 Core» }` |
| R-C2 | `required_skill_at_level` | `skl_api_data_states` | same |
| R-C3 | `required_skill_at_level` | `skl_accessibility_basics` | same |

### Alternative B (Code Reading Core)

- R-M5 is replaced by **R-C4**: `required_skill_at_level` · `skl_code_reading` · `{ min_level: «DM-2 Core» }`.
- Everything else as in A.

### Rules that need extensions (inactive until EXT-1 / EXT-2 exist and are approved)

| Rule | Type | Params |
|---|---|---|
| R-E1 | `min_independent_evidence_per_skill` (EXT-2) | per skill: `{ min_count: 2 }` (accessibility 1; Git V-3), `{ require_validation_activity: true }` when `min_count ≥ 2` |
| R-I1 | `integrated_assessment_passed` (EXT-1) | `{ activity_code: act_fe_integrated_junior, pass_rule: «DM-6», allowed_versions: [approved list] }` |

### States

| Readiness state | When |
|---|---|
| `not_yet_configured` | before activation |
| `pending_validation` | development-only activation |
| `evaluated` | only when validated and `production_active` |

The engine never changes a level (BR-024).

## 2. Pack-constraint set: `trk_frontend_junior_constraints` v1 (candidate, track scope)

Only the values the chosen options need differ from `legacy_pack_constraints@1`. The legacy global set is not changed.

| Constraint | Legacy (global) | Candidate, K-1 + P-1 | Candidate, K-2 + P-1 | Candidate, K-1 + P-2 |
|---|---|---|---|---|
| `core_skill_count` | 4–5 | **9–9** | **9–9** | 4–5 (unchanged); Task B then fails `activity_core_primary_skill_count` ✗ |
| `task_count` | 10–12 | 10–12 | 10–12 | 10–12 |
| `activity_count` | 3–3 | 3–3 | **6–6** | 3–3 |
| `activity_primary_skill_count` | 2–3 | 2–3 | 2–3 | 2–3 |
| `activity_core_primary_skill_count` | 2–3 | 2–3 | 2–3 | 2–3 (**Task B = 0** ✗) |
| `rubric_min_criteria` | ≥ 5 | ≥ 5 | ≥ 5 | ≥ 5 |
| `resources_per_skill_max` | ≤ 3 | ≤ 3 | ≤ 3 | ≤ 3 |

**Requires:**
- CHG-017 CR-8 (SRS §3.1 counts, the scope «3 أنشطة فقط», OD-2);
- `scripts/verify-docs.mjs` §3 updated in the same change that publishes the candidate as canonical.

## 3. `track_config_version` v2 (candidate)

- Label: «SME-JFE-01 candidate».
- `applies_skill_config = true`.
- **One track-skill change per row** of `02-skills-and-git.md` §1: TSC-01…TSC-12.
  - Each is proposed by track_admin and decided by the SME on professional values.
  - Activation is by a third role.
- Fields touched: `category`, `is_core`, `expected_level` (= the DM-2 value; **not** set until DM-2), `minimum_evidence_count`, `readiness_contribution` (`counts` for Must/Core, `informational` for Supporting).
