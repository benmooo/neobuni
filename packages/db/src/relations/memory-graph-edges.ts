import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const memoryGraphEdgesRelations = defineRelationsPart(schema, ({
  memoryGraphEdgesTable,
  memoryGraphNodesTable,
  one,
  profilesTable,
}) => ({
  memoryGraphEdgesTable: {
    profile: one.profilesTable({
      from: memoryGraphEdgesTable.profileId,
      to: profilesTable.id,
      optional: false,
    }),
    fromNode: one.memoryGraphNodesTable({
      from: memoryGraphEdgesTable.fromNodeId,
      to: memoryGraphNodesTable.id,
      optional: false,
    }),
    toNode: one.memoryGraphNodesTable({
      from: memoryGraphEdgesTable.toNodeId,
      to: memoryGraphNodesTable.id,
      optional: false,
    }),
  },
}));

export { memoryGraphEdgesRelations };
