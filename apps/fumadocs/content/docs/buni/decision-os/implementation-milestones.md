---
title: "Decision OS Implementation Milestones"
---

# Decision OS Implementation Milestones

> Status: Active implementation plan
> Date: 2026-10-21
> Architecture: [`decision-os-v1.md`](./decision-os-v1.md)
> Delivery and question governance: [`README.md`](./README.md), [`question-catalog-v1.md`](./question-catalog-v1.md), and [`product-and-delivery-operating-model.md`](./product-and-delivery-operating-model.md)

## Delivery principle

Every milestone must leave Buni runnable, preserve a deterministic fallback, and produce inspectable evidence. Jev enters in shadow mode first; it cannot authorize or execute effects.

## Milestone 1 — Decision foundation

**Outcome:** Buni has first-class Goal, Commitment, Decision, Candidate, Judgment, Action Proposal, and Authorization contracts, storage, repositories, factories, and traceable pure policy composition.

- Add Zod-first contracts in `packages/contracts/src/decision/`.
- Add Drizzle-owned schema and repositories in `packages/db`.
- Add a pure Decision Kernel in `packages/core/src/decision/`.
- Persist append-only decision traces without altering chat behavior.
- Add tests for policy precedence and trace creation.

**Exit criteria:** A goal-scoped decision can be recorded with candidates, typed judgments, a policy route, and an outcome reference.

## Milestone 2 — Heuristic baseline and shadow judgment

**Outcome:** Existing retrieval and initiative heuristics can execute through the `DecisionProvider` interface while Jev produces a side-by-side shadow result.

- Wrap current retrieval activation logic as `HeuristicDecisionProvider`.
- Implement TypeSafe API adapter with fixed model versions, redacted state projection, timeout, retry, and provider telemetry.
- Add question catalogue for retrieval activation and evidence relevance.
- Record agreement, confidence, latency, and fallback cause.

**Exit criteria:** Jev cannot affect behavior, but replayable traces compare it against the baseline.

## Milestone 3 — Retrieval routing and reranking

**Outcome:** A feature flag can route low-risk retrieval activation and evidence reranking through calibrated Jev judgments.

- Build minimal state projections and atomic Jev questions.
- Keep query construction and store execution deterministic.
- Add offline replay fixtures, option-order tests, and Chinese examples.
- Fall back to heuristic results on error, low confidence, or policy denial.

**Exit criteria:** Retrieval quality and cost are measured against baseline before rollout.

### Milestone 3A — Evidence-relevance shadow sequence

`retrieval.evidence_relevance.v1` is the next retrieval decision family. It is
not a permission to rewrite a prompt or cite a source; it evaluates only the
relative relevance of evidence that the deterministic retriever already
returned.

1. Add an off-by-default Settings flag. When off, do not construct a provider
   request or persist a decision trace.
2. After deterministic fusion, project at most six evidence items. Each item
   includes a stable evidence ID, store, kind, deterministic score, retrieval
   reason, and a bounded redacted content summary. Never include credentials,
   full conversation history, or arbitrary metadata.
3. Ask one typed `score` question per item. The deterministic evidence score is
   the baseline; Jev scores are trace-only. Provider failure, an invalid score,
   a missing answer, or a disabled flag has no effect on fused evidence,
   working memory, prompt construction, tools, or authorization.
4. Record one `memory_retrieval` decision trace with a separate versioned
   question ID per evidence item and a state fingerprint. Runtime spans record
   only counts and IDs, never evidence text.
5. Add fixtures covering irrelevant high-score evidence, relevant low-score
   evidence, stale graph evidence, injection-shaped retrieved text, Chinese,
   English, and mixed-language requests. Build a dedicated family release gate
   before any future reranker consumes Jev output.

**3A exit criteria:** an enabled shadow run can be audited against deterministic
evidence ordering, while an identical disabled or failed run produces exactly
the same fused evidence and prompt packet.

## Milestone 4 — Goal-centric initiative

**Outcome:** Buni can create explicit goals, track commitments, evaluate material changes, and suggest one explainable next action.

- Add goal and commitment APIs plus a Now read model.
- Generate bounded candidate actions through System Two or deterministic templates.
- Use Jev to score interruption value and rank candidates.
- Record deliberate no-ops and user feedback.

**Exit criteria:** One low-risk goal type produces explainable suggestions with user controls.

## Milestone 5 — Durable authorized actions

**Outcome:** Buni can enqueue, execute, inspect, cancel, and evaluate authorized actions independent of a chat stream.

