import type { StudyGoalConfig } from "@neobuni/contracts";
import {
  localClockInTimeZone,
  localDateInTimeZone,
  localDateTimeInTimeZone,
} from "@neobuni/core";
import {
  appendEvent,
  getLatestStudyPlan,
  getStudyGoalConfig,
  listActiveProfiles,
  listEvents,
  listGoals,
  listStudySessions,
  runRepo,
} from "@neobuni/db";
import { Effect } from "effect";

import { sendDiscordMessage } from "../integrations/discord";
import { sendFeishuMessage } from "../integrations/feishu";
import { sendQqMessage } from "../integrations/qq";
import { sendTelegramMessage } from "../integrations/telegram";
import {
  buildStudyNudges,
  countNudgesOnDate,
  readNudgeSettings,
  type StudyNudge,
  type StudyNudgeEvent,
} from "./nudge-service";

interface StudyReminderConfig {
  enabled: boolean;
  leadMinutes: number;
  maxPerDay: number;
  tickMs: number;
}

interface DeliveryResult {
  delivered: number;
  errors: string[];
  failed: number;
}

interface StudyReminderDeps {
  appendEvent: typeof appendEvent;
  getLatestStudyPlan: typeof getLatestStudyPlan;
  getStudyGoalConfig: typeof getStudyGoalConfig;
  listActiveProfiles: typeof listActiveProfiles;
  listEvents: typeof listEvents;
  listGoals: typeof listGoals;
  listStudySessions: typeof listStudySessions;
  sendDiscordMessage: typeof sendDiscordMessage;
  sendFeishuMessage: typeof sendFeishuMessage;
  sendQqMessage: typeof sendQqMessage;
  sendTelegramMessage: typeof sendTelegramMessage;
}

const DEFAULT_CONFIG: StudyReminderConfig = {
  enabled: true,
  leadMinutes: 60,
  maxPerDay: 3,
  tickMs: 60_000,
};

const defaultDeps: StudyReminderDeps = {
  appendEvent,
  getLatestStudyPlan,
  getStudyGoalConfig,
  listActiveProfiles,
  listEvents,
  listGoals,
  listStudySessions,
  sendDiscordMessage,
  sendFeishuMessage,
  sendQqMessage,
  sendTelegramMessage,
};

const toBoolean = (value: string | undefined, fallback: boolean) =>
  value === undefined
    ? fallback
    : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
      ? true
      : ["0", "false", "no", "off"].includes(value.trim().toLowerCase())
        ? false
        : fallback;

const toPositiveInt = (
  value: string | undefined,
  fallback: number,
  min: number
) => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(min, Math.trunc(parsed)) : fallback;
};

const readStudyReminderConfig = (): StudyReminderConfig => ({
  enabled: toBoolean(
    process.env.NEOBUNI_STUDY_REMINDER_ENABLED,
    DEFAULT_CONFIG.enabled
  ),
  leadMinutes: toPositiveInt(
    process.env.NEOBUNI_STUDY_REMINDER_LEAD_MINUTES,
    DEFAULT_CONFIG.leadMinutes,
    5
  ),
  maxPerDay: toPositiveInt(
    process.env.NEOBUNI_STUDY_REMINDER_MAX_PER_DAY,
    DEFAULT_CONFIG.maxPerDay,
    1
  ),
  tickMs: toPositiveInt(
    process.env.NEOBUNI_STUDY_REMINDER_TICK_MS,
    DEFAULT_CONFIG.tickMs,
    10_000
  ),
});

const isWithinQuietHours = (
  config: StudyGoalConfig,
  instant: Date
): boolean => {
  if (!config.quietHours) {
    return false;
  }
  const clock = localClockInTimeZone(instant, config.timezone);
  const { start, end } = config.quietHours;
  return start <= end
    ? clock >= start && clock < end
    : clock >= start || clock < end;
};

