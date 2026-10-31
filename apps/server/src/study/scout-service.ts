import type { StudyPlanNode, StudySession } from "@neobuni/contracts";
import { addLocalDays, diffLocalDays } from "@neobuni/core";

import type { WebSearchResultItem } from "../integrations/web/types";
import {
  createChatCompletion,
  type OpenAICompatibleConfig,
  type OpenAICompatibleMessage,
} from "../providers/openai-compatible-client";

const RECENT_SESSION_DAYS = 14;
const UPCOMING_SESSION_DAYS = 3;
const PROFILE_TOPIC_LIMIT = 6;
const TOPIC_KEYWORD_LIMIT = 4;
const MIN_RERANK_SCORE = 1.5;
const LOW_AUTHORITY_MIN_RERANK = 2.2;
const MIN_AUTHORITY = 2;
const RELAXED_CANDIDATE_TOP = 5;
const RELAXED_MIN_RERANK_SCORE = 1;
const ARTICLE_MAX_AGE_DAYS = 548;
const NEWS_MAX_AGE_DAYS = 365;
const OUTLINE_MAX_AGE_DAYS = 1095;
const EXAM_MAX_AGE_DAYS = 1095;
const RANKING_CANDIDATE_LIMIT = 8;
const MAX_PICKS = 3;
const MIN_CONFIDENCE = 0.5;
const SKIP_SUPPRESSION_DAYS = 30;
const LATER_REOFFER_DAYS = 7;
const QUERY_LIMIT = 8;
const RANKING_MAX_TOKENS = 700;
const RANKING_TEMPERATURE = 0.2;

const DEFAULT_SITE_ALLOWLIST = [
  "ruankao.org.cn",
  "github.com",
  "zhihu.com",
  "juejin.cn",
];

const EXCLUDED_SITE_SUFFIXES = ["facebook.com", "pinterest.com", "x.com"];

const WEAK_MASTERY_THRESHOLD = 0.6;

type ScoutTopicTag = "goal" | "recent" | "upcoming" | "weak";
type ScoutCandidateKind = "article" | "news" | "outline" | "past-exam";
type ScoutFeedbackAction = "later" | "skip";

interface ScoutTopic {
  key: string;
  keywords: string[];
  label: string;
  tag: ScoutTopicTag;
  weight: number;
}

interface ScoutProfile {
  topics: ScoutTopic[];
}

interface ScoutQuery {
  id: string;
  kind: ScoutCandidateKind;
  text: string;
  topicKey: string;
  topicLabel: string;
}

interface ScoutCandidate {
  authority: number | null;
  host: string;
  kind: ScoutCandidateKind;
  publishedAt: string | null;
  rerankScore: number | null;
  snippet: string | null;
  summary: string | null;
  title: string;
  topicKey: string;
  topicLabel: string;
  url: string;
}

interface ScoutFeedback {
  action: ScoutFeedbackAction;
  host: string;
  localDate: string;
  topicKey: string;
}

interface ScoutPick extends ScoutCandidate {
  confidence: number;
  why: string;
}

const emptyToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

const normalizeUrl = (rawUrl: string): string | null => {
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.protocol = "https:";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    for (const key of [...url.searchParams.keys()]) {
      if (
        key.startsWith("utm_") ||
        ["from", "ref", "share_", "spm"].includes(key) ||
        key.startsWith("share_")
      ) {
        url.searchParams.delete(key);
      }
    }

    const search = url.searchParams.toString();
    const path = url.pathname.replace(/\/+$/, "");

    return `https://${url.hostname}${path}${search.length > 0 ? `?${search}` : ""}`;
  } catch {
    return null;
  }
};

