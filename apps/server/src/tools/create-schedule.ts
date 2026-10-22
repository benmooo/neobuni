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
  createScheduleDef,
  createScheduleInputSchema,
} from "@neobuni/contracts";

import {
  planScheduleCreateInput,
  SchedulePlanError,
} from "../schedules/plan-schedule";
import {
  buildScheduleBlueprintFromCreateInput,
  normalizeScheduleBlueprint,
} from "./schedule-tool-blueprint";
import type { ServerToolContext } from "./types";

const createScheduleTool = (context: ServerToolContext) =>
  createScheduleDef.server(async (args) => {
    const input = createScheduleInputSchema.parse(args);
    const blueprint = buildScheduleBlueprintFromCreateInput({
      ...input,
      conversationId: context.conversationId,
    });

    let schedule;

    try {
      const planned = planScheduleCreateInput({
        schedule: {
          type: input.type,
          title: input.title,
          content: input.content ?? input.taskPrompt,
          triggerAt: input.triggerAt ?? null,
          cronExpr: input.cronExpr ?? null,
          timezone:
            input.timezone ??
            context.profileTimezone ??
            context.defaultTimezone,
          metadata: {
            source: "chat_tool",
            conversationId: context.conversationId,
            turnId: context.turnId,
          },
          blueprint,
        },
        referenceNow: context.referenceNow,
      });

      schedule = await createSchedule(context.profileId, planned);
    } catch (error) {
      if (error instanceof SchedulePlanError) {
        throw new Error(error.message);
      }

      throw error;
    }

    await appendEvent(context.profileId, "schedule.created", {
      scheduleId: schedule.id,
      type: schedule.type,
      source: "chat_tool",
      conversationId: context.conversationId,
      turnId: context.turnId,
    });

    return {
      scheduleId: schedule.id,
      status: schedule.status,
      type: schedule.type,
      triggerAt: schedule.triggerAt,
      cronExpr: schedule.cronExpr,
      timezone: schedule.timezone,
      blueprint: normalizeScheduleBlueprint(schedule.blueprint) ?? blueprint,
    };
  });

export { createScheduleTool };
