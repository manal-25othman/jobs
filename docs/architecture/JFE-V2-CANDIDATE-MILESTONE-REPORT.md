# نَقْلة / NAQLA — Junior Frontend v2 candidate milestone report (D-131)

> **Scope:** a DRAFT Junior Frontend v2 pack from the recorded SME decisions, two implementation gaps closed, governance summary. **Development only.**
> Nothing is approved, activated, published, deployed or imported. No P6. No new SME question.

## 1. What was implemented

| Task | Delivered |
|---|---|
| 1 · v2 candidate content | `data/candidates/trk_frontend_junior_v2/` — pack format 2 (`trk_frontend_junior@0.3.0-candidate.1`), explicit per-skill evidence paths (EXT-2 params, text only), schema-2 constraint values (text only), generated `COVERAGE.md`, `README.md`. Reuses the canonical global registry (no copied registry, no new skill) |
| 1 · validation | Validator support for undecided SME values in format 2 (`null` + `TBD`, never a number; durations listed as unresolved); format-2 evidence-path rule (a path needing *n* distinct tasks needs *n* measuring activities); `career-data candidate-validate` (no database); `loadPack(…, globalRoot)` |
| 1 · dry run | The real pipeline dry run passes under a development schema-2 set built from the candidate constraints; the import is refused; nothing is written (e2e) |
| 2.1 · alias handling | One canonical-skill lookup used at rule creation (an alias is refused, naming the canonical skill), approval/activation (consistency check) and evaluation (rules and classification entries read as canonical skills) |
| 2.2 · browser | B14: v2 learner labels, PO-default provenance, skill detail, 375/1280 px accessibility, admin Track Builder (read-only class with source, notice, no `is_core` edit), legacy labels back when off |
| 3 · governance | `PO-APPROVAL-SUMMARY-CHG-017-EXT-3.md` — behaviour changes, review findings, risks, approvals requested. Neither proposal approved |

Also: admin Track Builder shows a "classification in effect (development only)" notice and omits `is_core` from the proposal editor of a classified track; learner disclaimer names the three classes; `verify-docs` §6 keeps the candidate draft / format 2 / NOT SME APPROVED / no copied registry.

## 2. Candidate coverage

12 skills (the same as 0.2.1): **6 Must** (HTML, CSS, JS, Debugging, Code Reading, Git) · **3 Core** (UI state, API states, Accessibility) · **3 Supporting** (Explanation — SME-25; Forms validation and Requirements reading — **PO defaults**). Three activities (new versions 0.2.0 of the 0.2.1 codes), 12 tasks (+ `tsk_fe_version_control_flow`), 27 criteria (24 skill + 3 gates).

| Activity | Primaries (all Must ∪ Core) | Validation activity |
|---|---|---|
| INT `act_fe_build_interface` | CSS, API states, Debugging | no (the integrated assessment) |
| Task A `act_fe_debug_improve` | HTML, CSS, JS | yes |
| **Task B** `act_fe_change_request` | **Code Reading, Debugging, JS** — valid under v2; refused under v1 (1 `is_core` primary) | yes |

Every Must and Core skill has an explicit path (P-HTML, P-CSS, P-JS, P-DBG, P-READ, P-GIT, P-UI, P-API, P-A11Y; 2 distinct tasks except Git and Accessibility, 1). See the candidate `README.md` and `COVERAGE.md`.

**Git is now covered:** P-GIT = INT `git_workflow` (G-1 branch, G-2 small described commits, G-3 PR with what/why, G-4 explained changes), human-reviewed at the declared SHA, one inspected project (F4), **no commit-count minimum** (S7), no fourth activity.

## 3. Test results (fresh database)

| Suite | Result |
|---|---|
| Domain unit | 438 / 438 (+2 alias tests) |
| Config · agents · app unit | 9 / 9 · 147 / 147 · 26 / 26 |
| Agent evaluation | 30 / 30 |
| `npm run verify` | pass |
| `career-data candidate-validate` | VALID (draft; not imported) |
| API e2e (all suites, sequential) | **323 / 323** (new: candidate 10, alias 3) |
| DB proofs `scripts/db-test.sh` | all pass (321 PASS lines) |
| Rollback rehearsal | pass (0034 rollback refused with classification history present) |
| Browser acceptance | see §3a |

