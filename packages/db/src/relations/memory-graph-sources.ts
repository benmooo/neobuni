import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const memoryGraphSourcesRelations = defineRelationsPart(schema, ({
  memoryGraphSourcesTable,
  one,
  profilesTable,
}) => ({
  memoryGraphSourcesTable: {
    profile: one.profilesTable({
      from: memoryGraphSourcesTable.profileId,
      to: profilesTable.id,
      optional: false,
    }),
  },
}));

export { memoryGraphSourcesRelations };
