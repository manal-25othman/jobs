# نَقْلة / NAQLA — **Phase 7 Closure & Risk Report**
**Date:** 2026-10-08 · **Phase 7 status:** implementation **accepted by the Product Owner, with required follow-ups** · **Decision:** D-114 · **Phase 8 not started.**
**Companion documents:** `PHASE-7-CAREER-CLAIMS-REPORT.md` (implementation) · `CLAIM-TO-FACT-GROUNDING-DESIGN.md` (proposal, not implemented)

---

## 1. REC-006 — partial closure (corrected record)

| | |
|---|---|
| **Resolved** | The **documented regression scenarios**: REC-006 candidates 1–3 in the harness, and the outcome wordings listed in `grounding.test.ts` (5 English, 4 Arabic, each confirmed to be caught by the outcome guard itself). `known_gap` was removed because the harness requires it once the scenario passes. |
| **Open — `RISK-GROUNDING-01`** | The broad semantic grounding risk. The outcome, professional-work and credential checks are **pattern lists**; a paraphrase outside them passes. **30/30 harness scenarios prove the documented regressions are fixed. They do not prove comprehensive protection against unsupported outcome or achievement claims.** |
| **Required before a real LLM** | The general Claim-to-Fact Grounding design (`CLAIM-TO-FACT-GROUNDING-DESIGN.md`): a typed fact set, an assertion taxonomy, a declared claim plan checked for coverage and support, independent detectors that do not trust the plan, AR/EN parity, a three-outcome result that preserves the original, and a gold-corpus test strategy with PO/SME thresholds. **Proposed only; no implementation without approval.** |

The Phase 7 report, the harness report, AI-BOUNDARY and D-114 now use this wording.

---

## 2. CV-bullet eligibility — compatibility preserved

| Item | State | Verified by |
|---|---|---|
| Active rule | `legacy_presentation@1 cv_bullet` = **demonstrated**. This is `presentationFor()`-equivalent: at practiced, the CV allows a **project description only**. | Exhaustive equivalence test; baseline rows = `LEGACY_PRESENTATION_BASELINE` (e2e) |
| Conflicting draft rule | `career_presentation_rule cv_bullet@practiced allowed=true` (demo, **draft**) and the code constant `PRESENTATION_MINIMUM_LEVEL.cv_bullet = 'practiced'`. **Neither is read by claim eligibility.** No active cv_bullet policy below demonstrated exists. | New e2e guard: the conflicting row is present and draft, no active cv_bullet policy is below demonstrated, and a practiced skill still gets **no** CV bullet, LinkedIn skill or case study |
| Pending decision | Whether "CV bullet at practiced" was meant as a **project description** ("worked on…" wording). The canonical pack §12.1 says: *minimum Demonstrated; Practiced → «عمل على» only*. That matches the current model. **Pending expert + PO validation; nothing is activated.** | — |
| Kinds kept distinct | `project_description` and `linkedin_project` are **mentions**: they never assert a skill. Skill assertions need the policy level. **Verified achievements** do not exist as a claim kind (`professional_profile` needs verified, and verified is blocked). | Domain + e2e |

---

## 3. CHG-016 — proposed, **not applied**

**Proposed wording (SRS-001 §7, functional only, implementation-agnostic):**

> **BR-026** — **تُعرض الصياغة المهنية (سيرة ذاتية · لينكدإن · ملف أعمال · دراسة حالة) بوصفها مدعومة بدليل ما دام الدليل الذي تستند إليه قائمًا ويستوفي قاعدة العرض السارية لنوعها.** قواعد العرض مُصدَّرة، وأي قاعدة غير قاعدة التوافق تتطلب مصادقة صريحة قبل تفعيلها، وكل صياغة معتمدة تحتفظ بالقاعدة التي اعتُمدت بموجبها. **لا تتضمن صياغةٌ** أثرًا أو نتيجة أو رقمًا أو عملًا مهنيًا (جهة عمل · عميل · استخدام فعلي · مسمّى · أقدمية · سنوات خبرة · شهادة) أو تقنية **لا يسجّلها الدليل الذي تستشهد به**. وصف مشروع مُقدَّم لا يُعرض إثباتَ مهارة، وإكمال نشاط لا يُعرض إنجازًا مهنيًا. إذا سُحب الدليل أو أُبطل مصدره أو لم تعد الصياغة تستوفي القاعدة السارية، **تتوقف عن العرض بوصفها مدعومة بدليل** ويُبلَّغ المستخدم بالسبب، **دون حذف السجل ودون تعديل الاعتماد التاريخي**.
>
> *EN:* A professional statement (CV, LinkedIn, portfolio, case study) is presented as evidence-backed only while the evidence it relies on stands and meets the presentation rule currently in effect for its kind. Presentation rules are versioned; any rule other than the compatibility baseline requires explicit approval before activation; every approved statement keeps the rule it was approved under. No statement asserts an outcome, result, number, professional engagement (employer, client, real use, title, seniority, years, certification) or technology that the cited evidence does not record. A submitted project is not presented as proof of a skill, and a completed activity is not presented as a professional achievement. When the evidence is withdrawn, its source is invalidated, or the statement no longer meets the rule in effect, it stops being presented as evidence-backed and the user is told why — without deleting the record or altering the historical approval.
>
> **DR-019** — **كل صياغة مهنية معتمدة تُحفظ مع مراجع أدلتها وقاعدة العرض بإصدارها وتاريخ قرار المستخدم؛ وكل تغيّر لاحق في صلاحية عرضها يُسجَّل حدثًا مستقلًا ولا يعدّل السجل الأصلي.**
> *EN:* Every approved professional statement is stored with its evidence references, the versioned presentation rule, and the user's decision time. Any later change in whether it may be presented is recorded as a separate event and never alters the original record.

