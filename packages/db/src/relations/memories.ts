import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const memoriesRelations = defineRelationsPart(schema, ({
  conversationsTable,
  memoriesTable,
  one,
  profilesTable,
}) => ({
  memoriesTable: {
    profile: one.profilesTable({
      from: memoriesTable.profileId,
      to: profilesTable.id,
      optional: false,
    }),
    conversation: one.conversationsTable({
      from: memoriesTable.conversationId,
      to: conversationsTable.id,
      optional: true,
    }),
  },
}));

export { memoriesRelations };
