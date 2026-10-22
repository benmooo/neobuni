---
title: "OpenRouter Jev graph-memory v2 draft observation — 2026-10-22"
---

# OpenRouter Jev graph-memory v2 draft observation — 2026-10-22

## Scope

- Provider path: OpenRouter Decisions API
- Model returned by provider: `typesafe/jev-1.14-20261014`
- Input set: five DRI-reviewed v1 fixtures plus three engineering-authored, **draft** `retrieval.graph_activation.v2` fixtures
- Credentials: omitted from this artifact

## Observation

| Question family                 | Review status | Fixtures | Matches | Match rate | Latency    |
| ------------------------------- | ------------- | -------: | ------: | ---------: | ---------- |
| Reviewed v1 families            | reviewed      |        5 |       4 |        80% | 617–644 ms |
| `retrieval.graph_activation.v2` | draft         |        3 |       3 |       100% | 648–674 ms |

The v2 draft scenarios cover: a fresh explicit relationship query (`true`), an ambiguous/freshness-unknown relationship query (`false`), and a stale ownership query (`false`). Jev matched all three engineering-authored expected values in this single observation.

## Decision

This document is **not release-gate evidence** for graph-memory v2: the three v2 labels are drafts and have no DRI review evidence. It neither alters the Settings routing controls nor authorizes Jev to select a retrieval store. The v1 ambiguity mismatch remains unresolved, and every existing gate remains in force.

Before v2 can contribute to a release decision, its DRI must review each label and rationale, the reviewed suite needs broader language and failure-mode coverage, and shadow traces must satisfy the configured family gate.

The exact machine-readable observation is in [`2026-10-22-openrouter-jev-1.14-graph-v2-draft-observation.json`](./2026-10-22-openrouter-jev-1.14-graph-v2-draft-observation.json).
