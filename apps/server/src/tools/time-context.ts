import { formatLocalDisplay, normalizeTimeZone } from "./datetime-utils";
import type { ServerToolContext } from "./types";

const getEffectiveToolTimezone = (input: {
  requestedTimezone?: string | null;
  profileTimezone: ServerToolContext["profileTimezone"];
  clientTimezone: ServerToolContext["clientTimezone"];
  defaultTimezone: ServerToolContext["defaultTimezone"];
}) =>
  normalizeTimeZone(
    input.requestedTimezone ??
      input.profileTimezone ??
      input.clientTimezone ??
      input.defaultTimezone,
    input.defaultTimezone
  );

const getNowSnapshot = (
  context: Pick<
    ServerToolContext,
    "referenceNow" | "profileTimezone" | "clientTimezone" | "defaultTimezone"
  >
) => {
  const timezone = getEffectiveToolTimezone({
    profileTimezone: context.profileTimezone,
    clientTimezone: context.clientTimezone,
    defaultTimezone: context.defaultTimezone,
  });

  return {
    referenceNow: context.referenceNow,
    timezone,
    localDisplay: formatLocalDisplay(context.referenceNow, timezone),
  };
};

export { getEffectiveToolTimezone, getNowSnapshot };
