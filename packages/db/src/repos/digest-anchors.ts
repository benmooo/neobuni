import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import { digestAnchorsTable } from "../schema";

const getDigestAnchor = Effect.fnUntraced(function* (
  profileId: string,
  conversationId: string
) {
  const existing = yield* fromPromise("getDigestAnchor", () =>
    db.query.digestAnchorsTable.findFirst({
      where: {
        profileId,
        conversation: {
          id: conversationId,
        },
      },
    })
  );

  return existing ?? null;
});

const upsertDigestAnchor = Effect.fnUntraced(function* (
  profileId: string,
  conversationId: string,
  lastMessageId: string,
  lastMessageTs: string
) {
  const existing = yield* getDigestAnchor(profileId, conversationId);
  const now = new Date().toISOString();

  if (existing) {
    yield* fromPromise("upsertDigestAnchor", () =>
      db
        .update(digestAnchorsTable)
        .set({ lastMessageId, lastMessageTs })
        .where(eq(digestAnchorsTable.id, existing.id))
    );
    return { ...existing, lastMessageId, lastMessageTs };
  }

  const record = {
    id: crypto.randomUUID(),
    profileId,
    conversationId,
    lastMessageId,
    lastMessageTs,
    createdAt: now,
  };

  yield* fromPromise("upsertDigestAnchor", () =>
    db.insert(digestAnchorsTable).values(record)
  );
  return record;
});

export { getDigestAnchor, upsertDigestAnchor };
