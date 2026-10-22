import {
  type SoulConfig,
  type SoulConfigInput,
  soulConfigInputSchema,
} from "@neobuni/contracts";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import {
  buildDefaultSoulConfigInput,
  SOUL_SCHEMA_VERSION,
} from "../defaults/soul-config";
import { soulConfigsTable } from "../schema";
import { setAgentConfigSoulConfig } from "./agent-config";

const toSoulConfig = (
  profileId: string,
  metadata: {
    id: string;
    version: number;
    createdAt: string;
    updatedAt: string;
  },
  input: SoulConfigInput
): SoulConfig => ({
  ...input,
  id: metadata.id,
  profileId,
  version: metadata.version,
  createdAt: metadata.createdAt,
  updatedAt: metadata.updatedAt,
});

const parseSoulConfigInput = (value: string): SoulConfigInput | null => {
  try {
    const parsed = JSON.parse(value) as unknown;
    const result = soulConfigInputSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

const findActiveSoulConfigRow = Effect.fnUntraced(function* (
  profileId: string
) {
  const agentConfig = yield* fromPromise("findActiveSoulConfigRow", () =>
    db.query.agentConfigsTable.findFirst({
      where: { profileId },
    })
  );

  const soulConfigId = agentConfig?.soulConfigId;
  if (typeof soulConfigId === "string" && soulConfigId.length > 0) {
    const activeSoulConfig = yield* fromPromise("findActiveSoulConfigRow", () =>
      db.query.soulConfigsTable.findFirst({
        where: {
          id: soulConfigId,
          profileId,
        },
      })
    );

    if (activeSoulConfig) {
      return activeSoulConfig;
    }
  }

  return yield* fromPromise("findActiveSoulConfigRow", () =>
    db.query.soulConfigsTable.findFirst({
      where: { profileId },
    })
  );
});

const getSoulConfig = Effect.fnUntraced(function* (profileId: string) {
  const existing = yield* findActiveSoulConfigRow(profileId);

  if (!existing) {
    const now = new Date().toISOString();
    return toSoulConfig(
      profileId,
      {
        id: "soul-config-default",
        version: SOUL_SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
      },
      buildDefaultSoulConfigInput()
    );
  }

  return toSoulConfig(
    profileId,
    {
      id: existing.id,
      version: existing.version,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    },
    parseSoulConfigInput(existing.configJson) ?? buildDefaultSoulConfigInput()
  );
});

const upsertSoulConfig = Effect.fnUntraced(function* (
  profileId: string,
  input: SoulConfigInput
) {
  const existing = yield* findActiveSoulConfigRow(profileId);

  const now = new Date().toISOString();
  const normalizedInput = soulConfigInputSchema.parse(input);
  const configJson = JSON.stringify(normalizedInput);

  if (!existing) {
    const next = {
      id: crypto.randomUUID(),
      profileId,
      version: SOUL_SCHEMA_VERSION,
      configJson,
      createdAt: now,
      updatedAt: now,
    };

    yield* fromPromise("upsertSoulConfig", () =>
      db.insert(soulConfigsTable).values(next)
    );
    yield* setAgentConfigSoulConfig(profileId, next.id);

    return toSoulConfig(
      profileId,
      {
        id: next.id,
        version: next.version,
        createdAt: next.createdAt,
        updatedAt: next.updatedAt,
      },
      normalizedInput
    );
  }

  const updates = {
    version: SOUL_SCHEMA_VERSION,
    configJson,
    updatedAt: now,
  };

  yield* fromPromise("upsertSoulConfig", () =>
    db
      .update(soulConfigsTable)
      .set(updates)
      .where(eq(soulConfigsTable.id, existing.id))
  );
  yield* setAgentConfigSoulConfig(profileId, existing.id);

  return toSoulConfig(
    profileId,
    {
      id: existing.id,
      version: updates.version,
      createdAt: existing.createdAt,
      updatedAt: updates.updatedAt,
    },
    normalizedInput
  );
});

export { getSoulConfig, upsertSoulConfig };
