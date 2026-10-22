import { defineRelationsPart } from "drizzle-orm";

import * as schema from "../schema";

const externalEventReceiptsRelations = defineRelationsPart(
	schema,
	({ externalEventReceiptsTable, one, profilesTable }) => ({
		externalEventReceiptsTable: {
			profile: one.profilesTable({
				from: externalEventReceiptsTable.profileId,
				to: profilesTable.id,
				optional: false,
			}),
		},
	})
);

export { externalEventReceiptsRelations };
