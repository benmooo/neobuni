import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const conversationsRelations = defineRelationsPart(schema, ({
  conversationsTable,
  digestAnchorsTable,
  many,
  messagesTable,
  one,
  profilesTable,
  runtimeSpansTable,
  runtimeTurnsTable,
}) => ({
  conversationsTable: {
    profile: one.profilesTable({
      from: conversationsTable.profileId,
      to: profilesTable.id,
      optional: false,
    }),
    messages: many.messagesTable({
      from: conversationsTable.id,
      to: messagesTable.conversationId,
    }),
    runtimeTurns: many.runtimeTurnsTable({
      from: conversationsTable.id,
      to: runtimeTurnsTable.conversationId,
    }),
    runtimeSpans: many.runtimeSpansTable({
      from: conversationsTable.id,
      to: runtimeSpansTable.conversationId,
    }),
    digestAnchor: one.digestAnchorsTable({
      from: conversationsTable.id,
      to: digestAnchorsTable.conversationId,
    }),
  },
}));

export { conversationsRelations };
