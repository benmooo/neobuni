import type { Profile } from "@neobuni/contracts";
import {
  type DbError,
  getPreferredProfileIdForUser,
  getProfileForUser,
  setSessionActiveProfile,
} from "@neobuni/db";
import { Effect, Schema } from "effect";

import type { auth as AuthInstance } from "../services";

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  { message: Schema.String }
) {}

export class NoActiveProfileError extends Schema.TaggedError<NoActiveProfileError>()(
  "NoActiveProfileError",
  { message: Schema.String }
) {}

type AuthSession = NonNullable<
  Awaited<ReturnType<typeof AuthInstance.api.getSession>>
>;

const requireSession = (auth: typeof AuthInstance, request: Request) =>
  Effect.tryPromise({
    try: async () => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        throw new UnauthorizedError({ message: "Unauthorized" });
      }
      return session as AuthSession;
    },
    catch: (cause) =>
      cause instanceof UnauthorizedError
        ? cause
        : new UnauthorizedError({ message: "Unauthorized" }),
  });

export interface ActiveProfileContext {
  profile: Profile;
  profileId: string;
  session: AuthSession;
  userId: string;
}

export const requireActiveProfile = (
  auth: typeof AuthInstance,
  request: Request
): Effect.Effect<
  ActiveProfileContext,
  UnauthorizedError | NoActiveProfileError | DbError
> =>
  Effect.gen(function* () {
    const session = yield* requireSession(auth, request);
    const userId = session.user.id;

    const preferredProfileId =
      session.session.activeProfileId ??
      (yield* getPreferredProfileIdForUser(userId));

    if (!preferredProfileId) {
      return yield* new NoActiveProfileError({
        message: "No active profile available",
      });
    }

    const profile = yield* getProfileForUser(userId, preferredProfileId);

    if (!profile) {
      return yield* new NoActiveProfileError({
        message: "Active profile is unavailable",
      });
    }

    if (session.session.activeProfileId !== profile.id) {
      yield* setSessionActiveProfile(session.session.id, profile.id);
    }

    return {
      session,
      userId,
      profileId: profile.id,
      profile,
    };
  });
