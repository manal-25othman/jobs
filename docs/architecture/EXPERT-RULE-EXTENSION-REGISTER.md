# نَقْلة / NAQLA — Expert rule extension register
**Owner requirement (Phase 9, item 4).** SME feedback is acted on through configuration wherever its rule type is supported. A criterion an expert asks for that **no supported rule type expresses** is recorded here as an explicit extension request. It is never squeezed into an existing type, and never stored as free text that something might later "interpret".

## Supported rule types (configuration only, no code change)

Two states are kept apart: **in force** (usable through governed configuration today) and **implemented but inactive** (the code exists, sealed or development-only; nothing reaches real users until the Product Owner's approval and, where stated, P6). The inactive rows below are extensions, listed in **Requests**; listing them here does not approve them.

| Area | Governed configuration | Supported rule types / fields | State |
|---|---|---|---|
| Pack structure, schema 1 (Phase 9) | `pack_constraint_set` + `pack_constraint` | `core_skill_count`, `task_count`, `activity_count`, `activity_primary_skill_count`, `activity_core_primary_skill_count`, `rubric_min_criteria`, `resources_per_skill_max` | In force (format-1 packs) |
| Pack structure, schema 2 (EXT-3) | `pack_constraint_set.schema_version = 2` + `pack_constraint_v2` | `must_skill_count`, `core_class_skill_count`, `supporting_skill_count`, `task_count`, `activity_count`, `activity_primary_skill_count`, `activity_required_primary_skill_count`, `rubric_min_criteria`, `resources_per_skill_max` | Implemented, inactive: `development_only` at most; format-2 packs validate by dry run, import refused (migration 0034) |
| Professional classification (EXT-3) | `skill_classification_set` + `skill_classification` | class `must` / `core` / `supporting` per skill, with `source_kind` `sme` / `po_default` and `source_ref` | Implemented, inactive: no production state; `development_only` with an explicit opt-in; none approved |
| Role skills (Phase 8) | track-skill changes → `track_config_version` | `is_core`, `importance`, `expected_level`, `minimum_evidence_count`, `readiness_contribution`, `enabled`, `display_order`, `category` | In force. For a role with a classification version, `is_core` is not edited; the class changes only by a new classification version |
| Readiness (Phase 5) | `readiness_rule_set` | `required_skill_at_level`, `non_compensable_skill`, `min_skills_at_level`, `all_core_skills_at_level`, `all_skills_at_expected_level`, `min_evidence_per_skill` (+ parameters) | In force. In a classified role the rule set must agree with the classification, and the `is_core` aggregates are refused |
| Readiness, independent evidence (EXT-2) | `readiness_rule_set` | `skill_evidence_path` (per-skill path: distinct tasks, counted criteria, validation activity, understanding element) | Implemented, **sealed until P6** (migration 0030): never approved, published or production-activated; a set containing it never yields a verdict |
| Readiness, integrated assessment (EXT-1) | `readiness_rule_set` | `integrated_assessment_passed` (one approved integrated activity, pinned versions) | Implemented, **sealed until P6** (migration 0033), as EXT-2 |
| Claims (Phase 7) | `claim_policy` | min evidence level / count / source strength, verification decision (skill-asserting kinds never below demonstrated) | In force |
| Assessment context (Phase 4) | `assessment_context_policy` | per-input required / optional / excluded (identity and profile always excluded) | In force |
| Verification (Phase 3/4) | `verification_policy` | min assessment confidence, min independent evidence (H6 blocked in production) | In force |
| AI disclosure (Phase 6) | `disclosure_questionnaire` | questions (typed answers, conditions, mappings) | In force |
| Rubric values (OPEN-043) | rubric criteria | weight, threshold, mandatory, max score; approved only by a named SME. In a format-2 pack an undecided value is `null` + `TBD` (CR-14, proposed) | In force |
| Grounding vocabulary (Phase 7b) | `grounding_lexicon` | entries per language × class | In force |
| Challenges | `challenge_policy` | definition only | **Activation blocked** |

## How an unsupported criterion is handled

1. Configuration refuses it.
   - Pack constraints: an unknown type raises `UnsupportedRuleType`, which names this register. The database enum `pack_constraint_type` refuses it too.
   - Readiness: rule types are a closed set in code; the sealed types (EXT-1, EXT-2) are refused for approval, publication and production activation by the database.
   - Track skills: unknown fields are refused by `assertTrackSkillProposal`.
2. The Product Owner records a row below: the expert's words, the source, why no supported type fits, and a proposed shape.
3. An extension is a reviewed change: a CHG if it touches the SRS, plus a migration, a domain type with tests, a Track Builder kind and an equivalence or baseline statement. It ships **inactive / draft** like every new rule.
4. Until then the criterion has no effect, and the interface says so.

## Requests

| ID | Requested by / source | Expert criterion (verbatim) | Why no supported type fits | Proposed extension | Status |
|---|---|---|---|---|---|
| **EXT-1** | SME-JFE-01 C5 (SME-16, SME-54); D-127 | Readiness includes passing an integrated practical assessment (summary; wording in the SME record) | No readiness rule could read the pass of one specific, approved activity version | Rule type `integrated_assessment_passed`: names one integrated activity and its allowed versions, each pinned to its bound, published, values-approved rubric; only a standing, accepted result counts. Migration 0033; design `docs/sme-candidate/junior-frontend/07-ext-1-ext-2-design.md`; report `ENG-1-PRE-P6-READINESS-GATE-REPORT.md` | 🟡 **Proposed — built inactive, sealed until P6.** Not approved. The pass rule itself is SME item S8 |
| **EXT-2** | SME-JFE-01 C3, F3 (SME-06…12); D-125 | Competence is shown through a per-skill evidence path; the required number of distinct practical tasks is set per skill (summary; wording in the SME record) | No readiness rule counted independent tasks per skill with their own criteria | Rule type `skill_evidence_path`: per-skill minimum of distinct tasks, counted criteria per activity version, validation-activity requirement, understanding element, independence conditions. Migration 0030; design `ENG-1-P4-READINESS-EXT-2-DESIGN.md`; report `ENG-1-P4-IMPLEMENTATION-REPORT.md` | 🟡 **Proposed — built inactive, sealed until P6.** Not approved. Path wording is SME item S5 |
| **EXT-3** | SME-JFE-01 (C2 · SME-17 · SME-19 · SME-20); DM-7b, PO decision D-1 (D-130) | Skills are Must, Core or Supporting for the role; Must is non-compensable, Supporting never blocks | `is_core` is binary and carries legacy pack-shape constraints (`core_skill_count`, `activity_core_primary_skill_count`); three classes cannot be expressed without bending activity design (Task B) or mislabelling Must skills | **Professional skill classification**, taxonomy `must_core_supporting@1`: versioned `skill_classification_set` + `skill_classification` (class, `source_kind` sme \| po_default, `source_ref`); approval by a named SME, plus the Product Owner where PO defaults exist; readiness consistency at approval, activation and evaluation; version-aware readers (badges, gaps, Track Builder). **Pack-constraint schema 2** (`pack_constraint_v2`: Must/Core/Supporting counts, Must ∪ Core primaries per activity). **Pack format 2** (`manifest.pack_format_version = 2`: `professional_class` + `class_source` + `class_source_ref` per role skill, no `is_core_for_role`; optional `resource_links.json` naming where a global learning resource is practised in this pack, the registry unchanged; validation and dry run only, import refused until CHG-017). **Unresolved values** (CR-14): an undecided SME value is `null` + `TBD`, never a number. **Publication safety** (CR-15): no approval, publication or activation while a requirement references a superseded, retired or learner-invisible skill (Q25). Migration 0034 (no further migration); design `DM-7B-P3-ARCHITECTURE-ANALYSIS.md`; reports `DM-7B-P3-IMPLEMENTATION-REPORT.md`, `JFE-V2-CANDIDATE-MILESTONE-REPORT.md` | 🟡 **Proposed — built inactive (development only).** Not approved. No production state exists; development use needs an approved version and a transaction-local opt-in. Approval of this row and of CHG-017 (`docs/changes/CHG-017-PROPOSED.md`) is the Product Owner's |

### Known candidates (internal notes, not expert requests)

These are recorded so they are not lost. None is approved or started.

- **RISK-GROUNDING-02 mitigation:** action verbs whose support needs a specific record type (for example "submitted" → submission, "tested" → a test deliverable or criterion). This would be a grounding extension, not a pack constraint.
- **Per-level pack constraints** (junior / mid / senior): today a set is scoped per track or global. A level scope would be a new scope column, not a new constraint type.
