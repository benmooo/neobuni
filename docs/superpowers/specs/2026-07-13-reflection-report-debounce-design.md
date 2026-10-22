---
title: "Reflection Daily Report Debounce"
---

# Reflection Daily Report Debounce

> Status: Approved for implementation
> Date: 2026-07-13

## Goal

Keep Codex raw and normalized observations current while coalescing repeated
daily reflection report rebuilds during an active conversation.

## Decision

`reflection_report_marks` becomes the debounce boundary. Ingest still writes
raw observations and rebuilds normalized observations immediately. It updates
one daily mark per profile and local-day window instead of triggering report
generation directly.

Each mark stores:

- `dirty_since_at`: first unbuilt change in the current burst.
- `not_before_at`: earliest time the background queue may build the report.

For active-day ingestion, every new observation moves `not_before_at` to now
plus a 15-minute quiet period, but never later than `dirty_since_at` plus two
hours. The report queue skips marks that are not due. The scheduler continues
its existing lightweight sweep, but does not invoke report generation until a
mark is eligible.

Closed-day corrections, explicit manual rebuilds, and closed weekly/monthly
periods bypass the quiet-period delay. Weekly and monthly reports remain
derived from a completed daily build; a new Codex turn never directly rebuilds
an open weekly or monthly report.

## Data Integrity

Add a unique constraint over `(profile_id, period, window_start)`. Dirty-mark
creation becomes an atomic upsert that preserves `dirty_since_at` and only
updates the current eligibility time and reason. This removes the existing
delete-then-insert race under concurrent ingestion.

## Verification

Tests cover quiet-period deferral, maximum-staleness eligibility, the one-mark
upsert invariant, immediate closed-day eligibility, and preservation of the
existing closed weekly/monthly rule.
