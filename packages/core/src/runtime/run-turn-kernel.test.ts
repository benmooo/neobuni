import type { SoulConfig, TurnContext } from "@neobuni/contracts";
import { describe, expect, test } from "vitest";

import { buildTurnContext } from "./build-turn-context";
import { runTurnKernel } from "./run-turn-kernel";

const soulConfig: SoulConfig = {
  id: "soul-config-1",
  profileId: "profile-1",
  version: 1,
  createdAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
  name: "Buni",
  temperament: {
    warmth: 0.9,
    playfulness: 0.4,
    directness: 0.35,
    proactiveness: 0.6,
    emotionalIntensity: 0.45,
    stability: 0.92,
    soothingTendency: 0.88,
    pushTendency: 0.42,
  },
  relationship: {
    role: "gentle_companion",
    relationshipFlavor: "light_romantic",
    closenessLevel: "medium",
    initiativeLevel: "medium",
    initiativeStyle: "subtle",
    interruptionPolicy: "minimal_by_default",
    canGuardWhenAbnormal: true,
    canPushWhenUserIsReady: true,
  },
  values: {
    immutableCore: ["respect_boundary"],
    primary: ["respect_boundary", "emotional_safety", "continuity"],
    antiValues: ["manipulation", "pressure_for_connection"],
  },
  drives: {
    priorityOrder: [
      "respect",
      "comfort",
      "continuity",
      "protection",
      "progress",
      "connection",
    ],
    weights: {
      respect: 1,
      comfort: 0.92,
      continuity: 0.84,
      protection: 0.76,
      progress: 0.68,
      connection: 0.6,
    },
  },
  expression: {
    tone: "warm_calm_natural",
    pacing: "soft_and_clear",
    verbosity: "medium",
    intimacy: {
      default: "subtle",
      maxWithoutUserSignal: "moderate",
    },
    addressing: {
      mode: "preferred_name",
      preferredName: "宝宝",
    },
  },
};

