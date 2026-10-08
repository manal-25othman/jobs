# نَقْلة / NAQLA — Claim-to-Fact Grounding · **Design Proposal (not implemented)**
**Date:** 2026-10-08 · **Status:** accepted in principle (Product Owner, 2026-10-08). **G1 + G2 implemented in Phase 7b** (D-115 · `PHASE-7B-GROUNDING-AND-STANDING-REPORT.md`). G3 and G4 are not started and need approval. · **Closes, when built:** `RISK-GROUNDING-01` (the broad semantic grounding risk behind REC-006) · **Blocks:** any real LLM integration (OPEN-023)

> **Why this exists.** Phase 7 rejects unsupported numbers, technologies, credentials, employment, professional-work claims and *listed* outcome phrasings. All of those checks are pattern lists over free text. A paraphrase outside the lists passes. Passing 30/30 harness scenarios shows the documented regressions are fixed; **it does not show comprehensive protection.** A real model writes paraphrases by default, so pattern lists cannot be the primary defence.

---

## 1. Principle — المبدأ

**Every factual assertion in a professional claim must point to a recorded fact that supports it, or the claim is not presented as evidence-backed.**

The question changes from "does this text contain a forbidden phrase?" (blacklist, open-ended) to "is every assertion in this text accounted for by a fact?" (allow-list, closed). Unsupported content is anything not accounted for — however it is worded.

---

## 2. Facts — الوقائع (closed, typed, from records only)

A **claim fact set** is built per draft from the evidence the draft cites. It is read-only and deterministic.

| Fact kind | Source record | Example surface forms (AR / EN) |
|---|---|---|
| `project` | `project` (title, kind: learning activity / personal) | «متتبّع عادات» / "Habit tracker" |
| `deliverable` | `submission_artifact` keys (as declared by the activity) | «حالات الفراغ والتحميل والخطأ» / "empty, loading and error states" |
| `criterion_met` | `assessment_criterion_result` / `evaluation_criterion_score` (met only) + criterion label | «اختبار حالة الخطأ» / "error-state test" |
| `evaluation` | `evaluation_result` (rubric version, total/max) | «قُيِّم وفق معيار منشور · 4/4» / "evaluated against a published rubric · 4/4" |
| `skill_level` | `skill_claim` state + evidence ids | «اختبار الواجهات — مُثبَتة» / "UI testing — demonstrated" |
| `technology` | `declared_technologies` on the cited project / its submissions | "React" |
| `context` | activity spec (simulated environment, learning track) | «في بيئة تدريب مُحاكاة» / "in a simulated training environment" |
| `verification` | `verification_decision` (when a policy requires it) | — |

**Deliberately absent** (no record exists, so no claim can be supported): measured outcomes/impact, users or customers, clients or employers, production use, job titles, seniority, years of experience, certifications. If the product later records any of these (e.g. a verified internship), it becomes a new fact kind with its own source — never inferred from text.

---

## 3. Assertions — الادعاءات (closed taxonomy)

A claim is decomposed into **assertions**, each with a type, its text span in each language, and the facts it relies on.

| Assertion type | Supported by | Without a supporting fact |
|---|---|---|
| `ACTION` — what the user did (built, tested, fixed, wrote, refactored) | `project` + `deliverable`/`criterion_met` | **unmapped** → needs revision |
| `ARTIFACT` — what exists or how it behaves ("handles the error state") | `deliverable` / `criterion_met` | **unmapped** → needs revision |
| `EVALUATION` — evaluated, criteria met, score | `evaluation` / `criterion_met` | **refused** |
| `SKILL` — can do X | `skill_level` ≥ claim policy level | **refused** |
| `TECHNOLOGY` — used T | `technology` on the **cited** work | **refused** |
| `NUMBER` — any quantity, digits or words | the exact recorded number | **refused** |
| `OUTCOME` — effect on users, team, business, performance | an outcome fact (none exist today) | **refused** |
| `PROFESSIONAL_CONTEXT` — employer, client, production, users, title, seniority, years, certification | a context fact of that kind (none exist today) | **refused** |
| `QUALITY` — "robust", "scalable", "production-ready", "expert", «احترافي» | a criterion that states it | **refused** |
| `FRAMING` — connectives, the user's role as a learner ("as part of a learning track") | — (no factual content) | allowed |

