import { ORPCError } from "@orpc/server";
import { Effect } from "effect";

const readTag = (error: unknown): string | null =>
	typeof error === "object" && error !== null && "_tag" in error
		? String((error as { _tag: unknown })._tag)
		: null;

const toORPCError = (error: unknown): ORPCError<string, unknown> => {
	if (error instanceof ORPCError) {
		return error;
	}

	const tag = readTag(error);

	if (tag === "UnauthorizedError") {
		return new ORPCError("UNAUTHORIZED");
	}

	if (tag === "NoActiveProfileError") {
		return new ORPCError("FORBIDDEN", {
			message: "No active profile available",
		});
	}

	if (tag === "DbError") {
		return new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Database operation failed",
			cause: error,
		});
	}

	return new ORPCError("INTERNAL_SERVER_ERROR", {
		message: error instanceof Error ? error.message : "Unexpected error",
		cause: error,
	});
};

/**
 * Run an Effect-returning procedure body and translate domain errors into
 * oRPC errors at the transport edge.
 */
export const run = async <A>(effect: Effect.Effect<A, unknown>): Promise<A> => {
	try {
		return await Effect.runPromise(effect);
	} catch (error) {
		throw toORPCError(error);
	}
};

export { toORPCError };
