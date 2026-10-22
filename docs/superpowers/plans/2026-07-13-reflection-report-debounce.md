---
title: "Reflection Daily Report Debounce Implementation Plan"
---

# Reflection Daily Report Debounce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coalesce active Codex-ingest daily report rebuilds without delaying raw or normalized observations.

**Architecture:** Daily dirty marks persist a first-dirty time and queue eligibility time. The mark repository atomically extends an active burst and the report queue filters marks by eligibility before calling the report builder.

**Tech Stack:** TypeScript, Zod, Drizzle SQLite, Bun test.

---

### Task 1: Persist and coalesce debounced report marks

**Files:**
- Modify: `packages/db/src/schema/reflection-report-marks.ts`
- Modify: `packages/db/src/repos/reflection-report-marks.ts`
- Test: `apps/server/src/reflection/report/run-report-queue.test.ts`

- [ ] Write a failing test that creates two active-day dirty marks and expects one retained row with a delayed `notBeforeAt` and original `dirtySinceAt`.
- [ ] Run the focused test and confirm the current mark shape cannot satisfy it.
- [ ] Add Drizzle fields and a unique index; implement an atomic daily-mark upsert that uses a 15-minute quiet period and a two-hour maximum staleness cap.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Gate report generation on mark eligibility

**Files:**
- Modify: `apps/server/src/reflection/report/run-report-queue.ts`
- Test: `apps/server/src/reflection/report/run-report-queue.test.ts`

- [ ] Write failing tests proving the queue skips a not-yet-due daily mark, builds it after `notBeforeAt`, and still builds closed weekly/monthly marks.
- [ ] Run the focused test and confirm the queue currently builds the early daily mark.
- [ ] Add the pure eligibility predicate and make explicit manual queue runs able to bypass the delay.
- [ ] Re-run targeted report tests, server typecheck, and DB typecheck.
