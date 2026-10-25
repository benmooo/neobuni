# Decision OS experiments (archived)

This directory holds the Decision OS research surface that was removed from the
production runtime during the P1 "Decision OS slimming" refactor (2026-10-25).

Archived here:

- Jev provider, Jev settings, and the OpenRouter Jev adapter.
- Retrieval routing, retrieval shadow, evidence-relevance shadow, next-action
  shadow.
- Release gates, evaluation fixtures, evaluation replay, and decision evaluation
  summaries.
- Heuristic interruption policy that only existed to feed the shadow decisions.

Why it is archived rather than deleted:

- The learning-focused Initiative (see
  `docs/workbench/features/initiative-study-journey.md`) does not need any of
  this. Its decisions are deterministic: pick the next small study step.
- The code is kept for future evaluation work, but it is **not** part of a
  workspace, is not compiled, and is not covered by CI. It may reference
  contracts that no longer exist.

Do not import anything from `experiments/` in `apps/` or `packages/`.

If a future feature needs this again, revive it deliberately: re-add it as a
workspace, restore the contracts it needs, and put it behind a measured rollout
instead of wiring it back into the main path.
