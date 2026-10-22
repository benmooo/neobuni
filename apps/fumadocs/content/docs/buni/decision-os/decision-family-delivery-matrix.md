---
title: "Decision family delivery matrix"
---

# Decision family delivery matrix

> Updated: 2026-10-22

| Family                              | Runtime state                                                            | Label state | May affect behavior                          | Remaining release evidence                                           |
| ----------------------------------- | ------------------------------------------------------------------------ | ----------- | -------------------------------------------- | -------------------------------------------------------------------- |
| `retrieval.temporal_activation.v1`  | Shadow; guarded suppression implementation exists                        | Reviewed    | Only after its v1 gate                       | More live paired samples, agreement, latency, provider reliability   |
| `retrieval.graph_activation.v1`     | Shadow; guarded suppression implementation exists                        | Reviewed    | No; v1 mismatch keeps routing off            | Correct the ambiguity/staleness calibration and gather live pairs    |
| `retrieval.graph_activation.v2`     | Optional shadow, default off                                             | Reviewed    | No                                           | Real freshness/identity projection, independent v2 gate and consumer |
| `retrieval.knowledge_activation.v1` | Shadow; guarded suppression implementation exists                        | Reviewed    | Only after its v1 gate                       | More live paired samples, agreement, latency, provider reliability   |
| `retrieval.evidence_relevance.v1`   | Optional shadow, default off; no reranker                                | Reviewed    | No                                           | Reviewed replay, family gate, deterministic reranker policy          |
| `initiative.best_candidate.v1`      | Optional shadow, default off                                             | Reviewed    | No; advisory selection remains deterministic | More reviewed fixtures and live calibration                          |
| `initiative.interruption_value.v1`  | Optional shadow, coupled to next-action shadow; no notification consumer | Reviewed    | No                                           | Reviewed replay, family gate, deterministic suggest/silent policy    |
| `planning.requires_system_two.v1`   | Not implemented                                                          | None        | No                                           | Routing policy, baseline, fixtures, escalation controls              |
| `expression.evidence_support.v1`    | Not implemented                                                          | None        | No                                           | Claim model, citation verifier, response guard and fixtures          |

## Non-negotiable transition rule

A family moves one column at a time: contract and deterministic baseline, then
off-by-default shadow, then DRI-reviewed labels and replay, then an
independent release gate, then a bounded consumer. A passing result in another
family, version, or risk tier never counts as evidence for this family.
