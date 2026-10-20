# نَقْلة / NAQLA — DM-7b: P-3 Professional Classification — Development Implementation Report (D-130)

> **Scope:** the Product Owner's decisions D-1…D-7 on DM-7b, implemented **additively, in the development pathway only**.
> **Nothing is activated, approved, published or deployed.** No P6. No production state exists for any new object.
> Design: `DM-7B-P3-ARCHITECTURE-ANALYSIS.md`. Governance proposals: `docs/changes/CHG-017-DM7B-AMENDMENTS-PROPOSED.md`, EXT-3 in `EXPERT-RULE-EXTENSION-REGISTER.md`.

---

## 1. Decisions applied

| Decision | How it is applied |
|---|---|
| D-1 P-3 | A versioned classification per role (`skill_classification_set` + `skill_classification`), taxonomy `must_core_supporting@1` |
| D-2 legacy `is_core` | **No mirror.** `role_requirement.is_core` is never written by P-3. Readers are version-aware: classification in effect → class; otherwise `is_core`, unchanged. The Track Builder refuses an `is_core` change for a classified role ("change the classification version instead"), so the two never compete |
| D-3 authority split | Classification = categories. Readiness rule set = levels and pass conditions. A rule set for a classified role is refused at approval/activation when they disagree, and a report under a disagreeing pair is never `evaluated`. Classification alone grants nothing |
| D-4 PO defaults | `source_kind = po_default` per entry (`forms_validation`, `requirements_reading`). Approval of a set with PO defaults needs the PO's named approval in addition to the SME's. The UI labels them «تصنيف افتراضي من مالك المنتج، غير معتمد من الخبراء»; `expertApproved = false` everywhere |
| D-5 6 / 3 / 3 | A value of the track's schema-2 constraint version, never a code constant. Tests prove a different track may state other numbers |
| D-6 CHG-017 / EXT-3 | Written as **proposals** only (status "proposed") |
| D-7 additive, development only | Migration 0034 adds tables/columns only; no existing row, enum or frozen set changes; activation exists only as `development_only` with an explicit transaction-local opt-in, never in production |

## 2. Files and migrations changed

**Migration** `supabase/migrations/0034_dm7b_professional_classification.sql` · rollback `supabase/rollback/0034_dm7b_professional_classification.down.sql` (refuses while any classification or schema-2 set exists) · DB proofs `supabase/tests/professional_classification.sql`.

| Area | Files |
|---|---|
| Domain | `packages/domain/src/professional-classification.ts` (new) · `pack-constraints.ts` (schema 2, `checkPackCountsV2`, schema-aware resolution) · `readiness.ts` (`classification` input, `classificationProblems`) · `index.ts` · tests `professional-classification.test.ts` (new) |
| API | `configuration/professional-classification.ts` (new: load / in-effect / create / approve) · `career-data/pack-schema.ts` (pack format 2, per-row provenance, `packCountsV2`) · `career-data/pack-constraints.ts` (loads `pack_constraint_v2`, schema) · `career-data/pipeline.ts` (format 2: dry-run validation only, import refused) · `career-data/quality-rules.ts` (Q06 and evidence paths version-aware) · `career-data/career-data.service.ts` (`requiredForRole`, `professionalClass`) · `agents/agent.service.ts` · `configuration/configuration.service.ts` (track view badges + provenance) · `readiness/readiness.service.ts` (badges, classification passed to the evaluator) · `configuration/config-admin.service.ts` (`assertReadinessSetConsistentWithClassification` at approve/activate) · `admin/admin.service.ts` (Track Builder read-only class; `is_core` refusal) |
| Agents | `packages/agents/src/local-test-provider.ts` (gaps = Must ∪ Core when classified, Must wording) · test `professional-classification-gaps.test.ts` (new) |
| App | `apps/app/src/lib/api.ts` · `app/skills/page.tsx` · `app/skills/[id]/page.tsx` («إلزامية» badge, PO-default note) · `app/admin/tracks/[roleId]/page.tsx` (class read-only, "development only") |
| Tests / scripts | `apps/api/test/dm7b-classification.e2e.ts` (new) · `scripts/db-test.sh` (proofs + 0034 round-trip) · `scripts/rollback-rehearsal.sh` (0034 refusal on populated data) |
| Docs | this report · `docs/changes/CHG-017-DM7B-AMENDMENTS-PROPOSED.md` · EXT-3 row · D-130 |

`apps/web` (frozen) untouched.

## 3. v1 compatibility

