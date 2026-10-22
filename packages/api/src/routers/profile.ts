import { profileUpdateInputSchema } from "@neobuni/contracts";
import { getProfile, listEvents, updateProfile } from "@neobuni/db";
import { ORPCError } from "@orpc/server";

import { protectedProcedure } from "../index";
import { run } from "../run";

export const profileRouter = {
  get: protectedProcedure.handler(({ context }) =>
    run(getProfile(context.profileId))
  ),

  update: protectedProcedure
    .input(profileUpdateInputSchema)
    .handler(async ({ input, context }) => {
      const profile = await run(updateProfile(context.profileId, input));

      if (!profile) {
        throw new ORPCError("NOT_FOUND", { message: "Profile not found" });
      }

      return profile;
    }),

  events: protectedProcedure.handler(({ context }) =>
    run(listEvents(context.profileId))
  ),
};