**Affected requirements**

| Requirement | Effect |
|---|---|
| BR-021 (claim flow) | Complemented, unchanged. BR-021 governs *how* a claim is made; BR-026 governs *when it may be presented as evidence-backed*. |
| FR-U-052 · FR-A-007 (CV/LinkedIn wording "no invention") | Acceptance criteria made precise by BR-026's list. Requirement text unchanged. |
| FR-U-053 · FR-U-055 (LinkedIn suggestion · case study) | Fall under BR-026. |
| FR-U-054 (source of each statement) | DR-019 supplies the record it displays. |
| FR-U-057 (user edit drops the verified tag) | Consistent; unchanged. |
| BR-023 (activated, versioned configuration) | Applied to presentation rules. Unchanged. |
| XR-003 (claim lifecycle not per-track) | Unchanged; the rule is track-agnostic. |
| Traceability matrix | New row `CHG-016 · D-114 · BR-026 · DR-019`. Changelog row v1.11. |

**Business justification.**
1. **The product promise (D-106, "from skill to evidence")** fails the first time a recruiter finds an invented outcome or employer on a NAQLA-backed CV.
2. **Graduates are the most exposed to overclaiming:** an unsupported line lowers recruiter confidence (frozen design §8) and can be a misrepresentation risk for the user.
3. **Configurability without code:** experts tighten presentation rules as data, and history stays explainable.
4. **It closes a gap** where an approved line could otherwise keep being shown as evidence-backed after its basis changed.

**Status:** awaiting explicit approval. SRS stays at v1.10 until then.

---

## 4. Already-approved assets — required treatment

**The model has two axes and never merges them:**

- **Approval** is history. It records who approved what wording, under which policy version, and when. It is immutable and never rewritten.
- **Current standing** is derived: whether the asset may *now* be presented as evidence-backed. It is recorded as events, can be restored, and is shown to the user with the reason.

Presentation surfaces read **standing**: the recruiter report, the public projection, the "current wording" in comparisons, and any future export.

| Trigger | Required treatment | Implemented today? |
|---|---|---|
| **Supporting evidence withdrawn** | Standing → `needs_review` (`evidence_backed = false`, reason recorded, user notified). Excluded from the recruiter report and live share links at once. Body and approval untouched. Restored only by an explicit re-link to independently qualifying evidence. Waiting drafts citing the evidence are flagged and cannot be approved. | **Yes** (D-077 + Phase 7), e2e-verified |
| **New policy version becomes active** | **Re-check every active asset of that kind against the new policy** at the moment of activation. Ineligible assets → `needs_review` with reason «اعتُمدت وفق قاعدة سابقة ولم تعد تستوفي القاعدة الحالية» ("approved under an earlier rule; no longer meets the current rule"). Approval record and original policy reference kept. One standing event per asset. The user can re-link, revise (a new draft), or retire. No automatic rewrite. | **No.** Today assets keep `active` and stay presented. (The current e2e test asserts that behaviour; its asset assertion will change to `needs_review` when the re-check is built, while its no-rewrite assertions stay.) **Latent only:** no non-baseline claim policy is active, and activation needs PO approval. **Gate:** no claim-policy version other than the baseline may be activated in production until this re-check exists. |
| **Evidence source invalidated** (e.g. an evaluation later found invalid by an authorised reviewer) | Same as withdrawal, reason «أُبطل مصدر الدليل» ("the evidence source was invalidated"). Triggered only by an **explicit, audited invalidation act** by an authorised role — never by an integrity signal alone (BR-025: signals have no outcome effect without an approved policy). | **No invalidation path exists in the product**: results are never overturned after finalisation, and the ladder is forward-only. Nothing to handle today; any future invalidation feature must include this cascade. |
| **Originally supported claim becomes unsupported** (e.g. the grounding version improves and an approved wording now fails) | Explicit, audited **re-validation run** per grounding version. Failing assets → `needs_review` with the failing assertion explained. Never deleted, never rewritten, never re-approved automatically. | **No.** Becomes relevant when grounding checks change (G1–G2). Must ship together with any grounding-version change that applies to approved assets. |

