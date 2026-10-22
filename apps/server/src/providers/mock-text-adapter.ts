import { buildMockAssistantReply, getLatestUserText } from "@neobuni/core";
import {
  type DefaultMessageMetadataByModality,
  EventType,
  normalizeSystemPrompts,
  type StreamChunk,
  type TextAdapter,
  type TextOptions,
} from "@tanstack/ai";

const splitIntoStreamDeltas = (content: string): string[] =>
  content.split(/(\s+)/).filter(Boolean);

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createMockTextAdapter = (): TextAdapter<
  "buni-mock",
  Record<string, never>,
  readonly ["text", "image", "audio", "video", "document"],
  DefaultMessageMetadataByModality
> => {
  const name = "buni-mock" as const;
  const model = "buni-mock" as const;

  const buildReply = (options: TextOptions<Record<string, never>>) =>
    buildMockAssistantReply({
      systemPrompt: normalizeSystemPrompts(options.systemPrompts)
        .map((prompt) => prompt.content)
        .join("\n\n"),
      lastUserMessage: getLatestUserText(options.messages),
    });

  const chatStream = async function* (
    options: TextOptions<Record<string, never>>
  ): AsyncIterable<StreamChunk> {
    const runId = options.runId ?? createId("run");
    const threadId = options.threadId ?? runId;
    const messageId = createId("msg");
    const content = buildReply(options);

    yield {
      type: EventType.RUN_STARTED,
      runId,
      threadId,
      ...(options.parentRunId ? { parentRunId: options.parentRunId } : {}),
      timestamp: Date.now(),
    };

    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: "assistant",
      timestamp: Date.now(),
    };

    let _accumulated = "";

    for (const delta of splitIntoStreamDeltas(content)) {
      _accumulated += delta;
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta,
        timestamp: Date.now(),
      };
    }

    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      timestamp: Date.now(),
    };

    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      timestamp: Date.now(),
    };
  };

  const structuredOutput = async (options: {
    chatOptions: TextOptions<Record<string, never>>;
  }) => {
    const rawText = JSON.stringify({
      reply: buildReply(options.chatOptions),
    });

    return {
      data: JSON.parse(rawText),
      rawText,
    };
  };

  return {
    kind: "text",
    name,
    model,
    "~types": {
      providerOptions: {},
      inputModalities: ["text", "image", "audio", "video", "document"],
      messageMetadataByModality: {
        text: undefined,
        image: undefined,
        audio: undefined,
        video: undefined,
        document: undefined,
      },
      toolCapabilities: [],
      toolCallMetadata: undefined as unknown,
      systemPromptMetadata: undefined as never,
    },
    chatStream,
    structuredOutput,
  };
};

export { createMockTextAdapter };
