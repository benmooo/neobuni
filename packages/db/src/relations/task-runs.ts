import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const taskRunsRelations = defineRelationsPart(schema, ({
  one,
  profilesTable,
  runtimeTurnsTable,
  schedulesTable,
  taskRunsTable,
}) => ({
  taskRunsTable: {
    profile: one.profilesTable({
      from: taskRunsTable.profileId,
      to: profilesTable.id,
      optional: false,
    }),
    schedule: one.schedulesTable({
      from: taskRunsTable.scheduleId,
      to: schedulesTable.id,
      optional: false,
    }),
    runtimeTurn: one.runtimeTurnsTable({
      from: taskRunsTable.id,
      to: runtimeTurnsTable.taskRunId,
      optional: true,
    }),
  },
}));

export { taskRunsRelations };
