# neobuni Migration Plan (from buni)

> Status: approved direction, execution not started
> Source: `/Users/aka/source/repos/lab/tmp/buni`
> Target: `/Users/aka/source/repos/lab/tmp/neobuni`

## 1. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Frontend | Web only. Port buni's mobile-first UI into `apps/web`. No Tauri. |
| 2 | API | Hybrid. oRPC for JSON CRUD/queries, raw Hono for SSE chat and inbound webhooks. |
| 3 | Database | Single libsql/Turso DB. Native libsql vectors replace `sqlite-vec`. FTS5 kept. |
| 4 | FP style | Effect v4 in `packages/db`, `packages/api`, `apps/server`. `packages/core` stays pure sync, no Effect imports. |
| 5 | Schemas | Zod 4 for contracts. Effect Schema only for internal runtime errors/config if needed. |
| 6 | Scope | Everything except reflection. Keep messaging, news, web tools, decision-os/goals. Drop the Discord gateway sidecar and dev scripts. |
| 7 | Reflection | Delete all code (core, contracts, db, routes, tools, UI, scripts). Archive its docs. |
| 8 | Observability | Keep `runtime_turns` / `runtime_spans` as product traces. Add evlog for request-level wide events. |
| 9 | Data | No data migration. Fresh DB, `db:push`. |
| 10 | Tests | `vp test` (Vitest 5) + `@effect/vitest`. Convert buni's 120 `bun:test` files. |

## 2. Target layout

```
apps/
  web/         ← buni apps/mobile/src, mobile-first web app
  server/      ← Hono bootstrap + oRPC handler + raw SSE/webhook routes + Effect workers
  fumadocs/    ← buni docs/ (reflection docs archived)
packages/
  core/        ← buni packages/core minus reflection; pure sync FP
  contracts/   ← buni packages/contracts minus reflection; Zod 4
  db/          ← drizzle + effect-libsql + libsql vectors + FTS5, all repos return Effect
  api/         ← oRPC routers, effectProcedure bridge, request context
  auth/        ← better-auth 1.7.7 + profiles/activeProfileId + reset mail
  ui/          ← merged shadcn set (buni's 55 + neobuni's 17)
  config/      ← unchanged
```

Rename `@buni/*` → `@neobuni/*`, `BUNI_*` → `NEOBUNI_*`, `buni.sqlite` → `neobuni.db`.

## 3. Effect v4 conventions

Verified against the installed `drizzle-orm@1.0.0-rc.4` and `@effect/sql-libsql@4.0.5`.

### 3.1 DB as a Layer

```ts
// packages/db/src/client.ts
import { LibsqlClient } from "@effect/sql-libsql/LibsqlClient";
import * as LibsqlDrizzle from "drizzle-orm/effect-libsql";
import * as Layer from "effect/Layer";
import { relations } from "./relations";
import * as schema from "./schema";

export const makeDatabase = LibsqlDrizzle.makeWithDefaults({ schema, relations });

export const DatabaseLive = Layer.unwrapEffect(makeDatabase).pipe(
  Layer.provide(LibsqlClient.layer({ url: ENV.DATABASE_URL })),
);

export class Db extends Context.Service<Db, EffectLibsqlDatabase>() {}
```

Queries are Effects and are `yield*`-ed, not awaited:

```ts
const rows = yield* db.select().from(memories).where(eq(memories.profileId, id));
```

`SqlError` is part of the error channel; repos narrow it to domain errors.

### 3.2 Service tags

`Db`, `Auth`, `ProviderRegistry`, `ToolRegistry`, `RuntimeObserver`, `AppConfig`.
One tag per capability, provided by Layers in `apps/server/src/layers.ts`.
`packages/core` must never import `effect`.

### 3.3 Request boundary

- One `ManagedRuntime` built from the app Layer in `apps/server/src/runtime.ts`.
- oRPC handlers return `Effect`; a middleware runs it and maps tagged errors to `ORPCError`:

```ts
export const effectProcedure = protectedProcedure.use(async ({ next }) => next());

const handler = effectProcedure.handler(({ context, input }) =>
  Effect.gen(function* () {
    const db = yield* Db;
    return yield* listConversations(context.profileId);
  }),
);
```

- Abort: `c.req.raw.signal` → fiber interrupt (wrap in `Effect.onInterrupt` for cleanup).
- No `Effect.runPromise` inside business code; only at the edges (oRPC adapter, SSE adapter, HTTP fetch).

### 3.4 Streaming chat

`Effect.Stream<StreamChunk>` → `Stream.toAsyncIterable` → `toServerSentEventsResponse`.
Provider calls are `Stream` resources with `Stream.timeoutFail` for the existing idle timeout.

### 3.5 Workers

