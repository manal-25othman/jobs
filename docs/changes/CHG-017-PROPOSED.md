# `CHG-017` — Junior Frontend v2: professional classification, evidence paths and readiness (consolidated text)

> **Status:** 🟡 **PROPOSED — not approved, not applied.** For the Product Owner's review (D-133).
> **Supersedes as the text for review:** decision pack §I.3 (CR-1…CR-10), PO decision sheet §4 (CR-11) and `CHG-017-DM7B-AMENDMENTS-PROPOSED.md` (CR-1/CR-8 amendments, CR-12…CR-14). Those stay as the record of how the text was reached.
> **Approver:** Product Owner (R-1). Approving the text changes nothing until it is applied to SRS-001 together with the publication of the Junior Frontend v2 pack, with `scripts/verify-docs.mjs` updated in the same commit.

## 1. Mandatory fields

| Field | Value |
|---|---|
| `Change ID` | `CHG-017` |
| Type | Functional requirements change (track content model, readiness semantics) |
| Reason | SME-JFE-01's decisions (SRC-A/B/C, C1–C5, F1–F5, SME-06…12, SME-25) cannot be expressed by the binary `is_core` model, and the PO decisions D-1…D-7 on DM-7b (D-130) adopt a versioned professional classification |
| Impact | SRS-001 FR-P-012, §3.1, OD-2; the Junior Frontend pack (format 2, `trk_frontend_junior@0.3.0`); `verify-docs`; extension EXT-3 |
| Traceability | One forward row per CR; OD-2 marked superseded for the v2 pack; version bump at application |
| Approval | Product Owner (R-1) |

## 2. Requirements (exact text)

| CR | Requirement | Basis |
|---|---|---|
| **CR-1** | Each skill of a track is **Must**, **Core** or **Supporting** (C2). The class is carried by a **versioned professional skill classification** per role, recording the source of every class (a named SME decision or a Product Owner default). The **readiness rule set** carries the required levels and pass conditions and is validated against the classification. A classification alone never grants readiness. | C2, D-1, D-3 |
| **CR-2** | Professional proficiency is not a verification level. Configuration never assigns a level. The verification ladder is unchanged. | Invariant |
| **CR-3** | Readiness = every Must skill at its approved level + every Core skill at its approved Junior minimum + the integrated assessment passed. Never a percentage or a count. BR-024 is unchanged. | C5, SME-16, SME-54 |
| **CR-4** | Git is assessed in practice. **One project suffices** when branch, commits and pull request are observed by a reviewer at the declared commit and the changes are explained. A link alone is not evidence. | C1, F4 |
| **CR-5** | Evidence is gathered through **per-skill, versioned evidence paths**. Where a path needs more than one task, the tasks are independent (purpose, variant family, own criterion, authorized basis, no reused artifact, resubmissions count once). There is no universal two-activity minimum. | C3, F3 |
| **CR-6** | The **integrated assessment** is a readiness condition. Only a standing, accepted result on an approved, non-demo version counts. It is identified by its own activity code. | C5, J-7 |
| **CR-7** | Understanding of submitted code is required of every graduate, through the evidence path. There is no universal live-modification round and no AI-specific challenge. Disclosure never disadvantages (BR-025 unchanged). | F2, F3 |
| **CR-8** | The track's counts follow a governed, track-scoped pack-constraint version under **constraint schema 2 (class-based)**: Must / Core / Supporting counts, and "an activity measures 2–3 Must or Core skills deeply". The legacy `is_core` constraints stay in force, unchanged, for format-1 packs. **Three activities are kept.** Amends §3.1 and OD-2. | F5, D-2, D-7 |
| **CR-9** | Human review is the interim authorized basis and, once an automated basis is approved, the exception mechanism. It is not a permanent requirement. | C4 |
| **CR-10** | Each skill assessed in a shared activity has its own criterion and its own result. | F1 |
| **CR-11** | Verification-level requirements and job-readiness requirements are configured separately. A level never derives from readiness (BR-024) and readiness never assigns a level. | D-128 |
| **CR-12** | A professional class is shown to a learner, or used to generate gaps, only when its classification version is approved by a named SME (plus the Product Owner where it carries Product Owner defaults) and activated. A Supporting skill is never a readiness blocker. A Product Owner default is never presented as an expert decision. | D-3, D-4 |
| **CR-13** | Junior Frontend v2 is **6 Must · 3 Core · 3 Supporting**. These are the numbers of this track's constraint version, not a rule for other tracks. | D-5 |
| **CR-14** | In a pack of format 2, an expert value that is not yet decided (criterion weight, skill threshold, level descriptors, pass threshold and pass rule, activity duration) is recorded as **undecided** — empty, with status `TBD`, and for a duration listed with the decision it waits for — never as a number. A pack never declares such a value approved; approval is a named SME's act recorded in the database. | D-037, OPEN-043 |
| **CR-15** | A professionally classified role, its requirements and its classification are never approved, published or activated while a role requirement references a skill that is superseded, rejected, retired or not visible to learners. The state is reported by data-quality rule Q25 and is resolved by a governed change (promote the role, or replace the requirement), never by a silent repoint. | D-133 |

## 3. SRS amendments at application

| Location | Today | After |
|---|---|---|
| FR-P-012 | Binary «أساسية / مساندة» classification of a track skill | Three classes «إلزامية / أساسية / مساندة», each with its provenance; a pending classification is shown as pending (CR-1, CR-12) |
| §3.1 | Five core skills (`is_core_for_role`); three activities | Pack format 2: `professional_class` + `class_source` + `class_source_ref` per role skill; counts from the track's schema-2 constraint version; three activities, one of them the integrated assessment under its own code (CR-6, CR-8, CR-13) |
| OD-2 | The five-skill core set | Superseded **explicitly** for the Junior Frontend v2 pack; format-1 packs keep OD-2 |

## 4. `verify-docs` at application

- Format-1 canonical pack: unchanged (exactly five `is_core_for_role`).
- Format-2 canonical pack: class counts equal the SRS statement; every Must and Core skill has an evidence path; no Supporting skill in a blocking readiness rule of the shipped configuration; no `is_core_for_role`; no SME value declared approved by the pack; Q25 reports nothing for the role.

## 5. Not part of this change

Any threshold, weight, level descriptor, duration or pass rule (SME S7–S12); the verification level read by readiness (S13); any readiness rule set, verification or claims policy; activation; publication; P6.