const hostOf = (rawUrl: string): string => {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const hostMatches = (host: string, suffix: string): boolean =>
  host === suffix || host.endsWith(`.${suffix}`);

const isExcludedHost = (host: string): boolean =>
  EXCLUDED_SITE_SUFFIXES.some((suffix) => hostMatches(host, suffix));

const daysBetween = (from: string, to: string): number | null => {
  if (!(from && to)) {
    return null;
  }

  const fromDate = from.slice(0, 10);
  const toDate = to.slice(0, 10);

  if (
    !(
      /^\d{4}-\d{2}-\d{2}$/.test(fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(toDate)
    )
  ) {
    return null;
  }

  return diffLocalDays(fromDate, toDate);
};

const maxAgeDaysFor = (kind: ScoutCandidateKind): number => {
  if (kind === "past-exam") {
    return EXAM_MAX_AGE_DAYS;
  }

  if (kind === "outline") {
    return OUTLINE_MAX_AGE_DAYS;
  }

  return kind === "news" ? NEWS_MAX_AGE_DAYS : ARTICLE_MAX_AGE_DAYS;
};

const topicKeywords = (node: StudyPlanNode): string[] => {
  const keywords = [
    node.title.trim(),
    ...node.syllabusRefs.map((ref) => ref.trim()),
  ]
    .filter((keyword) => keyword.length > 0)
    .filter(
      (keyword, index, list) =>
        list.findIndex(
          (other) => other.toLowerCase() === keyword.toLowerCase()
        ) === index
    );

  return keywords.slice(0, TOPIC_KEYWORD_LIMIT);
};

const buildScoutProfile = (input: {
  masteryByNode?: Record<string, number>;
  nodes: StudyPlanNode[];
  sessions: StudySession[];
  localDate: string;
  limit?: number;
}): ScoutProfile => {
  const lessons = input.nodes.filter((node) => node.kind === "lesson");
  const recentFrom = addLocalDays(input.localDate, -RECENT_SESSION_DAYS);
  const upcomingTo = addLocalDays(input.localDate, UPCOMING_SESSION_DAYS);
  const mastery = input.masteryByNode ?? {};

  const recentNodeIds = new Set(
    input.sessions
      .filter((session) => session.status === "completed")
      .filter((session) => {
        const completedDate = session.completedAt?.slice(0, 10);
        return (
          completedDate !== undefined &&
          completedDate >= recentFrom &&
          completedDate <= input.localDate
        );
      })
      .map((session) => session.planNodeId)
  );

  const upcomingNodeIds = new Set(
    input.sessions
      .filter(
        (session) =>
          session.status === "planned" || session.status === "in_progress"
      )
      .filter((session) => {
        const scheduledDate = session.scheduledFor.slice(0, 10);
        return scheduledDate >= input.localDate && scheduledDate <= upcomingTo;
      })
      .map((session) => session.planNodeId)
  );

  const topics = lessons
    .map((node) => {
      const nodeMastery = mastery[node.id];
      const weak =
        nodeMastery !== undefined && nodeMastery < WEAK_MASTERY_THRESHOLD;
      const upcoming = upcomingNodeIds.has(node.id);
      const recent = recentNodeIds.has(node.id);

      let weight = 1;
      if (weak) {
        weight += 2;
      }
      if (upcoming) {
        weight += 1.5;
      }
      if (recent) {
        weight += 1;
      }

      const tag: ScoutTopicTag = weak
        ? "weak"
        : upcoming
          ? "upcoming"
          : recent
            ? "recent"
            : "goal";

      return {
        key: node.id,
        keywords: topicKeywords(node),
        label: node.title.trim(),
        tag,
        weight,
      } satisfies ScoutTopic;
    })
    .filter((topic) => topic.keywords.length > 0)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, input.limit ?? PROFILE_TOPIC_LIMIT);

  return { topics };
};

const withExclusions = (query: string): string =>
  `${query} -site:${EXCLUDED_SITE_SUFFIXES.join(" -site:")}`;

const buildScoutQueries = (input: {
  allowlist?: string[];
  localDate: string;
  maxQueries?: number;
  profile: ScoutProfile;
}): ScoutQuery[] => {
  const allowlist =
    input.allowlist && input.allowlist.length > 0
      ? input.allowlist
      : DEFAULT_SITE_ALLOWLIST;
  const topics = input.profile.topics;

  if (topics.length === 0) {
    return [];
  }

  const dayIndex = Number(input.localDate.slice(8, 10));
  const rotation = dayIndex % topics.length;
  const rotated = [...topics.slice(rotation), ...topics.slice(0, rotation)];
  const recentCutoff = addLocalDays(input.localDate, -365);
  const examCutoff = addLocalDays(input.localDate, -730);
  const queries: ScoutQuery[] = [];
  const site = allowlist[rotation % allowlist.length] ?? allowlist[0];

  for (const topic of rotated) {
    const keyword = topic.keywords[0] ?? topic.label;

    queries.push({
      id: `${topic.key}:analysis`,
      kind: "article",
      text: withExclusions(`${keyword} 深度分析 after:${examCutoff}`),
      topicKey: topic.key,
      topicLabel: topic.label,
    });
    queries.push({
      id: `${topic.key}:site`,
      kind: "past-exam",
      text: withExclusions(`site:${site} ${keyword} 真题`),
      topicKey: topic.key,
      topicLabel: topic.label,
    });
    queries.push({
      id: `${topic.key}:exam`,
      kind: "past-exam",
      text: withExclusions(`${keyword} 案例分析 真题 after:${examCutoff}`),
      topicKey: topic.key,
      topicLabel: topic.label,
    });
    queries.push({
      id: `${topic.key}:practice`,
      kind: "article",
      text: withExclusions(`${keyword} 实践经验 踩坑 after:${recentCutoff}`),
      topicKey: topic.key,
      topicLabel: topic.label,
    });
    queries.push({
      id: `${topic.key}:news`,
      kind: "news",
      text: withExclusions(`${keyword} 最新进展 新闻 after:${recentCutoff}`),
      topicKey: topic.key,
      topicLabel: topic.label,
    });
    queries.push({
      id: `${topic.key}:outline`,
      kind: "outline",
      text: withExclusions(`${keyword} 考试大纲 变化 after:${examCutoff}`),
      topicKey: topic.key,
      topicLabel: topic.label,
    });
  }

  return queries.slice(0, input.maxQueries ?? QUERY_LIMIT);
};

const suppressionUntil = (feedback: ScoutFeedback): string =>
  addLocalDays(
    feedback.localDate,
    feedback.action === "skip" ? SKIP_SUPPRESSION_DAYS : LATER_REOFFER_DAYS
  );

const isSuppressed = (input: {
  candidate: ScoutCandidate;
  feedback: ScoutFeedback[];
  localDate: string;
}): boolean =>
  input.feedback.some(
    (entry) =>
      entry.host === input.candidate.host &&
      entry.topicKey === input.candidate.topicKey &&
      suppressionUntil(entry) > input.localDate
  );

const toCandidate = (input: {
  item: WebSearchResultItem;
  kind: ScoutCandidateKind;
  query: ScoutQuery;
}): ScoutCandidate | null => {
  const host = hostOf(input.item.url);

  if (host.length === 0 || isExcludedHost(host)) {
    return null;
  }

  return {
    authority: input.item.authority,
    host,
    kind: input.kind,
    publishedAt: input.item.publishedAt,
    rerankScore: input.item.rerankScore,
    snippet: emptyToNull(input.item.snippet),
    summary: emptyToNull(input.item.summary),
    title: input.item.title.trim(),
    topicKey: input.query.topicKey,
    topicLabel: input.query.topicLabel,
    url: input.item.url,
  };
};

const passesQualityGate = (input: {
  candidate: ScoutCandidate;
  minRerankScore: number;
  relaxed: boolean;
}): boolean => {
  const rerank = input.candidate.rerankScore;
  const authority = input.candidate.authority;
  const threshold = input.relaxed
    ? RELAXED_MIN_RERANK_SCORE
    : input.minRerankScore;

  if (rerank !== null && rerank < threshold) {
    return false;
  }

  if (authority === null) {
    return true;
  }

  if (authority >= MIN_AUTHORITY) {
    return true;
  }

  const isUnknownAuthority = authority === -1;
  return (
    rerank !== null &&
    rerank >=
      (isUnknownAuthority ? LOW_AUTHORITY_MIN_RERANK : input.minRerankScore)
  );
};

const isFreshEnough = (input: {
  candidate: ScoutCandidate;
  localDate: string;
}): boolean => {
  const age = daysBetween(input.candidate.publishedAt ?? "", input.localDate);

  if (age === null) {
    return (input.candidate.authority ?? 0) >= 3;
  }

  return age <= maxAgeDaysFor(input.candidate.kind);
};

const filterCandidates = (input: {
  candidates: ScoutCandidate[];
  deliveredUrls?: string[];
  feedback?: ScoutFeedback[];
  localDate: string;
  minRerankScore?: number;
}): ScoutCandidate[] => {
  const delivered = new Set(
    (input.deliveredUrls ?? []).map((url) => normalizeUrl(url) ?? url)
  );
  const feedback = input.feedback ?? [];
  const seenUrls = new Set<string>();
  const hostCounts = new Map<string, number>();
  const selected: ScoutCandidate[] = [];

  const consider = (pool: ScoutCandidate[], relaxed: boolean) => {
    for (const candidate of pool) {
      if (selected.length >= RANKING_CANDIDATE_LIMIT) {
        return;
      }

      const normalized = normalizeUrl(candidate.url);
      const host = normalized === null ? "" : hostOf(normalized);

      if (normalized === null || host.length === 0 || isExcludedHost(host)) {
        continue;
      }
      if (seenUrls.has(normalized)) {
        continue;
      }
      if (delivered.has(normalized)) {
        continue;
      }
      if (
        !passesQualityGate({
          candidate,
          minRerankScore: input.minRerankScore ?? MIN_RERANK_SCORE,
          relaxed,
        })
      ) {
        continue;
      }
      if (!isFreshEnough({ candidate, localDate: input.localDate })) {
        continue;
      }
      if (
        isSuppressed({
          candidate: { ...candidate, host },
          feedback,
          localDate: input.localDate,
        })
      ) {
        continue;
      }
      if ((hostCounts.get(host) ?? 0) >= 1) {
        continue;
      }

      seenUrls.add(normalized);
      hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
      selected.push({ ...candidate, host, url: normalized });
    }
  };

  const relaxedPool = [...input.candidates]
    .sort((left, right) => (right.rerankScore ?? 0) - (left.rerankScore ?? 0))
    .slice(0, RELAXED_CANDIDATE_TOP);

  consider(input.candidates, false);
  consider(relaxedPool, true);

  return selected;
};

const collectCandidates = (input: {
  queries: ScoutQuery[];
  results: Array<{ items: WebSearchResultItem[]; queryId: string }>;
}): ScoutCandidate[] => {
  const byQueryId = new Map(input.queries.map((query) => [query.id, query]));
  const candidates: ScoutCandidate[] = [];

  for (const result of input.results) {
    const query = byQueryId.get(result.queryId);

    if (!query) {
      continue;
    }

    for (const item of result.items) {
      const candidate = toCandidate({ item, kind: query.kind, query });

      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
};

const readJsonObject = (raw: string): Record<string, unknown> | null => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const clampConfidence = (value: unknown): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
};

const clampWhy = (value: unknown): string => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, 60);
};

