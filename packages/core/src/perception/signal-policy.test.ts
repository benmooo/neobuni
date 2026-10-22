import { describe, expect, test } from "vitest";

import {
  adaptBehavioralSignals,
  adaptEnvironmentalSignals,
  adaptScheduleSignals,
  summarizeSignalSet,
} from "./index";

describe("signal policy quality tuning", () => {
  test("schedule adapter emits quality metadata and decision-ready pressure signals", () => {
    const signals = adaptScheduleSignals({
      now: "2026-05-02T00:00:00.000Z",
      schedules: [
        {
          id: "schedule-1",
          type: "reminder",
          title: "Morning workout",
          triggerAt: "2026-05-02T01:00:00.000Z",
          timezone: "Asia/Shanghai",
          status: "active",
        },
        {
          id: "schedule-2",
          type: "reminder",
          title: "Past due task",
          triggerAt: "2026-05-01T20:00:00.000Z",
          timezone: "Asia/Shanghai",
          status: "active",
        },
      ],
    });

    const timePressure = signals.find((signal) => signal.kind === "time_pressure");
    const missedCommitment = signals.find((signal) => signal.kind === "missed_commitment");

    expect(timePressure?.metadata.consumptionMode).toBe("decision_input");
    expect(timePressure?.metadata.strengthBand).toBe("strong");
    expect(timePressure?.metadata.nearestScheduleId).toBe("schedule-1");
    expect(missedCommitment?.metadata.oldestOverdueScheduleId).toBe("schedule-2");
  });

  test("environmental time context stays a context hint instead of a decision input", () => {
    const [signal] = adaptEnvironmentalSignals({
      now: "2026-05-02T16:30:00.000Z",
      effectiveTimezone: "Asia/Shanghai",
    });

    expect(signal?.kind).toBe("time_context");
    expect(signal?.metadata.dayPart).toBe("quiet_hours");
    expect(signal?.metadata.consumptionMode).toBe("context_hint");
  });

  test("signal summaries expose quality counts and top signals", () => {
    const signalSet = {
      textSignals: [],
      memorySignals: [],
      scheduleSignals: adaptScheduleSignals({
        now: "2026-05-02T00:00:00.000Z",
        schedules: [
          {
            id: "schedule-1",
            type: "reminder",
            title: "Morning workout",
            triggerAt: "2026-05-02T00:30:00.000Z",
            timezone: "Asia/Shanghai",
            status: "active",
          },
        ],
      }),
      behavioralSignals: adaptBehavioralSignals({
        latestUserText: "算了 我不想说了",
        recentUserTexts: [
          "我最近真的很焦虑",
          "有点崩溃了",
          "我不知道怎么办",
        ],
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
      }),
      environmentalSignals: adaptEnvironmentalSignals({
        now: "2026-05-02T16:30:00.000Z",
        effectiveTimezone: "Asia/Shanghai",
      }),
    };

    const profile = summarizeSignalSet(signalSet);

    expect(profile.totalSignalCount).toBeGreaterThan(0);
    expect(profile.strongSignalCount).toBeGreaterThan(0);
    expect(profile.decisionSignalCount).toBeGreaterThan(0);
    expect(profile.contextHintSignalCount).toBeGreaterThan(0);
    expect(profile.categoryCounts.schedule).toBeGreaterThan(0);
    expect(profile.categoryCounts.behavioral).toBeGreaterThan(0);
    expect(profile.topSignals[0]?.kind).toBeTruthy();
  });

});
