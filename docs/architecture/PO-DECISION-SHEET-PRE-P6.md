# نَقْلة / NAQLA — Product Owner Decision Sheet (pre-P6)

**Date:** 2026-10-18 · **For:** the Product Owner · **Status:** options only.

**What this sheet does not do:**
- Nothing here is selected, applied or activated.
- No professional value is set here; the SME's values come through `docs/sme-candidate/junior-frontend/11-sme-review-package-final.md`.

**Established context, not reopened:**
- The SME's decisions F1–F5, C1–C5 and the SME table.
- D-128: L-1, verification-level and readiness requirements kept separately configurable.

---

## 1. DM-2 — which verification level the readiness rules read

| Option | Meaning | Consequences |
|---|---|---|
| **V-a** | Must and Core rules read **Demonstrated** | Simplest and consistent: every activity's rubric proposes Demonstrated. The SME's proficiency differences (Working / Familiar) live in the rubric thresholds and descriptors, not in the level |
| **V-b** | Must at Demonstrated, Core at **Practiced** | **No activity awards Practiced today** (every rubric proposes Demonstrated; submission promotion is off, D-118). V-b therefore changes nothing in practice unless a rubric is later made to propose Practiced, which is an SME content decision |
| **V-c** | Defer: the rule set is not created | Readiness stays `not_yet_configured` for everyone. Safe, but no pilot can show readiness |

**Recommendation:** V-a, to be confirmed with the SME in S13 of the package.
- Choose V-c instead if the pilot will run before the calibration values return.
- Do not choose V-b unless a Practiced-proposing rubric is also approved.

**Needs:** the PO's choice + the SME's confirmation (S13). It is recorded as a value of the draft `junior_frontend_readiness` rule set, which is created only after the SME values return.

## 2. DM-7b — how Must/Core is represented in pack data (`is_core`)

### 2.1 Verified against the legacy constraint (item 6 of the PO's request)

The checks below were run with the real validator (`checkPackCounts`) on the candidate's counts (9 Must ∪ Core; three activities with three primaries each; Task B's primary skills are code reading, debugging and JavaScript):

| Representation | Under `legacy_pack_constraints@1` (global, in effect) | Under a track-scoped set with `core_skill_count` 9–9 |
|---|---|---|
| **P-1** (`is_core` = Must ∪ Core, 9) | **Violates** `core_skill_count` 4–5 (found 9) | No violation |
| **P-2** (`is_core` = the OD-2 five) | **Violates** `activity_core_primary_skill_count` for Task B (found 1; only JavaScript is in the five) | (same as left) |

**Also verified:**
- `scripts/verify-docs.mjs` §3 requires **exactly 5** core skills in the canonical pack (and `is_demo_fixture = true`). Under P-1 it must change, in the same commit as CHG-017 and the publication. Under P-2 it holds.
- Nothing silently violates the constraint today:
  - the candidate lives only in `docs/sme-candidate/`, which no importer, validator or check reads;
  - the canonical pack `trk_frontend_junior@0.2.1` still has five core skills;
  - `npm run verify` passes.
- **Where `is_core` is read** (so a mismatch would show):
  - track-skill badges (`trackSkillBadge`: "core" / "supporting");
  - readiness facts (`all_core_skills_at_level`, `min_skills_at_level` with scope `core`);
  - the core evidence-path quality report (`coreSkillEvidencePaths`);
  - admin and Track Builder.
- **Under P-2** the SME's Must skills Debugging, Code Reading and Git would read `is_core = false`. They would be badged "supporting" and left out of the core quality report. This is a silent semantic divergence unless every reader is changed to the readiness rule set.
- **The candidate readiness rule set** names skills explicitly (`non_compensable_skill` for Must, `required_skill_at_level` for Core). It does **not** use `all_core_skills_at_level`, so readiness itself is not affected by either option.

### 2.2 Options

| Option | What changes | Consequences |
|---|---|---|
| **P-1** | `is_core` = the nine Must ∪ Core skills, through governed track-skill changes. A **new track-scoped** `pack_constraint_set` `trk_frontend_junior_constraints` v1 with `core_skill_count` 9–9 (everything else copied). Draft → four eyes → separate activator; the global set untouched. Plus CHG-017 (CR-8) and the `verify-docs` update at publication | The data states the SME model honestly. Every `is_core` reader agrees with Must/Core. Requires an SRS change (§3.1, OD-2) through CHG-017, at publication |
| **P-2** | `is_core` stays the OD-2 five | No SRS change. But Task B fails `activity_core_primary_skill_count` unless its primaries are bent (understating debugging). "Core" in the data no longer means SME Core; Must skills show as supporting |

**Recommendation:** P-1. It is the only option with no silent divergence, and it is explicit and governed. Apply it only together with CHG-017 and publication, never before.

## 3. A-1b — claims and corroborating evidence

Three linked questions (CLM-1 unchanged today; DB guards in place):

