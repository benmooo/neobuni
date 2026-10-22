import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

const memoriesRelations = defineRelationsPart(
  schema,
  ({ conversationsTable, memoriesTable, one, profilesTable }) => ({
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
  })
);

export { memoriesRelations };
