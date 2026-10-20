# نَقْلة / NAQLA — DM-7b: Professional Skill Classification — Architecture Analysis (P-1 / P-2 / P-3)

**Date:** 2026-10-20 · **Status:** architectural investigation and decision proposal. **Implementation is not authorized.**

**What this document does not do:**
- It creates no migration and changes no code, policy, SRS or SME content.
- It activates nothing.

**Git state verified before writing:**
- Branch `claude/career-os-graduates-y42s9z`, HEAD `eac41a1`, equal to `origin`, clean working tree.
- D-128, D-129, Task A (0032), EXT-1 (0033), P4 and P5 are all present and are not repeated here.

**Established context (not reopened):**
- The SME classification in the revised decision pack §B: Must 6, Core 3, Supporting 3.
- D-128: L-1, level and readiness requirements kept separately configurable.
- The SME readiness model (C5): every Must skill at its required level, every Core skill at its Junior minimum, the integrated assessment passed.

---

## 1. Findings: every actual use of `is_core`

Searched across `apps/`, `packages/`, `scripts/`, `supabase/` and `data/` (excluding builds). Grouped by layer:

### 1.1 Database

| Where | What it does |
|---|---|
| `0001_init.sql:142` | `role_requirement.is_core boolean not null default false` — a property of the role↔skill **mapping** |
| `0007_career_data_foundation.sql:282` | Comment: "is_core_for_role: a property of the MAPPING, not of the skill (DF-6)" |
| `0014_track_configuration.sql:258–265` | Adds `category` (display only), `expected_level`, `readiness_contribution`, `enabled` and **`classification_status`** (`pending_expert_validation` → `approved`; approved needs a named reviewer). Comment: "The UI must not present is_core as 'core' before that" (D-111) |
| `0014_track_configuration.sql:306` | `is_core` is part of every `track_config_version` snapshot (versioned Track Builder state) |
| `0022_pack_constraints.sql:22–23, 88–89` | Closed enum `pack_constraint_type` incl. `core_skill_count` (4–5) and `activity_core_primary_skill_count` (2–3), in the global legacy baseline set |
| `0024_graduate_content_access.sql:208` | Column grant: learners may read `is_core` |
| `seed/0001_demo_role.sql:48, 190–191` | Demo seed: `importance` and `minimum_evidence_count` derived from `is_core` |
| `tests/rls.sql:256, 284` | RLS fixtures |

### 1.2 Domain (`packages/domain`)

| Where | What it does |
|---|---|
| `pack-constraints.ts:30–65, 123–147` | `core_skill_count` and `activity_core_primary_skill_count` as configurable constraints. `PackCounts.coreSkills` / `corePrimaries`. **`assertPackConstraintsSane` (77–100) requires every type exactly once in every set ("no silent default")** |
| `pack-constraints.ts:161–169` | Frozen copy of the pre-Phase-9 checks (4–5 core, 2–3 core primaries), used only by the equivalence proof |
| `career-data.ts:283` | `minimumEvidenceCount(isCore) → 2 : 1`: the old "two-evidence rule for core skills". **Deprecated** (H3, Phase 9 moved the count to `role_requirement.minimum_evidence_count`). Kept only for the equivalence proof |
| `configuration.ts:189–209` | `trackSkillBadge`: `core` / `supporting` / `pending_expert_validation` / `disabled`. `isCore` in `TrackSkillConfig` and snapshots |
| `readiness.ts:31, 175, 184` | `all_core_skills_at_level` and `min_skills_at_level {scope:'core'}` read `isCore` (core = `is_core` AND classification approved; pending ⇒ indeterminate) |
| `admin-governance.ts:101–114, 160` | `is_core` is a **professional** field (expert-dependent, four-eyes). `CLASSIFICATION_FIELDS = ['is_core', 'importance']`. Help text: «مهارة أساسية / داعمة». `category` is non-professional, display only (103, 167) |

