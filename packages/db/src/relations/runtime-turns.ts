import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const runtimeTurnsRelations = defineRelationsPart(schema, ({
  conversationsTable,
  many,
  messagesTable,
  one,
  profilesTable,
  runtimeSpansTable,
  taskRunsTable,
  runtimeTurnsTable,
}) => ({
  runtimeTurnsTable: {
    profile: one.profilesTable({
      from: runtimeTurnsTable.profileId,
      to: profilesTable.id,
      optional: false,
    }),
    conversation: one.conversationsTable({
      from: runtimeTurnsTable.conversationId,
      to: conversationsTable.id,
      optional: true,
    }),
    taskRun: one.taskRunsTable({
      from: runtimeTurnsTable.taskRunId,
      to: taskRunsTable.id,
      optional: true,
    }),
    messages: many.messagesTable({
      from: runtimeTurnsTable.id,
      to: messagesTable.turnId,
    }),
    spans: many.runtimeSpansTable({
      from: runtimeTurnsTable.id,
      to: runtimeSpansTable.turnId,
    }),
  },
}));

export { runtimeTurnsRelations };
