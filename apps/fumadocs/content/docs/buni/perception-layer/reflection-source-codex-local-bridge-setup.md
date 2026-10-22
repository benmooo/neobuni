---
title: "Reflection Source: Codex Local Bridge Setup"
---

# Reflection Source: Codex Local Bridge Setup

> Status: Active
> Date: 2026-05-22
> Companion docs:
>
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-source-codex-app-server.md](./reflection-source-codex-app-server.md)
> - [./reflection-source-codex-contracts-and-normalization.md](./reflection-source-codex-contracts-and-normalization.md)
> - [./reflection-push-ingestion-substrate.md](./reflection-push-ingestion-substrate.md)
> - [../workbench/features/reflection-codex-source.md](../workbench/features/reflection-codex-source.md)

## 1. Purpose

This document is the operator runbook for setting up the local Codex source bridge.

It answers one execution question:

**how do we connect a local Codex App Server to a local Buni server, then keep Codex turn transcripts flowing into reflection raw ingestion?**

This document covers:

- prerequisites
- bootstrap sequence
- local filesystem layout
- steady-state commands
- repair and troubleshooting
- optional live smoke

It does not redefine the source architecture or normalization contract. Those live in the companion docs.

---

## 2. Operating Model

The Codex bridge is a **local CLI bridge**, not a daemon.

The steady-state flow is:

```text
Codex App Server
  -> reflection:codex:sync / reflection:codex:backfill
  -> local file-spool outbox
  -> reflection:codex:flush
  -> POST /v1/reflection/push
  -> raw append + normalize
```

That means:

- bootstrap is explicit
- sync and backfill are explicit
- flush is explicit
- retries are durable via the outbox
- V1 can be driven manually or by an external scheduler later

---

## 3. Prerequisites

Before bootstrapping the bridge, make sure all of the following are true:

1. The Buni repo is installed locally and `bun install` has already been run.
2. The local Buni server can start.
3. The local mobile app can start so you can generate a bootstrap JSON.
4. The `codex` CLI is installed and `codex --version` works.
5. You know which Codex home the bridge should read.

The last point matters:

- If you want the bridge to ingest your real existing Codex history, use your real Codex home, usually the default `~/.codex`. In practice that means either omit `--codex-home-path` or point it at that real home.
- If you want an isolated bridge-only Codex environment for smoke or sandbox work, set `--codex-home-path ~/.buni/reflection/codex/codex-home`.

Do not accidentally point the bridge at an empty isolated Codex home if you expect it to see your real local Codex threads.

---

## 4. Local Filesystem Layout

By default the bridge writes under `~/.buni/reflection/codex`.

```text
~/.buni/
  reflection/
    codex/
      config.json
      state.json
      logs/
        YYYY-MM-DD.ndjson
      outbox/
        pending/
        processing/
        failed/
```

Semantics:

- `config.json`: local bridge config derived from the bootstrap JSON plus local flags such as `serverBaseUrl`, `codexBinaryPath`, and `codexHomePath`
- `state.json`: thread watermarks used by incremental `sync`
- `logs/`: operator-facing NDJSON bridge logs
- `outbox/pending`: records ready to flush
- `outbox/processing`: claimed records currently being flushed
- `outbox/failed`: records that exhausted retryability or hit a non-retryable response

You can override the bridge root by setting `BUNI_HOME_DIR`. This is mainly useful for tests, smoke runs, or running multiple isolated local setups.

---

## 5. Bootstrap Sequence

## 5.1 Start the local Buni server

From the repo root:

```bash
bun run dev:server
```

By default the server listens on `http://127.0.0.1:8787`.

Health check:

```bash
curl http://127.0.0.1:8787/v1/health
```

If this is not healthy, do not bootstrap the bridge yet.

## 5.2 Start the local mobile app and generate the bootstrap JSON

From the repo root:

```bash
bun run dev:mobile
```

Then open the Reflection page and use the Codex source card to:

