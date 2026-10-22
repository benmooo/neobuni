import { defineRelationsPart } from "drizzle-orm";

import * as schema from "../schema";

const externalConversationBindingsRelations = defineRelationsPart(
  schema,
  ({
    conversationsTable,
    externalConversationBindingsTable,
    one,
    profilesTable,
  }) => ({
    externalConversationBindingsTable: {
      conversation: one.conversationsTable({
        from: externalConversationBindingsTable.conversationId,
        to: conversationsTable.id,
        optional: false,
      }),
      profile: one.profilesTable({
        from: externalConversationBindingsTable.profileId,
        to: profilesTable.id,
        optional: false,
      }),
    },
  })
);

export { externalConversationBindingsRelations };
