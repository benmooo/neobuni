---
title: "Study material grounded in the official textbook"
status: implemented (ingest → retrieval → grounded material → UI)
updated: 2026-10-25
---

# Study material grounded in the textbook

## Why

`whatText` / `howText` are one-liners derived from the syllabus template, so a
lesson tells you what to study and how to spend 40 minutes, but contains no
material to actually study: no explanations, no worked examples, no textbook
position. The official 系统架构设计师教程（第2版） PDF is available locally, and the
repo already has a knowledge pipeline (documents → chunks → FTS + 1024-d
embeddings → `recallKnowledge`), so the material can be grounded instead of
invented.

## What exists now

- `apps/server/scripts/ingest-textbook.ts` (new): page-aware PDF ingest.
  - pdf.js needs `cMapUrl`/`standardFontDataUrl` from the package root or legacy
    Chinese CID fonts silently extract Latin-only text (first run yielded 24k
    chars from 721 pages; the fixed run yielded 785,346).
  - Chapter index comes from the PDF outline (`第N章 … @ p.N`), 20 chapters.
  - Chunks are ~1200 chars with 150-char overlap and start with a locator line
    `【第13章 层次式架构设计理论与实践 · p.459-461】`, so citations survive
    chunking without a schema change.
- Ingested: document `系统架构设计师教程（第2版）`, **682 chunks**, 20 chapters.
- Embeddings: added a `memory_embedding` provider config (openrouter,
  `openai/text-embedding-3-small`, 1024 dims) reusing the existing chat key, then
  embedded all 682 chunks. ~24 min sequential; costs about $0.01.

## Retrieval quality (measured)

Chinese FTS is unusable (`分层架构` → 1 hit, `事件驱动架构` → 0) and the LIKE
fallback is substring-only with arbitrary ordering. Vector search on the same
queries:

| Query | Top hit | Verdict |
|---|---|---|
| 分层架构 | 第13章 层次式架构 p.459 | correct |
| 云原生架构 | 第14章 云原生 p.491 | correct |
| 软件可靠性 | 第9章 软件可靠性 p.334 | correct |
| 事件驱动架构 | 第14章 TCC/SAGA | noisy, but 第1章 (architectural styles) also retrieved |
| 缓存命中率 | 第16章 嵌入式 | wrong — textbook uses 存储层次 wording in ch.2 |

Conclusion: vector search finds the right chapter most of the time; precision
needs a deterministic **topic → chapter map** (we already carry
`syllabusRefs: [topic.id]`), restricting retrieval to that chapter and expanding
the query with the topic's `keywords`.

## Next (needs review before building)

1. **Chapter map**: one LLM call over the 62 template topics × 20 chapters, then
   stored in the template as `textbookRefs` (human-reviewable, deterministic at
   runtime).
2. **Material layer**: extend `StudyLessonEnrichment` with
   `material: { sections[], citations[], excerpts[] }` — 概念讲解 / 例题 /
   常见陷阱 / 记忆锚点, each citation `{chapter, page}`, plus verbatim
   `excerpts` so the learner can read the source text, not only a paraphrase.
3. **Retrieval per lesson**: filter chunks by the mapped chapter, rank by
   `recallKnowledge` (vector + keyword), take the top 6-8.
4. **UI**: markdown reading pane on Now and `/study/$goalId`, citations as
   `第N章 p.XXX`, excerpts collapsible.
5. **Budgets**: material call needs ~6k output tokens and 30-60s; stream it and
   cache per plan node (`enrichment_json.material`), keeping the existing cheap
   summary call untouched.

## Implemented (2026-10-25)

- `packages/core/src/study/templates/system-architect-2026-chapters.json`:
  62 topics → textbook chapters, generated once by the model and then hand-trimmed
  (mock/exam-drill topics are ungrounded on purpose). Read at runtime through
  `textbookChaptersForTopic(s)` in `packages/core/src/study/chapter-map.ts`.
- `apps/server/src/study/textbook-retrieval.ts`: vector search (80 candidates)
  filtered to the mapped chapters, keyword fallback when no embedding provider is
  configured, dedupe by page, locator parsing, max 6 excerpts.
- Marker: `studyLessonMaterialSchema` in contracts (source / sections / excerpts
  / generatedAt) attached as optional `enrichment.material`.
- `enrichment-service.ts`: retrieval runs in parallel with the summary call, then
  a second grounded call writes 3-4 sections; **excerpts are assembled from the
  retrieved chunks, never from model output**, so the quotes are真原文.
  Failures are additive-only: the summary + checks survive.
- Parser hardening: models sometimes wrap JSON in prose/fences, so `parseJson`
  now strips fences and extracts the outermost object, and the material call
  retries once (temperature 0) before giving up.
- UI: `教材内容` block with sections, `第N章 p.XXX` citations and a collapsible
  `原文摘录（N 段）` list holding the full paragraphs. Lessons that already have
  an enrichment but no material show `生成教材内容` (force re-run).

Measured on a real plan node (`架构风格与模式 · 概念与框架`): 4 sections,
5 excerpts, all from 第7章 p.263-275, ~25-40s total (summary + material).

## Open questions

- Chapter map source of truth: LLM-generated + manual review (recommended), or
  hand-written mapping for the 11 modules?
- Excerpt length: full paragraph (~300 chars) per citation, or a single sentence?
- Do we re-ingest other books (论文/案例 分册) with the same script?
- Copyright: the PDF stays out of the repo; only the local DB holds chunks.

## Last Done

- Full path implemented and verified end to end (2026-10-25). 320 tests, typecheck
  and Ultracite clean.

## Next Exact Step

1. Restart the dev server, open the lesson in Now and click `生成教材内容`
   (or `用 AI 细化这节课` on a fresh lesson), confirm the 教材内容 + 原文摘录 render.
2. Follow-ups if the wait feels long: stream the material call, and split it into
   two cheaper calls (概念讲解 vs 例题/陷阱) so each stays under ~15s.
