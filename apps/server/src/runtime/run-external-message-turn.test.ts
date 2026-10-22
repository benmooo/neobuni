import type { StreamChunk } from "@tanstack/ai";
import { beforeEach, describe, expect, test, vi } from "vitest";

const createChatTurnStreamMock = vi.fn(
  async (_input: Record<string, unknown>) =>
    (async function* (): AsyncGenerator<StreamChunk, void, unknown> {
      yield {
        type: "TEXT_MESSAGE_CONTENT",
        delta: "今天的 AI 热点如下",
      } as StreamChunk;
    })()
);

describe("runExternalMessageTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("consumes the chat stream with a chat_public_safe surface policy", async () => {
    const { runExternalMessageTurn } = await import(
      "./run-external-message-turn"
    );

    const result = await runExternalMessageTurn(
      {
        profileId: "profile-1",
        conversationId: "conversation-1",
        latestUserText: "整理今天 AI 热点",
        platform: "discord",
        externalThreadId: "interaction-1",
      },
      {
        createChatTurnStream:
          createChatTurnStreamMock as unknown as typeof import("./create-chat-turn-stream").createChatTurnStream,
      }
    );

    expect(createChatTurnStreamMock).toHaveBeenCalledTimes(1);
    expect(createChatTurnStreamMock.mock.calls[0]?.[0]).toMatchObject({
      profileId: "profile-1",
      conversationId: "conversation-1",
      threadId: "interaction-1",
      latestUserText: "整理今天 AI 热点",
      clientTools: [],
      surfacePolicy: {
        surface: "chat_public_safe",
      },
    });
    expect(result.assistantText).toBe("今天的 AI 热点如下");
  });
});
