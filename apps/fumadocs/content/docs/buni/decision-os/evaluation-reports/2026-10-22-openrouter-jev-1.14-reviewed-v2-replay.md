---
title: "OpenRouter Jev reviewed v2 replay — 2026-10-22"
---

# OpenRouter Jev reviewed v2 replay — 2026-10-22

## Scope

- Provider: OpenRouter Decisions API; returned model: `typesafe/jev-1.14-20261014`
- Input: eight DRI-reviewed fixtures, including three `retrieval.graph_activation.v2` fixtures
- Credentials are omitted.

## Result

| Family             | Fixtures |     Matches |
| ------------------ | -------: | ----------: |
| Temporal v1        |        2 |           2 |
| Graph v1           |        1 |           0 |
| Graph v2           |        3 |           3 |
| Knowledge v1       |        1 |           1 |
| Initiative v1      |        1 |           0 |
| **Reviewed total** |    **8** | **6 (75%)** |

Graph v2 matched its reviewed fresh, ambiguous/unknown, and stale scenarios. Graph v1 still returned `true` for the reviewed ambiguous/stale fixture. The initiative candidate selection also returned the open candidate instead of the reviewed blocked candidate in this saved replay.

## Decision

This is release-gate evidence, but it does not authorize routing. Question families and versions remain separate: v2 results cannot repair the historical v1 mismatch, and no runtime consumer is wired to v2. Keep retrieval routing disabled. The observed candidate-selection variation also confirms that a single replay must not change advisory behavior.

Machine-readable report: [`2026-10-22-openrouter-jev-1.14-reviewed-v2-replay.json`](./2026-10-22-openrouter-jev-1.14-reviewed-v2-replay.json).
