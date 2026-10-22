---
title: "Chat-Writable Memory Tools Research"
---

# Chat-Writable Memory Tools Research

> Status: Research note
> Date: 2026-05-29

## Goal

Enable chat to curate durable memory directly instead of only recalling it.

The requested tool surface is:

- `save_memory`
- `update_memory`
- `resolve_memory_conflict`
- `mark_task_done`

## Current Baseline

Today the repo already has:

- manual memory CRUD over `/v1/memories`
- `recall_memory` in the chat tool set
- runtime retrieval over temporal, graph, and knowledge stores
- `memories.status`, `memories.memoryClass`, and `memories.sourceKind` columns in storage

But chat cannot currently:

- write a new memory directly
- edit an existing memory directly
- close task memories directly
- handle conflicting durable memories through a first-class workflow

That means the runtime can recall memory but cannot curate it.

## Constraints

The solution should preserve current repo rules:

- functional core, imperative shell
- server is the source of truth
- tool execution happens in the canonical chat runtime
- typed contracts must stay Zod-first

## Options Considered

## Option A: Direct write with no conflict model

Flow:

- `save_memory` or `update_memory` writes immediately
- later writes just overwrite or create duplicates

Pros:

- smallest code change
- no new persistence model

Cons:

- tasks and preferences will drift into duplicates quickly
- chat cannot pause for clarification without losing state
- no deterministic recovery if the user says "keep both" or "actually replace the old one"

Rejected.

## Option B: In-turn conflict cache only

Flow:

- detect a conflict
- keep it in an in-memory map for the current turn
- expect `resolve_memory_conflict` later in the same stream

Pros:

- easy to implement

Cons:

- fails across turns
- fails if the model asks the user a follow-up question first
- not durable enough for normal chat UX

Rejected.

## Option C: Persisted conflict artifact plus explicit resolution tool

Flow:

- `save_memory` or `update_memory` builds a normalized draft
- deterministic conflict detection checks active memories
- if conflict exists, store a `memory_conflicts` row
- later `resolve_memory_conflict` closes that row and applies the chosen action

Pros:

- survives across turns
- deterministic and auditable
- keeps write logic explicit instead of burying it inside model text

Cons:

- requires a new table and a little more orchestration

Chosen.

## Key Findings

1. The repo already had enough memory state to support curation.
   Missing pieces were tool contracts, conflict persistence, and active-vs-completed retrieval semantics.

2. Task completion needs explicit memory status.
   Just flipping `unresolved` is not enough because completed tasks should stop participating in active recall.

3. Conflict detection should start deterministic, not semantic-black-box.
   Keyword-overlap heuristics are sufficient for first-pass task and preference/fact conflicts and are easy to test.

4. Conflict resolution must survive user clarification.
   That rules out any per-turn-only conflict cache.

5. Retrieval must filter inactive memories.
   Otherwise completed or superseded tasks keep leaking back into active recall.

## Recommended Scope

Phase 1 should ship:

- `save_memory` for stable durable writes
- `update_memory` for corrective edits
- `mark_task_done` for task closure
- `resolve_memory_conflict` for persisted conflict handling
- active-only retrieval semantics for temporal recall

Phase 1 should not try to ship:

- LLM-based conflict adjudication
- background memory merge jobs
- graph or knowledge write tools
- full memory history/version chains

## Decision

Use persisted `memory_conflicts` records with deterministic conflict detection and explicit resolution actions.

That gives chat first-class memory curation without weakening the server-side source of truth.
