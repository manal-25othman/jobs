# نَقْلة / NAQLA — **Phase 7b Implementation & Risk Report: Claim-to-Fact Grounding (G1+G2) and Asset Standing**
**Date:** 2026-10-08 · **Decision:** D-115 · **SRS:** v1.11 (CHG-016 applied: BR-026, DR-019) · **Scope:** bounded Phase 7b — G1 + G2, atomic policy-activation revalidation, CHG-016. **G3/G4 not started. Phase 8 not started.**

---

## 1. What was implemented

| Area | What it does |
|---|---|
| **CHG-016 → SRS v1.11** | BR-026 and DR-019 applied as worded in the closure report, with traceability and a changelog row. A clause makes explicit that **historical user approval and current eligibility to present are separate**. Evidence, verification and readiness semantics are unchanged; BR-021 is unchanged. |
| **G1 — facts, assertions, plan** | `packages/agents/src/claim-grounding.ts` is pure, deterministic and uses no model. **Typed facts are built by the application from database rows, for the cited evidence only** (`apps/api/src/agents/claim-facts.ts`): the project title, met criteria by name, submitted deliverables, recorded numbers (total, maximum, met count), technologies declared on the cited project and its submissions, the skill's current state, and — for headline/About/summary — the user's skills and learning track. There is a **closed assertion taxonomy**. `OUTCOME`, `PROFESSIONAL_CONTEXT` and `QUALITY` have **no fact kind**, so they can never be supported. Generators now return a **declared claim plan** (schema `1.4.0`: typed assertions → fact ids → exact spans). The plan is **checked, never trusted**: every fact id must be one of the cited records, its kind must fit the assertion type, every token in a span must be accounted for by that span's facts, and content outside the declared spans must be neutral wording. |
| **G2 — coverage + detectors as data** | **Coverage (allow-list):** every token of the wording must be either a recorded fact's surface form or approved vocabulary. Some vocabulary only counts when the fact behind it exists: "demonstrated" only next to a skill at demonstrated or above; "evaluated" only with an evaluation; "declared technologies" only next to a declared technology; "track" only with the track fact. Anything else is **unmapped**. **Detectors (deny-list):** the Phase 7 deterministic guards remain a floor the data cannot remove, plus SME-extendable detector phrases. They run over the **whole** wording independently of the plan. **The vocabulary is versioned bilingual data**: `grounding_lexicon` and `grounding_lexicon_entry` are governed, frozen once active, and owned by an SME role. Arabic is handled by normalisation (diacritics, tatweel, alef/ya/ta-marbuta forms, Arabic-Indic digits) plus one layer of proclitic and enclitic stripping. **AR/EN parity:** both languages must rest on the same facts. |
| **Three results** | `grounded` · `needs_revision` (only low-risk text is unaccounted for; a **trim that only deletes** is suggested, and offered only if the remainder is itself grounded) · `refused` (an unsupported number, technology, skill, outcome, professional context or quality claim, or a plan that cites non-records). Every issue is explained in **Arabic and English**. The **original wording is always kept**. |
| **Product flow (extended, not rebuilt)** | Same Recruitment Agent, gateway, proposals, preview and approval. **Drafting:** a refused draft is not offered, and its wording and reasons are kept in the audit record. A needs-revision draft is stored and flagged. **Preview:** grounding at drafting time and now. **Approval:** re-grounds against the current records (an edit has no plan, so it is grounded as written); a refusal is recorded (`grounding_refused` / `edit_refused`, with the full result) and the original draft is untouched. **Re-link (D-077):** now also requires the policy in effect and grounding in the new evidence. |
| **Approval ≠ current standing** | A database trigger forbids rewriting an approved asset's body, approval time, kind, policy reference or provenance. Standing is `lifecycle_state`/`evidence_backed` plus `standing_policy_id` (the policy the asset was last verified under). Every standing change is an append-only `asset_standing_event`; withdrawal now records one too. |
| **Policy activation re-checks assets atomically** | `setConfigActivation` on `claim_policy` re-checks **every active approved asset of that kind in the same transaction**. Assets that are still eligible get standing set to the new policy. Ineligible assets move to `needs_review` with the reason, the policy version, an event, an audit record and a notification. If the re-check fails, **the activation rolls back**. Deactivating a policy never restores an asset. |
| **Fail-closed presentation gate** | `assetPresentableNow` is used by the recruiter report and live share links. An asset is presented only if it was verified under the policy **in effect now**. An activation done outside the audited path (raw SQL) therefore **hides** the affected assets until `claims-revalidate` re-checks them; it never leaves them shown under an obsolete decision. |
| **UX** (`/proposals`) | A plain-Arabic grounding status, chips for each assertion, unmapped text highlighted, the issues listed, and a **"use the shorter wording"** button that only deletes. Approval is enabled after an edit, because the edit is re-checked. On refusal the user sees: «صياغتك الأصلية محفوظة» ("your original wording is kept"). Frozen design untouched. |

