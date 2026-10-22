import { defineRelationsPart } from "drizzle-orm";

import * as schema from "../schema";

const messagingTargetsRelations = defineRelationsPart(schema, ({
  messagingTargetsTable,
  one,
  profilesTable,
}) => ({
  messagingTargetsTable: {
    profile: one.profilesTable({
      from: messagingTargetsTable.profileId,
      to: profilesTable.id,
      optional: false,
    }),
  },
}));

export { messagingTargetsRelations };