1. create or rotate the Codex source config bootstrap payload
2. download `buni-reflection-codex-bootstrap.json`

Current shape:

- the bootstrap JSON contains `sourceConfig`, `codexSettings`, and `signingSecret`
- the server base URL is **not** embedded in that JSON
- `bootstrap-local` therefore also requires `--server-base-url`

If you rotate the signing secret later, you must rerun `bootstrap-local` with the new downloaded JSON.

## 5.3 Bootstrap the local bridge

Recommended command when you want to ingest your real local Codex history:

```bash
bun run reflection:codex:bootstrap-local \
  --config ~/Downloads/buni-reflection-codex-bootstrap.json \
  --server-base-url http://127.0.0.1:8787 \
  --codex-binary-path codex \
  --redact-secret-names OPENAI_API_KEY,ANTHROPIC_API_KEY
```

Recommended command when you want an isolated Codex home:

```bash
bun run reflection:codex:bootstrap-local \
  --config ~/Downloads/buni-reflection-codex-bootstrap.json \
  --server-base-url http://127.0.0.1:8787 \
  --codex-binary-path codex \
  --codex-home-path ~/.buni/reflection/codex/codex-home \
  --redact-secret-names OPENAI_API_KEY,ANTHROPIC_API_KEY
```

What `bootstrap-local` does:

- validates the bootstrap JSON
- writes local `config.json`
- initializes empty `state.json`
- creates the local bridge directories
- probes `codex --version`
- probes `codex app-server`

Expected output includes:

- config path
- state path
- server base URL
- source config id
- codex binary path
- codex home path

---

## 6. Health Check

After bootstrap:

```bash
bun run reflection:codex:doctor
```

A healthy setup should usually show:

- `configured: yes`
- `server reachable: yes`
- `app-server reachable: yes`
- `outbox: pending=0 processing=0 stale=0 failed=0`

Key fields:

- `last thread watermark`: the incremental sync watermark stored in `state.json`
- `tracked threads`: thread count already seen by the bridge
- `stale`: processing records whose lease expired and can be reclaimed by `repair`

If `doctor` is unhealthy, fix that before trying to trust `sync` or `flush`.

---

## 7. Steady-State Commands

## 7.1 Incremental sync

```bash
bun run reflection:codex:sync
```

This reads stored threads from Codex App Server, finds threads newer than the local watermark, and enqueues completed turns into the outbox.

Useful flags:

- `--dry-run`: inspect candidate volume without writing outbox records
- `--page-size <n>`: tune thread page size
- `--use-state-db-only`: read only from the Codex state DB-backed path

Recommended first run:

```bash
bun run reflection:codex:sync --dry-run
bun run reflection:codex:sync
```

## 7.2 Flush the outbox

```bash
bun run reflection:codex:flush
```

This claims pending records, signs a push batch, posts to `/v1/reflection/push`, then removes successful records from the outbox.

Useful flags:

- `--limit <n>`: max records to push in one flush
- `--all`: keep flushing batch-by-batch until no pending records remain
- `--processing-lease-ms <ms>`: override the stale-processing lease window

Typical output includes:

- batch id
- count
- checksum
- raw inserted
- raw duplicates
- observations

## 7.3 Backfill a bounded history window

```bash
bun run reflection:codex:backfill --since "2026-05-01T00:00:00.000Z"
```

This scans stored threads, selects turns inside the requested window, and enqueues them into the outbox.

Useful flags:

- `--since <iso>`: required
- `--until <iso>`: optional, defaults to now
- `--dry-run`: preview the candidate volume first
- `--page-size <n>`
- `--use-state-db-only`

Recommended pattern:

```bash
bun run reflection:codex:backfill --since "2026-05-01T00:00:00.000Z" --dry-run
bun run reflection:codex:backfill --since "2026-05-01T00:00:00.000Z"
bun run reflection:codex:flush
```

## 7.4 Repair stale processing leases

```bash
bun run reflection:codex:repair
```

