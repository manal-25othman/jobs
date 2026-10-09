# نَقْلة / NAQLA — Phase 8 Implementation and Safety Report · Admin Track Builder
**Date:** 2026-10-09 · **Decision:** D-116 · **Status:** implemented, awaiting Product Owner review. **Phase 9 not started.**
**Pre-implementation audit:** `PHASE-8-AUDIT.md`. It lists what existed and was reused, and the 11 missing pieces (M1–M11) that this phase built.

---

## 0. Summary

- The Admin Track Builder is a **layer on top of the existing configuration engine**. It is not a second engine. Every approval and activation goes through `approveConfigRow`, `setConfigActivation`, `config_activation_guard` and `config_change`. Every review of career content goes through `reviewTransition`, `approveRubricValues` and `supersedePrevious`.
- There are **three roles**: an administrator drafts, a named SME validates, and the Product Owner activates. Roles are checked **on the backend for every action**, and the four-eyes rule is enforced **in the database** as well. **Permission to edit is not professional authority**, and the interface says so.
- **Grounding is not loosened.** G1 and G2 stay active. Grounding cannot be switched off from the Track Builder (refused when drafting and when activating). Approved assets now record the **grounding version** (engine + vocabulary) they were checked under, and are shown only while it matches the version in effect (fail closed).
- **No expert decision is finalised.** All nine pending decisions appear as "pending validation". The server refuses three of them outright: challenge activation, a CV bullet at Practiced, and H6 in production.
- **RISK-GROUNDING-01 remains open.** A new risk, **RISK-GROUNDING-02** (unsupported action verbs), is recorded with tests that pin the gap. Together they block any real LLM integration.

---

## 1. Grounding safeguards (owner items 1–3)

| Requirement | What Phase 8 does |
|---|---|
| Keep G1/G2 active; do not loosen grounding | Unchanged engine (`claim-grounding@1`). `claim_policy.lock_until_grounded` is **not editable** in the Track Builder. A draft with grounding off is refused (400), and so is activating such a row (`assertActivationPermittedInPhase8`, e2e). |
| Keep the five concepts distinct | Unchanged and not exposed for editing. **Recorded facts** are built from rows only (`claim-facts.ts`). **User-submitted material** is submissions and declared technologies. **Evaluated evidence** is `evaluation_result` / `evidence`. **Verified skill levels** come from `skill_claim`, and Verified is still blocked. **Professional claims** are approved assets. The Track Builder edits policy *thresholds* (drafts only); it never edits facts, evidence or claims. |
| **RISK-GROUNDING-02**: action verbs | Recorded (D-116, §6). `claim-grounding.test.ts` pins the current behaviour. «أصلحتُ» / «عالجتُ» / "Fixed" / "Refactored" are **grounded on the project fact alone**: the gap. «أعدتُ هيكلة» and "optimized" / «حسّنتُ» are held, but only incidentally (missing vocabulary; the quality detector). No semantic engine was built. |
| Assets must not silently stay evidence-backed when grounding changes | **Fail-closed activation guard, built:**<br>(a) `professional_asset.grounding_version` is written at approval and re-link.<br>(b) `assetPresentableNow` / `presentableFilter` show an asset only when its version equals the version in effect. Otherwise the reason is `not_grounded_under_current_version`.<br>(c) Activating a **vocabulary** re-grounds every active approved asset **in the same transaction**. Assets still supported get the new version (an event is recorded). Unsupported ones move to `needs_review`, with an event, a notification and an audit entry. If this fails, the activation is rolled back.<br>(d) An **engine** version change is a deployment, not an activation. Assets hide automatically until `claims-revalidate --reground` runs (e2e).<br>Historical approvals are **never rewritten** (immutability trigger from Phase 7b; only standing columns change). |

**Required follow-up (deployment step):**
- Assets approved before migration `0020` have `grounding_version = null`. They are **hidden** until `claims-revalidate --by <operator> --reground` runs once after deployment. This is fail closed by design.
- Every future change to the grounding engine needs the same step.
- **Comprehensive revalidation** of other changes (for example a track version that changes evidence counts) is not triggered automatically, because those values do not decide whether an asset is grounded. Claim-policy activation already re-checks eligibility (Phase 7b).

