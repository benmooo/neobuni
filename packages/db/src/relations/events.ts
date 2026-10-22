import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const eventsRelations = defineRelationsPart(schema, ({
  eventsTable,
  one,
  profilesTable,
}) => ({
  eventsTable: {
    profile: one.profilesTable({
      from: eventsTable.profileId,
      to: profilesTable.id,
      optional: false,
    }),
  },
}));

export { eventsRelations };
