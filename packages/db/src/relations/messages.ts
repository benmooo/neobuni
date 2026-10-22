import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const messagesRelations = defineRelationsPart(schema, ({
  conversationsTable,
  digestAnchorsTable,
  many,
  messagesTable,
  one,
  runtimeTurnsTable,
}) => ({
  messagesTable: {
    conversation: one.conversationsTable({
      from: messagesTable.conversationId,
      to: conversationsTable.id,
      optional: false,
    }),
    turn: one.runtimeTurnsTable({
      from: messagesTable.turnId,
      to: runtimeTurnsTable.id,
    }),
    digestAnchors: many.digestAnchorsTable({
      from: messagesTable.id,
      to: digestAnchorsTable.lastMessageId,
    }),
  },
}));

export { messagesRelations };