Replace `setInterval` + croner loops:

- `Effect.forkScoped(worker.pipe(Effect.repeat(Schedule.spaced(...))))`
- Config via `NEOBUNI_*_TICK_MS` lifted into an `AppConfig` Layer.
- Graceful shutdown: SIGTERM → `runtime.dispose()` (interrupts fibers, closes libsql).

Workers to port: schedule materializer, task-run worker, action-run worker, initiative worker.

### 3.6 Observability

- Effect spans on every turn stage; a `RuntimeObserver` layer writes `runtime_turns` / `runtime_spans`.
- evlog stays on the Hono edge: one wide event per HTTP request, route + user + turn id.
- No OpenTelemetry exporter yet; the tracer boundary stays swappable.

### 3.7 Tests

- Pure core: plain Vitest, no Effect.
- Effect code: `@effect/vitest` (`it.effect`) + `TestClock` for workers/schedulers.
- DB tests: temp libsql file per suite, migrate via drizzle-kit, close in `afterAll`.

## 4. Database plan

- One `DATABASE_URL` (`file:./.data/neobuni.db` locally, Turso in prod).
- Vector columns via `customType`:

```ts
const vector = (name: string, dimensions: number) =>
  customType<{ data: Float32Array; driverData: Uint8Array }>({
    dataType: () => `F32_BLOB(${dimensions})`,
    toDriver: (value) => new Uint8Array(value.buffer.slice(0)),
    fromDriver: (value) => new Float32Array(value),
  })(name);
```

- Index: `CREATE INDEX memories_vec_idx ON memories (libsql_vector_idx(embedding))`.
- Search: `vector_top_k('memories_vec_idx', vector32(?), k)` joined on `rowid`; cosine via `vector_distance_cos`.
  Verified working locally: FTS5, vector index, `vector_top_k`, `vector32(?)` blob binding.
- Keep FTS5 `fts_knowledge_chunks` (runtime-only, created by `ensureSchema()`).
- Drop tables: `reflection_raw_observations`, `reflection_observations`, `reflection_reports`, `reflection_report_marks`, `reflection_report_scheduler_states`, `reflection_source_configs`, `reflection_source_sync_states`, `reflection_job_runs`.
- Keep everything else, including `goals`, `decisions`, `action_proposals`, `action_runs`, `commitments`, `messaging_*`, `external_*`, `runtime_*`.
- Sync→async: typecheck catches every missed `await`; repos move to `yield*` in one pass per repo.
- No migrations preserved. `db:generate` from the new schema, wipe local DB.

## 5. API surface

Raw Hono routes (outside oRPC):

| Route | Why |
|---|---|
| `/api/auth/*` | better-auth handler |
| `POST /v1/chat/stream` | `@tanstack/ai` SSE protocol |
| `/v1/integrations/discord` | webhook + signature verification |
| `/v1/integrations/telegram` | webhook + secret token |
| `/internal/*` | internal token routes (if any survive the sidecar removal) |
| `/` | health |

Everything else becomes oRPC procedures under `/rpc`:

`conversations`, `messages`, `memories`, `knowledge`, `goals`, `decisions`, `schedules`, `task-runs`, `runtime` (turns/spans/activity), `events`, `config` (providers/agent/soul), `profile`, `integrations` (config CRUD only), `news`.

OpenAPI handler stays mounted for the public surface. oRPC zod converter keeps Zod contracts as the single source.

Frontend: delete `hc` client; use `@orpc/tanstack-query` for CRUD, `fetchServerSentEvents` for chat, plain `fetch` for webhooks.

## 6. Dropped / archived

| Item | Action |
|---|---|
| `packages/core/src/reflection/**` | delete |
| `packages/contracts/src/reflection/**` | delete |
| reflection db schema + repos + job tables | delete |
| `apps/server/src/routes/reflection.ts` | delete |
| `apps/server/src/reflection/**` | delete |
| reflection tools (`create/get/list/update/delete/render_*`) + tool-set entries | delete |
| `apps/mobile/src/routes/_app/reflection/**`, `use-codex-reflection`, `use-git-reflection` | delete |
| `scripts/reflection-*`, `startCodexBridgeAgent` bootstrap | delete |
| Discord gateway sidecar (`apps/server/src/sidecars/**`, runtime gateway routes, internal client) | delete |
| `scripts/workbench.ts`, `scripts/verify-memory.ts` | delete |
| `docs/**` | port to fumadocs, reflection docs under `docs/archive/reflection/` |

Discord stays as webhook-in + API-out through the messaging integration layer.
Reflection's `reflection.*` tools are removed from every tool set, including headless/external turns.

## 7. Execution phases

### Phase 0 — Skeleton

