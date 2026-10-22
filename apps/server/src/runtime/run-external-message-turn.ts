import { createChatTurnStream } from "./create-chat-turn-stream";
import { getSurfacePolicy } from "./surface-policy";

interface RunExternalMessageTurnInput {
  clientTimezone?: string | null;
  conversationId: string;
  externalThreadId: string;
  latestUserText: string;
  platform: "discord" | "telegram";
  profileId: string;
}

interface RunExternalMessageTurnResult {
  assistantText: string;
}

interface RunExternalMessageTurnDeps {
  createChatTurnStream: typeof createChatTurnStream;
}

const defaultDeps: RunExternalMessageTurnDeps = {
  createChatTurnStream,
};

const runExternalMessageTurn = async (
  input: RunExternalMessageTurnInput,
  deps: RunExternalMessageTurnDeps = defaultDeps
): Promise<RunExternalMessageTurnResult> => {
  const abortController = new AbortController();
  const stream = await deps.createChatTurnStream({
    profileId: input.profileId,
    conversationId: input.conversationId,
    threadId: input.externalThreadId,
    abortController,
    clientTimezone: input.clientTimezone ?? null,
    latestUserText: input.latestUserText,
    clientTools: [],
    surfacePolicy: getSurfacePolicy("chat_public_safe"),
  });

  let assistantText = "";

  for await (const chunk of stream) {
    if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
      assistantText += chunk.delta;
    }
  }

  return {
    assistantText: assistantText.trim(),
  };
};

export type { RunExternalMessageTurnInput, RunExternalMessageTurnResult };
export { runExternalMessageTurn };
