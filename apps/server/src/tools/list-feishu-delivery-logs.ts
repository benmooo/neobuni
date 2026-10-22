import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
	runRepo(appendEventFx(...args));

import {
	listFeishuDeliveryLogsDef,
	listFeishuDeliveryLogsInputSchema,
} from "@neobuni/contracts";
import { listFeishuDeliveryLogsFromRequest } from "../integrations/feishu-tool-suite";
import type { ServerToolContext } from "./types";

const createListFeishuDeliveryLogsTool = (context: ServerToolContext) =>
	listFeishuDeliveryLogsDef.server(async (args) => {
		const input = listFeishuDeliveryLogsInputSchema.parse(args);
		const result = await listFeishuDeliveryLogsFromRequest({
			profileId: context.profileId,
			request: input,
		});

		await appendEvent(context.profileId, "tool.list_feishu_delivery_logs", {
			conversationId: context.conversationId,
			turnId: context.turnId,
			count: result.count,
			targetAlias: input.targetAlias ?? null,
		});

		return result;
	});

export { createListFeishuDeliveryLogsTool };