- `packages/core`, `packages/contracts` created from buni, reflection stripped, renamed.
- `packages/db` schema imported, reflection tables removed, `db:push` on a fresh DB.
- varlock schemas extended with all `NEOBUNI_*` vars (worker ticks, integration creds, webclaw, newsnow, provider defaults).
- Add deps: `effect`, `@effect/sql-libsql`, `@effect/vitest`, `@tanstack/ai*`, `assistant-ui`, `streamdown`, `phosphor`, `croner`, `chrono-node`, `discord.js`, `resend`.
- Gate: `vp check`, `vp test` (empty suites ok), `bun run db:push` against a temp DB.

### Phase 1 — Auth + profile

- better-auth 1.7.7, `profiles` table, `session.activeProfileId` additional field, lifecycle hook, Resend reset mail.
- `requireProfile` service in Effect; oRPC `protectedProcedure` context carries `profileId`.
- Gate: sign-up → profile bootstrap → protected procedure returns profile-scoped data.

### Phase 2 — Core kernel + contracts

- Port `packages/core` (signals, cognition, soul, prompt, expression, decision) untouched except imports.
- Port contracts; fix Zod 4.5 strictness and `z.infer` usage.
- Gate: all ported core unit tests green under Vitest.

### Phase 3 — DB repos on Effect

- Repos in dependency order: profiles/agent/soul → conversations/messages → events → memories/graph/knowledge (+ vectors) → providers/config → schedules/task-runs/action-runs → goals/decisions → messaging.
- Vector + FTS adapters rewritten for libsql.
- Gate: repo integration tests green; memory recall returns ranked results on seeded data.

### Phase 4 — Chat vertical slice

- `create-chat-turn-stream` rewritten as an Effect pipeline: context load → kernel → prompt → provider stream → tools → persistence → observer.
- Providers: `@tanstack/ai` adapters + deepseek/anthropic wrapper + mock adapter.
- Raw `/v1/chat/stream` route, abort handling, idle timeout.
- Gate: streaming chat persists a turn, spans are recorded, tool call round-trips.

### Phase 5 — API + frontend

- oRPC routers for every JSON surface; remove `hc`.
- Port buni UI route by route; replace `@buni/ui` with `@neobuni/ui`; assistant-ui runtime provider unchanged.
- Gate: every ported screen works against the new API; no `@buni/*` imports remain.

### Phase 6 — Execution

- Tools (schedules, reminders, messaging, news, web, memory, knowledge, task runs) + tool sets + surface policy.
- Workers as Effect fibers; schedule materializer + task-run worker + action-run worker + initiative worker.
- Gate: scheduled task fires, reminder delivers, worker restart recovers leases.

### Phase 7 — Decision-OS + goals

- Goals, decisions, action proposals/runs, initiative worker, evaluation replay, shadow services.
- Gate: evaluation fixtures replay with expected outcomes.

### Phase 8 — Docs + hardening

- Docs into fumadocs, reflection archived.
- evlog drains, docker compose (web + server), health checks, SIGTERM.
- Final: `vp check`, `vp test`, typecheck all packages, docker build.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Effect v4 API drift vs examples online (most docs are v3) | Pin 4.0.5; check `.d.ts` in `node_modules` as source of truth; keep a small internal cookbook. |
| Sync→async DB rewrite misses an await | Typecheck is authoritative; no `as any` allowed in `packages/db`. |
| Drizzle effect-driver bugs (`effect-*` is marked unstable) | Keep raw `@libsql/client` escape hatch for vector/FTS SQL; isolate in `packages/db/src/vector`. |
| oRPC ↔ Effect impedance (streaming, error mapping) | Single `effectProcedure` helper; raw routes for SSE; map tagged errors centrally. |
| 94k LOC reformat noise from Biome | Port per package, run `vp check --fix` once per package as the last step of each phase. |
| assistant-ui version skew (`@tanstack/ai` 0.22 vs assistant-ui 0.14) | Pin buni's tested versions first, upgrade later. |
| Effect fibers leak on hot reload | `ManagedRuntime` per process, `dispose` on SIGTERM and dev reload. |

## 9. Conventions

- Core: pure functions, immutable data, Zod at the boundary, no `effect`, no I/O.
- Shell: `Effect.gen` for orchestration, one tag per capability, no `try/catch` around Effect code.
- Errors: `Data.TaggedError` per domain; translate to `ORPCError` only at the edge.
- Naming: `*.service.ts` for Effect services, `*.layer.ts` for Layers, `*.repo.ts` for db access.
- Tool handlers stay `(input, context) => Promise<Result>` so they can be registered with `@tanstack/ai`; the Effect wrapper lives in the tool registry, keeping tool definitions portable.
- Tests colocated as `*.test.ts`; no snapshots for domain logic.
