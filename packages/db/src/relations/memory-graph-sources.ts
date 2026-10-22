import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

const memoryGraphSourcesRelations = defineRelationsPart(
  schema,
  ({ memoryGraphSourcesTable, one, profilesTable }) => ({
    memoryGraphSourcesTable: {
      profile: one.profilesTable({
        from: memoryGraphSourcesTable.profileId,
        to: profilesTable.id,
        optional: false,
      }),
    },
  })
);

export { memoryGraphSourcesRelations };