### 1.3 Importer and pack validation (`apps/api/src/career-data`)

| Where | What it does |
|---|---|
| `pack-schema.ts:27` | `PackRoleSkill.is_core_for_role: boolean` (pack JSON) |
| `pack-schema.ts:48–60` | `packCounts`: `coreSkills` and `corePrimaries` per activity, from `is_core_for_role` |
| `pack-schema.ts:268–273` | **Every core skill must have an evidence path** (≥1 activity measures it through a linked criterion) |
| `pipeline.ts:237–244` | The importer writes `is_core` from `is_core_for_role` (insert and upsert) |
| `quality-rules.ts:47–51` | Q06 "core skill without an evidence path" (fail) |
| `quality-rules.ts:146–154` | `coreSkillEvidencePaths`: the evidence-path report covers `is_core` skills only |
| `career-data.service.ts:6, 61–66` | `RoleRequirementFact.isCore`; requirements ordered `is_core desc` |

### 1.4 API services

| Where | What it does |
|---|---|
| `readiness.service.ts:46, 60, 160` | Readiness facts carry `isCore`; the learner skill detail gets a `badge` |
| `configuration.service.ts:81–93` | Track view: `isCore` + `badge` |
| `config-admin.service.ts:203–208` | Applying a Track Builder snapshot writes `is_core` |
| `admin.service.ts:339–349` | Track Builder reads `is_core` |
| `agent.service.ts:97` → `packages/agents/src/local-test-provider.ts:109–116` | **Agent "profile gap" proposals** are generated only for `isCore` requirements without Demonstrated/Verified: «مهارة أساسية للدور بلا دليل بعد» |

### 1.5 Learner and admin UI (`apps/app`)

| Where | What it does |
|---|---|
| `app/skills/page.tsx:14, 77`, `app/skills/[id]/page.tsx:82` | Badge labels: `core` → «أساسية», `supporting` → «مساندة» |
| `lib/api.ts:289` | API type `badge: 'core' \| 'supporting' \| …` |
| `admin/tracks/[roleId]/page.tsx:24`, `admin/shared.tsx:154–161`, `admin/config/[kind]/page.tsx:19–20` | Track Builder edits `is_core`; constraint labels |

### 1.6 Tests and documentation checks

| Where | What it checks |
|---|---|
| `pack-constraints.e2e.ts:82` | Refuses a pack with fewer than 4 core |
| `pack-constraints.e2e.ts:157–162` | The shipped pack's `minimum_evidence_count` equals the deprecated `minimumEvidenceCount(is_core)` (equivalence) |
| `career-data.e2e.ts:44, 291` | Exactly 5 core |
| `configuration.e2e.ts:155`, `readiness.e2e.ts:55` | Never shown as core before approval |
| `track-admin.e2e.ts:141–168` | Track Builder proposal of `is_core` |
| Domain tests | `admin-governance`, `configuration`, `pack-constraints`, `readiness` |
| `scripts/verify-docs.mjs:59–60` | **Exactly 5** `is_core_for_role` in the canonical pack, naming the five skills |
| SRS §3.1 (line 162) | «5 مهارات أساسية … المجموعة الأساسية مضبوطة: SME يوصي، ولا يستبدل بصمت (OD-2)» |
| SRS FR-P-012 (line 296) | «تمييز Core/مساند» — a **binary** model |
| D-084 | "first track … five core skills" |
| `DOMAIN-MODEL.md:113` | "`is_core` defines where the two-evidence rule applies — OPEN-012 still open" |

**Not used by `is_core`:** verification decisions, evaluation, per-skill assessment (ENG-1), EXT-1, EXT-2, claim policies, evidence, and stored readiness snapshots (`readiness_evaluation.result` is a frozen report). Historical assessments and claims do not depend on it.

---

## 2. What `is_core` means today

