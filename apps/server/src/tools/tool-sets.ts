import { createReminderTool } from "./create-reminder";
import { createScheduleTool } from "./create-schedule";
import { createDeleteScheduleTool } from "./delete-schedule";
import { createExtractPageTool } from "./extract-page";
import { createGetNewsBriefTool } from "./get-news-brief";
import { createGetNewsHeadlinesTool } from "./get-news-headlines";
import { createGetScheduleTool } from "./get-schedule";
import { createListChannelTargetsTool } from "./list-channel-targets";
import { createListFeishuDeliveryLogsTool } from "./list-feishu-delivery-logs";
import { createListFeishuTargetsTool } from "./list-feishu-targets";
import { createListNewsBriefsTool } from "./list-news-briefs";
import { createListNewsSourcesTool } from "./list-news-sources";
import { createListQqTargetsTool } from "./list-qq-targets";
import { createListSchedulesTool } from "./list-schedules";
import { createMarkTaskDoneTool } from "./mark-task-done";
import { createNowTool } from "./now";
import { createOpenUrlTool } from "./open-url";
import { createRecallMemoryTool } from "./recall-memory";
import { createResolveMemoryConflictTool } from "./resolve-memory-conflict";
import { createResolveNewsSourceTool } from "./resolve-news-source";
import { createSaveMemoryTool } from "./save-memory";
import { createSavePageToKnowledgeTool } from "./save-page-to-knowledge";
import { createSearchNewsSourcesTool } from "./search-news-sources";
import { createSearchWebTool } from "./search-web";
import { createSendChannelMessageTool } from "./send-channel-message";
import { createSendChatMessageTool } from "./send-chat-message";
import { createSendFeishuMessageTool } from "./send-feishu-message";
import { createSendQqMessageTool } from "./send-qq-message";
import { createSummarizePageTool } from "./summarize-page";
import type { ServerToolContext } from "./types";
import { createUpdateMemoryTool } from "./update-memory";
import { createUpdateScheduleTool } from "./update-schedule";

const createMemoryTools = (context: ServerToolContext) => [
	createSaveMemoryTool(context),
	createUpdateMemoryTool(context),
	createResolveMemoryConflictTool(context),
	createMarkTaskDoneTool(context),
	createRecallMemoryTool(context),
];

const createExecutionTools = (context: ServerToolContext) => [
	createScheduleTool(context),
	createDeleteScheduleTool(context),
	createExtractPageTool(context),
	createGetScheduleTool(context),
	createGetNewsBriefTool(context),
	createGetNewsHeadlinesTool(context),
	createListChannelTargetsTool(context),
	createListFeishuDeliveryLogsTool(context),
	createListFeishuTargetsTool(context),
	createListNewsBriefsTool(context),
	createListNewsSourcesTool(context),
	createListQqTargetsTool(context),
	createListSchedulesTool(context),
	createNowTool(context),
	createOpenUrlTool(context),
	createResolveNewsSourceTool(context),
	createReminderTool(context),
	createSavePageToKnowledgeTool(context),
	createSearchWebTool(context),
	createSearchNewsSourcesTool(context),
	createSendChannelMessageTool(context),
	createSendChatMessageTool(context),
	createSendFeishuMessageTool(context),
	createSendQqMessageTool(context),
	createSummarizePageTool(context),
	createUpdateScheduleTool(context),
];

const createChatToolSet = (context: ServerToolContext) => [
	...createMemoryTools(context),
	...createExecutionTools(context),
];

export { createChatToolSet, createExecutionTools, createMemoryTools };
