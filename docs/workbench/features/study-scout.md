---
title: "Study Scout — proactive web material sourcing"
status: implemented (pipeline → Telegram actions → API/UI), awaiting search key
updated: 2026-11-01
---

# Study Scout

## Why

Study material currently comes from two closed sources: the hand-written syllabus
template and the local textbook (682 chunks with chapter/page citations). Buni
never looks at the internet, so a learner gets no past-exam walkthroughs, no
recent case analyses and no posts about the exact concept they just failed.

Study Scout closes that gap: once a day it derives an interest profile from the
plan (recently studied, upcoming, and mastery < 60% topics), searches the web for
matching material, filters and ranks it cheaply, and sends a 2–3 item Telegram
digest whose buttons feed the result back into the app.

Design doc (source of truth): `apps/fumadocs/content/docs/buni/study/study-scout.md`.

## What exists now

- **Search provider** — `apps/server/src/integrations/web/deepseek-search.ts`
  wraps `POST https://api.deepseek.com/v1/tools/search` and `/v1/tools/fetch`
  (1–50 results, 12s/25s timeouts, 401/402/403/404/408/429/5xx error mapping,
  `rerank_score` / `authority` / `date` mapped onto `WebSearchResultItem`).
  `provider.ts` resolves the backend, `dispatch.ts` dispatches search/fetch on the
  resolved `kind` so a Webclaw key is never sent to the DeepSeek endpoint.
  The key lives in its own `web_search` provider slot
  (`GET/PUT /config/provider/web-search`, settings → 模型与记忆 → 联网搜索),
  not in 记忆理解与路由: search and inference are different purposes and different
  bills. A profile that never configured the slot still falls back to a DeepSeek
  reasoning key, then to `NEOBUNI_WEBCLAW_API_KEY`.
- **Planner** — `apps/server/src/study/scout-service.ts`:
  `buildScoutProfile` (recent 14 days · upcoming 3 days · weak mastery < 0.6,
  weak first), `buildScoutQueries` (six deterministic templates per topic with
  `site:`/`lang:`/`after:` operators and day rotation), `filterCandidates`
  (URL normalization, rerank ≥ 1.5 with top-5 relaxation, authority ≥ 2,
  3y/18m recency, permanent URL dedupe, 30-day skip suppression, 7-day `later`
  re-offer, one item per host, ≤ 8 into ranking), `rankCandidates` (exactly one
  LLM call, strict JSON, heuristic fallback).
- **Worker** — `apps/server/src/study/scout-worker.ts` ticks every 15 minutes and
  fires once per goal per local date inside `[studyWindow.start − 30m, start)`.
  It honors quiet hours, the per-goal `scout.enabled` switch, a provider that is
  actually DeepSeek-capable, and the shared `maxPerDay` budget (nudges and scout
  spend from the same pool in both directions).
- **Actions** — `apps/server/src/study/scout-actions.ts`:
  - `save`: Fetch → `saveWebPageToKnowledge({trustLevel:"imported"})`, appends the
    url to the lesson's resources (creating schema-valid enrichment when the
    lesson was never AI-enriched), records `goalId`/`planNodeId`/`lessonTitle`.
  - `quiz`: 3 article-derived specs merged into `enrichment.checkSpecs`
    (contract now `.min(3).max(6)`), replies with a `?tab=checks` deep link.
  - `skip` / `later`: `study.scout_feedback` with the 30-day / 7-day windows.
  - All four are idempotent per `(digestId, index, action)`.
- **Telegram** — digest card plus `sc:save|quiz|skip|later:{index}:{digestId}`
  callbacks, routed next to the existing `st:` nudge callbacks.
- **API** — `POST /study/goals/{goalId}/scout/run` (preview only, returns
  `{available, reason}` or ranked picks) and `GET .../scout/latest`, both in the
  OpenAPI tests.
- **Settings** — `每日精选材料` card: enable switch, per-day count, site
  allowlist, 立刻找一次 preview, and a clear message when no search key exists.
- **State** — event stream only (`study.scout_run/sent/saved/quiz/feedback/error`);
  no new tables or migrations.

## Verification

- 100 test files / 429 tests green; `bun run check-types` green.
- Ultracite clean except the two pre-existing fumadocs warnings.
- Commits: `80def01` (design), `0425616` (provider), `7056035` (planner),
  `41d03e2` (worker), `b3b66eb` (Telegram), `647bb4e` (API + settings),
  `887788c` / `f057c52` / `6bcd8bf` (audit remediation).
- Live `POST .../scout/run` returned ranked picks with reasons and no key leakage
  (before the dispatch fix).
- `apps/server/scripts/study-scout-smoke.ts` runs the same preview path with no
  auth and no server:
  `DATABASE_URL="file:$PWD/.data/local.db" bun run apps/server/scripts/study-scout-smoke.ts`
  Currently prints `available:false` / 「缺少搜索服务密钥」 and exits 1.

## Known gap — why it is not live yet

Search has its own configuration now, but the local profile has not filled it
in: `provider_configs` has no `web_search` row and there is no
`NEOBUNI_WEBCLAW_API_KEY`, so:

- `scout/run` answers `{available: false, reason: …}`,
- the worker stays silent,
- the six `study.scout_error` rows in `.data/local.db` are 404s from the
  pre-dispatch run (2026-10-31 19:35Z) and were not retried afterwards.

The OpenCode Go key cannot call `/v1/tools/*`: those endpoints are billed against
the DeepSeek platform balance, and Go only proxies chat/responses/messages (a
direct `POST /inference/go/openai/v1/embeddings` returns 404 as well).

## Next Exact Step

1. Settings → 模型与记忆 → 联网搜索: paste a real DeepSeek platform key (base URL
   `https://api.deepseek.com`) and enable it, then restart the server.
2. Run `POST /study/goals/{goalId}/scout/run` (or the smoke script) and confirm
   ranked candidates with reasons and absolute https urls.
3. Configure a Telegram channel, wait for the pre-window slot (or trigger a run),
   and click 收藏 / 出题 / 不感兴趣 / 明晚再看 once each. Confirm
   `study.scout_*` events, the lesson 参考资料 entry and the 3 new checks.
4. Decide whether search should get its own provider slot instead of piggybacking
   on `memory_reasoning`.

## Open Questions

- Should OpenRouter/OpenCode keys be accepted through a proxy, or is DeepSeek
  direct the only supported path?
- Is sharing `maxPerDay` with nudges the right long-term budget rule (今天可能只收到
  材料、没有开课提醒)?
- Does the 30-day skip key (host × topic) suppress too broadly for large sites
  such as zhihu.com?