**Invariants (all triggers):**
1. No deletion.
2. No change to `body`, `user_approved_at` or the original policy reference.
3. Never presented as evidence-backed while in `needs_review`.
4. The reason is visible to the user in plain Arabic.
5. Every standing change is an audit event.
6. Returning to `active` needs an explicit user act that passes current checks.

---

## 5. Closure review — classification

### Implemented and verified
- Claim drafts for all eight kinds, built on the Recruitment Agent proposal path. Evidence refs, current/proposed wording, grounding status and report, exact policy row, append-only history. RLS owner-only.
- Policy-driven eligibility, with **exact `presentationFor()` equivalence** (exhaustive) and baseline rows equal to the constant. Rollback by deactivation is tested.
- CV bullet requires demonstrated; the conflicting draft rule is not consumed (new guard test).
- Approval re-checks against the policy active at approval; refusals are recorded. Rejections are kept with reasons. Withdrawal flags waiting drafts and moves active assets to `needs_review`.
- Deterministic checks: unrecorded numbers, undeclared technologies (scoped to the cited work), credentials/employment/seniority/years, professional-work claims, skills written in text, documented outcome phrasings (REC-006 regression set).
- History byte-identical (md5). The recruiter report is unchanged (CV bullets only). Frozen design untouched.
- Tests: domain 212 · config 9 · agents 92 · harness 30/30 · e2e 140 (the cv_bullet guard was added inside an existing test) · DB proofs · verify · front-end build.

### Safely deferred
- Detector lexicons as versioned data (code constants today).
- Unifying `track_config_version.claim_policy_ref` with per-kind resolution.
- A production case-study policy: production refuses case studies, which is safe.
- Per-kind count, source-strength or verification-decision thresholds (none set).
- External publishing (none exists).
- Correcting the demo fixture and `PRESENTATION_MINIMUM_LEVEL` once the cv_bullet@practiced decision is made.

### Blocking real LLM integration
1. **`RISK-GROUNDING-01`:** Claim-to-Fact Grounding G1–G3 (design approval, then build, then gold-corpus thresholds).
2. **OPEN-023:** provider, data-processing terms, data residency and cost approval.
3. A full harness and pre-LLM rehearsal (T9) with the real model under the gate, reported to the PO.
4. Re-verifying redaction of agent context for the real provider (Phase 7 added the `claimRequest` context key; redaction rules are otherwise unchanged, but must be re-proven against a real provider).

### Blocking production deployment
1. **Live Supabase verification:** still blocked; everything is proven on local PostgreSQL only.
2. **No production draft generator:** the only provider is TEST/NON-PRODUCTION and the gateway refuses it under `NODE_ENV=production`, so claim drafts cannot be generated in production. Two options: (a) a real provider, which inherits all LLM blockers; or (b) promote the fact-only template drafter to a production deterministic generator, which needs a PO decision but no model.
3. **The asset re-check on policy activation (§4)** must exist before any non-baseline claim policy is activated in production. It does not block deploying the baseline.
4. **CHG-016** approved and applied, so the requirement the behaviour implements is in the SRS.
5. The `legacy_presentation@1` baseline runs in production **unvalidated** by design (BR-023 exception). This must be acknowledged at go-live.

### Dependent on SME / Product Owner decisions
- CHG-016 (BR-026, DR-019): approve or amend.
- cv_bullet@practiced semantics (§2).
- Every claim-policy value; a case-study production policy.
- Grounding design: three-outcome model; whether `ARTIFACT` claims need facts; false-accept/false-reject thresholds; lexicon ownership; user-wording rule; whether to use a Layer C classifier at all.
- Whether an evidence-invalidation act should exist, and who may perform it.
- Production draft generator: deterministic templates versus a real provider.

---

## 6. Recommended next action

1. **Approve or amend CHG-016.** On approval it will be applied as SRS v1.11, with traceability, functional only.
2. **Approve the Claim-to-Fact Grounding design** and authorise **G1 + G2** as a bounded follow-up (no model, no dependency, no cost), together with the **asset standing re-check on policy activation** from §4, as a closing "Phase 7b". Add G3 once SME capacity for the gold corpus is confirmed.
3. **Phase 8 (Admin Track Builder) may then start**. It does not touch claim grounding, with one guard: the Track Builder must **not expose claim-policy activation** until the §4 re-check exists.
4. Record the cv_bullet@practiced question for the next SME session; no change before it.

> **Stopping here.** No Phase 8 work, no new policy activation, no refactor.
