import { beforeEach, describe, expect, vi, test } from "vitest";
import type { ModelMessage, StreamChunk } from "@tanstack/ai";
import type { ProviderTurnResolution } from "../providers/provider-stream-outcome";

const createRuntimeMiddlewareMock = vi.fn(
  (_input: Record<string, unknown>) => [] as Array<Record<string, unknown>>,
);

const chatMock = vi.fn((_input: Record<string, unknown>) =>
  (async function* () {
    yield {
      type: "TEXT_MESSAGE_CONTENT",
      delta: "hello ",
    } as StreamChunk;
    yield {
      type: "TEXT_MESSAGE_CONTENT",
      delta: "world",
    } as StreamChunk;
  })(),
);

const resolveTurnFromProviderOutcomeMock = vi.fn(
  (_input: Record<string, unknown>) =>
    ({
      status: "completed" as const,
      providerOutcome: "text" as const,
    }) as ProviderTurnResolution,
);

const createObserverStub = () => ({
  startSpan: async () => ({ id: "span-1" }),
  completeSpan: async () => undefined,
  failSpan: async () => undefined,
  recordToolCall: (_input: { ok: boolean; toolName?: string }) => undefined,
});

describe("runAgentTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("streams provider chunks through the callback and returns aggregated text", async () => {
    const { runAgentTurn } = await import("./run-agent-turn");
    const streamedDeltas: string[] = [];

    const result = await runAgentTurn(
      {
        observer: createObserverStub(),
        abortController: new AbortController(),
        providerConfig: {
          provider: "mock",
          protocol: "mock",
          model: "mock",
          apiKey: "",
          baseUrl: "",
          enabled: true,
        },
        conversationId: "conversation-1",
        threadId: "thread-1",
        promptPacket: {
          systemPrompt: "You are Buni.",
          sections: [],
          compiledExpression: null,
        },
        persistedMessages: [
          {
            id: "message-1",
            role: "user",
            content: "say hello",
          },
        ],
        tools: [],
        providerRequestInput: {
          providerKey: "mock",
        },
        initialPersistedMessageCount: 1,
        onChunk: async (chunk) => {
          if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
            streamedDeltas.push(chunk.delta);
          }
        },
      },
      {
        chat: chatMock as unknown as typeof import("@tanstack/ai").chat,
        createRuntimeMiddleware:
          createRuntimeMiddlewareMock as unknown as typeof import("./create-runtime-middleware").createRuntimeMiddleware,
        resolveTurnFromProviderOutcome:
          resolveTurnFromProviderOutcomeMock as unknown as typeof import("../providers/provider-stream-outcome").resolveTurnFromProviderOutcome,
      },
    );

    expect(createRuntimeMiddlewareMock).toHaveBeenCalledTimes(1);
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(streamedDeltas).toEqual(["hello ", "world"]);
    expect(result.assistantText).toBe("hello world");
    expect(result.providerTurnResolution).toEqual({
      status: "completed",
      providerOutcome: "text",
    });
    expect(result.transcript?.ui.messages).toEqual([
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            content: "hello world",
          },
        ],
      },
    ]);
  });

  test("returns non-success provider resolutions without converting them into throws", async () => {
    const { runAgentTurn } = await import("./run-agent-turn");
    resolveTurnFromProviderOutcomeMock.mockImplementationOnce(
      (_input: Record<string, unknown>) =>
        ({
          status: "failed" as const,
          providerOutcome: "empty" as const,
          errorCode: "empty_provider_response" as const,
          error: {
            message: "provider returned no content",
          },
        }) as ProviderTurnResolution,
    );

    const result = await runAgentTurn(
      {
        observer: createObserverStub(),
        abortController: new AbortController(),
        providerConfig: {
          provider: "mock",
          protocol: "mock",
          model: "mock",
          apiKey: "",
          baseUrl: "",
          enabled: true,
        },
        conversationId: null,
        threadId: "thread-2",
        promptPacket: {
          systemPrompt: "You are Buni.",
          sections: [],
          compiledExpression: null,
        },
        persistedMessages: [
          {
            id: "message-2",
            role: "user",
            content: "say nothing",
          },
        ],
        tools: [],
        providerRequestInput: {
          providerKey: "mock",
        },
        initialPersistedMessageCount: 1,
      },
      {
        chat: vi.fn((_input: Record<string, unknown>) =>
          (async function* () {})(),
        ) as unknown as typeof import("@tanstack/ai").chat,
        createRuntimeMiddleware:
          createRuntimeMiddlewareMock as unknown as typeof import("./create-runtime-middleware").createRuntimeMiddleware,
        resolveTurnFromProviderOutcome:
          resolveTurnFromProviderOutcomeMock as unknown as typeof import("../providers/provider-stream-outcome").resolveTurnFromProviderOutcome,
      },
    );

    expect(result.providerTurnResolution).toEqual({
      status: "failed",
      providerOutcome: "empty",
      errorCode: "empty_provider_response",
      error: {
        message: "provider returned no content",
      },
    });
    expect(result.assistantText).toBe("");
  });

  test("includes the final assistant text in persisted transcript after tool execution", async () => {
    const { runAgentTurn } = await import("./run-agent-turn");
    const finalAssistantText = "Mat，已发送到飞书目标 hermes0：hello。";
    const providerMessages: ModelMessage[] = [
      {
        role: "user",
        content: "send hello",
      },
      {
        role: "assistant",
        content: null,
        toolCalls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "send_feishu_message",
              arguments: '{"targetAlias":"hermes0","message":"hello"}',
            },
          },
        ],
      },
      {
        role: "tool",
        toolCallId: "tool-1",
        content: '{"delivered":true,"target":{"alias":"hermes0"},"preview":"hello"}',
      },
    ];

    createRuntimeMiddlewareMock.mockImplementationOnce((rawInput: Record<string, unknown>) => {
      const input = rawInput as {
        initialPersistedMessageCount: number;
        setProviderTurnMessages: (messages: ReadonlyArray<ModelMessage>) => void;
      };

      return [
        {
          name: "capture-provider-messages",
          onFinish: async (
            ctx: { messages: ReadonlyArray<ModelMessage> },
            _info: Record<string, unknown>,
          ) => {
            input.setProviderTurnMessages(ctx.messages.slice(input.initialPersistedMessageCount));
          },
        },
      ];
    });

    const chatWithToolAndFinalTextMock = vi.fn(
      (input: {
        middleware?: Array<{
          onFinish?: (
            ctx: { messages: ReadonlyArray<ModelMessage> },
            info: {
              finishReason?: string | null;
              duration: number;
              content: string;
              usage?: Record<string, unknown>;
            },
          ) => Promise<void> | void;
        }>;
      }) =>
        (async function* () {
          yield {
            type: "TEXT_MESSAGE_CONTENT",
            delta: finalAssistantText,
          } as StreamChunk;

          await input.middleware?.[0]?.onFinish?.(
            { messages: providerMessages },
            {
              finishReason: "stop",
              duration: 1,
              content: finalAssistantText,
            },
          );
        })(),
    );

    const result = await runAgentTurn(
      {
        observer: createObserverStub(),
        abortController: new AbortController(),
        providerConfig: {
          provider: "mock",
          protocol: "mock",
          model: "mock",
          apiKey: "",
          baseUrl: "",
          enabled: true,
        },
        conversationId: "conversation-1",
        threadId: "thread-1",
        promptPacket: {
          systemPrompt: "You are Buni.",
          sections: [],
          compiledExpression: null,
        },
        persistedMessages: [
          {
            id: "message-1",
            role: "user",
            content: "send hello",
          },
        ],
        tools: [],
        providerRequestInput: {
          providerKey: "mock",
        },
        initialPersistedMessageCount: 1,
      },
      {
        chat: chatWithToolAndFinalTextMock as unknown as typeof import("@tanstack/ai").chat,
        createRuntimeMiddleware:
          createRuntimeMiddlewareMock as unknown as typeof import("./create-runtime-middleware").createRuntimeMiddleware,
        resolveTurnFromProviderOutcome:
          resolveTurnFromProviderOutcomeMock as unknown as typeof import("../providers/provider-stream-outcome").resolveTurnFromProviderOutcome,
      },
    );

    expect(result.assistantText).toBe(finalAssistantText);
    expect(result.transcript?.ui.messages).toHaveLength(2);
    expect(result.transcript?.ui.messages[1]).toEqual({
      role: "assistant",
      parts: [
        {
          type: "text",
          content: finalAssistantText,
        },
      ],
    });
  });
});
