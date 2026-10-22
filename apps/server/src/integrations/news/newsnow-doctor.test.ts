import { describe, expect, test } from "vitest"

import { runWithConcurrency } from "./newsnow-doctor"

describe("newsnow doctor", () => {
  test("preserves source order while limiting concurrent probes", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const result = await runWithConcurrency({
      items: ["first", "second", "third", "fourth"],
      concurrency: 2,
      run: async (item) => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight -= 1
        return item.toUpperCase()
      },
    })

    expect(result).toEqual(["FIRST", "SECOND", "THIRD", "FOURTH"])
    expect(maxInFlight).toBe(2)
  })
})
