import type {
  StudyCheckResult,
  StudyPlanNode,
  StudySession,
} from "@neobuni/contracts";
import { describe, expect, test, vi } from "vitest";

import {
  resolveStudyQuizTarget,
  type StudyQuizSnapshot,
} from "./study-quiz-shared";

const lesson: StudyPlanNode = {
  checkSpecs: [
    {
      answerKey: "key-1",
      id: "c1",
      kind: "recall",
      prompt: "Q1",
      rubric: "R1",
    },
    { answerKey: null, id: "c2", kind: "case", prompt: "Q2", rubric: "R2" },
    { answerKey: null, id: "c3", kind: "case", prompt: "Q3", rubric: "R3" },
  ],
  estimatedMinutes: 45,
  howText: "how",
  id: "node-1",
  kind: "lesson",
  objective: "objective",
  order: 1,
  paper: "comprehensive",
  parentId: null,
  planId: "plan-1",
  prerequisites: [],
  resources: [],
  syllabusRefs: [],
  title: "架构风格",
  weight: 0.1,
  whatText: "what",
};

const session: StudySession = {
  actualMinutes: null,
  completedAt: null,
  createdAt: "2026-10-25T00:00:00.000Z",
  durationMinutes: 45,
  goalId: "goal-1",
  id: "session-1",
  notes: null,
  planNodeId: "node-1",
  profileId: "profile-1",
  rescheduledFrom: null,
  scheduledFor: "2026-10-27T20:00",
  startedAt: null,
  status: "planned",
  timezone: "Asia/Shanghai",
  updatedAt: "2026-10-25T00:00:00.000Z",
};

const snapshot = (
  overrides: Partial<StudyQuizSnapshot> = {}
): StudyQuizSnapshot => ({
  goal: { id: "goal-1" },
  localDate: "2026-10-27",
  node: lesson,
  plan: { nodes: [lesson] },
  session,
  sessions: [session],
  ...overrides,
});

const checkResult: StudyCheckResult = {
  checkIds: ["check-1", "check-2", "check-3"],
  feedback: "Good",
  items: [
    {
      feedback: "Good",
      missingPoints: [],
      passed: true,
      promptId: "c1",
      score: 0.8,
    },
  ],
  mastery: 0.8,
  maxScore: 1,
  needsReteach: false,
  nextReviewAt: "2026-10-30",
  passed: true,
  score: 0.8,
};

const createToolContext = () => ({
  abortSignal: new AbortController().signal,
  clientTimezone: "Asia/Shanghai",
  conversationId: "conversation-1",
  defaultTimezone: "Asia/Shanghai",
  embeddingConfig: null,
  profileId: "profile-1",
  profileTimezone: "Asia/Shanghai",
  referenceNow: "2026-10-27T12:00:00.000Z",
  turnId: "turn-1",
});

const createAppendEvent = () =>
  vi.fn(async (profileId: string, type: string) => ({
    createdAt: "2026-10-27T00:00:00.000Z",
    id: "event-1",
    payload: {},
    profileId,
    type,
  }));

const runTool = async <TArgs, TResult>(
  executeFn: ((args: TArgs) => TResult | Promise<TResult>) | undefined,
  args: TArgs
): Promise<TResult> => {
  if (!executeFn) {
    throw new Error("Expected tool.execute.");
  }
  return await executeFn(args);
};

describe("resolveStudyQuizTarget", () => {
  test("is unavailable without an active goal", () => {
    expect(resolveStudyQuizTarget(null)).toEqual({
      lesson: null,
      reason: "no_active_goal",
      session: null,
    });
  });

  test("ignores a session scheduled for a future day", () => {
    const future = { ...session, scheduledFor: "2026-10-28T20:00" };
    expect(
      resolveStudyQuizTarget(
        snapshot({ node: null, session: future, sessions: [future] })
      ).reason
    ).toBe("no_session_due");
  });

  test("re-tests a lesson already completed today", () => {
    const completed = { ...session, status: "completed" as const };
    const target = resolveStudyQuizTarget(
      snapshot({ node: null, session: null, sessions: [completed] })
    );

    expect(target.lesson?.id).toBe("node-1");
    expect(target.session?.id).toBe("session-1");
  });

  test("treats an overdue session as actionable", () => {
    expect(
      resolveStudyQuizTarget(
        snapshot({ session: { ...session, scheduledFor: "2026-10-24T20:00" } })
      ).lesson?.id
    ).toBe("node-1");
  });

  test("reports a lesson without checks", () => {
    expect(
      resolveStudyQuizTarget(snapshot({ node: { ...lesson, checkSpecs: [] } }))
        .reason
    ).toBe("no_checks");
  });

  test("prefers refined checks over the deterministic ones", () => {
    const refined = {
      ...lesson,
      enrichment: {
        checkSpecs: [
          {
            answerKey: "key-1",
            id: "r1",
            kind: "recall" as const,
            prompt: "Refined Q1",
            rubric: "R1",
          },
          {
            answerKey: null,
            id: "r2",
            kind: "case" as const,
            prompt: "Refined Q2",
            rubric: "R2",
          },
          {
            answerKey: null,
            id: "r3",
            kind: "case" as const,
            prompt: "Refined Q3",
            rubric: "R3",
          },
        ],
        enrichedAt: "2026-10-26T00:00:00.000Z",
        howText: "how",
        objective: "refined objective",
        resources: [],
        source: "llm" as const,
        whatText: "what",
      },
    };

    expect(
      resolveStudyQuizTarget(snapshot({ node: refined })).lesson?.enrichment
        ?.checkSpecs[0]?.id
    ).toBe("r1");
  });
});

