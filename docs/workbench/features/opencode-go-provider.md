---
title: "OpenCode Go as a reasoning provider"
status: implemented (awaiting live smoke run)
updated: 2026-10-25
---

# OpenCode Go provider

## Why

The Study Journey smoke run (`docs/workbench/now.md` → Next Exact Step #1) needs a
real reasoning provider. We have none configured. OpenCode Go is a $10/month
subscription that exposes a curated, OpenAI-compatible model lineup, so a single
provider vendor unblocks: lesson enrichment (`study.lessons.enrich`), check
grading (`study.checks.submit`), and the chat runtime.

## Research findings (verified 2026-10-25 against opencode.ai)

Sources: <https://opencode.ai/go>, <https://opencode.ai/docs/go/>, <https://opencode.ai/docs/zen/>

- **Plans**: Go `$10/mo`, Go Plus `$40/mo`. Quotas are **monthly dollar caps per
  model** (e.g. `glm-5.3-flash` $60, `gpt-6-luna` $15, `kimi-k3.1-pro` $15),
  enforced as 20% per 5h / 50% per week / 100% per month.
- **Go is a billing plan, not a separate API.** Console (pay-as-you-go) and Go
  share the same API keys and the same endpoints. This is the key modelling fact
  below.
- **Endpoints**: Go has its **own namespace**, `https://opencode.ai/inference/go/...`.
  Console (pay-as-you-go) lives outside `/go`. Verified live: the same key that
  returns `402 Insufficient account funds` on `/inference/openai/v1/...` returns
  `200 {"opencode":{"billing_source":"go"}}` on `/inference/go/openai/v1/...`.
  Go model catalogue: `GET /inference/go/v1/models` (30 models).

- **Original Console endpoints** (all under `https://opencode.ai/inference`):
  - `POST /openai/v1/chat/completions` — OpenAI-compatible chat. This is what
    `createChatCompletion` in `apps/server/src/providers/openai-compatible-client.ts`
    already calls, so study enrichment/grading work unchanged.
  - `POST /openai/v1/responses`, `POST /anthropic/v1/messages`, Google-native
    path. Docs: "every text model also works through the other APIs, which
    Console translates."
  - `GET /v1/models` — public, unauthenticated, 84 model ids (verified `200 OK`).
- **Auth probe** (verified): `POST /openai/v1/chat/completions` without a key →
  `401 {"type":"error","error":{"type":"AuthError","message":"Missing API key."}}`.
  Cheap pre-flight check that never burns quota.
- **Client requirements** (from the Go docs, "Where can I use it?"):
  - Identify yourself with your own `User-Agent` (e.g. `neobuni/1.0`), not a
    generic SDK/HTTP-library name.
  - Send a stable `x-opencode-session` header per conversation, for routing and
    prompt-cache optimisation.
  - Traffic is monitored for abuse that degrades the experience for other users.
- **Free tier caveat**: `*-free` chat models require the OpenCode client; paid
  models **or Go** work from any client. → never ship a `-free` model id as a
  default.
- **Usage telemetry**: each response reports `opencode.allowance` (how much of
  the monthly cap that request consumed).
- **Region/privacy defaults**: allowed regions are Europe + US; DeepSeek models
  need `Global` enabled in workspace privacy. → don't default to DeepSeek.
- **Candidate cheap defaults** (Go, price per 1M in/out, monthly cap):
  `glm-5.3-flash` ($0.15/$0.50, $60) · `gpt-6-luna` ($0.10/$0.50, $15) ·
  `longcat-2.0` ($0.30/$1.20, $60) · `mimo-v2.6-flash` ($0.14/$0.28, $60) ·
  `kimi-k2.7-code` ($0.95/$4.00, $60).

## Fit with the current code

Everything needed already exists; the vendor abstraction is one enum plus three
switch points.

| Piece | File | Change |
|---|---|---|
| Vendor enum + protocol rules | `packages/contracts/src/platform/config/provider.ts` | add vendor, enforce `openai` protocol |
| Persistence | `packages/db/src/schema/provider-configs.ts` | **none** — `provider` is `text` |
| Vendor/protocol/base-url normalisation | `packages/db/src/repos/provider-config.ts` | `normalizeProviderVendor`, `deriveProtocol`, `deriveBaseUrl` |
| Chat adapter (TanStack AI) | `apps/server/src/providers/provider-adapters.ts` | validation rule + adapter branch |
| Raw chat completions (study path) | `apps/server/src/providers/openai-compatible-client.ts` | accept custom headers |
| Settings UI | `apps/web/src/features/settings/provider-sections.tsx` | preset + dropdown in chat & reasoning sections |
| Provider self-check | `apps/server/src/runtime/provider-self-check.ts` | works as-is once the adapter exists |

No migration, no env-var work (providers are DB-configured; `.env.schema` has no
provider keys today).

## Decision: one vendor `opencode`, protocol `openai`

**Rejected: a separate `opencode_go` vendor.** Go and Console share endpoints
and keys; the plan only changes billing. A second enum value would duplicate
every branch for zero behavioural difference. The plan is per-account state, not
per-connection state.

**Rejected: `anthropic` protocol for this vendor for v1.** The
`/anthropic/v1/messages` surface exists, but our anthropic path carries the
DeepSeek hack (`deepseek-anthropic-adapter.ts`); adding a second consumer there
buys nothing when the OpenAI surface is fully supported.

## Change list

### P1 — minimum to unblock the smoke run

1. `contracts/provider.ts`: add `"opencode"` to `providerVendorSchema`; in
   `superRefine`, reject any protocol other than `openai`; keep `baseUrl`
   optional (we default it).
2. `repos/provider-config.ts`: `normalizeProviderVendor` accepts `opencode`;
   `deriveProtocol` → `openai`; `deriveBaseUrl` defaults empty base URL to
   `https://opencode.ai/inference/openai/v1` (same pattern as `openrouter`).
3. `providers/provider-adapters.ts`: "OpenCode vendor must use the OpenAI
   protocol." + branch to `createOpenaiChatCompletions` with `baseURL`.
   Rationale: our study path and Console's documented OpenAI surface are both
   chat completions; this avoids depending on Responses-API translation for
   tools and keeps one wire shape across both paths.
4. `providers/opencode.ts` (new, ~30 lines): `OPENCODE_DEFAULT_BASE_URL`,
   `buildOpenCodeHeaders({ sessionId })` returning `User-Agent: neobuni/<version>`
   + `x-opencode-session`.
5. `openai-compatible-client.ts`: optional `headers` on the config schema,
   merged into `postJson`. Then study enrichment/grading send the same headers
   as the chat runtime.
6. Session id wiring: `build-provider-chat-options.ts` passes `threadId`; study
   flows pass a stable per-goal key (`study:<goalId>`) so prompt caching helps
   and requests are attributable.
7. `provider-sections.tsx`: add `"opencode"` to `ProviderValue` and
   `ReasoningProviderValue`, add a `"OpenCode (Go / Console)"` `SelectItem` to
   the chat and reasoning sections, preset = `openai` protocol,
   model `glm-5.3-flash`, base URL `https://opencode.ai/inference/openai/v1`,
   note explaining Go vs Console and that `-free` ids need the OpenCode client.
8. Tests: contract (enum + protocol rejection), repo `deriveBaseUrl`/normalise,
   adapter selection, client header passthrough. Keep 296 → 296+n green.

Deliberately **not** touching the embedding slot: OpenCode has no `/embeddings`
route, so `memory_embedding` stays on OpenAI/OpenRouter/Qwen.

### P2 — nice to have, not blocking

- **Done in P1:** "拉取模型列表" button → `config.providerModels` →
  `GET /inference/v1/models` (public, no allowance burned).
- Persist `opencode.allowance` from responses into evlog so quota burn is
  visible next to study usage.
- `GET /config/runtime/providerChecks` is already live in `routers/extras.ts`;
  the remaining gap is a "测试连接" button in Settings that calls it.

## What the live smoke run actually found (2026-10-25)

Three defects, all fixed:

1. **Wrong base URL (the 402).** The first default pointed at the Console path,
   so a Go-only account got `402 Insufficient account funds` on every model.
   Fix: `OPENCODE_DEFAULT_BASE_URL` is now the Go path; `OPENCODE_CONSOLE_BASE_URL`
   is exported separately; the preset note explains the `/go` requirement.
   The stale row in the local dev DB was corrected.
2. **The error was invisible.** `enrichStudyLesson` returned `null` for both
   "no provider" and "provider call failed", so every failure surfaced as
   "Configure a reasoning provider…". Fix: it now returns
   `ok | missing_provider | provider_error`, and the router maps
   `provider_error` to `BAD_GATEWAY` with the real message
   (e.g. `Reasoning provider failed: … 402 …`).
3. **Reasoning models ate the budget.** On Go, `reasoning_content` counts
   against `max_tokens`, so verbose prompts were truncated mid-JSON and read as
   a provider failure. Measured on the real plan (same prompt, 4000 tokens):
   `glm-5.3-flash` 11.0s / 1278 reasoning tokens, `deepseek-v4.1-flash` 8.0s /
   535, `mimo-v2.6-flash` 12.5s / 37, `minimax-m3.1-flash` 61.5s / 1962,
   `longcat-2.0` 26.5s / 1813, `qwen3.8-flash` 16.6s / 1369.
   Fix: explicit character limits in the enrichment prompt (all models then
   returned parseable JSON with 3 checks), `maxTokens` 1800 → 3000, and a
   temperature fallback — `kimi-k2.7-code` rejects any `temperature != 1`, so
   the client retries once without `temperature` when a 400 mentions it.

End-to-end against the real plan (`软考 · 系统架构设计师`, 229 nodes):
`enrichStudyLesson` → `ok` in 11.3s with concrete what/how + 3 checks;
`gradeStudyChecks` → `gradedBy=llm`, score 0.85, 4.3s.

Default model is now `deepseek-v4.1-flash` (fastest + cheapest measured), with
`glm-5.3-flash` documented as the steadier fallback.

## Risks

| Risk | Mitigation |
|---|---|
| Go is aimed at coding agents; non-agent abuse is monitored | Low volume (hundreds of requests/month), honest `User-Agent`, one key, no sharding; revisit if we ever fan out |
| Model list churns, promos expire | Model string stays user-editable; default is a paid, non-promo id; P2 model fetch |
| `-free` ids silently fail outside the OpenCode client | Never default to a `-free` id; note in the preset |
| Region/privacy blocks DeepSeek by default | Default `glm-5.3-flash`; document the `Global` region toggle |
| Responses-API translation gaps | Chat Completions only in P1 |

## Smoke-run checklist (after P1 lands)

1. Settings → 记忆理解与路由: provider OpenCode, API key, model `glm-5.3-flash`,
   enabled → save.
2. Now → create 系统架构设计师 goal → generate plan → activate.
3. "用 AI 细化这节课" → concrete what/how + 3 checks; check
   `study_plan_nodes.enrichment_json` and the evlog event.
4. Submit a check → grading via provider (deterministic fallback intact),
   mastery updated.
5. Configure a reminder channel → observe `study.reminder_sent` in `.evlog/logs/`.
6. `bun run test` green, `bunx ultracite check` clean.

Estimate: ~1–2 hours including tests.

## Last Done

- Research + proposal written.
- **P1 implemented (2026-10-25)**, decisions locked by review: vendor id
  `opencode`, default model `glm-5.3-flash`, model discovery pulled forward
  from P2.
  - `packages/contracts/src/platform/config/provider.ts`: `opencode` vendor,
    OpenAI-only rule, `OPENCODE_DEFAULT_BASE_URL`, `providerModelList*` schemas.
  - `packages/db/src/repos/provider-config.ts`: vendor normalisation + default
    base URL (no migration needed).
  - `apps/server/src/providers/opencode.ts`: default base URL, headers
    (`User-Agent: neobuni/1.0`, `x-opencode-session`), catalogue URL + fetch.
  - `provider-adapters.ts`: OpenCode branch → `createOpenaiChatCompletions`
    (Chat Completions, one wire shape with the study client) and a
    `sessionId` option threaded from `threadId` / provider self-check.
  - `openai-compatible-client.ts`: optional `headers` on the config, so study
    enrichment and grading send the same identifying headers.
  - `study/reasoning-config.ts`: stable `study:<profileId>` session id.
  - `routers/extras.ts`: `config.providerModels` procedure.
  - `settings/provider-sections.tsx`: OpenCode vendor in the chat and reasoning
    sections, Go/Console preset + notes, "拉取可用模型" picker.
  - `apps/server/scripts/opencode-smoke.ts`: manual probe over the exact study
    code path.
  - Verified: `bun run test` 314 passed (296 → 314), `bun run check-types` clean,
    `bunx ultracite check` clean; live Go catalogue returns 30 model ids.
- **Live smoke of the AI path (2026-10-25)**: see "What the live smoke run
  actually found" above — three defects found and fixed, enrichment and grading
  both green against the real plan.

## Next Exact Step

1. Restart the dev server so the new server code (Go base URL + error mapping)
   is live, then click "用 AI 细化这节课" again in Now.
2. Finish the smoke-run checklist: complete a check, configure a reminder
   channel, watch `.evlog/logs/` for `study.reminder_sent`.

## Open questions

1. ~~Vendor id~~ → `opencode` (decided).
2. ~~Default model~~ → `glm-5.3-flash`, with `deepseek-v4.1-flash` offered in the
   preset note (decided).
3. ~~Model discovery~~ → included in P1 (decided).
