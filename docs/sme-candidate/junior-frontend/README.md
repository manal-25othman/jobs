> **DRAFT · NOT SME APPROVED · NOT PUBLISHED · NOT IMPORTED.** Candidate material for SME and Product Owner review only.
> - Nothing here is read by the importer (`data/career/`), the API or the graduate UI.
> - No value here is approved. Rubric values are intentionally blank.
> - Decision context: `docs/architecture/NAQLA-JUNIOR-FRONTEND-SME-REVISED-DECISION-PACK.md`.

# Junior Frontend: SME candidate drafts (SME-JFE-01)

| File | Purpose | Depends on decision |
|---|---|---|
| `01-role-description.md` | Updated role description | — |
| `02-skills-and-git.md` | Skill definitions, candidate classifications, Git indicators | DM-1 (Code Reading), DM-2 (required level) |
| `03-integrated-task.md` | Integrated practical task: specification + learner brief | DM-5, DM-6 |
| `04-short-tasks.md` | Short Task A and Short Task B: specifications + learner briefs | DM-3, DM-4 |
| `05-rubrics-and-evidence.md` | Proposed rubrics (no values), evidence requirements, coverage table | DM-1, DM-4, DM-7 |
| `06-readiness-and-constraints-candidate.md` | Candidate readiness rule set and pack-constraint set (text only) | DM-1, DM-2, DM-7 |
| `07-ext-1-ext-2-design.md` | Design specifications for the two readiness extensions | DM-3, DM-6 |
| `08-sme-review-checklist.md` | What the SME reviews and signs, item by item | all |

## Before any of this becomes content

1. **PO decisions.** DM-1…DM-8 (decision pack §1).
2. **SME review.** Each file reviewed and signed per `08-sme-review-checklist.md`.
3. **SRS change.** CHG-017 approved and applied, with `scripts/verify-docs.mjs` updated in the same change.
4. **Authoring.** Content authored as **non-demo draft** through the promotion and review flow: draft → curated → sme_reviewed (named SME) → approved → published (PO, separation of duties).
5. **Constraints.** The track-scoped pack-constraint set (decision pack §7.4) approved and in effect. Until then the candidate fails pack validation, by design.

**Conventions:**
- Learner-facing text is Arabic and follows the existing pack's address form.
- Specifications are English.
- Private inputs (planted bugs, mock-API behaviour) are described for reviewers only, and never shown to learners (D-119).
