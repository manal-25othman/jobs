# نَقْلة / NAQLA — Junior Frontend v2: approval package

> **For decision. Nothing here is approved, sent to the SME, activated or published.**
> - CHG-017: 🟡 PROPOSED — exact text `docs/changes/CHG-017-PROPOSED.md` (CR-1…CR-15).
> - EXT-3: 🟡 proposed — built inactive — exact row in `EXPERT-RULE-EXTENSION-REGISTER.md`.
> - SME sign-off package (not sent): `docs/sme-candidate/junior-frontend/12-sme-signoff-package.md`.
> - Candidate: `data/candidates/trk_frontend_junior_v2/` (DRAFT, format 2, not importable). Decisions D-131…D-133.

## 1. What approving CHG-017 + EXT-3 would change (once applied with the v2 pack)

| # | Behaviour |
|---|---|
| B-1 | A classified role shows «إلزامية / أساسية / مساندة» with the source of each class; unclassified roles keep `is_core` exactly as today (CR-1, CR-12) |
| B-2 | Format-2 packs are checked against a track-scoped schema-2 constraint version; format-1 packs and the global set are unchanged (CR-8) |
| B-3 | A readiness rule set for a classified role must agree with the classification, or it is refused and never reaches a verdict (CR-1, CR-12) |
| B-4 | Agent gaps = Must ∪ Core; Supporting never blocks; PO defaults are never shown as expert decisions (CR-12) |
| B-5 | OD-2 is superseded explicitly for v2: 6 Must · 3 Core · 3 Supporting (CR-13) |
| B-6 | Undecided expert values are empty + `TBD`, never numbers (CR-14) |
| B-7 | A classified role, its requirements or its classification cannot be approved, published or activated while a requirement references a superseded, retired or learner-invisible skill (CR-15, Q25) — **already enforced in development** for classified roles; legacy roles unchanged |
| B-8 | The integrated assessment has its own code (CR-6, J-7) |

## 2. Applied by PO direction in this round (D-133)

| Direction | Done |
|---|---|
| J-7 · INT changed identity | New code `act_fe_integrated_leave_requests@0.1.0` (`derived_from` the 0.2.1 activity). The original `act_fe_build_interface@0.1.0` is untouched — in the v1 pack, in the database, with its evidence and resource links |
| J-7 · Task A / Task B | Codes kept; `0.2.0` is ordered above every existing version (checked against the database); nothing overwritten |
| Forms resource | `lr_html_forms_mdn` practises in Task A **for the v2 pack only** (`resource_links.json`); the global registry and every legacy link unchanged. INT's API-state and UI-state resources follow it under its new code |
| Forms criterion | Kept DRAFT, Supporting, non-mandatory, `TBD`; Task A's brief now states what it assesses; offered to the SME under S4 |
| Publication safety | Q25's query now also gates review approvals/publication of classified roles and requirements, and classification approval/activation |

## 3. Remaining Product Owner approvals

1. **CHG-017** — approve / change / defer the consolidated text (CR-1…CR-15).
2. **EXT-3** — approve / change / defer the register row.
3. **S13 with the SME** — verification level read by readiness (V-a / V-b / V-c).
4. **Sending the SME package** (`12-sme-signoff-package.md`) — when you decide; not sent.
5. **Later, separately:** governed publication of the v2 pack, its schema-2 constraint version and its classification version; P6.
6. **Optional:** extend the CR-15 gate to legacy (unclassified) roles. Not done — it would change legacy behaviour; Q25 already reports such states.

## 4. SME items

- **Already answered (not asked again):** C1–C5, F1–F5, SME-06…12, SME-16, SME-25, SME-54 — see package §أولًا.
- **PO defaults (not expert decisions):** Forms validation and Requirements reading as Supporting; activity codes; resource links; publication rules.
- **Need the SME's validation (S1–S13), with unapproved starting proposals where justified:** task texts (S1–S3, S2 now with one added sentence), criteria incl. the new Forms criterion (S4), path wording (S5), distinctness (S6), Git minimum (S7: proposal 2 commits, 2–5 sentence PR), pass rule (S8: proposal PR-2), borderline routing (S9: level-based), durations (S10: 150/60/60), thresholds/weights/descriptors (S11: "met" for every skill criterion, equal weights), calibration method (S12: 2 anchors, 80 % agreement, 20 % double review), S13 with the PO.
