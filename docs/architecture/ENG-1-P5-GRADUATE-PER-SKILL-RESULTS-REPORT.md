# نَقْلة / NAQLA — Post-P3: Graduate Per-Skill Results (P5, development-only) and Readiness Design (P4) — Report

**Date:** 2026-10-12 · **Scope:** the Product Owner's request "Post-P3: Graduate Per-Skill Results and Readiness Design".
- **Track A:** P5, the graduate UI.
- **Track B:** P4, design only.
- **PO decisions 1–3.**

**Status:** implemented (P5) and designed (P4). **Waiting for Product Owner approval.**

**Restrictions held:**
- No verification policy was activated.
- The per-skill pathway stays development-only and inactive at rest. The P3 test-only activation controls are unchanged: the 0029 seal and the `naqla.per_skill_dev_activation` opt-in.
- No readiness policy was changed and no rule set was created or published.
- No SME content was published. The SRS was not modified. Nothing was deployed. No LLM was used.
- Real users run under the legacy scope, so every response carries `skills: []` and the UI renders exactly as before.

---

## 1. Commits and changed files

| Commit | Content |
|---|---|
| `4979f08` | P5 API projection, UI, tests, browser acceptance, read-only audit script |
| *(this commit)* | This report · `ENG-1-P4-READINESS-EXT-2-DESIGN.md` · `docs/audits/claimed-skill-audit-e2e-2026-10-12.txt` · `docs/decisions/DECISIONS.md` (D-124) |

| Area | Files |
|---|---|
| API | `apps/api/src/slice1/evaluation.service.ts` (learner-safe `skills[]` in the view and the evaluate/finalise responses; criterion names) · `apps/api/src/slice1/activity-catalogue.service.ts` (My Work `latestSubmission.skills[]`) |
| UI | `apps/app/src/lib/journey.ts` (per-skill presentation rules) · `apps/app/src/lib/api.ts` (additive types) · `apps/app/src/app/evaluation/page.tsx` · `apps/app/src/app/work/page.tsx` |
| Tests | `apps/app/test/journey.test.ts` (+7) · `apps/api/test/eng1-p3-per-skill.e2e.ts` (P3-11 API/UI contract) · `apps/app/test/browser/journey.browser.mjs` (B11e, B13a–j, per-skill a11y) |
| Audit | `scripts/audit-claimed-skills.sql` (read-only) · `scripts/db-test.sh` (proves the audit changes nothing) |
| Evidence | `docs/pilot/ui-acceptance-p5/` (6 screenshots, `results.json`: 78/78) |

No migration. No domain rule changed (`DOMAIN_RULESET_VERSION` stays 0.20.0).

---

## 2. Track A — P5 graduate UI (development-only)

### What the graduate sees for a per-skill evaluation

**Evaluation page (`/evaluation?submission=…`):**
- **Summary card.** The headline counts **recorded** level changes only, for example «تغيّر مستوى 1 من 2 مهارات». The body says that completing the activity is not satisfying every skill, and that the assessment result and the level change are separate things.
- **«نتيجة كل مهارة»** has one block per assessed skill, with two **separate** lines:
  - **نتيجة التقييم:** what the skill's own criteria showed;
  - **مستوى المهارة:** what the verification decision did to the level.
  - Under them, the skill's **own** criteria are listed by name, each with a status chip.
- **CV proposal link.** «اقتراح بند السيرة» is offered only for a skill whose level changed **and** whose evidence still stands. This is the existing proposals flow; claim policies still decide eligibility.
- **Unchanged parts.** The whole-activity criteria card, the human-review banner, the needs-completion card, the journey card and the assessment details are kept as they are. The legacy single-level banner and the attribution notice are replaced by the summary **only** when `skills[]` is non-empty.

**My Work (`/work`):**
- The latest attempt's line becomes «قُيِّمت آخر محاولة مهارةً مهارة: تغيّر مستوى N من M.».
- There is one chip per skill, for example «بنية HTML الدلالية: تغيّر المستوى» or «النماذج والتحقق من المدخلات: لم تُستوفَ معاييرها بعد».