const heuristicScore = (
  candidate: ScoutCandidate,
  localDate: string
): number => {
  const rerank = (candidate.rerankScore ?? 0) / 3;
  const authority = (candidate.authority ?? 0) / 4;
  const age = daysBetween(candidate.publishedAt ?? "", localDate);
  const recency =
    age === null ? 0.3 : Math.max(0, 1 - age / ARTICLE_MAX_AGE_DAYS);

  return 0.6 * rerank + 0.25 * authority + 0.15 * recency;
};

const heuristicPicks = (
  candidates: ScoutCandidate[],
  localDate: string
): ScoutPick[] =>
  candidates
    .map((candidate) => ({
      ...candidate,
      confidence: Math.min(1, heuristicScore(candidate, localDate)),
      why:
        candidate.summary?.slice(0, 60) ??
        `和「${candidate.topicLabel}」直接相关。`,
    }))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_PICKS)
    .filter((pick) => pick.confidence >= MIN_CONFIDENCE);

const buildRankingMessages = (input: {
  candidates: ScoutCandidate[];
  profile: ScoutProfile;
}): OpenAICompatibleMessage[] => [
  {
    role: "system",
    content: [
      "你是学习材料的筛选助手。给定学习主题与候选网页，挑出最值得读的 1-3 条。",
      "判定标准：与主题直接相关、能加深理解或提供真题练习、来源可信、信息不是广告或列表页。",
      '只输出 JSON：{"picks":[{"index":0,"why":"不超过25字的中文理由","confidence":0.0}]}',
      "index 是候选的序号（从 0 开始），不要编造候选之外的序号。",
    ].join("\n"),
  },
  {
    role: "user",
    content: [
      `学习主题：${input.profile.topics.map((topic) => topic.label).join("、")}`,
      "候选：",
      ...input.candidates.map((candidate, index) =>
        `${index}. [${candidate.kind}] ${candidate.title} — ${candidate.host} · ${candidate.publishedAt?.slice(0, 10) ?? "无日期"} · ${candidate.summary ?? candidate.snippet ?? ""}`.slice(
          0,
          400
        )
      ),
    ].join("\n"),
  },
];

