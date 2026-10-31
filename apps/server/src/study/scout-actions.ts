import type { StudyCheckSpec, StudyLessonEnrichment } from "@neobuni/contracts";
import {
  appendEvent,
  getLatestStudyPlan,
  listEvents,
  runRepo,
  updateStudyNodeEnrichment,
} from "@neobuni/db";
import { z } from "zod";
import { fetchDeepSeekPage } from "../integrations/web/deepseek-search";
import { resolveWebProvider } from "../integrations/web/provider";
import {
  createChatCompletion,
  type OpenAICompatibleMessage,
} from "../providers/openai-compatible-client";
import { saveWebPageToKnowledge } from "../web/save-web-page-to-knowledge";
import type { StudyNudgeEvent } from "./nudge-service";
import { resolveStudyReasoningConfig } from "./reasoning-config";

const ACTIONS = ["later", "quiz", "save", "skip"] as const;
const QUIZ_CHECK_COUNT = 3;
const QUIZ_MAX_CHECKS = 6;
const QUIZ_SOURCE_CHAR_LIMIT = 6000;
const QUIZ_MAX_TOKENS = 700;

type ScoutAction = (typeof ACTIONS)[number];

interface ScoutDigestItem {
  host: string;
  kind: string;
  title?: string;
  topicKey: string;
  url: string;
}

interface ScoutActionDeps {
  appendEvent: typeof appendEvent;
  createChatCompletion: typeof createChatCompletion;
  fetchPage: typeof fetchDeepSeekPage;
  getLatestStudyPlan: typeof getLatestStudyPlan;
  listEvents: typeof listEvents;
  resolveReasoning: typeof resolveStudyReasoningConfig;
  resolveWebProvider: typeof resolveWebProvider;
  saveWebPageToKnowledge: typeof saveWebPageToKnowledge;
  updateStudyNodeEnrichment: typeof updateStudyNodeEnrichment;
}

interface ScoutActionInput {
  action: ScoutAction;
  digestId: string;
  index: number;
  now?: Date;
  profileId: string;
}

interface ScoutActionResult {
  ack: string;
  stale?: boolean;
  text: string;
}

const defaultDeps: ScoutActionDeps = {
  appendEvent,
  createChatCompletion,
  fetchPage: fetchDeepSeekPage,
  getLatestStudyPlan,
  listEvents,
  resolveReasoning: resolveStudyReasoningConfig,
  resolveWebProvider,
  saveWebPageToKnowledge,
  updateStudyNodeEnrichment,
};