const deliver = async (
  deps: StudyReminderDeps,
  profileId: string,
  channels: StudyGoalConfig["channels"],
  nudge: StudyNudge
): Promise<DeliveryResult> => {
  let delivered = 0;
  const errors: string[] = [];

  for (const channel of channels) {
    try {
      if (channel.platform === "telegram") {
        await deps.sendTelegramMessage(profileId, {
          message: { text: nudge.text, type: "text" },
          replyMarkup: nudge.sessionId
            ? {
                inline_keyboard: [
                  nudge.buttons.map((button) => ({
                    callback_data: `st:${button.action}:${nudge.sessionId}`,
                    text: button.label,
                  })),
                ],
              }
            : undefined,
          targetAlias: channel.targetAlias ?? undefined,
          targetId: channel.targetId ?? undefined,
        });
      } else if (channel.platform === "discord") {
        await deps.sendDiscordMessage(profileId, {
          message: { text: nudge.text, type: "text" },
          targetAlias: channel.targetAlias ?? undefined,
          targetId: channel.targetId ?? undefined,
        });
      } else if (channel.platform === "feishu") {
        if (!channel.targetAlias) {
          throw new Error("Feishu reminders require a target alias");
        }
        await deps.sendFeishuMessage(profileId, {
          message: { text: nudge.text, type: "text" },
          targetAlias: channel.targetAlias,
        });
      } else {
        if (!channel.targetAlias) {
          throw new Error("QQ reminders require a target alias");
        }
        await deps.sendQqMessage(profileId, {
          message: { text: nudge.text, type: "text" },
          targetAlias: channel.targetAlias,
        });
      }
      delivered += 1;
    } catch (error) {
      errors.push(
        `${channel.platform}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { delivered, errors, failed: errors.length };
};

interface StudyReminderSweepInput {
  config?: StudyReminderConfig;
  deps?: Partial<StudyReminderDeps>;
  now?: Date;
}

interface StudyReminderSweepResult {
  delivered: number;
  failed: number;
  goalCount: number;
  reminderCount: number;
}

const runStudyReminderSweep = async (
  input: StudyReminderSweepInput = {}
): Promise<StudyReminderSweepResult> => {
  const config = input.config ?? readStudyReminderConfig();
  if (!config.enabled) {
    return { delivered: 0, failed: 0, goalCount: 0, reminderCount: 0 };
  }
  const deps = { ...defaultDeps, ...input.deps };
  const now = input.now ?? new Date();
  const profiles = await runRepo(deps.listActiveProfiles());
  let goalCount = 0;
  let reminderCount = 0;
  let delivered = 0;
  let failed = 0;

  for (const profile of profiles) {
    const goals = await runRepo(deps.listGoals(profile.id, "active"));
    for (const goal of goals) {
      const studyConfig = await runRepo(deps.getStudyGoalConfig(goal.id));
      if (!studyConfig) {
        continue;
      }
      goalCount += 1;
      if (
        studyConfig.channels.length === 0 ||
        isWithinQuietHours(studyConfig, now)
      ) {
        continue;
      }
      const localDate = localDateInTimeZone(now, studyConfig.timezone);
      const events = await runRepo(deps.listEvents(profile.id));
      const sentToday = countNudgesOnDate(
        events as unknown as StudyNudgeEvent[],
        localDate,
        studyConfig.timezone
      );
      const budget = config.maxPerDay - sentToday;
      if (budget <= 0) {
        continue;
      }
      const plan = await runRepo(
        deps.getLatestStudyPlan({ goalId: goal.id, status: "active" })
      );
      if (!plan) {
        continue;
      }
      const sessions = await runRepo(deps.listStudySessions(goal.id));
      const nudges = buildStudyNudges({
        config: studyConfig,
        events: events as unknown as StudyNudgeEvent[],
        leadMinutes: config.leadMinutes,
        localDate,
        nodes: plan.nodes,
        nowLocalDateTime: localDateTimeInTimeZone(now, studyConfig.timezone),
        sessions,
        settings: readNudgeSettings(studyConfig),
      }).slice(0, budget);

      for (const nudge of nudges) {
        const result = await deliver(
          deps,
          profile.id,
          studyConfig.channels,
          nudge
        );
        reminderCount += 1;
        delivered += result.delivered;
        failed += result.failed;
        await runRepo(
          deps.appendEvent(
            profile.id,
            result.delivered > 0
              ? nudge.kind === "session_due"
                ? "study.reminder_sent"
                : "study.nudge_sent"
              : "study.reminder_failed",
            {
              channels: studyConfig.channels.length,
              dedupeKey: nudge.dedupeKey,
              delivered: result.delivered,
              errors: result.errors,
              goalId: goal.id,
              kind: nudge.kind,
              planNodeId: nudge.planNodeId,
              scheduledFor: nudge.scheduledFor,
              sessionId: nudge.sessionId,
              sessionIds: nudge.sessionIds,
            }
          )
        );
      }
    }
  }

  return { delivered, failed, goalCount, reminderCount };
};

const sendStudyNudgeNow = async (input: {
  channels: StudyGoalConfig["channels"];
  nudge: StudyNudge;
  profileId: string;
}): Promise<DeliveryResult> =>
  deliver(defaultDeps, input.profileId, input.channels, input.nudge);

const startStudyReminderWorker = Effect.fnUntraced(function* () {
  const config = readStudyReminderConfig();
  if (!config.enabled) {
    yield* Effect.logInfo(
      "[buni/study-reminder-worker] disabled via NEOBUNI_STUDY_REMINDER_ENABLED"
    );
    return;
  }
  yield* Effect.logInfo(
    `[buni/study-reminder-worker] started tickMs=${config.tickMs} leadMinutes=${config.leadMinutes} maxPerDay=${config.maxPerDay}`
  );
  yield* Effect.forever(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => runStudyReminderSweep({ config }),
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((error) =>
          Effect.logError("[buni/study-reminder-worker] sweep failed", error)
        ),
        Effect.catchDefect((defect) =>
          Effect.logError("[buni/study-reminder-worker] sweep defect", defect)
        )
      );
      yield* Effect.sleep(config.tickMs);
    })
  );
});

export type {
  StudyReminderConfig,
  StudyReminderDeps,
  StudyReminderSweepInput,
  StudyReminderSweepResult,
};
export {
  readStudyReminderConfig,
  runStudyReminderSweep,
  sendStudyNudgeNow,
  startStudyReminderWorker,
};
