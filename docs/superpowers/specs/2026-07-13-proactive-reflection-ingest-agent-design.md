---
title: "Proactive Reflection Ingest Agent"
---

# Proactive Reflection Ingest Agent

> Status: Approved for implementation
> Date: 2026-07-13

## Goal

Eliminate the user-operated Codex `sync` and `flush` workflow. Once a source is
bootstrapped, Buni automatically captures completed Codex turns and delivers
them through the existing reflection ingestion pipeline.

## Decision

Buni uses a local `reflection-codex-agent` that runs with the local server.
The agent is the only process that reads local Codex data and owns the local
durable outbox. It schedules its own next scan from a pure adaptive policy, so
an idle Buni instance does not keep opening Codex App Server connections.

```text
local Codex agent -> Codex App Server -> existing outbox -> POST /reflection/push
  -> runReflectionIngestBatch -> raw observations and normalized observations
```

The reflection ingestion pipeline must not write raw observations outside
`runReflectionIngestBatch`.

## Components

### Local Codex agent

`scripts/reflection-codex/agent.ts` is a long-running process started by the
local server. It runs the existing incremental sync and flush logic in-process,
then schedules exactly one later sweep with `setTimeout`.

The existing CLI commands remain recovery and operator tools:

- `bootstrap-local` is one-time local authorization and configuration.
- `backfill` and `repair` are explicit repair operations.
- `sync` and `flush` remain available for diagnosis but are not the normal
  delivery path.

The local runtime launches the agent with Buni. A remote deployment runs the
same entrypoint under its service supervisor on the machine that hosts Codex.

### Adaptive cadence

The agent reports whether a sweep enqueued any completed turns. Its pure policy
derives the next due time from that result:

| Outcome                                   | Next run                               |
| ----------------------------------------- | -------------------------------------- |
| Startup or newly observed completed turn  | 15 seconds                             |
| Still inside the two-minute active window | 15 seconds                             |
| First empty scan after active window      | 30 seconds                             |
| Second consecutive empty scan             | 1 minute                               |
| Later empty scans                         | 5 minutes                              |
| Retryable agent failure                   | exponential retry, capped at 5 minutes |

An outbox flush happens as part of every claimed run. Existing per-record
outbox retry timing remains authoritative for network errors. No Codex App
Server process is opened while the source is idle beyond the scheduled scan.

## Correctness And Failure Model

- Delivery is at least once. Existing raw `dedupeKey` semantics preserve
  idempotence.
- The agent reports success only after the in-process flush completes or the
  outbox has no ready record; it never bypasses `/reflection/push`.
- A crashed agent is restarted with the Buni server; the next startup sweep
  safely replays the local outbox.
- Invalid local configuration is retried with the same bounded failure policy;
  the existing doctor command remains the diagnostic surface and server data
  remains untouched.
- Source pause semantics remain enforced at the existing push boundary; the
  local agent does not create a second persistence route.

## Observability

The agent logs each sweep's outcome, enqueued turns, flushed records, and next
delay. Existing push ingestion persists raw inserts, duplicates, normalized
observations, and source health. The existing reflection overview remains the
health UI.

## Non-Goals

- Do not replace the current local file outbox.
- Do not move Codex transcript parsing or redaction into the server.
- Do not add a second raw-observation persistence path.
- Do not require App Server notifications for correctness. They may become a
  latency optimization later.
