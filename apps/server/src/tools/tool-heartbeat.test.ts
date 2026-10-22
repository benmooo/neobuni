import { describe, expect, test } from "vitest";

import { runWithToolHeartbeat } from "./tool-heartbeat";

describe("runWithToolHeartbeat", () => {
  test("emits started, heartbeat, and completed events around a long task", async () => {
    const events: Array<{ name: string; value: Record<string, unknown> }> = [];

    const result = await runWithToolHeartbeat(
      {
        emitCustomEvent: (name, value) => {
          events.push({ name, value });
        },
      },
      {
        eventName: "tool.test.progress",
        intervalMs: 10,
        payload: { tool: "test_tool" },
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return "ok";
      }
    );

    expect(result).toBe("ok");
    expect(events[0]).toEqual({
      name: "tool.test.progress",
      value: {
        phase: "started",
        tool: "test_tool",
      },
    });
    expect(events.some((event) => event.value.phase === "heartbeat")).toBe(
      true
    );
    expect(events.at(-1)).toEqual({
      name: "tool.test.progress",
      value: {
        phase: "completed",
        tool: "test_tool",
      },
    });
  });
});