The alias regression test fails without the runtime mapping and passes with it (checked).

### 3a. Browser

**90 / 90** (78 existing + 12 new B14). B14a–i: every visible skill row shows its candidate class in Arabic (six «إلزامية»); exactly the PO-default classes carry «تصنيف افتراضي من مالك المنتج، غير معتمد من الخبراء»; the Git and Requirements-reading detail pages; no Verified / percentage / readiness verdict implied; 375 and 1280 px accessibility; admin Track Builder notice, six «إلزامية · قرار خبير» and two PO-default chips, proposal editor without `is_core` (7 of 8 fields), admin accessibility; legacy labels back and no admin chips once the classification is off; nothing left active.

Observation (pre-existing, not v2): after the full API e2e run, the demo `skl_forms_validation` row is `superseded` by the promotion suite, so graduate visibility hides that one skill (11 rows; the legacy view hides it identically). The PO-default note is therefore verified in the browser on Requirements reading; the API e2e checks the class and provenance of every visible skill.

## 4. Remaining SME calibration questions (already in the final package; no new question)

S1 INT text, planted bug and brief/API conflict · S2 Task A text and faults · S3 Task B text and fault · S4 criteria, skill mapping and proposed mandatory flags · S5 path wording · S6 distinctness of the three activities · S7 Git minimum described commits and PR description · S8 integrated pass rule (PR-1 / PR-2, and its threshold) · S9 borderline band · S10 durations · S11 weights, thresholds and level descriptors (calibration session) · S12 calibration method (anchors, agreement, double-review sample) · S13 (with the PO) verification level read by readiness (V-a / V-b / V-c).

## 5. Product Owner approvals still needed

CHG-017 (CR-1, CR-8, CR-12, CR-13, + proposed CR-14) · EXT-3 row (+ format 2 / TBD rule) · J-7 activity codes · DM-2 / S13 with the SME · later, the governed publication of the v2 pack, its schema-2 constraint version and the classification version · P6 (not started).

## 6. What remains inactive

The candidate (not imported; format-2 import refused) · every classification and schema-2 set (test fixtures only, left inactive) · readiness rule sets for the track (none created) · verification, readiness and claims policies (unchanged) · production (no state exists) · P6.

---

## 7. Final candidate review (D-132)

| Item | Result |
|---|---|
| Forms validation criterion | Task A `form_submission_flow` (Supporting, non-mandatory, human, `TBD`, no evidence path), from the registry indicators; distinct from the JS and accessibility criteria. All 12 skills are now measured (28 criteria: 25 skill + 3 gates). Pending SME S4 |
| Browser visibility (11 of 12) | **Rule, proven:** `graduate_content_visible` (0024) never shows a superseded demo row. The career-data suite runs the real OPEN-040 promotion of the demo `skl_forms_validation`; completing it supersedes the demo row while the demo role still points at it. Reproduced on an own fixture (`track-visibility.e2e.ts`) and made loud by **Q25**. Isolated browser run on a freshly built database: **12 of 12** visible, Forms included (B14, 14/14). Post-e2e database: 11 of 12, the hidden one exactly as the rule predicts (91/91) |
| J-7 | Task A and Task B keep their identity and codes; **INT materially changed** → PO decision requested (PO-3). New versions only; links and history checked |
| Advisory | `lr_html_forms_mdn` practises in INT, which no longer measures Forms → repoint at publication (PO-4) |
| Governance | `PO-APPROVAL-SUMMARY-CHG-017-EXT-3.md` is now the approval package; CR-14 added to the CHG-017 proposal; EXT-3 row covers pack format 2 and the unresolved-value rule. Nothing approved |

Focused tests: candidate suite 12/12 · visibility 2/2 · browser B14 isolated 14/14 · full browser on the post-e2e database 91/91 · targeted API suites on a freshly built database 80/80 (career-data, pack-constraints, DM-7b, candidate, alias, visibility, readiness, track-admin) · `npm run verify` pass.
