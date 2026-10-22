---
title: "Reflection Git Observability UI"
---

# Reflection Git Observability UI

> Status: Active design
> Date: 2026-05-09
> Companion docs:
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-source-git.md](./reflection-source-git.md)
> - [./reflection-source-git-local-bridge.md](./reflection-source-git-local-bridge.md)
> - [./reflection-push-ingestion-substrate.md](./reflection-push-ingestion-substrate.md)

## 1. Purpose

This document defines the UI and API shape for Git source observability and recovery.

It answers one practical product question:

**where should Git source health, inspection, and operator actions live once Git push ingestion is working?**

This document defines:

- why Git source operations should move out of `settings`
- the target route structure in the mobile app
- the server read-models needed for Git source health and inspection
- the operator-facing panels for health, inspection, and recovery

It does not define:

- Chrome or Codex source UI
- the normalized Git observation contract
- the local bridge transport internals

---

## 2. Core Decision

Git source health and inspection should **not** live inside `settings`.

They should move into a dedicated reflection/source page:

```text
/_app/reflection/git/
```

`settings` should remain focused on:

- user identity
- Buni persona
- theme and display preferences
- provider configuration

Git observability is a different class of surface.

It is not configuration-only. It is an operator console for a live ingestion source.

So it should own:

- health
- inspection
- recovery
- coverage diagnostics

---

## 3. Why Settings Is The Wrong Home

The current Git section mixes three different concerns:

1. source bootstrap and configuration
2. runtime source health
3. reflection artifact inspection

That makes `settings` noisy because the user enters one page expecting stable preferences, but instead also sees:

- sync timestamps
- ingest activity counts
- bridge health
- repair actions

As more local reflection sources arrive, this pattern becomes unmaintainable.

If Chrome and Codex follow the same route, `settings` becomes a source operations dashboard instead of a settings page.

That is the wrong information architecture.

---

## 4. Target Route Structure

The mobile app should move toward this split:

```text
/_app/settings/
  configuration-only surfaces

/_app/reflection/git/
  Git source health, inspection, bootstrap, backfill, and repair
```

This is only the first step.

Later, the same route family can grow to:

```text
/_app/reflection/git/
/_app/reflection/chrome/
/_app/reflection/codex/
```

That gives the reflection subsystem a coherent operator-facing home.

---

## 5. Git Page Structure

The Git reflection page should contain four sections.

### 5.1 Source Health

This panel should answer:

- is the Git source configured on the server
- is the local bridge configured
- is the global hook installed
- is the local outbox healthy
- is the server reachable
- are there repo-local `hooksPath` overrides blocking coverage

Suggested fields:

- source config id
- source status and sync mode
- last event / last success / last error
- raw observations in the last 24h
- normalized observations in the last 24h
- global `core.hooksPath`
- expected hook path
- wrapper present / hook present
- outbox pending / processing / failed
- workspace roots with path existence
- managed repo count
- repo-local hook override list
- server reachability

### 5.2 Inspection

This panel should answer:

- what raw Git events recently arrived
- what normalized Git observations were derived from them

Suggested first version:

- recent raw observations list
- recent normalized observations list
- newest-first ordering
- bounded limit only, no pagination in V1

### 5.3 Recovery

This panel should answer:

- how do I bootstrap a machine
- how do I repair missing windows

Suggested controls:

- generate bootstrap JSON
- show `bootstrap-local` command
- show `backfill` command examples

### 5.4 Coverage Diagnostics

This panel should answer:

- which workspace roots are configured
- which roots are missing locally
- which repos are discovered
- which repos are excluded by repo-local hook overrides

This can initially be folded into Source Health, then split later if needed.

---

## 6. Server Read Models

The Git page should not parse CLI text output.

The server should expose structured read-models for the page.

### 6.1 Git source health

Suggested route:

```text
GET /v1/reflection/sources/git/health
```

Suggested payload shape:

```ts
{
  sourceOverview: ReflectionSourceOverview | null;
  localBridge: GitLocalBridgeHealth;
  localSourceConfigMatchesServer: boolean | null;
}
```

This route should combine:

- persisted source overview from the server database
- structured local bridge inspection from the local machine

Important:

the local bridge health should come from a shared structured inspector, not from parsing CLI `doctor` text.

### 6.2 Raw observation inspection

Suggested route:

```text
GET /v1/reflection/raw-observations?sourceKind=git&sourceConfigId=<id>&limit=<n>
```

This route should expose recent raw artifacts directly so the page can inspect what arrived before normalization.

### 6.3 Observation inspection

The existing route is sufficient for V1:

```text
GET /v1/reflection/observations?sourceKind=git&limit=<n>
```

---

## 7. Shared Inspector Rule

The local Git bridge should expose one shared structured inspector.

Suggested module:

```text
scripts/reflection-git/inspect.ts
```

That inspector should return JSON describing:

- local config presence
- paths
- hook installation state
- workspace root existence
- discovered repo count
- repo-local hook overrides
- outbox counts
- server reachability

Then:

- `doctor` renders that JSON to text
- the server health route reuses that JSON directly

This is important because CLI and UI must not drift into different notions of “healthy”.

---

## 8. Execution Plan

Implementation should happen in this order:

1. add this design doc
2. extract a shared structured Git bridge inspector
3. add `GET /v1/reflection/sources/git/health`
4. add `GET /v1/reflection/raw-observations`
5. add `/_app/reflection/git/`
6. move Git UI out of `/_app/settings/`
7. add a navigation entry to the new page

This sequence keeps the UI backed by real read-models instead of temporary client-side inference.

---

## 9. Non-Goals For This Round

This round should not try to:

- build a generic multi-source observability framework
- add pagination or advanced filtering
- move every operational panel out of `settings`
- redesign the entire mobile navigation

The goal is narrower:

**make Git source operations observable and coherent, without letting `settings` keep growing into an operator console.**
