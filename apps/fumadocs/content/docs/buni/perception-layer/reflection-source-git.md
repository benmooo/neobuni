---
title: "Reflection Source: Git"
---

# Reflection Source: Git

> Status: Active design
> Date: 2026-05-07
> Companion docs:
>
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-system-architecture.md](./reflection-system-architecture.md)
> - [./reflection-contracts-and-storage.md](./reflection-contracts-and-storage.md)
> - [./reflection-observation-ingestion-pipeline.md](./reflection-observation-ingestion-pipeline.md)
> - [./reflection-push-ingestion-substrate.md](./reflection-push-ingestion-substrate.md)
> - [./reflection-source-git-local-bridge.md](./reflection-source-git-local-bridge.md)

## 1. Purpose

This document defines the Git source design for the reflection system.

It answers one practical question:

**how should work output from local git repos enter reflection as a push-first source?**

This document defines:

- source identity and connector shape
- workspace-root based repo discovery
- global hook and outbox behavior
- pushed commit payload semantics
- normalization expectations for `git_commit` observations
- backfill and repair behavior

It does not define:

- generic push substrate behavior beyond what Git needs
- downstream state, episode, or pattern rules

---

## 2. Core Decision

Git should be a **local push source**, not a server-polled source.

The steady-state path is:

```text
git commit
  -> global git hook
  -> local outbox
  -> signed push batch
  -> reflection raw append
  -> git observation rebuild
```

not:

```text
server poll
  -> scan repo logs
  -> infer what changed locally
```

The reason is straightforward:

- commit events are created locally
- the local machine already has the required metadata
- server polling would need local filesystem reachability or another side channel
- polling adds latency and weakens trust boundaries

---

## 3. Source Identity

The Git source should use:

- `sourceKind: "git"`
- `connectorKind: "local_git"`
- `syncMode: "webhook"`
- `granularity: "event"`

`import` remains available for:

- first-time history backfill
- missed periods while the local bridge was absent
- manual recovery after local outbox corruption

In practice for the local Git bridge, this recovery path should be exposed as a
manual bridge command that rebuilds commit payloads locally and submits them
through a dedicated backfill endpoint, rather than asking the server to inspect
repos directly.

---

## 4. High-Level Architecture

```text
Workspace roots
  -> global hook coverage
  -> post-commit event capture
  -> local durable outbox
  -> push to /reflection/push
  -> raw git observations
  -> normalize to git_commit observations
```

Expanded:

```text
configured workspace roots
  -> configure global core.hooksPath once
  -> on each commit, global post-commit captures HEAD metadata
  -> bridge checks whether repo belongs to a managed workspace root
  -> append one outbox record
  -> async sender batches records
  -> server dedupes by repo identity + sha
  -> reflection rebuild runs for the affected window
```

---

## 5. Workspace Root Model

The user wants Git coverage across all repos under a few workspace roots.

That means the Git bridge should not be configured repo-by-repo by default.

The bridge should support:

```ts
type GitWorkspaceRoot = {
  path: string;
  label: string | null;
  enabled: boolean;
};
```

Bootstrap flow:

1. user registers one or more workspace roots
2. local Git bridge configures one global `core.hooksPath`
3. local Git bridge may scan each root for inventory and health visibility
4. any repo under a managed root is eligible for automatic capture on commit

This is the main advantage of the global-hook approach:

- new repos under managed workspace roots do not require per-repo installation
- the bridge does not need to mutate repo-local hook directories
- repository coverage is determined by root policy, not installation drift

Suggested V1 behavior for newly created repos:

- a new repo under a managed root is automatically covered on its first commit
- optional rescan updates inventory views, but is not required for capture correctness

Suggested later enhancement:

- background inventory refresh for better visibility before the first commit happens

### 5.1 Recovery and backfill

Git needs one explicit repair path in addition to steady-state hook capture.

The recovery model should be:

```text
operator chooses time window
  -> local bridge scans managed repos
  -> local bridge rebuilds commit payloads from git log
  -> local bridge submits bounded backfill batches
  -> server ingests under the same git source config
```

