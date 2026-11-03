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

import type { ExtractPageInput } from "@neobuni/contracts";

import { toOpenAICompatibleConfig } from "../digest/memory-provider-config";
import type { WebPageDocument } from "../integrations/web/types";
import {
  createChatCompletion,
  type OpenAICompatibleConfig,
} from "../providers/openai-compatible-client";

interface ExtractWebPageDeps {
  createChatCompletion: typeof createChatCompletion;
  getMemoryReasoningProviderConfig: typeof getMemoryReasoningProviderConfig;
  getProviderConfig: typeof getProviderConfig;
}

interface ExtractWebPageResult {
  data: unknown;
  generatedSchema: Record<string, unknown> | null;
  notes: string[];
}

const EXTRACT_SOURCE_CHAR_LIMIT = 12_000;

const chooseExtractSource = (document: WebPageDocument) =>
  document.markdown.trim().length > 0 ? document.markdown : document.plainText;

const truncateContent = (content: string) =>
  content.length <= EXTRACT_SOURCE_CHAR_LIMIT
    ? { content, truncated: false }
    : {
        content: content.slice(0, EXTRACT_SOURCE_CHAR_LIMIT),
        truncated: true,
      };

const loadReasoningConfig = async (
  profileId: string,
  deps: Pick<
    ExtractWebPageDeps,
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

/**
 * Models sometimes wrap JSON in fences or add a sentence before it, so a strict
 * `JSON.parse` turns a usable answer into a failure.
 */
const parseJson = (text: string): unknown => {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to brace extraction
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
};

const buildExtractMessages = (input: {
  content: string;
  document: WebPageDocument;
  instruction: string;
  schema?: Record<string, unknown>;
}) => [
  {
    role: "system" as const,
    content:
      "You extract structured JSON from one web page. Use only facts present in the supplied page content. Do not invent values. Return JSON only, with no markdown fences or prose.",
  },
  {
    role: "user" as const,
    content: [
      `Instruction: ${input.instruction}`,
      input.schema
        ? `Target JSON shape:\n${JSON.stringify(input.schema)}`
        : "Target JSON shape: choose fields that fit the instruction.",
      [
        "Page metadata:",
        `- Title: ${input.document.title ?? "unknown"}`,
        `- URL: ${input.document.finalUrl}`,
      ].join("\n"),
      `Page content:\n${input.content}`,
    ].join("\n\n"),
  },
];

const extractWebPage = async (input: {
  profileId: string;
  document: WebPageDocument;
  instruction: string;
  schema?: ExtractPageInput["schema"];
  signal?: AbortSignal;
  deps?: Partial<ExtractWebPageDeps>;
}): Promise<ExtractWebPageResult> => {
  const deps: ExtractWebPageDeps = {
    getMemoryReasoningProviderConfig,
    getProviderConfig,
    createChatCompletion,
    ...input.deps,
  };
  const reasoningConfig = await loadReasoningConfig(input.profileId, deps);

  if (reasoningConfig === null) {
    throw new Error("No reasoning provider is configured for extract_page.");
  }

  const prepared = truncateContent(chooseExtractSource(input.document).trim());
  const text = await deps.createChatCompletion(
    reasoningConfig,
    buildExtractMessages({
      content: prepared.content,
      document: input.document,
      instruction: input.instruction,
      schema: input.schema,
    }),
    {
      maxTokens: 2000,
      signal: input.signal,
      temperature: 0,
    }
  );
  const data = parseJson(text);

  if (data === null) {
    throw new Error("Extract provider returned non-JSON output.");
  }

  return {
    data,
    generatedSchema: null,
    notes: prepared.truncated ? ["content_truncated"] : [],
  };
};

export type { ExtractWebPageResult };
export { buildExtractMessages, extractWebPage, parseJson };