### Learner wording (`apps/app/src/lib/journey.ts`)

| Outcome | Chip | Explanation |
|---|---|---|
| `met` | استوفت معاييرها | استوفى عملك كل معايير هذه المهارة كما قرّرها التقييم. |
| `not_met` | لم تُستوفَ معاييرها بعد | معيار واحد على الأقل … لم يُستوفَ في هذا العمل. هذه نتيجة هذا العمل وحده، ومستواك فيها لا ينزل. |
| `incomplete` (criteria awaiting a reviewer) | بانتظار المراجِع | يقرّر مراجِع مختص معايير هذه المهارة؛ تظهر نتيجتها حين يكتمل قراره. |
| `incomplete` (threshold not approved) | لم تُحسم — بانتظار اعتماد الخبراء | … حدّ الاستيفاء الخاص بها لم يعتمده الخبراء بعد … هذا ليس إخفاقًا. |
| `not_assessed` | لم تُقيَّم في هذا النشاط | لا يقيس هذا النشاط هذه المهارة بمعيار خاص بها … هذا ليس إخفاقًا، ومستواك فيها كما هو. |
| `blocked` | لم تُقيَّم — ينقص العمل ما يلزم | لم يكتمل فحص عام للعمل كله … هذا ليس حكمًا على المهارة. |

| Level line | When it is shown |
|---|---|
| تغيّر المستوى: X ← Y | The decision moved the level **and** recorded evidence that still stands (Practiced or Demonstrated only; Verified is never shown) |
| سُجِّل مستوى «Y» ثم سُحب دليله | The same, but the evidence was withdrawn. No CV proposal is offered |
| أُعيد تثبيت دليل مستواك «Y» | `evidence_reestablished` |
| المستوى بانتظار تحقق مستقل | `assessment_pending_validation` |
| لا يُحسم المستوى قبل اكتمال المراجعة | Criteria still awaiting a reviewer |
| لم يتغيّر المستوى بهذا التقييم (Y) | Anything else |

### Requirement checklist

| Requirement | How it is met |
|---|---|
| Frozen visual design | Only existing classes (`card`, `rows`, `stack`, `chip--*`, `body-sm`, `micro`, `disclaimer`, `link`). No new CSS or tokens |
| Legacy single-skill evaluations | Rendered unchanged when `skills` is absent or empty. Browser B11e proves it; B7/B11/B12 are unchanged and passing |
| Each skill independently | One block per skill with only its own criteria (B13e) |
| Outcome distinct from level change | Two labelled lines per skill (B13c) |
| `not_assessed` is not failure; no achievement inferred from completion | Wording table above; unit tests assert there is no failure vocabulary; the summary counts recorded decisions only |
| No unapproved readiness claims | Nothing readiness-related was added; readiness still shows its pending headline |
| Uses the additive `skills[]` | Yes. The UI derives nothing from `outcome` / `totalScore` |
| No reviewer-only rubric, hidden tests, planted bugs, personal data or internal security information | The API projection was narrowed (next table). The UI shows criterion **names** only (already visible in the human-review list). B13d asserts that no threshold numbers, `per_skill@`, "basis" or descriptor text reach the page |
| Honest empty/loading/error states, accessibility | The existing states are unchanged. B13-a11y at 375 px and 1280 px: RTL, Arabic, labelled controls, named links, no horizontal scroll. Each skill block is an `article` labelled by its `h3` |
| P3 test-only activation controls unchanged | No change to 0029, the policies or the opt-in. The harness uses the opt-in and restores the safety baseline (B13j) |

### API change (narrowing the P3 response before any UI used it)

`skills[]` now carries only learner-safe fields:
- skill identity and label;
- `outcome`, `currentState`, `proposedState`, `basisIndependentlyVerified`;
- the rubric version and its resolution;
- `criteria[]`: `{key, nameAr, status, score, maxScore, evaluatorKind}`;
- `decision`: `{decision, previousState, resultingState}`;
- `evidence`: `{id, withdrawn}`.

