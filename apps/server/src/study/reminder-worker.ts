import type {
  StudyGoalConfig,
  StudyPlanNode,
  StudySession,
} from "@neobuni/contracts";
import {
  localClockInTimeZone,
  localDateInTimeZone,
  localDateTimeInTimeZone,
  localDateTimeToEpoch,
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
  maxPerDay: 2,
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

const isWithinReminderWindow = (input: {
  leadMinutes: number;
  nowLocalDateTime: string;
  scheduledFor: string;
}): boolean => {
  const deltaMs =
    localDateTimeToEpoch(input.scheduledFor) -
    localDateTimeToEpoch(input.nowLocalDateTime);
  return deltaMs <= input.leadMinutes * 60_000 && deltaMs >= -24 * 60 * 60_000;
};

const renderReminder = (node: StudyPlanNode, session: StudySession): string =>
  [
    `📚 今天这一步：${node.title}`,
    node.whatText ? `学什么：${node.whatText}` : null,
    node.howText ? `怎么学：${node.howText}` : null,
    `预计 ${session.durationMinutes} 分钟`,
    "打开 Now 开始，或回复「开始今天的学习」。",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

const deliver = async (
  deps: StudyReminderDeps,
  profileId: string,
  channels: StudyGoalConfig["channels"],
  text: string
): Promise<DeliveryResult> => {
  let delivered = 0;
  const errors: string[] = [];

  for (const channel of channels) {
    try {
      if (channel.platform === "telegram") {
        await deps.sendTelegramMessage(profileId, {
          message: { text, type: "text" },
          targetAlias: channel.targetAlias ?? undefined,
          targetId: channel.targetId ?? undefined,
        });
      } else if (channel.platform === "discord") {
        await deps.sendDiscordMessage(profileId, {
          message: { text, type: "text" },
          targetAlias: channel.targetAlias ?? undefined,
          targetId: channel.targetId ?? undefined,
        });
      } else if (channel.platform === "feishu") {
        if (!channel.targetAlias) {
          throw new Error("Feishu reminders require a target alias");
        }
        await deps.sendFeishuMessage(profileId, {
          message: { text, type: "text" },
          targetAlias: channel.targetAlias,
        });
      } else {
        if (!channel.targetAlias) {
          throw new Error("QQ reminders require a target alias");
        }
        await deps.sendQqMessage(profileId, {
          message: { text, type: "text" },
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
      if (isWithinQuietHours(studyConfig, now)) {
        continue;
      }
      const localDate = localDateInTimeZone(now, studyConfig.timezone);
      const events = await runRepo(deps.listEvents(profile.id));
      const sentToday = events.filter(
        (event) =>
          event.type === "study.reminder_sent" &&
          localDateInTimeZone(
            new Date(event.createdAt),
            studyConfig.timezone
          ) === localDate
      ).length;
      if (sentToday >= config.maxPerDay) {
        continue;
      }
      const plan = await runRepo(
        deps.getLatestStudyPlan({ goalId: goal.id, status: "active" })
      );
      if (!plan) {
        continue;
      }
      const nodeById = new Map(
        plan.nodes.map((node) => [node.id, node] as const)
      );
      const sessions = await runRepo(deps.listStudySessions(goal.id));
      const nowLocalDateTime = localDateTimeInTimeZone(
        now,
        studyConfig.timezone
      );
      const candidates = sessions
        .filter((session) => session.status === "planned")
        .filter((session) =>
          isWithinReminderWindow({
            leadMinutes: config.leadMinutes,
            nowLocalDateTime,
            scheduledFor: session.scheduledFor,
          })
        )
        .filter(
          (session) =>
            !events.some(
              (event) =>
                event.type === "study.reminder_sent" &&
                event.payload.sessionId === session.id
            )
        )
        .sort((left, right) =>
          left.scheduledFor.localeCompare(right.scheduledFor)
        )
        .slice(0, config.maxPerDay - sentToday);

      for (const session of candidates) {
        const node = nodeById.get(session.planNodeId);
        if (!node || studyConfig.channels.length === 0) {
          continue;
        }
        const text = renderReminder(node, session);
        const result = await deliver(
          deps,
          profile.id,
          studyConfig.channels,
          text
        );
        reminderCount += 1;
        delivered += result.delivered;
        failed += result.failed;
        await runRepo(
          deps.appendEvent(
            profile.id,
            result.delivered > 0
              ? "study.reminder_sent"
              : "study.reminder_failed",
            {
              goalId: goal.id,
              sessionId: session.id,
              planNodeId: node.id,
              channels: studyConfig.channels.length,
              delivered: result.delivered,
              errors: result.errors,
            }
          )
        );
      }
    }
  }

  return { delivered, failed, goalCount, reminderCount };
};

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
  startStudyReminderWorker,
};