describe("runtime kernel", () => {
  test("buildTurnContext normalizes text and memory signals", () => {
    const turnContext = buildTurnContext({
      turnInput: {
        profileId: "profile-1",
        conversationId: "conversation-1",
        latestUserText: "你还记得我上次说过的健身计划吗？",
        timezone: "Asia/Shanghai",
        now: "2026-05-02T00:00:00.000Z",
      },
      recentUserTexts: [
        "你还记得我上次说过的健身计划吗？",
        "我最近一直想重新开始锻炼。",
      ],
      unresolvedSlices: [
        {
          id: "memory-task-1",
          content: "用户想重新开始每周三次健身，还没定具体安排。",
          type: "task",
          keywords: ["健身", "安排"],
          unresolved: true,
          createdAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      recentSlices: [],
      signalContext: {
        schedules: [
          {
            id: "schedule-1",
            type: "reminder",
            title: "明早健身",
            triggerAt: "2026-05-02T01:00:00.000Z",
            timezone: "Asia/Shanghai",
            status: "active",
          },
        ],
        recentRuntimeTurns: [
          {
            id: "turn-1",
            status: "completed",
            protectiveLevel: 1,
            primaryStance: "comforting",
            memoryRecallStrategy: "pre_recall",
            toolCallCount: 0,
            startedAt: "2026-05-01T22:00:00.000Z",
          },
          {
            id: "turn-2",
            status: "completed",
            protectiveLevel: 1,
            primaryStance: "protective",
            memoryRecallStrategy: "pre_recall",
            toolCallCount: 0,
            startedAt: "2026-05-01T23:00:00.000Z",
          },
        ],
        environment: {
          effectiveTimezone: "Asia/Shanghai",
        },
      },
      previousRuntimeState: null,
    });

    expect(
      turnContext.signals.textSignals.some(
        (signal) => signal.kind === "explicit_memory_reference"
      )
    ).toBe(true);
    expect(
      turnContext.signals.memorySignals.some(
        (signal) => signal.kind === "unresolved_overlap"
      )
    ).toBe(true);
    expect(
      turnContext.signals.scheduleSignals.some(
        (signal) => signal.kind === "time_pressure"
      )
    ).toBe(true);
    expect(
      turnContext.signals.behavioralSignals.some(
        (signal) => signal.kind === "negative_trend"
      )
    ).toBe(true);
    expect(
      turnContext.signals.environmentalSignals.some(
        (signal) => signal.kind === "time_context"
      )
    ).toBe(true);
  });

  test("runTurnKernel builds planning-oriented working memory and response spec", () => {
    const turnContext: TurnContext = buildTurnContext({
      turnInput: {
        profileId: "profile-1",
        conversationId: "conversation-1",
        latestUserText: "帮我安排一下明天的健身计划，并记得后面继续提醒我。",
        timezone: "Asia/Shanghai",
        now: "2026-05-02T00:00:00.000Z",
      },
      recentUserTexts: ["帮我安排一下明天的健身计划，并记得后面继续提醒我。"],
      unresolvedSlices: [],
      recentSlices: [],
      signalContext: {
        schedules: [],
        recentRuntimeTurns: [],
        environment: {
          effectiveTimezone: "Asia/Shanghai",
        },
      },
      previousRuntimeState: {
        protectiveLevel: 0,
        primaryStance: "companion",
        memoryRecallStrategy: "skip",
      },
    });

    const result = runTurnKernel({
      turnContext,
      soulConfig,
      agentConfig: {
        aiName: "Buni",
        userName: "Aka",
        userPersona: "builder",
      },
      retrievedEvidence: {
        retrievalReason: "task_followup",
        temporalMemories: [
          {
            id: "memory-task-1",
            content: "用户想开始健身计划，并希望后续能被提醒坚持。",
            type: "task",
            keywords: ["健身", "计划", "提醒"],
            importance: 0.82,
            similarity: 0.77,
            sourceTier: "vector_hit",
            unresolved: true,
          },
        ],
        graphEvidence: [],
        knowledgeEvidence: [],
      },
    });

    expect(result.workingMemory.focus).toBe("planning");
    expect(result.workingMemory.activeTasks).toHaveLength(1);
    expect(result.workingMemory.openLoops).toHaveLength(1);
    expect(result.responseSpec.toolPolicy).toBe("prefer");
    expect(result.responseSpec.stance).toBe("mobilizing");
    expect(result.textExpression.openingMode).toBe("direct_answer_first");
    expect(result.textExpression.toolUseMode).toBe("proactively_offer");
    expect(result.expressionSet.voice.cadenceMode).toBe("clear_brisk");
    expect(result.expressionSet.ui.messageFrame).toBe("plan_outline");
    expect(result.textExpressionContext.workingMemoryFocus).toBe("planning");
    expect(result.expressionSignalDrivers.length).toBeGreaterThan(0);
    expect(result.systemPrompt.includes("Action candidates:")).toBe(true);
    expect(result.systemPrompt.includes("Text expression plan:")).toBe(true);
    expect(result.systemPrompt.includes('Address the user as "宝宝"')).toBe(
      true
    );
    expect(result.systemPrompt.includes("Default intimacy is subtle.")).toBe(
      true
    );
    expect(
      result.promptPacket.sections.some(
        (section) => section.key === "text_expression"
      )
    ).toBe(true);
  });

  test("signal-driven distress shifts soul and working memory toward support even without recalled evidence", () => {
    const turnContext: TurnContext = buildTurnContext({
      turnInput: {
        profileId: "profile-1",
        conversationId: "conversation-1",
        latestUserText: "算了，我不想说了。",
        timezone: "Asia/Shanghai",
        now: "2026-05-02T16:30:00.000Z",
      },
      recentUserTexts: [
        "我最近真的很焦虑。",
        "有点崩溃了，不知道怎么办。",
        "算了，我不想说了。",
      ],
      unresolvedSlices: [],
      recentSlices: [],
      signalContext: {
        schedules: [],
        recentRuntimeTurns: [
          {
            id: "turn-1",
            status: "completed",
            protectiveLevel: 2,
            primaryStance: "protective",
            memoryRecallStrategy: "pre_recall",
            toolCallCount: 0,
            startedAt: "2026-05-01T22:00:00.000Z",
          },
          {
            id: "turn-2",
            status: "completed",
            protectiveLevel: 1,
            primaryStance: "comforting",
            memoryRecallStrategy: "pre_recall",
            toolCallCount: 0,
            startedAt: "2026-05-01T23:00:00.000Z",
          },
        ],
        environment: {
          effectiveTimezone: "Asia/Shanghai",
        },
      },
      previousRuntimeState: {
        protectiveLevel: 1,
        primaryStance: "comforting",
        memoryRecallStrategy: "pre_recall",
      },
    });

    const result = runTurnKernel({
      turnContext,
      soulConfig,
      agentConfig: {
        aiName: "Buni",
        userName: "Aka",
        userPersona: "builder",
      },
      retrievedEvidence: {
        retrievalReason: "hybrid",
        temporalMemories: [],
        graphEvidence: [],
        knowledgeEvidence: [],
      },
    });

    expect(result.workingMemory.focus).toBe("support");
    expect(
      result.workingMemory.constraints.some(
        (item) => item.kind === "emotional_safety"
      )
    ).toBe(true);
    expect(
      result.workingMemory.actionCandidates.some(
        (item) => item.kind === "offer_supportive_followup"
      )
    ).toBe(true);
    expect(result.soulRuntime.protectiveDecision.level).toBeGreaterThanOrEqual(
      1
    );
    expect(["protective", "comforting"]).toContain(result.responseSpec.stance);
    expect(result.textExpression.openingMode).toBe("grounding_first");
    expect(result.textExpression.followupMode).toBe("check_state_first");
    expect(result.expressionSet.voice.repairMode).toBe("gentle_reassurance");
    expect(result.expressionSet.ui.alertStyle).toBe("protective_notice");
  });
});
