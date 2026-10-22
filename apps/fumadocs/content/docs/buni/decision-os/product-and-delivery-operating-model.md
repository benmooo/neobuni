---
title: "Decision OS product and delivery operating model"
---

# Decision OS product and delivery operating model

> Status: target team operating model
> Companion: [Decision OS V1](./decision-os-v1.md) and [Question catalogue V1](./question-catalog-v1.md)

## 1. Product promise

Buni earns initiative by maintaining continuity around explicit user intent. The experience should feel active because it notices material changes, preserves commitments, and produces timely, explainable proposals—not because it performs more unsolicited actions.

The core loop is:

```text
intent -> goal -> commitments -> observations -> candidates
       -> bounded judgments -> policy -> suggest / ask / execute / stay silent
       -> outcome evidence -> updated goal state
```

The user can always inspect the goal, evidence, recommendation, authority scope, and result. The product must make “why did you bring this up?” easier to answer than “why did you act?”

## 2. Experience model

### Goal creation

Buni captures an explicit title, desired outcome, success criteria, constraints, horizon, and autonomy mode. When intent is unclear, it proposes a draft rather than silently promoting a chat message into a durable goal.

### Now

**Now** is the default proactive surface. It shows active goals, open or blocked commitments, a single best next action, upcoming review points, and recent decisions. It initially contains recommendations only; the user can accept, dismiss, defer, or edit a proposal.

### Decision trace

Every surfaced recommendation has a compact explanation:

- the goal and observed change;
- the candidate selected and its expected contribution;
- the authority boundary: recommendation, confirmation required, or scoped authorization;
- evidence references and uncertainty in plain language;
- feedback controls.

Do not expose raw probabilities as authoritative facts. Show the relevant uncertainty and offer the trace for deeper inspection.

### Autonomy progression

| Stage              | User experience                            | Buni behavior                                                     |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------- |
| Observe            | Dashboard and summaries                    | Tracks state; does not interrupt or act                           |
| Collaborate        | Explainable suggestions                    | Proposes a next step; user chooses                                |
| Execute reversible | Scoped one-click or pre-authorized routine | Runs only reversible work inside a goal grant                     |
| Delegate           | Checkpointed workflow                      | Runs pre-approved workflow with budgets, expiry, and cancellation |

The product never treats a general “be proactive” preference as broad authority.

## 3. Team responsibilities

| Role                   | Accountable for                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Product                | Goal type selection, intervention value, autonomy language, release decision       |
| Product design         | Goal/Now/trace/feedback flows, comprehensible uncertainty and authority cues       |
| Decision engineer      | Question contract, pure compiler/interpreter, baseline and fallback                |
| Runtime engineer       | State projection, persistence, feature flags, provider boundary, action durability |
| Data/evaluation owner  | Fixture quality, calibration, dashboards, divergence review                        |
| Security/privacy owner | Data minimization, retention, provider data boundary, risk-tier review             |
| Operations owner       | SLOs, kill switch, incident response, external effect reconciliation               |

One named DRI owns each question family. Cross-functional review is required at the move from shadow to user-visible behavior.

## 4. Delivery workflow

1. **Discover:** Choose one goal type where user value is clear and wrong action has low cost.
2. **Specify:** Define the product decision, state projection, question contract, policy boundary, and user-facing explanation.
3. **Baseline:** Implement a deterministic heuristic or collect reviewed examples before introducing Jev routing.
4. **Shadow:** Record baseline and Jev results side by side; investigate meaningful divergences.
5. **Evaluate:** Inspect offline quality, calibration, Chinese robustness, latency, data behavior, and early feedback.
6. **Canary:** Enable only a low-risk, feature-flagged user-visible behavior with deterministic fallback.
7. **Operate:** Review outcome evidence and intervention nuisance; roll back on breach.
8. **Expand:** Add authorization and durable execution only after the recommendation loop has demonstrated value.

## 5. Metrics that decide progress

The north-star product measure is **verified movement toward an explicit goal without unacceptable user burden**. It is decomposed into:

| Dimension        | Evidence                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Goal progress    | Success criteria met, commitment resolution, user-confirmed progress                     |
| Helpfulness      | Accept/edit rate for recommendations, retained use of Now                                |
| Burden           | Dismissal, ignore, mute, reversal, and interruption rate                                 |
| Decision quality | Agreement against labels/baseline, high-confidence error rate, fallback rate             |
| Reliability      | Trace completion, latency, provider errors, durable-run completion, receipt confirmation |
| Safety           | Unauthorized route count, policy-denial correctness, privacy-review findings             |

No single acceptance-rate target is sufficient: a passive product can optimize acceptance by making too few suggestions. Pair usefulness with missed-opportunity review and goal progress.

## 6. Operating review cadence

- **Per change:** architecture and data-boundary review for a new question family.
- **Weekly:** inspect shadow divergences, user feedback, and provider health for active families.
- **Per release:** approve thresholds, canary scope, rollback trigger, and owner.
- **Monthly:** review whether each active family still improves the goal loop; retire stale rules and question versions.

## 7. Initial vertical slice

**DRI decision (2026-10-22):** the first user-visible, proactive vertical slice is a **software-project goal**. Personal reminders and research tasks remain outside the first rollout until this slice has outcome and burden evidence.

The first complete product slice is a software-project goal:

1. The user creates a project goal and a few commitments.
2. Buni observes a meaningful commitment state change.
3. The system constructs no more than three reversible, advisory candidate actions.
4. It records a baseline decision and Jev shadow ranking.
5. Now shows one recommendation with the goal, reason, and feedback controls.
6. The user accepts, defers, edits, or dismisses it.
7. Buni stores the outcome and uses it for evaluation, never as automatic training data.

The slice is complete only when its traces make it possible to understand both useful recommendations and deliberate silence.
