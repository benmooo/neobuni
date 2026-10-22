import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

const eventsRelations = defineRelationsPart(
	schema,
	({ eventsTable, one, profilesTable }) => ({
		eventsTable: {
			profile: one.profilesTable({
				from: eventsTable.profileId,
				to: profilesTable.id,
				optional: false,
			}),
		},
	})
);

export { eventsRelations };
