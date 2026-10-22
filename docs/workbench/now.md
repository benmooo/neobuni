---
title: "Current Focus"
---

# Current Focus

Updated At: 2026-06-05 18:30 Asia/Shanghai
Active Feature: buni-report-and-feishu-tools
Status: active

## Why

The reflection pipeline is now usable enough that the next value unlock comes from making it callable in normal Buni chat and routable into external messaging surfaces.

## Last Done

- Replaced the old reflection operator stack with a CRUD report surface: `create_reflection_report`, `get_reflection_report`, `list_reflection_reports`, `update_reflection_report`, and `delete_reflection_report`.
- Kept Feishu delivery composable as `get_reflection_report` or `create/update_reflection_report` -> `render_reflection_report_to_feishu_message` -> `send_feishu_message`.
- Kept `list_feishu_targets` and `list_feishu_delivery_logs`, removed `preview_feishu_message` and `send_reflection_report_to_feishu`.
- Kept canonical day/week/month report generation on the existing reflection pipeline while routing custom dimensions and custom ranges through an ad-hoc transcript-first path.
- Kept Feishu delivery logs on the existing event store instead of introducing a first-pass delivery table.
- Added focused server-side tests for the new report tool suite and Feishu tool suite.
- Moved Feishu transport config and target aliases into profile-scoped DB storage with env fallback for legacy setups.
- Added in-app Feishu settings management plus separate DB tables for integration credentials and target aliases.
- Decoupled target discovery from app credentials so alias listing no longer fails before credentials are configured.
- Upgraded Feishu delivery from plain text-only to generic text/card payloads.

## Next Exact Step

1. Finish removing stale historical docs that still describe the deleted operator surface where that would confuse current implementation search.
2. Verify typecheck/tests against the CRUD reflection tool surface.
3. Checkpoint before switching context with `bun run wb:checkpoint "..." "..."`.

## Reopen These Files

- `docs/workbench/now.md`
- `docs/workbench/features/buni-report-and-feishu-tools.md`
- `docs/platform/feishu-db-backed-config.md`
- `apps/server/src/reflection/report/crud.ts`
- `apps/server/src/tools/render-reflection-report-to-feishu-message.ts`
- `apps/server/src/tools/send-feishu-message.ts`

## Commands

- `bun run wb:start <feature-slug> "<goal>"`
- `bun run wb:start "<goal>"`
- `bun run wb:checkpoint "..." "..."`
- `bun run wb:done "..."`
- `bun run wb:list`
- `bun run wb:open <feature-slug>`
- `bun run wb:recent [limit]`
- `bun run wb:clean`
- `bun run wb:restore <feature-slug>`
- `bun run wb:resume`

## Open Questions

- Whether Feishu delivery logs should record `messageType` and rendered-card metadata more explicitly.
