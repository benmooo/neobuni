import { defineRelationsPart } from "drizzle-orm";

import * as schema from "../schema";

const messagingIntegrationsRelations = defineRelationsPart(
  schema,
  ({ messagingIntegrationsTable, one, profilesTable }) => ({
    messagingIntegrationsTable: {
      profile: one.profilesTable({
        from: messagingIntegrationsTable.profileId,
        to: profilesTable.id,
        optional: false,
      }),
    },
  })
);

export { messagingIntegrationsRelations };
