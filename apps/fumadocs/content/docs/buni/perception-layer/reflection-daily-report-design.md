---
title: "Reflection Daily Report Design"
---

# Reflection Daily Report Design

> Status: Active design
> Date: 2026-05-23
> Companion docs:
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-source-codex-contracts-and-normalization.md](./reflection-source-codex-contracts-and-normalization.md)

## 1. Purpose

This document defines the detailed design of the `daily` reflection report.

It answers four questions:

1. what input should the daily report builder consume
2. how should Codex transcript content be purified for reporting
3. what should the daily report output look like
4. what should be stored in the database

---

## 2. Core Decision

The daily report should be **transcript-first**, not event-summary-first.

That means:

- the main input is the full set of same-day Codex transcripts after light purification
- the builder should preserve the user's intent, preferences, design decisions, and assistant responses
- the builder should not collapse the day into tiny evidence bundles before synthesis
- the builder should not depend on `reflection_links`

The target build shape is:

```text
same-day observations
  -> collect Codex turns
  -> project purified report transcript
  -> one daily reflection synthesis
  -> persist structured report + markdown
```

---

## 3. Report Intent

A high-quality daily report should cover four layers:

1. facts
   what happened today
2. cognition
   why those things happened, including stable preferences, working style, and decision posture
3. system
   where workflow, tooling, or process friction showed up
4. evolution
   what should continue, change, or stop tomorrow

This is not a generic activity summary.

It is a reflection artifact grounded in the day's working conversation.

---

## 4. Input Boundary

## 4.1 Build unit

The `daily` build unit should be:

- `profileId`
- `localDate`
- `timezone`

Example:

- `profileId = ...`
- `localDate = "2026-05-23"`
- `timezone = "Asia/Shanghai"`

## 4.2 Source priority

Codex is the primary report source.

Git and future sources may contribute supporting context, but the report should primarily be driven by Codex transcript material because that is where we see:

- user goals
- design preferences
- key decisions
- problem reframing
- explanation and critique

## 4.3 Observation input rule

The daily report builder should read:

- normalized observations only
- never raw source payloads during standard report generation

For Codex, that means report generation depends on normalized `codex_turn` rows that already contain the purified transcript projection needed for synthesis.

---

## 5. Codex Transcript Purification

## 5.1 Goal

Purification should remove operational noise while preserving the actual working conversation.

This is **not** summarization.

It is a deterministic projection from one rich Codex turn into one report-facing transcript.

## 5.2 Retain

The purified transcript should retain:

- user messages
- substantial assistant messages
- turn order
- turn timestamps
- lightweight turn metadata such as `cwd`, `modelProvider`, and failure counters

These retained messages are valuable because they contain:

- explicit user intent
- preference signals
- architectural decisions
- tradeoffs
- corrections and reframes

## 5.3 Remove

The purified transcript should remove:

- tool call argument/result detail
- command stdout and stderr detail
- internal thinking or reasoning traces
- low-value execution chatter
- mechanical progress pings that carry no design or decision content

## 5.4 Assistant message rule

For assistant output:

- keep final or substantial responses
- drop trivial operational messages such as "looking into it" when they carry no real content
- keep any response that contains explanation, recommendation, tradeoff, diagnosis, or decision

## 5.5 Result shape

Suggested purified transcript item:

```ts
type CodexReportTranscriptItem = {
  role: "user" | "assistant";
  text: string;
};
```

One normalized `codex_turn` should carry:

```ts
type CodexTurnReportContent = {
  sessionId: string;
  threadId: string;
  turnId: string;
  turnStatus: "completed" | "interrupted" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  cwd: string | null;
  modelProvider: string | null;
  model: string | null;
  threadTitle: string | null;
  reportTranscript: CodexReportTranscriptItem[];
  metrics: {
    changedFileCount: number;
    failedCommandCount: number;
    failedToolCallCount: number;
    deniedApprovalCount: number;
  };
  tags: string[];
};
```

Raw still keeps the complete replayable source payload.

Normalized content keeps the report-facing purified transcript.

---

## 6. Daily Report Input Contract

Suggested report input shape:

