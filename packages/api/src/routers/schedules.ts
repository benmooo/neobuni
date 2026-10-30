import type { ScheduleListItem } from "@neobuni/contracts";
import {
  appendEvent,
  deleteSchedule,
  getSchedule,
  listSchedules,
  listTaskRunsBySchedule,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { run } from "../run";

type TaskRunSummary = NonNullable<ScheduleListItem["latestTaskRun"]>;

const scheduleIdInput = z.object({ scheduleId: z.string().min(1) });

const scheduleTaskRunListInput = scheduleIdInput.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const toTaskRunSummary = (taskRun: TaskRunSummary): TaskRunSummary => ({
  id: taskRun.id,
  scheduleId: taskRun.scheduleId,
  status: taskRun.status,
  scheduledFor: taskRun.scheduledFor,
  attempt: taskRun.attempt,
  maxAttempts: taskRun.maxAttempts,
  runtimeTurnId: taskRun.runtimeTurnId,
  nextRetryAt: taskRun.nextRetryAt,
  error: taskRun.error,
  createdAt: taskRun.createdAt,
  startedAt: taskRun.startedAt,
  finishedAt: taskRun.finishedAt,
  updatedAt: taskRun.updatedAt,
});

const requireSchedule = async (profileId: string, scheduleId: string) => {
  const schedule = await run(getSchedule(scheduleId));

  if (!schedule || schedule.profileId !== profileId) {
    throw new ORPCError("NOT_FOUND", { message: "Schedule not found" });
  }

  return schedule;
};

// TODO(server): create - requires planScheduleCreateInput
// (apps/server schedules/plan-schedule).
// TODO(server): update - requires planScheduleUpdateInput
// (apps/server schedules/plan-schedule).
export const schedulesRouter = {
  list: protectedProcedure
    .route({
      method: "GET",
      path: "/schedules",
      summary: "List schedules",
      description:
        "Return every schedule for the current profile with its latest task run.",
      tags: ["Schedules"],
    })
    .handler(async ({ context }) => {
      const schedules = await run(listSchedules(context.profileId));

      return Promise.all(
        schedules.map(async (schedule) => {
          const [latestTaskRun] = await run(
            listTaskRunsBySchedule(schedule.id, { limit: 1 })
          );

          return {
            ...schedule,
            latestTaskRun: latestTaskRun
              ? toTaskRunSummary(latestTaskRun)
              : null,
          };
        })
      );
    }),

  get: protectedProcedure
    .route({
      method: "GET",
      path: "/schedules/{scheduleId}",
      summary: "Get a schedule",
      description:
        "Return one schedule owned by the current profile, or 404 when it does not exist.",
      tags: ["Schedules"],
    })
    .input(scheduleIdInput)
    .handler(({ input, context }) =>
      requireSchedule(context.profileId, input.scheduleId)
    ),

  listTaskRuns: protectedProcedure
    .route({
      method: "GET",
      path: "/schedules/{scheduleId}/task-runs",
      summary: "List runs for a schedule",
      description:
        "Return the most recent task runs of a schedule, newest first, capped by the limit query.",
      tags: ["Schedules"],
    })
    .input(scheduleTaskRunListInput)
    .handler(async ({ input, context }) => {
      await requireSchedule(context.profileId, input.scheduleId);

      return run(
        listTaskRunsBySchedule(input.scheduleId, { limit: input.limit })
      );
    }),

  remove: protectedProcedure
    .route({
      method: "DELETE",
      path: "/schedules/{scheduleId}",
      summary: "Delete a schedule",
      description:
        "Delete a schedule owned by the current profile and record a deletion event.",
      tags: ["Schedules"],
    })
    .input(scheduleIdInput)
    .handler(async ({ input, context }) => {
      await requireSchedule(context.profileId, input.scheduleId);

      const result = await run(deleteSchedule(input.scheduleId));
      await run(
        appendEvent(context.profileId, "schedule.deleted", {
          scheduleId: input.scheduleId,
        })
      );

      return result;
    }),
};
