import {
  type PersistedMessage,
  type ProviderPromptPacket,
  serializeTranscriptEnvelope,
} from "@neobuni/contracts";
import {
  chat,
  type ModelMessage,
  type StreamChunk,
  type Tool,
} from "@tanstack/ai";

import {
  createProviderStreamEvidence,
  type ProviderStreamEvidence,
  type ProviderTurnResolution,
  resolveTurnFromProviderOutcome,
} from "../providers/provider-stream-outcome";
import { buildProviderChatOptions } from "./build-provider-chat-options";
import { createRuntimeMiddleware } from "./create-runtime-middleware";

type RuntimeMiddlewareObserver = Parameters<
  typeof createRuntimeMiddleware
>[0]["observer"];

interface RunAgentTurnInput {
  abortController: AbortController;
  conversationId?: string | null;
  initialPersistedMessageCount: number;
  observer: RuntimeMiddlewareObserver;
  onChunk?: (chunk: StreamChunk) => Promise<void> | void;
  persistedMessages: PersistedMessage[];
  promptPacket: ProviderPromptPacket;
  providerConfig: Parameters<
    typeof buildProviderChatOptions
  >[0]["providerConfig"];
  providerRequestInput: Record<string, unknown>;
  threadId?: string | null;
  tools: Tool[];
}

interface RunAgentTurnResult {
  assistantText: string;
  providerTurnMessages: readonly ModelMessage[];
  providerTurnResolution: ProviderTurnResolution;
  transcript: ReturnType<typeof serializeTranscriptEnvelope>;
}

interface RunAgentTurnDeps {
  chat: typeof chat;
  createRuntimeMiddleware: typeof createRuntimeMiddleware;
  resolveTurnFromProviderOutcome: typeof resolveTurnFromProviderOutcome;
}

const defaultDeps: RunAgentTurnDeps = {
  chat,
  createRuntimeMiddleware,
  resolveTurnFromProviderOutcome,
};

const normalizeAssistantTextForPersistence = (assistantText: string) =>
  assistantText.trim().length > 0 ? assistantText : null;

const appendFinalAssistantText = (
  messages: readonly ModelMessage[],
  assistantText: string
): readonly ModelMessage[] => {
  const finalAssistantText =
    normalizeAssistantTextForPersistence(assistantText);

  if (finalAssistantText === null) {
    return messages;
  }

  const trailingMessage = messages.at(-1);
  if (
    trailingMessage?.role === "assistant" &&
    typeof trailingMessage.content === "string" &&
    trailingMessage.content === finalAssistantText
  ) {
    return messages;
  }

  return [
    ...messages,
    {
      role: "assistant",
      content: finalAssistantText,
    } satisfies ModelMessage,
  ];
};

const runAgentTurn = async (
  input: RunAgentTurnInput,
  deps: RunAgentTurnDeps = defaultDeps
): Promise<RunAgentTurnResult> => {
  let providerStreamEvidence: ProviderStreamEvidence =
    createProviderStreamEvidence();
  let providerTurnMessages: readonly ModelMessage[] = [];
  let assistantText = "";

  const threadId =
    input.threadId ?? input.conversationId ?? crypto.randomUUID();

  const providerStream = deps.chat(
    buildProviderChatOptions({
      providerConfig: input.providerConfig,
      abortController: input.abortController,
      threadId,
      promptPacket: input.promptPacket,
      persistedMessages: input.persistedMessages,
      tools: input.tools,
      middleware: deps.createRuntimeMiddleware({
        observer: input.observer,
        providerRequestInput: input.providerRequestInput,
        initialPersistedMessageCount: input.initialPersistedMessageCount,
        getAbortReason: () => input.abortController.signal.reason,
        getProviderStreamEvidence: () => providerStreamEvidence,
        setProviderStreamEvidence: (next) => {
          providerStreamEvidence = next;
        },
        setProviderTurnMessages: (next) => {
          providerTurnMessages = next;
        },
      }),
    })
  );

  for await (const chunk of providerStream) {
    if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
      assistantText += chunk.delta;
    }

    await input.onChunk?.(chunk);
  }

  const persistedProviderTurnMessages = appendFinalAssistantText(
    providerTurnMessages,
    assistantText
  );

  return {
    assistantText,
    providerTurnMessages: persistedProviderTurnMessages,
    providerTurnResolution: deps.resolveTurnFromProviderOutcome({
      evidence: providerStreamEvidence,
      providerKey: input.providerConfig.provider,
      modelKey: input.providerConfig.model,
    }),
    transcript: serializeTranscriptEnvelope(persistedProviderTurnMessages),
  };
};

export type { RunAgentTurnInput, RunAgentTurnResult };
export { runAgentTurn };
