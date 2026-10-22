import { Effect, Schema } from "effect";

export { Effect };

export class AdapterError extends Schema.TaggedError<AdapterError>()(
  "AdapterError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  }
) {}

/** Lift a promise-returning adapter call into Effect. */
export const tryPromise = <A>(
  operation: string,
  run: () => Promise<A>
): Effect.Effect<A, AdapterError> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new AdapterError({ operation, cause }),
  });
