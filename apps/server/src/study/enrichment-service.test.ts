import type { StudyPlanNode } from "@neobuni/contracts";
import { Effect } from "effect";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createChatCompletion: vi.fn(),
  getMemoryReasoningProviderConfig: vi.fn(),
  getProviderConfig: vi.fn(),
}));

vi.mock("@neobuni/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@neobuni/db")>();
  return {
    ...actual,
    getMemoryReasoningProviderConfig: mocks.getMemoryReasoningProviderConfig,
    getProviderConfig: mocks.getProviderConfig,
  };
});

vi.mock("../providers/openai-compatible-client", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../providers/openai-compatible-client")
    >();
  return { ...actual, createChatCompletion: mocks.createChatCompletion };
});

const { enrichStudyLesson } = await import("./enrichment-service");

const providerConfig = {
  id: "config-1",
  profileId: "profile-1",
  slot: "memory_reasoning",
  provider: "openai",
  protocol: "openai",
  model: "test-model",
  apiKey: "test-key",
  baseUrl: "https://example.com/v1",
  enabled: true,
  metadata: {},
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
};

const node: StudyPlanNode = {
  id: "plan-1:lesson.topic.distributed-consistency.1",
  planId: "plan-1",
  parentId: "plan-1:topic.distributed-consistency",
  kind: "lesson",
  order: 1,
  title: "分布式一致性实践 · 概念与框架",
  objective: "能解释并应用 Saga、Outbox、幂等和补偿",
  whatText: "分布式一致性实践：Saga、Outbox、幂等和补偿",
  howText: "画一个下单-扣库存-支付流程",
  resources: [],
  estimatedMinutes: 40,
  weight: 0.1,
  paper: "case",
  syllabusRefs: ["topic.distributed-consistency"],
  prerequisites: [],
  checkSpecs: [
    {
      id: "c1",
      kind: "recall",
      prompt: "Recall",
      rubric: null,
      answerKey: null,
    },
    { id: "c2", kind: "case", prompt: "Apply", rubric: null, answerKey: null },
    {
      id: "c3",
      kind: "case",
      prompt: "Transfer",
      rubric: null,
      answerKey: null,
    },
  ],
};

const validResponse = {
  checkSpecs: [
    {
      answerKey: "Saga uses local transactions and compensations.",
      kind: "recall",
      prompt: "Saga 与 2PC 的区别是什么？",
      rubric: "答出本地事务与补偿",
    },
    {
      answerKey: null,
      kind: "case",
      prompt: "支付超时后如何补偿？",
      rubric: "答出补偿顺序与幂等",
    },
    {
      answerKey: null,
      kind: "case",
      prompt: "加入优惠券服务后如何调整？",
      rubric: "答出新增补偿步骤",
    },
  ],
  howText: "10 分钟读 Saga；15 分钟画三条分支；10 分钟做真题；5 分钟复述。",
  objective: "能画出下单链路的 Saga 并说明补偿失败兜底。",
  resources: ["教材：分布式事务"],
  whatText: "Saga 编排方式；补偿配对；幂等键。",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMemoryReasoningProviderConfig.mockReturnValue(
    Effect.succeed(providerConfig)
  );
  mocks.getProviderConfig.mockReturnValue(Effect.succeed(null));
});

describe("enrichStudyLesson", () => {
  test("returns validated enriched content with stable check ids", async () => {
    mocks.createChatCompletion.mockResolvedValue(JSON.stringify(validResponse));

    const result = await enrichStudyLesson({
      desiredOutcome: "Pass the exam",
      goalTitle: "系统架构设计师",
      node,
      profileId: "profile-1",
    });

    if (result.status !== "ok") {
      throw new Error(`expected ok, received ${result.status}`);
    }

    expect(result.enrichment).toMatchObject({
      howText: validResponse.howText,
      objective: validResponse.objective,
      source: "llm",
      whatText: validResponse.whatText,
    });
    expect(result.enrichment.checkSpecs).toHaveLength(3);
    expect(result.enrichment.checkSpecs[0]).toMatchObject({
      id: `${node.id}.enriched.1`,
      kind: "recall",
    });
    expect(result.enrichment.checkSpecs[1]?.id).toBe(`${node.id}.enriched.2`);
  });

  test("reports missing_provider when no reasoning provider is configured", async () => {
    mocks.getMemoryReasoningProviderConfig.mockReturnValue(
      Effect.succeed(null)
    );

    const result = await enrichStudyLesson({
      desiredOutcome: "Pass the exam",
      goalTitle: "系统架构设计师",
      node,
      profileId: "profile-1",
    });

    expect(result).toEqual({ status: "missing_provider" });
  });

  test("reports provider_error when the model returns invalid JSON", async () => {
    mocks.createChatCompletion.mockResolvedValue("not json");

    const result = await enrichStudyLesson({
      desiredOutcome: "Pass the exam",
      goalTitle: "系统架构设计师",
      node,
      profileId: "profile-1",
    });

    expect(result.status).toBe("provider_error");
  });

  test("surfaces the provider failure message instead of hiding it", async () => {
    mocks.createChatCompletion.mockRejectedValue(
      new Error(
        "OpenAI-compatible request failed (402): Insufficient account funds"
      )
    );

    const result = await enrichStudyLesson({
      desiredOutcome: "Pass the exam",
      goalTitle: "系统架构设计师",
      node,
      profileId: "profile-1",
    });

    expect(result).toEqual({
      status: "provider_error",
      message:
        "OpenAI-compatible request failed (402): Insufficient account funds",
    });
  });

  test("passes the lesson and goal to the provider", async () => {
    mocks.createChatCompletion.mockResolvedValue(JSON.stringify(validResponse));

    await enrichStudyLesson({
      desiredOutcome: "Pass the exam",
      goalTitle: "系统架构设计师",
      node,
      profileId: "profile-1",
    });

    const userMessage = mocks.createChatCompletion.mock.calls[0]?.[1]?.[1];
    expect(userMessage?.content).toContain(node.title);
    expect(userMessage?.content).toContain("系统架构设计师");
  });
});