This preserves the same trust boundary as steady-state push:

- repos are still read only on the local machine
- the server still does not poll local git history
- dedupe still happens by stable Git commit identity

Backfill should be used for:

- first-time history seeding
- repair after bridge downtime
- manual resend after hook misconfiguration

---

## 6. Global Hook Strategy

The Git bridge should use a global `post-commit` hook via `core.hooksPath`.

Recommended setup:

```text
git config --global core.hooksPath <buni-managed-hooks-dir>
```

That managed hooks directory should contain the Buni `post-commit` entrypoint.

This is preferable to per-repo hook installation because:

- it avoids polluting each tracked repo
- it automatically covers newly created repos
- it reduces drift between repos
- it keeps the integration clearly user-level rather than repo-level

`post-commit` is the right first hook because:

- it runs only after a commit succeeds
- the new `HEAD` is available
- it matches the user's desired unit of work output
- it avoids blocking the actual commit decision path with remote IO

The hook should do only local work:

1. read `HEAD` metadata
2. build one raw event payload
3. check whether the repo belongs to a managed workspace root
4. write that event to the local outbox
5. exit quickly

The hook should not:

- make network requests inline if that can delay commits
- fail the commit because Buni is offline
- inspect or transmit full diffs

This is important.

The commit path must remain fast and reliable even when Buni is unavailable.

The global hook should also no-op cleanly when:

- the current repo is outside all managed workspace roots
- the bridge runtime is temporarily unavailable
- the repo is explicitly excluded by user policy

### 6.1 Coverage caveat: repo-level `core.hooksPath` override

One Git caveat matters here:

- a repo-local `core.hooksPath` can override the global value

That means a repo can opt out of the global Buni hook, intentionally or accidentally.

So the bridge should expose health warnings for:

- managed repos whose local config overrides `core.hooksPath`
- managed repos that are under registered roots but have never emitted events

This is a visibility problem, not a reason to fall back to per-repo installation.

---

## 7. Local Outbox Model

Git push delivery should go through a durable local outbox.

Suggested record shape:

```ts
type GitOutboxRecord = {
  id: string;
  repoRoot: string;
  commitSha: string;
  occurredAt: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  nextAttemptAt: string;
  lastError: string | null;
};
```

The sender process should:

- batch pending records
- sign and push them to the reflection push endpoint
- delete or mark acknowledged records on success
- retry with backoff on failure

The outbox is non-negotiable for Git because:

- commit events are valuable
- network availability is variable
- the global hook should not become a transport coordinator

---

## 8. Repository Identity and Dedupe

The dedupe key must be stable across retries and unique across repos.

`repo` alone is not enough because repo names can collide across workspace roots.

Recommended repository identity rule:

```text
repoKey =
  normalized remote origin url without credentials
  else normalized repo root path
```

Recommended dedupe rule:

```text
dedupeKey = git:<repoKey>:<sha>
```

This ensures:

- retrying the same commit is safe
- two repos with the same name do not collide
- moved or renamed local directories still dedupe correctly when remote origin is stable

---

## 9. Pushed Payload Contract

Each commit event should push one raw item.

Suggested payload:

```ts
type GitCommitPushPayload = {
  sha: string;
  repo: string;
  repoKey: string;
  repoRoot: string;
  branch: string | null;
  authoredAt: string;
  committedAt: string;
  commitMessage: string;
  commitSubject: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  topLevelPaths: string[];
  touchedAreas: string[];
  isMerge: boolean;
  isWip: boolean;
};
```

Notes:

- `commitMessage` is useful reflection evidence
- `commitSubject` is a cheap shortcut for summaries and tags
- `topLevelPaths` preserves directional context without exposing every filename
- `touchedAreas` is a derived higher-level grouping such as `server`, `mobile`, `db`, `docs`

Recommended `occurredAt`:

- `startedAt = committedAt`
- `endedAt = committedAt`

Recommended `externalId`:

- the commit `sha`

Recommended provenance metadata:

- hook kind
- local bridge version
- hostname or device label if needed

---

## 10. Privacy Boundary

