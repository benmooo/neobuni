import { conversationsTable } from "./conversations";
import { runtimeTurnsTable } from "./runtime-turns";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const runtimeSpansTable = sqliteTable("runtime_spans", {
  id: text("id").primaryKey(),
  turnId: text("turn_id")
    .notNull()
    .references(() => runtimeTurnsTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  conversationId: text("conversation_id").references(() => conversationsTable.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  stage: text("stage").notNull(),
  seq: integer("seq").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  durationMs: integer("duration_ms"),
  inputJson: text("input_json"),
  outputJson: text("output_json"),
  errorJson: text("error_json"),
});

export { runtimeSpansTable };
