import "varlock/auto-load";

import { cleanupRunningRuntimeTurns, ensureSchema } from "@neobuni/db";
import { Effect, Fiber } from "effect";

import { startActionRunWorker } from "./action-runs/worker";
import { app } from "./app";
import { startInitiativeWorker } from "./decision/initiative-worker";
import { ENV } from "./env.server";
import { startScheduleMaterializer } from "./schedules/materializer";
import { startTaskRunWorker } from "./task-runs/worker";

await ensureSchema();

const runtimeCleanup = await Effect.runPromise(
	cleanupRunningRuntimeTurns({
		status: "aborted",
		reason: "server_startup_recovery",
	})
);

if (runtimeCleanup.turnCount > 0) {
	console.warn(
		`[neobuni/server] recovered ${runtimeCleanup.turnCount} runtime turn(s) and ${runtimeCleanup.spanCount} span(s)`
	);
}

const fibers = [
	Effect.runFork(startScheduleMaterializer()),
	Effect.runFork(startTaskRunWorker()),
	Effect.runFork(startActionRunWorker()),
	Effect.runFork(startInitiativeWorker()),
];

const shutdown = async () => {
	await Effect.runPromise(
		Effect.forEach(fibers, (fiber) => Fiber.interrupt(fiber), {
			concurrency: "unbounded",
			discard: true,
		})
	);
	process.exit(0);
};

process.on("SIGINT", () => {
	void shutdown();
});
process.on("SIGTERM", () => {
	void shutdown();
});

const port = ENV.PORT;

console.log(`[neobuni/server] listening on http://localhost:${port}`);

Bun.serve({
	port,
	fetch: app.fetch,
	idleTimeout: 0,
});
