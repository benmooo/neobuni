import { makeEvent } from "@neobuni/core";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import { eventsTable } from "../schema";

const createEventRecord = makeEvent();

const parsePayload = (value: string) => {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const listEvents = Effect.fnUntraced(function* (profileId: string) {
  const rows = yield* fromPromise("listEvents", () =>
    db.query.eventsTable.findMany({
      where: { profileId },
      orderBy: { createdAt: "desc" },
    })
  );

  return rows.map((row) => ({
    id: row.id,
    profileId: row.profileId,
    type: row.type,
    payload: parsePayload(row.payloadJson),
    createdAt: row.createdAt,
  }));
});

const appendEvent = Effect.fnUntraced(function* (
  profileId: string,
  type: string,
  payload: Record<string, unknown>
) {
  const record = createEventRecord({ profileId, type, payload });
  yield* fromPromise("appendEvent", () =>
    db.insert(eventsTable).values(record)
  );

  return {
    id: record.id,
    profileId: record.profileId,
    type: record.type,
    payload,
    createdAt: record.createdAt,
  };
});

export { appendEvent, listEvents };
