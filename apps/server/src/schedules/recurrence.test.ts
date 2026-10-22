import { describe, expect, test } from "vitest";

import {
  getNextCronTriggerAt,
  getNextCronTriggers,
  matchesCronSchedule,
  validateCronSchedule,
} from "./recurrence";

describe("schedule recurrence", () => {
  test("getNextCronTriggerAt handles weekly schedules in a named timezone", () => {
    expect(getNextCronTriggerAt({
      cronExpr: "0 8 * * MON",
      timezone: "Asia/Shanghai",
      afterIso: "2026-05-30T00:00:00.000Z",
    })).toBe("2026-06-01T00:00:00.000Z");
  });

  test("getNextCronTriggers supports advanced OCPS modifiers through Croner", () => {
    expect(getNextCronTriggers({
      cronExpr: "0 8 1W * *",
      timezone: "Asia/Shanghai",
      count: 3,
      afterIso: "2026-05-30T00:00:00.000Z",
    })).toEqual([
      "2026-06-01T00:00:00.000Z",
      "2026-07-01T00:00:00.000Z",
      "2026-08-03T00:00:00.000Z",
    ]);
    expect(getNextCronTriggers({
      cronExpr: "0 8 L * *",
      timezone: "Asia/Shanghai",
      count: 2,
      afterIso: "2026-05-30T00:00:00.000Z",
    })).toEqual([
      "2026-05-31T00:00:00.000Z",
      "2026-06-30T00:00:00.000Z",
    ]);
    expect(getNextCronTriggers({
      cronExpr: "0 8 1 * +MON",
      timezone: "Asia/Shanghai",
      count: 1,
      afterIso: "2026-05-30T00:00:00.000Z",
    })).toEqual([
      "2026-06-01T00:00:00.000Z",
    ]);
  });

  test("matchesCronSchedule can validate explicit triggerAt values", () => {
    expect(matchesCronSchedule({
      cronExpr: "0 8 * * *",
      timezone: "Asia/Shanghai",
      candidateIso: "2026-05-30T00:00:00.000Z",
    })).toBe(true);
    expect(matchesCronSchedule({
      cronExpr: "0 8 * * *",
      timezone: "Asia/Shanghai",
      candidateIso: "2026-05-30T00:05:00.000Z",
    })).toBe(false);
  });

  test("validateCronSchedule rejects malformed expressions", () => {
    expect(validateCronSchedule({
      cronExpr: "not-a-cron",
      timezone: "Asia/Shanghai",
    })).toEqual({
      valid: false,
      error: expect.any(String),
    });
  });
});
