# Near-Duplicate Report — trk_frontend_junior@0.2.0

Proposed by the import pipeline from normalised match keys (domain: `nearDuplicateCandidates`). **Nothing here was merged.** A person decides: merge (`status = merged_into`, never a delete), link (a `skill_synonym` relation), keep separate, or reject.

| A | B | similarity | on | decision |
|---|---|---|---|---|
| — | — | — | — | no unresolved candidates above threshold |

## Resolved (a documented human decision; the pair is no longer an unresolved candidate)

| A | B | decision | reason |
|---|---|---|---|
| `ui-state-management` | `skl_ui_state_interaction` | merge | D-097 · OPEN-039: Same concept (explicit UI state, interaction changes state, rendering follows). The pack skill has the full definition and indicators, so it is canonical; the Slice-1 skill keeps its id as an equivalent alias. Non-destructive: no row deleted, no id reused, historical evidence untouched. |
