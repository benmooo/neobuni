import { defineRelations } from "drizzle-orm";

import * as schema from "../schema";
import { agentConfigsRelations } from "./agent-configs";
import { betterAuthRelations } from "./better-auth";
import { conversationsRelations } from "./conversations";
import { digestAnchorsRelations } from "./digest-anchors";
import { eventsRelations } from "./events";
import { externalConversationBindingsRelations } from "./external-conversation-bindings";
import { externalEventReceiptsRelations } from "./external-event-receipts";
import { knowledgeChunksRelations } from "./knowledge-chunks";
import { knowledgeDocumentsRelations } from "./knowledge-documents";
import { knowledgeFactsRelations } from "./knowledge-facts";
import { memoriesRelations } from "./memories";
import { memoryConflictsRelations } from "./memory-conflicts";
import { memoryGraphEdgesRelations } from "./memory-graph-edges";
import { memoryGraphNodesRelations } from "./memory-graph-nodes";
import { memoryGraphSourcesRelations } from "./memory-graph-sources";
import { messagesRelations } from "./messages";
import { messagingIntegrationsRelations } from "./messaging-integrations";
import { messagingTargetsRelations } from "./messaging-targets";
import { profilesRelations } from "./profiles";
import { providerConfigsRelations } from "./provider-configs";
import { runtimeSpansRelations } from "./runtime-spans";
import { runtimeTurnsRelations } from "./runtime-turns";
import { schedulesRelations } from "./schedules";
import { soulConfigsRelations } from "./soul-configs";
import { taskRunsRelations } from "./task-runs";

const relations = {
	...defineRelations(schema),
	...schema.authRelations,
	...betterAuthRelations,
	...profilesRelations,
	...agentConfigsRelations,
	...providerConfigsRelations,
	...messagingIntegrationsRelations,
	...messagingTargetsRelations,
	...runtimeTurnsRelations,
	...runtimeSpansRelations,
	...taskRunsRelations,
	...soulConfigsRelations,
	...conversationsRelations,
	...messagesRelations,
	...digestAnchorsRelations,
	...eventsRelations,
	...externalConversationBindingsRelations,
	...externalEventReceiptsRelations,
	...memoryGraphNodesRelations,
	...memoryGraphEdgesRelations,
	...memoryGraphSourcesRelations,
	...knowledgeDocumentsRelations,
	...knowledgeChunksRelations,
	...knowledgeFactsRelations,
	...memoryConflictsRelations,
	...memoriesRelations,
	...schedulesRelations,
};

export { relations };
