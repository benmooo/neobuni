import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
	runRepo(appendEventFx(...args));

import { nowDef, nowInputSchema } from "@neobuni/contracts";

import { getNowSnapshot } from "./time-context";
import type { ServerToolContext } from "./types";

const createNowTool = (context: ServerToolContext) =>
	nowDef.server(async (args) => {
		nowInputSchema.parse(args);
		const snapshot = getNowSnapshot(context);

		await appendEvent(context.profileId, "tool.now", {
			conversationId: context.conversationId,
			turnId: context.turnId,
			timezone: snapshot.timezone,
		});

		return snapshot;
	});

export { createNowTool };