## 2. Which claims can now be validated

| Claim | How it is validated now |
|---|---|
| Project description (title, what was submitted, evaluated against a rubric, declared technologies) | Grounded when every part maps to the cited project, deliverable, criterion, evaluation or technology records |
| CV bullet / case study naming a skill and score | The skill fact must be at demonstrated or above; the numbers must equal recorded total/max/met; the criteria must be met criteria by name |
| Technology | Must be declared on the **cited** work (an alias resolves to its term) |
| Numbers (digits, Arabic-Indic, in words) | Must equal a recorded number of the cited evaluation; quantity words are refused |
| Outcomes, impact, user/business effects — **including paraphrases outside any list** | Never grounded: no fact kind exists. Listed phrasings are `refused`; paraphrases are at least `needs_revision`, so they cannot be approved as evidence-backed |
| Employer, client, production, real users, internship, certification, years, seniority, quality/mastery | `refused` when detected. An undetected variant (e.g. an Arabic company name) is unmapped, so `needs_revision` |
| Headline / About / summary | Skills at their recorded states. The target role is allowed only as the learning **track**; a bare role name reads as a job title and is not grounded |
| Partially supported wording | The supported part is kept as a suggested trim; the unsupported part is named. Never approved as is |

## 3. What remains unsupported or uncertain — `RISK-GROUNDING-01` is **reduced, not resolved**

1. **No measured error rates.** There is no held-out gold corpus yet (G3), so the false-accept and false-reject rates are unknown. The unit tests show behaviour on chosen cases plus 200-case property checks; that is not population evidence.
2. **Action verbs are not fact-checked.** "Fixed", "refactored" or "tested" pass whenever a project fact is cited, because no record says *which* action the user performed. Verified: «أصلحتُ «متتبّع عادات»» ("I fixed «Habit Tracker»") is grounded. AR/EN parity compares facts, not verbs, so «بنيتُ» ("I built") in Arabic beside "Refactored" in English is grounded. This boundary is low-risk but real (decision 2).
3. **Relations are not checked.** A sentence combining true facts from two cited records ("built X with the technology of project Y") is grounded if every token maps to a fact.
4. **The vocabulary is a DRAFT.** `default@1` is not SME-validated and is **inactive in production**. In production every draft is `needs_revision` until an SME approves a vocabulary: this fails closed, but also means the feature cannot be used in production yet.
5. **Morphology is shallow.** Unusual Arabic forms or synonyms of fact surfaces become unmapped. This errs safe but may over-reject.
6. **Ordinary functional descriptions are conservative.** "A form that lets users add habits" is `needs_revision` unless a deliverable or criterion records it.
7. **User edits with unmapped low-risk text are refused** (fail-closed default; decision 4).
8. **Approved assets are not re-grounded when the grounding engine or vocabulary changes.** Only a policy change triggers a re-check (deferred, decision 6).
9. **No real LLM was used.** Plans come from deterministic templates; how a real model behaves under the gate is unknown (T9 rehearsal pending).

## 4. Database migrations and compatibility

**`0018_claim_grounding.sql`:**
- `grounding_lexicon` (governed) and `grounding_lexicon_entry` (frozen once active). `default@1` is a DRAFT with 279 entries, mirroring `SEED_GROUNDING_LEXICON`; it is inactive, and the demo seed activates it for development only through an audited act.
- On `agent_proposal`: `grounding_result` and `grounding_version`, plus the statuses `needs_revision` and `refused`.
- On `claim_draft_event`: `grounding_result`, plus the events `grounding_refused` and `edit_refused`.
- On `professional_asset`: `standing_policy_id`, `standing_checked_at`, and the approval-immutability trigger.
- `asset_standing_event` (append-only, owner-readable).
- RLS on all new tables.

**Compatibility:**

| Before Phase 7b | Now |
|---|---|
| Drafts created before 0018 had no grounding result. | They are grounded at approval in inferred mode and are never rewritten. |
| Assets approved before the policy layer had no standing record. | They stay presentable while the legacy baseline is in effect. |
| The recruiter report listed every eligible CV bullet. | It still lists only CV bullets, now gated by current standing. |

`npm run eval:agents`: 30/30 · provider `local-test@0.5.0` · schema `1.4.0` · domain `0.15.0`.

**Behaviour that is intentionally stricter than Phase 7:**
- Edits must be grounded.
- A claim may only name skills and technologies of the **cited** evidence; the evidence-free kinds use the user's own skills.
- Re-linking needs grounding in the new evidence. The D-077 e2e now redoes the **same** project, and re-linking to a different project's evidence is shown to be refused.

