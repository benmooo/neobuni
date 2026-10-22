import type { Context as ApiContext } from "@neobuni/api/context";
import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import type { Context as HonoContext } from "hono";

import { requireActiveProfile } from "./auth/context";
import { auth, db } from "./services";

export type CreateContextOptions = {
	context: HonoContext;
};

export async function createContext({
	context,
}: CreateContextOptions): Promise<ApiContext> {
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});

	if (!session) {
		return {
			db,
			session: null,
			userId: null,
			profileId: null,
			profile: null,
		};
	}

	try {
		const active = await Effect.runPromise(
			requireActiveProfile(auth, context.req.raw)
		);

		return {
			db,
			session,
			userId: active.userId,
			profileId: active.profileId,
			profile: active.profile,
		};
	} catch (error) {
		const tag =
			typeof error === "object" && error !== null && "_tag" in error
				? String(error._tag)
				: "";

		if (tag === "UnauthorizedError") {
			throw new ORPCError("UNAUTHORIZED");
		}

		throw new ORPCError("FORBIDDEN", {
			message: "No active profile available",
		});
	}
}

export type Context = Awaited<ReturnType<typeof createContext>>;
