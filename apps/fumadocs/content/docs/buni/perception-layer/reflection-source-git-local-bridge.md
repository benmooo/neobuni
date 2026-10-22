---
title: "Reflection Source: Git Local Bridge"
---

# Reflection Source: Git Local Bridge

> Status: Active design
> Date: 2026-05-07
> Companion docs:
>
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-push-ingestion-substrate.md](./reflection-push-ingestion-substrate.md)
> - [./reflection-source-git.md](./reflection-source-git.md)
> - [./reflection-observation-ingestion-pipeline.md](./reflection-observation-ingestion-pipeline.md)

## 1. Purpose

This document defines the local bridge implementation plan for the Git reflection source.

It answers one execution question:

**how should Git commits be captured locally and delivered into Buni without polluting repos or blocking the commit path?**

This document defines:

- the local bridge runtime shape
- filesystem layout for config, hooks, and outbox
- the CLI command model
- the global hook strategy
- the outbox and retry model
- the bootstrap boundary between server and local bridge

It does not define:

- the server-side push API
- the normalized Git observation shape
- browser or Codex bridge behavior

---

## 2. Core Decision

The Git bridge should be a **local CLI-driven bridge**, not a dedicated app or daemon in V1.

The operating model is:

```text
global post-commit hook
  -> local CLI enqueue
  -> file-spool outbox
  -> local CLI flush
  -> POST /v1/reflection/push
```

This is the right V1 choice because:

- Git events are born locally
- hook integration already gives us a clean trigger point
- a small CLI is easier to debug than a long-running background process
- file-spool delivery is robust enough without introducing SQLite or service management

The bridge should optimize for:

- minimal commit-path overhead
- zero repo-local mutation
- clear on-disk visibility
- at-least-once delivery

---

## 3. Scope Boundary

## 3.1 V1 in scope

The local bridge should include:

- one CLI entrypoint with subcommands
- one user-level global `post-commit` hook
- one user-level config file
- one user-level durable outbox
- Git metadata extraction
- workspace-root filtering
- HMAC push to `/v1/reflection/push`
- a doctor command for visibility and gap detection

## 3.2 V1 out of scope

The local bridge should not yet include:

- a dedicated desktop app
- a persistent daemon
- launchd or systemd integration
- an interactive login flow
- a GUI for repo inventory
- browser or Codex delivery

Those can come later if the CLI bridge proves the shape.

---

## 4. Local Filesystem Layout

The bridge should use a user-level home directory, not the repo itself.

Recommended layout:

```text
~/.buni/
  reflection/
    git/
      config.json
      logs/
      outbox/
        pending/
        processing/
        failed/
  git-hooks/
    post-commit
  bin/
    buni-git-reflection
```

Design rules:

- tracked repos must not be mutated
- hook state must be user-level
- outbox state must survive shell exits and machine restarts
- on-disk data should be inspectable without specialized tooling

This layout gives a clear split:

- `config.json` is control-plane state
- `outbox/` is delivery state
- `git-hooks/` is Git integration state
- `bin/` is the stable execution entrypoint

---

## 5. CLI Shape

The bridge should expose one CLI with five V1 subcommands:

- `bootstrap-local`
- `backfill`
- `enqueue`
- `flush`
- `doctor`

Suggested invocation shape:

```text
buni-git-reflection <subcommand> [options]
```

### 5.1 `bootstrap-local`

Responsibilities:

- read bootstrap config from a JSON file produced by the server-side bootstrap flow
- write `~/.buni/reflection/git/config.json`
- write `~/.buni/git-hooks/post-commit`
- set global `core.hooksPath`
- install or refresh the stable wrapper entrypoint under `~/.buni/bin`

This command is operator-facing.

It should be safe to rerun.

### 5.2 `backfill`

Responsibilities:

- scan one repo or all managed repos under configured workspace roots
- select commits within an operator-provided time window
- rebuild Git raw payloads from commit SHAs
- send those commits through a dedicated backfill endpoint in bounded batches

This command is operator-facing.

It exists for:

- first-time history seeding
- repair after bridge downtime
- manual resend when hooks or outbox delivery missed a window

It should support:

