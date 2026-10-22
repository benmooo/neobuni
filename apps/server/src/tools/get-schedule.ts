import {
  appendEvent as appendEventFx,
  getSchedule as getScheduleFx,
  runRepo,
} from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));
const getSchedule = (...args: Parameters<typeof getScheduleFx>) =>
  runRepo(getScheduleFx(...args));

import { getScheduleDef, getScheduleInputSchema } from "@neobuni/contracts";

import { normalizeScheduleBlueprint } from "./schedule-tool-blueprint";
import type { ServerToolContext } from "./types";

const createGetScheduleTool = (context: ServerToolContext) =>
  getScheduleDef.server(async (args) => {
    const input = getScheduleInputSchema.parse(args);
    const schedule = await getSchedule(input.scheduleId);

    if (!schedule || schedule.profileId !== context.profileId) {
      throw new Error("Schedule not found.");
    }

    await appendEvent(context.profileId, "tool.get_schedule", {
      scheduleId: schedule.id,
      conversationId: context.conversationId,
      turnId: context.turnId,
    });

    return {
      ...schedule,
      blueprint: normalizeScheduleBlueprint(schedule.blueprint),
    };
  });

export { createGetScheduleTool };
