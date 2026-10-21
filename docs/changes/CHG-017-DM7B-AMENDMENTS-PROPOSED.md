# `CHG-017` — DM-7b amendments (P-3 professional classification)

> **Status:** 🟡 **PROPOSED — not approved, not applied** (D-130, decision D-6).
> **Base text:** CHG-017 CR-1…CR-10 in `docs/architecture/NAQLA-JUNIOR-FRONTEND-SME-REVISED-DECISION-PACK.md` §I.3 (itself proposed).
> **Approver:** Product Owner. Nothing here changes the canonical SRS, the shipped pack, `scripts/verify-docs.mjs` or any live policy until the PO approves CHG-017 and the Junior Frontend v2 pack is published (both outside this change).
> **Source of the design:** `docs/architecture/DM-7B-P3-ARCHITECTURE-ANALYSIS.md` §10.1; the PO decision D-1…D-7 (D-130).

---

## 1. Proposed amendments to CHG-017

| CR | Proposed text | Change from the §I.3 draft | Basis |
|---|---|---|---|
| **CR-1** (amended) | Must / Core / Supporting classification and semantics (C2) are carried by a **versioned professional skill classification**, per role, with the source of every class (named SME decision or Product Owner default). The **readiness rule set** carries the required levels and pass conditions, and is validated against the classification. A classification alone never grants readiness. | Replaces "the readiness rule set is the authoritative carrier" | D-1, D-3 |
| **CR-8** (amended) | The P1 Frontend track's counts follow a governed, track-scoped pack-constraint version under **constraint schema 2 (class-based)**: Must / Core / Supporting counts and "an activity measures 2–3 Must or Core skills deeply". The legacy `is_core` constraints stay in force, unchanged, for format-1 packs. **3 activities kept.** Amends §3.1 and OD-2. | Names the constraint schema; keeps the legacy set for v1 | D-2, D-7 |
| **CR-12** (new) | A professional class is shown to a learner, or used to generate gaps, only when its classification version is approved by a named SME (plus the Product Owner where it carries PO defaults) and activated. A Supporting skill is never a readiness blocker. A Product Owner default is never presented as an expert decision. | New | D-3, D-4 |
| **CR-13** (new) | The Junior Frontend v2 classification is **6 Must · 3 Core · 3 Supporting**. These are the numbers of this track's constraint version, not a rule for other tracks. | New | D-5 |
| **CR-14** (new) | In a pack of format 2, an expert value that is not yet decided (criterion weight, skill threshold, level descriptors, pass threshold and pass rule, activity duration) is recorded as **undecided** — empty, with status `TBD`, and for a duration listed with the decision it waits for — **never as a number**. A pack never declares such a value approved; approval is a named SME's act recorded in the database (OPEN-043). | New (review finding R-2, D-131) | D-037, OPEN-043 |

## 2. SRS amendments at publication (proposed text, not applied)

| Location | Today | Proposed |
|---|---|---|
| FR-P-012 | Binary "أساسية / مساندة" classification of a track skill | Three classes: «إلزامية» (Must) · «أساسية» (Core) · «مساندة» (Supporting), each with its provenance; a pending classification is shown as pending |
| §3.1 (pack description) | Five core skills (`is_core_for_role`) | Format-2 pack: `professional_class` + `class_source` + `class_source_ref` per role skill; counts from the track's schema-2 constraint version |
| OD-2 | The five-skill core set | Superseded **explicitly** by CHG-017 for the Junior Frontend v2 pack; v1 packs keep OD-2 |

## 3. `scripts/verify-docs.mjs` at publication (proposed, not applied)

- Format-1 canonical pack: unchanged (exactly 5 `is_core_for_role`).
- Format-2 canonical pack, in the same commit as CHG-017's application: counts per class equal the SRS statement; every Must and Core skill has an evidence path; no Supporting skill in a blocking readiness rule of the shipped configuration; no `is_core_for_role` in the pack.

## 4. Classification of the Supporting skills (provenance, unchanged)

| Skill | Class | Source | Note |
|---|---|---|---|
| `skl_technical_explanation` | Supporting | SME (SME-25) | "decision clarity does not block" |
| `skl_forms_validation` | Supporting | **PO default** | SME silent (decision pack §B) — not an expert decision |
| `skl_requirements_reading` | Supporting | **PO default** | SME silent (decision pack §B) — not an expert decision |

The two PO defaults stay labelled as such in data (`source_kind = po_default`), in the learner interface, and in this text. They are not activated as expert-approved anywhere.

## 5. What approving this change would and would not do

- **Would:** allow the Junior Frontend v2 pack, its schema-2 constraint version and its classification version to be published through their governed lifecycles, and `verify-docs` to check them.
- **Would not:** approve any threshold, level, readiness rule set, verification policy, claim policy or content; start P6; activate anything in production.