**Conservative, not over-strict.** Three outcomes, not two:

- **grounded** — every assertion is supported. The draft may be approved as evidence-backed.
- **needs revision** — only *low-risk* assertions (`ACTION`, `ARTIFACT`) are unmapped. Shown to the user with the unmapped clause highlighted and a **trimmed version** that drops it. Not approvable as evidence-backed until revised.
- **refused** — any *high-risk* assertion is unsupported (`NUMBER`, `OUTCOME`, `PROFESSIONAL_CONTEXT`, `TECHNOLOGY`, `SKILL`, `QUALITY`, `EVALUATION`). Nothing is suggested that adds content.

This keeps ordinary project descriptions ("Built the habit list in React with tests for the empty, loading and error states") passing, because each clause maps to `ACTION` / `TECHNOLOGY` / `deliverable` facts.

---

## 4. How assertions are found — three independent layers

### Layer A — Declared claim plan (generator-side, structured)
The generator — the local template today, a model later — must return a **claim plan** with the wording: a list of assertions, each with type, fact ids, and the exact span in the Arabic and English text. Validation checks, deterministically:

1. **Span coverage.** Every token of the wording belongs to a declared span or to the `FRAMING` vocabulary. Uncovered text means an **unmapped clause**.
2. **Fact support.** Each span's facts exist, belong to the cited evidence, and satisfy the assertion type's rule. For example, a `NUMBER` span's value must equal a recorded number, and a `TECHNOLOGY` span must name a technology declared on the cited project.
3. **Surface consistency.** A span must lexically contain its fact's surface form, or an approved variant of it (normalised Arabic, clitics stripped, case-folded English). A span saying "React" cannot cite a fact that says "Vue".
4. **Cross-language parity.** The Arabic and English versions must carry the **same assertion set**: the same types and the same facts. English cannot add what the Arabic does not say, or the reverse.

The plan turns "find unsupported meaning in free text" into "verify a declared mapping", which deterministic code can do.

### Layer B — Independent detectors (verifier-side; does not trust the plan)
The detectors already built in Phase 7 run over the **whole** wording, regardless of the plan:

- numbers (including number words)
- technology terms and aliases
- skill labels (longest first)
- credential, employment and professional-work patterns
- outcome patterns

Any detection that is **not covered by a declared assertion of the matching type** refuses the draft. This catches a generator whose plan lies (for example, a span labelled `ACTION` that contains "which cut support tickets").

The pattern lists become **versioned, reviewable data** (bilingual entries with lemma and affix rules, owned by an SME), not code constants. They are only one layer of defence, not the whole of it.

### Layer C — Optional semantic classifier (only after provider approval)
A model labels each clause's assertion type. Its role is strictly limited:

- **It can only add problems.** It can turn "grounded" into "needs revision" or "refused". It can never turn a Layer A or B failure into a pass, and its "supported" never stands in for a missing fact.
- **Disagreement goes to the conservative side.** If the classifier sees an `OUTCOME` the plan did not declare, the result is **refused**, with an explanation.
- **It is labelled model-assisted** in the grounding report. It is evaluated on the gold set (§7) before use, and its results are recorded with the model version.

**User-edited wording has no plan.** Layers B and C run on it. Unmapped low-risk text in a user's own edit is allowed, but the item is labelled **user wording, not evidence-backed** (FR-U-057 already drops the generated tag). High-risk detections refuse the edit, as they do today.

---

## 5. Output and explanation — what the user and the auditor see

Each draft records a grounding result. This is an extension of the current `grounding_report`, with a schema version bump.

```
GroundingResult {
  decision: grounded | needs_revision | refused
  grounding_version            // fact builder + plan validator + detector-data versions
  original: { ar, en }         // always preserved, never overwritten
  assertions: [{ type, span_ar, span_en, status: supported | unmapped | unsupported,
                 facts: [fact ids], missing: "what fact would support this" }]
  detections_uncovered: [{ layer: B | C, kind, span }]
  suggested_trim: { ar, en } | null   // deletions of unmapped spans only; never adds content
}
```