- Every existing `pack_constraint_set` is schema 1 (column default); the frozen legacy baseline keeps exactly its 7 constraints. Schema-2 constraints live in a **separate table** (`pack_constraint_v2`), so the `pack_constraint_type` enum and the frozen sets are untouched and the change stays reversible.
- Resolution is per schema: a v1 pack resolves only schema-1 sets, a v2 pack only schema-2 sets; **no fallback either way**. The one-active-per-scope index includes the schema, so a development schema-2 track set never displaces the v1 baseline.
- A v1 pack may not carry `professional_class`; the v1 validator, counts and messages are unchanged (existing equivalence tests stay green).
- With no classification in effect (always the case in production), every reader returns exactly what it returned before: badges from `is_core` + classification status, agent gaps from `is_core`, Q06 from `is_core`. The API keeps sending `isCore`.
- History: no backfill, no recomputation; verification levels, evidence decisions, claims and readiness evaluations are untouched (asserted by the e2e suite).

## 4. v2 classification and Task B validation

- **Pack format 2** (`manifest.pack_format_version = 2`): each role skill carries `professional_class` (must|core|supporting), `class_source` (sme|po_default) and `class_source_ref`, and **no** `is_core_for_role` (one source of truth).
- **Constraint schema 2** types: `must_skill_count`, `core_class_skill_count`, `supporting_skill_count`, `task_count`, `activity_count`, `activity_primary_skill_count`, `activity_required_primary_skill_count`, `rubric_min_criteria`, `resources_per_skill_max`. Completeness and floors are checked in the domain.
- **Task B**: "required" = Must ∪ Core. A Task-B-shaped activity with primaries `code_reading`, `frontend_debugging`, `js_fundamentals` (all Must) has 3 required primaries → **passes** under a schema-2 set; the same activity under v1 has 1 `is_core` primary → **refused** (`activity_core_primary_skill_count`), exactly as the analysis predicted. An activity bent to Supporting primaries is refused under v2.
- Evidence paths: every Must and Core skill needs a linked criterion. **Finding:** the shipped activities have no Git (Must) evidence path; the synthetic v2 pack in the tests adds one. A real v2 pack needs that content.
- A format-2 pack **validates as a dry run only**; importing it is refused ("not enabled … CHG-017").

## 5. Safeguards (readiness, governance)

- Approval: named SME; plus named PO when any `po_default`; four eyes against `created_by`; approval final; entries fixed once approved or once active; canonical skills only; only skills the role requires.
- Activation: only `development_only`, only with `naqla.classification_dev_activation = on` in the same transaction, never with `naqla.production = on`; one active set per role; never deleted.
- Readiness consistency (approve/activate and every evaluation): every Must has a `non_compensable_skill` rule; every Core a `required_skill_at_level` (or stricter) rule; no blocking rule names a Supporting skill; `all_core_skills_at_level` and `min_skills_at_level{scope: core}` are refused in a classified role (they read legacy `is_core`).
- RLS: learners read only the set in effect (approved, development_only, not production); no client writes.

**Known limitation (fails closed):** at evaluation time a rule naming an alias skill is not canonicalized, so it would report a missing Must/Core rule and block a verdict. The approve/activate check canonicalizes, so a set that reaches activation is not affected.

## 6. Test results (fresh database, this change)

| Suite | Result |
|---|---|
| Domain unit | 436 / 436 |
| Config · agents · app unit | 9 / 9 · 147 / 147 · 26 / 26 |
| Agent evaluation harness | 30 / 30 scenarios, 0 false accepts / rejects |
| `npm run verify` (boundaries, frozen prototype, tokens, docs) | pass — `verify-docs` unchanged (v1 canonical pack, 5 core) |
| API e2e (all suites, sequential) | **310 / 310** (DM-7b suite: 15) |
| DB proofs `scripts/db-test.sh` | all pass (321 PASS lines; 0034 proofs + round-trip) |
| Rollback rehearsal (populated clone) | pass — incl. 0034 rollback refused with classification history present |
| Browser acceptance | 78 / 78 (legacy path; no classification is in effect in that run) |

## 7. Remaining blockers (not done here, by design)

1. **CHG-017** (with the DM-7b amendments) — PO approval; then the SRS amendments (FR-P-012, §3.1, OD-2) and the `verify-docs` format-2 checks, applied with publication.
2. **EXT-3** register row — PO approval.
3. **Junior Frontend v2 pack content** — classes per skill, Task B and the Git evidence path, through the SME package; format-2 import is disabled until then.
4. **The classification version itself** — SME-JFE-01's named approval (+ PO for the two PO defaults); none is created in any shipped database.
5. **Readiness rule set** for the track, consistent with the classification — depends on DM-2 / SME calibration values.
6. **Production state** for classifications and schema-2 sets — does not exist; needs a migration and a P6 decision.

## 8. What remains inactive

Every classification (none exists outside tests); every schema-2 pack constraint set (none exists outside tests); pack format 2 import; all readiness rule sets, verification, claim and readiness policies (unchanged); P6 not started; Junior Frontend not published as an approved live track.
