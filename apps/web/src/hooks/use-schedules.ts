import {
  scheduleListItemSchema,
  scheduleSchema,
  taskRunSchema,
  taskRunTraceSchema,
} from "@neobuni/contracts";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

const SCHEDULES_QUERY_KEY = ["schedules"] as const;
const TASK_RUNS_QUERY_KEY = ["task-runs"] as const;

function useSchedules() {
  return useQuery({
    queryKey: SCHEDULES_QUERY_KEY,
    queryFn: async () =>
      scheduleListItemSchema.array().parse(await api.schedules.list()),
    staleTime: 15_000,
  });
}

function useScheduleDetail(scheduleId: string | null) {
  return useQuery({
    queryKey: [...SCHEDULES_QUERY_KEY, scheduleId],
    enabled: Boolean(scheduleId),
    queryFn: async () => {
      if (!scheduleId) {
        throw new Error("Missing schedule id");
      }

      return scheduleSchema.parse(await api.schedules.get({ scheduleId }));
    },
    staleTime: 15_000,
  });
}

function useScheduleTaskRuns(scheduleId: string | null, limit = 20) {
  return useQuery({
    queryKey: [...TASK_RUNS_QUERY_KEY, "schedule", scheduleId, limit],
    enabled: Boolean(scheduleId),
    queryFn: async () => {
      if (!scheduleId) {
        throw new Error("Missing schedule id");
      }

      return taskRunSchema
        .array()
        .parse(await api.schedules.listTaskRuns({ scheduleId, limit }));
    },
    staleTime: 10_000,
  });
}

function useTaskRunTrace(taskRunId: string | null) {
  return useQuery({
    queryKey: [...TASK_RUNS_QUERY_KEY, "trace", taskRunId],
    enabled: Boolean(taskRunId),
    queryFn: async () => {
      if (!taskRunId) {
        throw new Error("Missing task run id");
      }

      return taskRunTraceSchema.parse(await api.taskRuns.trace({ taskRunId }));
    },
    staleTime: 5000,
  });
}

export {
  SCHEDULES_QUERY_KEY,
  TASK_RUNS_QUERY_KEY,
  useScheduleDetail,
  useSchedules,
  useScheduleTaskRuns,
  useTaskRunTrace,
};
