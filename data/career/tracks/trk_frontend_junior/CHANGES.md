# trk_frontend_junior — change record

Every earlier version stays archived verbatim as an L0 `raw_snapshot` (content-addressed); this file records **what** changed and **why**, so nothing is lost silently.

## 0.2.1 — 2026-09-27 · owner decisions OD-3 and OD-10 applied (SRS-001 v1.5 §20 · D-107) — still DEMO / DRAFT / NOT SME APPROVED
- **OD-3:** `ui-testing` removed from the P1 role-skill map (it had no task and no activity measuring it). **No replacement task or criterion.** The Slice-1 skill row itself and its synonym link are untouched (global registry, not the role map). Role map: 13 → 12 (5 core + 7 supporting).
- **OD-10:** the `live_defense` expectation removed from P1: from `evidence_type_expected` on 4 role-map rows (`skl_js_fundamentals` · `skl_frontend_debugging` · `skl_code_reading` · `skl_technical_explanation`) and from `evidence_types_possible` on 6 global skills. **No live-defense mechanism was built**; the evidence-type vocabulary in the domain is unchanged.

## 0.2.0 — 2026-09-27 · owner decisions before the final content review (DEMO / DRAFT / NOT SME APPROVED)

### OPEN-039 · near-duplicate `ui-state-management` ↔ `skl_ui_state_interaction` → `equivalent`
- **Canonical:** `skl_ui_state_interaction` (full definition, indicators, evidence path in two activities).
- **Alias retained:** `ui-state-management` (Slice-1 skill, id `a0000000-0000-4000-8000-000000000001`) keeps its row and id; the pipeline marks it `status = merged_into → skl_ui_state_interaction`, `review_status = superseded`, with a `review_log` entry by the owner. Its two names become `equivalent` surface forms on the canonical skill (`skill_synonyms.json`).
- **Historical references preserved:** every `evidence`, `skill_claim`, `evaluation_criterion_score`, `source_ref` row that names the alias is untouched. New lookups (submission claims, evidence promotion, agent context) resolve alias → canonical via `canonical_skill_id()`.
- **Mappings repointed** (only where the canonical was not already mapped): the Slice-1 demo role's requirement on the alias now points to the canonical skill.
- **Not done:** no delete, no id reuse, no renaming of the alias. Declared in `manifest.json → duplicate_resolutions` (decision ref D-097).

### OPEN-044 · `deliverables_complete` is a GATE, not skill evidence
- All three `deliverables_complete` criteria: `criterion_kind = gate`, `linked_skill = null`, no skill threshold / threshold status. They still count toward the submission score, stay mandatory, and the matching `files_present` check still blocks.

### OPEN-045 · the 11 `signal.*` / `followup.*` checks, classified
| activity | check | was | now |
|---|---|---|---|
| build_interface | `planted_field_count` | `signal.planted_field_count` | **REMOVED** — duplicate of `clarify_fields_conflict` (the user's answer) + criterion `judgment_assumption_check` |
| build_interface | `empty_response_edge` | `signal.empty_response_edge` | **HUMAN_OBSERVABLE** → input to `data_states` |
| build_interface | `error_500_expected_failure` | `signal.error_500_expected_failure` | **HUMAN_OBSERVABLE** → input to `data_states` |
| debug_improve | `followup_change_breakpoint` | `followup.breakpoint_900` | **FUTURE_DETERMINISTIC** (inactive) — needs a post-submission follow-up round |
| debug_improve | `planted_hidden_overflow` | `signal.planted_hidden_overflow` | **HUMAN_OBSERVABLE** → input to `responsive_fixed` |
| debug_improve | `deterministic_email_signal` | `signal.email_validation_present` | **HUMAN_OBSERVABLE** → input to `validation_fixed` |
| debug_improve | `output_consistency_layout` | `signal.output_consistency_layout` | **FUTURE_DETERMINISTIC** (inactive) — needs a browser rendering runner |
| change_request | `followup_second_filter` | `followup.assignee_filter` | **FUTURE_DETERMINISTIC** (inactive) — needs a post-submission follow-up round |
| change_request | `planted_empty_as_error` | `signal.planted_empty_as_error` | **HUMAN_OBSERVABLE** → input to `root_cause_fixed` |
| change_request | `deterministic_state_signal` | `signal.filter_in_state` | **HUMAN_OBSERVABLE** → input to `filter_in_state` |
| change_request | `edge_empty_after_filter` | `signal.edge_empty_after_filter` | **HUMAN_OBSERVABLE** → input to `empty_state_correct` |
- `files_present` (×3) re-typed from the mislabel `followup_modification` to `mandatory_deliverables` (still blocking, still user-facing).
- Result: 17 checks per pack (7 deterministic · 7 human-observable · 3 future/inactive). **No active check depends on an artifact without a producer** (`validatePack`, quality rule Q22).

## 0.1.0 — 2026-09-26 · first draft (AI-assisted), imported as DEMO