```ts
type DailyReflectionInput = {
  profileId: string;
  localDate: string;
  timezone: string;
  codex: {
    turns: Array<{
      observationId: string;
      sessionId: string;
      threadId: string;
      turnId: string;
      startedAt: string | null;
      completedAt: string | null;
      cwd: string | null;
      modelProvider: string | null;
      model: string | null;
      reportTranscript: Array<{
        role: "user" | "assistant";
        text: string;
      }>;
      metrics: {
        changedFileCount: number;
        failedCommandCount: number;
        failedToolCallCount: number;
        deniedApprovalCount: number;
      };
      tags: string[];
    }>;
  };
  git?: {
    commits: Array<{
      observationId: string;
      repo: string | null;
      branch: string | null;
      sha: string;
      subject: string;
      body: string | null;
      changedFileCount: number;
    }>;
  };
};
```

Important rule:

- Codex input should stay close to the original conversation
- Git input may remain lighter and contextual

---

## 7. Build Flow

Recommended daily build sequence:

1. select all normalized observations overlapping the target local day
2. collect Codex turns in time order
3. project each turn into the report-facing purified transcript shape
4. optionally append lighter Git context for the same day
5. build one `DailyReflectionInput`
6. run one LLM synthesis
7. validate the structured output
8. persist structured report plus markdown body

V1 should prefer one synthesis pass, not a multi-stage map-reduce pipeline.

---

## 8. Prompt Boundary

The daily report prompt should instruct the model to produce a grounded reflection, not generic journaling.

Prompt rules should include:

- only use information that appears in the provided input
- distinguish clearly between fact and interpretation
- avoid hidden-state psychologizing
- infer cognition only from repeated wording, decisions, corrections, and design posture visible in the transcript
- surface system issues only when grounded in repeated friction, failures, or unnecessary loops
- produce concrete evolution guidance for tomorrow
- do not mention omitted tool-call or reasoning-trace data

---

## 9. Output Shape

## 9.1 Primary output

The primary output should be markdown.

Suggested markdown shape:

```md
# Daily Reflection - YYYY-MM-DD

## 今日总结

## 事实

## 认知

## 系统

## 演化

## 关键主题
```

The markdown body is the main human-facing artifact.

## 9.2 Structured output

The database schema should still be structured.

Suggested stored shape:

```ts
type DailyReflectionReport = {
  id: string;
  profileId: string;
  localDate: string;
  timezone: string;
  status: "ready" | "failed";
  markdown: string;
  summary: string;
  facts: string[];
  cognition: string[];
  system: string[];
  evolution: string[];
  themes: string[];
  sourceObservationIds: string[];
  meta: {
    codexTurnCount: number;
    gitCommitCount: number;
    generatedAt: string;
    model: string;
  };
};
```

Interpretation:

- `markdown` is the primary deliverable
- structured arrays support indexing and later rollups
- `sourceObservationIds` is enough provenance for V1

---

## 10. Lineage And Storage

The target design should **not** depend on `reflection_links`.

For the simplified report system, storing these fields directly on the report is enough:

- `sourceObservationIds`
- for weekly and monthly, later `sourceDailyReportIds`

That is sufficient for:

- rebuild targeting
- basic provenance
- lightweight audit

It avoids:

- high-fanout evidence rows
- complicated lineage maintenance
- unnecessary storage churn

---

## 11. Scheduling And Rebuild

Recommended schedule:

- build yesterday's report shortly after local midnight

Late-arrival rule:

- if new observations later land in an already-built day, mark that day dirty
- allow automatic rebuild inside a bounded recent horizon
- use manual rebuild outside that horizon

V1 can start with a simple recent rebuild window such as:

- previous 1 to 2 local days

---

## 12. Relationship To Weekly And Monthly

Daily is the only report that should read purified Codex transcripts directly.

Weekly and monthly should instead read:

- structured daily report fields
- daily markdown bodies when helpful

They should not rescan the original Codex transcripts unless a manual deep rebuild is explicitly requested later.

---

## 13. Acceptance Criteria

This design is ready to implement when:

1. normalized `codex_turn` rows expose a purified report transcript
2. the daily report builder can assemble one `DailyReflectionInput` per local day
3. the daily report generator outputs both structured fields and markdown
4. the report covers facts, cognition, system, and evolution
5. the report stores `sourceObservationIds` directly and does not require `reflection_links`
