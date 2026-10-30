---
title: "Feature: openapi-rest-rollout"
---

# Feature: openapi-rest-rollout

Updated At: 2026-10-30 15:52 Asia/Shanghai
Status: done

## Goal

Publish the whole oRPC router as a usable REST contract: every procedure carries
an explicit HTTP method, path, summary, description, and tag, so
`GET /api-reference/spec.json` reads like a designed API instead of
`POST /goals/list`.

## Non-Goal

- No change to the RPC transport (`/rpc/*`) or to any RPC client call site.
- No change to where the OpenAPI handler is mounted.
- No generated client, no SDK, no docs-site integration.
- No contract reshaping: `.and()` intersections stay as they are.

## Why Now

`docs/workbench/now.md` tracked this as the remaining item after the study
routes were described in `4d60951`. Measured before the rollout: 77 of 92
published operations had no `.route(...)`, so their paths were derived from the
procedure namespace (`/config/provider/memoryEmbedding/get`,
`/goals/actionProposals/createRun`, ...). Only `apps/server/src/routers/study.ts`
(15 procedures) was done.

## Context

- `packages/api/src/routers/*.ts` — 67 procedures, the pure DB/contract layer.
- `apps/server/src/routers/extras.ts` — spreads those routers and overrides or
  adds 25 server-only procedures (schedule planning, memory pipelines, knowledge
  ingest, messaging config, provider self-checks, Now snapshot, Telegram drafts,
  action runs).
- `apps/server/src/router.ts` merges `appRouter`, `extrasRouter`, `studyRouter`.
- `apps/server/src/app.ts` mounts `OpenAPIHandler(router)` with
  `prefix: "/api-reference"`, so the spec is `/api-reference/spec.json` and
  every operation is served under `/api-reference/<path>`.

## Decisions

- Decision: paths do not carry a version prefix (`/goals`, not `/v1/goals`).
  Reason: the version belongs to the mount (`/api-reference` today), and the
  study routes already shipped that way.
- Decision: tag = the primary resource, not the URL prefix
  (`GET /goals/{goalId}/decisions/{decisionId}` is `Decisions`,
  `POST /action-proposals/{proposalId}/runs` is `Action Runs`).
  Reason: the reference UI is read by resource, and the run lifecycle is only
  discoverable next to `GET /action-runs/{actionRunId}`.
- Decision: verbs are allowed for commands that are not CRUD
  (`/cancel`, `/confirm-receipt`, `/authorize`, `/reindex`, `/digest`,
  `/search`, `/next-action-evaluations`).
  Reason: study already publishes `/plan/generate`, `/plan/activate`,
  `/sessions/{sessionId}/complete`; inventing noun sub-resources would make the
  two namespaces disagree.
- Decision: reads use `GET` with query parameters, writes use `PUT` for full
  replacement of the single config row and `PATCH` for field patches.
  Reason: `config.*` are upserts of one row per slot, `goals.update` and
  `schedules.update` are partial patches.
- Decision: `goals.now` publishes as `GET /now`, not `GET /goals/now`.
  Reason: `GET /goals/{goalId}` would be ambiguous with a literal `now`
  segment for both readers and route matchers.
- Decision: `memories.search` stays `POST /memories/search`.
  Reason: the recall query carries `query`, `keywords`, and `limit` in a body
  that the embedding provider consumes; a GET would need the same payload in
  the query string.
- Decision: every path parameter must already exist in the procedure's input
  schema.
  Reason: oRPC only emits `in: path` parameters for keys it finds there;
  `goals.decisions.feedback` therefore moved to `/decisions/{decisionId}/feedback`
  because its input has no `goalId`.
- Decision: pin the whole surface in one table instead of trusting review.
  Reason: `api.openapi.test.ts` fails when a procedure has no `.route(...)`,
  when a tag is invented, or when a documented route is not actually routable.

## Progress

- [x] Inventory the 92 published operations with the generator.
- [x] Describe every procedure in `packages/api/src/routers/*`.
- [x] Describe `apps/server/src/routers/extras.ts` overrides/additions.
- [x] Add `apps/server/src/routes/api.openapi.test.ts` with the route table,
      documentation, operation-id, path-parameter, and routability assertions.
- [x] `bun run test`, `bun run check-types`, `bunx ultracite check`.

## Last Done

- 77 procedures gained `.route(...)` metadata; 0 of 92 operations are on the
  default `POST /<namespace>/<name>` shape.
- Tag set is fixed at 17 values: Action Proposals, Action Runs, Config,
  Conversations, Decisions, Goals, Health, Knowledge, Memories, Messages, Now,
  Profile, Runtime, Schedules, Study, Task Runs, Telegram.
- New test asserts the exact `METHOD /path → tag` table, that every operation
  has an id, summary, description, and one allowed tag, that every `{param}` in
  a path is a required `in: path` parameter, and that all 92 documented routes
  match through `OpenAPIHandler`.
- 93 test files / 338 tests pass; typecheck and Ultracite pass.

## Next Exact Step

1. Start the server (`bun run dev:server`). Nothing is serving neobuni right
   now: `:3000` is held by `codeup/oneport-pulse`, so free the port or change
   `PORT` first.
2. Open `http://localhost:<port>/api-reference` and check the Scalar reference
   for read quality (tag grouping, descriptions, example bodies).
3. Decide whether the OpenAPI mount deserves a real API prefix
   (`/api-reference` currently doubles as the procedure prefix, so operations
   are served at `/api-reference/goals`).

## Reopen These Files

- `apps/server/src/routes/api.openapi.test.ts`
- `apps/server/src/routes/study.openapi.test.ts`
- `packages/api/src/routers/`
- `apps/server/src/routers/extras.ts`
- `apps/server/src/app.ts`

## Commands

- `bun run test`
- `bun run check-types`
- `bunx ultracite check`
- `curl -s localhost:3000/api-reference/spec.json | python3 -m json.tool`

## Open Questions

- Should operations live at the API root (`/goals`) while the spec stays at
  `/api-reference/spec.json`? Today the same prefix is used for both.
- Do we want `GET /memories/search` for cacheable queries once the recall
  payload is stable?

## Risks

- Nothing serves this API locally today, so the first live look at the reference
  UI is still pending. The route table is verified through `OpenAPIHandler` in
  tests, not through a running server.
- `.and()` inputs publish as `allOf` request bodies (`goals.update`,
  `goals.commitments.*`, `goals.decisions.feedback`, `goals.actionProposals.*`).
  Valid OpenAPI and the path parameter is stripped correctly, but generated
  clients see an intersection instead of a flat object. Switching those to
  `.merge()` is a follow-up, not a regression.
- `PUT /config/provider` and `GET /config/provider` return the provider API key.
  The published spec now advertises them plainly; auth is still the only guard.
- The route table is hand-maintained. A rename that forgets the table fails
  loudly, which is the point, but it also means every new procedure needs two
  edits (router + table).
