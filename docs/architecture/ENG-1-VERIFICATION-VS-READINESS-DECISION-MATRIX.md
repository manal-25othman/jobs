# نَقْلة / NAQLA — Verification Level vs Job Readiness: Audit and Decision Matrix

**Date:** 2026-10-18 · **Scope:** PO "Post-P4 Approval and Pre-P6 Readiness Gate", Task B.

**Status:** analysis only. No level semantics, policy, claim policy, SRS or SME content was changed. **Waiting for Product Owner approval.**

---

## 1. The question

**Can the current model award Demonstrated from one assessment while the SME evidence path requires two independent tasks?**

**Yes.** This is by design in the current proposal, not a defect. Whether it is the correct professional design has never been explicitly confirmed by the SME (§4).

| Fact (as built) | Where |
|---|---|
| Every rubric in the system proposes `demonstrated` (`rubric_version.proposes_state`). No activity proposes `practiced` | DB, all five rubric versions |
| **Per-skill pathway (development only).** One claimed skill, `met` on an independently verified basis, with a policy that accepts rubric proposals ⇒ `accepted` ⇒ Demonstrated, from **one** assessment | `per-skill-assessment.ts` `decideSkillAssessment`; `evaluation.service.ts` `applyPerSkill` |
| **Legacy pathway (`default@2` safety baseline).** The primary claimed skill of a passed, independently verified (human-reviewed, values-approved) evaluation ⇒ Demonstrated, from one assessment | `decideWithPolicy`; D-118 |
| The policy knob `min_independent_evidence` exists but is **null** in every policy. It counts standing primary evidence rows of the skill (+1). It cannot tell two independent tasks from a repeat. **It is not an independence rule** | `verification-policy.ts` step 2 |
| Practiced is not awarded on submission (D-118, Phase A), and no rubric proposes it. **Practiced is therefore unreachable today** for this track | D-118; `verification_policy_no_submission_promotion` |
| The "2 distinct tasks" of the SME table is implemented **only** as a readiness rule: EXT-2 `skill_evidence_path` (sealed) | `evidence-path.ts`; 0030 |
| A second independent task on a skill already at Demonstrated leaves **corroborating** evidence. It never changes the level and never supports a claim (D-126) | 0031 |

So, for a graduate who completes only the integrated task:
- HTML can be **Demonstrated**.
- The EXT-2 path P-HTML is **not satisfied** (one task of two).
- Readiness is therefore **not met**.

The model keeps these apart. It does not assume they are the same thing.

---

## 2. Decision matrix — four different requirements

Each row is a separate record with separate rules. None implies another unless the "Implies" column says so.

| | **(1) Assessment met** (per skill) | **(2) Practiced / Demonstrated** (verification level) | **(3) Independent corroborating evidence** | **(4) Overall job readiness** |
|---|---|---|---|---|
| **Record** | `skill_assessment.outcome = met` (+ its criterion rows) | `skill_claim.state`, changed only through `evidence_transition` by an `accepted` decision | `evidence` row with `evidence_role = 'corroborating'` + an `evidence_corroborated` decision | A readiness report from a rule set (`readiness_evaluation` snapshot when recorded) |
| **Requirements as built** | The skill's **own** applicable criteria met at their **approved, representable** thresholds; the gate precondition met; basis independently verified: human criteria decided by a named reviewer, approved non-demo rubric values, no client-supplied verified artifacts. Unclaimed ⇒ observation only | A verification policy decision. **Validated** policy in production; development-only `per_skill` policy in development. Basis `independently_verified`; rubric proposes the state; caps and confidence floor if configured; not an LLM. **One** met assessment suffices; no count or independence is required | Already at the level the rubric proposes, on **standing primary** evidence. Claimed, met, verified, no proposal. Policy flag on (development only). **Not** a duplicate: same event, submission, activity, variant family, reused upload or text (`naqla-text-fp-v1`), against standing or withdrawn evidence. Never in production | Rule set (SME model C5): all Must at the required level + all Core at the Junior minimum + the integrated assessment passed. Plus, per skill, an EXT-2 evidence path (2 independent tasks, or 1 for Git and A11Y). **Sealed**: never `evaluated`, never production |
| **Approved values today** | Mechanism built (P1–P3). **Thresholds: none approved** (SME calibration) | Production: `default@2` legacy-scope baseline. Per-skill policy: unapproved draft. **DM-2 (which level readiness requires): open** | PO-approved in development only (D-126) | Rule set: not created. DM-2, DM-6 and path values: open |
| **Implies (2)?** | No. Only a policy decision moves a level; pending validation, a cap or an unclaimed skill hold it | — | **Never** | **Never** (BR-024: readiness never changes a level) |
| **Implies (4)?** | No | No. It is one input | No. EXT-2 may count it as a task | — |
| **Supports a CV / LinkedIn claim?** | No | Yes, through claim policies (`min_evidence_level`; `accepted` / `evidence_reestablished` decisions) | **No** (CLM-1 unchanged, DB guards; PO decision 2) | No (claims never read readiness) |
| **Can withdrawal undo it?** | No (history) | Withdrawal ends the evidence's standing. The level is not lowered automatically (D-077: it can be re-established) | Yes: it ends standing for EXT-2; history is kept | Recomputed live from standing facts |

