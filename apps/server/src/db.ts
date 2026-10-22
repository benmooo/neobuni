import * as api from "@neobuni/db";
import { Effect } from "effect";

type Awaited0<T> = T extends Effect.Effect<infer A, unknown, unknown> ? A : T;

type PromiseApi<T> = {
	[K in keyof T]: T[K] extends (...args: infer P) => infer R
		? (...args: P) => Promise<Awaited0<R>>
		: T[K];
};

/**
 * Promise bridge over the Effect-typed repository package.
 *
 * Imperative adapters (tool handlers, SDK glue, webhook clients) are allowed to
 * speak Promise. Effect-native orchestration must `yield*` repositories directly
 * instead of using this bridge.
 */
export const dbp = new Proxy(api, {
	get(target, property, receiver) {
		const value = Reflect.get(target, property, receiver);

		if (typeof value !== "function") {
			return value;
		}

		return (...args: unknown[]) =>
			Effect.runPromise(
				(value as (...input: unknown[]) => Effect.Effect<unknown, unknown>)(
					...args
				)
			);
	},
}) as unknown as PromiseApi<typeof api>;
