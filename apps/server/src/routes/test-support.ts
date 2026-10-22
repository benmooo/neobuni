import type { Context } from "@neobuni/api/context";
import { ORPCError } from "@orpc/server";

/**
 * Minimal oRPC context for direct procedure calls in tests.
 *
 * `session`, `db`, and `profile` are opaque to the procedures under test once
 * the active profile id is known, so placeholders keep the call sites focused
 * on the behaviour being asserted.
 */
export const createTestContext = (profileId = "profile-1"): Context => ({
  session: {
    user: { id: "user-1" },
    session: { id: "session-1" },
  } as never,
  db: {} as never,
  userId: "user-1",
  profileId,
  profile: { id: profileId } as never,
});

export const captureOrpcError = async (
  run: () => Promise<unknown>
): Promise<ORPCError<string, unknown>> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof ORPCError) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected procedure call to fail.");
};
