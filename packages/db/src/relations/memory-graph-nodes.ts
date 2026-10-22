import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

const memoryGraphNodesRelations = defineRelationsPart(
	schema,
	({
		many,
		memoryGraphEdgesTable,
		memoryGraphNodesTable,
		one,
		profilesTable,
	}) => ({
		memoryGraphNodesTable: {
			profile: one.profilesTable({
				from: memoryGraphNodesTable.profileId,
				to: profilesTable.id,
				optional: false,
			}),
			outgoingEdges: many.memoryGraphEdgesTable({
				from: memoryGraphNodesTable.id,
				to: memoryGraphEdgesTable.fromNodeId,
			}),
			incomingEdges: many.memoryGraphEdgesTable({
				from: memoryGraphNodesTable.id,
				to: memoryGraphEdgesTable.toNodeId,
			}),
		},
	})
);

export { memoryGraphNodesRelations };