| Layer | Meaning |
|---|---|
| **Business semantics (intended)** | "This skill is a central requirement of this role" (FR-P-012, D-084, DF-6). It is binary: core vs supporting. It is a professional classification that may be shown only after named-expert approval (D-111, `classification_status`) |
| **Legacy implementation constraints (structural)** | (a) **Pack shape:** 4–5 core skills per role, 2–3 core primaries per activity, every core skill on an evidence path. These numbers were written for the first five-skill pack (Phase 9 froze them as `legacy_pack_constraints@1`). (b) **Evidence count:** the deprecated "core ⇒ 2 evidence" rule. (c) **Ordering and gap generation:** API ordering and agent "profile gap" proposals |
| **Current data** | The canonical pack `trk_frontend_junior@0.2.1` has the OD-2 five (HTML, CSS, JS, UI state, API states). **Every `classification_status` is `pending_expert_validation`**, so no learner sees «أساسية» today (asserted by the configuration and readiness e2e) |

**The mismatch with the SME:**
- The SME model has **three** professional classes. Their difference is **behavioural in readiness**: Must is non-compensable at the required level; Core needs the Junior minimum; Supporting is never a blocker (C2, SME-19/20).
- A boolean cannot carry three classes. Its structural numbers (4–5, 2–3) are pack-shape heuristics, not professional facts.
- `is_core` today conflates **"importance to the role"** with **"pack shape"**.

---

## 3. The SME classification to represent (revised decision pack §B)

| Class | Skills | Readiness behaviour (C5) | SME status |
|---|---|---|---|
| **Must** (6) | html_semantic, css_responsive, js_fundamentals, frontend_debugging, code_reading, version_control_basics | Required level, non-compensable (`non_compensable_skill`) | SME ✅ (SME-17, F1, C1/F4) |
| **Core** (3) | ui_state_interaction, api_data_states, accessibility_basics | Junior minimum (`required_skill_at_level`) | SME ✅ |
| **Supporting** (3) | forms_validation, technical_explanation, requirements_reading | **No readiness rule**; may compensate only among themselves (SME-20) | **See conflict C-1** |

**Conflict C-1 (documented, not resolved):** only `technical_explanation` has an SME basis for Supporting (SME-25: "decision clarity does not block"). `forms_validation` and `requirements_reading` are **"SME silent; PO default"** in the decision pack (§B). The request says "the SME established … SUPPORTING: 3". The record shows two of the three as **PO defaults**. This analysis does not change them. A P-3 classification must record the **source** of each class (SME reference or PO default) so that this distinction is not lost.

---

## 4. Task B and core-primary validation

**Candidate Task B** (`act_fe_short_read_and_fix`) has primaries **code_reading, frontend_debugging, js_fundamentals** (decision pack §F). All three are SME **Must** skills.

| Option | `corePrimaries(B)` | Legacy rule 2–3 | Problem |
|---|---|---|---|
| P-2 (`is_core` = OD-2 five) | 1 (only JS) | ✗ | B is valid activity design (three Must skills measured deeply), but the rule counts the **old** five. To pass, B's primaries must be bent (e.g. UI state instead of debugging), which understates the skills B was designed for |
| P-1 (`is_core` = Must ∪ Core) | 3 | ✓ | But `core_skill_count` = 9 ✗ (4–5) |
| **P-3** | Counted as **required** (Must ∪ Core) primaries = 3 | ✓ under a class-based rule | No skill is misclassified and no primary is bent |

Verified with the real validator (`checkPackCounts`, D-129): P-1 violates `core_skill_count(9)`; P-2 violates `activity_core_primary_skill_count(B=1)`.

**What the core-primary rule is for:** "an activity must measure 2–3 central skills deeply". Its intent survives under P-3 when "central" means Must ∪ Core from the professional classification, not the legacy boolean.

---

## 5. Options compared

