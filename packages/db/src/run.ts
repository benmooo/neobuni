import { Effect } from "effect";

/**
 * Run a repository Effect from legacy async adapter code.
 *
 * Repositories are Effect-typed; imperative adapters (tool handlers, HTTP
 * clients, third-party SDK glue) still speak Promise. This is the single
 * sanctioned bridge for that boundary.
 */
export const runRepo = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
	Effect.runPromise(effect);
