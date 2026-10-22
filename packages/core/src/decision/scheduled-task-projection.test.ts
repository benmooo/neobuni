import { describe, expect, test } from "vitest"
import { projectLegacyTaskRunAsAction } from "./scheduled-task-projection"

const taskRun = {
  scheduleId: "schedule-1",
  scheduledFor: "2026-10-21T00:00:00.000Z",
  promptSnapshot: "Send the daily update.",
  toolPolicySnapshot: {
    toolAllowlist: ["send_message"],
    timeoutMs: 30_000,
    maxSteps: 3,
  },
  inputSnapshot: {
    deliveryIntent: {
      channelTarget: { provider: "telegram", targetId: "chat-1" },
    },
  },
}

describe("projectLegacyTaskRunAsAction", () => {
  test("derives a stable identity and preserves the external reconciliation boundary", () => {
    expect(projectLegacyTaskRunAsAction(taskRun)).toMatchObject({
      operation: "scheduled_task_execution",
      idempotencyKey: "scheduled-task:schedule-1:2026-10-21T00:00:00.000Z",
      requiresExternalReconciliation: true,
    })
  })

  test("does not require reconciliation when no channel target exists", () => {
    expect(
      projectLegacyTaskRunAsAction({ ...taskRun, inputSnapshot: null })
        .requiresExternalReconciliation,
    ).toBe(false)
  })
})