**Removed from the response** (still stored in the database for audit):
- `threshold` and `thresholdStatus`;
- `basisReasons`;
- the internal `reason` strings, which carry the model version, policy key and skill ids.

The evaluate and finalise responses use the same projection. My Work gains `latestSubmission.skills[]`: `{skillId, labelAr, outcome, decision, levelChanged}`.

All of this is still additive with respect to every legacy field, which test P3-9 proves.

### Tests

| Suite | Result | New coverage |
|---|---|---|
| App unit (`journey.test.ts`) | **25/25** (+7) | Outcome wording for all five outcomes, no failure vocabulary, level line only from decision + standing evidence, Verified never, withdrawn ⇒ no proposal, pending ⇒ undecided, summary counts, My Work chips |
| API e2e P3-11 (API/UI contract) | pass | Exact key set of each skill entry, criterion and decision; nothing forbidden in the evaluate or view payloads; pending-review interim result; My Work per-skill entries; not-evaluated work ⇒ none |
| Browser acceptance | **78/78** (was 65; +13) | B11e legacy unchanged · B13a pending review · B13b mixed HTML met / form validation not met · B13c two lines + summary · B13d no failure words or internals, never Verified · B13e own criteria only · B13f database agrees · B13-a11y 375/1280 · B13g My Work per skill · B13h withdrawn evidence · B13i unapproved thresholds ⇒ not decided, no level · B13j per-skill policy inactive again afterwards |

**Screenshots (`docs/pilot/ui-acceptance-p5/`):**
- `P5-evaluation-pending-review-desktop.png`
- `P5-evaluation-mixed-desktop.png`
- `P5-evaluation-mixed-mobile.png`
- `P5-my-work-per-skill-desktop.png`
- `P5-evaluation-withdrawn-desktop.png`
- `P5-evaluation-unapproved-thresholds-desktop.png`

---

## 3. Product Owner decisions

| Decision | Implementation |
|---|---|
| **1. Unclaimed measured skills** may only be internal, non-promotional observations | **Nothing records them today:** P3 assesses claimed skills only. If they are added later, they must use `claimed = false`, and `decideSkillAssessment` already returns `not_applicable` for unclaimed skills (no evidence, no transition). P4 counts only `claimed = true` (§2 T1 of the P4 spec). Claims (CLM-1) count only positive decisions with standing evidence, which unclaimed observations never have. The graduate UI shows only assessed claimed skills |
| **2. `exception_granted`** does not qualify a CV or LinkedIn claim | It stays excluded in `isPositiveVerificationDecision` (unit-tested since Phase A) and in the P4 spec (T4). No code path grants it today |
| **3. Read-only audit of pre-0028 claimed skills** | `scripts/audit-claimed-skills.sql`, results in §4 |

---

## 4. Historical claimed-skill audit (read-only)

**Method:**
- `begin transaction isolation level repeatable read read only; … rollback;` — PostgreSQL refuses any write, and nothing is created.
- Output is counts and opaque ids only.
- `scripts/db-test.sh` runs it and proves that the row counts are unchanged.

**Checks:**

| Check | Meaning |
|---|---|
| C1 | Claim owner ≠ submission owner |
| C2 | Claimed skill is not active or canonical today |
| C3 | Platform claim outside the activity mapping |
| C4 | More than one primary skill claimed (ambiguous under P0) |
| C5 | No decision for a claim although its result decides every claim (proxy for a late claim; claimed skills have no insertion timestamp) |
| C6 | Evidence on a claimed skill with no verification decision for that (result, skill) |

For each check, the impact is reported as: evidence earned, still standing, and skill claims resting on it.

**Results on the available databases.** No production or staging database is reachable from this environment. The audit must be run there by an operator, read-only, with the same command.

| Database | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|
| e2e database after the full suite (170 claims, 156 submissions; **test data**) | 0 | 0 | 0 | 6 claims / 3 submissions; **0 evidence** | 0 | 1 claim; 1 standing evidence; 0 claims resting |
| db-test fixture database | runs, changes nothing | | | | | |