## 5. Full test results

| Suite | Result |
|---|---|
| `@naqla/domain` | **216/216** (+4: fail-closed presentation gate) |
| `@naqla/config` | 9/9 |
| `@naqla/agents` | **142/142** (+50, almost all in `claim-grounding.test.ts`: supported descriptions; unsupported AR/EN assertions — client, employer, credential, technology, alias, metric, percentage, unsupported skill, quality, outcome; six paraphrased/reordered outcomes outside every list; partial support with deletion-only trim; plan tampering; AR/EN parity; track vs title; vocabulary-alone; fail-closed without vocabulary; code floor with empty vocabulary; metamorphic diacritics/order/number words; 200-case property composition; every provider template grounds) |
| Agent harness | **30/30**, 0 known gaps, 0 false accepts, 0 false rejects. Regression set only; **not** a comprehensiveness claim |
| e2e (PostgreSQL, rebuilt 0001→0018) | **148/148** (+8 in `claims-standing.e2e.ts`: stored grounding result; eight refused edits with the original kept, each refused by grounding recorded with a deletion-only trim, and a supported edit approved; approval immutability; withdrawal standing event and append-only events; re-link to a different project refused; activation keeping eligible assets shown and moving ineligible ones out of the report and the **live share link**, with the approval untouched and no restore on deactivation; **re-check failure rolls the activation back**; **raw-SQL activation fails closed** until revalidation; production guards, including a draft vocabulary never resolving in production and the active vocabulary frozen) |
| DB proofs (`scripts/db-test.sh`) | All passed |
| Historical-data proof (md5, 0018 on pre-0018 data) | `agent_proposal`, `professional_asset`, `claim_draft_event`, `claim_policy`: **byte-identical** in pre-existing columns; 0 standing events invented |
| `npm run verify` | Passed (SRS v1.11) |
| `next build` | Passed |

**Existing tests changed** (all intentional):
- `withdrawal.e2e`: the redo uses the same project title (stricter re-link).
- `configuration.e2e`: counts only the seeded policy keys, because the new e2e policies use their own key.

## 6. Historical data and production safety

**Historical data:**
- No historical row is rewritten. Approvals are protected by a trigger.
- Standing changes are separate events.
- Nothing is approved or restored automatically.

**Production:**
- No claim policy other than the baseline is active.
- No grounding vocabulary is active, so grounding fails closed.
- The test provider is refused under `NODE_ENV=production`.
- Activating a non-baseline policy now re-checks assets atomically. A change made outside the audited path cannot leave assets shown.
- **No non-baseline production policy was enabled.**

**Not changed:**
- No evidence-invalidation workflow was created; it remains a separate future decision.
- CV bullet at Practiced stays refused (baseline demonstrated); the conflicting draft rule is not consumed.
- No real LLM, classifier, dependency or paid service was added.

## 7. Decisions requiring Product Owner / SME approval

1. **SME validation of the grounding vocabulary** (`default@1`, or a revised version). This is required before claim drafts can be grounded in production.
2. **Action-verb semantics.** Should "fixed", "refactored" and similar verbs require a matching deliverable or criterion fact, rather than only the project?
3. **G3:** a gold corpus, plus your acceptable false-reject rate on ordinary descriptions and the false-accept target on high-risk claims.
4. **User edits with unmapped low-risk text.** Keep refusing them (current), or allow them as "user wording — not evidence-backed"?
5. **Re-link strictness.** Requiring the wording to be grounded in the new evidence: confirm it.
6. **Re-checking approved assets when the grounding engine or vocabulary version changes:** an explicit run, and when.
7. **The target role in headlines.** It is allowed only as the learning track: confirm.
8. **Evidence-free kinds (summary, headline, About).** They may name any of the user's demonstrated skills: confirm.
9. **Production draft generator:** deterministic templates or a real provider (OPEN-023).
10. **Evidence invalidation workflow** (deferred; a separate decision).
11. **CV bullet at Practiced** (unchanged; pending).

## 8. Can Phase 8 safely start?

**Yes, from the claims side, with three guardrails:**
1. The Admin Track Builder must activate claim policies **only** through `setConfigActivation`, which re-checks assets atomically, never by direct updates.
2. Vocabulary edits must create a new version (the database already refuses edits to an active one).
3. No production activation of non-baseline claim policies or vocabulary without the recorded approvals.

`RISK-GROUNDING-01` remains open. It blocks **real-LLM integration** (G3 plus SME vocabulary first), not Phase 8.

> **Stopping here.** Phase 8 is not started; G3 and G4 are not started; no expert-dependent policy was activated.
