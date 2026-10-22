---
title: "Decision OS documentation"
---

# Decision OS documentation

This directory defines the target operating model for Buni as a goal-centered agent. It is intentionally separate from chat, memory, and tool implementation details: a chat turn is only one way that a decision can enter the system.

## Reading order

1. [Decision OS V1](./decision-os-v1.md) — product thesis, system boundaries, target architecture, autonomy, persistence, and security model.
2. [Question Catalogue V1](./question-catalog-v1.md) — the contract and lifecycle for every bounded semantic judgment, including Jev questions.
3. [Product and delivery operating model](./product-and-delivery-operating-model.md) — how product, design, engineering, data, and operations turn this architecture into a safe product loop.
4. [Implementation milestones](./implementation-milestones.md) — incremental delivery sequence and current implementation state.
5. [Decision evaluation programme](./evaluation-program.md) — reviewed-label process, Jev replay procedure, gate evidence, and ownership.
6. [First human review packet](./first-review-packet-v1.md) — the initial five concrete labels approved by the DRI; later reviewed Graph v2 fixtures live in the executable fixture set.
7. [Decision family delivery matrix](./decision-family-delivery-matrix.md) — current runtime, label, routing, and release-evidence status by versioned family.

## Normative rules

The following rules apply to every Decision OS change:

- A probability is evidence, never permission. Deterministic policy and explicit user authority control execution.
- Jev receives a minimized state projection and bounded typed questions. It cannot execute tools, mutate Buni state, or issue authorization.
- Every new proactive behavior needs a decision trace, a deterministic fallback, a measurable success condition, an owner, and a rollback switch.
- A successful worker run proves only that the worker ran. External delivery and user-visible outcome need separate evidence.
- New decision families begin in shadow mode. They may affect behavior only after their release gates pass.
- Every provider question ID is versioned. A criteria or option-semantics change creates a new ID or version; it never rewrites historical meaning.

## What is implemented today

The repository currently has the first Decision OS vertical foundations:

- Zod-first Goal, Commitment, Decision, Candidate, Judgment, Policy, provider, and Now contracts;
- Drizzle tables and repositories for goals, commitments, decision headers, candidates, and judgments;
- pure policy composition and advisory next-action selection;
- a Goal / Commitment API, a mobile **Now** view, and a bounded active-goal projection in private chat prompts;
- retrieval shadow tracing, with an optional OpenRouter-routed Jev comparison enabled in Settings.
- explicit next-action evaluation and accepted/dismissed/deferred feedback traces; optional Jev candidate-ranking comparison is enabled in Settings.
- a read-only decision-evaluation summary for baseline/Jev agreement, provider latency, and user-feedback distribution.
- a Jev fixture replay command which separates draft observations from reviewed release evidence; the latest saved replay covers eight DRI-reviewed fixtures and matched six (75%). The v1 graph and initiative mismatches keep routing disabled.
- an initial durable execution loop for an explicitly authorized, reversible local commitment-status update; recommendation acceptance is still not permission.
- a Telegram pilot for user-created message drafts: every send requires an exact-target confirmation, and platform acceptance remains pending until a user confirms the receipt.

## Goal lifecycle contract

The Goal is the durable user-owned control plane. Creating a goal deliberately
defaults to `draft`: Buni does not review, recommend against, or initiate work
for it until the user explicitly sets it to `active`.

| Need                                                         | Endpoint                                            | Authority and result                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Create a goal                                                | `POST /v1/goals`                                    | Creates a `draft` by default.                                                                       |
| Change intent, constraints, autonomy, review date, or status | `PATCH /v1/goals/:goalId`                           | Only the active profile may update its own goal; the event contains the changed field names.        |
| Add a commitment                                             | `POST /v1/goals/:goalId/commitments`                | The target goal must belong to the active profile.                                                  |
| Maintain a commitment                                        | `PATCH /v1/goals/:goalId/commitments/:commitmentId` | Update is constrained by profile and parent goal in the database query.                             |
| Review the current state                                     | `GET /v1/goals/now`                                 | Read-only projection: active goals, unresolved commitments, review point, and advisory next action. |

The allowed goal patch fields are `title`, `desiredOutcome`, `status`,
`horizon`, `successCriteria`, `constraints`, `autonomyMode`, `planVersion`, and
`nextReviewAt`. A commitment patch may change only `status`, `title`, `dueAt`,
or `evidenceIds`. Neither endpoint can change profile ownership, bind a
commitment to another goal, create an authorization, or execute an action.

An `active` goal is the precondition for the periodic advisory reviewer. Moving
it to `paused`, `completed`, or `abandoned` removes it from that review set on
the next cycle. This is a product-state transition, never an action grant.

This is deliberately not autonomous execution. The current next action is advisory, and Jev's retrieval result is observational only. Private chat receives at most five active goals and twelve open or blocked commitments as goal context; public-safe surfaces receive none. This context can guide relevance, but it is neither completion evidence nor an execution grant.

## Change protocol

When adding a decision family, make one reviewable change set that includes:

1. a question entry in the catalogue with an owner, input projection, output semantics, and risk tier;
2. Zod-first contracts and pure compilation/composition functions in `packages/core` / `packages/contracts`;
3. a trace schema and redaction plan;
4. offline fixtures, Chinese cases where applicable, and a deterministic baseline;
5. feature flag, shadow period, metrics query, and rollback plan;
6. user-facing explanation and feedback behavior where the decision can surface.

Do not make a provider adapter the location of product policy or a source of implicit authority.