| Question | Options | Consequences |
|---|---|---|
| **3a.** May a CV/LinkedIn claim follow a level reached **before** job readiness? (K-2) | (i) Yes, as today: claims follow the level. (ii) Require readiness, which needs a new claim-policy field and its own change | (i) is consistent with L-1 and with SME-28 (CV/LinkedIn are not evidence of skill; claims are grounded in recorded evidence). (ii) couples claims to readiness and contradicts the separation the PO just accepted |
| **3b.** May `evidence_corroborated` ever support a claim? | (i) Never (as today). (ii) Only as a second piece of evidence next to a positive decision, in a new claim-policy version | (i) is simplest and safe. (ii) needs a new policy version, tests and approval; it never authorizes a claim alone (PO decision 2) |
| **3c.** What replaces the idea of `linkedin_skill` with `min_evidence_count = 2`? (K-3) | (i) Drop it. (ii) Replace it with an explicit rule "an EXT-2 path satisfied for this skill", built as a new claim-policy field | `min_evidence_count = 2` can **never** be met by the two-task path: the second task leaves corroborating evidence, which claims exclude. Activating it would silently block the claim kind |

**Recommendation:** 3a (i), 3b (i), 3c (i). Revisit 3b and 3c only after the pilot shows real evidence patterns. Each choice is a claim-policy version: draft → approval → activation.

## 4. CHG-017 — proposed SRS change request (text in decision pack §I.3)

| CR | Content | Status |
|---|---|---|
| CR-1 | Must / Core / Supporting semantics (C2); the readiness rule set carries them | SME-confirmed content; wording for PO |
| CR-2 | Proficiency ≠ verification level; configuration never assigns a level | Engineering invariant |
| CR-3 | Readiness = all Must + all Core minimums + integrated pass; never a count | SME-confirmed (C5) |
| CR-4 | Git: one project suffices when observed and explained | SME-confirmed (F4) |
| CR-5 | Per-skill, versioned evidence paths; no universal two-activity minimum | SME-confirmed (C3, F3) |
| CR-6 | The integrated assessment is a readiness condition | SME-confirmed (C5) |
| CR-7 | Code understanding for everyone; no AI-specific challenge | SME-confirmed (F2) |
| CR-8 | Track counts by a governed track-scoped constraint version; 3 activities kept; amends §3.1 and OD-2 | **Depends on DM-7b** (only under P-1) |
| CR-9 | Human review is the interim basis, then the exception mechanism | SME-confirmed (C4) |
| CR-10 | Each skill in a shared activity has its own criterion and result | SME-confirmed (F1) |

**Proposed addition (for D-128):**
- **CR-11:** verification-level requirements and job-readiness requirements are separately configurable. The level never derives from readiness (BR-024) and readiness never assigns a level.

**Options:**
- (i) Approve the text now, and apply it to the SRS only at publication, with `verify-docs` in the same commit (ENG-5).
- (ii) Change wording.
- (iii) Defer.

**Recommendation:** (i). Approving the text changes nothing until it is applied.

## 5. Extension-register entries (`EXPERT-RULE-EXTENSION-REGISTER.md`, "Requests" table is empty today)

| Proposed ID | Expert criterion (source) | Why no existing type fits | Extension (built, sealed) | Proposed status |
|---|---|---|---|---|
| EXT-1 | «اجتياز مهمة عملية متكاملة» (C5 condition 3; SME-18) | Readiness rules read claim states and evidence counts; none reads an assessment's pass | `integrated_assessment_passed` (0033): pinned activity/rubric versions, PR-1/PR-2, fail-closed exclusions, per-skill attribution | "built — inactive, sealed until P6; pass rule pending SME (S8)" |
| EXT-2 | «مشروع عملي مع مهمة قصيرة مستقلة… ليس فقط تكرار نفس الحل» (C3); per-skill counts (SME table) | `min_evidence_per_skill` counts rows; it cannot tell a repeat from an independent task | `skill_evidence_path` (0030–0032): per-skill counted criteria, variant family, reuse by checksum and versioned text fingerprint | "built — inactive, sealed until P6; path wording pending SME (S5)" |
| ENG-1 | Own criterion and independently justified result per skill (F1) | One evaluation moved only the primary claimed skill | Per-skill assessment results (0026–0029), development-only policy | "built — development-only; policy approval pending" |

**Options:**
- (i) Record the three rows now as built-inactive.
- (ii) Record them only at P6.

**Recommendation:** (i). The register should match what the code can do, and recording grants nothing.

---

## Order of decisions

1. Send `11-sme-review-package-final.md` to the SME.
2. In parallel: A-1b (§3), CHG-017 text (§4) and the register rows (§5). None depends on SME values.
3. When the package returns: DM-2 (§1) with S13, then DM-7b (§2), together with CHG-017's application.
4. Then content authoring and publication, governed drafts, staging, and the separate P6 decision.

**Stop.** Nothing on this sheet has been applied.
