import type {
  ScheduledTaskActionProjection,
  TaskRunToolPolicy,
} from "@neobuni/contracts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasExternalDeliveryTarget = (
  inputSnapshot: Record<string, unknown> | null
) =>
  isRecord(inputSnapshot?.deliveryIntent) &&
  isRecord(inputSnapshot.deliveryIntent.channelTarget);

const toToolPolicySnapshot = (
  value: Record<string, unknown> | TaskRunToolPolicy | null
): TaskRunToolPolicy | null => {
  if (!isRecord(value)) {
    return null;
  }
  return {
    toolAllowlist: Array.isArray(value.toolAllowlist)
      ? value.toolAllowlist.filter(
          (tool): tool is string =>
            typeof tool === "string" && tool.trim().length > 0
        )
      : null,
    timeoutMs:
      typeof value.timeoutMs === "number" && Number.isInteger(value.timeoutMs)
        ? value.timeoutMs
        : null,
    maxSteps:
      typeof value.maxSteps === "number" && Number.isInteger(value.maxSteps)
        ? value.maxSteps
        : null,
  };
};

const projectLegacyTaskRunAsAction = (taskRun: {
  scheduleId: string;
  scheduledFor: string;
  promptSnapshot: string;
  toolPolicySnapshot: Record<string, unknown> | TaskRunToolPolicy | null;
  inputSnapshot: Record<string, unknown> | null;
}): ScheduledTaskActionProjection => ({
  operation: "scheduled_task_execution",
  idempotencyKey: `scheduled-task:${taskRun.scheduleId}:${taskRun.scheduledFor}`,
  scheduleId: taskRun.scheduleId,
  scheduledFor: taskRun.scheduledFor,
  promptSnapshot: taskRun.promptSnapshot,
  toolPolicySnapshot: toToolPolicySnapshot(taskRun.toolPolicySnapshot),
  inputSnapshot: taskRun.inputSnapshot,
  requiresExternalReconciliation: hasExternalDeliveryTarget(
    taskRun.inputSnapshot
  ),
});

export { projectLegacyTaskRunAsAction };