This reclaims records stuck in `outbox/processing` whose lease expired, moving them back to `pending`.

Useful flags:

- `--dry-run`
- `--processing-lease-ms <ms>`

Recommended recovery sequence after an interrupted flush:

```bash
bun run reflection:codex:repair
bun run reflection:codex:flush
```

---

## 8. Recommended Operator Flow

For the first real local setup:

1. Start `dev:server`.
2. Start `dev:mobile`.
3. Generate and download the Codex bootstrap JSON.
4. Run `reflection:codex:bootstrap-local`.
5. Run `reflection:codex:doctor`.
6. Run `reflection:codex:sync --dry-run`.
7. Run `reflection:codex:sync`.
8. Run `reflection:codex:flush`.

For history seeding:

1. Run `reflection:codex:backfill --since ... --dry-run`.
2. Run `reflection:codex:backfill --since ...`.
3. Run `reflection:codex:flush --all`.

For crash recovery:

1. Run `reflection:codex:doctor`.
2. If stale processing is non-zero, run `reflection:codex:repair`.
3. Run `reflection:codex:flush`.

---

## 9. Optional Live Smoke

If you want a bounded end-to-end proof against a real local Codex App Server plus a temporary local Buni server:

```bash
bun run reflection:codex:live-smoke --inspect-thread-limit 5 --keep-artifacts
```

What it proves:

- local `codex app-server` can be started
- stored threads can be listed
- a bounded backfill can enqueue real turns
- `flush` can push them into a temp Buni server
- raw rows and normalized observations are created

Notes:

- this command creates temporary local infra
- when `--keep-artifacts` is used, it may leave temp directories under `/var/folders/.../buni-codex-live-smoke-*`
- it is for proof and diagnosis, not steady-state ingestion

---

## 10. Troubleshooting

## 10.1 `configured: no`

The bridge has not been bootstrapped locally or `config.json` is missing.

Action:

```bash
bun run reflection:codex:bootstrap-local ...
```

## 10.2 `server reachable: no`

The local bridge cannot reach Buni.

Check:

- `bun run dev:server` is running
- `--server-base-url` matches the real server URL
- `curl http://127.0.0.1:8787/v1/health` succeeds

## 10.3 `app-server reachable: no`

The bridge cannot successfully start and query `codex app-server`.

Check:

- `codex --version` works
- the configured `codexBinaryPath` is correct
- the chosen Codex home path exists and is the one you intended
- if you set `--codex-home-path`, make sure it is not accidentally pointing at an empty sandbox when you expect real history

## 10.4 Source config mismatch

If the server-side source config was re-bootstrapped or the signing secret was rotated, the local bridge may still be holding an old `sourceConfigId` or secret.

Action:

1. download a fresh bootstrap JSON from the Reflection UI
2. rerun `reflection:codex:bootstrap-local`

## 10.5 `failed > 0` in the outbox

Some records hit a non-retryable push failure or exhausted retries.

Action:

1. inspect `~/.buni/reflection/codex/outbox/failed`
2. inspect `~/.buni/reflection/codex/logs/*.ndjson`
3. fix the server or auth issue
4. if needed, rerun `backfill` for the affected window

## 10.6 `stale > 0` in the outbox

An earlier flush likely crashed or was interrupted mid-flight.

Action:

```bash
bun run reflection:codex:repair
bun run reflection:codex:flush
```

---

## 11. Current V1 Limits

Current bridge limits are intentional:

- no daemon
- no auto scheduler
- no server-side direct pull from Codex
- no partial-stream delivery
- manual flush defaults to bounded batches of `20`

The bounded default keeps each push request small and predictable.

If you want to drain the current outbox in one operator command, use:

```bash
bun run reflection:codex:flush --all
```

This still preserves batched pushes internally. It does not build one unbounded HTTP payload.

That is acceptable for V1 because the local bridge already gives us:

- stable App Server boundaries
- durable local retries
- deterministic full-turn raw append
- bounded replay via sync and backfill
