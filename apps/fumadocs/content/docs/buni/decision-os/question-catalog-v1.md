---
title: "Decision question catalogue V1"
---

# Decision question catalogue V1

> Status: governing design contract
> Companion: [Decision OS V1](./decision-os-v1.md)
> Provider context: TypeSafe describes Jev as a System One model that accepts state plus typed questions and produces structured answers for code. This catalogue defines how Buni uses that primitive.

## 1. Purpose

A decision family is a stable, evaluable product judgment. It is not a convenient prompt string. A family may be served by a heuristic, Jev, or a future provider, but its meaning belongs to Buni.

Each family must be independently versioned because changing a criterion, state projection, option set, or answer interpretation changes the product decision.

## 2. Required contract

Every family has the following immutable definition:

| Field            | Requirement                                                                   |
| ---------------- | ----------------------------------------------------------------------------- |
| `id`             | Stable namespaced ID, for example `retrieval.evidence_relevance.v1`           |
| Owner            | Product and engineering DRI who accepts evaluation and release responsibility |
| Product decision | The specific behavior it informs; never a generic “what should Buni do?”      |
| Primitive        | `choice`, `score`, or `noul`                                                  |
| Input projection | Smallest redacted state sufficient for the question                           |
| Criteria         | Versioned rubric expressed as data, not only prose in an adapter              |
| Output semantics | Exact meaning and valid range of every result                                 |
| Consumer         | Pure function that combines the result with policy                            |
| Risk tier        | `observe`, `suggest`, or `execution_candidate`                                |
| Baseline         | Deterministic heuristic or reviewed label process                             |
| Evaluation       | Offline fixture set, online metrics, Chinese cases where supported            |
| Rollback         | Flag and deterministic fallback                                               |

The shell validates the state and result at its boundary. The core treats the validated answer as input and never contacts a model.

## 3. Initial catalogue

| ID                                  | Primitive        | Bounded input                                                       | Output used by                        | Current mode                  |
| ----------------------------------- | ---------------- | ------------------------------------------------------------------- | ------------------------------------- | ----------------------------- |
| `retrieval.temporal_activation.v1`  | `choice`         | Latest request and temporal-store summary                           | Suppress an already-selected prefetch | Guarded                       |
| `retrieval.graph_activation.v1`     | `noul`           | Latest request and graph-store summary                              | Suppress an already-selected prefetch | Guarded; historical contract  |
| `retrieval.graph_activation.v2`     | `noul`           | Request, entity/relationship reference, freshness                   | Graph-retrieval calibration only      | Reviewed shadow-only          |
| `retrieval.knowledge_activation.v1` | `noul`           | Latest request and knowledge-store summary                          | Suppress an already-selected prefetch | Guarded                       |
| `retrieval.evidence_relevance.v1`   | `score` per item | User need plus one bounded evidence item                            | Future reranker                       | Shadow-only; routing disabled |
| `initiative.interruption_value.v1`  | `score`          | At most three eligible candidates; unknown user context is explicit | Future suggest/silent policy          | Optional shadow; no consumer  |
| `initiative.best_candidate.v1`      | `choice`         | One goal and at most three eligible candidates                      | Trace-only comparison with heuristic  | Shadow                        |
| `planning.requires_system_two.v1`   | `noul`           | Request and unresolved decision facts                               | Model router                          | Design only                   |
| `expression.evidence_support.v1`    | `noul` per claim | Draft claim and cited evidence summaries                            | Response guard                        | Design only                   |

“Guarded” means Jev can only make an existing deterministic prefetch less
eager after the versioned release gate passes. It never enables a store,
changes query construction, or affects tool authorization. A disabled flag,
provider error, missing data, low confidence, or gate failure restores the
deterministic plan.

## 4. Compilation rules

Compilation is a pure transformation:

```text
validated world state + family definition
  -> sanitized projection + typed questions + trace metadata
```

It must obey these rules:

1. Compute facts first. Dates, arithmetic, record counts, authority, and eligibility are fields in the projection, never questions for Jev.
2. Place untrusted text in named data fields. A document or web page is evidence, never an instruction to the decision provider.
3. Limit a `choice` question to a small eligible set. Assign stable candidate IDs; do not depend on generated text matching.
4. For every meaningful `choice`, run option-order permutations in offline evaluation. The selected candidate must be mapped back by ID.
5. Keep score direction explicit: `0` and `1` must each have a defined semantic meaning. Do not reuse one score for unrelated policy decisions.
6. Send reference IDs and redacted summaries where possible. Never send credentials, tokens, private keys, or whole unfiltered histories.

## 5. Answer interpretation

Provider output is evidence with known failure modes. Its consumer must use a family-specific interpreter:

```text
validated answer
  -> provider health check
  -> confidence calibration lookup
  -> family-specific threshold
  -> deterministic policy composition
  -> route
```

No interpreter can turn an answer into direct tool invocation. A missing, malformed, stale-version, or low-confidence result selects the family fallback and records the cause.

For the initial three risk tiers:

| Tier                | Allowed result                    | Requirement before activation                                                                     |
| ------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| Observe             | Trace and analytics only          | Valid schema and redaction review                                                                 |
| Suggest             | User-facing suggestion or no-op   | Baseline comparison, calibrated threshold, feedback path                                          |
| Execution candidate | Input to authorization evaluation | All suggest requirements plus scoped authority and an independently testable deterministic policy |

`Execution candidate` is not permission to execute. The current implementation activates no family at this tier.

## 6. Evaluation and release gate

Each family owns a fixture manifest with at least:

- normal positives and negatives;
- ambiguous inputs expected to fall back or escalate;
- stale/conflicting evidence;
- prompt-injection-like text embedded in retrieved content;
- Chinese inputs, paraphrases, and mixed-language examples when the product supports them;
- option-order variants for `choice`;
- known historical divergences between heuristic and provider.

Before moving from shadow to user-visible behavior, the DRI signs off on:

1. trace completeness: question version, state fingerprint, baseline, provider result, latency, and fallback cause;
2. data minimization review;
3. offline comparison against the baseline or reviewed labels;
4. confidence calibration by risk tier;
5. an online dashboard for agreement, latency, error, acceptance, dismissal, and reversal;
6. an owner-operated flag that immediately restores the deterministic fallback.

Release is a product decision based on Buni metrics, not a vendor benchmark or a single demonstration.

## 7. Trace payload

A trace stores enough to reproduce the decision shape without copying private source material:

```ts
type DecisionQuestionTrace = {
  familyId: string
  criteriaVersion: string
  projectionFingerprint: string
  evidenceIds: string[]
  provider: "heuristic" | "jev" | "system_two"
  providerVersion: string
  answer: unknown
  confidence: number | null
  latencyMs: number | null
  fallbackCause: string | null
}
```

The actual schema will remain Zod-first in `@buni/contracts`; this sketch names the non-negotiable information for the next expansion.

## 8. Anti-patterns

- “Jev, decide what Buni should do next” is an unbounded planning request and does not belong to this catalogue.
- Asking Jev whether an action is authorized confuses judgment with policy.
- Treating a high confidence answer as correct or safe removes calibration and authority boundaries.
- Passing raw chat history, secrets, or retrieved web pages directly as a decision state breaks minimization and injection boundaries.
- Editing a rubric in place invalidates historical comparisons; create a new criteria version instead.