---

## 2. Implemented features

| Area | Supported (API + UI) | Notes |
|---|---|---|
| **Tracks and track versions** | Track page shows the live track-skill values, change proposals, versions, diff preview, submit / validate / activate | A version made by the Track Builder (`applies_skill_config = true`) applies its snapshot **only when activated**, in the same transaction (`track.version_applied` audit) |
| **Skills and role-skill mappings** | New skill created **as a draft** and reviewed (author → SME → publish). Changes to role-skill values are proposed, reviewed, then built into a version | Editing a **published** skill's labels is not built (it needs a pack version; see the audit) |
| **Core/supporting/mandatory classification** | `is_core` and `importance` are professional fields. Classification becomes "approved" **only** when a named SME approved the change, and carries their name and time | "Mandatory" is a readiness rule (`required_skill_at_level`). It is drafted under readiness rules and stays pending |
| **Activities and deliverables** | Deliverables of **unpublished** activities can be edited. The activity goes through review and publication, and publishing supersedes the previous one | New DB trigger: deliverables of a published activity are frozen |
| **Rubric criteria / evaluation configuration** | Criteria of an unpublished or returned rubric can be edited. Changing a value (weight, threshold, mandatory, max score) resets it to "proposed" and clears the earlier value approval. Values are approved by a named SME who did **not** edit them (OPEN-043 command) | A new version of an already-published rubric is not built (it needs `promoteDemo` generalised) |
| **Evidence requirements** | `claim_policy` (minimum level, count, source strength, verification decision); `role_requirement.minimum_evidence_count` through track changes | Drafts only; values stay pending |
| **Readiness rules** | New version of a `readiness_rule_set`, with rules copied and editable (labels, enabled, parameters) | No threshold is approved; the domain sanity checks run before writing |
| **Assessment context** | `assessment_context_policy.inputs` uses per-input selectors. Identity and profile are always excluded (locked in the UI, checked by the domain) | |
| **Claim policies** | As above. Skill-asserting kinds below Demonstrated cannot be drafted or activated | CV bullet at Practiced stays pending |
| **AI disclosure** | New questionnaire version (questions copied and editable). Questions freeze on activation (existing guard) | |
| **Challenge definitions** | Drafted, submitted and validated; **activation refused by the server** | |
| **Grounding vocabulary** | New version with entries added or removed (language, class and form selectors). Activation re-grounds assets atomically | The vocabulary is still a DRAFT and not SME-validated |
| **Diff preview** | Shown before approval and activation. Fields are compared with the version in effect, or with the previous version of the family when none is in effect, labelled as such. Child rows show added / removed / changed. Track versions are compared per skill and per field | |
| **Lifecycle labels** | Draft → Pending Review → Approved → Production Active. They are **derived** from `review_status` + `activation` (or the career-data `review_state`), with annotations for legacy baseline, development only, returned, rejected, superseded and frozen after deactivation | No alternative lifecycle |
| **Arabic explanations** | `RULE_CATALOG`: for each professional rule, its meaning, the **impact of changing it**, and whether it depends on an expert, shown next to every control and in every diff | |
| **No JSON / CLI for routine work** | Typed controls: selectors, checkboxes, numbers, comma lists, context-input selectors, vocabulary rows | The one exception: a challenge `trigger_rule` (stored, never interpreted, not activatable) is a small text field |

**UI** (`apps/app/src/app/admin/`): `/admin` (roles, the separation statement, pending expert decisions, kinds, tracks), `/admin/config/[kind]`, `/admin/tracks/[roleId]`, `/admin/content`. It uses only the frozen classes and tokens (`card`, `chip`, `btn`, `banner`, `field`, `rows`, `term`, `num`). **No graduate-facing page was changed.** `verify:prototype` and `verify:tokens` pass.

---

## 3. Permissions

