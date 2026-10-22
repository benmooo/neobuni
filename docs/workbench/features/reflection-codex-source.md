---
title: "Feature: reflection-codex-source"
---

# Feature: reflection-codex-source

Updated At: 2026-05-23 14:00 Asia/Shanghai
Status: active

## Goal

Integrate and implement the Codex ingestion source, feeding session context and design interactions directly into the reflection system.

## Non-Goal

- Do not touch Chrome or other web data sources in this iteration.

## Why Now

Codex is the core entry point of daily workflows where 80 percent of time and code-design reasoning are spent.

## Context

Extends the push ingestion substrate and normalize layer with Zod schema-first contracts for Codex App Server transcript ingestion, while simplifying the downstream reflection pipeline.

## Decisions

- Decision: Use Codex App Server as the canonical Codex read surface.
  Reason: It gives explicit thread, session, turn, and item boundaries and avoids depending on unstable local transcript file formats.
- Decision: V1 pushes full completed-turn transcripts to Buni raw ingestion instead of a local digest.
  Reason: We want to preserve the full work transcript and postpone any lossy summarization to server-side normalization.
- Decision: The durable raw append unit is one completed turn, not one whole session blob.
  Reason: It preserves the full transcript while keeping dedupe, windows, retries, and rebuilds bounded.
- Decision: Simplify reflection to `raw_observation -> observation -> report`, removing state, episode, pattern, and context layers.
  Reason: The middle layers add too much pipeline depth and storage churn for the current product stage.
- Decision: Simplify Codex normalize to one `codex_turn` per raw turn, with full structured transcript projection kept in `content`.
  Reason: Daily reports will synthesize directly from normalized observations and need more transcript detail without fragmenting one turn into multiple normalized artifacts.
- Decision: Generate daily reports from normalized observations + LLM, then derive weekly and monthly reports from daily reports.
  Reason: This preserves synthesis value while drastically reducing downstream complexity.
- Decision: Daily report input should be transcript-first and use purified Codex user/assistant conversation, not heavily compressed evidence bundles.
  Reason: The high-value signal for reflection is in user intent, preferences, design decisions, and assistant responses.
- Decision: Daily report output should be markdown-first with structured storage fields, and the target design should not depend on `reflection_links`.
  Reason: One human-facing daily artifact plus direct source id arrays is enough for V1 provenance without lineage-table churn.

## Progress

Codex App Server bridge is now implemented end-to-end in local code:
- raw payload contracts
- import/backfill support
- deterministic Codex normalization
- server bootstrap and health routes
- mobile operator surface
- local bridge runtime with durable outbox and crash recovery
- dirty daily report marking on ingest
- queued daily / weekly / monthly report builds from normalized observations

## Last Done

- Aligned on a major reflection simplification refactor: remove state / episode / pattern / context, keep reports.
- Agreed that Codex normalize should collapse to one `codex_turn` with full structured transcript projection in normalized `content`.
- Updated the active design docs to reflect the simplified ingestion and report architecture.
- Aligned the daily report design around transcript-first Codex input, markdown-first output, and direct `sourceObservationIds` instead of `reflection_links`.
- Documented the operator setup runbook for the Codex local bridge, including bootstrap, health checks, steady-state commands, repair, and live smoke.
- Aligned on Codex App Server as the source boundary.
- Chose full completed-turn transcript push for V1.
- Documented the detailed bridge, payload, cursor, and backfill plan.
- Documented the raw payload contract, import/backfill changes, and deterministic normalize plan.
- Implemented the local Codex bridge runtime with `bootstrap-local`, `sync`, `backfill`, `flush`, `repair`, and `doctor`.
- Added auto-reclaim for stale `processing/` outbox records so interrupted flushes do not wedge delivery.
- Added integration coverage for push signing, dedupe, and stale-processing recovery.
- Added app-server schema compatibility for Codex `0.133.x` where thread `status` is now an object.
- Added `live-smoke` to prove the bridge against a real local Codex App Server and local temp Buni server.
- Implemented the simplified active path so Codex push ingestion now stops at normalized observations and dirty daily report marks.
- Implemented report queue execution so daily reports build from normalized observations and weekly/monthly reports roll up from daily reports.
- Removed the report write path's active dependency on `reflection_links`.
- Added end-to-end test coverage proving `push -> raw_observation -> observation -> dirty report -> daily/weekly/monthly reports`.
- Removed the legacy reflection server/db code and routes for state, episode, pattern, and context stages, along with their old tables from the active codebase.

## Next Exact Step

1. Hook a scheduler or cron trigger onto `POST /v1/reflection/reports/build-dirty`.
2. Decide whether to expose dirty report queue state in the reflection admin UI.
3. Optionally prune leftover pure-core legacy reflection helper modules that no longer back any active runtime path.

## Reopen These Files

