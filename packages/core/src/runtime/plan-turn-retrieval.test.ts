import type { TurnContext } from "@neobuni/contracts";
import { describe, expect, test } from "vitest";

import { buildTurnContext } from "./build-turn-context";
import { planTurnRetrieval } from "./plan-turn-retrieval";

const buildBaseTurnContext = (input: {
  latestUserText: string;
  recentUserTexts: string[];
  unresolvedSlices?: TurnContext["unresolvedSlices"];
  recentSlices?: TurnContext["recentSlices"];
}): TurnContext =>
  buildTurnContext({
    turnInput: {
      profileId: "profile-1",
      conversationId: "conversation-1",
      latestUserText: input.latestUserText,
      timezone: "Asia/Shanghai",
      now: "2026-05-02T00:00:00.000Z",
    },
    recentUserTexts: input.recentUserTexts,
    unresolvedSlices: input.unresolvedSlices ?? [],
    recentSlices: input.recentSlices ?? [],
    signalContext: {
      schedules: [],
      recentRuntimeTurns: [],
      environment: {
        effectiveTimezone: "Asia/Shanghai",
      },
    },
    previousRuntimeState: null,
  });

describe("planTurnRetrieval", () => {
  test("prefetches temporal but skips graph for a personal task follow-up without an explicit relationship query", () => {
    const turnContext = buildBaseTurnContext({
      latestUserText: "你还记得我上次说过的健身计划吗？",
      recentUserTexts: [
        "你还记得我上次说过的健身计划吗？",
        "我最近一直想重新开始锻炼。",
      ],
      unresolvedSlices: [
        {
          id: "memory-task-1",
          content: "用户想重新开始每周三次健身，还没定具体安排。",
          type: "task",
          keywords: ["健身", "安排", "计划"],
          unresolved: true,
          createdAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      recentSlices: [
        {
          id: "memory-recent-1",
          content: "用户提到最近想开始运动。",
          type: "event",
          keywords: ["运动", "健身"],
          unresolved: false,
          createdAt: "2026-05-01T12:00:00.000Z",
        },
      ],
    });

    const result = planTurnRetrieval(turnContext);

    expect(result.retrievalPlan.intent).toBe("personal_history");
    expect(result.retrievalPlan.activation.temporal.mode).toBe("prefetch");
    expect(result.retrievalPlan.activation.graph.mode).toBe("skip");
    expect(result.retrievalPlan.activation.knowledge.mode).toBe("skip");
    expect(result.retrievalPlan.queries.temporal).not.toBeNull();
    expect(result.retrievalPlan.queries.graph).toBeNull();
    expect(result.retrievalPlan.queries.knowledge).toBeNull();
  });

  test("prefetches graph only for an explicit relationship lookup", () => {
    const turnContext = buildBaseTurnContext({
      latestUserText: "OneWork 和 Buni 的 account 关系是什么？",
      recentUserTexts: ["OneWork 和 Buni 的 account 关系是什么？"],
    });

    const result = planTurnRetrieval(turnContext);

    expect(result.retrievalPlan.intent).toBe("relationship_state");
    expect(result.retrievalPlan.activation.graph).toMatchObject({
      mode: "prefetch",
      reasons: ["relationship_state_need", "relationship_lookup"],
    });
    expect(result.retrievalPlan.queries.graph).not.toBeNull();
  });

  test("prefetches knowledge without forcing temporal recall for world knowledge lookup", () => {
    const turnContext = buildBaseTurnContext({
      latestUserText: "什么是 BRDF，和 PBR 有什么区别？",
      recentUserTexts: ["什么是 BRDF，和 PBR 有什么区别？"],
    });

    const result = planTurnRetrieval(turnContext);

    expect(result.retrievalPlan.intent).toBe("world_knowledge");
    expect(result.retrievalPlan.activation.knowledge.mode).toBe("prefetch");
    expect(result.retrievalPlan.activation.temporal.mode).toBe("skip");
    expect(result.retrievalPlan.queries.knowledge).not.toBeNull();
    expect(result.retrievalPlan.queries.temporal).toBeNull();
  });
});