| Action | `track_admin` | `sme` | `product_owner` |
|---|---|---|---|
| Read the Track Builder | ✓ | ✓ | ✓ |
| Draft a new version, propose a track-skill change, create a draft skill, edit unpublished content | ✓ | — | — |
| Submit for review / withdraw own change | ✓ (own drafts only) | — | — |
| **Validate professionally** (approve / needs revision / reject; approve rubric values) | — | ✓ **not own drafts or edits** | — |
| Approve an *operational* track change (display order, category) | — | ✓ | ✓ |
| Activate / deactivate configuration; publish content | — | — | ✓ |

- **Backend enforcement:** `AdminGuard` (authenticated and holding at least one active grant, otherwise 403; unauthenticated gets 401) plus `assertAdminAction` on **every** service method.
- **Four eyes:** checked in the service and in the **database** (`config_four_eyes_guard` on the seven governed configuration tables, `track_version_four_eyes_guard` on `track_config_version`, and the `track_skill_change_four_eyes` check constraint).
- **Production:** `config_activation_guard` (from Phase 4) refuses activating an unapproved row in production, even for a Product Owner (e2e 422).
- **Grants:** made by an operator in `reviewer_grant` and revocable. A user cannot grant themself a role, read grants, or write track changes (`rls.sql`, run as `authenticated`).
- **Administrator ≠ SME:** an administrator is refused validation (403, e2e). A user holding both roles still cannot validate their own draft (403 from the API; the direct database update is also refused).

---

## 4. Configuration versioning and approval flow

1. **Draft:** the administrator creates a new version from an existing one, with edits and a written reason. The base row is untouched (md5 check in e2e). The new version gets the next number in its family, `review_status = draft`, `activation = inactive`, `drafted_by = <admin>`, and copied children.
2. **Pending review:** the administrator submits it (`curated`).
3. **Approved:** a named SME who did not draft it approves through `approveConfigRow` (name, time and reason recorded), or returns or rejects it.
4. **Production active:** the Product Owner activates through `setConfigActivation`. In **one transaction**, the version in effect for the family is deactivated first, the guard checks approval, and the hooks run: a claim policy re-checks assets, a vocabulary re-grounds assets, a track version applies its skill snapshot. Rollback is the same service setting `inactive` (e2e).
5. **Immutability:** a row's content is frozen after first activation (from Phase 4). Questionnaire questions and vocabulary entries are frozen once active. Rubric criteria are frozen once published. **Deliverables are now frozen once published.** Track-skill changes are immutable after draft and cannot be deleted.

**Track-skill changes:** `draft → pending_review → approved | rejected | withdrawn → included (in a version) → applied (on activation)`. Live `role_requirement` rows change **only** on activation of a validated version. Readiness reads them live, so editing them in place would have changed live behaviour without a version.

---

## 5. Audit events

| Where | Events |
|---|---|
| `audit_event` (`admin.*`, with `actor_id`, `role_performed` = `track_admin` / `sme` / `product_owner`, reason, payload) | `draft_version_created` · `submitted_for_review` · `validated_approve` / `validated_needs_revision` / `validated_reject` · `activation_changed` (with `replaced`) · `track_skill_change_drafted` / `_pending_review` / `_approved` / `_rejected` / `_withdrawn` · `track_version_built` · `content_created` · `content_edited` (with `valuesReset`) · `content_reviewed` (with `superseded`) · `rubric_values_approved` |
| `audit_event` (system) | `track.version_applied` (per skill row) · `asset.needs_review` (re-grounding / revalidation) |
| `config_change` (existing) | Every review-status and activation change, with the actor and reason (`naqla.config_actor` / `naqla.config_reason`) |
| `review_log` (existing) | Every career-content transition, with the named decider and role |
| `asset_standing_event` (append-only) | `grounding_revalidation` (new cause) · `policy_activation` · `revalidation_run` · … |

---

## 6. Risks

