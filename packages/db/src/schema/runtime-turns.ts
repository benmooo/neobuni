import { conversationsTable } from "./conversations";
import { profilesTable } from "./profiles";
import { taskRunsTable } from "./task-runs";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const runtimeTurnsTable = sqliteTable("runtime_turns", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profilesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  conversationId: text("conversation_id").references(() => conversationsTable.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  executionSource: text("execution_source").notNull().default("chat"),
  taskRunId: text("task_run_id").references(() => taskRunsTable.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  requestMessageId: text("request_message_id"),
  responseMessageId: text("response_message_id"),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  durationMs: integer("duration_ms"),
  providerKey: text("provider_key").notNull(),
  modelKey: text("model_key").notNull(),
  protectiveLevel: integer("protective_level"),
  primaryStance: text("primary_stance"),
  memoryCount: integer("memory_count").notNull().default(0),
  memoryRecallStrategy: text("memory_recall_strategy"),
  preRecallCount: integer("pre_recall_count").notNull().default(0),
  toolCallCount: integer("tool_call_count").notNull().default(0),
  hadToolFailures: integer("had_tool_failures").notNull().default(0),
  hadToolRecall: integer("had_tool_recall").notNull().default(0),
  errorCode: text("error_code"),
  errorJson: text("error_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export { runtimeTurnsTable };
