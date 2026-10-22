---
title: "Buni News Tools V1"
---

# Buni News Tools V1

> Status: implemented for P0 and P1
> Date: 2026-05-30
> Companion docs:
>
> - [./schedule-runtime-dataflow-v1.md](./schedule-runtime-dataflow-v1.md)

## Purpose

This document defines the first news feature slice for Buni chat tools.

The initial source provider is `NewsNow`.

The design goals are:

- keep the feature inside the existing execution-tool runtime
- keep reads synchronous and short-lived
- keep source routing explicit and truthful
- support recurring news delivery without inventing a new async job system

## Tool Surface

### P0 read tools

- `list_news_sources`
  - lists Buni's full curated NewsNow source catalog
  - intentionally takes no meaningful filters so browse-all requests cannot be accidentally narrowed
- `search_news_sources`
  - searches or filters curated NewsNow sources for a narrowed browse list
  - supports `query`, `category`, `enabledOnly`, `limit`
- `resolve_news_source`
  - resolves one user-provided site name, label, or alias to a canonical `sourceId`
  - use this before `get_news_headlines` when the user says "少数派", "Hacker News", or another natural-language site name
- `get_news_headlines`
  - fetches headlines from one concrete canonical `sourceId`
  - use directly only when the caller already has the canonical id such as `sspai`
  - returns structured items with source provenance

### P1 curated brief tools

- `list_news_briefs`
  - lists the curated multi-source briefs
- `get_news_brief`
  - fetches one curated brief and aggregates headlines across its sources
  - surfaces partial source failures in `notes` and per-source status
- `schedule_news_brief`
  - creates a recurring cron-backed monitor that fetches fresh headlines at delivery time
  - accepts `cronExpr` directly and optional `timezone`

## Curated Briefs

Current brief ids:

- `ai`
  - AI-adjacent product, developer, and startup signals
- `tech`
  - broader technology mix across English and Chinese tech feeds, now including ITHome and SSPAI
- `china`
  - Chinese internet and community trends, now including Bilibili hot search and SSPAI

These are intentionally curated routes, not a claim that NewsNow exposes perfect domain-specific AI feeds.

Current source coverage now includes a wider Chinese mix such as:

- `bilibili-hot-search`
- `sspai`
- `ithome`

The intended composition is:

- browse all feeds -> `list_news_sources`
- browse a filtered subset -> `search_news_sources`
- resolve one named site -> `resolve_news_source`
- fetch one concrete feed -> `get_news_headlines`

## Delivery Model

`schedule_news_brief` writes a `monitor` schedule with:

- `triggerAt`
  - the next run in UTC
- `cronExpr`
  - the exact recurring cron expression supplied by the caller
- `metadata.kind = "news_brief_monitor"`
  - delivery config and brief config live in metadata

At delivery time:

1. the due runner resolves the configured brief
2. Buni renders the current headlines into text
3. Buni delivers to chat and optionally Feishu
4. after a full successful delivery, the schedule is re-armed to the next cron trigger

This keeps recurring monitors inside the existing due-runner flow.

## Environment

- `BUNI_NEWSNOW_BASE_URL`
  - NewsNow base URL
  - default: `https://newsnow.busiyi.world`
- `BUNI_NEWS_TIMEOUT_MS`
  - outbound request timeout for one source fetch
  - default: `10000`

## Non-goals

V1 intentionally does not do:

- full article fetch or content extraction
- embeddings or knowledge-ingest of news
- long-running async job orchestration for news tools
- custom UI pages for news management
- natural-language recurrence parsing inside `schedule_news_brief`