| Criterion | **P-1** `is_core` = Must ∪ Core (9) | **P-2** keep the OD-2 five | **P-3** separate versioned professional classification |
|---|---|---|---|
| Preserves the SME's three classes | ✗ Must and Core collapse into one boolean; the readiness difference lives only in rules | ✗ Must skills Debugging, Code Reading, Git read "supporting" | ✓ |
| Learner badge truth | Debugging shown «أساسية» like Core; no Must/Core distinction | **Misleading:** three Must skills shown «مساندة» once approved | ✓ «إلزامية / أساسية / مساندة» |
| Agent profile gaps | Gaps for 9 (correct set, wrong wording) | **Missing** gaps for Debugging, Code Reading, Git | ✓ by class |
| Pack constraints | Needs a track-scoped set with `core_skill_count` 9–9 | Task B fails unless primaries are bent | New class-based constraint types under a versioned constraint schema |
| `verify-docs` / SRS §3.1 / OD-2 | Must change (5 → 9) through CHG-017 | Unchanged | Unchanged for 0.2.1; class counts checked for the new pack through CHG-017 |
| Backward compatibility | Rewrites the meaning of an existing professional field | Full | Full: additive; legacy packs unchanged; `is_core` kept |
| Multi-track (Data/BI) | Every track bends to one boolean | Same | ✓ per-track classification sets |
| Effort | Low (configuration) | None | Medium (new schema, validator, readers) |
| Risk of silent semantic drift | Medium | **High** | Low, if the consistency checks (§8) exist |

---

## 6. Proposed schema and compatibility strategy (P-3) — proposal only, not created

### 6.1 Governed classification set (versioned, like other governed configuration)

```text
skill_classification_set
  id, key, version, target_role_id (role-scoped, like role_requirement), track_pack_ref (e.g. trk_frontend_junior@0.3.0)
  taxonomy        text  -- closed vocabulary id, e.g. 'must_core_supporting@1' (see §9)
  review_status   draft | curated | sme_reviewed | approved | published   -- governed like content
  activation      inactive | development_only | production_active        -- one active per role
  drafted_by, approved_by (named SME), activated_by (PO; separation of duties, four eyes)
  immutable once it has been active; changes are a new version

skill_classification
  set_id, skill_id (canonical, OPEN-039), class ('must' | 'core' | 'supporting')
  source_kind ('sme' | 'po_default'), source_ref (e.g. 'SRC-A SME-17', 'decision pack §B'), rationale_ar/en
  unique (set_id, skill_id); every role_requirement of the role classified exactly once
```

**Rules:**
- **Shown only when approved and active:** like `classification_status` (D-111). Otherwise the badge stays «التصنيف قيد اعتماد الخبراء».
- **`source_kind`** keeps conflict C-1 visible: a PO default is never presented as an SME decision.
- **Track-agnostic:** each track or role has its own set. The taxonomy is a closed vocabulary; a new taxonomy is an extension-register item, never a free string.

### 6.2 Pack format (versioned)

- `role_skill_map.json` **v2** adds `professional_class` and `class_source` per skill, plus the pack-level `classification_taxonomy`.
- **v1** packs (0.2.1) stay valid exactly as today.
- The importer creates, for a v2 pack, an **inactive draft** classification set. It never activates it; activation goes through the normal governed flow.

### 6.3 `is_core` under P-3 — two sub-options (PO decision D-2)

| Sub-option | Behaviour | Trade-off |
|---|---|---|
| **3a — derived mirror (recommended)** | For a role with an active classification set, `is_core` is **derived** = class ∈ {must, core}, written only by the classification activation, and read-only in Track Builder. Legacy readers (ordering, `all_core_skills_at_level`, gap generation) keep working with a meaning consistent with the SME | One source of truth. The legacy numeric `core_skill_count` must not apply to those tracks (§6.4) |
| 3b — frozen legacy | `is_core` stays whatever the pack says (OD-2 five); every reader moves to the classification | No derived writes. But any reader left on `is_core` silently disagrees with the SME (the P-2 risk, contained) |

### 6.4 Pack constraints — a versioned constraint schema (conflict C-2)