- `--since <iso-or-date>`
- `--until <iso-or-date>`
- `--repo-root <path>` to narrow to one repo
- `--dry-run` to preview candidate volume before sending

### 5.3 `enqueue`

Responsibilities:

- run from inside a repo after `post-commit`
- detect repo root and current `HEAD`
- check whether the repo belongs to a managed workspace root
- build one Git raw payload
- write one outbox record to `pending/`
- optionally trigger a lightweight best-effort flush

This command is hook-facing.

It must be fast and quiet.

### 5.4 `flush`

Responsibilities:

- move pending records into `processing/`
- batch them
- sign requests
- call `/v1/reflection/push`
- delete or archive successful records
- retry failures with backoff

This command is transport-facing.

It owns networking and retry policy.

### 5.5 `doctor`

Responsibilities:

- verify `core.hooksPath`
- verify hook and wrapper presence
- verify config file shape
- summarize workspace roots
- summarize outbox depth
- check server reachability if possible
- surface coverage gaps such as local `core.hooksPath` overrides

This command is operator-facing.

It must explain why Git reflection is healthy or unhealthy.

---

## 6. Config Model

The local config should be a direct consumer of the server bootstrap response, not an independent shape.

Suggested V1 config:

```ts
type LocalGitBridgeConfig = {
  serverBaseUrl: string;
  sourceConfigId: string;
  sourceKind: "git";
  connectorKind: "local_git";
  signingSecret: string;
  workspaceRoots: Array<{
    path: string;
    label: string | null;
  }>;
  captureMode: "global_hooks";
  installedAt: string;
  updatedAt: string;
};
```

This config should be written by `bootstrap-local`.

The bridge should treat this file as the local source of truth for:

- whether Git reflection is configured
- which roots are managed
- which source config to sign as
- which server to push to

---

## 7. Bootstrap Boundary

V1 should not try to solve local CLI authentication.

Instead, bootstrap should be explicitly two-step:

1. a signed-in client calls `POST /v1/reflection/sources/git/bootstrap`
2. the returned bootstrap payload is written to disk and passed into `bootstrap-local`

This keeps the boundary small.

The local bridge should consume bootstrap output, not acquire it directly.

That means V1 `bootstrap-local` can accept:

- `--config <path-to-json>`

The JSON should contain:

- `sourceConfig`
- `gitSettings`
- `signingSecret`
- the server base URL the local bridge should push to

This is intentionally pragmatic.

It avoids turning the Git bridge into an auth client before the delivery path exists.

---

## 8. Global Hook Strategy

The bridge should install one global `post-commit` hook by setting:

```text
git config --global core.hooksPath ~/.buni/git-hooks
```

The `post-commit` file should be as thin as possible.

It should only do this:

```text
~/.buni/bin/buni-git-reflection enqueue
```

The hook should not:

- parse Git output itself
- hold configuration logic
- perform network requests directly
- block commits on remote availability

This keeps hook logic stable even as bridge implementation evolves.

### 8.1 Repo-local override caveat

A repo-local `core.hooksPath` can override the global hook path.

So the bridge must treat this as a health concern and surface it via `doctor`.

This is not a reason to revert to per-repo hook installation.

It is a visibility requirement.

---

## 9. Commit Path Contract

The commit path must remain local, fast, and failure-tolerant.

The contract is:

```text
if commit succeeded
  then bridge may enqueue
  but bridge may not make commit fail
```

So `enqueue` should:

- write one pending record
- log minimally on failure
- exit quickly

It must not:

- wait on the network
- retry in the foreground for a long time
- treat push failure as commit failure

This rule is non-negotiable.

Reflection collection cannot become part of Git correctness.

---

## 10. Outbox Model

V1 should use a **file-spool outbox**, not SQLite.

Each raw commit event should become one JSON file.

Suggested directories:

- `pending/`
- `processing/`
- `failed/`

Suggested flow:

```text
enqueue
  -> write one record into pending/

flush
  -> move a bounded set from pending/ to processing/
  -> push batch
  -> on success delete from processing/
  -> on retryable failure move back to pending/ with updated retry metadata
  -> on terminal failure move to failed/
```

This approach is preferred in V1 because:

- it is easy to inspect manually
- it avoids lock coordination issues in hooks
- it keeps failure handling simple
- it is good enough for expected local commit volume

