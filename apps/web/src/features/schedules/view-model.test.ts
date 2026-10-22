import { describe, expect, test } from "vitest";

import {
  formatScheduleTiming,
  resolveTaskRunErrorMessage,
  resolveTaskRunResultPreview,
} from "./view-model";

describe("schedule view model helpers", () => {
  test("formats one-shot schedules from triggerAt", () => {
    expect(
      formatScheduleTiming({
        triggerAt: "2026-06-15T08:00:00.000Z",
        cronExpr: null,
        timezone: "Asia/Shanghai",
      })
    ).toContain("单次");
  });

  test("formats recurring schedules from cron expression and timezone", () => {
    expect(
      formatScheduleTiming({
        triggerAt: null,
        cronExpr: "0 9 * * 1-5",
        timezone: "Asia/Shanghai",
      })
    ).toBe("重复 · 0 9 * * 1-5 · Asia/Shanghai");
  });

  test("extracts a stable task-run error message", () => {
    expect(
      resolveTaskRunErrorMessage({
        error: {
          message: "provider timeout",
        },
      })
    ).toBe("provider timeout");
  });

  test("extracts assistant text preview from task-run result", () => {
    expect(
      resolveTaskRunResultPreview({
        result: {
          assistantText: "Daily summary delivered",
        },
      })
    ).toBe("Daily summary delivered");
  });
});