Git reflection should capture work output shape, not code contents.

The Git bridge should push:

- commit metadata
- churn metrics
- touched areas

The Git bridge should not push:

- patch hunks
- full file contents
- commit diff text
- secrets embedded in remotes

Remote URLs must be sanitized before use as identity material.

Examples:

- keep host and repo path
- strip credentials and tokens

This source is about work rhythm and delivery shape, not source-code archival.

---

## 11. Observation Normalization

The current system already has a `git` normalization path.

That path should remain conceptually the same:

- one raw commit event
  -> one `Observation`
  -> `category: "work"`
  -> `kind: "git_commit"`

Expected normalized fields:

- `summary`
  - repo plus truncated commit subject
- `tags`
  - repo
  - branch
  - touched areas
  - commit kind flags such as `merge` or `wip`
- `metrics`
  - `filesChanged`
  - `insertions`
  - `deletions`
- `content`
  - repo identity
  - branch
  - commit message
  - touched areas
  - merge and wip flags

The important rule is:

Git normalization still describes factual work output.

It does not infer:

- whether the user was avoiding
- whether the project was blocked
- whether confidence was high or low

Those belong to later layers.

---

## 12. State and Pattern Utility

Git should become one of the strongest reflection inputs for work-related signals.

Examples of what later layers may derive from Git observations:

- sustained output versus stalled days
- fragmented micro-commit bursts versus coherent work blocks
- recurring repo or area switching
- high research-to-output imbalance when compared with browser sessions

Git alone should not be overinterpreted.

But combined with browser and Codex, it becomes a high-value anchor for:

- focus
- uncertainty
- delivery cadence
- project-level momentum

---

## 13. Backfill and Recovery

Git still needs an import path even though steady-state is push-first.

Use cases:

- install bridge after months of prior work
- rebuild missing periods after accidental local data loss
- repair a time window if the hook was disabled

Suggested backfill flow:

1. select workspace roots or repos
2. enumerate commits for a bounded range
3. build the same raw payload used by `post-commit`
4. send via `/reflection/import` or the same append path behind a local replay tool

The backfill path should reuse the exact same payload semantics as live push.

Do not create a second Git data model just for import.

---

## 14. Failure and Reliability Rules

### 14.1 Commit path must not fail because Buni is unavailable

The global hook should succeed if the commit succeeded.

Reflection ingestion is valuable, but it must not become part of Git's correctness boundary.

### 14.2 Retries are expected

If the same commit is sent multiple times:

- raw append dedupe should absorb it
- downstream artifacts should remain correct

### 14.3 Local bridge health should be inspectable

At minimum, the bridge should expose or log:

- discovered repo count
- global hook configuration status
- managed repos with local `core.hooksPath` overrides
- outbox depth
- last successful push time
- last push error

This matters because Git reflection is only trustworthy if delivery gaps are visible.

---

## 15. Implementation Direction

### 15.1 Local Git bridge

Need a small local component that can:

- manage workspace roots
- discover repos
- configure and verify global `core.hooksPath`
- read commit metadata
- manage the outbox
- send signed push batches

### 15.2 Server contracts

Need the shared push endpoint and source-secret authentication from the push substrate doc.

### 15.3 Core normalization

The existing `git` normalization path should be extended to preserve richer payload fields such as:

- `sha`
- `repoKey`
- `topLevelPaths`
- `touchedAreas`
- `isMerge`
- `isWip`

### 15.4 Tooling

Need at least two operator commands:

- bootstrap global hook coverage or rescan workspace roots
- replay or backfill commit history

---

## 16. Acceptance Criteria

The Git source design is ready to implement when:

1. one bootstrap action can register workspace roots and configure one global Git hooks path without mutating tracked repos
2. a successful local commit in any repo under a managed workspace root appends one durable outbox record without blocking the commit on network access
3. the sender can push commit events idempotently into reflection
4. server-side normalization produces stable `git_commit` observations from pushed commits
5. newly created repos under managed workspace roots are captured without per-repo installation drift
6. backfill reuses the same payload semantics instead of inventing a second ingestion shape
