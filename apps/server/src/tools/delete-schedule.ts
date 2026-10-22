import {
	appendEvent as appendEventFx,
	deleteSchedule as deleteScheduleFx,
	getSchedule as getScheduleFx,
	runRepo,
} from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
	runRepo(appendEventFx(...args));
const deleteSchedule = (...args: Parameters<typeof deleteScheduleFx>) =>
	runRepo(deleteScheduleFx(...args));
const getSchedule = (...args: Parameters<typeof getScheduleFx>) =>
	runRepo(getScheduleFx(...args));

import {
	deleteScheduleDef,
	deleteScheduleInputSchema,
} from "@neobuni/contracts";

import type { ServerToolContext } from "./types";

const createDeleteScheduleTool = (context: ServerToolContext) =>
	deleteScheduleDef.server(async (args) => {
		const input = deleteScheduleInputSchema.parse(args);
		const existing = await getSchedule(input.scheduleId);

		if (!existing || existing.profileId !== context.profileId) {
			throw new Error("Schedule not found.");
		}

		await deleteSchedule(existing.id);
		await appendEvent(context.profileId, "schedule.deleted", {
			scheduleId: existing.id,
			conversationId: context.conversationId,
			turnId: context.turnId,
		});

		return {
			scheduleId: existing.id,
			deleted: true,
		};
	});

export { createDeleteScheduleTool };
