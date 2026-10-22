import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import * as schema from "../schema";

const resolveActiveSoulConfigId = Effect.fnUntraced(function* (
  profileId: string,
  currentSoulConfigId: string | null | undefined
) {
  const soulConfigId = currentSoulConfigId;
  if (typeof soulConfigId === "string" && soulConfigId.length > 0) {
    const activeSoulConfig = yield* fromPromise(
      "resolveActiveSoulConfigId",
      () =>
        db.query.soulConfigsTable.findFirst({
          where: {
            id: soulConfigId,
            profileId,
          },
        })
    );

    if (activeSoulConfig) {
      return activeSoulConfig.id;
    }
  }

  const existingSoulConfig = yield* fromPromise(
    "resolveActiveSoulConfigId",
    () =>
      db.query.soulConfigsTable.findFirst({
        where: { profileId },
      })
  );

  return existingSoulConfig?.id ?? null;
});

const getAgentConfig = Effect.fnUntraced(function* (profileId: string) {
  const existing = yield* fromPromise("getAgentConfig", () =>
    db.query.agentConfigsTable.findFirst({
      where: { profileId },
    })
  );

  if (existing) {
    const soulConfigId = yield* resolveActiveSoulConfigId(
      profileId,
      existing.soulConfigId
    );

    return {
      id: existing.id,
      profileId: existing.profileId,
      soulConfigId,
      aiName: existing.aiName,
      avatarUri: existing.avatarUri ?? "",
      userName: existing.userName,
      userPersona: existing.userPersona,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };
  }

  const now = new Date().toISOString();
  return {
    id: "agent-config-default",
    profileId,
    soulConfigId: yield* resolveActiveSoulConfigId(profileId, null),
    aiName: "Buni",
    avatarUri: "",
    userName: "You",
    userPersona: "",
    createdAt: now,
    updatedAt: now,
  };
});

const upsertAgentConfig = Effect.fnUntraced(function* (
  profileId: string,
  input: {
    aiName: string;
    avatarUri: string;
    userName: string;
    userPersona: string;
  }
) {
  const existing = yield* fromPromise("upsertAgentConfig", () =>
    db.query.agentConfigsTable.findFirst({
      where: { profileId },
    })
  );

  const now = new Date().toISOString();
  const soulConfigId = yield* resolveActiveSoulConfigId(
    profileId,
    existing?.soulConfigId
  );
  const normalizedAvatarUri = input.avatarUri.trim();

  if (!existing) {
    const next = {
      id: crypto.randomUUID(),
      profileId,
      soulConfigId,
      aiName: input.aiName,
      avatarUri: normalizedAvatarUri.length > 0 ? normalizedAvatarUri : null,
      userName: input.userName,
      userPersona: input.userPersona,
      createdAt: now,
      updatedAt: now,
    };
    yield* fromPromise("upsertAgentConfig", () =>
      db.insert(schema.agentConfigsTable).values(next)
    );
    return {
      ...next,
      avatarUri: normalizedAvatarUri,
    };
  }

  yield* fromPromise("upsertAgentConfig", () =>
    db
      .update(schema.agentConfigsTable)
      .set({
        soulConfigId,
        aiName: input.aiName,
        avatarUri: normalizedAvatarUri.length > 0 ? normalizedAvatarUri : null,
        userName: input.userName,
        userPersona: input.userPersona,
        updatedAt: now,
      })
      .where(eq(schema.agentConfigsTable.id, existing.id))
  );

  return {
    ...existing,
    soulConfigId,
    aiName: input.aiName,
    avatarUri: normalizedAvatarUri,
    userName: input.userName,
    userPersona: input.userPersona,
    updatedAt: now,
  };
});

const setAgentConfigSoulConfig = Effect.fnUntraced(function* (
  profileId: string,
  soulConfigId: string
) {
  const existing = yield* fromPromise("setAgentConfigSoulConfig", () =>
    db.query.agentConfigsTable.findFirst({
      where: { profileId },
    })
  );

  if (!existing) {
    return null;
  }

  const updatedAt = new Date().toISOString();

  yield* fromPromise("setAgentConfigSoulConfig", () =>
    db
      .update(schema.agentConfigsTable)
      .set({
        soulConfigId,
        updatedAt,
      })
      .where(eq(schema.agentConfigsTable.id, existing.id))
  );

  return {
    ...existing,
    soulConfigId,
    updatedAt,
  };
});

export { getAgentConfig, setAgentConfigSoulConfig, upsertAgentConfig };
