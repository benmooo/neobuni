import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";

import { externalConversationBindingsTable } from "./external-conversation-bindings";
import { externalEventReceiptsTable } from "./external-event-receipts";
import { messagingIntegrationsTable } from "./messaging-integrations";
import { messagingTargetsTable } from "./messaging-targets";

const readIndexColumnName = (column: unknown) => {
  if (
    typeof column === "object" &&
    column !== null &&
    "name" in column &&
    typeof column.name === "string"
  ) {
    return column.name;
  }

  return String(column);
};

const readIndexes = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).indexes.map((index) => ({
    name: index.config.name,
    unique: index.config.unique,
    columns: index.config.columns.map(readIndexColumnName),
  }));

describe("messaging schema indexes", () => {
  test("declares the integration uniqueness index", () => {
    expect(readIndexes(messagingIntegrationsTable)).toContainEqual({
      name: "messaging_integrations_profile_platform_idx",
      unique: true,
      columns: ["profile_id", "platform"],
    });
  });

  test("declares the target alias uniqueness index", () => {
    expect(readIndexes(messagingTargetsTable)).toContainEqual({
      name: "messaging_targets_profile_platform_alias_idx",
      unique: true,
      columns: ["profile_id", "platform", "alias"],
    });
  });

  test("declares the external conversation scope uniqueness index", () => {
    expect(readIndexes(externalConversationBindingsTable)).toContainEqual({
      name: "external_conversation_bindings_scope_idx",
      unique: true,
      columns: ["profile_id", "platform", "scope_type", "scope_key"],
    });
  });

  test("declares the external event receipt uniqueness index", () => {
    expect(readIndexes(externalEventReceiptsTable)).toContainEqual({
      name: "external_event_receipts_event_idx",
      unique: true,
      columns: ["profile_id", "platform", "event_id"],
    });
  });
});
