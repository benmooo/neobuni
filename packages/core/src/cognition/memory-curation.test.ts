import { describe, expect, test } from "vitest";

import {
  detectMemoryConflict,
  resolveChatMemoryDraft,
} from "./memory-curation";

describe("resolveChatMemoryDraft", () => {
  test("derives task defaults and expands keywords from content", () => {
    const draft = resolveChatMemoryDraft({
      content: "Follow up with Alice about the onboarding checklist tomorrow.",
      type: "task",
    });

    expect(draft.unresolved).toBe(true);
    expect(draft.memoryClass).toBe("task");
    expect(draft.status).toBe("active");
    expect(draft.importance).toBeGreaterThan(0.7);
    expect(draft.keywords.length).toBeGreaterThan(0);
  });
});

describe("detectMemoryConflict", () => {
  test("returns exact duplicate memory when content already exists", () => {
    const draft = resolveChatMemoryDraft({
      content: "User prefers green tea over coffee.",
      type: "preference",
    });

    const result = detectMemoryConflict({
      draft,
      existingMemories: [
        {
          id: "mem-1",
          content: "User prefers green tea over coffee.",
          type: "preference",
          keywords: ["green tea", "coffee"],
          unresolved: false,
          status: "active",
        },
      ],
    });

    expect(result.duplicateMemory?.id).toBe("mem-1");
    expect(result.conflict).toBeNull();
  });

  test("flags overlapping open tasks as a conflict", () => {
    const draft = resolveChatMemoryDraft({
      content: "Remind me to send the Q2 budget deck to Maya.",
      type: "task",
    });

    const result = detectMemoryConflict({
      draft,
      existingMemories: [
        {
          id: "task-1",
          content: "Send the Q2 budget deck to Maya this afternoon.",
          type: "task",
          keywords: ["q2", "budget", "deck", "maya"],
          unresolved: true,
          status: "active",
        },
      ],
    });

    expect(result.duplicateMemory).toBeNull();
    expect(result.conflict?.memoryId).toBe("task-1");
    expect(result.conflict?.kind).toBe("task_overlap");
  });

  test("allows unrelated thoughts to coexist without conflict", () => {
    const draft = resolveChatMemoryDraft({
      content: "User felt unusually energized after the walk.",
      type: "thought",
    });

    const result = detectMemoryConflict({
      draft,
      existingMemories: [
        {
          id: "thought-1",
          content: "User is interested in reflective journaling prompts.",
          type: "thought",
          keywords: ["reflective", "journaling"],
          unresolved: false,
          status: "active",
        },
      ],
    });

    expect(result.duplicateMemory).toBeNull();
    expect(result.conflict).toBeNull();
  });
});
