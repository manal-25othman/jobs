# نَقْلة / NAQLA — Product Owner approval summary: CHG-017 (DM-7b amendments) and EXT-3

> **Status:** for the Product Owner's decision. **Neither proposal is approved by this document.** CHG-017 stays 🟡 PROPOSED (`docs/changes/CHG-017-DM7B-AMENDMENTS-PROPOSED.md`); EXT-3 stays 🟡 "proposed — built inactive (development only)" (`EXPERT-RULE-EXTENSION-REGISTER.md`).
> **Reviewed against:** the code at the commit that adds this file (P-3 from `c668a26`, the Junior Frontend v2 candidate, the alias fix).

## 1. What approval would change (exact behaviour)

| # | Today (approved behaviour) | After approval + publication of the v2 pack |
|---|---|---|
| B-1 | A track skill is «أساسية» or «مساندة» from the binary `is_core` (FR-P-012) | For a role with an approved, **activated** classification version: «إلزامية / أساسية / مساندة» with the source of each class. Roles without one keep `is_core` exactly as today |
| B-2 | Pack counts come from the global legacy set (`core_skill_count` 4–5, `activity_core_primary_skill_count` 2–3) | A **format-2** pack is checked against a track-scoped **schema-2** set (Must/Core/Supporting counts; 2–3 Must ∪ Core primaries per activity). Format-1 packs and the global set are unchanged; no fallback either way |
| B-3 | Readiness rules are free-standing | A rule set for a classified role is refused at approval/activation (and never reaches a verdict) unless every Must is non-compensable, every Core is required, no Supporting skill blocks and no `is_core` aggregate is used. Classification alone grants nothing |
| B-4 | Agent profile gaps = `is_core` skills | Gaps = Must ∪ Core for a classified role (Must worded «مهارة إلزامية للدور»); Supporting is never a gap |
| B-5 | Track Builder edits `is_core` | For a classified role, `is_core` is not edited; a class changes only by a new classification version (SME, + PO for PO defaults) |
| B-6 | OD-2 (five core skills) governs Junior Frontend | Superseded **explicitly** for the v2 pack: 6 Must · 3 Core · 3 Supporting (CR-13); v1 packs keep OD-2 |
| B-7 | `verify-docs` checks 5 `is_core` skills | For a format-2 canonical pack: class counts equal the SRS, every Must/Core has an evidence path, no Supporting blocker, no `is_core_for_role` (applied in the same commit as publication) |
| B-8 | — | Format-2 pack contract: an SME value not yet set is `null` + `TBD`, never a number (weights, thresholds, level descriptors, durations, pass threshold) — validator-enforced |

Already in force today, independent of this approval (development code, no policy change): readiness rules name **canonical** skills — an alias is refused at creation, and a skill merged after approval is read as its canonical skill at approval, activation and evaluation (OPEN-039 consistency; regression-tested).

## 2. Review findings on the proposals

| Finding | Recommendation |
|---|---|
| R-1 CR-1/CR-8/CR-12/CR-13 match the implementation (0034, validators, readers) | No change |
| R-2 B-8 (TBD = null in format 2) is implemented but not stated in CHG-017 | Add as **CR-14** (proposed): "In a format-2 pack, an SME value that is not yet decided is recorded as undecided (null, TBD), never as a number" |
| R-3 The candidate keeps the 0.2.1 activity **codes** (new versions) | J-7 to confirm; new codes would need the global learning-resource mapping changed at publication |
| R-4 EXT-3 row describes 0034 accurately; it does not mention pack format 2 or the TBD rule | Add both to the EXT-3 "Proposed extension" cell when approving |
| R-5 `skl_forms_validation` (PO default) has no criterion in the v2 candidate | Content decision (S4 / PO); it does not block, so it does not affect approval |

## 3. Risks

| Risk | Mitigation in place | Residual |
|---|---|---|
| Two PO-default classes presented as expert decisions | `po_default` in data, PO's named approval required, UI note «تصنيف افتراضي من مالك المنتج، غير معتمد من الخبراء», `expertApproved = false` | None if CR-12 is kept |
| `is_core` and the class diverging | No mirror; readers are version-aware; Track Builder refuses `is_core` edits for a classified role | Old clients read `isCore`, which keeps its legacy meaning |
| A Must skill silently bypassed | Readiness consistency at approval, activation and evaluation; inconsistent ⇒ no verdict | Needs DM-2 / S13 before any rule set exists |
| Production exposure | No production state exists for classifications or schema-2 sets; development activation needs a transaction-local opt-in | A production state needs a migration and P6 |
| Calibration values guessed | Validator refuses numbers for TBD values | S7–S12 still open |

## 4. Approvals requested (none is implied)

1. **CHG-017** with CR-1, CR-8, CR-12, CR-13 as proposed, plus **CR-14** (R-2) — approve / change / defer.
2. **EXT-3** register row, with the R-4 additions — approve / change / defer.
3. **J-7**: keep the 0.2.1 activity codes as new versions (candidate) or move to new codes.
4. **Publication path** (later, separately): the v2 pack, its schema-2 constraint version and the classification version, each through its own governed lifecycle — not requested now.

Not requested: any threshold, weight, level, readiness rule set, verification or claims policy, activation, publication or P6.