**Interpretation:**
- **C4** comes from the P0 tests that deliberately claim two primary skills. P0 recorded no level for them (0 evidence), which is correct.
- **C6** is one evidence row inserted directly by an e2e fixture (`provenance_source = 'e2e fixture'`). It is test data, and it shows the check works.
- **An earlier draft of C5** flagged attributed legacy results, where other claimed skills have no decision by design. C5 was narrowed to results that decide every claim. This is recorded so the operator reads C5 correctly.
- **No anomaly was rewritten or deleted.** The P4 spec excludes C1–C3, C5 and C6 results from EXT-2 (`claim_anomaly`) and leaves history intact.

The full output is in `docs/audits/claimed-skill-audit-e2e-2026-10-12.txt`.

---

## 5. Track B — P4 and EXT-2 design

See `docs/architecture/ENG-1-P4-READINESS-EXT-2-DESIGN.md`. It covers, as requested:
- provenance and standing evidence (T1–T7);
- activity and task-variant independence (I-1…I-6, ENG-2 data);
- per-skill evidence requirements, including the SME-confirmed one-project Git exception (P-GIT `min_distinct_tasks = 1`, still subject to T1–T7);
- withdrawn and duplicate evidence;
- multi-skill evaluations with separate decisions;
- versioned rules (params validated against rubric versions; reports record the rule-set version and a fact snapshot);
- historical compatibility (a legacy adapter with explicit exclusion reasons; stored reports never recomputed);
- fail-closed behaviour;
- the audit output;
- a security and audit test matrix.

**Nothing in it is implemented or registered.** The existing SME candidate file `07-ext-1-ext-2-design.md` was left unchanged, because it is SME candidate content and must not be published or edited without approval. The new spec supersedes it for engineering purposes.

---

## 6. Fresh full regression

The database was rebuilt from scratch (migrations 0001–0029, seed, import of `trk_frontend_junior`).

| Suite | Result |
|---|---|
| Unit — domain / config / agents / app | 331 / 9 / 145 / **25** |
| Agent evals | 30/30 |
| Docs check | OK |
| API e2e | **269/269** |
| DB proofs | **240 PASS, 0 FAIL** (+1: the audit is read-only and changes nothing) |
| Browser acceptance | **78/78** (both on a fresh database and after the full e2e suite) |

---

## 7. Remaining blockers for calibrated SME assessment and P6 activation

| # | Blocker | Owner |
|---|---|---|
| S-1 | SME approval of per-skill **thresholds** and rubric values on the non-demo candidate rubrics. Every approved value must be representable (0029). Until then every canonical skill result is `incomplete` and no level is awarded | SME |
| S-2 | **Calibration:** a reviewer calibration set (anchor submissions per criterion level), inter-rater agreement target, and blind double-review on a sample. Not built; needs an SME protocol and PO approval | SME + PO |
| S-3 | **Reviewer capacity and governance** for human-scored criteria: named reviewers, conflict-of-interest rules (exist), re-review policy for disputed per-skill outcomes, and the human-override governance needed before `exception_granted` can ever count (PO-2) | PO |
| S-4 | **P4 prerequisites:** B4-1…B4-5 in the P4 spec (register rows, ENG-2 content fields, SME path values, the legacy-adapter decision) | PO + SME |
| S-5 | **P6:** a migration replacing the development seal to allow an **approved** per-skill policy version; four-eyes approval and separation of duties; staging validation on SME-approved content; a production read-only run of the claimed-skill audit; a rollback rehearsal | PO only |
| S-6 | **UI before P6:** PO review of the P5 wording and screenshots; a decision whether My Work should also link each skill to its evaluation section | PO |
| S-7 | **Outside ENG-1, still open:** RISK-GROUNDING-01/02; Verified stays blocked; readiness rule sets unapproved | PO |

**Stop.** Waiting for Product Owner approval.