const parseNudgeIndex = (value: string): number | null => {
  if (!/^\d{1,2}$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < 32 ? parsed : null;
};

const parseScoutCallback = (
  data: string
): { action: ScoutAction; digestId: string; index: number } | null => {
  const [scope, action, rawIndex, digestId] = data.split(":");

  if (scope !== "sc" || !digestId) {
    return null;
  }
  if (!ACTIONS.includes(action as ScoutAction)) {
    return null;
  }
  if (!/^[0-9a-f]{8,32}$/.test(digestId)) {
    return null;
  }

  const index = parseNudgeIndex(rawIndex ?? "");

  return index === null
    ? null
    : { action: action as ScoutAction, digestId, index };
};

const scoutCallbackData = (input: {
  action: ScoutAction;
  digestId: string;
  index: number;
}): string => `sc:${input.action}:${input.index}:${input.digestId}`;

const digestOf = (
  events: StudyNudgeEvent[],
  digestId: string
): { goalId: string; items: ScoutDigestItem[]; localDate: string } | null => {
  const event = [...events]
    .reverse()
    .find(
      (entry) =>
        entry.type === "study.scout_sent" &&
        entry.payload?.digestId === digestId
    );

  if (!event) {
    return null;
  }

  const rawItems = Array.isArray(event.payload?.items)
    ? (event.payload.items as Record<string, unknown>[])
    : [];

  return {
    goalId:
      typeof event.payload?.goalId === "string" ? event.payload.goalId : "",
    items: rawItems
      .filter(
        (item) =>
          typeof item.url === "string" && typeof item.topicKey === "string"
      )
      .map((item) => ({
        host: typeof item.host === "string" ? item.host : "",
        kind: typeof item.kind === "string" ? item.kind : "article",
        title: typeof item.title === "string" ? item.title : undefined,
        topicKey: item.topicKey as string,
        url: item.url as string,
      })),
    localDate:
      typeof event.payload?.localDate === "string"
        ? event.payload.localDate
        : event.createdAt.slice(0, 10),
  };
};

const alreadyHandled = (input: {
  action: ScoutAction;
  digestId: string;
  events: StudyNudgeEvent[];
  index: number;
}): boolean => {
  const type =
    input.action === "save"
      ? "study.scout_saved"
      : input.action === "quiz"
        ? "study.scout_quiz"
        : "study.scout_feedback";

  return input.events.some(
    (event) =>
      event.type === type &&
      event.payload?.digestId === input.digestId &&
      event.payload?.index === input.index
  );
};

const quizResponseSchema = z.object({
  checks: z
    .array(
      z.object({
        answerKey: z.string().max(4000).nullable().default(null),
        kind: z.enum(["recall", "case", "essay"]).default("case"),
        prompt: z.string().trim().min(1).max(4000),
        rubric: z.string().max(8000).nullable().default(null),
      })
    )
    .min(1),
});

const buildQuizMessages = (input: {
  content: string;
  topicLabel: string;
}): OpenAICompatibleMessage[] => [
  {
    role: "system",
    content: [
      "你是「系统架构设计师」考试的出题助手。",
      "根据给出的文章，出 3 道题：1 道 recall（回忆概念），2 道 case（案例分析，要求迁移应用）。",
      "每题 prompt 不超过 60 字，rubric 不超过 40 字，recall 题给 answerKey。",
      "只考文章里真实出现的内容，不要编造数据。",
      '只输出 JSON：{"checks":[{"kind":"recall","prompt":"","rubric":"","answerKey":""}]}',
    ].join("\n"),
  },
  {
    role: "user",
    content: `主题：${input.topicLabel}\n\n文章：\n${input.content.slice(0, QUIZ_SOURCE_CHAR_LIMIT)}`,
  },
];

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

const toCheckSpecs = (raw: string): StudyCheckSpec[] | null => {
  const payload = readJsonObject(raw);
  const parsed = quizResponseSchema.safeParse(payload);

  if (!parsed.success) {
    return null;
  }

  return parsed.data.checks.slice(0, QUIZ_CHECK_COUNT).map((check) => ({
    answerKey: check.answerKey,
    id: crypto.randomUUID(),
    kind: check.kind,
    prompt: check.prompt,
    rubric: check.rubric,
  }));
};

const mergeChecks = (
  enrichment: StudyLessonEnrichment | null | undefined,
  specs: StudyCheckSpec[],
  existing: StudyCheckSpec[]
): StudyCheckSpec[] => {
  const base = enrichment?.checkSpecs ?? existing;
  const seen = new Set(base.map((spec) => spec.prompt));
  const merged = [...base];

  for (const spec of specs) {
    if (merged.length >= QUIZ_MAX_CHECKS) {
      break;
    }
    if (seen.has(spec.prompt)) {
      continue;
    }
    seen.add(spec.prompt);
    merged.push(spec);
  }

  return merged;
};

const applySave = async (input: {
  deps: ScoutActionDeps;
  digestId: string;
  item: ScoutDigestItem;
  profileId: string;
}): Promise<ScoutActionResult> => {
  const provider = await input.deps.resolveWebProvider(input.profileId);

  if (!provider) {
    return {
      ack: "还没有配置搜索服务的密钥，暂时存不了。",
      text: "收藏失败：缺少搜索服务密钥。",
    };
  }

  const page = await input.deps.fetchPage({
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    url: input.item.url,
  });
  const saved = await input.deps.saveWebPageToKnowledge({
    document: page.document,
    profileId: input.profileId,
    title: input.item.title ?? page.document.title ?? input.item.url,
    trustLevel: "imported",
    url: input.item.url,
  });

  await runRepo(
    input.deps.appendEvent(input.profileId, "study.scout_saved", {
      digestId: input.digestId,
      documentId: (saved as { documentId?: string }).documentId ?? null,
      url: input.item.url,
    })
  );

  return {
    ack: "已收藏到知识库。",
    text: `已收藏：${input.item.title ?? input.item.url}`,
  };
};

const applyQuiz = async (input: {
  deps: ScoutActionDeps;
  digest: { goalId: string };
  digestId: string;
  item: ScoutDigestItem;
  profileId: string;
}): Promise<ScoutActionResult> => {
  const provider = await input.deps.resolveWebProvider(input.profileId);

  if (!provider) {
    return {
      ack: "还没有配置搜索服务的密钥。",
      text: "出题失败：缺少搜索服务密钥。",
    };
  }

  const plan = await runRepo(
    input.deps.getLatestStudyPlan({
      goalId: input.digest.goalId,
      status: "active",
    })
  );
  const node = plan?.nodes.find((entry) => entry.id === input.item.topicKey);

  if (!node) {
    return {
      ack: "找不到对应的课节。",
      stale: true,
      text: "出题失败：课节不存在。",
    };
  }

  const page = await input.deps.fetchPage({
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    url: input.item.url,
  });
  const content = page.document.markdown || page.document.plainText;
  const reasoning = await input.deps.resolveReasoning(input.profileId);

  if (!reasoning) {
    return { ack: "还没有配置模型密钥。", text: "出题失败：缺少模型密钥。" };
  }

  const raw = await input.deps.createChatCompletion(
    reasoning,
    buildQuizMessages({ content, topicLabel: node.title }),
    { maxTokens: QUIZ_MAX_TOKENS, temperature: 0.2 }
  );
  const specs = toCheckSpecs(raw);

  if (!specs || specs.length === 0) {
    return {
      ack: "这次没能生成题目，稍后再试。",
      text: "出题失败：模型输出无法解析。",
    };
  }

  const merged = mergeChecks(node.enrichment, specs, node.checkSpecs);

  if (node.enrichment) {
    await runRepo(
      input.deps.updateStudyNodeEnrichment({
        enrichment: { ...node.enrichment, checkSpecs: merged },
        planNodeId: node.id,
      })
    );
  } else {
    await runRepo(
      input.deps.updateStudyNodeEnrichment({
        enrichment: {
          checkSpecs: merged.slice(0, QUIZ_MAX_CHECKS),
          enrichedAt: new Date().toISOString(),
          howText: node.howText ?? "先读材料，再做这 3 道延伸题。",
          material: null,
          objective: node.objective ?? node.title,
          resources: node.resources,
          source: "llm",
          whatText: node.whatText ?? node.title,
        },
        planNodeId: node.id,
      })
    );
  }

  await runRepo(
    input.deps.appendEvent(input.profileId, "study.scout_quiz", {
      digestId: input.digestId,
      planNodeId: node.id,
      url: input.item.url,
    })
  );

  return {
    ack: "已写进这一节的「互动自检」。",
    text: `已为「${node.title}」加了 3 道延伸题。`,
  };
};

const applyFeedback = async (input: {
  action: "later" | "skip";
  deps: ScoutActionDeps;
  digest: { localDate: string };
  digestId: string;
  index: number;
  item: ScoutDigestItem;
  profileId: string;
}): Promise<ScoutActionResult> => {
  await runRepo(
    input.deps.appendEvent(input.profileId, "study.scout_feedback", {
      action: input.action,
      digestId: input.digestId,
      host: input.item.host,
      index: input.index,
      localDate: input.digest.localDate,
      topicKey: input.item.topicKey,
      url: input.item.url,
    })
  );

  return input.action === "skip"
    ? { ack: "好的，这类材料会少推。", text: "已记录：不感兴趣。" }
    : { ack: "明晚再看。", text: "已推迟到明晚。" };
};

const applyStudyScoutAction = async (
  input: ScoutActionInput,
  deps: ScoutActionDeps = defaultDeps
): Promise<ScoutActionResult | null> => {
  const events = (await runRepo(
    deps.listEvents(input.profileId)
  )) as unknown as StudyNudgeEvent[];
  const digest = digestOf(events, input.digestId);

  if (!digest) {
    return {
      ack: "这条精选已经过期，等下一次推荐。",
      stale: true,
      text: "精选已过期。",
    };
  }

  const item = digest.items[input.index];

  if (!item) {
    return {
      ack: "没有找到这条材料。",
      stale: true,
      text: "材料不存在。",
    };
  }

  if (
    alreadyHandled({
      action: input.action,
      digestId: input.digestId,
      events,
      index: input.index,
    })
  ) {
    return { ack: "这一条已经处理过了。", text: "重复操作已忽略。" };
  }

  if (input.action === "save") {
    return await applySave({
      deps,
      digestId: input.digestId,
      item,
      profileId: input.profileId,
    });
  }

  if (input.action === "quiz") {
    return await applyQuiz({
      deps,
      digest: { goalId: digest.goalId },
      digestId: input.digestId,
      item,
      profileId: input.profileId,
    });
  }

  return await applyFeedback({
    action: input.action,
    deps,
    digest: { localDate: digest.localDate },
    digestId: input.digestId,
    index: input.index,
    item,
    profileId: input.profileId,
  });
};

export type {
  ScoutAction,
  ScoutActionDeps,
  ScoutActionInput,
  ScoutActionResult,
  ScoutDigestItem,
};
export {
  applyStudyScoutAction,
  mergeChecks,
  parseScoutCallback,
  scoutCallbackData,
  toCheckSpecs,
};
