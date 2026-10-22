import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

const agentConfigsRelations = defineRelationsPart(
  schema,
  ({ agentConfigsTable, profilesTable, soulConfigsTable, one }) => ({
    agentConfigsTable: {
      profile: one.profilesTable({
        from: agentConfigsTable.profileId,
        to: profilesTable.id,
        optional: false,
      }),
      soulConfig: one.soulConfigsTable({
        from: agentConfigsTable.soulConfigId,
        to: soulConfigsTable.id,
        optional: true,
      }),
    },
  })
);

export { agentConfigsRelations };