Suggested per-record shape:

```ts
type GitOutboxRecord = {
  id: string;
  createdAt: string;
  nextAttemptAt: string;
  retryCount: number;
  lastError: string | null;
  dedupeKey: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};
```

The payload should match the raw Git push contract already defined on the server side.

---

## 11. Git Metadata Extraction

`enqueue` should gather enough metadata to build the Git raw payload without reading patch contents.

Suggested local sources:

- `git rev-parse --show-toplevel`
- `git rev-parse --abbrev-ref HEAD`
- `git config --get remote.origin.url`
- `git show --quiet --format=... HEAD`
- `git show --numstat --format= HEAD`

The bridge should derive:

- `repo`
- `repoKey`
- `repoRoot`
- `sha`
- `branch`
- `authoredAt`
- `committedAt`
- `commitMessage`
- `commitSubject`
- `filesChanged`
- `insertions`
- `deletions`
- `topLevelPaths`
- `touchedAreas`
- `isMerge`
- `isWip`

The bridge should not push:

- patch hunks
- file contents
- raw diff text

This source is about work-output shape, not source-code archival.

---

## 12. Workspace Root Filtering

The bridge should only capture repos that belong to configured workspace roots.

Filtering rule:

- resolve repo root
- normalize path
- check whether repo root is inside any configured workspace root

If not:

- `enqueue` should no-op

This keeps the global hook safe to install at the user level while still restricting capture scope.

---

## 13. Delivery Model

`flush` should batch pending records and push them to:

```text
POST /v1/reflection/push
```

Headers:

- `X-Buni-Source-Id`
- `X-Buni-Timestamp`
- `X-Buni-Signature`

Signature:

- HMAC SHA-256 over `${timestamp}.${rawBody}`

Correctness model:

- local delivery is at-least-once
- server append is idempotent by `dedupeKey`
- downstream rebuild is window-bounded

So `flush` should not try to invent exactly-once transport.

---

## 14. Best-Effort Flush Trigger

V1 should allow `enqueue` to trigger a lightweight best-effort flush after writing the outbox record.

But this must be opportunistic, not required.

The real correctness boundary is:

- record durably written to outbox

not:

- record immediately accepted by server

This means:

- if best-effort flush succeeds, latency improves
- if it does not run or fails, later `flush` recovers

---

## 15. Doctor Expectations

`doctor` should produce actionable output for these classes of problems:

- global `core.hooksPath` is unset or wrong
- `post-commit` hook file missing
- wrapper file missing or not executable
- config file missing or malformed
- workspace roots missing
- outbox backlog growing
- server unreachable
- managed repos with repo-local `core.hooksPath` overrides

The operator should be able to run one command and answer:

- is Git reflection installed
- is it capturing commits
- is it able to deliver
- where are the blind spots

---

## 16. Suggested Repo Placement

V1 should live under the root scripts system, not under `apps/server`.

Recommended placement:

```text
scripts/reflection-git/
```

This fits the current repo better because:

- it is local-operator tooling
- it is not part of the server runtime
- it keeps Git-edge logic outside the server shell

Suggested internal files:

```text
scripts/reflection-git/index.ts
scripts/reflection-git/bootstrap-local.ts
scripts/reflection-git/enqueue.ts
scripts/reflection-git/flush.ts
scripts/reflection-git/doctor.ts
scripts/reflection-git/config.ts
scripts/reflection-git/git.ts
scripts/reflection-git/outbox.ts
scripts/reflection-git/signing.ts
```

This split follows the project's functional-core preference:

- pure helpers for payload building, path matching, signing, and serialization
- imperative edges for Git commands, filesystem writes, and HTTP push

---

## 17. Acceptance Criteria

The Git local bridge plan is ready to implement when:

1. `bootstrap-local` can install one global hook and write local bridge config without mutating tracked repos
2. a commit inside a managed workspace root writes one durable outbox record without depending on network success
3. a commit outside managed roots is ignored cleanly
4. `flush` can batch, sign, and push pending records to `/v1/reflection/push`
5. duplicate delivery is safe because the bridge uses stable `dedupeKey` values
6. `doctor` can explain installation state, delivery health, and common blind spots such as repo-local hook overrides