The user sees, in plain Arabic, the reason a clause is a problem. For example: «هذه الجملة تذكر أثرًا على المستخدمين، ولا يوجد قياس مسجّل له» ("This sentence mentions an effect on users, and no measurement of it is recorded"). They also see which evidence would support it, if any could. Nothing is rewritten automatically; the original stays in the record.

---

## 6. Where it plugs in — reuse, no new engine

- `WordingPayload` gains `claimPlan`; this is proposal schema `1.4.0`.
- `validateAgainstDomain` delegates its wording checks to the grounding validator. The current named checks become Layer B.
- `claim_draft_event` records grounding decisions.
- The approval path re-runs grounding against the current facts, as it already does for the existing checks.
- The local test provider emits plans for its templates. This proves the contract with no model.
- No change to the claim-policy layer, the approval flow, or the evidence ladder.

---

## 7. Test strategy

| # | Suite | What it proves | Pass condition |
|---|---|---|---|
| T1 | **Unit, per assertion type × language × supported/unsupported** | Each support rule, in Arabic and English | All pass |
| T2 | **Plan-validator tests** | Coverage holes, a lying plan (outcome inside an `ACTION` span), a fact from non-cited evidence, AR/EN parity mismatch, surface mismatch | Each case is refused or unmapped, as specified |
| T3 | **Gold corpus** (SME-written + adversarial; bilingual; ≥ 300 clauses to start; split into dev and a **held-out set nobody tunes on**) | False accepts on high-risk types; false rejects on ordinary project descriptions | **Thresholds set by the PO/SME, not by engineering.** Proposed starting point: 0 false accepts on held-out high-risk clauses; false-reject rate on ordinary descriptions reported and approved |
| T4 | **Metamorphic** — paraphrase, reorder, synonym swap, Arabic clitic/diacritic variants, AR↔EN swap, number in words vs digits | The decision never flips from refused to grounded under meaning-preserving edits | No flips |
| T5 | **Property-based** — random concatenations of supported clauses stay grounded; inserting any high-risk unsupported clause flips the result to refused | Composition is safe | 100% |
| T6 | **Regression** — all 30 harness scenarios plus the REC-006 family, kept as **documented regression scenarios** with a new `REC-006-broad` set drawn from T3 | Nothing that passes today regresses | All pass |
| T7 | **Layer C contract** (if approved) | The classifier can only add rejections; its "supported" never overrides a missing fact; disagreement is conservative | All pass, with model-assisted labelling |
| T8 | **End-to-end** — preview shows assertions and missing facts; approval refuses; original preserved; trim suggested; history recorded | Product behaviour | All pass |
| T9 | **Pre-LLM rehearsal** — the real model drafts against T3 prompts; the full suite is measured before any user sees model output | Real-model behaviour under the gate | Reported to the PO before go-live |

**Reporting rule:** a harness pass rate is never presented as comprehensive protection. Reports state the held-out false-accept and false-reject figures and the corpus size.

---

## 8. Proposed delivery (each step needs approval)

| Step | Scope | Model needed? |
|---|---|---|
| **G1** | Typed claim fact set + assertion taxonomy + claim-plan contract + plan validator (Layer A) + local-provider plans + T1/T2/T6/T8 | No |
| **G2** | Detector lexicons as versioned bilingual data with SME ownership + coverage check against plans (Layer B) + T4/T5 | No |
| **G3** | Gold corpus with SME + measurement harness (T3) + thresholds approved by PO | No |
| **G4** | Optional Layer C classifier (T7, T9) | **Yes — needs OPEN-023 and cost approval** |

G1–G3 add no provider, dependency or cost.

## 9. Decisions needed — Product Owner / SME

1. Approve the three-outcome model (`grounded` / `needs_revision` / `refused`). Alternative: a two-outcome model, which is stricter and rejects more ordinary descriptions.
2. Whether `ARTIFACT` behaviour claims ("never renders a blank screen") need a matching criterion or deliverable fact, or are only low-risk.
3. The acceptable false-reject rate on ordinary descriptions, and the false-accept target on high-risk types.
4. Who owns and reviews the bilingual detector lexicons.
5. Whether user-edited wording with unmapped low-risk clauses may be kept as **user wording (not evidence-backed)**.
6. Whether a Layer C classifier is wanted at all, and under which provider terms.
