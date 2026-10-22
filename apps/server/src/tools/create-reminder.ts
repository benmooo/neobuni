import {
  appendEvent as appendEventFx,
  createSchedule as createScheduleFx,
  runRepo,
} from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));
const createSchedule = (...args: Parameters<typeof createScheduleFx>) =>
  runRepo(createScheduleFx(...args));

import {
  createReminderDef,
  createReminderInputSchema,
} from "@neobuni/contracts";
import { formatLocalDisplay } from "./datetime-utils";
import { normalizeScheduleBlueprint } from "./schedule-tool-blueprint";
import { getEffectiveToolTimezone } from "./time-context";
import type { ServerToolContext } from "./types";

const createReminderTool = (context: ServerToolContext) =>
  createReminderDef.server(async (args) => {
    const input = createReminderInputSchema.parse(args);
    const triggerAt = new Date(input.triggerAt).toISOString();
    const timezone = getEffectiveToolTimezone({
      requestedTimezone: input.timezone,
      profileTimezone: context.profileTimezone,
      clientTimezone: context.clientTimezone,
      defaultTimezone: context.defaultTimezone,
    });
    const localDisplay = formatLocalDisplay(triggerAt, timezone);

    const schedule = await createSchedule(context.profileId, {
      type: "reminder",
      title: input.title,
      content: input.content,
      triggerAt,
      cronExpr: null,
      timezone,
      metadata: {
        source: "chat_tool",
        conversationId: context.conversationId,
        turnId: context.turnId,
        localDisplay,
      },
      blueprint: {
        version: 1,
        prompt: [
          "At the scheduled time, send this reminder to the user.",
          `Title: ${input.title}`,
          `Reminder: ${input.content}`,
          context.conversationId
            ? `Deliver the reminder into conversation ${context.conversationId} using send_chat_message.`
            : "Use available delivery tools to send the reminder.",
        ].join("\n\n"),
        toolAllowlist: ["send_chat_message", "send_feishu_message"],
        maxSteps: 3,
        timeoutMs: 60_000,
        deliveryIntent: {
          conversationId: context.conversationId,
          channelTarget: null,
        },
        input: {
          reminderTitle: input.title,
          reminderContent: input.content,
          localDisplay,
        },
      },
    });

    await appendEvent(context.profileId, "schedule.created", {
      scheduleId: schedule.id,
      type: schedule.type,
      source: "chat_tool",
      conversationId: context.conversationId,
      turnId: context.turnId,
    });

    return {
      scheduleId: schedule.id,
      created: true,
      triggerAt: schedule.triggerAt ?? triggerAt,
      timezone: schedule.timezone,
      localDisplay,
      blueprint: normalizeScheduleBlueprint(schedule.blueprint),
      note: `Reminder created for ${localDisplay}`,
    };
  });

export { createReminderTool };
