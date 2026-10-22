import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireActiveProfile = o.middleware(async ({ context, next }) => {
	const { session, userId, profileId, profile } = context;

	if (!(session && userId && profileId && profile)) {
		throw new ORPCError("UNAUTHORIZED");
	}

	return next({
		context: {
			session,
			userId,
			profileId,
			profile,
		},
	});
});

export const protectedProcedure = publicProcedure.use(requireActiveProfile);
