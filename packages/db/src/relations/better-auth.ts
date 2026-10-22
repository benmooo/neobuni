import { defineRelationsPart } from "drizzle-orm";

import * as schema from "../schema";

const betterAuthRelations = defineRelationsPart(
  schema,
  ({ accountsTable, many, one, profilesTable, sessionsTable, usersTable }) => ({
    usersTable: {
      accounts: many.accountsTable({
        from: usersTable.id,
        to: accountsTable.userId,
      }),
      profiles: many.profilesTable({
        from: usersTable.id,
        to: profilesTable.ownerUserId,
      }),
      sessions: many.sessionsTable({
        from: usersTable.id,
        to: sessionsTable.userId,
      }),
    },
    sessionsTable: {
      activeProfile: one.profilesTable({
        from: sessionsTable.activeProfileId,
        to: profilesTable.id,
        optional: true,
      }),
      user: one.usersTable({
        from: sessionsTable.userId,
        to: usersTable.id,
        optional: false,
      }),
    },
    accountsTable: {
      user: one.usersTable({
        from: accountsTable.userId,
        to: usersTable.id,
        optional: false,
      }),
    },
  })
);

export { betterAuthRelations };