**Conflict C-2 (documented):**
- `assertPackConstraintsSane` requires **every** constraint type in **every** set.
- Sets that have been active are **immutable**: the trigger `pack_constraint_frozen` (`0022_pack_constraints.sql:70–76, 95`) refuses INSERT, UPDATE and DELETE of constraint rows. The baseline is included (asserted in `pack-constraints.e2e.ts`).
- So adding new constraint types to the closed enum would make the existing `legacy_pack_constraints@1` baseline **invalid**, because it cannot be amended.

**Proposed resolution:**
- `pack_constraint_set.schema_version`: `1` = the seven legacy types (every existing row); `2` = a v2 type list.
- `assertPackConstraintsSane` checks completeness **per schema version**.
- Old sets stay valid, unchanged and frozen. No default is invented for a missing type.

**Schema v2 types:**

| Type | Meaning | Junior Frontend values (PO/SME to confirm — not set here) |
|---|---|---|
| `must_skill_count` | Must skills per role | from the approved classification (6) |
| `core_class_skill_count` | Core-class skills per role | from the approved classification (3) |
| `activity_required_primary_skill_count` | Must ∪ Core primaries per activity (replaces `activity_core_primary_skill_count` for v2) | 2–3 (INT 3, A 3, B 3) |
| `task_count`, `activity_count`, `activity_primary_skill_count`, `rubric_min_criteria`, `resources_per_skill_max` | Unchanged meaning | copied |

- `core_skill_count` and `activity_core_primary_skill_count` (`is_core`-based) are **not in v2**. A v2 pack is validated by class, a v1 pack by `is_core`.
- **The pack format determines the schema version.** A v2 pack is refused unless a v2 set is in effect for its track (no fallback to v1).
- The evidence-path check (`pack-schema.ts:268`, Q06, `coreSkillEvidencePaths`) runs over **Must ∪ Core** for v2 and over `is_core` for v1.
- **Constraint values are pack-shape governance (PO, four eyes), not professional thresholds.** Counts equal to the classification are a consistency check and could be derived instead of configured (PO decision D-5).

### 6.5 Compatibility matrix

| Artifact | Behaviour after P-3 |
|---|---|
| Canonical pack 0.2.1 (v1) | Unchanged: same validation (equivalence proof holds), same `is_core`, `verify-docs` unchanged |
| Existing `role_requirement` rows / `track_config_version` snapshots | Unchanged. Snapshots keep `is_core`. A new snapshot field `professional_class` is additive |
| Historical evaluations, decisions, evidence, claims, readiness snapshots | Not affected: none reads `is_core` (§1) |
| API (`TrackSkill`, `RoleRequirementFact`, readiness skill detail) | Additive: `professionalClass` and `classSource`. `isCore` kept. `badge` gains `must` and a distinct `core` only when a classification set is approved and active; old clients keep working (the union widens; the app updates labels) |
| Readiness | §7 |
| Track Builder | For a role with a classification set, `is_core` is read-only (3a); class changes go through a new classification version |

---

## 7. Interaction with readiness (the SME model preserved)

The classification becomes the **reference** the readiness rule set is checked against. It is not a rule itself. This keeps L-1 (D-128): no level is assigned by classification.

| SME requirement | Enforced by (proposal) |
|---|---|
| Every **Must** skill meets its required level | Consistency check at rule-set creation and approval: every Must skill has exactly one `non_compensable_skill` rule (`min_level` = DM-2). Missing ⇒ refused |
| Every **Core** skill meets its Junior minimum | Every Core skill has a `required_skill_at_level` rule. Missing ⇒ refused |
| The integrated assessment passes | The set contains an EXT-1 rule (already built, sealed) |
| **Supporting skills never silently become blockers** | Refused: any `non_compensable_skill` / `required_skill_at_level` / EXT-2 rule naming a Supporting skill. Also refused: `all_core_skills_at_level` and `min_skills_at_level {scope:'core'}` in a role with a classification set, because their `is_core` meaning is ambiguous there. Supporting skills may appear only in informational outputs |
| Classification not yet approved | A sealed readiness set stays `pending_validation` (as today). Badges stay pending |

