import {
  appendEvent as appendEventFx,
  getSchedule as getScheduleFx,
  runRepo,
  updateSchedule as updateScheduleFx,
} from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));
const getSchedule = (...args: Parameters<typeof getScheduleFx>) =>
  runRepo(getScheduleFx(...args));
const updateSchedule = (...args: Parameters<typeof updateScheduleFx>) =>
  runRepo(updateScheduleFx(...args));

import {
  updateScheduleDef,
  updateScheduleInputSchema,
} from "@neobuni/contracts";

import {
  planScheduleUpdateInput,
  SchedulePlanError,
} from "../schedules/plan-schedule";
import {
  mergeScheduleBlueprintForUpdate,
  normalizeScheduleBlueprint,
} from "./schedule-tool-blueprint";
import type { ServerToolContext } from "./types";

const createUpdateScheduleTool = (context: ServerToolContext) =>
  updateScheduleDef.server(async (args) => {
    const input = updateScheduleInputSchema.parse(args);
    const existing = await getSchedule(input.scheduleId);

    if (!existing || existing.profileId !== context.profileId) {
      throw new Error("Schedule not found.");
    }

    const blueprint = mergeScheduleBlueprintForUpdate({
      existing: existing.blueprint ?? null,
      update: input,
      context,
    });

    let schedule;

    try {
      const planned = planScheduleUpdateInput({
        current: existing,
        update: {
          type: input.type,
          title: input.title,
          content: input.content,
          triggerAt: input.triggerAt,
          cronExpr: input.cronExpr,
          timezone: input.timezone,
          status: input.status,
          metadata: existing.metadata,
          blueprint,
        },
        referenceNow: context.referenceNow,
      });

      schedule = await updateSchedule(input.scheduleId, planned);
    } catch (error) {
      if (error instanceof SchedulePlanError) {
        throw new Error(error.message);
      }

      throw error;
    }

    if (!schedule) {
      throw new Error("Schedule not found.");
    }

    await appendEvent(context.profileId, "schedule.updated", {
      scheduleId: schedule.id,
      conversationId: context.conversationId,
      turnId: context.turnId,
    });

    return {
      ...schedule,
      blueprint: normalizeScheduleBlueprint(schedule.blueprint),
    };
  });

export { createUpdateScheduleTool };
