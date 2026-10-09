# نَقْلة / NAQLA — Phase 8 pre-implementation audit · Admin Track Builder
**Date:** 2026-10-09 · Written **before** any Phase 8 code, as the owner's brief requires. It lists what already exists (to be reused) and only the missing pieces.

## 1. What exists — reused, not rebuilt

| Capability | Existing implementation | Reuse in Phase 8 |
|---|---|---|
| Governed configuration: review status + activation, one active row per key, content frozen after first activation, `config_change` audit, production refuses drafts | `config_activation_guard()` (0014) on `verification_policy`, `assessment_context_policy`, `claim_policy`, `challenge_policy`, `track_config_version`, `readiness_rule_set`, `disclosure_questionnaire`, `grounding_lexicon` | Every admin approve/activate goes **through these services and the guard**. No second engine. |
| Approve / activate / new track version / new readiness set | `approveConfigRow`, `setConfigActivation` (claim-policy activation already re-checks assets atomically, Phase 7b), `createTrackConfigVersion`, `createReadinessRuleSet` (`config-admin.service.ts`). Today these are CLI-only. | Called from the new HTTP admin API with the caller's verified identity and role. |
| Read side of configuration | `ConfigurationService.policies()`, `trackConfig()` (GET `/v1/config/*`) | Reused for listings |
| Career-data review workflow | `reviewTransition()` (domain `assertReviewTransition` + DB `career_data_review_guard`), `review_log`, `approveRubricValues()` (OPEN-043), `supersedePrevious()`, `promoteDemo()` | Called from the admin API with role checks |
| DB immutability | rubric criteria frozen once published; questionnaire questions and lexicon entries frozen once active; approved assets immutable (7b) | Kept; one gap filled: deliverables of a published activity were not frozen |
| Pending-expert markers | `role_requirement.classification_status`, `rubric_criterion.weight_status`/`threshold_status`, `rubric_version.pass_threshold_status`, `review_status` on every governed row, `trackSkillBadge()` | Shown as-is; never set by an admin |
| Identity of reviewers | `reviewer_grant` (operator-granted, revocable) + `HumanReviewerGuard` | Extended with two roles |
| UI | `apps/app` (Next.js) using frozen tokens and classes (`card`, `chip`, `btn`, `banner`, `field`, `rows`) | New `/admin` pages built from the same classes |

## 2. What is missing — the only things Phase 8 builds

| # | Missing | Why it is needed |
|---|---|---|
| M1 | Roles `track_admin` and `product_owner` on `reviewer_grant`, plus a backend admin guard and per-action role checks | Today SME approval is a CLI flag naming any UUID. An admin is not an SME, and the backend must enforce that. |
| M2 | Four-eyes rule: an SME cannot approve a draft they drafted (enforced in the database) | Role separation |
| M3 | HTTP admin API | Today configuration changes are CLI-only |
| M4 | "New draft version from the current one, with edits" for claim, assessment-context, verification, challenge, disclosure, readiness and vocabulary configuration (children copied: rules, questions, entries) | Only readiness sets and track versions can be created today; every other change needs SQL |
| M5 | Diff/preview service (draft compared with the version in effect) | Required before approval and activation |
| M6 | Governance label mapping (Draft → Pending Review → Approved → Production Active, plus legacy-baseline and development-only annotations) that **derives from** the existing states | The interface must not invent a lifecycle |
| M7 | Track-skill draft changes (role-skill configuration, core/supporting classification, importance, expected level, evidence count) applied **only when a new track version is activated** | Readiness reads `role_requirement` live, so editing it in place would change live behaviour without a version |
| M8 | Fail-closed guard for grounding vocabulary and engine version changes: assets record the grounding version they were checked under; presentation requires it to match; activating a vocabulary version re-grounds assets atomically; an engine bump hides assets until revalidated | Owner requirement 3 |
| M9 | Server-side blocks: challenge-policy activation; claim policies below demonstrated for skill-asserting kinds (CV bullet at Practiced pending); per-skill derivation (H6) in production | Owner requirements 5 and 8 |
| M10 | Arabic catalogue of each professional rule: what it means, the impact of changing it, and whether it is pending expert validation | Owner requirement 9 |
| M11 | Admin UI | Owner requirement 9 |

## 3. Deliberately not built (would need a refactor, or is out of scope)

- **New version of an already-published activity or rubric.** This would require generalising `promoteDemo`'s copy logic; it is reported, not built. Phase 8 lets admins edit **unpublished** activities, deliverables and rubric criteria, and walk them through review, publication and superseding.
- **Editing a published skill's labels.** Published career data changes through a pack version. Phase 8 creates **new** draft skills and reviews them.
- G3, G4, real LLM, additional tracks, new expert-dependent values: not started.
