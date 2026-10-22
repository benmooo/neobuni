import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
	runRepo(appendEventFx(...args));

import {
	listFeishuTargetsDef,
	listFeishuTargetsInputSchema,
} from "@neobuni/contracts";
import { listFeishuTargetsFromRequest } from "../integrations/feishu-tool-suite";
import type { ServerToolContext } from "./types";

const createListFeishuTargetsTool = (context: ServerToolContext) =>
	listFeishuTargetsDef.server(async (args) => {
		listFeishuTargetsInputSchema.parse(args);
		const result = await listFeishuTargetsFromRequest({
			profileId: context.profileId,
		});

		await appendEvent(context.profileId, "tool.list_feishu_targets", {
			conversationId: context.conversationId,
			turnId: context.turnId,
			count: result.count,
		});

		return result;
	});

export { createListFeishuTargetsTool };