**Separate axes (decision pack §G):**
- *Proficiency* (`foundation` / `working`) is carried by calibrated thresholds and level descriptors.
- *Verification level* (Practiced / Demonstrated) is the claim state.
- The plan (§5.4) recommended **not** mapping `foundation` to Practiced. Today nothing maps them.

---

## 3. Consequences to confirm (no change made)

| # | Consequence of the current design | Why it matters |
|---|---|---|
| K-1 | A graduate can hold **Demonstrated** in a Must skill from one task while **not** job-ready for lack of the second task | Intended if "2 tasks" is a readiness requirement. Wrong if it is a level requirement |
| K-2 | A **CV / LinkedIn claim** at Demonstrated can be drafted after **one** task (claim policies read the level; `cv_bullet` and `linkedin_skill` need `demonstrated`) | If the SME meant "Demonstrated needs two tasks", claims would currently be issued on half the evidence |
| K-3 | A claim policy with `min_evidence_count = 2` (proposed "if approved later" for `linkedin_skill` in the integration plan §11) **can never be met by the two-task path**. The second task at the same level leaves corroborating evidence, which claims exclude (D-126). It would count only a re-established or a lower-then-higher pair | That proposal must be replaced by an explicit claim-policy decision (open item A-1b). Not applied anywhere today |
| K-4 | `min_independent_evidence` on a verification policy is **not** independence-aware (row count). It must not be used to encode "two independent tasks for Demonstrated" | If L-2 (§4) is chosen, it needs a new, independence-aware level rule (EXT-2 logic) and its own approval |
| K-5 | Practiced is unreachable for this track. Under V-b (Core at Practiced), Core skills still reach Demonstrated directly from one task | DM-2 V-b does not make readiness easier |

---

## 4. The exact professional decision that requires SME confirmation

> **SME-Q1:** For each Must and Core skill whose minimum is **2** distinct practical tasks (SME table: «Must · Working · 2 · Task»; C3: «مشروع عملي مع مهمة قصيرة مستقلة»), does the requirement of **two independent tasks** define:
> - **(L-1)** what is needed for the skill to **count toward Junior job readiness**, with the **Demonstrated** level awardable for one independently assessed task that meets the skill's approved criteria? *(current proposal)* or
> - **(L-2)** what is needed to **award Demonstrated** itself, so that one task alone may award at most a lower level, or none? or
> - **(L-3)** both?

The SME's sources do not settle it:
- The form row gives a count and an evidence type, not the level it applies to.
- C3 and C5 speak about readiness («جاهزًا»).
- SME-25 speaks about criteria that block Demonstrated, within one assessment.

The interpretation L-1 was made in the plan (§5.3–5.4) and the decision pack (§E, §G). **The SME has not explicitly confirmed it.**

**What each answer changes (no change without a separately approved change request):**

| Answer | Verification level | Readiness | Claims | Engineering |
|---|---|---|---|---|
| **L-1** | Unchanged (one task ⇒ Demonstrated) | EXT-2 paths as built | CV / LinkedIn may follow one task (K-2). Confirm with the claim-policy decision A-1b | None beyond the P6 approvals |
| **L-2** | One task ⇒ at most Practiced (or no change); the second independent task ⇒ Demonstrated. Needs the SME to define what one task awards | EXT-2 becomes largely redundant (level already requires two) | Claims at Demonstrated automatically need two tasks | New independence-aware level rule (reusing `evidence-path.ts`). A rubric proposing Practiced for single tasks, or a policy cap with an upgrade path. A new policy version, change request and approval. **Changes existing level semantics** |
| **L-3** | As L-2 | As built | As L-2 | As L-2 |

**Linked PO decisions (not SME):** DM-2 (V-a / V-b / V-c) and A-1b (whether corroborating evidence may ever support a claim). They must be decided **after** SME-Q1, because K-2 and K-3 depend on it.

---

## 5. What was verified, and how

- The facts in §1 were read from the code and the database (all rubric `proposes_state`, all policy and claim-policy rows on the e2e database).
- The scenario in §1 is exercised by the existing e2e:
  - P4 test 1: one task ⇒ `accepted`, Demonstrated; EXT-2 needs a second task.
  - Tests 2 and 6b: a project alone does not satisfy a two-task path; corroborating evidence does not grant a claim.
- **No level semantics, policy, claim policy, SRS or SME content was modified.**
