import { describe, expect, test } from "vitest";

import { filterAndOrderSchedulesForTool } from "./list-schedules";

const makeSchedule = (overrides: Partial<{
  id: string;
  type: "reminder" | "alarm" | "monitor";
  status: "active" | "paused" | "completed" | "cancelled";
  title: string;
  content: string;
  triggerAt: string | null;
  cronExpr: string | null;
  timezone: string;
  metadata: Record<string, unknown>;
  profileId: string;
  lastTriggeredAt: string | null;
  deliveredAt: string | null;
  lastMaterializedAt: string | null;
  blueprint: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}> = {}) => ({
  id: overrides.id ?? "schedule-1",
  profileId: overrides.profileId ?? "profile-1",
  type: overrides.type ?? "reminder",
  title: overrides.title ?? "Title",
  content: overrides.content ?? "Content",
  triggerAt: overrides.triggerAt ?? null,
  cronExpr: overrides.cronExpr ?? null,
  timezone: overrides.timezone ?? "Asia/Shanghai",
  status: overrides.status ?? "active",
  lastTriggeredAt: overrides.lastTriggeredAt ?? null,
  deliveredAt: overrides.deliveredAt ?? null,
  lastMaterializedAt: overrides.lastMaterializedAt ?? null,
  metadata: overrides.metadata ?? {},
  blueprint: overrides.blueprint ?? null,
  createdAt: overrides.createdAt ?? "2026-05-29T08:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-05-29T08:00:00.000Z",
});

describe("filterAndOrderSchedulesForTool", () => {
  test("filters by type, status, and upcoming window without mutating input", () => {
    const schedules = [
      makeSchedule({
        id: "reminder-upcoming",
        type: "reminder",
        status: "active",
        triggerAt: "2026-05-29T10:00:00.000Z",
      }),
      makeSchedule({
        id: "alarm-upcoming",
        type: "alarm",
        status: "active",
        triggerAt: "2026-05-29T09:30:00.000Z",
      }),
      makeSchedule({
        id: "reminder-paused",
        type: "reminder",
        status: "paused",
        triggerAt: "2026-05-29T11:00:00.000Z",
      }),
      makeSchedule({
        id: "reminder-unscheduled",
        type: "reminder",
        status: "active",
        triggerAt: null,
      }),
    ];

    const result = filterAndOrderSchedulesForTool({
      schedules,
      filter: {
        types: ["reminder"],
        statuses: ["active"],
        upcomingOnly: true,
      },
      referenceNow: "2026-05-29T09:00:00.000Z",
    });

    expect(result.map((item) => item.id)).toEqual(["reminder-upcoming"]);
    expect(schedules.map((item) => item.id)).toEqual([
      "reminder-upcoming",
      "alarm-upcoming",
      "reminder-paused",
      "reminder-unscheduled",
    ]);
  });

  test("orders triggered schedules first by trigger time and places undated items later", () => {
    const result = filterAndOrderSchedulesForTool({
      schedules: [
        makeSchedule({
          id: "late",
          triggerAt: "2026-05-29T12:00:00.000Z",
        }),
        makeSchedule({
          id: "undated-newer",
          triggerAt: null,
          updatedAt: "2026-05-29T12:30:00.000Z",
        }),
        makeSchedule({
          id: "early",
          triggerAt: "2026-05-29T09:30:00.000Z",
        }),
        makeSchedule({
          id: "undated-older",
          triggerAt: null,
          updatedAt: "2026-05-29T07:30:00.000Z",
        }),
      ],
      filter: {
        limit: 3,
      },
      referenceNow: "2026-05-29T09:00:00.000Z",
    });

    expect(result.map((item) => item.id)).toEqual([
      "early",
      "late",
      "undated-newer",
    ]);
  });
});
