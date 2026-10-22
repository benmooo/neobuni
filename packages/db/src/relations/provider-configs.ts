import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const providerConfigsRelations = defineRelationsPart(schema, ({
  one,
  profilesTable,
  providerConfigsTable,
}) => ({
  providerConfigsTable: {
    profile: one.profilesTable({
      from: providerConfigsTable.profileId,
      to: profilesTable.id,
      optional: false,
    }),
  },
}));

export { providerConfigsRelations };
