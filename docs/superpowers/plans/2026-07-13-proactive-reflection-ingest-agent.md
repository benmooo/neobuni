---
title: "Proactive Reflection Ingest Agent Implementation Plan"
---

# Proactive Reflection Ingest Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Codex reflection ingestion automatically after one-time bootstrap while preserving the existing local outbox and reflection push sink.

**Architecture:** A local Codex agent starts with the server, performs incremental sync plus flush, and uses a pure adaptive policy to schedule its next run. The existing push endpoint and `runReflectionIngestBatch` remain the only ingestion sink.

**Tech Stack:** Bun, TypeScript, Zod, Drizzle SQLite, Bun test.

---

### Task 1: Model local adaptive scheduling

**Files:**

- Create: `scripts/reflection-codex/agent-policy.ts`
- Create: `scripts/reflection-codex/agent-policy.test.ts`

- [x] Write failing tests for active scanning, idle backoff, and retry cap.
- [x] Run `bun test scripts/reflection-codex/agent-policy.test.ts` and confirm the policy is absent.
- [x] Define Zod schemas first, then implement a pure policy with no timer, filesystem, or network dependency.
- [x] Re-run the policy test and confirm it passes.

### Task 2: Turn Codex sync and flush into agent-callable operations

**Files:**

- Modify: `scripts/reflection-codex/sync.ts`
- Modify: `scripts/reflection-codex/flush.ts`
- Create: `scripts/reflection-codex/agent-core.ts`
- Create: `scripts/reflection-codex/agent-core.test.ts`
- Create: `scripts/reflection-codex/agent.ts`
- Modify: `package.json`

- [x] Write failing tests for one agent sweep that reports a sync result, flushes in-process, and maps a thrown operation to a retryable failure result.
- [x] Run `bun test scripts/reflection-codex/agent-core.test.ts` and confirm it fails because the agent core is absent.
- [x] Extract sync and flush functions that return structured counts, and keep CLI output as the shell.
- [x] Implement the agent core and timer shell; it must schedule one later sweep from the pure policy.
- [x] Add `reflection:codex:agent` to root scripts and keep the existing commands intact.
- [x] Re-run the agent tests and confirm they pass.

### Task 3: Launch the agent with the local server

**Files:**

- Modify: `apps/server/src/index.ts`

- [x] Start the agent after the existing local workers.
- [x] Skip cleanly when the local bridge has not been bootstrapped.
- [x] Run server and scripts type checks.

### Task 4: Verify the integrated flow

**Files:**

- Modify: `scripts/reflection-codex/bridge.integration.test.ts`
- Modify: `docs/perception-layer/reflection-source-codex-local-bridge-setup.md`

- [ ] Add an integration case proving a claimed agent run enqueues and pushes a completed turn through `/v1/reflection/push` without a manual `sync` or `flush` command.
- [ ] Run the targeted reflection tests, all workspace type checks, and the integration test.
- [ ] Update the operator guide: bootstrap once, start Buni with its ingest agent, inspect health, and use backfill/repair only for recovery.
- [ ] Commit the implementation only after all verification commands exit successfully.