const rankCandidates = async (input: {
  candidates: ScoutCandidate[];
  config: OpenAICompatibleConfig;
  profile: ScoutProfile;
  deps?: { createChatCompletion?: typeof createChatCompletion };
  localDate: string;
}): Promise<ScoutPick[]> => {
  if (input.candidates.length === 0) {
    return [];
  }

  const complete = input.deps?.createChatCompletion ?? createChatCompletion;

  try {
    const raw = await complete(
      input.config,
      buildRankingMessages({
        candidates: input.candidates,
        profile: input.profile,
      }),
      { maxTokens: RANKING_MAX_TOKENS, temperature: RANKING_TEMPERATURE }
    );
    const payload = readJsonObject(raw);
    const picks = Array.isArray(payload?.picks) ? payload.picks : null;

    if (!picks) {
      return heuristicPicks(input.candidates, input.localDate);
    }

    const ranked: ScoutPick[] = [];

    for (const entry of picks) {
      const record = (entry ?? {}) as Record<string, unknown>;
      const index = record.index;
      const candidate =
        typeof index === "number" ? input.candidates[index] : undefined;

      if (!candidate) {
        continue;
      }

      const confidence = clampConfidence(record.confidence);

      if (confidence < MIN_CONFIDENCE) {
        continue;
      }

      ranked.push({
        ...candidate,
        confidence,
        why: clampWhy(record.why) || `和「${candidate.topicLabel}」直接相关。`,
      });
    }

    const unique = ranked
      .filter(
        (pick, index, list) =>
          list.findIndex((other) => other.url === pick.url) === index
      )
      .slice(0, MAX_PICKS);

    return unique.length > 0
      ? unique
      : heuristicPicks(input.candidates, input.localDate);
  } catch {
    return heuristicPicks(input.candidates, input.localDate);
  }
};

export type {
  ScoutCandidate,
  ScoutCandidateKind,
  ScoutFeedback,
  ScoutFeedbackAction,
  ScoutPick,
  ScoutProfile,
  ScoutQuery,
  ScoutTopic,
  ScoutTopicTag,
};

export {
  ARTICLE_MAX_AGE_DAYS,
  buildScoutProfile,
  buildScoutQueries,
  collectCandidates,
  DEFAULT_SITE_ALLOWLIST,
  EXAM_MAX_AGE_DAYS,
  filterCandidates,
  heuristicPicks,
  LATER_REOFFER_DAYS,
  MAX_PICKS,
  MIN_CONFIDENCE,
  MIN_RERANK_SCORE,
  normalizeUrl,
  rankCandidates,
  SKIP_SUPPRESSION_DAYS,
  suppressionUntil,
  WEAK_MASTERY_THRESHOLD,
};