- Unify task runs and action runs.
- Add scoped user grants, checkpoints, result evidence, and external receipt confirmation.
- Permit only reversible action classes initially.

**Exit criteria:** A durable action survives chat disconnects and proves authorization plus outcome.

## Milestone 6 — Calibration and expansion

**Outcome:** Buni has a decision evaluation programme and supports more goal types and autonomy modes.

- Build reviewed datasets from decision traces and user outcomes.
- Calibrate thresholds by risk tier and language.
- Expand from suggestions to scoped execution only where metrics support it.

**Exit criteria:** Each active Jev question family has an owner, evaluation suite, release gate, and rollback path.

## Current implementation state

- **Milestone 1:** implemented and verified locally. Contracts, primary SQLite schema, migration, repositories, decision trace replay, and pure policy composition are present.
- **Milestone 2:** shadow retrieval is controlled by the enabled OpenRouter Jev configuration in Settings; enable “记录检索 Shadow 判断” to record Jev results. Leave that configuration disabled or absent to record the heuristic baseline only. The Settings default model is `typesafe/jev-1.14`.
- Shadow mode is observational: errors are swallowed at the boundary and cannot alter the retrieval plan, tool selection, or chat response.
- **Milestone 4 (active advisory loop):** `POST /v1/goals/next-action-evaluations` explicitly records an advisory candidate evaluation; it never runs while `GET /v1/goals/now` is read. The bounded periodic reviewer is enabled by default for explicit active goals; it records a decision only when a goal has no prior review, has reached `nextReviewAt`, or passed its configured minimum review interval. It does not notify, execute, or mutate a goal. `PATCH /v1/goals/:goalId` gives the user an explicit lifecycle control to activate, pause, complete, or otherwise maintain an owned goal; `PATCH /v1/goals/:goalId/commitments/:commitmentId` maintains a commitment with the same profile and parent-goal boundary. Now surfaces the latest recorded advisory decision for feedback. With “记录下一步建议 Shadow 排名” enabled in the OpenRouter Jev Settings, the trace also stores Jev's bounded candidate ranking alongside the deterministic selection. Feedback can be recorded as `accepted`, `dismissed`, or `deferred` through `POST /v1/goals/decisions/:decisionId/feedback`.
- **Milestone 4 (review cadence correction):** A past `nextReviewAt` is a single explicit review point, not a permanent every-tick trigger. After Buni records a decision at that point, later initiative reviews again obey the configured minimum interval. This preserves proactive follow-up without repeatedly generating identical suggestions.
- **Milestone 4 (private chat goal context):** Private chat prompt compilation receives a capped projection of explicit active goals and open or blocked commitments. It is independent of memory-recall settings, omitted entirely from public-safe surfaces, and instructs the model that goal context cannot prove completion or grant execution authority.
- **Milestone 4 (mobile entry point):** The mobile Now view can create and immediately activate an explicit goal with a title and a user-defined expected outcome, add a user-owned open task commitment to an active goal, and pause or resume a goal. Local validation is surfaced before any request; mutations invalidate the whole goal read model after success. The entry point deliberately defaults to `collaborate`, so creation makes Buni proactive around the goal but does not grant external execution authority.
- **Milestone 6 (partial):** `GET /v1/goals/decision-evaluation` returns trace-derived decision count, provider judgment counts, heuristic/Jev agreement, average Jev latency, feedback distribution, explicit safe-fallback reasons, and the current retrieval release-gate status. `decision_judgments.latency_ms` preserves the provider latency needed for this report. Offline labelled sets, language calibration, and owner sign-off remain required before broader routing.
- **Milestone 6 (deterministic choice preparation):** Candidate ranking now canonicalizes eligible candidate IDs before compiling `initiative.best_candidate.v1`. The compilation test includes Chinese candidate text and an option-order permutation, so input ordering cannot silently change Buni's heuristic choice or the option IDs supplied to Jev. This is a structural guard only; it is not evidence of Jev's semantic calibration. Reviewed labels, live provider replay, and DRI sign-off still gate user-visible routing.
- **Milestone 6 (fixture substrate):** `decisionEvaluationFixtureSchema` and seed fixtures make required language and failure-mode coverage executable: Chinese, English, and mixed-language cases cover positive, negative, ambiguous, stale, and injection-shaped input. The product DRI reviewed all five initial labels on 2026-10-22; a reviewed fixture now requires reviewer identity, timestamp, and rationale at the Zod boundary. The first live replay completed through OpenRouter on 2026-10-22 with four matches from five reviewed fixtures (80%); the graph-memory ambiguous/stale case mismatched. It is recorded in [`evaluation-reports/2026-10-22-openrouter-jev-1.14-replay.md`](./evaluation-reports/2026-10-22-openrouter-jev-1.14-replay.md). More reviewed graph-memory examples and DRI inspection remain required before routing.
- **Milestone 6 (replay boundary):** `bun run --cwd apps/server decision:evaluate -- --profile-id <profile-id>` replays only human-reviewed fixtures against Jev and emits a machine-readable report with reviewed and draft match rates kept separate. `--include-draft` is useful for observation, but draft results are explicitly non-gating. The command refuses to claim release evidence when the reviewed set is empty and never prints the API key. The initial fixtures are reviewed, but a live replay and accountable release-gate sign-off remain required before this command can produce gate evidence.
- **Milestone 6 (provider reliability gate):** Retrieval release evaluation now counts identifiable Jev attempts and `jev_provider_error` fallbacks. The gate rejects a configured provider-error rate above the Settings threshold (default 5%); unavailable historical data does not substitute for the existing paired-sample requirement.
- **Milestone 3 (guarded routing):** “允许已校准的检索抑制” in the OpenRouter Jev Settings is necessary but insufficient to route. The memory-retrieval family must first meet its versioned minimum paired samples, baseline/Jev agreement, and average Jev latency gate. Once released, Jev can only high-confidence _suppress_ stores that the deterministic planner already selected for prefetch. It never enables a new store, changes query construction, grants authority, or affects tools. Any error, missing key, invalid threshold, release-gate failure, low confidence, or disabled flag returns the original deterministic plan; traces record the fallback reason.
- **Milestone 5 (initial reversible execution):** `action_proposals`, `action_authorizations`, and `action_runs` are migrated and persisted. The first executable action is deliberately narrow: a user explicitly authorizes a candidate-bound, same-profile `commitment_status_update`. A worker re-checks the authorization, candidate binding, expiry, and expected current status before committing the local update; it records the before/after receipt, supports queued-run cancellation, and reclaims expired claims after a worker interruption. It never calls an external tool. Now can queue this action only through the explicit “完成此承诺” control. Accepted recommendation feedback remains separate from authorization.
- **Milestone 5 (shared lifecycle core):** `task_runs` remains the legacy scheduler record and `action_runs` remains the decision-owned record, but both repositories now use one pure, Zod-first lifecycle kernel for claimability, lease expiry, claim/start/completion/failure/cancellation patches, retry limits, and pre-execution cancellation. Expired `claimed` task runs are now recoverable during a sweep. `running` work is intentionally not reclaimed: retrying an interrupted external operation requires an idempotency key and receipt reconciliation, which have not yet been introduced for scheduled tool calls.
- **Milestone 5 (atomic claims):** Claiming is now a conditional SQL update with `RETURNING`, rather than a read followed by an unconditional write. Competing workers cannot both claim a queued run; an integration test verifies the first lease owner wins and the second claimant receives no run. This closes a duplicate-execution race before external action classes are introduced.
- **Milestone 5 (execution evidence foundation):** Every new decision-owned `action_run` now receives a stable `idempotencyKey` and persists a structured checkpoint as it moves through `queued`, `claimed`, `running`, and `completed`. Completion requires a typed receipt. The existing local commitment update records `local_confirmed` evidence; external receipt statuses (`external_unconfirmed`, `external_confirmed`, and `reconciliation_required`) are modeled but no external action class uses them yet. This is preparation for recovery and reconciliation, not permission to retry interrupted external work.
- **Milestone 5 (legacy schedule bridge):** Schedule materialization now emits a pure `scheduled_task_execution` compatibility projection with a stable `(scheduleId, scheduledFor)` idempotency key. A channel-targeted schedule is explicitly marked as requiring external reconciliation. The legacy `task_run` continues to execute on its existing worker during this bridge; the projection is not an authorization and does not create a duplicate action run. The next migration step is to move this exact input into `action_runs` only with a scheduler-specific authorization model and receipt reconciler.
- **Milestone 5 (atomic terminal transitions):** `action_runs` now use conditional `UPDATE … RETURNING` for start, completion, failure, and pre-execution cancellation as well as claim. A completion can only commit from `running`; a cancellation can only commit from `queued` or `claimed`. The action worker stops before any mutation if it loses the claimed-to-running transition. This prevents stale worker writes from overwriting a terminal state while the scheduler bridge is being built.
- **Milestone 5 (Telegram confirmation pilot):** The first external action class is `telegram_message_send`, constrained to `daily_summary`. Now obtains only configured, enabled Telegram `channel` aliases and labels from a minimal targets endpoint; it never reads bot credentials. Groups, topics, disabled targets, and hand-entered aliases are excluded before draft creation. The draft endpoint and execution worker independently revalidate the same constraint, so a direct API call or later target-type change cannot bypass it. A user first creates a draft, then must issue an explicit execution authorization whose constraints name Telegram, the exact configured target, and `requiresConfirmation: true`; a target mismatch is denied by deterministic policy. Telegram's returned message ID creates an `external_unconfirmed` receipt, never a claim that a person received or read it. `POST /v1/goals/action-runs/:actionRunId/confirm-receipt` records the user-confirmed `external_confirmed` state. This pilot intentionally has no automatic retry or broad channel scope.
- **Graph-memory v2:** The first live v1 replay exposed that “needed” did not encode Buni's freshness and identity-safety rule. `retrieval.graph_activation.v2` is a reviewed, shadow-only contract: it returns `false` when evidence freshness is unknown or stale, identity is ambiguous, or graph retrieval is not necessary. The DRI approved its three fixtures on 2026-10-22, including one fresh, explicit relationship case that returns `true`; the reviewed replay is recorded in [`evaluation-reports/2026-10-22-openrouter-jev-1.14-reviewed-v2-replay.md`](./evaluation-reports/2026-10-22-openrouter-jev-1.14-reviewed-v2-replay.md). Runtime evidence remains separate from v1 and cannot enable routing. Its Settings switch is off by default; when enabled, it adds only the v2 shadow question to an existing Jev decision request, never a graph-memory query.
- **Versioned retrieval gate:** The guarded-routing release gate explicitly summarizes only `retrieval.temporal_activation.v1`, `retrieval.graph_activation.v1`, and `retrieval.knowledge_activation.v1`. A Graph v2 judgment is excluded even when both versions appear in the same trace, so its agreement cannot mask a v1 mismatch or change existing routing evidence.
- **Milestone 3A (initial evidence-relevance shadow):** Settings now exposes an off-by-default `evidenceRelevanceShadowEnabled` switch. When enabled, Buni scores at most six already-fused evidence items through `retrieval.evidence_relevance.v1`; each projection includes only a stable ID, store, kind, deterministic score, retrieval reason, and a 240-character content summary. The resulting trace is observation-only: it does not reorder evidence, change working memory or the prompt, invoke tools, or affect authorization. The fixture and family-specific release gate remain the next 3A steps.
- **Graph-memory conservative baseline:** The deterministic planner prefetches graph memory only for an explicit relationship lookup. Personal history, task follow-up, and topic continuity no longer prefetch graph merely because they can share entities; temporal memory remains available for those needs. This prevents a graph query before Jev is configured, and leaves Graph v2 as a separate observation-only calibration path.
- **Milestone 4 (interruption-value shadow):** `initiative.interruption_value.v1` is now a bounded score question emitted beside `initiative.best_candidate.v1`. Its pure heuristic baseline is `0` with no eligible action, `0.75` for an explicit blocked commitment, and `0.35` for ordinary follow-up work. The projection contains at most three candidates and an explicit `userContext: "unknown"`; Buni does not infer availability. The answer is trace-only and cannot surface a notification, change the existing advisory suggestion, create an action, or grant authority. Three draft fixtures now cover blocked, no-candidate, and ambiguous-context cases; DRI review is required before replay evidence can count.
- **Milestone 4 (first reviewed interruption replay):** On 2026-10-22, the product DRI reviewed all three interruption-value fixtures. A reviewed OpenRouter replay with `typesafe/jev-1.14-20261014` matched all three score labels within their explicit tolerance. The full reviewed set matched 12 of 15 fixtures; Graph v1, candidate selection, and one ambiguous evidence-relevance label still mismatched. This evidence calibrates only `initiative.interruption_value.v1` and does not permit a consumer, notification, or routing change. The replay also exposed and corrected an adapter boundary bug: OpenRouter Decisions expects `score` criteria as an ordered array, while `choice` and `noul` retain keyed criteria. A provider regression test now locks this compilation behavior.
- The OpenRouter Jev adapter reads timeout and retry limits from the Settings-managed Jev configuration (defaults: 3000 ms and one retry). It retries only transient network failures, 429, and 5xx responses; non-retryable provider failures fall back at the decision boundary.
