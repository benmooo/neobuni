# neobuni

neobuni is the Effect-powered port of **buni** — a long-term AI companion with
soul, memory, perception, expression and execution layers.

The product surface was ported 1:1 from buni's mobile-first UI into a web app.
The engine was re-laid on the Better-T-Stack foundation: oRPC, libsql/Turso,
Better Auth and Effect 4.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Bun 1.4 |
| Web | React 19, TanStack Router, TanStack Query, assistant-ui, Tailwind 4 |
| API | Hono + oRPC (RPC + OpenAPI) |
| AI | TanStack AI 1.0 (`@tanstack/ai`, `-openai`, `-anthropic`, `-openrouter`, `-react`) |
| Effects | Effect 4.0.5 |
| Database | libsql / Turso, drizzle-orm, native libsql vector index + FTS5 |
| Auth | Better Auth 1.7 with profiles and `activeProfileId` |
| Env | varlock (`ENV` accessor, `.env.schema` per app) |
| Tooling | Vite+, Biome (Ultracite), Vitest, lefthook |
| Docs | Fumadocs (`apps/fumadocs`) |

## Getting started

```bash
bun install
cp apps/server/.env.example apps/server/.env   # if present; otherwise fill .env.schema
bun run db:migrate
bun run dev
```

- Web: http://localhost:3001
- API: http://localhost:3000

`bun run auth:generate` regenerates `packages/db/src/schema/auth.ts` after auth
plugin or field changes.

## Project structure

```
apps/
  web/         React app (ported buni UI, oRPC client, SSE chat)
  server/      Hono bootstrap, oRPC router + server-only routers, workers
  fumadocs/    Documentation site (ported buni docs)
packages/
  core/        Pure decision kernel (no Effect, no I/O)
  contracts/   Zod contracts shared by server, core and web
  db/          Drizzle schema, libsql client, Effect-returning repos
  api/         oRPC procedures, context and error mapping
  auth/        Better Auth instance, profiles, reset mail
  ui/          shadcn/ui component library
  config/      Shared TypeScript config
docs/          Internal workbench/superpowers notes
```

## Architecture rules

- **Functional core, imperative shell.** `packages/core` is pure and synchronous.
  Side effects live in `packages/db`, `packages/api` and `apps/server`.
- **Zod first.** Contracts are Zod schemas; TypeScript types are inferred.
- **Effect at the boundaries.** Repos, procedures, turn runtime and workers are
  Effect-typed. Promise-only adapters (tool handlers, provider SDK glue, webhook
  clients) use the `runRepo` bridge.
- **Hybrid transport.** oRPC for JSON CRUD/query. Raw Hono for the chat SSE
  stream (`POST /v1/chat/stream`), auth, and external webhooks.

See `MIGRATION.md` for the port decisions, phase status and known deviations.

## Scripts

| Script | Purpose |
|---|---|
| `bun run dev` | All apps |
| `bun run dev:web` / `dev:server` | Single app |
| `bun run build` | Build all apps |
| `bun run check` | Biome/Ultracite lint + workspace typecheck |
| `bun run check-types` | Typecheck all workspaces |
| `bun run test` | Vitest (run `vp test run` directly) |
| `bun run format` | Biome format + safe fixes |
| `bun run db:migrate` / `db:push` / `db:studio` | Database |
| `bun run env:generate` | Regenerate varlock `env.ts` files |
| `bun run docker:up` | Docker Compose stack |

## Intentional differences from buni

- **Reflection** is removed (code deleted, docs archived under
  `apps/fumadocs/content/docs/buni/archive/reflection`). It will be redesigned.
- **Discord gateway sidecar** is dropped. Discord remains webhook-in + API-out.
- **Tauri** is dropped; the UI ships as a mobile-first web app.
- **sqlite-vec** is replaced by libsql native vectors and indexes.
- **TanStack AI 1.0** replaces buni's 0.22, including the AG-UI wire changes.
