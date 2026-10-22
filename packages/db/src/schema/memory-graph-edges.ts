import { real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { memoryGraphNodesTable } from "./memory-graph-nodes";
import { profilesTable } from "./profiles";

const memoryGraphEdgesTable = sqliteTable("memory_graph_edges", {
	id: text("id").primaryKey(),
	profileId: text("profile_id")
		.notNull()
		.references(() => profilesTable.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
	fromNodeId: text("from_node_id")
		.notNull()
		.references(() => memoryGraphNodesTable.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
	relationType: text("relation_type").notNull(),
	toNodeId: text("to_node_id")
		.notNull()
		.references(() => memoryGraphNodesTable.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
	weight: real("weight").notNull().default(1),
	sourceType: text("source_type").notNull(),
	sourceId: text("source_id").notNull(),
	validFromTs: text("valid_from_ts"),
	validToTs: text("valid_to_ts"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export { memoryGraphEdgesTable };