**Conflict C-3 (documented):**
- The decision pack §B proposed the **readiness rule set** as "the single authoritative carrier of Must/Core".
- P-3 moves the **authority** to the classification set and makes the rule set **checked against** it.
- **Why:** several readers that are not readiness need the class while readiness is sealed (badges, agent gaps, pack validation, evidence-path report).
- This is a change to a proposal, not to a decision. It needs explicit PO approval (D-3).

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Two sources of truth (`is_core` vs class) drift | 3a derived mirror; quality rule "class and `is_core` disagree" (fail); readiness consistency check (§7) |
| A legacy reader keeps reading `is_core` with old meaning | Inventory in §1 becomes a checklist; source test asserting every `is_core` reader is either legacy-v1-only or class-aware (like the existing allowlist test in `eng1-p2-inactive.e2e.ts`) |
| Breaking the frozen legacy constraint set | Schema-versioned constraint sets (§6.4); the existing equivalence proof stays green |
| A PO default presented as SME judgement (C-1) | `source_kind` per row; UI and reports show the source; only `sme` rows can be described as expert-validated |
| Supporting skill becomes a blocker by mistake | Refusal rules at rule-set creation/approval (§7) + DB check |
| Learner sees a class before approval | Same gate as D-111: shown only when the classification set is approved and active |
| Multi-track taxonomy mismatch (a Data/BI SME may not use Must/Core/Supporting) | Closed taxonomy vocabulary with a version id; a new taxonomy is an extension-register item. **Unsupported assumption:** no Data/BI track exists in the repository (`data/career/tracks/` has only `trk_frontend_junior`), so no Data/BI taxonomy can be validated now |
| Scope creep into P6 | Classification sets are born inactive; activation follows the same sealed path as readiness |

---

## 9. Recommendation

**P-3 with sub-option 3a (derived `is_core` mirror) and schema-versioned pack constraints.**

**Why:**
- It is the only option that keeps the SME's three classes without bending activity design (Task B) or mislabelling Must skills.
- It is additive and backward compatible: the 0.2.1 pack, its tests, `verify-docs`, history and APIs are unchanged.
- It scales to future tracks through per-track sets and a versioned taxonomy.

**P-1 is the fallback:** a valid short-term choice for the Junior Frontend pilot only, at the cost of the Must/Core distinction in data. **P-2 is not recommended:** it produces learner-visible misclassification and bent activity design.

**Sequencing:** P-3 is **not** a prerequisite for sending the SME package or for any SME answer. It is needed before the candidate pack is published (it lands together with CHG-017 and the new pack format).

---

## 10. Exact proposed changes (proposal text only; nothing applied)

### 10.1 CHG-017

| Item | Proposed change |
|---|---|
| CR-1 | "Must / Core / Supporting … carried by a **versioned professional skill classification** (governed, per role/track, with source per skill); the readiness rule set is validated against it" (replaces "the readiness rule set is the authoritative carrier") |
| CR-8 | "Track counts follow a governed, track-scoped pack-constraint version **under constraint schema v2 (class-based)**; legacy `is_core` constraints remain for v1 packs" |
| **CR-12 (new)** | "A professional classification is shown, or used to generate gaps, only when approved by a named SME and activated by the PO. A Supporting skill never becomes a readiness blocker. A PO-default class is never presented as an expert decision" |
| SRS amendments at publication | FR-P-012 (binary Core/مساند → three classes); §3.1 (pack description); OD-2 (the five-skill set is superseded explicitly by CHG-017, not silently) |

### 10.2 Pack constraints

