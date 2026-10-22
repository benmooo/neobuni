import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const profilesRelations = defineRelationsPart(schema, ({
  agentConfigsTable,
  conversationsTable,
  digestAnchorsTable,
  eventsTable,
  externalConversationBindingsTable,
  externalEventReceiptsTable,
  knowledgeDocumentsTable,
  memoryGraphEdgesTable,
  memoryGraphNodesTable,
  memoryGraphSourcesTable,
  many,
  memoriesTable,
  messagingIntegrationsTable,
  messagingTargetsTable,
  one,
  profilesTable,
  providerConfigsTable,
  runtimeTurnsTable,
  schedulesTable,
  sessionsTable,
  soulConfigsTable,
  taskRunsTable,
  usersTable,
}) => ({
  profilesTable: {
    agentConfigs: many.agentConfigsTable({
      from: profilesTable.id,
      to: agentConfigsTable.profileId,
    }),
    conversations: many.conversationsTable({
      from: profilesTable.id,
      to: conversationsTable.profileId,
    }),
    digestAnchors: many.digestAnchorsTable({
      from: profilesTable.id,
      to: digestAnchorsTable.profileId,
    }),
    events: many.eventsTable({
      from: profilesTable.id,
      to: eventsTable.profileId,
    }),
    externalConversationBindings: many.externalConversationBindingsTable({
      from: profilesTable.id,
      to: externalConversationBindingsTable.profileId,
    }),
    externalEventReceipts: many.externalEventReceiptsTable({
      from: profilesTable.id,
      to: externalEventReceiptsTable.profileId,
    }),
    knowledgeDocuments: many.knowledgeDocumentsTable({
      from: profilesTable.id,
      to: knowledgeDocumentsTable.profileId,
    }),
    memoryGraphEdges: many.memoryGraphEdgesTable({
      from: profilesTable.id,
      to: memoryGraphEdgesTable.profileId,
    }),
    memoryGraphNodes: many.memoryGraphNodesTable({
      from: profilesTable.id,
      to: memoryGraphNodesTable.profileId,
    }),
    memoryGraphSources: many.memoryGraphSourcesTable({
      from: profilesTable.id,
      to: memoryGraphSourcesTable.profileId,
    }),
    memories: many.memoriesTable({
      from: profilesTable.id,
      to: memoriesTable.profileId,
    }),
    messagingIntegrations: many.messagingIntegrationsTable({
      from: profilesTable.id,
      to: messagingIntegrationsTable.profileId,
    }),
    messagingTargets: many.messagingTargetsTable({
      from: profilesTable.id,
      to: messagingTargetsTable.profileId,
    }),
    providerConfigs: many.providerConfigsTable({
      from: profilesTable.id,
      to: providerConfigsTable.profileId,
    }),
    runtimeTurns: many.runtimeTurnsTable({
      from: profilesTable.id,
      to: runtimeTurnsTable.profileId,
    }),
    soulConfigs: many.soulConfigsTable({
      from: profilesTable.id,
      to: soulConfigsTable.profileId,
    }),
    schedules: many.schedulesTable({
      from: profilesTable.id,
      to: schedulesTable.profileId,
    }),
    taskRuns: many.taskRunsTable({
      from: profilesTable.id,
      to: taskRunsTable.profileId,
    }),
    owner: one.usersTable({
      from: profilesTable.ownerUserId,
      to: usersTable.id,
      optional: true,
    }),
    sessions: many.sessionsTable({
      from: profilesTable.id,
      to: sessionsTable.activeProfileId,
    }),
  },
}));

export { profilesRelations };
