import {
	getRuntimeTurn,
	getTaskRun,
	listRuntimeSpansByTurn,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { run } from "../run";

const taskRunIdInput = z.object({ taskRunId: z.string().min(1) });

const requireTaskRun = async (profileId: string, taskRunId: string) => {
	const taskRun = await run(getTaskRun(taskRunId));

	if (!taskRun || taskRun.profileId !== profileId) {
		throw new ORPCError("NOT_FOUND", { message: "Task run not found" });
	}

	return taskRun;
};

export const taskRunsRouter = {
	get: protectedProcedure
		.input(taskRunIdInput)
		.handler(({ input, context }) =>
			requireTaskRun(context.profileId, input.taskRunId)
		),

	trace: protectedProcedure
		.input(taskRunIdInput)
		.handler(async ({ input, context }) => {
			const taskRun = await requireTaskRun(context.profileId, input.taskRunId);

			const runtimeTurn =
				taskRun.runtimeTurnId === null
					? null
					: await run(getRuntimeTurn(taskRun.runtimeTurnId));

			if (runtimeTurn && runtimeTurn.profileId !== context.profileId) {
				throw new ORPCError("NOT_FOUND", { message: "Runtime turn not found" });
			}

			const spans = runtimeTurn
				? await run(listRuntimeSpansByTurn(runtimeTurn.id))
				: [];

			return { taskRun, runtimeTurn, spans };
		}),
};