- `docs/workbench/now.md`
- `docs/workbench/features/reflection-codex-source.md`
- `docs/perception-layer/reflection-source-codex-app-server.md`
- `docs/perception-layer/reflection-source-codex-contracts-and-normalization.md`
- `docs/perception-layer/reflection-source-codex-local-bridge-setup.md`
- `docs/perception-layer/reflection-pipeline-simplification.md`
- `docs/perception-layer/reflection-observation-ingestion-pipeline.md`
- `docs/perception-layer/reflection-report-pipeline.md`
- `docs/perception-layer/reflection-daily-report-design.md`

## Commands

- `bun run wb:start <feature-slug> "<goal>"`
- `bun run wb:start "<goal>"`
- `bun run wb:checkpoint "..." "..."`
- `bun run wb:done "..."`
- `bun run wb:list`
- `bun run wb:open <feature-slug>`
- `bun run wb:recent [limit]`
- `bun run wb:clean`
- `bun run wb:restore <feature-slug>`
- `bun run wb:resume`

## Open Questions

- Which transcript item subtypes should get first-class helper projections in the raw payload versus staying only inside `rawTurn`?
- How aggressive should deterministic redaction be before the first live rollout lands?

## Risks

- Full transcript push increases privacy sensitivity and requires edge redaction before delivery.
- Codex App Server is the right contract surface, but bridge correctness still depends on careful watermark and replay handling.

## Checkpoints

### 2026-05-21 12:49 Asia/Shanghai

- Event: feature started
- Goal: Integrate and implement the Codex ingestion source, feeding session context and design interactions directly into the reflection system.

(empty)

### 2026-05-22 18:12 Asia/Shanghai

- Event: design direction aligned
- Decision: use Codex App Server as the canonical read surface
- Decision: push full completed-turn transcripts in V1 instead of local digests
- Artifact: `docs/perception-layer/reflection-source-codex-app-server.md`

### 2026-05-22 18:20 Asia/Shanghai

- Event: implementation doc added
- Artifact: `docs/perception-layer/reflection-source-codex-contracts-and-normalization.md`
- Scope: raw payload schema, import/backfill support, deterministic normalize outputs

### 2026-05-22 19:06 Asia/Shanghai

- Event: local bridge implemented
- Artifact: `scripts/reflection-codex/`
- Scope: bootstrap, sync, backfill, flush, repair, doctor, HMAC push, app-server client, durable outbox recovery

### 2026-05-22 22:15 Asia/Shanghai

- Event: live smoke passed
- Artifact: `scripts/reflection-codex/live-smoke.ts`
- Scope: real `codex app-server` probe, real `sync --dry-run`, real bounded `backfill`, real `flush`, raw append, normalized observation proof

### 2026-05-23 11:20 Asia/Shanghai

- Event: simplification direction aligned
- Decision: simplify reflection to `raw -> normalized observation -> scheduled reports`
- Decision: remove state / episode / pattern / context from the target pipeline
- Decision: collapse Codex normalize to one `codex_turn` with full structured transcript projection
- Artifacts:
  - `docs/perception-layer/reflection-pipeline-simplification.md`
  - `docs/perception-layer/reflection-observation-ingestion-pipeline.md`
  - `docs/perception-layer/reflection-report-pipeline.md`
  - `docs/perception-layer/reflection-source-codex-contracts-and-normalization.md`

### 2026-05-23 12:05 Asia/Shanghai

- Event: daily report design aligned
- Decision: daily report input is transcript-first and uses purified same-day Codex user/assistant conversation
- Decision: daily report output is markdown-first with structured storage fields
- Decision: remove `reflection_links` from the target design and store direct source ids on reports instead
- Artifacts:
  - `docs/perception-layer/reflection-daily-report-design.md`
  - `docs/perception-layer/reflection-report-pipeline.md`
  - `docs/perception-layer/reflection-source-codex-contracts-and-normalization.md`
  - `docs/perception-layer/reflection-pipeline-simplification.md`

### 2026-05-23 13:20 Asia/Shanghai

- Event: simplified ingestion-to-report chain proved
- Scope: Codex push ingestion, deterministic normalize, dirty daily report marking, queued daily/weekly/monthly builds
- Verification:
  - `bun test apps/server/src/reflection/ingestion/run-push-source-to-report.test.ts`
  - `bun test apps/server/src/reflection/report/run-report-queue.test.ts`
  - `bun run typecheck:core`
  - `bun run typecheck:db`
  - `bun run typecheck:server`

### 2026-05-23 14:00 Asia/Shanghai

- Event: legacy reflection middle-layer code removed
- Scope:
  - removed server routes for state estimates, episodes, patterns, and context
  - removed db repos/schema exports for old state / episode / pattern / context / link tables
  - removed runtime reads from persisted reflection context
- Verification:
  - `bun run typecheck`
  - `bun test apps/server/src/reflection/ingestion/run-push-source-to-report.test.ts`
  - `bun test apps/server/src/reflection/report/run-report-queue.test.ts`
  - `bun test packages/core/src/reflection/ingestion/normalize-raw-observation.test.ts`
