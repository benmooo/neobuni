import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

const providerConfigsRelations = defineRelationsPart(
  schema,
  ({ one, profilesTable, providerConfigsTable }) => ({
    providerConfigsTable: {
      profile: one.profilesTable({
        from: providerConfigsTable.profileId,
        to: profilesTable.id,
        optional: false,
      }),
    },
  })
);

export { providerConfigsRelations };
