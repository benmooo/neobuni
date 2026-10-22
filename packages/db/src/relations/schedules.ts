import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const schedulesRelations = defineRelationsPart(schema, ({
  many,
  one,
  profilesTable,
  schedulesTable,
  taskRunsTable,
}) => ({
  schedulesTable: {
    profile: one.profilesTable({
      from: schedulesTable.profileId,
      to: profilesTable.id,
      optional: false,
    }),
    taskRuns: many.taskRunsTable({
      from: schedulesTable.id,
      to: taskRunsTable.scheduleId,
    }),
  },
}));

export { schedulesRelations };
