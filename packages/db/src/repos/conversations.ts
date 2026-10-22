import { makeConversation } from "@neobuni/core";
import { and, desc, eq } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import { conversationsTable } from "../schema";

const createConversationRecord = makeConversation();

const buildConversationWhere = (input: {
  profileId?: string;
  id?: string;
  includeHidden?: boolean;
}) => {
  const clauses = [
    input.profileId ? eq(conversationsTable.profileId, input.profileId) : null,
    input.id ? eq(conversationsTable.id, input.id) : null,
    input.includeHidden ? null : eq(conversationsTable.hidden, false),
  ].filter((value) => value !== null);

  if (clauses.length === 0) {
    return undefined;
  }

  if (clauses.length === 1) {
    return clauses[0] ?? undefined;
  }

  return and(...clauses);
};

const listConversations = Effect.fnUntraced(function* (
  profileId: string,
  options?: {
    includeHidden?: boolean;
  }
) {
  return yield* fromPromise("listConversations", () =>
    db
      .select()
      .from(conversationsTable)
      .where(
        buildConversationWhere({
          profileId,
          includeHidden: options?.includeHidden,
        })
      )
      .orderBy(desc(conversationsTable.updatedAt))
  );
});

const createConversation = Effect.fnUntraced(function* (
  profileId: string,
  input: { title: string; modelKey: string; hidden?: boolean }
) {
  const next = createConversationRecord({
    profileId,
    title: input.title,
    modelKey: input.modelKey,
    hidden: input.hidden ?? false,
  });

  yield* fromPromise("createConversation", () =>
    db.insert(conversationsTable).values(next)
  );
  return next;
});

const getConversation = Effect.fnUntraced(function* (
  id: string,
  options?: {
    includeHidden?: boolean;
  }
) {
  const [existing] = yield* fromPromise("getConversation", () =>
    db
      .select()
      .from(conversationsTable)
      .where(
        buildConversationWhere({
          id,
          includeHidden: options?.includeHidden,
        })
      )
      .limit(1)
  );

  return existing ?? null;
});

const deleteConversation = Effect.fnUntraced(function* (id: string) {
  yield* fromPromise("deleteConversation", () =>
    db.delete(conversationsTable).where(eq(conversationsTable.id, id))
  );
});

const updateConversationTitle = Effect.fnUntraced(function* (
  id: string,
  title: string
) {
  yield* fromPromise("updateConversationTitle", () =>
    db
      .update(conversationsTable)
      .set({ title, updatedAt: new Date().toISOString() })
      .where(eq(conversationsTable.id, id))
  );
});

export {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  updateConversationTitle,
};
