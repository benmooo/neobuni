import {
  getMemoryReasoningProviderConfig as getMemoryReasoningProviderConfigFx,
  getProviderConfig as getProviderConfigFx,
  runRepo,
} from "@neobuni/db";

const getMemoryReasoningProviderConfig = (
  ...args: Parameters<typeof getMemoryReasoningProviderConfigFx>
) => runRepo(getMemoryReasoningProviderConfigFx(...args));
const getProviderConfig = (...args: Parameters<typeof getProviderConfigFx>) =>
  runRepo(getProviderConfigFx(...args));

import type { SummarizePageInput } from "@neobuni/contracts";

import { toOpenAICompatibleConfig } from "../digest/memory-provider-config";
import type { WebPageDocument } from "../integrations/web/types";
import {
  createChatCompletion,
  type OpenAICompatibleConfig,
} from "../providers/openai-compatible-client";

type SummaryLength = SummarizePageInput["length"];

interface SummarizeWebPageDeps {
  createChatCompletion: typeof createChatCompletion;
  getMemoryReasoningProviderConfig: typeof getMemoryReasoningProviderConfig;
  getProviderConfig: typeof getProviderConfig;
}

interface SummarizeWebPageResult {
  notes: string[];
  summary: string;
}

const SUMMARY_SOURCE_CHAR_LIMIT = 12_000;

const chooseSummarySource = (document: WebPageDocument) =>
  document.markdown.trim().length > 0 ? document.markdown : document.plainText;

const truncateContent = (content: string) =>
  content.length <= SUMMARY_SOURCE_CHAR_LIMIT
    ? { content, truncated: false }
    : {
        content: content.slice(0, SUMMARY_SOURCE_CHAR_LIMIT),
        truncated: true,
      };

const lengthInstruction = (length: SummaryLength) =>
  length === "short"
    ? "Write 2-3 sentences."
    : length === "long"
      ? "Write 2 short paragraphs that stay concise and factual."
      : "Write 4-6 sentences.";

const maxTokensForLength = (length: SummaryLength) =>
  length === "short" ? 220 : length === "long" ? 720 : 420;

const buildSummaryMessages = (input: {
  document: WebPageDocument;
  content: string;
  goal?: string;
  length: SummaryLength;
}) => [
  {
    role: "system" as const,
    content:
      "You summarize one web page for an AI agent. Keep the summary grounded in the supplied page content. Do not invent facts. Return plain text only.",
  },
  {
    role: "user" as const,
    content: [
      input.goal ? `User goal: ${input.goal}` : null,
      `Length requirement: ${lengthInstruction(input.length)}`,
      [
        "Page metadata:",
        `- Title: ${input.document.title ?? "unknown"}`,
        `- Site: ${input.document.siteName ?? "unknown"}`,
        `- URL: ${input.document.finalUrl}`,
        `- Published at: ${input.document.publishedAt ?? "unknown"}`,
      ].join("\n"),
      `Page content:\n${input.content}`,
      "Return only the summary text.",
    ]
      .filter((value): value is string => value !== null)
      .join("\n\n"),
  },
];

const loadSummaryReasoningConfig = async (
  profileId: string,
  deps: Pick<
    SummarizeWebPageDeps,
    "getMemoryReasoningProviderConfig" | "getProviderConfig"
  >
): Promise<OpenAICompatibleConfig | null> => {
  const memoryReasoning =
    await deps.getMemoryReasoningProviderConfig(profileId);
  const memoryConfig = toOpenAICompatibleConfig(memoryReasoning);

  if (memoryConfig !== null) {
    return memoryConfig;
  }

  const providerConfig = await deps.getProviderConfig(profileId);
  return toOpenAICompatibleConfig(providerConfig);
};

const summarizeWebPage = async (input: {
  profileId: string;
  document: WebPageDocument;
  goal?: string;
  length: SummaryLength;
  signal?: AbortSignal;
  deps?: Partial<SummarizeWebPageDeps>;
}): Promise<SummarizeWebPageResult> => {
  const deps: SummarizeWebPageDeps = {
    getMemoryReasoningProviderConfig,
    getProviderConfig,
    createChatCompletion,
    ...input.deps,
  };
  const reasoningConfig = await loadSummaryReasoningConfig(
    input.profileId,
    deps
  );

  if (reasoningConfig === null) {
    throw new Error("No reasoning provider is configured for summarize_page.");
  }

  const prepared = truncateContent(chooseSummarySource(input.document).trim());
  const summary = (
    await deps.createChatCompletion(
      reasoningConfig,
      buildSummaryMessages({
        document: input.document,
        content: prepared.content,
        goal: input.goal,
        length: input.length,
      }),
      {
        temperature: 0.2,
        maxTokens: maxTokensForLength(input.length),
        signal: input.signal,
      }
    )
  ).trim();

  if (summary.length === 0) {
    throw new Error("Summarize provider returned an empty summary.");
  }

  const notes = [
    ...(input.goal ? ["goal_applied"] : []),
    ...(prepared.truncated ? ["content_truncated"] : []),
  ];

  return {
    summary,
    notes,
  };
};

export type { SummarizeWebPageResult };
export { chooseSummarySource, summarizeWebPage };
