import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

const runtimeSpansRelations = defineRelationsPart(
  schema,
  ({ conversationsTable, one, runtimeSpansTable, runtimeTurnsTable }) => ({
    runtimeSpansTable: {
      turn: one.runtimeTurnsTable({
        from: runtimeSpansTable.turnId,
        to: runtimeTurnsTable.id,
        optional: false,
      }),
      conversation: one.conversationsTable({
        from: runtimeSpansTable.conversationId,
        to: conversationsTable.id,
        optional: true,
      }),
    },
  })
);

export { runtimeSpansRelations };
