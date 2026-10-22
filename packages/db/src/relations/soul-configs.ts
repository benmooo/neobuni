import { defineRelationsPart } from "drizzle-orm";

import * as schema from "../schema";

const soulConfigsRelations = defineRelationsPart(
	schema,
	({ agentConfigsTable, many, one, profilesTable, soulConfigsTable }) => ({
		soulConfigsTable: {
			agentConfigs: many.agentConfigsTable({
				from: soulConfigsTable.id,
				to: agentConfigsTable.soulConfigId,
			}),
			profile: one.profilesTable({
				from: soulConfigsTable.profileId,
				to: profilesTable.id,
				optional: false,
			}),
		},
	})
);

export { soulConfigsRelations };