describe("study_quiz", () => {
  test("returns today's questions without leaking rubrics or answer keys", async () => {
    const { createStudyQuizTool } = await import("./study-quiz");
    const appendEvent = createAppendEvent();
    const tool = createStudyQuizTool(createToolContext(), {
      appendEvent,
      loadStudySnapshot: async () => snapshot(),
    });

    const result = await runTool(tool.execute, {});

    expect(result).toEqual({
      available: true,
      goalId: "goal-1",
      lessonTitle: "架构风格",
      objective: "objective",
      questions: [
        { id: "c1", kind: "recall", prompt: "Q1" },
        { id: "c2", kind: "case", prompt: "Q2" },
        { id: "c3", kind: "case", prompt: "Q3" },
      ],
      reason: null,
    });
    expect(JSON.stringify(result)).not.toContain("R1");
    expect(JSON.stringify(result)).not.toContain("key-1");
    expect(appendEvent).toHaveBeenCalledTimes(1);
  });

  test("explains why no quiz is available", async () => {
    const { createStudyQuizTool } = await import("./study-quiz");
    const tool = createStudyQuizTool(createToolContext(), {
      appendEvent: createAppendEvent(),
      loadStudySnapshot: async () => null,
    });

    const result = await runTool(tool.execute, {});

    expect(result).toEqual({
      available: false,
      goalId: null,
      lessonTitle: null,
      objective: null,
      questions: [],
      reason: "no_active_goal",
    });
  });
});

describe("study_quiz_submit", () => {
  const answers = [
    { answer: "A1", promptId: "c1" },
    { answer: "A2", promptId: "c2" },
    { answer: "A3", promptId: "c3" },
  ];

  test("grades through the shared check service and reports the result", async () => {
    const { createStudyQuizSubmitTool } = await import("./study-quiz-submit");
    const appendEvent = createAppendEvent();
    const submitStudyCheck = vi.fn(async () => checkResult);
    const tool = createStudyQuizSubmitTool(createToolContext(), {
      appendEvent,
      loadStudySnapshot: async () => snapshot(),
      submitStudyCheck,
    });

    const result = await runTool(tool.execute, { answers });

    expect(submitStudyCheck).toHaveBeenCalledWith({
      answers,
      profileId: "profile-1",
      sessionId: "session-1",
    });
    expect(result).toEqual({
      reason: null,
      result: checkResult,
      submitted: true,
    });
    expect(appendEvent).toHaveBeenCalledTimes(1);
  });

  test("rejects prompt ids that do not belong to today's lesson", async () => {
    const { createStudyQuizSubmitTool } = await import("./study-quiz-submit");
    const submitStudyCheck = vi.fn(async () => checkResult);
    const tool = createStudyQuizSubmitTool(createToolContext(), {
      appendEvent: createAppendEvent(),
      loadStudySnapshot: async () => snapshot(),
      submitStudyCheck,
    });

    const result = await runTool(tool.execute, {
      answers: [{ answer: "A", promptId: "made-up" }],
    });

    expect(result).toEqual({
      reason: "unknown_prompt",
      result: null,
      submitted: false,
    });
    expect(submitStudyCheck).not.toHaveBeenCalled();
  });

  test("does not grade a lesson that is not due yet", async () => {
    const { createStudyQuizSubmitTool } = await import("./study-quiz-submit");
    const submitStudyCheck = vi.fn(async () => checkResult);
    const tool = createStudyQuizSubmitTool(createToolContext(), {
      appendEvent: createAppendEvent(),
      loadStudySnapshot: async () =>
        snapshot({ session: { ...session, scheduledFor: "2026-10-29T20:00" } }),
      submitStudyCheck,
    });

    const result = await runTool(tool.execute, { answers });

    expect(result).toEqual({
      reason: "no_session_due",
      result: null,
      submitted: false,
    });
    expect(submitStudyCheck).not.toHaveBeenCalled();
  });
});
