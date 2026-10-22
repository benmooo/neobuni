import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const agentConfigsRelations = defineRelationsPart(schema, ({
  agentConfigsTable,
  profilesTable,
  soulConfigsTable,
  one,
}) => ({
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
}));

export { agentConfigsRelations };
