import type {
  ScheduleCreateInput,
  ScheduleUpdateInput,
} from "@neobuni/contracts";
import { describe, expect, test } from "vitest";

import {
  planScheduleCreateInput,
  planScheduleUpdateInput,
} from "./plan-schedule";

const makeCreateInput = (
  overrides: Partial<ScheduleCreateInput> = {}
): ScheduleCreateInput => ({
  type: "monitor",
  title: "Weekly review",
  content: "Check the system",
  triggerAt: null,
  cronExpr: "0 8 * * MON",
  timezone: "Asia/Shanghai",
  metadata: {},
  ...overrides,
});

const makePersistedSchedule = () => ({
  id: "schedule-1",
  profileId: "profile-1",
  type: "monitor" as const,
  title: "Weekly review",
  content: "Check the system",
  triggerAt: "2026-06-01T00:00:00.000Z",
  cronExpr: "0 8 * * MON",
  timezone: "Asia/Shanghai",
  status: "active" as const,
  lastTriggeredAt: null,
  deliveredAt: null,
  metadata: {
    localDisplay: "2026-06-01 08:00 Asia/Shanghai",
  },
  createdAt: "2026-05-30T00:00:00.000Z",
  updatedAt: "2026-05-30T00:00:00.000Z",
});

describe("schedule planning", () => {
  test("plans the next trigger automatically for cron-backed schedules", () => {
    const planned = planScheduleCreateInput({
      schedule: makeCreateInput(),
      referenceNow: "2026-05-30T00:00:00.000Z",
    });

    expect(planned.triggerAt).toBe("2026-06-01T00:00:00.000Z");
    expect(planned.metadata.localDisplay).toBe(
      "2026-06-01 08:00 Asia/Shanghai"
    );
  });

  test("accepts explicit triggerAt when it matches cronExpr", () => {
    const planned = planScheduleCreateInput({
      schedule: makeCreateInput({
        triggerAt: "2026-06-01T00:00:00.000Z",
      }),
      referenceNow: "2026-05-30T00:00:00.000Z",
    });

    expect(planned.triggerAt).toBe("2026-06-01T00:00:00.000Z");
    expect(planned.metadata.localDisplay).toBe(
      "2026-06-01 08:00 Asia/Shanghai"
    );
  });

  test("rejects explicit triggerAt when it does not match cronExpr", () => {
    expect(() =>
      planScheduleCreateInput({
        schedule: makeCreateInput({
          triggerAt: "2026-05-30T00:00:00.000Z",
        }),
        referenceNow: "2026-05-30T00:00:00.000Z",
      })
    ).toThrow(/triggerAt/);
  });

  test("replans recurring schedules when cronExpr changes on update", () => {
    const planned = planScheduleUpdateInput({
      current: makePersistedSchedule(),
      update: {
        cronExpr: "0 8 L * *",
      } satisfies ScheduleUpdateInput,
      referenceNow: "2026-05-30T00:00:00.000Z",
    });

    expect(planned.triggerAt).toBe("2026-05-31T00:00:00.000Z");
    expect(planned.metadata?.localDisplay).toBe(
      "2026-05-31 08:00 Asia/Shanghai"
    );
  });

  test("replans recurring schedules when reactivated", () => {
    const planned = planScheduleUpdateInput({
      current: {
        ...makePersistedSchedule(),
        status: "completed",
      },
      update: {
        status: "active",
      } satisfies ScheduleUpdateInput,
      referenceNow: "2026-06-02T00:00:00.000Z",
    });

    expect(planned.triggerAt).toBe("2026-06-08T00:00:00.000Z");
    expect(planned.metadata?.localDisplay).toBe(
      "2026-06-08 08:00 Asia/Shanghai"
    );
  });
});
