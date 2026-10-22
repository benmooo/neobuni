import { beforeEach, describe, expect, test, vi } from "vitest";

const repoMocks = vi.hoisted(() => ({
  getMemoryEmbeddingProviderConfig: vi.fn(),
  getMemoryReasoningProviderConfig: vi.fn(),
  listUnresolvedMemories: vi.fn(),
  listRecentMemories: vi.fn(),
  listGoals: vi.fn(),
  listCommitments: vi.fn(),
  listRuntimeTurnsByConversation: vi.fn(),
  getRecentUserTexts: vi.fn(),
}));

vi.mock("@neobuni/core", () => ({
  buildTurnContext: (input: Record<string, unknown>) => ({
    input: input.turnInput,
    recentUserTexts: input.recentUserTexts,
    unresolvedSlices: input.unresolvedSlices,
    recentSlices: input.recentSlices,
    signalContext: input.signalContext,
    previousRuntimeState: input.previousRuntimeState,
    signals: {
      textSignals: [],
      memorySignals: [],
      scheduleSignals: [],
      behavioralSignals: [],
      environmentalSignals: [],
    },
  }),
  getRecentUserTexts: repoMocks.getRecentUserTexts,
}));

vi.mock("@neobuni/db", async () => {
  const { Effect } = await import("effect");
  const deferred =
    <TArgs extends unknown[]>(mock: (...args: TArgs) => unknown) =>
    (...args: TArgs) =>
      Effect.promise(async () => await mock(...args));

  return {
    runRepo: Effect.runPromise,
    getAgentConfig: () => Effect.succeed({ id: "agent-1" }),
    getProviderConfig: () =>
      Effect.succeed({
        provider: "openai",
        model: "gpt-4.1-mini",
      }),
    getSoulConfig: () => Effect.succeed({ id: "soul-1" }),
    getProfile: () =>
      Effect.succeed({
        id: "profile-1",
        timezone: "Asia/Shanghai",
      }),
    listSchedules: () => Effect.succeed([]),
    listMessages: () => Effect.succeed([]),
    listGoals: deferred(repoMocks.listGoals),
    listCommitments: deferred(repoMocks.listCommitments),
    listUnresolvedMemories: deferred(repoMocks.listUnresolvedMemories),
    listRecentMemories: deferred(repoMocks.listRecentMemories),
    getMemoryEmbeddingProviderConfig: deferred(
      repoMocks.getMemoryEmbeddingProviderConfig
    ),
    getMemoryReasoningProviderConfig: deferred(
      repoMocks.getMemoryReasoningProviderConfig
    ),
    listRuntimeTurnsByConversation: deferred(
      repoMocks.listRuntimeTurnsByConversation
    ),
    updateProfile: () => Effect.succeed(null),
  };
});

const { TURN_CONTEXT_LIMITS, loadTurnContext } = await import(
  "./load-turn-context"
);
const { getSurfacePolicy } = await import("./surface-policy");

