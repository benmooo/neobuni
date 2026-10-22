import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const digestAnchorsRelations = defineRelationsPart(schema, ({
  conversationsTable,
  digestAnchorsTable,
  messagesTable,
  one,
  profilesTable,
}) => ({
  digestAnchorsTable: {
    profile: one.profilesTable({
      from: digestAnchorsTable.profileId,
      to: profilesTable.id,
      optional: false,
    }),
    conversation: one.conversationsTable({
      from: digestAnchorsTable.conversationId,
      to: conversationsTable.id,
      optional: false,
    }),
    lastMessage: one.messagesTable({
      from: digestAnchorsTable.lastMessageId,
      to: messagesTable.id,
      optional: false,
    }),
  },
}));

export { digestAnchorsRelations };
