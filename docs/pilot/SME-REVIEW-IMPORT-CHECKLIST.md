# نَقْلة / NAQLA — SME review: import and mapping checklist
**Purpose:** turn the expert's feedback into configuration changes without re-interpreting it. **Nothing here is approved.** Every value stays draft or pending until a named SME approves it in the Track Builder, and a different product owner activates it.

## How to process one piece of feedback
1. **Log it verbatim:** source (session or document), date, SME name, the exact words.
2. **Map it** to a row in the table below (configuration field + rule type).
   - If no row and no supported rule type fits, record it in `docs/architecture/EXPERT-RULE-EXTENSION-REGISTER.md`. Never force it into the nearest field.
3. **The Track Admin drafts** the change in `/admin` with the SME's words as the reason. One logical change per draft.
4. **The SME** (not the drafter) validates, after reading the diff preview.
5. **A product owner** activates it: neither the drafter nor the approver; development-only on staging first.
6. **Re-check** the effect (browser scenario or import report) and record it in the log.

## Outstanding professional decisions

Pilot impact keys:
- **A** = blocks the real-graduate pilot.
- **B** = limits the pilot scope.
- **C** = no pilot impact (feature off or informational).

| # | Decision | Configuration field(s) | Current status | Required reviewer | Pilot impact | Can implementation continue without it? |
|---|---|---|---|---|---|---|
| 1 | **Pilot track content:** skills, role, tasks, activities, deliverables, rubric criteria | Pack `trk_frontend_junior@0.2.1` → `skill`, `target_role`, `task`, `activity_spec`, `activity_deliverable`, `rubric_version`, `rubric_criterion` (review via `/admin/content`; demo → canonical through `promote`) | **DEMO / DRAFT / NOT SME APPROVED** (`is_demo_fixture`, status draft or curated) | Named SME; publication by PO | **A**: production refuses published demo content | Yes for code and staging; **no for Stage B** |
| 2 | **Rubric values:** weights, skill thresholds, pass threshold | `rubric_criterion.weight` / `weight_status`, `threshold_for_skill` / `threshold_status`, `rubric_version.pass_threshold` / `pass_threshold_status` (OPEN-043; approve-values act) | `proposed` everywhere | Named SME, not the editor or submitter | **A**: a Demonstrated outcome rests on them (with CB-1) | Yes for code; **no for Stage B** |
| 3 | **Grounding vocabulary** | `grounding_lexicon` + `grounding_lexicon_entry` (`default@1`) | DRAFT; development-only in the demo seed; **no production row** | Named SME (language + domain); activation by PO | **A for career claims**: production drafts are all `needs_revision`. Otherwise **B**: exclude claims from the pilot | Yes |
| 4 | Core / supporting classification, importance | `role_requirement.is_core`, `importance`, `classification_status` (track-skill change → track version) | `pending_expert_validation` | Named SME | **B**: badges show pending; affects `all_core_skills_at_level` rules (none active) | Yes |
| 5 | Mandatory skills | `readiness_rule` `required_skill_at_level` / `non_compensable_skill` (`readiness_rule_set`) | None active | Named SME | **C**: no readiness verdict in the pilot | Yes |
| 6 | Readiness thresholds | `readiness_rule.params` (levels, counts) | None active | Named SME | **C** | Yes |
| 7 | Evidence counts and source strengths (claims) | `claim_policy.min_evidence_count`, `min_source_strength`, `min_evidence_level` | `legacy_presentation@1` baseline (not SME validated) + `default@1` drafts | Named SME | **C/B**: the baseline keeps current behaviour | Yes |
| 8 | Per-skill evidence count (H3) | `role_requirement.minimum_evidence_count` | Pack values (core 2, other 1), pending | Named SME | **C**: informational (evidence-path status) | Yes |
| 9 | Verification thresholds | `verification_policy.min_assessment_confidence`, `min_independent_evidence` | Baseline / draft | Named SME (accreditation still open) | **C**: Verified is off | Yes |
| 10 | CV bullet at Practiced | `claim_policy` (`cv_bullet`, `min_evidence_level`) | Blocked below Demonstrated (server) | SME **and** PO | **C**: stays at Demonstrated | Yes |
| 11 | Challenge triggers | `challenge_policy.trigger_rule`, `challenge_types` | Definition only; activation blocked | Named SME | **C**: challenges off | Yes |
| 12 | Pack structure constraints | `pack_constraint_set` / `pack_constraint` (7 types) | `legacy_pack_constraints@1` baseline (not validated) | Named SME | **C**: import validation only | Yes |
| 13 | Assessment context inputs | `assessment_context_policy.inputs` | Baseline (identity and profile always excluded) | Named SME | **C** | Yes |
| 14 | AI-disclosure questionnaire wording | `disclosure_questionnaire` / `disclosure_question` | `ai_usage@1` baseline, `@2` draft | SME + PO | **B**: wording shown to graduates; the baseline is acceptable | Yes |
| 15 | **Human review in the Demonstrated path** (CB-1) | Product decision first; then rubric criteria `evaluator_type = 'human'` / `human_review_required`, or the scope cap | Not decided | **PO decision**, SME defines review criteria | **A** | No for Stage B |

## Questions to ask the SME (per item 1–3, 15)
- For each pilot activity: do the deliverables and criteria measure the named skill? Is any criterion satisfiable without the skill?
- Which criteria **must** be judged by a person for a Demonstrated outcome to be honest?
- Weights and thresholds per criterion, and the pass threshold, with the reasoning written down.
- The grounding vocabulary: which Arabic and English verbs are supportable by which recorded fact, and which must never appear (feeds RISK-GROUNDING-02).
- Which skills are core for a junior frontend developer, and why.

## Before the SME session
- ☐ Export the current pack values into a readable sheet (skills, criteria, weights, deliverables) for the SME.
- ☐ Grant the SME an `sme` role on **staging** only; record the grant.
- ☐ Agree how the SME's identity, credentials and accreditation are recorded (accreditation is OPEN).
- ☐ Agree turnaround and which items are in scope for Stage B (rows 1, 2, 15 and possibly 3).
