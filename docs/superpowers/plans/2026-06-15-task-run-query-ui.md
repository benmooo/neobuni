---
title: "Task-Run Query API And UI Implementation Plan"
---

# Task-Run Query API And UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `task_run` a first-class review surface with schedule-first discovery, direct task-run detail APIs, and mobile UI entrypoints under `/schedules`.

**Architecture:** Keep `schedule`, `task_run`, and `runtime trace` as separate resources. Extend `/v1/schedules` with latest-run summaries for the schedule-first home screen, add schedule-scoped run history plus direct `/v1/task-runs/:taskRunId` and `/trace` endpoints for detached review, and wire mobile routes to those resources without coupling task-run review back to conversations.

**Tech Stack:** Hono, Drizzle repos, Zod contracts, TanStack Router, TanStack Query, `@buni/ui`

---

### Task 1: Add Server-Side Task-Run Query Contracts And Routes

**Files:**

- Create: `packages/contracts/src/execution-layer/task-run-query.ts`
- Create: `apps/server/src/routes/task-runs.test.ts`
- Create: `apps/server/src/routes/task-runs.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/routes/schedules.test.ts`
- Modify: `apps/server/src/routes/schedules.ts`
- Modify: `packages/db/src/repos/task-runs.ts`

- [ ] **Step 1: Write failing route tests for schedule-scoped run history and direct task-run detail**
- [ ] **Step 2: Run the new route tests and confirm they fail because routes/contracts are missing**
- [ ] **Step 3: Add Zod query/detail/trace schemas and repo helpers for latest-by-schedule plus limited schedule history**
- [ ] **Step 4: Implement `/v1/task-runs/:taskRunId`, `/v1/task-runs/:taskRunId/trace`, and `/v1/schedules/:scheduleId/task-runs`**
- [ ] **Step 5: Extend `GET /v1/schedules` to return schedule list items with `latestTaskRun` summaries**
- [ ] **Step 6: Re-run server route tests until green**

### Task 2: Build Mobile Schedule Queries And Pages

**Files:**

- Create: `apps/mobile/src/hooks/use-schedules.ts`
- Create: `apps/mobile/src/routes/_app/schedules/$scheduleId.tsx`
- Create: `apps/mobile/src/routes/_app/schedules/runs/$taskRunId.tsx`
- Modify: `apps/mobile/src/routes/_app/schedules/index.tsx`
- Modify: `apps/mobile/src/components/chat/RuntimeTimelineSheet.tsx`

- [ ] **Step 1: Write a minimal failing smoke path by loading the new routes against missing hooks/components**
- [ ] **Step 2: Add schedule/task-run query hooks backed by the new API response schemas**
- [ ] **Step 3: Replace the schedules placeholder page with a schedule-first list showing latest run summaries**
- [ ] **Step 4: Add schedule detail with blueprint summary plus run history**
- [ ] **Step 5: Add task-run detail page with result/error/transcript and reusable runtime trace detail rendering**
- [ ] **Step 6: Re-run typecheck or targeted frontend verification until the new pages compile**

### Task 3: Wire Ops Deep Links And Final Verification

**Files:**

- Modify: `apps/mobile/src/routes/_app/ops/runtime/index.tsx`
- Modify: `apps/mobile/src/components/chat/RuntimeTimelineSheet.tsx`
- Test: `apps/server/src/routes/task-runs.test.ts`
- Test: `apps/server/src/routes/schedules.test.ts`

- [ ] **Step 1: Update runtime recent-activity cards to prefer `taskRunId -> /schedules/runs/$taskRunId`**
- [ ] **Step 2: Preserve conversation runtime links for pure chat turns**
- [ ] **Step 3: Run targeted backend tests, contract typecheck, and mobile/server typecheck**
- [ ] **Step 4: Review the changed pages and API shapes for detached task-run coverage before closing**
