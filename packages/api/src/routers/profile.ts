import { profileUpdateInputSchema } from "@neobuni/contracts";
import { getProfile, listEvents, updateProfile } from "@neobuni/db";
import { ORPCError } from "@orpc/server";

import { protectedProcedure } from "../index";
import { run } from "../run";

export const profileRouter = {
  get: protectedProcedure
    .route({
      method: "GET",
      path: "/profile",
      summary: "Get the profile",
      description:
        "Return the current profile, including its timezone and display settings.",
      tags: ["Profile"],
    })
    .handler(({ context }) => run(getProfile(context.profileId))),

  update: protectedProcedure
    .route({
      method: "PATCH",
      path: "/profile",
      summary: "Update the profile",
      description:
        "Update mutable profile fields such as the timezone used for local dates and reminders.",
      tags: ["Profile"],
    })
    .input(profileUpdateInputSchema)
    .handler(async ({ input, context }) => {
      const profile = await run(updateProfile(context.profileId, input));

      if (!profile) {
        throw new ORPCError("NOT_FOUND", { message: "Profile not found" });
      }

      return profile;
    }),

  events: protectedProcedure
    .route({
      method: "GET",
      path: "/profile/events",
      summary: "List profile events",
      description:
        "Return the append-only event log for the current profile, used for activity and audit views.",
      tags: ["Profile"],
    })
    .handler(({ context }) => run(listEvents(context.profileId))),
};
