import { describe, expect, test } from "vitest"

import {
  canStartDurableRun,
  isCancellableDurableRun,
  isClaimableDurableRun,
  makeFailurePatch,
} from "./durable-run-lifecycle"

const nowIso = "2026-10-21T00:00:00.000Z"

describe("durable run lifecycle", () => {
  test("reclaims a claim whose lease expired", () => {
    expect(
      isClaimableDurableRun({
        status: "claimed",
        leaseExpiresAt: "2026-10-20T23:59:59.999Z",
        nextRetryAt: null,
        nowIso,
      }),
    ).toBe(true)
  })

  test("keeps active claims and future retries out of a sweep", () => {
    expect(
      isClaimableDurableRun({
        status: "claimed",
        leaseExpiresAt: "2026-10-21T00:00:00.001Z",
        nextRetryAt: null,
        nowIso,
      }),
    ).toBe(false)
    expect(
      isClaimableDurableRun({
        status: "retry_scheduled",
        leaseExpiresAt: null,
        nextRetryAt: "2026-10-21T00:00:00.001Z",
        nowIso,
      }),
    ).toBe(false)
  })

  test("only schedules a retry while attempts remain", () => {
    expect(
      makeFailurePatch({
        attempt: 1,
        maxAttempts: 3,
        nowIso,
        nextRetryAt: "2026-10-21T00:01:00.000Z",
      }),
    ).toMatchObject({ status: "retry_scheduled", finishedAt: null })
    expect(
      makeFailurePatch({
        attempt: 3,
        maxAttempts: 3,
        nowIso,
        nextRetryAt: "2026-10-21T00:01:00.000Z",
      }),
    ).toMatchObject({ status: "failed", nextRetryAt: null })
  })

  test("allows start and cancellation only before execution begins", () => {
    expect(canStartDurableRun("claimed")).toBe(true)
    expect(canStartDurableRun("queued")).toBe(false)
    expect(isCancellableDurableRun("queued")).toBe(true)
    expect(isCancellableDurableRun("claimed")).toBe(true)
    expect(isCancellableDurableRun("running")).toBe(false)
  })
})