| ID | Risk | Status |
|---|---|---|
| **RISK-GROUNDING-01** | Grounding error rates are unmeasured (no G3 corpus); relations between facts are not checked; the vocabulary is not validated by an SME | **Open, not resolved**. Blocks real LLM integration and production claim generation |
| **RISK-GROUNDING-02** *(new)* | **Unsupported action verbs**: "fixed", "refactored", "optimized", «أصلحتُ», «عالجتُ», «أعدتُ هيكلة», «حسّنتُ». A cited project proves it exists, not that the user performed that action. Today «أصلحتُ» / "Fixed" / «عالجتُ» / "Refactored" are grounded on the project fact alone. «أعدتُ هيكلة» and "optimized" are held only incidentally | **Open.** Pinned by tests. **No real LLM integration until a tested mitigation exists.** A possible direction (to be proposed, not started): split the `action` class into verbs supported by a record type (for example "submitted" → submission; "tested" → a test deliverable or criterion) and verbs that need an explicit record |
| R8-1 | Assets approved before `0020` are hidden until a re-ground run | Intended (fail closed). Deployment step documented (§1) |
| R8-2 | A grant is an operator act with no UI; a mis-granted role is the main human risk | Grants are revocable and audited. A grants UI is out of scope |
| R8-3 | The SME four-eyes check for career content compares against the last submitter and any admin editor recorded in `audit_event`. Edits made outside the Track Builder (CLI / SQL) are not seen | The CLI remains an operator tool. The database guards still apply |
| R8-4 | The admin pages were verified by build and type-check, and the API they call by 17 end-to-end tests. They were **not** exercised in a browser with live Supabase auth (live verification is blocked) | Needs a manual walkthrough once live auth is available |
| R8-5 | `DOMAIN_RULESET_VERSION` 0.15.0 → 0.16.0 for the new pure module `admin-governance.ts`. No SRS rule changed, so no CHG was raised | If the owner wants the role separation stated in the SRS, a CHG can be drafted (not applied) |

---

## 7. Tests

| Suite | Result |
|---|---|
| Domain unit (`npm test`) | **226 / 226** (+10 `admin-governance.test.ts`: roles, four eyes, stage derivation, track-skill proposal validation, diff, catalogue completeness) |
| Agents unit | **145 / 145** (+3 RISK-GROUNDING-02 pinning tests) |
| Config | 9 / 9 |
| Agent harness (`eval:agents`) | **30 / 30** |
| API end-to-end | **165 / 165**, including **17 new** in `track-admin.e2e.ts`: 401/403; per-role refusals; drafts never touch the base row; diff; four eyes in the API **and the database**; SME validation; Product Owner activation with `config_change` and audit assertions and rollback; an unapproved draft never reaches production (422); challenge never activated; grounding cannot be loosened; track change → version → validation → activation (live only after activation; classification approved with the SME's name); new skill review flow; rubric values reset and approval by a different SME; published deliverables frozen; engine-version mismatch hides an asset until re-grounded; a vocabulary activation dropping a used word moves the asset to review atomically, then is restored |
| Database proofs (`db-test.sh`) | All pass, including **6 new** run as `authenticated`. The harness now **fails loudly on any psql error**: before this, a non-"FAIL" error was hidden by the output filter. This was found while adding the proofs and fixed |
| `npm run verify` | Boundaries, frozen prototype (18 files unchanged), tokens (77), docs (SRS v1.11) all pass |
| `next build` | Passes (4 new routes) |

---

## 8. Blockers and items not built

- **Live Supabase verification:** blocked (unchanged).
- **Not built (would need a refactor or is out of scope):**
  - a new version of a **published** activity or rubric (needs `promoteDemo` generalised);
  - editing a published skill's labels;
  - a grants UI;
  - G3, G4, real LLM, additional tracks, new expert-dependent policies: **not started**.
- **Expert-dependent values: all still pending.** These are mandatory skills, core/supporting, readiness thresholds, rubric weights, evidence counts and strengths, verification thresholds, CV bullet at Practiced, challenge triggers and grounding vocabulary approval.

## 9. Readiness for Phase 9

Phase 9 is the cleanup of the remaining hard-coded rules (H3, and H5 into configuration). It is **technically unblocked**: the Track Builder can carry new governed configuration kinds without a new engine. Phase 9 touches the pack validator, and H5 requires owner approval.

**Phase 9 has not been started and waits for explicit approval.** Real LLM integration stays blocked by RISK-GROUNDING-01 and RISK-GROUNDING-02.