- `pack_constraint_set.schema_version`.
- Enum values `must_skill_count`, `core_class_skill_count`, `activity_required_primary_skill_count`.
- Per-schema completeness in `assertPackConstraintsSane`.
- A track-scoped v2 set `trk_frontend_junior_constraints` v1 (draft → four eyes → activator).
- The global v1 baseline is untouched.

### 10.3 Documentation verification (`scripts/verify-docs.mjs`)

- For a v1 canonical pack: unchanged (exactly 5 `is_core_for_role`).
- For a v2 canonical pack, at publication and in the same commit as CHG-017:
  - the counts per class equal the SRS statement;
  - every Must and Core skill has an evidence path;
  - no Supporting skill appears in a blocking readiness rule of the shipped configuration;
  - `is_core_for_role` (if present) equals class ∈ {must, core}.

### 10.4 Extension register

- **EXT-3 (proposed):** "Professional skill classification (taxonomy `must_core_supporting@1`)".
- **Expert criterion:** C2 / SME-17 / SME-19 / SME-20.
- **Why no supported type fits:** `is_core` is binary and carries legacy pack-shape constraints.
- **Proposed extension:** §6.
- **Status:** "proposed — not built".
- Plus the constraint-schema v2 types as part of the same entry.

### 10.5 Required regression tests (when implemented)

1. **Equivalence:** the 0.2.1 v1 pack validates exactly as today (existing proof stays green); `verify-docs` unchanged.
2. A v2 pack with Must 6 / Core 3 / Supporting 3 and Task B primaries (code_reading, debugging, js) **passes** under a v2 set; the same pack under the v1 set is **refused** (no fallback).
3. A v1 set and a v2 set coexist; an active v1 set stays immutable and valid; a v2 set missing a v2 type is refused.
4. The classification set lifecycle: draft → SME approval (named) → PO activation (four eyes); refused in production before P6 if sealed; immutable once active; one active per role.
5. `source_kind`: a `po_default` row is never shown as expert-validated.
6. **Readiness consistency:** a set missing a Must `non_compensable_skill` rule or a Core `required_skill_at_level` rule is refused. A blocking rule naming a Supporting skill is refused. `all_core_skills_at_level` is refused in a classified role.
7. Badges: `must` / `core` / `supporting` only when approved and active; pending otherwise; old clients still receive `isCore`.
8. Derived mirror (3a): `is_core` equals class ∈ {must, core}; Track Builder refuses direct `is_core` edits for a classified role; snapshots carry both.
9. Agent profile gaps are generated for Must ∪ Core (not Supporting) in a classified role.
10. History: evaluations, decisions, evidence, claims and readiness snapshots are byte-identical before and after (read-only audit).
11. Tenant and RLS: learners read their role's active classification only; no client writes.
12. Migration round-trip in `scripts/db-test.sh` (up → down → up) and a rollback that refuses while an active classification set exists.

---

## 11. Decisions requiring Product Owner approval

| # | Decision | Options |
|---|---|---|
| **D-1** | DM-7b representation | **P-3 (recommended)** · P-1 (fallback) · P-2 (not recommended) |
| D-2 | `is_core` under P-3 | **3a derived mirror (recommended)** · 3b frozen legacy |
| D-3 | Authority for Must/Core (C-3) | **Classification set, rule set checked against it (recommended)** · readiness rule set as carrier (decision pack §B as written) |
| D-4 | Supporting class of `forms_validation` and `requirements_reading` (C-1) | Keep as **PO defaults**, recorded with `source_kind = po_default` (no SME question is reopened) · other |
| D-5 | Junior Frontend v2 constraint values | Configure explicit counts (6 / 3; 2–3 required primaries) · derive class counts from the approved classification and configure only the per-activity range |
| D-6 | CHG-017 amendments (§10.1) and the EXT-3 register entry (§10.4) | approve / change / defer |
| D-7 | Authorization to implement P-3 (additive, inactive, development-only first) | yes / later |

**Stop.** No migration, code, policy, SRS or SME content was changed. Implementation awaits D-1…D-7.
