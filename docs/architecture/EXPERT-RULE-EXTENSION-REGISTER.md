# نَقْلة / NAQLA — Expert rule extension register
**Owner requirement (Phase 9, item 4).** SME feedback is acted on through configuration wherever its rule type is supported. A criterion an expert asks for that **no supported rule type expresses** is recorded here as an explicit extension request. It is never squeezed into an existing type, and never stored as free text that something might later "interpret".

## Supported rule types (configuration only, no code change)

| Area | Governed configuration | Supported rule types / fields |
|---|---|---|
| Pack structure (Phase 9) | `pack_constraint_set` | `core_skill_count`, `task_count`, `activity_count`, `activity_primary_skill_count`, `activity_core_primary_skill_count`, `rubric_min_criteria`, `resources_per_skill_max` |
| Role skills (Phase 8) | track-skill changes → `track_config_version` | `is_core`, `importance`, `expected_level`, `minimum_evidence_count`, `readiness_contribution`, `enabled`, `display_order`, `category` |
| Readiness (Phase 5) | `readiness_rule_set` | `required_skill_at_level`, `non_compensable_skill`, `min_skills_at_level`, `all_core_skills_at_level` (+ parameters) |
| Claims (Phase 7) | `claim_policy` | min evidence level / count / source strength, verification decision (skill-asserting kinds never below demonstrated) |
| Assessment context (Phase 4) | `assessment_context_policy` | per-input required / optional / excluded (identity and profile always excluded) |
| Verification (Phase 3/4) | `verification_policy` | min assessment confidence, min independent evidence (H6 blocked in production) |
| AI disclosure (Phase 6) | `disclosure_questionnaire` | questions (typed answers, conditions, mappings) |
| Rubric values (OPEN-043) | rubric criteria | weight, threshold, mandatory, max score; approved only by a named SME |
| Grounding vocabulary (Phase 7b) | `grounding_lexicon` | entries per language × class |
| Challenges | `challenge_policy` | definition only; **activation blocked** |

## How an unsupported criterion is handled

1. Configuration refuses it.
   - Pack constraints: an unknown type raises `UnsupportedRuleType`, which names this register. The database enum `pack_constraint_type` refuses it too.
   - Readiness: rule types are a closed set in code.
   - Track skills: unknown fields are refused by `assertTrackSkillProposal`.
2. The Product Owner records a row below: the expert's words, the source, why no supported type fits, and a proposed shape.
3. An extension is a reviewed change: a CHG if it touches the SRS, plus a migration, a domain type with tests, a Track Builder kind and an equivalence or baseline statement. It ships **inactive / draft** like every new rule.
4. Until then the criterion has no effect, and the interface says so.

## Requests

| ID | Requested by / source | Expert criterion (verbatim) | Why no supported type fits | Proposed extension | Status |
|---|---|---|---|---|---|
| — | — | *No expert feedback has been received yet. Entries are added when an SME criterion cannot be expressed.* | — | — | — |

### Known candidates (internal notes, not expert requests)

These are recorded so they are not lost. None is approved or started.

- **RISK-GROUNDING-02 mitigation:** action verbs whose support needs a specific record type (for example "submitted" → submission, "tested" → a test deliverable or criterion). This would be a grounding extension, not a pack constraint.
- **Per-level pack constraints** (junior / mid / senior): today a set is scoped per track or global. A level scope would be a new scope column, not a new constraint type.
