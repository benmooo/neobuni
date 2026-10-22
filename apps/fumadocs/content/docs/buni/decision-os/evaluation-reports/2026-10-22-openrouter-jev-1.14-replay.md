---
title: "OpenRouter Jev replay — 2026-10-22"
---

# OpenRouter Jev replay — 2026-10-22

## Scope

- Provider path: OpenRouter Decisions API
- Model returned by provider: `typesafe/jev-1.14-20261014`
- Input set: five DRI-reviewed fixtures only
- Credentials: omitted from this artifact

## Result

| Family                              | Fixtures | Matches | Match rate |              Latency |
| ----------------------------------- | -------: | ------: | ---------: | -------------------: |
| `retrieval.temporal_activation.v1`  |        2 |       2 |       100% |           719–744 ms |
| `retrieval.graph_activation.v1`     |        1 |       0 |         0% |               748 ms |
| `retrieval.knowledge_activation.v1` |        1 |       1 |       100% |               733 ms |
| `initiative.best_candidate.v1`      |        1 |       1 |       100% |               675 ms |
| **Reviewed total**                  |    **5** |   **4** |    **80%** | **723.8 ms average** |

The graph-memory ambiguous/stale fixture expected `false`, while Jev returned `true`.

## Decision

This is calibration evidence, not a release approval. The retrieval-routing gate remains unmet because the evaluated sample count is below its configured minimum and the graph-memory fixture does not agree with the DRI-reviewed label. Keep retrieval routing disabled. Continue recording shadow traces and add reviewed graph-memory fixtures that distinguish entity continuity from stale or ambiguous relationship context before reconsidering the gate.

The initiative fixture matched, but a single example does not authorize any change to the existing advisory-only behavior.

The exact machine-readable result is in [`2026-10-22-openrouter-jev-1.14-replay.json`](./2026-10-22-openrouter-jev-1.14-replay.json).