describe("loadTurnContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMocks.getMemoryEmbeddingProviderConfig.mockResolvedValue({
      enabled: true,
      protocol: "openai",
      apiKey: "embedding-key",
      model: "text-embedding-3-small",
      baseUrl: "",
      metadata: {},
    });
    repoMocks.getMemoryReasoningProviderConfig.mockResolvedValue({
      enabled: true,
      protocol: "openai",
      apiKey: "reasoning-key",
      model: "gpt-4.1-mini",
      baseUrl: "",
      metadata: {},
    });
    repoMocks.listUnresolvedMemories.mockResolvedValue([]);
    repoMocks.listRecentMemories.mockResolvedValue([]);
    repoMocks.listGoals.mockResolvedValue([]);
    repoMocks.listCommitments.mockResolvedValue([]);
    repoMocks.listRuntimeTurnsByConversation.mockResolvedValue([]);
    repoMocks.getRecentUserTexts.mockReturnValue([]);
  });

  test("exposes named limits for turn context loading", () => {
    expect(TURN_CONTEXT_LIMITS).toEqual({
      unresolvedMemoryCount: 4,
      recentMemoryWindowDays: 3,
      recentMemoryCount: 6,
      recentUserTextCount: 4,
      recentRuntimeTurnCount: 4,
    });
  });

  test("loads memory provider configs for private chat surfaces", async () => {
    repoMocks.listRuntimeTurnsByConversation.mockResolvedValue([
      {
        id: "turn-current",
      },
      {
        id: "turn-1",
        status: "completed",
        protectiveLevel: "balanced",
        primaryStance: "neutral",
        memoryRecallStrategy: "prefetch",
        toolCallCount: 1,
        startedAt: "2026-07-01T01:00:00.000Z",
      },
      {
        id: "turn-2",
        status: "completed",
        protectiveLevel: "balanced",
        primaryStance: "neutral",
        memoryRecallStrategy: "prefetch",
        toolCallCount: 1,
        startedAt: "2026-07-01T01:01:00.000Z",
      },
      {
        id: "turn-3",
        status: "completed",
        protectiveLevel: "balanced",
        primaryStance: "neutral",
        memoryRecallStrategy: "prefetch",
        toolCallCount: 1,
        startedAt: "2026-07-01T01:02:00.000Z",
      },
      {
        id: "turn-4",
        status: "completed",
        protectiveLevel: "balanced",
        primaryStance: "neutral",
        memoryRecallStrategy: "prefetch",
        toolCallCount: 1,
        startedAt: "2026-07-01T01:03:00.000Z",
      },
      {
        id: "turn-5",
        status: "completed",
        protectiveLevel: "balanced",
        primaryStance: "neutral",
        memoryRecallStrategy: "prefetch",
        toolCallCount: 1,
        startedAt: "2026-07-01T01:04:00.000Z",
      },
    ]);
    const result = await loadTurnContext({
      profileId: "profile-1",
      conversationId: "conversation-1",
      latestUserText: "hello",
      clientTimezone: null,
      currentTurnId: "turn-current",
      surfacePolicy: getSurfacePolicy("chat_private"),
    });

    expect(repoMocks.getMemoryEmbeddingProviderConfig).toHaveBeenCalledTimes(1);
    expect(repoMocks.listGoals).toHaveBeenCalledWith("profile-1", "active");
    expect(repoMocks.listCommitments).toHaveBeenCalledWith("profile-1");
    expect(repoMocks.getMemoryReasoningProviderConfig).toHaveBeenCalledTimes(1);
    expect(repoMocks.listUnresolvedMemories).toHaveBeenCalledTimes(1);
    expect(repoMocks.listRecentMemories).toHaveBeenCalledTimes(1);
    expect(repoMocks.listUnresolvedMemories).toHaveBeenCalledWith(
      "profile-1",
      TURN_CONTEXT_LIMITS.unresolvedMemoryCount
    );
    expect(repoMocks.listRecentMemories).toHaveBeenCalledWith(
      "profile-1",
      TURN_CONTEXT_LIMITS.recentMemoryWindowDays,
      TURN_CONTEXT_LIMITS.recentMemoryCount
    );
    expect(repoMocks.getRecentUserTexts).toHaveBeenCalledWith(
      [],
      TURN_CONTEXT_LIMITS.recentUserTextCount
    );
    expect(result.turnContext.signalContext.recentRuntimeTurns).toHaveLength(
      TURN_CONTEXT_LIMITS.recentRuntimeTurnCount
    );
    expect(
      result.turnContext.signalContext.recentRuntimeTurns.map(
        (turn: { id: string }) => turn.id
      )
    ).toEqual(["turn-1", "turn-2", "turn-3", "turn-4"]);
    expect(result.embeddingConfig).toEqual({
      apiKey: "embedding-key",
      model: "text-embedding-3-small",
      baseUrl: undefined,
      dimensions: undefined,
    });
    expect(result.reasoningConfig).toEqual({
      apiKey: "reasoning-key",
      model: "gpt-4.1-mini",
      baseUrl: undefined,
      dimensions: undefined,
    });
  });

  test("loads explicit goal context even when private memory recall is disabled", async () => {
    repoMocks.listGoals.mockResolvedValue([
      {
        id: "goal-1",
        title: "Ship",
        desiredOutcome: "Done",
        horizon: "project",
      },
    ] as never);
    repoMocks.listCommitments.mockResolvedValue([
      { goalId: "goal-1", title: "Review", status: "open", dueAt: null },
    ] as never);
    const result = await loadTurnContext({
      profileId: "profile-1",
      conversationId: "conversation-1",
      latestUserText: "hello",
      clientTimezone: null,
      currentTurnId: "turn-1",
      surfacePolicy: {
        ...getSurfacePolicy("chat_private"),
        allowMemoryRecall: false,
      },
    });
    expect(result.goalContext).toEqual({
      activeGoals: [
        {
          id: "goal-1",
          title: "Ship",
          desiredOutcome: "Done",
          horizon: "project",
        },
      ],
      openCommitments: [
        { goalId: "goal-1", title: "Review", status: "open", dueAt: null },
      ],
    });
  });

  test("skips memory provider configs and goal context for public-safe chat surfaces", async () => {
    const result = await loadTurnContext({
      profileId: "profile-1",
      conversationId: "conversation-1",
      latestUserText: "hello",
      clientTimezone: null,
      currentTurnId: "turn-1",
      surfacePolicy: getSurfacePolicy("chat_public_safe"),
    });

    expect(repoMocks.getMemoryEmbeddingProviderConfig).toHaveBeenCalledTimes(0);
    expect(repoMocks.getMemoryReasoningProviderConfig).toHaveBeenCalledTimes(0);
    expect(repoMocks.listUnresolvedMemories).toHaveBeenCalledTimes(0);
    expect(repoMocks.listRecentMemories).toHaveBeenCalledTimes(0);
    expect(repoMocks.listGoals).toHaveBeenCalledTimes(0);
    expect(repoMocks.listCommitments).toHaveBeenCalledTimes(0);
    expect(result.embeddingConfig).toBeNull();
    expect(result.reasoningConfig).toBeNull();
  });
});
